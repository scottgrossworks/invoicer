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

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import config from '../server_config.json';
import { DatabaseFactory } from './db_factory';
import { Leedz_DB } from './leedz_db';
import { Client } from './Client';
import { Booking } from './Booking';

const app = express();
const db: Leedz_DB = DatabaseFactory.createDatabase(config);

// Request interfaces for API endpoints
interface CreateClientRequest {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}

interface CreateBookingRequest {
  clientId: string;
  title: string;
  description?: string;
  address?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  hourlyRate?: number;
  flatRate?: number;
  totalAmount?: number;
  status?: string;
  sourceEmail?: string;
  extractedData?: string;
  notes?: string;
}

/**
 * Executes async operations with configurable timeout
 * Prevents hanging operations and provides graceful failure
 * 
 * @param operation - Async function to execute
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Promise that resolves with operation result or rejects on timeout
 */
async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number = 10000): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Executes async operations with exponential backoff retry logic
 * Handles transient failures and database connection issues
 * 
 * @param operation - Async function to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param delay - Base delay between retries in milliseconds (default: 1000)
 * @returns Promise that resolves with operation result or rejects after max retries
 */
async function withRetry<T>(operation: () => Promise<T>, maxRetries: number = 3, delay: number = 1000): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      log(`Operation failed (attempt ${attempt}/${maxRetries}): ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  throw new Error('Max retries exceeded');
}

// Get port from config or environment variable
const port = process.env.PORT || config.port || 3000;
const logFile = path.resolve(__dirname, config.logging.file);

/**
 * Centralized logging function
 * Writes to both file and console with ISO timestamp
 * 
 * @param message - Log message to record
 */
function log(message: string): void {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, entry);
  } catch (e) {
    console.error("Failed to write to log:", e instanceof Error ? e.message : 'Unknown error');
  }
  console.log(message);
}

app.use(express.json());
app.use(cors());

/**
 * Request logging middleware
 * Logs all incoming HTTP requests with method and URL
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  log(`${req.method} ${req.url}`);
  next();
});

// CLIENT ENDPOINTS

/**
 * POST /clients
 * Creates a new client in the database
 * Validates client data using Client.validate() before creation
 * Includes retry logic and timeout handling for database operations
 * 
 * @param req.body - CreateClientRequest object with client details
 * @returns 200 with created client object, or 400/500 on error
 */
app.post("/clients", async (req: Request, res: Response) => {
  const data: CreateClientRequest = req.body;
  
  // Validate client data
  const validation = Client.validate(data);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", errors: validation.errors });
  }
  
  try {
    const result = await withRetry(async () => {
      return await withTimeout(async () => {
        return await db.createClient(data);
      }, 15000);
    }, 3);
    
    res.status(200).json(result);
    
  } catch (e) {
    log("POST /clients failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Internal error",
        message: e instanceof Error ? e.message : "Unknown error occurred"
      });
    }
  }
});

/**
 * GET /clients
 * Retrieves clients from database with optional filtering
 * Supports query parameters: email, name
 * 
 * @param req.query.email - Optional email filter
 * @param req.query.name - Optional name filter
 * @returns 200 with array of client objects, or 500 on error
 */
app.get("/clients", async (req: Request, res: Response) => {
  log("GET /clients - start");
  const { email, name } = req.query;
  const filters = {
    email: email as string,
    name: name as string
  };

  try {
    log("GET /clients - calling db.getClients with filters: " + JSON.stringify(filters));
    const results = await withTimeout(() => db.getClients(filters), 10000);
    log("GET /clients - got results: " + results.length + " items");
    res.status(200).json(results);
    log("GET /clients - response sent");
    
  } catch (e) {
    log("GET /clients failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Query failed",
        message: e instanceof Error ? e.message : "Database query error"
      });
    }
  }
});

/**
 * GET /clients/:id
 * Retrieves a specific client by ID
 * 
 * @param req.params.id - Client ID to retrieve
 * @returns 200 with client object, 404 if not found, or 500 on error
 */
app.get("/clients/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const client = await db.getClient(id);
    
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    res.status(200).json(client);
    
  } catch (e) {
    log("GET /clients/:id failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Query failed",
        message: e instanceof Error ? e.message : "Database query error"
      });
    }
  }
});



/**
 * DELETE /clients
 * Deletes a client from the database
 * Accepts either:
 * 1) id in query params (unique identifier)
 * 2) name AND email in query params (unique combination)
 * 
 * @param req.query.id - Client ID to delete (optional)
 * @param req.query.name - Client name (required if no id)
 * @param req.query.email - Client email (required if no id)
 * @returns 200 with success confirmation, 400 for invalid params, 404 if not found, or 500 on error
 */
app.delete("/clients", async (req: Request, res: Response) => {
  const { id, name, email } = req.query;

  try {
    let clientToDelete = null;

    if (id) {
      // Method 1: Delete by ID
      if (typeof id !== 'string') {
        return res.status(400).json({ error: "Invalid id parameter" });
      }
      
      clientToDelete = await db.getClient(id);
      if (!clientToDelete) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const success = await db.deleteClient(id);
      if (success) {
        res.status(200).json({ success: true, message: `Client ${clientToDelete.name} deleted successfully` });
      } else {
        res.status(500).json({ error: "Failed to delete client" });
      }
    } else if (name && email) {
      // Method 2: Delete by name AND email combination
      if (typeof name !== 'string' || typeof email !== 'string') {
        return res.status(400).json({ error: "Invalid name or email parameter" });
      }
      
      // Find client by name and email combination
      const clients = await db.getClients({ name, email });
      
      if (clients.length === 0) {
        return res.status(404).json({ error: "Client not found with the specified name and email" });
      }
      
      if (clients.length > 1) {
        return res.status(400).json({ error: "Multiple clients found with the same name and email combination" });
      }
      
      clientToDelete = clients[0];
      const success = await db.deleteClient(clientToDelete.id);
      
      if (success) {
        res.status(200).json({ success: true, message: `Client ${clientToDelete.name} deleted successfully` });
      } else {
        res.status(500).json({ error: "Failed to delete client" });
      }
    } else {
      // Neither valid combination provided
      return res.status(400).json({ 
        error: "Either 'id' parameter or both 'name' and 'email' parameters are required" 
      });
    }
    
  } catch (e) {
    log("DELETE /clients failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Internal error",
        message: e instanceof Error ? e.message : "Unknown error occurred"
      });
    }
  }
});








// CLIENT STATISTICS ENDPOINTS

/**
 * GET /clients/stats
 * Retrieves aggregate statistics for all clients
 * 
 * @returns 200 with client statistics object, or 500 on error
 */
app.get("/clients/stats", async (req: Request, res: Response) => {
  try {
    const stats = await db.getClientStats();
    res.json(stats);
  } catch (e) {
    log("GET /clients/stats failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    res.status(500).json({ error: "Query failed" });
  }
});

/**
 * GET /clients/:id/stats
 * Retrieves statistics for a specific client
 * 
 * @param req.params.id - Client ID to get statistics for
 * @returns 200 with client-specific statistics object, or 500 on error
 */
app.get("/clients/:id/stats", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const stats = await db.getClientStats(id);
    res.json(stats);
  } catch (e) {
    log("GET /clients/:id/stats failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    res.status(500).json({ error: "Query failed" });
  }
});

// BOOKING ENDPOINTS

/**
 * POST /bookings
 * Creates a new booking in the database
 * Converts string dates to Date objects and validates booking data
 * Includes retry logic and timeout handling for database operations
 * 
 * @param req.body - CreateBookingRequest object with booking details
 * @returns 200 with created booking object, or 400/500 on error
 */
app.post("/bookings", async (req: Request, res: Response) => {
  const data: CreateBookingRequest = req.body;
  
  // Convert string dates to Date objects
  const bookingData = {
    ...data,
    startDate: data.startDate ? new Date(data.startDate) : undefined,
    endDate: data.endDate ? new Date(data.endDate) : undefined,
  };
  
  // Validate booking data
  const validation = Booking.validate(bookingData);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", errors: validation.errors });
  }
  
  try {
    const result = await withRetry(async () => {
      return await withTimeout(async () => {
        return await db.createBooking(bookingData);
      }, 15000);
    }, 3);
    
    res.status(200).json(result);
    
  } catch (e) {
    log("POST /bookings failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Internal error",
        message: e instanceof Error ? e.message : "Unknown error occurred"
      });
    }
  }
});

/**
 * GET /bookings
 * Retrieves bookings from database with optional filtering
 * Supports query parameters: clientId, status
 * 
 * @param req.query.clientId - Optional client ID filter
 * @param req.query.status - Optional status filter
 * @returns 200 with array of booking objects, or 500 on error
 */
app.get("/bookings", async (req: Request, res: Response) => {
  const { clientId, status } = req.query;
  const filters = {
    clientId: clientId as string,
    status: status as string
  };

  try {
    const results = await withTimeout(() => db.getBookings(filters), 10000);
    res.status(200).json(results);
    
  } catch (e) {
    log("GET /bookings failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Query failed",
        message: e instanceof Error ? e.message : "Database query error"
      });
    }
  }
});

/**
 * GET /bookings/:id
 * Retrieves a specific booking by ID
 * 
 * @param req.params.id - Booking ID to retrieve
 * @returns 200 with booking object, 404 if not found, or 500 on error
 */
app.get("/bookings/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const booking = await db.getBooking(id);
    
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    
    res.status(200).json(booking);
    
  } catch (e) {
    log("GET /bookings/:id failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Query failed",
        message: e instanceof Error ? e.message : "Database query error"
      });
    }
  }
});

/**
 * PUT /bookings/:id
 * Updates an existing booking in the database
 * Converts string dates to Date objects before updating
 * Includes retry logic and timeout handling for database operations
 * 
 * @param req.params.id - Booking ID to update
 * @param req.body - CreateBookingRequest object with updated booking details
 * @returns 200 with updated booking object, or 500 on error
 */
app.put("/bookings/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const data: CreateBookingRequest = req.body;
  
  // Convert string dates to Date objects
  const bookingData = {
    ...data,
    startDate: data.startDate ? new Date(data.startDate) : undefined,
    endDate: data.endDate ? new Date(data.endDate) : undefined,
  };
  
  try {
    const result = await withRetry(async () => {
      return await withTimeout(async () => {
        return await db.updateBooking(id, bookingData);
      }, 15000);
    }, 3);
    
    res.status(200).json(result);
    
  } catch (e) {
    log("PUT /bookings/:id failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Internal error",
        message: e instanceof Error ? e.message : "Unknown error occurred"
      });
    }
  }
});

/**
 * DELETE /bookings/:id
 * Deletes a booking from the database
 * Includes retry logic and timeout handling for database operations
 * 
 * @param req.params.id - Booking ID to delete
 * @returns 200 with success confirmation, 404 if not found, or 500 on error
 */
app.delete("/bookings/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const success = await withRetry(async () => {
      return await withTimeout(async () => {
        return await db.deleteBooking(id);
      }, 15000);
    }, 3);
    
    if (success) {
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ error: "Booking not found" });
    }
    
  } catch (e) {
    log("DELETE /bookings/:id failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Internal error",
        message: e instanceof Error ? e.message : "Unknown error occurred"
      });
    }
  }
});

// STATISTICS ENDPOINT

/**
 * GET /stats
 * Retrieves system-wide statistics
 * 
 * @returns 200 with system statistics object, or 500 on error
 */
app.get("/stats", async (req: Request, res: Response) => {
  try {
    const stats = await db.getSystemStats();
    res.json(stats);
  } catch (e) {
    log("GET /stats failed: " + (e instanceof Error ? e.stack : 'Unknown error'));
    res.status(500).json({ error: "Query failed" });
  }
});

/**
 * Server initialization and startup
 * Establishes database connection, starts HTTP server, and sets up graceful shutdown
 * Includes comprehensive error handling for startup failures
 */
(async () => {
  try {
    // Test database connection with timeout
    await withTimeout(() => db.connect(), 10000);
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

process.on("uncaughtException", (err) => {
  log("* Uncaught Exception: " + err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log("* Unhandled Rejection: " + (reason instanceof Error ? reason.stack : reason));
  process.exit(1);
});
