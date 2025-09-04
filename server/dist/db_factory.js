"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseFactory = void 0;
const prisma_sqlite_db_1 = require("./prisma_sqlite_db");
class DatabaseFactory {
    static createDatabase(config) {
        const dbType = config.database.type;
        const dbUrl = config.database.url;
        switch (dbType) {
            case 'prisma_sqlite':
                return new prisma_sqlite_db_1.Prisma_Sqlite_DB(dbUrl);
            // Future database implementations can be added here:
            // case 'prisma_postgres':
            //   return new Prisma_Postgres_DB(dbUrl);
            // case 'cloud_api':
            //   return new Cloud_API_DB(dbUrl);
            default:
                throw new Error(`Unsupported database type: ${dbType}`);
        }
    }
}
exports.DatabaseFactory = DatabaseFactory;
//# sourceMappingURL=db_factory.js.map