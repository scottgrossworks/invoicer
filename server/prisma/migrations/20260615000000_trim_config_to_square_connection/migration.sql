-- Trim Config model: drop the Config table and add SquareConnection.
--
-- WARNING (KTD13): This generated migration DROPS "Config" with NO copy of the
-- Square OAuth fields. It is for FRESH / DEV databases only. Live databases
-- (server/data/leedz.sqlite and the dist-pkg copy) must be migrated with
-- server/scripts/migrate_trim_config.js, which copies sq_* into SquareConnection
-- BEFORE dropping Config. Never run `prisma migrate deploy` against a live DB.

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Config";
PRAGMA foreign_keys=on;

-- CreateTable
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
);
