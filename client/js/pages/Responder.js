/**
 * Responder - Page class for first contact response email generation
 * Auto-generates professional first response emails with rate info and booking invitation
 * Architecture mirrors ThankYou.js but serves opposite end of sales cycle:
 *  -- procedural parse for name/email
 *  -- search DB for Client/Booking
 *  -- if found, display, else run parser
 *  -- include special info section for LLM prompt
 *  -- generate first response email using LLM and open email compose window
 */

import { Page } from './Page.js';
import { DateTimeUtils } from '../utils/DateTimeUtils.js';
import { log, logError, showToast } from '../logging.js';
import { PageUtils } from '../utils/Page_Utils.js';
import Client from '../db/Client.js';
import Booking from '../db/Booking.js';

export class Responder extends Page {

  constructor(state) {
    super('responder', state);

    // Full field list (all Client + Booking fields) like Invoicer
    this.clientFields = Client.getFieldNames();
    this.bookingFields = Booking.getFieldNames();

    // Store special info for LLM prompt (deposit policy, additional fees, etc.)
    this.specialInfo = '';
  }

  /**
   * Initialize responder page (called once on app startup)
   */
  async initialize() {
    // Wire up button handlers
    const clearBtn = document.getElementById('clearResponderBtn');
    const writeBtn = document.getElementById('writeResponderBtn');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }
    if (writeBtn) {
      writeBtn.addEventListener('click', () => this.onWrite());
    }

    // Setup settings button handler (reuses invoicer config)
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', async () => {
        await this.openSettings();
      });
    }
  }

  // openSettings() inherited from Page.js base class

  /**
   * Called when responder page becomes visible
   */
  async onShow() {

    // Load Config data from DB if not already loaded (needed for response generation)
    await this.state.loadConfigFromDB();

    console.log('Config details:', {
      hasConfig: !!this.state.Config,
      hasCompanyName: !!(this.state.Config?.companyName),
      companyName: this.state.Config?.companyName,
      companyEmail: this.state.Config?.companyEmail,
      fullConfig: this.state.Config
    });

    // Check if Config was actually loaded from DB and has data
    const hasConfigData = this.state.Config && (
      this.state.Config.companyName ||
      this.state.Config.companyEmail ||
      this.state.Config.companyAddress
    );

    if (!hasConfigData) {
      console.log('Config exists but is empty - no business data configured');
      showToast('No business configuration found - please configure in Settings', 'warning');
    } else {
      console.log('Config loaded successfully from DB:', this.state.Config.companyName);
    }

    // Check if we have existing data
    const hasClientData = this.state.Client.name || this.state.Client.email;
    const hasBookingData = this.state.Booking.title || this.state.Booking.location;

    if (hasClientData || hasBookingData) {
      console.log('✓ Has data - checking DB for existing client...');

      // We have data - but we need to check DB to set _fromDB flag
      // (flag gets stripped during state save/load, so we must refresh it)

      if (!window.DB_LAYER) {
        console.log('ERROR:  DB_LAYER not available!');
        showToast('Database connection unavailable', 'error');
        this.state.Client._fromDB = false;
      } else if (!this.state.Client.email && !this.state.Client.name) {
        console.log('ERROR: No email or name to search with');
        this.state.Client._fromDB = false;
      } else {
          console.log('DB_LAYER available, searching for client:', {
          email: this.state.Client.email,
          name: this.state.Client.name
        });

        const dbClient = await window.DB_LAYER.searchClient(
          this.state.Client.email,
          this.state.Client.name
        );


        console.log('DB search results:', {
          found: !!dbClient,
          clientData: dbClient
        });


        this.state.Client._fromDB = (dbClient) ? true : false;
      }

      // Now populate and show UI
      this.updateFromState(this.state);
    } else {
      console.log('No DB data found - running parser...');
      // No data - run parser (it handles showing/hiding spinner)
      await this.reloadParser();
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
    if (!tbody || !table) return;

    // Clear existing rows
    tbody.innerHTML = '';

    // Check if client was found in DB and apply styling accordingly
    if (this.state.Client._fromDB) {
      table.classList.add('responder-table-from-db');
    } else {
      table.classList.remove('responder-table-from-db');
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

      valueCell.appendChild(input);
      row.appendChild(nameCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });

    // Populate BOOKING fields
    this.bookingFields.forEach(field => {
      if (field === 'id' || field === 'clientId' || field === 'createdAt' || field === 'updatedAt') return;

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

      // CRITICAL: Highlight rate fields that user must fill in
      // Apply to entire row, not just input
      if (field === 'hourlyRate' || field === 'flatRate' || field === 'totalAmount') {
        row.style.backgroundColor = 'paleGreen';
        input.style.backgroundColor = 'transparent';
        input.style.fontWeight = 'bold';
      }

      // Wire up change handler
      input.addEventListener('blur', () => {
        let rawValue = input.value.trim();

        // Handle date fields
        if (field === 'startDate' || field === 'endDate') {
          rawValue = DateTimeUtils.parseUserInputToISO(rawValue);
        }

        this.state.Booking[field] = rawValue;

        // Auto-calculate total amount when rate/duration changes
        if (field === 'hourlyRate' || field === 'duration') {
          this.calculateTotal();
        }

        // If flatRate is set, update totalAmount initially
        if (field === 'flatRate') {
          const flatRate = parseFloat(rawValue) || 0;
          if (flatRate > 0 && !this.state.Booking.totalAmount) {
            this.state.Booking.totalAmount = flatRate;
            this.updateFromState(this.state);
          }
        }
      });

      valueCell.appendChild(input);
      row.appendChild(nameCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });

    // Populate Special Info textarea (separate section below table)
    this.populateSpecialInfoSection();
  }

  /**
   * Auto-calculate totalAmount based on hourlyRate * duration
   */
  calculateTotal() {
    const hourlyRate = parseFloat(this.state.Booking.hourlyRate) || 0;
    const duration = parseFloat(this.state.Booking.duration) || 0;

    if (hourlyRate > 0 && duration > 0) {
      this.state.Booking.totalAmount = hourlyRate * duration;
      this.updateFromState(this.state);
    }
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

      // CRITICAL: Validate rate fields are filled in
      const hourlyRate = parseFloat(this.state.Booking.hourlyRate) || 0;
      const flatRate = parseFloat(this.state.Booking.flatRate) || 0;
      const totalAmount = parseFloat(this.state.Booking.totalAmount) || 0;

      if (hourlyRate === 0 && flatRate === 0) {
        showToast('Please enter hourly rate or flat rate', 'error');
        return;
      }

      if (totalAmount === 0) {
        showToast('Please enter total amount', 'error');
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
                console.log('Sidebar closed');
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

    // Build signature example using utility
    const signatureExample = PageUtils.buildSignatureBlock(businessInfo, 'Scott');

    return `ROLE: Generate a professional first contact response email for a potential client inquiry.

BUSINESS INFORMATION:
- Company: ${businessInfo.businessName}
- Email: ${businessInfo.businessEmail}
- Phone: ${businessInfo.businessPhone}
- Website: ${businessInfo.businessWebsite}
- Handle: ${businessInfo.contactHandle}
- Services: ${businessInfo.servicesPerformed}
- Description: ${businessInfo.businessDescription}

CLIENT INFORMATION:
- Name: ${clientFirstName}

BOOKING INFORMATION:
- Event Date: ${bookingDate}
- Service: ${bookingTitle}
- Hourly Rate: ${hourlyRate}
- Flat Rate: ${flatRate}
- Total Amount: ${totalAmount}

RATE TEXT (use this):
${rateText}

SPECIAL NOTES (place RIGHT AFTER rate):
${specialInfo}

INSTRUCTIONS:
1. Write a professional, warm first contact email
2. Express enthusiasm about performing service for the event
3. Include business description naturally
4. Use RATE TEXT provided above (already formatted)
5. Place SPECIAL NOTES immediately after rate statement (deposit policy, additional fees)
6. ${PageUtils.getEmailFormattingInstructions()}
7. Invite client to book the date
8. DO NOT include subject line (will use Re: original subject)
9. Return ONLY the email body text

EXAMPLE OUTPUT FORMAT (showing all fields populated):

Dear ${clientFirstName},

I would be delighted to [perform service] for you on ${bookingDate}.

[Business description]

${rateText}

${specialInfo}

Let's book this date,

${signatureExample}

${PageUtils.getConditionalFieldWarning()}`;
  }
}
