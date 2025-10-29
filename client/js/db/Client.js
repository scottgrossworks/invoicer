
class Client {
  constructor(data) {
    if (data.id) {
      // Existing client
      this.id = data.id; // IGNORE
      this.name = data.name;
      this.email = data.email;
      this.phone = data.phone;
      this.company = data.company;
      this.website = data.website;
      this.clientNotes = data.clientNotes; // IGNORE
      this.createdAt = data.createdAt; // IGNORE
      this.updatedAt = data.updatedAt; // IGNORE
    } else {
      // New client
      this.id = '';
      this.name = data.name;
      this.email = data.email || null;
      this.phone = data.phone || null;
      this.company = data.company || null;
      this.website = data.website || null;
      this.clientNotes = data.clientNotes || null;
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

  /**
   * GOAL: Validate phone number format by accepting common separators (spaces, hyphens, parentheses, dots)
   * and ensuring the cleaned number matches international phone format (optional + prefix, starts with 1-9, up to 15 digits)
   * This allows inputs like: 123-456-7890, (123) 456-7890, 123.456.7890, +1 123 456 7890
   */
  static isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)\.]/g, ''));
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
      'company',
      'website',
      'clientNotes'
    ];
    return fields;
  }

  /**
   * Extract client data from state object for rendering
   * @param {Object} state - Application state with Client property
   * @returns {Object} Client data object
   */
  static extractClientData(state) {
    return {
      name: state.Client.name,
      email: state.Client.email,
      phone: state.Client.phone,
      company: state.Client.company
    };
  }


  // Data transformation
  toCreateData() {
    return {
      name: this.name,
      email: this.email || undefined,
      phone: this.phone || undefined,
      company: this.company || undefined,
      website: this.website || undefined,
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
      website: this.website,
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
    if (data.website !== undefined) this.website = data.website;
    if (data.clientNotes !== undefined) this.clientNotes = data.clientNotes;
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
    website: this.website,
    clientNotes: this.clientNotes,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export default Client;
