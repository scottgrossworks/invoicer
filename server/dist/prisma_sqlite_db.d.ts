import { Leedz_DB, CreateClientData, CreateBookingData, ClientFilters, BookingFilters, Client, Booking, ClientStats, SystemStats } from './leedz_db';
export declare class Prisma_Sqlite_DB implements Leedz_DB {
    private prisma;
    constructor(databaseUrl: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    createClient(data: CreateClientData): Promise<Client>;
    getClient(id: string): Promise<Client | null>;
    getClients(filters?: ClientFilters): Promise<Client[]>;
    updateClient(id: string, data: Partial<CreateClientData>): Promise<Client>;
    deleteClient(id: string): Promise<boolean>;
    getClientStats(id?: string): Promise<ClientStats>;
    createBooking(data: CreateBookingData): Promise<Booking>;
    getBooking(id: string): Promise<Booking | null>;
    getBookings(filters?: BookingFilters): Promise<Booking[]>;
    updateBooking(id: string, data: Partial<CreateBookingData>): Promise<Booking>;
    deleteBooking(id: string): Promise<boolean>;
    getSystemStats(): Promise<SystemStats>;
}
//# sourceMappingURL=prisma_sqlite_db.d.ts.map