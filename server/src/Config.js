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
      this.footerText = data.footerText;
      this.template = data.template;
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
      this.includeTerms = data.includeTerms || false;
      this.terms = data.terms || '';
      this.footerText = data.footerText || '';
      this.template = data.template || 'default';
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

      // Validate email format if provided
      if (data.companyEmail && data.companyEmail.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.companyEmail)) {
          errors.push('Invalid email format');
        }
      }

      // Validate URL format if provided
      if (data.logoUrl && data.logoUrl.trim() !== '') {
        try {
          new URL(data.logoUrl);
        } catch (e) {
          errors.push('Invalid logo URL format');
        }
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
      includeTerms: false,
      terms: '',
      footerText: '',
      template: 'default'
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
    if (data.footerText !== undefined) this.footerText = data.footerText;
    if (data.template !== undefined) this.template = data.template;
    this.updatedAt = new Date();
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
    footerText: this.footerText,
    template: this.template,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};