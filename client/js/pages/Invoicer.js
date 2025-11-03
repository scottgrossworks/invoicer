/**
 * Invoicer - Page class for booking/invoice management
 * Extracted from monolithic sidebar.js
 */

import { Page } from './Page.js';
import { DateTimeUtils } from '../utils/DateTimeUtils.js';
import { ValidationUtils } from '../utils/ValidationUtils.js';
import { log, logError, logValidation, showToast } from '../logging.js';
import Client from '../db/Client.js';
import Booking from '../db/Booking.js';

export class Invoicer extends Page {

  constructor(state) {
    super('invoicer', state);
    this.clientFields = Client.getFieldNames();
    this.bookingFields = Booking.getFieldNames();

    // PDF settings and render paths
    this.PDF_SETTINGS_JS = './settings/PDF_settings.js';
    this.PDF_RENDER_JS = 'js/render/PDF_render.js';
  }

  /**
   * Initialize invoicer page (called once on app startup)
   */
  async initialize() {
    // Setup settings button handler
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', async () => {
        await this.openSettings();
      });
    }
  }

  /**
   * Called when invoicer page becomes visible
   */
  async onShow() {
    // Load Config data from DB if not already loaded
    await this.state.loadConfigFromDB();

    // Populate table with current state
    this.updateFromState(this.state);

    // Only auto-parse if no data exists (preserves manually entered/extracted data)
    const hasClientData = this.state.Client.name || this.state.Client.email;
    const hasBookingData = this.state.Booking.title || this.state.Booking.location;

    if (!hasClientData && !hasBookingData) {
      // Run parser to extract booking data from current page
      await this.reloadParser();
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
   * Clear/reset invoicer to initial state
   */
  clear() {
    this.state.clear();
    this.updateFromState(this.state);
    log('Cleared');
    console.log('State after clear:', JSON.stringify(this.state.toObject(), null, 2));
  }

  /**
   * Get action buttons for invoicer page
   */
  getActionButtons() {
    return [
      { id: 'cancelBtn', label: 'Clear', handler: () => this.clear() },
      { id: 'saveBtn', label: 'Save', handler: () => this.onSave() },
      { id: 'pdfBtn', label: 'PDF', handler: () => this.onPdf() }
    ];
  }

  /**
   * Populate the booking table with all fields from state.
   * Shows ALL Booking and Client fields, with values if available, blank if not.
   */
  populateBookingTable() {
    const tbody = document.getElementById('booking_tbody');
    if (!tbody) return;

    // Clear existing rows
    tbody.innerHTML = '';

    const allFields = [...this.clientFields, ...this.bookingFields];

    // Populate table rows with booking and client data
    allFields.forEach(field => {
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

      // CURRENCY
      if (field === 'hourlyRate' || field === 'flatRate' || field === 'totalAmount') {
        displayValue = Invoicer.formatCurrency(displayValue);
      }

      // DURATION
      if (field === 'duration') {
        displayValue = Invoicer.formatDuration(displayValue);
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

    // Auto-calculate totalAmount if conditions are met
    if (['hourlyRate', 'duration'].includes(fieldName)) {
      this.calculateTotalAmount();
    }

    // Auto-calculate duration if time fields are committed
    if (['startTime', 'endTime'].includes(fieldName)) {
      this.calculateDuration();
    }

    // Format and update display based on field type
    let formattedValue = rawValue;

    // Format currency fields
    if (['hourlyRate', 'flatRate', 'totalAmount'].includes(fieldName) && rawValue) {
      const numericValue = parseFloat(rawValue.replace(/[$,]/g, ''));
      if (!isNaN(numericValue)) {
        formattedValue = `$${numericValue.toFixed(2)}`;
      }
    }

    // Format duration fields
    if (fieldName === 'duration' && rawValue) {
      const numericValue = parseFloat(rawValue.replace(/\s*hours\s*/i, ''));
      if (!isNaN(numericValue)) {
        formattedValue = `${numericValue} hours`;
      }
    }

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
    if (fieldName === 'startDate' && rawValue && (!this.state.Booking.endDate || this.state.Booking.endDate.trim() === '')) {
      const isoDate = DateTimeUtils.parseDisplayDateToISO(rawValue);
      if (isoDate) {
        this.state.Booking.endDate = isoDate;
        console.log('Auto-set endDate to match startDate:', isoDate);

        // Update the endDate input field display
        const endDateInput = document.querySelector('[data-field="endDate"]');
        if (endDateInput) {
          endDateInput.value = DateTimeUtils.formatDateForDisplay(isoDate);
        }
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
   */
  calculateDuration() {
    const startTime = this.state.Booking.startTime;
    const endTime = this.state.Booking.endTime;

    const duration = DateTimeUtils.calculateDuration(startTime, endTime);
    if (duration !== null) {
      this.state.Booking.duration = duration;

      // Update the duration input field if it exists
      const durationInput = document.querySelector('input[data-field="duration"]');
      if (durationInput) {
        durationInput.value = `${duration} hours`;
      }

      // Also recalculate total amount
      this.calculateTotalAmount();
    }
  }

  /**
   * Auto-calculate totalAmount based on hourlyRate * duration
   * Only calculates if totalAmount and flatRate are not set
   */
  calculateTotalAmount() {
    // Get current values from STATE (already synced)
    const hourlyRate = parseFloat(this.state.Booking.hourlyRate) || 0;
    const duration = parseFloat(this.state.Booking.duration) || 0;
    const flatRate = parseFloat(this.state.Booking.flatRate) || 0;
    const currentTotal = parseFloat(this.state.Booking.totalAmount) || 0;

    // Guard clauses - only calculate if conditions are met
    if (hourlyRate <= 0 || duration <= 0) return;
    if (flatRate > 0) return;
    if (currentTotal > 0) return;

    // Calculate total
    const calculatedTotal = hourlyRate * duration;

    // Update STATE
    this.state.Booking.totalAmount = calculatedTotal;

    // Update form display
    const totalAmountInput = document.querySelector('[data-field="totalAmount"]');
    if (totalAmountInput) {
      totalAmountInput.value = Invoicer.formatCurrency(calculatedTotal);
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

      // Dynamic import of PDF settings
      const { default: PDF_settings } = await import(this.PDF_SETTINGS_JS);
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
