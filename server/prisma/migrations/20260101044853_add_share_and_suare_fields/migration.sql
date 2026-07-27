-- AlterTable
ALTER TABLE "Config" ADD COLUMN "friends" TEXT;
ALTER TABLE "Config" ADD COLUMN "sq_access" TEXT;
ALTER TABLE "Config" ADD COLUMN "sq_app_id" TEXT;
ALTER TABLE "Config" ADD COLUMN "sq_expiration" BIGINT;
ALTER TABLE "Config" ADD COLUMN "sq_location" TEXT;
ALTER TABLE "Config" ADD COLUMN "sq_merchant" TEXT;
ALTER TABLE "Config" ADD COLUMN "sq_refresh" TEXT;
ALTER TABLE "Config" ADD COLUMN "sq_state" TEXT;
ALTER TABLE "Config" ADD COLUMN "sq_url" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "location" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "startTime" TEXT,
    "endTime" TEXT,
    "duration" REAL,
    "hourlyRate" REAL,
    "flatRate" REAL,
    "totalAmount" REAL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "source" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "sharedTo" TEXT,
    "sharedAt" BIGINT,
    "leedPrice" INTEGER,
    "squarePaymentUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("clientId", "createdAt", "description", "duration", "endDate", "endTime", "flatRate", "hourlyRate", "id", "location", "notes", "source", "startDate", "startTime", "status", "title", "totalAmount", "updatedAt") SELECT "clientId", "createdAt", "description", "duration", "endDate", "endTime", "flatRate", "hourlyRate", "id", "location", "notes", "source", "startDate", "startTime", "status", "title", "totalAmount", "updatedAt" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
