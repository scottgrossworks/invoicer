/**
 * Page - Abstract base class for all sidebar pages
 * Provides common lifecycle methods and shared functionality
 *
 * Subclasses must implement:
 * - initialize()
 * - onShow()
 * - updateFromState(state)
 * - clear()
 */

import { getParsers } from '../provider_registry.js';
import { mergePageData } from '../state.js';
import { log, logError, showToast } from '../logging.js';

export class Page {

  /**
   * Constructor
   * @param {string} pageName - Name of the page (e.g., 'invoicer', 'clients')
   * @param {object} state - Reference to global state object
   */
  constructor(pageName, state) {
    if (new.target === Page) {
      throw new TypeError('Cannot construct Page instances directly - must extend Page');
    }
    this.pageName = pageName;
    this.state = state;

    // Bookings cache for cycling through multiple bookings from DB
    this.bookingsCache = [];
    this.currentBookingIndex = 0;
  }

  /**
   * Initialize page (called once on app startup)
   * Subclasses should override to set up UI elements, event handlers, etc.
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Called when page becomes visible
   * Subclasses should override to refresh data, run parsers, etc.
   */
  async onShow() {
    throw new Error('onShow() must be implemented by subclass');
  }

  /**
   * Called when page is hidden (optional)
   * Subclasses can override to cleanup, save state, etc.
   */
  async onHide() {
    // Default: no-op
  }

  /**
   * Update UI from state changes
   * @param {object} state - Updated state object
   */
  updateFromState(state) {
    throw new Error('updateFromState() must be implemented by subclass');
  }

  /**
   * Clear/reset page to initial state
   */
  clear() {
    throw new Error('clear() must be implemented by subclass');
  }

  /**
   * Get the DOM element for this page
   * @returns {HTMLElement} Page container element
   */
  getPageElement() {
    return document.getElementById(`page-${this.pageName}`);
  }

  /**
   * Get action buttons config for this page
   * @returns {Array|null} Array of button configs or null if no buttons
   */
  getActionButtons() {
    // Default: no buttons
    // Subclasses can override to provide buttons
    return null;
  }

  /**
   * Show loading spinner for this page
   */
  showLoadingSpinner() {
    const pageElement = this.getPageElement();
    if (!pageElement) return;

    const spinner = pageElement.querySelector('.loading-spinner');
    const displayWin = pageElement.querySelector('.display-win');

    if (spinner && displayWin) {
      displayWin.classList.add('loading');
      spinner.style.display = 'block';

      // Hide main content if it exists
      const table = pageElement.querySelector('.booking-table, .client-table');
      if (table) {
        table.style.display = 'none';
      }
    }
  }

  /**
   * Hide loading spinner for this page
   */
  hideLoadingSpinner() {
    const pageElement = this.getPageElement();
    if (!pageElement) return;

    const spinner = pageElement.querySelector('.loading-spinner');
    const displayWin = pageElement.querySelector('.display-win');

    if (spinner && displayWin) {
      displayWin.classList.remove('loading');
      spinner.style.display = 'none';

      // Show main content if it exists
      const table = pageElement.querySelector('.booking-table, .client-table');
      if (table) {
        table.style.display = 'table';
      }
    }
  }

  /**
   * Cycle to next booking in cache, or re-parse if cache exhausted
   * This is called when user clicks Reload button
   */
  async cycleNextBooking() {
    // If no cache, just reload normally
    if (this.bookingsCache.length === 0) {
      console.log('No bookings cache, performing full reload');
      return await this.reloadParser();
    }

    // If more bookings available in cache
    if (this.currentBookingIndex < this.bookingsCache.length - 1) {
      this.currentBookingIndex++;
      this.loadBookingFromCache(this.currentBookingIndex);

      // Show toast indicating position
      const position = this.currentBookingIndex + 1;
      const total = this.bookingsCache.length;
      showToast(`Showing booking ${position} of ${total}`, 'info');

      console.log(`Loaded booking ${position} of ${total} from cache`);
    } else {
      // Cache exhausted, clear and re-parse
      console.log('All cached bookings shown, re-parsing page...');
      this.clearBookingsCache();
      await this.reloadParser();
    }
  }

  /**
   * Load booking from cache at specified index
   * @param {number} index - Index in bookingsCache array
   */
  loadBookingFromCache(index) {
    if (index >= 0 && index < this.bookingsCache.length) {
      const booking = this.bookingsCache[index];

      // Populate Booking state from cached booking
      Object.assign(this.state.Booking, {
        id: booking.id,
        clientId: booking.clientId,
        title: booking.title,
        description: booking.description,
        notes: booking.notes,
        location: booking.location,
        startDate: booking.startDate,
        endDate: booking.endDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
        duration: booking.duration,
        hourlyRate: booking.hourlyRate,
        flatRate: booking.flatRate,
        totalAmount: booking.totalAmount,
        status: booking.status,
        source: booking.source
      });

      // Mark as from cache for potential UI indicators
      this.state.Booking._fromCache = true;

      // Update UI
      this.updateFromState(this.state);

      console.log('Loaded booking from cache:', booking.title);
    }
  }

  /**
   * Clear bookings cache
   */
  clearBookingsCache() {
    this.bookingsCache = [];
    this.currentBookingIndex = 0;
    console.log('Bookings cache cleared');
  }

  /**
   * Store bookings in cache and load first one
   * @param {Array} bookingsArray - Array of booking objects from DB
   */
  populateBookingsCache(bookingsArray) {
    if (bookingsArray && bookingsArray.length > 0) {
      this.bookingsCache = bookingsArray;
      this.currentBookingIndex = 0;
      this.loadBookingFromCache(0);

      if (bookingsArray.length > 1) {
        console.log(`Stored ${bookingsArray.length} bookings in cache`);
        showToast(`Found ${bookingsArray.length} bookings for this client`, 'info');
      }
    }
  }

  /**
   * Reload and run parsers for current page context
   * NEW PIPELINE:
   * 1. Quick extract identity (name/email)
   * 2. Search DB for existing client/booking
   * 3. If found: use DB data (green table), skip full parse
   * 4. If not found: do full parse (procedural + LLM)
   */
  async reloadParser() {
    try {
      // Clear bookings cache when doing full reload
      this.clearBookingsCache();

      this.showLoadingSpinner();
      log('Detecting page type...');

      // Get current tab URL and tabId
      const { url, tabId } = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'leedz_get_tab_url' }, resolve);
      });

      if (!url || !tabId) {
        log('Cannot auto-detect page data');
        log('No page detected');
        return;
      }

      const parsers = await getParsers();
      log(`Found ${parsers.length} parsers`);

      let matched = false;
      for (const p of parsers) {
        try {
          // Check if parser matches this URL
          if (p.checkPageMatch && await p.checkPageMatch(url)) {
            log(`Parser ${p.name} matched!`);

            // STEP 1: Quick identity extraction (name/email only)
            // NOTE: This is optional - if parser doesn't support quickExtractIdentity, skip it
            let dbClient = null;
            try {
              log('Extracting identity...');
              const identityResponse = await new Promise(resolve => {
                chrome.tabs.sendMessage(tabId, {
                  type: 'leedz_extract_identity'
                }, resolve);
              });

              if (identityResponse?.ok && identityResponse?.identity) {
                const identity = identityResponse.identity;
                console.log('Identity extracted:', identity);

                // STEP 2: Search DB if we have identity data
                if (window.DB_LAYER && (identity.email || identity.name)) {
                  log('Searching database...');
                  dbClient = await window.DB_LAYER.searchClient(identity.email, identity.name);
                  console.log('DB search result:', dbClient);
                } else {
                  if (!window.DB_LAYER) {
                    console.log('DB_LAYER not available - skipping DB search');
                  } else {
                    console.log('No identity data - skipping DB search');
                  }
                }
              }
            } catch (identityError) {
              // Identity extraction failed - this is OK, just skip DB search
              console.log('Identity extraction not supported by this parser - skipping DB search');
            }

            // STEP 3: If found in DB, use that data and skip full parse
            if (dbClient) {
              log('Client found in database!');
              console.log('Using DB client data:', dbClient);

              // Clear state first
              this.state.clear();

              // Populate client data from DB
              Object.assign(this.state.Client, {
                name: dbClient.name,
                email: dbClient.email,
                phone: dbClient.phone,
                company: dbClient.company,
                website: dbClient.website,
                clientNotes: dbClient.clientNotes
              });

              // Set flag for green table styling
              this.state.Client._fromDB = true;

              // STEP 3.5: Fetch booking(s) associated with this client
              try {
                log('Fetching bookings for client...');
                const bookingsUrl = `${window.DB_LAYER.baseUrl}/bookings?clientId=${dbClient.id}`;
                console.log('Fetching bookings from:', bookingsUrl);

                const bookingsResponse = await fetch(bookingsUrl);
                if (bookingsResponse.ok) {
                  const bookings = await bookingsResponse.json();
                  console.log('Bookings found:', bookings);

                  if (bookings && bookings.length > 0) {
                    // NEW: Store ALL bookings in cache and load first one
                    this.populateBookingsCache(bookings);
                    log(`Cached ${bookings.length} booking(s)`);
                  } else {
                    console.log('No bookings found for this client');
                    // Still update UI with client data only
                    this.updateFromState(this.state);
                  }
                } else {
                  console.warn('Failed to fetch bookings:', bookingsResponse.status);
                  // Still update UI with client data only
                  this.updateFromState(this.state);
                }
              } catch (bookingError) {
                console.error('Error fetching bookings:', bookingError);
                // Continue anyway - we have client data
                this.updateFromState(this.state);
              }

              log('Loaded from database');
              matched = true;
              break; // Done - skip full parse
            }

            // STEP 4: Not in DB - do full parse (procedural + LLM)
            log('Client not in database - parsing page...');

            // Initialize state with parser defaults
            if (p.initialize) {
              await p.initialize(this.state);
            }

            // Full parse with LLM
            await new Promise((resolve, reject) => {
              chrome.tabs.sendMessage(tabId, {
                type: 'leedz_parse_page',
                parser: p.name,
                state: this.state.toObject()
              }, (response) => {
                if (response?.ok && response?.data) {
                  log(`Parser ${p.name} completed successfully`);

                  // Store parser data with timestamp for tracking
                  const parserTimestamp = Date.now();
                  this.state._parserTimestamp = parserTimestamp;

                  // Merge parsed data into state's sub-objects
                  mergePageData(this.state, response.data);

                  // Update UI from state
                  this.updateFromState(this.state);

                  resolve();
                } else {
                  logError(`Parser ${p.name} failed:`, response?.error || 'Unknown error');
                  log('Parse failed');
                  resolve(); // Still resolve even on failure
                }
              });
            });

            matched = true;
            break;
          }
        } catch (e) {
          // Parser failed - log to console but don't use logError
          console.log(`Parser ${p.name} check failed (expected on non-supported pages):`, e.message);
        }
      }

      if (!matched) {
        // No parser matched - this is normal on non-supported pages
        log('No parser available for this page');
      }
    } catch (error) {
      // Unexpected error in reloadParser itself
      console.log('Parser initialization error:', error.message);
      log('Parser unavailable');
    } finally {
      this.hideLoadingSpinner();
    }
  }

  /**
   * Open PDF settings page (shared across all pages)
   * Subclasses can override if they need custom settings behavior
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
      // Import showToast if available
      if (typeof showToast !== 'undefined') {
        showToast('Settings error', 'error');
      }
    }
  }

  /**
   * Populate special info textarea section (shared pattern)
   * @param {string} textareaId - ID of the textarea element
   */
  populateSpecialInfoSection(textareaId) {
    const textarea = document.getElementById(textareaId);
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
}
