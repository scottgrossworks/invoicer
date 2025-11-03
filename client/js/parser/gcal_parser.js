// gCal_parser.js — extract Google Calendar event content and process via LLM

import { EventParser } from './event_parser.js';

// Global CONFIG variable - loaded once when parser initializes
let CONFIG = null;

/**
 * GCalParser - Extracts booking/invoice data from Google Calendar events using a hybrid procedural and LLM processing approach.
 */
class GCalParser extends EventParser {

  constructor() {
    super();
    this.STATE = null;
    this.name = 'GCalParser';
  }

  async _initializeConfig() {
    if (CONFIG) return;

    try {
      const configResponse = await fetch(chrome.runtime.getURL('invoicer_config.json'));
      if (!configResponse.ok) {
        throw new Error(`Config file not found: ${configResponse.status}`);
      }
      CONFIG = await configResponse.json();
      // console.log('GCal parser config loaded successfully');
    } catch (error) {
      console.error('FATAL: Unable to load invoicer_config.json:', error);
      throw new Error('GCal parser cannot initialize - config file missing or invalid');
    }
  }

  async checkPageMatch(url) {
    const testUrl = url || window.location.href;
    // console.log('GCalParser checkPageMatch called with URL:', testUrl);
    return testUrl.includes('calendar.google.com');
  }

  async initialize(state) {
    this.STATE = state;
    this.STATE.clear();
  }

  /**
   * Extract client data from Google Calendar event
   * GCal events typically don't have direct client information
   * @returns {Array<Object>} Empty array (LLM will fill in client data)
   */
  async extractClientData() {
    return []; // Client data comes from LLM parsing of title/description
  }

  /**
   * Extract booking data from Google Calendar event using procedural DOM extraction
   * @returns {Object} Booking data {title, location, dates, times, duration, source}
   */
  async extractBookingData() {
    await this.waitUntilReady();

    const proceduralData = this._extractProceduralData();

    if (! (proceduralData.title ||
          proceduralData.dateTime ||
          proceduralData.location ||
          proceduralData.description)
    ) {
      console.log("Calendar Event not found. Cannot parse details. Make sure the event pop-up is open.");
      return { source: 'gcal' };
    }

    const bookingData = {
      title: proceduralData.title,
      location: proceduralData.location,
      source: 'gcal'
    };

    // DATETIME - Smart parsing of date/time
    if (proceduralData.dateTime) {
      const parsed = this._parseDateTime(proceduralData.dateTime);

      // Convert dates to ISO 8601 format
      bookingData.startDate = this._convertToISO8601(parsed.startDate, parsed.startTime);
      bookingData.endDate = this._convertToISO8601(parsed.endDate, parsed.endTime);
      bookingData.startTime = parsed.startTime;
      bookingData.endTime = parsed.endTime;

      // Auto-complete endDate to match startDate if missing (same-day events)
      if (bookingData.startDate && !bookingData.endDate) {
        bookingData.endDate = bookingData.startDate;
      }

      // Calculate DURATION
      const duration = this._calculateDuration(bookingData.startDate, bookingData.endDate);
      if (duration) bookingData.duration = duration;
    }

    // Store description for LLM processing (don't add to booking data directly)
    this._cachedDescription = proceduralData.description;

    return bookingData;
  }

  /**
   * Get content for LLM processing
   * @returns {string} Combined title and description
   */
  async _getContentForLLM() {
    const title = this.STATE.Booking?.title || '';
    const description = this._cachedDescription || '';
    return `${title}\n\n${description}`.trim();
  }

  /**
   * Override EventParser parse() to add rate calculations after parent processing
   */
  async parse(state) {
    // Call parent EventParser template method
    const result = await super.parse(state);

    // RATES - Calculate totalAmount based on rates and duration
    if (this.STATE.Booking.flatRate) {
      this.STATE.Booking.totalAmount = this.STATE.Booking.flatRate;
    } else if (this.STATE.Booking.hourlyRate && !this.STATE.Booking.totalAmount) {
      const hourlyRate = parseFloat(this.STATE.Booking.hourlyRate);
      const calculatedDuration = parseFloat(this.STATE.Booking.duration);
      if (!isNaN(hourlyRate) && !isNaN(calculatedDuration) && hourlyRate > 0 && calculatedDuration > 0) {
        const total = hourlyRate * calculatedDuration;
        this.STATE.Booking.totalAmount = total.toFixed(2);
      }
    }

    return result;
  }





  /**
   * Extracts data using the actual HTML structure from the modal dialog.
   */
  _extractProceduralData() {
    
    const modalDialog = document.querySelector('[role="dialog"]');
    if (!modalDialog) {
        console.error("No modal dialog found.");
        return {};
    }

    // Helper function to safely get text content and log the process
    const getText = (selector, label) => {
        const element = modalDialog.querySelector(selector);
        if (element) {
            const text = element.textContent?.trim();
            // console.log(`Found ${label} with selector "${selector}": "${text}"`);
            return text;
        }
        return null;
    };

    // 1. Extract the event title 
    const title = getText('#rAECCd', 'title');
    
    // 2. Extract date/time from the actual structure
    const dateTime = getText('.AzuXid.O2VjS.CyPPBf', 'dateTime');
    
    // 3. Extract location from the location section
    const location = getText('#xDetDlgLoc .UfeRlc', 'location');
    
    // 4. Extract description from the description section
    const description = getText('#xDetDlgDesc', 'description');

    const result = {
        title,
        dateTime,
        location,
        description
    };
    // console.log('Final procedural extraction result:', result);
    return result;
  }

  /**
   * Convert human-readable date string to ISO 8601 format
   * @param {string} dateString - e.g., "November 3, 2023" or "Sunday, August 24"
   * @param {string} timeString - e.g., "9:00pm" (optional)
   * @returns {string} ISO 8601 formatted date string
   */
  _convertToISO8601(dateString, timeString = null) {
    if (!dateString) return null;

    try {
      // Parse the date string
      let dateObj = new Date(dateString);

      // If time string is provided, parse and set it
      if (timeString) {
        const timeMatch = timeString.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const period = timeMatch[3]?.toLowerCase();

          // Convert to 24-hour format
          if (period === 'pm' && hours !== 12) {
            hours += 12;
          } else if (period === 'am' && hours === 12) {
            hours = 0;
          }

          dateObj.setHours(hours, minutes, 0, 0);
        }
      }

      // Return ISO 8601 format with timezone
      const offset = dateObj.getTimezoneOffset();
      const offsetHours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
      const offsetMinutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
      const offsetSign = offset <= 0 ? '+' : '-';

      const year = dateObj.getFullYear();
      const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
      const day = dateObj.getDate().toString().padStart(2, '0');
      const hours = dateObj.getHours().toString().padStart(2, '0');
      const minutes = dateObj.getMinutes().toString().padStart(2, '0');
      const seconds = dateObj.getSeconds().toString().padStart(2, '0');

      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMinutes}`;

    } catch (error) {
      console.error('Error converting to ISO 8601:', error, 'Input:', dateString, timeString);
      return dateString; // Fallback to original
    }
  }

  /**
   * Parse Google Calendar date/time string into structured components
   * Handles both same-day and multi-day events
   * Examples:
   * - Same day: "Sunday, August 24⋅2:30 – 4:30pm"
   * - Multi-day: "Monday, August 25 – Tuesday, August 26⋅9:00am – 5:00pm"
   * - All day: "Monday, August 25 – Tuesday, August 26"
   */
  _parseDateTime(dateTimeString) {
    // console.log('Parsing dateTime string:', dateTimeString);
    
    try {
      // Handle format: "August 16, 2025, 12:00pm – August 17, 2025, 2:00pm"
      const dateTimeRangeMatch = dateTimeString.match(/^(.+?),\s*(\d{1,2}:\d{2}(?:am|pm)?)\s*[–-]\s*(.+?),\s*(\d{1,2}:\d{2}(?:am|pm)?)$/i);
      
      if (dateTimeRangeMatch) {
        const startDate = dateTimeRangeMatch[1]?.trim(); // "August 16, 2025"
        const startTime = dateTimeRangeMatch[2]?.trim(); // "12:00pm"
        const endDate = dateTimeRangeMatch[3]?.trim();   // "August 17, 2025"
        const endTime = dateTimeRangeMatch[4]?.trim();   // "2:00pm"
        
        const result = {
          startDate,
          endDate,
          startTime,
          endTime
        };
        
        return result;
      }
      
      // Handle same-day events (original logic)
      const parts = dateTimeString.split('⋅');
      const datePart = parts[0]?.trim(); // "Sunday, August 24"
      const timePart = parts[1]?.trim(); // "2:30 – 4:30pm"
      
      // For same-day events, both start and end date are the same
      const startDate = datePart;
      const endDate = datePart; // Same day
      
      let startTime = null;
      let endTime = null;
      
      if (timePart) {
        // Parse time range: "2:30 – 4:30pm" or "2:30pm – 4:30pm"
        const timeRangeMatch = timePart.match(/(\d{1,2}:\d{2})\s*(?:am|pm)?\s*[–-]\s*(\d{1,2}:\d{2})\s*(am|pm)/i);
        
        if (timeRangeMatch) {
          const startTimeRaw = timeRangeMatch[1]; // "2:30"
          const endTimeRaw = timeRangeMatch[2];   // "4:30"
          const period = timeRangeMatch[3];       // "pm"
          
          // Handle case where start time doesn't have AM/PM but end time does
          startTime = `${startTimeRaw}${period}`;
          endTime = `${endTimeRaw}${period}`;
          
          // console.log('Extracted times:', { startTime, endTime });
        } else {
          // Fallback: try to extract any time patterns
          const allTimes = timePart.match(/\d{1,2}:\d{2}\s*(?:am|pm)?/gi);
          if (allTimes && allTimes.length >= 2) {
            startTime = allTimes[0];
            endTime = allTimes[1];
          }
        }
      }
      
      const result = {
        startDate,
        endDate,
        startTime,
        endTime
      };
      
      return result;
      
    } catch (error) {
      console.error('Error parsing dateTime:', error);
      return {
        startDate: dateTimeString, // Fallback to original string
        endDate: dateTimeString,
        startTime: null,
        endTime: null
      };
    }
  }




  // _conservativeUpdate() is inherited from Parser base class


  async _sendToLLM(combinedText) {
      try {

        await this._initializeConfig();
        const llmConfig = CONFIG.llm;
        if (!llmConfig?.baseUrl || !llmConfig?.endpoints?.completions) {
          throw new Error('Invalid LLM configuration');
        }

        const prompt = this._buildLLMPrompt(combinedText);
        // console.log("Built LLM prompt:", prompt.substring(0, 300) + "...");
        
        const response = await this._sendLLMRequest(llmConfig, prompt);
        // console.log("Raw LLM response:", response);

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

  _buildLLMPrompt(description) {
    const systemPrompt = CONFIG.gcalParser?.systemPrompt || 'Extract booking information from the following text and output JSON.';
    return `${systemPrompt}\n\nEvent Description:\n${description}`;
  }

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

  // _parseLLMResponse() inherited from Parser base class
  // Transforms flat LLM JSON response into nested Client/Booking structure

  async waitUntilReady() {
    try {
      const { Parser } = await import('./parser.js');
      await Parser.waitForElement('[role="dialog"]', 10000);
      await Parser.waitForElement('[role="dialog"] #rAECCd', 5000);
      return true;

    } catch (error) {
      console.log('GCal waitUntilReady failed:', error.message);
      return false;
    }
  }






}

export default GCalParser;