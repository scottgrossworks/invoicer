/**
 * Outreach - THE consolidated email page (Outreach + Respond + Thank You).
 *
 * Extends DataPage: parses the open email thread in the background
 * (non-blocking) and shows a compact client/booking table.
 *
 * Workflow:
 *   1. User types a HINT into the Draft box:
 *        "Thank you, Cindy for the fun birthday party"
 *        "Respond that I'm available"
 *        "Not available - offer to find another artist"
 *   2. WRITE sends hint + parsed Client/Booking + VALUE_PROP business
 *      identity to the LLM; the finished draft replaces the hint in the
 *      Draft box. User can edit it, or press Write again (with tweaks)
 *      to refine.
 *   3. EMAIL sends the Draft box contents to Gmail compose on the
 *      current thread.
 *
 * If VALUE_PROP identity is missing/insufficient, the LLM is instructed
 * to say so in the returned text rather than inventing details.
 */

import { DataPage } from './DataPage.js';
import { DateTimeUtils } from '../utils/DateTimeUtils.js';
import { log, logError, showToast } from '../logging.js';
import { PageUtils } from '../utils/Page_Utils.js';

export class Outreach extends DataPage {

  constructor(state) {
    super('outreach', state);

    // Compact display: who + what + when + where
    this.displayFields = [
      'name',      // Client name
      'email',     // Client email
      'title',     // Booking title
      'startDate', // Booking date
      'location'   // Booking location
    ];

    // Draft box contents (hint before Write, generated draft after)
    this.draft = '';

    // Track if client was loaded from database (persistent flag)
    this.clientFromDB = false;
  }

  /**
   * Initialize outreach page (called once on app startup)
   * Note: Settings/reload button handlers are in sidebar.js:setupHeaderButtons()
   */
  async initialize() {
    const clearBtn = document.getElementById('clearOutreachBtn');
    const writeBtn = document.getElementById('writeOutreachBtn');
    const emailBtn = document.getElementById('emailOutreachBtn');

    if (clearBtn) clearBtn.addEventListener('click', () => this.clear());
    if (writeBtn) writeBtn.addEventListener('click', () => this.onWrite());
    if (emailBtn) emailBtn.addEventListener('click', () => this.onEmail());
  }

  /**
   * DataPage hook: Run full parse (LLM extraction)
   */
  async fullParse() {
    await this.reloadParser({ forceFullParse: true });
    return { success: true, data: this.state.toObject() };
  }

  /**
   * DataPage hook: Render data from STATE cache
   */
  async renderFromState(stateData) {
    await this.state.loadConfigFromDB();
    if (stateData) {
      Object.assign(this.state.Client, stateData.Client || {});
      Object.assign(this.state.Booking, stateData.Booking || {});
    }
    this.populateOutreachTable();
  }

  /**
   * DataPage hook: Render data from database (with green styling)
   */
  async renderFromDB(dbData) {
    await this.state.loadConfigFromDB();

    this.clientFromDB = true;

    Object.assign(this.state.Client, {
      name: dbData.name || '',
      email: dbData.email || '',
      phone: dbData.phone || '',
      company: dbData.company || '',
      website: dbData.website || '',
      clientNotes: dbData.clientNotes || '',
      _fromDB: true
    });

    if (dbData.bookings?.length > 0) {
      Object.assign(this.state.Booking, {
        ...dbData.bookings[0],
        _fromDB: true
      });
    }

    this.populateOutreachTable();
  }

  /**
   * DataPage hook: Render data from fresh parse
   */
  async renderFromParse(parseResult) {
    await this.state.loadConfigFromDB();

    if (parseResult.data?.Client) {
      Object.assign(this.state.Client, parseResult.data.Client);
    }
    if (parseResult.data?.Booking) {
      Object.assign(this.state.Booking, parseResult.data.Booking);
    }

    this.populateOutreachTable();
  }

  /**
   * Update UI from state changes
   */
  updateFromState(state) {
    this.state = state;
    this.populateOutreachTable();
  }

  /**
   * Clear the Draft box ONLY - the parsed Client/Booking table stays.
   * (Reload arrow is the way to re-parse the page from scratch.)
   */
  clear() {
    this.draft = '';
    const box = document.getElementById('draftTextarea-outreach');
    if (box) box.value = '';
    log('Draft cleared');
  }

  /**
   * Buttons are statically defined in HTML and wired in initialize()
   */
  getActionButtons() {
    return null;
  }

  /**
   * Show loading spinner - hide table, draft section, buttons
   */
  showLoadingSpinner() {
    super.showLoadingSpinner();

    const table = document.getElementById('outreach_table');
    if (table) table.style.display = 'none';

    const draftSection = document.getElementById('draft-section-outreach');
    if (draftSection) draftSection.style.display = 'none';

    const buttonWrapper = document.getElementById('outreach-buttons');
    if (buttonWrapper) buttonWrapper.style.display = 'none';
  }

  /**
   * Hide loading spinner - show table, draft section, buttons
   */
  hideLoadingSpinner() {
    super.hideLoadingSpinner();

    const table = document.getElementById('outreach_table');
    if (table) table.style.display = 'table';

    const draftSection = document.getElementById('draft-section-outreach');
    if (draftSection) draftSection.style.display = 'block';

    const buttonWrapper = document.getElementById('outreach-buttons');
    if (buttonWrapper) buttonWrapper.style.display = 'flex';
  }

  /**
   * Populate the compact client/booking table + Draft box
   */
  populateOutreachTable() {
    const tbody = document.getElementById('outreach_tbody');
    const table = document.getElementById('outreach_table');
    if (!tbody || !table) return;

    tbody.innerHTML = '';

    // Green styling if client from DB
    if (this.clientFromDB || this.state.Client._fromDB) {
      table.classList.add('outreach-table-from-db');
    } else {
      table.classList.remove('outreach-table-from-db');
    }

    this.displayFields.forEach(field => {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.className = 'field-name';
      nameCell.textContent = (field === 'startDate') ? 'date' : field;

      const valueCell = document.createElement('td');
      valueCell.className = 'field-value';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'editable-field';
      input.dataset.fieldName = field;

      // Determine source (Client or Booking) and get value
      let displayValue = '';
      let source = '';
      if (this.state.Client[field] !== undefined) {
        displayValue = this.state.Client[field] || '';
        source = 'Client';
      } else if (this.state.Booking[field] !== undefined) {
        displayValue = this.state.Booking[field] || '';
        source = 'Booking';
      } else {
        source = (field === 'name' || field === 'email') ? 'Client' : 'Booking';
      }
      input.dataset.source = source;

      if (field === 'startDate' && displayValue) {
        displayValue = DateTimeUtils.formatDateForDisplay(displayValue);
      }

      input.value = displayValue;

      input.addEventListener('blur', () => {
        let rawValue = input.value.trim();
        if (field === 'startDate') {
          rawValue = DateTimeUtils.parseDisplayDateToISO(rawValue);
        }
        if (source === 'Client') {
          this.state.Client[field] = rawValue;
        } else {
          this.state.Booking[field] = rawValue;
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });

      valueCell.appendChild(input);
      row.appendChild(nameCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });

    // Draft box - keep whatever the user typed / LLM generated
    const box = document.getElementById('draftTextarea-outreach');
    if (box) {
      box.value = this.draft || '';
      if (!box.dataset.handlerWired) {
        box.addEventListener('input', (e) => {
          this.draft = e.target.value;
        });
        box.dataset.handlerWired = 'true';
      }
    }
  }

  /**
   * Light spinner for Write: the Client/Booking table STAYS visible;
   * only the Draft box + buttons swap out for the spinner beneath the table.
   * (The full-page spinner is reserved for the initial parse workflow.)
   */
  _showWriteSpinner() {
    const spinner = document.getElementById('loading_spinner_outreach');
    if (spinner) {
      // Move spinner below the table (it sits above it in the static HTML)
      spinner.parentElement.appendChild(spinner);
      spinner.style.display = 'block';
    }
    const draftSection = document.getElementById('draft-section-outreach');
    if (draftSection) draftSection.style.display = 'none';
    const buttonWrapper = document.getElementById('outreach-buttons');
    if (buttonWrapper) buttonWrapper.style.display = 'none';
  }

  _hideWriteSpinner() {
    const spinner = document.getElementById('loading_spinner_outreach');
    if (spinner) spinner.style.display = 'none';
    const draftSection = document.getElementById('draft-section-outreach');
    if (draftSection) draftSection.style.display = 'block';
    const buttonWrapper = document.getElementById('outreach-buttons');
    if (buttonWrapper) buttonWrapper.style.display = 'flex';
  }

  /**
   * WRITE: send hint/draft + Client/Booking + VALUE_PROP to the LLM,
   * display the finished draft back in the Draft box for editing.
   */
  async onWrite() {
    try {
      const box = document.getElementById('draftTextarea-outreach');
      const hint = (box ? box.value : this.draft || '').trim();

      this._showWriteSpinner();
      log('Writing draft...');

      const prompt = this.buildWritePrompt(hint);
      const text = await PageUtils.sendLLMRequest(prompt);

      if (!text) {
        showToast('Failed to generate draft', 'error');
        return;
      }

      // Generated draft replaces the hint - user can edit or re-Write
      this.draft = text.trim();
      if (box) box.value = this.draft;

      log('Draft ready - edit it, press Write to refine, or Email to send');
    } catch (error) {
      logError('Draft generation failed:', error);
      showToast('Error generating draft', 'error');
    } finally {
      this._hideWriteSpinner();
    }
  }

  /**
   * EMAIL: send the Draft box contents to Gmail compose on this thread
   */
  async onEmail() {
    const box = document.getElementById('draftTextarea-outreach');
    const body = (box ? box.value : this.draft || '').trim();

    if (!body) {
      showToast('Draft is empty - press Write first', 'warning');
      return;
    }
    if (!this.state.Client.email) {
      showToast('Missing client email', 'error');
      return;
    }

    const clientName = this.state.Client.name || this.state.Client.email;
    const subject = this.state.Booking.title
      ? `Re: ${this.state.Booking.title}`
      : `For ${clientName}`;

    this.showLoadingSpinner();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        showToast('No active tab found', 'error');
        this.hideLoadingSpinner();
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'openOutreach',
        clientEmail: this.state.Client.email,
        clientName: clientName,
        subject: subject,
        body: body
      }, () => {
        if (chrome.runtime.lastError) {
          logError('Error opening compose window:', chrome.runtime.lastError);
          showToast('Failed to open compose window', 'error');
          this.hideLoadingSpinner();
          return;
        }
        this.hideLoadingSpinner();

        // Close the sidebar to make room for email composition.
        // Reading lastError marks it "checked" - the sidebar may tear down
        // before the reply lands, which is expected here, not an error.
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleSidebar' }, () => {
          void chrome.runtime.lastError;
          // console.log('Leedz sidebar closed');
        });
      });
    });
  }

  /**
   * Build the Write prompt: user hint + known Client/Booking facts +
   * VALUE_PROP business identity, synthesized into one email draft.
   * @param {string} hint - Draft box contents (may be empty)
   */
  buildWritePrompt(hint) {
    const businessInfo = PageUtils.extractBusinessInfo(this.state.Config);
    const identityBlocked = this.state.isIdentityBlocked();

    const c = this.state.Client;
    const b = this.state.Booking;

    // Only include facts we actually have - never invite invention
    const clientLines = [
      c.name ? `- Name: ${c.name}` : null,
      c.email ? `- Email: ${c.email}` : null,
      c.company ? `- Company: ${c.company}` : null
    ].filter(Boolean).join('\n') || '- (none known)';

    const rate = b.totalAmount ? `$${b.totalAmount} total`
      : b.hourlyRate ? `$${b.hourlyRate}/hr`
      : b.flatRate ? `$${b.flatRate} flat`
      : null;

    const bookingLines = [
      b.title ? `- Event: ${b.title}` : null,
      b.startDate ? `- Date: ${b.startDate}` : null,
      b.startTime ? `- Time: ${b.startTime}${b.endTime ? ' - ' + b.endTime : ''}` : null,
      b.location ? `- Location: ${b.location}` : null,
      b.description ? `- Description: ${b.description}` : null,
      rate ? `- Rate: ${rate}` : null,
      b.notes ? `- Notes: ${b.notes}` : null
    ].filter(Boolean).join('\n') || '- (none known)';

    const businessBlock = identityBlocked
      ? '(VALUE_PROP business identity is NOT loaded)'
      : `${businessInfo.businessName} - ${businessInfo.servicesPerformed}
${businessInfo.businessDescription}
${businessInfo.businessEmail} | ${businessInfo.businessPhone}
${businessInfo.businessWebsite || ''}
${businessInfo.contactHandle || ''}`;

    const signatureExample = PageUtils.buildSignatureBlock(businessInfo, 'Scott');

    return `ROLE: Draft one client email for a service business, following the user's instruction below.

USER INSTRUCTION (a hint like "thank Cindy for the party", "say I'm available", "decline but offer to find another provider" - OR a full draft to refine):
${hint || '(none given - write a brief professional outreach introducing the business to this client)'}

KNOWN CLIENT:
${clientLines}

KNOWN BOOKING:
${bookingLines}

BUSINESS IDENTITY (from VALUE_PROP):
${businessBlock}

INSTRUCTIONS:
1. Synthesize the user instruction with the known client/booking facts into one plausible, warm, professional email (3-6 concise sentences).
2. Use ONLY facts listed above - NEVER invent names, dates, rates, or services.
3. If the business identity is missing or lacks information needed to follow the instruction, SAY SO plainly at the top of your reply instead of inventing details.
4. If the instruction is to decline and offer to find another provider, politely decline and ask for any event details still unknown above (date, time, location, budget) so a referral can be arranged.
5. If the user gave a full draft, refine it - keep their voice and intent.
6. ${PageUtils.getEmailFormattingInstructions()}
7. DO NOT include a subject line.
8. Return ONLY the email body text, no explanations.

End the email with this signature block:
${signatureExample}`;
  }
}
