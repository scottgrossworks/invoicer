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
    this.Clients = [];  // Array is primary storage for clients
    this.Booking = {};
    this.Config = {};
    this.storageKey = 'currentBookingState';
    this.status = 'new';

    // Load existing state from Chrome storage
    if (loadData) this.load();
  }

  /**
   * Backward compatibility getter - returns first client
   * Invoicer and parsers use state.Client (singular)
   */
  get Client() {
    if (this.Clients.length === 0) {
      this.Clients[0] = {};  // Initialize if empty
    }
    return this.Clients[0];
  }

  /**
   * Backward compatibility setter - sets first client
   * Invoicer and parsers write to state.Client
   */
  set Client(data) {
    this.Clients[0] = data;
  }

  /**
   * Get all clients
   */
  getClients() {
    return this.Clients;
  }

  /**
   * Set all clients at once
   */
  setClients(clientsArray) {
    this.Clients = clientsArray || [];
  }

  /**
   * Add a client to the array
   */
  addClient(clientData) {
    this.Clients.push(clientData);
  }

  /**
   * Clear all clients
   */
  clearClients() {
    this.Clients = [];
  }



  /**
   * Get a value by key
   * @param {string} key - The key to retrieve
   * @returns {*} The value or null if not found
   */
  clear() {
    this.Clients = [];
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
      Client: this.Clients[0] || {},  // Backward compatibility - first client
      Clients: [...this.Clients],     // Array of clients
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

    // Support both new format (Clients array) and legacy format (Client object)
    if (obj.Clients && Array.isArray(obj.Clients)) {
      // New format - array of clients
      this.Clients = [...obj.Clients];
    } else if (obj.Client && Object.keys(obj.Client).length > 0) {
      // Legacy format - single client object
      this.Clients = [obj.Client];
    }

    Object.assign(this.Booking, obj.Booking || {});
    Object.assign(this.Config, obj.Config || {});

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
      console.log("No DB layer configured - data saved to local storage only");
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
   * Does NOT load Config from DB - that should only happen in Invoicer page
   */
  async load() {

    await this.loadLocal();
    this.status = 'loaded';
  }


  /**
   * Load Config data from DB
   * Only called by Invoicer page when it needs Config data for PDF generation
   * If Config not found, let the caller assign its own defaults
   */
  async loadConfigFromDB() {

    // If no Config data found load from DB
    if ( !this.Config || !this.Config.companyName ) {

      const dbLayer = await getDbLayer();
      if (!dbLayer) {
        console.log("No DB Layer configured - Config will not be loaded from database");
        return;
      }

      const dbConfig = await dbLayer.load();
      if (dbConfig) {
        Object.assign(this.Config, dbConfig);
        console.log("Config loaded from database");
        // CONFIG LOADED - DO NOT SAVE YET
        // Save will happen after parser completes and populates Client/Booking data

      } else {
        console.log("No Config found in DB - using default or existing Config");
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
        const data = result[this.storageKey];

        // Support both new format (Clients array) and legacy format (Client object)
        if (data.Clients && Array.isArray(data.Clients)) {
          this.Clients = [...data.Clients];
        } else if (data.Client && Object.keys(data.Client).length > 0) {
          this.Clients = [data.Client];
        }

        Object.assign(this.Booking, data.Booking || {});
        Object.assign(this.Config, data.Config || {});
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
  // console.log('=== MERGE PAGE DATA ===');
  // console.log('Incoming parsedData.Client:', parsedData.Client);
  // console.log('Current state.Client before merge:', state.Client);

  // Handle hierarchical structure from parser
  if (parsedData.Client) {
    Object.entries(parsedData.Client).forEach(([key, value]) => {
      const currentValue = state.Client[key];
      const shouldUpdate = value !== null && value !== undefined && !currentValue;
      // console.log(`Client.${key}: value="${value}", current="${currentValue}", updating=${shouldUpdate}`);
      if (shouldUpdate) {
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

  // console.log('State.Client after merge:', state.Client);
}


