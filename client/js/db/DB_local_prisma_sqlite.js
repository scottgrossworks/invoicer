// DB_local_prisma_sqlite.js — local HTTP bridge to server endpoints
import { DB_Layer } from './DB_layer.js';

export class DB_Local_PragmaSqlite extends DB_Layer {
  constructor(baseUrl = 'http://localhost:3000') {
    super();
    this.baseUrl = baseUrl;
  }

  async save(state) {
    const data = state.toObject ? state.toObject() : {};

    // Create Client payload
    const clientPayload = {
      name: data.name || data.clientName || '',
      email: data.email || data.clientEmail || null,
      phone: data.phone || null,
      company: data.company || data.org || null,
      notes: data.notes || null
    };

    // Save/Upsert Client
    const clientRes = await fetch(`${this.baseUrl}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientPayload)
    });
    if (!clientRes.ok) throw new Error('Client save failed');
    const client = await clientRes.json();

    // Create Booking payload
    const bookingPayload = {
      clientId: data.clientId || client.id,
      title: data.title || '',
      description: data.description || null,
      address: data.address || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      duration: data.duration ? Number(data.duration) : null,
      hourlyRate: data.hourlyRate ? Number(data.hourlyRate) : null,
      flatRate: data.flatRate ? Number(data.flatRate) : null,
      totalAmount: data.totalAmount ? Number(data.totalAmount) : null,
      status: data.status || 'pending',
      sourceEmail: data.sourceEmail || null,
      extractedData: data.extractedData || null,
      notes: data.notes || null
    };

    const bookingRes = await fetch(`${this.baseUrl}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingPayload)
    });
    if (!bookingRes.ok) throw new Error('Booking save failed');
    const booking = await bookingRes.json();

    return { client, booking };
  }
}

// Attach a default instance globally if desired
window.DB_LAYER = new DB_Local_PragmaSqlite();


