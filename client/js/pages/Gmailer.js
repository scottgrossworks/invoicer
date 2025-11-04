/**
 * Gmailer - Page class for Gmail MCP server authorization
 * Extracted from monolithic sidebar.js
 */

import { Page } from './Page.js';
import { DateTimeUtils } from '../utils/DateTimeUtils.js';

export class Gmailer extends Page {

  constructor(state) {
    super('gmailer', state);
    this.currentOAuthToken = null;
  }

  /**
   * Initialize gmailer page (called once on app startup)
   */
  async initialize() {
    this.setupMcpControls();
  }

  /**
   * Called when gmailer page becomes visible
   */
  async onShow() {
    // Load MCP config and check server health
    await this.loadMcpConfigAndCheckServer();
  }

  /**
   * Update UI from state changes
   */
  updateFromState(state) {
    this.state = state;

    // Update MCP host/port inputs from config
    const hostInput = document.getElementById('mcp-host');
    const portInput = document.getElementById('mcp-port');

    if (hostInput && this.state.Config?.mcpHost) {
      hostInput.value = this.state.Config.mcpHost;
    }
    if (portInput && this.state.Config?.mcpPort) {
      portInput.value = this.state.Config.mcpPort;
    }
  }

  /**
   * Clear/reset gmailer state
   */
  clear() {
    // Reset OAuth state
    this.currentOAuthToken = null;
    this.resetGmailUI();
  }

  /**
   * No action buttons for gmailer (uses custom buttons in HTML)
   */
  getActionButtons() {
    return null;
  }

  /**
   * Wire up MCP page button event handlers
   */
  setupMcpControls() {
    const enableBtn = document.getElementById('enable-gmail-btn');
    if (enableBtn) {
      enableBtn.addEventListener('click', () => {
        // Check button state and call appropriate function
        if (enableBtn.textContent.trim() === 'Disable') {
          this.disableGmailSending();
        } else {
          this.enableGmailSending();
        }
      });
    }

    // Wire up Refresh button
    const refreshBtn = document.getElementById('refresh-gmail-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refreshGmailToken();
      });
    }

    // Set up input field change handlers to save to Config
    const hostInput = document.getElementById('mcp-host');
    const portInput = document.getElementById('mcp-port');

    if (hostInput) {
      hostInput.addEventListener('change', () => this.saveMcpConfig());
    }

    if (portInput) {
      portInput.addEventListener('change', () => this.saveMcpConfig());
    }
  }

  /**
   * Load MCP configuration from database and check server health.
   *
   * ORDER OF OPERATIONS:
   * 1. Load Config from leedz_server (port 3000)
   * 2. If Config loaded: ping MCP server (port 3001)
   * 3. If MCP responds: enable button
   */
  async loadMcpConfigAndCheckServer() {
    const statusDiv = document.getElementById('mcp-status');
    const enableBtn = document.getElementById('enable-gmail-btn');
    const refreshBtn = document.getElementById('refresh-gmail-btn');
    const hostInput = document.getElementById('mcp-host');
    const portInput = document.getElementById('mcp-port');

    if (statusDiv && enableBtn && hostInput && portInput) {
      console.log('Loading MCP config and checking server...');
    }

    // Step 1: Load Config from main database server
    try {
      await this.state.load();

      // Populate input fields from Config
      const mcpHost = this.state.Config?.mcpHost || '127.0.0.1';
      const mcpPort = this.state.Config?.mcpPort || '3001';

      if (hostInput) hostInput.value = mcpHost;
      if (portInput) portInput.value = mcpPort;

      if (hostInput.value && portInput.value) {
        console.log(`Loaded MCP config: ${hostInput.value}:${portInput.value}`);
      }

    } catch (error) {
      // Main server not running - show nice message and return
      if (enableBtn) enableBtn.disabled = true;
      if (refreshBtn) refreshBtn.disabled = true;
      console.warn('Could not load MCP config - main server may be down:', error);

      statusDiv.textContent = 'Database server not running. Please start the main server on port 3000.';
      statusDiv.className = 'status-warning';

      return;
    }

    // Step 2: Check MCP server health
    const mcpHost = hostInput?.value || '127.0.0.1';
    const mcpPort = portInput?.value || '3001';

    try {
      statusDiv.textContent = 'Checking MCP server...';
      statusDiv.className = 'status-checking';

      const serverUrl = `http://${mcpHost}:${mcpPort}`;
      const healthResponse = await fetch(`${serverUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (healthResponse.ok) {
        const healthData = await healthResponse.json();

        // Step 3: Server is running - enable button
        if (enableBtn) enableBtn.disabled = false;

        // Enable refresh button if token already valid
        if (refreshBtn) {
          refreshBtn.disabled = !healthData.tokenValid;
        }

        // Build clear status message with line breaks
        const serviceName = healthData.service || 'gmail-mcp';
        const version = healthData.version ? ` v${healthData.version}` : '';
        const authStatus = healthData.tokenValid ? 'Authorized and ready' : 'Ready to authorize';

        statusDiv.innerHTML = `Connected to ${serviceName}${version}<br>IP: ${mcpHost}:${mcpPort}<br>${authStatus}`;
        statusDiv.className = 'status-success';

      } else {
        throw new Error(`Server returned ${healthResponse.status}`);
      }

    } catch (error) {
      // MCP server not running - disable buttons
      if (enableBtn) enableBtn.disabled = true;
      if (refreshBtn) refreshBtn.disabled = true;

      statusDiv.textContent = `MCP server not running at ${mcpHost}:${mcpPort}. Please start gmail_mcp server.`;
      statusDiv.className = 'status-error';
    }
  }

  /**
   * Save MCP host/port configuration to database
   */
  async saveMcpConfig() {
    const hostInput = document.getElementById('mcp-host');
    const portInput = document.getElementById('mcp-port');

    if (!hostInput || !portInput) return;

    try {
      // Update State Config object
      if (!this.state.Config) this.state.Config = {};
      this.state.Config.mcpHost = hostInput.value.trim() || '127.0.0.1';
      this.state.Config.mcpPort = portInput.value.trim() || '3001';

      // Save to database
      await this.state.save();

      console.log('MCP config saved:', this.state.Config.mcpHost, this.state.Config.mcpPort);

      // Re-check server health with new settings
      await this.loadMcpConfigAndCheckServer();

    } catch (error) {
      console.error('Failed to save MCP config:', error);
    }
  }

  /**
   * Enable Gmail sending by obtaining OAuth token and sending to MCP server
   *
   * FLOW:
   * 1. Get host/port from input fields
   * 2. Call chrome.identity.getAuthToken() to get Gmail OAuth token
   * 3. POST token to MCP server
   * 4. Display success/failure status
   *
   * Token expires after 1 hour
   */
  async enableGmailSending() {
    const host = document.getElementById('mcp-host').value.trim() || '127.0.0.1';
    const port = document.getElementById('mcp-port').value.trim() || '3001';
    const statusDiv = document.getElementById('mcp-status');
    const enableBtn = document.getElementById('enable-gmail-btn');

    // Clear previous status
    statusDiv.textContent = '';
    statusDiv.className = '';

    try {
      // Update status to show we're starting
      statusDiv.textContent = 'Requesting Gmail authorization...';
      statusDiv.className = 'status-checking';

      // Get OAuth token from Chrome identity API
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(token);
          }
        });
      });

      // Store token for later revocation
      this.currentOAuthToken = token;

      console.log('OAuth token obtained from Chrome identity');

      // Send token to MCP server
      const serverUrl = `http://${host}:${port}`;
      const response = await fetch(`${serverUrl}/gmail-authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        throw new Error(`MCP server returned ${response.status}`);
      }

      const result = await response.json();

      // Calculate expiration time (1 hour from now)
      const expiryTime = new Date(Date.now() + 60 * 60 * 1000);
      const formattedTime = DateTimeUtils.formatTime12Hour(expiryTime);

      // Show success status with expiry time
      statusDiv.innerHTML = `Gmail authorized successfully.<br>Authorization expires at ${formattedTime}.`;
      statusDiv.className = 'status-success';

      // Change button to "Disable" state
      if (enableBtn) {
        enableBtn.textContent = 'Disable';
        enableBtn.classList.add('gmail-enabled');
      }

      // Enable the Refresh button
      const refreshBtn = document.getElementById('refresh-gmail-btn');
      if (refreshBtn) {
        refreshBtn.disabled = false;
      }

      console.log('Gmail authorization successful:', result);

    } catch (error) {
      // Show user-friendly error status
      statusDiv.innerHTML = 'Error obtaining authorization.<br>Are you logged into Gmail?';
      statusDiv.className = 'status-error';

      console.warn('Gmail authorization failed:', error);
    }
  }

  /**
   * Refresh Gmail OAuth token and send to MCP server
   *
   * Re-authorizes with Gmail and sends new token to MCP server
   *
   * FLOW:
   * 1. Get host/port from input fields
   * 2. Call chrome.identity.getAuthToken({ interactive: false }) to refresh token
   * 3. POST token to MCP server
   * 4. Update expiry time display
   */
  async refreshGmailToken() {
    const host = document.getElementById('mcp-host').value.trim() || '127.0.0.1';
    const port = document.getElementById('mcp-port').value.trim() || '3001';
    const statusDiv = document.getElementById('mcp-status');

    try {
      // Update status
      statusDiv.textContent = 'Refreshing Gmail authorization...';
      statusDiv.className = 'status-checking';

      // Get fresh OAuth token (non-interactive refresh)
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(token);
          }
        });
      });

      // Update stored token for later revocation
      this.currentOAuthToken = token;

      console.log('Refreshed OAuth token from Chrome identity');

      // Send token to MCP server
      const serverUrl = `http://${host}:${port}`;
      const response = await fetch(`${serverUrl}/gmail-authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        throw new Error(`MCP server returned ${response.status}`);
      }

      const result = await response.json();

      // Calculate new expiration time (1 hour from now)
      const expiryTime = new Date(Date.now() + 60 * 60 * 1000);
      const formattedTime = DateTimeUtils.formatTime12Hour(expiryTime);

      // Show success status
      statusDiv.innerHTML = `Gmail authorization refreshed successfully.<br>New expiration: ${formattedTime}.`;
      statusDiv.className = 'status-success';

      console.log('Gmail token refreshed successfully:', result);

    } catch (error) {
      // Show error status
      statusDiv.innerHTML = 'Failed to refresh authorization.<br>Please use Enable button to re-authorize.';
      statusDiv.className = 'status-error';

      console.warn('Gmail token refresh failed:', error);
    }
  }

  /**
   * Disable Gmail sending by revoking OAuth token
   *
   * Steps:
   * 1. Show confirmation prompt
   * 2. Revoke token via Google's OAuth revoke endpoint
   * 3. Clear token from Chrome identity cache
   * 4. Reset UI to "Enable" state
   */
  async disableGmailSending() {
    const statusDiv = document.getElementById('mcp-status');
    const enableBtn = document.getElementById('enable-gmail-btn');

    // Show confirmation prompt
    const confirmed = confirm('Disable Gmail sending?\n\nThis will revoke the authorization token. You will need to re-authorize to send emails again.');

    if (!confirmed) {
      return; // User cancelled
    }

    // Check if we have a token to revoke
    if (!this.currentOAuthToken) {
      console.warn('No token to revoke');
      this.resetGmailUI();
      return;
    }

    try {
      statusDiv.textContent = 'Revoking authorization...';
      statusDiv.className = 'status-checking';

      // Revoke token via Google's OAuth revoke endpoint
      const revokeResponse = await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${this.currentOAuthToken}`, {
        method: 'POST'
      });

      console.log('Token revoke response:', revokeResponse.status);

      // Clear token from Chrome identity cache
      chrome.identity.removeCachedAuthToken({ token: this.currentOAuthToken }, () => {
        console.log('Token removed from Chrome cache');
      });

      // Clear stored token
      this.currentOAuthToken = null;

      // Reset UI
      this.resetGmailUI();

      // Show success status
      statusDiv.textContent = 'Authorization revoked successfully.';
      statusDiv.className = 'status-success';

      console.log('Gmail authorization disabled');

    } catch (error) {
      console.warn('Error disabling Gmail:', error);

      // Even on error, reset UI and clear token
      this.currentOAuthToken = null;
      this.resetGmailUI();

      statusDiv.textContent = 'Authorization cleared.';
      statusDiv.className = 'status-warning';
    }
  }

  /**
   * Reset Gmail UI to "Enable" state
   */
  resetGmailUI() {
    const enableBtn = document.getElementById('enable-gmail-btn');

    if (enableBtn) {
      enableBtn.textContent = 'Enable Gmail Sending (1 hour)';
      enableBtn.classList.remove('gmail-enabled');
    }

    // Disable the Refresh button
    const refreshBtn = document.getElementById('refresh-gmail-btn');
    if (refreshBtn) {
      refreshBtn.disabled = true;
    }
  }
}
