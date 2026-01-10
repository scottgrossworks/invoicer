/**
 * DataPage - Base class for pages with Client/Booking data
 * Implements universal workflow with early exits:
 * 1. Load STATE from cache
 * 2. If STATE has name/email → search DB → if found, render green and STOP
 * 3. If STATE exists but no DB match → render STATE and STOP
 * 4. No STATE → prelim parse for identity (name/email only)
 * 5. Prelim parse found identity → search DB → if found, render green and STOP
 * 6. No DB match → run full LLM parse and render result
 *
 * Subclasses: ClientCapture, Invoicer, Responder, ThankYou
 */

import { Page } from './Page.js';
import { log, logError, showToast } from '../logging.js';

export class DataPage extends Page {

  constructor(pageName, state, leedzConfig = null) {
    super(pageName, state, leedzConfig);
    if (new.target === DataPage) {
      throw new TypeError('Cannot construct DataPage instances directly - must extend DataPage');
    }
  }

  /**
   * Universal workflow for data pages - with early exits
   * Template method - calls hooks that subclasses override
   */
  async onShow() {
    try {
      // STAGE 0: Clear all UI content, show ONLY spinner
      this.clearPageUI();
      this.showLoadingSpinner();

      // STAGE 1: Load STATE from chrome cache
      const stateData = await this.loadStateFromCache();

      // STAGE 2: If STATE has name/email, validate against page and search DB
      if (stateData?.Client?.name || stateData?.Client?.email) {
        log('STATE found in cache');

        // VALIDATE: Check if STATE matches current page
        const pageIdentity = await this.quickExtractIdentity();

        if (pageIdentity?.name || pageIdentity?.email) {
          // Compare STATE name/email to page name/email
          const stateNameMatch = stateData.Client.name && pageIdentity.name &&
                                 stateData.Client.name.toLowerCase().includes(pageIdentity.name.toLowerCase());
          const stateEmailMatch = stateData.Client.email && pageIdentity.email &&
                                  stateData.Client.email.toLowerCase() === pageIdentity.email.toLowerCase();

          if (!stateNameMatch && !stateEmailMatch) {
            // STATE is STALE - does not match page - SKIP to fresh parse
            log('STATE is stale (name/email mismatch) - forcing fresh parse');
            // Fall through to STAGE 3
          } else {
            // STATE matches page - proceed with DB search
            const dbData = await this.searchDB(stateData);

            if (dbData) {
              // CLIENT FOUND IN DB - RENDER GREEN AND STOP
              log('Client found in database from STATE');
              await this.renderFromDB(dbData);
              showToast('Client Found in Database', 'info');
              this.showPageUI();
              return; // EARLY EXIT
            }

            // DB search failed, but we have valid STATE data - render it and STOP
            log('No DB match - rendering STATE data');
            await this.renderFromState(stateData);
            this.showPageUI();
            return; // EARLY EXIT
          }
        } else {
          // Could not extract page identity - try DB search anyway
          const dbData = await this.searchDB(stateData);

          if (dbData) {
            // CLIENT FOUND IN DB - RENDER GREEN AND STOP
            log('Client found in database from STATE');
            await this.renderFromDB(dbData);
            showToast('Client Found in Database', 'info');
            this.showPageUI();
            return; // EARLY EXIT
          }

          // DB search failed, but we have STATE data - render it and STOP
          log('No DB match - rendering STATE data');
          await this.renderFromState(stateData);
          this.showPageUI();
          return; // EARLY EXIT
        }
      }

      // STAGE 3: No STATE (or no name/email) - try prelim parse for identity
      log('No STATE in cache - attempting prelim parse');
      const pageIdentity = await this.quickExtractIdentity();

      // STAGE 4: If prelim parse got name/email, search DB
      if (pageIdentity?.name || pageIdentity?.email) {
        log('Prelim parse found identity:', pageIdentity);

        // Create temp state data for DB search
        const tempStateData = {
          Client: {
            name: pageIdentity.name || '',
            email: pageIdentity.email || ''
          }
        };

        const dbData = await this.searchDB(tempStateData);

        if (dbData) {
          // CLIENT FOUND IN DB - RENDER GREEN AND STOP
          log('Client found in database from prelim parse');
          await this.renderFromDB(dbData);
          showToast('Client Found in Database', 'info');
          this.showPageUI();
          return; // EARLY EXIT
        }
      }

      // STAGE 5: Not found in DB - do full LLM parse
      log('Running full parse...');
      const parseResult = await this.fullParse();

      if (parseResult?.success) {
        // STAGE 5a: Search DB with parsed client data
        log('Parse successful, searching DB for client...');
        const dbData = await this.searchDB(parseResult.data);

        // STAGE 5b: Render DB data if found, else parsed data
        if (dbData) {
          log('Client found in database after parse');
          await this.renderFromDB(dbData);
          showToast('Client Found in Database', 'info');
        } else {
          log('Client not in database, using parsed data');
          await this.renderFromParse(parseResult);
          showToast('Page parsed successfully', 'success');
        }
      } else {
        // Parse failed - render blank
        await this.renderFromState(null);
        if (parseResult?.error) {
          showToast(parseResult.error, 'warning');
        }
      }

      // STAGE 6: Show UI elements (buttons, headers, etc)
      this.showPageUI();

    } catch (error) {
      console.error('DataPage workflow error:', error);
      logError('Page load failed:', error);

      // Render blank on error
      await this.renderFromState(null);
      this.showPageUI();
    } finally {
      this.hideLoadingSpinner();
    }
  }

  /**
   * HOOK: Clear all page UI content (except spinner)
   * Hides ALL UI elements: tables, buttons, action bar
   * ONLY spinner should be visible
   */
  clearPageUI() {
    const pageElement = this.getPageElement();
    if (!pageElement) return;

    // Hide section header (reload button, add button, etc)
    const sectionHeader = pageElement.querySelector('.section-header');
    if (sectionHeader) {
      sectionHeader.style.display = 'none';
    }

    // Hide display-win content (don't delete - just hide)
    const displayWin = pageElement.querySelector('.display-win');
    if (displayWin) {
      // Hide all children except spinner
      Array.from(displayWin.children).forEach(child => {
        if (!child.classList.contains('loading-spinner')) {
          child.style.display = 'none';
        }
      });
    }

    // Hide action buttons container
    const actionButtons = document.getElementById('action-buttons');
    if (actionButtons) {
      actionButtons.style.display = 'none';
    }

    // Hide share buttons container (for Share page)
    const shareButtons = document.getElementById('share-buttons');
    if (shareButtons) {
      shareButtons.style.display = 'none';
    }
  }

  /**
   * Show page UI elements after rendering
   * Called after render() completes
   */
  showPageUI() {
    const pageElement = this.getPageElement();
    if (!pageElement) return;

    // Show section header
    const sectionHeader = pageElement.querySelector('.section-header');
    if (sectionHeader) {
      sectionHeader.style.display = 'flex';
    }

    // Show display-win content (unhide what clearPageUI hid)
    const displayWin = pageElement.querySelector('.display-win');
    if (displayWin) {
      Array.from(displayWin.children).forEach(child => {
        if (!child.classList.contains('loading-spinner')) {
          child.style.display = '';
        }
      });
    }

    // Show action buttons
    const actionButtons = document.getElementById('action-buttons');
    if (actionButtons) {
      actionButtons.style.display = 'flex';
    }

    // Show share buttons (for Share page)
    const shareButtons = document.getElementById('share-buttons');
    if (shareButtons) {
      shareButtons.style.display = 'flex';
    }
  }

  /**
   * HOOK: Load STATE from chrome storage
   * @returns {Object|null} State data or null
   */
  async loadStateFromCache() {
    try {
      // Load state from database
      await this.state.load();

      // Check if we have meaningful data
      const hasClientData = this.state.Client?.name || this.state.Client?.email;
      const hasBookingData = this.state.Booking?.title || this.state.Booking?.startDate;

      if (hasClientData || hasBookingData) {
        return this.state.toObject();
      }

      return null;
    } catch (error) {
      console.warn('Failed to load state from cache:', error);
      return null;
    }
  }

  /**
   * HOOK: Search database by name/email
   * @param {Object} stateData - Current state data
   * @returns {Object|null} DB client data or null
   */
  async searchDB(stateData) {
    if (!window.DB_LAYER) {
      console.log('DB_LAYER not available - skipping DB search');
      return null;
    }

    if (!stateData?.Client?.email && !stateData?.Client?.name) {
      console.log('No email/name in STATE - skipping DB search');
      return null;
    }

    try {
      const dbClient = await window.DB_LAYER.searchClient(
        stateData.Client.email,
        stateData.Client.name
      );

      if (dbClient) {
        // Fetch bookings for this client
        const bookingsUrl = `${window.DB_LAYER.baseUrl}/bookings?clientId=${dbClient.id}`;
        const bookingsResponse = await fetch(bookingsUrl);

        if (bookingsResponse.ok) {
          const bookings = await bookingsResponse.json();
          dbClient.bookings = bookings || [];
        }

        return dbClient;
      }

      return null;
    } catch (error) {
      // Server not running - fail silently and continue
      if (error.message === 'SERVER_NOT_RUNNING') {
        console.log('Database not available for client lookup');
        return null;
      }
      console.error('DB search error:', error);
      return null;
    }
  }

  /**
   * HOOK: Quick identity extraction (name/email only)
   * @returns {Object|null} { name, email } or null
   */
  async quickExtractIdentity() {
    try {
      // Get current tab
      const { url, tabId } = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'leedz_get_tab_url' }, resolve);
      });

      if (!url || !tabId) return null;

      // Send message to content script
      const response = await new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, {
          type: 'leedz_extract_identity'
        }, resolve);
      });

      if (response?.ok && response?.identity) {
        return response.identity;
      }

      return null;
    } catch (error) {
      console.log('Quick identity extraction failed:', error.message);
      return null;
    }
  }


  /**
   * HOOK: Run full parse (LLM extraction)
   * Subclasses must implement
   * @returns {Promise<Object>} { success: boolean, data: Object, error: string }
   */
  async fullParse() {
    throw new Error('fullParse() must be implemented by subclass');
  }

  /**
   * HOOK: Render data from STATE cache
   * Subclasses must implement
   * @param {Object} stateData - State data to render
   */
  async renderFromState(stateData) {
    throw new Error('renderFromState() must be implemented by subclass');
  }

  /**
   * HOOK: Render data from database (with green styling)
   * Subclasses must implement
   * @param {Object} dbData - Database client/booking data
   */
  async renderFromDB(dbData) {
    throw new Error('renderFromDB() must be implemented by subclass');
  }

  /**
   * HOOK: Render data from fresh parse
   * Subclasses must implement
   * @param {Object} parseResult - Parse result data
   */
  async renderFromParse(parseResult) {
    throw new Error('renderFromParse() must be implemented by subclass');
  }

  /**
   * Reload button handler - FORCE full LLM parse, then check DB
   */
  async cycleNextBooking() {
    try {
      // Clear all UI content, show ONLY spinner
      this.clearPageUI();
      this.showLoadingSpinner();

      // Clear state to start fresh
      this.state.clear();

      // STEP 1: FORCE full LLM parse - skip cache/DB during parse
      log('RELOAD: Forcing full parse...');
      const parseResult = await this.fullParse();

      if (!parseResult?.success) {
        // Parse failed - render blank
        await this.renderFromState(null);
        if (parseResult?.error) {
          showToast(parseResult.error, 'warning');
        }
        this.showPageUI();
        return;
      }

      // STEP 2: Search DB with parsed client data
      log('RELOAD: Parse successful, searching DB for client...');
      const dbData = await this.searchDB(parseResult.data);

      // STEP 3: Render DB data if found, else parsed data
      if (dbData) {
        log('RELOAD: Client found in database');
        await this.renderFromDB(dbData);
        showToast('Client Found in Database', 'info');
      } else {
        log('RELOAD: Client not in database, using parsed data');
        await this.renderFromParse(parseResult);
        showToast('Page parsed successfully', 'success');
      }

      // Show UI elements
      this.showPageUI();

    } catch (error) {
      console.error('Reload error:', error);
      logError('Reload failed:', error);
      await this.renderFromState(null);
      this.showPageUI();
    } finally {
      this.hideLoadingSpinner();
    }
  }
}
