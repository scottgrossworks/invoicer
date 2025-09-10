// DB_local_prisma_sqlite.js — local HTTP bridge to server endpoints
import { DB_Layer } from './DB_layer.js';

export class DB_Local_PragmaSqlite extends DB_Layer {
  constructor(baseUrl = 'http://localhost:3000') {
    super();
    this.baseUrl = baseUrl;
  }

  async save(state) {
    const data = state;

    // Create Client payload
    const clientPayload = {
      name: data.name || data.clientName || '',
      email: data.email || data.clientEmail || '',
      phone: data.phone || '',
      company: data.company || data.org || '',
      notes: data.notes || ''
    };

    // Save/Upsert Client
    // console.log('DEBUG: Client payload being sent:', JSON.stringify(clientPayload, null, 2));
    
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
      console.error('Client creation failed - no valid client ID returned:', client);
      throw new Error('Client creation failed - no valid ID returned');
    }
    
    // console.log('DEBUG: Client creation successful:', client);
    // console.log('DEBUG: Client ID to use for booking:', client.id);

    // Create Booking payload
    const bookingPayload = {
      clientId: data.clientId || client.id,

      description: data.description || null,
      location: data.location || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      duration: data.duration ? Number(data.duration) : null,
      hourlyRate: data.hourlyRate ? Number(data.hourlyRate) : null,
      flatRate: data.flatRate ? Number(data.flatRate) : null,
      totalAmount: data.totalAmount ? Number(data.totalAmount) : null,
      status: data.status || 'pending',
      source: data.source || null,
      notes: data.notes || null
    };

    // console.log('DEBUG: Booking payload being sent:', JSON.stringify(bookingPayload, null, 2));
    // console.log('DEBUG: Final clientId in payload:', bookingPayload.clientId);

    const bookingRes = await fetch(`${this.baseUrl}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingPayload)
    });
    if (!bookingRes.ok) {
      const errorText = await bookingRes.text();
      console.error('Booking save failed:', errorText);
      throw new Error(`Booking save failed: ${bookingRes.status} ${errorText}`);
    }
    const booking = await bookingRes.json();

    return { client, booking };
  }
}

// Attach a default instance globally if desired
window.DB_LAYER = new DB_Local_PragmaSqlite();


