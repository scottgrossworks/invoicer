/**
 * Thankyou - Page class for thank you note generation
 * Simplified view of booking data with LLM-powered thank you email generation
 * Similar to invoicer:
 *  -- procedural parse for name/email
 *  -- search DB for Client/Booking
 *  -- if found, display, else run parser
 *  -- include special info section for LLM prompt
 *  -- generate thank you note using LLM and open email compose window
 */

import { Page } from './Page.js';
import { DateTimeUtils } from '../utils/DateTimeUtils.js';
import { log, logError, showToast } from '../logging.js';
import { PageUtils } from '../utils/Page_Utils.js';

export class Thankyou extends Page {

  constructor(state) {
    super('thankyou', state);

    // Simplified fields for thank you display
    this.displayFields = [
      'name',      // Client name
      'email',     // Client email
      'title',     // Booking title
      'startDate', // Booking date
      'location'   // Booking location
    ];

    // Store special info for LLM prompt
    this.specialInfo = '';
  }

  /**
   * Initialize thank you page (called once on app startup)
   */
  async initialize() {
    // Wire up button handlers
    const clearBtn = document.getElementById('clearThankYouBtn');
    const writeBtn = document.getElementById('writeThankYouBtn');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }
    if (writeBtn) {
      writeBtn.addEventListener('click', () => this.onWrite());
    }

    // Setup settings button handler (reuses invoicer config)
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn && !settingsBtn.dataset.listenerBound) {
      settingsBtn.dataset.listenerBound = 'true';
      settingsBtn.addEventListener('click', async () => {
        await this.openSettings();
      });
    }
  }

  // openSettings() inherited from Page.js base class

  /**
   * Called when thank you page becomes visible
   */
  async onShow() {

    console.log('=== THANKYOU ONSHOW() DIAGNOSTIC ===');
    console.log('STATE at entry:', {
      hasClient: !!this.state.Client,
      clientName: this.state.Client?.name,
      clientEmail: this.state.Client?.email,
      clientNameType: typeof this.state.Client?.name,
      clientEmailType: typeof this.state.Client?.email,
      hasBooking: !!this.state.Booking,
      bookingTitle: this.state.Booking?.title,
      bookingLocation: this.state.Booking?.location,
      fullClient: this.state.Client,
      fullBooking: this.state.Booking
    });

    // Load Config data from DB if not already loaded (needed for thank you generation)
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

    console.log('DATA CHECK RESULTS:', {
      hasClientData: hasClientData,
      hasBookingData: hasBookingData,
      willRunParser: !(hasClientData || hasBookingData)
    });

    /*
    console.log('=== DATA CHECK ===');
    console.log('Client data:', {
      name: this.state.Client.name,
      email: this.state.Client.email,
      hasClientData: hasClientData
    });
    console.log('Booking data:', {
      title: this.state.Booking.title,
      location: this.state.Booking.location,
      hasBookingData: hasBookingData
    });
    console.log('Current _fromDB flag:', this.state.Client._fromDB);
    */

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
        // console.log('=== FINAL _fromDB FLAG:', this.state.Client._fromDB, '===');
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
    this.populateThankYouTable();
  }

  /**
   * Clear/reset thank you page to initial state
   */
  clear() {
    this.state.clear();
    this.specialInfo = ''; // Clear special info
    this.updateFromState(this.state);
    log('Cleared');
  }

  /**
   * Get action buttons for thank you page
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
    const table = document.getElementById('thankyou_table');
    if (table) {
      table.style.display = 'none';
    }

    // Hide special info section during loading
    const specialInfoSection = document.getElementById('special-info-section');
    if (specialInfoSection) {
      specialInfoSection.style.display = 'none';
    }

    // Hide button wrapper during loading
    const buttonWrapper = document.getElementById('thankyou-buttons');
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
    const table = document.getElementById('thankyou_table');
    if (table) {
      table.style.display = 'table';
    }

    // Show special info section after loading
    const specialInfoSection = document.getElementById('special-info-section');
    if (specialInfoSection) {
      specialInfoSection.style.display = 'block';
    }

    // Show button wrapper after loading
    const buttonWrapper = document.getElementById('thankyou-buttons');
    if (buttonWrapper) {
      buttonWrapper.style.display = 'flex';
    }
  }

  /**
   * Populate the thank you table with simplified booking/client fields
   * table appears with appropriate styling (honeydew + green border if client found in DB,
   *  normal styling otherwise).
   */
  populateThankYouTable() {
    const tbody = document.getElementById('thankyou_tbody');
    const table = document.getElementById('thankyou_table');
    if (!tbody || !table) return;

    // Clear existing rows
    tbody.innerHTML = '';

    // Check if client was found in DB and apply styling accordingly
    /*
    console.log('=== APPLYING TABLE STYLING ===');
    console.log('Checking _fromDB flag:', {
      flag: this.state.Client._fromDB,
      client: this.state.Client
    });
    */

    if (this.state.Client._fromDB) {
      table.classList.add('thankyou-table-from-db');
    } else {
      table.classList.remove('thankyou-table-from-db');
    }

    // Populate table with simplified fields
    this.displayFields.forEach(field => {
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
      }
      input.dataset.source = source;

      // Format dates for display
      if (field === 'startDate' && displayValue) {
        displayValue = DateTimeUtils.formatDateForDisplay(displayValue);
      }

      input.value = displayValue;

      // Wire up change handler
      input.addEventListener('blur', () => {
        let rawValue = input.value.trim();

        // Handle date fields
        if (field === 'startDate') {
          rawValue = DateTimeUtils.parseUserInputToISO(rawValue);
        }

        // Save to appropriate state object
        if (source === 'Client') {
          this.state.Client[field] = rawValue;
        } else if (source === 'Booking') {
          this.state.Booking[field] = rawValue;
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
      tbody.appendChild(row);
    });

    // Populate Special Info textarea (separate section below table)
    this.populateSpecialInfoSection();
  }

  /**
   * Populate special info textarea section
   * Calls base class implementation with textarea ID
   */
  populateSpecialInfoSection() {
    super.populateSpecialInfoSection('specialInfoTextarea');
  }

  /**
   * Override reloadParser to ONLY work on Gmail pages
   * ThankYou is specifically for extracting booking data from Gmail emails
   */
  async reloadParser() {
    // Get current URL
    const { url } = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'leedz_get_tab_url' }, resolve);
    });

    // Validate this is a Gmail page
    if (!url || !url.includes('mail.google.com')) {
      console.log('ThankYou page only works on Gmail - current URL:', url);
      showToast('ThankYou page requires a Gmail email to be open', 'warning');
      this.hideLoadingSpinner();
      return;
    }

    // Call parent implementation
    await super.reloadParser();
  }

  /**
   * Generate and send thank you email
   * Triggered by Write button
   */
  async onWrite() {
    try {
      // console.log('=== THANKYOU WRITE BUTTON CLICKED ===');

      // Validate we have required data
      if (!this.state.Client.name || !this.state.Client.email) {
        console.log('ERROR: Validation failed: Missing client name or email');
        showToast('Missing client name or email', 'error');
        return;
      }

      if (!this.state.Booking.title) {
        console.log('ERROR: Validation failed: Missing booking title');
        showToast('Missing booking information', 'error');
        return;
      }

      // Show loading state
      this.showLoadingSpinner();
      log('Generating thank you note...');

      // Generate thank you text using LLM
      const thankYouText = await this.generateThankYouText();

      /*
      console.log('generateThankYouText() returned:', {
        hasText: !!thankYouText,
        textLength: thankYouText ? thankYouText.length : 0,
        preview: thankYouText ? thankYouText.substring(0, 100) + '...' : 'null'
      });
      */

      if (!thankYouText) {
        console.log('ERROR: LLM returned null or empty text');
        showToast('Failed to generate thank you text', 'error');
        this.hideLoadingSpinner();
        return;
      }

      log('Thank you text generated successfully');

      // Get current tab and send message to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          const messagePayload = {
            action: 'openThankYou',
            clientEmail: this.state.Client.email,
            clientName: this.state.Client.name,
            subject: `Thank you, ${this.state.Client.name}`,
            body: thankYouText
          };

          /*
          console.log('Sending message to content script:', {
            tabId: tabs[0].id,
            action: messagePayload.action,
            subject: messagePayload.subject,
            bodyLength: messagePayload.body.length,
            bodyPreview: messagePayload.body.substring(0, 100) + '...'
          });
          */

          chrome.tabs.sendMessage(tabs[0].id, messagePayload, (response) => {
            if (chrome.runtime.lastError) {
              console.log('ERROR:  Error sending message to content script:', chrome.runtime.lastError);
              showToast('Failed to open compose window', 'error');

              this.hideLoadingSpinner();
            } else {
              // console.log('Content script response:', response);
              // log('Compose window opened');
              this.hideLoadingSpinner();

              // Close the sidebar to make room for email composition
              // FIXME FIXME FIXME 11/5: Is this working?
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
      logError('Thank you generation failed:', error);
      showToast('Error generating thank you', 'error');
      this.hideLoadingSpinner();
    }
  }

  /**
   * Generate thank you text using LLM
   * Combines Config (business info) + Client + Booking data
   */
  async generateThankYouText() {
    const prompt = this.buildThankYouPrompt();
    return await PageUtils.sendLLMRequest(prompt);
  }

  /**
   * Build LLM prompt for thank you note generation
   */
  buildThankYouPrompt() {
    // Extract business info using utility
    const businessInfo = PageUtils.extractBusinessInfo(this.state.Config);

    const clientName = this.state.Client.name || 'Client';
    const bookingTitle = this.state.Booking.title || 'service';
    const bookingDate = this.state.Booking.startDate || '';
    const location = this.state.Booking.location || '';
    const bookingNotes = this.state.Booking.notes || '';
    const specialInfo = this.specialInfo || '';

    // Build special info section for prompt
    const specialInfoSection = specialInfo.trim()
      ? `\nSPECIAL INFORMATION TO INCLUDE:
${specialInfo}

IMPORTANT: Naturally weave the special information above into the thank you note. Make it feel personal and authentic, not forced or templated. The special details should enhance the warmth and personalization of the message.`
      : '';

    // Build signature example using utility
    const signatureExample = PageUtils.buildSignatureBlock(businessInfo, 'Scott');

    return `ROLE: Generate a concise, warm thank you email to a client after completing a service.

BUSINESS INFORMATION:
- Company: ${businessInfo.businessName}
- Email: ${businessInfo.businessEmail}
- Phone: ${businessInfo.businessPhone}
- Website: ${businessInfo.businessWebsite}
- Handle: ${businessInfo.contactHandle}

CLIENT INFORMATION:
- Name: ${clientName}

BOOKING INFORMATION:
- Service: ${bookingTitle}
- Date: ${bookingDate}
- Location: ${location}
- Notes: ${bookingNotes}${specialInfoSection}

INSTRUCTIONS:
1. Write a natural, conversational thank you email (3-6 concise sentences)
2. Express genuine gratitude for their business
3. Reference the specific service/event that was completed
4. If special information is provided above, incorporate it into the message
5. Keep tone warm but professional
6. ${PageUtils.getEmailFormattingInstructions()}
7. DO NOT include subject line (will be added automatically)
8. Return ONLY the email body text, no explanations

EXAMPLE OUTPUT FORMAT (showing all fields populated):

Dear ${clientName},

Thank you for the fun party on ${bookingDate}. I really enjoyed drawing for ${bookingTitle}. ${specialInfo ? specialInfo : 'It was a pleasure working with you.'}

Warm regards,

${signatureExample}

${PageUtils.getConditionalFieldWarning()}`;
  }
}