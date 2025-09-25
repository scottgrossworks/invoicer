/**
 * PDF Settings Page JavaScript
 * Handles the settings interface functionality
 */

// Import PDF settings class
import Config from '../db/Config.js';
import PDF_settings from './PDF_settings.js';



class PDFSettingsPage {
  constructor( state ) {
    this.STATE = state;
    this.pdfSettings = new PDF_settings(state);
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
      
      // Config settings SHOULD BE LOADED
      // Force reload from DB if config appears empty
      if (!this.STATE.Config?.companyName) {
        await this.pdfSettings.load();
      }

      // Populate form with the updated state config, using defaults if empty
      const settings = this.pdfSettings.getSettings();
      const settingsWithDefaults = Object.keys(settings).length === 0 || !settings.companyName
        ? Config.getDefaults()
        : { ...Config.getDefaults(), ...settings };
      this.populateForm( settingsWithDefaults );

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
      
    // fields of form correspond to Config keys
    const fields = Config.getFieldNames();
    /* Should include: 
      'companyName', 'companyAddress', 'companyPhone', 'companyEmail', 'logoUrl',
      'bankName', 'bankAddress', 'bankPhone', 'bankAccount', 'bankRouting', 'bankWire',
      'servicesPerformed', 'contactHandle', 'terms'
    */

    // add placeholders 
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
      terms: document.getElementById('terms').value
    };
  }

  /**
   * Save current settings
   */
  async saveSettings() {
    
    const settings = this.collectFormData();
    
    let result = Config.validate(settings);
    if (! result.isValid) {
      this.showMessage("Invalid Form Input", 'error');
      console.error('Validation failed:', result.errors.join(', '));
      return;1
    }
    
    // settings have been validated  
    try { 
      await this.pdfSettings.save(settings);

      // Show success message
      this.showMessage('Settings saved', 'success');
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showMessage('Save failed: ' + error.message, 'error');
    }
  }

  /**
   * Download PDF invoice with current settings
   */
  async downloadPdf() {
    try {
      // Import PDF render class dynamically
      const { default: PDF_render } = await import(chrome.runtime.getURL('js/render/PDF_render.js'));
      const pdfRender = new PDF_render();

      const settings = this.collectFormData();
      
      // validate first
      let result = Config.validate(settings);
      if (! result.isValid) {
        this.showMessage("Invalid Form Input", 'error');
        console.error('Validation failed:', result.errors.join(', '));
        return;
      }

      // save data
      await this.pdfSettings.save(settings);

      // state object should have booking and client info from sidebar
      // this.STATE should reflect the changes we just saved
      // it should still have the Booking and Client data from the sidebar

      // Generate PDF using hierarchical state
      await pdfRender.render(this.STATE);

      this.showMessage('PDF downloaded successfully', 'success');

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
      
      // Get form settings for Config
      // just in case the user is changing in one window and previewing in another
      const formConfig = this.collectFormData();
      console.log('Form Config settings:', formConfig);
      
      await this.pdfSettings.save(formConfig);

      // Import template class dynamically with full Chrome extension URL
      const templateModule = await import(chrome.runtime.getURL('js/render/PDF_template.js'));
      const PDF_template = templateModule.default || templateModule.PDF_template;
      const template = new PDF_template();

      
      // Extract data from state using inherited helper methods
      const bookingData = this.extractBookingData(this.STATE);
      const clientData = this.extractClientData(this.STATE);
      
      // Extract Config data from state (company info, logo, services, terms, etc.)
      const configData = this.extractConfigData(this.STATE);


      // Generate HTML body content and CSS using merged state
      // console.log('STATE.Config before template:', this.STATE.Config);
      /*
      console.log('Bank fields:', {
        bankName: this.STATE.Config.bankName,
        bankAccount: this.STATE.Config.bankAccount,
        bankRouting: this.STATE.Config.bankRouting,
        bankWire: this.STATE.Config.bankWire
      });
      */
      const bodyContent = await template.generateInvoiceHTML( clientData, bookingData, configData );
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
            .billing-section { margin-top: 150px !important; margin-bottom: 5px !important; }

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

// DOMContentLoaded event listener to initialize the page
document.addEventListener('DOMContentLoaded', async () => {
  console.log('PDF Settings page loading...');

  try {
    // Get state from Chrome storage
    const { StateFactory } = await import('../state.js');
    const state = await StateFactory.create();
    console.log('State loaded:', state);

    // Initialize the settings page
    const settingsPage = new PDFSettingsPage(state);
    console.log('PDF Settings page initialized');
  } catch (error) {
    console.error('Failed to initialize PDF Settings page:', error);
  }
});

// Export the class for manual instantiation
export { PDFSettingsPage };



