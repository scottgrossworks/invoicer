const fs = require('fs');
const path = require('path');

let logFilePath = null;

function initLogging(loggingConfig, baseDir) {
  try {
    logFilePath = path.resolve(baseDir || __dirname, loggingConfig.file);
  } catch (e) {
    // Fallback: disable file logging
    logFilePath = null;
  }
}

function log(message) {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, entry);
    } catch (e) {
      console.error('Failed to write to log:', e && e.message ? e.message : e);
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


