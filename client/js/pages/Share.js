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

    // Wire up email list handlers
    const addEmailBtn = document.getElementById('addEmailBtn');
    const selectAllCheckbox = document.getElementById('selectAllEmails');

    if (addEmailBtn) {
      addEmailBtn.addEventListener('click', () => this.addEmail());
    }

    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
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

    // Wire up Broadcast checkbox
    const broadcastCheckbox = document.getElementById('broadcastCheckbox');
    const broadcastSection = document.getElementById('broadcast-section-share');

    if (broadcastCheckbox && broadcastSection) {
      // Toggle broadcast mode on checkbox change
      broadcastCheckbox.addEventListener('change', (e) => this.toggleBroadcast(e.target.checked));

      // Also toggle on section click (anywhere in the section)
      broadcastSection.addEventListener('click', (e) => {
        if (e.target !== broadcastCheckbox) {
          broadcastCheckbox.checked = !broadcastCheckbox.checked;
          this.toggleBroadcast(broadcastCheckbox.checked);
        }
      });
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

    this.populateBookingTable(true);
    this.populateSpecialInfoSection();
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
   * Clear/reset share page to initial state
   */
  clear() {
    this.state.clear();
    this.emailList = [];
    this.priceEnabled = false;
    this.squareAuthenticated = false;
    this.specialInfo = '';
    this.clientFromDB = false;
    this.renderEmailList();
    this.updateFromState(this.state);
    log('Cleared');
  }

  /**
   * Populate booking table with all client and booking fields
   */
  populateBookingTable() {
    const tbody = document.getElementById('share_booking_tbody');
    const table = document.getElementById('share_booking_table');
    if (!tbody || !table) return;

    // Clear existing rows
    tbody.innerHTML = '';

    // Apply green styling if client from DB
    if (this.clientFromDB || this.state.Client._fromDB) {
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
   * Toggle broadcast mode
   * When enabled: Email section is disabled
   * When disabled: Email section is enabled
   * MOCK implementation - just updates UI state
   */
  toggleBroadcast(enabled) {
    this.broadcastMode = enabled;

    const broadcastSection = document.getElementById('broadcast-section-share');
    const emailSection = document.getElementById('email-section-share');
    const broadcastCheckbox = document.getElementById('broadcastCheckbox');

    if (!broadcastSection || !emailSection) return;

    if (enabled) {
      // BROADCAST ENABLED - disable email section
      broadcastSection.classList.add('active');
      emailSection.classList.add('disabled');

      // Close email section if open
      emailSection.removeAttribute('open');

      // MOCK: Log broadcast mode activation
      console.log('[MOCK] Broadcast mode ENABLED - email section disabled');

      // TODO: Connect to broadcast API when ready
      // return this.mockBroadcastAPI();

    } else {
      // BROADCAST DISABLED - enable email section
      broadcastSection.classList.remove('active');
      emailSection.classList.remove('disabled');

      // MOCK: Log broadcast mode deactivation
      console.log('[MOCK] Broadcast mode DISABLED - email section enabled');
    }

    // Update checkbox state to match (in case triggered by section click)
    if (broadcastCheckbox) {
      broadcastCheckbox.checked = enabled;
    }
  }

  /**
   * MOCK: Broadcast API call
   * Placeholder for future API integration
   */
  mockBroadcastAPI() {
    console.log('[MOCK] Broadcasting lead to all users in system...');
    // TODO: Implement actual broadcast API call
    // return fetch('/api/broadcast/lead', { ... });
    return Promise.resolve(true);
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

    // Add to list
    this.emailList.push({
      address: email.trim(),
      selected: false,
      color: this.emailColors[this.nextColorIndex % this.emailColors.length]
    });

    this.nextColorIndex++;

    // Re-render email list
    this.renderEmailList();

    // MOCK: Save to database
    console.log('[MOCK] Saving email list to database:', this.emailList);
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
   * Share lead/booking via email or broadcast
   * MOCK implementation - logs data without actually sending
   */
  async onShare() {
    try {
      // Validate based on mode
      if (this.broadcastMode) {
        // BROADCAST MODE - no email validation needed
        console.log('[MOCK] Broadcasting to all users');

        // Validate we have booking data
        if (!this.state.Client.name && !this.state.Booking.title) {
          showToast('No booking data to share', 'error');
          return;
        }

        // Build broadcast payload
        const broadcastData = {
          mode: 'broadcast',
          client: this.state.Client,
          booking: this.state.Booking,
          specialInfo: this.specialInfo,
          priceEnabled: this.priceEnabled,
          priceAmount: document.getElementById('priceAmount')?.value || null
        };

        // MOCK: Log broadcast data instead of sending
        console.log('[MOCK] Broadcasting lead to all users:', broadcastData);

        // TODO: Call broadcast API
        // await this.mockBroadcastAPI();

        showToast('Lead broadcasted to all users', 'success');
        log('Lead broadcasted successfully');
        return;
      }

      // EMAIL MODE - validate email selection
      const selectedEmails = this.emailList.filter(e => e.selected);
      if (selectedEmails.length === 0) {
        showToast('Please select at least one email recipient', 'error');
        return;
      }

      // Validate we have booking data
      if (!this.state.Client.name && !this.state.Booking.title) {
        showToast('No booking data to share', 'error');
        return;
      }

      // Build email payload
      const emailData = {
        mode: 'email',
        recipients: selectedEmails.map(e => e.address),
        client: this.state.Client,
        booking: this.state.Booking,
        specialInfo: this.specialInfo,
        priceEnabled: this.priceEnabled,
        priceAmount: document.getElementById('priceAmount')?.value || null
      };

      // MOCK: Log email data instead of sending
      console.log('[MOCK] Sharing lead via email:', emailData);

      showToast(`Lead shared with ${selectedEmails.length} recipient(s)`, 'success');
      log('Lead shared successfully');

    } catch (error) {
      logError('Share failed:', error);
      showToast('Failed to share lead', 'error');
    }
  }
}
