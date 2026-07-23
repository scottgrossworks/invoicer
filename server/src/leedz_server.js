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
const fs = require('fs');

const { DatabaseFactory } = require('./db_factory');
const { Client } = require('./Client');
const { Booking } = require('./Booking');
// Config model removed (U4); business identity is runtime-only (KTD1).
const { exportAllDataToCSV } = require('./csv_exporter');

// Detect if running in pkg and get actual executable directory
const isPkg = typeof process.pkg !== 'undefined';
const baseDir = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');

// Load config using fs.readFileSync to bypass Node.js module cache
// In packaged mode, read from filesystem (next to .exe), not from pkg snapshot
// This ensures config changes are picked up on server restart
const configPath = path.join(baseDir, 'server_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Logging will be initialized later, so use console for early startup messages
console.log(`[STARTUP] Running in ${isPkg ? 'PACKAGED' : 'DEV'} mode`);
console.log(`[STARTUP] Base directory: ${baseDir}`);
console.log(`[STARTUP] Config loaded from: ${configPath}`);
console.log(`[STARTUP] Database config: ${JSON.stringify(config.database)}`);

// Resolve and validate database path from config
if (config?.database?.url && config.database.url.startsWith('file:')) {
  const relativePath = config.database.url.replace(/^file:/, '');
  const absolutePath = path.resolve(baseDir, relativePath);
  config.database.url = 'file:' + absolutePath;
  console.log(`[STARTUP] Resolved database path: ${absolutePath}`);
}

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
initLogging(config.logging, baseDir);

app.use(express.json());

// CORS hardening (KTD15): the server binds 127.0.0.1, but open cors() let any
// visited web page drive it. Restrict to the extension origin and localhost;
// still allow origin-less requests (curl, same-origin OAuth redirects, health
// probes). NOTE: per-route JWT auth on state-changing routes is a further KTD15
// item that requires client-side coordination and is tracked separately.
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true); // curl / server-to-server / OAuth redirect
    if (origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://') ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  }
};
app.use(cors(corsOptions));

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
 * 11/3/2025: Added company and search query parameters for expanded client filtering
 * 11/19/2025: Enhanced with additional operators for better MCP discoverability
 *
 * Query Parameters:
 * - email: Exact email match
 * - name: Partial name match (contains)
 * - company: Partial company match (contains)
 * - search: Search across name/email/company fields
 * - search_any: Comma-separated keywords, matches any (e.g., "French,France,Francais")
 * - name_startsWith: Names starting with prefix
 * - email_endsWith: Emails ending with suffix (e.g., ".edu")
 * - company_not: Exclude specific company
 * - updatedAt_lt: Updated before date (ISO format)
 * - updatedAt_gte: Updated on or after date (ISO format)
 * - orderBy: Sort field (name, email, company, createdAt, updatedAt)
 * - order: Sort direction (asc or desc)
 */
app.get("/clients", asyncRoute(async (req, res) => {
  const {
    email, name, company, search, search_any,
    name_startsWith, email_endsWith, company_not,
    updatedAt_lt, updatedAt_gte,
    orderBy, order
  } = req.query;

  const filters = {
    email, name, company, search, search_any,
    name_startsWith, email_endsWith, company_not,
    updatedAt_lt, updatedAt_gte,
    orderBy, order
  };

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

/**
 * PUT /clients/:id/touch
 * Marks client as processed by updating updatedAt timestamp without changing data
 * Useful for workflow tracking - "I've reviewed this client"
 */
app.put("/clients/:id/touch", asyncRoute(async (req, res) => {
  const { id } = req.params;

  const existingClient = await db.getClient(id);
  if (!existingClient) {
    return res.status(404).json({ error: "Client not found" });
  }

  // Update with empty data - Prisma will still update updatedAt timestamp
  const touchedClient = await db.updateClient(id, {});

  res.status(200).json({
    success: true,
    message: "Client marked as processed",
    client: touchedClient
  });
}, "PUT /clients/:id/touch"));

/**
 * PUT /clients/touch
 * Marks client as processed by name or email
 * Accepts: { name: "John Doe" } OR { email: "john@example.com" }
 * Returns error if client not found or multiple matches
 */
app.put("/clients/touch", asyncRoute(async (req, res) => {
  const { name, email } = req.body;

  if (!name && !email) {
    return res.status(400).json({
      error: "Missing required parameter",
      message: "Must provide either 'name' or 'email'"
    });
  }

  // Look up client by email (exact match) or name (contains)
  const filters = email ? { email } : { name };
  const clients = await db.getClients(filters);

  if (clients.length === 0) {
    return res.status(404).json({
      error: "Client not found",
      message: email
        ? `No client found with email: ${email}`
        : `No client found with name: ${name}`
    });
  }

  if (clients.length > 1) {
    return res.status(400).json({
      error: "Multiple clients found",
      message: `Found ${clients.length} clients matching '${name || email}'. Please be more specific or use client ID.`,
      clients: clients.map(c => ({ id: c.id, name: c.name, email: c.email }))
    });
  }

  // Exactly one client found - touch it
  const client = clients[0];
  const touchedClient = await db.updateClient(client.id, {});

  res.status(200).json({
    success: true,
    message: "Client marked as processed",
    client: touchedClient
  });
}, "PUT /clients/touch"));

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
 * Creates a new booking in the database or updates existing duplicate
 *
 * ENHANCED 10/20/2025: Accepts EITHER:
 *   1. clientId (direct booking creation)
 *   2. Client details (name, email, etc.) - creates/finds client first, then creates booking
 *
 * This eliminates need for MCP server to make separate client creation calls.
 * Converts string dates to Date objects and validates booking data
 * Checks for duplicates based on clientId + location + startDate
 */
app.post("/bookings", asyncRoute(async (req, res) => {
  let bookingData = convertBookingDates(req.body);

  // STEP 1: Handle client creation if client details provided instead of clientId
  if (!bookingData.clientId && (bookingData.name || bookingData.email)) {
    // Extract client fields from booking data
    const clientData = {
      name: bookingData.name,
      email: bookingData.email,
      phone: bookingData.phone,
      company: bookingData.company,
      clientNotes: bookingData.clientNotes
    };

    // Validate client data
    const clientValidation = Client.validate(clientData);
    if (!clientValidation.isValid) {
      return res.status(400).json({
        error: "Client validation failed",
        errors: clientValidation.errors
      });
    }

    // Create or find existing client (createClient handles find-or-create logic)
    const client = await db.createClient(clientData);

    // Add clientId to booking data
    bookingData.clientId = client.id;

    // Remove client fields from booking data to avoid Prisma errors
    delete bookingData.name;
    delete bookingData.email;
    delete bookingData.phone;
    delete bookingData.company;
    delete bookingData.clientNotes;
  }

  // STEP 2: Validate booking data (now with clientId)
  const validation = Booking.validate(bookingData);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Booking validation failed", errors: validation.errors });
  }

  // STEP 3: Check for duplicate bookings
  let isUpdate = false;
  let result;

  if (bookingData.clientId && bookingData.location && bookingData.startDate) {
    // 10/22/2025: Use date range query to check for duplicates on the same calendar day
    // This prevents duplicates while preserving time information in the database
    const startOfDay = new Date(bookingData.startDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(bookingData.startDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await db.getBookings({
      clientId: bookingData.clientId,
      location: bookingData.location,
      startDateFrom: startOfDay,
      startDateTo: endOfDay
    });

    if (existingBookings.length > 0) {
      // Duplicate found - update existing booking
      const existingBooking = existingBookings[0];

      // Filter out any fields that aren't in Prisma schema to prevent errors
      const allowedFields = [
        'title', 'description', 'notes', 'location',
        'startDate', 'endDate', 'startTime', 'endTime',
        'duration', 'hourlyRate', 'flatRate', 'totalAmount',
        'status', 'source'
      ];
      const filteredData = {};
      allowedFields.forEach(field => {
        if (bookingData[field] !== undefined) {
          filteredData[field] = bookingData[field];
        }
      });

      const updateValidation = Booking.validateUpdate(filteredData);
      if (!updateValidation.isValid) {
        return res.status(400).json({ error: "Update validation failed", errors: updateValidation.errors });
      }
      result = await db.updateBooking(existingBooking.id, filteredData);
      isUpdate = true;
    } else {
      // No duplicate - create new booking
      result = await db.createBooking(bookingData);
    }
  } else {
    // Missing required fields for duplicate check - create new booking
    result = await db.createBooking(bookingData);
  }

  res.status(200).json({
    ...result,
    isUpdate: isUpdate
  });
}, "POST /bookings"));

/**
 * GET /bookings
 * Retrieves bookings from database with optional filtering
 * Supports query parameters: clientId, status, startDateFrom, startDateTo, clientEmail, clientName
 * 9/30/2025: Added date range filtering (startDateFrom, startDateTo) to improve MCP performance
 * 10/6/2025: Added clientEmail filtering to enable querying by client email
 * 10/22/2025: Added clientName filtering to enable querying by client name
 * Example: GET /bookings?startDateFrom=2025-01-01&startDateTo=2025-03-31
 * Example: GET /bookings?clientEmail=john@example.com
 * Example: GET /bookings?clientName=Bob Jones
 */
app.get("/bookings", asyncRoute(async (req, res) => {
  const { clientId, status, startDateFrom, startDateTo, clientEmail, clientName } = req.query;

  // 9/30/2025: Build filters object with date range support
  // 10/6/2025: Added clientEmail to filters
  // 10/22/2025: Added clientName to filters
  const filters = { clientId, status, clientEmail, clientName };

  // 9/30/2025: Convert date string parameters to Date objects if provided
  if (startDateFrom) {
    filters.startDateFrom = new Date(startDateFrom);
  }

  if (startDateTo) {
    filters.startDateTo = new Date(startDateTo);
  }

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
 * GET /bookings/search/:keyword
 * Searches bookings by keyword across title, description, and notes
 */
app.get("/bookings/search/:keyword", asyncRoute(async (req, res) => {
  const { keyword } = req.params;
  const results = await db.searchBookings(keyword);
  res.status(200).json(results);
}, "GET /bookings/search/:keyword"));

/**
 * PUT /bookings/:id
 * Updates an existing booking in the database
 * Converts string dates to Date objects and validates before updating
 */
app.put("/bookings/:id", asyncRoute(async (req, res) => {
  const { id } = req.params;
  const bookingData = convertBookingDates(req.body);

  // Validate booking data
  const validation = Booking.validateUpdate(bookingData);
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

// HEALTH / META ENDPOINT
//
// Replaces the removed GET/POST /config (U4/U5). Business identity now loads at
// runtime from VALUE_PROP.md (KTD1); runtime connection/LLM settings live in the
// client's chrome.storage. The only thing the client needs from the old /config
// is the database name + a liveness signal.

/**
 * Extract the sqlite filename from the database URL (no absolute path leaked).
 */
function databaseDisplayName() {
  if (db.databaseUrl) {
    const match = db.databaseUrl.match(/[^/\\]+\.sqlite$/);
    if (match) return match[0];
  }
  return 'unknown';
}

/**
 * GET /health
 * Liveness + database name. Returns ONLY { status, databaseName } — never any
 * absolute filesystem path or secret (KTD15).
 */
app.get("/health", asyncRoute(async (req, res) => {
  res.status(200).json({ status: "ok", databaseName: databaseDisplayName() });
}, "GET /health"));

// Alias: some callers may probe /meta.
app.get("/meta", asyncRoute(async (req, res) => {
  res.status(200).json({ status: "ok", databaseName: databaseDisplayName() });
}, "GET /meta"));

// SQUARE CONNECTION ENDPOINTS

/**
 * GET /square/status
 * Reports whether a Square connection exists. Returns ONLY non-secret fields
 * (KTD15) — never accessToken/refreshToken.
 */
app.get("/square/status", asyncRoute(async (req, res) => {
  const conn = await db.getSquareConnection();
  if (!conn || !conn.accessToken) {
    return res.status(200).json({ connected: false });
  }
  res.status(200).json({
    connected: true,
    merchantId: conn.merchantId || null,
    locationId: conn.locationId || null,
    expiresAt: conn.expiresAt === null || conn.expiresAt === undefined
      ? null
      : String(conn.expiresAt)
  });
}, "GET /square/status"));

/**
 * POST /square/connection
 * Upserts the singleton Square connection. Accepts only SquareConnection fields.
 */
app.post("/square/connection", asyncRoute(async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: "Invalid connection data" });
  }
  await db.upsertSquareConnection(data);
  // Echo back the safe status shape, not the stored tokens.
  const conn = await db.getSquareConnection();
  res.status(200).json({
    connected: !!(conn && conn.accessToken),
    merchantId: conn?.merchantId || null,
    locationId: conn?.locationId || null,
    expiresAt: conn?.expiresAt === null || conn?.expiresAt === undefined
      ? null
      : String(conn.expiresAt)
  });
}, "POST /square/connection"));

/**
 * DELETE /square/connection
 * Clears the Square connection (disconnect).
 */
app.delete("/square/connection", asyncRoute(async (req, res) => {
  await db.deleteSquareConnection();
  res.status(200).json({ connected: false });
}, "DELETE /square/connection"));

/**
 * SQUARE OAUTH ENDPOINTS
 */

/**
 * GET /square/callback
 * Handles Square OAuth redirect callback
 * Square redirects here with authorization code after user approves
 *
 * Query params: code, state
 * Response: HTML success page that closes the popup window
 */
app.get("/square/callback", asyncRoute(async (req, res) => {
  const { code, state } = req.query;

  log(`[Square OAuth] Callback received (state: ${state})`);

  if (!code) {
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Square Auth Failed</title></head>
      <body>
        <h1>Authorization Failed</h1>
        <p>No authorization code received from Square.</p>
        <button onclick="window.close()">Close Window</button>
      </body>
      </html>
    `;
    return res.status(400).send(errorHtml);
  }

  // Get Square config
  if (!config.square || !config.square.appId || !config.square.appSecret) {
    log("ERROR: Square configuration missing in server_config.json");
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Square Auth Failed</title></head>
      <body>
        <h1>Configuration Error</h1>
        <p>Square is not configured on the server.</p>
        <button onclick="window.close()">Close Window</button>
      </body>
      </html>
    `;
    return res.status(500).send(errorHtml);
  }

  const { url: squareUrl, appId, appSecret } = config.square;

  try {
    // Exchange code for tokens
    log(`[Square OAuth] Exchanging code for tokens`);

    const tokenUrl = `${squareUrl}/oauth2/token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Square-Version': '2024-12-18'
      },
      body: JSON.stringify({
        client_id: appId,
        client_secret: appSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: `http://localhost:${config.port}/square/callback`
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      log(`ERROR: Token exchange failed: ${JSON.stringify(errorData)}`);
      throw new Error(errorData.message || 'Token exchange failed');
    }

    const tokenData = await tokenResponse.json();

    // Calculate expiration timestamp
    const expiresAt = Date.now() + (tokenData.expires_in * 1000);

    // Fetch location ID
    let locationId = null;
    try {
      const locationsUrl = `${squareUrl}/v2/locations/main`;
      const locationsResponse = await fetch(locationsUrl, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Square-Version': '2024-12-18'
        }
      });

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        locationId = locationsData.location?.id || null;
        log(`[Square OAuth] Location ID retrieved: ${locationId}`);
      }
    } catch (locationError) {
      log(`WARNING: Failed to retrieve location ID: ${locationError.message}`);
    }

    // Save tokens to the SquareConnection singleton (KTD8 fix: the old code
    // called db.getConfig()/db.updateConfig(configData) — methods that never
    // existed on the DB class, so persistence was silently broken).
    await db.upsertSquareConnection({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: BigInt(expiresAt),
      merchantId: tokenData.merchant_id,
      locationId: locationId,
      // Echo the OAuth state value Square returned. TODO(KTD15): validate this
      // against a server-issued random nonce for CSRF protection — that requires
      // the client to request a nonce when building the authorize URL (a
      // client-side change outside this unit). Until then we record, not verify.
      state: state || null
    });
    log(`[Square OAuth] Tokens saved to SquareConnection for merchant: ${tokenData.merchant_id}`);

    // Return success HTML that closes the window
    const successHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Square Authorization Successful</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #28a745; }
        </style>
      </head>
      <body>
        <h1>✓ Authorization Successful!</h1>
        <p>You can now close this window and return to the extension.</p>
        <script>
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `;

    res.status(200).send(successHtml);

  } catch (error) {
    log(`ERROR: Square OAuth callback failed: ${error.message}`);
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Square Auth Failed</title></head>
      <body>
        <h1>Authorization Failed</h1>
        <p>${error.message}</p>
        <button onclick="window.close()">Close Window</button>
      </body>
      </html>
    `;
    res.status(500).send(errorHtml);
  }
}, "GET /square/callback"));

/**
 * POST /api/square/token-exchange
 * Exchanges Square authorization code for access tokens
 *
 * Request body: { code: string, state: string }
 * Response 200: { access_token, refresh_token, expires_at, merchant_id, location_id }
 * Response 400: { error: string }
 */
app.post("/api/square/token-exchange", asyncRoute(async (req, res) => {
  const { code, state } = req.body;

  // Validate input
  if (!code || !state) {
    return res.status(400).json({ error: "Missing code or state" });
  }

  // Get Square config from server_config.json
  if (!config.square || !config.square.appId || !config.square.appSecret) {
    log("ERROR: Square configuration missing in server_config.json");
    return res.status(400).json({ error: "Square not configured on server" });
  }

  const { url: squareUrl, appId, appSecret } = config.square;

  try {
    log(`[Square OAuth] Exchanging code for tokens (state: ${state})`);

    // Build request to Square OAuth token endpoint
    const tokenUrl = `${squareUrl}/oauth2/token`;
    const requestBody = {
      client_id: appId,
      client_secret: appSecret,
      code: code,
      grant_type: 'authorization_code'
    };

    // Exchange code for tokens with Square
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Square-Version': '2024-12-18'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      log(`ERROR: Square token exchange failed: ${JSON.stringify(errorData)}`);
      return res.status(400).json({
        error: errorData.message || 'Square token exchange failed'
      });
    }

    const tokenData = await response.json();

    // Calculate expiration timestamp (Square returns expires_at as ISO string)
    const expiresAt = tokenData.expires_at
      ? new Date(tokenData.expires_at).getTime()
      : Date.now() + (30 * 24 * 60 * 60 * 1000); // Default 30 days

    // Get location ID using the access token
    // This requires a separate API call to Square Locations API
    let locationId = null;
    try {
      const locationsUrl = `${squareUrl}/v2/locations/main`;
      const locationsResponse = await fetch(locationsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Square-Version': '2024-12-18',
          'Content-Type': 'application/json'
        }
      });

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        if (locationsData.location && locationsData.location.id) {
          locationId = locationsData.location.id;
          log(`[Square OAuth] Location ID retrieved: ${locationId}`);
        }
      } else {
        // Non-fatal error - continue without location ID
        log(`WARNING: Failed to retrieve location ID: ${locationsResponse.statusText}`);
      }
    } catch (locationError) {
      // Non-fatal error - continue without location ID
      log(`WARNING: Failed to retrieve location ID: ${locationError.message}`);
    }

    // Persist to the SquareConnection singleton. The client used to round-trip
    // these through POST /config; that path is gone (U4/U5), so the server is
    // now the system of record for Square OAuth state.
    await db.upsertSquareConnection({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: BigInt(expiresAt),
      merchantId: tokenData.merchant_id,
      locationId: locationId,
      state: state || null
    });

    // Return tokens to client
    const result = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      merchant_id: tokenData.merchant_id,
      location_id: locationId,
      token_type: tokenData.token_type
    };

    log(`[Square OAuth] Token exchange successful for merchant: ${result.merchant_id}`);
    res.status(200).json(result);

  } catch (error) {
    log(`ERROR: Square token exchange failed: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}, "POST /api/square/token-exchange"));

/**
 * POST /api/square/revoke
 * Revokes Square OAuth tokens for a merchant
 *
 * Request body: { merchant_id: string }
 * Response 200: { success: true }
 * Response 400: { error: string }
 */
app.post("/api/square/revoke", asyncRoute(async (req, res) => {
  const { merchant_id } = req.body;

  // Validate input
  if (!merchant_id) {
    return res.status(400).json({ error: "Missing merchant_id" });
  }

  // Get Square config from server_config.json
  if (!config.square || !config.square.appId || !config.square.appSecret) {
    log("ERROR: Square configuration missing in server_config.json");
    return res.status(400).json({ error: "Square not configured on server" });
  }

  const { url: squareUrl, appId, appSecret } = config.square;

  try {
    log(`[Square OAuth] Revoking tokens for merchant: ${merchant_id}`);

    // Build request to Square OAuth revoke endpoint
    const revokeUrl = `${squareUrl}/oauth2/revoke`;
    const requestBody = {
      client_id: appId,
      merchant_id: merchant_id
    };

    // Revoke tokens with Square
    // Square requires "Client <secret>" format for authorization header
    const response = await fetch(revokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Square-Version': '2024-12-18',
        'Authorization': `Client ${appSecret}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      log(`ERROR: Square token revocation failed: ${JSON.stringify(errorData)}`);
      return res.status(400).json({
        error: errorData.message || 'Square token revocation failed'
      });
    }

    // Clear the locally stored connection now that Square has revoked it.
    await db.deleteSquareConnection();

    log(`[Square OAuth] Tokens revoked successfully for merchant: ${merchant_id}`);
    res.status(200).json({ success: true });

  } catch (error) {
    log(`ERROR: Square token revocation failed: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}, "POST /api/square/revoke"));

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

// NOTE: GET /api/dump/config removed — the Config table no longer exists (U4).
// Square OAuth state is durable in SquareConnection; it is intentionally not
// exposed via a token-dumping endpoint (KTD15).

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
 * POST /api/export/csv
 * Exports all database contents to a CSV file
 * Request body: { exportPath: string } - full path to output CSV file
 */
app.post("/api/export/csv", asyncRoute(async (req, res) => {
  const { exportPath } = req.body;

  if (!exportPath) {
    return res.status(400).json({ error: "exportPath is required" });
  }

  // Validate path ends with .csv
  if (!exportPath.toLowerCase().endsWith('.csv')) {
    return res.status(400).json({ error: "Export path must end with .csv" });
  }

  // Export using Prisma client from db instance
  const result = await exportAllDataToCSV(db.prisma, exportPath);

  if (result.success) {
    log(`CSV export successful: ${result.message}`);
    res.status(200).json(result);
  } else {
    log(`CSV export failed: ${result.message}`);
    res.status(500).json(result);
  }
}, "POST /api/export/csv"));

/**
 * POST /api/shutdown
 * Gracefully shuts down the server
 * Closes database connections, stops HTTP server, and exits process
 */
app.post("/api/shutdown", asyncRoute(async (req, res) => {
  log('[SHUTDOWN] Graceful shutdown requested via API');

  // Send response before shutting down
  res.status(200).json({
    success: true,
    message: "Server shutting down gracefully"
  });

  // Give response time to send, then shutdown
  setTimeout(async () => {
    try {
      log('[SHUTDOWN] Disconnecting database...');
      await db.disconnect();
      log('[SHUTDOWN] Database disconnected');

      log('[SHUTDOWN] Exiting process...');
      process.exit(0);
    } catch (err) {
      log(`[SHUTDOWN] Error during shutdown: ${err.message}`);
      process.exit(1);
    }
  }, 500);
}, "POST /api/shutdown"));

// Export dump functions for MCP server
module.exports.dumpClients = dumpClients;
module.exports.dumpBookings = dumpBookings;
// dumpConfig removed with the Config table (KTD refactor) but this export line
// was left behind, crashing the server at require time (ReferenceError).
// Commented out 2026-07-20 during SCHEMA unification. Config is gone by design.
// module.exports.dumpConfig = dumpConfig;

/**
 * Server initialization and startup
 * Establishes database connection, starts HTTP server, and sets up graceful shutdown
 */
(async () => {
  try {
    // Ensure data directory exists
    const fs = require('fs');
    const dataDir = path.resolve(baseDir, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      log(`Created data directory: ${dataDir}`);
    }

    // Copy canonical database on first run
    const dbPath = path.resolve(baseDir, 'data', 'leedz.sqlite');
    const canonicalDbPath = path.resolve(baseDir, 'prisma', 'leedz.sqlite');
    if (!fs.existsSync(dbPath) && fs.existsSync(canonicalDbPath)) {
      fs.copyFileSync(canonicalDbPath, dbPath);
      log(`Initialized database from canonical template: ${dbPath}`);
    }

    // Test database connection with timeout
    log('[STARTUP] Attempting database connection...');
    await Promise.race([
      db.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database connection timed out after 10000ms')), 10000)
      )
    ]);
    log(`[STARTUP] Database connected successfully to: ${config.database.url}`);

    const server = app.listen(port, '127.0.0.1', () => {
      log(`! Local API running on http://127.0.0.1:${port}`);
    });

    server.on("error", (err) => {
      log("* xServer listen failed: " + err.stack);
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
