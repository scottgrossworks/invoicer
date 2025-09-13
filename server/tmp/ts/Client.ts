import { CreateClientData, Client as ClientInterface } from './leedz_db';

export class Client {
  public id: string;
  public name: string;
  public email: string | null;
  public phone: string | null;
  public company: string | null;

  public notes: string | null;
  public createdAt: Date;
  public updatedAt: Date;

  constructor(data: CreateClientData | ClientInterface) {
    if ('id' in data) {
      // Existing client
      this.id = data.id;
      this.name = data.name;
      this.email = data.email;
      this.phone = data.phone;
      this.company = data.company;
      this.notes = data.notes;
      this.createdAt = data.createdAt;
      this.updatedAt = data.updatedAt;
    } else {
      // New client
      this.id = '';
      this.name = data.name;
      this.email = data.email || null;
      this.phone = data.phone || null;
      this.company = data.company || null;
      this.notes = data.notes || null;
      this.createdAt = new Date();
      this.updatedAt = new Date();
    }
  }

  // Validation methods
  static validate(data: CreateClientData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.name || data.name.trim() === '') {
      errors.push('Name is required');
    }

    if (data.email && !this.isValidEmail(data.email)) {
      errors.push('Invalid email format');
    } 

    if (data.phone && !this.isValidPhone(data.phone)) {
      errors.push('Invalid phone format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  } 
  
  private static isValidPhone(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  // Business logic methods
  getDisplayName(): string {
    return this.company ? `${this.name} (${this.company})` : this.name;
  }

  hasContactInfo(): boolean {
    return !!(this.email || this.phone);
  }

  isComplete(): boolean {
    return !!(this.name && (this.email || this.phone));
  }

  // Data transformation
  toCreateData(): CreateClientData {
    return {
      name: this.name,
      email: this.email || undefined,
      phone: this.phone || undefined,
      company: this.company || undefined,
      notes: this.notes || undefined
    };
  }

  toInterface(): ClientInterface {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      phone: this.phone,
      company: this.company,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Update methods
  update(data: Partial<CreateClientData>): void {
    if (data.name !== undefined) this.name = data.name;
    if (data.email !== undefined) this.email = data.email;
    if (data.phone !== undefined) this.phone = data.phone;
    if (data.company !== undefined) this.company = data.company;
    if (data.notes !== undefined) this.notes = data.notes;
    this.updatedAt = new Date();
  }
}
