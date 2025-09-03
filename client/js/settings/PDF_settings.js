import Settings from './settings.js';

/**
 * PDF Settings implementation
 * Handles configuration for PDF invoice generation
 */
class PDF_settings extends Settings {
  constructor() {
    super();
    this.name = 'PDF_settings';
  }

  /**
   * Open PDF settings in a new Chrome tab
   * @returns {Promise<void>}
   */
  async open() {
    try {
      // Create the settings page URL
      const settingsUrl = chrome.runtime.getURL('pdf_settings.html');
      
      // Open in new tab
      chrome.tabs.create({ 
        url: settingsUrl,
        active: true 
      });
      
      console.log('PDF settings opened in new tab:', settingsUrl);
    } catch (error) {
      console.error('Failed to open PDF settings:', error);
    }
  }

  /**
   * Load PDF settings from config file
   * @returns {Promise<Object>} PDF settings object
   */
  async load() {
    try {
      const response = await fetch(chrome.runtime.getURL('invoicer_config.json'));
      const config = await response.json();
      return config.pdfSettings || this.getDefaults();
    } catch (error) {
      console.error('Failed to load PDF settings from config:', error);
      return this.getDefaults();
    }
  }

  /**
   * Save PDF settings by downloading updated config file
   * @param {Object} settings - PDF settings to save
   * @returns {Promise<void>}
   */
  async save(settings) {
    try {
      // Load current config
      const response = await fetch(chrome.runtime.getURL('invoicer_config.json'));
      const config = await response.json();
      
      // Update PDF settings section
      config.pdfSettings = settings;
      
      // Create updated config file content
      const updatedConfig = JSON.stringify(config, null, 2);
      
      // Create download blob
      const blob = new Blob([updatedConfig], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = 'invoicer_config.json';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('PDF settings saved - config file downloaded');
      
      // Also save to Chrome storage as backup
      await chrome.storage.local.set({ pdfSettings: settings });
      
    } catch (error) {
      console.error('Failed to save PDF settings:', error);
      throw error;
    }
  }

  /**
   * Reset PDF settings to defaults
   * @returns {Promise<void>}
   */
  async reset() {
    try {
      await this.save(this.getDefaults());
      console.log('PDF settings reset to defaults');
    } catch (error) {
      console.error('Failed to reset PDF settings:', error);
      throw error;
    }
  }

  /**
   * Get default PDF settings
   * @returns {Object} Default settings
   */
  getDefaults() {
    return {
      template: 'modern',
      companyName: 'Your Company',
      companyAddress: '123 Main St\nCity, State 12345',
      companyPhone: '(123) 456-7890',
      companyEmail: 'name@example.com',
      logoUrl: '',
      // Bank Information Defaults
      bankName: 'Example Bank',
      bankAddress: '1234 Main Street\nCity, State 12345',
      bankPhone: '(123) 456-7890',
      bankAccount: '1234567890',
      bankRouting: '123456789',
      bankWire: '123456789',
      // Services Information Defaults
      servicesPerformed: 'Professional Services',
      contactHandle: '@yourhandle',
      primaryColor: '#000000', // Hardcoded black
      fontFamily: 'Arial',
      fontSize: 12,
      includeTerms: true,
      terms: 'Payment is due within 30 days of invoice date.',
      footerText: 'Thank you for your business!'
    };
  }
}

export default PDF_settings;
