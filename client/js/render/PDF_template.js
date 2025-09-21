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
    this.templatePromise = this._initTemplate(); // Call an async initializer
  }

  // Initializes the template by loading Handlebars and registering helpers
  async _initTemplate() {
    try {
      await this.loadTemplate();
      this.registerHelpers(this.Handlebars); 
      this.templateReady = true;
      return this;
    } catch (error) {
      console.error('Failed to initialize Handlebars template:', error);
      this.templateReady = false;
      throw error;
    }
  }

  /**
   * Asynchronously loads and compiles the Handlebars template
   * Dynamically imports Handlebars library and fetches the HTML template
   */
  async loadTemplate() {
    // Load Handlebars dynamically and force it to global scope
    try {
      const handlebarsUrl = chrome.runtime.getURL('lib/handlebars.runtime.min.js');
      
      // If Handlebars not loaded, load it now
      if (!window.Handlebars) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = handlebarsUrl;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Handlebars'));
          document.head.appendChild(script);
        });
      }
      
      this.Handlebars = window.Handlebars;
      const templatePath = chrome.runtime.getURL('js/render/invoice_template.html');
      const response = await fetch(templatePath);
      this.template = this.Handlebars.compile(await response.text());
    } catch (error) {
      console.error('Handlebars loading failed:', error);
      throw error;
    }
  }



    /**
   * Fetches and returns the content of the CSS file as a string.
   * @returns {Promise<string>} The CSS content.
   */
    async getInvoiceCSS() {
      const cssPath = chrome.runtime.getURL('css/pdf_invoice.css');
      const response = await fetch(cssPath);
      if (!response.ok) {
          throw new Error(`Failed to fetch CSS: ${response.statusText}`);
      }
      return response.text();
    }




  /**
   * Registers custom Handlebars helpers for template rendering
   * Includes formatters for dates, times, currency, addresses and conditional helpers
   */
  registerHelpers(HandlebarsInstance) {
    HandlebarsInstance.registerHelper('formatDate', this.formatDate);
    HandlebarsInstance.registerHelper('formatTime', this.formatTime);
    HandlebarsInstance.registerHelper('formatCurrency', this.formatCurrency);
    HandlebarsInstance.registerHelper('formatDecimalCurrency', this.formatDecimalCurrency);
    HandlebarsInstance.registerHelper('formatAddress', this.formatAddress);
    HandlebarsInstance.registerHelper('formatPhoneForDisplay', this.formatPhoneForDisplay);
    HandlebarsInstance.registerHelper('ifShouldShowBankInfo', function(Config, options) {
      if (PDF_template.prototype.shouldShowBankInfo(Config)) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });
    /**
     * Custom Handlebars helper: Logical OR operator
     * 
     * Provides JavaScript || functionality within Handlebars templates.
     * Returns the first truthy value from the provided arguments.
     * 
     * Template usage examples:
     * - {{or bookingData.hourlyRate bookingData.flatRate}} - Show hourly rate OR flat rate (whichever exists)
     * - {{or bookingData.description settings.servicesPerformed}} - Show description OR fallback to default service
     * - {{#if (or settings.bankAccount settings.bankName)}} - Conditional rendering if ANY bank field exists
     * 
     * @param {*} value1 - First value to check
     * @param {*} value2 - Second value to check  
     * @param {*} value3 - Third value to check (optional)
     * @returns {*} First truthy value, or last value if all are falsy
     */
    HandlebarsInstance.registerHelper('or', function (...args) {
      // Remove the last argument which is Handlebars options
      const values = args.slice(0, -1);
      // console.log('OR helper called with:', { values, result: values.some(val => val) });
      return values.some(val => val);
    });
    
    // Calculates hourly rate from total amount and duration
    HandlebarsInstance.registerHelper('calculateHourlyRate', (totalAmount, duration) => {
      if (!totalAmount || !duration) return 0;
      const total = parseFloat(totalAmount);
      const hours = parseFloat(duration);
      if (isNaN(total) || isNaN(hours) || hours === 0) return 0;
      return total / hours;
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
    if (amount === null || amount === undefined || amount === '') return '$0';
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) return amount; // Return original if not a number
    return `$${Math.round(parsedAmount)}`;
  }

  /**
   * Formats numeric amount as currency with dollar sign and two decimal places
   * @param {number|string} amount - Numeric amount to format
   * @returns {string} Currency formatted string (e.g., "$150.00") or original if invalid
   */
  formatDecimalCurrency(amount) {
    // console.log('formatDecimalCurrency called with:', { amount, type: typeof amount });
    if (amount === null || amount === undefined || amount === '') return '$0.00';
    const parsedAmount = parseFloat(amount);
    // console.log('parseFloat result:', { parsedAmount, isNaN: isNaN(parsedAmount) });
    if (isNaN(parsedAmount)) return amount; // Return original if not a number
    const result = `$${parsedAmount.toFixed(2)}`;
    // console.log('formatDecimalCurrency result:', result);
    return result;
  }

  /**
   * Formats phone numbers with dashes for display (ABC-DEF-GHIJ)
   * @param {string} phone - Phone number string
   * @returns {string} Formatted phone number or original if invalid
   */
  formatPhoneForDisplay(phone) {
    if (!phone) return phone;

    // Remove any existing formatting
    const digitsOnly = phone.toString().replace(/[^\d]/g, '');

    // Handle 10-digit US numbers
    if (digitsOnly.length === 10) {
      return `${digitsOnly.slice(0,3)}-${digitsOnly.slice(3,6)}-${digitsOnly.slice(6)}`;
    }

    // Handle 11-digit with country code (remove leading 1)
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
      const phone = digitsOnly.slice(1);
      return `${phone.slice(0,3)}-${phone.slice(3,6)}-${phone.slice(6)}`;
    }

    // Return as-is for other formats
    return phone;
  }

  /**
   * Check if bank information should be included in the invoice
   * @param {Object} settings - Settings object
   * @returns {boolean} True if bank info should be shown
   */
  shouldShowBankInfo(Config) {
    return (Config.bankName && Config.bankName.trim() !== '') &&
           (Config.bankAccount && Config.bankAccount.trim() !== '') &&
           (Config.bankRouting && Config.bankRouting.trim() !== '') &&
           (Config.bankWire && Config.bankWire.trim() !== '');
  }





  // Generates HTML invoice content using Handlebars template and state data
  async generateInvoiceHTML( state, configData = null ) {
    // Ensure template is loaded before using it
    await this.templatePromise;

    if (!this.templateReady || !this.template) {
      throw new Error('Template not ready or failed to load');
    }

    this.STATE = state;

    // Create context object with proper structure
    const context = {
      bookingData: this.STATE.Booking || {},
      clientData: this.STATE.Client || {},
      Config: configData || this.STATE.Config || {},
      invoiceNumber: this.generateInvoiceNumber(),
      invoiceDate: new Date().toLocaleDateString()
    };
    
    
    
    // Verify key data fields are present
    /*
    console.log('=== KEY FIELDS VERIFICATION ===');
    console.log('Client Name:', context.clientData?.name || 'MISSING');
    console.log('Booking Description:', context.bookingData?.description || 'MISSING');
    console.log('Config Company Name:', context.Config?.companyName || 'MISSING');
    console.log('Services Performed:', context.Config?.servicesPerformed || 'MISSING');
    console.log('Total Amount:', context.bookingData?.totalAmount || 'MISSING');
    */

    return this.template(context); // Template already contains only body content
  }

}

export default PDF_template;