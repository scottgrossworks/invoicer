// gCal_parser.js — extract Google Calendar event content and process via LLM

import { PortalParser } from './parser.js';

// Global CONFIG variable - loaded once when parser initializes
let CONFIG = null;

/**
 * GCalParser - Extracts booking/invoice data from Google Calendar events using a hybrid procedural and LLM processing approach.
 */
class GCalParser extends PortalParser {

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

  async parse(state) {
    try {
      if (state) {
        if (state.Client) Object.assign(this.STATE.Client, state.Client);
        if (state.Booking) Object.assign(this.STATE.Booking, state.Booking);
        if (state.Config) Object.assign(this.STATE.Config, state.Config);
      }

      await this.waitUntilReady();

      const proceduralData = this._extractProceduralData();
      if (!proceduralData.title) {
         // console.warn("Could not extract a title. The modal may not be fully loaded or the selectors are outdated.");
         console.warn("Could not find event details. Please make sure the event pop-up is open.");
         return this.STATE;
      }

      // Assign extracted data to the state
      this.STATE.Booking.title = proceduralData.title; 
      this.STATE.Booking.description = proceduralData.description;
      this.STATE.Booking.location = proceduralData.location;
      this.STATE.Booking.source = 'gcal';
      
      // DATETIME
      // Smart parsing of date/time for same-day events
      if (proceduralData.dateTime) {
        const parsed = this._parseDateTime(proceduralData.dateTime);
        
        this.STATE.Booking.startDate = parsed.startDate;
        this.STATE.Booking.endDate = parsed.endDate;
        this.STATE.Booking.startTime = parsed.startTime;
        this.STATE.Booking.endTime = parsed.endTime;

        // SAME DAY
        // Auto-complete endDate to match startDate if endDate is missing
        if (this.STATE.Booking.startDate && ! this.STATE.Booking.endDate) {
          this.STATE.Booking.endDate = this.STATE.Booking.startDate;
        }

        // calculate DURATION
        let duration = this._calculateDuration(parsed.startDate, parsed.endDate);
        if (duration) this.STATE.Booking.duration = duration;
      }


      // Conditional LLM Parsing on title + description concatenated
      const title = proceduralData.title || '';
      const description = proceduralData.description || '';
      const combinedText = `${title}\n\n${description}`.trim();
      
      if (combinedText.length > 0) {
        
        const llmResult = await this._sendToLLM(combinedText);

        if (llmResult) {

          
            console.log("LLM returned result:", llmResult);
            console.log("Before conservative update, STATE:", {
              Client: this.STATE.Client,
              Booking: this.STATE.Booking
            });
         

            // UPDATE the STATE conservatively
            this._conservativeUpdate(llmResult);

          
            console.log("After conservative update, STATE:", {
              Client: this.STATE.Client,
              Booking: this.STATE.Booking
            });
           

          console.log('LLM processed successfully');
        } else {
          console.warn("LLM returned null/empty result");
        }
      } else {
        console.log("No combined text found for LLM parsing.");
      }

    } catch (error) {
      console.error('GCal parser error:', error);
      this.STATE.Booking = this.STATE.Booking || {};
      this.STATE.Booking.source = 'gcal';
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

    return this.STATE;
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
    console.log('Final procedural extraction result:', result);
    return result;
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




  /**
   * Conservatively updates the state with new LLM results.
   * Only fills in fields that are currently empty or whitespace or null.
   * @param {*} llmResult 
   */
  _conservativeUpdate(llmResult) {
      const updateIfEmpty = (obj, prop, llmValue) => {
          // Only update if the current value is null, undefined, or an empty string
          const currentValue = obj[prop];
          if (llmValue && (currentValue === null || currentValue === undefined || String(currentValue).trim() === "")) {
              obj[prop] = llmValue;
          }
      };

      // Client fields
      updateIfEmpty(this.STATE.Client, 'name', llmResult.Client?.name);
      updateIfEmpty(this.STATE.Client, 'email', llmResult.Client?.email);
      updateIfEmpty(this.STATE.Client, 'phone', this.sanitizePhone(llmResult.Client?.phone));
      updateIfEmpty(this.STATE.Client, 'company', llmResult.Client?.company);
      // updateIfEmpty(this.STATE.Client, 'clientNotes', llmResult.Client?.clientNotes);

      // Booking fields
      updateIfEmpty(this.STATE.Booking, 'hourlyRate', this.sanitizeCurrency(llmResult.Booking?.hourlyRate));
      updateIfEmpty(this.STATE.Booking, 'flatRate', this.sanitizeCurrency(llmResult.Booking?.flatRate));
      updateIfEmpty(this.STATE.Booking, 'totalAmount', this.sanitizeCurrency(llmResult.Booking?.totalAmount));
      updateIfEmpty(this.STATE.Booking, 'duration', llmResult.Booking?.duration);
      updateIfEmpty(this.STATE.Booking, 'location', llmResult.Booking?.location);
      updateIfEmpty(this.STATE.Booking, 'description', llmResult.Booking?.description);
      updateIfEmpty(this.STATE.Booking, 'title', llmResult.Booking?.title);
      updateIfEmpty(this.STATE.Booking, 'notes', llmResult.Booking?.notes);
      this.STATE.Booking.source = 'Google Calendar'; // Always set source to gcal
  }


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

  // _parseLLMResponse() inherited from PortalParser base class
  // Transforms flat LLM JSON response into nested Client/Booking structure

  async waitUntilReady() {
    try {
      await PortalParser.waitForElement('[role="dialog"]', 10000);
      await PortalParser.waitForElement('[role="dialog"] #rAECCd', 5000);
      return true;

    } catch (error) {
      console.warn('GCal waitUntilReady failed:', error.message);
      return false;
    }
  }






}

export default GCalParser;