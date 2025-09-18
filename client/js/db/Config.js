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


        this.bankName = data.bankName || '';
        this.bankAddress = data.bankAddress || '';
        this.bankPhone = data.bankPhone || '';
        this.bankAccount = data.bankAccount || '';
        this.bankRouting = data.bankRouting || '';
        this.bankWire = data.bankWire || '';
        
        
        this.servicesPerformed = data.servicesPerformed || '';
        this.contactHandle = data.contactHandle || '';
        this.includeTerms = data.includeTerms !== undefined ? data.includeTerms : true;
        this.terms = data.terms || '';
        this.template = data.template || 'modern';  // IGNORE
    }

  // Validation methods
    static validate(data) {
        const errors = [];  
        
        // Company name validation relaxed - allow empty for preview/defaults
        // if (!data.companyName || data.companyName.trim() === '') {
        //     errors.push('Company name is required');
        // }

        if (data.companyEmail && !this.isValidEmail(data.companyEmail)) {
            errors.push('Invalid company email format');
        }

        if (data.companyPhone && !this.isValidPhone(data.companyPhone)) {
            errors.push('Invalid company phone format');
        }

        if (data.logoUrl && ! this.isValidUrl(data.logoUrl)) {
          errors.push('Invalid logo URL format');
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
      'bankName',
      'bankAddress',
      'bankPhone',
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
      companyName: 'Your Company Name',
      companyAddress: '123 Main Street\nCity, State 12345',
      companyPhone: '(555) 123-4567',
      companyEmail: 'info@yourcompany.com',
      logoUrl: '',
      bankName: 'Your Bank',
      bankAddress: '456 Bank Street\nCity, State 12345',
      bankPhone: '(555) 987-6543',
      bankAccount: '123456789',
      bankRouting: '987654321',
      bankWire: 'BANKWIRE123',
      servicesPerformed: 'Professional Services',
      contactHandle: '@yourcompany',
      includeTerms: true,
      terms: '',
      template: 'modern'
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
   * GOAL: Validate phone number format for company/bank phone fields by accepting common separators
   * (spaces, hyphens, parentheses, dots) and ensuring the cleaned number matches international phone format
   * This allows inputs like: 123-456-7890, (123) 456-7890, 123.456.7890, +1 123 456 7890
   */
  static isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)\.]/g, ''));
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
