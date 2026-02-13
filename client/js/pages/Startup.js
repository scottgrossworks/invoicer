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
    this.gmailRefreshTimer = null;
  }

  async initialize() {
    // Wire up Startup buttons
    document.getElementById('startupClearBtn')?.addEventListener('click', () => this.clear());
    document.getElementById('startupSaveBtn')?.addEventListener('click', () => this.save());
    document.getElementById('reloadBtnStartup')?.addEventListener('click', () => this.reload());

    // Wire up Gmail authorization buttons
    const enableBtn = document.getElementById('enable-gmail-btn');
    const refreshBtn = document.getElementById('refresh-gmail-btn');

    enableBtn?.addEventListener('click', () => this.enableGmail());
    refreshBtn?.addEventListener('click', () => this.refreshGmail());
  }

  onShowImpl() {
    // NOTHING HERE - page already rendered with HTML defaults
    // All async tasks delayed to not block rendering

    // Delay background tasks by 100ms to let page render first
    setTimeout(() => {
      this.loadSavedConfig();
      this.checkServerStatus();
      this.checkMcpStatus();
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

  /**
   * Check MCP server status
   */
  async checkMcpStatus() {
    const host = document.getElementById('mcp-host')?.value || '127.0.0.1';
    const port = document.getElementById('mcp-port')?.value || '3001';
    const statusDiv = document.getElementById('mcp-status');
    const enableBtn = document.getElementById('enable-gmail-btn');
    const refreshBtn = document.getElementById('refresh-gmail-btn');

    if (!statusDiv) return;

    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`http://${host}:${port}/health`, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      enableBtn.disabled = false;
      refreshBtn.disabled = !data.tokenValid;

      statusDiv.innerHTML = `Connected to ${data.service || 'gmail-mcp'}<br>IP: ${host}:${port}<br>${data.tokenValid ? 'Authorized and ready' : 'Ready to authorize'}`;
      statusDiv.className = 'status-success';
    } catch (error) {
      enableBtn.disabled = true;
      refreshBtn.disabled = true;
      statusDiv.textContent = error.name === 'AbortError' ? `MCP server not responding at ${host}:${port}` : 'MCP server offline';
      statusDiv.className = 'status-warning';
    }
  }

  /**
   * Enable Gmail sending via MCP server
   * Starts auto-refresh timer to keep token alive for the full hour
   */
  async enableGmail() {
    const host = document.getElementById('mcp-host')?.value || '127.0.0.1';
    const port = document.getElementById('mcp-port')?.value || '3001';
    const statusDiv = document.getElementById('mcp-status');

    try {
      statusDiv.textContent = 'Getting OAuth token...';
      statusDiv.className = 'status-checking';

      // Get OAuth token from Chrome
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(token);
        });
      });

      // Send token to MCP server
      const response = await fetch(`http://${host}:${port}/gmail-authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `MCP server returned ${response.status}`);
      }

      statusDiv.textContent = 'Gmail sending enabled (auto-refresh active, 1 hour session)';
      statusDiv.className = 'status-success';
      document.getElementById('refresh-gmail-btn').disabled = false;
      showToast('Gmail authorization successful', 'success');

      // Start auto-refresh timer: refresh token every 45 minutes to prevent expiration
      this.startGmailAutoRefresh();

    } catch (error) {
      statusDiv.textContent = `Authorization failed: ${error.message}`;
      statusDiv.className = 'status-error';
      showToast('Gmail authorization failed', 'error');
    }
  }

  /**
   * Auto-refresh Gmail token every 45 minutes
   * Chrome OAuth tokens can expire silently. This keeps the session alive
   * by proactively cycling the token before Google revokes it.
   */
  startGmailAutoRefresh() {
    // Clear any existing timer
    if (this.gmailRefreshTimer) clearInterval(this.gmailRefreshTimer);

    const REFRESH_INTERVAL = 45 * 60 * 1000; // 45 minutes

    this.gmailRefreshTimer = setInterval(async () => {
      console.log('[Gmail Auto-Refresh] Refreshing token...');
      try {
        await this.refreshGmailSilent();
        console.log('[Gmail Auto-Refresh] Token refreshed successfully');
      } catch (error) {
        console.log('[Gmail Auto-Refresh] Failed:', error.message);
        // Stop auto-refresh if it fails - user will need to re-enable manually
        clearInterval(this.gmailRefreshTimer);
        this.gmailRefreshTimer = null;

        const statusDiv = document.getElementById('mcp-status');
        if (statusDiv) {
          statusDiv.textContent = 'Token expired. Click Enable Gmail to re-authorize.';
          statusDiv.className = 'status-warning';
        }
      }
    }, REFRESH_INTERVAL);

    console.log(`[Gmail Auto-Refresh] Timer set: refresh every ${REFRESH_INTERVAL / 60000} minutes`);
  }

  /**
   * Silent token refresh - no UI feedback, used by auto-refresh timer
   */
  async refreshGmailSilent() {
    const host = document.getElementById('mcp-host')?.value || '127.0.0.1';
    const port = document.getElementById('mcp-port')?.value || '3001';

    // Revoke old cached token from Chrome
    await new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
          chrome.identity.removeCachedAuthToken({ token }, resolve);
        } else {
          resolve();
        }
      });
    });

    // Get fresh token (non-interactive since user already authorized)
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(token);
      });
    });

    if (!token) throw new Error('No token returned from Chrome');

    // Send fresh token to MCP server
    const response = await fetch(`http://${host}:${port}/gmail-authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!response.ok) throw new Error(`MCP server returned ${response.status}`);
  }

  /**
   * Refresh Gmail OAuth token (manual button click)
   * Also restarts the auto-refresh timer
   */
  async refreshGmail() {
    const host = document.getElementById('mcp-host')?.value || '127.0.0.1';
    const port = document.getElementById('mcp-port')?.value || '3001';
    const statusDiv = document.getElementById('mcp-status');

    try {
      statusDiv.textContent = 'Refreshing token...';
      statusDiv.className = 'status-checking';

      // Revoke old token
      await new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (token) {
            chrome.identity.removeCachedAuthToken({ token }, resolve);
          } else {
            resolve();
          }
        });
      });

      // Get new token
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(token);
        });
      });

      // Send to MCP server
      const response = await fetch(`http://${host}:${port}/gmail-authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `MCP server returned ${response.status}`);
      }

      statusDiv.textContent = 'Token refreshed (auto-refresh active, 1 hour session)';
      statusDiv.className = 'status-success';
      showToast('Gmail token refreshed', 'success');

      // Restart auto-refresh timer
      this.startGmailAutoRefresh();

    } catch (error) {
      statusDiv.textContent = `Refresh failed: ${error.message}`;
      statusDiv.className = 'status-error';
      showToast('Token refresh failed', 'error');
    }
  }

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
