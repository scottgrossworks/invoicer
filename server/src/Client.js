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
   * Convert vanity phone numbers to numeric format.
   * Maps letters to phone keypad digits (A-C=2, D-F=3, etc.)
   * Numeric characters pass through unchanged.
   * Non-alphanumeric characters (spaces, hyphens, etc.) are preserved.
   */
  static convertVanityToNumeric(phone) {
    const keypad = {
      'A': '2', 'B': '2', 'C': '2',
      'D': '3', 'E': '3', 'F': '3',
      'G': '4', 'H': '4', 'I': '4',
      'J': '5', 'K': '5', 'L': '5',
      'M': '6', 'N': '6', 'O': '6',
      'P': '7', 'Q': '7', 'R': '7', 'S': '7',
      'T': '8', 'U': '8', 'V': '8',
      'W': '9', 'X': '9', 'Y': '9', 'Z': '9'
    };

    return phone.toUpperCase().split('').map(char => {
      // Digits pass through unchanged
      if (/\d/.test(char)) return char;
      // Letters convert to keypad digits
      if (keypad[char]) return keypad[char];
      // Everything else (spaces, hyphens, parens, etc.) passes through
      return char;
    }).join('');
  }

  /**
   * GOAL: Server-side validation for client phone numbers. Accept common separators including dots
   * and validate against international phone format. Must match client-side validation exactly.
   * Supports formats: 123-456-7890, (123) 456-7890, 123.456.7890, +1 123 456 7890
   * Also accepts vanity numbers like 1-877-ROD-SHOWS which are converted to numeric format.
   *
   * VALIDATION RULES:
   * - Must contain at least one digit or phone separator to ensure phone-like structure
   * - After conversion and cleanup, must start with digit 1-9
   * - Must contain only digits after cleanup
   * - Must be between 7-16 digits (7=local min, 16=international max)
   * - Rejects: invalid characters, empty strings, too short/long, unstructured text, prompt injection
   */
  static isValidPhone(phone) {
    // Reject unstructured text - must have at least one digit or non-space phone separator
    // Spaces alone don't count as structure (prevents "call me maybe" from passing)
    if (!/[\d\-\(\)\.\+]/.test(phone)) {
      return false;
    }

    // First convert vanity letters to digits
    const numericPhone = this.convertVanityToNumeric(phone);

    // Strip valid separators (spaces, hyphens, parens, dots)
    const cleanedPhone = numericPhone.replace(/[\s\-\(\)\.]/g, '');

    // Validate: starts with 1-9, contains only digits, 7-16 chars
    const phoneRegex = /^[\+]?[1-9][\d]{6,15}$/;
    return phoneRegex.test(cleanedPhone);
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
