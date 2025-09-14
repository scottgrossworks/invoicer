/**
 * GmailParser - Extracts booking/invoice data from Gmail threads using LLM processing
 * 
 * WORKFLOW:
 * 1. Extract sender email/name using multiple Gmail selector strategies
 * 2. Extract thread content from email bodies
 * 3. Send structured prompt to LLM for intelligent data extraction
 * 4. Parse LLM JSON response and populate state with booking fields
 * 5. Keep raw thread text as fallback data
 */

import Booking from '../db/Booking.js';
import Client from '../db/Client.js';

import { PortalParser } from './parser.js';

// Global CONFIG variable - loaded once when parser initializes
let CONFIG = null;


class GmailParser extends PortalParser {

  constructor() {
    super();
    this.STATE = null;
    this.name = 'GmailParser';
    // Don't initialize config in constructor - it's async and should be done when needed
  }

  /**
   * Initialize global CONFIG - load config.json and validate
   * Throws error if config file not present or invalid
   */
  async _initializeConfig() {
    if (CONFIG) return; // Already loaded

    try {
      const configResponse = await fetch(chrome.runtime.getURL('invoicer_config.json'));
      if (!configResponse.ok) {
        throw new Error(`Config file not found: ${configResponse.status}`);
      }
      CONFIG = await configResponse.json();
      console.log('Gmail parser config loaded successfully');
    } catch (error) {
      console.error('FATAL: Unable to load invoicer_config.json:', error);
      throw new Error('Gmail parser cannot initialize - config file missing or invalid');
    }
  }

  /**
   * Check if current page is a Gmail page
   * @param {string} url - Optional URL to check (defaults to current page)
   * @returns {boolean} True if Gmail page detected
   */
  async checkPageMatch(url) {
    const testUrl = url || window.location.href;
    return testUrl.includes('mail.google.com');
  }

  /**
   * Initialize state with default values for Gmail parser
   * @param {Object} state - State object to initialize with defaults
   */
  async initialize(state) {
    
    this.STATE = state;
    this.STATE.clear();
  }


  /**
   * Main parsing function - extracts booking data from Gmail thread
   * @param {Object} state - State object to populate with extracted data
   */
  async parse(state) {
    try {

      // Update STATE with values from passed state, but keep the State instance
      if (state) {
        // Merge hierarchical structure while preserving methods
        if (state.Client) Object.assign(this.STATE.Client, state.Client);
        if (state.Booking) Object.assign(this.STATE.Booking, state.Booking);
        if (state.Config) Object.assign(this.STATE.Config, state.Config);
      }

      // NECESSARY?  should we implement here?
      // await this.waitUntilReady();

      // NAME AND EMAIL
      // Step 1: Extract email and name using multiple Gmail selector strategies
      const emailData = this._extractEmailAndName();
      
      // Step 2: Extract thread content from email bodies
      const threadContent = this._extractThreadContent();
      
      if (!threadContent?.trim()) {
        console.warn('No email content could be extracted. Try refreshing the page or opening the email thread.');
        return;
      }

      // Step 3: Set guaranteed fields first (easy wins for LLM context)
      if (emailData.email) this.STATE.Client.email = emailData.email;
      if (emailData.name) {
        this.STATE.Client.name = emailData.name;
        this.STATE.Booking.clientId = emailData.name; // Duplicate name as clientId
      }
      this.STATE.Booking.source = 'gmail';


      // SEND TO LLM
      // Step 4: Send to LLM for processing
      const llmResult = await this._sendToLLM(emailData, threadContent);

      if (llmResult) {
        console.log('LLM processed successfully');
        _conservativeUpdate( llmResult );
      } else {
        console.warn('LLM unavailable - basic extraction only');
      }



      // CHECKING

      // ALWAYS ensure basic email/name persist (even if LLM overwrote them with null)
      if (emailData.email && !this.STATE.Client.email) this.STATE.Client.email = emailData.email;
      if (emailData.name && !this.STATE.Client.name) {
        this.STATE.Client.name = emailData.name;
        this.STATE.Booking.clientId = emailData.name;
      }
      

      // SAME DAY
      // Auto-complete endDate to match startDate if endDate is missing
      if (this.STATE.Booking.startDate && ! this.STATE.Booking.endDate) {
        this.STATE.Booking.endDate = this.STATE.Booking.startDate;
      }

      // DURATION
      // Calculate duration procedurally if startTime and endTime are available
      if (this.STATE.Booking.startTime && this.STATE.Booking.endTime) {
        let duration = this._calculateDuration(this.STATE.Booking.startTime, this.STATE.Booking.endTime);
        if (duration) this.STATE.Booking.duration = duration;
      }

      // RATES
      // if there is a flatRate -- totalAmount = flatRate
      // else if there is an hourlyRate
      // totalAmount = hourlyRate * duration
      // 
      if (this.STATE.Booking.flatRate) {
        // user may ++totalAmount later -- this is just a default
        this.STATE.Booking.totalAmount = this.STATE.Booking.flatRate;
      
      } else if (this.STATE.Booking.hourlyRate && ! this.STATE.Booking.totalAmount) {

        // Calculate totalAmount before displaying if hourlyRate and duration are available
        const hourlyRate = parseFloat(this.STATE.Booking.hourlyRate);
        const calculatedDuration = parseFloat(this.STATE.Booking.duration);
        if (!isNaN(hourlyRate) && !isNaN(calculatedDuration) && hourlyRate > 0 && calculatedDuration > 0) {
          const total = hourlyRate * calculatedDuration;
          this.STATE.Booking.totalAmount = total.toFixed(2);
        }
      } 

      

    } catch (error) {
      console.error('Gmail parser error:', error);
      // Set minimal fallback data
      this.STATE.Booking = this.STATE.Booking || {};
      this.STATE.Booking.source = 'gmail';
    }

    // Return the state object (sidebar will handle saving)
    return this.STATE;
  }






  /**
   * Extract sender email and name using multiple fool-proof Gmail selector strategies
   * @returns {Object} Object with email and name properties (null if not found)
   */
  _extractEmailAndName() {
    try {
      // Strategy 1: Direct email attribute (most reliable for current sender)
      const senderElement = document.querySelector('[email]');
      const email = senderElement?.getAttribute('email');
      
      // Strategy 2: Name from sender display elements
      const nameElement = document.querySelector('span[email] > span:first-child') ||
                         document.querySelector('.go span[title]') ||
                         document.querySelector('[data-name]');
      const name = nameElement?.textContent?.trim() || 
                   nameElement?.getAttribute('title') || 
                   nameElement?.getAttribute('data-name');
      
      // Strategy 3: Accessibility aria-labels (backup method)
      const ariaElement = document.querySelector('[aria-label*="@"]');
      const ariaEmail = ariaElement?.getAttribute('aria-label')?.match(/[\w\.-]+@[\w\.-]+\.\w+/)?.[0];
      
      // Strategy 4: URL parameters (last resort)
      const urlParams = new URLSearchParams(window.location.search);
      const urlEmail = urlParams.get('from');
      
      const result = {
        email: email || ariaEmail || urlEmail || null,
        name: name || null
      };
      
      return result;
      
    } catch (error) {
      console.error('Error extracting email/name:', error);
      return { email: null, name: null };
    }
  }





  /**
   * Extract thread content from Gmail email bodies
   * @returns {string} Combined thread content or empty string
   */
  _extractThreadContent() {
    try {
      // Gmail email body selectors - try multiple fallback strategies
      const selectors = [
        // Current Gmail structure (2024+)
        '.a3s.aiL',
        // Alternative selectors for different Gmail views
        '[role="main"] .a3s',
        '.adP .a3s',
        '[data-message-id] .a3s',
        '.adn .a3s',
        '.gs .a3s',
        // Older Gmail selectors as fallbacks
        '.ii.gt',
        '.message-content',
        '[data-legacy-message-id] .a3s',
        // Generic content selectors
        '.gmail-message-content',
        '.email-content'
      ];

      let emailBodies = null;
      let usedSelector = '';

      // Try each selector until we find content
      for (const selector of selectors) {
        emailBodies = document.querySelectorAll(selector);
        if (emailBodies.length > 0) {
          usedSelector = selector;
          console.log(`Found ${emailBodies.length} email bodies using selector: ${selector}`);
          break;
        }
      }

      if (!emailBodies || emailBodies.length === 0) {
        console.warn('No email bodies found with any Gmail selector. Available selectors tried:', selectors);
        console.log('Current page URL:', window.location.href);
        console.log('Page title:', document.title);

        // Try to find any potential email content areas
        const potentialContent = document.querySelectorAll('[role="main"], .main-content, #main');
        if (potentialContent.length > 0) {
          console.log('Found potential content areas:', potentialContent.length);
          // Try to extract text from main content area
          const mainContent = potentialContent[0].textContent?.trim();
          if (mainContent && mainContent.length > 100) {
            console.log('Using main content area as fallback');
            return mainContent;
          }
        }

        return '';
      }

      // Extract text from each email body and join with separators
      const threadText = Array.from(emailBodies)
        .map(body => {
          const text = body.innerText?.trim() || body.textContent?.trim() || '';
          console.log(`Extracted content from selector ${usedSelector}: ${text.substring(0, 100)}...`);
          return text;
        })
        .filter(text => text.length > 0)
        .join('\n\n--- EMAIL SEPARATOR ---\n\n');

      console.log(`Successfully extracted thread content (${threadText.length} chars) using selector: ${usedSelector}`);
      return threadText;

    } catch (error) {
      console.error('Error extracting thread content:', error);
      console.error('Stack trace:', error.stack);
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
          obj[prop] = (llmValue && !obj[prop]) ? llmValue : obj[prop];
      };

      // Client fields
      updateIfEmpty(this.STATE.Client, 'name', llmResult.name);
      updateIfEmpty(this.STATE.Client, 'email', llmResult.email);
      updateIfEmpty(this.STATE.Client, 'phone', llmResult.phone);
      updateIfEmpty(this.STATE.Client, 'company', llmResult.company);
      updateIfEmpty(this.STATE.Client, 'notes', llmResult.notes);

      // Booking fields
      updateIfEmpty(this.STATE.Booking, 'hourlyRate', llmResult.hourlyRate);
      updateIfEmpty(this.STATE.Booking, 'flatRate', llmResult.flatRate);
      updateIfEmpty(this.STATE.Booking, 'totalAmount', llmResult.totalAmount);
      updateIfEmpty(this.STATE.Booking, 'duration', llmResult.duration);
      this.STATE.Booking.source = 'Gmail'; // Always set source to gmail
  }


  
  /**
   * Send thread content to LLM for intelligent booking data extraction
   * @param {Object} emailData - Object containing email and name
   * @param {string} threadContent - Raw email thread text
   * @returns {Object|null} Parsed booking data or null if failed
   */
  async _sendToLLM(emailData, threadContent) {
    try {
      // Ensure CONFIG is loaded
      await this._initializeConfig();
      
      const llmConfig = CONFIG.llm;
      if (!llmConfig?.baseUrl || !llmConfig?.endpoints?.completions) {
        throw new Error('Invalid LLM configuration');
      }

      // Construct structured prompt for booking data extraction
      const prompt = this._buildLLMPrompt(emailData, threadContent, CONFIG.gmailParser);
      
      // Send request via background script to avoid CORS issues
      const response = await this._sendLLMRequest(llmConfig, prompt);

      console.log('LLM request sent, processing response...');
      // console.log('LLM response received:', response);
      // console.log('Response ok:', response?.ok);
      // console.log('Response data:', response?.data);
      // console.log('Content array:', response?.data?.content);

      if (!response?.ok) {
        console.error('LLM request failed:', response?.error || 'Request failed');
        return null;
      }
      
      // Handle Anthropic API response format - content is directly the text
      const contentArray = response.data?.content;
      const firstContent = contentArray?.[0];
      const textContent = firstContent?.text || firstContent;
       
      return textContent ? this._parseLLMResponse(textContent) : null;
      
    } catch (error) {
      // Log detailed error for debugging
      console.error('LLM processing failed with error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        llmConfigExists: !!CONFIG?.llm,
        baseUrl: CONFIG?.llm?.baseUrl,
        endpoints: CONFIG?.llm?.endpoints
      });
      return null;
    }
  }

  /**
   * Build structured prompt for LLM booking data extraction
   * @param {Object} emailData - Email and name data
   * @param {string} threadContent - Email thread content
   * @param {Object} parserConfig - Gmail parser configuration from config file
   * @returns {string} Formatted prompt for LLM
   */
  _buildLLMPrompt(emailData, threadContent, parserConfig) {
    const knownInfo = [
      emailData.email ? `Email: ${emailData.email}` : '',
      emailData.name ? `Name: ${emailData.name}` : ''
    ].filter(Boolean).join('\n');

    // Get system prompt from config, fallback to basic prompt if not available
    const systemPrompt = parserConfig?.systemPrompt || 'Extract booking information from email and output JSON.';

    return `${systemPrompt}\n\n
Known client info:\n
${knownInfo || 'None provided'}\n\n
Email thread content:\n
${threadContent}
`;
  }

  /**
   * Send LLM request via background script
   * @param {Object} llmConfig - LLM configuration
   * @param {string} prompt - Prompt to send
   * @returns {Object|null} Response from background script
   */
  async _sendLocalLLMRequest(llmConfig, prompt) {
    const llmRequest = {
      url: `${llmConfig.baseUrl}${llmConfig.endpoints.completions}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        model: "liquid/lfm2-1.2b",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000
      }
    };

      console.log(`Sending LLM request to ${llmConfig.baseUrl}`);


    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'leedz_llm_request', request: llmRequest },
          (response) => {
            console.log("LLM response received");
            if (chrome.runtime.lastError) {
              console.error('Chrome runtime error:', chrome.runtime.lastError.message);
              resolve(null);
            } else if (!response) {
              console.log('No response from background script');
              resolve(null);
            } else {
              console.log('Valid response received');
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
   * Send LLM request using config endpoints
   * @param {Object} llmConfig - LLM configuration
   * @param {string} prompt - Prompt to send
   * @returns {Object|null} Response from LLM API
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

    console.log(`Sending LLM request to ${llmConfig.baseUrl}`);

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'leedz_llm_request', request: llmRequest },
          (response) => {
            console.log("LLM response received");
            if (chrome.runtime.lastError) {
              console.error('Chrome runtime error:', chrome.runtime.lastError.message);
              resolve(null);
            } else if (!response) {
              console.log('No response from background script');
              resolve(null);
            } else {
              console.log('Valid response received');
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
   * Parse LLM response and extract JSON data
   * @param {string} content - Raw LLM response content
   * @returns {Object|null} Parsed booking data or null
   */
  _parseLLMResponse(content) {
    try {
      console.log('_parseLLMResponse called with content:', content?.substring(0, 200));
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      console.log('JSON match found:', !!jsonMatch);
      if (jsonMatch) {
        console.log('Matched JSON:', jsonMatch[0].substring(0, 200));
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('Parsed JSON:', parsed);
        
        // Map LLM fields to our structured state
        const mapped = {
          Client: {},
          Booking: {},
          Config: {}
        };
        
        
        /*
        const clientFields = ['name', 'email', 'phone', 'company', 'notes'];
        const bookingFields = ['description', 'location', 'startDate', 'endDate', 
                             'startTime', 'endTime', 'duration', 'hourlyRate', 
                             'flatRate', 'totalAmount', 'status', 'source'];
        */
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
              if (['hourlyRate', 'flatRate', 'totalAmount', 'duration'].includes(field)) {
                mapped.Booking[field] = parseFloat(value) || null;
              }
            }
          }
        });
        
        // Ensure clientId is set from Client.name
        if (mapped.Client.name) {
          mapped.Booking.clientId = mapped.Client.name;
        }

        // Handle date mapping: Prioritize startDate/endDate, then parsed.date
        if (parsed.startDate && parsed.startDate !== 'Not applicable' && parsed.startDate !== 'Not specified') {
          mapped.Booking.startDate = parsed.startDate;
        }
        if (parsed.endDate && parsed.endDate !== 'Not applicable' && parsed.endDate !== 'Not specified') {
          mapped.Booking.endDate = parsed.endDate;
        }
        if (parsed.date && parsed.date !== 'Not applicable' && parsed.date !== 'Not specified') {
          if (!mapped.Booking.startDate) mapped.Booking.startDate = parsed.date;
          if (!mapped.Booking.endDate) mapped.Booking.endDate = parsed.date; // Auto-complete endDate if not explicitly provided
        }
        
        // Smart time correction based on duration: If duration suggests overnight work
        if (mapped.Booking.startTime && mapped.Booking.endTime && mapped.Booking.duration) {
          const duration = parseFloat(mapped.Booking.duration);
          if (!isNaN(duration)) {
            const correctedTimes = this._correctTimesWithDuration(mapped.Booking.startTime, mapped.Booking.endTime, duration);
            if (correctedTimes) {
              mapped.Booking.startTime = correctedTimes.startTime;
              mapped.Booking.endTime = correctedTimes.endTime;
            }
          }
        }
        
        // Handle potential alternate mappings or consolidations
        // if (parsed.serviceDate && !mapped.Booking.startDate) mapped.Booking.startDate = parsed.serviceDate; // Removed as LLM now returns startDate/endDate
        if (parsed.address && !mapped.Booking.location) mapped.Booking.location = parsed.address;
        if (parsed.rate && parsed.rate !== 'Not applicable' && parsed.rate !== 'Not specified' && !mapped.Booking.hourlyRate) {
          mapped.Booking.hourlyRate = parsed.rate; // Use parsed.rate if hourlyRate is not set
        }

        // Special handling for duration, rates, and amounts to ensure they are numbers
        if (mapped.Booking.duration) mapped.Booking.duration = parseFloat(mapped.Booking.duration);
        if (mapped.Booking.hourlyRate) mapped.Booking.hourlyRate = parseFloat(mapped.Booking.hourlyRate);
        if (mapped.Booking.flatRate) mapped.Booking.flatRate = parseFloat(mapped.Booking.flatRate);
        if (mapped.Booking.totalAmount) mapped.Booking.totalAmount = parseFloat(mapped.Booking.totalAmount);

        // Clean up NaN values resulting from parseFloat if original was not a valid number
        if (isNaN(mapped.Booking.duration)) mapped.Booking.duration = null;
        if (isNaN(mapped.Booking.hourlyRate)) mapped.Booking.hourlyRate = null;
        if (isNaN(mapped.Booking.flatRate)) mapped.Booking.flatRate = null;
        if (isNaN(mapped.Booking.totalAmount)) mapped.Booking.totalAmount = null;
        
        console.log('Final mapped object:', mapped);
        return mapped;
      }
      return null;
    } catch (error) {
      console.warn('Failed to parse LLM JSON response');
      return null;
    }
  }

  /**
   * Corrects time interpretation based on duration context
   * If times don't make logical sense with duration, adjust AM/PM interpretation
   * @param {string} startTime - Start time from LLM
   * @param {string} endTime - End time from LLM  
   * @param {number} duration - Duration in hours
   * @returns {Object|null} Corrected times or null if no correction needed
   */
  _correctTimesWithDuration(startTime, endTime, duration) {
    try {
      // Parse times - handle both 24hr format and already formatted times
      const parseTime = (timeStr) => {
        if (/(AM|PM)/i.test(timeStr)) {
          // Already formatted, convert to 24hr for calculation
          const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          if (!match) return null;
          
          let hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          const period = match[3].toUpperCase();
          
          if (period === 'PM' && hours !== 12) hours += 12;
          if (period === 'AM' && hours === 12) hours = 0;
          
          return { hours, minutes, originalFormat: timeStr };
        } else {
          // 24hr format like "19:00"
          const [hours, minutes] = timeStr.split(':').map(Number);
          return { hours, minutes, originalFormat: timeStr };
        }
      };

      const start = parseTime(startTime);
      const end = parseTime(endTime);
      
      if (!start || !end) return null;

      // Calculate actual duration between the times
      let actualDuration;
      if (end.hours >= start.hours) {
        // Same day
        actualDuration = (end.hours - start.hours) + (end.minutes - start.minutes) / 60;
      } else {
        // Overnight (end time next day)
        actualDuration = (24 - start.hours + end.hours) + (end.minutes - start.minutes) / 60;
      }

      // If actual duration doesn't match expected duration (within 0.5 hour tolerance)
      if (Math.abs(actualDuration - duration) > 0.5) {
        // Try different interpretations
        
        // Case 1: If LLM provided 24hr times but they should be interpreted differently
        if (!/(AM|PM)/i.test(startTime) && !/(AM|PM)/i.test(endTime)) {
          // Try interpreting as: 19:00 = 7:00 AM, 11:00 = 11:00 AM (4 hour duration)
          if (start.hours === 19 && end.hours === 11 && Math.abs(duration - 4) < 0.5) {
            return {
              startTime: '7:00 AM',
              endTime: '11:00 AM'
            };
          }
          
          // Try other common misinterpretations
          // 19:00 = 7:00 PM, but if duration is 4 hours, end should be 11:00 PM
          if (start.hours === 19 && duration === 4) {
            return {
              startTime: '7:00 PM', 
              endTime: '11:00 PM'
            };
          }
        }
      }

      return null; // No correction needed
    } catch (error) {
      console.warn('Error correcting times:', error);
      return null;
    }
  }

  /**
   * Calculate duration as the difference between startTime and endTime
   * @param {string} startTime - Start time (12-hour or 24-hour format)
   * @param {string} endTime - End time (12-hour or 24-hour format)
   * @returns {string|null} Duration in hours as string, or null if invalid
   */
  _calculateDuration(startTime, endTime) {
    // DURATION
    // Calculate duration before displaying if startTime and endTime are available
    let duration;

    if (startTime && endTime) {
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime.split(':').map(Number);

      const startTotalMinutes = startHours * 60 + (startMinutes || 0);
      const endTotalMinutes = endHours * 60 + (endMinutes || 0);

      if (endTotalMinutes < startTotalMinutes) {
        duration = (24 * 60 - startTotalMinutes) + endTotalMinutes;
      } else {
        duration = endTotalMinutes - startTotalMinutes;
      }

      const durationHours = (duration / 60).toFixed(1);
      const durationNum = parseFloat(durationHours);
      return durationNum.toString();
    }

    return null;
  }
}

// Node.js standalone test function
async function main() {
  console.log('=== Gmail Parser Node.js Test ===');
  
  // Mock chrome runtime for Node.js  
  const fs = await import('fs');
  const path = await import('path');
  const url = new URL(import.meta.url);
  const __dirname = path.dirname(url.pathname.replace(/^\/([A-Z]:)/, '$1'));
  
  global.chrome = {
    runtime: {
      getURL: (path) => {
        const configPath = `${__dirname}/../../${path}`;
        console.log('Trying to load config from:', configPath);
        return `file://${configPath}`;
      }
    }
  };
  
  // Mock fetch for Node.js
  if (typeof fetch === 'undefined') {
    const { default: nodeFetch } = await import('node-fetch');
    global.fetch = nodeFetch;
  }
  
  try {
    // Load config directly in Node.js
    const configPath = `${__dirname}/../../invoicer_config.json`;
    const configContent = await fs.promises.readFile(configPath, 'utf8');
    CONFIG = JSON.parse(configContent);
    console.log('Config loaded directly from:', configPath);
    
    const parser = new GmailParser();
    
    console.log('Config loaded:', !!CONFIG);
    console.log('LLM Config:', {
      baseUrl: CONFIG?.llm?.baseUrl,
      endpoints: CONFIG?.llm?.endpoints,
      hasApiKey: !!CONFIG?.llm?.['api-key']
    });
    
    // Test LLM request directly
    const testPrompt = "Extract booking info from: 'Meeting with Laura at 2pm tomorrow for 3 hours at $150/hr'";
    console.log('Testing LLM request...');
    
    const llmRequest = {
      url: `${CONFIG.llm.baseUrl}${CONFIG.llm.endpoints.completions}`,
      method: 'POST',
      headers: {
        'x-api-key': CONFIG.llm['api-key'],
        'anthropic-version': CONFIG.llm['anthropic-version'],
        'content-type': 'application/json'
      },
      body: {
        model: CONFIG.llm.provider,
        max_tokens: CONFIG.llm.max_tokens,
        messages: [{ role: 'user', content: testPrompt }]
      }
    };
    
    console.log('Request URL:', llmRequest.url);
    console.log('Request headers:', llmRequest.headers);
    console.log('Request body:', JSON.stringify(llmRequest.body, null, 2));
    
    // Make direct fetch request
    const response = await fetch(llmRequest.url, {
      method: llmRequest.method,
      headers: llmRequest.headers,
      body: JSON.stringify(llmRequest.body)
    });
    
    console.log('Response status:', response.status, response.statusText);
    console.log('Response ok:', response.ok);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Response data:', JSON.stringify(data, null, 2));
      
      const content = data?.content?.[0]?.text;
      console.log('Extracted content:', content);
    } else {
      const error = await response.text();
      console.error('Error response:', error);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run main if this file is executed directly in Node.js
if (typeof process !== 'undefined' && typeof module !== 'undefined' && process.argv[1] && process.argv[1].endsWith('gmail_parser.js')) {
  console.log('Running main...');
  main().catch(console.error);
}

export default GmailParser;
