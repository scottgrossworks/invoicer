// Abstract database interface for Leedz invoicing system
export interface Leedz_DB {
  // Client operations
  createClient(data: CreateClientData): Promise<Client>;
  getClient(id: string): Promise<Client | null>;
  getClients(filters?: ClientFilters): Promise<Client[]>;
  updateClient(id: string, data: Partial<CreateClientData>): Promise<Client>;
  deleteClient(id: string): Promise<boolean>;
  getClientStats(id?: string): Promise<ClientStats>;

  // Booking operations
  createBooking(data: CreateBookingData): Promise<Booking>;
  getBooking(id: string): Promise<Booking | null>;
  getBookings(filters?: BookingFilters): Promise<Booking[]>;
  updateBooking(id: string, data: Partial<CreateBookingData>): Promise<Booking>;
  deleteBooking(id: string): Promise<boolean>;

  // System operations
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getSystemStats(): Promise<SystemStats>;
}

// Data interfaces
export interface CreateClientData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}

export interface CreateBookingData {
  clientId: string;
  title: string;
  description?: string;
  address?: string;
  startDate?: Date;
  endDate?: Date;
  startTime?: string;
  endTime?: string;
  duration?: number;
  hourlyRate?: number;
  flatRate?: number;
  totalAmount?: number;
  status?: string;
  sourceEmail?: string;
  extractedData?: string;
  notes?: string;
}

// Filter interfaces
export interface ClientFilters {
  email?: string;
  name?: string;
}

export interface BookingFilters {
  clientId?: string;
  status?: string;
}

// Stats interfaces
export interface ClientStats {
  totalClients: number;
  totalBookings: number;
  averageDuration: number;
  averageHourlyRate: number;
  averageFlatRate: number;
  repeatClients: number;
  totalAmountInvoiced: number;
  totalHoursInvoiced: number;
}

export interface SystemStats {
  clients: number;
  bookings: number;
}

// Entity interfaces
export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  bookings?: Booking[];
}

export interface Booking {
  id: string;
  clientId: string;
  client?: Client;
  title: string;
  description: string | null;
  address: string | null;
  startDate: Date | null;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  duration: number | null;
  hourlyRate: number | null;
  flatRate: number | null;
  totalAmount: number | null;
  status: string | null;
  sourceEmail: string | null;
  extractedData: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
