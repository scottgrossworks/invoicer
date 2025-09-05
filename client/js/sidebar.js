// sidebar.js — LeedzEx Sidebar Control Logic (Simplified for Debugging)

import { StateFactory } from './state.js';
import { initLogging, log, logError } from './logging.js';
import PDF_settings from './settings/PDF_settings.js';

import { getDbLayer, getParsers, getRenderer } from './provider_registry.js';

// Create state instance for this app
const state = StateFactory.create();

// DEBUG: Monitor state changes to catch corruption
const originalSet = state.set;
const originalClear = state.clear;
let stateChangeCounter = 0;

state.set = function(key, value) {
  const beforeState = JSON.stringify(state.toObject());
  const result = originalSet.call(state, key, value);
  const afterState = JSON.stringify(state.toObject());

  stateChangeCounter++;
  console.log(`=== STATE CHANGE #${stateChangeCounter} ===`);
  console.log(`Key: ${key}, Value: ${value}`);
  console.log(`Before: ${beforeState}`);
  console.log(`After: ${afterState}`);

  // Check for data loss
  if (key !== '_parserTimestamp' && key !== 'totalAmount' && beforeState !== '{}' && afterState === '{}') {
    console.error('WARNING: State was cleared during set operation!');
    console.trace('State clear trace:');
  }

  return result;
};

state.clear = function() {
  const beforeState = JSON.stringify(state.toObject());
  const result = originalClear.call(state);

  stateChangeCounter++;
  console.log(`=== STATE CLEAR #${stateChangeCounter} ===`);
  console.log(`Before clear: ${beforeState}`);
  console.log(`After clear: ${JSON.stringify(state.toObject())}`);

  return result;
};



// Debug check to confirm script execution
log('sidebar.js executing. Checking environment...');
log('Document body:', document.body ? 'Present' : 'Missing');
log('Chrome API available:', typeof chrome !== 'undefined' ? 'Yes' : 'No');




//////////////////// START LOGGING  /////////////////////
initLogging();
//////////////////// END LOGGING  /////////////////////







/*
// DOM CONTENT LOADED
//
//
*/
document.addEventListener('DOMContentLoaded', () => {
  wireUI();
  reloadParsers();
});  // CLOSED the DOMContentLoaded listener

// log('sidebar.js script loaded');




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
    setStatus('Detecting page type...');

    // Get current tab URL and tabId
    const { url, tabId } = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'leedz_get_tab_url' }, resolve);
    });

    if (!url || !tabId) {
      log('Cannot auto-detect page data');
      setStatus('No page detected');
      return;
    }

    const parsers = await getParsers();
    log(`Found ${parsers.length} parsers`);

    let matched = false;
    for (const p of parsers) {
      try {
        log(`Checking: ${p.name || 'unnamed'}`);
        // Check if parser matches this URL
        if (p.checkPageMatch && await p.checkPageMatch(url)) {
          setStatus(`Parsing with ${p.name || 'parser'}...`);
          log(`Parser ${p.name} matched! Parsing...`);

          // Wrap the async chrome.tabs.sendMessage in a Promise to make it awaitable
          await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, {
              type: 'leedz_parse_page',
              parser: p.name
            }, (response) => {
              if (response?.ok && response?.data) {
                log(`Parser ${p.name} completed successfully`);

                // DEBUG: Log complete parser response
                // console.log('=== PARSER RESPONSE DEBUG ===');
                //console.log('Parser response data:', JSON.stringify(response.data, null, 2));
                //console.log('Response timestamp:', new Date().toISOString());

                // Store parser data with timestamp for tracking
                const parserTimestamp = Date.now();
                state.set('_parserTimestamp', parserTimestamp);

                Object.entries(response.data).forEach(([k, v]) => {
                  if (v !== null && v !== undefined && v !== '') {
                    state.set(k, v);
                    //console.log(`State set for ${k}: ${v}`);
                  }
                });

                // DEBUG: Log state immediately after parser completion
                // console.log('=== STATE AFTER PARSER COMPLETION ===');
                // console.log('State object:', JSON.stringify(state.toObject(), null, 2));
                // console.log('Parser timestamp stored:', parserTimestamp);

                updateFormFromState();

                              // Save current state to Chrome storage for settings page access - moved here to ensure state is fully updated
              const stateToSave = state.toObject();
              //console.log('=== ABOUT TO SAVE TO CHROME STORAGE ===');
              //console.log('State being saved to Chrome storage:', JSON.stringify(stateToSave, null, 2));

              chrome.storage.local.set({ 'currentBookingState': stateToSave }, () => {
                if (chrome.runtime.lastError) {
                  console.error('Chrome storage save error:', chrome.runtime.lastError);
                } else {
                  // console.log('=== CHROME STORAGE SAVE COMPLETED ===');
                  console.log('Data saved to Chrome storage successfully');

                  // Verify what was actually saved
                  chrome.storage.local.get(['currentBookingState'], (result) => {
                    //console.log('=== CHROME STORAGE VERIFICATION ===');
                    console.log('Data retrieved from Chrome storage:', JSON.stringify(result.currentBookingState, null, 2));
                  });
                }
                resolve(); // Resolve the promise after Chrome storage operation
              });

              } else {
                logError(`Parser ${p.name} failed:`, response?.error || 'Unknown error');
                setStatus('Parse failed');
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
      setStatus('No matching parser found for this page');
    }
  } catch (error) {
    logError('Error in reloadParsers:', error);
    setStatus('Parser error');
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

  // DEBUG: Log state at start of table population
  console.log('=== POPULATE BOOKING TABLE STARTED ===');
  const stateObj = state.toObject ? state.toObject() : {};
  console.log('State object in populateBookingTable:', JSON.stringify(stateObj, null, 2));

  // Clear existing rows
  tbody.innerHTML = '';

  // Valid Client fields
  const clientFields = ['name', 'email', 'phone', 'company'];

  // Valid Booking fields
  const bookingFields = ['description', 'location',
    'startDate', 'startTime', 'endDate', 'endTime', 'duration',
    'hourlyRate', 'flatRate', 'totalAmount', 'notes'];

  const allFields = [...clientFields, ...bookingFields];
  // log('stateObj at start of populateBookingTable:', stateObj);
  
    // Auto-complete endDate to match startDate if endDate is missing
  if (stateObj.startDate && !stateObj.endDate) {
    state.set('endDate', stateObj.startDate);
    stateObj.endDate = stateObj.startDate; // Update local copy for display
  }
  
  // Calculate duration before displaying if startTime and endTime are available
  let duration;
  const startTime = stateObj.startTime;
  const endTime = stateObj.endTime;

  if (startTime && endTime) {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);

    const startTotalMinutes = startHours * 60 + (startMinutes || 0);
    const endTotalMinutes = endHours * 60 + (endMinutes || 0);

    if (endTotalMinutes < startTotalMinutes) {
      duration = (24 * 60 - startTotalMinutes) + endTotalMinutes;
    } else {
      duration = endTotalMinutes - startTotalMinutes;
    }

    const durationHours = (duration / 60).toFixed(1);
    state.set('duration', durationHours);
    stateObj.duration = durationHours; // Update local copy for display
  }
  
  // Calculate totalAmount before displaying if hourlyRate and duration are available
  const hourlyRate = parseFloat(stateObj.hourlyRate);
  const calculatedDuration = parseFloat(stateObj.duration);
  if (!isNaN(hourlyRate) && !isNaN(calculatedDuration) && hourlyRate > 0 && calculatedDuration > 0) {
    const total = hourlyRate * calculatedDuration;
    state.set('totalAmount', total.toFixed(2));
    stateObj.totalAmount = total.toFixed(2); // Update local copy for display
  }
  
  // Create table rows for all fields
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
    
    // Convert time fields to 12-hour format for display
    let displayValue = stateObj[field] || '';
    //log(`Field: ${field}, stateObj[field]: ${stateObj[field]}, initial displayValue: ${displayValue}`);
    if ((field === 'startTime' || field === 'endTime') && displayValue) {
      displayValue = convertTo12Hour(displayValue);
      //log(`  After convertTo12Hour for ${field}: ${displayValue}`);
    }
    // Pretty-print ISO-like dates for display only
    if ((field === 'startDate' || field === 'endDate') && displayValue) {
      displayValue = formatDateForDisplay(displayValue);
      //log(`  After formatDateForDisplay for ${field}: ${displayValue}`);
    }
    
    // Add 'hours' suffix to duration for display
    if (field === 'duration' && displayValue) {
      displayValue = `${displayValue} hours`;
    }
    
    // Define formatCurrency function - ALWAYS display with $ prefix
    function formatCurrency(value) {
      if (!value || value === '' || value === null || value === undefined) {
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

    // Ensure currency fields display with a '$' prefix
    if (field === 'hourlyRate' || field === 'flatRate' || field === 'totalAmount') {
      displayValue = formatCurrency(displayValue);
    }
    
    input.value = displayValue;
    input.setAttribute('data-field', field);
    

    // Handle Enter key to commit changes and format currency
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const fieldName = e.target.getAttribute('data-field');
        const value = e.target.value.trim();

        // Remove 'hours' suffix from duration before storing
        let processedValue = value;
        if (fieldName === 'duration' && processedValue) {
          processedValue = processedValue.replace(/\s*hours?\s*$/i, '').trim();
        }

        // Ensure currency fields display with a '$' prefix
        if (fieldName === 'hourlyRate' || fieldName === 'flatRate' || fieldName === 'totalAmount') {
          processedValue = formatCurrency(processedValue);
          e.target.value = processedValue; // Update display immediately
        }

        // Add 'hours' suffix to duration for display
        if (fieldName === 'duration' && processedValue) {
          e.target.value = `${processedValue} hours`;
        }

        // Update state only on Enter
        if (processedValue) {
          state.set(fieldName, processedValue);
        } else {
          state.set(fieldName, null);
        }

        // Handle auto-calculations
        handleFieldCalculations(fieldName, processedValue);

        e.target.blur(); // Remove focus to show the value is committed
      }
    });

    // Handle blur for currency formatting (but don't update state)
    input.addEventListener('blur', (e) => {
      const fieldName = e.target.getAttribute('data-field');
      if (fieldName === 'hourlyRate' || fieldName === 'flatRate' || fieldName === 'totalAmount') {
        const value = e.target.value.trim();
        if (value && !value.startsWith('$')) {
          e.target.value = formatCurrency(value);
        }
      }
    });
    
    valueCell.appendChild(input);
    row.appendChild(nameCell);
    row.appendChild(valueCell);
    tbody.appendChild(row);
  });
}






/**
 * Convert 24-hour time to 12-hour format for display.
 * @param {string} time24 - Time in 24-hour format (e.g., "19:00", "04:30")
 * @returns {string} Time in 12-hour format (e.g., "7:00 PM", "4:30 AM")
 */
function convertTo12Hour(time24) {
  if (!time24) return time24;
  const t = String(time24).trim();
  // If already in 12-hour format with AM/PM, return as-is
  if (/\b(AM|PM)\b/i.test(t)) return t;
  if (!t.includes(':')) return t;
  
  const [hours, minutes] = t.split(':');
  const hour = parseInt(hours, 10);
  const min = (minutes || '00').replace(/\s*(AM|PM)/i, '');
  if (isNaN(hour)) return t;
  
  if (hour === 0) return `12:${min} AM`;
  if (hour < 12) return `${hour}:${min} AM`;
  if (hour === 12) return `12:${min} PM`;
  return `${hour - 12}:${min} PM`;
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
  const startTime = state.get('startTime');
  const endTime = state.get('endTime');
  
  if (!startTime || !endTime) return;
  
  // Parse times (both stored in 24-hour format)
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  
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
  const durationHours = (duration / 60).toFixed(1);
  
  state.set('duration', durationHours);
  
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
  const hourlyRate = parseFloat(state.get('hourlyRate'));
  const duration = parseFloat(state.get('duration'));
  
  if (!isNaN(hourlyRate) && !isNaN(duration) && hourlyRate > 0 && duration > 0) {
    const total = hourlyRate * duration;
    state.set('totalAmount', total.toFixed(2));
    
    // Update the totalAmount input field if it exists
    const totalInput = document.querySelector('input[data-field="totalAmount"]');
    if (totalInput) {
      totalInput.value = formatCurrency(total.toFixed(2));
    }
  }
}

/**
 * Update the display table from current state.
 * Populates the booking table with all fields and values.
 */
function updateFormFromState() {
  console.log('=== UPDATE FORM FROM STATE CALLED ===');
  console.log('State before form update:', JSON.stringify(state.toObject(), null, 2));

  hideLoadingSpinner();
  populateBookingTable();

  console.log('State after form update:', JSON.stringify(state.toObject(), null, 2));
}

/**
 * Handle automatic calculations when fields are updated
 * @param {string} fieldName - The field that was updated
 * @param {string} value - The new value
 */
function handleFieldCalculations(fieldName, value) {
  // Auto-complete endDate when startDate is entered
  if (fieldName === 'startDate' && value) {
    const endDateInput = document.querySelector('input[data-field="endDate"]');
    if (endDateInput && !endDateInput.value.trim()) {
      endDateInput.value = value;
      state.set('endDate', value);
    }
  }

  // Auto-calculate duration if startTime and endTime are available
  if (fieldName === 'startTime' || fieldName === 'endTime') {
    calculateDuration();
  }

  // Auto-calculate totalAmount if hourlyRate and duration are available
  if (fieldName === 'hourlyRate' || fieldName === 'duration') {
    calculateTotalAmount();
  }
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
    // Dynamic import of PDF settings
    const { default: PDF_settings } = await import('./settings/PDF_settings.js');
    const pdfSettings = new PDF_settings();
    await pdfSettings.open();
  } catch (error) {
    console.error('Failed to open settings:', error);
  }
});



// FOOTER
/**
const footer = document.getElementsByClassName('leedz-grass');
footer[0].addEventListener('click', () => {
  // COLLAPSE THE FOOTER?
  toggleFooter(); // Call to collapse the footer
});
*/





/**
 * Clear the current state and the display window.
 * Also updates the status bar to indicate the reset.
 */
function clearForm() {
  console.log('=== CLEAR FORM CALLED ===');
  console.log('State before clear:', JSON.stringify(state.toObject(), null, 2));
  console.log('Clear timestamp:', new Date().toISOString());

  state.clear();
  updateFormFromState(); // Re-render UI with empty state
  setStatus('Cleared');

  console.log('State after clear:', JSON.stringify(state.toObject(), null, 2));
}

/**
 * REDIRECTS TO FOOTER
 * @param {string} text - Status message to show
 */
function setStatus(text) {
  // const s = document.getElementById('statusText');
  // if (s) s.textContent = text;
  log(text);
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


  /**
  // Add grass toggle functionality
  const grassToggle = document.getElementById('grass-toggle');
  if (grassToggle) {
    console.log('Grass element found, adding click listener...');
    grassToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFooter();
    });

  } else {
    console.error('Grass toggle element not found!');
  }
*/


  const display = document.getElementById('display_win');
  if (display) {
    // Remove problematic display_win input listener
    // const display = document.getElementById('display_win');
    // if (display) {
    //   display.addEventListener('input', () => {
    //     console.log('=== DISPLAY_WIN INPUT DETECTED ===');
    //     console.log('This should NOT be clearing the state from parser data!');
    //     console.log('Display content:', display.value);
    //
    //     const lines = (display.value || '').split(/\r?\n+/);
    //     console.log('Parsed lines:', lines);
    //
    //     // Only clear state if display is actually empty (user manually cleared it)
    //     if (display.value.trim() === '') {
    //       console.log('Display is empty, clearing state');
    //       state.clear();
    //     } else {
    //       // Don't clear state for parser data - just update from display
    //       lines.forEach(line => {
    //         const idx = line.indexOf('=');
    //         if (idx > 0) {
    //           const key = line.slice(0, idx).trim();
    //           const val = line.slice(idx + 1).trim();
    //           if (key) state.set(key, val);
    //         }
    //       });
    //     }
    //   });
    // }
  }
}

/**
 * Save the current state via the configured DB layer.
 * Updates the status bar to reflect progress and result.
 */
async function onSave() {
  try {
    // DEBUG: Log current timestamp and state before any operations
    console.log('=== SAVE FUNCTION STARTED ===');
    console.log('Save timestamp:', new Date().toISOString());
    const currentStateBefore = state.toObject();
    console.log('Current state before Chrome storage sync:', JSON.stringify(currentStateBefore, null, 2));

    // Check for parser timestamp to verify data integrity
    const parserTimestamp = state.get('_parserTimestamp');
    const saveTimestamp = Date.now();
    console.log('Parser timestamp:', parserTimestamp);
    console.log('Save timestamp:', saveTimestamp);
    console.log('Time difference (ms):', parserTimestamp ? saveTimestamp - parserTimestamp : 'No parser timestamp found');

    // If state is empty, try to restore from Chrome storage first
    if (Object.keys(currentStateBefore).length === 0 || !currentStateBefore.name || !currentStateBefore.email) {
      console.log('=== STATE IS EMPTY - ATTEMPTING RECOVERY ===');
      console.log('Trying to restore from Chrome storage...');

      try {
        const chromeData = await chrome.storage.local.get(['currentBookingState']);
        if (chromeData.currentBookingState && Object.keys(chromeData.currentBookingState).length > 0) {
          console.log('Found data in Chrome storage:', JSON.stringify(chromeData.currentBookingState, null, 2));

          // Restore state from Chrome storage
          state.fromObject(chromeData.currentBookingState);
          console.log('State restored from Chrome storage');

          // Re-log the state after recovery
          console.log('State after recovery:', JSON.stringify(state.toObject(), null, 2));
        } else {
          console.log('No data found in Chrome storage');
        }
      } catch (storageError) {
        console.error('Failed to read from Chrome storage:', storageError);
      }
    }

    // Ensure current state is saved to Chrome storage for PDF settings page
    await chrome.storage.local.set({ 'currentBookingState': state.toObject() });

    // DEBUG: Log what we're sending to database
    console.log('=== DATABASE SAVE DEBUG ===');
    const stateData = state.toObject();
    console.log('State object being saved:', JSON.stringify(stateData, null, 2));

    // Validate critical fields
    const criticalFields = ['name', 'email'];
    const recommendedFields = ['location']; // 'description' is now optional and can be null/empty
    const missingCritical = criticalFields.filter(field => !stateData[field]);
    const missingRecommended = recommendedFields.filter(field => !stateData[field]);

    if (missingCritical.length > 0) {
      const errorMsg = `Missing required fields: ${missingCritical.join(', ')}`;
      console.error('CRITICAL ERROR:', errorMsg);
      console.log('Available fields:', Object.keys(stateData));
      setStatus(`Save failed: ${errorMsg}`);
      return; // Don't proceed with save
    }

    if (missingRecommended.length > 0) {
      console.warn('WARNING: Missing recommended fields:', missingRecommended);
      console.log('Available fields:', Object.keys(stateData));
    }

    // Ensure all values are converted to empty strings if they are null or undefined
    const cleanedStateData = {};
    for (const key in stateData) {
      cleanedStateData[key] = stateData[key] === null || stateData[key] === undefined ? '' : stateData[key];
    }

    setStatus('Saving...');
    const db = await getDbLayer();
    await db.save(cleanedStateData); // Pass the cleaned state data
    setStatus('Saved');

    console.log('=== SAVE FUNCTION COMPLETED SUCCESSFULLY ===');
  } catch (e) {
    logError('Save failed:', e);
    console.error('=== SAVE FUNCTION FAILED ===');
    console.error('Error details:', e);
    console.error('State at time of failure:', JSON.stringify(state.toObject(), null, 2));
    setStatus('Save failed');
  }
}




async function onPdf() {
  try {
    setStatus('Rendering PDF...');
    
    // Import PDF render class directly (same as pdf_settings_page.js)
    const { default: PDF_render } = await import(chrome.runtime.getURL('js/render/PDF_render.js'));
    const pdfRender = new PDF_render();
    
    const pdfSettings = new PDF_settings();
    const settings = await pdfSettings.load();

    // DEBUG: Log Chrome storage read operation
    console.log('=== PDF FUNCTION: READING FROM CHROME STORAGE ===');

    // Get real booking state from Chrome storage
    const stateData = await chrome.storage.local.get(['currentBookingState']);
    console.log('PDF function - Chrome storage data retrieved:', JSON.stringify(stateData.currentBookingState, null, 2));

    // DEBUG: Compare with main state
    console.log('PDF function - Main state comparison:', JSON.stringify(state.toObject(), null, 2));

    // Construct a state-like object that prioritizes real data over mock data
    const invoiceState = {
      get: (key) => {
        // Prioritize real state data
        if (stateData.currentBookingState && stateData.currentBookingState[key] !== undefined && stateData.currentBookingState[key] !== null && stateData.currentBookingState[key] !== '') {
          return stateData.currentBookingState[key];
        }
        // Fallback to settings or default for description and location if stateData is empty
        if (key === 'description') return settings.servicesPerformed || '';
        if (key === 'location') return settings.companyAddress ? settings.companyAddress.split('\n')[0] : '';
        // Fallback to empty string for other fields if no real data or setting
        return '';
      }
    };
    
    // DEBUG: Log the data being passed to PDF
    console.log('=== PDF Data Debug ===');
    console.log('Raw stateData:', stateData.currentBookingState);
    console.log('Currency values:', {
      hourlyRate: invoiceState.get('hourlyRate'),
      flatRate: invoiceState.get('flatRate'), 
      totalAmount: invoiceState.get('totalAmount'),
      // Add unitPrice for PDF rendering (can be hourlyRate or flatRate)
      unitPrice: invoiceState.get('hourlyRate') || invoiceState.get('flatRate') || ''
    });
    
    await pdfRender.render(invoiceState, settings);
    setStatus('PDF generated successfully!');
  } catch (e) {
    logError('PDF render failed:', e);
    setStatus('PDF render failed');
  }
}




/**
 * Toggle footer between collapsed and expanded states
 
function toggleFooter() {
  console.log('Grass clicked! Toggling footer...');
  const footer = document.getElementById('footer');
  if (footer) {
    footer.classList.toggle('expanded');
    console.log('Footer classes:', footer.className);
  } else {
    console.error('Footer element not found!');
  }
}

*/


