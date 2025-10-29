// DB_local_prisma_sqlite.js — local HTTP bridge to server endpoints
import { DB_Layer } from './DB_layer.js';
import Client from './Client.js';
import Booking from './Booking.js';
import Config from './Config.js';
import { logValidation } from '../logging.js';


const CONFIG_JSON = 'invoicer_config.json';
const URL_DEFAULT = 'http://127.0.0.1:3000';


export class DB_Local_PrismaSqlite extends DB_Layer {
  constructor(baseUrl = URL_DEFAULT) {
    super();
    this.baseUrl = baseUrl;
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

      console.log("SAVING!");
      state.status = 'local';

      // Get clients array
      const clients = state.Clients || [];

      if (clients.length === 0) {
        console.log('No clients to save');
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
          clientNotes: clientData.clientNotes || null
        };

        const clientRes = await fetch(`${this.baseUrl}/clients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clientPayload)
        });

        if (!clientRes.ok) {
          const errorText = await clientRes.text();
          console.error(`Client ${i} save failed:`, errorText);
          throw new Error(`Client ${i} save failed: ${clientRes.status} ${errorText}`);
        }

        const client = await clientRes.json();

        // Verify client creation and ID
        if (!client || !client.id) {
          console.error(`Client ${i} save failed - no valid client ID returned:`, client);
          throw new Error(`Client ${i} save failed - no valid ID returned`);
        }

        console.log(`Client ${i} saved: ${client.name} (${client.id})`);

        // BOOKING (optional - only save if booking data exists)
        // Only save booking for first client (Invoicer use case: 1 client = 1 booking)
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingPayload)
          });

          if (!bookingRes.ok) {
            const errorText = await bookingRes.text();
            console.error('Booking save failed:', errorText);
            throw new Error(`Booking save failed: ${bookingRes.status} ${errorText}`);
          }

          console.log('Booking saved for client:', client.name);
        }  // End if (state.Booking exists)
      }  // End loop through clients


      // CONFIG (optional - only save if config data exists)
      //
      if (state.Config && Object.keys(state.Config).length > 0 && state.Config.companyName) {
        data = state.Config;
        check = Config.validate(data);
        if (!check.isValid) {
          logValidation('Config data validation failed:', check.errors);
          throw new Error('Config data validation failed: ' + check.errors.join(', '));
        }

        const configPayload = {
          companyName: data.companyName || '',
          companyAddress: data.companyAddress || '',
          companyPhone: data.companyPhone || '',
          companyEmail: data.companyEmail || '',
          logoUrl: data.logoUrl || '',
          bankName: data.bankName || '',
          bankAddress: data.bankAddress || '',
          bankPhone: data.bankPhone || '',
          bankAccount: data.bankAccount || '',
          bankRouting: data.bankRouting || '',
          bankWire: data.bankWire || '',
        };

        let configRes = await fetch(`${this.baseUrl}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configPayload)
        });

        if (!configRes.ok) {
          const errorText = await configRes.text();
          console.error('Config save failed:', errorText);
          throw new Error(`Config save failed: ${configRes.status} ${errorText}`);
        }
      }  // End if (state.Config exists)


      // SUCCESS!
      state.status = 'saved';
      console.log("Save Successful :)");
      
    } catch (error) {

      // Check if it's a network error (server not running)
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        console.log('Database server not running - save operation skipped');
      } else {
        // Re-throw other errors
        throw error;
      }
    }
  } 


/**
 * Used to load Config from DB
 * Returns null if no config found
 * @returns {Promise<Object|null>} Configuration object or null if not found

 * 
 */
async load() {
    try {
      // Get server baseUrl from config
      const configResponse = await fetch(chrome.runtime.getURL(CONFIG_JSON));
      const config = await configResponse.json();

      if (! config.db || ! config.db.provider) {
        console.log("No DB configured");
        return null;
      }

      const serverUrl = config.db?.baseUrl || URL_DEFAULT;
      const dbResponse = await fetch(`${serverUrl}/config`);

      if (dbResponse.ok) {
        const dbConfig = await dbResponse.json();
        console.log("PDF settings loaded from database");
        console.log(dbConfig);

        return dbConfig;

      } else {
        console.log("No DB Config found");
        return null;
      }

    } catch (error) {
      console.log('DB Config not loaded: ' + error.message);
      console.log('Database server may not be running - this is normal if server is not configured');
      return null;
    }
  }

}

// Attach a default instance globally if desired
window.DB_LAYER = new DB_Local_PrismaSqlite();


