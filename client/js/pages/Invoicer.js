/**
 * Invoicer - Page class for booking/invoice management
 * Extends DataPage for universal workflow
 */

import { DataPage } from './DataPage.js';
import { DateTimeUtils } from '../utils/DateTimeUtils.js';
import { ValidationUtils } from '../utils/ValidationUtils.js';
import { PageUtils } from '../utils/Page_Utils.js';
import { Calculator } from '../utils/Calculator.js';
import { log, logError, logValidation, showToast } from '../logging.js';
import Client from '../db/Client.js';
import Booking from '../db/Booking.js';

export class Invoicer extends DataPage {

  constructor(state) {
    super('invoicer', state);
    this.clientFields = Client.getFieldNames();
    this.bookingFields = Booking.getFieldNames();

    // PDF render path
    this.PDF_RENDER_JS = 'js/render/PDF_render.js';

    // Track if client was loaded from database (persistent flag)
    this.clientFromDB = false;
  }

  /**
   * Initialize invoicer page (called once on app startup)
   * Note: Settings button handler is in sidebar.js:setupHeaderButtons()
   */
  async initialize() {
    // No initialization needed - settings button handled by sidebar.js
  }

  /**
   * DataPage hook: Run full parse (LLM extraction)
   */
  async fullParse() {
    // Use inherited reloadParser() with forceFullParse to skip prelim/DB (already done in DataPage.onShow)
    await this.reloadParser({ forceFullParse: true });
    return { success: true, data: this.state.toObject() };
  }

  /**
   * DataPage hook: Render data from STATE cache
   */
  async renderFromState(stateData) {
    // Load Config data from DB
    await this.state.loadConfigFromDB();

    // Update state
    if (stateData) {
      Object.assign(this.state.Client, stateData.Client || {});
      Object.assign(this.state.Booking, stateData.Booking || {});
    }

    // Render
    this.populateBookingTable();
  }

  /**
   * DataPage hook: Render data from database (with green styling)
   */
  async renderFromDB(dbData) {
    // Load Config data from DB
    await this.state.loadConfigFromDB();

    // Set persistent flag - client was found in database
    this.clientFromDB = true;

    // Update client from DB
    Object.assign(this.state.Client, {
      name: dbData.name || '',
      email: dbData.email || '',
      phone: dbData.phone || '',
      company: dbData.company || '',
      website: dbData.website || '',
      clientNotes: dbData.clientNotes || '',
      _fromDB: true
    });

    // If DB has bookings, use first one
    if (dbData.bookings?.length > 0) {
      Object.assign(this.state.Booking, {
        ...dbData.bookings[0],
        _fromDB: true
      });
    }

    // Render with green styling
    this.populateBookingTable(true); // Pass fromDB flag
  }

  /**
   * DataPage hook: Render data from fresh parse
   */
  async renderFromParse(parseResult) {
    // Load Config data from DB
    await this.state.loadConfigFromDB();

    // Update state from parse
    if (parseResult.data?.Client) {
      Object.assign(this.state.Client, parseResult.data.Client);
    }
    if (parseResult.data?.Booking) {
      Object.assign(this.state.Booking, parseResult.data.Booking);
    }

    // Render
    this.populateBookingTable();
  }

  /**
   * Not used - DataPage calls hooks directly
   */
  async onShowImpl() {
    // DataPage workflow doesn't use this
  }

  /**
   * Update UI from state changes
   */
  updateFromState(state) {
    this.state = state;
    this.populateBookingTable();
  }

  /**
   * Add current booking to Google Calendar
   * Uses Chrome identity API for OAuth token, similar to Gmailer.js pattern
   */
  async addToCalendar() {
    try {
      // VALIDATION: Check if we have a saved booking with required fields
      if (!this.state.Booking.id) {
        showToast('Please save the booking first before adding to calendar', 'error');
        return;
      }

      if (!this.state.Booking.startDate) {
        showToast('Booking must have a start date', 'error');
        return;
      }

      // Show loading state
      showToast('Adding to calendar...', 'info');

      // STEP 1: Get OAuth token from Chrome identity API
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(token);
          }
        });
      });

      console.log('OAuth token obtained for Calendar API');

      // STEP 2: Construct Calendar event object from Booking data
      const calendarEvent = this.buildCalendarEvent();

      // DEBUG: Log what we're sending to Google
      console.log('=== CALENDAR API REQUEST ===');
      console.log('Booking data:', {
        startDate: this.state.Booking.startDate,
        startTime: this.state.Booking.startTime,
        endDate: this.state.Booking.endDate,
        endTime: this.state.Booking.endTime
      });
      console.log('Calendar event payload:', JSON.stringify(calendarEvent, null, 2));

      // STEP 3: POST to Google Calendar API
      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(calendarEvent)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('=== CALENDAR API ERROR ===');
        console.error('Status:', response.status);
        console.error('Status Text:', response.statusText);
        console.error('Error details:', JSON.stringify(errorData, null, 2));
        throw new Error(`Calendar API error: ${errorData.error?.message || response.statusText}`);
      }

      const result = await response.json();

      // SUCCESS
      showToast('Booking added to Google Calendar successfully', 'success');
      console.log('Calendar event created:', result);

    } catch (error) {
      // ERROR HANDLING
      logError('Failed to add booking to calendar:', error);

      // User-friendly error messages
      if (error.message.includes('OAuth2')) {
        showToast('Calendar authorization failed. Are you logged into Chrome with a Google account?', 'error');
      } else if (error.message.includes('Calendar API')) {
        showToast('Google Calendar API error. Please try again.', 'error');
      } else {
        showToast('Failed to add booking to calendar', 'error');
      }
    }
  }

  /**
   * Build Google Calendar event object from current Booking state
   * @returns {Object} Calendar API event object
   */
  buildCalendarEvent() {
    const booking = this.state.Booking;
    const client = this.state.Client;

    // Build event object following Google Calendar API v3 format
    const event = {
      summary: booking.title || 'Booking',
      description: this.buildEventDescription(),
      location: booking.location || undefined
    };

    // Handle date/time combinations
    // CASE 1: Full datetime (startDate + startTime + endDate + endTime)
    if (booking.startDate && booking.startTime && booking.endDate && booking.endTime) {
      // CONVERT 12-hour to 24-hour format before combining
      // Database stores times like "2:00pm", Calendar API needs "14:00"
      const startTime24 = DateTimeUtils.convertTo24Hour(booking.startTime);
      const endTime24 = DateTimeUtils.convertTo24Hour(booking.endTime);

      console.log('Time conversion:', {
        startTime12: booking.startTime,
        startTime24: startTime24,
        endTime12: booking.endTime,
        endTime24: endTime24
      });

      event.start = {
        dateTime: this.combineDateAndTime(booking.startDate, startTime24),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      event.end = {
        dateTime: this.combineDateAndTime(booking.endDate, endTime24),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    }
    // CASE 2: All-day event (startDate only, or startDate + endDate without times)
    else if (booking.startDate) {
      event.start = {
        date: this.extractDateOnly(booking.startDate)
      };
      event.end = {
        date: booking.endDate ? this.extractDateOnly(booking.endDate) : this.extractDateOnly(booking.startDate)
      };
    }
    // CASE 3: No date (shouldn't happen due to validation, but handle gracefully)
    else {
      throw new Error('Booking must have at least a start date');
    }

    // Add client as attendee if email exists
    if (client.email) {
      event.attendees = [{ email: client.email }];
    }

    return event;
  }

  /**
   * Build event description from booking and client data
   * @returns {string} Formatted description
   */
  buildEventDescription() {
    const booking = this.state.Booking;
    const client = this.state.Client;
    const parts = [];

    // Client info
    if (client.name) {
      parts.push(`Client: ${client.name}`);
    }
    if (client.company) {
      parts.push(`Company: ${client.company}`);
    }
    if (client.email) {
      parts.push(`Email: ${client.email}`);
    }
    if (client.phone) {
      parts.push(`Phone: ${client.phone}`);
    }

    // Booking details
    if (booking.description) {
      parts.push(`\nDescription: ${booking.description}`);
    }
    if (booking.duration) {
      parts.push(`Duration: ${booking.duration} hours`);
    }
    if (booking.hourlyRate) {
      parts.push(`Rate: $${booking.hourlyRate}/hour`);
    }
    if (booking.flatRate) {
      parts.push(`Flat Rate: $${booking.flatRate}`);
    }
    if (booking.totalAmount) {
      parts.push(`Total: $${booking.totalAmount}`);
    }
    if (booking.notes) {
      parts.push(`\nNotes: ${booking.notes}`);
    }

    return parts.join('\n');
  }

  /**
   * Combine ISO date string and 24-hour time string into RFC3339 datetime
   * @param {string} isoDate - ISO date string (e.g., "2025-11-15")
   * @param {string} time24 - 24-hour time (e.g., "14:30")
   * @returns {string} RFC3339 datetime string with timezone offset
   */
  combineDateAndTime(isoDate, time24) {
    // isoDate format: "2025-11-15T00:00:00.000Z" or "2025-11-15"
    // time24 format: "14:30"

    // Validate time24 format (should be HH:mm or H:mm)
    if (!time24 || !/^\d{1,2}:\d{2}$/.test(time24)) {
      console.error('Invalid time format:', time24);
      throw new Error(`Invalid time format: "${time24}". Expected 24-hour format like "14:30"`);
    }

    const dateOnly = this.extractDateOnly(isoDate);

    // Build datetime and get timezone offset
    const date = new Date(`${dateOnly}T${time24}:00`);

    // Validate the date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date created from:', { dateOnly, time24 });
      throw new Error(`Invalid datetime: ${dateOnly}T${time24}:00`);
    }

    const offset = -date.getTimezoneOffset();
    const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const offsetMins = String(Math.abs(offset) % 60).padStart(2, '0');
    const offsetSign = offset >= 0 ? '+' : '-';

    // Return RFC3339 format: "2025-11-15T14:30:00-08:00"
    return `${dateOnly}T${time24}:00${offsetSign}${offsetHours}:${offsetMins}`;
  }

  /**
   * Extract date portion from ISO datetime string
   * @param {string} isoDate - ISO date string
   * @returns {string} Date in YYYY-MM-DD format
   */
  extractDateOnly(isoDate) {
    // Handle both "2025-11-15T00:00:00.000Z" and "2025-11-15" formats
    return isoDate.split('T')[0];
  }

  /**
   * Get action buttons for invoicer page
   */
  getActionButtons() {
    return [
      { id: 'cancelBtn', label: 'Calendar', handler: () => this.addToCalendar() },
      { id: 'saveBtn', label: 'Save', handler: () => this.onSave() },
      { id: 'pdfBtn', label: 'PDF', handler: () => this.onPdf() }
    ];
  }

  /**
   * Populate the booking table with all fields from state.
   * Shows ALL Booking and Client fields, with values if available, blank if not.
   * Applies green styling (honeydew + LEEDZ_GREEN border) if client loaded from DB.
   */
  populateBookingTable() {
    const tbody = document.getElementById('booking_tbody');
    const table = document.getElementById('booking_table');
    if (!tbody || !table) return;

    // Clear existing rows
    tbody.innerHTML = '';

    // Apply green table styling if client was loaded from DB
    console.log('=== INVOICER TABLE STYLING ===');
    console.log('_fromDB flag:', this.state.Client._fromDB);
    console.log('clientFromDB flag:', this.clientFromDB);

    // Use persistent flag OR transient state flag (for backward compatibility)
    if (this.clientFromDB || this.state.Client._fromDB) {
      console.log('✓ Client from DB - adding green table styling');
      table.classList.add('thankyou-table-from-db');  // Reuse same CSS class
    } else {
      console.log('✗ Client NOT from DB - removing green styling');
      table.classList.remove('thankyou-table-from-db');
    }

    // Skip rate fields - will be rendered by Calculator
    const rateFields = ['duration', 'hourlyRate', 'flatRate', 'totalAmount'];
    const skipFields = ['id', 'clientId', 'createdAt', 'updatedAt', ...rateFields];

    const allFields = [...this.clientFields, ...this.bookingFields];

    // Populate table rows with booking and client data (excluding rate fields)
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

      // Convert to display formats
      let displayValue = this.state.Booking[field] || this.state.Client[field] || '';

      // DATES
      if ((field === 'startTime' || field === 'endTime') && displayValue) {
        displayValue = DateTimeUtils.convertTo12Hour(displayValue);
      }
      if ((field === 'startDate' || field === 'endDate') && displayValue) {
        displayValue = DateTimeUtils.formatDateForDisplay(displayValue);
      }

      // PHONE
      if (field === 'phone') {
        displayValue = Invoicer.formatPhoneForDisplay(displayValue);
      }

      input.value = displayValue;

      // Add event listener to sync changes back to state on input
      input.addEventListener('input', (event) => {
        this.syncFormFieldToState(field, event.target.value);
      });

      // Add Enter key listener to commit and format the value
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.commitAndFormatField(field, event.target);
        }
      });

      // Add blur listener to commit and format when user leaves field
      input.addEventListener('blur', (event) => {
        this.commitAndFormatField(field, event.target);
      });

      valueCell.appendChild(input);
      row.appendChild(nameCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });

    // Render rate fields using Calculator (includes duration for Invoicer)
    Calculator.renderFields(
      tbody,
      this.state.Booking,
      () => this.updateFromState(this.state),
      { includeDuration: true }
    );
  }

  /**
   * Commit and format field value when user presses Enter or leaves field
   * @param {string} fieldName - The field being committed
   * @param {HTMLInputElement} inputElement - The input element
   */
  commitAndFormatField(fieldName, inputElement) {
    const rawValue = inputElement.value.trim();

    // Sync to state first
    this.syncFormFieldToState(fieldName, rawValue);

    // Auto-calculate duration if time fields are committed
    if (['startTime', 'endTime'].includes(fieldName)) {
      this.calculateDuration();
    }

    // Format and update display based on field type
    let formattedValue = rawValue;

    // Format time fields to 12-hour format
    if (['startTime', 'endTime'].includes(fieldName) && rawValue) {
      const timeValue = DateTimeUtils.convertTo24Hour(rawValue);
      if (timeValue) {
        formattedValue = DateTimeUtils.convertTo12Hour(timeValue);
      }
    }

    // Format date fields
    if (['startDate', 'endDate'].includes(fieldName) && rawValue) {
      const isoDate = DateTimeUtils.parseDisplayDateToISO(rawValue);
      if (isoDate) {
        formattedValue = DateTimeUtils.formatDateForDisplay(isoDate);
      }

      // Validate date range after formatting
      const isValid = DateTimeUtils.validateDateRange(this.state.Booking.startDate, this.state.Booking.endDate);
      if (!isValid) {
        const errorMsg = 'Start date must be before or equal to end date';
        logValidation(errorMsg);
        showToast(errorMsg, 'error');

        // Clear the invalid field
        if (fieldName === 'startDate') {
          this.state.Booking.startDate = null;
        } else {
          this.state.Booking.endDate = null;
        }
        inputElement.value = '';
        return;
      }
    }

    // Format phone fields
    if (fieldName === 'phone' && rawValue) {
      formattedValue = Invoicer.formatPhoneForDisplay(rawValue);
    }

    // Auto-set endDate to match startDate if endDate is empty
    if (fieldName === 'startDate' && rawValue) {
      const isoDate = DateTimeUtils.parseDisplayDateToISO(rawValue);
      if (isoDate) {
        PageUtils.autoCompleteEndDate(isoDate, this.state, '[data-field="endDate"]');
      }
    }

    // Update the input display and exit edit mode
    inputElement.value = formattedValue;
    inputElement.blur();
  }

  /**
   * Sync form field to state with format conversions
   * @param {string} fieldName - Field name
   * @param {string} displayValue - Value from UI (display format)
   */
  syncFormFieldToState(fieldName, displayValue) {
    // Convert display formats back to canonical formats
    let canonicalValue = displayValue;

    // Handle date fields - convert from display format to ISO format
    if ((fieldName === 'startDate' || fieldName === 'endDate') && displayValue) {
      canonicalValue = DateTimeUtils.parseDisplayDateToISO(displayValue);

    // Handle time fields - convert from 12-hour to 24-hour format
    } else if ((fieldName === 'startTime' || fieldName === 'endTime') && displayValue) {
      canonicalValue = DateTimeUtils.convertTo24Hour(displayValue);

    // Handle duration fields - remove 'hours' suffix for storage
    } else if (fieldName === 'duration' && displayValue) {
      canonicalValue = displayValue.replace(/\s*hours\s*/i, '').trim();

    // Handle currency fields - remove $ and convert to number
    } else if (['hourlyRate', 'flatRate', 'totalAmount'].includes(fieldName) && displayValue) {
      canonicalValue = parseFloat(displayValue.toString().replace(/[$,]/g, '')) || 0;

    // Handle phone fields - remove formatting for storage
    } else if (fieldName === 'phone' && displayValue) {
      canonicalValue = displayValue.replace(/[^\d]/g, '');
    }

    if (this.clientFields.includes(fieldName)) {
      this.state.Client[fieldName] = canonicalValue;
    } else if (this.bookingFields.includes(fieldName)) {
      this.state.Booking[fieldName] = canonicalValue;
    }
  }

  /**
   * Calculate duration from start/end times
   * State handles calculation, page handles UI updates
   */
  calculateDuration() {
    // State calculates and updates its own duration
    const calculated = this.state.calculateDuration();

    if (calculated) {
      // Page handles UI updates only
      Calculator.calculateAndUpdateTotal(
        this.state.Booking,
        () => this.updateFromState(this.state)
      );
    }
  }

  /**
   * Open PDF settings page
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
    }
  }

  /**
   * Save the current state via the configured DB layer
   */
  async onSave() {
    try {
      // Ensure current state is saved to Chrome storage for PDF settings page
      await this.state.save();

      // Show toast on success/failure
      if (this.state.status === 'saved') {
        // Set _fromDB flag after successful save to trigger green styling
        this.state.Client._fromDB = true;

        // Refresh UI to show green "from DB" styling and updated IDs
        this.updateFromState(this.state);

        showToast('Data saved successfully', 'success');
      } else {
        showToast('Database server is not available. You can still generate and preview invoices.', 'error');
      }

    } catch (e) {
      // Check if this is a validation error (user input error, not program error)
      if (e.message && e.message.includes('validation failed')) {
        logValidation('Save blocked by validation:', e.message);

        // Extract the specific validation errors from the message
        const errorMatch = e.message.match(/validation failed:\s*(.+)/i);
        const errorDetails = errorMatch ? errorMatch[1] : e.message;

        showToast(errorDetails, 'error');
        console.warn('Validation details:', e);
      } else {
        // Program error - use logError
        logError('Save failed:', e);
        showToast('Save failed. You can still generate and preview invoices.', 'error');
        console.warn('Error details:', e);
      }
    }
  }

  /**
   * Render PDF invoice
   */
  async onPdf() {
    try {
      log('Updating state...');
      await this.state.load(); // Reload state from storage to ensure latest settings

      log('Rendering PDF...');

      // Import PDF render class directly
      const { default: PDF_render } = await import(chrome.runtime.getURL(this.PDF_RENDER_JS));
      const pdfRender = new PDF_render();
      await pdfRender.render(this.state);

      log('PDF generated successfully!');
    } catch (e) {
      logError('PDF render failed:', e);
      log('PDF render failed');
      showToast('PDF Render failed', 'error');
    }
  }

  // ============================================================================
  // STATIC FORMATTING UTILITIES
  // ============================================================================

  /**
   * Format currency value for display
   * @param {number|string} value - Numeric value
   * @returns {string} Formatted currency (e.g., "$150.00")
   */
  static formatCurrency(value) {
    if (value === null || value === undefined || value === '') {
      return '$0.00';
    }

    const numericValue = parseFloat(String(value).replace(/[$,]/g, ''));
    if (isNaN(numericValue)) {
      return '$0.00';
    }

    return `$${numericValue.toFixed(2)}`;
  }

  /**
   * Format duration for display
   * @param {number|string} value - Duration value
   * @returns {string} Formatted duration (e.g., "4 hours")
   */
  static formatDuration(value) {
    if (value === null || value === undefined || value === '') {
      return '0 hours';
    }

    const strValue = String(value).trim();

    // If already has 'hours', return as is
    if (strValue.includes('hours')) {
      return strValue;
    }

    // Add 'hours' suffix to any non-empty value
    return `${strValue} hours`;
  }

  /**
   * Format phone number for display (US format)
   * @param {string} value - Phone number
   * @returns {string} Formatted phone (e.g., "555-123-4567")
   */
  static formatPhoneForDisplay(value) {
    if (!value) return value;

    // Remove any existing formatting
    const digitsOnly = value.toString().replace(/[^\d]/g, '');

    // Handle 10-digit US numbers
    if (digitsOnly.length === 10) {
      return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
    }

    // Handle 11-digit with country code (remove leading 1)
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
      const phone = digitsOnly.slice(1);
      return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
    }

    // Return as-is for other formats
    return value;
  }
}
