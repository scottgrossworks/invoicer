/**
 * state.js - Simple state management for invoice data
 * Directly exposes Client/Booking/Config objects with storage persistence
 *
 *
 * Bring the DB layer into the state object -- use to save not only to
 * chrome storage but also to a DB layer if configured
 */

import { getDbLayer } from './provider_registry.js';
import { DateTimeUtils } from './utils/DateTimeUtils.js';



class State {
  constructor( loadData ) {
    this.Clients = [];  // Array is primary storage for clients
    // Index of the client that OWNS the one Booking (carousel attachment).
    // Exactly one owner at all times; the Booker checkbox transfers it.
    this.bookingOwnerIndex = 0;
    this.Booking = {};
    this.Config = {};
    this.Square = {};  // Square OAuth configuration from leedz_config.json
    // Runtime-only business identity from DOCS/VALUE_PROP.md (see ValuePropLoader).
    // NEVER persisted to chrome storage / SQLite / Config (plan KTD1/R2). It rides the
    // toObject() message payload so content-script parsers can read it (KTD12).
    this.BusinessIdentity = null;
    this.storageKey = 'currentBookingState';
    this.status = 'new';

    // Load existing state from Chrome storage
    if (loadData) this.load();
  }

  /**
   * Backward compatibility getter - returns the booking OWNER
   * Booker, parsers, PDF, Calendar, Save all use state.Client (singular);
   * following bookingOwnerIndex here means they all track the checkbox
   * owner automatically with zero changes at the call sites.
   */
  get Client() {
    if (this.Clients.length === 0) {
      this.Clients[0] = {};  // Initialize if empty
    }
    if (this.bookingOwnerIndex >= this.Clients.length) {
      this.bookingOwnerIndex = 0;  // Clamp stale index
    }
    return this.Clients[this.bookingOwnerIndex];
  }

  /**
   * Backward compatibility setter - sets the booking OWNER
   * Booker and parsers write to state.Client
   */
  set Client(data) {
    if (this.bookingOwnerIndex >= this.Clients.length) {
      this.bookingOwnerIndex = 0;
    }
    this.Clients[this.bookingOwnerIndex] = data;
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
    this.bookingOwnerIndex = 0;
    this.Booking = {};
    // DO NOT CLEAR CONFIG DATA
    // this.Config = {};
    // DO NOT CLEAR BusinessIdentity - it is runtime identity loaded once at startup.
    // fromObject() restores it only when the incoming payload carries it.

    this.status = 'clear';
  }

  /**
   * Single "identity not usable" predicate for consumers (Share, Write).
   * Non-blocking warnings (e.g. tradeUnverified) do NOT make identity blocked.
   * @returns {boolean} true when identity is missing or carries blocking errors
   */
  isIdentityBlocked() {
    const bi = this.BusinessIdentity;
    if (!bi) return true;
    if (Array.isArray(bi.errors) && bi.errors.length > 0) return true;
    return bi.loadedAt == null;
  }

  /**
   * Get all data as plain object
   * @returns {Object} Plain object representation
   */
  toObject() {
    // Strip _fromDB flag from clients (transient, should not persist)
    const cleanClients = this.Clients.map(c => {
      if (!c) return c;
      const { _fromDB, ...cleanClient } = c;
      return cleanClient;
    });

    return {
      Client: cleanClients[this.bookingOwnerIndex] || cleanClients[0] || {},  // Backward compatibility - booking owner
      Clients: cleanClients,           // Array of clients
      bookingOwnerIndex: this.bookingOwnerIndex,
      Booking: { ...this.Booking },
      Config: { ...this.Config },
      // Included so the content-script parsers receive runtime identity via the
      // message payload (KTD12). Stripped from durable persistence by toPersistedObject().
      BusinessIdentity: this.BusinessIdentity ? { ...this.BusinessIdentity } : null
    };
  }

  /**
   * Durable-persistence shape: toObject() minus runtime identity (R2 - identity is
   * never written to currentBookingState). Used by saveLocal().
   * @returns {Object}
   */
  toPersistedObject() {
    const data = this.toObject();
    delete data.BusinessIdentity;
    return data;
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
      // Strip _fromDB flag (transient, should not persist)
      this.Clients = obj.Clients.map(c => {
        const { _fromDB, ...cleanClient } = c;
        return cleanClient;
      });
    } else if (obj.Client && Object.keys(obj.Client).length > 0) {
      // Legacy format - single client object
      // Strip _fromDB flag
      const { _fromDB, ...cleanClient } = obj.Client;
      this.Clients = [cleanClient];
    }

    // Restore booking owner (clamped; clear() above reset it to 0)
    if (Number.isInteger(obj.bookingOwnerIndex) && obj.bookingOwnerIndex >= 0 &&
        obj.bookingOwnerIndex < this.Clients.length) {
      this.bookingOwnerIndex = obj.bookingOwnerIndex;
    }

    Object.assign(this.Booking, obj.Booking || {});
    Object.assign(this.Config, obj.Config || {});

    // Restore runtime identity only when the payload carries it (e.g. content-script
    // message). DB records and local storage never carry it, so existing identity is
    // preserved (clear() above does not wipe it).
    if (obj.BusinessIdentity) {
      this.BusinessIdentity = obj.BusinessIdentity;
    }

  }



  /**
   * Save to Database layer if configured, else to local storage
   */
  async save() {

    // Auto-set endDate to match startDate if endDate is empty (same-day event default)
    if (this.Booking.startDate && (!this.Booking.endDate || this.Booking.endDate.trim() === '')) {
      this.Booking.endDate = this.Booking.startDate;
      // console.log('State.save: Auto-set endDate to match startDate:', this.Booking.startDate);
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
   * Does NOT load Config from DB - that should only happen in Booker page
   */
  async load() {

    await this.loadLocal();
    this.status = 'loaded';
  }


  /**
   * Load Config data from DB
   * Only called by Booker page when it needs Config data for PDF generation
   * If Config not found, let the caller assign its own defaults
   */
  async loadConfigFromDB() {


    // If no Config data found load from DB
    if ( !this.Config || !this.Config.companyName ) {
      // console.log('Config needs to be loaded from DB');

      const dbLayer = await getDbLayer();

      if (!dbLayer) {
        console.log("No DB Layer configured - Config will not be loaded from database");
        return;
      }

      // console.log('Calling dbLayer.load()...');
      const dbConfig = await dbLayer.load();

      if (dbConfig) {
        Object.assign(this.Config, dbConfig);
        console.log("Config loaded from database successfully");

      } else {
        // SCHEMA unification (2026-07-22): dbLayer.load() returning null is the
        // NORMAL case now — the server intentionally has no Config table, and
        // business identity comes from VALUE_PROP.md at runtime. This branch is
        // NOT a server-down signal (load() already logged the /health result).
        // The old "WARNING: leedz_server is not running" here was a false alarm.
        console.log("No DB-backed Config (by design) - identity comes from VALUE_PROP.md");
        return;
      }
    } else {
      // console.log('Config already loaded, skipping DB load');
    }

    // SUCCESS
    this.status = 'loaded';
  }

  /**
   * Last-resort name deduction: a client with an email but no name gets the
   * email local-part as name ("kimberly@kgeventagency.com" -> "kimberly").
   * Kills the name-NOT-NULL save failure without ever blocking a save.
   * Called by Booker before save and render.
   */
  applyNameFallbacks() {
    this.Clients.forEach(c => {
      if (c && (!c.name || !String(c.name).trim()) && c.email) {
        c.name = String(c.email).split('@')[0];
      }
    });
  }

  /**
   * Calculate duration from startTime/endTime and update Booking.duration
   * Business logic: duration calculation belongs to state, not UI
   * @returns {boolean} True if duration was calculated and updated, false otherwise
   */
  calculateDuration() {
    const { startTime, endTime } = this.Booking;

    if (!startTime || !endTime) return false;

    const duration = DateTimeUtils.calculateDuration(startTime, endTime);

    if (duration !== null && duration !== undefined) {
      this.Booking.duration = duration;
      // console.log('State: Duration calculated and updated:', duration);
      return true;
    }

    return false;
  }





  /**
   * Save state to Chrome storage
   */
  async saveLocal() {
    try {
      const data = this.toPersistedObject();  // excludes runtime BusinessIdentity (R2)
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

        // Restore booking owner (clamped)
        if (Number.isInteger(data.bookingOwnerIndex) && data.bookingOwnerIndex >= 0 &&
            data.bookingOwnerIndex < this.Clients.length) {
          this.bookingOwnerIndex = data.bookingOwnerIndex;
        } else {
          this.bookingOwnerIndex = 0;
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
  static async create(leedzConfig = null) {
    const state = new State( false );  // Don't auto-load in constructor
    await state.load();  // Wait for load to complete

    // Load Square config from leedz_config.json if provided
    if (leedzConfig?.square) {
      state.Square = {
        url: leedzConfig.square.url || 'https://connect.squareup.com',
        appId: leedzConfig.square.appId || ''
      };
    }

    // Load AWS config from leedz_config.json if provided
    // CRITICAL: This is needed for Share page to call AWS addLeed API
    if (leedzConfig?.aws) {
      if (!state.Config) state.Config = {};
      state.Config.aws = {
        apiGatewayUrl: leedzConfig.aws.apiGatewayUrl || ''
      };
    }

    /*
    console.log('StateFactory.create() - State loaded:', {
      hasClient: !!(state.Client?.name || state.Client?.email),
      clientName: state.Client?.name,
      clientEmail: state.Client?.email,
      hasBooking: !!(state.Booking?.title || state.Booking?.location),
      bookingTitle: state.Booking?.title
    });
    */
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

  // Multi-client capture: adopt parsed clients past the primary so the Booker
  // carousel can page through everyone found. Dedup by email; owner unchanged.
  if (Array.isArray(parsedData.Clients) && parsedData.Clients.length > 1) {
    const seen = new Set(
      state.Clients.map(c => (c?.email || '').toLowerCase()).filter(Boolean)
    );
    parsedData.Clients.slice(1).forEach(c => {
      if (!c) return;
      const em = (c.email || '').toLowerCase();
      if (em && seen.has(em)) return;
      if (em) seen.add(em);
      state.Clients.push({ ...c });
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


