/**
 * Represents the configuration settings for the application.
 */

class Config {

    constructor(data) {
        this.companyName = data.companyName || '';
        this.companyAddress = data.companyAddress || '';
        this.companyPhone = data.companyPhone || '';
        this.companyEmail = data.companyEmail || '';
        this.logoUrl = data.logoUrl || '';
        this.bankAccount = data.bankAccount || '';
        this.bankRouting = data.bankRouting || '';
        this.bankWire = data.bankWire || '';
        this.servicesPerformed = data.servicesPerformed || '';
        this.contactHandle = data.contactHandle || '';
        this.includeTerms = data.includeTerms !== undefined ? data.includeTerms : true;
        this.terms = data.terms || '';
        this.template = data.template || 'modern';  // IGNORE
    }


    static validate(data) {
        const errors = [];  
        
        if (!data.companyName || data.companyName.trim() === '') {
            errors.push('Company name is required');
        }

        if (data.companyEmail && !this.isValidEmail(data.companyEmail)) {
            errors.push('Invalid company email format');
        }

        if (data.companyPhone && !this.isValidPhone(data.companyPhone)) {
            errors.push('Invalid company phone format');
        }

        return {
            isValid: errors.length === 0,
            errors};
    }

  /**
   * Return just the fields which user can modify
   * @returns field names[]
   */
static getFieldNames() {
    const fields = [
      'companyName',
      'companyAddress',
      'companyPhone',
      'companyEmail',
      'logoUrl',
      'bankAccount',
      'bankRouting',
      'bankWire',
      'servicesPerformed',
      'contactHandle',
      'includeTerms',
      'terms'
    ];

    return fields;
  }


  /**
   * Get default PDF settings (empty object to rely on HTML placeholders)
   * @returns {Object} Empty default settings
   */
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


  
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  
  toCreateData() {
    return {
        companyName: this.companyName || '',
        companyAddress: this.companyAddress || '',
        companyPhone: this.companyPhone || '',
        companyEmail: this.companyEmail || '',
        logoUrl: this.logoUrl || '',
        bankName: this.bankName || '',
        bankAddress: this.bankAddress || '',
        bankPhone: this.bankPhone || '',
        bankAccount: this.bankAccount || '',
        bankRouting: this.bankRouting || '',
        bankWire: this.bankWire || '',
        servicesPerformed: this.servicesPerformed || '',
        contactHandle: this.contactHandle || '',
        includeTerms: this.includeTerms !== undefined ? this.includeTerms : true,
        terms: this.terms || '',
        template: this.template || 'modern'
    };
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
      template: this.template
    };
  }

}

// Add JSON export for client-side usage
Config.prototype.toJSON = function() {
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
    template: this.template
  };
};

export default Config;
