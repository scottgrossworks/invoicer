// sidebar.js — LeedzEx Sidebar Orchestrator (Refactored to OOP - Dynamic Page Loading)

import { StateFactory } from './state.js';
import { initLogging, log, logError } from './logging.js';
import { getDbLayer } from './provider_registry.js';

// Start logging
initLogging();

// Config and state
let LEEDZ_CONFIG = null;
let STATE = null;

// Page instances
let PAGES = {};
let CURRENT_PAGE = null;

/**
 * Load and validate leedz_config.json
 */
async function loadLeedzConfig() {
  try {
    const configUrl = chrome.runtime.getURL('leedz_config.json');
    const response = await fetch(configUrl);

    if (!response.ok) {
      throw new Error(`Failed to load leedz_config.json (HTTP ${response.status}).
Cannot find configuration file at: ${configUrl}`);
    }

    const config = await response.json();

    // Validate that ui.defaultPage exists
    if (!config.ui || !config.ui.defaultPage) {
      throw new Error(`Invalid leedz_config.json - missing required 'ui.defaultPage' setting.`);
    }

    // Validate that ui.pages exists and is an array
    if (!config.ui.pages || !Array.isArray(config.ui.pages) || config.ui.pages.length === 0) {
      throw new Error(`Invalid leedz_config.json - expecting 'ui.pages' array defining available pages.`);

    }

    // Validate that defaultPage exists in pages array
    const validPageIds = config.ui.pages.map(p => p.id);
    if (!validPageIds.includes(config.ui.defaultPage)) {
      throw new Error(`Invalid leedz_config.json - 
'ui.defaultPage' value "${config.ui.defaultPage}" does not match any page id in the pages array.
Available page ids: ${validPageIds.join(', ')}`);
    }

    LEEDZ_CONFIG = config;
    console.log(`Loaded Leedz client config - default page: ${config.ui.defaultPage}`);

    return config;

  } catch (error) {
    // Re-throw with original error message (already verbose)
    throw error;
  }
}

/**
 * Initialize application
 */
async function initializeApp() {
  try {
    // STEP 1: Show Startup page container IMMEDIATELY
    const startupContainer = document.getElementById('page-startup');
    if (startupContainer) {
      startupContainer.style.display = 'flex';
    }

    // STEP 2: Update app-label IMMEDIATELY
    const appLabel = document.querySelector('.app-label');
    if (appLabel) {
      appLabel.textContent = 'startup';
      appLabel.className = 'app-label startup';
    }

    // STEP 3: Create minimal startup page to call onShow() immediately
    // This allows the UI to populate while background initialization runs
    const { Startup } = await import(chrome.runtime.getURL('js/pages/Startup.js'));
    const tempStartupPage = new Startup({}, LEEDZ_CONFIG || { aws: { apiGatewayUrl: 'https://jjz8op6uy4.execute-api.us-west-2.amazonaws.com/Leedz_Stage_1' } });
    tempStartupPage.initialize();
    tempStartupPage.onShow();

    // STEP 4: Initialize everything in background (non-blocking)
    initializeAppBackground();

  } catch (error) {
    console.error('Failed to initialize app:', error);
    log('Initialization failed');
  }
}

/**
 * Background initialization - runs after page shows
 */
async function initializeAppBackground() {
  try {
    // Load configuration FIRST - abort if missing or invalid
    await loadLeedzConfig();

    // Initialize database layer globally (respects Chrome storage config + leedz_config.json)
    try {
      window.DB_LAYER = await getDbLayer();
      console.log('DB_LAYER initialized:', window.DB_LAYER.baseUrl);
    } catch (error) {
      console.error('Failed to initialize DB_LAYER:', error);
      window.DB_LAYER = null;
    }

    // Initialize state with persistence (pass LEEDZ_CONFIG for Square settings)
    STATE = await StateFactory.create(LEEDZ_CONFIG);

    // Listen for storage changes from settings page
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.currentBookingState) {
        try {
          // Reload state from storage and update display
          STATE.load().then(() => {
            if (CURRENT_PAGE) {
              CURRENT_PAGE.updateFromState(STATE);
            }
          });
        } catch (error) {
          // DO NOT BLOW UP - just log the error
          log('Loading error: ' + error.message);
        }
      }
    });

    // Dynamically instantiate page objects from config
    PAGES = {};
    for (const pageConfig of LEEDZ_CONFIG.ui.pages) {
      try {
        // Dynamic import of page module
        const module = await import(chrome.runtime.getURL(pageConfig.module));
        const PageClass = module[pageConfig.className];

        if (!PageClass) {
          console.error(`Page class ${pageConfig.className} not found in ${pageConfig.module}`);
          continue;
        }

        // Instantiate page (pass LEEDZ_CONFIG for pages that need it, e.g., Startup)
        PAGES[pageConfig.id] = new PageClass(STATE, LEEDZ_CONFIG);

      } catch (error) {
        console.error(`Failed to load page ${pageConfig.id}:`, error);
      }
    }

    // Initialize all pages
    for (const page of Object.values(PAGES)) {
      await page.initialize();
    }

    // Build hamburger menu dynamically from config
    buildHamburgerMenu();

    // Wire UI
    setupPageSwitching();
    setupHeaderButtons();

    // Set CURRENT_PAGE to startup page
    CURRENT_PAGE = PAGES['startup'];

    // Expose switchToPage globally so pages can navigate
    window.switchToPage = switchToPage;

    // DO NOT call onShow() again - tempStartupPage already called it on line 86
    // Calling it twice causes duplicate JWT token fetches

  } catch (error) {
    console.error('Failed to initialize app background:', error);
    log('Initialization failed');
  }
}

/**
 * Build hamburger menu dynamically from config
 */
function buildHamburgerMenu() {
  const menu = document.querySelector('.hamburger-menu');
  if (!menu) {
    console.error('Hamburger menu not found');
    return;
  }

  // Clear existing menu items
  menu.innerHTML = '';

  // Add menu items from config
  LEEDZ_CONFIG.ui.pages.forEach(pageConfig => {
    const menuItem = document.createElement('div');
    menuItem.className = 'menu-item';
    menuItem.dataset.page = pageConfig.id;
    menuItem.textContent = pageConfig.label;
    menu.appendChild(menuItem);
  });
}

/**
 * Setup hamburger menu and page switching
 */
function setupPageSwitching() {
  const hamburger = document.querySelector('.leedz-hamburger');
  const menu = document.querySelector('.hamburger-menu');

  if (!hamburger || !menu) {
    console.error('Hamburger menu elements not found');
    return;
  }

  hamburger.addEventListener('click', () => {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });

  menu.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event bubbling
      const pageName = item.dataset.page;
      menu.style.display = 'none'; // Hide menu immediately before page switch
      switchToPage(pageName);
    });
  });

  // Close hamburger menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });
}

/**
 * Get last active page from chrome storage
 * @returns {string|null} Last active page name or null
 */
async function getLastActivePage() {
  try {
    const result = await chrome.storage.local.get('lastActivePage');
    return result.lastActivePage || null;
  } catch (error) {
    console.error('Failed to get last active page:', error);
    return null;
  }
}

/**
 * Save last active page to chrome storage
 * @param {string} pageName - Name of current page
 */
function saveLastActivePage(pageName) {
  try {
    chrome.storage.local.set({ lastActivePage: pageName });
  } catch (error) {
    console.error('Failed to save last active page:', error);
  }
}

/**
 * Hide all button wrappers immediately
 */
function hideAllButtons() {
  const startupButtons = document.getElementById('startup-buttons');
  const invoicerButtons = document.getElementById('invoicer-buttons');
  const thankyouButtons = document.getElementById('thankyou-buttons');
  const responderButtons = document.getElementById('responder-buttons');
  const outreachButtons = document.getElementById('outreach-buttons');
  const shareButtons = document.getElementById('share-buttons');

  if (startupButtons) startupButtons.style.display = 'none';
  if (invoicerButtons) invoicerButtons.style.display = 'none';
  if (thankyouButtons) thankyouButtons.style.display = 'none';
  if (responderButtons) responderButtons.style.display = 'none';
  if (outreachButtons) outreachButtons.style.display = 'none';
  if (shareButtons) shareButtons.style.display = 'none';
}

/**
 * Switch to a different page
 * STATE MACHINE: Only ONE thing visible at a time
 * - Spinner visible = all pages hidden
 * - Page visible = spinner hidden, only target page showing
 *
 * @param {string} pageName - Name of the page to switch to
 */
function switchToPage(pageName) {

  /*
  console.log(`=== SWITCHING TO PAGE: ${pageName} ===`);
  console.log('STATE before switch:', {
    hasClient: !!(STATE.Client?.name || STATE.Client?.email),
    clientName: STATE.Client?.name,
    clientEmail: STATE.Client?.email,
    hasBooking: !!(STATE.Booking?.title || STATE.Booking?.location),
    bookingTitle: STATE.Booking?.title
  });
  */

  // STEP 1: IMMEDIATELY hide all buttons
  hideAllButtons();

  // STEP 2: Hide ALL pages (clear the stage)
  Object.values(PAGES).forEach(p => {
    const pageElement = p.getPageElement();
    if (pageElement) {
      pageElement.style.display = 'none';
    }
  });

  // STEP 3: Call onHide() on current page if exists (non-blocking)
  if (CURRENT_PAGE) {
    CURRENT_PAGE.onHide();
  }

  // STEP 4: Validate new page exists
  const page = PAGES[pageName];
  if (!page) {
    console.error(`Page not found: ${pageName}`);
    return;
  }

  // STEP 5: Show ONLY the target page container
  page.getPageElement().style.display = 'flex';

  // STEP 6: Update UI (app label) IMMEDIATELY
  updateAppLabel(pageName);

  // STEP 7: Show buttons IMMEDIATELY
  updateActionButtons(page);

  // STEP 8: Call page onShow() in background (non-blocking)
  // DataPage needs await for workflow, Startup doesn't block
  page.onShow();

  CURRENT_PAGE = page;

  // STEP 10: Save current page to chrome storage
  saveLastActivePage(pageName);
}

/**
 * Update app label in header
 * @param {string} pageName - Name of current page
 */
function updateAppLabel(pageName) {
  const label = document.querySelector('.app-label');
  if (label) {
    label.textContent = pageName;
    // Remove all page-specific classes and add the current page class
    label.className = `app-label ${pageName}`;
  }
}

/**
 * Update action buttons for current page
 * @param {object} page - Current page object
 */
function updateActionButtons(page) {
  // Get all button wrappers
  const startupButtons = document.getElementById('startup-buttons');
  const invoicerButtons = document.getElementById('invoicer-buttons');
  const thankyouButtons = document.getElementById('thankyou-buttons');
  const responderButtons = document.getElementById('responder-buttons');
  const outreachButtons = document.getElementById('outreach-buttons');
  const shareButtons = document.getElementById('share-buttons');

  // Hide all button wrappers by default
  if (startupButtons) startupButtons.style.display = 'none';
  if (invoicerButtons) invoicerButtons.style.display = 'none';
  if (thankyouButtons) thankyouButtons.style.display = 'none';
  if (responderButtons) responderButtons.style.display = 'none';
  if (outreachButtons) outreachButtons.style.display = 'none';
  if (shareButtons) shareButtons.style.display = 'none';

  // Show the appropriate button wrapper based on page name
  if (page.pageName === 'startup' && startupButtons) {
    startupButtons.style.display = 'flex';
  } else if (page.pageName === 'invoicer' && invoicerButtons) {
    invoicerButtons.style.display = 'flex';
  } else if (page.pageName === 'thankyou' && thankyouButtons) {
    thankyouButtons.style.display = 'flex';
  } else if (page.pageName === 'responder' && responderButtons) {
    responderButtons.style.display = 'flex';
  } else if (page.pageName === 'outreach' && outreachButtons) {
    outreachButtons.style.display = 'flex';
  } else if (page.pageName === 'share' && shareButtons) {
    shareButtons.style.display = 'flex';
  }

  // Legacy dynamic button handling (only for pages that provide button config)
  // Pages with static HTML buttons (like thankyou) should return null and skip this
  const buttons = page.getActionButtons();

  if (buttons && buttons.length > 0) {
    // Dynamic buttons needed - use invoicer-buttons wrapper for legacy compatibility
    const buttonWrapper = document.getElementById('invoicer-buttons');
    if (buttonWrapper) {
      buttonWrapper.style.display = 'flex';

      // Clear existing buttons
      buttonWrapper.innerHTML = '';

      // Create buttons from config
      buttons.forEach(btnConfig => {
        const btn = document.createElement('button');
        btn.id = btnConfig.id;
        btn.className = 'sidebar-button';
        btn.textContent = btnConfig.label;
        btn.addEventListener('click', btnConfig.handler);
        buttonWrapper.appendChild(btn);
      });
    }
  }
  // If null or empty array, don't touch any button wrappers - they're already handled above
}

/**
 * Setup header buttons (reload, settings)
 */
function setupHeaderButtons() {
  // Consolidate reload button handlers
  const reloadButtons = ['reloadBtn', 'reloadBtnClients', 'reloadBtnThankYou', 'reloadBtnResponder', 'reloadBtnShare'];
  reloadButtons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', async () => {
        if (CURRENT_PAGE) {
          await CURRENT_PAGE.cycleNextBooking();
        }
      });
    }
  });

  // Consolidate settings button handlers - single source of truth for all pages
  const settingsButtons = ['settingsBtn', 'settingsBtnThankYou', 'settingsBtnResponder', 'settingsBtnOutreach', 'settingsBtnShare'];
  settingsButtons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', async () => {
        if (CURRENT_PAGE && typeof CURRENT_PAGE.openSettings === 'function') {
          await CURRENT_PAGE.openSettings();
        }
      });
    }
  });
}

// Start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  await initializeApp();
});

log('Leedz Extension loaded');
