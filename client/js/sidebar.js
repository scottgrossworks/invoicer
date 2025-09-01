// sidebar.js — LeedzEx Sidebar Control Logic (Simplified for Debugging)

import { StateFactory, copyFromRecord, mergePageData } from './state.js';
import { initLogging, log, logError } from './logging.js';
import { saveData, findData } from './http_utils.js';
import { getDbLayer, getParsers, getRenderer } from './provider_registry.js';

// Create state instance for this app
const state = StateFactory.create();



// Debug check to confirm script execution
// console.log('sidebar.js executing. Checking environment...');
// console.log('Document body:', document.body ? 'Present' : 'Missing');
// console.log('Chrome API available:', typeof chrome !== 'undefined' ? 'Yes' : 'No');




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
    setStatus('Detecting page type...');
    const parsers = await getParsers();
    for (const p of parsers) {
      try {
        if (await p.checkPageMatch()) {
          setStatus(`Parsing with ${p.name || 'parser'}...`);
          await p.parse(state);
          setStatus(`Parsed by ${p.name || 'parser'}`);
          break;
        }
      } catch {}
    }
  } catch (error) {
    logError('Error in reloadParsers:', error);
    setStatus('Parser error');
  }
  updateFormFromState();
}






/**
 * Checks if the current webpage is a LinkedIn profile page
 * Queries the current tab URL and determines if it's a LinkedIn profile
 * If it is, triggers the LinkedIn parsing process
 * @returns {Promise<boolean>} - True if LinkedIn page detected and parsed, false otherwise
 */
function checkForLinkedin() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'leedz_get_tab_url' }, async ({ url, tabId }) => {
      if (!url || !tabId) {
        log('Cannot auto-detect page data');
        resolve(false);
        return;
      }
      
      try {
        // Check if LinkedInParser exists
        if (! window.LinkedInParser) {
          log('LinkedInParser not available');
          resolve(false);
          return;
        }
        
        const isLinkedin = window.LinkedInParser.isLinkedinProfileUrl(url);
        if (!isLinkedin) {
          log('Not a LinkedIn profile page');
          resolve(false);
        } else {
          log('LinkedIn profile page detected');
          await parseLinkedin(url, tabId);
          resolve(true);
        }
      } catch (error) {
        logError('Error checking LinkedIn:', error);
        resolve(false);
      }
    });
  });
}


/**
 * Parses LinkedIn profile data from the current page
 * Queries the database for existing records, populates form with found data,
 * and requests the content script to extract additional LinkedIn profile information
 * @param {string} url - The LinkedIn profile URL being parsed
 * @param {number} tabId - Chrome tab ID where the LinkedIn page is loaded
 * @returns {Promise<void>}
 */
async function parseLinkedin( url, tabId ) {

    // 1. Query DB by LinkedIn URL  
    const linkedinProfile = url.replace(/^https?:\/\/(www\.)?/, '');
    const existingRecord = await findData({ linkedin: linkedinProfile });

    // 2. If found, use it to populate the form
    if (existingRecord) {
      log('Found existing record for: ' + linkedinProfile);
      refresh(existingRecord);
    }


    // 3. Send message to content script to parse LinkedIn page
    // log('Requesting LinkedIn page parsing from content script');
    // 
    chrome.tabs.sendMessage(tabId, { type: 'leedz_parse_linkedin' }, (resp) => {
      if (resp?.ok) {
        // log('Received parsed LinkedIn data');
        // Merge data from parser with existing STATE
        mergePageData(state, resp.data);
  
      } else {
        logError('Failed to parse LinkedIn page:', resp?.error || 'Unknown error');
      }
    });
}









/**
 * Convert current state to key=value lines for the display window.
 * Iterates state entries and emits non-empty values as key=value.
 * @returns {string} Concatenated key=value lines
 */
function formatStateAsKeyValuePairs() {
  const pairs = [];
  
  // Add all non-null/non-empty values as key=value pairs
  state.toObject && Object.entries(state.toObject()).forEach(([k, v]) => {
    if (v !== null && v !== undefined && `${v}`.trim() !== '') {
      pairs.push(`${k}=${v}`);
    }
  });

  // Add existing notes if any
  // (notes included above if present)
  
  return pairs.join(' ');
}






/**
 * Update the display window from current state.
 * Renders state as key=value and puts it into the textarea.
 */
function updateFormFromState() {
  const el = document.getElementById('display_win');
  if (el) el.value = formatStateAsKeyValuePairs();
}











/**
 * Clear the current state and the display window.
 * Also updates the status bar to indicate the reset.
 */
function clearForm() {
  state.clear();
  const el = document.getElementById('display_win');
  if (el) el.value = '';
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



