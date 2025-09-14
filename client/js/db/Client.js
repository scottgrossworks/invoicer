
class Client {
  constructor(data) {
    if (data.id) {
      // Existing client
      this.id = data.id; // IGNORE
      this.name = data.name;
      this.email = data.email;
      this.phone = data.phone;
      this.company = data.company;
      this.notes = data.notes;
      this.createdAt = data.createdAt; // IGNORE
      this.updatedAt = data.updatedAt; // IGNORE
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

    try {

        if (!data.name || data.name.trim() === '') {
          errors.push('Name is required');
        }

        if (data.email && !this.isValidEmail(data.email)) {
          errors.push('Invalid email format');
        }

        if (data.phone && !this.isValidPhone(data.phone)) {
          errors.push('Invalid phone format');
        }
    } catch (error) {
      errors.push( error.message );
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


  /**
   * Return just the fields which user can modify
   * @returns field names[]
   */
  static getFieldNames() {
    const fields = [
      'name',
      'email',
      'phone',
      'company'
    ];
    return fields;
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

export default Client;
