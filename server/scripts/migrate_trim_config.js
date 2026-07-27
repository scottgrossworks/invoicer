#!/usr/bin/env node
'use strict';

/**
 * migrate_trim_config.js  (Implementation Unit U6)
 *
 * One-time, backup-first migration that brings a LEGACY Leedz database
 * (Client + Booking + Config) up to the post-refactor contract
 * (Client + Booking + SquareConnection, no Config — see KTD4/KTD13).
 *
 * It preserves every Client/Booking row, copies the six Square OAuth fields
 * out of the legacy `Config` row into the `SquareConnection` singleton, then
 * drops `Config`. Business identity is intentionally NOT preserved — it now
 * loads at runtime from VALUE_PROP.md (KTD1).
 *
 * --------------------------------------------------------------------------
 * DEPENDENCY CHOICE (re: KTD5 spike gate)
 * --------------------------------------------------------------------------
 * The plan's KTD5 said: use @prisma/client `$executeRawUnsafe` for the DDL, and
 * fall back to `better-sqlite3` only if a spike showed Prisma v5 couldn't do
 * transactional DDL / BigInt round-trips against a DB whose schema no longer
 * models `Config`.
 *
 * This script instead uses Node's BUILT-IN `node:sqlite` (DatabaseSync),
 * available in the Node 24 runtime the operator runs this script under. It is
 * strictly preferable to BOTH options the plan weighed:
 *   - it is synchronous and single-connection, so explicit BEGIN/COMMIT around
 *     DDL is unambiguous (Prisma's pooled interactive transactions are not);
 *   - it round-trips INTEGER/BigInt precisely (sq_expiration is read as TEXT
 *     here to be doubly safe);
 *   - it adds NO new dependency, honoring CLAUDE.md's minimal-dependency rule —
 *     which was the whole reason KTD5 resisted better-sqlite3.
 * If a future runtime lacks node:sqlite, swap DatabaseSync for better-sqlite3
 * (identical API surface for what we use) — the rest of the logic is unchanged.
 *
 * --------------------------------------------------------------------------
 * USAGE
 * --------------------------------------------------------------------------
 *   node migrate_trim_config.js --db <path> [--dry-run] [--keep-config]
 *                               [--yes] [--backup-dir <dir>] [--date <stamp>]
 *
 *   --db <path>        Path to the .sqlite to migrate. REQUIRED for real runs
 *                      (no silent server_config.json fallback — both the live
 *                      and the dist-pkg DBs must be named explicitly). For
 *                      --dry-run only, falls back to server_config.json.
 *   --dry-run          Read-only: print the plan, write NOTHING (no WAL fold,
 *                      no backup, no schema change). Leaves the DB + sidecars
 *                      byte-identical.
 *   --keep-config      Copy Square fields but DO NOT drop the Config table.
 *   --yes              Operator confirmation that the Leedz server is STOPPED.
 *                      Required for real runs (the DB must be quiescent).
 *   --backup-dir <dir> Where to write the backup. Default: a dir OUTSIDE the
 *                      repo working tree (KTD16). Never inside the repo.
 *   --date <stamp>     Backup-filename timestamp (YYYYMMDD-HHMMSS). If omitted,
 *                      the current time is used.
 *
 * Exits non-zero on ANY failure; mutates nothing on failure (atomic txn).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const SQUARE_CONNECTION_ID = 'default'; // singleton sentinel (KTD14)

// legacy Config column  ->  SquareConnection column
const SQ_MAP = [
  ['sq_access', 'accessToken'],
  ['sq_refresh', 'refreshToken'],
  ['sq_expiration', 'expiresAt'], // BigInt — read as TEXT, bound as BigInt
  ['sq_merchant', 'merchantId'],
  ['sq_location', 'locationId'],
  ['sq_state', 'state'],
];

const MIGRATION_NAME = '20260615000000_trim_config_to_square_connection';

const CREATE_SQUARE_CONNECTION = `
CREATE TABLE "SquareConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" BIGINT,
    "merchantId" TEXT,
    "locationId" TEXT,
    "state" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
)`;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function fail(msg) {
  console.error(`\n[FAIL] ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(msg);
}

function parseArgs(argv) {
  const args = { dryRun: false, keepConfig: false, yes: false, db: null, backupDir: null, date: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--keep-config') args.keepConfig = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--db') args.db = argv[++i];
    else if (a === '--backup-dir') args.backupDir = argv[++i];
    else if (a === '--date') args.date = argv[++i];
    else fail(`Unknown argument: ${a}`);
  }
  return args;
}

function resolveDbPath(args) {
  if (args.db) return path.resolve(args.db);
  if (!args.dryRun) {
    fail('--db <path> is required for a real run. Refusing to guess the live DB. ' +
      '(Only --dry-run may fall back to server_config.json.)');
  }
  // dry-run fallback to server_config.json
  const cfgPath = path.resolve(__dirname, '..', 'server_config.json');
  if (!fs.existsSync(cfgPath)) fail(`No --db given and ${cfgPath} not found.`);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const url = cfg?.database?.url || '';
  if (!url.startsWith('file:')) fail(`server_config.json database.url is not a file: URL (${url}).`);
  return path.resolve(__dirname, '..', url.replace(/^file:/, ''));
}

function defaultBackupDir() {
  // OUTSIDE the repo working tree (KTD16). Use a stable per-user location.
  return path.join(os.homedir(), '.leedz-migration-backups');
}

function timestamp(arg) {
  if (arg) return arg;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backupName(dbPath, stamp) {
  // Encode the resolved absolute DB path so backups from the live DB and the
  // dist-pkg copy never collide.
  const slug = dbPath.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${slug}.backup-${stamp}.sqlite`;
}

function sidecars(dbPath) {
  return ['-wal', '-shm', '-journal']
    .map((s) => dbPath + s)
    .filter((p) => fs.existsSync(p));
}

function tableNames(db) {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map((r) => r.name);
}

function tableExists(db, name) {
  return tableNames(db).includes(name);
}

function count(db, table) {
  return db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = resolveDbPath(args);

  log('========================================================');
  log(`  Leedz Config-trim migration  ${args.dryRun ? '(DRY RUN)' : '(REAL RUN)'}`);
  log('========================================================');
  log(`  DB path        : ${dbPath}`);

  if (!fs.existsSync(dbPath)) fail(`Database file not found: ${dbPath}`);

  const stamp = timestamp(args.date);
  const backupDir = args.backupDir ? path.resolve(args.backupDir) : defaultBackupDir();
  const backupPath = path.join(backupDir, backupName(dbPath, stamp));

  // Guard: backup dir must be outside the repo working tree (KTD16).
  const repoRoot = path.resolve(__dirname, '..', '..');
  if (path.resolve(backupPath).startsWith(repoRoot + path.sep)) {
    fail(`Backup path is inside the repo working tree (${backupPath}). Choose a --backup-dir outside ${repoRoot}.`);
  }
  log(`  Backup (planned): ${backupPath}`);
  log(`  Mode           : ${args.dryRun ? 'dry-run' : 'real'}${args.keepConfig ? ', keep-config' : ''}`);
  log('');

  // ---- DRY RUN: read-only, write nothing (not even a WAL fold) -------------
  if (args.dryRun) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      planAndInspect(db, { dryRun: true, keepConfig: args.keepConfig });
    } finally {
      db.close();
    }
    log('\n[DRY RUN] No changes written. DB and sidecars left untouched.');
    process.exit(0);
  }

  // ---- REAL RUN ------------------------------------------------------------
  if (!args.yes) {
    fail('Refusing to run without --yes. Stop the Leedz server first, then re-run with --yes ' +
      '(the database must be quiescent — no other process writing).');
  }

  // 1) Fold WAL into the main file so the backup equals the live state.
  foldWal(dbPath);
  const remaining = sidecars(dbPath);
  if (remaining.length) {
    fail(`Sidecar files still present after WAL fold: ${remaining.join(', ')}. ` +
      `Is the server still running? Aborting so the backup is a faithful snapshot.`);
  }

  // 2) Mandatory backup BEFORE any mutation (refuse to run if it fails).
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(dbPath, backupPath);
    const srcSize = fs.statSync(dbPath).size;
    const bakSize = fs.statSync(backupPath).size;
    if (srcSize !== bakSize) fail(`Backup size mismatch (${srcSize} vs ${bakSize}). Aborting.`);
    log(`[backup] Wrote ${bakSize} bytes -> ${backupPath}`);
  } catch (e) {
    fail(`Could not write backup (${e.message}). Refusing to migrate.`);
  }

  // 3) Migrate inside a single transaction.
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA foreign_keys=ON;');
    const result = migrate(db, { keepConfig: args.keepConfig });
    if (result.alreadyMigrated) {
      log('\n[OK] Database already migrated (Config absent, SquareConnection present). No changes made.');
      db.close();
      process.exit(0);
    }
    verify(db, result, { keepConfig: args.keepConfig });
  } catch (e) {
    try { db.exec('ROLLBACK;'); } catch { /* not in a txn */ }
    db.close();
    fail(`Migration error (rolled back, DB unchanged): ${e.stack || e.message}`);
  }
  db.close();

  log('\n[OK] Migration complete and verified.');
  log(`     Backup retained at: ${backupPath}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// dry-run inspection / shared planning
// ---------------------------------------------------------------------------

function pickConfigRow(db) {
  // Multi-row safety: prefer the most recently updated row that actually holds
  // Square tokens; otherwise the most recent row overall.
  const rows = db.prepare(
    `SELECT rowid AS _rowid, id,
            sq_access, sq_refresh,
            CAST(sq_expiration AS TEXT) AS sq_expiration,
            sq_merchant, sq_location, sq_state
       FROM "Config"
      ORDER BY updatedAt DESC, createdAt DESC, rowid DESC`
  ).all();
  const withTokens = rows.find((r) => r.sq_access != null || r.sq_refresh != null);
  const chosen = withTokens || rows[0] || null;
  return { rows, chosen };
}

function planAndInspect(db, { dryRun, keepConfig }) {
  const tables = tableNames(db);
  log(`  Tables found   : ${tables.join(', ')}`);

  if (!tables.includes('Client')) fail('No "Client" table — this does not look like a Leedz DB.');
  if (!tables.includes('Booking')) fail('No "Booking" table — this does not look like a Leedz DB.');

  const clients = count(db, 'Client');
  const bookings = count(db, 'Booking');
  log(`  Client rows    : ${clients}`);
  log(`  Booking rows   : ${bookings}`);

  const hasConfig = tables.includes('Config');
  const hasSquare = tables.includes('SquareConnection');
  log(`  Config table   : ${hasConfig ? 'present' : 'ABSENT'}`);
  log(`  SquareConnection: ${hasSquare ? `present (${count(db, 'SquareConnection')} rows)` : 'ABSENT'}`);

  if (!hasConfig) {
    if (hasSquare && count(db, 'SquareConnection') >= 1) {
      log('\n  => Already migrated (Config absent, SquareConnection has rows). Nothing to do.');
    } else {
      log('\n  => Config absent and no SquareConnection row. Plan: create empty SquareConnection.');
    }
    return;
  }

  const { rows, chosen } = pickConfigRow(db);
  log(`  Config rows    : ${rows.length}`);
  if (chosen) {
    log(`  Chosen Config  : id=${chosen.id} (rowid ${chosen._rowid})`);
    const present = SQ_MAP
      .map(([leg]) => `${leg}=${chosen[leg] == null ? 'null' : (leg === 'sq_access' || leg === 'sq_refresh' ? '***present***' : String(chosen[leg]))}`)
      .join(', ');
    log(`  Square fields  : ${present}`);
    log('\n  Planned SquareConnection row:');
    for (const [leg, col] of SQ_MAP) {
      const v = chosen[leg];
      const shown = v == null ? 'null' : (col === 'accessToken' || col === 'refreshToken' ? '***present***' : String(v));
      log(`    ${col.padEnd(13)} <- ${leg.padEnd(14)} = ${shown}`);
    }
  } else {
    log('  Chosen Config  : (no rows)');
  }
  log(`\n  Will ${keepConfig ? 'KEEP' : 'DROP'} the Config table.`);
  if (dryRun) log('  Will write a backup before mutating (real run only).');
}

// ---------------------------------------------------------------------------
// real migration (inside a transaction)
// ---------------------------------------------------------------------------

function foldWal(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    // Switch to rollback journaling so the -wal/-shm sidecars are removed and
    // the single .sqlite file is a faithful, copyable snapshot.
    db.exec('PRAGMA journal_mode=DELETE;');
  } finally {
    db.close();
  }
}

function migrate(db, { keepConfig }) {
  const tables = tableNames(db);
  if (!tables.includes('Client')) throw new Error('No "Client" table.');
  if (!tables.includes('Booking')) throw new Error('No "Booking" table.');

  const clientsBefore = count(db, 'Client');
  const bookingsBefore = count(db, 'Booking');
  const hasConfig = tables.includes('Config');
  const hasSquare = tables.includes('SquareConnection');

  // Idempotency: Config gone AND a SquareConnection row already exists.
  if (!hasConfig && hasSquare && count(db, 'SquareConnection') >= 1) {
    return { alreadyMigrated: true };
  }

  // Capture the legacy Square values BEFORE any change so we can verify equality.
  let captured = null;
  if (hasConfig) {
    const { rows, chosen } = pickConfigRow(db);
    log(`[migrate] Config rows: ${rows.length}; chosen id=${chosen ? chosen.id : '(none)'}`);
    captured = chosen;
  }

  db.exec('BEGIN IMMEDIATE;');

  if (!hasSquare) {
    db.exec(CREATE_SQUARE_CONNECTION);
    log('[migrate] Created SquareConnection table.');
  }

  // Build the singleton row from captured Square fields (all null if none).
  const values = {};
  for (const [leg, col] of SQ_MAP) values[col] = captured ? captured[leg] : null;

  const expiresAt = values.expiresAt == null ? null : BigInt(values.expiresAt);
  db.prepare(`
    INSERT INTO "SquareConnection"
      ("id","accessToken","refreshToken","expiresAt","merchantId","locationId","state","updatedAt")
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT("id") DO UPDATE SET
      "accessToken"=excluded."accessToken",
      "refreshToken"=excluded."refreshToken",
      "expiresAt"=excluded."expiresAt",
      "merchantId"=excluded."merchantId",
      "locationId"=excluded."locationId",
      "state"=excluded."state",
      "updatedAt"=CURRENT_TIMESTAMP
  `).run(
    SQUARE_CONNECTION_ID,
    values.accessToken ?? null,
    values.refreshToken ?? null,
    expiresAt,
    values.merchantId ?? null,
    values.locationId ?? null,
    values.state ?? null
  );
  log('[migrate] Upserted SquareConnection singleton row.');

  if (hasConfig && !keepConfig) {
    db.exec('DROP TABLE "Config";');
    log('[migrate] Dropped Config table.');
  }

  reconcilePrismaMigrations(db);

  db.exec('COMMIT;');

  return { alreadyMigrated: false, clientsBefore, bookingsBefore, captured };
}

function reconcilePrismaMigrations(db) {
  if (!tableExists(db, '_prisma_migrations')) {
    log('[migrate] No _prisma_migrations table (introspected DB) — skipping reconcile.');
    return;
  }
  const existing = db.prepare(
    'SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ?'
  ).get(MIGRATION_NAME);
  if (existing) {
    log('[migrate] _prisma_migrations already records the trim migration.');
    return;
  }
  // Compute the checksum Prisma expects: sha256 of the migration.sql bytes.
  let checksum = '';
  try {
    const sqlPath = path.resolve(__dirname, '..', 'prisma', 'migrations', MIGRATION_NAME, 'migration.sql');
    checksum = crypto.createHash('sha256').update(fs.readFileSync(sqlPath)).digest('hex');
  } catch {
    checksum = 'manual-reconcile';
  }
  db.prepare(`
    INSERT INTO "_prisma_migrations"
      ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
    VALUES (?,?,CURRENT_TIMESTAMP,?,NULL,NULL,CURRENT_TIMESTAMP,1)
  `).run(crypto.randomUUID(), checksum, MIGRATION_NAME);
  log(`[migrate] Recorded ${MIGRATION_NAME} as applied in _prisma_migrations.`);
}

// ---------------------------------------------------------------------------
// verification (post-commit, fail-loud)
// ---------------------------------------------------------------------------

function verify(db, result, { keepConfig }) {
  log('\n[verify] Running post-migration checks...');

  // integrity + referential
  const integrity = db.prepare('PRAGMA integrity_check').get();
  const integrityVal = integrity.integrity_check || Object.values(integrity)[0];
  if (integrityVal !== 'ok') fail(`integrity_check returned: ${integrityVal}`);
  log('[verify]   integrity_check: ok');

  const fkRows = db.prepare('PRAGMA foreign_key_check').all();
  if (fkRows.length) fail(`foreign_key_check found ${fkRows.length} violation(s): ${JSON.stringify(fkRows)}`);
  log('[verify]   foreign_key_check: clean');

  const fkOn = db.prepare('PRAGMA foreign_keys').get();
  const fkOnVal = fkOn.foreign_keys ?? Object.values(fkOn)[0];
  if (String(fkOnVal) !== '1') fail(`foreign_keys is not ON (got ${fkOnVal}).`);
  log('[verify]   foreign_keys: ON');

  // row counts unchanged
  const clientsAfter = count(db, 'Client');
  const bookingsAfter = count(db, 'Booking');
  if (clientsAfter !== result.clientsBefore) fail(`Client count changed: ${result.clientsBefore} -> ${clientsAfter}`);
  if (bookingsAfter !== result.bookingsBefore) fail(`Booking count changed: ${result.bookingsBefore} -> ${bookingsAfter}`);
  log(`[verify]   Client rows unchanged: ${clientsAfter}`);
  log(`[verify]   Booking rows unchanged: ${bookingsAfter}`);

  // Config dropped (unless keep-config)
  const hasConfig = tableExists(db, 'Config');
  if (!keepConfig && hasConfig) fail('Config table still present after a non --keep-config run.');
  if (keepConfig && !hasConfig) fail('Config table missing despite --keep-config.');
  log(`[verify]   Config table: ${hasConfig ? 'present (kept)' : 'dropped'}`);

  // singleton: 0 or 1 rows
  const sqCount = count(db, 'SquareConnection');
  if (sqCount > 1) fail(`SquareConnection has ${sqCount} rows (expected 0 or 1).`);
  log(`[verify]   SquareConnection rows: ${sqCount}`);

  // field-equality against captured legacy values
  if (result.captured) {
    const row = db.prepare(
      `SELECT "accessToken","refreshToken",CAST("expiresAt" AS TEXT) AS "expiresAt",
              "merchantId","locationId","state"
         FROM "SquareConnection" WHERE id = ?`
    ).get(SQUARE_CONNECTION_ID);
    if (!row) fail('SquareConnection sentinel row missing after migration.');
    for (const [leg, col] of SQ_MAP) {
      const want = result.captured[leg] == null ? null : String(result.captured[leg]);
      const got = row[col] == null ? null : String(row[col]);
      if (want !== got) fail(`Field mismatch for ${col}: legacy ${leg}=${want} but stored ${got}`);
    }
    log('[verify]   All 6 Square fields match the legacy Config values exactly.');
  } else {
    log('[verify]   No legacy Config row to compare (empty/absent Square fields).');
  }
}

main();
