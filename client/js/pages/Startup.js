/**
 * Startup - Configuration page with Gmail authorization
 * SIMPLIFIED - Gmail auth moved to utils/GmailAuth.js
 */

import { Page } from './Page.js';
import { showToast } from '../logging.js';

export class Startup extends Page {

  constructor(state, leedzConfig = null) {
    super('startup', state, leedzConfig);
    this.awsApiGatewayUrl = (leedzConfig || this.leedzConfig)?.aws?.apiGatewayUrl || null;
  }

  async initialize() {
    // Wire up Startup buttons
    document.getElementById('startupClearBtn')?.addEventListener('click', () => this.clear());
    document.getElementById('startupSaveBtn')?.addEventListener('click', () => this.save());
    document.getElementById('reloadBtnStartup')?.addEventListener('click', () => this.reload());

    // Gmail buttons removed - no longer in Startup page
  }

  onShowImpl() {
    // NOTHING HERE - page already rendered with HTML defaults
    // All async tasks delayed to not block rendering

    // Delay background tasks by 100ms to let page render first
    setTimeout(() => {
      this.loadSavedConfig();
      this.checkServerStatus();
      this.fetchJWTToken();
    }, 100);
  }

  /**
   * Load saved config from state into form
   */
  loadSavedConfig() {
    const config = this.state.Config || {};

    if (config.serverHost) document.getElementById('startup-serverHost').value = config.serverHost;
    if (config.serverPort) document.getElementById('startup-serverPort').value = config.serverPort;
    if (config.mcpHost) document.getElementById('startup-mcpHost').value = config.mcpHost;
    if (config.mcpPort) document.getElementById('startup-mcpPort').value = config.mcpPort;
    if (config.llmApiKey) document.getElementById('startup-llmApiKey').value = config.llmApiKey;
    if (config.llmProvider) document.getElementById('startup-llmProvider').value = config.llmProvider;
    if (config.llmBaseUrl) document.getElementById('startup-llmBaseUrl').value = config.llmBaseUrl;
    if (config.llmAnthropicVersion) document.getElementById('startup-llmAnthropicVersion').value = config.llmAnthropicVersion;
    if (config.llmMaxTokens) document.getElementById('startup-llmMaxTokens').value = config.llmMaxTokens;
  }

  /**
   * Check leedz_server status
   */
  async checkServerStatus() {
    const host = document.getElementById('startup-serverHost')?.value || 'localhost';
    const port = document.getElementById('startup-serverPort')?.value || '3000';
    const dbNameEl = document.getElementById('startup-dbName');

    if (!dbNameEl) return;

    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${host}:${port}/config`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const config = await response.json();

      dbNameEl.textContent = config.databaseName || 'Unknown';
      dbNameEl.style.color = 'green';
    } catch (error) {
      dbNameEl.textContent = 'Not connected';
      dbNameEl.style.color = 'red';
      console.log('Leedz server not available:', error.message);
    }
  }

  /**
   * Reload/retry server connection
   */
  async reload() {
    // console.log('Retrying server connection...');

    const host = document.getElementById('startup-serverHost')?.value || 'localhost';
    const port = document.getElementById('startup-serverPort')?.value || '3000';
    const dbNameEl = document.getElementById('startup-dbName');

    if (!dbNameEl) return;

    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${host}:${port}/config`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const config = await response.json();

      dbNameEl.textContent = config.databaseName || 'Unknown';
      dbNameEl.style.color = 'green';

      // Show success toast when server is found
      showToast('Leedz Server Connected', 'success');
    } catch (error) {
      dbNameEl.textContent = 'Not connected';
      dbNameEl.style.color = 'red';
      console.log('Leedz server not available:', error.message);
    }
  }

  // MCP and Gmail functions removed - not needed in Startup page

  /**
   * Fetch JWT token for LEEDZ marketplace
   */
  async fetchJWTToken() {
    try {
      // Check if token already valid (7+ days remaining)
      const stored = await chrome.storage.local.get(['leedzJWT', 'leedzJWTExpiry']);
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;

      if (stored.leedzJWT && stored.leedzJWTExpiry > (now + sevenDays)) {
        // console.log('JWT token valid until:', new Date(stored.leedzJWTExpiry));
        return;
      }

      // Get user email from Chrome identity
      const userInfo = await new Promise((resolve, reject) => {
        chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
          chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(info);
        });
      });

      if (!userInfo.email || !this.awsApiGatewayUrl) return;

      // Fetch new token from AWS
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.awsApiGatewayUrl}/getToken?email=${encodeURIComponent(userInfo.email)}`, {
        signal: controller.signal
      });

      const { token, expires } = await response.json();

      // Store token
      await chrome.storage.local.set({
        leedzJWT: token,
        leedzJWTExpiry: expires * 1000,
        leedzUserEmail: userInfo.email
      });

      // console.log('JWT token obtained, expires:', new Date(expires * 1000));
    } catch (error) {
      console.log('JWT token fetch failed (non-critical):', error.message);
    }
  }

  /**
   * Clear form to defaults
   */
  clear() {
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
   * Save configuration
   */
  async save() {
    const config = {
      serverHost: document.getElementById('startup-serverHost').value.trim(),
      serverPort: document.getElementById('startup-serverPort').value.trim(),
      mcpHost: document.getElementById('startup-mcpHost').value.trim(),
      mcpPort: document.getElementById('startup-mcpPort').value.trim(),
      llmApiKey: document.getElementById('startup-llmApiKey').value.trim(),
      llmProvider: document.getElementById('startup-llmProvider').value.trim(),
      llmBaseUrl: document.getElementById('startup-llmBaseUrl').value.trim(),
      llmAnthropicVersion: document.getElementById('startup-llmAnthropicVersion').value.trim(),
      llmMaxTokens: parseInt(document.getElementById('startup-llmMaxTokens').value) || 1024,
      dbProvider: 'local_prisma_sqlite'
    };

    // Save to Chrome storage
    await chrome.storage.local.set({ leedzStartupConfig: config });

    // Merge with existing Config (preserve PDF settings)
    Object.assign(this.state.Config, config);

    // Save to database
    try {
      await this.state.save();
    } catch (error) {
      console.log('Failed to save config to database:', error.message);
      // Continue - config is saved to Chrome storage, DB save is optional
    }

    // Reinitialize DB_LAYER
    const { getDbLayer } = await import('../provider_registry.js');
    window.DB_LAYER = await getDbLayer();
    this.state.Config = {}; // Clear cache

    // Check server status
    this.checkServerStatus();

    showToast('Configuration saved', 'success');
  }

  isStartupPage() { return true; }
  updateFromState(state) { this.state = state; this.loadSavedConfig(); }
  getActionButtons() { return null; }
}
