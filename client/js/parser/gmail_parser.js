/**
 * GmailParser - Extracts booking/invoice data from Gmail threads using a robust, accessibility-driven approach.
 *
 * WORKFLOW:
 * 1. Precisely extract the primary sender's email/name using stable header selectors.
 * 2. Reliably expand the entire email thread by clicking "Show trimmed content" and then *waiting* for the DOM to update.
 * 3. Extract the full, combined text from every message in the thread using accessibility roles.
 * 4. Send the complete and accurate data to the LLM for processing.
 */
import { PortalParser } from './parser.js';
import Client from '../db/Client.js';
import Booking from '../db/Booking.js';

// Global CONFIG variable
let CONFIG = null;

class GmailParser extends PortalParser {

  constructor() {
    super();
    this.STATE = null;
    this.name = 'GmailParser';
  }

  async _initializeConfig() {
    if (CONFIG) return;
    try {
      const configResponse = await fetch(chrome.runtime.getURL('invoicer_config.json'));
      if (!configResponse.ok) throw new Error(`Config file not found: ${configResponse.status}`);
      CONFIG = await configResponse.json();
      console.log('Gmail parser config loaded successfully');
    } catch (error) {
      console.error('FATAL: Unable to load invoicer_config.json:', error);
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

  async parse(state) {
    try {
      if (state) {
        if (state.Client) Object.assign(this.STATE.Client, state.Client);
        if (state.Booking) Object.assign(this.STATE.Booking, state.Booking);
        if (state.Config) Object.assign(this.STATE.Config, state.Config);
      }

      // NAME AND EMAIL
      const emailData = this._extractEmailAndName();
     
      // Set guaranteed fields after extraction
      if (emailData.email) this.STATE.Client.email = emailData.email;
      if (emailData.name) {
        this.STATE.Client.name = emailData.name;
        this.STATE.Booking.clientId = emailData.name;
      }
      this.STATE.Booking.source = 'gmail';



      // GET EMAIL BLOB
      const threadContent = await this._extractThreadContent();
      
      if (!threadContent?.trim()) {
        console.warn('No email content could be extracted. The email might be empty or selectors need updating.');
        return;
      }
      // console.log(`EXTRACTED EMAIL BLOB (${threadContent.length} chars):` + threadContent + "...");



      // SEND BLOB TO LLM
      const llmResult = await this._sendToLLM(emailData, threadContent);

      if (llmResult) {
        console.log('LLM processed successfully');
        this._conservativeUpdate(llmResult);
      } else {
        console.warn('LLM unavailable or returned no data - basic extraction only');
      }

      // DATA CHECKS

      // NAME AND EMAIL
      if (emailData.email && !this.STATE.Client.email) this.STATE.Client.email = emailData.email;
      if (emailData.name && !this.STATE.Client.name) {
        this.STATE.Client.name = emailData.name;
        this.STATE.Booking.clientId = emailData.name;
      }
      
      // START DATE AND END DATE
      if (this.STATE.Booking.startDate && !this.STATE.Booking.endDate) {
        this.STATE.Booking.endDate = this.STATE.Booking.startDate;
      }

      // START TIME AND END TIME
      if (this.STATE.Booking.startTime && this.STATE.Booking.endTime ) {
        const duration = this._calculateDuration(this.STATE.Booking.startTime, this.STATE.Booking.endTime);
        if (duration) this.STATE.Booking.duration = duration;
      }

      // RATE / TOTAL AMOUNT 
      if (this.STATE.Booking.flatRate) {
        this.STATE.Booking.totalAmount = this.STATE.Booking.flatRate;
      } else if (this.STATE.Booking.hourlyRate && !this.STATE.Booking.totalAmount && this.STATE.Booking.duration) {
        const total = parseFloat(this.STATE.Booking.hourlyRate) * parseFloat(this.STATE.Booking.duration);
        this.STATE.Booking.totalAmount = total.toFixed(2);
      }

    } catch (error) {
      console.error('Gmail parser failed:', error);
      this.STATE.Booking = this.STATE.Booking || {};
      this.STATE.Booking.source = 'gmail';
    }

    return this.STATE;
  }

  /**
   *  Extracts sender using specific header element selectors to avoid grabbing emails from the body.
   */
  _extractEmailAndName() {
    try {
      // console.log("--- Starting Email/Name Extraction ---");
      // Find all elements that might contain sender info.
      const senderElements = document.querySelectorAll('.gD[email], .gD > span[email]');
      if (senderElements.length > 0) {
        // Find the one that is not inside a quote block, which indicates it's the primary sender.
        const primarySender = Array.from(senderElements).find(el => !el.closest('.gmail_quote'));
        if (primarySender) {
            const email = primarySender.getAttribute('email');
            const name = primarySender.getAttribute('name') || primarySender.textContent?.trim();
            console.log(`Primary sender found: name='${name}', email='${email}'`);
            return { email, name };
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





  /**
   * Conservatively updates the state with new LLM results.
   * Only fills in fields that are currently empty or whitespace or null.
   * @param {*} llmResult 
   */
  _conservativeUpdate(llmResult) {
      const updateIfEmpty = (obj, prop, llmValue) => {
          // Only update if the current value is null, undefined, or an empty string
          if (llmValue && (obj[prop] === null || obj[prop] === undefined || String(obj[prop]).trim() === '')) {
              obj[prop] = llmValue;
          }
      };

      const updateAlways = (obj, prop, llmValue) => {
          // Always update if LLM provides a value
          if (llmValue !== null && llmValue !== undefined) {
              obj[prop] = llmValue;
          }
      };

      // Note: We don't update Client name/email from LLM as procedural extraction is more reliable.
      updateIfEmpty(this.STATE.Client, 'phone', this.sanitizePhone(llmResult.Client?.phone));
      updateIfEmpty(this.STATE.Client, 'company', llmResult.Client?.company);
      updateIfEmpty(this.STATE.Client, 'notes', llmResult.Client?.notes);

      // Booking fields - be more aggressive about updating from LLM data
      if (llmResult.Booking) {
        Object.keys(llmResult.Booking).forEach(key => {
            updateAlways(this.STATE.Booking, key, llmResult.Booking[key]);
        });
      }
  }
  

/**
 * Send the LLM request with the full email blob
 * @param {*} emailData 
 * @param {*} threadContent 
 * @returns 
 */
  async _sendToLLM(emailData, threadContent) {
    try {
      await this._initializeConfig();
      const llmConfig = CONFIG.llm;
      if (!llmConfig?.baseUrl || !llmConfig?.endpoints?.completions) {
        throw new Error('Invalid LLM configuration');
      }

      const prompt = this._buildLLMPrompt(emailData, threadContent, CONFIG.gmailParser);
      // console.log("PROMPT=" + prompt);

      const response = await this._sendLLMRequest(llmConfig, prompt);

      
      if (!response?.ok) {
        console.error('LLM request failed:', response?.error || 'Request failed');
        return null;
      }

      const contentArray = response.data?.content;
      const firstContent = contentArray?.[0];
      const textContent = firstContent?.text || firstContent;
      // console.log("Extracted LLM text content:", textContent);

      const parsedResult = textContent ? this._parseLLMResponse(textContent) : null;
      // console.log("Final parsed LLM result:", parsedResult);

      return parsedResult;

    } catch (error) {
      console.error('LLM processing failed:', error);
      return null;
    }
  }



  _buildLLMPrompt(emailData, threadContent, parserConfig) {
    const knownInfo = `Sender Name: ${emailData.name || 'N/A'}\nSender Email: ${emailData.email || 'N/A'}`;
    const systemPrompt = parserConfig?.systemPrompt || 'Extract booking information from the following email thread and output JSON.';

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

  _parseLLMResponse(content) {
    try {
      // console.log('_parseLLMResponse called with content:', content?.substring(0, 200));
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        // console.log('Matched JSON:', jsonMatch[0].substring(0, 200));
        const parsed = JSON.parse(jsonMatch[0]);
        // console.log('Parsed JSON:', parsed);

        // Map LLM fields to our structured state
        const mapped = {
          Client: {},
          Booking: {},
          Config: {}
        };

        const clientFields = Client.getFieldNames();
        const bookingFields = Booking.getFieldNames();

        // Map fields to appropriate sub-objects
        Object.entries(parsed).forEach(([field, value]) => {
          if (value === 'Not applicable' || value === 'Not specified') {
            value = null;
          }

          if (value !== undefined && value !== null) {
            if (clientFields.includes(field)) {
              mapped.Client[field] = value;
            } else if (bookingFields.includes(field)) {
              mapped.Booking[field] = value;
              // Convert numeric fields
              if (['hourlyRate', 'flatRate', 'totalAmount'].includes(field)) {
                mapped.Booking[field] = this.sanitizeCurrency(value);
              } else if (field === 'duration') {
                mapped.Booking[field] = parseFloat(value) || null;
              }
            }
          }
        });

        // Ensure clientId is set from Client.name
        if (mapped.Client.name) {
          mapped.Booking.clientId = mapped.Client.name;
        }

        console.log('Final mapped object:', mapped);
        return mapped;
      }
      return null;
    } catch (error) {
      console.warn('Failed to parse LLM JSON response');
      return null;
    }
  }

  _calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return null;
    try {
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        const [endHours, endMinutes] = endTime.split(':').map(Number);
        let startTotalMinutes = startHours * 60 + (startMinutes || 0);
        let endTotalMinutes = endHours * 60 + (endMinutes || 0);
        if (endTotalMinutes < startTotalMinutes) endTotalMinutes += 24 * 60; // Assumes overnight
        const durationMinutes = endTotalMinutes - startTotalMinutes;
        return parseFloat((durationMinutes / 60).toFixed(1));
    } catch {
        return null;
    }
  }
}

export default GmailParser;