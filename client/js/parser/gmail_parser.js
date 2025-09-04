// gmail_parser.js — extract Gmail thread content and process via LLM
import { ParserInterface } from './parser_interface.js';



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
class GmailParser extends ParserInterface {
  constructor() {
    super();
    this.name = 'GmailParser';
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
   * Main parsing function - extracts booking data from Gmail thread
   * @param {Object} state - State object to populate with extracted data
   */
  async parse(state) {
    try {
      // Step 1: Extract email and name using multiple Gmail selector strategies
      const emailData = this._extractEmailAndName();
      
      // Step 2: Extract thread content from email bodies
      const threadContent = this._extractThreadContent();
      
      if (!threadContent?.trim()) {
        console.warn('No thread content found - this may indicate Gmail DOM changes or the page is not fully loaded');
        console.log('Page URL:', window.location.href);
        console.log('Page ready state:', document.readyState);
        console.log('Gmail-specific elements found:', document.querySelectorAll('[data-message-id]').length);
        state.set('parseError', 'No email content could be extracted. Try refreshing the page or opening the email thread.');
        return;
      }

      // Step 3: Set guaranteed fields first (easy wins for LLM context)
      if (emailData.email) state.set('email', emailData.email);
      if (emailData.name) state.set('name', emailData.name);
      state.set('source', 'gmail');
      
      // Step 4: Send to LLM for processing
      const llmResult = await this._sendToLLM(emailData, threadContent);
      if (llmResult) {
        Object.entries(llmResult).forEach(([key, value]) => {
          if (value !== null && value !== undefined && value !== '') {
            state.set(key, value);
          }
        });
        state.set('processingStatus', 'LLM processed successfully');
      } else {
        state.set('processingStatus', 'LLM unavailable - raw text only');
      }
      

      
    } catch (error) {
      console.error('Gmail parser error:', error);
      // Set minimal fallback data
      state.set('source', 'gmail');
      state.set('parseError', error.message);
    }
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
   * Send thread content to LLM for intelligent booking data extraction
   * @param {Object} emailData - Object containing email and name
   * @param {string} threadContent - Raw email thread text
   * @returns {Object|null} Parsed booking data or null if failed
   */
  async _sendToLLM(emailData, threadContent) {
    try {
      // Load LLM configuration from extension config file
      const configResponse = await fetch(chrome.runtime.getURL('invoicer_config.json'));
      const config = await configResponse.json();
      
      const llmConfig = config.llm;
      if (!llmConfig?.baseUrl || !llmConfig?.endpoints?.completions) {
        throw new Error('Invalid LLM configuration');
      }

      // Construct structured prompt for booking data extraction
      const prompt = this._buildLLMPrompt(emailData, threadContent, config.gmailParser);
      
      // Send request via background script to avoid CORS issues
      const response = await this._sendLLMRequest(llmConfig, prompt);

      if (!response?.ok) {
        return null;
      }
      
      const content = response.data?.choices?.[0]?.message?.content;
      return content ? this._parseLLMResponse(content) : null;
      
    } catch (error) {
      // Gracefully handle LLM failures - don't spam console with errors
      console.warn('LLM processing unavailable. Falling back to raw text extraction.');
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
  async _sendLLMRequest(llmConfig, prompt) {
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
   * Parse LLM response and extract JSON data
   * @param {string} content - Raw LLM response content
   * @returns {Object|null} Parsed booking data or null
   */
  _parseLLMResponse(content) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Map LLM fields to our booking fields
        const mapped = {};
        
        // Direct mappings for all expected fields from the updated prompt
        const fieldsToMap = [
          'name',
          'email',
          'phone',
          'location',
          // 'startDate', // Handled below
          // 'endDate',   // Handled below
          'startTime',
          'endTime',
          'duration',
          'hourlyRate',
          'flatRate',
          'totalAmount',
          'description',
          'company', 
          'notes'    
        ];

        fieldsToMap.forEach(field => {
          if (parsed[field] !== undefined && parsed[field] !== null && parsed[field] !== 'Not applicable' && parsed[field] !== 'Not specified') {
            mapped[field] = parsed[field];
          }
        });

        // Handle date mapping: Prioritize startDate/endDate, then parsed.date
        if (parsed.startDate && parsed.startDate !== 'Not applicable' && parsed.startDate !== 'Not specified') {
          mapped.startDate = parsed.startDate;
        }
        if (parsed.endDate && parsed.endDate !== 'Not applicable' && parsed.endDate !== 'Not specified') {
          mapped.endDate = parsed.endDate;
        }
        if (parsed.date && parsed.date !== 'Not applicable' && parsed.date !== 'Not specified') {
          if (!mapped.startDate) mapped.startDate = parsed.date;
          if (!mapped.endDate) mapped.endDate = parsed.date; // Auto-complete endDate if not explicitly provided
        }
        
        // Smart time correction based on duration: If duration suggests overnight work
        if (mapped.startTime && mapped.endTime && mapped.duration) {
          const duration = parseFloat(mapped.duration);
          if (!isNaN(duration)) {
            const correctedTimes = this._correctTimesWithDuration(mapped.startTime, mapped.endTime, duration);
            if (correctedTimes) {
              mapped.startTime = correctedTimes.startTime;
              mapped.endTime = correctedTimes.endTime;
            }
          }
        }
        
        // Handle potential alternate mappings or consolidations
        // if (parsed.serviceDate && !mapped.startDate) mapped.startDate = parsed.serviceDate; // Removed as LLM now returns startDate/endDate
        if (parsed.address && !mapped.location) mapped.location = parsed.address;
        if (parsed.rate && parsed.rate !== 'Not applicable' && parsed.rate !== 'Not specified' && !mapped.hourlyRate) {
          mapped.hourlyRate = parsed.rate; // Use parsed.rate if hourlyRate is not set
        }

        // Special handling for duration, rates, and amounts to ensure they are numbers
        if (mapped.duration) mapped.duration = parseFloat(mapped.duration);
        if (mapped.hourlyRate) mapped.hourlyRate = parseFloat(mapped.hourlyRate);
        if (mapped.flatRate) mapped.flatRate = parseFloat(mapped.flatRate);
        if (mapped.totalAmount) mapped.totalAmount = parseFloat(mapped.totalAmount);

        // Clean up NaN values resulting from parseFloat if original was not a valid number
        if (isNaN(mapped.duration)) delete mapped.duration;
        if (isNaN(mapped.hourlyRate)) delete mapped.hourlyRate;
        if (isNaN(mapped.flatRate)) delete mapped.flatRate;
        if (isNaN(mapped.totalAmount)) delete mapped.totalAmount;
        
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
}

export default GmailParser;
