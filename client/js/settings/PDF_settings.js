import Settings from './settings.js';
import Config from '../db/Config.js';

const PDF_SETTINGS_HTML = 'pdf_settings.html';



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
      await this.STATE.load();

    } catch (error) {
      if (this.STATE.status != 'local') {  // load did not find settings in Chrome storage
        console.error('Error loading PDF settings, using defaults:', error);
        Object.assign(this.STATE.Config, this.getDefaults());
        await this.STATE.save();
      }
    }
  }



  /**
   * Save PDF settings to database
   * @param {Object} settings - PDF settings to save
   * @returns {Promise<void>}
   */
  async save( settings ) {
    try {
      
      Object.assign(this.STATE.Config, settings);

      await this.STATE.save(); // Save entire state, including Config

      console.log('PDF settings saved to database');

    } catch (error) {
      console.error('Failed to save PDF settings to database:', error);
      throw error;
    }
  }


  /**
   * Reset PDF settings to defaults
   * @returns {Promise<void>}
   */
    async reset() {
    try {

      Object.assign(this.STATE.Config, this.getDefaults());
      await this.STATE.save();
     
      console.log('PDF settings reset to defaults');
    } catch (error) {
      console.error('Failed to reset PDF settings:', error);
      throw error;
    }
  }


  /**
   * return the current Config state object
   */
  getSettings() {
    return this.STATE.Config;
  }

  /**
   * Get default PDF settings (empty object to rely on HTML placeholders)
   * @returns {Object} Empty default settings
   */
  getDefaults() {
    return Config.getDefaults();
  }
}

export default PDF_settings;
