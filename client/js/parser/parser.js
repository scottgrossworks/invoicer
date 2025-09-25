//
//
//

// Portal Parser Interface
class PortalParser {


    constructor() {
        if (this.constructor === PortalParser) {
            throw new Error("Abstract class 'PortalParser' cannot be instantiated directly.");
        }

        // Common regex patterns used across parsers
        this.PHONE_REGEX = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;
        this.EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,3}/g;
    }

    /**
     * GOAL: Sanitize phone numbers by removing all non-digit characters except leading +
     * Handles formats like: 123.456.7890, (123) 456-7890, 123-456-7890, +1 123 456 7890
     * @param {string} phone - Raw phone number string
     * @returns {string} - Cleaned phone number with only digits and optional leading +
     */
    sanitizePhone(phone) {
        if (!phone) return phone;
        // Keep optional + at start, remove all non-digits
        return phone.replace(/^(\+)?[^\d]*/, '$1').replace(/[^\d]/g, '');
    }

    /**
     * GOAL: Sanitize currency values by removing $ and converting to number
     * Handles formats like: $1200, $1,200.00, 1200, 1200.50
     * @param {string|number} currency - Raw currency string or number
     * @returns {number} - Cleaned numeric value
     */
    sanitizeCurrency(currency) {
        if (!currency && currency !== 0) return currency;
        if (typeof currency === 'number') return currency;
        // Remove $ and commas, convert to number
        const cleaned = currency.toString().replace(/[$,]/g, '');
        return parseFloat(cleaned) || 0;
    }

    /**
     * Calculate duration between two ISO date strings
     * Handles dates with embedded time like "2025-07-25T12:00:00-07:00"
     * @param {string} startDate - ISO date string (e.g., "2025-07-25T12:00:00-07:00")
     * @param {string} endDate - ISO date string (e.g., "2025-07-25T15:30:00-07:00")
     * @returns {number|null} - Duration in hours as decimal (e.g., 3.5) or null if invalid
     */
    _calculateDuration(startDate, endDate) {
        if (!startDate || !endDate) return null;
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);

            // Validate dates
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                console.warn('Invalid date format in duration calculation:', { startDate, endDate });
                return null;
            }

            const durationMs = end - start;

            // Ensure positive duration
            if (durationMs < 0) {
                console.warn('Negative duration calculated:', { startDate, endDate, durationMs });
                return null;
            }

            const durationHours = durationMs / (1000 * 60 * 60); // Convert to hours
            return parseFloat(durationHours.toFixed(1));

        } catch (error) {
            console.error('Error calculating duration:', error);
            return null;
        }
    }

    /**
     * Check if current page is relevant for this parser
     * @returns {boolean} True if the current page can be parsed
     */
    checkPageMatch() {
        throw new Error("checkPageMatch() must be implemented by subclass");
    }

    /**
     * Initialize state with default values for this parser
     * @param {StateFactory.create()} state 
     */
    initialize(state) {
        throw new Error("initialize() must be implemented by subclass");
    }

    /**
     * Parse the current page into the provided state
     * @param {StateFactory.create()} state 
     */
    parse(state) {
        throw new Error("parse() must be implemented by subclass");
    }
    
  // ───────────────────────────────────────────────────────────────
  //  ONE GENERIC STATIC HELPER  (observer + polling + timeout)
  // ───────────────────────────────────────────────────────────────
  static waitForElement(selector, timeout = 15000, pollMs = 120) {
    return new Promise((resolve, reject) => {
      const test = () => document.querySelector(selector);
      if (test()) return resolve(true);

      const obs = new MutationObserver(() => { if (test()) done(true); });
      const poll = setInterval(() => { if (test()) done(true); }, pollMs);
      const to   = setTimeout(()   => done(false), timeout);

      function done(found) {
        clearInterval(poll);
        clearTimeout(to);
        obs.disconnect();
        return found ? resolve(true) : reject(new Error(
          `waitForElement timed-out (${timeout} ms) waiting for ${selector}`));
      }
      obs.observe(document.documentElement, {childList:true,subtree:true});
    });
  }

  // each subclass **must** implement:
  async waitUntilReady() { throw new Error('waitUntilReady() not implemented'); }


}

window.PortalParser = PortalParser;

// Define comprehensive reserved names list at the top of function
const RESERVED_PATHS = [
  'home', 'explore', 'notifications', 'messages', 
  'search', 'settings', 'i', 'compose', 'admin', 
  'help', 'about', 'privacy', 'terms', 'downloads',
  'bookmarks', 'lists', 'topics', 'moments'
];



// these are general helper functions that can be
// used by all parsers


function extractMatches(text, regex, label) {
  const results = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const value = match[0];

    if (value.length < 7) continue;

    if (label === 'phone') {
      const digits = value.replace(/\D/g, '');
      if (digits.length === 10) results.push(digits);
    } else {
      results.push(value.trim());
    }
  }

  return results;
}

function pruneShortLines(blob, minChars = 5) {
  const lines = blob.split(/\r?\n/);
  return lines.filter(line => line.trim().length >= minChars).join('\n');
}

export { PortalParser };
