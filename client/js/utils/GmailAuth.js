/**
 * GmailAuth - Utility for Gmail API authentication and email sending
 * Provides OAuth token management and direct Gmail API email sending
 */

/**
 * Get OAuth token from Chrome identity API
 * @param {boolean} interactive - Show auth UI if needed
 * @returns {Promise<string>} OAuth token
 */
async function getGmailToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Build RFC 2822 MIME email message
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} body - Email body (plain text)
 * @returns {string} MIME formatted email message
 */
function buildMimeMessage(to, subject, body) {
  const lines = [];

  lines.push(`To: ${to}`);
  lines.push(`Subject: ${subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset=utf-8');
  lines.push('');
  lines.push(body);

  return lines.join('\r\n');
}

/**
 * Send email via Gmail API
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} body - Email body (plain text)
 * @returns {Promise<string>} Gmail message ID
 * @throws {Error} If auth fails or send fails
 */
export async function sendGmailMessage(to, subject, body) {
  // Get OAuth token (cached by Chrome, instant if already authed)
  const token = await getGmailToken(false);

  // Build MIME message
  const mimeMessage = buildMimeMessage(to, subject, body);

  // Base64url encode
  const encodedMessage = btoa(mimeMessage)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Call Gmail API
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedMessage })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail API returned ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return result.id;
}
