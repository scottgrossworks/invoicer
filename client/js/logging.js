/**
 * ==============================================================================
 * LOGGING UTILITIES
 * ==============================================================================
 *
 * Client-side logging and notification utilities for the Leedz Invoicer
 * Chrome extension sidebar UI.
 *
 * Features:
 * - Console logging wrappers (log, logError)
 * - Chrome extension message listener for background script logs
 * - Toast notification system for user feedback
 *
 * @author Scott Gross
 * @version 1.0.0
 */

// ==============================================================================
// STATE TRACKING
// ==============================================================================

// Flag to prevent duplicate console override
let consoleOverridden = false;

// Flag to prevent duplicate message listener attachment
let listenerAttached = false;

// ==============================================================================
// DEBUG OUTPUT (currently disabled)
// ==============================================================================

/**
 * Display log messages in on-screen debug output div
 * CURRENTLY DISABLED - Previously used for in-UI debugging
 * @param {...any} args - Log arguments to display
 */
function updateDebugOutput(...args) {
  /*
  const isError = args.length > 0 && args[args.length - 1] === true;
  if (isError) args.pop();
  try {
    const debugOutput = document.getElementById('debug-output');
    if (!debugOutput) return;
    const now = new Date().toLocaleTimeString();
    const message = args
      .map(a => {
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      })
      .join(' ');
    const style = isError ? 'color: #ffdddd;' : '';
    debugOutput.innerHTML += `<div style="${style}">[${now}] ${message}</div>`;
    debugOutput.scrollTop = debugOutput.scrollHeight;
  } catch (e) {
    // As a last resort, fall back to native console
    // eslint-disable-next-line no-console
    console.error('UI log failed', e);
  }
    */
}

// ==============================================================================
// CONSOLE LOGGING WRAPPERS
// ==============================================================================

/**
 * Wrapper for console.log
 * Allows for future enhancement without changing call sites
 * @param {...any} args - Arguments to log
 */
export function log(...args) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

/**
 * Wrapper for console.error
 * Allows for future enhancement without changing call sites
 * @param {...any} args - Error arguments to log
 */
export function logError(...args) {
  // eslint-disable-next-line no-console
  console.error(...args);
}

/**
 * Log user validation errors to console using console.log (not console.error)
 * Use this for user input errors that are NOT program errors
 * @param {...any} args - Validation error arguments to log
 */
export function logValidation(...args) {
  // eslint-disable-next-line no-console
  console.log('[Validation]', ...args);
}

// ==============================================================================
// CONSOLE OVERRIDE (currently disabled)
// ==============================================================================

/**
 * Override native console methods to also route to debug output
 * CURRENTLY DISABLED - Can be enabled for in-UI logging
 */
function overrideConsole() {
  if (consoleOverridden) return;
  consoleOverridden = true;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  console.log = function(...args) {
    originalConsoleLog.apply(console, args);
    // updateDebugOutput(...args);
  };
  console.error = function(...args) {
    originalConsoleError.apply(console, args);
    // updateDebugOutput(...args, true);
  };
}

// ==============================================================================
// CHROME EXTENSION MESSAGE LISTENER
// ==============================================================================

/**
 * Attach listener for log messages from Chrome extension background script
 * Handles 'leedz_log' and 'leedz_error' message types
 */
function attachMessageListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Handle log messages from background script
        if (message?.type === 'leedz_log') {
          log('Received log from background:', message.args);
          // updateDebugOutput(...(message.args || ['No message']));
          sendResponse?.({ received: true });
          return true;
        }
        // Handle error messages from background script
        if (message?.type === 'leedz_error') {
          logError('Received error from background:', message.args);
          // updateDebugOutput(...(message.args || ['No error message']), true);
          sendResponse?.({ received: true });
          return true;
        }
        return false;
      });
    }
  } catch {
    // Silently ignore if not in extension context
  }
}

// ==============================================================================
// INITIALIZATION
// ==============================================================================

/**
 * Initialize logging system
 * Sets up message listener for background script communication
 * Console override is currently disabled
 */
export function initLogging() {
  // overrideConsole();
  attachMessageListener();
}

// ==============================================================================
// TOAST NOTIFICATIONS
// ==============================================================================

/**
 * Display temporary toast notification to user
 * Toast appears in top-right corner and auto-dismisses after 4 seconds
 * Styling is defined in leedz_layout.css (.toast, .toast-success, .toast-error, .toast-info)
 *
 * IMPORTANT: Only ONE toast visible at a time - previous toasts are cleared
 *
 * @param {string} message - Message text to display
 * @param {string} type - Toast type: 'success', 'error', or 'info' (default: 'info')
 */
export function showToast(message, type = 'info') {
  // Clear any existing toasts first (prevent overlap)
  const existingToasts = document.querySelectorAll('.toast');
  existingToasts.forEach(t => {
    if (t.parentNode) {
      t.parentNode.removeChild(t);
    }
  });

  // Create new toast
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Auto-remove toast after 4 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 4000);
}
