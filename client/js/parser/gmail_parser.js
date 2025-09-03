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
        console.warn('No thread content found');
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
      // Gmail email body selector - .a3s.aiL contains the email content
      const emailBodies = document.querySelectorAll('.a3s.aiL');
      
      if (emailBodies.length === 0) {
        console.log('No email bodies found with selector .a3s.aiL');
        return '';
      }

      // Extract text from each email body and join with separators
      const threadText = Array.from(emailBodies)
        .map(body => body.innerText?.trim() || '')
        .filter(text => text.length > 0)
        .join('\n\n--- EMAIL SEPARATOR ---\n\n');
      
      return threadText;
      
    } catch (error) {
      console.error('Error extracting thread content:', error);
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
        
        // Handle date mapping
        if (parsed.serviceDate) mapped.startDate = parsed.serviceDate;
        if (parsed.startDate) mapped.startDate = parsed.startDate;
        
        // Handle time mapping
        if (parsed.startTime) mapped.startTime = parsed.startTime;
        if (parsed.endTime) mapped.endTime = parsed.endTime;
        
        // Handle location mapping
        if (parsed.location) mapped.location = parsed.location;
        if (parsed.address) mapped.location = parsed.address;
        
        // Handle description mapping
        if (parsed.description) mapped.description = parsed.description;
        
        // Handle rate mapping
        if (parsed.rate && parsed.rate !== 'Not specified' && parsed.rate !== 'Not applicable') {
          mapped.hourlyRate = parsed.rate;
        }
        if (parsed.hourlyRate && parsed.hourlyRate !== 'Not specified' && parsed.hourlyRate !== 'Not applicable') {
          mapped.hourlyRate = parsed.hourlyRate;
        }
        
        // Handle total amount (but don't include "Not applicable")
        if (parsed.totalAmount && parsed.totalAmount !== 'Not applicable' && parsed.totalAmount !== 'Not specified') {
          mapped.totalAmount = parsed.totalAmount;
        }
        
        // Handle client contact details
        if (parsed.clientContactDetails) {
          if (parsed.clientContactDetails.name) mapped.name = parsed.clientContactDetails.name;
          if (parsed.clientContactDetails.email) mapped.email = parsed.clientContactDetails.email;
          if (parsed.clientContactDetails.phone) mapped.phone = parsed.clientContactDetails.phone;
        }
        
        // Copy other direct mappings
        ['name', 'email', 'phone', 'company', 'notes', 'endDate'].forEach(field => {
          if (parsed[field] && parsed[field] !== 'Not applicable' && parsed[field] !== 'Not specified') {
            mapped[field] = parsed[field];
          }
        });
        
        return mapped;
      }
      return null;
    } catch (error) {
      console.warn('Failed to parse LLM JSON response');
      return null;
    }
  }
}

export default GmailParser;
