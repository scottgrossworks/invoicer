/**
 * Startup - Configuration page for server/database connection settings
 */

import { Page } from './Page.js';
import { log, logError, showToast } from '../logging.js';

export class Startup extends Page {

  constructor(state) {
    super('startup', state);
  }

  /**
   * Initialize startup page (called once on app startup)
   */
  async initialize() {
    this.setupButtons();
  }

  /**
   * Startup page never auto-parses
   */
  isStartupPage() {
    return true;
  }

  /**
   * Called when startup page becomes visible
   */
  async onShowImpl() {
    // Load config from database and populate form
    await this.loadConfigFromState();
  }

  /**
   * Update UI from state changes
   */
  updateFromState(state) {
    this.state = state;
    this.loadConfigFromState();
  }

  /**
   * Clear/reset startup config to defaults
   */
  clear() {
    // Reset to default values
    document.getElementById('startup-serverHost').value = '127.0.0.1';
    document.getElementById('startup-serverPort').value = '3000';
    document.getElementById('startup-mcpHost').value = '127.0.0.1';
    document.getElementById('startup-mcpPort').value = '3001';
    document.getElementById('startup-llmApiKey').value = '';
    document.getElementById('startup-llmProvider').value = 'claude-opus-4-1-20250805';
    document.getElementById('startup-llmBaseUrl').value = 'https://api.anthropic.com';
    document.getElementById('startup-llmAnthropicVersion').value = '2023-06-01';
    document.getElementById('startup-llmMaxTokens').value = '1024';
    document.getElementById('startup-dbName').textContent = 'Not connected';
    document.getElementById('startup-dbName').style.color = '#666';
  }

  /**
   * No action buttons for startup (uses custom buttons in button-wrapper)
   */
  getActionButtons() {
    return null;
  }

  /**
   * Wire up startup page button event handlers
   */
  setupButtons() {
    const clearBtn = document.getElementById('startupClearBtn');
    const saveBtn = document.getElementById('startupSaveBtn');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveConfig());
    }
  }

  /**
   * Load config from state and populate form fields
   */
  async loadConfigFromState() {
    try {
      // Load state from database
      await this.state.load();

      // Get config values from state (with defaults)
      const config = this.state.Config || {};

      // Migrate old serverUrl format to serverHost (strip http:// or https://)
      let serverHost = config.serverHost;
      if (!serverHost && config.serverUrl) {
        serverHost = config.serverUrl.replace(/^https?:\/\//, '');
      }
      serverHost = serverHost || '127.0.0.1';

      const serverPort = config.serverPort || '3000';
      const mcpHost = config.mcpHost || '127.0.0.1';
      const mcpPort = config.mcpPort || '3001';
      const llmApiKey = config.llmApiKey || '';
      const llmProvider = config.llmProvider || 'claude-opus-4-1-20250805';
      const llmBaseUrl = config.llmBaseUrl || 'https://api.anthropic.com';
      const llmAnthropicVersion = config.llmAnthropicVersion || '2023-06-01';
      const llmMaxTokens = config.llmMaxTokens || 1024;

      // Populate form fields
      document.getElementById('startup-serverHost').value = serverHost;
      document.getElementById('startup-serverPort').value = serverPort;
      document.getElementById('startup-mcpHost').value = mcpHost;
      document.getElementById('startup-mcpPort').value = mcpPort;
      document.getElementById('startup-llmApiKey').value = llmApiKey;
      document.getElementById('startup-llmProvider').value = llmProvider;
      document.getElementById('startup-llmBaseUrl').value = llmBaseUrl;
      document.getElementById('startup-llmAnthropicVersion').value = llmAnthropicVersion;
      document.getElementById('startup-llmMaxTokens').value = llmMaxTokens;

      console.log('Loaded startup config from database');

      // Fetch database name from server
      await this.fetchDatabaseName(serverHost, serverPort);

    } catch (error) {
      console.warn('Could not load config from database, using defaults:', error);
      this.clear(); // Use defaults
    }
  }

  /**
   * Fetch database name from server
   */
  async fetchDatabaseName(serverHost, serverPort) {
    const dbNameElement = document.getElementById('startup-dbName');

    try {
      const serverUrl = `http://${serverHost}:${serverPort}`;
      const response = await fetch(`${serverUrl}/config`);

      if (!response.ok) {
        dbNameElement.textContent = 'No database configured';
        dbNameElement.style.color = 'red';
        return;
      }

      const config = await response.json();

      if (config && config.databaseName) {
        dbNameElement.textContent = config.databaseName;
        dbNameElement.style.color = 'green';
      } else {
        dbNameElement.textContent = 'Unknown';
        dbNameElement.style.color = 'orange';
      }

    } catch (error) {
      dbNameElement.textContent = 'Server not found';
      dbNameElement.style.color = 'red';
      console.log('ERROR: could not find DB');
    }
  }

  /**
   * Save config to state, Chrome storage, and database
   */
  async saveConfig() {
    try {
      // Get values from form
      const serverHost = document.getElementById('startup-serverHost').value.trim();
      const serverPort = document.getElementById('startup-serverPort').value.trim();
      const mcpHost = document.getElementById('startup-mcpHost').value.trim();
      const mcpPort = document.getElementById('startup-mcpPort').value.trim();
      const llmApiKey = document.getElementById('startup-llmApiKey').value.trim();
      const llmProvider = document.getElementById('startup-llmProvider').value.trim();
      const llmBaseUrl = document.getElementById('startup-llmBaseUrl').value.trim();
      const llmAnthropicVersion = document.getElementById('startup-llmAnthropicVersion').value.trim();
      const llmMaxTokens = parseInt(document.getElementById('startup-llmMaxTokens').value.trim()) || 1024;

      // Validate required fields
      if (!serverHost || !serverPort) {
        showToast('Server Host and Port are required', 'error');
        return;
      }

      // CRITICAL: Load existing Config from database first to avoid overwriting PDF settings
      await this.state.loadConfigFromDB();

      // Update ONLY the Startup-related fields (preserve existing PDF settings)
      if (!this.state.Config) {
        this.state.Config = {};
      }

      this.state.Config.serverHost = serverHost;
      this.state.Config.serverPort = serverPort;
      this.state.Config.dbProvider = 'local_prisma_sqlite';
      this.state.Config.mcpHost = mcpHost || '127.0.0.1';
      this.state.Config.mcpPort = mcpPort || '3001';
      this.state.Config.llmApiKey = llmApiKey || null;
      this.state.Config.llmProvider = llmProvider || 'claude-opus-4-1-20250805';
      this.state.Config.llmBaseUrl = llmBaseUrl || 'https://api.anthropic.com';
      this.state.Config.llmAnthropicVersion = llmAnthropicVersion || '2023-06-01';
      this.state.Config.llmMaxTokens = llmMaxTokens;

      // Save to Chrome storage (only startup settings)
      await chrome.storage.local.set({
        leedzStartupConfig: {
          serverHost, serverPort, dbProvider: 'local_prisma_sqlite', mcpHost, mcpPort,
          llmApiKey, llmProvider, llmBaseUrl, llmAnthropicVersion, llmMaxTokens
        }
      });

      // Save to database (merged Config with both Startup + PDF settings)
      await this.state.save();

      // CRITICAL: Reinitialize DB_LAYER to point to new database
      const { getDbLayer } = await import('../provider_registry.js');
      window.DB_LAYER = await getDbLayer();
      console.log('DB_LAYER reinitialized to:', window.DB_LAYER.baseUrl);

      // CRITICAL: Clear Config cache so Invoicer will reload from NEW database
      this.state.Config = {};
      console.log('Config cache cleared - will reload from new database on next use');

      // Fetch and display database name
      await this.fetchDatabaseName(serverHost, serverPort);

      console.log('Startup config saved');
      showToast('Configuration saved successfully', 'success');

    } catch (error) {
      console.error('Failed to save startup config:', error);
      showToast('Failed to save configuration', 'error');
      logError('Config save failed:', error);
    }
  }
}
