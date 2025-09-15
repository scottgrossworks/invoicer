/**
 * LEEDZ INVOICER - HTTP API SERVER
 *
 * Main Express.js server providing RESTful API endpoints for client and booking management.
 * Uses OOP architecture with database abstraction layer for modularity and testability.
 *
 * Architecture:
 * - Express.js HTTP server with CORS support
 * - Database abstraction through Leedz_DB interface
 * - OOP validation through Client and Booking classes
 * - Comprehensive error handling with retry logic and timeouts
 * - JSON-based configuration management
 * - File-based logging with console output
 *
 * @author Scott Gross
 * @version 1.0.0
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('../server_config.json');
const { DatabaseFactory } = require('./db_factory');
const { Client } = require('./Client');
const { Booking } = require('./Booking');
const { Config } = require('./Config');

const app = express();
const db = DatabaseFactory.createDatabase(config);
const { initLogging, log, requestLogger, attachProcessHandlers } = require('./logging');

/**
 * MIDDLEWARE AND UTILITY FUNCTIONS
 */

/**
 * Converts date strings to Date objects for booking data
 * @param {Object} data - Booking data object
 * @returns {Object} Data with converted dates
 */
function convertBookingDates(data) {
  return {
    ...data,
    startDate: data.startDate ? new Date(data.startDate) : undefined,
    endDate: data.endDate ? new Date(data.endDate) : undefined,
  };
}

/**
 * Standardized error response handler
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {string} operation - Operation description for logging
 * @param {number} statusCode - HTTP status code (default: 500)
 */
function handleError(res, error, operation, statusCode = 500) {
  log(`${operation} failed: ${error instanceof Error ? error.stack : 'Unknown error'}`);
  
  if (!res.headersSent) {
    res.status(statusCode).json({
      error: statusCode === 500 ? "Internal error" : "Request failed",
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
}

/**
 * Async route wrapper with timeout and error handling
 * @param {Function} handler - Async route handler function
 * @param {string} operation - Operation name for logging
 * @returns {Function} Wrapped route handler
 */
function asyncRoute(handler, operation) {
  return async (req, res) => {
    try {
      await Promise.race([
        handler(req, res),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${operation} timed out after 15000ms`)), 15000)
        )
      ]);
    } catch (error) {
      handleError(res, error, operation);
    }
  };
}

// Get port from config or environment variable
const port = process.env.PORT || config.port || 3000;
initLogging(config.logging, __dirname);

app.use(express.json());
app.use(cors());

/**
 * Request logging middleware
 * Logs all incoming HTTP requests with method and URL
 */
app.use(requestLogger);

// CLIENT ENDPOINTS

/**
 * POST /clients
 * Creates a new client in the database
 * Validates client data using Client.validate() before creation
 */
app.post("/clients", asyncRoute(async (req, res) => {
  const data = req.body;

  // Validate client data
  const validation = Client.validate(data);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", errors: validation.errors });
  }

  const result = await db.createClient(data);
    res.status(200).json(result);
}, "POST /clients"));

/**
 * GET /clients
 * Retrieves clients from database with optional filtering
 * Supports query parameters: email, name
 */
app.get("/clients", asyncRoute(async (req, res) => {
  const { email, name } = req.query;
  const filters = { email, name };

  const results = await db.getClients(filters);
  res.status(200).json(results);
}, "GET /clients"));

/**
 * GET /clients/:id
 * Retrieves a specific client by ID
 */
app.get("/clients/:id", asyncRoute(async (req, res) => {
  const { id } = req.params;
  const client = await db.getClient(id);

  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  res.status(200).json(client);
}, "GET /clients/:id"));

/**
 * DELETE /clients/:id
 * Deletes a client from the database by ID
 */
app.delete("/clients/:id", asyncRoute(async (req, res) => {
  const { id } = req.params;
  
  const client = await db.getClient(id);
  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  const success = await db.deleteClient(id);
  if (!success) {
    return res.status(500).json({ error: "Failed to delete client" });
  }

  res.status(200).json({ success: true, message: `Client ${client.name} deleted successfully` });
}, "DELETE /clients/:id"));

/**
 * PUT /clients/:id
 * Updates a client in the database by ID
 */
app.put("/clients/:id", asyncRoute(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  const existingClient = await db.getClient(id);
  if (!existingClient) {
    return res.status(404).json({ error: "Client not found" });
  }

  const updatedClient = await db.updateClient(id, updateData);
  if (!updatedClient) {
    return res.status(500).json({ error: "Failed to update client" });
  }

  res.status(200).json(updatedClient);
}, "PUT /clients/:id"));

// CLIENT STATISTICS ENDPOINTS

/**
 * GET /clients/stats
 * Retrieves aggregate statistics for all clients
 */
app.get("/clients/stats", asyncRoute(async (req, res) => {
  const stats = await db.getClientStats();
  res.json(stats);
}, "GET /clients/stats"));

/**
 * GET /clients/:id/stats
 * Retrieves statistics for a specific client
 */
app.get("/clients/:id/stats", asyncRoute(async (req, res) => {
  const { id } = req.params;
  const stats = await db.getClientStats(id);
  res.json(stats);
}, "GET /clients/:id/stats"));

// BOOKING ENDPOINTS

/**
 * POST /bookings
 * Creates a new booking in the database
 * Converts string dates to Date objects and validates booking data
 */
app.post("/bookings", asyncRoute(async (req, res) => {
  const bookingData = convertBookingDates(req.body);

  // Validate booking data
  const validation = Booking.validate(bookingData);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", errors: validation.errors });
  }

  const result = await db.createBooking(bookingData);
  res.status(200).json(result);
}, "POST /bookings"));

/**
 * GET /bookings
 * Retrieves bookings from database with optional filtering
 * Supports query parameters: clientId, status
 */
app.get("/bookings", asyncRoute(async (req, res) => {
  const { clientId, status } = req.query;
  const filters = { clientId, status };

  const results = await db.getBookings(filters);
  res.status(200).json(results);
}, "GET /bookings"));

/**
 * GET /bookings/:id
 * Retrieves a specific booking by ID
 */
app.get("/bookings/:id", asyncRoute(async (req, res) => {
  const { id } = req.params;
  const booking = await db.getBooking(id);

  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  res.status(200).json(booking);
}, "GET /bookings/:id"));

/**
 * PUT /bookings/:id
 * Updates an existing booking in the database
 * Converts string dates to Date objects and validates before updating
 */
app.put("/bookings/:id", asyncRoute(async (req, res) => {
  const { id } = req.params;
  const bookingData = convertBookingDates(req.body);

  // Validate booking data
  const validation = Booking.validate(bookingData);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", errors: validation.errors });
  }

  const result = await db.updateBooking(id, bookingData);
  res.status(200).json(result);
}, "PUT /bookings/:id"));

/**
 * DELETE /bookings/:id
 * Deletes a booking from the database
 */
app.delete("/bookings/:id", asyncRoute(async (req, res) => {
  const { id } = req.params;
  const success = await db.deleteBooking(id);

  if (success) {
    res.status(200).json({ success: true });
  } else {
    res.status(404).json({ error: "Booking not found" });
  }
}, "DELETE /bookings/:id"));

// STATISTICS ENDPOINT

/**
 * GET /stats
 * Retrieves system-wide statistics
 */
app.get("/stats", asyncRoute(async (req, res) => {
  const stats = await db.getSystemStats();
  res.json(stats);
}, "GET /stats"));

// CONFIG ENDPOINTS

/**
 * POST /config
 * Uploads and saves client configuration to database
 */
app.post("/config", asyncRoute(async (req, res) => {
  const configData = req.body;
  
  // Validate required fields (basic validation)
  if (!configData || typeof configData !== 'object') {
    return res.status(400).json({ error: "Invalid config data" });
  }

  const result = await db.upsertConfig(configData);
  res.status(200).json(result);
}, "POST /config"));

/**
 * GET /config
 * Retrieves the latest configuration from database
 */
app.get("/config", asyncRoute(async (req, res) => {
  const config = await db.getLatestConfig();
  
  if (!config) {
    return res.status(404).json({ error: "No configuration found" });
  }

  res.status(200).json(config);
}, "GET /config"));

/**
 * DUMP ENDPOINTS FOR DATA EXPORT
 */

app.get('/api/dump/clients', asyncRoute(async (req, res) => {
  const filePath = await dumpClients();
  res.status(200).json({
    success: true,
    message: 'Clients dumped successfully',
    filePath: filePath
  });
}, "GET /api/dump/clients"));

app.get('/api/dump/bookings', asyncRoute(async (req, res) => {
  const filePath = await dumpBookings();
  res.status(200).json({
    success: true,
    message: 'Bookings dumped successfully',
    filePath: filePath
  });
}, "GET /api/dump/bookings"));

app.get('/api/dump/config', asyncRoute(async (req, res) => {
  const filePath = await dumpConfig();
  res.status(200).json({
    success: true,
    message: 'Config dumped successfully',
    filePath: filePath
  });
}, "GET /api/dump/config"));

/**
 * DUMP FUNCTIONS FOR DATA EXPORT
 */

/**
 * Dump all Client objects to JSON file
 */
async function dumpClients() {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    log("Starting Client dump...");
    const clients = await db.getClients({});

    // Convert each client to JSON
    const clientsJson = clients.map(client => {
      const clientObj = new Client(client);
      return clientObj.toInterface();
    });

    // Create JSON array format
    const jsonOutput = JSON.stringify(clientsJson, null, 2);

    // Save to file
    const filePath = path.join(__dirname, '..', 'exports', `clients_${Date.now()}.json`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, jsonOutput);

    log(`Clients dumped to: ${filePath}`);
    return filePath;
  } catch (error) {
    log(`Client dump failed: ${error.message}`);
    throw error;
  }
}

/**
 * Dump all Booking objects to JSON file
 */
async function dumpBookings() {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    log("Starting Booking dump...");
    const bookings = await db.getBookings({});

    // Convert each booking to JSON
    const bookingsJson = bookings.map(booking => {
      const bookingObj = new Booking(booking);
      return bookingObj.toInterface();
    });

    // Create JSON array format
    const jsonOutput = JSON.stringify(bookingsJson, null, 2);

    // Save to file
    const filePath = path.join(__dirname, '..', 'exports', `bookings_${Date.now()}.json`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, jsonOutput);

    log(`Bookings dumped to: ${filePath}`);
    return filePath;
  } catch (error) {
    log(`Booking dump failed: ${error.message}`);
    throw error;
  }
}

/**
 * Dump Config object to JSON file
 */
async function dumpConfig() {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    log("Starting Config dump...");
    const config = await db.getLatestConfig();

    // Convert config to JSON
    const configObj = new Config(config || {});
    const jsonOutput = JSON.stringify(configObj.toInterface(), null, 2);

    // Save to file
    const filePath = path.join(__dirname, '..', 'exports', `config_${Date.now()}.json`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, jsonOutput);

    log(`Config dumped to: ${filePath}`);
    return filePath;
  } catch (error) {
    log(`Config dump failed: ${error.message}`);
    throw error;
  }
}

// Export dump functions for MCP server
module.exports.dumpClients = dumpClients;
module.exports.dumpBookings = dumpBookings;
module.exports.dumpConfig = dumpConfig;

/**
 * Server initialization and startup
 * Establishes database connection, starts HTTP server, and sets up graceful shutdown
 */
(async () => {
  try {
    // Test database connection with timeout
    await Promise.race([
      db.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database connection timed out after 10000ms')), 10000)
      )
    ]);
    log("Database connected successfully");

    const server = app.listen(port, () => {
      log(`! Local API running on http://localhost:${port}`);
    });

    server.on("error", (err) => {
      log("* Server listen failed: " + err.stack);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      log('Received SIGINT, shutting down gracefully...');
      server.close(() => {
        db.disconnect();
        process.exit(0);
      });
    });

  } catch (err) {
    log("* Failed to start server: " + (err instanceof Error ? err.stack : 'Unknown error'));
    process.exit(1);
  }
})();

attachProcessHandlers();
