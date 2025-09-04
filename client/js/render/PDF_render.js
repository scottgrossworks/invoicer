import { RenderLayer } from './Render_layer.js';
import PDF_template from './PDF_template.js';

// const HTML_2_PDF = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
const HTML_2_PDF = "lib/html2pdf.bundle.min.js";

/**
 * PDF Render implementation extending RenderLayer
 * Uses html2pdf.js to generate PDF invoices from HTML templates
 * Only provider_registry should instantiate this class directly
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
   * @param {Object} settings - PDF settings
   * @returns {Promise<void>}
   */
  





   /**
   * Render booking data as PDF invoice
   * @param {Object} state - Application state containing booking/client data
   * @param {Object} settings - PDF settings
   * @returns {Promise<void>}
   */
   async render(state, settings) {
    try {
      console.log('PDF Render starting...');
      
      // Extract data from state using inherited helper methods
      const bookingData = this.extractBookingData(state);
      const clientData = this.extractClientData(state);
      
      // Get only the HTML body content from the template
      const htmlBody = await this.template.generateInvoiceHTML(bookingData, clientData, settings);
      
      // Fetch the CSS content
      const cssContent = await this.template.getInvoiceCSS();

      // Combine body content with inlined CSS into a new, valid HTML document
      const html = `
        <html>
        <head>
          <style>${cssContent}</style>
        </head>
        <body>
          ${htmlBody}
        </body>
        </html>
      `;

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
      script.src = HTML_2_PDF;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load html2pdf library: ' + HTML_2_PDF));
      document.head.appendChild(script);
    });
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
}

export default PDF_render;