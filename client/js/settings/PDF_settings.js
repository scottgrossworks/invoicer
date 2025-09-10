import Settings from './settings.js';

const PDF_SETTINGS_HTML = 'pdf_settings.html';
const CONFIG_JSON = 'invoicer_config.json';
const URL_DEFAULT = 'http://127.0.0.1:3000';


/**
 * PDF Settings implementation
 * Handles configuration for PDF invoice generation
 */
class PDF_settings extends Settings {
  
  constructor(state) {
    super();
    this.name = 'PDF_settings';
    this.STATE = state; // Store reference to shared state
  }

  /**
   * Open PDF settings in a new Chrome tab
   * @returns {Promise<void>}
   */
  async open() {
    try {
        
      // Create the settings page URL
      const settingsUrl = chrome.runtime.getURL( PDF_SETTINGS_HTML );
      
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
   * Load PDF settings from database and update state object directly
   * @returns {Promise<void>}
   */
  async load() {
    try {
      // Get server baseUrl from config
      const configResponse = await fetch(chrome.runtime.getURL(CONFIG_JSON));
      const config = await configResponse.json();
      const serverUrl = config.db?.baseUrl || URL_DEFAULT;
      
      const dbResponse = await fetch(`${serverUrl}/config`);
      console.log('Database config fetch response status:', dbResponse.status);
      
      if (dbResponse.ok) {
        const dbConfig = await dbResponse.json();
        console.log("PDF settings loaded from database");
        console.log(dbConfig);
        
        // Update state object directly with database config
        Object.assign(this.STATE.Config, dbConfig);
        await this.STATE.save();
        
      } else {
        console.log("No DB Config found");
        if (!this.STATE.Config || !this.STATE.Config.companyName) {
          console.log("Using empty defaults");
          Object.assign(this.STATE.Config, this.getDefaults());
          await this.STATE.save();
        } else {
          console.log("Using existing Chrome STATE");
        }
      }
      
    } catch (error) {
      console.error('Error loading PDF settings, using defaults:', error);
      Object.assign(this.STATE.Config, this.getDefaults());
      await this.STATE.save();
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
      const configResponse = await fetch(chrome.runtime.getURL(CONFIG_JSON));
      const config = await configResponse.json();
      const serverUrl = config.db?.baseUrl || URL_DEFAULT;
            
      // send to server
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
      
      // Chrome storage already updated above in currentBookingState
      
    } catch (error) {
      console.error('Failed to save PDF settings to database:', error);
      
      // Fallback: Chrome storage already updated above in currentBookingState
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
      companyName: '',
      companyAddress: '',
      companyPhone: '',
      companyEmail: '',
      logoUrl: '',
      bankName: '',
      bankAddress: '',
      bankPhone: '',
      bankAccount: '',
      bankRouting: '',
      bankWire: '',
      servicesPerformed: '',
      contactHandle: '',
      includeTerms: true,
      terms: '',
      template: 'modern'
    };
  }
}

export default PDF_settings;
