/**
 * Outreach - Page class for proactive outreach email generation
 * Generates professional outreach emails to potential clients BEFORE booking
 * Parses page to extract multiple clients, cycles through them with reload button
 */

import { Page } from './Page.js';
import { log, logError, showToast } from '../logging.js';
import { PageUtils } from '../utils/Page_Utils.js';
import { Calculator } from '../utils/Calculator.js';

export class Outreach extends Page {

  constructor(state) {
    super('outreach', state);

    // Store special info for LLM prompt
    this.specialInfo = '';

    // Client cycling (like Client Capture but displays one at a time)
    this.clients = [];           // Array of parsed clients from page
    this.currentClientIndex = 0; // Index of currently displayed client
  }

  /**
   * Initialize outreach page (called once on app startup)
   */
  async initialize() {
    // Wire up button handlers
    const clearBtn = document.getElementById('clearOutreachBtn');
    const writeBtn = document.getElementById('writeOutreachBtn');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }
    if (writeBtn) {
      writeBtn.addEventListener('click', () => this.onWrite());
    }

    // Setup settings button handler (reuses invoicer config)
    const settingsBtn = document.getElementById('settingsBtnOutreach');
    if (settingsBtn && !settingsBtn.dataset.listenerBound) {
      settingsBtn.dataset.listenerBound = 'true';
      settingsBtn.addEventListener('click', async () => {
        await this.openSettings();
      });
    }

    // Setup reload button handler - CYCLES through clients
    const reloadBtn = document.getElementById('reloadBtnOutreach');
    if (reloadBtn && !reloadBtn.dataset.listenerBound) {
      reloadBtn.dataset.listenerBound = 'true';
      reloadBtn.addEventListener('click', async () => {
        await this.cycleToNextClient();
      });
    }
  }

  /**
   * Called when outreach page becomes visible
   */
  async onShow() {
    // Load Config data from DB if not already loaded
    await this.state.loadConfigFromDB();

    const hasConfigData = this.state.Config && (
      this.state.Config.companyName ||
      this.state.Config.companyEmail ||
      this.state.Config.companyAddress
    );

    if (!hasConfigData) {
      console.log('Config exists but is empty - no business data configured');
      showToast('No business configuration found - please configure in Settings', 'warning');
    }

    // Check if we have clients array or single client in state
    const hasClientsArray = this.state.Clients && this.state.Clients.length > 0;
    const hasClientData = this.state.Client.name || this.state.Client.email;

    if (hasClientsArray) {
      // Load clients array from state
      console.log('Has Clients array - loading from state');
      this.clients = this.state.Clients.map(c => ({ ...c }));
      this.currentClientIndex = 0;
      this.loadCurrentClient();
      this.updateFromState(this.state);
    } else if (hasClientData) {
      // Single client in state - convert to array
      console.log('Has Client data - converting to array');
      this.clients = [{ ...this.state.Client }];
      this.currentClientIndex = 0;
      this.loadCurrentClient();
      this.updateFromState(this.state);
    } else {
      console.log('No data found - running parser...');
      await this.reloadParser();
    }
  }

  /**
   * Load current client from clients array into state
   */
  loadCurrentClient() {
    if (this.clients.length === 0) return;

    // Wrap around if index exceeds array bounds
    if (this.currentClientIndex >= this.clients.length) {
      this.currentClientIndex = 0;
    }

    const currentClient = this.clients[this.currentClientIndex];

    // Copy current client to state.Client
    Object.assign(this.state.Client, currentClient);

    // Check if client is from DB
    if (window.DB_LAYER && currentClient.email) {
      window.DB_LAYER.searchClient(currentClient.email, currentClient.name)
        .then(dbClient => {
          this.state.Client._fromDB = !!dbClient;
          this.updateFromState(this.state);
        });
    }

    console.log(`Loaded client ${this.currentClientIndex + 1}/${this.clients.length}:`, currentClient.name);

    // Show toast if cycling through multiple clients
    if (this.clients.length > 1) {
      showToast(`Client ${this.currentClientIndex + 1} of ${this.clients.length}`, 'info');
    }
  }

  /**
   * Cycle to next client in array (called by reload button)
   */
  async cycleToNextClient() {
    if (this.clients.length === 0) {
      // No clients - run parser
      await this.reloadParser();
      return;
    }

    if (this.clients.length === 1) {
      // Only one client - re-parse page
      await this.reloadParser();
      return;
    }

    // Multiple clients - cycle to next
    this.currentClientIndex++;
    if (this.currentClientIndex >= this.clients.length) {
      this.currentClientIndex = 0;
    }

    this.loadCurrentClient();
  }

  /**
   * Parse page to extract clients (like Client Capture)
   */
  async reloadParser() {
    console.log('=== Outreach.reloadParser() called ===');
    try {
      this.showLoadingSpinner();
      log('Running client parser...');

      // Get current tab URL and tabId
      const { url, tabId } = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'leedz_get_tab_url' }, resolve);
      });

      if (!url || !tabId) {
        log('Cannot auto-detect page data');
        this.hideLoadingSpinner();
        return;
      }

      // Send message to content script to run client parser
      await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, {
          type: 'leedz_extract_client',
          state: this.state.toObject()
        }, (response) => {
          if (response?.ok && response?.data) {
            log(`Parser completed successfully`);

            // Extract clients array from response
            const clientsArray = response.data.Clients;

            if (clientsArray && Array.isArray(clientsArray) && clientsArray.length > 0) {
              // Store clients array
              this.clients = clientsArray.map(client => ({
                name: client.name || '',
                email: client.email || '',
                phone: client.phone || '',
                company: client.company || '',
                website: client.website || '',
                clientNotes: client.clientNotes || '',
                _fromDB: client._fromDB || false
              }));

              // Reset to first client
              this.currentClientIndex = 0;
              this.loadCurrentClient();

              // Show toast
              const count = this.clients.length;
              if (count > 1) {
                showToast(`Extracted ${count} clients - click reload to cycle`, 'success');
              } else {
                showToast('Extracted 1 client', 'success');
              }
            } else {
              log('No client data found on page');
              showToast('No client data found on this page', 'info');
            }

            resolve();
          } else {
            logError(`Parser failed:`, response?.error || 'Unknown error');
            log('Parse failed');
            resolve();
          }
        });
      });

    } catch (error) {
      console.error('Parser initialization error:', error);
      log('Parser unavailable');
      showToast('Parser error - see console', 'error');
    } finally {
      this.hideLoadingSpinner();
    }
  }

  /**
   * Update UI from state changes
   */
  updateFromState(state) {
    this.state = state;
    this.populateOutreachTable();
  }

  /**
   * Clear/reset outreach page to initial state
   */
  clear() {
    this.state.clear();
    this.clients = [];
    this.currentClientIndex = 0;
    this.specialInfo = '';
    this.updateFromState(this.state);
    log('Cleared');
  }

  /**
   * Get action buttons for outreach page
   */
  getActionButtons() {
    return null; // Buttons are statically defined in HTML
  }

  /**
   * Show loading spinner
   */
  showLoadingSpinner() {
    super.showLoadingSpinner();

    const table = document.getElementById('outreach_table');
    if (table) table.style.display = 'none';

    const specialInfoSection = document.getElementById('special-info-section-outreach');
    if (specialInfoSection) specialInfoSection.style.display = 'none';

    const buttonWrapper = document.getElementById('outreach-buttons');
    if (buttonWrapper) buttonWrapper.style.display = 'none';
  }

  /**
   * Hide loading spinner
   */
  hideLoadingSpinner() {
    super.hideLoadingSpinner();

    const table = document.getElementById('outreach_table');
    if (table) table.style.display = 'table';

    const specialInfoSection = document.getElementById('special-info-section-outreach');
    if (specialInfoSection) specialInfoSection.style.display = 'block';

    const buttonWrapper = document.getElementById('outreach-buttons');
    if (buttonWrapper) buttonWrapper.style.display = 'flex';
  }

  /**
   * Populate the outreach table with client info + rate fields
   */
  populateOutreachTable() {
    const tbody = document.getElementById('outreach_tbody');
    const table = document.getElementById('outreach_table');
    if (!tbody || !table) return;

    // Clear existing rows
    tbody.innerHTML = '';

    // Apply green styling if client from DB
    if (this.state.Client._fromDB) {
      table.classList.add('outreach-table-from-db');
    } else {
      table.classList.remove('outreach-table-from-db');
    }

    // Populate Client fields (name, email)
    const clientFields = ['name', 'email'];
    clientFields.forEach(field => {
      const row = document.createElement('tr');

      // Field name cell
      const nameCell = document.createElement('td');
      nameCell.className = 'field-name';
      nameCell.textContent = field;

      // Field value cell
      const valueCell = document.createElement('td');
      valueCell.className = 'field-value';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'editable-field';
      input.dataset.fieldName = field;
      input.dataset.source = 'Client';
      input.value = this.state.Client[field] || '';

      // Change handler
      input.addEventListener('blur', () => {
        this.state.Client[field] = input.value.trim();
      });

      // Enter key handler
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

    // Populate Booking rate fields using Calculator
    // No duration field for Outreach - defaults to 1 internally
    Calculator.renderFields(
      tbody,
      this.state.Booking,
      () => this.updateFromState(this.state),
      { includeDuration: false }
    );

    // Populate special info textarea
    this.populateSpecialInfoSection();
  }

  /**
   * Populate special info textarea
   */
  populateSpecialInfoSection() {
    super.populateSpecialInfoSection('specialInfoTextarea-outreach');
  }

  /**
   * Generate and send outreach email
   */
  async onWrite() {
    try {
      // Validate required fields
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
      log('Generating outreach email...');

      // Generate outreach text using LLM
      const outreachText = await this.generateOutreachEmail();

      if (!outreachText) {
        console.log('ERROR: LLM returned null or empty text');
        showToast('Failed to generate outreach email', 'error');
        this.hideLoadingSpinner();
        return;
      }

      log('Outreach email generated successfully');

      // Send to content script to open Gmail compose
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          const messagePayload = {
            action: 'openOutreach',
            clientEmail: this.state.Client.email,
            clientName: this.state.Client.name,
            subject: `Services for ${this.state.Client.name}`,
            body: outreachText
          };

          chrome.tabs.sendMessage(tabs[0].id, messagePayload, (response) => {
            if (chrome.runtime.lastError) {
              console.log('ERROR: Error sending message to content script:', chrome.runtime.lastError);
              showToast('Failed to open compose window', 'error');
              this.hideLoadingSpinner();
            } else {
              this.hideLoadingSpinner();

              // Close sidebar
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
      logError('Outreach email generation failed:', error);
      showToast('Error generating outreach', 'error');
      this.hideLoadingSpinner();
    }
  }

  /**
   * Generate outreach email text using LLM
   */
  async generateOutreachEmail() {
    const prompt = this.buildOutreachPrompt();
    return await PageUtils.sendLLMRequest(prompt);
  }

  /**
   * Build LLM prompt for outreach email generation
   */
  buildOutreachPrompt() {
    const businessInfo = PageUtils.extractBusinessInfo(this.state.Config);

    const clientFirstName = this.state.Client.name?.split(' ')[0] || 'Client';
    const hourlyRate = this.state.Booking.hourlyRate || 0;
    const flatRate = this.state.Booking.flatRate || 0;
    const totalAmount = this.state.Booking.totalAmount || 0;
    const specialInfo = this.specialInfo || '';

    // Generate rate text
    let rateText = '';
    if (totalAmount > 0) {
      rateText = `My rate would be $${totalAmount} total`;
    } else if (hourlyRate > 0) {
      rateText = `My rate is $${hourlyRate}/hr`;
    } else if (flatRate > 0) {
      rateText = `My flat rate would be $${flatRate}`;
    }

    const signatureExample = PageUtils.buildSignatureBlock(businessInfo, 'Scott');

    return `ROLE: Generate professional outreach email introducing a potential client to your ${businessInfo.servicesPerformed} services.
 
MIN-MAX-LEN: 3-6 sentences

CLIENT INFORMATION:
- Name: ${clientFirstName}

SPECIAL NOTES (follows welcome): ${specialInfo}
Give this text priority and style the rest of the email around it.
Text you generate should compliment SPECIAL NOTES and enrich it with ADDITIONAL INFO without exceeding MIN-MAX-LEN

RATE TEXT (use this verbatim): ${rateText}

INSTRUCTIONS:
1. Write a MIN-MAX-LEN email using the tone of ${specialInfo}
2. Print ${specialInfo} after the greeting
3. Use RATE TEXT
4. add ADDITIONAL INFO but do not exceed MIN-MAX-LEN
5. ADDITIONAL INFO: summarize ${businessInfo.businessDescription}
6. conclude with signature
7. ${PageUtils.getEmailFormattingInstructions()}
8. DO NOT include subject line (will be added automatically)
9. Return ONLY the email body text

EXAMPLE OUTPUT FORMAT:

Dear ${clientFirstName},

${specialInfo}

${rateText}

[ADDITIONAL INFO]

Let's add you to the calendar,

${signatureExample}

${PageUtils.getConditionalFieldWarning()}`;
  }
}
