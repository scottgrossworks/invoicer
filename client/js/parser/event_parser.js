/**
 * EventParser - Base class for parsers that extract both client AND booking data
 * Used by: GmailParser, GCalParser
 * Provides shared extraction logic for event-based content (emails, calendar events)
 */

import { Parser } from './parser.js';

class EventParser extends Parser {

  constructor() {
    super();
    if (this.constructor === EventParser) {
      throw new Error("Abstract class 'EventParser' cannot be instantiated directly.");
    }
  }

  /**
   * Quick extraction of name and email only (for DB lookup before full parse)
   * Subclasses should override to provide fast identity extraction
   * @returns {Promise<Object|null>} {email, name} or null if cannot extract
   */
  async quickExtractIdentity() {
    // Default: return null (subclasses override)
    return null;
  }

  /**
   * Search for existing client in database
   * @param {string} email - Client email
   * @param {string} name - Client name
   * @returns {Promise<Object|null>} Client object from DB or null
   */
  async searchExistingClient(email, name) {
    try {
      if (!window.DB_LAYER || typeof window.DB_LAYER.searchClient !== 'function') {
        console.log('DB_LAYER not available for client search');
        return null;
      }

      const client = await window.DB_LAYER.searchClient(email, name);
      return client;

    } catch (error) {
      console.log('searchExistingClient error:', error.message);
      return null;
    }
  }

  /**
   * Extract client data from content
   * Must be implemented by subclass to handle source-specific DOM extraction
   * @returns {Array<Object>} Array of client objects [{name, email, phone, company, website, clientNotes}, ...]
   */
  async extractClientData() {
    throw new Error('extractClientData() must be implemented by subclass and return array');
  }

  /**
   * Extract booking data from content
   * Must be implemented by subclass to handle source-specific DOM extraction
   * @returns {Object} Booking data {title, description, location, dates, rates, etc.}
   */
  async extractBookingData() {
    throw new Error('extractBookingData() must be implemented by subclass');
  }

  /**
   * Template method - combines procedural + LLM extraction
   * Subclasses should call this or override with similar pattern
   *
   * NEW WORKFLOW:
   * 1. Quick extract identity (name/email)
   * 2. Search DB for existing client
   * 3. If found: use DB data, skip full parse
   * 4. If not found: continue with full procedural + LLM parse
   */
  async parse(state) {
    try {
      if (state) {
        if (state.Client) Object.assign(this.STATE.Client, state.Client);
        if (state.Booking) Object.assign(this.STATE.Booking, state.Booking);
        if (state.Config) Object.assign(this.STATE.Config, state.Config);
      }

      // Step 0: Quick identity extraction and DB lookup
      const identity = await this.quickExtractIdentity();

      if (identity && (identity.email || identity.name)) {
        console.log('Quick identity extracted:', identity);

        // Search DB for existing client
        const dbClient = await this.searchExistingClient(identity.email, identity.name);

        if (dbClient) {
          console.log('Client found in DB - using existing data');

          // Populate state with DB client data
          Object.assign(this.STATE.Client, {
            name: dbClient.name,
            email: dbClient.email,
            phone: dbClient.phone,
            company: dbClient.company,
            website: dbClient.website,
            clientNotes: dbClient.clientNotes
          });

          // Mark as from DB for visual indicators
          this.STATE.Client._fromDB = true;
          this.STATE.setClients([this.STATE.Client]);

          // Skip full parse - return early
          return this.STATE;
        } else {
          console.log('Client not found in DB - continuing with full parse');
        }
      }

      // Step 1: Procedural extraction (DOM-based)
      const clientsArray = await this.extractClientData(); // Returns array
      const bookingData = await this.extractBookingData();

      // Set primary client (first in array) and all clients
      if (clientsArray && clientsArray.length > 0) {
        Object.assign(this.STATE.Client, clientsArray[0]); // Primary client
        this.STATE.setClients(clientsArray); // All clients
      }

      // Populate booking data
      Object.assign(this.STATE.Booking, bookingData);

      // Step 2: LLM extraction (if available and content exists)
      const content = await this._getContentForLLM();
      if (content && content.trim()) {
        const llmResult = await this._sendToLLM(content);
        if (llmResult) {
          // Merge LLM results conservatively (fills nulls only)
          this._conservativeUpdate(llmResult);
        }
      }

      return this.STATE;

    } catch (error) {
      console.error(`${this.name} parse error:`, error);
      return this.STATE;
    }
  }

  /**
   * Get content to send to LLM
   * Subclasses must implement this to extract text content
   * @returns {string} Text content for LLM processing
   */
  async _getContentForLLM() {
    throw new Error('_getContentForLLM() must be implemented by subclass');
  }

  /**
   * Send content to LLM for extraction
   * Subclasses must implement this with their specific LLM configuration
   * @param {string} content - Text content to process
   * @returns {Object|null} Parsed LLM result with Client/Booking data
   */
  async _sendToLLM(content) {
    throw new Error('_sendToLLM() must be implemented by subclass');
  }

}

export { EventParser };
