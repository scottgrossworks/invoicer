/**
 * ShareUtils - Utility functions for leed sharing and Square OAuth integration
 *
 * Provides testable business logic for:
 * - Square OAuth flow (authorization, token refresh, validation)
 * - Leed sharing operations (create, validate, send)
 * - Square payment link generation
 * - Server API integration (future)
 *
 * Design: Pure async functions, no UI dependencies
 * Used by: Share.js page
 */

import { log, logError } from '../logging.js';
import { DateTimeUtils } from './DateTimeUtils.js';

// Magic link constants - must match emailHelper.py on server
const JWT_SECRET = '648373eeea08d422032db0d1e61a1bc096fe08dd2729ce611092c7a1af15d09c';
const LOGIN_URL_BASE = 'https://jjz8op6uy4.execute-api.us-west-2.amazonaws.com/Leedz_Stage_1/login';
const SHOW_LEED_URL = '/Leedz_Stage_1/showLeedPage';
const MAGIC_LINK_EXPIRY_SECONDS = 15 * 60; // 15 minutes

/**
 * JWT Magic Link Functions
 */

/**
 * Base64url encode a string or Uint8Array
 * @param {string|Uint8Array} input
 * @returns {string}
 */
function base64urlEncode(input) {
  let bytes;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = input;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sign a magic-link JWT matching the server's emailHelper.py format
 * Uses Web Crypto API for HMAC-SHA256 signing
 *
 * @param {string} recipientEmail - Email address of recipient
 * @returns {Promise<string>} Signed JWT string
 */
async function signMagicLinkJWT(recipientEmail) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    email: recipientEmail,
    type: 'magic',
    exp: Math.floor(Date.now() / 1000) + MAGIC_LINK_EXPIRY_SECONDS
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import the secret key for HMAC-SHA256
  const keyData = new TextEncoder().encode(JWT_SECRET);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );

  // Sign
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signingInput));
  const signatureB64 = base64urlEncode(new Uint8Array(signature));

  return `${signingInput}.${signatureB64}`;
}

/**
 * Build magic-link URL matching server emailHelper.py format
 * URL: {LOGIN_URL_BASE}?token={JWT}&redirect={encoded_showLeedPage_path}
 *
 * @param {string} recipientEmail - Email of recipient
 * @param {string} leedId - Leed ID (for redirect path)
 * @param {string} tradeName - Trade name (for redirect path)
 * @returns {Promise<string>} Complete magic-link URL
 */
export async function buildMagicLinkUrl(recipientEmail, leedId, tradeName) {
  const magicToken = await signMagicLinkJWT(recipientEmail);
  const redirectPath = `${SHOW_LEED_URL}?id=${leedId}&tn=${encodeURIComponent(tradeName || '')}`;
  return `${LOGIN_URL_BASE}?token=${magicToken}&redirect=${encodeURIComponent(redirectPath)}`;
}


/**
 * Square OAuth Functions
 */

/**
 * Initiate Square OAuth flow using Chrome identity API
 * @param {string} squareUrl - Square OAuth base URL
 * @param {string} squareAppId - Square application ID
 * @returns {Promise<Object>} - { access_token, refresh_token, expires_at, merchant_id, location_id, state }
 */
export async function initiateSquareOAuth(squareUrl, squareAppId) {
  if (!squareUrl || !squareAppId) {
    throw new Error('Missing Square configuration (url or appId)');
  }

  // Build OAuth URL
  const redirectUri = chrome.identity.getRedirectURL();
  const state = crypto.randomUUID(); // CSRF protection
  const scope = 'ORDERS_WRITE ORDERS_READ PAYMENTS_WRITE PAYMENTS_READ PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS MERCHANT_PROFILE_READ';

  const authUrl = `${squareUrl}/oauth2/authorize?` +
    `client_id=${squareAppId}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&session=false` +
    `&state=${state}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  log('[ShareUtils] Initiating Square OAuth flow');

  try {
    // Launch OAuth flow in popup window
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });

    log('[ShareUtils] OAuth response received:', responseUrl);

    // Parse response URL
    const url = new URL(responseUrl);
    const params = new URLSearchParams(url.search);

    const code = params.get('code');
    const returnedState = params.get('state');
    const error = params.get('error');

    if (error) {
      throw new Error(`Square OAuth error: ${error}`);
    }

    if (returnedState !== state) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    if (!code) {
      throw new Error('No authorization code received');
    }

    // Exchange code for tokens via AWS Lambda (sq_oauth_callback)
    const awsUrl = 'https://jjz8op6uy4.execute-api.us-west-2.amazonaws.com/Leedz_Stage_1';
    const stored = await chrome.storage.local.get(['leedzJWT']);
    const jwtToken = stored.leedzJWT;

    if (!jwtToken) {
      throw new Error('No JWT token found. Please restart the extension.');
    }

    const oauthResponse = await fetch(
      `${awsUrl}/square_oauth?code=${encodeURIComponent(code)}&response_type=code`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      }
    );

    if (!oauthResponse.ok) {
      const errText = await oauthResponse.text();
      throw new Error(`Square OAuth server error: ${oauthResponse.status} - ${errText}`);
    }

    const result = await oauthResponse.json();

    if (result.cd !== 1) {
      throw new Error(result.er || 'Square authorization failed on server');
    }

    log('[ShareUtils] Square OAuth authorized successfully');
    return { authorized: true, merchant_id: result.merchant_id || '' };

  } catch (error) {
    logError('[ShareUtils] OAuth flow failed:', error);
    throw error;
  }
}


/**
 * Check if user has valid Square authentication
 * @param {Object} config - User Config object with Square tokens
 * @returns {boolean} - True if authenticated and token not expired
 */
export function checkSquareAuth(config) {
  if (!config?.sq_access || !config?.sq_expiration) {
    return false;
  }

  // Check if token is expired
  return !isTokenExpired(config.sq_expiration);
}



/**
 * Leed Sharing Functions
 */


/**
 * Validate list of email addresses
 * @param {Array<string>} emails - Email addresses to validate
 * @returns {boolean} - True if all emails are valid
 */
export function validateEmailList(emails) {
  if (!Array.isArray(emails) || emails.length === 0) {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emails.every(email => emailRegex.test(email));
}




/**
 * Synthesize leed details (dt) from Booking.description
 * @param {Object} booking - Booking object from state
 * @returns {string} Details string for leed.dt
 */
export function synthesizeLeedDetails(booking) {
  return booking.description || '';
}

/**
 * Synthesize leed requirements (rq) from Special Instructions + Booking.notes
 * @param {string} specialInfo - Special instructions from Share page textarea
 * @param {Object} booking - Booking object from state
 * @returns {string} Requirements string for leed.rq
 */
export function synthesizeLeedRequirements(specialInfo, booking) {
  const parts = [];

  if (specialInfo && specialInfo.trim()) {
    parts.push(specialInfo.trim());
  }

  if (booking.notes && booking.notes.trim()) {
    parts.push(booking.notes.trim());
  }

  return parts.join('\n\n');
}

/**
 * Create the email body for the private email shares done by the extension
 * Uses templates from leedz_config.json shareEmail section
 * Generates magic-link JWT URLs matching server emailHelper.py format
 *
 * @param {Object} client - Client object with name, email, phone, company
 * @param {Object} booking - Booking object with title, startDate, startTime, description, location, price
 * @param {string} specialInfo - Special instructions/notes to include
 * @param {boolean} priceEnabled - Whether this is a paid leed (true) or free leed (false)
 * @param {Object} shareEmailConfig - shareEmail section from leedz_config.json
 * @param {string} recipientEmail - Email address of recipient (for magic-link JWT)
 * @param {Object} config - Config object with companyName (null if server not connected)
 * @param {string} senderEmail - Sender's email address
 * @param {string} tradeName - Selected trade name (for redirect URL)
 * @param {string} leedId - Pre-generated leed ID (for redirect URL)
 * @returns {Promise<string>} HTML email body
 */
export async function generateShareEmailBody(client, booking, specialInfo, priceEnabled, shareEmailConfig, recipientEmail, config, senderEmail, tradeName, leedId) {
  if (!shareEmailConfig) {
    throw new Error('shareEmail configuration not found in leedz_config.json');
  }

  // Format start date/time for opening line
  const startDateTime = DateTimeUtils.formatBookingStartDateTime(booking.startDate, booking.startTime);

  // Format date and time separately for details
  const formattedStartDate = DateTimeUtils.formatDateForDisplay(booking.startDate);
  const formattedStartTime = DateTimeUtils.convertTo12Hour(booking.startTime);

  // Generate magic-link URL for this recipient (matches server emailHelper.py)
  const magicLinkUrl = await buildMagicLinkUrl(recipientEmail, leedId, tradeName);

  let buttonHTML = '';
  let template = '';

  // CASE 1: FREE LEED (priceEnabled = false, price = 0)
  // All info shown inline + "Your Dashboard" button to onboard recipient
  // handle_login() auto-creates user via addUser, so dashboard will work
  if (!priceEnabled || !booking.price || booking.price === 0) {
    // Build magic-link that redirects to dashboard (not showLeedPage)
    const dashboardToken = await signMagicLinkJWT(recipientEmail);
    const dashboardUrl = `${LOGIN_URL_BASE}?token=${dashboardToken}`;
    buttonHTML = `<div style='margin:20px 0;'><a href='${dashboardUrl}' style='display:inline-block;background-color:#01ac56;color:white;padding:12px 24px;font-size:22px;text-decoration:none;border-radius:8px;font-weight:bold;'>Your Dashboard</a></div>`;
    template = shareEmailConfig.bodyTemplateFree;
  }
  // CASE 2: PAID LEED (priceEnabled = true, price > 0)
  // Magic-link button to buy leed details behind paywall
  else {
    buttonHTML = `<div style='margin:20px 0;'><a href='${magicLinkUrl}' style='display:inline-block;background-color:#01ac56;color:white;padding:12px 24px;font-size:22px;text-decoration:none;border-radius:8px;font-weight:bold;'>Buy Leed</a></div>`;
    template = shareEmailConfig.bodyTemplatePaid;
  }

  // Extract zip code for paid leedz
  let zipCode = '';
  if (priceEnabled && booking.price > 0) {
    try {
      zipCode = DateTimeUtils.extractZipCodeOnly(booking.location);
    } catch (error) {
      throw error; // Re-throw to caller as per requirements
    }
  }

  // Disclaimer block - two versions matching server new_leed.html
  // FREE: no "Buying this leed..." sentence
  // PAID: includes "Buying this leed..." sentence
  const disclaimerFree = `<div style='font-size:0.9em;margin-top:20px;padding:10px;background-color:#f9f9f9;border-left:3px solid #ccc;'><strong>*</strong> This leed is not a confirmed booking. You must use the contact information provided to sell your service to the client. For more information, please refer to our <a href="https://theleedz.com/leedz_tos.html">Terms of Service</a>.</div>`;
  const disclaimerPaid = `<div style='font-size:0.9em;margin-top:20px;padding:10px;background-color:#f9f9f9;border-left:3px solid #ccc;'><strong>*</strong> This leed is not a confirmed booking. You must use the contact information provided to sell your service to the client. Buying this leed guarantees you exclusive access to this information, which will then be removed from the calendar. For more information, please refer to our <a href="https://theleedz.com/leedz_tos.html">Terms of Service</a>.</div>`;
  const contactFooter = `<p style='font-size:0.9em;'>For any questions, please contact The Leedz - <a href="mailto:theleedz.com@gmail.com">theleedz.com@gmail.com</a></p>`;

  const isFree = !priceEnabled || !booking.price || booking.price === 0;

  // Build replacements map
  const replacements = {
    '{{bookingStartDateTime}}': startDateTime,
    '{{bookingTitle}}': booking.title || '',
    '{{bookingStartDate}}': formattedStartDate,
    '{{bookingStartTime}}': formattedStartTime,
    '{{bookingDescription}}': booking.description || '',
    '{{bookingLocation}}': booking.location || '',
    '{{zipCode}}': zipCode,
    '{{specialInstructions}}': specialInfo && specialInfo.trim() ? specialInfo.trim() : '',
    '{{clientName}}': client.name || '',
    '{{clientCompany}}': client.company ? `**Company:** ${client.company}\n` : '',
    '{{clientEmail}}': client.email || '',
    '{{clientPhone}}': client.phone ? `**Phone:** ${client.phone}\n` : '',
    '{{price}}': booking.price || '0',
    '{{tradeName}}': tradeName || '',
    '{{companyName}}': config?.companyName || '',
    '{{viewLeedzButton}}': buttonHTML,
    '{{buyLeedButton}}': buttonHTML,
    '{{disclaimerBlock}}': isFree ? disclaimerFree : disclaimerPaid,
    '{{contactFooter}}': contactFooter
  };

  // Replace all placeholders in template
  let emailBody = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    emailBody = emailBody.split(placeholder).join(value);
  }

  // Convert markdown-style **bold** to HTML <strong>
  emailBody = emailBody.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Convert newlines to HTML line breaks
  emailBody = emailBody.replace(/\n/g, '<br>\n');

  return emailBody;
}

