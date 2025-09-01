/**
 * state.js - Simple state factory
 * Creates state objects with get/set methods for key-value storage
 *
 * @module state
 */

/**
 * Simple state class using Map for key-value storage
 */
class State {
  constructor() {
    this.data = new Map();
  }

  /**
   * Get a value by key
   * @param {string} key - The key to retrieve
   * @returns {*} The value or null if not found
   */
  get(key) {
    return this.data.get(key) || null;
  }

  /**
   * Set a value by key
   * @param {string} key - The key to set
   * @param {*} value - The value to store
   */
  set(key, value) {
    this.data.set(key, value);
  }

  /**
   * Clear all state data
   */
  clear() {
    this.data.clear();
  }

  /**
   * Get all data as plain object
   * @returns {Object} Plain object representation
   */
  toObject() {
    const obj = {};
    for (const [key, value] of this.data) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * Load data from plain object
   * @param {Object} obj - Object to load from
   */
  fromObject(obj) {
    this.clear();
    Object.entries(obj).forEach(([key, value]) => {
      this.set(key, value);
    });
  }
}

/**
 * State Factory - creates new state instances
 */
export class StateFactory {
  static create() {
    return new State();
  }
}

/**
 * Helper functions for state management
 */

/**
 * Clear state data
 * @param {State} state - State instance to clear
 */
export function clearState(state) {
  state.clear();
}

/**
 * Copy record data into state
 * @param {State} state - State instance to update
 * @param {Object} record - Database record object
 */
export function copyFromRecord(state, record) {
  state.fromObject(record);
}

/**
 * Merge parsed data into state without overwriting existing values
 * @param {State} state - State instance to update
 * @param {Object} parsedData - Data parsed from webpage
 */
export function mergePageData(state, parsedData) {
  Object.entries(parsedData).forEach(([key, value]) => {
    if (!state.get(key) && value !== null && value !== undefined) {
      state.set(key, value);
    }
  });
}