import RenderLayer from './Render_layer.js';
import PDF_template from './PDF_template.js';

/**
 * PDF Render implementation using html2pdf.js
 * Renders booking data as PDF invoice using HTML templates
 */
class PDF_render extends RenderLayer {
  constructor() {
    super();
    this.name = 'PDF_render';
    this.template = new PDF_template();
  }

  /**
   * Render booking data as PDF invoice
   * @param {Object} state - Application state containing booking/client data
   * @returns {Promise<void>}
   */
  async render(state) {
    try {
      console.log('PDF Render starting...');
      
      // Extract data from state
      const bookingData = this.extractBookingData(state);
      const clientData = this.extractClientData(state);
      
      // Load PDF settings
      const settings = await this.loadSettings();
      
      // Generate HTML template
      const html = this.template.generateInvoiceHTML(bookingData, clientData, settings);
      
      // Load html2pdf library dynamically
      await this.loadHtml2PDF();
      
      // Configure PDF options
      const options = {
        margin: 0.5,
        filename: this.generateFileName(bookingData, clientData),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true
        },
        jsPDF: { 
          unit: 'in', 
          format: 'letter', 
          orientation: 'portrait' 
        }
      };
      
      // Create temporary div for HTML content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      document.body.appendChild(tempDiv);
      
      // Generate and download PDF
      await window.html2pdf()
        .set(options)
        .from(tempDiv)
        .save();
      
      // Clean up
      document.body.removeChild(tempDiv);
      
      // Update status
      const message = `PDF invoice generated: ${options.filename}`;
      console.log(message);
      
      // Send success message to sidebar
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'leedz_update_status',
          message: message
        });
      }
      
    } catch (error) {
      console.error('PDF render error:', error);
      
      // Send error message to sidebar
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'leedz_update_status',
          message: 'PDF generation failed'
        });
      }
      
      throw error;
    }
  }

  /**
   * Load html2pdf library dynamically
   * @returns {Promise<void>}
   */
  async loadHtml2PDF() {
    if (window.html2pdf) return; // Already loaded
    
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load html2pdf library'));
      document.head.appendChild(script);
    });
  }

  /**
   * Load PDF settings from Chrome storage
   * @returns {Promise<Object>} PDF settings
   */
  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['pdfSettings']);
      return result.pdfSettings || this.getDefaultSettings();
    } catch (error) {
      console.warn('Could not load PDF settings, using defaults:', error);
      return this.getDefaultSettings();
    }
  }

  /**
   * Get default PDF settings
   * @returns {Object} Default settings
   */
  getDefaultSettings() {
    return {
      companyName: 'Your Company',
      companyAddress: '123 Main Street\nCity, State 12345\nCountry',
      primaryColor: '#2563eb',
      fontFamily: 'Arial',
      fontSize: 12,
      includeTerms: true,
      terms: 'Payment is due within 30 days of invoice date.',
      footerText: 'Thank you for your business!'
    };
  }

  /**
   * Generate filename for PDF
   * @param {Object} bookingData - Booking information
   * @param {Object} clientData - Client information
   * @returns {string} Generated filename
   */
  generateFileName(bookingData, clientData) {
    const clientName = (clientData.name || 'client').replace(/[^a-zA-Z0-9]/g, '_');
    const date = new Date().toISOString().split('T')[0];
    return `invoice_${clientName}_${date}.pdf`;
  }

  /**
   * Extract booking data from state
   * @param {Object} state - Application state
   * @returns {Object} Booking data
   */
  extractBookingData(state) {
    return {
      description: state.get('description'),
      location: state.get('location'),
      startDate: state.get('startDate'),
      endDate: state.get('endDate'), 
      startTime: state.get('startTime'),
      endTime: state.get('endTime'),
      duration: state.get('duration'),
      hourlyRate: state.get('hourlyRate'),
      flatRate: state.get('flatRate'),
      totalAmount: state.get('totalAmount'),
      notes: state.get('notes')
    };
  }

  /**
   * Extract client data from state
   * @param {Object} state - Application state
   * @returns {Object} Client data
   */
  extractClientData(state) {
    return {
      name: state.get('name'),
      email: state.get('email'),
      phone: state.get('phone'),
      company: state.get('company')
    };
  }
}

export default PDF_render;