/**
 * Page_Utils.js - Shared static utility methods for Page classes
 * Pure functions with no instance state dependency
 * Provides reusable functionality for email generation, LLM requests, and formatting
 */

import { ValidationUtils } from './ValidationUtils.js';

export class PageUtils {

  /**
   * Send LLM request with standardized error handling
   * @param {string} prompt - The prompt to send to LLM
   * @returns {Promise<string|null>} Generated text or null on error
   */
  static async sendLLMRequest(prompt) {
    try {
      // Load config
      const configResponse = await fetch(chrome.runtime.getURL('leedz_config.json'));
      const config = await configResponse.json();

      if (!config.llm || !config.llm.baseUrl) {
        console.error('LLM configuration missing or invalid');
        throw new Error('LLM configuration not found');
      }

      // Send request to LLM
      const llmRequest = {
        url: `${config.llm.baseUrl}${config.llm.endpoints.completions}`,
        method: 'POST',
        headers: {
          'x-api-key': config.llm['api-key'],
          'anthropic-version': config.llm['anthropic-version'],
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: {
          model: config.llm.provider,
          max_tokens: config.llm.max_tokens,
          messages: [{ role: 'user', content: prompt }]
        }
      };

      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'leedz_llm_request', request: llmRequest },
          (response) => {
            if (chrome.runtime.lastError) {
              console.log('ERROR: LLM request chrome.runtime error:', chrome.runtime.lastError);
              resolve(null);
            } else if (response?.ok && response?.data) {
              const contentArray = response.data.content;
              const firstContent = contentArray?.[0];
              const textContent = firstContent?.text || firstContent;
              resolve(textContent);
            } else {
              console.error('LLM response error:', {
                ok: response?.ok,
                error: response?.error,
                fullResponse: response
              });
              resolve(null);
            }
          }
        );
      });

    } catch (error) {
      console.error('Exception in sendLLMRequest:', error);
      return null;
    }
  }


/**
 * Strips non-numeric characters ('$', 'hours', etc.)
 * Parses values as floats
 * Multiplies them
 * Returns formatted result
 * Each page would call it from their existing event handlers with their own guard logic.
 */

  static calculateAmount(hourlyRateValue, durationValue) {
  // Strip formatting and parse
  const rate = parseFloat(String(hourlyRateValue).replace(/[$,]/g, '')) || 0;
  const hours = parseFloat(String(durationValue).replace(/\s*hours\s*/i, '')) || 0;
  
  if (rate <= 0 || hours <= 0) return null;

  return rate * hours;
  }


  /**
   * Validate and correct dates to ensure they're not in the past
   * Uses smart year inference: if parsed date is past, bump to current/next year
   *
   * LOGIC:
   * - If startDate > 1 day ago: no change (already valid)
   * - If startDate < 1 day ago: apply smart year correction
   *   - If parsed month >= current month: use current year
   *   - If parsed month < current month: use next year
   *
   * EXAMPLE: Today is Nov 8, 2025
   * - Email says "November 5" (no year) → parsed as 2024-11-05 (past)
   * - Month 11 >= current month 11 → correct to 2025-11-05
   * - Email says "January 15" (no year) → parsed as 2025-01-15 (past)
   * - Month 1 < current month 11 → correct to 2026-01-15
   *
   * @param {Object} parsedData - LLM parsed data with startDate/endDate
   * @returns {Object} Corrected data
   */
  static validateAndCorrectDates(parsedData) {
    if (!parsedData || !parsedData.startDate) {
      return parsedData;
    }

    const now = new Date();
    const startDate = new Date(parsedData.startDate);

    // If parsed date is in the past (more than 1 day ago)
    const oneDayAgo = new Date(now);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    if (startDate < oneDayAgo) {
      console.warn('=== PAST DATE DETECTED ===');
      console.warn('Parsed date:', parsedData.startDate);
      console.warn('Applying smart year correction...');

      // Extract month/day from parsed date
      const month = startDate.getMonth();
      const day = startDate.getDate();
      const currentMonth = now.getMonth();

      // Smart year inference:
      // - If month >= current month: use current year
      // - If month < current month: use next year
      const correctedYear = month >= currentMonth ? now.getFullYear() : now.getFullYear() + 1;

      // Rebuild date with corrected year, preserving time if present
      const corrected = new Date(startDate);
      corrected.setFullYear(correctedYear);
      parsedData.startDate = corrected.toISOString();

      console.log('Corrected startDate:', parsedData.startDate);

      // Also correct endDate if it exists and is in the past
      if (parsedData.endDate) {
        const endDate = new Date(parsedData.endDate);
        if (endDate < oneDayAgo) {
          const endMonth = endDate.getMonth();
          const correctedEndYear = endMonth >= currentMonth ? now.getFullYear() : now.getFullYear() + 1;
          const correctedEnd = new Date(endDate);
          correctedEnd.setFullYear(correctedEndYear);
          parsedData.endDate = correctedEnd.toISOString();
          console.log('Corrected endDate:', parsedData.endDate);
        }
      }
    }

    return parsedData;
  }


  /**
   * Extract business config fields from state
   * @param {object} config - Config object from state
   * @returns {object} Extracted business fields
   */
  static extractBusinessInfo(config) {
    return {
      businessName: config.companyName || 'My Business',
      businessEmail: config.companyEmail || '',
      businessPhone: config.companyPhone || '',
      businessWebsite: config.logoUrl || '',
      contactHandle: config.contactHandle || '',
      businessDescription: config.businessDescription || '',
      servicesPerformed: config.servicesPerformed || ''
    };
  }

  /**
   * Build formatted signature block, skipping empty fields
   * @param {object} businessInfo - Business information from extractBusinessInfo()
   * @param {string} userName - User's name (e.g., "Scott")
   * @returns {string} Formatted signature with conditional fields
   */
  static buildSignatureBlock(businessInfo, userName = '') {
    const lines = [];

    if (userName) lines.push(userName);
    if (businessInfo.businessName) lines.push(businessInfo.businessName);
    if (businessInfo.contactHandle) lines.push(businessInfo.contactHandle);
    if (businessInfo.businessPhone) lines.push( ValidationUtils.formatPhoneForDisplay(businessInfo.businessPhone));

    return lines.join('\n');
  }

  /**
   * Build common email formatting instructions for LLM prompts
   * @returns {string} Standard formatting instructions
   */
  static getEmailFormattingInstructions() {
    return `CRITICAL FORMATTING: Use proper paragraph spacing with blank lines between sections:
   - Greeting line (Dear [Name],)
   - BLANK LINE
   - Body paragraph(s)
   - BLANK LINE
   - Signoff line (Warm regards, Let's do it again, etc.)
   - BLANK LINE
   - Signature block: Include ONLY non-empty fields, each on separate line (Name, Company, Handle, Phone)
   - SKIP any empty/null fields - do NOT output blank lines for missing data`;
  }

  /**
   * Build conditional field warning for LLM prompts
   * @returns {string} Warning about skipping empty fields
   */
  static getConditionalFieldWarning() {
    return `IMPORTANT: Only include signature lines that have actual values. For example:
- If Website is empty: skip that line entirely
- If Handle is empty: skip that line entirely
- If Phone is empty: skip that line entirely
Never output empty lines for missing fields.`;
  }

  /**
   * Auto-complete endDate to match startDate if endDate is empty
   * Standardizes endDate auto-fill behavior across all pages
   * @param {string} startDateISO - ISO format date string (already parsed)
   * @param {object} state - State object with Booking property
   * @param {string} endDateSelector - CSS selector string for endDate input
   */
  static autoCompleteEndDate(startDateISO, state, endDateSelector) {
    // Auto-set endDate to match startDate if endDate is empty
    if (!state.Booking.endDate || state.Booking.endDate.trim() === '') {
      state.Booking.endDate = startDateISO;
      console.log('Auto-set endDate to match startDate:', startDateISO);

      // Update the endDate input field display
      const endDateInput = document.querySelector(endDateSelector);
      if (endDateInput) {
        endDateInput.value = DateTimeUtils.formatDateForDisplay(startDateISO);
      }
    }
  }

  /**
   * Save client and booking data to database via state.save()
   * Shared save logic for ClientCapture and Responder pages
   *
   * @param {object} state - State object with Client/Booking/Clients/Config properties
   * @param {object} options - Configuration options
   * @param {boolean} options.includeBooking - Whether to save Booking data (default: false)
   * @param {boolean} options.multiClient - Whether saving multiple clients (default: false)
   * @param {function} options.showToast - Toast notification function (msg, type)
   * @param {function} options.log - Logging function
   * @returns {Promise<{success: boolean, count: number, error?: string}>}
   */
  static async saveClientData(state, options = {}) {
    const {
      includeBooking = false,
      multiClient = false,
      showToast = () => {},
      log = () => {}
    } = options;

    try {
      let clientsToSave = [];

      if (multiClient) {
        // Multi-client mode (ClientCapture)
        clientsToSave = state.Clients.filter(clientData => {
          return clientData !== null &&
                 !(ValidationUtils.isEmpty(clientData.name) &&
                   ValidationUtils.isEmpty(clientData.email) &&
                   ValidationUtils.isEmpty(clientData.phone) &&
                   ValidationUtils.isEmpty(clientData.company) &&
                   ValidationUtils.isEmpty(clientData.clientNotes));
        });
      } else {
        // Single client mode (Responder, Booker, etc.)
        const clientData = state.Client;

        // Check if client has any meaningful data
        const hasData = !(ValidationUtils.isEmpty(clientData.name) &&
                         ValidationUtils.isEmpty(clientData.email) &&
                         ValidationUtils.isEmpty(clientData.phone) &&
                         ValidationUtils.isEmpty(clientData.company) &&
                         ValidationUtils.isEmpty(clientData.clientNotes));

        if (hasData) {
          clientsToSave = [clientData];
        }
      }

      if (clientsToSave.length === 0) {
        showToast('No data to save (all fields empty)', 'warning');
        log('Save skipped - no data');
        return { success: false, count: 0, error: 'No data to save' };
      }

      // Set state.Clients array
      state.setClients(clientsToSave);

      // Clear or preserve Booking based on includeBooking flag
      if (!includeBooking) {
        state.Booking = {};
      }

      // Clear Config (never save from these pages)
      state.Config = {};

      // Save - state.save() loops through Clients array internally
      await state.save();

      // Return success
      const count = clientsToSave.length;
      const msg = `Successfully saved ${count} client${count > 1 ? 's' : ''}`;
      showToast(msg, 'success');
      log(msg);

      return { success: true, count };

    } catch (error) {
      console.error('Error saving client data:', error);
      showToast(`Save failed: ${error.message}`, 'error');
      return { success: false, count: 0, error: error.message };
    }
  }
}
