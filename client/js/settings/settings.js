/**
 * Base Settings interface
 * All settings implementations should extend this class
 */
class Settings {
  constructor() {
    this.name = 'BaseSettings';
  }

  /**
   * Open the settings interface
   * @returns {Promise<void>}
   */
  async open() {
    throw new Error('Settings.open() must be implemented by subclass');
  }

  /**
   * Load settings from storage
   * @returns {Promise<Object>} Settings object
   */
  async load() {
    throw new Error('Settings.load() must be implemented by subclass');
  }

  /**
   * Save settings to storage
   * @param {Object} settings - Settings object to save
   * @returns {Promise<void>}
   */
  async save(settings) {
    throw new Error('Settings.save() must be implemented by subclass');
  }

  /**
   * Reset settings to defaults
   * @returns {Promise<void>}
   */
  async reset() {
    throw new Error('Settings.reset() must be implemented by subclass');
  }

  /**
   * Open-ended method to get settings object
   * 
   * @returns {Object} Current settings object
   */
  getSettings() {
    throw new Error('Settings.getSettings() must be implemented by subclass');
  }

  /**
   * get the default settings values
   */
  getDefaults() {
    throw new Error('Settings.getDefaults() must be implemented by subclass');
  } 
}

export default Settings;
