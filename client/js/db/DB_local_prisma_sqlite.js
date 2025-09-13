// DB_local_prisma_sqlite.js — local HTTP bridge to server endpoints
import { DB_Layer } from './DB_layer.js';
import Client from './Client.js';
import Booking from './Booking.js';
import Config from './Config.js';


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
  
  if (! value || value === "") return "0.0";

  if (typeof value === 'string') {
    value = value.replace('$', '').trim();
  }

  let floatVal = parseFloat(value);

  if (isNaN(floatVal))  return "0.0";

  return floatVal.toString();

}




  /** 
   * Save a state object to the database
   * 
   * @param {*} state 
   */
  async save( state ) {
    try {
    
      console.log("SAVING!");

      // CLIENT
      //
      let data = state.Client;
      let check = Client.validate(data);
      if (!check.isValid) {
        console.error('Client data validation failed:', check.errors);
        throw new Error('Client data validation failed: ' + check.errors.join(', '));
      }

      const clientPayload = {
        name: data.name || data.clientName || '',
        email: data.email || data.clientEmail || null,
        phone: data.phone || null,
        company: data.company || data.org || null,
        notes: data.notes || null
      };

      const clientRes = await fetch(`${this.baseUrl}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientPayload)
      });
        
      if (!clientRes.ok) {
        const errorText = await clientRes.text();
        console.error('Client save failed:', errorText);
        throw new Error(`Client save failed: ${clientRes.status} ${errorText}`);
      }
        
      const client = await clientRes.json();
      
      // Verify client creation and ID
      if (!client || !client.id) {
        console.error('Client save failed - no valid client ID returned:', client);
        throw new Error('Client save failed - no valid ID returned');
      }
        

        
      // BOOKING
      //
      data = state.Booking;
      data.clientId = client.id;
      check = Booking.validate(data);
      if (!check.isValid) {
        console.error('Booking data validation failed:', check.errors);
        throw new Error('Booking data validation failed: ' + check.errors.join(', '));
      }

      // create a Booking payload
      const bookingPayload = {
        clientId: client.id,
        title: data.title || "",
        description: data.description || "",
        location: data.location || "",
        startDate: data.startDate || "",
        endDate: data.endDate || "",
        duration: this.cleanFloat(data.duration),
        hourlyRate: this.cleanFloat(data.hourlyRate),
        flatRate: this.cleanFloat(data.flatRate),
        totalAmount: this.cleanFloat(data.totalAmount),
        status: data.status || "",
        source: data.source || "",
        notes: data.notes || ""
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
        

      // CONFIG
      //
      data = state.Config;
      check = Config.validate(data);
      if (!check.isValid) {
        console.error('Config data validation failed:', check.errors);
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

      
    } catch (error) {
      
      // Check if it's a network error (server not running)
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        console.warn('Database server not running - save operation skipped');
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
      const serverUrl = config.db?.baseUrl || URL_DEFAULT;
      
      const dbResponse = await fetch(`${serverUrl}/config`);
      console.log('Database config fetch response status:', dbResponse.status);
      
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
      console.error('Error loading PDF settings: ' + error.message);
      return null;
    }
  }

}

// Attach a default instance globally if desired
window.DB_LAYER = new DB_Local_PrismaSqlite();


