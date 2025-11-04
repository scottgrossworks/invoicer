const { Prisma_Sqlite_DB } = require('./prisma_sqlite_db');

class DatabaseFactory {
  static createDatabase(config) {
    const dbType = config.database.type;
    const dbUrl = config.database.url;

    switch (dbType) {
      case 'prisma_sqlite':
        return new Prisma_Sqlite_DB(dbUrl);

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

module.exports = {
  DatabaseFactory
};
