/**
 * EventParser - Base class for parsers that extract both client AND booking data
 * Used by: GmailParser, GCalParser
 * Provides shared extraction logic for event-based content (emails, calendar events)
 */

import { Parser } from './parser.js';
import { filterClientsAgainstBusinessIdentity } from '../utils/IdentityFilter.js';

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
   * Called by content script via leedz_extract_identity message
   * @returns {Promise<Object|null>} {email, name} or null if cannot extract
   */
  async quickExtractIdentity() {
    // Default: return null (subclasses override)
    return null;
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
   * NEW WORKFLOW (DB search moved to Page.js in sidebar context):
   * 1. Procedural extraction (DOM-based)
   * 2. LLM extraction (fills in missing fields)
   *
   * DB search happens in Page.reloadParser() before calling this method
   */
  async parse(state) {
    try {
      if (state) {
        if (state.Client) Object.assign(this.STATE.Client, state.Client);
        if (state.Booking) Object.assign(this.STATE.Booking, state.Booking);
        if (state.Config) Object.assign(this.STATE.Config, state.Config);
      }

      // Step 1: Procedural extraction (DOM-based)
      const clientsArray = await this.extractClientData(); // Returns array
      const bookingData = await this.extractBookingData();

      // Filter the seller's own identity out before setting the primary client (U9).
      // Sourced from runtime BusinessIdentity (VALUE_PROP), which rides the state payload.
      const businessIdentity = this.STATE.BusinessIdentity || (state && state.BusinessIdentity);
      const filteredClients = filterClientsAgainstBusinessIdentity(clientsArray, businessIdentity);

      // Set primary client (first in array) and all clients
      if (filteredClients && filteredClients.length > 0) {
        Object.assign(this.STATE.Client, filteredClients[0]); // Primary client
        this.STATE.setClients(filteredClients); // All clients
      } else if (clientsArray && clientsArray.length > 0) {
        // Every candidate matched the seller - keep clients empty rather than
        // mislabel the seller as the client (Bug A).
        this.STATE.setClients([]);
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
