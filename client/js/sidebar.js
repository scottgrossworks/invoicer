// sidebar.js — LeedzEx Sidebar Orchestrator (Refactored to OOP - Dynamic Page Loading)

import { StateFactory } from './state.js';
import { initLogging, log, logError } from './logging.js';

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

    // Initialize state with persistence
    STATE = await StateFactory.create();

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
        console.log(`Loaded page: ${pageConfig.id} (${pageConfig.label})`);

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

    // Initialize default page from config
    await switchToPage(LEEDZ_CONFIG.ui.defaultPage);

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
    item.addEventListener('click', async () => {
      const pageName = item.dataset.page;
      await switchToPage(pageName);
      menu.style.display = 'none';
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
 * Switch to a different page
 * @param {string} pageName - Name of the page to switch to
 */
async function switchToPage(pageName) {
  // Hide current page
  if (CURRENT_PAGE) {
    await CURRENT_PAGE.onHide();
    CURRENT_PAGE.getPageElement().style.display = 'none';
  }

  // Show the selected page
  const page = PAGES[pageName];
  if (!page) {
    console.error(`Page not found: ${pageName}`);
    return;
  }

  page.getPageElement().style.display = 'block';
  await page.onShow();

  // Update UI
  updateAppLabel(pageName);
  updateActionButtons(page);

  CURRENT_PAGE = page;
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
  const buttonWrapper = document.getElementById('invoicer-buttons');
  if (!buttonWrapper) return;

  const buttons = page.getActionButtons();

  if (buttons && buttons.length > 0) {
    // Show buttons and wire handlers
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
  } else {
    buttonWrapper.style.display = 'none';
  }
}

/**
 * Setup header buttons (reload, settings)
 */
function setupHeaderButtons() {
  const reloadBtn = document.getElementById('reloadBtn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      if (CURRENT_PAGE) {
        await CURRENT_PAGE.reloadParser();
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
}

// Start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  await initializeApp();
});

log('Leedz Extension loaded');
