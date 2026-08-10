/**
 * ==============================================================================
 * LOGGING UTILITIES
 * ==============================================================================
 *
 * Client-side logging and notification utilities for the Leedz Booker
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

// Track recently shown toasts to prevent duplicates
const recentToasts = new Map(); // key: message+type, value: timestamp
const TOAST_DEDUPE_WINDOW = 5000; // Don't show same toast within 5 seconds

/**
 * Display temporary toast notification to user
 * Toast appears in top-right corner and auto-dismisses after 4 seconds
 * Styling is defined in leedz_layout.css (.toast, .toast-success, .toast-error, .toast-info)
 *
 * IMPORTANT: Only ONE toast visible at a time - previous toasts are cleared
 * DEDUPLICATION: Same message won't show again within 5 seconds
 *
 * @param {string} message - Message text to display
 * @param {string} type - Toast type: 'success', 'error', or 'info' (default: 'info')
 */
export function showToast(message, type = 'info') {
  // Non-DOM context (background service worker) - nothing to show
  if (typeof document === 'undefined') return;

  // Check if this exact toast was shown recently
  const toastKey = `${message}:${type}`;
  const now = Date.now();
  const lastShown = recentToasts.get(toastKey);

  if (lastShown && (now - lastShown) < TOAST_DEDUPE_WINDOW) {
    // Skip - same toast shown too recently
    return;
  }

  // Track this toast
  recentToasts.set(toastKey, now);

  // Clean up old entries from recentToasts map
  for (const [key, timestamp] of recentToasts.entries()) {
    if (now - timestamp > TOAST_DEDUPE_WINDOW) {
      recentToasts.delete(key);
    }
  }

  // A visible ERROR toast must not be papered over by a later success/info
  // (e.g. LLM failure toast followed by "Page parsed successfully" from the
  // prelim-data fallback). Errors may replace errors; nothing else may.
  const visibleError = document.querySelector('.toast.toast-error');
  if (visibleError && type !== 'error') {
    return;
  }

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

/**
 * User-facing report for a FAILED LLM request (the leedz_llm_request proxy
 * response from background.js). Silent LLM failures produce blank parses that
 * look like extraction bugs (2026-08-04: placeholder API key -> 401 -> empty
 * booking fields with zero user feedback). Maps the failure to an actionable
 * error toast. KEEP IN SYNC with the response shape background.js sends:
 * { ok, status, statusText, error } where error is the Anthropic error object
 * ({ type, message }) when the body was parseable.
 *
 * @param {Object|null} response - proxy response, or null/undefined
 * @returns {string} the message shown (for logging by the caller)
 */
export function showLLMError(response) {
  const status = response?.status;
  const apiMsg = response?.error?.message ||
    (typeof response?.error === 'string' ? response.error : null);

  const apiType = response?.error?.type;

  let msg;
  if (!response) {
    msg = 'AI request got no response - reload the extension and try again.';
  } else if (status === 401 || status === 403) {
    msg = 'AI rejected your API key. Paste a valid key into LLM_KEY.json, then reload the extension.';
  } else if (status === 404 || apiType === 'not_found_error') {
    msg = 'AI model not found - check the llm "provider" model name in leedz_config.json.';
  } else if (status === 429) {
    msg = 'AI rate limit reached - wait a minute, then Parse again.';
  } else if (status >= 500) {
    msg = 'The AI service is overloaded or down - try again in a few minutes.';
  } else if (!status && apiMsg) {
    msg = `Cannot reach the AI service - check the llm settings in leedz_config.json (${apiMsg}).`;
  } else {
    msg = `AI request failed${status ? ` (${status})` : ''}${apiMsg ? `: ${apiMsg}` : ''}.`;
  }

  showToast(msg, 'error');
  return msg;
}
