// prisma_sqlite_db.js -- thin adapter over the SHARED leedz-db core.
//
// Since the SCHEMA unification (2026-07-20, see C:\Users\Scott\Desktop\WKG\SCHEMA\PLAN.md):
//   - The PrismaClient + all CRUD logic live in the shared `leedz-db` package
//     (C:\Users\Scott\Desktop\WKG\SCHEMA\leedz-db), generated from the canonical
//     schema at C:\Users\Scott\Desktop\WKG\SCHEMA\schema.prisma.
//   - PRECRIME's MCP server uses the SAME core against the SAME database file
//     (WAL mode -- applied by core.connect() -- makes the concurrent access safe).
//   - This class is kept so leedz_server.js and db_factory.js are untouched:
//     the Leedz_DB interface, class name, and constructor signature are identical.
//
// BEHAVIOR CHANGES vs the legacy implementation (deliberate, per PLAN.md):
//   - Client.email is NOT unique in the canonical schema (a shared inbox may
//     belong to two clients) -- email matching uses findFirst.
//   - Booking.status default is "brewing", not "new". The status lifecycle is
//     cold -> brewing -> hot -> contacted -> booked (booked = TERMINAL: gig won,
//     saved + calendared by the extension). The extension passes contacted/
//     booked explicitly; only PRECRIME's Judge may set "hot".
//
// LEEDZ_DB_PATH env var overrides the shared-module location (deployment
// escape hatch -- same convention as PRECRIME server/mcp/db.js).

const { Leedz_DB } = require('./leedz_db');

const LEEDZ_DB_HOME = process.env.LEEDZ_DB_PATH
    || 'C:/Users/Scott/Desktop/WKG/SCHEMA/leedz-db';
// eval('require') returns the SAME runtime require function, but hides this
// dynamic (intentionally-external) require from pkg's static analyzer, which
// otherwise prints a "Cannot resolve 'LEEDZ_DB_HOME'" warning on every build.
// The shared module deliberately lives OUTSIDE the exe snapshot and loads from
// the real filesystem at runtime — verified working in the packaged build.
const dynamicRequire = eval('require');
const core = dynamicRequire(LEEDZ_DB_HOME);

class Prisma_Sqlite_DB extends Leedz_DB {
  constructor(databaseUrl) {
    super();
    this.databaseUrl = databaseUrl;
    // Initialize the shared singleton with this server's configured DB path
    // (server_config.json database.url). Also expose .prisma for compatibility.
    this.prisma = core.init(databaseUrl);
  }

  async connect() {
    const { log } = require('./logging');
    log(`[DB] Connecting via shared leedz-db core: ${this.databaseUrl}`);
    await core.connect();
    log(`[DB] Connection established (WAL mode) to: ${this.databaseUrl}`);
  }

  async disconnect() {
    await core.disconnect();
  }

  // Client operations
  async createClient(data)      { return core.createClient(data); }
  async getClient(id)           { return core.getClient(id); }
  async getClients(filters)     { return core.getClients(filters); }
  async updateClient(id, data)  { return core.updateClient(id, data); }
  async deleteClient(id)        { return core.deleteClient(id); }
  async getClientStats(id)      { return core.getClientStats(id); }

  // INVOICER Layer-1 status policy (unification 2026-07-20, PLAN.md Section 7):
  // A booking saved through the extension means the user is WORKING this client,
  // so the default outcome is "contacted" (no longer a hot leed). The extension
  // sends "booked" explicitly when the gig is confirmed/calendared (TERMINAL:
  // gig won). Legacy vocabulary is mapped; "hot" is Judge-only and is clamped.
  _normalizeStatus(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s || s === 'new' || s === 'pending') return 'contacted';
    if (s === 'complete' || s === 'completed') return 'booked';
    if (s === 'cancelled' || s === 'canceled') return 'cold';
    if (s === 'hot') {
      console.error('[DB] extension may not set status "hot" (Judge-only) — clamped to "contacted"');
      return 'contacted';
    }
    return s; // brewing | cold | contacted | booked | expired pass through
  }

  // Booking operations
  async createBooking(data)     { return core.createBooking({ ...data, status: this._normalizeStatus(data.status) }); }
  async getBooking(id)          { return core.getBooking(id); }
  async getBookings(filters)    { return core.getBookings(filters); }
  async searchBookings(keyword) { return core.searchBookings(keyword); }
  async updateBooking(id, data) {
    // null/undefined status = preserve existing (core drops it); otherwise normalize.
    const patch = (data.status === null || data.status === undefined)
      ? data
      : { ...data, status: this._normalizeStatus(data.status) };
    return core.updateBooking(id, patch);
  }
  async deleteBooking(id)       { return core.deleteBooking(id); }

  // Square OAuth connection operations (singleton row, sentinel id "default")
  async getSquareConnection()        { return core.getSquareConnection(); }
  async upsertSquareConnection(data) { return core.upsertSquareConnection(data); }
  async deleteSquareConnection()     { return core.deleteSquareConnection(); }

  // System operations
  async getSystemStats() { return core.getSystemStats(); }

  // Legacy helper kept for any external callers
  cleanFloat(value) { return core.cleanFloat(value); }
}

// Preserved for compatibility with the previous implementation's export shape.
Prisma_Sqlite_DB.SQUARE_CONNECTION_ID = core.SQUARE_CONNECTION_ID;

module.exports = {
  Prisma_Sqlite_DB
};
