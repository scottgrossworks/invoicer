/**
 * Calculator - Consolidated rate field calculator for all pages
 * Provides consistent rendering, styling, and calculation logic for:
 * - hourlyRate
 * - flatRate
 * - totalAmount
 * - duration (optional)
 *
 * Used by: Invoicer, Outreach, Responder
 */

import { PageUtils } from './Page_Utils.js';

export class Calculator {

  /**
   * Render rate fields with consistent styling and calculator logic
   *
   * @param {HTMLElement} tbody - Table tbody to append rows to
   * @param {Object} bookingState - Reference to state.Booking object
   * @param {Function} updateCallback - Callback to trigger UI update after calculation
   * @param {Object} options - Configuration options
   * @param {boolean} options.includeDuration - Whether to include duration field (default: false)
   * @returns {void}
   */
  static renderFields(tbody, bookingState, updateCallback, options = {}) {
    const { includeDuration = false } = options;

    // Define fields to render based on options
    const fields = includeDuration
      ? ['duration', 'hourlyRate', 'flatRate', 'totalAmount']
      : ['hourlyRate', 'flatRate', 'totalAmount'];

    fields.forEach(field => {
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
      input.dataset.source = 'Booking';
      input.value = bookingState[field] || '';

      // CRITICAL: Apply paleGreen highlighting to rate fields
      row.style.backgroundColor = 'paleGreen';
      input.style.backgroundColor = 'transparent';
      input.style.fontWeight = 'bold';

      // Wire up blur handler for auto-calculation
      input.addEventListener('blur', () => {
        const rawValue = input.value.trim();

        // Update booking state
        bookingState[field] = rawValue;

        // Auto-calculate total when rate or duration changes
        if (field === 'hourlyRate' || field === 'duration') {
          const defaultDuration = includeDuration ? null : 1; // Use 1 for pages without duration field
          Calculator.calculateAndUpdateTotal(bookingState, updateCallback, defaultDuration);
        }

        // If flatRate is set, update totalAmount
        if (field === 'flatRate') {
          const flatRate = parseFloat(rawValue) || 0;
          if (flatRate > 0) {
            bookingState.totalAmount = flatRate;
            updateCallback();
          }
        }
      });

      // Wire up Enter key handler
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur(); // Trigger blur handler
        }
      });

      valueCell.appendChild(input);
      row.appendChild(nameCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });
  }

  /**
   * Calculate total amount based on hourlyRate * duration OR flatRate
   *
   * @param {Object} bookingState - Reference to state.Booking object
   * @param {number|null} defaultDuration - Default duration if not in bookingState (e.g., 1 for Outreach/Responder)
   * @returns {number|null} Calculated total or null if cannot calculate
   */
  static calculateTotal(bookingState, defaultDuration = null) {
    // Priority 1: If flatRate is set, use it
    const flatRate = parseFloat(bookingState.flatRate) || 0;
    if (flatRate > 0) {
      return flatRate;
    }

    // Priority 2: Calculate from hourlyRate * duration
    const hourlyRate = parseFloat(bookingState.hourlyRate) || 0;
    const duration = parseFloat(bookingState.duration) || defaultDuration || 0;

    if (hourlyRate > 0 && duration > 0) {
      // Use existing PageUtils calculator
      return PageUtils.calculateAmount(hourlyRate, duration);
    }

    return null;
  }

  /**
   * Calculate total and update booking state + trigger UI update
   *
   * @param {Object} bookingState - Reference to state.Booking object
   * @param {Function} updateCallback - Callback to trigger UI update
   * @param {number|null} defaultDuration - Default duration if not in bookingState
   * @returns {void}
   */
  static calculateAndUpdateTotal(bookingState, updateCallback, defaultDuration = null) {
    const calculatedTotal = Calculator.calculateTotal(bookingState, defaultDuration);

    if (calculatedTotal !== null) {
      bookingState.totalAmount = calculatedTotal;
      updateCallback();
    }
  }

  /**
   * Validate that rate fields are properly filled
   *
   * @param {Object} bookingState - Reference to state.Booking object
   * @returns {Object} {valid: boolean, message: string}
   */
  static validateRates(bookingState) {
    const hourlyRate = parseFloat(bookingState.hourlyRate) || 0;
    const flatRate = parseFloat(bookingState.flatRate) || 0;
    const totalAmount = parseFloat(bookingState.totalAmount) || 0;

    // Check that at least one rate is set
    if (hourlyRate === 0 && flatRate === 0) {
      return {
        valid: false,
        message: 'Please enter hourly rate or flat rate'
      };
    }

    // Check that totalAmount is set
    if (totalAmount === 0) {
      return {
        valid: false,
        message: 'Please enter total amount'
      };
    }

    return {
      valid: true,
      message: 'Rates validated'
    };
  }
}
