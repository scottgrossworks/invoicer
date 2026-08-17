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
import { showToast, buildLLMErrorMessage } from '../logging.js';
import { loadPromptFile, fillPrompt } from '../utils/PromptLoader.js';

// Adjunct prompt file (prompts are never hardcoded in JS - edit the JSON)
const PROMPT_PATH = 'js/parser/GMAIL_PROMPT.json';
import Client from '../db/Client.js';
import Booking from '../db/Booking.js';

// Global CONFIG variable
let CONFIG = null;

// INBOX CATCHER (2026-08-14, PRECRIME build item #4): platform-notification
// sender domains. An email from one of these relays SOMEONE ELSE'S post (a FB
// group post, Nextdoor digest, Google Alert, Craigslist alert) — the platform
// is never the client; the POSTER is, and the post text is the demand signal.
// Detection is by sender-domain suffix; the extraction rules ride in
// GMAIL_PROMPT.json inboxDemandNote via the existing weak-identity machinery.
const PLATFORM_NOTIFICATION_DOMAINS = [
  'facebookmail.com', 'facebook.com',
  'nextdoor.com', 'email.nextdoor.com', 'ss.email.nextdoor.com',
  'craigslist.org', 'reply.craigslist.org'
];
// Google Alerts come from googlealerts-noreply@google.com — match the local
// part, not google.com (which would swallow every gmail correspondent's relay).
const PLATFORM_NOTIFICATION_LOCALPARTS = ['googlealerts'];

function isPlatformNotificationSender(email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e || !e.includes('@')) return false;
  const [local, domain] = e.split('@');
  if (PLATFORM_NOTIFICATION_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return true;
  return PLATFORM_NOTIFICATION_LOCALPARTS.some(p => local.startsWith(p));
}

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

  /**
   * Is an individual conversation THREAD open (vs. the inbox/list view)?
   * The extension digests one thread between two people - an inbox full of
   * preview rows is unparseable noise and must never reach the LLM.
   * An open conversation renders a subject line (h2.hP) and sender chips
   * (.gD[email]) - the same selectors _extractEmailAndName already trusts.
   * The list view renders neither.
   * @returns {boolean}
   */
  _isThreadOpen() {
    if (document.querySelector('h2.hP, .gD[email], .gD > span[email]')) return true;
    // Fallback if Gmail ever renames those classes: a thread URL appends a
    // long message-id segment to the view hash (#inbox/FMfcgzQhVW...).
    const seg = (window.location.hash || '').split('/').pop() || '';
    return /^[A-Za-z0-9_-]{20,}$/.test(seg);
  }

  async initialize(state) {
    this.STATE = state;
    this.STATE.clear();
    this._inboxDemand = false;   // set per-parse when the sender is a platform notification
  }

  /**
   * Quick extraction of name and email only (for DB lookup before full parse)
   * Overrides EventParser base method
   * @returns {Promise<Object|null>} {email, name} or null
   */
  async quickExtractIdentity() {
    // No thread open = no identity. THROW rather than return null so the
    // sidebar can tell "nothing is open" apart from "a thread is open but I
    // could not read it" - the first must blank the form, the second may fall
    // back to cached STATE. Returning null for both rendered the PREVIOUS
    // thread's client on the inbox view (2026-08-11).
    if (!this._isThreadOpen()) throw new Error('NO_THREAD_OPEN');
    const emailData = this._extractEmailAndName();
    // Platform notification (inbox catcher): "Facebook" is not an identity.
    // Return null so the sidebar does NOT look up / render the platform as a
    // client — the real poster only emerges from the full LLM parse.
    if (emailData && isPlatformNotificationSender(emailData.email)) return null;
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
    if (senderData && isPlatformNotificationSender(senderData.email)) {
      // INBOX CATCHER (2026-08-14): a platform notification's sender identity is
      // GARBAGE — "Facebook" must never become a client name and
      // noreply@facebookmail.com must never become a client email. Push an empty
      // weak identity so the LLM (told via inboxDemandNote) supplies the POSTER's
      // name, and an email only if it appears verbatim in the post
      // (Parser._applyWeakIdentityOverride enforces both).
      this._inboxDemand = true;
      clients.push({ email: null, name: null, _identityWeak: true });
    } else if (senderData && (senderData.email || senderData.name)) {
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

    const booking = {
      // 'inbox' = demand relayed by a platform notification (the inbox catcher,
      // 2026-08-14): PRECRIME treats these as own-inbox demand leads.
      source: this._inboxDemand ? 'inbox' : 'gmail'
    };
    if (this._inboxDemand) {
      // THE POST LINK IS THE PAYLOAD (2026-08-17). The notification email body
      // carries only the poster's name and a TRUNCATED one-line ask — the real
      // information is behind the "View" link. Saved as Booking.sourceUrl it
      // (a) passes PRECRIME's drill evidence gate and (b) gives DRILL_DOWN the
      // exact page to open through the user's logged-in Chrome.
      const postUrl = this._extractPostLink();
      if (postUrl) booking.sourceUrl = postUrl;
    }
    return booking;
  }

  /**
   * Find the platform post permalink in the open notification email (the View
   * button / post link). Skips unsubscribe/settings/help links. Returns the
   * first plausible post URL in DOM order, or null.
   */
  _extractPostLink() {
    try {
      const anchors = document.querySelectorAll('[role="main"] a[href]');
      const POST_SHAPES = [
        /facebook\.com\/(n\/|groups\/|permalink|story|.*story_fbid)/i,
        /nextdoor\.com\/(p\/|news_feed|post)/i,
        /craigslist\.org\/.+\.html/i
      ];
      for (const a of anchors) {
        const href = a.href || '';
        const label = (a.textContent || '').trim().toLowerCase();
        if (/unsubscribe|learn more|settings|help|privacy/.test(label)) continue;
        if (/unsubscribe|\/settings|\/help|\/legal/i.test(href)) continue;
        if (POST_SHAPES.some(re => re.test(href))) return href;
      }
      return null;
    } catch (e) {
      console.warn('[GmailParser] post-link extraction failed:', e.message);
      return null;
    }
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
      const prompt = await this._buildLLMPrompt(emailData, content, CONFIG.gmailParser);
      // console.log(`[GmailParser] sending to LLM: ${content.length} chars of thread content`);
      const response = await this._sendLLMRequest(llmConfig, prompt);

      if (!response?.ok) {
        // NOT a code fault (bad key, out of credits, rate limit) - console.warn,
        // never console.error. Throw so the SIDEBAR can raise one authoritative
        // error toast; a toast raised here lands in the Gmail page's document,
        // which the sidebar's toast cannot see or suppress.
        const llmMsg = buildLLMErrorMessage(response);
        console.warn(`[GmailParser] LLM request failed (${response?.status ?? 'no status'}): ${llmMsg}`);
        throw new Error('LLM_ERROR:' + llmMsg);
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
      // A user-actionable LLM failure (out of credits, bad key, rate limit)
      // must reach the sidebar, which owns the single error toast. Swallowing
      // it here produced a blank parse reported as "Page parsed successfully".
      if (String(error.message).startsWith('LLM_ERROR:')) throw error;
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

      const prompt = await this._buildRepairPrompt(content, failedFields);
      const response = await this._sendLLMRequest(llmConfig, prompt);
      if (!response?.ok) return null;

      const textContent = this._extractLLMText(llmConfig, response);
      return textContent
        ? this._parseRepairResponse(textContent, scrubbed, failedFields)
        : null;
    } catch (error) {
      // Best-effort second opinion - a failure here is NOT a code fault, the
      // first-pass extraction is kept with the unverified field left blank.
      console.warn('[GmailParser] Double-check pass could not run:', error.message);
      return null;
    }
  }

  /**
   * Best-effort JSON extraction from a model response. Models append prose,
   * wrap output in fences, or truncate; none of that should cost us the
   * answer. Tries the greedy {...} span first, then a brace-balanced prefix
   * (which drops any trailing commentary).
   * @param {string} raw - raw model text
   * @returns {Object|null} parsed object, or null if nothing salvageable
   */
  _salvageJson(raw) {
    const text = String(raw == null ? '' : raw)
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const start = text.indexOf('{');
    if (start === -1) return null;

    const attempts = [];
    const last = text.lastIndexOf('}');
    if (last > start) attempts.push(text.slice(start, last + 1));

    // Brace-balanced prefix (string-aware so braces inside values don't count)
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) { attempts.push(text.slice(start, i + 1)); break; }
    }

    for (const candidate of attempts) {
      try { return JSON.parse(candidate); } catch (e) { /* try the next shape */ }
    }
    return null;
  }

  /**
   * Parse the repair-pass response and merge it onto the first-pass extraction.
   *
   * The prompt asks for a FLAT map of the failed field paths only
   * ({"Booking.endTime": "10:00 PM"}). Only the fields that were actually
   * queried are applied - anything else the model volunteers is ignored, so a
   * chatty response cannot overwrite good data. The caller RE-VERIFIES the
   * merged result against the email, so a wrong answer here is still scrubbed.
   *
   * Still accepts the older nested {Client, Booking, Config} shape in case the
   * model answers that way.
   *
   * @param {string} content - Raw LLM response text
   * @param {Object} scrubbed - first-pass extraction with failed fields nulled
   * @param {string[]} failedFields - e.g. ['Booking.endTime']
   * @returns {Object|null} nested {Client, Booking, Config} or null
   */
  _parseRepairResponse(content, scrubbed, failedFields) {
    const parsed = this._salvageJson(content);
    if (!parsed) {
      console.warn('[GmailParser] Double-check pass returned unusable JSON - keeping first-pass data');
      return null;
    }

    // Older/nested shape - pass straight through.
    if (parsed.Client || parsed.Booking) {
      return {
        Client: parsed.Client || {},
        Booking: parsed.Booking || {},
        Config: parsed.Config || {}
      };
    }

    // Flat field-path map: merge ONLY the fields we asked about.
    const merged = {
      Client: { ...(scrubbed?.Client || {}) },
      Booking: { ...(scrubbed?.Booking || {}) },
      Config: { ...(scrubbed?.Config || {}) }
    };

    let applied = 0;
    for (const path of (failedFields || [])) {
      if (!Object.prototype.hasOwnProperty.call(parsed, path)) continue;
      const dot = String(path).indexOf('.');
      if (dot < 1) continue;
      const section = path.slice(0, dot);
      const field = path.slice(dot + 1);
      if (!merged[section] || !field) continue;
      merged[section][field] = parsed[path]; // null is a valid answer ("not in the email")
      applied++;
    }

    if (applied === 0) {
      console.warn('[GmailParser] Double-check pass answered none of the queried fields - keeping first-pass data');
      return null;
    }

    return merged;
  }

  /**
   * Build the repair prompt from GMAIL_PROMPT.json (repair block). Asks for the
   * failed fields ONLY - the extraction is deliberately NOT echoed back, since
   * re-emitting description text full of quotes is what made the model produce
   * unparseable JSON (2026-08-11).
   */
  async _buildRepairPrompt(content, failedFields) {
    const P = await loadPromptFile(PROMPT_PATH);
    return fillPrompt(P.repair.lines, {
      fields: (failedFields || []).join(', '),
      currentYear: new Date().getFullYear(),
      content
    });
  }

  /**
   * Override EventParser parse() to add post-processing
   */
  async parse(state) {
    // SHORTCUT (2026-08-11): nothing but the inbox/list view is open, so there
    // is NOTHING to parse - bail before any extraction or LLM request. The
    // sentinel error is recognized by Page.reloadParser, which clears the form.
    if (!this._isThreadOpen()) {
      console.log('[GmailParser] No conversation thread open - skipping parse');
      throw new Error('NO_THREAD_OPEN');
    }

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



  /**
   * Assemble the full extraction prompt from GMAIL_PROMPT.json fragments around
   * the main system prompt (leedz_config.json gmailParser.systemPrompt).
   * Header identity is METADATA, not ground truth — a shared inbox
   * ("USU Events4" <usuevents4@csun.edu>) is a mailbox, not a person; the real
   * client is usually the human in the SIGNATURE BLOCK (2026-07-22 fix, the
   * prose for which lives in the JSON's headerMetadata/weakInboxNote blocks).
   */
  async _buildLLMPrompt(emailData, threadContent, parserConfig) {
    const P = await loadPromptFile(PROMPT_PATH);

    // Inbox catcher outranks the generic shared-inbox note: a platform
    // notification needs the POSTER-is-the-client rules, not the
    // signature-block hunt (there is no signature — the sender is a robot).
    const weakNote = this._inboxDemand
      ? fillPrompt(P.inboxDemandNote.lines, {})
      : (this.STATE?.Client?._identityWeak ? fillPrompt(P.weakInboxNote.lines, {}) : '');
    const headerMetadata = fillPrompt(P.headerMetadata.lines, {
      headerName: emailData.name || 'N/A',
      headerEmail: emailData.email || 'N/A',
      weakNote
    });

    // Runtime seller-identity block (U9), built from STATE.BusinessIdentity.
    const sellerIdentity = this._buildIdentityBlock(P);

    // Inject current date context for smart date parsing
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

    const systemPrompt = (parserConfig?.systemPrompt || fillPrompt(P.fallbackSystemPrompt.lines, {}))
      .replace(/\{\{CURRENT_DATE\}\}/g, currentDate)
      .replace(/\{\{CURRENT_YEAR\}\}/g, currentYear)
      .replace(/\{\{NEXT_YEAR\}\}/g, currentYear + 1);

    return fillPrompt(P.assembly.lines, {
      systemPrompt,
      sellerIdentity,
      headerMetadata,
      content: threadContent
    });
  }

  /**
   * Build the seller-identity block from STATE.BusinessIdentity using the
   * sellerIdentity fragment in GMAIL_PROMPT.json. Returns '' when identity is
   * unavailable (the shared IdentityFilter still removes the seller procedurally).
   * @param {Object} P - loaded GMAIL_PROMPT.json
   * @returns {string}
   */
  _buildIdentityBlock(P) {
    const bi = this.STATE && this.STATE.BusinessIdentity;
    if (!bi) return '';
    return fillPrompt(P.sellerIdentity.lines, {
      sellerName: bi.sellerName || 'unknown',
      companyName: bi.companyName || 'unknown',
      emails: (bi.excludedEmails && bi.excludedEmails.length)
        ? bi.excludedEmails.join(', ')
        : (bi.companyEmail || 'unknown'),
      phones: (bi.excludedPhones && bi.excludedPhones.length)
        ? bi.excludedPhones.join(', ')
        : (bi.companyPhone || 'unknown')
    });
  }



  // _sendLLMRequest() and _extractLLMText() inherited from Parser base class -
  // provider (anthropic/openrouter) is selected by CONFIG.llm.type, not hardcoded here.
  // _parseLLMResponse() inherited from Parser base class
  // Transforms flat LLM JSON response into nested Client/Booking structure

}

export default GmailParser;