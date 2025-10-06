// Abstract database interface for Leedz invoicing system
// This file contains interface definitions and type definitions for the database layer

// Data interfaces (converted to documentation since JS doesn't have interfaces)
class CreateClientData {
  constructor(name, email, phone, company, notes) {
    this.name = name;
    this.email = email;
    this.phone = phone;
    this.company = company;
    this.notes = notes;
  }
}

class CreateBookingData {
  constructor(clientId, title, description, location, startDate, endDate, startTime, endTime, duration, hourlyRate, flatRate, totalAmount, status, sourceEmail, extractedData, notes) {
    this.clientId = clientId;
    this.title = title;
    this.description = description;
    this.location = location;
    this.startDate = startDate;
    this.endDate = endDate;
    this.startTime = startTime;
    this.endTime = endTime;
    this.duration = duration;
    this.hourlyRate = hourlyRate;
    this.flatRate = flatRate;
    this.totalAmount = totalAmount;
    this.status = status;
    this.sourceEmail = sourceEmail;
    this.extractedData = extractedData;
    this.notes = notes;
  }
}

// Filter interfaces (converted to documentation)
class ClientFilters {
  constructor(email, name) {
    this.email = email;
    this.name = name;
  }
}

// 9/30/2025: Added startDateFrom and startDateTo parameters to support date range filtering
// This improves MCP server performance by reducing the amount of data transferred
class BookingFilters {
  constructor(clientId, status, startDateFrom, startDateTo) {
    this.clientId = clientId;
    this.status = status;
    this.startDateFrom = startDateFrom; // Optional: Filter bookings with startDate >= this date
    this.startDateTo = startDateTo;     // Optional: Filter bookings with startDate <= this date
  }
}

// Stats interfaces (converted to documentation)
class ClientStats {
  constructor(totalClients, totalBookings, averageDuration, averageHourlyRate, averageFlatRate, repeatClients, totalAmountInvoiced, totalHoursInvoiced) {
    this.totalClients = totalClients;
    this.totalBookings = totalBookings;
    this.averageDuration = averageDuration;
    this.averageHourlyRate = averageHourlyRate;
    this.averageFlatRate = averageFlatRate;
    this.repeatClients = repeatClients;
    this.totalAmountInvoiced = totalAmountInvoiced;
    this.totalHoursInvoiced = totalHoursInvoiced;
  }
}

class SystemStats {
  constructor(clients, bookings) {
    this.clients = clients;
    this.bookings = bookings;
  }
}

// Entity interfaces (converted to documentation)
class ClientEntity {
  constructor(id, name, email, phone, company, notes, createdAt, updatedAt, bookings) {
    this.id = id;
    this.name = name;
    this.email = email;
    this.phone = phone;
    this.company = company;
    this.notes = notes;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.bookings = bookings;
  }
}

class BookingEntity {
  constructor(id, clientId, client, title, description, location, startDate, endDate, startTime, endTime, duration, hourlyRate, flatRate, totalAmount, status, sourceEmail, extractedData, notes, createdAt, updatedAt) {
    this.id = id;
    this.clientId = clientId;
    this.client = client;
    this.title = title;
    this.description = description;
    this.location = location;
    this.startDate = startDate;
    this.endDate = endDate;
    this.startTime = startTime;
    this.endTime = endTime;
    this.duration = duration;
    this.hourlyRate = hourlyRate;
    this.flatRate = flatRate;
    this.totalAmount = totalAmount;
    this.status = status;
    this.sourceEmail = sourceEmail;
    this.extractedData = extractedData;
    this.notes = notes;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

// Abstract database interface (converted to documentation and base class)
class Leedz_DB {
  // Client operations
  async createClient(data) { throw new Error('Method not implemented'); }
  async getClient(id) { throw new Error('Method not implemented'); }
  async getClients(filters) { throw new Error('Method not implemented'); }
  async updateClient(id, data) { throw new Error('Method not implemented'); }
  async deleteClient(id) { throw new Error('Method not implemented'); }
  async getClientStats(id) { throw new Error('Method not implemented'); }

  // Booking operations
  async createBooking(data) { throw new Error('Method not implemented'); }
  async getBooking(id) { throw new Error('Method not implemented'); }

  /**
   * Get bookings with optional filtering
   * 9/30/2025: Added date range filtering support to improve query performance
   * @param {Object} filters - Filter criteria
   * @param {string} [filters.clientId] - Filter by client ID
   * @param {string} [filters.status] - Filter by booking status
   * @param {Date|string} [filters.startDateFrom] - Filter bookings with startDate >= this date (inclusive)
   * @param {Date|string} [filters.startDateTo] - Filter bookings with startDate <= this date (inclusive)
   * @returns {Promise<Array>} Array of booking objects matching the filters
   */
  async getBookings(filters) { throw new Error('Method not implemented'); }
  async updateBooking(id, data) { throw new Error('Method not implemented'); }
  async deleteBooking(id) { throw new Error('Method not implemented'); }

  // Config operations
  async createConfig(data) { throw new Error('Method not implemented'); }
  async getLatestConfig() { throw new Error('Method not implemented'); }
  async updateConfig(id, data) { throw new Error('Method not implemented'); }
  async upsertConfig(data) { throw new Error('Method not implemented'); }

  // System operations
  async connect() { throw new Error('Method not implemented'); }
  async disconnect() { throw new Error('Method not implemented'); }
  async getSystemStats() { throw new Error('Method not implemented'); }
}

module.exports = {
  Leedz_DB,
  CreateClientData,
  CreateBookingData,
  ClientFilters,
  BookingFilters,
  ClientStats,
  SystemStats,
  ClientEntity,
  BookingEntity
};
