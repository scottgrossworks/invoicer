/**
 * ProfileParser - Base class for parsers that extract ONLY client data (no bookings)
 * Used by: LinkedInParser, TwitterParser, etc.
 * Provides shared extraction logic for profile-based content
 */

import { Parser } from './parser.js';

class ProfileParser extends Parser {

  constructor() {
    super();
    if (this.constructor === ProfileParser) {
      throw new Error("Abstract class 'ProfileParser' cannot be instantiated directly.");
    }
  }

  /**
   * Extract client data from profile page
   * Must be implemented by subclass to handle source-specific DOM extraction
   * @returns {Array<Object>} Array of client objects [{name, email, phone, company, website, clientNotes}, ...]
   */
  async extractClientData() {
    throw new Error('extractClientData() must be implemented by subclass and return array');
  }

  /**
   * Profile parsers don't extract booking data
   * @returns {null}
   */
  async extractBookingData() {
    return null;
  }

  /**
   * Template method - combines procedural + LLM extraction (client only)
   * Subclasses should call this or override with similar pattern
   */
  async parse(state) {
    try {
      if (state) {
        if (state.Client) Object.assign(this.STATE.Client, state.Client);
        if (state.Config) Object.assign(this.STATE.Config, state.Config);
      }

      // Step 1: Procedural extraction (DOM-based)
      const clientsArray = await this.extractClientData(); // Returns array

      // Set primary client (first in array) and all clients
      if (clientsArray && clientsArray.length > 0) {
        Object.assign(this.STATE.Client, clientsArray[0]); // Primary client
        this.STATE.setClients(clientsArray); // All clients
      }

      // Step 2: LLM extraction (if available and content exists)
      const content = await this._getContentForLLM();
      if (content && content.trim()) {
        const llmResult = await this._sendToLLM(content);
        if (llmResult && llmResult.Client) {
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
   * @returns {Object|null} Parsed LLM result with Client data
   */
  async _sendToLLM(content) {
    throw new Error('_sendToLLM() must be implemented by subclass');
  }

}

export { ProfileParser };
