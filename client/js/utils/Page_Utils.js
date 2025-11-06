/**
 * Page_Utils.js - Shared static utility methods for Page classes
 * Pure functions with no instance state dependency
 * Provides reusable functionality for email generation, LLM requests, and formatting
 */

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
    if (businessInfo.businessPhone) lines.push(businessInfo.businessPhone);

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
}
