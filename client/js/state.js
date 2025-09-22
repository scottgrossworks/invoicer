/**
 * state.js - Simple state management for invoice data
 * Directly exposes Client/Booking/Config objects with storage persistence
 * 
 * 
 * Bring the DB layer into the state object -- use to save not only to 
 * chrome storage but also to a DB layer if configured
 */

import { getDbLayer } from './provider_registry.js';



class State {
  constructor( loadData ) {
    this.Client = {};
    this.Booking = {};
    this.Config = {};
    this.storageKey = 'currentBookingState';
    this.status = 'new';

    // Load existing state from Chrome storage
    if (loadData) this.load();
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

    this.status = 'clear';
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

    this.clear();
    
    // if (obj.Client || obj.Booking || obj.Config) {
      // Hierarchical format
      Object.assign(this.Client, obj.Client || {});
      Object.assign(this.Booking, obj.Booking || {});
      Object.assign(this.Config, obj.Config || {});
      
      /*
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
    */

  }



  /**
   * Save to Database layer if configured, else to local storage
   */
  async save() {

    // Auto-set endDate to match startDate if endDate is empty (same-day event default)
    if (this.Booking.startDate && (!this.Booking.endDate || this.Booking.endDate.trim() === '')) {
      this.Booking.endDate = this.Booking.startDate;
      console.log('State.save: Auto-set endDate to match startDate:', this.Booking.startDate);
    }

    try {
      this.saveLocal();
    } catch (error) {
      console.warn('Failed to save state locally:', error);
    }

    // now try DB
    const dbLayer = await getDbLayer();
    if (!dbLayer) {
      this.status='local';
      console.warn("No DB layer configured, Cannot save");
      // No DB layer configured, skip DB save
      return;
    }
    // save the state to the DB layer
    // may include Client, Booking and Config data
    await dbLayer.save(this);
    this.status = 'saved';
  }



  /**
   * Load STATE from chrome storage - that will be most recent copy
   * If Config not found, load from DB
   * if there's nothing in the DB, let the caller assign its own defaults
   */
  async load() {

    await this.loadLocal();
    this.status = 'local';

    // If no Config data found load from DB
    if ( !this.Config || !this.Config.companyName ) {
      
      const dbLayer = await getDbLayer();
      if (!dbLayer) {
        console.warn("No DB Layer configured");
        return;
      }

      const dbConfig = await dbLayer.load();
      if (dbConfig) {
        Object.assign(this.Config, dbConfig);
        
        
        // CONFIG LOADED - DO NOT SAVE YET
        // Save will happen after parser completes and populates Client/Booking data

      } else {
        console.warn("No Config found in DB");
        return;
      }
    }

    // SUCCESS
    this.status = 'loaded';
  }





  /**
   * Save state to Chrome storage
   */
  async saveLocal() {
    try {
      const data = this.toObject();
      await chrome.storage.local.set({ [this.storageKey]: data });
    } catch (error) {
      console.warn('Failed to save state to storage:', error);
    }
    this.status='saved';
  }


  /**
   * Load state from Chrome storage
   */
  async loadLocal() {
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
    this.status = 'loaded';
  }

}

/**
 * State Factory - creates new state instances
 */
export class StateFactory {
  static async create() {
    const state = new State( true );
    return state;
  }

  // used by content.js to create an instance for the parser without
  // re-loading everything
  static async create_blank() {
    const state = new State( false );
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


