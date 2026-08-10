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
    setTimeout(async () => {
      await this.populateConfigDefaults();
      this.loadSavedConfig();
      this.checkServerStatus();
      this.checkMcpStatus();
      this.fetchJWTToken();
    }, 100);
  }

  /**
   * Resolve the leedz server host/port from leedz_config.json (db.baseUrl).
   * Single source of truth — no hardcoded ports.
   */
  _serverHostPort() {
    try {
      const u = new URL(this.leedzConfig?.db?.baseUrl || '');
      return { host: u.hostname, port: u.port };
    } catch { return { host: '', port: '' }; }
  }

  /**
   * Resolve the MCP host/port from leedz_config.json (mcp.defaultHost/defaultPort).
   */
  _mcpHostPort() {
    const m = this.leedzConfig?.mcp || {};
    return { host: m.defaultHost || '', port: m.defaultPort || '' };
  }

  /**
   * Proxy an MCP HTTP request through the background service worker.
   * Chrome (Local Network Access) blocks the sidebar iframe from fetching
   * 127.0.0.1 directly; the background worker (host_permissions) is allowed.
   * Same pattern already used for LLM requests (leedz_llm_request).
   */
  async mcpRequest(path, { method = 'GET', body = null } = {}) {
    const m = this._mcpHostPort();
    const host = document.getElementById('mcp-host')?.value || m.host;
    const port = document.getElementById('mcp-port')?.value || m.port;
    const url = `http://${host}:${port}${path}`;
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'leedz_mcp_request', request: { url, method, body } },
        (resp) => {
          if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
          resolve(resp || { ok: false, error: 'no response from background' });
        }
      );
    });
  }

  /**
   * Populate connection fields from leedz_config.json. These are DEFAULTS;
   * loadSavedConfig() may override them from saved state. No values are
   * hardcoded in the HTML — they all originate here from config.
   */
  async populateConfigDefaults() {
    let cfg = this.leedzConfig;
    if (!cfg || !cfg.db || !cfg.mcp) {
      try {
        const r = await fetch(chrome.runtime.getURL('leedz_config.json'));
        cfg = await r.json();
        this.leedzConfig = cfg;
      } catch (e) { cfg = cfg || {}; }
    }
    const set = (id, v) => {
      if (v === undefined || v === null || v === '') return;
      document.querySelectorAll('#' + id).forEach(el => { el.value = v; });
    };
    const srv = this._serverHostPort();
    const mcp = this._mcpHostPort();
    set('startup-serverHost', srv.host);
    set('startup-serverPort', srv.port);
    set('startup-mcpHost', mcp.host);
    set('startup-mcpPort', mcp.port);
    set('mcp-host', mcp.host);
    set('mcp-port', mcp.port);
    const llm = cfg.llm || {};
    set('startup-llmProvider', llm.provider);
    set('startup-llmBaseUrl', llm.baseUrl);
    set('startup-llmAnthropicVersion', llm['anthropic-version']);
    set('startup-llmMaxTokens', llm.max_tokens);
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
   * Render runtime business identity (from DOCS/VALUE_PROP.md) into the Startup panel.
   * Three render states: loaded+ok, loaded+blocking-errors, loaded+warnings.
   * @param {object|null} bi - STATE.BusinessIdentity
   */
  renderBusinessIdentity(bi) {
    const tbody = document.getElementById('business-identity-tbody');
    const status = document.getElementById('business-identity-status');
    if (!tbody) return;

    const esc = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (!bi) {
      tbody.innerHTML = '<tr><td colspan="2">Identity not loaded</td></tr>';
      if (status) { status.textContent = 'Business identity unavailable.'; status.style.color = '#b00000'; }
      return;
    }

    const rows = [
      ['Seller', bi.sellerName],
      ['Company', bi.companyName],
      ['Email', bi.companyEmail],
      ['Phone', bi.companyPhone],
      ['Trade', bi.canonicalTrade || bi.trade]
    ];
    tbody.innerHTML = rows
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v || '—')}</td></tr>`)
      .join('');

    if (!status) return;
    if (Array.isArray(bi.errors) && bi.errors.length) {
      status.innerHTML = bi.errors.map(esc).join('<br>');
      status.style.color = '#b00000';   // blocking
    } else if (Array.isArray(bi.warnings) && bi.warnings.length) {
      status.innerHTML = bi.warnings.map(esc).join('<br>');
      status.style.color = '#b06f00';   // warning (non-blocking)
    } else {
      status.textContent = 'Identity loaded.';
      status.style.color = '#0a8a00';
    }
  }

  /**
   * Check leedz_server status
   */
  async checkServerStatus() {
    const host = document.getElementById('startup-serverHost')?.value || this._serverHostPort().host;
    const port = document.getElementById('startup-serverPort')?.value || this._serverHostPort().port;
    const dbNameEl = document.getElementById('startup-dbName');

    if (!dbNameEl) return;

    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);

      // /health replaces the removed GET /config (SCHEMA unification 2026-07-21):
      // returns { status, databaseName } — all this check ever needed.
      const response = await fetch(`http://${host}:${port}/health`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const health = await response.json();

      dbNameEl.textContent = health.databaseName || 'Unknown';
      dbNameEl.style.color = 'green';
    } catch (error) {
      dbNameEl.textContent = 'Not connected';
      dbNameEl.style.color = 'red';
      console.log('Leedz server not available:', error.message);
      showToast('Leedz Server not connected - start it from the tray icon, then Reload.', 'error');
    }
  }

  /**
   * Reload/retry server connection
   */
  async reload() {
    // console.log('Retrying server connection...');

    const host = document.getElementById('startup-serverHost')?.value || this._serverHostPort().host;
    const port = document.getElementById('startup-serverPort')?.value || this._serverHostPort().port;
    const dbNameEl = document.getElementById('startup-dbName');

    if (!dbNameEl) return;

    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);

      // /health replaces the removed GET /config (SCHEMA unification 2026-07-21).
      const response = await fetch(`http://${host}:${port}/health`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const health = await response.json();

      dbNameEl.textContent = health.databaseName || 'Unknown';
      dbNameEl.style.color = 'green';

      // Show success toast when server is found
      showToast('Leedz Server Connected', 'success');
    } catch (error) {
      dbNameEl.textContent = 'Not connected';
      dbNameEl.style.color = 'red';
      // console.log('Leedz server not available:', error.message);
    }
  }

  /**
   * Check MCP server status
   */
  async checkMcpStatus() {
    const host = document.getElementById('mcp-host')?.value || this._mcpHostPort().host;
    const port = document.getElementById('mcp-port')?.value || this._mcpHostPort().port;
    const statusDiv = document.getElementById('mcp-status');
    const enableBtn = document.getElementById('enable-gmail-btn');
    const refreshBtn = document.getElementById('refresh-gmail-btn');

    if (!statusDiv) return;

    const resp = await this.mcpRequest('/health');
    if (resp.ok && resp.data) {
      const data = resp.data;
      enableBtn.disabled = false;
      refreshBtn.disabled = !data.tokenValid;
      statusDiv.innerHTML = `Connected to ${data.service || 'gmail-mcp'}<br>IP: ${host}:${port}<br>${data.tokenValid ? 'Authorized and ready' : 'Ready to authorize'}`;
      statusDiv.className = 'status-success';
    } else {
      enableBtn.disabled = true;
      refreshBtn.disabled = true;
      statusDiv.textContent = 'MCP server offline';
      statusDiv.className = 'status-warning';
    }
  }

  /**
   * Enable Gmail sending via MCP server
   * Starts auto-refresh timer to keep token alive for the full hour
   */
  async enableGmail() {
    const host = document.getElementById('mcp-host')?.value || this._mcpHostPort().host;
    const port = document.getElementById('mcp-port')?.value || this._mcpHostPort().port;
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

      // Send token to MCP server (via background worker to bypass iframe network restrictions)
      const resp = await this.mcpRequest('/gmail-authorize', { method: 'POST', body: { token } });
      if (!resp.ok) {
        throw new Error((resp.data && resp.data.error) || resp.error || `MCP server returned ${resp.status}`);
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
      // console.log('[Gmail Auto-Refresh] Refreshing token...');
      try {
        await this.refreshGmailSilent();
        // console.log('[Gmail Auto-Refresh] Token refreshed successfully');
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

  }

  /**
   * Silent token refresh - no UI feedback, used by auto-refresh timer
   */
  async refreshGmailSilent() {
    const host = document.getElementById('mcp-host')?.value || this._mcpHostPort().host;
    const port = document.getElementById('mcp-port')?.value || this._mcpHostPort().port;

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

    // Send fresh token to MCP server (via background worker)
    const resp = await this.mcpRequest('/gmail-authorize', { method: 'POST', body: { token } });
    if (!resp.ok) throw new Error((resp.data && resp.data.error) || resp.error || `MCP server returned ${resp.status}`);
  }

  /**
   * Refresh Gmail OAuth token (manual button click)
   * Also restarts the auto-refresh timer
   */
  async refreshGmail() {
    const host = document.getElementById('mcp-host')?.value || this._mcpHostPort().host;
    const port = document.getElementById('mcp-port')?.value || this._mcpHostPort().port;
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

      // Send to MCP server (via background worker)
      const resp = await this.mcpRequest('/gmail-authorize', { method: 'POST', body: { token } });
      if (!resp.ok) {
        throw new Error((resp.data && resp.data.error) || resp.error || `MCP server returned ${resp.status}`);
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
      // console.log('JWT token fetch failed (non-critical):', error.message);
    }
  }

  /**
   * Clear form to defaults
   */
  clear() {
    // Reset to leedz_config.json defaults — no hardcoded values here.
    this.populateConfigDefaults();
    document.getElementById('startup-llmApiKey').value = '';
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
