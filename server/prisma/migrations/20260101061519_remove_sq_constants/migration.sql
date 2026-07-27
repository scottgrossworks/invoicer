/*
  Warnings:

  - You are about to drop the column `sq_app_id` on the `Config` table. All the data in the column will be lost.
  - You are about to drop the column `sq_url` on the `Config` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT,
    "companyAddress" TEXT,
    "companyPhone" TEXT,
    "companyEmail" TEXT,
    "logoUrl" TEXT,
    "bankName" TEXT,
    "bankAddress" TEXT,
    "bankPhone" TEXT,
    "bankAccount" TEXT,
    "bankRouting" TEXT,
    "bankWire" TEXT,
    "servicesPerformed" TEXT,
    "contactHandle" TEXT,
    "includeTerms" BOOLEAN,
    "terms" TEXT,
    "serverUrl" TEXT DEFAULT 'http://127.0.0.1',
    "serverPort" TEXT DEFAULT '3000',
    "dbProvider" TEXT DEFAULT 'local_prisma_sqlite',
    "dbPath" TEXT DEFAULT '../data/leedz_invoicer.sqlite',
    "mcpHost" TEXT DEFAULT '127.0.0.1',
    "mcpPort" TEXT DEFAULT '3001',
    "llmApiKey" TEXT,
    "llmProvider" TEXT DEFAULT 'claude-opus-4-1-20250805',
    "llmBaseUrl" TEXT DEFAULT 'https://api.anthropic.com',
    "llmAnthropicVersion" TEXT DEFAULT '2023-06-01',
    "llmMaxTokens" INTEGER DEFAULT 1024,
    "businessDescription" TEXT,
    "friends" TEXT,
    "sq_access" TEXT,
    "sq_refresh" TEXT,
    "sq_expiration" BIGINT,
    "sq_merchant" TEXT,
    "sq_location" TEXT,
    "sq_state" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Config" ("bankAccount", "bankAddress", "bankName", "bankPhone", "bankRouting", "bankWire", "businessDescription", "companyAddress", "companyEmail", "companyName", "companyPhone", "contactHandle", "createdAt", "dbPath", "dbProvider", "friends", "id", "includeTerms", "llmAnthropicVersion", "llmApiKey", "llmBaseUrl", "llmMaxTokens", "llmProvider", "logoUrl", "mcpHost", "mcpPort", "serverPort", "serverUrl", "servicesPerformed", "sq_access", "sq_expiration", "sq_location", "sq_merchant", "sq_refresh", "sq_state", "terms", "updatedAt") SELECT "bankAccount", "bankAddress", "bankName", "bankPhone", "bankRouting", "bankWire", "businessDescription", "companyAddress", "companyEmail", "companyName", "companyPhone", "contactHandle", "createdAt", "dbPath", "dbProvider", "friends", "id", "includeTerms", "llmAnthropicVersion", "llmApiKey", "llmBaseUrl", "llmMaxTokens", "llmProvider", "logoUrl", "mcpHost", "mcpPort", "serverPort", "serverUrl", "servicesPerformed", "sq_access", "sq_expiration", "sq_location", "sq_merchant", "sq_refresh", "sq_state", "terms", "updatedAt" FROM "Config";
DROP TABLE "Config";
ALTER TABLE "new_Config" RENAME TO "Config";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
