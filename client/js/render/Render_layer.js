// Render_layer.js — interface for pluggable renderers

/**
 * Abstract base class for all rendering providers
 * Defines interface that all render implementations must follow
 * Provides common helper methods for data extraction
 */
export class RenderLayer {
  /**
   * Main render method - MUST be implemented by subclasses
   * @param {Object} state - Application state containing booking/client data
   * @param {Object} settings - Renderer-specific settings
   * @returns {Promise<void>}
   */
  async render(state, settings) {
    throw new Error('render() must be implemented by subclass');
  }
    
  /**
   * Extract booking data from state object
   * @param {Object} state - Application state with get() method
   * @returns {Object} Booking data object
   */
  extractBookingData(state) {
    return {
      description: state.get('description'),
      location: state.get('location'),
      startDate: state.get('startDate'),
      endDate: state.get('endDate'), 
      startTime: state.get('startTime'),
      endTime: state.get('endTime'),
      duration: state.get('duration'),
      hourlyRate: state.get('hourlyRate'),
      flatRate: state.get('flatRate'),
      totalAmount: state.get('totalAmount'),
      notes: state.get('notes')
    };
  }

  /**
   * Extract client data from state object
   * @param {Object} state - Application state with get() method
   * @returns {Object} Client data object
   */
  extractClientData(state) {
    return {
      name: state.get('name'),
      email: state.get('email'),
      phone: state.get('phone'),
      company: state.get('company')
    };
  }
}
