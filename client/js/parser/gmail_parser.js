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
import { verifyBookingExtraction } from '../utils/DateEvidence.js';
import { loadConfig } from '../utils/ConfigLoader.js';
import { isWeakIdentity } from '../utils/IdentityFilter.js';
import { showToast, showLLMError } from '../logging.js';
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
      // ConfigLoader merges LLM_KEY.json into llm['api-key'] — a raw fetch of
      // leedz_config.json here shipped an EMPTY key and every LLM call 401'd
      // ("x-api-key header is required"). Fixed 2026-07-21.
      CONFIG = await loadConfig();
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
   * Extract client candidates from the Gmail header (sender + recipients).
   * Seller identity is removed later by the shared IdentityFilter in EventParser.parse()
   * (U9) - this method no longer filters here, so all parsers exclude the seller uniformly.
   * @returns {Array<Object>} Array with clients from sender and recipient(s)
   */
  async extractClientData() {
    const clients = [];

    // Client 1: Sender
    const senderData = this._extractEmailAndName();
    if (senderData && (senderData.email || senderData.name)) {
      clients.push({
        email: senderData.email || null,
        name: senderData.name || null,
        // Shared/generic inbox ("USU Events4" <usuevents4@...>)? Then this header
        // identity is TENTATIVE: the real person is usually in the signature block,
        // which only the LLM can read. The flag lets the LLM override name/email
        // (see Parser._applyWeakIdentityOverride). 2026-07-22 fix.
        _identityWeak: isWeakIdentity(senderData.name, senderData.email)
      });
    }

    // Client 2+: Recipient(s)
    const recipients = this._extractRecipients();
    if (recipients && recipients.length > 0) {
      recipients.forEach(recipient => {
        if (recipient.email || recipient.name) {
          clients.push({
            email: recipient.email || null,
            name: recipient.name || null
          });
        }
      });
    }

    return clients;
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
        throw new Error('llm settings missing or invalid in leedz_config.json (baseUrl / endpoints)');
      }

      // Build prompt with known client data from headers
      const emailData = {
        name: this.STATE.Client?.name,
        email: this.STATE.Client?.email
      };
      const prompt = this._buildLLMPrompt(emailData, content, CONFIG.gmailParser);
      // console.log(`[GmailParser] sending to LLM: ${content.length} chars of thread content`);
      const response = await this._sendLLMRequest(llmConfig, prompt);

      if (!response?.ok) {
        // One neat line - the user-facing detail is in the toast (showLLMError)
        console.error(`[GmailParser] LLM request failed (${response?.status ?? 'no status'}): ${response?.error?.message || response?.error?.type || response?.error || 'no response'}`);
        showLLMError(response);
        return null;
      }

      const textContent = this._extractLLMText(llmConfig, response);

      const parsedResult = textContent ? this._parseLLMResponse(textContent) : null;
      if (!parsedResult) {
        console.error('[GmailParser] LLM responded but JSON parse produced null. Raw head:', String(textContent).slice(0, 300));
        showToast('AI returned an unusable response - press Parse to try again.', 'error');
        return null;
      }
      // console.log('[GmailParser] LLM extracted:', JSON.stringify({ Client: parsedResult.Client, Booking: parsedResult.Booking }).slice(0, 400));

      // Source-evidence verification (U11): scrub any date/time the LLM returned that is
      // not supported by the email text. One repair pass on the failed fields, then
      // re-verify. Surviving failures stay null - better blank than hallucinated.
      const opts = { baseDate: new Date(), source: 'gmail' };
      let verification = verifyBookingExtraction(parsedResult, content, opts);

      if (!verification.ok) {
        // NOT an error - routine double-check. These fields weren't found verbatim
        // in the email text, so ask the AI to re-confirm just those before trusting
        // them (better a blank field than a hallucinated one).
        console.log('[GmailParser] Double-checking fields not found verbatim in email:', verification.errors.join(', '));
        const repaired = await this._repairLLMExtraction(verification.scrubbed, content, verification.errors);
        // GUARD (2026-07-22, the data-destroyer bug): only accept a repair result
        // that actually contains data. The old code re-verified whatever came back —
        // an empty parse re-verified "ok" and silently REPLACED the entire first-pass
        // extraction with nothing. Better a first-pass result with a nulled field
        // than a wiped one.
        const usable = repaired && (
          (repaired.Client && Object.keys(repaired.Client).length > 0) ||
          (repaired.Booking && Object.keys(repaired.Booking).length > 0)
        );
        if (usable) {
          verification = verifyBookingExtraction(repaired, content, opts);
        } else if (repaired) {
          console.warn('[GmailParser] repair returned an EMPTY result — keeping first-pass data (failed fields stay null)');
        }
      }

      if (!verification.ok) {
        // Attach verification detail so the UI can warn about unverified fields.
        verification.scrubbed._verification = { errors: verification.errors };
      }

      return verification.scrubbed;

    } catch (error) {
      console.error('LLM processing failed:', error);
      showToast(`AI parsing failed: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * One repair pass over the fields that failed source verification. Asks the LLM to
   * re-extract ONLY the failed fields from literal text, returning null when absent.
   * @param {Object} scrubbed - the verified result with failed fields nulled
   * @param {string} content - the email source text
   * @param {string[]} failedFields - e.g. ['Booking.startTime']
   * @returns {Promise<Object|null>} nested {Client, Booking, Config} or null
   */
  async _repairLLMExtraction(scrubbed, content, failedFields) {
    try {
      await this._initializeConfig();
      const llmConfig = CONFIG.llm;
      if (!llmConfig?.baseUrl || !llmConfig?.endpoints?.completions) return null;

      const prompt = this._buildRepairPrompt(scrubbed, content, failedFields);
      const response = await this._sendLLMRequest(llmConfig, prompt);
      if (!response?.ok) return null;

      const textContent = this._extractLLMText(llmConfig, response);
      // The repair prompt demands NESTED {Client, Booking, Config} JSON, but
      // _parseLLMResponse only maps FLAT keys — it turned every nested repair
      // response into {Client:{},Booking:{}} and wiped the extraction (2026-07-22).
      return textContent ? this._parseRepairResponse(textContent) : null;
    } catch (error) {
      console.error('Date/time repair pass failed:', error);
      return null;
    }
  }

  /**
   * Parse the repair-pass response. Accepts the NESTED {Client, Booking, Config}
   * shape the repair prompt demands; falls back to the flat-field parser when the
   * model returned flat keys anyway.
   * @param {string} content - Raw LLM response text
   * @returns {Object|null} nested {Client, Booking, Config} or null
   */
  _parseRepairResponse(content) {
    try {
      const jsonText = String(content).replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      const match = jsonText.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      if (parsed && (parsed.Client || parsed.Booking)) {
        return {
          Client: parsed.Client || {},
          Booking: parsed.Booking || {},
          Config: parsed.Config || {}
        };
      }
      return this._parseLLMResponse(content);
    } catch (error) {
      console.error('Date/time repair pass failed:', error);
      return null;
    }
  }

  /**
   * Build the repair prompt (version-controlled here rather than leedz_config.json, which
   * is gitignored). Mirrors the agent_shareLeed repair.json contract: correct only failed
   * fields from literal text, never guess, return complete JSON with the same keys.
   */
  _buildRepairPrompt(scrubbed, content, failedFields) {
    const currentYear = new Date().getFullYear();
    const fields = (failedFields || []).join(', ');
    return `You previously extracted booking fields from a Gmail thread. These fields could ` +
      `not be verified against the email text: ${fields}.\n\n` +
      `Re-examine the email and CORRECT only those fields. All other fields pass through unchanged.\n\n` +
      `CORRECTION RULES:\n` +
      `1. Re-extract the failed fields ONLY from text literally present in the email body.\n` +
      `2. If a field is not literally present, return null for that field.\n` +
      `3. DO NOT GUESS. DO NOT INFER AM/PM. DO NOT HALLUCINATE TIMES OR DATES.\n` +
      `4. Do not modify any field not in the failed list.\n` +
      `5. startDate/endDate are ISO YYYY-MM-DD; if the email has no year use ${currentYear}; ` +
      `never roll a no-year date into next year.\n` +
      `6. Times are 12-hour with AM/PM (e.g. "7:00 PM"); return null if no time with AM/PM ` +
      `context is literally present.\n` +
      `7. Return COMPLETE JSON with the same nested keys as the original ({Client, Booking, Config}).\n\n` +
      `Original extraction:\n${JSON.stringify(scrubbed)}\n\n` +
      `Email thread:\n${content}\n\n` +
      `Return JSON only. No markdown fences, no commentary.`;
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
        } 
      }
      // console.log("Gmail parser could not find a primary sender element.");
      return { email: null, name: null };
    
    } catch (error) {
      console.error('Error extracting email/name:', error);
      return { email: null, name: null };
    }
  }

  /**
   * Extract recipient(s) from Gmail "To:" field
   * @returns {Array<Object>} Array of recipient objects [{email, name}, ...]
   */
  _extractRecipients() {
    try {
      const recipients = [];

      // Find recipient elements in the "To:" field
      // Gmail uses .g2 for recipient container, and .hB for individual recipients
      const recipientElements = document.querySelectorAll('.hB[email], .g2 [email]');

      if (recipientElements.length > 0) {
        recipientElements.forEach(el => {
          // Skip if this element is in a quote block
          if (el.closest('.gmail_quote')) return;

          const email = el.getAttribute('email');
          const rawName = el.getAttribute('name') || el.textContent?.trim();
          const name = this._normalizeName(rawName);

          // Only add if we have at least email or name
          if (email || name) {
            recipients.push({ email, name });
          }
        });
      }

      return recipients;
    } catch (error) {
      console.error('Error extracting recipients:', error);
      return [];
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





  // _conservativeUpdate() is inherited from Parser base class.
  // Gmail procedurally extracts name/email from headers first; the LLM normally
  // only fills blanks — EXCEPT when the header identity is a shared/generic inbox
  // (_identityWeak), where Parser._applyWeakIdentityOverride lets a signature-block
  // person name (and a verbatim-in-thread email) replace the mailbox label.



  _buildLLMPrompt(emailData, threadContent, parserConfig) {
    // Header identity is METADATA, not ground truth — a shared inbox
    // ("USU Events4" <usuevents4@csun.edu>) is a mailbox, not a person. The
    // real client is usually the human in the SIGNATURE BLOCK (name, title,
    // direct phone). The old wording ("Sender Name: ...") anchored the LLM on
    // the mailbox label and suppressed signature detection. 2026-07-22 fix.
    const weakNote = this.STATE?.Client?._identityWeak
      ? `\nNOTE: the header identity above looks like a SHARED/GENERIC inbox, not a person. ` +
        `Find the actual PERSON who wrote the message — check the signature block for their ` +
        `name, title, and direct phone, and return THAT as the client name/phone.`
      : '';
    const knownInfo =
      `EMAIL HEADER METADATA (may be a shared mailbox — verify against the message text):\n` +
      `Header Name: ${emailData.name || 'N/A'}\nHeader Email: ${emailData.email || 'N/A'}` +
      weakNote +
      `\n\nCLIENT IDENTITY RULES:\n` +
      `1. The client is the PERSON who wrote the inquiry — prefer the signature block ` +
      `(name / title / direct phone) over the mailbox display name.\n` +
      `2. Only return an email address that literally appears in the headers or message text.\n` +
      `3. Extract the client's phone from the signature when present.`;

    // Runtime seller-identity block (U9) - replaces the hardcoded seller exclusions that
    // used to live in leedz_config.json prompts. Built from STATE.BusinessIdentity.
    const identityBlock = this._buildIdentityBlock();

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

    return `${systemPrompt}\n${identityBlock}\n${knownInfo}\n\nEmail Thread Content:\n${threadContent}`;
  }

  /**
   * Build a runtime seller-identity block for the LLM prompt from STATE.BusinessIdentity.
   * Instructs the LLM never to extract the seller as the client. Returns '' when identity
   * is unavailable (the shared IdentityFilter still removes the seller procedurally).
   * @returns {string}
   */
  _buildIdentityBlock() {
    const bi = this.STATE && this.STATE.BusinessIdentity;
    if (!bi) return '';
    const emails = (bi.excludedEmails && bi.excludedEmails.length)
      ? bi.excludedEmails.join(', ')
      : (bi.companyEmail || 'unknown');
    const phones = (bi.excludedPhones && bi.excludedPhones.length)
      ? bi.excludedPhones.join(', ')
      : (bi.companyPhone || 'unknown');
    return `\nSELLER IDENTITY (NEVER extract these as the client - they are the seller/user, ` +
      `appearing in From: headers and quoted "On ... wrote:" reply markers):\n` +
      `- Name: ${bi.sellerName || 'unknown'}\n` +
      `- Company: ${bi.companyName || 'unknown'}\n` +
      `- Emails: ${emails}\n` +
      `- Phones: ${phones}\n`;
  }



  // _sendLLMRequest() and _extractLLMText() inherited from Parser base class -
  // provider (anthropic/openrouter) is selected by CONFIG.llm.type, not hardcoded here.
  // _parseLLMResponse() inherited from Parser base class
  // Transforms flat LLM JSON response into nested Client/Booking structure

}

export default GmailParser;