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

  static isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
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
      notes: this.notes || undefined
    };
  }

  toInterface() {
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
  update(data) {
    if (data.name !== undefined) this.name = data.name;
    if (data.email !== undefined) this.email = data.email;
    if (data.phone !== undefined) this.phone = data.phone;
    if (data.company !== undefined) this.company = data.company;
    if (data.notes !== undefined) this.notes = data.notes;
    this.updatedAt = new Date();
  }
}

module.exports = {
  Client
};
// Add JSON export for client-side usage
Client.prototype.toJSON = function() {
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
};
