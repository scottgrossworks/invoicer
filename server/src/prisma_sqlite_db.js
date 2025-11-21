const { PrismaClient } = require('@prisma/client');
const { Leedz_DB } = require('./leedz_db');

class Prisma_Sqlite_DB extends Leedz_DB {
  constructor(databaseUrl) {
    super();
    this.databaseUrl = databaseUrl;

    // CRITICAL: Set DATABASE_URL environment variable before creating PrismaClient
    // This ensures Prisma uses the correct database from server_config.json
    // The datasources config parameter alone is unreliable across Prisma versions
    process.env.DATABASE_URL = databaseUrl;

    this.prisma = new PrismaClient({
      log: ['query', 'error'],
      errorFormat: 'pretty',
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
  }

  async connect() {
    const { log } = require('./logging');
    log(`[DB] DATABASE_URL environment variable: ${process.env.DATABASE_URL}`);
    log(`[DB] Connecting to database: ${this.databaseUrl}`);
    await this.prisma.$connect();
    log(`[DB] Connection established to: ${this.databaseUrl}`);
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }

  // Client operations
  async createClient(data) {
    // Separate valid fields from extra fields
    const allowedFields = ['name', 'email', 'phone', 'company', 'website', 'clientNotes'];
    const sanitizedData = {};
    const extraFields = {};

    for (const field in data) {
      if (allowedFields.includes(field)) {
        sanitizedData[field] = data[field];
      } else {
        extraFields[field] = data[field];
      }
    }

    // If extra fields exist, append them to clientNotes
    if (Object.keys(extraFields).length > 0) {
      const extraFieldsText = Object.entries(extraFields)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      const existingNotes = sanitizedData.clientNotes || '';
      sanitizedData.clientNotes = existingNotes
        ? `${existingNotes}\n\n--- Additional Fields ---\n${extraFieldsText}`
        : `--- Additional Fields ---\n${extraFieldsText}`;

      console.error(`[DB] Extra fields moved to clientNotes: ${Object.keys(extraFields).join(', ')}`);
    }

    let existingClient = null;

    // 1. Try to find by email if available
    if (sanitizedData.email) {
      existingClient = await this.prisma.client.findUnique({
        where: { email: sanitizedData.email },
      });
    }

    // 2. If no client found by email, try to find by name and phone if both are available
    if (!existingClient && sanitizedData.name && sanitizedData.phone) {
      existingClient = await this.prisma.client.findFirst({
        where: {
          name: sanitizedData.name,
          phone: sanitizedData.phone,
        },
      });
    }

    // 3. If no client found by email or by name/phone, try to find by name and email (even if email was not primary search)
    if (!existingClient && sanitizedData.name && sanitizedData.email) {
      existingClient = await this.prisma.client.findFirst({
        where: {
          name: sanitizedData.name,
          email: sanitizedData.email,
        },
      });
    }

    if (existingClient) {
      // Update existing client
      return await this.prisma.client.update({
        where: { id: existingClient.id },
        data: sanitizedData,
      });
    } else {
      // Create new client
      return await this.prisma.client.create({ data: sanitizedData });
    }
  }

  async getClient(id) {
    return await this.prisma.client.findUnique({
      where: { id },
      include: {
        bookings: true
      }
    });
  }

  async getClients(filters) {
    let where = {};
    let orderBy = undefined;

    // 11/19/2025: Enhanced with additional operators for better MCP discoverability

    // PRIORITY 1: search_any - comma-separated multi-keyword OR search
    if (filters?.search_any) {
      const keywords = filters.search_any.split(',').map(kw => kw.trim()).filter(kw => kw);
      where.OR = keywords.flatMap(kw => [
        { name: { contains: kw } },
        { email: { contains: kw } },
        { company: { contains: kw } }
      ]);
    }
    // PRIORITY 2: search - single keyword OR search across fields
    else if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { email: { contains: filters.search } },
        { company: { contains: filters.search } }
      ];
    }
    // PRIORITY 3: Individual field filters with operators
    else {
      // Basic contains filters
      if (filters?.name) {
        where.name = { contains: filters.name };
      }

      if (filters?.company) {
        where.company = { contains: filters.company };
      }

      if (filters?.email) {
        where.email = filters.email;
      }

      // Operator filters (can be combined with basic filters)
      if (filters?.name_startsWith) {
        where.name = { startsWith: filters.name_startsWith };
      }

      if (filters?.email_endsWith) {
        where.email = { endsWith: filters.email_endsWith };
      }

      if (filters?.company_not) {
        where.company = { not: { contains: filters.company_not } };
      }

      // Date filters
      if (filters?.updatedAt_lt) {
        where.updatedAt = {
          ...where.updatedAt,
          lt: new Date(filters.updatedAt_lt)
        };
      }

      if (filters?.updatedAt_gte) {
        where.updatedAt = {
          ...where.updatedAt,
          gte: new Date(filters.updatedAt_gte)
        };
      }
    }

    // Sorting - works with all filter types
    if (filters?.orderBy) {
      const allowedOrderFields = ['name', 'email', 'company', 'createdAt', 'updatedAt'];
      if (allowedOrderFields.includes(filters.orderBy)) {
        const direction = filters.order === 'desc' ? 'desc' : 'asc';
        orderBy = { [filters.orderBy]: direction };
      }
    }

    return await this.prisma.client.findMany({
      where,
      orderBy
    });
  }

  async updateClient(id, data) {
    // Separate valid fields from extra fields
    const allowedFields = ['name', 'email', 'phone', 'company', 'website', 'clientNotes'];
    const sanitizedData = {};
    const extraFields = {};

    for (const field in data) {
      if (allowedFields.includes(field)) {
        sanitizedData[field] = data[field];
      } else {
        extraFields[field] = data[field];
      }
    }

    // If extra fields exist, append them to clientNotes
    if (Object.keys(extraFields).length > 0) {
      // Get existing client to preserve their notes
      const existingClient = await this.prisma.client.findUnique({
        where: { id }
      });

      const extraFieldsText = Object.entries(extraFields)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      const existingNotes = sanitizedData.clientNotes !== undefined
        ? sanitizedData.clientNotes
        : (existingClient?.clientNotes || '');

      sanitizedData.clientNotes = existingNotes
        ? `${existingNotes}\n\n--- Additional Fields ---\n${extraFieldsText}`
        : `--- Additional Fields ---\n${extraFieldsText}`;

      console.error(`[DB] Extra fields moved to clientNotes: ${Object.keys(extraFields).join(', ')}`);
    }

    return await this.prisma.client.update({
      where: { id },
      data: sanitizedData
    });
  }

  async deleteClient(id) {
    try {
      await this.prisma.client.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async getClientStats(id) {
    if (id) {
      // Client-specific stats
      const [totalBookings, totalAmount, averageRate] = await Promise.all([
        this.prisma.booking.count({ where: { clientId: id } }),
        this.prisma.booking.aggregate({
          where: { clientId: id },
          _sum: { totalAmount: true }
        }),
        this.prisma.booking.aggregate({
          where: { clientId: id },
          _avg: { hourlyRate: true }
        })
      ]);

      return {
        totalClients: 1,
        totalBookings,
        averageDuration: 0,
        averageHourlyRate: averageRate._avg.hourlyRate || 0,
        averageFlatRate: 0,
        repeatClients: 0,
        totalAmountInvoiced: totalAmount._sum.totalAmount || 0,
        totalHoursInvoiced: 0
      };
    } else {
      // Overall stats
      const [
        totalClients,
        totalBookings,
        avgDuration,
        avgHourlyRate,
        avgFlatRate,
        totalAmount,
        totalHours,
        repeatClients
      ] = await Promise.all([
        this.prisma.client.count(),
        this.prisma.booking.count(),
        this.prisma.booking.aggregate({
          _avg: { duration: true }
        }),
        this.prisma.booking.aggregate({
          _avg: { hourlyRate: true }
        }),
        this.prisma.booking.aggregate({
          _avg: { flatRate: true }
        }),
        this.prisma.booking.aggregate({
          _sum: { totalAmount: true }
        }),
        this.prisma.booking.aggregate({
          _sum: { duration: true }
        }),
        this.prisma.$queryRaw`
          SELECT COUNT(DISTINCT clientId) as repeatClients
          FROM (
            SELECT clientId, COUNT(*) as bookingCount
            FROM Booking
            GROUP BY clientId
            HAVING bookingCount >= 2
          )`
      ]);

      return {
        totalClients,
        totalBookings,
        averageDuration: avgDuration._avg.duration || 0,
        averageHourlyRate: avgHourlyRate._avg.hourlyRate || 0,
        averageFlatRate: avgFlatRate._avg?.flatRate || 0,
        repeatClients: Array.isArray(repeatClients) ? repeatClients[0]?.repeatClients || 0 : 0,
        totalAmountInvoiced: totalAmount._sum.totalAmount || 0,
        totalHoursInvoiced: totalHours._sum.duration || 0
      };
    }
  }

  // Helper function to convert strings to floats for Prisma
  cleanFloat(value) {
    if (!value || value === "") return null;

    if (typeof value === 'string') {
      value = value.replace('$', '').trim();
    }

    let floatVal = parseFloat(value);

    if (isNaN(floatVal)) return null;

    return floatVal;
  }

  // Booking operations
  async createBooking(data) {
    // Check for duplicate: same client, same date, same location
    if (data.clientId && data.startDate && data.location) {
      const existing = await this.prisma.booking.findFirst({
        where: {
          clientId: data.clientId,
          startDate: data.startDate,
          location: data.location
        }
      });
      
      if (existing) {
        // Update existing booking (overwrite)
        const { clientId, ...updateData } = data;
        return await this.prisma.booking.update({
          where: { id: existing.id },
          data: {
            ...updateData,
            client: { connect: { id: clientId } },
            startDate: data.startDate || null,
            endDate: data.endDate || null,
            status: data.status || "new",
          }
        });
      }
    }
    
    // Create new booking
    return await this.prisma.booking.create({
      data: {
        client: { connect: { id: data.clientId } },
        title: data.title,
        description: data.description,
        notes: data.notes,
        location: data.location,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: this.cleanFloat(data.duration),
        hourlyRate: this.cleanFloat(data.hourlyRate),
        flatRate: this.cleanFloat(data.flatRate),
        totalAmount: this.cleanFloat(data.totalAmount),
        status: data.status || "new",
        source: data.source
      }
    });
  }

  async getBooking(id) {
    return await this.prisma.booking.findUnique({
      where: { id },
      include: {
        client: true
      }
    });
  }

  // 9/30/2025: Enhanced getBookings() with date range filtering to improve MCP server performance
  // This reduces the amount of data transferred when querying bookings by date ranges
  // 10/6/2025: Added clientEmail filtering to enable querying by client email
  async getBookings(filters) {
    let where = {};

    if (filters?.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.location) {
      where.location = filters.location;
    }

    if (filters?.startDate) {
      where.startDate = filters.startDate;
    }

    // 10/6/2025: Client email filtering - filter by client.email using Prisma relation where
    if (filters?.clientEmail) {
      where.client = {
        email: filters.clientEmail
      };
    }

    // 10/22/2025: Client name filtering - filter by client.name using Prisma relation where
    // NOTE: SQLite 'contains' is case-insensitive by default (no 'mode' parameter needed)
    if (filters?.clientName) {
      // If client filter already exists (from clientEmail), merge the conditions
      if (where.client) {
        where.client = {
          ...where.client,
          name: {
            contains: filters.clientName
          }
        };
      } else {
        where.client = {
          name: {
            contains: filters.clientName
          }
        };
      }
    }

    // 9/30/2025: Date range filtering - filter by startDate >= startDateFrom
    if (filters?.startDateFrom) {
      // Convert string to Date if necessary
      const fromDate = filters.startDateFrom instanceof Date
        ? filters.startDateFrom
        : new Date(filters.startDateFrom);

      where.startDate = {
        ...where.startDate,
        gte: fromDate  // Greater than or equal to (inclusive)
      };
    }

    // 9/30/2025: Date range filtering - filter by startDate <= startDateTo
    if (filters?.startDateTo) {
      // Convert string to Date if necessary
      const toDate = filters.startDateTo instanceof Date
        ? filters.startDateTo
        : new Date(filters.startDateTo);

      where.startDate = {
        ...where.startDate,
        lte: toDate  // Less than or equal to (inclusive)
      };
    }

    return await this.prisma.booking.findMany({
      where,
      include: {
        client: true
      }
    });
  }

  /**
   * Search bookings by keyword across title, description, notes, client name, and client email
   *
   * ENHANCED 10/20/2025: Now searches both booking fields AND related client fields
   * This allows queries like "Find bookings for Andrea Cruz" to work by searching client name
   *
   * @param {string} keyword - Search term to match (case-insensitive)
   * @returns {Promise<Array>} Array of booking objects matching the keyword
   */
  async searchBookings(keyword) {
    return await this.prisma.booking.findMany({
      where: {
        OR: [
          // Booking fields
          { title: { contains: keyword } },
          { description: { contains: keyword } },
          { notes: { contains: keyword } },
          { location: { contains: keyword } },
          // Client fields (nested relation search)
          { client: { name: { contains: keyword } } },
          { client: { email: { contains: keyword } } },
          { client: { company: { contains: keyword } } }
        ]
      },
      include: {
        client: true
      }
    });
  }

  /**
   * Updates an existing booking in the database
   *
   * IMPORTANT: This method excludes 'clientId' from the update data to prevent Prisma validation errors.
   *
   * BACKGROUND:
   * - The Booking model has both a 'clientId' field (String) and a 'client' relation field
   * - When updating bookings, we should not modify the client relationship (clientId should remain unchanged)
   * - Prisma throws "Unknown argument `clientId`" error when trying to update foreign key fields
   *   that have corresponding relation fields defined in the schema
   * - This is because Prisma expects relation updates to go through the relation field, not the raw foreign key
   *
   * SOLUTION:
   * - Destructure and exclude 'clientId' from the update data before passing to Prisma
   * - This preserves the existing client-booking relationship while allowing all other fields to be updated
   * - The clientId value remains unchanged in the database, maintaining referential integrity
   *
   * @param {string} id - The booking ID to update
   * @param {Object} data - Update data containing booking fields (may include clientId which will be excluded)
   * @returns {Promise<Object>} Updated booking record from database
   */
  async updateBooking(id, data) {
    // Remove clientId from update data as it's a foreign key with a relation
    // This prevents Prisma validation error: "Unknown argument `clientId`. Did you mean `client`?"
    const { clientId, ...updateData } = data;

    // Handle status field - Prisma schema requires non-null status with default "new"
    // If status is null/undefined, exclude it from update to preserve existing value
    if (updateData.status === null || updateData.status === undefined) {
      delete updateData.status;
    }

    return await this.prisma.booking.update({
      where: { id },
      data: {
        ...updateData,
        startDate: updateData.startDate || null,
        endDate: updateData.endDate || null,
      }
    });
  }

  async deleteBooking(id) {
    try {
      await this.prisma.booking.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // Config operations
  async createConfig(data) {
    return await this.prisma.config.create({ 
      data: {
        ...data,
        // fontSize is no longer part of the schema
        // No longer converting fontSize here
        includeTerms: data.includeTerms === true || data.includeTerms === 'true' // Still converting includeTerms
      }
    });
  }

  async getLatestConfig() {
    return await this.prisma.config.findFirst({
      orderBy: { createdAt: 'desc' }
    });
  }

  async updateConfig(id, data) {
    return await this.prisma.config.update({
      where: { id },
      data: {
        ...data,
        // fontSize is no longer part of the schema
        // No longer converting fontSize here
        includeTerms: data.includeTerms === true || data.includeTerms === 'true' // Still converting includeTerms
      }
    });
  }

  async upsertConfig(data) {
    // Try to find the latest existing config
    const latestConfig = await this.prisma.config.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (latestConfig) {
      // If a config exists, update it
      return await this.prisma.config.update({
        where: { id: latestConfig.id },
        data: {
          ...data,
          // fontSize is no longer part of the schema
          // No longer converting fontSize here
          includeTerms: data.includeTerms === true || data.includeTerms === 'true' // Still converting includeTerms
        }
      });
    } else {
      // If no config exists, create a new one
      return await this.prisma.config.create({
        data: {
          ...data,
          // fontSize is no longer part of the schema
          // No longer converting fontSize here
          includeTerms: data.includeTerms === true || data.includeTerms === 'true' // Still converting includeTerms
        }
      });
    }
  }

  // System operations
  async getSystemStats() {
    const [totalClients, totalBookings, totalConfigs] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.booking.count(),
      this.prisma.config.count()
    ]);

    // Extract database name from URL (e.g., "file:./prisma/leedz.sqlite" -> "leedz.sqlite")
    const dbName = this.databaseUrl.replace('file:', '').split('/').pop().split('\\').pop();

    return {
      clients: totalClients,
      bookings: totalBookings,
      configs: totalConfigs,
      databaseName: dbName
    };
  }
}

module.exports = {
  Prisma_Sqlite_DB
};
