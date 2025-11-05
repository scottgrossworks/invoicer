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
import { log, logError } from '../logging.js';

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
   * Reload and run parsers for current page context
   * NEW PIPELINE:
   * 1. Quick extract identity (name/email)
   * 2. Search DB for existing client/booking
   * 3. If found: use DB data (green table), skip full parse
   * 4. If not found: do full parse (procedural + LLM)
   */
  async reloadParser() {
    try {
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
            log('Extracting identity...');
            const identityResponse = await new Promise(resolve => {
              chrome.tabs.sendMessage(tabId, {
                type: 'leedz_extract_identity'
              }, resolve);
            });

            let dbClient = null;
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
                    // Use first booking (most recent or most relevant)
                    const booking = bookings[0];
                    Object.assign(this.state.Booking, {
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
                    log(`Loaded booking: ${booking.title}`);
                  } else {
                    console.log('No bookings found for this client');
                  }
                } else {
                  console.warn('Failed to fetch bookings:', bookingsResponse.status);
                }
              } catch (bookingError) {
                console.error('Error fetching bookings:', bookingError);
                // Continue anyway - we have client data
              }

              // Update UI
              this.updateFromState(this.state);

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
}
