// DB_local_prisma_sqlite.js — local HTTP bridge to server endpoints
import { DB_Layer } from './DB_layer.js';
import Client from './Client.js';
import Booking from './Booking.js';
import Config from './Config.js';
import { logValidation } from '../logging.js';


const CONFIG_JSON = 'leedz_config.json';
const URL_DEFAULT = 'http://127.0.0.1:3000';


export class DB_Local_PrismaSqlite extends DB_Layer {
  constructor(baseUrl = URL_DEFAULT) {
    super();
    this.baseUrl = baseUrl;
  }

  /**
   * Get Authorization headers with JWT token from Chrome storage
   * @returns {Promise<Object>} Headers object with Authorization if token exists
   */
  async getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };

    try {
      const stored = await chrome.storage.local.get('leedzJWT');
      if (stored.leedzJWT) {
        headers['Authorization'] = `Bearer ${stored.leedzJWT}`;
      }
    } catch (error) {
      console.warn('Failed to get JWT token from storage:', error);
    }

    return headers;
  }




  /**
   * 
   * 
   * 
   */
cleanFloat(value) {

  if (! value || value === "") return 0.0;

  if (typeof value === 'string') {
    value = value.replace('$', '').trim();
  }

  let floatVal = parseFloat(value);

  if (isNaN(floatVal))  return 0.0;

  return floatVal;

}




  /** 
   * Save a state object to the database
   * 
   * @param {*} state 
   */
  async save( state ) {
    try {

      // console.log("SAVING!");
      state.status = 'local';

      // Get clients array
      const clients = state.Clients || [];

      if (clients.length === 0) {
        // console.log('No clients to save');
        return;
      }

      // Loop through all clients
      for (let i = 0; i < clients.length; i++) {
        const clientData = clients[i];

        // Skip empty client objects
        if (!clientData || Object.keys(clientData).length === 0) {
          continue;
        }

        // CLIENT validation
        let check = Client.validate(clientData);
        if (!check.isValid) {
          logValidation(`Client ${i} validation failed:`, check.errors);
          throw new Error(`Client ${i} validation failed: ` + check.errors.join(', '));
        }

        const clientPayload = {
          name: clientData.name || clientData.clientName || '',
          email: clientData.email || clientData.clientEmail || null,
          phone: clientData.phone || null,
          company: clientData.company || clientData.org || null,
          website: clientData.website || null,
          clientNotes: clientData.clientNotes || null
        };

        const clientRes = await fetch(`${this.baseUrl}/clients`, {
          method: 'POST',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(clientPayload)
        });

        if (!clientRes.ok) {
          const errorText = await clientRes.text();
          console.log(`Client ${i} save failed:`, errorText);
          throw new Error(`Client ${i} save failed: ${clientRes.status} ${errorText}`);
        }

        const client = await clientRes.json();

        // Verify client creation and ID
        if (!client || !client.id) {
          console.log(`Client ${i} save failed - no valid client ID returned:`, client);
          throw new Error(`Client ${i} save failed - no valid ID returned`);
        }

        console.log(`Client ${i} saved: ${client.name} (${client.id})`);

        // BOOKING (optional - only save if booking data exists)
        // Only save booking for first client (Booker use case: 1 client = 1 booking)
        if (i === 0 && state.Booking && Object.keys(state.Booking).length > 0) {
          let data = state.Booking;
          data.clientId = client.id;
          check = Booking.validate(data);
          if (!check.isValid) {
            logValidation('Booking data validation failed:', check.errors);
            throw new Error('Booking data validation failed: ' + check.errors.join(', '));
          }

          // create a Booking payload
          const bookingPayload = {
            clientId: client.id,
            title: data.title || null,
            description: data.description || null,
            notes: data.notes || null,
            location: data.location || null,
            startDate: data.startDate || null,
            endDate: data.endDate || null,
            startTime: data.startTime || null,
            endTime: data.endTime || null,
            duration: this.cleanFloat(data.duration),
            hourlyRate: this.cleanFloat(data.hourlyRate),
            flatRate: this.cleanFloat(data.flatRate),
            totalAmount: this.cleanFloat(data.totalAmount),
            status: data.status || null,
            source: data.source || null
          };

          let bookingRes = await fetch(`${this.baseUrl}/bookings`, {
            method: 'POST',
            headers: await this.getAuthHeaders(),
            body: JSON.stringify(bookingPayload)
          });

          if (!bookingRes.ok) {
            const errorText = await bookingRes.text();
            console.log('Booking save failed:', errorText);
            throw new Error(`Booking save failed: ${bookingRes.status} ${errorText}`);
          }

          const booking = await bookingRes.json();

          // Verify booking creation and ID
          if (!booking || !booking.id) {
            console.log('Booking save failed - no valid booking ID returned:', booking);
            throw new Error('Booking save failed - no valid ID returned');
          }

          console.log('Booking saved for client:', client.name, '(', booking.id, ')');

          // UPDATE STATE WITH RETURNED IDs
          state.Client.id = client.id;
          state.Booking.id = booking.id;
          state.Booking.clientId = client.id;
        }  // End if (state.Booking exists)
      }  // End loop through clients


      // CONFIG (optional - only save if config data exists)
      //
      if (state.Config && Object.keys(state.Config).length > 0) {
        const data = state.Config;
        const check = Config.validate(data);
        if (!check.isValid) {
          logValidation('Config data validation failed:', check.errors);
          throw new Error('Config data validation failed: ' + check.errors.join(', '));
        }

        const configPayload = {
          companyName: data.companyName || null,
          companyAddress: data.companyAddress || null,
          companyPhone: data.companyPhone || null,
          companyEmail: data.companyEmail || null,
          logoUrl: data.logoUrl || null,
          bankName: data.bankName || null,
          bankAddress: data.bankAddress || null,
          bankPhone: data.bankPhone || null,
          bankAccount: data.bankAccount || null,
          bankRouting: data.bankRouting || null,
          bankWire: data.bankWire || null,
          servicesPerformed: data.servicesPerformed || null,
          contactHandle: data.contactHandle || null,
          includeTerms: data.includeTerms || null,
          terms: data.terms || null,
          serverUrl: data.serverUrl || null,
          serverPort: data.serverPort || null,
          dbProvider: data.dbProvider || null,
          dbPath: data.dbPath || null,
          mcpHost: data.mcpHost || null,
          mcpPort: data.mcpPort || null,
          llmApiKey: data.llmApiKey || null,
          llmProvider: data.llmProvider || null,
          llmBaseUrl: data.llmBaseUrl || null,
          llmAnthropicVersion: data.llmAnthropicVersion || null,
          llmMaxTokens: data.llmMaxTokens || null
        };

        let configRes = await fetch(`${this.baseUrl}/config`, {
          method: 'POST',
          headers: await this.getAuthHeaders(),
          body: JSON.stringify(configPayload)
        });

        if (!configRes.ok) {
          const errorText = await configRes.text();
          console.log('Config save failed:', errorText);
          throw new Error(`Config save failed: ${configRes.status} ${errorText}`);
        }
        // console.log('Config saved to database');
      }  // End if (state.Config exists)


      // SUCCESS!
      state.status = 'saved';
      // console.log("Save Successful :)");
      
    } catch (error) {

      // Check if it's a network error (server not running)
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        console.log('Database server not running - save operation failed');
        const err = new Error('Database server not running. Please start the server and try again.');
        err.name = 'DatabaseConnectionError';
        throw err;
      } else {
        // Re-throw other errors
        throw error;
      }
    }
  } 


/**
 * Used to load Config from DB
 * Returns null if no config found
 * Priority order for server URL:
 * 1. Chrome storage (leedzStartupConfig) - user-configured via Startup page
 * 2. leedz_config.json - default fallback configuration
 * @returns {Promise<Object|null>} Configuration object or null if not found
 */
async load() {
    try {
      let serverUrl = null;

      // First check Chrome storage for user-configured startup settings
      try {
        const storageResult = await chrome.storage.local.get('leedzStartupConfig');
        if (storageResult.leedzStartupConfig) {
          const startupConfig = storageResult.leedzStartupConfig;

          // Handle both old serverUrl format and new serverHost format
          if (startupConfig.serverHost && startupConfig.serverPort) {
            serverUrl = `http://${startupConfig.serverHost}:${startupConfig.serverPort}`;
            // console.log('Using startup config from Chrome storage for load():', serverUrl);
          } else if (startupConfig.serverUrl && startupConfig.serverPort) {
            serverUrl = `${startupConfig.serverUrl}:${startupConfig.serverPort}`;
            // console.log('Using legacy startup config from Chrome storage for load():', serverUrl);
          }
        }
      } catch (error) {
        console.warn('Failed to load startup config from Chrome storage:', error);
      }

      // Fall back to leedz_config.json if no startup config found
      if (!serverUrl) {
        const configResponse = await fetch(chrome.runtime.getURL(CONFIG_JSON));
        const config = await configResponse.json();

        if (!config.db || !config.db.provider) {
          console.log("No DB configured");
          return null;
        }

        serverUrl = config.db?.baseUrl || URL_DEFAULT;
        console.log('Using default config from leedz_config.json for load():', serverUrl);
      }

      console.log(`Fetching config from: ${serverUrl}/config`);
      const dbResponse = await fetch(`${serverUrl}/config`);
      // console.log('Config fetch response status:', dbResponse.status, dbResponse.statusText);

      if (dbResponse.ok) {
        const dbConfig = await dbResponse.json();
        return dbConfig;

      } else {
        console.warn(`Config fetch failed with status ${dbResponse.status}`);
        console.log("No DB Config found - server returned error");
        return null;
      }

    } catch (error) {
      // Server not running - silent fail (caller will handle)
      if (error.message.includes('Failed to fetch')) {
        return null;
      }
      console.log('DB Config load ERROR:', error.message);
      return null;
    }
  }

  /**
   * Search for existing client by email and/or name
   * @param {string} email - Client email
   * @param {string} name - Client name
   * @returns {Promise<Object|null>} Client object or null if not found
   */
  async searchClient(email, name) {
    try {

      // Build query parameters
      const params = new URLSearchParams();
      if (email) params.append('email', email);
      if (name) params.append('name', name);

      if (!email && !name) {
        // console.log('searchClient: No email or name provided');
        return null;
      }

      const url = `${this.baseUrl}/clients?${params.toString()}`;
      // console.log('Fetching:', url);

      const response = await fetch(url);
      // console.log('Response status:', response.status, response.statusText);

      if (!response.ok) {
        // console.log(`searchClient: Server returned ${response.status}`);
        return null;
      }

      const clients = await response.json();
      /*
      console.log('Clients returned:', {
        count: clients ? clients.length : 0,
        clients: clients
      });
      */

      // Return first matching client or null
      if (clients && clients.length > 0) {
        // console.log('✓ searchClient: Found client:', clients[0]);
        return clients[0];
      }

      //console.log('✗ searchClient: No matching client found');
      return null;

    } catch (error) {
      // Network error (server not running) - throw to let caller handle
      if (error.message.includes('Failed to fetch')) {
        throw new Error('SERVER_NOT_RUNNING');
      }
      console.log('ERROR (server not running):', error.message);
      return null;
    }
  }

}

// Attach a default instance globally if desired
window.DB_LAYER = new DB_Local_PrismaSqlite();


