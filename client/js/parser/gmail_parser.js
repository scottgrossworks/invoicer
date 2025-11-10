/**
 * GmailParser - Extracts booking/invoice data from Gmail threads using a robust, accessibility-driven approach.
 *
 * WORKFLOW:
 * 1. Precisely extract the primary sender's email/name using stable header selectors.
 * 2. Reliably expand the entire email thread by clicking "Show trimmed content" and then *waiting* for the DOM to update.
 * 3. Extract the full, combined text from every message in the thread using accessibility roles.
 * 4. Send the complete and accurate data to the LLM for processing.
 */
import { EventParser } from './event_parser.js';
import { PageUtils } from '../utils/Page_Utils.js';
import Client from '../db/Client.js';
import Booking from '../db/Booking.js';

// Global CONFIG variable
let CONFIG = null;

class GmailParser extends EventParser {

  constructor() {
    super();
    this.STATE = null;
    this.name = 'GmailParser';
  }

  async _initializeConfig() {
    if (CONFIG) return;
    try {
      const configResponse = await fetch(chrome.runtime.getURL('leedz_config.json'));
      if (!configResponse.ok) throw new Error(`Config file not found: ${configResponse.status}`);
      CONFIG = await configResponse.json();
      console.log('Gmail parser config loaded successfully');
    } catch (error) {
      console.error('FATAL: Unable to load leedz_config.json:', error);
      throw new Error('Gmail parser cannot initialize - config file missing or invalid');
    }
  }

  async checkPageMatch(url) {
    return (url || window.location.href).includes('mail.google.com');
  }

  async initialize(state) {
    this.STATE = state;
    this.STATE.clear();
  }

  /**
   * Quick extraction of name and email only (for DB lookup before full parse)
   * Overrides EventParser base method
   * @returns {Promise<Object|null>} {email, name} or null
   */
  async quickExtractIdentity() {
    const emailData = this._extractEmailAndName();
    if (emailData && (emailData.email || emailData.name)) {
      return emailData;
    }
    return null;
  }

  /**
   * Extract client data from Gmail header (email, name)
   * @returns {Array<Object>} Array with single client from sender
   */
  async extractClientData() {
    const emailData = this._extractEmailAndName();

    // Return array with single client (the sender)
    return [{
      email: emailData.email || null,
      name: emailData.name || null
    }];
  }

  /**
   * Extract booking data from Gmail
   * Gmail bookings are primarily extracted by LLM, not procedurally
   * @returns {Object} Booking data {source}
   */
  async extractBookingData() {
    // Cache thread content for LLM processing
    this._cachedThreadContent = await this._extractThreadContent();

    if (!this._cachedThreadContent?.trim()) {
      console.warn('No email content could be extracted. The email might be empty or selectors need updating.');
    }

    return {
      source: 'gmail'
    };
  }

  /**
   * Get content for LLM processing
   * @returns {string} Full email thread content
   */
  async _getContentForLLM() {
    return this._cachedThreadContent || '';
  }

  /**
   * Send content to LLM for extraction
   * Overrides EventParser to include emailData context
   * @param {string} content - Email thread content
   * @returns {Object|null} Parsed LLM result with Client/Booking data
   */
  async _sendToLLM(content) {
    try {
      await this._initializeConfig();
      const llmConfig = CONFIG.llm;
      if (!llmConfig?.baseUrl || !llmConfig?.endpoints?.completions) {
        throw new Error('Invalid LLM configuration');
      }

      // Build prompt with known client data from headers
      const emailData = {
        name: this.STATE.Client?.name,
        email: this.STATE.Client?.email
      };
      const prompt = this._buildLLMPrompt(emailData, content, CONFIG.gmailParser);

      const response = await this._sendLLMRequest(llmConfig, prompt);

      if (!response?.ok) {
        console.error('LLM request failed:', response?.error || 'Request failed');
        return null;
      }

      const contentArray = response.data?.content;
      const firstContent = contentArray?.[0];
      const textContent = firstContent?.text || firstContent;

      let parsedResult = textContent ? this._parseLLMResponse(textContent) : null;

      // Validate and correct dates (prevent past bookings)
      if (parsedResult) {
        parsedResult = PageUtils.validateAndCorrectDates(parsedResult);
      }

      return parsedResult;

    } catch (error) {
      console.error('LLM processing failed:', error);
      return null;
    }
  }

  /**
   * Override EventParser parse() to add post-processing
   */
  async parse(state) {
    // Call parent EventParser template method
    const result = await super.parse(state);

    // Post-processing: ensure clientId is set from name
    if (this.STATE.Client.name && !this.STATE.Booking.clientId) {
      this.STATE.Booking.clientId = this.STATE.Client.name;
    }

    // Auto-complete endDate if missing (same-day events)
    if (this.STATE.Booking.startDate && !this.STATE.Booking.endDate) {
      this.STATE.Booking.endDate = this.STATE.Booking.startDate;
    }

    // Calculate duration if dates are present
    if (this.STATE.Booking.startDate && this.STATE.Booking.endDate && !this.STATE.Booking.duration) {
      const duration = this._calculateDuration(this.STATE.Booking.startDate, this.STATE.Booking.endDate);
      if (duration) this.STATE.Booking.duration = duration;
    }

    // Calculate totalAmount from rates
    if (this.STATE.Booking.flatRate) {
      this.STATE.Booking.totalAmount = this.STATE.Booking.flatRate;
    } else if (this.STATE.Booking.hourlyRate && !this.STATE.Booking.totalAmount && this.STATE.Booking.duration) {
      const total = parseFloat(this.STATE.Booking.hourlyRate) * parseFloat(this.STATE.Booking.duration);
      this.STATE.Booking.totalAmount = total.toFixed(2);
    }

    return result;
  }

  /**
   * Normalize name from "Lastname, Firstname" format to "Firstname Lastname"
   * @param {string} name - Raw name from email header
   * @returns {string} Normalized name
   */
  _normalizeName(name) {
    if (!name) return name;

    const trimmed = name.trim();

    // Check for "Lastname, Firstname" pattern (comma with optional spaces)
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',').map(p => p.trim());

      // Only reverse if we have exactly 2 parts and both are non-empty
      if (parts.length === 2 && parts[0] && parts[1]) {
        return `${parts[1]} ${parts[0]}`;
      }
    }

    // Return original name if no comma or pattern doesn't match
    return trimmed;
  }

  /**
   *  Extracts sender using specific header element selectors to avoid grabbing emails from the body.
   */
  _extractEmailAndName() {
    try {
      // console.log("--- Starting Email/Name Extraction ---");
      // Find all elements that might contain sender info.
      const senderElements = document.querySelectorAll('.gD[email], .gD > span[email]');
      // console.log(`Found ${senderElements.length} sender elements with selector '.gD[email], .gD > span[email]'`);

      if (senderElements.length > 0) {
        // Log all found elements for debugging
        // senderElements.forEach((el, idx) => {
        //   console.log(`Element ${idx}:`, {
        //     email: el.getAttribute('email'),
        //     name: el.getAttribute('name'),
        //     textContent: el.textContent?.trim(),
        //     isInQuote: !!el.closest('.gmail_quote'),
        //     outerHTML: el.outerHTML.substring(0, 200)
        //   });
        // });

        // Find the one that is not inside a quote block, which indicates it's the primary sender.
        const primarySender = Array.from(senderElements).find(el => !el.closest('.gmail_quote'));
        if (primarySender) {
            const email = primarySender.getAttribute('email');
            const rawName = primarySender.getAttribute('name') || primarySender.textContent?.trim();
            const name = this._normalizeName(rawName);
            // console.log(`Primary sender found: name='${name}', email='${email}'`);
            return { email, name };
        } else {
          console.log("All sender elements were inside quote blocks");
        }
      }
      console.log("Could not find a primary sender element.");
      return { email: null, name: null };
    } catch (error) {
      console.error('Error extracting email/name:', error);
      return { email: null, name: null };
    }
  }



  /**
    * Extract the email content blob -- all of the collapsed articles concatenated
    */
  async _extractThreadContent() {
    try {

        const mainRegion = document.querySelector('[role="main"]');
        if (mainRegion) {
          const mainContent = mainRegion.textContent.trim();
          // console.log("EMAIL CONTENT:" + mainContent);
          return mainContent;
        
        } else {
          
          const articles = document.querySelectorAll('[role="article"]');
          const articleContent = Array.from(articles).map(a => a.textContent.trim()).join('\n\n');
          //  console.log("ARTICLES:" + articleContent);
          return articleContent;
        }

    } catch (error) {
        console.error('CRITICAL ERROR in _extractThreadContent:', error);
        return '';
    }
  }





  // _conservativeUpdate() is inherited from Parser base class
  // Note: Gmail procedurally extracts name/email first, so LLM won't overwrite them



  _buildLLMPrompt(emailData, threadContent, parserConfig) {
    const knownInfo = `Sender Name: ${emailData.name || 'N/A'}\nSender Email: ${emailData.email || 'N/A'}`;

    // Inject current date context for smart date parsing
    const now = new Date();
    const currentYear = now.getFullYear();
    const nextYear = currentYear + 1;
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

    let systemPrompt = parserConfig?.systemPrompt || 'Extract booking information from the following email thread and output JSON.';

    // Replace template variables with actual dates
    systemPrompt = systemPrompt
      .replace(/\{\{CURRENT_DATE\}\}/g, currentDate)
      .replace(/\{\{CURRENT_YEAR\}\}/g, currentYear)
      .replace(/\{\{NEXT_YEAR\}\}/g, nextYear);

    return `${systemPrompt}\n\n${knownInfo}\n\nEmail Thread Content:\n${threadContent}`;
  }



  /**
   * Send LLM request to configured endpoint
   * @param {*} llmConfig 
   * @param {*} prompt 
   * @returns 
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
          })
      } catch (error) {
        console.error('Exception sending message:', error);
        resolve(null);
      }
    });
  }

  // _parseLLMResponse() inherited from Parser base class
  // Transforms flat LLM JSON response into nested Client/Booking structure

}

export default GmailParser;