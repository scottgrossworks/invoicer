/**
 * DateTimeUtils - Utility functions for date and time manipulation
 * Extracted from sidebar.js for reusability across page components
 */

// Global constant for current year - set once to ensure consistency
const CURRENT_YEAR = new Date().getFullYear();

export class DateTimeUtils {

  /**
   * Convert 24-hour time to 12-hour format for display.
   * @param {string} time24 - Time in 24-hour format (e.g., "19:00", "04:30")
   * @returns {string} Time in 12-hour format (e.g., "7:00 PM", "4:30 AM")
   */
  static convertTo12Hour(time24) {
    if (!time24) return time24;
    const t = String(time24).trim();

    // If already in 12-hour format with AM/PM, normalize and return
    if (/(AM|PM)/i.test(t)) {
      // Normalize spacing and case
      return t.replace(/\s*(AM|PM)/i, (match, ampm) => ` ${ampm.toUpperCase()}`);
    }
    if (!t.includes(':')) return t;

    const [hours, minutes] = t.split(':');
    const hour = parseInt(hours, 10);
    const min = (minutes || '00').replace(/\s*(AM|PM)/i, '');
    if (isNaN(hour)) return t;

    let result;
    if (hour === 0) result = `12:${min} AM`;
    else if (hour < 12) result = `${hour}:${min} AM`;
    else if (hour === 12) result = `12:${min} PM`;
    else result = `${hour - 12}:${min} PM`;

    return result;
  }

  /**
   * Convert 12-hour time to 24-hour format for storage.
   * @param {string} time12 - Time in 12-hour format (e.g., "7:00 PM", "4:30 AM")
   * @returns {string} Time in 24-hour format (e.g., "19:00", "04:30")
   */
  static convertTo24Hour(time12) {
    if (!time12) return time12;

    const timeUpper = time12.toUpperCase();
    const isPM = timeUpper.includes('PM');
    const isAM = timeUpper.includes('AM');

    if (!isPM && !isAM) {
      // No AM/PM - if it has colon, assume already 24-hour, otherwise reject
      return time12.includes(':') ? time12 : time12;
    }

    const timePart = timeUpper.replace(/\s*(AM|PM)/g, '');

    // Handle both "2" and "2:00" formats
    let hours, minutes;
    if (timePart.includes(':')) {
      [hours, minutes] = timePart.split(':');
    } else {
      hours = timePart;
      minutes = '00';
    }

    let hour = parseInt(hours, 10);
    const min = minutes || '00';

    if (isPM && hour !== 12) hour += 12;
    if (isAM && hour === 12) hour = 0;

    return `${hour.toString().padStart(2, '0')}:${min}`;
  }

  /**
   * Calculate duration as the difference between startTime and endTime.
   * @param {string} startTime - Start time (12-hour or 24-hour format)
   * @param {string} endTime - End time (12-hour or 24-hour format)
   * @returns {number|null} Duration in hours (decimal), or null if times are invalid
   */
  static calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return null;

    // Convert 12-hour format to 24-hour for calculation
    const start24 = this.convertTo24Hour(startTime);
    const end24 = this.convertTo24Hour(endTime);

    // Parse times in 24-hour format
    const [startHours, startMinutes] = start24.split(':').map(Number);
    const [endHours, endMinutes] = end24.split(':').map(Number);

    // Convert to minutes for easier calculation
    const startTotalMinutes = startHours * 60 + (startMinutes || 0);
    const endTotalMinutes = endHours * 60 + (endMinutes || 0);

    // Handle case where end time is next day (e.g., 11 PM to 2 AM)
    let duration;
    if (endTotalMinutes < startTotalMinutes) {
      // Crosses midnight
      duration = (24 * 60 - startTotalMinutes) + endTotalMinutes;
    } else {
      duration = endTotalMinutes - startTotalMinutes;
    }

    // Convert back to hours (with decimal)
    return parseFloat((duration / 60).toFixed(1));
  }

  /**
   * Format date for display in user-friendly format
   * @param {string|Date} value - Date value (ISO string or Date object)
   * @returns {string} Formatted date (e.g., "January 15, 2025")
   */
  static formatDateForDisplay(value) {
    if (!value) return value;
    const s = String(value).trim();
    if (/(January|February|March|April|May|June|July|August|September|October|November|December)/i.test(s)) {
      return s;
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  /**
   * Parse display date format back to ISO format
   * Defaults to current year if no year is provided
   * Uses noon (12:00:00) to avoid timezone off-by-one errors
   * @param {string} displayValue - Date in display format (e.g., "January 15, 2025" or "January 15")
   * @returns {string} ISO date string with timezone at noon
   */
  static parseDisplayDateToISO(displayValue) {
    if (!displayValue) return displayValue;
    const s = String(displayValue).trim();

    // If it's already in ISO format, return as-is
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
      return s;
    }

    // If the string doesn't contain a 4-digit year, append current year
    let dateStr = s;
    if (!/\b\d{4}\b/.test(s)) {
      dateStr = `${s} ${CURRENT_YEAR}`;
    }

    // Parse with noon time to avoid timezone off-by-one errors
    // Midnight can shift to previous day when converting to/from UTC
    const d = new Date(dateStr + ' 12:00:00');
    if (isNaN(d.getTime())) return s;

    // Validate that the date isn't defaulting to some ancient year (1970, 2001, etc.)
    if (d.getFullYear() < 2000) {
      // Reset to current year if we got a weird default year
      d.setFullYear(CURRENT_YEAR);
    }

    // Convert to ISO format at noon with local timezone
    // Using noon ensures date stays consistent across all timezones (UTC-12 to UTC+14)
    return d.toISOString().slice(0, 11) + '12:00:00' + this.getTimezoneOffset();
  }

  /**
   * Get current timezone offset in ISO format
   * @returns {string} Timezone offset (e.g., "-07:00" or "+05:30")
   */
  static getTimezoneOffset() {
    const offset = new Date().getTimezoneOffset();
    const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
    const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
    const sign = offset <= 0 ? '+' : '-';
    return `${sign}${hours}:${minutes}`;
  }

  /**
   * Format time in 12-hour US format (e.g., "9:14 PM")
   * @param {Date} date - Date object to format
   * @returns {string} Formatted time string
   */
  static formatTime12Hour(date) {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';

    // Convert to 12-hour format
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12

    // Pad minutes with leading zero if needed
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;

    return `${hours}:${minutesStr} ${ampm}`;
  }

  /**
   * Validate that startDate is before or equal to endDate
   * @param {string} startDateValue - Start date in any format (ISO or display)
   * @param {string} endDateValue - End date in any format (ISO or display)
   * @returns {boolean} True if valid (start <= end), false otherwise
   */
  static validateDateRange(startDateValue, endDateValue) {
    if (!startDateValue || !endDateValue) return true; // No validation if either is empty

    try {
      const startDate = new Date(this.parseDisplayDateToISO(startDateValue));
      const endDate = new Date(this.parseDisplayDateToISO(endDateValue));

      // Check for invalid dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return true; // Don't validate if dates are unparseable
      }

      // Compare dates (ignoring time component)
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      return startDate <= endDate;
    } catch (error) {
      return true; // Don't block on parsing errors
    }
  }

  /**
   * Format date range with times for invoice display
   * Smart formatting that:
   * - Shows dates in "Month Day, Year" format (December 10, 2025)
   * - Converts times from 24-hour to 12-hour format (18:00 -> 6PM)
   * - Omits end date if same as start date
   * - Omits times if not provided
   *
   * Examples:
   * - "December 10, 2025 6PM - 10PM" (same day)
   * - "December 10, 2025 6PM - December 11, 2025 2AM" (different days)
   * - "December 10, 2025" (no times)
   *
   * @param {string} startDate - ISO date string
   * @param {string} startTime - Time in 24-hour format (e.g., "18:00")
   * @param {string} endDate - ISO date string
   * @param {string} endTime - Time in 24-hour format (e.g., "22:00")
   * @returns {string} Formatted date/time range for invoice
   */
  static formatInvoiceDateTimeRange(startDate, startTime, endDate, endTime) {
    if (!startDate) return '';

    // Format start date
    const formattedStartDate = this.formatDateForDisplay(startDate);

    // Check if dates are the same
    const sameDay = startDate && endDate &&
                    new Date(startDate).toDateString() === new Date(endDate).toDateString();

    // Build result string
    let result = formattedStartDate;

    // Add times if provided
    if (startTime && endTime) {
      // Convert to 12-hour format without space before AM/PM
      const start12 = this.convertTo12Hour(startTime).replace(/\s+(AM|PM)/, '$1');
      const end12 = this.convertTo12Hour(endTime).replace(/\s+(AM|PM)/, '$1');

      if (sameDay) {
        // Same day: "December 10, 2025 6PM - 10PM"
        result += ` ${start12} - ${end12}`;
      } else {
        // Different days: "December 10, 2025 6PM - December 11, 2025 10PM"
        const formattedEndDate = this.formatDateForDisplay(endDate);
        result += ` ${start12} - ${formattedEndDate} ${end12}`;
      }
    } else if (startTime) {
      // Only start time provided
      const start12 = this.convertTo12Hour(startTime).replace(/\s+(AM|PM)/, '$1');
      result += ` ${start12}`;
    }

    return result;
  }

  /**
   * Convert date and time to epoch milliseconds (UTC)
   * @param {string} dateValue - ISO date string or display format (e.g., "2025-01-15" or "January 15, 2025")
   * @param {string} timeValue - Time in 24-hour or 12-hour format (e.g., "19:00" or "7:00 PM")
   * @returns {number} Epoch milliseconds since 1970-01-01 00:00:00 UTC
   */
  static dateTimeToEpoch(dateValue, timeValue) {
    if (!dateValue || !timeValue) {
      throw new Error('Both date and time are required for epoch conversion');
    }

    // Normalize date to ISO format
    const isoDate = this.parseDisplayDateToISO(dateValue);

    // Normalize time to 24-hour format
    const time24 = this.convertTo24Hour(timeValue);

    // Parse time components
    const [hours, minutes] = time24.split(':').map(Number);

    // Create Date object from ISO date
    const date = new Date(isoDate);

    // Set time components (hours and minutes)
    date.setHours(hours, minutes, 0, 0);

    // Return epoch milliseconds
    return date.getTime();
  }

  /**
   * Check if address ends with 5-digit zip code
   * Ported from inline-edit.js checkForZip()
   * @param {string} address - Address string to validate
   * @returns {boolean} True if address ends with 5-digit zip code
   */
  static validateZipInAddress(address) {
    if (!address || address.length < 5) {
      return false;
    }

    const lastFiveChars = address.slice(-5);
    for (let i = 0; i < lastFiveChars.length; i++) {
      const c = lastFiveChars.charAt(i);
      if (c < '0' || c > '9') {
        return false;
      }
    }

    return true;
  }

  /**
   * Extract 5-digit zip code from end of address
   * @param {string} address - Address string ending with zip code
   * @returns {string} 5-digit zip code
   * @throws {Error} If address doesn't end with valid zip code
   */
  static extractZipFromAddress(address) {
    if (!this.validateZipInAddress(address)) {
      throw new Error('Address must end with 5-digit zip code');
    }
    return address.slice(-5);
  }

  /**
   * Validate and clean phone number
   * Ported from inline-edit.js checkPhone()
   * @param {string} phoneStr - Phone number string (e.g., "(212) 555-1212" or "2125551212")
   * @returns {string} Cleaned 10-digit phone number
   * @throws {Error} If phone number is invalid
   */
  static validatePhone(phoneStr) {
    if (!phoneStr) {
      throw new Error('Phone number is required');
    }

    // Remove spaces, parentheses, dashes, and dots
    const cleaned = phoneStr.replace(/[\s().-]/g, '');

    // Check if cleaned string is 10 digits
    if (!/^\d{10}$/.test(cleaned)) {
      throw new Error('Phone number must be 10 digits');
    }

    return cleaned;
  }

  /**
   * Validate price and convert to cents for server/Square API.
   * Accepts: '$5', '5', '$5.14', '10.50', '0'
   * Returns price in cents (e.g. '$5.14' -> 514)
   *
   * @param {string|number} priceValue - Price in dollars (user input)
   * @param {number} maxPriceCents - Max allowed price in cents (from leedz_config.json)
   * @returns {number} Price in cents (integer)
   * @throws {Error} If price is invalid or exceeds max
   */
  static validatePrice(priceValue, maxPriceCents = 10000) {
    if (priceValue === null || priceValue === undefined || priceValue === '') {
      return 0; // Allow 0 for free leedz
    }

    // Convert to string and remove leading $
    let priceStr = String(priceValue).trim();
    if (priceStr.charAt(0) === '$') {
      priceStr = priceStr.substring(1);
    }

    // Must be a number with optional 2 decimal places: '5', '5.14', '10.50'
    if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(priceStr)) {
      throw new Error('Price must be a dollar amount (e.g. 5, 5.14, 10.50)');
    }

    // Convert dollars to cents (integer)
    const priceCents = Math.round(parseFloat(priceStr) * 100);

    const maxDollars = maxPriceCents / 100;
    if (priceCents > maxPriceCents) {
      throw new Error(`Maximum leed price: $${maxDollars}`);
    }

    return priceCents;
  }

  /**
   * Format booking start date and time for email display
   * Converts to 12-hour AM/PM format using local timezone
   * @param {string} startDate - ISO date string (e.g., "2025-01-15")
   * @param {string} startTime - Time in 24-hour format (e.g., "19:00")
   * @returns {string} Formatted date and time (e.g., "January 15, 2025 at 7:00 PM")
   */
  static formatBookingStartDateTime(startDate, startTime) {
    if (!startDate || !startTime) {
      return '';
    }

    const formattedDate = this.formatDateForDisplay(startDate);
    const formattedTime = this.convertTo12Hour(startTime);

    return `${formattedDate} at ${formattedTime}`;
  }

  /**
   * Extract 5-digit zip code from location string
   * Uses last 5 characters of trimmed location
   * @param {string} location - Full location string
   * @returns {string} 5-digit zip code
   * @throws {Error} If zip code cannot be determined
   */
  static extractZipCodeOnly(location) {
    if (!location || typeof location !== 'string') {
      throw new Error('Location is required to extract zip code');
    }

    const trimmed = location.trim();
    if (trimmed.length < 5) {
      throw new Error('Location too short to contain zip code');
    }

    // Extract last 5 characters
    const last5 = trimmed.slice(-5);

    // Validate all 5 characters are digits
    if (!/^\d{5}$/.test(last5)) {
      throw new Error(`Cannot extract valid 5-digit zip code from location: ${location}`);
    }

    return last5;
  }
}
