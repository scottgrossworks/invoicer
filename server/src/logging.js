const fs = require('fs');
const path = require('path');

let logFilePath = null;

function initLogging(loggingConfig, baseDir) {
  try {
    logFilePath = path.resolve(baseDir || __dirname, loggingConfig.file);

    // Ensure log directory exists
    const logDir = path.dirname(logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Test write to verify permissions
    const testMessage = `[${new Date().toISOString()}] Logging initialized: ${logFilePath}\n`;
    fs.appendFileSync(logFilePath, testMessage);
    console.log(`Logging enabled: ${logFilePath}`);
  } catch (e) {
    // Fallback: disable file logging and warn
    console.error(`WARNING: Could not initialize file logging to ${logFilePath}: ${e.message}`);
    console.error('File logging disabled - console only');
    logFilePath = null;
  }
}

function log(message) {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, entry);
    } catch (e) {
      console.error(`ERROR: Failed to write to log file ${logFilePath}:`, e && e.message ? e.message : e);
      // Disable further file logging to avoid repeated errors
      console.error('Disabling file logging due to write error');
      logFilePath = null;
    }
  }
  console.log(message);
}

function requestLogger(req, res, next) {
  log(`${req.method} ${req.url}`);
  next();
}

function attachProcessHandlers() {
  process.on('uncaughtException', (err) => {
    log(`* Uncaught Exception: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason && reason.stack ? reason.stack : String(reason);
    log(`* Unhandled Rejection: ${msg}`);
    process.exit(1);
  });
}

module.exports = {
  initLogging,
  log,
  requestLogger,
  attachProcessHandlers,
};


