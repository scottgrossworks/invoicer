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
   * @param {Object} settings - Settings object
   */
  populateForm(settings) {
    // Company Information
    document.getElementById('companyName').value = settings.companyName || '';
    document.getElementById('companyAddress').value = settings.companyAddress || '';
    document.getElementById('companyPhone').value = settings.companyPhone || '';
    document.getElementById('companyEmail').value = settings.companyEmail || '';
    document.getElementById('logoUrl').value = settings.logoUrl || '';

    // Bank Information
    document.getElementById('bankName').value = settings.bankName || '';
    document.getElementById('bankAddress').value = settings.bankAddress || '';
    document.getElementById('bankPhone').value = settings.bankPhone || '';
    document.getElementById('bankAccount').value = settings.bankAccount || '';
    document.getElementById('bankRouting').value = settings.bankRouting || '';
    document.getElementById('bankWire').value = settings.bankWire || '';

    // Services Information
    document.getElementById('servicesPerformed').value = settings.servicesPerformed || '';
    document.getElementById('contactHandle').value = settings.contactHandle || '';

    // Terms & Footer
    document.getElementById('includeTerms').checked = settings.includeTerms !== false;
    document.getElementById('terms').value = settings.terms || '';
    document.getElementById('footerText').value = settings.footerText || '';
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

    // Form change listeners (removed updatePreview calls)
    const formElements = document.querySelectorAll('input, select, textarea');
    formElements.forEach(element => {
      element.addEventListener('change', () => {
        // Preview functionality removed
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

      // Template Design
      // Removed: template: document.getElementById('template').value,
      // Removed: primaryColor: document.getElementById('primaryColor').value,
      // Removed: fontFamily: document.getElementById('fontFamily').value,
      // Removed: fontSize: parseInt(document.getElementById('fontSize').value),

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
      this.showMessage('Settings saved! Updated config file downloaded. Replace the old invoicer_config.json file to make changes permanent.', 'success');
      
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

      // Generate PDF using the constructed invoiceState
      await pdfRender.render(invoiceState);

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

      // Generate HTML using dynamic data and settings
      const html = await template.generateInvoiceHTML(dynamicBookingData, dynamicClientData, settings);

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
   * Update the preview area
   */
  updatePreview() {
    const settings = this.collectFormData();
    const preview = document.getElementById('templatePreview');
    
    // Simple preview showing company name and color
    preview.innerHTML = `
      <div style="
        font-family: ${settings.fontFamily}; 
        font-size: ${settings.fontSize}px;
        color: ${settings.primaryColor};
        text-align: center;
        padding: 20px;
      ">
        <h2 style="margin: 0 0 10px 0; color: ${settings.primaryColor};">
          ${settings.companyName || 'Your Company'}
        </h2>
        <p style="margin: 0; color: #666; font-size: 12px;">
          Template: ${settings.template} | Font: ${settings.fontFamily}
        </p>
        <div style="
          margin-top: 20px;
          padding: 10px;
          border: 1px solid ${settings.primaryColor};
          border-radius: 4px;
          font-size: 11px;
        ">
          Click "Preview Invoice" for full preview
        </div>
      </div>
    `;
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
