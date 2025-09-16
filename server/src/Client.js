const { CreateClientData, ClientEntity } = require('./leedz_db');

class Client {
  constructor(data) {
    if (data.id) {
      // Existing client
      this.id = data.id;
      this.name = data.name;
      this.email = data.email;
      this.phone = data.phone;
      this.company = data.company;
      this.clientNotes = data.clientNotes;
      this.createdAt = data.createdAt;
      this.updatedAt = data.updatedAt;
    } else {
      // New client
      this.id = '';
      this.name = data.name;
      this.email = data.email || null;
      this.phone = data.phone || null;
      this.company = data.company || null;
      this.clientNotes = data.clientNotes || null;
      this.createdAt = new Date();
      this.updatedAt = new Date();
    }
  }

  // Validation methods
  static validate(data) {
    const errors = [];

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

  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * GOAL: Server-side validation for client phone numbers. Accept common separators including dots
   * and validate against international phone format. Must match client-side validation exactly.
   * Supports formats: 123-456-7890, (123) 456-7890, 123.456.7890, +1 123 456 7890
   */
  static isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)\.]/g, ''));
  }

  // Business logic methods
  getDisplayName() {
    return this.company ? `${this.name} (${this.company})` : this.name;
  }

  hasContactInfo() {
    return !!(this.email || this.phone);
  }

  isComplete() {
    return !!(this.name && (this.email || this.phone));
  }

  // Data transformation
  toCreateData() {
    return {
      name: this.name,
      email: this.email || undefined,
      phone: this.phone || undefined,
      company: this.company || undefined,
      clientNotes: this.clientNotes || undefined
    };
  }

  toInterface() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      phone: this.phone,
      company: this.company,
      clientNotes: this.clientNotes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Update methods
  update(data) {
    if (data.name !== undefined) this.name = data.name;
    if (data.email !== undefined) this.email = data.email;
    if (data.phone !== undefined) this.phone = data.phone;
    if (data.company !== undefined) this.company = data.company;
    if (data.clientNotes !== undefined) this.clientNotes = data.clientNotes;
    this.updatedAt = new Date();
  }
}

module.exports = {
  Client
};
