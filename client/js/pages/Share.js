/**
 * Share - Page class for sharing leads/bookings via email
 * Extends DataPage for universal workflow (6-stage startup)
 * Allows users to share booking data with multiple email recipients
 * Optionally includes Square payment request
 */

import { DataPage } from './DataPage.js';
import { DateTimeUtils } from '../utils/DateTimeUtils.js';
import Booking from '../db/Booking.js';
import Client from '../db/Client.js';
import { generateShareEmailBody } from '../utils/ShareUtils.js';
import { sendGmailMessage } from '../utils/GmailAuth.js';
import { log, logError, showToast } from '../logging.js';

export class Share extends DataPage {

  constructor(state) {
    super('share', state);

    // Email list management
    this.emailList = [];
    this.emailColors = ['orange', 'RebeccaPurple', 'dodgerblue', 'deeppink', 'gold',  'green', 'DarkMagenta', 'blue', 'coral', 'Turquoise', 'darkorchid',  'lightsalmon', 'LightSeaGreen'];
    this.nextColorIndex = 0;

    // Square authentication state (MOCK)
    this.squareAuthenticated = false;

    // Price enabled state
    this.priceEnabled = false;

    // Broadcast mode state
    this.broadcastMode = false; // Default: broadcast disabled, email enabled

    // Store special info for email
    this.specialInfo = '';

    // Selected trade name
    this.selectedTrade = '';

    // Trades list cache
    this.tradesList = [];

    // Track if client was loaded from database (persistent flag)
    this.clientFromDB = false;

    // Get full field names from models
    this.clientFields = Client.getFieldNames();
    this.bookingFields = Booking.getFieldNames();
  }

  /**
   * Initialize share page (called once on app startup)
   */
  async initialize() {
    // console.log('[DEBUG] Share.js VERSION: 2025-12-29-18:00 - Price section state management implemented');

    // Start loading trades in background (independent of LLM parse)
    this.loadTradesAsync();

    // Wire up email list handlers
    const addEmailBtn = document.getElementById('addEmailBtn');
    const selectAllCheckbox = document.getElementById('selectAllEmails');

    if (addEmailBtn) {
      addEmailBtn.addEventListener('click', () => this.addEmail());
    }

    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
    }

    // Wire up trade selector
    const tradeSelect = document.getElementById('tradeSelect');
    if (tradeSelect) {
      tradeSelect.addEventListener('change', (e) => {
        this.selectedTrade = e.target.value;
        console.log('Selected trade:', this.selectedTrade);
      });
    }

    // Wire up Price checkbox
    const priceCheckbox = document.getElementById('priceCheckbox');
    if (priceCheckbox) {
      priceCheckbox.addEventListener('change', (e) => this.togglePrice(e.target.checked));
    }

    // Wire up Price header click (entire header is clickable)
    const priceHeader = document.querySelector('.price-header');
    if (priceHeader) {
      priceHeader.addEventListener('click', (e) => {
        // Don't double-toggle if user clicked checkbox directly
        if (e.target !== priceCheckbox) {
          priceCheckbox.checked = !priceCheckbox.checked;
          this.togglePrice(priceCheckbox.checked);
        }
      });
    }

    // Wire up Square auth button
    const squareAuthBtn = document.getElementById('squareAuthBtn');
    if (squareAuthBtn) {
      squareAuthBtn.addEventListener('click', () => this.mockSquareAuth());
    }

    // Wire up Share button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => this.onShare());
    }

    // Wire up Broadcast button
    const broadcastBtn = document.getElementById('broadcastBtn');
    if (broadcastBtn) {
      broadcastBtn.addEventListener('click', () => this.onBroadcast());
    }

    // Initialize default Price section state (unauthenticated, disabled)
    this.updateSquareButtonState();
    this.updatePriceInputState();
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
   * CRITICAL: Expand booking accordion when data arrives
   */
  async renderFromState(stateData) {
    await this.state.loadConfigFromDB();
    if (stateData) {
      Object.assign(this.state.Client, stateData.Client || {});
      Object.assign(this.state.Booking, stateData.Booking || {});
    }
    this.populateBookingTable();
    this.populateSpecialInfoSection();

    // CRITICAL: Expand Booking accordion when data arrives
    const bookingAccordion = document.getElementById('booking-section-share');
    if (bookingAccordion) {
      bookingAccordion.open = true;
    }
  }

  /**
   * DataPage hook: Render data from database (with green styling)
   * CRITICAL: Expand booking accordion when data arrives, apply green styling
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

    // CRITICAL: Apply green styling - client from DB
    this.populateBookingTable(true);
    this.populateSpecialInfoSection();

    // CRITICAL: Expand Booking accordion when data arrives
    const bookingAccordion = document.getElementById('booking-section-share');
    if (bookingAccordion) {
      bookingAccordion.open = true;
    }
  }

  /**
   * DataPage hook: Render data from fresh parse
   * CRITICAL: Expand booking accordion when data arrives
   */
  async renderFromParse(parseResult) {
    await this.state.loadConfigFromDB();

    if (parseResult.data?.Client) {
      Object.assign(this.state.Client, parseResult.data.Client);
    }
    if (parseResult.data?.Booking) {
      Object.assign(this.state.Booking, parseResult.data.Booking);
    }

    this.populateBookingTable();
    this.populateSpecialInfoSection();

    // CRITICAL: Expand Booking accordion when data arrives
    const bookingAccordion = document.getElementById('booking-section-share');
    if (bookingAccordion) {
      bookingAccordion.open = true;
    }
  }

  /**
   * Update UI from state changes
   */
  updateFromState(state) {
    this.state = state;
    this.populateBookingTable();
  }

  /**
   * Load trades from AWS API in background (independent async thread)
   */
  async loadTradesAsync() {
    const API_GATEWAY = "https://jjz8op6uy4.execute-api.us-west-2.amazonaws.com/Leedz_Stage_1/";

    try {
      const response = await fetch(`${API_GATEWAY}getTrades`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const trades = await response.json();
      this.tradesList = trades;

      // Populate trade pulldown
      this.populateTradeSelect();

      console.log('Trades loaded:', trades.length);
    } catch (error) {
      console.error('Failed to load trades:', error);
      showToast('Failed to load trades', 'error');

      // Update select with error message
      const tradeSelect = document.getElementById('tradeSelect');
      if (tradeSelect) {
        tradeSelect.innerHTML = '<option value="">Error loading trades</option>';
      }
    }
  }

  /**
   * Populate trade select pulldown with loaded trades
   */
  populateTradeSelect() {
    const tradeSelect = document.getElementById('tradeSelect');
    if (!tradeSelect) return;

    // Clear existing options
    tradeSelect.innerHTML = '';

    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a trade...';
    tradeSelect.appendChild(defaultOption);

    // Sort trades by name (sk field)
    const sortedTrades = [...this.tradesList].sort((a, b) =>
      a.sk.localeCompare(b.sk)
    );

    // Add trade options
    sortedTrades.forEach(trade => {
      const option = document.createElement('option');
      option.value = trade.sk;
      option.textContent = trade.sk;
      tradeSelect.appendChild(option);
    });

    console.log('Trade select populated with', sortedTrades.length, 'trades');
  }

  /**
   * Clear/reset share page to initial state
   */
  clear() {
    this.state.clear();
    this.emailList = [];
    this.priceEnabled = false;
    this.squareAuthenticated = false;
    this.specialInfo = '';
    this.selectedTrade = '';
    this.clientFromDB = false;
    this.renderEmailList();
    this.updateFromState(this.state);

    // Reset trade selector to default
    const tradeSelect = document.getElementById('tradeSelect');
    if (tradeSelect) {
      tradeSelect.selectedIndex = 0;
    }

    log('Cleared');
  }

  /**
   * Populate booking table with all client and booking fields
   * @param {boolean} fromDB - CRITICAL: If true, apply green styling (client from database)
   */
  populateBookingTable(fromDB = false) {
    const tbody = document.getElementById('share_booking_tbody');
    const table = document.getElementById('share_booking_table');
    if (!tbody || !table) return;

    // Clear existing rows
    tbody.innerHTML = '';

    // CRITICAL: Apply green styling if client from DB (check parameter OR flags)
    if (fromDB || this.clientFromDB || this.state.Client._fromDB) {
      table.classList.add('share-table-from-db');
    } else {
      table.classList.remove('share-table-from-db');
    }

    // Skip internal fields
    const skipFields = ['id', 'clientId', 'createdAt', 'updatedAt'];
    const allFields = [...this.clientFields, ...this.bookingFields];

    // Populate table rows with booking and client data
    allFields.forEach(field => {
      if (skipFields.includes(field)) return;
      const row = document.createElement('tr');

      // Field name cell
      const nameCell = document.createElement('td');
      nameCell.className = 'field-name';
      nameCell.textContent = field;

      // Field value cell with input
      const valueCell = document.createElement('td');
      valueCell.className = 'field-value';

      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('data-field', field);

      // Get value from Client or Booking state
      let displayValue = this.state.Client[field] || this.state.Booking[field] || '';

      // Format dates for display
      if ((field === 'startDate' || field === 'endDate') && displayValue) {
        displayValue = DateTimeUtils.formatDateForDisplay(displayValue);
      }

      // Format times for display
      if ((field === 'startTime' || field === 'endTime') && displayValue) {
        displayValue = DateTimeUtils.convertTo12Hour(displayValue);
      }

      input.value = displayValue;

      // Add event listener to sync changes back to state
      input.addEventListener('blur', () => {
        let rawValue = input.value.trim();

        // Handle date fields
        if ((field === 'startDate' || field === 'endDate') && rawValue) {
          rawValue = DateTimeUtils.parseDisplayDateToISO(rawValue);
        }

        // Handle time fields
        if ((field === 'startTime' || field === 'endTime') && rawValue) {
          rawValue = DateTimeUtils.convertTo24Hour(rawValue);
        }

        // Save to appropriate state object
        if (this.clientFields.includes(field)) {
          this.state.Client[field] = rawValue;
        } else if (this.bookingFields.includes(field)) {
          this.state.Booking[field] = rawValue;
        }
      });

      // Add Enter key handler
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });

      // Apply highlighting if BOTH price is enabled AND Square is authenticated
      if (this.priceEnabled && this.squareAuthenticated && this.shouldHighlightField(field)) {
        valueCell.classList.add('booking-field-highlighted');
      }

      valueCell.appendChild(input);
      row.appendChild(nameCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });
  }

  /**
   * Determine if field should be highlighted (payment-relevant fields)
   */
  shouldHighlightField(field) {
    const paymentFields = ['email', 'phone', 'location'];
    return paymentFields.includes(field);
  }

  /**
   * Populate special info textarea section
   */
  populateSpecialInfoSection() {
    const textarea = document.getElementById('specialInfoTextarea-share');
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
   * Build addLeed API payload from current state
   * @param {string} shareList - Share list parameter (sh)
   * @returns {Object} Payload ready for addLeed API
   * @throws {Error} If validation fails
   */
  buildAddLeedPayload(shareList) {
    const errors = [];

    // TRADE NAME (tn) - REQUIRED
    if (!this.selectedTrade) {
      errors.push('Trade must be selected');
    }

    // TITLE (ti) - REQUIRED
    const title = this.state.Booking.title || this.state.Client.name || '';
    if (!title.trim()) {
      errors.push('Title or Client Name is required');
    }

    // LOCATION (lc) - REQUIRED with zip code validation
    const location = this.state.Booking.location || '';
    if (!location.trim()) {
      errors.push('Location is required');
    } else if (!DateTimeUtils.validateZipInAddress(location)) {
      errors.push('Location must end with 5-digit zip code');
    }

    // ZIP (zp) - Extract from location
    let zipCode = '';
    try {
      zipCode = DateTimeUtils.extractZipFromAddress(location);
    } catch (err) {
      errors.push(err.message);
    }

    // START TIME (st) - REQUIRED, convert to epoch milliseconds
    let startEpoch = 0;
    try {
      if (!this.state.Booking.startDate || !this.state.Booking.startTime) {
        errors.push('Start Date and Start Time are required');
      } else {
        startEpoch = DateTimeUtils.dateTimeToEpoch(
          this.state.Booking.startDate,
          this.state.Booking.startTime
        );
      }
    } catch (err) {
      errors.push(`Start Time error: ${err.message}`);
    }

    // END TIME (et) - OPTIONAL, convert to epoch milliseconds
    let endEpoch = 0;
    if (this.state.Booking.endDate && this.state.Booking.endTime) {
      try {
        endEpoch = DateTimeUtils.dateTimeToEpoch(
          this.state.Booking.endDate,
          this.state.Booking.endTime
        );
      } catch (err) {
        errors.push(`End Time error: ${err.message}`);
      }
    }

    // DETAILS (dt) - OPTIONAL
    const details = this.specialInfo || this.state.Booking.notes || '';

    // REQUIREMENTS (rq) - OPTIONAL
    const requirements = this.state.Booking.requirements || '';

    // PHONE (ph) - OPTIONAL, validate if provided
    let phone = '';
    if (this.state.Client.phone) {
      try {
        phone = DateTimeUtils.validatePhone(this.state.Client.phone);
      } catch (err) {
        errors.push(`Phone error: ${err.message}`);
      }
    }

    // EMAIL (em) - OPTIONAL
    const email = this.state.Client.email || '';

    // PRICE (pr) - REQUIRED, validate and convert to cents
    let priceCents = 0;
    if (this.priceEnabled) {
      const priceInput = document.getElementById('priceAmount');
      const priceValue = priceInput?.value || '0';
      try {
        const priceDollars = DateTimeUtils.validatePrice(priceValue);
        priceCents = priceDollars * 100; // Convert dollars to cents
      } catch (err) {
        errors.push(`Price error: ${err.message}`);
      }
    }

    // If errors, throw
    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    // Build query string parameters (addLeed expects query params, not JSON body)
    return {
      tn: this.selectedTrade,
      ti: title.trim(),
      lc: location.trim(),
      zp: zipCode,
      st: startEpoch.toString(),
      et: endEpoch.toString(),
      dt: details.trim(),
      rq: requirements.trim(),
      ph: phone,
      em: email.trim(),
      pr: priceCents.toString(),
      sh: shareList
    };
  }

  /**
   * Retrieve JWT token from chrome.storage.local
   * @returns {Promise<string>} JWT token
   * @throws {Error} If token not found or expired
   */
  async getJWTToken() {
    const stored = await chrome.storage.local.get(['leedzJWT', 'leedzJWTExpiry']);

    if (!stored.leedzJWT) {
      throw new Error('No JWT token found. Please visit Startup page to authenticate.');
    }

    const now = Date.now();
    if (stored.leedzJWTExpiry < now) {
      throw new Error('JWT token expired. Please visit Startup page to re-authenticate.');
    }

    return stored.leedzJWT;
  }

  /**
   * Add new email to list
   */
  addEmail() {
    // Prompt user for email address
    const email = prompt('Enter email address:');
    if (!email || !email.trim()) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      showToast('Invalid email address', 'error');
      return;
    }

    // Check for duplicates
    if (this.emailList.find(e => e.address === email.trim())) {
      showToast('Email already in list', 'error');
      return;
    }

    // CRITICAL: Add to list with AUTO-SELECTED = TRUE
    // When user manually adds email, it MUST be selected by default
    // This has been a persistent bug - DO NOT change selected to false
    this.emailList.push({
      address: email.trim(),
      selected: true,  // AUTO-SELECT newly added emails
      color: this.emailColors[this.nextColorIndex % this.emailColors.length]
    });

    this.nextColorIndex++;

    // Re-render email list (will update "Select All" checkbox state automatically)
    this.renderEmailList();

  }

  /**
   * Remove email from list
   */
  removeEmail(index) {
    this.emailList.splice(index, 1);
    this.renderEmailList();

    // MOCK: Update database
    console.log('[MOCK] Updating email list in database:', this.emailList);
  }

  /**
   * Toggle email selection
   */
  toggleEmailSelection(index) {
    this.emailList[index].selected = !this.emailList[index].selected;
    this.renderEmailList();
  }

  /**
   * Toggle select all emails
   */
  toggleSelectAll(checked) {
    this.emailList.forEach(email => {
      email.selected = checked;
    });
    this.renderEmailList();
  }

  /**
   * Render email list UI
   */
  renderEmailList() {
    const emailListContainer = document.getElementById('emailList');
    const selectAllCheckbox = document.getElementById('selectAllEmails');
    if (!emailListContainer) return;

    // Clear existing list
    emailListContainer.innerHTML = '';

    // Render each email
    this.emailList.forEach((email, index) => {
      const emailItem = document.createElement('div');
      emailItem.className = 'email-item';

      // Set CSS custom property for email color
      emailItem.style.setProperty('--email-color', email.color);

      // Checkbox (circular style)
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = email.selected;
      checkbox.addEventListener('change', () => this.toggleEmailSelection(index));

      // Email label
      const label = document.createElement('label');
      label.textContent = email.address;
      label.addEventListener('click', () => this.toggleEmailSelection(index));

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'email-delete-btn';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.addEventListener('click', () => this.removeEmail(index));

      // Color delete button red if email is selected
      if (email.selected) {
        deleteBtn.style.color = '#ff0000';
      }

      emailItem.appendChild(checkbox);
      emailItem.appendChild(label);
      emailItem.appendChild(deleteBtn);
      emailListContainer.appendChild(emailItem);
    });

    // Update Select All checkbox state
    if (selectAllCheckbox) {
      const allSelected = this.emailList.length > 0 && this.emailList.every(e => e.selected);
      selectAllCheckbox.checked = allSelected;
    }
  }

  /**
   * Toggle Price section enabled/disabled
   */
  togglePrice(enabled) {
    this.priceEnabled = enabled;

    const priceSection = document.getElementById('price-section-share');
    const priceCheckbox = document.getElementById('priceCheckbox');

    if (!priceSection) return;

    if (enabled) {
      priceSection.classList.add('active');
    } else {
      priceSection.classList.remove('active');
    }

    // Update checkbox state to match (in case triggered by header click)
    if (priceCheckbox) {
      priceCheckbox.checked = enabled;
    }

    // Update USD input enabled/disabled state
    this.updatePriceInputState();

    // Re-render booking table to apply/remove highlighting
    this.populateBookingTable();
  }

  /**
   * Update USD input enabled/disabled state based on priceEnabled AND squareAuthenticated
   */
  updatePriceInputState() {
    const priceInput = document.getElementById('priceAmount');
    if (!priceInput) return;

    // Enable input ONLY if both price is enabled AND Square is authenticated
    if (this.priceEnabled && this.squareAuthenticated) {
      priceInput.disabled = false;
    } else {
      priceInput.disabled = true;
      priceInput.value = ''; // Clear value when disabled
    }
  }

  /**
   * MOCK Square authentication
   */
  async mockSquareAuth() {
    if (this.squareAuthenticated) {
      // Already authenticated - this would normally open Square dashboard or settings
      showToast('Square already authenticated', 'info');
      return;
    }

    // MOCK: Simulate authentication flow
    showToast('Authenticating with Square...', 'info');

    // Simulate async auth delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // MOCK: Set authenticated state
    this.squareAuthenticated = true;

    // Enable Price checkbox (user can now request payment)
    const priceCheckbox = document.getElementById('priceCheckbox');
    if (priceCheckbox) {
      priceCheckbox.checked = true;
      this.togglePrice(true);
    }

    // Update button state
    this.updateSquareButtonState();

    showToast('Square authentication successful', 'success');
    console.log('[MOCK] Square authenticated successfully');
  }

  /**
   * Update Square button state based on authentication
   */
  updateSquareButtonState() {
    const squareBtn = document.getElementById('squareAuthBtn');
    const priceSection = document.getElementById('price-section-share');
    if (!squareBtn) return;

    // Preserve the logo element while updating button text and classes
    const logo = squareBtn.querySelector('.square-logo');

    if (this.squareAuthenticated) {
      // Add 'authenticated' class to price section for green styling
      if (priceSection) {
        priceSection.classList.add('authenticated');
      }

      squareBtn.innerHTML = '';
      if (logo) {
        squareBtn.appendChild(logo.cloneNode(true));
      }
      squareBtn.appendChild(document.createTextNode(' Payments Authorized with Square'));
      squareBtn.classList.remove('unauthenticated');
      squareBtn.classList.add('authenticated');
    } else {
      // Remove 'authenticated' class from price section
      if (priceSection) {
        priceSection.classList.remove('authenticated');
      }

      squareBtn.innerHTML = '';
      if (logo) {
        squareBtn.appendChild(logo.cloneNode(true));
      }
      squareBtn.appendChild(document.createTextNode(' Get Paid with Square'));
      squareBtn.classList.remove('authenticated');
      squareBtn.classList.add('unauthenticated');
    }

    // Update price input state when authentication changes
    this.updatePriceInputState();
  }


  /**
   * Calls addLeed on server 
   * just for bookeeping and should be independent of sending the emails
   * Will throw Exception
   */
  async sendToServer(shareList) {
    // Build addLeed payload
      const payload = this.buildAddLeedPayload(shareList);

      // Get JWT token
      const token = await this.getJWTToken();

      // Get AWS API Gateway URL from config (loaded from leedz_config.json)
      const awsApiGatewayUrl = this.state.Config?.aws?.apiGatewayUrl;
      if (!awsApiGatewayUrl) {
        throw new Error('AWS API Gateway URL not found in leedz_config.json. Check client/leedz_config.json aws.apiGatewayUrl');
      }

      // Build query string
      const queryString = new URLSearchParams(payload).toString();
      const url = `${awsApiGatewayUrl}/addLeed?${queryString}`;

      // DIAGNOSTIC LOGGING
      /*
      console.log('=== AWS addLeed API Call ===');
      console.log('URL:', url);
      console.log('Payload:', payload);
      console.log('JWT Token (first 20 chars):', token.substring(0, 20) + '...');
      console.log('FULL JWT TOKEN FOR TESTING:', token);
      */

      // Show loading
      showToast('Sharing lead...', 'info');

      // Call addLeed API
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Error response body:', errorBody);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorBody}`);
      }

      const result = await response.json();

      // Check response format: {cd: 1, id, ti, tn, pr} or {cd: 0, er}
      if (result.cd === 0) {
        throw new Error(result.er || 'Unknown error from addLeed API');
      }

      if (result.cd !== 1) {
        throw new Error('Invalid response from addLeed API');
      }

      return result;  
    }


  /**
   * Send Gmail messages to selected recipients
    **
  * Send email via Gmail API
  * @param {string} to - Recipient email address
  * @param {string} subject - Email subject line
  * @param {string} body - Email body (HTML)
  * @returns {Promise<string>} Gmail message ID
  * @throws {Error} If auth fails or send fails
  */
  async sendGmailMessages(selectedEmails) {

    const emailSubject = `New Leed: ${this.state.Booking.title || this.state.Client.name || 'No Title'}`;

    try {
      // Load full config from leedz_config.json to get shareEmail templates
      const response = await fetch(chrome.runtime.getURL('leedz_config.json'));
      const fullConfig = await response.json();

      if (!fullConfig.shareEmail) {
        throw new Error('shareEmail configuration not found in leedz_config.json');
      }

      // Get Config from state (null if leedz_server not connected)
      const config = this.state.Config || null;

      // Iterate through selected emails and send each one
      for (const emailObj of selectedEmails) {
        try {
          // Generate email body for this recipient
          const emailBody = generateShareEmailBody(
            this.state.Client,
            this.state.Booking,
            this.specialInfo,
            this.priceEnabled,
            fullConfig.shareEmail,
            emailObj.address,
            config
          );

          const messageId = await sendGmailMessage(emailObj.address, emailSubject, emailBody);
          log(`Email sent to ${emailObj.address}, message ID: ${messageId}`);
        } catch (emailError) {
          logError(`Failed to send email to ${emailObj.address}:`, emailError);
          showToast(`Failed to send to ${emailObj.address}`, 'error');
          // Continue with other emails despite individual failures
        }
      }

      showToast(`Emails sent to ${selectedEmails.length} recipient(s)`, 'success');

    } catch (error) {
      logError('Gmail send failed:', error);
      showToast(`Gmail send failed: ${error.message}`, 'error');
      // DO NOT rethrow error; to abort share process
    }
  }




  /**
   * Broadcast lead to all users in the system
   */
  async onBroadcast() {

    this.broadcastMode = true; // Set broadcast mode
  }



  /**
   * Share lead/booking via email to selected recipients
   * Calls AWS addLeed API 
   * CASE 1: Private Share via Gmail API
   * Share List Format**: sh = "email1,email2,email3" (comma-delimited list, no asterisk)
   *
   * CASE 2: Broadcast with Exclusions
   * Share List Format**: sh = "*,email1,email2,email3" (asterisk + comma + exclusion list)
   *
   * CASE 3: Full Broadcast
   * Share List Format**: sh = "*" (asterisk only, no exclusions)
   */
  async onShare() {
    try {
      // Validate email selection
      const selectedEmails = this.emailList.filter(e => e.selected);
      if (selectedEmails.length === 0) {
        showToast('Please select at least one email recipient', 'error');
        return;
      }
      // selectedEmails is non-empty

      await this.sendGmailMessages(selectedEmails);

      // create a share list and
      // append share list to Config.friends
      let shareList = '';
      try {

        shareList = selectedEmails.map(e => e.address).join(',');

        // Load Config data from s
        await this.state.loadConfigFromDB();
        // Append to existing friends list
        this.state.Config.friends = `${this.state.Config.friends},${shareList}`;
        await this.state.save();
      
      } catch (err) {
        console.warn('Failed to load Config. Is leedz server connected?');
      }
   


      // If in broadcast mode, prepend *, to shareList
      if (this.broadcastMode) {
        shareList = `*,${shareList}`;
      }


      // calls addLeed()
      // just for bookeeping and should be independent of sending the emails
      let result = await this.sendToServer( shareList );

      // SUCCESS
      showToast(`Lead shared with ${selectedEmails.length} recipient(s)`, 'success');
      log(`Lead shared successfully: ${result.ti} (${result.tn})`);

    } catch (error) {
      logError('Share failed:', error);
      showToast(`Share failed: ${error.message}`, 'error');
    }
  }


}