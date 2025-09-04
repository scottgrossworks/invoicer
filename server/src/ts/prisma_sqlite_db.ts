import { PrismaClient } from '@prisma/client';
import { 
  Leedz_DB, 
  CreateClientData, 
  CreateBookingData, 
  ClientFilters, 
  BookingFilters,
  Client,
  Booking,
  ClientStats,
  SystemStats
} from './leedz_db';

export class Prisma_Sqlite_DB implements Leedz_DB {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
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

  async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  // Client operations
  async createClient(data: CreateClientData): Promise<Client> {
    // Check if client exists by email (if provided)
    if (data.email) {
      const existing = await this.prisma.client.findUnique({ 
        where: { email: data.email } 
      });
      
      if (existing) {
        // Update existing client
        return await this.prisma.client.update({ 
          where: { id: existing.id }, 
          data 
        });
      }
    }
    
    // Create new client
    return await this.prisma.client.create({ data });
  }

  async getClient(id: string): Promise<Client | null> {
    return await this.prisma.client.findUnique({
      where: { id },
      include: {
        bookings: true
      }
    });
  }

  async getClients(filters?: ClientFilters): Promise<Client[]> {
    let where: any = {};

    if (filters?.email) {
      where.email = filters.email;
    }
    
    if (filters?.name) {
      where.name = { contains: filters.name, mode: 'insensitive' };
    }

    return await this.prisma.client.findMany({ where });
  }

  async updateClient(id: string, data: Partial<CreateClientData>): Promise<Client> {
    return await this.prisma.client.update({
      where: { id },
      data
    });
  }

  async deleteClient(id: string): Promise<boolean> {
    try {
      await this.prisma.client.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async getClientStats(id?: string): Promise<ClientStats> {
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

  // Booking operations
  async createBooking(data: CreateBookingData): Promise<Booking> {
    return await this.prisma.booking.create({ 
      data: {
        ...data,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
      }
    });
  }

  async getBooking(id: string): Promise<Booking | null> {
    return await this.prisma.booking.findUnique({
      where: { id },
      include: {
        client: true
      }
    });
  }

  async getBookings(filters?: BookingFilters): Promise<Booking[]> {
    let where: any = {};

    if (filters?.clientId) {
      where.clientId = filters.clientId;
    }
    
    if (filters?.status) {
      where.status = filters.status;
    }

    return await this.prisma.booking.findMany({ 
      where,
      include: {
        client: true
      }
    });
  }

  async updateBooking(id: string, data: Partial<CreateBookingData>): Promise<Booking> {
    return await this.prisma.booking.update({ 
      where: { id },
      data: {
        ...data,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
      }
    });
  }

  async deleteBooking(id: string): Promise<boolean> {
    try {
      await this.prisma.booking.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // System operations
  async getSystemStats(): Promise<SystemStats> {
    const [totalClients, totalBookings] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.booking.count()
    ]);
    
    return {
      clients: totalClients,
      bookings: totalBookings
    };
  }
}
