/**
 * Create canonical empty database for distribution
 * Run once to create server/dist/leedz.sqlite
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Point to the canonical empty DB location (absolute path for Prisma)
const dbPath = path.join(__dirname, 'dist', 'leedz.sqlite');
const dbUrl = `file:${dbPath}`;

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

  const prisma = new PrismaClient();

  console.log('Inserting default config...');

  const configData = {
    companyName: 'Your Company Name',
    companyAddress: null,
    companyPhone: null,
    companyEmail: null,
    serverUrl: 'http://127.0.0.1',
    serverPort: '3000',
    dbProvider: 'local_prisma_sqlite',
    dbPath: './data/leedz.sqlite',
    mcpHost: '127.0.0.1',
    mcpPort: '3001',
    llmProvider: 'claude-opus-4-1-20250805',
    llmBaseUrl: 'https://api.anthropic.com',
    llmAnthropicVersion: '2023-06-01',
    llmMaxTokens: 1024
  };

  const defaultConfig = await prisma.config.upsert({
    where: { id: 'default_config_001' },
    update: configData,
    create: { id: 'default_config_001', ...configData }
  });

  console.log('Default config created:', defaultConfig.id);

  // Verify counts
  const clientCount = await prisma.client.count();
  const bookingCount = await prisma.booking.count();
  const configCount = await prisma.config.count();

  console.log(`\nCanonical DB created at: ${dbPath}`);
  console.log(`Clients: ${clientCount}`);
  console.log(`Bookings: ${bookingCount}`);
  console.log(`Configs: ${configCount}`);
  console.log('\nThis file will be copied into every distribution build.');

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error('Error creating canonical DB:', e);
    process.exit(1);
  });
