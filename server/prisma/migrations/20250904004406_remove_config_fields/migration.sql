/*
  Warnings:

  - You are about to drop the column `fontFamily` on the `Config` table. All the data in the column will be lost.
  - You are about to drop the column `fontSize` on the `Config` table. All the data in the column will be lost.
  - You are about to drop the column `primaryColor` on the `Config` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Config` table. All the data in the column will be lost.

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
    "footerText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Config" ("bankAccount", "bankAddress", "bankName", "bankPhone", "bankRouting", "bankWire", "companyAddress", "companyEmail", "companyName", "companyPhone", "contactHandle", "createdAt", "footerText", "id", "includeTerms", "logoUrl", "servicesPerformed", "terms", "updatedAt") SELECT "bankAccount", "bankAddress", "bankName", "bankPhone", "bankRouting", "bankWire", "companyAddress", "companyEmail", "companyName", "companyPhone", "contactHandle", "createdAt", "footerText", "id", "includeTerms", "logoUrl", "servicesPerformed", "terms", "updatedAt" FROM "Config";
DROP TABLE "Config";
ALTER TABLE "new_Config" RENAME TO "Config";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
