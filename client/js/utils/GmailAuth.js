/**
 * GmailAuth - Utility for Gmail OAuth via MCP server
 * Pure utility module - no Page inheritance
 */

import { showToast } from '../logging.js';

/**
 * Check MCP server status and update UI
 */
export async function checkMcpStatus(host, port) {
  const statusDiv = document.getElementById('mcp-status');
  const enableBtn = document.getElementById('enable-gmail-btn');
  const refreshBtn = document.getElementById('refresh-gmail-btn');

  if (!statusDiv) return null;

  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`http://${host}:${port}/health`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (enableBtn) enableBtn.disabled = false;
    if (refreshBtn) refreshBtn.disabled = !data.tokenValid;

    statusDiv.innerHTML = `Connected to ${data.service || 'gmail-mcp'}<br>IP: ${host}:${port}<br>${data.tokenValid ? 'Authorized and ready' : 'Ready to authorize'}`;
    statusDiv.className = 'status-success';

    return { connected: true, tokenValid: data.tokenValid };

  } catch (error) {
    if (enableBtn) enableBtn.disabled = true;
    if (refreshBtn) refreshBtn.disabled = true;

    statusDiv.textContent = error.name === 'AbortError'
      ? `MCP server not responding at ${host}:${port}`
      : 'MCP server offline';
    statusDiv.className = 'status-warning';

    return { connected: false, error: error.message };
  }
}

/**
 * Enable Gmail sending via MCP server
 */
export async function enableGmailSending(host, port) {
  const statusDiv = document.getElementById('mcp-status');

  if (!statusDiv) throw new Error('Status element not found');

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
    const response = await fetch(`http://${host}:${port}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }

    statusDiv.textContent = 'Gmail sending enabled (expires in 1 hour)';
    statusDiv.className = 'status-success';

    const refreshBtn = document.getElementById('refresh-gmail-btn');
    if (refreshBtn) refreshBtn.disabled = false;

    showToast('Gmail authorization successful', 'success');
    return { success: true };

  } catch (error) {
    statusDiv.textContent = `Authorization failed: ${error.message}`;
    statusDiv.className = 'status-error';
    showToast('Gmail authorization failed', 'error');
    throw error;
  }
}

/**
 * Refresh Gmail OAuth token
 */
export async function refreshGmailToken(host, port) {
  const statusDiv = document.getElementById('mcp-status');

  if (!statusDiv) throw new Error('Status element not found');

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
    const response = await fetch(`http://${host}:${port}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }

    statusDiv.textContent = 'Token refreshed successfully';
    statusDiv.className = 'status-success';
    showToast('Gmail token refreshed', 'success');
    return { success: true };

  } catch (error) {
    statusDiv.textContent = `Refresh failed: ${error.message}`;
    statusDiv.className = 'status-error';
    showToast('Token refresh failed', 'error');
    throw error;
  }
}
