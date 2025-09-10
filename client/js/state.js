/**
 * state.js - Simple state management for invoice data
 * Directly exposes Client/Booking/Config objects with storage persistence
 */

class State {
  constructor() {
    this.Client = {};
    this.Booking = {};
    this.Config = {};
    this.storageKey = 'currentBookingState';
    this.autoSave = true;

    // Load existing state from Chrome storage
    this.load();
  }



  /**
   * Get a value by key
   * @param {string} key - The key to retrieve
   * @returns {*} The value or null if not found
   */
  clear() {
    this.Client = {};
    this.Booking = {};
    // DO NOT CLEAR CONFIG DATA 
    // this.Config = {};
    if (this.autoSave) {
      this.save();
    }
  }

  /**
   * Get all data as plain object
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      Client: { ...this.Client },
      Booking: { ...this.Booking },
      Config: { ...this.Config }
    };
  }

  /**
   * Load data from plain object
   * @param {Object} obj - Object to load from
   */
  fromObject(obj) {
    this.autoSave = false;
    this.clear();
    
    if (obj.Client || obj.Booking || obj.Config) {
      // Hierarchical format
      Object.assign(this.Client, obj.Client || {});
      Object.assign(this.Booking, obj.Booking || {});
      Object.assign(this.Config, obj.Config || {});
    } else {
      // Legacy flat format - categorize fields
      Object.entries(obj).forEach(([key, value]) => {
        if (['name', 'email', 'phone', 'company', 'notes'].includes(key)) {
          this.Client[key] = value;
          // Sync client name to bookingId
          if (key === 'name') {
            this.Booking.clientId = value;
          }
        } else if (['description', 'location', 'startDate', 'endDate', 'startTime', 'endTime', 'duration', 'hourlyRate', 'flatRate', 'totalAmount', 'status', 'source'].includes(key)) {
          this.Booking[key] = value;
        } else if (['companyName', 'companyAddress', 'companyPhone', 'companyEmail', 'logoUrl', 
                   'bankName', 'bankAddress', 'bankPhone', 'bankAccount', 'bankRouting', 'bankWire',
                   'servicesPerformed', 'contactHandle', 'includeTerms', 'terms'].includes(key)) {
          this.Config[key] = value;
        }
      });
    }
    
    this.autoSave = true;
    this.save();
  }

  /**
   * Save state to Chrome storage
   */
  async save() {
    try {
      const data = this.toObject();
      await chrome.storage.local.set({ [this.storageKey]: data });
    } catch (error) {
      console.warn('Failed to save state to storage:', error);
    }
  }

  /**
   * Load state from Chrome storage
   */
  async load() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      if (result[this.storageKey]) {
        const { Client, Booking, Config } = result[this.storageKey];
        Object.assign(this.Client, Client || {});
        Object.assign(this.Booking, Booking || {});
        Object.assign(this.Config, Config || {});
      }
    } catch (error) {
      console.warn('Failed to load state from storage:', error);
    }
  }
}

/**
 * State Factory - creates new state instances
 */
export class StateFactory {
  static async create() {
    const state = new State();
    return state;
  }
}

/**
 * Helper functions for state management
 */

/**
 * Clear state data
 * @param {State} state - State instance to clear
 */
export function clearState(state) {
  state.clear();
}

/**
 * Copy record data into state
 * @param {State} state - State instance to update
 * @param {Object} record - Database record object
 */
export function copyFromRecord(state, record) {
  state.fromObject(record);
}

/**
 * Merge parsed data into state without overwriting existing values
 * @param {State} state - State instance to update
 * @param {Object} parsedData - Data parsed from webpage
 */
export function mergePageData(state, parsedData) {
  // Handle hierarchical structure from parser
  if (parsedData.Client) {
    Object.entries(parsedData.Client).forEach(([key, value]) => {
      if (value !== null && value !== undefined && !state.Client[key]) {
        state.Client[key] = value;
        if (key === 'name') {
          state.Booking.clientId = value;
        }
      }
    });
  }
  
  if (parsedData.Booking) {
    Object.entries(parsedData.Booking).forEach(([key, value]) => {
      if (value !== null && value !== undefined && !state.Booking[key]) {
        state.Booking[key] = value;
      }
    });
  }
  
  if (parsedData.Config) {
    Object.entries(parsedData.Config).forEach(([key, value]) => {
      if (value !== null && value !== undefined && !state.Config[key]) {
        state.Config[key] = value;
      }
    });
  }
}

/**
 * Validate state data against schema
 * @returns {Object} Validation result with isValid and errors
 */
export function validateState(state) {
  const errors = [];
  const data = state.toObject();

  // Required Client fields
  if (!data.Client?.name) {
    errors.push('Client name is required');
  }

  // Required Booking fields
  if (!data.Booking?.clientId) {
    errors.push('Booking clientId is required');
  }

  // Numeric field validations
  if (data.Booking?.hourlyRate && isNaN(parseFloat(data.Booking.hourlyRate))) {
    errors.push('Hourly rate must be a number');
  }
  if (data.Booking?.flatRate && isNaN(parseFloat(data.Booking.flatRate))) {
    errors.push('Flat rate must be a number');
  }
  if (data.Booking?.duration && isNaN(parseFloat(data.Booking.duration))) {
    errors.push('Duration must be a number');
  }

  // Date validations
  if (data.Booking?.startDate && data.Booking?.endDate) {
    const start = new Date(data.Booking.startDate);
    const end = new Date(data.Booking.endDate);
    if (start > end) {
      errors.push('Start date cannot be after end date');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}