/**
 * PDF Settings Page JavaScript
 * Handles the settings interface functionality
 */

// Import PDF settings class
import PDF_settings from '/js/settings/PDF_settings.js';

class PDFSettingsPage {
  constructor() {
    this.pdfSettings = new PDF_settings();
    this.initialize();
  }

  /**
   * Initialize the settings page
   */
  async initialize() {
    await this.loadSettings();
    this.setupCollapsibles();
    this.wireEventListeners();
  }

  /**
   * Load current settings and populate form
   */
  async loadSettings() {
    try {
      const settings = await this.pdfSettings.load();
      this.populateForm(settings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Populate form fields with settings data
   * Only sets values if they are not null or empty, allowing placeholders to show otherwise.
   * Adds 'placeholder-like-value' class for styling.
   * @param {Object} settings - Settings object
   */
  populateForm(settings) {
    const fields = [
      'companyName', 'companyAddress', 'companyPhone', 'companyEmail', 'logoUrl',
      'bankName', 'bankAddress', 'bankPhone', 'bankAccount', 'bankRouting', 'bankWire',
      'servicesPerformed', 'contactHandle', 'terms', 'footerText'
    ];

    fields.forEach(field => {
      const element = document.getElementById(field);
      if (element && settings[field] !== null && settings[field] !== undefined && settings[field] !== '') {
        element.value = settings[field];
        element.classList.add('placeholder-like-value');
      }
    });

    // Handle specific non-text fields
    const includeTermsElement = document.getElementById('includeTerms');
    if (includeTermsElement) {
      // Checkbox should be checked if settings.includeTerms is true or 'true'
      includeTermsElement.checked = settings.includeTerms === true || settings.includeTerms === 'true';
    }
  }

  /**
   * Setup collapsible sections
   */
  setupCollapsibles() {
    const bankToggle = document.getElementById('bankInfoToggle');
    const bankContent = document.getElementById('bankInfoContent');
    
    if (bankToggle && bankContent) {
      // Ensure initial state is collapsed
      bankContent.classList.add('collapsed');
      bankContent.classList.remove('expanded'); // Explicitly remove expanded
      bankToggle.classList.add('collapsed');
      
      bankToggle.addEventListener('click', () => {
        const isCollapsed = bankContent.classList.contains('collapsed');
        
        if (isCollapsed) {
          bankContent.classList.remove('collapsed');
          bankContent.classList.add('expanded');
          bankToggle.classList.remove('collapsed');
        } else {
          bankContent.classList.add('collapsed');
          bankContent.classList.remove('expanded');
          bankToggle.classList.add('collapsed');
        }
      });
    }
  }

  /**
   * Wire up event listeners
   */
  wireEventListeners() {
    // Save button
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    // Preview button
    document.getElementById('previewBtn').addEventListener('click', () => {
      this.previewInvoice();
    });

    // Download PDF button
    document.getElementById('downloadPdfBtn').addEventListener('click', () => {
      this.downloadPdf();
    });

    // Form change listeners
    const formElements = document.querySelectorAll('input, select, textarea');
    formElements.forEach(element => {
      element.addEventListener('input', () => {
        // Remove placeholder-like styling when user starts typing
        element.classList.remove('placeholder-like-value');
        element.classList.add('active-input'); // Add active class to revert text color
      });
      element.addEventListener('focus', () => {
        element.classList.remove('placeholder-like-value');
        element.classList.add('active-input');
      });
      element.addEventListener('blur', () => {
        // If field is empty after blur, re-apply placeholder-like styling
        if (!element.value) {
          element.classList.remove('active-input');
        }
      });
    });
  }

  /**
   * Collect current form data
   * @returns {Object} Settings object
   */
  collectFormData() {
    return {
      // Company Information
      companyName: document.getElementById('companyName').value,
      companyAddress: document.getElementById('companyAddress').value,
      companyPhone: document.getElementById('companyPhone').value,
      companyEmail: document.getElementById('companyEmail').value,
      logoUrl: document.getElementById('logoUrl').value,

      // Bank Information
      bankName: document.getElementById('bankName').value,
      bankAddress: document.getElementById('bankAddress').value,
      bankPhone: document.getElementById('bankPhone').value,
      bankAccount: document.getElementById('bankAccount').value,
      bankRouting: document.getElementById('bankRouting').value,
      bankWire: document.getElementById('bankWire').value,

      // Services Information
      servicesPerformed: document.getElementById('servicesPerformed').value,
      contactHandle: document.getElementById('contactHandle').value,

      // Terms & Footer
      includeTerms: document.getElementById('includeTerms').checked,
      terms: document.getElementById('terms').value,
      footerText: document.getElementById('footerText').value
    };
  }

  /**
   * Save current settings
   */
  async saveSettings() {
    try {
      const settings = this.collectFormData();
      await this.pdfSettings.save(settings);
      
      // Show success message
      this.showMessage('Settings saved successfully to database!', 'success');
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showMessage('Failed to save settings. Please try again.', 'error');
    }
  }

  /**
   * Download PDF invoice with current settings
   */
  async downloadPdf() {
    try {
      const settings = this.collectFormData();

      // Import PDF render class dynamically
      const { default: PDF_render } = await import(chrome.runtime.getURL('js/render/PDF_render.js'));
      const pdfRender = new PDF_render();

      // Get real booking state from Chrome storage
      const stateData = await this.getCurrentBookingState();
      
      // Construct a state-like object that prioritizes real data over mock data
      const invoiceState = {
        get: (key) => {
          // Prioritize real state data
          if (stateData && stateData[key] !== undefined && stateData[key] !== null && stateData[key] !== '') {
            return stateData[key];
          }
          // Fallback to settings or default for description and location if stateData is empty
          if (key === 'description') return settings.servicesPerformed || '';
          if (key === 'location') return settings.companyAddress ? settings.companyAddress.split('\n')[0] : '';
          // Fallback to empty string for other fields if no real data or setting
          return '';
        }
      };

      // Generate PDF using the constructed invoiceState and loaded settings
      await pdfRender.render(invoiceState, settings);

      this.showMessage('PDF downloaded successfully!', 'success');

    } catch (error) {
      console.error('Failed to download PDF:', error);
      this.showMessage('Failed to download PDF. Please try again.', 'error');
    }
  }

  /**
   * Preview invoice with current settings
   */
  async previewInvoice() {
    try {
      const settings = this.collectFormData();

      // Get real booking state from Chrome storage
      const stateData = await this.getCurrentBookingState();

      // Construct dynamic booking data - prioritize real data, then form settings
      const dynamicBookingData = {
        description: (stateData?.description) || settings.servicesPerformed || '',
        location: (stateData?.location) || (settings.companyAddress ? settings.companyAddress.split('\n')[0] : ''),
        startDate: (stateData?.startDate) || '',
        startTime: (stateData?.startTime) || '',
        endTime: (stateData?.endTime) || '',
        duration: (stateData?.duration) || '',
        hourlyRate: (stateData?.hourlyRate) || '',
        totalAmount: (stateData?.totalAmount) || '',
        notes: (stateData?.notes) || '',
        flatRate: (stateData?.flatRate) || '',
      };

      // Construct dynamic client data - prioritize real data, then empty string
      const dynamicClientData = {
        name: (stateData?.name) || '',
        email: (stateData?.email) || '',
        phone: (stateData?.phone) || '',
        company: (stateData?.company) || '',
      };

      // Import template class dynamically with full Chrome extension URL
      const templateModule = await import(chrome.runtime.getURL('js/render/PDF_template.js'));
      const PDF_template = templateModule.default || templateModule.PDF_template;
      const template = new PDF_template();

      // Generate HTML body content and CSS
      const bodyContent = await template.generateInvoiceHTML(dynamicBookingData, dynamicClientData, settings);
      const cssContent = await template.getInvoiceCSS();
      
      // Construct complete HTML document for preview
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Invoice Preview</title>
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
            /* Remove gaps for better preview */
            .invoice-header { margin-bottom: 10px !important; }
            .invoice-details { margin-bottom: 5px !important; }
            .billing-section { margin: 5px 0 !important; }
            
            /* Additional preview styling */
            body {
              margin: 20px;
              background: white;
            }
          </style>
        </head>
        <body>
          ${bodyContent}
        </body>
        </html>
      `;

      // Open preview in new window
      const previewWindow = window.open('', '_blank', 'width=800,height=1000');
      previewWindow.document.write(html);
      previewWindow.document.close();

    } catch (error) {
      console.error('Failed to generate preview:', error);
      this.showMessage('Failed to generate preview. Please try again.', 'error');
    }
  }

  /**
   * Get current booking state from Chrome storage
   * @returns {Promise<Object|null>} Current booking state or null
   */
  async getCurrentBookingState() {
    try {
      const result = await chrome.storage.local.get(['currentBookingState']);
      return result.currentBookingState || null;
    } catch (error) {
      console.warn('Could not load current booking state:', error);
      return null;
    }
  }

  /**
   * Show status message
   * @param {string} message - Message to show
   * @param {string} type - Message type (success, error)
   */
  showMessage(message, type = 'info') {
    // Create message element if it doesn't exist
    let messageEl = document.getElementById('statusMessage');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.id = 'statusMessage';
      messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        font-weight: 500;
        z-index: 1000;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(messageEl);
    }

    // Style based on type
    const colors = {
      success: { bg: '#10b981', text: 'white' },
      error: { bg: '#ef4444', text: 'white' },
      info: { bg: '#3b82f6', text: 'white' }
    };

    const color = colors[type] || colors.info;
    messageEl.style.backgroundColor = color.bg;
    messageEl.style.color = color.text;
    messageEl.textContent = message;
    messageEl.style.opacity = '1';

    // Auto-hide after 3 seconds
    setTimeout(() => {
      messageEl.style.opacity = '0';
    }, 3000);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PDFSettingsPage();
});
