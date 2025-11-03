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
   * Called when startup page becomes visible
   */
  async onShow() {
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
    document.getElementById('startup-serverUrl').value = 'http://127.0.0.1';
    document.getElementById('startup-serverPort').value = '3000';
    document.getElementById('startup-dbProvider').value = 'local_prisma_sqlite';
    document.getElementById('startup-dbPath').value = '../data/leedz_invoicer.sqlite';
    document.getElementById('startup-mcpHost').value = '127.0.0.1';
    document.getElementById('startup-mcpPort').value = '3001';
    document.getElementById('startup-llmApiKey').value = '';
    document.getElementById('startup-llmProvider').value = 'claude-opus-4-1-20250805';
    document.getElementById('startup-llmBaseUrl').value = 'https://api.anthropic.com';
    document.getElementById('startup-llmAnthropicVersion').value = '2023-06-01';
    document.getElementById('startup-llmMaxTokens').value = '1024';
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

      const serverUrl = config.serverUrl || 'http://127.0.0.1';
      const serverPort = config.serverPort || '3000';
      const dbProvider = config.dbProvider || 'local_prisma_sqlite';
      const dbPath = config.dbPath || '../data/leedz_invoicer.sqlite';
      const mcpHost = config.mcpHost || '127.0.0.1';
      const mcpPort = config.mcpPort || '3001';
      const llmApiKey = config.llmApiKey || '';
      const llmProvider = config.llmProvider || 'claude-opus-4-1-20250805';
      const llmBaseUrl = config.llmBaseUrl || 'https://api.anthropic.com';
      const llmAnthropicVersion = config.llmAnthropicVersion || '2023-06-01';
      const llmMaxTokens = config.llmMaxTokens || 1024;

      // Populate form fields
      document.getElementById('startup-serverUrl').value = serverUrl;
      document.getElementById('startup-serverPort').value = serverPort;
      document.getElementById('startup-dbProvider').value = dbProvider;
      document.getElementById('startup-dbPath').value = dbPath;
      document.getElementById('startup-mcpHost').value = mcpHost;
      document.getElementById('startup-mcpPort').value = mcpPort;
      document.getElementById('startup-llmApiKey').value = llmApiKey;
      document.getElementById('startup-llmProvider').value = llmProvider;
      document.getElementById('startup-llmBaseUrl').value = llmBaseUrl;
      document.getElementById('startup-llmAnthropicVersion').value = llmAnthropicVersion;
      document.getElementById('startup-llmMaxTokens').value = llmMaxTokens;

      console.log('Loaded startup config from database');

    } catch (error) {
      console.warn('Could not load config from database, using defaults:', error);
      this.clear(); // Use defaults
    }
  }

  /**
   * Save config to state, Chrome storage, and database
   */
  async saveConfig() {
    try {
      // Get values from form
      const serverUrl = document.getElementById('startup-serverUrl').value.trim();
      const serverPort = document.getElementById('startup-serverPort').value.trim();
      const dbProvider = document.getElementById('startup-dbProvider').value.trim();
      const dbPath = document.getElementById('startup-dbPath').value.trim();
      const mcpHost = document.getElementById('startup-mcpHost').value.trim();
      const mcpPort = document.getElementById('startup-mcpPort').value.trim();
      const llmApiKey = document.getElementById('startup-llmApiKey').value.trim();
      const llmProvider = document.getElementById('startup-llmProvider').value.trim();
      const llmBaseUrl = document.getElementById('startup-llmBaseUrl').value.trim();
      const llmAnthropicVersion = document.getElementById('startup-llmAnthropicVersion').value.trim();
      const llmMaxTokens = parseInt(document.getElementById('startup-llmMaxTokens').value.trim()) || 1024;

      // Validate required fields
      if (!serverUrl || !serverPort) {
        showToast('Server URL and Port are required', 'error');
        return;
      }

      // Update state Config object
      if (!this.state.Config) {
        this.state.Config = {};
      }

      this.state.Config.serverUrl = serverUrl;
      this.state.Config.serverPort = serverPort;
      this.state.Config.dbProvider = dbProvider || 'local_prisma_sqlite';
      this.state.Config.dbPath = dbPath || '../data/leedz_invoicer.sqlite';
      this.state.Config.mcpHost = mcpHost || '127.0.0.1';
      this.state.Config.mcpPort = mcpPort || '3001';
      this.state.Config.llmApiKey = llmApiKey || null;
      this.state.Config.llmProvider = llmProvider || 'claude-opus-4-1-20250805';
      this.state.Config.llmBaseUrl = llmBaseUrl || 'https://api.anthropic.com';
      this.state.Config.llmAnthropicVersion = llmAnthropicVersion || '2023-06-01';
      this.state.Config.llmMaxTokens = llmMaxTokens;

      // Save to Chrome storage
      await chrome.storage.local.set({
        leedzStartupConfig: this.state.Config
      });

      // Save to database
      await this.state.save();

      console.log('Startup config saved:', this.state.Config);
      showToast('Configuration saved successfully', 'success');

    } catch (error) {
      console.error('Failed to save startup config:', error);
      showToast('Failed to save configuration', 'error');
      logError('Config save failed:', error);
    }
  }
}
