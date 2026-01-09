class Config {
  constructor(data = {}) {
    if (data.id) {
      // Existing config
      this.id = data.id;
      this.companyName = data.companyName;
      this.companyAddress = data.companyAddress;
      this.companyPhone = data.companyPhone;
      this.companyEmail = data.companyEmail;
      this.logoUrl = data.logoUrl;
      this.bankName = data.bankName;
      this.bankAddress = data.bankAddress;
      this.bankPhone = data.bankPhone;
      this.bankAccount = data.bankAccount;
      this.bankRouting = data.bankRouting;
      this.bankWire = data.bankWire;
      this.servicesPerformed = data.servicesPerformed;
      this.contactHandle = data.contactHandle;
      this.includeTerms = data.includeTerms;
      this.terms = data.terms;

      this.template = data.template;
      this.friends = data.friends;
      this.sq_access = data.sq_access;
      this.sq_refresh = data.sq_refresh;
      this.sq_expiration = data.sq_expiration;
      this.sq_merchant = data.sq_merchant;
      this.sq_location = data.sq_location;
      this.sq_state = data.sq_state;
      this.createdAt = data.createdAt;
      this.updatedAt = data.updatedAt;


    } else {
      // New config with defaults
      this.id = '';
      this.companyName = data.companyName || '';
      this.companyAddress = data.companyAddress || '';
      this.companyPhone = data.companyPhone || '';
      this.companyEmail = data.companyEmail || '';
      this.logoUrl = data.logoUrl || '';

      this.bankName = data.bankName || '';
      this.bankAddress = data.bankAddress || '';
      this.bankPhone = data.bankPhone || '';
      this.bankAccount = data.bankAccount || '';
      this.bankRouting = data.bankRouting || '';
      this.bankWire = data.bankWire || '';

      this.servicesPerformed = data.servicesPerformed || '';
      this.contactHandle = data.contactHandle || '';
      this.includeTerms = data.includeTerms || true;
      this.terms = data.terms || '';

      this.template = data.template || 'modern';
      this.friends = data.friends || '';
      this.sq_access = data.sq_access || null;
      this.sq_refresh = data.sq_refresh || null;
      this.sq_expiration = data.sq_expiration || null;
      this.sq_merchant = data.sq_merchant || null;
      this.sq_location = data.sq_location || null;
      this.sq_state = data.sq_state || null;
      this.createdAt = new Date();
      this.updatedAt = new Date();
    }
  }

  // Validation methods
  static validate(data) {
    const errors = [];

    try {
      // Company name is required
      if (!data.companyName || data.companyName.trim() === '') {
        errors.push('Company name is required');
      }

      if (data.companyEmail && !this.isValidEmail(data.companyEmail)) {
          errors.push('Invalid company email format');
      }

      if (data.companyPhone && !this.isValidPhone(data.companyPhone)) {
          errors.push('Invalid company phone format');
      }

      if (data.logoUrl && ! this.isValidUrl(data.logoUrl)) {
          errors.push('Invalid logo URL format');
      }


    } catch (error) {
      console.error("Config validation failed", error);
      errors.push(error.message);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static isValidUrl(url) {
    try {
      new URL(url);
    } catch (e) {
      return false;
    }
    return true;
  }

  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * GOAL: Server-side validation for config phone fields (company/bank). Accept common separators
   * including dots and validate against international phone format. Must match client-side validation.
   * Supports formats: 123-456-7890, (123) 456-7890, 123.456.7890, +1 123 456 7890
   */
  static isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)\.]/g, ''));
  }



  // Get default config values
  static getDefaults() {
    return {
      companyName: '',
      companyAddress: '',
      companyPhone: '',
      companyEmail: '',
      logoUrl: '',
      bankName: '',
      bankAddress: '',
      bankPhone: '',
      bankAccount: '',
      bankRouting: '',
      bankWire: '',
      servicesPerformed: '',
      contactHandle: '',
      includeTerms: true,
      terms: '',

      template: 'modern'
    };
  }

  // Update method
  update(data) {
    if (data.companyName !== undefined) this.companyName = data.companyName;
    if (data.companyAddress !== undefined) this.companyAddress = data.companyAddress;
    if (data.companyPhone !== undefined) this.companyPhone = data.companyPhone;
    if (data.companyEmail !== undefined) this.companyEmail = data.companyEmail;
    if (data.logoUrl !== undefined) this.logoUrl = data.logoUrl;
    if (data.bankName !== undefined) this.bankName = data.bankName;
    if (data.bankAddress !== undefined) this.bankAddress = data.bankAddress;
    if (data.bankPhone !== undefined) this.bankPhone = data.bankPhone;
    if (data.bankAccount !== undefined) this.bankAccount = data.bankAccount;
    if (data.bankRouting !== undefined) this.bankRouting = data.bankRouting;
    if (data.bankWire !== undefined) this.bankWire = data.bankWire;
    if (data.servicesPerformed !== undefined) this.servicesPerformed = data.servicesPerformed;
    if (data.contactHandle !== undefined) this.contactHandle = data.contactHandle;
    if (data.includeTerms !== undefined) this.includeTerms = data.includeTerms;
    if (data.terms !== undefined) this.terms = data.terms;

    if (data.template !== undefined) this.template = data.template;
    if (data.friends !== undefined) this.friends = data.friends;
    if (data.sq_access !== undefined) this.sq_access = data.sq_access;
    if (data.sq_refresh !== undefined) this.sq_refresh = data.sq_refresh;
    if (data.sq_expiration !== undefined) this.sq_expiration = data.sq_expiration;
    if (data.sq_merchant !== undefined) this.sq_merchant = data.sq_merchant;
    if (data.sq_location !== undefined) this.sq_location = data.sq_location;
    if (data.sq_state !== undefined) this.sq_state = data.sq_state;
    this.updatedAt = new Date();
  }



  toInterface() {
    return {
      companyName: this.companyName,
      companyAddress: this.companyAddress,
      companyPhone: this.companyPhone,
      companyEmail: this.companyEmail,
      logoUrl: this.logoUrl,
      bankName: this.bankName,
      bankAddress: this.bankAddress,
      bankPhone: this.bankPhone,
      bankAccount: this.bankAccount,
      bankRouting: this.bankRouting,
      bankWire: this.bankWire,
      servicesPerformed: this.servicesPerformed,
      contactHandle: this.contactHandle,
      includeTerms: this.includeTerms,
      terms: this.terms,
      template: this.template,
      friends: this.friends,
      sq_access: this.sq_access,
      sq_refresh: this.sq_refresh,
      sq_expiration: this.sq_expiration,
      sq_merchant: this.sq_merchant,
      sq_location: this.sq_location,
      sq_state: this.sq_state
    };
  }

  /**
   * Square OAuth Helper Methods
   */

  /**
   * Store Square OAuth tokens in config
   * @param {Object} tokens - { access_token, refresh_token, expires_at, merchant_id }
   */
  setSquareTokens(tokens) {
    this.sq_access = tokens.access_token;
    this.sq_refresh = tokens.refresh_token;
    this.sq_expiration = BigInt(tokens.expires_at);
    this.sq_merchant = tokens.merchant_id;
    this.sq_location = tokens.location_id || null;
    this.sq_state = 'authorized';
    this.updatedAt = new Date();
  }

  /**
   * Clear Square OAuth tokens from config
   */
  clearSquareTokens() {
    this.sq_access = null;
    this.sq_refresh = null;
    this.sq_expiration = null;
    this.sq_merchant = null;
    this.sq_location = null;
    this.sq_state = null;
    this.updatedAt = new Date();
  }

  /**
   * Check if Square is authorized and token not expired
   * @returns {boolean}
   */
  isSquareAuthorized() {
    if (!this.sq_access || !this.sq_expiration) {
      return false;
    }

    // Check if token is expired (with 5 minute buffer)
    const bufferMs = 5 * 60 * 1000;
    const now = Date.now();
    const expiration = typeof this.sq_expiration === 'bigint'
      ? Number(this.sq_expiration)
      : this.sq_expiration;

    return now < (expiration - bufferMs);
  }

  /**
   * Get Square tokens for API calls
   * @returns {Object|null} - { access_token, merchant_id } or null if not authorized
   */
  getSquareTokens() {
    if (!this.isSquareAuthorized()) {
      return null;
    }

    return {
      access_token: this.sq_access,
      merchant_id: this.sq_merchant,
      location_id: this.sq_location
    };
  }


}

module.exports = {
  Config
};

// Add JSON export for client-side usage
Config.prototype.toJSON = function() {
  return {
    id: this.id,
    companyName: this.companyName,
    companyAddress: this.companyAddress,
    companyPhone: this.companyPhone,
    companyEmail: this.companyEmail,
    logoUrl: this.logoUrl,
    bankName: this.bankName,
    bankAddress: this.bankAddress,
    bankPhone: this.bankPhone,
    bankAccount: this.bankAccount,
    bankRouting: this.bankRouting,
    bankWire: this.bankWire,
    servicesPerformed: this.servicesPerformed,
    contactHandle: this.contactHandle,
    includeTerms: this.includeTerms,
    terms: this.terms,

    template: this.template,
    friends: this.friends,
    sq_access: this.sq_access,
    sq_refresh: this.sq_refresh,
    sq_expiration: this.sq_expiration,
    sq_merchant: this.sq_merchant,
    sq_location: this.sq_location,
    sq_state: this.sq_state,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};