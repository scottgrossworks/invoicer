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
    if (settingsBtn) {
      settingsBtn.addEventListener('click', async () => {
        await this.openSettings();
      });
    }
  }

  /**
   * Open PDF settings page (same as Invoicer)
   */
  async openSettings() {
    try {
      // Save current state if it has valid client data
      if (this.state.Client.name && this.state.Client.name.trim() !== '') {
        await this.state.save();
      }

      // Dynamic import of PDF settings - use absolute path from extension root
      const settingsUrl = chrome.runtime.getURL('js/settings/PDF_settings.js');
      const { default: PDF_settings } = await import(settingsUrl);
      const pdfSettings = new PDF_settings(this.state);
      await pdfSettings.open();

    } catch (error) {
      console.error('Failed to open settings:', error);
      showToast('Settings error', 'error');
    }
  }

  /**
   * Called when thank you page becomes visible
   */
  async onShow() {
    
    // Load Config data from DB if not already loaded (needed for thank you generation)
    // console.log('Loading Config from DB...');
    // console.log('Config BEFORE loadConfigFromDB():', this.state.Config);

    await this.state.loadConfigFromDB();

    // console.log('Config AFTER loadConfigFromDB():', this.state.Config);
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

      // Field value cell (read-only display)
      const valueCell = document.createElement('td');
      valueCell.className = 'field-value';

      // Get value from state (check both Client and Booking)
      let displayValue = this.state.Client[field] || this.state.Booking[field] || '';

      // Format dates for display
      if (field === 'startDate' && displayValue) {
        displayValue = DateTimeUtils.formatDateForDisplay(displayValue);
      }

      // Create read-only span (not editable)
      const span = document.createElement('span');
      span.textContent = displayValue;
      valueCell.appendChild(span);

      row.appendChild(nameCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });

    // Populate Special Info textarea (separate section below table)
    this.populateSpecialInfoSection();
  }

  /**
   * Populate special info textarea section
   */
  populateSpecialInfoSection() {
    const textarea = document.getElementById('specialInfoTextarea');
    if (!textarea) return;

    textarea.value = this.specialInfo || '';

    // Wire up input handler if not already done
    if (!textarea.dataset.handlerWired) {
      textarea.addEventListener('input', (e) => {
        this.specialInfo = e.target.value;
      });
      textarea.dataset.handlerWired = 'true';
    }
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
    try {
      // Load config
      const configResponse = await fetch(chrome.runtime.getURL('leedz_config.json'));
      const config = await configResponse.json();

      if (!config.llm || !config.llm.baseUrl) {
        console.error('LLM configuration missing or invalid');
        throw new Error('LLM configuration not found');
      }

      /*
      console.log('LLM config loaded:', {
        baseUrl: config.llm.baseUrl,
        provider: config.llm.provider,
        maxTokens: config.llm.max_tokens
      });
      */

      // Build prompt with business info, client, and booking data
      const prompt = this.buildThankYouPrompt();

      /*
      console.log('LLM Prompt built:', {
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200) + '...'
      });
      console.log('Full LLM Prompt:', prompt);
      */

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

      // console.log('Sending LLM request to:', llmRequest.url);

      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'leedz_llm_request', request: llmRequest },
          (response) => {
            if (chrome.runtime.lastError) {
              console.log('ERROR: LLM request chrome.runtime error:', chrome.runtime.lastError);
              resolve(null);
            } else if (response?.ok && response?.data) {
              // console.log('LLM response received successfully');
              // console.log('Full LLM response:', response);

              const contentArray = response.data.content;
              const firstContent = contentArray?.[0];
              const textContent = firstContent?.text || firstContent;

              /*
              console.log('Extracted text content:', {
                hasContent: !!textContent,
                contentLength: textContent ? textContent.length : 0,
                contentPreview: textContent ? textContent.substring(0, 200) + '...' : 'null'
              });
              console.log('Full extracted text:', textContent);
              */

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
      console.error('Exception in generateThankYouText:', error);
      return null;
    }
  }

  /**
   * Build LLM prompt for thank you note generation
   */
  buildThankYouPrompt() {

    const businessName = this.state.Config.companyName || 'My Business';
    const businessEmail = this.state.Config.companyEmail || '';
    const businessWebsite = this.state.Config.logoUrl || '';

    const clientName = this.state.Client.name || 'Client';
    const bookingTitle = this.state.Booking.title || 'service';
    const bookingDate = this.state.Booking.startDate || '';
    const location = this.state.Booking.location || '';
    const bookingNotes = this.state.Booking.notes || '';
    const specialInfo = this.specialInfo || '';

    /*
    console.log('Prompt variables:', {
      businessName,
      businessEmail,
      businessWebsite,
      clientName,
      bookingTitle,
      bookingDate,
      location,
      bookingNotes,
      specialInfo,
      specialInfoLength: specialInfo.length
    });
    */

    // Build special info section for prompt
    const specialInfoSection = specialInfo.trim()
      ? `\nSPECIAL INFORMATION TO INCLUDE:
${specialInfo}

IMPORTANT: Naturally weave the special information above into the thank you note. Make it feel personal and authentic, not forced or templated. The special details should enhance the warmth and personalization of the message.`
      : '';

    return `ROLE: Generate a concise, warm thank you email to a client after completing a service.

BUSINESS INFORMATION:
- Company: ${businessName}
- Email: ${businessEmail}
- Website: ${businessWebsite}

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
6. Include a simple closing and signature from the company info
7. DO NOT include subject line (will be added automatically)
8. Return ONLY the email body text, no explanations

EXAMPLE OUTPUT FORMAT:

Dear ${clientName},

Thank you for the fun party on ${bookingDate}. I really enjoyed drawing for ${bookingTitle}. ${specialInfo ? specialInfo : 'It was a pleasure working with you.'}

Please follow me on IG @thatdrawingshow and contact me again for another caricature party, or to draw a commission for a gift.

Let's do it again,

${businessName}
${businessEmail}`;
  }
}