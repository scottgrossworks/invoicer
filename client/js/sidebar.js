// sidebar.js — LeedzEx Sidebar Control Logic (Simplified for Debugging)

import { StateFactory, mergePageData } from './state.js';
import { initLogging, log, logError, showToast } from './logging.js';

import Booking from './db/Booking.js';
import Client from './db/Client.js';

import { getParsers } from './provider_registry.js';


const PDF_SETTINGS_JS = './settings/PDF_settings.js';
const PDF_RENDER_JS = 'js/render/PDF_render.js';


const clientFields = Client.getFieldNames();
const bookingFields = Booking.getFieldNames();


//////////////////// START LOGGING  /////////////////////
initLogging();
//////////////////// END LOGGING  /////////////////////


let STATE = null;


/*
// DOM CONTENT LOADED
//
//
*/
document.addEventListener('DOMContentLoaded', async () => {
  await initializeApp();
});

async function initializeApp() {
  try {
    // Initialize state with persistence
    STATE = await StateFactory.create();

    // Listen for storage changes from settings page
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.currentBookingState) {
        try {
          // Reload state from storage and update display
          STATE.load().then(() => {
            updateFormFromState( STATE );
          });
        } catch (error) {
          // DO NOT BLOW UP - just log the error
          log("Loading error: " + error.message);
        }
      }
    });

    // Wire up UI
    wireUI();

    // MCP page is default - load config and check server on startup
    await loadMcpConfigAndCheckServer();

    // Do NOT run parsers on load - MCP page is default
    // Parsers only run when user switches to invoicer page and clicks reload
    // await reloadParsers();
  } catch (error) {
    console.error('Failed to initialize app:', error);
    log('Initialization failed');
  }
}

log('Leedz Extension loaded');




/**
 * Reloads and runs all available parsers for the current webpage
 * Checks for supported platforms (LinkedIn, etc.) and attempts to parse page content
 * Updates the form with any extracted data from successful parsing
 * Called on page load and when manually triggered by user
 * @returns {Promise<void>}
*/
async function reloadParsers() {
  try {
    showLoadingSpinner();
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
        // log(`Checking: ${p.name || 'unnamed'}`);
        // Check if parser matches this URL
        if (p.checkPageMatch && await p.checkPageMatch(url)) {
          log(`Initializing ${p.name || 'parser'}...`);
          
          // Initialize state with parser defaults
          if (p.initialize) {
            await p.initialize( STATE );
          }
          
          log(`Parser ${p.name} matched! Parsing...`);

          // Wrap the async chrome.tabs.sendMessage in a Promise to make it awaitable
          await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, {
              type: 'leedz_parse_page',
              parser: p.name,
              state: STATE.toObject()
            }, (response) => {
              if (response?.ok && response?.data) {
                log(`Parser ${p.name} completed successfully`);

                // DEBUG: Log complete parser response
                // console.log('=== PARSER RESPONSE DEBUG ===');
                // console.log('Parser response data:', JSON.stringify(response.data, null, 2));
                // console.log('Response timestamp:', new Date().toISOString());

                // Store parser data with timestamp for tracking
                const parserTimestamp = Date.now();
                STATE._parserTimestamp = parserTimestamp;

                // Merge parsed data into state's sub-objects
                mergePageData(STATE, response.data);

                updateFormFromState( STATE );

                // Parser complete - do NOT auto-save, wait for user to click Save button

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
        } else {
          // log(`Parser ${p.name} did not match URL: ${url}`);
        }
      } catch (e) {
        // Parser failed - log to console but don't use logError (no red errors for expected failures)
        console.log(`Parser ${p.name} check failed (expected on non-supported pages):`, e.message);
      }
    }

    if (!matched) {
      // No parser matched - this is normal on non-supported pages, just log
      log('No parser available for this page');
    }
  } catch (error) {
    // Unexpected error in reloadParsers itself
    console.log('Parser initialization error:', error.message);
    log('Parser unavailable');
  } finally {
    hideLoadingSpinner();
  }
}










/**
 * Show the loading spinner overlay
 */
function showLoadingSpinner() {
  const spinner = document.getElementById('loading_spinner');
  const table = document.getElementById('booking_table');
  if (spinner && table) {
    table.style.opacity = '0.3';
    spinner.style.display = 'block';
  }
}

/**
 * Hide the loading spinner overlay
 */
function hideLoadingSpinner() {
  const spinner = document.getElementById('loading_spinner');
  const table = document.getElementById('booking_table');
  if (spinner && table) {
    spinner.style.display = 'none';
    table.style.opacity = '1';
  }
}

/**
 * Populate the booking table with all fields from state.
 * Shows ALL Booking and Client fields, with values if available, blank if not.
 */
function populateBookingTable() {
  const tbody = document.getElementById('booking_tbody');
  if (!tbody) return;

  
  // Clear existing rows
  tbody.innerHTML = '';

  const clientKeys = Client.getFieldNames();
  const bookingKeys = Booking.getFieldNames();

  // merge these two arrays
  const allFields = [...clientKeys, ...bookingKeys];

  // Populate table rows with booking and client data
  allFields.forEach(field => {
    const row = document.createElement('tr');

    // Field name cell
    const nameCell = document.createElement('td');
    nameCell.className = 'field-name';
    nameCell.textContent = field;

    // Field value cell with input
    const valueCell = document.createElement('td');
    valueCell.className = 'field-value';

    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-field', field);
    
    // DATES
    // Convert time fields to 12-hour format and date fields to readable format for display
    let displayValue = STATE.Booking[field] || STATE.Client[field] || '';
    if ((field === 'startTime' || field === 'endTime') && displayValue) {
      displayValue = convertTo12Hour(displayValue);
    }
    if ((field === 'startDate' || field === 'endDate') && displayValue) {
      displayValue = formatDateForDisplay(displayValue);
    }

    // CURRENCY
    if (field === 'hourlyRate' || field === 'flatRate' || field === 'totalAmount') {
      displayValue = formatCurrency( displayValue );
    }

    // DURATION
    if (field === 'duration') {
      displayValue = formatDuration( displayValue );
    }

    // PHONE
    if (field === 'phone') {
      displayValue = formatPhoneForDisplay( displayValue );
    }

    input.value = displayValue;

    // Add event listener to sync changes back to state on input
    input.addEventListener('input', (event) => {
      syncFormFieldToState(field, event.target.value);
    });

    // Add Enter key listener to commit and format the value
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        commitAndFormatField(field, event.target);
      }
    });

    // Add blur listener to commit and format when user leaves field
    input.addEventListener('blur', (event) => {
      commitAndFormatField(field, event.target);
    });
    valueCell.appendChild(input);
    row.appendChild(nameCell);
    row.appendChild(valueCell);
    tbody.appendChild(row);

  }); // all_fields

  // Note: First loop already handled all fields
}






/**
 * Convert 24-hour time to 12-hour format for display.
 * @param {string} time24 - Time in 24-hour format (e.g., "19:00", "04:30")
 * @returns {string} Time in 12-hour format (e.g., "7:00 PM", "4:30 AM")
 */
function convertTo12Hour(time24) {
  if (!time24) return time24;
  const t = String(time24).trim();
  
  // DEBUG: Log the conversion process
  // console.log(`convertTo12Hour input: "${t}"`);
  
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
  
  // console.log(`convertTo12Hour output: "${result}"`);
  return result;
}





/**
 * Convert 12-hour time to 24-hour format for storage.
 * @param {string} time12 - Time in 12-hour format (e.g., "7:00 PM", "4:30 AM")
 * @returns {string} Time in 24-hour format (e.g., "19:00", "04:30")
 */
function convertTo24Hour(time12) {
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
 * Updates the state and refreshes the duration input field.
 */
function calculateDuration() {
  const startTime = STATE.Booking.startTime;
  const endTime = STATE.Booking.endTime;

  if (!startTime || !endTime) return;

  // Convert 12-hour format to 24-hour for calculation
  const start24 = convertTo24Hour(startTime);
  const end24 = convertTo24Hour(endTime);

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
  const durationHours = parseFloat((duration / 60).toFixed(1));
  STATE.Booking.duration = durationHours;

  // Update the duration input field if it exists
  const durationInput = document.querySelector('input[data-field="duration"]');
  if (durationInput) {
    durationInput.value = `${durationHours} hours`;
  }

  // Also recalculate total amount
  calculateTotalAmount();
}


/**
 * Update the display table from current state.
 * Populates the booking table with all fields and values.
 */
function updateFormFromState( state ) {
  STATE = state;
  populateBookingTable();
}



function formatDateForDisplay(value) {
  if (!value) return value;
  const s = String(value).trim();
  if (/(January|February|March|April|May|June|July|August|September|October|November|December)/i.test(s)) {
    return s;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function parseDisplayDateToISO(displayValue) {
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
  return d.toISOString().slice(0, 19) + getTimezoneOffset();
}

function getTimezoneOffset() {
  const offset = new Date().getTimezoneOffset();
  const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
  const sign = offset <= 0 ? '+' : '-';
  return `${sign}${hours}:${minutes}`;
}

/**
 * Commit and format field value when user presses Enter or leaves field
 * @param {string} fieldName - The field being committed
 * @param {HTMLInputElement} inputElement - The input element
 */
function commitAndFormatField(fieldName, inputElement) {
  const rawValue = inputElement.value.trim();
  
  // Sync to state first
  syncFormFieldToState(fieldName, rawValue);

  // Auto-calculate totalAmount if conditions are met
  if (['hourlyRate', 'duration'].includes(fieldName)) {
    calculateTotalAmount();
  }

  // Auto-calculate duration if time fields are committed
  if (['startTime', 'endTime'].includes(fieldName)) {
    calculateDuration();
  }

  // Format and update display based on field type
  let formattedValue = rawValue;
  
  // Format currency fields
  if (['hourlyRate', 'flatRate', 'totalAmount'].includes(fieldName) && rawValue) {
    const numericValue = parseFloat(rawValue.replace(/[$,]/g, ''));
    if (!isNaN(numericValue)) {
      formattedValue = `$${numericValue.toFixed(2)}`;
    }
  }

  // Format duration fields
  if (fieldName === 'duration' && rawValue) {
    const numericValue = parseFloat(rawValue.replace(/\s*hours\s*/i, ''));
    if (!isNaN(numericValue)) {
      formattedValue = `${numericValue} hours`;
    }
  }

  // Format time fields to 12-hour format
  if (['startTime', 'endTime'].includes(fieldName) && rawValue) {
    const timeValue = convertTo24Hour(rawValue);
    if (timeValue) {
      formattedValue = convertTo12Hour(timeValue);
    }
  }
  
  // Format date fields
  if (['startDate', 'endDate'].includes(fieldName) && rawValue) {
    const isoDate = parseDisplayDateToISO(rawValue);
    if (isoDate) {
      formattedValue = formatDateForDisplay(isoDate);
    }
  }

  // Format phone fields
  if (fieldName === 'phone' && rawValue) {
    formattedValue = formatPhoneForDisplay(rawValue);
  }

  // Auto-set endDate to match startDate if endDate is empty (same-day event default)
  if (fieldName === 'startDate' && rawValue && (!STATE.Booking.endDate || STATE.Booking.endDate.trim() === '')) {
    const isoDate = parseDisplayDateToISO(rawValue);
    if (isoDate) {
      STATE.Booking.endDate = isoDate;
      console.log('Auto-set endDate to match startDate:', isoDate);

      // Update the endDate input field display
      const endDateInput = document.querySelector('[data-field="endDate"]');
      if (endDateInput) {
        endDateInput.value = formatDateForDisplay(isoDate);
      }
    }
  }

  // Update the input display and exit edit mode
  inputElement.value = formattedValue;
  inputElement.blur(); // Exit edit mode
}


//
//
//
function syncFormFieldToState(fieldName, displayValue) {
  // Convert display formats back to canonical formats
  let canonicalValue = displayValue;

  // Handle date fields - convert from display format to ISO format
  if ((fieldName === 'startDate' || fieldName === 'endDate') && displayValue) {
    canonicalValue = parseDisplayDateToISO(displayValue);

  // Handle time fields - convert from 12-hour to 24-hour format
  } else if ((fieldName === 'startTime' || fieldName === 'endTime') && displayValue) {
    canonicalValue = convertTo24Hour(displayValue);

  // Handle duration fields - remove 'hours' suffix for storage
  } else if (fieldName === 'duration' && displayValue) {
    canonicalValue = displayValue.replace(/\s*hours\s*/i, '').trim();

  // Handle currency fields - remove $ and convert to number
  } else if (['hourlyRate', 'flatRate', 'totalAmount'].includes(fieldName) && displayValue) {
    canonicalValue = parseFloat(displayValue.toString().replace(/[$,]/g, '')) || 0;

  // Handle phone fields - remove formatting for storage
  } else if (fieldName === 'phone' && displayValue) {
    canonicalValue = displayValue.replace(/[^\d]/g, '');
  }

  if (clientFields.includes(fieldName)) {
    STATE.Client[fieldName] = canonicalValue;
  } else if (bookingFields.includes(fieldName)) {
    STATE.Booking[fieldName] = canonicalValue;
  }

}

/**
 * Auto-calculate totalAmount based on hourlyRate * duration
 * Only calculates if totalAmount and flatRate are not set
 */
function calculateTotalAmount() {
  // Get current values from STATE (already synced)
  const hourlyRate = parseFloat(STATE.Booking.hourlyRate) || 0;
  const duration = parseFloat(STATE.Booking.duration) || 0;
  const flatRate = parseFloat(STATE.Booking.flatRate) || 0;
  const currentTotal = parseFloat(STATE.Booking.totalAmount) || 0;

  // Guard clauses - only calculate if conditions are met
  if (hourlyRate <= 0 || duration <= 0) return; // Need both values
  if (flatRate > 0) return; // flatRate takes precedence
  if (currentTotal > 0) return; // Don't override existing totalAmount

  // Calculate total
  const calculatedTotal = hourlyRate * duration;

  // Update STATE
  STATE.Booking.totalAmount = calculatedTotal;

  // Update form display
  const totalAmountInput = document.querySelector('[data-field="totalAmount"]');
  if (totalAmountInput) {
    totalAmountInput.value = formatCurrency(calculatedTotal);
  }
}

// Define formatCurrency function - ALWAYS display with $ prefix and 2 decimals
function formatCurrency(value) {
  if (value === null || value === undefined || value === '') {
    return '$0.00';
  }

  // Convert to number and format to 2 decimals
  const numericValue = parseFloat(String(value).replace(/[$,]/g, ''));
  if (isNaN(numericValue)) {
    return '$0.00';
  }

  return `$${numericValue.toFixed(2)}`;
}

// Define formatDuration function - ALWAYS display with 'hours' suffix
function formatDuration(value) {
  if (value === null || value === undefined || value === '') {
    return '0 hours';
  }

  const strValue = String(value).trim();

  // If already has 'hours', return as is
  if (strValue.includes('hours')) {
    return strValue;
  }

  // Add 'hours' suffix to any non-empty value
  return `${strValue} hours`;
}

// Define formatPhoneForDisplay function - Format 10-digit US numbers as ABC-DEF-GHIJ
function formatPhoneForDisplay(value) {
  if (!value) return value;

  // Remove any existing formatting
  const digitsOnly = value.toString().replace(/[^\d]/g, '');

  // Handle 10-digit US numbers
  if (digitsOnly.length === 10) {
    return `${digitsOnly.slice(0,3)}-${digitsOnly.slice(3,6)}-${digitsOnly.slice(6)}`;
  }

  // Handle 11-digit with country code (remove leading 1)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    const phone = digitsOnly.slice(1);
    return `${phone.slice(0,3)}-${phone.slice(3,6)}-${phone.slice(6)}`;
  }

  // Return as-is for other formats
  return value;
}


//
// Reload button
//
const reloadBtn = document.getElementById('reloadBtn');
reloadBtn.addEventListener('click', () => {
  clearForm();
  reloadParsers();
});




//
// Settings button
//
const settingsBtn = document.getElementById('settingsBtn');
settingsBtn.addEventListener('click', async () => {
  try {

    // save the current state (only if it has valid client data)
    if (STATE.Client.name && STATE.Client.name.trim() !== '') {
      await STATE.save();
    }
    
    // Dynamic import of PDF settings
    const { default: PDF_settings } = await import(PDF_SETTINGS_JS);
    const pdfSettings = new PDF_settings( STATE );
    await pdfSettings.open();

  } catch (error) {
    console.error('Failed to open settings:', error);
  }
});






/**
 * Clear the current state and the display window.
 * Also updates the status bar to indicate the reset.
 */
function clearForm() {

  STATE.clear();
  updateFormFromState( STATE ); // Re-render UI with empty state
  log('Cleared');

  console.log('State after clear:', JSON.stringify(STATE.toObject(), null, 2));
}



/**
 * Wire UI event handlers for Reload, Cancel, Save, and the editable display window.
 * Converts user-edited key=value lines back into state on input.
 */
function wireUI() {
  // ===== INVOICER PAGE BUTTONS =====
  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => clearForm());

  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => onSave());

  const pdfBtn = document.getElementById('pdfBtn');
  if (pdfBtn) pdfBtn.addEventListener('click', () => onPdf());

  // ===== PAGE NAVIGATION SYSTEM =====
  setupPageSwitching();

  // ===== MCP PAGE CONTROLS =====
  setupMcpControls();
}


// ============================================================================
// PAGE SWITCHING SYSTEM (Hamburger Menu Navigation)
// ============================================================================

/**
 * Set up hamburger menu dropdown and page switching functionality.
 * Handles click events for menu toggle and page navigation.
 */
function setupPageSwitching() {
  const hamburger = document.querySelector('.leedz-hamburger');
  const menu = document.querySelector('.hamburger-menu');

  if (!hamburger || !menu) {
    console.error('Hamburger menu elements not found');
    return;
  }

  // Toggle dropdown menu when hamburger icon is clicked
  hamburger.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent event from bubbling to document
    const isVisible = menu.style.display === 'block';
    menu.style.display = isVisible ? 'none' : 'block';
  });

  // Close menu when clicking anywhere else on the page
  document.addEventListener('click', () => {
    menu.style.display = 'none';
  });

  // Wire up menu items to switch pages
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const pageName = item.dataset.page; // Get page name from data-page attribute
      switchToPage(pageName);
      menu.style.display = 'none'; // Close menu after selection
    });
  });
}

/**
 * Switch to a different page in the sidebar.
 * Hides all pages, shows the target page, and updates the app label.
 *
 * @param {string} pageName - Name of the page to switch to ('invoicer' or 'mcp')
 */
function switchToPage(pageName) {
  // Hide all page containers
  document.querySelectorAll('.page-content').forEach(page => {
    page.style.display = 'none';
  });

  // Show the selected page
  const targetPage = document.getElementById(`page-${pageName}`);
  if (targetPage) {
    targetPage.style.display = 'block';
  } else {
    console.error(`Page not found: page-${pageName}`);
    return;
  }

  // Update app label text and color class
  const label = document.querySelector('.app-label');
  if (label) {
    label.textContent = pageName;
    // Remove all page-specific classes and add the current page class
    label.className = `app-label ${pageName}`;
  }

  // Show/hide invoicer buttons based on active page
  const invoicerButtons = document.getElementById('invoicer-buttons');
  if (invoicerButtons) {
    invoicerButtons.style.display = (pageName === 'invoicer') ? 'flex' : 'none';
  }

  // Auto-run parser when switching to invoicer page
  if (pageName === 'invoicer') {
    reloadParsers();
  }

  // Auto-load MCP config and check server when switching to Gmailer page
  if (pageName === 'gmailer') {
    loadMcpConfigAndCheckServer();
  }
}


// ============================================================================
// MCP PAGE CONTROLS (Gmail OAuth and Server Connection)
// ============================================================================

// Store current OAuth token for revocation
let currentOAuthToken = null;

/**
 * Wire up MCP page button event handlers.
 * Sets up the Enable/Disable Gmail button click handler.
 */
function setupMcpControls() {
  const enableBtn = document.getElementById('enable-gmail-btn');
  if (enableBtn) {
    enableBtn.addEventListener('click', () => {
      // Check button state and call appropriate function
      if (enableBtn.textContent.trim() === 'Disable') {
        disableGmailSending();
      } else {
        enableGmailSending();
      }
    });
  }

  // Set up input field change handlers to save to Config
  const hostInput = document.getElementById('mcp-host');
  const portInput = document.getElementById('mcp-port');

  if (hostInput) {
    hostInput.addEventListener('change', () => saveMcpConfig());
  }

  if (portInput) {
    portInput.addEventListener('change', () => saveMcpConfig());
  }
}

/**
 * Load MCP configuration from database and check server health.
 * Called when switching to MCP page.
 *
 * ORDER OF OPERATIONS:
 * 1. Load Config from leedz_server (port 3000)
 *    - If fails: show nice message, return gracefully
 * 2. If Config loaded: ping MCP server (port 3001)
 *    - Show MCP server status and details
 * 3. If MCP responds: enable button
 */
async function loadMcpConfigAndCheckServer() {
  const statusDiv = document.getElementById('mcp-status');
  const enableBtn = document.getElementById('enable-gmail-btn');
  const hostInput = document.getElementById('mcp-host');
  const portInput = document.getElementById('mcp-port');

  if (statusDiv && enableBtn && hostInput && portInput) {
    console.log('Loading MCP config and checking server...');
  }
  // Step 1: Load Config from main database server
  try {
    await STATE.load();

    // Populate input fields from Config
    const mcpHost = STATE.Config?.mcp_host || '127.0.0.1';
    const mcpPort = STATE.Config?.mcp_port || '3001';

    if (hostInput) hostInput.value = mcpHost;
    if (portInput) portInput.value = mcpPort;

    if (hostInput.value && portInput.value) { 
      console.log(`Loaded MCP config: ${hostInput.value}:${portInput.value}`);
    }

  } catch (error) {
    // Main server not running - show nice message and return
    if (enableBtn) enableBtn.disabled = true;
    console.warn('Could not load MCP config - main server may be down:', error);

    statusDiv.textContent = 'Database server not running. Please start the main server on port 3000.';
    statusDiv.className = 'status-warning';

    // No console.error - graceful handling
    return;
  }

  // Step 2: Check MCP server health
  const mcpHost = hostInput?.value || '127.0.0.1';
  const mcpPort = portInput?.value || '3001';

  try {
    statusDiv.textContent = 'Checking MCP server...';
    statusDiv.className = 'status-checking';

    const serverUrl = `http://${mcpHost}:${mcpPort}`;
    const healthResponse = await fetch(`${serverUrl}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (healthResponse.ok) {
      const healthData = await healthResponse.json();

      // Step 3: Server is running - enable button
      if (enableBtn) enableBtn.disabled = false;

      // Build clear status message with line breaks
      const serviceName = healthData.service || 'gmail-mcp';
      const version = healthData.version ? ` v${healthData.version}` : '';
      const authStatus = healthData.tokenValid ? 'Authorized and ready' : 'Ready to authorize';

      statusDiv.innerHTML = `Connected to ${serviceName}${version}<br>IP: ${mcpHost}:${mcpPort}<br>${authStatus}`;
      statusDiv.className = 'status-success';

    } else {
      throw new Error(`Server returned ${healthResponse.status}`);
    }

  } catch (error) {
    // MCP server not running - disable button
    if (enableBtn) enableBtn.disabled = true;

    statusDiv.textContent = `MCP server not running at ${mcpHost}:${mcpPort}. Please start gmail_mcp server.`;
    statusDiv.className = 'status-error';
  }
}

/**
 * Save MCP host/port configuration to database.
 * Called when user changes input fields.
 */
async function saveMcpConfig() {
  const hostInput = document.getElementById('mcp-host');
  const portInput = document.getElementById('mcp-port');

  if (!hostInput || !portInput) return;

  try {
    // Update State Config object
    if (!STATE.Config) STATE.Config = {};
    STATE.Config.mcp_host = hostInput.value.trim() || '127.0.0.1';
    STATE.Config.mcp_port = portInput.value.trim() || '3001';

    // Save to database
    await STATE.save();

    console.log('MCP config saved:', STATE.Config.mcp_host, STATE.Config.mcp_port);

    // Re-check server health with new settings
    await loadMcpConfigAndCheckServer();

  } catch (error) {
    console.error('Failed to save MCP config:', error);
  }
}

/**
 * Enable Gmail sending by obtaining OAuth token and sending to MCP server.
 *
 * FLOW:
 * 1. Get host/port from input fields
 * 2. Call chrome.identity.getAuthToken() to get Gmail OAuth token
 * 3. POST token to MCP server at http://{host}:{port}/gmail-authorize
 * 4. Display success/failure status
 *
 * Token expires after 1 hour - user must click button again to re-enable.
 */
async function enableGmailSending() {
  const host = document.getElementById('mcp-host').value.trim() || '127.0.0.1';
  const port = document.getElementById('mcp-port').value.trim() || '3001';
  const statusDiv = document.getElementById('mcp-status');
  const enableBtn = document.getElementById('enable-gmail-btn');

  // Clear previous status
  statusDiv.textContent = '';
  statusDiv.className = '';

  try {
    // Update status to show we're starting
    statusDiv.textContent = 'Requesting Gmail authorization...';
    statusDiv.className = 'status-checking';

    // Get OAuth token from Chrome identity API
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(token);
        }
      });
    });

    // Store token for later revocation
    currentOAuthToken = token;

    console.log('OAuth token obtained from Chrome identity');

    // Send token to MCP server
    const serverUrl = `http://${host}:${port}`;
    const response = await fetch(`${serverUrl}/gmail-authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }

    const result = await response.json();

    // Calculate expiration time (1 hour from now)
    const expiryTime = new Date(Date.now() + 60 * 60 * 1000);
    const formattedTime = formatTime12Hour(expiryTime);

    // Show success status with expiry time
    statusDiv.innerHTML = `Gmail authorized successfully.<br>Authorization expires at ${formattedTime}.`;
    statusDiv.className = 'status-success';

    // Change button to "Disable" state
    if (enableBtn) {
      enableBtn.textContent = 'Disable';
      enableBtn.style.backgroundColor = 'coral';
    }

    console.log('Gmail authorization successful:', result);

  } catch (error) {
    // Show user-friendly error status
    statusDiv.innerHTML = 'Error obtaining authorization.<br>Are you logged into Gmail?';
    statusDiv.className = 'status-error';

    console.warn('Gmail authorization failed:', error);
  }
}

/**
 * Disable Gmail sending by revoking OAuth token
 *
 * Steps:
 * 1. Show confirmation prompt
 * 2. Revoke token via Google's OAuth revoke endpoint
 * 3. Clear token from Chrome identity cache
 * 4. Reset UI to "Enable" state
 */
async function disableGmailSending() {
  const statusDiv = document.getElementById('mcp-status');
  const enableBtn = document.getElementById('enable-gmail-btn');

  // Show confirmation prompt
  const confirmed = confirm('Disable Gmail sending?\n\nThis will revoke the authorization token. You will need to re-authorize to send emails again.');

  if (!confirmed) {
    return; // User cancelled
  }

  // Check if we have a token to revoke
  if (!currentOAuthToken) {
    console.warn('No token to revoke');
    resetGmailUI();
    return;
  }

  try {
    statusDiv.textContent = 'Revoking authorization...';
    statusDiv.className = 'status-checking';

    // Revoke token via Google's OAuth revoke endpoint
    const revokeResponse = await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${currentOAuthToken}`, {
      method: 'POST'
    });

    console.log('Token revoke response:', revokeResponse.status);

    // Clear token from Chrome identity cache
    chrome.identity.removeCachedAuthToken({ token: currentOAuthToken }, () => {
      console.log('Token removed from Chrome cache');
    });

    // Clear stored token
    currentOAuthToken = null;

    // Reset UI
    resetGmailUI();

    // Show success status
    statusDiv.textContent = 'Authorization revoked successfully.';
    statusDiv.className = 'status-success';

    console.log('Gmail authorization disabled');

  } catch (error) {
    console.warn('Error disabling Gmail:', error);

    // Even on error, reset UI and clear token
    currentOAuthToken = null;
    resetGmailUI();

    statusDiv.textContent = 'Authorization cleared.';
    statusDiv.className = 'status-warning';
  }
}

/**
 * Reset Gmail UI to "Enable" state
 */
function resetGmailUI() {
  const enableBtn = document.getElementById('enable-gmail-btn');

  if (enableBtn) {
    enableBtn.textContent = 'Enable Gmail Sending (1 hour)';
    enableBtn.style.backgroundColor = '';
  }
}

/**
 * Format time in 12-hour US format (e.g., "9:14 PM")
 * @param {Date} date - Date object to format
 * @returns {string} Formatted time string
 */
function formatTime12Hour(date) {
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
 * Save the current state via the configured DB layer.
 * 
 */
async function onSave() {
  try {
       
    // Ensure current state is saved to Chrome storage for PDF settings page
    await STATE.save();
    // show a toast on failure
    if (STATE.status == 'saved' ) {
      showToast('Data saved successfully', 'success');
    } else {
      showToast('Database server is not available. You can still generate and preview invoices.', 'error');
    }

  } catch (e) {
    logError('Save failed:', e);
    showToast('Save failed. You can still generate and preview invoices.', 'error');
    console.error('Error details:', e);
    console.error('State at time of failure:', JSON.stringify(STATE.toObject(), null, 2));
  }
};



/**
 * RENDER THE PDF
 * 
 * load the State from storage to get the Config settings
 * like company name, logo, address, etc.
 * 
 */
async function onPdf() {
  try {

    log("Updating state...");
    await STATE.load(); // Reload state from storage to ensure latest settings

    log('Rendering PDF...');
    
    // Import PDF render class directly (same as pdf_settings_page.js)
    const { default: PDF_render } = await import(chrome.runtime.getURL(PDF_RENDER_JS));
    const pdfRender = new PDF_render();
    await pdfRender.render( STATE );

    log('PDF generated successfully!');
  } catch (e) {
    logError('PDF render failed:', e);
    
    log('PDF render failed');
    showToast('PDF Render failed', 'error');
  }
}