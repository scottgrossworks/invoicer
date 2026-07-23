/**
 * Create canonical empty database for distribution
 * Run once to create server/dist/leedz.sqlite
 *
 * SCHEMA unification (2026-07-20, see C:\Users\Scott\Desktop\WKG\SCHEMA\PLAN.md):
 * prisma/schema.prisma is a copy of the canonical schema — NO Config table.
 * Business identity loads at runtime from VALUE_PROP.md; connection/LLM settings
 * live in config files / chrome storage. The blank DB ships with zero rows.
 */

const fs = require('fs');
const path = require('path');

// Point to the canonical empty DB location (absolute path for Prisma)
const dbPath = path.join(__dirname, 'dist', 'leedz.sqlite');
const dbUrl = `file:${dbPath.replace(/\\/g, '/')}`;

// Delete existing if present
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('Deleted existing leedz.sqlite');
}

// Set DATABASE_URL for Prisma
process.env.DATABASE_URL = dbUrl;

async function main() {
  // Run db push via CLI to create tables from schema
  const { execSync } = require('child_process');
  console.log('Pushing schema to fresh database...');
  execSync(`npx prisma db push --skip-generate`, {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit'
  });

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  // Verify counts — a distribution DB ships EMPTY (no seeded Config: that
  // table no longer exists in the canonical schema).
  const clientCount = await prisma.client.count();
  const bookingCount = await prisma.booking.count();
  const squareCount = await prisma.squareConnection.count();

  console.log(`\nCanonical DB created at: ${dbPath}`);
  console.log(`Clients: ${clientCount}`);
  console.log(`Bookings: ${bookingCount}`);
  console.log(`SquareConnections: ${squareCount}`);
  console.log('\nThis file will be copied into every distribution build.');

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error('Error creating canonical DB:', e);
    process.exit(1);
  });
