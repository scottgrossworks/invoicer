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
}
