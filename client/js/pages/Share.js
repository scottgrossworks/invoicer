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
import { generateShareEmailBody, synthesizeLeedDetails, synthesizeLeedRequirements } from '../utils/ShareUtils.js';
import { sendGmailMessage } from '../utils/GmailAuth.js';
import { log, logError, showToast } from '../logging.js';

export class Share extends DataPage {

  constructor(state) {
    super('share', state);

    // Email list management
    this.emailList = [];
    this.emailColors = ['orange', 'RebeccaPurple', 'dodgerblue', 'deeppink', 'gold',  'green', 'DarkMagenta', 'blue', 'coral', 'Turquoise', 'darkorchid',  'lightsalmon', 'LightSeaGreen'];
    this.nextColorIndex = 0;

    // Square authentication state (checked from server sq_st on load)
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
    // Start loading trades and friends in background (independent of LLM parse)
    this.loadTradesAsync();
    this.loadFriendsAsync();

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
        const selected = e.target.selectedOptions[0];
        const indicator = document.querySelector('.trade-indicator');
        if (indicator) {
          indicator.style.backgroundColor = selected?.dataset.color || 'var(--LEEDZ_DARKGREEN)';
        }
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
      squareAuthBtn.addEventListener('click', () => this.handleSquareAuth());
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
   * Load user's friends list from AWS getUser API in background
   * Populates email list with fr field entries
   */
  async loadFriendsAsync(retries = 3) {
    const API_GATEWAY = "https://jjz8op6uy4.execute-api.us-west-2.amazonaws.com/Leedz_Stage_1/";

    try {
      // Wait for Startup page to fetch JWT (runs in parallel)
      let token = null;
      for (let i = 0; i < retries; i++) {
        try {
          token = await this.getJWTToken();
          break;
        } catch (e) {
          if (i < retries - 1) {
            await new Promise(r => setTimeout(r, 2000));
          } else {
            throw e;
          }
        }
      }

      const response = await fetch(`${API_GATEWAY}getUser?session=${encodeURIComponent(token)}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const user = await response.json();

      // Check Square authorization status from server
      if (user.sq_st === 'authorized') {
        this.squareAuthenticated = true;
        this.updateSquareButtonState();
      }

      const fr = user.fr || '';
      if (!fr) return;

      // Split friends list, dedupe, add to email list
      const friends = fr.split(',').map(e => e.trim()).filter(e => e);
      friends.forEach(address => {
        if (this.emailList.find(e => e.address === address)) return;
        this.emailList.push({
          address,
          selected: false,
          color: this.emailColors[this.nextColorIndex % this.emailColors.length]
        });
        this.nextColorIndex++;
      });

      this.renderEmailList();

    } catch (error) {
      console.error('Failed to load friends:', error);
      // Non-critical - user can still add emails manually
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

    // Add trade options (store color in data attribute)
    sortedTrades.forEach(trade => {
      const option = document.createElement('option');
      option.value = trade.sk;
      option.textContent = trade.sk;
      if (trade.cs) option.dataset.color = trade.cs;
      tradeSelect.appendChild(option);
    });

  }

  clearPageUI() {
    super.clearPageUI();
    const shareButtons = document.getElementById('share-buttons');
    if (shareButtons) {
      shareButtons.style.display = 'none';
    }
  }

  showPageUI() {
    super.showPageUI();
    const shareButtons = document.getElementById('share-buttons');
    if (shareButtons) {
      shareButtons.style.display = 'flex';
    }
  }

  /**
   * Clear/reset share page to initial state
   */
  clear() {
    this.state.clear();
    this.state.saveLocal(); // Persist cleared state to Chrome storage

    this.emailList = [];
    this.priceEnabled = false;
    this.specialInfo = '';
    this.selectedTrade = '';
    this.clientFromDB = false;
    this.renderEmailList();
    this.updateFromState(this.state);

    // Reset Price section UI
    this.togglePrice(false);

    // Reset Special Info textarea
    const textarea = document.getElementById('specialInfoTextarea-share');
    if (textarea) {
      textarea.value = '';
    }

    // Collapse accordions
    const bookingAccordion = document.getElementById('booking-section-share');
    if (bookingAccordion) {
      bookingAccordion.removeAttribute('open');
    }
    const specialInfoAccordion = document.getElementById('special-info-section-share');
    if (specialInfoAccordion) {
      specialInfoAccordion.removeAttribute('open');
    }

    // Reset trade selector and indicator to default
    const tradeSelect = document.getElementById('tradeSelect');
    if (tradeSelect) {
      tradeSelect.selectedIndex = 0;
    }
    const indicator = document.querySelector('.trade-indicator');
    if (indicator) {
      indicator.style.backgroundColor = '';
    }

    // Reset broadcast button
    this.broadcastMode = false;
    const broadcastBtn = document.getElementById('broadcastBtn');
    if (broadcastBtn) {
      broadcastBtn.classList.remove('active');
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

    // Only show fields that map to cloud API (addLeed): title, description, location,
    // startDate (as "date"), startTime, endTime, name, email, phone, notes
    const skipFields = ['id', 'clientId', 'createdAt', 'updatedAt', 'duration', 'hourlyRate', 'flatRate', 'totalAmount', 'endDate', 'company', 'website', 'clientNotes'];
    const allFields = [...this.clientFields, ...this.bookingFields];

    // Populate table rows with booking and client data
    allFields.forEach(field => {
      if (skipFields.includes(field)) return;
      const row = document.createElement('tr');

      // Field name cell
      const nameCell = document.createElement('td');
      nameCell.className = 'field-name';
      nameCell.textContent = (field === 'startDate') ? 'date' : field;

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
          // Share leedz are 1-day events: endDate always equals startDate
          if (field === 'startDate') {
            this.state.Booking.endDate = rawValue;
          }
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
   * @param {string} leedId - Pre-generated leed ID (optional)
   * @returns {Object} Payload ready for addLeed API
   * @throws {Error} If validation fails
   */
  buildAddLeedPayload(shareList, leedId) {
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

    // DETAILS (dt) - OPTIONAL - Booking.description
    const details = synthesizeLeedDetails(this.state.Booking);

    // REQUIREMENTS (rq) - OPTIONAL - Special Instructions + Booking.notes
    const requirements = synthesizeLeedRequirements(this.specialInfo, this.state.Booking);

    // CLIENT NAME (cn) - OPTIONAL - Client.name
    const clientName = this.state.Client.name || '';

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

    // PRICE (pr) - validate and convert to cents
    // MAX_PRICE_CENTS from leedz_config.json must match server env var on addLeed Lambda
    let priceCents = 0;
    if (this.priceEnabled) {
      const priceInput = document.getElementById('priceAmount');
      const priceValue = priceInput?.value || '0';
      const maxPriceCents = this.state.Config?.pricing?.MAX_PRICE_CENTS || 10000;
      try {
        priceCents = DateTimeUtils.validatePrice(priceValue, maxPriceCents);
      } catch (err) {
        errors.push(`Price error: ${err.message}`);
      }
    }

    // If errors, throw
    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    // Build query string parameters (addLeed expects query params, not JSON body)
    const payload = {
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
      cn: clientName.trim(),
      pr: priceCents.toString(),
      sh: shareList
    };

    // Include pre-generated ID if provided
    if (leedId) {
      payload.id = leedId;
    }

    return payload;
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
   * When enabling, re-check Square auth (user may have just completed OAuth in browser)
   */
  async togglePrice(enabled) {
    this.priceEnabled = enabled;

    const priceSection = document.getElementById('price-section-share');
    const priceCheckbox = document.getElementById('priceCheckbox');

    if (!priceSection) return;

    if (enabled) {
      priceSection.classList.add('active');

      // Re-check Square auth if not already authenticated
      if (!this.squareAuthenticated) {
        await this.recheckSquareAuth();
      }
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
   * Handle Square authorization
   * Re-check auth first (user may have completed OAuth in browser).
   * If now authorized, update UI. Otherwise open editUserPage for Square OAuth.
   */
  async handleSquareAuth() {
    if (this.squareAuthenticated) {
      showToast('Square already authorized', 'info');
      return;
    }

    // Re-check — user may have just completed OAuth in browser
    await this.recheckSquareAuth();
    if (this.squareAuthenticated) {
      return; // recheckSquareAuth already showed toast and updated UI
    }

    try {
      const token = await this.getJWTToken();
      if (!token) {
        throw new Error('No session token. Please restart the extension.');
      }

      // Open editUserPage in new tab — server creates user if needed, Square OAuth flow lives there
      chrome.tabs.create({
        url: `https://jjz8op6uy4.execute-api.us-west-2.amazonaws.com/Leedz_Stage_1/editUserPage?session=${encodeURIComponent(token)}`
      });

    } catch (error) {
      logError('Square auth redirect failed:', error);
      showToast('Could not open Square authorization: ' + error.message, 'error');
    }
  }

  /**
   * Re-check Square authorization by calling getUser() API
   * Shows spinner while checking. Updates UI if auth is now valid.
   */
  async recheckSquareAuth() {
    const API_GATEWAY = "https://jjz8op6uy4.execute-api.us-west-2.amazonaws.com/Leedz_Stage_1/";

    try {
      this.showLoadingSpinner();
      const token = await this.getJWTToken();
      const response = await fetch(`${API_GATEWAY}getUser?session=${encodeURIComponent(token)}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const user = await response.json();

      if (user.sq_st === 'authorized') {
        this.squareAuthenticated = true;
        this.updateSquareButtonState();
        this.updatePriceInputState();
        showToast('Square authorized!', 'success');
      }
    } catch (error) {
      log('Square auth re-check failed: ' + error.message);
    } finally {
      this.hideLoadingSpinner();
    }
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
      squareBtn.appendChild(document.createTextNode(' Square Authorized'));
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
  async sendToServer(shareList, leedId) {
    // Build addLeed payload
      const payload = this.buildAddLeedPayload(shareList, leedId);

      // Get JWT token
      const token = await this.getJWTToken();

      // Get AWS API Gateway URL from config (loaded from leedz_config.json)
      const awsApiGatewayUrl = this.state.Config?.aws?.apiGatewayUrl;
      if (!awsApiGatewayUrl) {
        throw new Error('AWS API Gateway URL not found in leedz_config.json. Check client/leedz_config.json aws.apiGatewayUrl');
      }

      // Build query string with session token for API Gateway authorizer
      payload.session = token;
      const queryString = new URLSearchParams(payload).toString();
      const url = `${awsApiGatewayUrl}/addLeed?${queryString}`;

      // Call addLeed API
      const response = await fetch(url, {
        method: 'GET'
      });

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
   */
  async sendGmailMessages(selectedEmails, leedId) {

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

      // Get sender email from chrome.storage.local (set by Startup.fetchJWTToken)
      const stored = await chrome.storage.local.get(['leedzUserEmail']);
      const senderEmail = stored.leedzUserEmail || '';

      // Iterate through selected emails and send each one
      for (const emailObj of selectedEmails) {
        try {
          // Generate email body for this recipient
          const emailBody = await generateShareEmailBody(
            this.state.Client,
            this.state.Booking,
            this.specialInfo,
            this.priceEnabled,
            fullConfig.shareEmail,
            emailObj.address,
            config,
            senderEmail,
            this.selectedTrade,
            leedId
          );

          const messageId = await sendGmailMessage(emailObj.address, emailSubject, emailBody);
          log(`Email sent to ${emailObj.address}, message ID: ${messageId}`);
        } catch (emailError) {
          logError(`Failed to send email to ${emailObj.address}:`, emailError);
          showToast(`Failed to send to ${emailObj.address}`, 'error');
          // Continue with other emails despite individual failures
        }
      }

      showToast(`Emailed ${selectedEmails.length} recipient(s)`, 'success');

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
    this.broadcastMode = !this.broadcastMode;
    const btn = document.getElementById('broadcastBtn');
    if (btn) {
      btn.classList.toggle('active', this.broadcastMode);
    }
  }



  /**
   * Share lead/booking via email to selected recipients
   * Calls AWS addLeed API
   * CASE 1: Private Share via Gmail API
   * Share List Format: sh = "email1,email2,email3" (comma-delimited list, no asterisk)
   *
   * CASE 2: Full Broadcast (no private emails)
   * Share List Format: sh = "*" (asterisk only)
   *
   * CASE 3: Broadcast + Private Emails
   * Share List Format: sh = "*,email1,email2,email3" (asterisk + comma + exclusion list)
   */
  async onShare() {
    try {
      this.showLoadingSpinner();

      // Pre-generate leed ID for email button URLs
      // Uses 48-bit random integer (281 trillion values) to avoid collisions
      // Server reuses this ID; on the extremely unlikely collision, server generates its own
      const leedId = String(Math.floor(Math.random() * (2 ** 48)));

      const selectedEmails = this.emailList.filter(e => e.selected);
      const emailAddresses = selectedEmails.map(e => e.address).join(',');

      // Build shareList: broadcast check FIRST
      // '#' prefix = client already sent private emails (Gmail)
      // Server will skip SES for private list but still use for broadcast dedup
      let shareList = '';
      if (this.broadcastMode && selectedEmails.length > 0) {
        // CASE 3: Broadcast + private emails (already sent by client)
        shareList = `#*,${emailAddresses}`;
      } else if (this.broadcastMode) {
        // CASE 2: Full broadcast, no private emails
        shareList = '#*';
      } else if (selectedEmails.length > 0) {
        // CASE 1: Private share only (already sent by client)
        shareList = `#${emailAddresses}`;
      } else {
        // No broadcast, no emails -- nothing to do
        showToast('Please select at least one email recipient or enable Broadcast', 'error');
        return;
      }

      // Send Gmail to selected recipients (if any)
      if (selectedEmails.length > 0) {
        await this.sendGmailMessages(selectedEmails, leedId);

        // Append to local Config friends list
        try {
          await this.state.loadConfigFromDB();
          this.state.Config.friends = `${this.state.Config.friends},${emailAddresses}`;
          await this.state.save();
        } catch (err) {
          console.log('Failed to load Config. Is leedz server connected?');
        }
      }

      // Send leed to server (addLeed API) with pre-generated ID
      let result = await this.sendToServer(shareList, leedId);

      log(`Lead shared: ${result.ti} (${result.tn}) sh=${shareList}`);
      showToast('Success! Leed Shared.', 'success');

      // Clear form to prevent duplicate posting
      this.clear();

    } catch (error) {
      logError('Share failed:', error);
      showToast(`Share failed: ${error.message}`, 'error');
    } finally {
      this.hideLoadingSpinner();
    }
  }


}