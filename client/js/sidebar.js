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

CONFIG FILE ERROR:
==================
Cannot find configuration file at: ${configUrl}

This file is required for the Leedz Invoicer extension to run.
Please ensure leedz_config.json exists in the extension root directory.

Extension will not initialize without valid configuration.`);
    }

    const config = await response.json();

    // Validate that ui.defaultPage exists
    if (!config.ui || !config.ui.defaultPage) {
      throw new Error(`Invalid leedz_config.json - missing required setting.

CONFIG VALIDATION ERROR:
========================
The configuration file exists but is missing the required 'ui.defaultPage' setting.

Expected structure in leedz_config.json:
{
  "ui": {
    "defaultPage": "clients"   // or "gmailer" or "invoicer"
  },
  ...
}

Current config.ui value: ${JSON.stringify(config.ui, null, 2)}

Please add the 'ui.defaultPage' setting to leedz_config.json.
Valid values: "clients", "gmailer", or "invoicer"

Extension will not initialize without valid configuration.`);
    }

    // Validate that ui.pages exists and is an array
    if (!config.ui.pages || !Array.isArray(config.ui.pages) || config.ui.pages.length === 0) {
      throw new Error(`Invalid leedz_config.json - missing or invalid pages configuration.

CONFIG VALIDATION ERROR:
========================
The configuration file must include a 'ui.pages' array defining available pages.

Expected structure:
{
  "ui": {
    "defaultPage": "clients",
    "pages": [
      {"id": "clients", "label": "Clients", "module": "js/pages/ClientCapture.js", "className": "ClientCapture"},
      {"id": "invoicer", "label": "Invoicer", "module": "js/pages/Invoicer.js", "className": "Invoicer"}
    ]
  }
}

Extension will not initialize without valid configuration.`);
    }

    // Validate that defaultPage exists in pages array
    const validPageIds = config.ui.pages.map(p => p.id);
    if (!validPageIds.includes(config.ui.defaultPage)) {
      throw new Error(`Invalid leedz_config.json - defaultPage references non-existent page.

CONFIG VALIDATION ERROR:
========================
The 'ui.defaultPage' value "${config.ui.defaultPage}" does not match any page id in the pages array.

Available page ids: ${validPageIds.join(', ')}

Please update ui.defaultPage to match one of the configured page ids.`);
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

    // Initialize state with persistence
    STATE = await StateFactory.create();

    console.log('=== SIDEBAR STATE LOADED ===', {
      hasClient: !!(STATE.Client?.name || STATE.Client?.email),
      clientName: STATE.Client?.name,
      clientEmail: STATE.Client?.email,
      hasBooking: !!(STATE.Booking?.title || STATE.Booking?.location),
      bookingTitle: STATE.Booking?.title,
      bookingLocation: STATE.Booking?.location
    });

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

        // Instantiate page
        PAGES[pageConfig.id] = new PageClass(STATE);
        // console.log(`Loaded page: ${pageConfig.id} (${pageConfig.label})`);

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

    // Initialize to last active page or default page from config
    const lastPage = await getLastActivePage();
    await switchToPage(lastPage || LEEDZ_CONFIG.ui.defaultPage);

    // Expose switchToPage globally so pages can navigate
    window.switchToPage = switchToPage;

  } catch (error) {
    console.error('Failed to initialize app:', error);
    log('Initialization failed');
    // Re-throw to prevent extension from running with invalid config
    throw error;
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
    item.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent event bubbling
      const pageName = item.dataset.page;
      menu.style.display = 'none'; // Hide menu immediately before page switch
      await switchToPage(pageName);
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

  if (startupButtons) startupButtons.style.display = 'none';
  if (invoicerButtons) invoicerButtons.style.display = 'none';
  if (thankyouButtons) thankyouButtons.style.display = 'none';
  if (responderButtons) responderButtons.style.display = 'none';
  if (outreachButtons) outreachButtons.style.display = 'none';
}

/**
 * Switch to a different page
 * @param {string} pageName - Name of the page to switch to
 */
async function switchToPage(pageName) {
  console.log(`=== SWITCHING TO PAGE: ${pageName} ===`);
  console.log('STATE before switch:', {
    hasClient: !!(STATE.Client?.name || STATE.Client?.email),
    clientName: STATE.Client?.name,
    clientEmail: STATE.Client?.email,
    hasBooking: !!(STATE.Booking?.title || STATE.Booking?.location),
    bookingTitle: STATE.Booking?.title
  });

  // STEP 1: IMMEDIATELY hide all buttons before any page switching
  hideAllButtons();

  // STEP 2: Hide current page and cleanup
  if (CURRENT_PAGE) {
    // Call onHide() - lets page cleanup, save state, stop parsers
    await CURRENT_PAGE.onHide();

    // Hide all spinners on current page
    hideAllSpinners(CURRENT_PAGE.pageId);

    // Hide page element
    CURRENT_PAGE.getPageElement().style.display = 'none';
  }

  // STEP 3: Validate new page exists
  const page = PAGES[pageName];
  if (!page) {
    console.error(`Page not found: ${pageName}`);
    return;
  }

  // STEP 4: Show the new page container (empty initially)
  page.getPageElement().style.display = 'flex';

  // STEP 5: Wait for page to fully load (includes parsing and data loading)
  await page.onShow();

  // STEP 6: Update UI (app label)
  updateAppLabel(pageName);

  // STEP 7: Show buttons LAST - after all page loading and parsing is complete
  updateActionButtons(page);

  CURRENT_PAGE = page;

  // STEP 8: Save current page to chrome storage
  saveLastActivePage(pageName);
}

/**
 * Hide all loading spinners on a specific page
 * @param {string} pageId - ID of the page (e.g., 'clients', 'invoicer')
 */
function hideAllSpinners(pageId) {
  // All possible spinner IDs by page
  const spinnerIds = {
    'clients': 'loading_spinner_clients',
    'invoicer': 'loading_spinner',
    'thankyou': 'loading_spinner_thankyou',
    'responder': 'loading_spinner_responder',
    'outreach': 'loading_spinner_outreach'
  };

  const spinnerId = spinnerIds[pageId];
  if (spinnerId) {
    const spinner = document.getElementById(spinnerId);
    if (spinner) {
      spinner.style.display = 'none';
    }
  }
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

  // Hide all button wrappers by default
  if (startupButtons) startupButtons.style.display = 'none';
  if (invoicerButtons) invoicerButtons.style.display = 'none';
  if (thankyouButtons) thankyouButtons.style.display = 'none';
  if (responderButtons) responderButtons.style.display = 'none';
  if (outreachButtons) outreachButtons.style.display = 'none';

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
  const reloadBtn = document.getElementById('reloadBtn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      if (CURRENT_PAGE) {
        // Cycle through cached bookings or reload if exhausted
        await CURRENT_PAGE.cycleNextBooking();
      }
    });
  }

  const reloadBtnClients = document.getElementById('reloadBtnClients');
  if (reloadBtnClients) {
    reloadBtnClients.addEventListener('click', async () => {
      if (CURRENT_PAGE) {
        // Cycle through cached bookings or reload if exhausted
        await CURRENT_PAGE.cycleNextBooking();
      }
    });
  }

  const reloadBtnThankYou = document.getElementById('reloadBtnThankYou');
  if (reloadBtnThankYou) {
    reloadBtnThankYou.addEventListener('click', async () => {
      if (CURRENT_PAGE) {
        // Cycle through cached bookings or reload if exhausted
        await CURRENT_PAGE.cycleNextBooking();
      }
    });
  }

  const reloadBtnResponder = document.getElementById('reloadBtnResponder');
  if (reloadBtnResponder) {
    reloadBtnResponder.addEventListener('click', async () => {
      if (CURRENT_PAGE) {
        // Cycle through cached bookings or reload if exhausted
        await CURRENT_PAGE.cycleNextBooking();
      }
    });
  }

  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', async () => {
      // Settings button functionality depends on current page
      // Check if page has openSettings method
      if (CURRENT_PAGE && typeof CURRENT_PAGE.openSettings === 'function') {
        await CURRENT_PAGE.openSettings();
      } else {
        // Generic settings or no-op for other pages
        console.log('Settings button clicked - no action for this page');
      }
    });
  }

  const settingsBtnThankYou = document.getElementById('settingsBtnThankYou');
  if (settingsBtnThankYou) {
    settingsBtnThankYou.addEventListener('click', async () => {
      if (CURRENT_PAGE && typeof CURRENT_PAGE.openSettings === 'function') {
        await CURRENT_PAGE.openSettings();
      } else {
        console.log('Settings button clicked - no action for this page');
      }
    });
  }
}

// Start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  await initializeApp();
});

log('Leedz Extension loaded');
