// Render_layer.js — interface for pluggable renderers

/**
 * Abstract base class for all rendering providers
 * Defines interface that all render implementations must follow
 * Provides common helper methods for data extraction
 */
export class RenderLayer {
  /**
   * Main render method - MUST be implemented by subclasses
   * @param {Object} state - Application state containing booking/client/config data
   * @returns {Promise<void>}
   */
  async render(state) {
    throw new Error('render() must be implemented by subclass');
  }
    
  /**
   * Extract booking data from state object
   * @param {Object} state - Application state with get() method
   * @returns {Object} Booking data object
   */

  extractBookingData(state) {
    return {
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

  /**
   * Extract client data from state object
   * @param {Object} state - Application state with get() method
   * @returns {Object} Client data object
   */
  extractClientData(state) {
    return {
      name: state.Client.name,
      email: state.Client.email,
      phone: state.Client.phone,
      company: state.Client.company
    };
  }

  /**
   * Extract Config data from state object (company info, PDF settings, etc.)
   * @param {Object} state - Application state with get() method
   * @returns {Object} Config data object
   */
  extractConfigData(state) {
    return {
      // Company info
      companyName: state.Config.companyName,
      companyAddress: state.Config.companyAddress,
      companyPhone: state.Config.companyPhone,
      companyEmail: state.Config.companyEmail,
      logoUrl: state.Config.logoUrl,
      
      // Bank info
      bankName: state.Config.bankName,
      bankAddress: state.Config.bankAddress,
      bankPhone: state.Config.bankPhone,
      bankAccount: state.Config.bankAccount,
      bankRouting: state.Config.bankRouting,
      bankWire: state.Config.bankWire,
      
      // Invoice content
      servicesPerformed: state.Config.servicesPerformed,
      contactHandle: state.Config.contactHandle,
      
      // Terms and conditions
      includeTerms: state.Config.includeTerms,
      terms: state.Config.terms
    };
  }
}
