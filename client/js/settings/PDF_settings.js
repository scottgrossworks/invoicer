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
        console.log('No database config found, using minimal defaults');
        return this.getDefaults();
      }
      
    } catch (error) {
      console.error('Failed to load PDF settings from database, using minimal defaults:', error);
      
      // Fallback: If DB load fails, use minimal defaults
      return this.getDefaults();
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
   * Get default PDF settings (empty object to rely on HTML placeholders)
   * @returns {Object} Empty default settings
   */
  getDefaults() {
    return {
      template: 'modern',
      // Explicitly set includeTerms to true as it's a checkbox and needs a default
      includeTerms: true,
    };
  }
}

export default PDF_settings;
