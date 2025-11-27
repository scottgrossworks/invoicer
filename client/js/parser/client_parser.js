/**
 * ClientParser - Extracts multiple client contacts from portal/directory pages
 * Extends ProfileParser for pure LLM-based extraction from page content
 * Used for: School directories, organization contact pages, staff listings
 */

import { ProfileParser } from './profile_parser.js';

// Global CONFIG variable
let CONFIG = null;

class ClientParser extends ProfileParser {

  constructor() {
    super();
    this.STATE = null;
    this.name = 'ClientParser';
  }

  async _initializeConfig() {
    if (CONFIG) return;
    try {
      const configResponse = await fetch(chrome.runtime.getURL('leedz_config.json'));
      if (!configResponse.ok) throw new Error(`Config file not found: ${configResponse.status}`);
      CONFIG = await configResponse.json();
      console.log('Client parser config loaded successfully');
    } catch (error) {
      console.error('FATAL: Unable to load leedz_config.json:', error);
      throw new Error('Client parser cannot initialize - config file missing or invalid');
    }
  }

  /**
   * ClientParser matches ANY page EXCEPT specialized parser pages
   * Excludes Gmail and GCal so those parsers handle their own content
   */
  async checkPageMatch(url) {
    const testUrl = url || window.location.href;

    // Don't match pages that have specialized parsers
    if (testUrl.includes('mail.google.com')) return false; // GmailParser handles this
    if (testUrl.includes('calendar.google.com')) return false; // GCalParser handles this

    // Match everything else as fallback
    return true;
  }

  async initialize(state) {
    this.STATE = state;
    this.STATE.clear();
  }

  /**
   * Quick extraction of first email/name found on page (for DB lookup)
   * Scans page text for email addresses and nearby names
   * @returns {Promise<Object|null>} {email, name} or null
   */
  async quickExtractIdentity() {
    try {
      // Get page text
      const pageText = document.body.textContent || '';

      // Extract first email using regex
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
      const emailMatch = pageText.match(emailRegex);
      const email = emailMatch ? emailMatch[0] : null;

      // Try to find a name near the email
      let name = null;
      if (email) {
        // Get context around email (100 chars before and after)
        const emailIndex = pageText.indexOf(email);
        const contextStart = Math.max(0, emailIndex - 100);
        const contextEnd = Math.min(pageText.length, emailIndex + 100);
        const context = pageText.substring(contextStart, contextEnd);

        // Look for name pattern (2-3 capitalized words)
        const nameRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/;
        const nameMatch = context.match(nameRegex);
        name = nameMatch ? nameMatch[1] : null;
      }

      if (email || name) {
        console.log('ClientParser quick identity:', { email, name });
        return { email, name };
      }

      return null;
    } catch (error) {
      console.error('ClientParser quick identity extraction failed:', error);
      return null;
    }
  }

  /**
   * Extract client data from page content using LLM
   * @returns {Array<Object>} Array of clients extracted from page
   */
  async extractClientData() {
    // No procedural extraction - pure LLM
    // Return empty array; LLM will populate via _sendToLLM
    return [];
  }

  /**
   * Get content for LLM processing
   * Extracts all visible text from the page
   * @returns {string} Page text content
   */
  async _getContentForLLM() {
    try {
      // Get main content area or fallback to body
      const mainContent = document.querySelector('main') ||
                         document.querySelector('[role="main"]') ||
                         document.body;

      const text = mainContent.textContent || '';

      // Limit to maxThreadLength if configured
      const maxLength = CONFIG?.clientParser?.maxThreadLength || 10000;
      return text.substring(0, maxLength).trim();

    } catch (error) {
      console.error('Error extracting page content:', error);
      return '';
    }
  }

  /**
   * Send content to LLM for client extraction
   * Overrides ProfileParser to handle ARRAY response from LLM
   * @param {string} content - Page text content
   * @returns {Object|null} {Clients: [...]} or null
   */
  async _sendToLLM(content) {
    try {
      await this._initializeConfig();
      const llmConfig = CONFIG.llm;
      if (!llmConfig?.baseUrl || !llmConfig?.endpoints?.completions) {
        throw new Error('Invalid LLM configuration');
      }

      const prompt = this._buildLLMPrompt(content);
      const response = await this._sendLLMRequest(llmConfig, prompt);

      if (!response?.ok) {
        console.error('LLM request failed:', response?.error || 'Request failed');
        return null;
      }

      const contentArray = response.data?.content;
      const firstContent = contentArray?.[0];
      const textContent = firstContent?.text || firstContent;

      // Parse LLM response - expecting array of clients
      const parsedResult = textContent ? this._parseClientArrayResponse(textContent) : null;

      return parsedResult;

    } catch (error) {
      console.error('LLM processing failed:', error);
      return null;
    }
  }

  /**
   * Parse LLM response expecting array of clients
   * @param {string} content - Raw LLM response
   * @returns {Object|null} {Clients: [...]} or null
   */
  _parseClientArrayResponse(content) {
    try {
      // Remove markdown code blocks
      let jsonText = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '');

      // Extract JSON array
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const clientsArray = JSON.parse(jsonMatch[0]);

        if (Array.isArray(clientsArray) && clientsArray.length > 0) {
          return { Clients: clientsArray };
        }
      }

      console.warn('No client array found in LLM response');
      return null;
    } catch (error) {
      console.error('Failed to parse LLM client array response:', error);
      console.error('Raw content was:', content);
      return null;
    }
  }

  /**
   * Build LLM prompt for client extraction
   * @param {string} content - Page text content
   * @returns {string} Complete prompt
   */
  _buildLLMPrompt(content) {
    const systemPrompt = CONFIG.clientParser?.systemPrompt ||
      'Extract client contact information from the following page content. Return a JSON array of client objects.';

    return `${systemPrompt}\n\nPage Content:\n${content}`;
  }

  /**
   * Send LLM request to configured endpoint
   * @param {Object} llmConfig - LLM configuration
   * @param {string} prompt - Complete prompt
   * @returns {Promise<Object>} Response object
   */
  async _sendLLMRequest(llmConfig, prompt) {
    const llmRequest = {
      url: `${llmConfig.baseUrl}${llmConfig.endpoints.completions}`,
      method: 'POST',
      headers: {
        'x-api-key': llmConfig['api-key'],
        'anthropic-version': llmConfig['anthropic-version'],
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: {
        model: llmConfig.provider,
        max_tokens: llmConfig.max_tokens,
        messages: [{ role: 'user', content: prompt }]
      }
    };

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'leedz_llm_request', request: llmRequest },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('Chrome runtime error:', chrome.runtime.lastError.message);
              resolve(null);
            } else {
              resolve(response);
            }
          }
        );
      } catch (error) {
        console.error('Exception sending message:', error);
        resolve(null);
      }
    });
  }

  /**
   * Override ProfileParser.parse() to handle LLM client array response
   */
  async parse(state) {
    try {
      if (state) {
        if (state.Client) Object.assign(this.STATE.Client, state.Client);
        if (state.Config) Object.assign(this.STATE.Config, state.Config);
      }

      // Step 1: Procedural extraction (none for ClientParser)
      let clientsArray = await this.extractClientData(); // Returns []

      // Step 2: LLM extraction (PRIMARY method for ClientParser)
      const content = await this._getContentForLLM();
      if (content && content.trim()) {
        const llmResult = await this._sendToLLM(content);

        if (llmResult && llmResult.Clients && Array.isArray(llmResult.Clients)) {
          clientsArray = llmResult.Clients;
        }
      }

      // Set primary client (first in array) and all clients
      if (clientsArray && clientsArray.length > 0) {
        Object.assign(this.STATE.Client, clientsArray[0]); // Primary client
        this.STATE.setClients(clientsArray); // All clients
      }

      return this.STATE;

    } catch (error) {
      console.error('Client parser error:', error);
      return this.STATE;
    }
  }

  async waitUntilReady() {
    // No specific wait needed for generic pages
    return true;
  }
}

export default ClientParser;
