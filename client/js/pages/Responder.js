/**
 * Responder - Page class for first contact response email generation
 * Extends DataPage for universal workflow
 * Auto-generates professional first response emails with rate info and booking invitation
 */

import { DataPage } from './DataPage.js';
import { DateTimeUtils } from '../utils/DateTimeUtils.js';
import { log, logError, showToast } from '../logging.js';
import { PageUtils } from '../utils/Page_Utils.js';
import { Calculator } from '../utils/Calculator.js';
import Client from '../db/Client.js';
import Booking from '../db/Booking.js';

export class Responder extends DataPage {

  constructor(state) {
    super('responder', state);

    // Full field list (all Client + Booking fields) like Booker
    this.clientFields = Client.getFieldNames();
    this.bookingFields = Booking.getFieldNames();

    // Store special info for LLM prompt (deposit policy, additional fees, etc.)
    this.specialInfo = '';

    // Track if client was loaded from database (persistent flag)
    this.clientFromDB = false;
  }

  /**
   * Initialize responder page (called once on app startup)
   */
  async initialize() {
    // Wire up button handlers
    const clearBtn = document.getElementById('clearResponderBtn');
    const saveBtn = document.getElementById('saveResponderBtn');
    const writeBtn = document.getElementById('writeResponderBtn');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveResponder());
    }
    if (writeBtn) {
      writeBtn.addEventListener('click', () => this.onWrite());
    }

    // Note: Settings button handler is in sidebar.js:setupHeaderButtons()
  }

  // openSettings() inherited from DataPage base class

  /**
   * DataPage hook: Run full parse (LLM extraction)
   * Responder is Gmail-only - validate URL before parsing
   */
  async fullParse() {
    // Validate this is a Gmail page
    const { url } = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'leedz_get_tab_url' }, resolve);
    });

    if (!url || !url.includes('mail.google.com')) {
      console.log('Responder page only works on Gmail - current URL:', url);
      return {
        success: false,
        error: 'Responder page requires a Gmail email to be open'
      };
    }

    // Use inherited reloadParser() with forceFullParse to skip prelim/DB (already done in DataPage.onShow)
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
    this.populateResponderTable();
    this._expandBookingAccordion();
  }

  /**
   * DataPage hook: Render data from database (with green styling)
   */
  async renderFromDB(dbData) {
    await this.state.loadConfigFromDB();

    // Set persistent flag - client was found in database
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

    this.populateResponderTable(true);
    this._expandBookingAccordion();
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

    this.populateResponderTable();
    this._expandBookingAccordion();
  }

  /**
   * Expand booking accordion when data arrives
   */
  _expandBookingAccordion() {
    const accordion = document.getElementById('booking-section-responder');
    if (accordion) {
      accordion.open = true;
    }
  }


  /**
   * Update UI from state changes
   */
  updateFromState(state) {
    this.state = state;
    this.populateResponderTable();
  }

  /**
   * Clear/reset responder page to initial state
   */
  clear() {
    this.state.clear();
    this.specialInfo = ''; // Clear special info
    this.clientFromDB = false; // Clear DB flag
    this.updateFromState(this.state);
    log('Cleared');
  }

  /**
   * Get action buttons for responder page
   * Returns null - buttons are statically defined in HTML and wired in initialize()
   */
  getActionButtons() {
    return null; // Don't create dynamic buttons
  }

  /**
   * Show loading spinner - override to hide special info section and buttons
   */
  showLoadingSpinner() {
    // Call parent method to handle spinner
    super.showLoadingSpinner();

    // Hide the table during loading
    const table = document.getElementById('responder_table');
    if (table) {
      table.style.display = 'none';
    }

    // Hide special info section during loading
    const specialInfoSection = document.getElementById('special-info-section-responder');
    if (specialInfoSection) {
      specialInfoSection.style.display = 'none';
    }

    // Hide button wrapper during loading
    const buttonWrapper = document.getElementById('responder-buttons');
    if (buttonWrapper) {
      buttonWrapper.style.display = 'none';
    }
  }

  /**
   * Hide loading spinner - override to show special info section and buttons
   */
  hideLoadingSpinner() {
    // Call parent method to handle spinner
    super.hideLoadingSpinner();

    // Show the table after loading
    const table = document.getElementById('responder_table');
    if (table) {
      table.style.display = 'table';
    }

    // Show special info section after loading
    const specialInfoSection = document.getElementById('special-info-section-responder');
    if (specialInfoSection) {
      specialInfoSection.style.display = 'block';
    }

    // Show button wrapper after loading
    const buttonWrapper = document.getElementById('responder-buttons');
    if (buttonWrapper) {
      buttonWrapper.style.display = 'flex';
    }
  }

  /**
   * Populate the responder table with all booking/client fields
   * table appears with appropriate styling (honeydew + green border if client found in DB,
   *  normal styling otherwise).
   * Rate fields (hourlyRate, flatRate, totalAmount) are highlighted with paleGreen + bold
   */
  populateResponderTable() {
    const tbody = document.getElementById('responder_tbody');
    const table = document.getElementById('responder_table');
    const bookingTbody = document.getElementById('responder_booking_tbody');
    const bookingTable = document.getElementById('responder_booking_table');
    if (!tbody || !table) return;

    // Clear existing rows
    tbody.innerHTML = '';
    if (bookingTbody) bookingTbody.innerHTML = '';

    // Check if client was found in DB using persistent flag
    // Use persistent flag OR transient state flag (for backward compatibility)
    if (this.clientFromDB || this.state.Client._fromDB) {
      table.classList.add('responder-table-from-db');
      if (bookingTable) bookingTable.classList.add('responder-table-from-db');
    } else {
      table.classList.remove('responder-table-from-db');
      if (bookingTable) bookingTable.classList.remove('responder-table-from-db');
    }

    // Populate CLIENT fields
    this.clientFields.forEach(field => {
      if (field === 'id' || field === 'createdAt' || field === 'updatedAt') return;

      const row = document.createElement('tr');

      // Field name cell
      const nameCell = document.createElement('td');
      nameCell.className = 'field-name';
      nameCell.textContent = field;

      // Field value cell with editable input
      const valueCell = document.createElement('td');
      valueCell.className = 'field-value';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'editable-field';
      input.value = this.state.Client[field] || '';
      input.dataset.fieldName = field;
      input.dataset.source = 'Client';

      // Wire up change handler
      input.addEventListener('blur', () => {
        const rawValue = input.value.trim();
        this.state.Client[field] = rawValue;
      });

      // Wire up Enter key handler to commit changes
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur(); // Trigger blur handler to commit changes
        }
      });

      valueCell.appendChild(input);
      row.appendChild(nameCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });

    // Populate BOOKING fields into accordion table
    const bookingTarget = bookingTbody || tbody;
    const rateFields = ['hourlyRate', 'flatRate', 'totalAmount'];
    const skipFields = ['id', 'clientId', 'createdAt', 'updatedAt', ...rateFields];

    this.bookingFields.forEach(field => {
      if (skipFields.includes(field)) return;

      const row = document.createElement('tr');

      // Field name cell
      const nameCell = document.createElement('td');
      nameCell.className = 'field-name';
      nameCell.textContent = field;

      // Field value cell with editable input
      const valueCell = document.createElement('td');
      valueCell.className = 'field-value';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'editable-field';

      // Get value and format dates
      let displayValue = this.state.Booking[field] || '';
      if ((field === 'startDate' || field === 'endDate') && displayValue) {
        displayValue = DateTimeUtils.formatDateForDisplay(displayValue);
      }

      input.value = displayValue;
      input.dataset.fieldName = field;
      input.dataset.source = 'Booking';

      // Wire up change handler
      input.addEventListener('blur', () => {
        let rawValue = input.value.trim();

        // Handle date fields
        if (field === 'startDate' || field === 'endDate') {
          rawValue = DateTimeUtils.parseDisplayDateToISO(rawValue);
        }

        this.state.Booking[field] = rawValue;

        // Auto-set endDate to match startDate if endDate is empty
        if (field === 'startDate' && rawValue) {
          PageUtils.autoCompleteEndDate(rawValue, this.state, '[data-field="endDate"]');
        }
      });

      // Wire up Enter key handler to commit changes
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur(); // Trigger blur handler to commit changes
        }
      });

      valueCell.appendChild(input);
      row.appendChild(nameCell);
      row.appendChild(valueCell);
      bookingTarget.appendChild(row);
    });

    // Populate Booking rate fields using Calculator
    // No duration field for Responder - defaults to 1 internally
    Calculator.renderFields(
      bookingTarget,
      this.state.Booking,
      () => this.updateFromState(this.state),
      { includeDuration: false }
    );

    // Populate Special Info textarea (separate section below table)
    this.populateSpecialInfoSection();
  }

  /**
   * Populate special info textarea section
   * Calls base class implementation with textarea ID
   */
  populateSpecialInfoSection() {
    super.populateSpecialInfoSection('specialInfoTextarea-responder');
  }


  /**
   * Generate and send first response email
   * Triggered by Write button
   */
  async onWrite() {
    try {
      // Validate we have required data
      if (!this.state.Client.name || !this.state.Client.email) {
        console.log('ERROR: Validation failed: Missing client name or email');
        showToast('Missing client name or email', 'error');
        return;
      }

      // Validate rate fields using Calculator
      const validation = Calculator.validateRates(this.state.Booking);
      if (!validation.valid) {
        showToast(validation.message, 'error');
        return;
      }

      // Show loading state
      this.showLoadingSpinner();
      log('Generating response email...');

      // Generate response text using LLM
      const responseText = await this.generateResponderEmail();

      if (!responseText) {
        console.log('ERROR: LLM returned null or empty text');
        showToast('Failed to generate response email', 'error');
        this.hideLoadingSpinner();
        return;
      }

      log('Response email generated successfully');

      // Get current tab and send message to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          const messagePayload = {
            action: 'openResponder',
            clientEmail: this.state.Client.email,
            clientName: this.state.Client.name,
            subject: `Re: ${this.state.Booking.title || 'Your Inquiry'}`,
            body: responseText
          };

          chrome.tabs.sendMessage(tabs[0].id, messagePayload, (response) => {
            if (chrome.runtime.lastError) {
              console.log('ERROR:  Error sending message to content script:', chrome.runtime.lastError);
              showToast('Failed to open compose window', 'error');
              this.hideLoadingSpinner();
            } else {
              this.hideLoadingSpinner();

              // Close the sidebar to make room for email composition
              chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleSidebar' }, () => {
                console.log('Leedz sidebar closed');
              });
            }
          });
        } else {
          console.log('ERROR: No active tab found');
          showToast('No active tab found', 'error');
          this.hideLoadingSpinner();
        }
      });

    } catch (error) {
      logError('Response email generation failed:', error);
      showToast('Error generating response', 'error');
      this.hideLoadingSpinner();
    }
  }

  /**
   * Generate first response email text using LLM
   * Combines Config (business info + description) + Client + Booking data
   */
  async generateResponderEmail() {
    const prompt = this.buildResponderPrompt();
    return await PageUtils.sendLLMRequest(prompt);
  }

  /**
   * Save client and booking data to database
   * Uses shared utility for consistent save logic
   */
  async saveResponder() {
    // Use shared utility for save logic
    await PageUtils.saveClientData(this.state, {
      includeBooking: true,  // Responder saves both Client AND Booking
      multiClient: false,
      showToast,
      log: (msg) => log(msg)
    });
    // Do NOT clear form after save - user may want to edit and re-save
  }

  /**
   * Build LLM prompt for first response email generation
   */
  buildResponderPrompt() {
    // Extract business info using utility
    const businessInfo = PageUtils.extractBusinessInfo(this.state.Config);

    const clientFirstName = this.state.Client.name?.split(' ')[0] || 'Client';
    const bookingDate = this.state.Booking.startDate || '';
    const bookingTitle = this.state.Booking.title || 'your event';
    const hourlyRate = this.state.Booking.hourlyRate || 0;
    const flatRate = this.state.Booking.flatRate || 0;
    const totalAmount = this.state.Booking.totalAmount || 0;
    const specialInfo = this.specialInfo || '';

    // Generate rate text based on what user entered
    let rateText = '';
    if (hourlyRate > 0) {
      rateText = `My rate is $${hourlyRate}/hr`;
    } else if (flatRate > 0) {
      rateText = `My flat rate is $${flatRate}`;
    }

    // Get response example from config
    const responseExample = this.state.leedzConfig?.responderEmail?.responseExample || '';

    // Build signature example using utility
    const signatureExample = PageUtils.buildSignatureBlock(businessInfo, 'Scott');

    return `Generate a professional first contact response email.

CLIENT: ${clientFirstName}
EVENT: ${bookingTitle} on ${bookingDate}
RATE: ${rateText}
${specialInfo ? `SPECIAL NOTES: ${specialInfo}` : ''}

BUSINESS INFO:
${businessInfo.businessName} - ${businessInfo.servicesPerformed}
${businessInfo.businessDescription}
${businessInfo.businessEmail} | ${businessInfo.businessPhone}
${businessInfo.businessWebsite ? businessInfo.businessWebsite : ''}
${businessInfo.contactHandle ? businessInfo.contactHandle : ''}

EXAMPLE (match this tone, length, and style):
${responseExample}

End the email with this signature block:
${signatureExample}

Write the response email body only (no subject line). Return plain text.`;
  }
}
