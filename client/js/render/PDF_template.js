// Import Handlebars via dynamic import to avoid module loading issues

/**
 * PDF Template Generator
 * Converts booking and client data into styled HTML for PDF generation
 */
class PDF_template {
  constructor() {
    this.name = 'PDF_template';
    this.template = null; // Will store the compiled Handlebars template
    this.templateReady = false;
    this.templatePromise = this.loadTemplate();
  }

  /**
   * Asynchronously loads and compiles the Handlebars template
   * Dynamically imports Handlebars library and fetches the HTML template
   */
  async loadTemplate() {
    try {
      // Dynamic import Handlebars
      const handlebarsModule = await import(chrome.runtime.getURL('js/lib/handlebars.runtime.min.js'));
      this.Handlebars = handlebarsModule.default || handlebarsModule;
      
      const templatePath = chrome.runtime.getURL('js/render/invoice_template.html');
      const response = await fetch(templatePath);
      const templateHtml = await response.text();
      this.template = this.Handlebars.compile(templateHtml);
      this.registerHelpers();
      this.templateReady = true;
    } catch (error) {
      console.error('Failed to load or compile Handlebars template:', error);
      this.templateReady = false;
    }
  }

  /**
   * Registers custom Handlebars helpers for template rendering
   * Includes formatters for dates, times, currency, addresses and conditional helpers
   */
  registerHelpers() {
    this.Handlebars.registerHelper('formatDate', this.formatDate);
    this.Handlebars.registerHelper('formatTime', this.formatTime);
    this.Handlebars.registerHelper('formatCurrency', this.formatCurrency);
    this.Handlebars.registerHelper('formatAddress', this.formatAddress);
    this.Handlebars.registerHelper('ifShouldShowBankInfo', function(settings, options) {
      if (PDF_template.prototype.shouldShowBankInfo(settings)) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });
    this.Handlebars.registerHelper('or', function (value1, value2) {
      return value1 || value2;
    });
  }

  /**
   * Helper methods
   */
  
  /**
   * Generates a unique invoice number based on current timestamp
   * @returns {string} Invoice number in format INV######
   */
  generateInvoiceNumber() {
    return `INV${Date.now().toString().slice(-6)}`;
  }

  /**
   * Formats multi-line address by replacing newlines with HTML line breaks
   * @param {string} address - Raw address string with newlines
   * @returns {string} HTML formatted address
   */
  formatAddress(address) {
    return address ? address.replace(/\n/g, '<br>') : '';
  }

  /**
   * Formats date string into human-readable format (e.g., "September 19, 2025")
   * @param {string} dateString - ISO date string or parseable date
   * @returns {string} Formatted date or original string if invalid
   */
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    // Check if date is valid after parsing
    if (isNaN(date.getTime())) return dateString; // Return original if invalid
    const options = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Formats 24-hour time to 12-hour format with AM/PM
   * @param {string} time - Time string (24-hour format like "19:00" or already formatted)
   * @returns {string} 12-hour formatted time (e.g., "7:00PM") or original if invalid
   */
  formatTime(time) {
    if (!time) return '';
    // Check if time already contains AM/PM and return as-is
    if (/(AM|PM)/i.test(time)) return time;

    // Assuming input is 24-hour format (e.g., "19:00")
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    if (isNaN(hour)) return time; // Return original if invalid

    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12; // Convert 0 to 12 for 12 AM
    return `${displayHour}:${minutes}${ampm}`;
  }

  /**
   * Formats numeric amount as currency with dollar sign and two decimal places
   * @param {number|string} amount - Numeric amount to format
   * @returns {string} Currency formatted string (e.g., "$150.00") or original if invalid
   */
  formatCurrency(amount) {
    if (!amount) return '$0.00';
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) return amount; // Return original if not a number
    return `$${parsedAmount.toFixed(2)}`;
  }

  /**
   * Check if bank information should be included in the invoice
   * @param {Object} settings - Settings object
   * @returns {boolean} True if bank info should be shown
   */
  shouldShowBankInfo(settings) {
    return (settings.bankName && settings.bankName.trim() !== '') &&
           (settings.bankAccount && settings.bankAccount.trim() !== '') &&
           (settings.bankRouting && settings.bankRouting.trim() !== '') &&
           (settings.bankWire && settings.bankWire.trim() !== '');
  }

  /**
   * Generates complete HTML invoice using Handlebars template and context data
   * @param {Object} context - Combined booking, client, and settings data for template
   * @returns {Promise<string>} Complete HTML string with CSS for PDF generation
   * @throws {Error} If template is not ready or failed to load
   */
  async generateInvoiceHTML(context) {
    // Ensure template is loaded before using it
    await this.templatePromise;
    
    if (!this.templateReady || !this.template) {
      throw new Error('Template not ready or failed to load');
    }
    
    return `
      ${this.template(context)}
      <link rel="stylesheet" href="${chrome.runtime.getURL('css/pdf_invoice.css')}">
    `;
  }

  /**
   * Legacy method - CSS content moved to pdf_invoice.css file
   * @param {Object} settings - Settings object (unused)
   * @returns {string} Empty string as CSS is now in separate file
   * @deprecated Use pdf_invoice.css file instead
   */
  getInvoiceCSS(settings) {
    return ''; // Should be empty now as CSS is in a separate file
  }
}

export default PDF_template;
