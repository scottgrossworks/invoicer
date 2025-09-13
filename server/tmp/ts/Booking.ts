import { CreateBookingData, Booking as BookingInterface } from './leedz_db';

export class Booking {
  public id: string;
  public clientId: string;
  public title: string;
  public description: string | null;
  public address: string | null;
  public startDate: Date | null;
  public endDate: Date | null;
  public startTime: string | null;
  public endTime: string | null;
  public duration: number | null;
  public hourlyRate: number | null;
  public flatRate: number | null;
  public totalAmount: number | null;
  public status: string | null;
  public sourceEmail: string | null;
  public extractedData: string | null;
  public notes: string | null;
  public createdAt: Date;
  public updatedAt: Date;

  constructor(data: CreateBookingData | BookingInterface) {
    if ('id' in data) {
      // Existing booking
      this.id = data.id;
      this.clientId = data.clientId;
      this.title = data.title;
      this.description = data.description;
      this.address = data.address;
      this.startDate = data.startDate;
      this.endDate = data.endDate;
      this.startTime = data.startTime;
      this.endTime = data.endTime;
      this.duration = data.duration;
      this.hourlyRate = data.hourlyRate;
      this.flatRate = data.flatRate;
      this.totalAmount = data.totalAmount;
      this.status = data.status;
      this.sourceEmail = data.sourceEmail;
      this.extractedData = data.extractedData;
      this.notes = data.notes;
      this.createdAt = data.createdAt;
      this.updatedAt = data.updatedAt;
    } else {
      // New booking
      this.id = '';
      this.clientId = data.clientId;
      this.title = data.title;
      this.description = data.description || null;
      this.address = data.address || null;
      this.startDate = data.startDate || null;
      this.endDate = data.endDate || null;
      this.startTime = data.startTime || null;
      this.endTime = data.endTime || null;
      this.duration = data.duration || null;
      this.hourlyRate = data.hourlyRate || null;
      this.flatRate = data.flatRate || null;
      this.totalAmount = data.totalAmount || null;
      this.status = data.status || 'pending';
      this.sourceEmail = data.sourceEmail || null;
      this.extractedData = data.extractedData || null;
      this.notes = data.notes || null;
      this.createdAt = new Date();
      this.updatedAt = new Date();
    }
  }

  // Validation methods
  static validate(data: CreateBookingData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.clientId || data.clientId.trim() === '') {
      errors.push('Client ID is required');
    }

    if (!data.title || data.title.trim() === '') {
      errors.push('Title is required');
    }

    if (data.startDate && data.endDate && data.startDate > data.endDate) {
      errors.push('Start date cannot be after end date');
    }

    if (data.hourlyRate && data.hourlyRate < 0) {
      errors.push('Hourly rate cannot be negative');
    }

    if (data.flatRate && data.flatRate < 0) {
      errors.push('Flat rate cannot be negative');
    }

    if (data.duration && data.duration < 0) {
      errors.push('Duration cannot be negative');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Business logic methods
  calculateTotalAmount(): number {
    if (this.flatRate) {
      return this.flatRate;
    }
    
    if (this.hourlyRate && this.duration) {
      return this.hourlyRate * this.duration;
    }
    
    return this.totalAmount || 0;
  }

  getDuration(): number {
    if (this.duration) {
      return this.duration;
    }
    
    if (this.startDate && this.endDate) {
      const diffMs = this.endDate.getTime() - this.startDate.getTime();
      return Math.ceil(diffMs / (1000 * 60 * 60)); // Hours
    }
    
    return 0;
  }

  isCompleted(): boolean {
    return this.status === 'completed';
  }

  isPending(): boolean {
    return this.status === 'pending';
  }

  isCancelled(): boolean {
    return this.status === 'cancelled';
  }

  hasLocation(): boolean {
    return !!(this.address);
  }

  getDisplayTitle(): string {
    return this.address ? `${this.title} - ${this.address}` : this.title;
  }

  // Data transformation
  toCreateData(): CreateBookingData {
    return {
      clientId: this.clientId,
      title: this.title,
      description: this.description || undefined,
      address: this.address || undefined,
      startDate: this.startDate || undefined,
      endDate: this.endDate || undefined,
      startTime: this.startTime || undefined,
      endTime: this.endTime || undefined,
      duration: this.duration || undefined,
      hourlyRate: this.hourlyRate || undefined,
      flatRate: this.flatRate || undefined,
      totalAmount: this.totalAmount || undefined,
      status: this.status || undefined,
      sourceEmail: this.sourceEmail || undefined,
      extractedData: this.extractedData || undefined,
      notes: this.notes || undefined
    };
  }

  toInterface(): BookingInterface {
    return {
      id: this.id,
      clientId: this.clientId,
      title: this.title,
      description: this.description,
      address: this.address,
      startDate: this.startDate,
      endDate: this.endDate,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      hourlyRate: this.hourlyRate,
      flatRate: this.flatRate,
      totalAmount: this.totalAmount,
      status: this.status,
      sourceEmail: this.sourceEmail,
      extractedData: this.extractedData,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Update methods
  update(data: Partial<CreateBookingData>): void {
    if (data.clientId !== undefined) this.clientId = data.clientId;
    if (data.title !== undefined) this.title = data.title;
    if (data.description !== undefined) this.description = data.description;
    if (data.address !== undefined) this.address = data.address;
    if (data.startDate !== undefined) this.startDate = data.startDate;
    if (data.endDate !== undefined) this.endDate = data.endDate;
    if (data.startTime !== undefined) this.startTime = data.startTime;
    if (data.endTime !== undefined) this.endTime = data.endTime;
    if (data.duration !== undefined) this.duration = data.duration;
    if (data.hourlyRate !== undefined) this.hourlyRate = data.hourlyRate;
    if (data.flatRate !== undefined) this.flatRate = data.flatRate;
    if (data.totalAmount !== undefined) this.totalAmount = data.totalAmount;
    if (data.status !== undefined) this.status = data.status;
    if (data.sourceEmail !== undefined) this.sourceEmail = data.sourceEmail;
    if (data.extractedData !== undefined) this.extractedData = data.extractedData;
    if (data.notes !== undefined) this.notes = data.notes;
    this.updatedAt = new Date();
  }
}
