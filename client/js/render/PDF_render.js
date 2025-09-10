import { RenderLayer } from './Render_layer.js';
import PDF_template from './PDF_template.js';

/**
 * PDF Render implementation extending RenderLayer
 * Uses jsPDF + html2canvas to generate PDF invoices from HTML templates
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
   * @param {Object} state - Application state containing booking/client/config data
   * @returns {Promise<void>}
   */
   async render(state) {
    try {
      console.log('PDF Render starting...');
      
      // Extract data from state using inherited helper methods
      const bookingData = this.extractBookingData(state);
      const clientData = this.extractClientData(state);
      
      // Extract Config data from state (company info, logo, services, terms, etc.)
      const configData = this.extractConfigData(state);
      
      // Use Config data directly from unified state structure
      const mergedSettings = configData;
      
      /*
      console.log('PDF Render - Config data:', configData);
      console.log('PDF Render - Merged settings:', mergedSettings);
      console.log('PDF Render - State type:', typeof state, 'Has get method:', typeof state?.get);
      console.log('PDF Render - Raw servicesPerformed from state:', state?.Config?.servicesPerformed || 'NO CONFIG');
      */

      // 1. Generate the BODY content from the template using merged settings.
      const bodyContent = await this.template.generateInvoiceHTML( state );
      
      // 2. Fetch the CSS content separately.
      const cssContent = await this.template.getInvoiceCSS(); //

      // 3. Construct the final, complete HTML document.
      // This ensures a valid structure and correctly places the CSS in the head.
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Invoice</title>
          <style>
            /* Force Arial font everywhere, override all defaults */
            *, *::before, *::after {
              font-family: Arial, sans-serif !important;
              font-weight: normal !important;
              font-style: normal !important;
            }
            .company-name, .invoice-title, .total-label, .total-amount, 
            .bank-label, th, .service-title {
              font-weight: bold !important;
              font-style: normal !important;
            }
            ${cssContent}
            /* FORCE REMOVE THE GAP - PLACED LAST TO WIN */
            .invoice-header { margin-bottom: 10px !important; }
            .invoice-details { margin-bottom: 5px !important; }
            .billing-section { margin: 5px 0 !important; }
          </style>
        </head>
        <body>
          ${bodyContent}
        </body>
        </html>
      `;

      // Load jsPDF and html2canvas libraries
      await this.loadPDFLibraries(); //
      
      // Configure options
      const filename = this.generateFileName(bookingData, clientData); //
      
      // Create temporary div for HTML content (positioned for proper rendering)
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px'; // Move offscreen instead of hiding
      tempDiv.style.top = '0px'; 
      tempDiv.style.width = '850px';
      tempDiv.style.visibility = 'visible'; // Must be visible for html2canvas
      tempDiv.style.margin = '0';
      tempDiv.style.padding = '0';
      tempDiv.style.background = 'white';
      tempDiv.style.zIndex = '-1000'; // Behind everything

      document.body.appendChild(tempDiv);
      
      // Force Arial font and proper styling
      const invoiceDiv = tempDiv.querySelector('.invoice');
      if (invoiceDiv) {
        invoiceDiv.style.fontFamily = 'Arial, sans-serif';
        invoiceDiv.style.fontSize = '16px';
        invoiceDiv.style.lineHeight = '1.5';
        invoiceDiv.style.color = '#000';
        invoiceDiv.style.padding = '40px';
        invoiceDiv.style.background = 'white';
        invoiceDiv.style.boxSizing = 'border-box';
      }
      
      // Force Arial on all elements
      const allElements = tempDiv.querySelectorAll('*');
      allElements.forEach(el => {
        el.style.fontFamily = 'Arial, sans-serif';
        el.style.fontWeight = el.classList.contains('company-name') || 
                            el.classList.contains('invoice-title') || 
                            el.classList.contains('total-label') || 
                            el.classList.contains('total-amount') ||
                            el.tagName === 'TH' ? 'bold' : 'normal';
      });

      // DEBUG: Log the HTML structure
      /*
      console.log('=== jsPDF + html2canvas DEBUG ===');
      console.log('Full HTML length:', html.length);
      console.log('Body content length:', bodyContent.length);
      console.log('CSS content length:', cssContent.length);
      console.log('tempDiv innerHTML length:', tempDiv.innerHTML.length);
      console.log('tempDiv has invoice div:', !!tempDiv.querySelector('.invoice'));
      */


      try {
        // Wait a moment for styles to apply
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Capture the HTML as canvas with high quality
        const canvas = await window.html2canvas(tempDiv, {
          scale: 2,
          useCORS: true,
          allowTaint: true, 
          backgroundColor: '#ffffff',
          width: 850,
          height: tempDiv.offsetHeight || 1100,
          scrollX: 0,
          scrollY: 0,
          logging: true
        });
        
        // Create new PDF document (8.5 x 11 inches)
        // console.log('jsPDF available:', !!window.jsPDF, 'jspdf available:', !!window.jspdf);
        // console.log('html2canvas available:', !!window.html2canvas);
        
        // jsPDF UMD exports to window.jspdf.jsPDF
        const jsPDF = window.jspdf.jsPDF;
        
        if (!jsPDF) {
          throw new Error('jsPDF library not loaded properly');
        }
        
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'in',
          format: [8.5, 11]
        });

        // Calculate dimensions to fit the canvas in the PDF
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const pageWidth = 8.5;
        const pageHeight = 11;
        const margin = 0.5;
        const availableWidth = pageWidth - (margin * 2);
        const availableHeight = pageHeight - (margin * 2);
        
        const scale = Math.min(availableWidth / (canvasWidth / 96), availableHeight / (canvasHeight / 96));
        const imgWidth = (canvasWidth / 96) * scale;
        const imgHeight = (canvasHeight / 96) * scale;
        
        // Center the image on the page
        const x = (pageWidth - imgWidth) / 2;
        const y = margin;

        // Add the canvas as image to PDF
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight);

        // Save the PDF
        pdf.save(filename);
        
        // Clean up
        document.body.removeChild(tempDiv);
        
        // Update status
        const message = `PDF invoice generated: ${filename}`;
        // console.log(message);
        
        // Send success message to sidebar
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({
            type: 'leedz_update_status',
            message: message
          });
        }
        
      } catch (canvasError) {
        console.error('Canvas generation error:', canvasError);
        document.body.removeChild(tempDiv);
        throw canvasError;
      }
      
    } catch (error) {
      console.error('PDF render error:', error); //
      
      // Send error message to sidebar
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'leedz_update_status',
          message: 'PDF generation failed'
        }); //
      }
      
      throw error;
    }
  }

  /**
   * Load jsPDF and html2canvas libraries dynamically from local files
   * @returns {Promise<void>}
   */
  async loadPDFLibraries() {
    // Load jsPDF
    if (!window.jspdf) {
      // console.log('Loading jsPDF...');
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('lib/jspdf.umd.min.js');
        script.onload = () => {
          
          resolve();
        };
        script.onerror = (e) => {
          console.error('Failed to load jsPDF script:', e);
          reject(new Error('Failed to load jsPDF'));
        };
        document.head.appendChild(script);
      });
    }
    
    // Load html2canvas
    if (!window.html2canvas) {

      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('lib/html2canvas.min.js');
        script.onload = () => {
          
          resolve();
        };
        script.onerror = (e) => {
          console.error('Failed to load html2canvas script:', e);
          reject(new Error('Failed to load html2canvas'));
        };
        document.head.appendChild(script);
      });
    }
  }


  /**
   * Generate filename for PDF
   * @param {Object} bookingData - Booking information
   * @param {Object} clientData - Client information
   * @returns {string} Generated filename
   */
  generateFileName(bookingData, clientData) {
    const clientName = (clientData.name || 'client').replace(/[^a-zA-Z0-9]/g, '_'); //
    const date = new Date().toISOString().split('T')[0]; //
    return `invoice_${clientName}_${date}.pdf`; //
  }
}

export default PDF_render;