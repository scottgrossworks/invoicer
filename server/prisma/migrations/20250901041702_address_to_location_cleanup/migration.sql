/*
  Warnings:

  - You are about to drop the column `address` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `extractedData` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `sourceEmail` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Booking` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "startTime" TEXT,
    "endTime" TEXT,
    "duration" REAL,
    "hourlyRate" REAL,
    "flatRate" REAL,
    "totalAmount" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("clientId", "createdAt", "description", "duration", "endDate", "endTime", "flatRate", "hourlyRate", "id", "notes", "startDate", "startTime", "status", "totalAmount", "updatedAt") SELECT "clientId", "createdAt", "description", "duration", "endDate", "endTime", "flatRate", "hourlyRate", "id", "notes", "startDate", "startTime", "status", "totalAmount", "updatedAt" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
