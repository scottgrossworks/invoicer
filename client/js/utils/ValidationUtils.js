/**
 * ValidationUtils - Utility functions for data validation
 * Provides validation for client data, booking data, and common field types
 */

export class ValidationUtils {

  /**
   * Validate that a value is not empty
   * @param {any} value - Value to check
   * @param {string} fieldName - Name of field for error message
   * @returns {{valid: boolean, error: string|null}}
   */
  static validateRequired(value, fieldName) {
    if (value === null || value === undefined || String(value).trim() === '') {
      return {
        valid: false,
        error: `${fieldName} is required`
      };
    }
    return { valid: true, error: null };
  }

  /**
   * Validate email format
   * @param {string} email - Email address to validate
   * @returns {{valid: boolean, error: string|null}}
   */
  static validateEmail(email) {
    if (!email) return { valid: true, error: null }; // Optional field

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        valid: false,
        error: 'Invalid email format'
      };
    }
    return { valid: true, error: null };
  }

  /**
   * Validate phone number format (flexible - accepts various formats)
   * @param {string} phone - Phone number to validate
   * @returns {{valid: boolean, error: string|null}}
   */
  static validatePhone(phone) {
    if (!phone) return { valid: true, error: null }; // Optional field

    // Remove common formatting characters for validation
    const cleaned = phone.replace(/[\s\-\(\)\+\.]/g, '');

    // Check if it's a reasonable length (7-15 digits for international numbers)
    if (cleaned.length < 7 || cleaned.length > 15 || !/^\d+$/.test(cleaned)) {
      return {
        valid: false,
        error: 'Invalid phone number format'
      };
    }
    return { valid: true, error: null };
  }

  /**
   * Validate client data object
   * @param {object} clientData - Client object to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  static validateClientData(clientData) {
    const errors = [];

    // Name is required
    const nameValidation = this.validateRequired(clientData.name, 'Name');
    if (!nameValidation.valid) {
      errors.push(nameValidation.error);
    }

    // Email is optional but must be valid format if provided
    const emailValidation = this.validateEmail(clientData.email);
    if (!emailValidation.valid) {
      errors.push(emailValidation.error);
    }

    // Phone is optional but must be valid format if provided
    const phoneValidation = this.validatePhone(clientData.phone);
    if (!phoneValidation.valid) {
      errors.push(phoneValidation.error);
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate booking data object
   * @param {object} bookingData - Booking object to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  static validateBookingData(bookingData) {
    const errors = [];

    // ClientId is required
    const clientIdValidation = this.validateRequired(bookingData.clientId, 'Client');
    if (!clientIdValidation.valid) {
      errors.push(clientIdValidation.error);
    }

    // StartDate is required
    const startDateValidation = this.validateRequired(bookingData.startDate, 'Start Date');
    if (!startDateValidation.valid) {
      errors.push(startDateValidation.error);
    }

    // Validate date range if both dates provided
    if (bookingData.startDate && bookingData.endDate) {
      try {
        const startDate = new Date(bookingData.startDate);
        const endDate = new Date(bookingData.endDate);

        if (endDate < startDate) {
          errors.push('End date must be after or equal to start date');
        }
      } catch (error) {
        errors.push('Invalid date format');
      }
    }

    // Validate numeric fields if provided
    if (bookingData.duration !== null && bookingData.duration !== undefined) {
      const duration = parseFloat(bookingData.duration);
      if (isNaN(duration) || duration <= 0) {
        errors.push('Duration must be a positive number');
      }
    }

    if (bookingData.hourlyRate !== null && bookingData.hourlyRate !== undefined) {
      const rate = parseFloat(bookingData.hourlyRate);
      if (isNaN(rate) || rate < 0) {
        errors.push('Hourly rate must be a non-negative number');
      }
    }

    if (bookingData.flatRate !== null && bookingData.flatRate !== undefined) {
      const rate = parseFloat(bookingData.flatRate);
      if (isNaN(rate) || rate < 0) {
        errors.push('Flat rate must be a non-negative number');
      }
    }

    if (bookingData.totalAmount !== null && bookingData.totalAmount !== undefined) {
      const amount = parseFloat(bookingData.totalAmount);
      if (isNaN(amount) || amount < 0) {
        errors.push('Total amount must be a non-negative number');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Format phone number for display (US format)
   * @param {string} phone - Raw phone number
   * @returns {string} Formatted phone number
   */
  static formatPhoneForDisplay(phone) {
    if (!phone) return phone;

    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // Format based on length
    if (cleaned.length === 10) {
      // US format: (555) 123-4567
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      // US format with country code: +1 (555) 123-4567
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    } else {
      // Return as-is if not standard US format
      return phone;
    }
  }

  /**
   * Check if a string is empty or only whitespace
   * @param {string} str - String to check
   * @returns {boolean} True if empty or whitespace only
   */
  static isEmpty(str) {
    return !str || String(str).trim() === '';
  }

  /**
   * Check if email/name matches the user's own identity
   * Used to filter out user's own contact info from client lists
   * @param {string} email - Email to check
   * @param {string} name - Name to check
   * @param {object} config - Config object with companyEmail and companyName
   * @returns {boolean} True if this is the user's identity (should be filtered out)
   */
  static isUserIdentity(email, name, config) {
    if (!config) return false;

    // Normalize emails for comparison (case-insensitive)
    const normalizeEmail = (e) => e ? e.toLowerCase().trim() : '';

    // Check email match
    if (email && config.companyEmail) {
      if (normalizeEmail(email) === normalizeEmail(config.companyEmail)) {
        return true;
      }
    }

    // Check name match (case-insensitive, whitespace normalized)
    if (name && config.companyName) {
      const normalizeName = (n) => n ? n.toLowerCase().replace(/\s+/g, ' ').trim() : '';
      if (normalizeName(name) === normalizeName(config.companyName)) {
        return true;
      }
    }

    return false;
  }
}
