/**
 * ClientCapture - Page class for capturing multiple clients
 * Each client gets its own table frame
 */

import { Page } from './Page.js';
import { ValidationUtils } from '../utils/ValidationUtils.js';
import { log, logError, showToast } from '../logging.js';
import Client from '../db/Client.js';

export class ClientCapture extends Page {

  constructor(state) {
    super('clients', state);
    this.clients = []; // Array of client objects (one per table/frame)
  }

  /**
   * Initialize client capture page (called once on app startup)
   */
  async initialize() {
    // Wire up the Plus button in header
    const addBtn = document.getElementById('addClientBtnHeader');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.addClientFrame());
    }
  }

  /**
   * Called when page is hidden - save form data to state
   */
  async onHide() {
    // Sync current form data to state before leaving page
    this.syncFormToState();
  }

  /**
   * Called when client capture page becomes visible
   */
  async onShow() {
    // Check if state already has client data (from previous parse or page switch)
    // Check both Clients array and Client object (singular) for backward compatibility
    const hasClientsArray = this.state.Clients && this.state.Clients.length > 0;
    const hasClientData = this.state.Client && (this.state.Client.name || this.state.Client.email);
    const hasExistingData = hasClientsArray || hasClientData;

    if (hasExistingData) {
      // Load existing client data from state
      if (hasClientsArray) {
        this.clients = this.state.Clients.map(c => ({ ...c })); // Clone clients from state array
      } else if (hasClientData) {
        this.clients = [{ ...this.state.Client }]; // Convert singular Client to array
      }
      this.render();
    } else {
      // No existing data - show blank frame and auto-parse
      if (this.clients.length === 0) {
        this.clients.push(this._createBlankClient());
      }
      this.render();

      // Disable buttons until parser completes
      this.setButtonsEnabled(false);

      // Run parser to extract client data from current page
      await this.reloadParser();

      // Enable buttons after parser completes
      this.setButtonsEnabled(true);
    }
  }

  /**
   * Update UI from state changes
   */
  updateFromState(state) {
    this.state = state;
    // Re-render all frames
    this.render();
  }

  /**
   * Clear/reset to one blank frame
   */
  clear() {
    this.clients = [this._createBlankClient()];
    this.render();
    log('Cleared');
  }

  /**
   * Get action buttons for client capture page
   */
  getActionButtons() {
    return [
      { id: 'clearClientsBtn', label: 'Clear', handler: () => this.clear() },
      { id: 'saveClientsBtn', label: 'Save', handler: () => this.saveAllClients() }
    ];
  }

  /**
   * Create a blank client object
   */
  _createBlankClient() {
    return {
      name: '',
      email: '',
      phone: '',
      company: '',
      clientNotes: ''
    };
  }

  /**
   * Sync form data from this.clients to state.Clients
   */
  syncFormToState() {
    // Copy clients array to state, filtering out any nulls
    this.state.setClients(this.clients.filter(c => c !== null));

    // Also update state.Client (first client) for backward compatibility
    if (this.clients.length > 0 && this.clients[0]) {
      Object.assign(this.state.Client, this.clients[0]);
    }
  }

  /**
   * Render all client tables (frames)
   */
  render() {
    const container = document.getElementById('display_win_clients');
    if (!container) return;

    // Filter out null clients (deleted entries)
    this.clients = this.clients.filter(c => c !== null);

    // Ensure at least one blank frame
    if (this.clients.length === 0) {
      this.clients.push(this._createBlankClient());
    }

    // Clear container (except loading spinner)
    const spinner = container.querySelector('.loading-spinner');
    container.innerHTML = '';

    // Re-add spinner
    if (spinner) container.appendChild(spinner);

    // Render each client as a separate table
    this.clients.forEach((client, index) => {
      const table = this._renderClientTable(client, index);
      container.appendChild(table);
    });
  }

  /**
   * Render a single client table
   */
  _renderClientTable(client, index) {
    // Create container for frame (table + delete button)
    const frameContainer = document.createElement('div');
    frameContainer.className = 'client-frame';
    frameContainer.setAttribute('data-client-index', index);

    const table = document.createElement('table');
    table.className = 'booking-table';
    table.setAttribute('data-client-index', index);

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Field</th>
        <th>Value</th>
      </tr>
    `;
    table.appendChild(thead);

    // Body with all client fields
    const tbody = document.createElement('tbody');
    const clientFields = Client.getFieldNames();

    clientFields.forEach(field => {
      const row = document.createElement('tr');

      // Field name cell
      const nameCell = document.createElement('td');
      nameCell.className = 'field-name';
      nameCell.textContent = field;

      // Field value cell
      const valueCell = document.createElement('td');
      valueCell.className = 'field-value';

      // Use textarea for clientNotes, input for others
      let inputElement;
      if (field === 'clientNotes') {
        inputElement = document.createElement('textarea');
        inputElement.rows = 3;
      } else {
        inputElement = document.createElement('input');
        inputElement.type = 'text';
      }

      inputElement.setAttribute('data-field', field);
      inputElement.setAttribute('data-client-index', index);
      inputElement.value = client[field] || '';

      // Format phone for display
      if (field === 'phone' && client[field]) {
        inputElement.value = ValidationUtils.formatPhoneForDisplay(client[field]);
      }

      // Add input listener to sync to clients array
      inputElement.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.clientIndex);
        const fieldName = e.target.dataset.field;
        let value = e.target.value;

        // Remove phone formatting for storage
        if (fieldName === 'phone') {
          value = value.replace(/[^\d]/g, '');
        }

        this.clients[idx][fieldName] = value;
      });

      // Add blur listener for formatting
      inputElement.addEventListener('blur', (e) => {
        const fieldName = e.target.dataset.field;
        if (fieldName === 'phone' && e.target.value) {
          e.target.value = ValidationUtils.formatPhoneForDisplay(e.target.value);
        }
      });

      valueCell.appendChild(inputElement);
      row.appendChild(nameCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);

    // Add table to frame container
    frameContainer.appendChild(table);

    // Create delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.id = `deleteClientBtn-${index}`;
    deleteBtn.className = 'sidebar-button delete-client-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('data-client-index', index);

    // Wire delete button click handler
    deleteBtn.addEventListener('click', () => this.deleteClient(index));

    // Add delete button to frame container
    frameContainer.appendChild(deleteBtn);

    return frameContainer;
  }

  /**
   * Add a new blank client frame at the top
   */
  addClientFrame() {
    this.clients.unshift(this._createBlankClient());
    this.render();
    log('Added new client frame');
  }

  /**
   * Delete a client frame
   * @param {number} index - Index of client to delete
   */
  deleteClient(index) {
    // Mark client as deleted (null)
    this.clients[index] = null;

    // Re-render (will filter out nulls and ensure at least one frame)
    this.render();

    // Show feedback
    showToast('Client deleted', 'info');
    log(`Client at index ${index} deleted`);
  }

  /**
   * Save all clients to database via state.save()
   * State automatically loops through Clients array
   */
  async saveAllClients() {
    try {
      // Filter out null entries (deleted) and empty clients
      const nonEmptyClients = this.clients.filter(clientData => {
        return clientData !== null &&
               !(ValidationUtils.isEmpty(clientData.name) &&
                 ValidationUtils.isEmpty(clientData.email) &&
                 ValidationUtils.isEmpty(clientData.phone) &&
                 ValidationUtils.isEmpty(clientData.company) &&
                 ValidationUtils.isEmpty(clientData.clientNotes));
      });

      if (nonEmptyClients.length === 0) {
        showToast('No clients to save (all frames empty)', 'warning');
        log('Save skipped - all frames empty');
        return;
      }

      // Set state.Clients array
      this.state.setClients(nonEmptyClients);

      // Clear Booking and Config (not saving those from ClientCapture)
      this.state.Booking = {};
      this.state.Config = {};

      // Save all clients in one call - state.save() loops internally
      await this.state.save();

      // Show success
      const msg = `Successfully saved ${nonEmptyClients.length} client${nonEmptyClients.length > 1 ? 's' : ''}`;
      showToast(msg, 'success');
      log(msg);
      // Do NOT clear form after save - user may want to edit and re-save

    } catch (error) {
      console.error('Error saving clients:', error);
      logError('Save failed:', error);
      showToast(`Save failed: ${error.message}`, 'error');
    }
  }

  /**
   * Enable or disable action buttons
   */
  setButtonsEnabled(enabled) {
    const clearBtn = document.getElementById('clearClientsBtn');
    const saveBtn = document.getElementById('saveClientsBtn');
    const deleteButtons = document.querySelectorAll('.delete-client-btn');

    if (clearBtn) clearBtn.disabled = !enabled;
    if (saveBtn) saveBtn.disabled = !enabled;
    deleteButtons.forEach(btn => btn.disabled = !enabled);
  }

  /**
   * Reload parser to extract clients from current page
   */
  async reloadParser() {
    try {
      this.showLoadingSpinner();
      this.setButtonsEnabled(false);
      log('Running client parser...');

      // Get current tab URL and tabId
      const { url, tabId } = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'leedz_get_tab_url' }, resolve);
      });

      if (!url || !tabId) {
        log('Cannot auto-detect page data');
        log('No page detected');
        return;
      }

      // Send message to content script to run matching parser (extractClientData only)
      await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, {
          type: 'leedz_extract_client',  // New message type for client-only extraction
          state: this.state.toObject()
        }, (response) => {
          if (response?.ok && response?.data) {
            log(`Parser completed successfully`);

            // Extract clients array from response (state.Clients)
            const clientsArray = response.data.Clients;

            if (clientsArray && Array.isArray(clientsArray) && clientsArray.length > 0) {
              // Replace all frames with extracted clients
              this.clients = clientsArray.map(client => ({
                name: client.name || '',
                email: client.email || '',
                phone: client.phone || '',
                company: client.company || '',
                website: client.website || '',
                clientNotes: client.clientNotes || ''
              }));
              this.render();
              showToast(`Extracted ${clientsArray.length} client${clientsArray.length > 1 ? 's' : ''}`, 'success');
            } else {
              log('No client data found on page');
              showToast('No client data found on this page', 'info');
            }

            resolve();
          } else {
            logError(`Parser failed:`, response?.error || 'Unknown error');
            log('Parse failed');
            resolve(); // Still resolve even on failure
          }
        });
      });

    } catch (error) {
      console.error('Parser initialization error:', error);
      log('Parser unavailable');
      showToast('Parser error - see console', 'error');
    } finally {
      this.hideLoadingSpinner();
      this.setButtonsEnabled(true);
    }
  }
}
