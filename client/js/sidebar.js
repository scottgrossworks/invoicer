// sidebar.js — LeedzEx Sidebar Control Logic (Simplified for Debugging)

import { StateFactory, copyFromRecord, mergePageData } from './state.js';
import { initLogging, log, logError } from './logging.js';

import { getDbLayer, getParsers, getRenderer } from './provider_registry.js';

// Create state instance for this app
const state = StateFactory.create();



// Debug check to confirm script execution
log('sidebar.js executing. Checking environment...');
log('Document body:', document.body ? 'Present' : 'Missing');
log('Chrome API available:', typeof chrome !== 'undefined' ? 'Yes' : 'No');




//////////////////// START LOGGING  /////////////////////
initLogging();
//////////////////// END LOGGING  /////////////////////




/**
 * Refreshes the form with data from a database record
 * Updates the application state and form fields with existing record data
 * Typically called when loading existing data from the database
 * @param {Object} record - Database record object containing profile/contact data
 */
function refresh(record) {
  copyFromRecord(state, record);
  updateFormFromState();
}






/*
// DOM CONTENT LOADED
//
//
*/
document.addEventListener('DOMContentLoaded', () => {
  wireUI();
  reloadParsers();
});  // CLOSED the DOMContentLoaded listener

log('sidebar.js script loaded');




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
    log('Getting current tab...');
    
    // Get current tab URL and tabId
    const { url, tabId } = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'leedz_get_tab_url' }, resolve);
    });

      if (!url || !tabId) {
        log('Cannot auto-detect page data');
      setStatus('No page detected');
        return;
      }
      
    log(`Current tab URL: ${url}`);
    log('Loading parsers...');
    const parsers = await getParsers();
    log(`Found ${parsers.length} parsers`);

    let matched = false;
    for (const p of parsers) {
      try {
        log(`Checking parser: ${p.name || 'unnamed'}`);
        // Check if parser matches this URL
        if (p.checkPageMatch && await p.checkPageMatch(url)) {
          setStatus(`Parsing with ${p.name || 'parser'}...`);
          log(`Parser ${p.name} matched! Parsing...`);
          
          // Send message to content script to run the parser
          chrome.tabs.sendMessage(tabId, { 
            type: 'leedz_parse_page', 
            parser: p.name 
          }, (response) => {
            if (response?.ok && response?.data) {
              log(`Parser ${p.name} completed successfully`);
              // Merge parsed data into state
              Object.entries(response.data).forEach(([k, v]) => {
                if (v !== null && v !== undefined && v !== '') {
                  state.set(k, v);
                }
              });
              updateFormFromState();
              setStatus(`Parsed by ${p.name || 'parser'}`);
            } else {
              logError(`Parser ${p.name} failed:`, response?.error || 'Unknown error');
              setStatus('Parse failed');
            }
          });
          
          matched = true;
          break;
        } else {
          log(`Parser ${p.name} did not match URL: ${url}`);
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
  
  // Valid Client fields
  const clientFields = ['name', 'email', 'phone', 'company'];
  
  // Valid Booking fields  
  const bookingFields = ['description', 'location', 
    'startDate', 'startTime', 'endDate', 'endTime', 'duration', 
    'hourlyRate', 'flatRate', 'totalAmount', 'notes'];
  
  const allFields = [...clientFields, ...bookingFields];
  const stateObj = state.toObject ? state.toObject() : {};
  
    // Auto-complete endDate to match startDate if endDate is missing
  if (stateObj.startDate && !stateObj.endDate) {
    state.set('endDate', stateObj.startDate);
    stateObj.endDate = stateObj.startDate; // Update local copy for display
  }
  
  // Calculate duration before displaying if startTime and endTime are available
  if (stateObj.startTime && stateObj.endTime) {
    const [startHours, startMinutes] = stateObj.startTime.split(':').map(Number);
    const [endHours, endMinutes] = stateObj.endTime.split(':').map(Number);
    
    const startTotalMinutes = startHours * 60 + (startMinutes || 0);
    const endTotalMinutes = endHours * 60 + (endMinutes || 0);
    
    let duration;
    if (endTotalMinutes < startTotalMinutes) {
      // Crosses midnight
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
    if ((field === 'startTime' || field === 'endTime') && displayValue) {
      displayValue = convertTo12Hour(displayValue);
    }
    
    // Add 'hours' suffix to duration for display
    if (field === 'duration' && displayValue) {
      displayValue = `${displayValue} hours`;
    }
    
    input.value = displayValue;
    input.setAttribute('data-field', field);
    
    // Update state when input changes
    input.addEventListener('input', (e) => {
      const fieldName = e.target.getAttribute('data-field');
      let value = e.target.value.trim();
      
      // Convert time fields back to 24-hour format for storage
      if ((fieldName === 'startTime' || fieldName === 'endTime') && value) {
        value = convertTo24Hour(value);
      }
      
      // Remove 'hours' suffix from duration before storing
      if (fieldName === 'duration' && value) {
        value = value.replace(/\s*hours?\s*$/i, '').trim();
      }
      
      if (value) {
        state.set(fieldName, value);
      } else {
        state.delete(fieldName);
      }
      
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
  if (!time24 || !time24.includes(':')) return time24;
  
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  const min = minutes || '00';
  
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
      totalInput.value = total.toFixed(2);
    }
  }
}

/**
 * Update the display table from current state.
 * Populates the booking table with all fields and values.
 */
function updateFormFromState() {
  hideLoadingSpinner();
  populateBookingTable();
}











/**
 * Clear the current state and the display window.
 * Also updates the status bar to indicate the reset.
 */
function clearForm() {
  state.clear();
  updateFormFromState(); // Re-render UI with empty state
  setStatus('Cleared');
}

/**
 * Set the one-line status text in the status bar.
 * @param {string} text - Status message to show
 */
function setStatus(text) {
  const s = document.getElementById('statusText');
  if (s) s.textContent = text;
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

  const display = document.getElementById('display_win');
  if (display) {
    display.addEventListener('input', () => {
      const lines = display.value.split(/\r?\n+/);
      state.clear();
      lines.forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) {
          // ADD NEWLINES???
          const key = line.slice(0, idx).trim();
          const val = line.slice(idx + 1).trim();
          if (key) state.set(key, val);
        }
      });
    });
  }
}

/**
 * Save the current state via the configured DB layer.
 * Updates the status bar to reflect progress and result.
 */
async function onSave() {
  try {
    setStatus('Saving...');
    const db = await getDbLayer();
    await db.save(state);
    setStatus('Saved');
  } catch (e) {
    logError('Save failed:', e);
    setStatus('Save failed');
  }
}

async function onPdf() {
  try {
    setStatus('Rendering PDF...');
    const renderer = await getRenderer();
    const result = await renderer.renderToPdf(state, {});
    setStatus(`Save to ${result.fileName} in ${result.dir}`);
  } catch (e) {
    logError('PDF render failed:', e);
    setStatus('PDF render failed');
  }
}



