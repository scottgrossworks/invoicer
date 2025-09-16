// sidebar.js — LeedzEx Sidebar Control Logic (Simplified for Debugging)

import { StateFactory, mergePageData } from './state.js';
import { initLogging, log, logError } from './logging.js';

import Booking from './db/Booking.js';
import Client from './db/Client.js';

import { getParsers } from './provider_registry.js';


const PDF_SETTINGS_JS = './settings/PDF_settings.js';
const PDF_RENDER_JS = 'js/render/PDF_render.js';


const clientFields = Client.getFieldNames();
const bookingFields = Booking.getFieldNames();


// Toast notification function
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 16px;
    border-radius: 4px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    max-width: 300px;
    word-wrap: break-word;
    ${type === 'error' ? 'background-color: #dc3545;' : 'background-color: #28a745;'}
  `;
  document.body.appendChild(toast);
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 4000);
}


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
    
    // Initialize parser and reload
    await reloadParsers();
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
                console.log('=== PARSER RESPONSE DEBUG ===');
                console.log('Parser response data:', JSON.stringify(response.data, null, 2));
                console.log('Response timestamp:', new Date().toISOString());

                // Store parser data with timestamp for tracking
                const parserTimestamp = Date.now();
                STATE._parserTimestamp = parserTimestamp;

                // Merge parsed data into state's sub-objects
                mergePageData(STATE, response.data);

                updateFormFromState( STATE );

                // NOW save state with populated data
                STATE.save()
                  .then(() => log('State saved after parser completion'))
                  .catch(error => console.warn('Failed to save state after parsing:', error));

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
        logError(`Parser ${p.name} failed:`, e);
      }
    }

    if (!matched) {
      log('No matching parser found for this page');
    }
  } catch (error) {
    logError('Error in reloadParsers:', error);
    log('Parser error');
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
  if (!time12 || !time12.includes(':')) return time12;
  
  const timeUpper = time12.toUpperCase();
  const isPM = timeUpper.includes('PM');
  const isAM = timeUpper.includes('AM');
  
  if (!isPM && !isAM) return time12; // No AM/PM, assume already 24-hour
  
  const timePart = timeUpper.replace(/\s*(AM|PM)/g, '');
  const [hours, minutes] = timePart.split(':');
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
 * Calculate totalAmount as hourlyRate * duration if both are available.
 * Updates the state and refreshes the totalAmount input field.
 */
function calculateTotalAmount() {
  const hourlyRate = parseFloat(STATE.Booking.hourlyRate);
  const duration = parseFloat(STATE.Booking.duration);

  if (!isNaN(hourlyRate) && !isNaN(duration) && hourlyRate > 0 && duration > 0) {
    const total = hourlyRate * duration;
    STATE.Booking.totalAmount = total; // Store as number
    
    // Update the totalAmount input field if it exists
    const totalInput = document.querySelector('input[data-field="totalAmount"]');
    if (totalInput) {
      totalInput.value = formatCurrency(total.toFixed(2)); // Format for display
    }
  }
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
  }

  if (clientFields.includes(fieldName)) {
    STATE.Client[fieldName] = canonicalValue;
  } else if (bookingFields.includes(fieldName)) {
    STATE.Booking[fieldName] = canonicalValue;
  }

}



// Define formatCurrency function - ALWAYS display with $ prefix
function formatCurrency(value) {
  if (value === null || value === undefined || value === '') {
    return '$0';
  }

  const strValue = String(value).trim();

  // If already has $, return as is
  if (strValue.startsWith('$')) {
    return strValue;
  }

  // Add $ prefix to any non-empty value
  return `$${strValue}`;
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
  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => clearForm());

  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => onSave());

  const pdfBtn = document.getElementById('pdfBtn');
  if (pdfBtn) pdfBtn.addEventListener('click', () => onPdf());
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