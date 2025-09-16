// logging.js — Client-side logging utilities for sidebar UI

let consoleOverridden = false;
let listenerAttached = false;

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

export function log(...args) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

export function logError(...args) {
  // eslint-disable-next-line no-console
  console.error(...args);
}

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

function attachMessageListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type === 'leedz_log') {
          log('Received log from background:', message.args);
          // updateDebugOutput(...(message.args || ['No message']));
          sendResponse?.({ received: true });
          return true;
        }
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
    // ignore if not in extension context
  }
}

export function initLogging() {
  // overrideConsole();
  attachMessageListener();
}


