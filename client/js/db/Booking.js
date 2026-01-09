
class Booking {
  constructor(data) {
    if (data.id) {
      // Existing booking
      this.id = data.id; // IGNORE
      this.clientId = data.clientId; // IGNORE
      this.title = data.title;
      this.description = data.description;
      this.location = data.location;
      this.startDate = data.startDate;
      this.endDate = data.endDate;
      this.startTime = data.startTime;
      this.endTime = data.endTime;
      this.duration = data.duration;
      this.hourlyRate = data.hourlyRate;
      this.flatRate = data.flatRate;
      this.totalAmount = data.totalAmount;
      this.status = data.status; // IGNORE
      this.source = data.source;
      this.notes = data.notes;
      this.shared = data.shared !== undefined ? data.shared : false;
      this.sharedTo = data.sharedTo || null;
      this.sharedAt = data.sharedAt || null;
      this.leedPrice = data.leedPrice || null;
      this.squarePaymentUrl = data.squarePaymentUrl || null;
      this.createdAt = data.createdAt; // IGNORE
      this.updatedAt = data.updatedAt; // IGNORE
    } else {
      // New booking
      this.id = '';
      this.clientId = data.clientId;
      this.title = data.title || null;
      this.description = data.description || null;
      this.location = data.location || null;
      this.startDate = data.startDate || null;
      this.endDate = data.endDate || null;
      this.startTime = data.startTime || null;
      this.endTime = data.endTime || null;
      this.duration = data.duration || null;
      this.hourlyRate = data.hourlyRate || null;
      this.flatRate = data.flatRate || null;
      this.totalAmount = data.totalAmount || null;
      this.status = data.status || 'new';
      this.source = data.source || null;
      this.notes = data.notes || null;
      this.shared = data.shared !== undefined ? data.shared : false;
      this.sharedTo = data.sharedTo || null;
      this.sharedAt = data.sharedAt || null;
      this.leedPrice = data.leedPrice || null;
      this.squarePaymentUrl = data.squarePaymentUrl || null;
      this.createdAt = new Date();
      this.updatedAt = new Date();
    }
  }

  // Validation methods
  static validate(data) {
    const errors = [];

    try {
        if (!data.clientId || data.clientId.trim() === '') {
          errors.push('Client ID is required');
        }

        // Numeric field validations
        if (data.hourlyRate && isNaN(parseFloat(data.hourlyRate))) {
          errors.push('Hourly rate must be a number');
        }
        if (data.hourlyRate && data.hourlyRate < 0) {
          errors.push('Hourly rate cannot be negative');
        } 


        if (data.flatRate && isNaN(parseFloat(data.flatRate))) {
          errors.push('Flat rate must be a number');
        }
        if (data.flatRate && data.flatRate < 0) {
          errors.push('Flat rate cannot be negative');
        }

        if (data.duration && isNaN(parseFloat(data.duration))) {
          errors.push('Duration must be a number');
        }
        if (data.duration && data.duration < 0) {
          errors.push('Duration cannot be negative');
        }

        if (data.startDate && data.endDate && data.startDate > data.endDate) {
          errors.push('Start date cannot be after end date');
        }
      } catch (error) {
        console.error("data fails Booking validator");
        errors.push( error.message );
      }

    return {
      isValid: errors.length === 0,
      errors
    };
  }


  /**
   * Return just the fields which user can modify / share
   * exclude system fields like id, timestamps, status and SQUARE
   * @returns field names[]
   */
  static getFieldNames() {
    const fields = [
      'title',
      'location',
      'description',
      'startDate',
      'startTime',
      'endDate',
      'endTime',
      'duration',
      'hourlyRate',
      'flatRate',
      'totalAmount',
      'notes',
    ];

    return fields;
  }

  /**
   * Extract booking data from state object for rendering
   * @param {Object} state - Application state with Booking property
   * @returns {Object} Booking data object
   */
  static extractBookingData(state) {
    return {
      title: state.Booking.title,
      description: state.Booking.description,
      location: state.Booking.location,
      startDate: state.Booking.startDate,
      endDate: state.Booking.endDate,
      startTime: state.Booking.startTime,
      endTime: state.Booking.endTime,
      duration: state.Booking.duration,
      hourlyRate: state.Booking.hourlyRate,
      flatRate: state.Booking.flatRate,
      totalAmount: state.Booking.totalAmount,
      notes: state.Booking.notes
    };
  }

  // Data transformation
  toCreateData() {
    return {
      clientId: this.clientId,

      description: this.description || undefined,
      location: this.location || undefined,
      startDate: this.startDate || undefined,
      endDate: this.endDate || undefined,
      startTime: this.startTime || undefined,
      endTime: this.endTime || undefined,
      duration: this.duration || undefined,
      hourlyRate: this.hourlyRate || undefined,
      flatRate: this.flatRate || undefined,
      totalAmount: this.totalAmount || undefined,
      status: this.status || undefined,
      source: this.source || undefined,
      notes: this.notes || undefined,
      shared: this.shared !== undefined ? this.shared : false,
      sharedTo: this.sharedTo || undefined,
      sharedAt: this.sharedAt || undefined,
      leedPrice: this.leedPrice || undefined,
      squarePaymentUrl: this.squarePaymentUrl || undefined
    };
  }

  toInterface() {
    return {
      id: this.id,
      clientId: this.clientId,
      title: this.title,
      description: this.description,
      notes: this.notes,

      location: this.location,
      startDate: this.startDate,
      endDate: this.endDate,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      hourlyRate: this.hourlyRate,
      flatRate: this.flatRate,
      totalAmount: this.totalAmount,
      status: this.status,
      source: this.source,
      shared: this.shared,
      sharedTo: this.sharedTo,
      sharedAt: this.sharedAt,
      leedPrice: this.leedPrice,
      squarePaymentUrl: this.squarePaymentUrl,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Update methods
  update(data) {
    if (data.clientId !== undefined) this.clientId = data.clientId;

    if (data.description !== undefined) this.description = data.description;
    if (data.location !== undefined) this.location = data.location;
    if (data.startDate !== undefined) this.startDate = data.startDate;
    if (data.endDate !== undefined) this.endDate = data.endDate;
    if (data.startTime !== undefined) this.startTime = data.startTime;
    if (data.endTime !== undefined) this.endTime = data.endTime;
    if (data.duration !== undefined) this.duration = data.duration;
    if (data.hourlyRate !== undefined) this.hourlyRate = data.hourlyRate;
    if (data.flatRate !== undefined) this.flatRate = data.flatRate;
    if (data.totalAmount !== undefined) this.totalAmount = data.totalAmount;
    if (data.status !== undefined) this.status = data.status;
    if (data.source !== undefined) this.source = data.source;
    if (data.notes !== undefined) this.notes = data.notes;
    if (data.shared !== undefined) this.shared = data.shared;
    if (data.sharedTo !== undefined) this.sharedTo = data.sharedTo;
    if (data.sharedAt !== undefined) this.sharedAt = data.sharedAt;
    if (data.leedPrice !== undefined) this.leedPrice = data.leedPrice;
    if (data.squarePaymentUrl !== undefined) this.squarePaymentUrl = data.squarePaymentUrl;
    this.updatedAt = new Date();
  }
}

// Remove CommonJS export - using ES6 default export only

// Add JSON export for client-side usage
Booking.prototype.toJSON = function() {
  return {
    id: this.id,
    clientId: this.clientId,
    title: this.title,
    description: this.description,
    location: this.location,
    startDate: this.startDate,
    endDate: this.endDate,
    startTime: this.startTime,
    endTime: this.endTime,
    duration: this.duration,
    hourlyRate: this.hourlyRate,
    flatRate: this.flatRate,
    totalAmount: this.totalAmount,
    status: this.status,
    source: this.source,
    notes: this.notes,
    shared: this.shared,
    sharedTo: this.sharedTo,
    sharedAt: this.sharedAt,
    leedPrice: this.leedPrice,
    squarePaymentUrl: this.squarePaymentUrl,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export default Booking;
