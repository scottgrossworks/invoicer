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
   * Load PDF settings from database with fallback to config file
   * @returns {Promise<Object>} PDF settings object
   */
  async load() {
    try {
      // Try to load from database first
      const configResponse = await fetch(chrome.runtime.getURL('invoicer_config.json'));
      const config = await configResponse.json();
      const serverUrl = config.db?.baseUrl || 'http://127.0.0.1:3000';
      
      const dbResponse = await fetch(`${serverUrl}/config`);
      
      if (dbResponse.ok) {
        const dbConfig = await dbResponse.json();
        console.log('PDF settings loaded from database');
        return dbConfig;
      } else {
        console.log('No database config found, using config file defaults');
        return config.pdfSettings || this.getDefaults();
      }
      
    } catch (error) {
      console.error('Failed to load PDF settings from database, using config file:', error);
      
      // Fallback to config file
      try {
        const response = await fetch(chrome.runtime.getURL('invoicer_config.json'));
        const config = await response.json();
        return config.pdfSettings || this.getDefaults();
      } catch (configError) {
        console.error('Failed to load PDF settings from config file:', configError);
        return this.getDefaults();
      }
    }
  }

  /**
   * Save PDF settings to database via server API
   * @param {Object} settings - PDF settings to save
   * @returns {Promise<void>}
   */
  async save(settings) {
    try {
      // Get server baseUrl from config
      const configResponse = await fetch(chrome.runtime.getURL('invoicer_config.json'));
      const config = await configResponse.json();
      const serverUrl = config.db?.baseUrl || 'http://127.0.0.1:3000';
      
      // Send settings to server
      const response = await fetch(`${serverUrl}/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings)
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('PDF settings saved to database:', result.id);
      
      // Also save to Chrome storage as backup/cache
      await chrome.storage.local.set({ pdfSettings: settings });
      
    } catch (error) {
      console.error('Failed to save PDF settings to database:', error);
      
      // Fallback: save to Chrome storage only
      await chrome.storage.local.set({ pdfSettings: settings });
      console.log('PDF settings saved to Chrome storage as fallback');
      
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
