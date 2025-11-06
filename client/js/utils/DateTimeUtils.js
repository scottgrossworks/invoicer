/**
 * DateTimeUtils - Utility functions for date and time manipulation
 * Extracted from sidebar.js for reusability across page components
 */

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
   * @param {string} displayValue - Date in display format (e.g., "January 15, 2025")
   * @returns {string} ISO date string with timezone
   */
  static parseDisplayDateToISO(displayValue) {
    if (!displayValue) return displayValue;
    const s = String(displayValue).trim();

    // If it's already in ISO format, return as-is
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
      return s;
    }

    // Try to parse the display format back to ISO
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;

    // Convert to ISO format with local timezone
    return d.toISOString().slice(0, 19) + this.getTimezoneOffset();
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
}
