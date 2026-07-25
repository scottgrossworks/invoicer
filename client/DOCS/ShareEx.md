# Leedz Share Ex — Standalone Extension Design Document

## 1. Concept

A standalone Chrome extension with ONE function: parse a Gmail email chain and Share it to The Leedz marketplace. Includes a "Thank-You Note" checkbox that auto-generates a polite decline + referral email to the client. One page. No friction.

**Source repo**: `C:\Users\Scott\Desktop\WKG\INVOICER\`
**Source client directory**: `INVOICER\client\`
**ShareEx build directory**: `INVOICER\shareex\` (NEW — to be created)

---

## 2. Git Strategy: Branch (not Fork)

ShareEx lives in the same INVOICER repo on a `sharex` branch.
- Improvements to shared files (GmailParser, Page_Utils, GmailAuth, etc.) merge back to `main`
- ShareEx-specific files (`shareex/`) sit harmlessly in `main` after merge
- `git checkout -b sharex` from `main` to start
- Remote: `github.com/scottgrossworks/invoicer` (existing)

---

## 3. Directory Structure

```
INVOICER/
  client/                    <- main source (unchanged)
    js/
    css/
    icons/
    manifest.json            <- INVOICER manifest
    leedz_config.json        <- INVOICER config
    build.bat                <- INVOICER build
    sidebar.html
    ...
  shareex/                   <- NEW: ShareEx build directory
    build.bat                <- ShareEx build script (WRITE FROM SCRATCH)
    manifest.json            <- ShareEx manifest (WRITE FROM SCRATCH)
    sharex_config.json       <- ShareEx config (WRITE FROM SCRATCH)
    LLM_KEY.json             <- User's Anthropic API key (WRITE TEMPLATE, gitignored)
    sidebar.html             <- ShareEx sidebar HTML (WRITE FROM SCRATCH)
    sidebar.js               <- ShareEx sidebar orchestrator (WRITE FROM SCRATCH)
    INSTALL_INSTRUCTIONS.txt <- Setup guide (WRITE FROM SCRATCH)
    dist/                    <- Build output (gitignored)
    leedz-share-ext.zip      <- Distribution zip (gitignored)
```

---

## 4. File Manifest

### 4A. Files COPIED from `client/` at build time (unchanged)

These files are used AS-IS from the main source. The build script copies them into `dist/`.

**JavaScript — pages/**
| File | Path | Purpose |
|------|------|---------|
| Share.js | `js/pages/Share.js` | The Share page (extends DataPage) |
| DataPage.js | `js/pages/DataPage.js` | Base class with 6-stage workflow |
| Page.js | `js/pages/Page.js` | Abstract base class for all pages |

**JavaScript — parser/**
| File | Path | Purpose |
|------|------|---------|
| gmail_parser.js | `js/parser/gmail_parser.js` | Gmail page parser (DOM + LLM) |
| gcal_parser.js | `js/parser/gcal_parser.js` | Google Calendar event parser (modal DOM + LLM) |
| client_parser.js | `js/parser/client_parser.js` | Fallback parser (raw page text → LLM) |
| profile_parser.js | `js/parser/profile_parser.js` | Base class for ClientParser |
| event_parser.js | `js/parser/event_parser.js` | Template method base for parsers |
| parser.js | `js/parser/parser.js` | Abstract parser base class |

**JavaScript — utils/**
| File | Path | Purpose |
|------|------|---------|
| GmailAuth.js | `js/utils/GmailAuth.js` | Direct Gmail API sending (no server needed) |
| ShareUtils.js | `js/utils/ShareUtils.js` | Email body generation, magic-link JWT |
| Page_Utils.js | `js/utils/Page_Utils.js` | sendLLMRequest, business info extraction |
| DateTimeUtils.js | `js/utils/DateTimeUtils.js` | Date/time formatting, validation, epoch |
| ValidationUtils.js | `js/utils/ValidationUtils.js` | Identity filtering, phone formatting |
| Calculator.js | `js/utils/Calculator.js` | Rate field rendering (used by Share table) |

**JavaScript — db/**
| File | Path | Purpose |
|------|------|---------|
| Client.js | `js/db/Client.js` | Client field definitions (getFieldNames) |
| Booking.js | `js/db/Booking.js` | Booking field definitions (getFieldNames) |

**JavaScript — root**
| File | Path | Purpose |
|------|------|---------|
| logging.js | `js/logging.js` | showToast, log, logError |
| state.js | `js/state.js` | StateFactory, State, mergePageData |
| provider_registry.js | `js/provider_registry.js` | loadConfig, getParsers, getDbLayer |
| content.js | `js/content.js` | Gmail compose, parser dispatch, sidebar toggle |
| background.js | `js/background.js` | LLM proxy (CORS), tab URL |

**CSS**
| File | Path | Purpose |
|------|------|---------|
| globals.css | `css/globals.css` | CSS variables, base styles |
| leedz_layout.css | `css/leedz_layout.css` | Sidebar layout, component styles |
| dropdown.css | `css/dropdown.css` | Trade selector dropdown styles |

**Icons** — entire `icons/` directory copied

**Lib** — entire `lib/` directory copied (if used)

### 4B. Files WRITTEN FROM SCRATCH in `shareex/`

These files are ShareEx-specific. They live in the `shareex/` directory and are copied into `dist/` during build, overwriting any same-named files from `client/`.

| File | Purpose | Details |
|------|---------|---------|
| `manifest.json` | Chrome extension manifest | Gmail-only, stripped permissions |
| `sharex_config.json` | Extension config | Redacted from leedz_config.json |
| `LLM_KEY.json` | User's Anthropic API key | Template with placeholder |
| `sidebar.html` | Single-page HTML | Share page only, simplified header |
| `sidebar.js` | Sidebar orchestrator | ~80 lines, replaces INVOICER's ~480-line version |
| `build.bat` | Build script | Copies from client/ + overlays shareex/ files |
| `INSTALL_INSTRUCTIONS.txt` | Setup guide | API key setup, Chrome install steps |

### 4C. Files NOT copied (dropped)

| Category | Files |
|----------|-------|
| Pages | Startup.js, Booker.js, Responder.js, Thankyou.js, Outreach.js, ClientCapture.js |
| Parsers | linkedin_parser.js, x_parser.js |
| DB | DB_local_prisma_sqlite.js (entire db/ except Client.js and Booking.js) |
| Render | PDF_render.js, handlebars, render/ directory |
| Settings | PDF_settings.js, settings/ directory |
| Config | invoicer_config.json, leedz_config.json |
| HTML | pdf_settings.html, invoice_template.html |
| CSS | pdf_settings.css, pdf_invoice.css |
| Other | TMP/, *.copy.js, *.md, *.txt |

---

## 5. Files to WRITE FROM SCRATCH — Complete Specifications

### 5A. `shareex/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "The Leedz Share",
  "version": "1.0",
  "description": "Share booking leads to The Leedz marketplace",
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArwAMK2HNcgBMCnwFjPsVm95v6qMGPK+u88xFloE3Ln1ue17Qvtc/n5TFnIaL2qLXdDos/Kpk+MNzhodel2yMRuN4oOjLXgoj27bUOIRtabN0mUkqVE+xMDtO3PV2LImb/TAhD5PgCnAOWR5hUTY0XteCz4sw+/NJWrM8Yr8Yk2/Ut0Ro+k2jBAJ00/dXePScd83k318wsWxyGywfz/EOCb0rAUuMqkvZiq1Utlj27R9e1H1c08WuhJwVmvNXx/bnBox3OGjtLNRf2ajI6bRTGqR2kVgtRV5I0xoHDyw5XCcGLP0Dgc+vbWI0S5zAK8NYlImVI/VPkPIps5TbVG8y8QIDAQAB",
  "oauth2": {
    "client_id": "1038137351261-u4crh8l3r09vhfrdrp68hmfq4ofop4ra.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.compose"
    ]
  },
  "permissions": [
    "storage",
    "tabs",
    "scripting",
    "activeTab",
    "identity",
    "identity.email"
  ],
  "host_permissions": [
    "https://mail.google.com/*",
    "https://calendar.google.com/*",
    "https://api.anthropic.com/*"
  ],
  "background": {
    "service_worker": "js/background.js"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    "default_title": "Open Leedz Share"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "content_scripts": [
    {
      "matches": ["https://mail.google.com/*", "https://calendar.google.com/*"],
      "js": ["js/content.js"],
      "css": ["css/leedz_layout.css"],
      "run_at": "document_end",
      "all_frames": false
    }
  ],
  "web_accessible_resources": [
    {
      "resources": [
        "css/*",
        "js/*",
        "lib/*",
        "leedz_config.json",
        "sidebar.html",
        "icons/*"
      ],
      "matches": ["https://mail.google.com/*", "https://calendar.google.com/*"]
    }
  ]
}
```

Key changes from INVOICER manifest:
- `content_scripts.matches`: Gmail + GCal only (not `<all_urls>`)
- Remove `calendar.events` OAuth scope (GCalParser reads DOM, not Calendar API)
- `web_accessible_resources.matches`: Gmail + GCal only
- Remove unused resources (pdf_settings.html, invoice_template.html)
- `leedz_config.json` stays as resource name (build renames sharex_config.json → leedz_config.json)
- `host_permissions`: Gmail + GCal + Anthropic only (not `<all_urls>`)

### 5B. `shareex/LLM_KEY.json`

```json
{
  "api-key": "sk-ant-PASTE-YOUR-KEY-HERE"
}
```

- The ONLY user-configurable setting in the entire extension
- User edits this ONE file during setup
- Referenced in INSTALL_INSTRUCTIONS.txt
- `.gitignored` — key never committed to repo
- At build time, `build.bat` merges this key into `dist/leedz_config.json` (see Section 12)
- No runtime merge needed — all 4 code readers get the key from the built config file

### 5C. `shareex/sharex_config.json`

This is a redacted version of `client/leedz_config.json`. Copy the full file then:
- **KEEP**: `llm` section (but set `api-key` to empty string `""`)
- **KEEP**: `aws` section
- **KEEP**: `parsers` section (change to only GmailParser)
- **KEEP**: `gmailParser` section (full system prompt for LLM parsing)
- **KEEP**: `shareEmail` section (email templates: bodyTemplateFree, bodyTemplatePaid)
- **KEEP**: `square` section
- **KEEP**: `pricing` section
- **ADD**: `thankYouNote` section (new)
- **DROP**: `ui` section
- **DROP**: `db` section
- **DROP**: `mcp` section
- **DROP**: `responderEmail` section
- **DROP**: `outreachEmail` section
- **KEEP**: `gcalParser` section (GCalParser uses this prompt)
- **REWRITE**: `clientParser` section (booking-focused fallback prompt — see Section 5C)
- **DROP**: `render` section

Structure:
```json
{
  "llm": {
    "api-key": "",
    "provider": "claude-sonnet-4-6-20250514",
    "baseUrl": "https://api.anthropic.com",
    "anthropic-version": "2023-06-01",
    "max_tokens": 1024,
    "endpoints": { "models": "/v1/models", "completions": "/v1/messages" }
  },
  "aws": {
    "apiGatewayUrl": "https://jjz8op6uy4.execute-api.us-west-2.amazonaws.com/Leedz_Stage_1"
  },
  "parsers": [
    { "name": "GmailParser", "module": "js/parser/gmail_parser.js" },
    { "name": "GCalParser", "module": "js/parser/gcal_parser.js" },
    { "name": "ClientParser", "module": "js/parser/client_parser.js" }
  ],
  "_comment_parsers": "Order matters! Gmail and GCal match first, ClientParser is catch-all fallback",
  "gmailParser": { "...COPY FULL SECTION FROM leedz_config.json..." },
  "gcalParser": { "...COPY FULL SECTION FROM leedz_config.json..." },
  "clientParser": {
    "enabled": true,
    "enableLLM": true,
    "fallbackToRawText": true,
    "maxThreadLength": 10000,
    "systemPrompt": "ROLE: You are analyzing raw page content that may contain information about a potential booking, gig, or service appointment. Extract all relevant booking information and return ONLY valid JSON.\n\nThis content may be from any source — a forwarded email, a web page, a calendar listing, a social media post. Do your best to extract a shareable booking from whatever text is available.\n\nEXTRACT THESE FIELDS:\n- name: client name (the person requesting the service)\n- email: client email\n- phone: client phone\n- company: client's organization\n- location: service address/venue (include zip code if found)\n- title: 3-6 word calendar-style event title summarizing the booking\n- description: brief summary of service/event in one coherent sentence\n- startDate: appointment date (ISO 8601 format YYYY-MM-DD)\n- startTime: start time (12-hour format with AM/PM)\n- endTime: end time (12-hour format with AM/PM)\n- duration: service duration in hours (number)\n- hourlyRate: hourly rate (number, no $ symbol)\n- flatRate: flat rate (number, no $ symbol)\n- totalAmount: total payment (number, no $ symbol)\n- notes: any additional relevant notes\n\nRULES:\n1. Return ONLY JSON, no explanations\n2. Use null for missing fields\n3. Use 12-hour time format (7:00 PM not 19:00)\n4. Extract rates from phrases like '$175/hr', '$500 total', '$200 per hour'\n5. Title should be concise calendar event name\n6. If no booking information can be reasonably extracted, return: {\"error\": \"No booking information detected\"}\n\nEXAMPLE OUTPUT:\n{\n  \"name\": \"Laura Martinez\",\n  \"email\": \"laura@company.com\",\n  \"phone\": \"(555) 123-4567\",\n  \"company\": \"Tech Solutions LLC\",\n  \"location\": \"123 Event Center, Los Angeles, CA 90028\",\n  \"title\": \"Corporate Team Building Workshop\",\n  \"description\": \"Interactive team building workshop for 50 participants\",\n  \"startDate\": \"2026-09-20\",\n  \"startTime\": \"7:00 PM\",\n  \"endTime\": \"11:00 PM\",\n  \"duration\": 4.0,\n  \"hourlyRate\": 150,\n  \"flatRate\": null,\n  \"totalAmount\": 600,\n  \"notes\": null\n}"
  },
  "shareEmail": { "...COPY FULL SECTION FROM leedz_config.json..." },
  "thankYouNote": {
    "responseExample": "Hi [Name],\n\nThank you so much for reaching out about your event. Unfortunately I'm not available on that date, but I've shared your event with my network of talented vendors. Expect to hear from someone soon who can help make your event amazing!\n\nWarm regards,\nScott"
  },
  "square": { "...COPY FROM leedz_config.json..." },
  "pricing": { "MAX_PRICE_CENTS": 10000 }
}
```

### 5D. `shareex/sidebar.js` — Radically Simplified Orchestrator

INVOICER's sidebar.js is ~480 lines of page switching, hamburger menu, dynamic imports.
ShareEx replaces it with ~80 lines:

```javascript
// shareex/sidebar.js — ShareEx Sidebar Orchestrator (Single Page)

import { StateFactory } from './state.js';
import { initLogging, log, logError } from './logging.js';

// Start logging
initLogging();

let SHAREX_CONFIG = null;
let STATE = null;
let SHARE_PAGE = null;

/**
 * Load config (build script already merged API key into leedz_config.json)
 * See Section 7B / 12: sharex_config.json renamed to leedz_config.json at build time
 */
async function loadConfig() {
  const configResponse = await fetch(chrome.runtime.getURL('leedz_config.json'));
  if (!configResponse.ok) throw new Error('Failed to load config');
  SHAREX_CONFIG = await configResponse.json();
  return SHAREX_CONFIG;
}

/**
 * Fetch JWT token for LEEDZ marketplace (moved from Startup.js)
 * Silent background fetch — non-blocking, non-critical
 */
async function fetchJWTToken(awsApiGatewayUrl) {
  try {
    const stored = await chrome.storage.local.get(['leedzJWT', 'leedzJWTExpiry']);
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (stored.leedzJWT && stored.leedzJWTExpiry > (now + sevenDays)) {
      return; // Token still valid
    }

    const userInfo = await new Promise((resolve, reject) => {
      chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(info);
      });
    });

    if (!userInfo.email || !awsApiGatewayUrl) return;

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `${awsApiGatewayUrl}/getToken?email=${encodeURIComponent(userInfo.email)}`,
      { signal: controller.signal }
    );

    const { token, expires } = await response.json();

    await chrome.storage.local.set({
      leedzJWT: token,
      leedzJWTExpiry: expires * 1000,
      leedzUserEmail: userInfo.email
    });
  } catch (error) {
    console.log('JWT token fetch failed (non-critical):', error.message);
  }
}

/**
 * Open user dashboard via magic link (logo click handler)
 */
async function openDashboard() {
  const stored = await chrome.storage.local.get(['leedzUserEmail']);
  const email = stored.leedzUserEmail;
  if (!email) return;

  const res = await fetch(
    `https://kxi7whi2p5f3nqfa4jm6lnyzoy0oisgu.lambda-url.us-west-2.on.aws/?email=${encodeURIComponent(email)}`
  );
  const data = await res.json();
  if (data.magic_url) {
    chrome.tabs.create({ url: data.magic_url });
  }
}

/**
 * Initialize ShareEx application
 */
async function initializeApp() {
  try {
    // 1. Load config + API key
    await loadConfig();

    // 2. Fetch JWT silently (background, non-blocking)
    fetchJWTToken(SHAREX_CONFIG.aws?.apiGatewayUrl);

    // 3. Initialize state
    STATE = await StateFactory.create(SHAREX_CONFIG);

    // 4. DB_LAYER is NOT available in ShareEx (no local server)
    window.DB_LAYER = null;

    // 5. Create and initialize Share page
    const { Share } = await import(chrome.runtime.getURL('js/pages/Share.js'));
    SHARE_PAGE = new Share(STATE, SHAREX_CONFIG);
    await SHARE_PAGE.initialize();

    // 6. Show the Share page
    const pageElement = document.getElementById('page-share');
    if (pageElement) pageElement.style.display = 'flex';
    SHARE_PAGE.onShow();

    // 7. Wire logo click -> dashboard
    const logo = document.getElementById('dashboardLink');
    if (logo) logo.addEventListener('click', openDashboard);

    // 8. Wire refresh button -> parser reload
    const reloadBtn = document.getElementById('reloadBtnShare');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', async () => {
        await SHARE_PAGE.cycleNextBooking();
      });
    }

    // 9. Expose updateActionButtons globally (DataPage.showPageUI calls it)
    window.updateActionButtons = (page) => {
      const shareButtons = document.getElementById('share-buttons');
      if (shareButtons) shareButtons.style.display = 'flex';
    };

    log('ShareEx loaded');

  } catch (error) {
    console.error('ShareEx initialization failed:', error);
    log('Initialization failed');
  }
}

// Start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initializeApp);
```

**CRITICAL implementation notes:**
1. `Share.js` constructor is `constructor(state)` — it calls `super('share', state)`. Page.js constructor is `constructor(pageName, state, leedzConfig = null)`. HOWEVER, the current Share.js does NOT pass leedzConfig to super. It reads config via `fetch(chrome.runtime.getURL('leedz_config.json'))` in `sendGmailMessages()`. So the constructor call is just `new Share(STATE)` — no second arg needed. But the thank-you note feature WILL need leedzConfig for the template. See Section 6 for the Share.js modification.
2. `window.DB_LAYER = null` — This is critical. DataPage.searchDB() checks `if (!window.DB_LAYER)` and returns null. ShareEx has no local DB server, so all DB lookups short-circuit cleanly.
3. `window.updateActionButtons` — DataPage.showPageUI() calls this globally. Must be defined or the Share button wrapper won't show after spinner completes.

### 5E. `shareex/sidebar.html` — Single Page, No Navigation

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Leedz Share</title>

  <link rel="stylesheet" href="css/globals.css" />
  <link rel="stylesheet" href="css/leedz_layout.css" />

  <!-- Load the ShareEx sidebar script -->
  <script type="module" src="js/sidebar.js"></script>

</head>

<body class="leedz-sidebar">

  <!-- SIMPLIFIED HEADER: Logo (clickable -> dashboard) + Refresh button -->
  <header class="leedz-header">
    <div class="logo-container" id="dashboardLink" style="cursor: pointer;" title="Open Dashboard">
      <img src="icons/logo_black.png" alt="The Leedz" class="leedz-logo"/>
    </div>
    <div class="header-buttons">
      <button id="reloadBtnShare" class="reload-button" title="Reload the parser">
        <span>
          <img src="icons/arrows_white.png" class="button-icon" alt="reload parser"/>
        </span>
      </button>
    </div>
  </header>

  <main class="leedz-form-section">

    <!-- ========================================== -->
    <!-- SHARE PAGE (Share Lead/Booking via Email)  -->
    <!-- ========================================== -->
    <div id="page-share" class="page-content">

      <div class="section-header">
        <label for="display_win_share">Share Leed</label>
      </div>

      <div id="display_win_share" class="display-win">
        <div id="loading_spinner_share" class="loading-spinner" style="display: none;">
          <img src="icons/wait_spinner.gif" alt="Loading..." />
          <span>Processing...</span>
        </div>

        <!-- Trade selector -->
        <div class="trade-selector-container" style="margin-bottom: 15px; padding: 10px; background-color: #f5f5f5; border-radius: 4px; display: flex; align-items: center; gap: 10px;">
          <div class="trade-indicator"></div>
          <label for="tradeSelect" style="font-weight: bold; white-space: nowrap;">Trade:</label>
          <select id="tradeSelect" class="trade-select" style="flex: 0 0 60%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
            <option value="">Loading trades...</option>
          </select>
        </div>

        <!-- Email Section (Collapsible) -->
        <details id="email-section-share" class="share-accordion" open>
          <summary class="accordion-header">Email</summary>
          <div class="accordion-content">
            <div class="email-header-row">
              <div class="email-select-all">
                <input type="checkbox" id="selectAllEmails" />
                <label for="selectAllEmails">Select All</label>
              </div>
              <button id="broadcastBtn" class="broadcast-btn">Broadcast</button>
            </div>
            <div id="emailList" class="email-list"></div>
            <button id="addEmailBtn" class="add-email-btn" title="Add email address">+</button>
          </div>
        </details>

        <!-- Booking Section (Collapsible) -->
        <details id="booking-section-share" class="share-accordion">
          <summary class="accordion-header">Booking</summary>
          <div class="accordion-content">
            <table id="share_booking_table" class="booking-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody id="share_booking_tbody"></tbody>
            </table>
          </div>
        </details>

        <!-- Special Information Section (Collapsible) -->
        <details id="special-info-section-share" class="share-accordion">
          <summary class="accordion-header">Special Information</summary>
          <div class="accordion-content">
            <textarea
              id="specialInfoTextarea-share"
              class="special-info-textarea"
              placeholder="Add personal notes, recollections, or special details to include in the shared email..."
            ></textarea>
          </div>
        </details>

        <!-- Price Section (Collapsible with checkbox) -->
        <div id="price-section-share" class="price-section">
          <div class="price-header">
            <input type="checkbox" id="priceCheckbox" class="price-checkbox" />
            <span class="price-label">Price</span>
            <span class="price-info-icon" title="Enable to request payment via Square">&#9432;</span>
          </div>
          <div id="priceContent" class="price-content">
            <div class="price-input-group">
              <label>USD $</label>
              <input type="text" id="priceAmount" class="price-input" placeholder="0.00" />
            </div>
            <button id="squareAuthBtn" class="square-auth-btn">
              <img src="icons/sq_logo.png" alt="Square" class="square-logo" />
              Get Paid with Square
            </button>
          </div>
        </div>

        <!-- NEW: Thank-You Note Section -->
        <div id="thankyou-note-section" class="thankyou-note-section" style="margin-top: 10px; padding: 10px; background-color: #f5f5f5; border-radius: 4px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="thankYouCheckbox" />
            <span style="font-weight: bold;">Send Thank-You Note</span>
            <span style="font-size: 0.85em; color: #666;">(polite decline to client)</span>
          </label>
        </div>

      </div>

    </div><!-- END page-share -->

  </main>

  <!-- SHARE BUTTONS - Fixed position outside scrolling area -->
  <div class="button-wrapper" id="share-buttons" style="display: none;">
    <button id="shareBtn" class="sidebar-button" title="Share lead via email">
      Share
    </button>
  </div>

  <footer class="leedz-footer" id="footer">
    <img src="icons/grass.png" alt="grass" class="leedz-grass"/>
  </footer>

</body>
</html>
```

**Key differences from INVOICER sidebar.html:**
- No hamburger menu
- No app-label
- Logo is clickable (id="dashboardLink") for dashboard
- Reload button in header (not inside section-header)
- Only the Share page section (no other page sections)
- NEW: Thank-You Note checkbox section between Price and Share button
- No startup page, no booker page, no thankyou page, etc.
- Settings button removed (no settings to configure)

### 5F. `shareex/build.bat`

```batch
@echo off
setlocal EnableDelayedExpansion

:: ==========================================
:: SHAREX BUILD SCRIPT
:: ==========================================
:: Context: /INVOICER/shareex/
:: Source:  /INVOICER/client/
:: Output:  /INVOICER/shareex/dist/

set "CLIENT_DIR=..\client"
set "DIST_DIR=dist"
set "ZIP_NAME=leedz-share-ext.zip"

echo.
echo ==========================================
echo   SHAREX BUILD PROCESS
echo ==========================================

:: 1. CLEANUP
echo [1/7] Cleaning previous build...
if exist "%DIST_DIR%" (
    rd /s /q "%DIST_DIR%"
)
mkdir "%DIST_DIR%"

:: 2. COPY CSS (from client)
echo [2/7] Copying CSS...
mkdir "%DIST_DIR%\css"
copy /Y "%CLIENT_DIR%\css\globals.css" "%DIST_DIR%\css\" >nul
copy /Y "%CLIENT_DIR%\css\leedz_layout.css" "%DIST_DIR%\css\" >nul
copy /Y "%CLIENT_DIR%\css\dropdown.css" "%DIST_DIR%\css\" >nul

:: 3. COPY ICONS (from client)
echo [3/7] Copying icons...
if exist "%CLIENT_DIR%\icons" (
    mkdir "%DIST_DIR%\icons"
    robocopy "%CLIENT_DIR%\icons" "%DIST_DIR%\icons" /E /NFL /NDL /NJH /NJS
)

:: 4. COPY LIB (from client)
if exist "%CLIENT_DIR%\lib" (
    mkdir "%DIST_DIR%\lib"
    robocopy "%CLIENT_DIR%\lib" "%DIST_DIR%\lib" /E /NFL /NDL /NJH /NJS
)

:: 5. COPY JAVASCRIPT (selective from client)
echo [4/7] Copying JavaScript...
mkdir "%DIST_DIR%\js"
mkdir "%DIST_DIR%\js\pages"
mkdir "%DIST_DIR%\js\parser"
mkdir "%DIST_DIR%\js\utils"
mkdir "%DIST_DIR%\js\db"

:: Pages (only 3)
copy /Y "%CLIENT_DIR%\js\pages\Share.js" "%DIST_DIR%\js\pages\" >nul
copy /Y "%CLIENT_DIR%\js\pages\DataPage.js" "%DIST_DIR%\js\pages\" >nul
copy /Y "%CLIENT_DIR%\js\pages\Page.js" "%DIST_DIR%\js\pages\" >nul

:: Parsers (5 — gmail, gcal, client fallback, + base classes)
copy /Y "%CLIENT_DIR%\js\parser\gmail_parser.js" "%DIST_DIR%\js\parser\" >nul
copy /Y "%CLIENT_DIR%\js\parser\gcal_parser.js" "%DIST_DIR%\js\parser\" >nul
copy /Y "%CLIENT_DIR%\js\parser\client_parser.js" "%DIST_DIR%\js\parser\" >nul
copy /Y "%CLIENT_DIR%\js\parser\profile_parser.js" "%DIST_DIR%\js\parser\" >nul
copy /Y "%CLIENT_DIR%\js\parser\event_parser.js" "%DIST_DIR%\js\parser\" >nul
copy /Y "%CLIENT_DIR%\js\parser\parser.js" "%DIST_DIR%\js\parser\" >nul

:: Utils (all)
copy /Y "%CLIENT_DIR%\js\utils\*.js" "%DIST_DIR%\js\utils\" >nul

:: DB models (only Client + Booking)
copy /Y "%CLIENT_DIR%\js\db\Client.js" "%DIST_DIR%\js\db\" >nul
copy /Y "%CLIENT_DIR%\js\db\Booking.js" "%DIST_DIR%\js\db\" >nul

:: Root JS files
copy /Y "%CLIENT_DIR%\js\logging.js" "%DIST_DIR%\js\" >nul
copy /Y "%CLIENT_DIR%\js\state.js" "%DIST_DIR%\js\" >nul
copy /Y "%CLIENT_DIR%\js\provider_registry.js" "%DIST_DIR%\js\" >nul
copy /Y "%CLIENT_DIR%\js\content.js" "%DIST_DIR%\js\" >nul
copy /Y "%CLIENT_DIR%\js\background.js" "%DIST_DIR%\js\" >nul

:: 6. COPY SHAREX-SPECIFIC FILES (override from shareex/)
echo [5/7] Copying ShareEx files...

:: Copy sharex_config.json AS leedz_config.json (all 4 code readers expect this name)
copy /Y "sharex_config.json" "%DIST_DIR%\leedz_config.json" >nul

:: Merge LLM_KEY.json into leedz_config.json at build time
:: This is the ONLY user-configurable setting — their Anthropic LLM key
if exist "LLM_KEY.json" (
    powershell -command "$config = Get-Content '%DIST_DIR%\leedz_config.json' -Raw | ConvertFrom-Json; $key = Get-Content 'LLM_KEY.json' -Raw | ConvertFrom-Json; $config.llm.'api-key' = $key.'api-key'; $config | ConvertTo-Json -Depth 10 | Set-Content '%DIST_DIR%\leedz_config.json'"
    echo     - API key merged into config
) else (
    echo [WARNING] LLM_KEY.json not found - LLM features will not work
)

copy /Y "manifest.json" "%DIST_DIR%\" >nul
copy /Y "sidebar.html" "%DIST_DIR%\" >nul
copy /Y "sidebar.js" "%DIST_DIR%\js\" >nul
copy /Y "INSTALL_INSTRUCTIONS.txt" "%DIST_DIR%\" >nul

:: 7. VALIDATE
echo [6/7] Validating build...
if not exist "%DIST_DIR%\manifest.json" (
    echo [ERROR] manifest.json missing from build!
    goto :ERROR
)

powershell -command "$m = Get-Content '%DIST_DIR%\manifest.json' -Raw | ConvertFrom-Json; if (-not $m.version -or -not $m.name) { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] manifest.json is invalid or missing required fields!
    goto :ERROR
)
echo     - Manifest validated.
echo     - Build directory ready at: shareex\%DIST_DIR%

:: 8. PACKAGE
echo [7/7] Creating distribution ZIP...
if exist "%ZIP_NAME%" del "%ZIP_NAME%"
powershell -command "Compress-Archive -Path '%DIST_DIR%\*' -DestinationPath '%ZIP_NAME%' -Force"

if exist "%ZIP_NAME%" (
    echo     - ZIP created: %ZIP_NAME%
) else (
    echo [ERROR] ZIP creation failed.
    goto :ERROR
)

echo.
echo ==========================================
echo   BUILD SUCCESSFUL
echo ==========================================
echo   Unpacked: %CD%\%DIST_DIR%
echo   ZIP:      %CD%\%ZIP_NAME%
echo.
echo   NEXT: Share %ZIP_NAME% with users
echo ==========================================

goto :EOF

:ERROR
echo.
echo   BUILD FAILED
pause
exit /b 1
```

### 5G. `shareex/INSTALL_INSTRUCTIONS.txt`

```
LEEDZ SHARE EXTENSION - INSTALLATION GUIDE
============================================

1. UNZIP this file to a folder on your computer

2. SET YOUR API KEY:
   - Open the file LLM_KEY.json in a text editor
   - Replace "sk-ant-PASTE-YOUR-KEY-HERE" with your Anthropic API key
   - Save the file
   - Your key is available at: https://console.anthropic.com/settings/keys

3. INSTALL IN CHROME:
   - Open Chrome and go to: chrome://extensions/
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the folder you unzipped in Step 1
   - The Leedz Share icon will appear in your toolbar

4. USAGE:
   - Open a Gmail email containing event/booking information
   - Click the Leedz Share icon in your Chrome toolbar
   - The sidebar will parse the email and extract booking details
   - Select recipients, choose a trade, and click Share
   - The lead will be shared to The Leedz marketplace

5. DASHBOARD:
   - Click the Leedz logo in the sidebar header to open your dashboard

NOTES:
- This extension only works on Gmail (mail.google.com)
- You need a Gmail account signed into Chrome
- Your API key is stored locally and never transmitted except to Anthropic
```

---

## 6. Share.js Modification — Thank-You Note Feature

Share.js needs a small modification to support the Thank-You Note checkbox. The existing `onShare()` method needs to be extended to trigger thank-you note generation after a successful share.

### 6A. What to add to Share.js

**In constructor** — add new property:
```javascript
this.thankYouEnabled = false;
```

**In initialize()** — wire up Thank-You checkbox:
```javascript
// Wire up Thank-You Note checkbox
const thankYouCheckbox = document.getElementById('thankYouCheckbox');
if (thankYouCheckbox) {
  thankYouCheckbox.addEventListener('change', (e) => {
    this.thankYouEnabled = e.target.checked;
  });
}
```

**In onShare()** — after successful share, trigger thank-you:
After the line `showToast('Success! Leed Shared.', 'success');` (line ~1135), add:
```javascript
// If Thank-You Note is enabled, generate and open compose
if (this.thankYouEnabled) {
  await this.sendThankYouNote();
}
```

**New method** — `sendThankYouNote()`:
```javascript
/**
 * Generate and send thank-you note to client after sharing
 * Follows Responder.js pattern: template in config, LLM generates text
 */
async function sendThankYouNote() {
  try {
    if (!this.state.Client.name || !this.state.Client.email) {
      console.log('Thank-you note skipped: no client name or email');
      return;
    }

    const prompt = this.buildThankYouPrompt();
    const thankYouText = await PageUtils.sendLLMRequest(prompt);

    if (!thankYouText) {
      showToast('Failed to generate thank-you note', 'error');
      return;
    }

    // Send to content script to open Gmail compose (reply mode)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'openThankYou',
          clientEmail: this.state.Client.email,
          clientName: this.state.Client.name,
          subject: `Re: ${this.state.Booking.title || 'Your Inquiry'}`,
          body: thankYouText
        }, (response) => {
          if (chrome.runtime.lastError) {
            showToast('Failed to open compose window', 'error');
          } else {
            // Close sidebar to make room for compose
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleSidebar' });
          }
        });
      }
    });

  } catch (error) {
    logError('Thank-you note failed:', error);
    showToast('Error generating thank-you note', 'error');
  }
}
```

**New method** — `buildThankYouPrompt()`:
```javascript
/**
 * Build LLM prompt for thank-you note generation
 * Follows Responder.js pattern: uses config template
 */
buildThankYouPrompt() {
  const clientFirstName = this.state.Client.name?.split(' ')[0] || 'Client';
  const bookingTitle = this.state.Booking.title || 'your event';
  const bookingDate = this.state.Booking.startDate || '';
  const location = this.state.Booking.location || '';
  const specialInfo = this.specialInfo || '';

  // Get template from config (Responder.js pattern)
  const responseExample = this.leedzConfig?.thankYouNote?.responseExample || '';

  return `Generate a polite, professional decline email to a client whose booking you are passing along to your network.

CLIENT: ${clientFirstName}
EVENT: ${bookingTitle} on ${bookingDate}
LOCATION: ${location}
${specialInfo ? `SPECIAL NOTES: ${specialInfo}` : ''}

KEY MESSAGE:
- You cannot take this gig personally
- You have shared it with your trusted network of vendors
- They should expect to hear from someone soon
- Express gratitude for being considered

EXAMPLE (match this tone and length):
${responseExample}

Write the email body only (no subject line). Keep it concise (3-5 sentences). Return plain text.`;
}
```

### 6B. Import to add in Share.js

At the top of Share.js, the `PageUtils` import needs to be added:
```javascript
import { PageUtils } from '../utils/Page_Utils.js';
```
(Check if it's already imported — it may not be since Share.js currently uses `PageUtils` indirectly through `generateShareEmailBody`)

### 6C. leedzConfig access in Share.js

Current Share.js constructor: `constructor(state)` — does NOT accept leedzConfig.
Current Share.js super call: `super('share', state)` — does NOT pass leedzConfig.

For the thank-you template (`this.leedzConfig?.thankYouNote?.responseExample`), Share.js needs access to leedzConfig.

**Option A (recommended)**: Modify Share.js constructor to accept and pass leedzConfig:
```javascript
constructor(state, leedzConfig = null) {
  super('share', state, leedzConfig);
  // ... rest unchanged
}
```
This change is backward-compatible — INVOICER's sidebar.js already passes `LEEDZ_CONFIG` as the second arg to page constructors:
```javascript
PAGES[pageConfig.id] = new PageClass(STATE, LEEDZ_CONFIG);
```

---

## 7. Dependency Chain — How Data Flows

### 7A. Config Loading (two independent readers)

**Reader 1: GmailParser** (`gmail_parser.js:_initializeConfig`)
```javascript
async _initializeConfig() {
  if (CONFIG) return;
  const configResponse = await fetch(chrome.runtime.getURL('leedz_config.json'));
  CONFIG = await configResponse.json();
}
```
- Reads `CONFIG.llm` for LLM API calls
- Reads `CONFIG.gmailParser` for system prompt
- **ShareEx issue**: This hardcodes `'leedz_config.json'`. Solved by build-time rename (sharex_config.json → leedz_config.json). No code change needed.

**Reader 2: PageUtils** (`Page_Utils.js:sendLLMRequest`)
```javascript
static async sendLLMRequest(prompt) {
  const configResponse = await fetch(chrome.runtime.getURL('leedz_config.json'));
  const config = await configResponse.json();
  // Uses config.llm for API call
}
```
- Also hardcodes `'leedz_config.json'`. Solved by build-time rename (sharex_config.json → leedz_config.json). No code change needed.

**Reader 3: provider_registry.js** (`loadConfig`)
```javascript
export async function loadConfig() {
  const res = await fetch(chrome.runtime.getURL('leedz_config.json'));
  return await res.json();
}
```
- Used by `getParsers()` to load parser list from config
- Also hardcodes `'leedz_config.json'`. Solved by build-time rename (sharex_config.json → leedz_config.json). No code change needed.

**Reader 4: Share.js** (`sendGmailMessages`)
```javascript
const response = await fetch(chrome.runtime.getURL('leedz_config.json'));
const fullConfig = await response.json();
```
- Reads `shareEmail` templates for email body generation
- Also hardcodes `'leedz_config.json'`. Solved by build-time rename (sharex_config.json → leedz_config.json). No code change needed.

### 7B. Config File Name — CRITICAL DECISION

Four files hardcode `'leedz_config.json'`:
1. `gmail_parser.js:_initializeConfig()` — line 31
2. `Page_Utils.js:sendLLMRequest()` — line 20
3. `provider_registry.js:loadConfig()` — line 35
4. `Share.js:sendGmailMessages()` — line 1012

**Two approaches:**

**Approach A: Rename in shared source** — Change all 4 files to read a configurable filename. Add a global or use `chrome.runtime.getURL()` with a variable. This touches shared files and must work for both INVOICER and ShareEx.

**Approach B: Bundle sharex_config.json AS leedz_config.json** — The build script copies `sharex_config.json` into `dist/` as `leedz_config.json`. No code changes needed. All 4 readers find `leedz_config.json` as expected. The LLM_KEY.json merge still happens in sidebar.js, which patches the in-memory config, but the file-based readers also need the key.

**RECOMMENDED: Approach B** — Zero code changes to shared files. The build script handles the rename:
```batch
:: Copy ShareEx config AS leedz_config.json (all readers expect this name)
copy /Y "sharex_config.json" "%DIST_DIR%\leedz_config.json" >nul
```

**LLM_KEY.json merge problem with Approach B**: The 4 independent readers all fetch `leedz_config.json` independently, and none of them know about `LLM_KEY.json`. Sidebar.js merges the key into in-memory config, but that doesn't help the file readers.

**Solution**: The build script merges LLM_KEY.json into leedz_config.json at build time:
```batch
:: Merge API key into config at build time
powershell -command "$config = Get-Content '%DIST_DIR%\leedz_config.json' -Raw | ConvertFrom-Json; $key = Get-Content 'LLM_KEY.json' -Raw | ConvertFrom-Json; $config.llm.'api-key' = $key.'api-key'; $config | ConvertTo-Json -Depth 10 | Set-Content '%DIST_DIR%\leedz_config.json'"
```

This means the final `dist/leedz_config.json` has the API key baked in. Clean, simple, no code changes.

**Updated sidebar.js**: Can be simplified further — no need to merge LLM_KEY.json at runtime since it's already baked into the config. But sidebar.js should still load the config for StateFactory:
```javascript
async function loadConfig() {
  const configResponse = await fetch(chrome.runtime.getURL('leedz_config.json'));
  if (!configResponse.ok) throw new Error('Failed to load config');
  SHAREX_CONFIG = await configResponse.json();
  return SHAREX_CONFIG;
}
```

### 7C. State Management

**StateFactory.create(leedzConfig)**:
1. Creates new State instance
2. Calls `state.load()` — loads from `chrome.storage.local` key `'currentBookingState'`
3. If `leedzConfig.square` exists, sets `state.Square`
4. If `leedzConfig.aws` exists, sets `state.Config.aws.apiGatewayUrl` — **CRITICAL for Share to call addLeed**

**State object structure**:
```
state.Client    → { name, email, phone, company, website, clientNotes }
state.Booking   → { title, location, description, startDate, startTime, endTime, duration, hourlyRate, flatRate, totalAmount, notes }
state.Config    → { aws: { apiGatewayUrl }, friends, companyName, ... }
state.Square    → { url, appId }
```

**state.loadConfigFromDB()** — Called by Share.js render hooks. Tries to load Config from DB layer. With `window.DB_LAYER = null`, it will print `"No DB Layer configured"` and return cleanly. Not a problem.

### 7D. Parser Chain

**Scrolling mechanism** (already built):
1. `Page.js:reloadParser()` calls `getParsers()` from `provider_registry.js`
2. `getParsers()` reads `config.parsers` array in order, dynamically imports each module
3. Loop: for each parser, call `checkPageMatch(url)` — **first match wins**
4. Comment in leedz_config.json line 78: `"Order matters! Specific parsers must come before fallback"`

**3 parsers in order:**

| # | Parser | `checkPageMatch(url)` | Input | Inheritance |
|---|--------|----------------------|-------|-------------|
| 1 | GmailParser | `url.includes('mail.google.com')` | DOM: `.gD[email]` sender, `.hB[email]` recipients, thread text | `GmailParser → EventParser → Parser` |
| 2 | GCalParser | `url.includes('calendar.google.com')` | DOM: `[role="dialog"]` modal — `#rAECCd` title, `.AzuXid` datetime, `#xDetDlgLoc` location, `#xDetDlgDesc` description | `GCalParser → EventParser → Parser` |
| 3 | ClientParser | everything else (excludes gmail + gcal) | `document.querySelector('main')` or `document.body` → raw `.textContent` truncated to 10k chars | `ClientParser → ProfileParser → Parser` |

EventParser template: `parse()` → `extractClientData` → `extractBookingData` → `_getContentForLLM` → `_sendToLLM` → `_conservativeUpdate`

ClientParser does NOT use EventParser template — has its own `parse()` that calls `_getContentForLLM()` → `_sendToLLM()` directly.

**GCalParser bug (must fix):** Line 23 reads `'invoicer_config.json'` — should be `'leedz_config.json'`. This is a bug in the shared source that affects both INVOICER and ShareEx. Fix in `client/js/parser/gcal_parser.js`, merges back to main.

### 7E. Gmail Compose (Thank-You Note)

1. Share.js calls `chrome.tabs.sendMessage(tabId, { action: 'openThankYou', ... })`
2. content.js receives message, calls `handleGmailComposeAction()` → `openGmailCompose()`
3. `openGmailCompose({ mode: 'reply', subject, body })`:
   - Clicks Gmail's Reply button (`[aria-label="Reply"]`)
   - Waits 500ms for compose window
   - Populates subject field (`input[name="subjectbox"]`)
   - Populates body field (`div[aria-label="Message Body"][contenteditable="true"]`)
   - Dispatches input/change events

### 7F. Gmail Sending (Share emails)

1. Share.js:onShare() builds `shareList` and calls `sendGmailMessages()`
2. `sendGmailMessages()` reads `shareEmail` templates from config
3. For each recipient, generates email body via `generateShareEmailBody()` (ShareUtils.js)
4. Calls `sendGmailMessage()` (GmailAuth.js) — direct Gmail REST API
5. `sendGmailMessage()` uses `chrome.identity.getAuthToken()` for OAuth — no server needed

### 7G. JWT Token Flow

1. sidebar.js calls `fetchJWTToken(awsApiGatewayUrl)` on startup
2. Gets user email via `chrome.identity.getProfileUserInfo()`
3. Calls `${awsApiGatewayUrl}/getToken?email=...`
4. Stores `leedzJWT`, `leedzJWTExpiry`, `leedzUserEmail` in `chrome.storage.local`
5. Share.js:getJWTToken() reads from `chrome.storage.local`
6. JWT used for: `addLeed` API, `getUser` API (friends list, Square auth status)

---

## 8. Share Protocol (sh parameter) — Unchanged

| sh value | Meaning |
|---|---|
| `#email1,email2` | Private share, Gmail already sent |
| `#*` | Broadcast only, no private emails |
| `#*,email1,email2` | Broadcast + private (already sent) |

- `#` prefix = client already sent private emails via Gmail, server skips SES
- `*` = broadcast to subscribed platform users

---

## 9. ShareUtils.js Constants

These are hardcoded in ShareUtils.js and must NOT be changed:
```javascript
const JWT_SECRET = '648373eeea08d422032db0d1e61a1bc096fe08dd2729ce611092c7a1af15d09c';
const LOGIN_URL_BASE = 'https://jjz8op6uy4.execute-api.us-west-2.amazonaws.com/Leedz_Stage_1/login';
const SHOW_LEED_URL = '/Leedz_Stage_1/showLeedPage';
const MAGIC_LINK_EXPIRY_SECONDS = 15 * 60; // 15 minutes
```

---

## 10. Client/Booking Field Definitions

**Client.getFieldNames()** returns:
`['name', 'email', 'phone', 'company', 'website', 'clientNotes']`

**Booking.getFieldNames()** returns:
`['title', 'location', 'description', 'startDate', 'startTime', 'endTime', 'duration', 'hourlyRate', 'flatRate', 'totalAmount', 'notes']`

Share.js `skipFields` for booking table:
`['id', 'clientId', 'createdAt', 'updatedAt', 'duration', 'hourlyRate', 'flatRate', 'totalAmount', 'endDate', 'company', 'website', 'clientNotes']`

---

## 11. AWS API Dependencies (all required, no changes)

| API | Purpose | Auth |
|-----|---------|------|
| `getTrades` | Load trade list for dropdown | None |
| `getUser?session=JWT` | Load friends list, Square status | JWT |
| `getToken?email=` | JWT authentication | None |
| `addLeed?...` | Create leed record | JWT |
| Magic-link Lambda | Dashboard access (logo click) | Email |

---

## 12. Updated Build Script (with API key merge)

Replace the `COPY SHAREX-SPECIFIC FILES` section in `build.bat` with:

```batch
:: 6. COPY SHAREX-SPECIFIC FILES
echo [5/7] Copying ShareEx files...

:: Copy sharex_config.json AS leedz_config.json (all readers expect this name)
copy /Y "sharex_config.json" "%DIST_DIR%\leedz_config.json" >nul

:: Merge LLM_KEY.json into leedz_config.json at build time
if exist "LLM_KEY.json" (
    powershell -command "$config = Get-Content '%DIST_DIR%\leedz_config.json' -Raw | ConvertFrom-Json; $key = Get-Content 'LLM_KEY.json' -Raw | ConvertFrom-Json; $config.llm.'api-key' = $key.'api-key'; $config | ConvertTo-Json -Depth 10 | Set-Content '%DIST_DIR%\leedz_config.json'"
    echo     - API key merged into config
) else (
    echo [WARNING] LLM_KEY.json not found - LLM features will not work
)

copy /Y "manifest.json" "%DIST_DIR%\" >nul
copy /Y "sidebar.html" "%DIST_DIR%\" >nul
copy /Y "sidebar.js" "%DIST_DIR%\js\" >nul
copy /Y "INSTALL_INSTRUCTIONS.txt" "%DIST_DIR%\" >nul
```

This approach means:
- `sharex_config.json` is the source config (in shareex/)
- `LLM_KEY.json` is the user's key (in shareex/, gitignored)
- Build merges them into `dist/leedz_config.json`
- All 4 code readers find `leedz_config.json` unchanged — ZERO shared code changes
- No runtime merge needed — sidebar.js simplified

---

## 13. Square Auth — Works Without leedz_server

Square authorization is 100% remote AWS. No local leedz_server involvement.

**Flow:**
1. **Initial check** (`Share.js:loadFriendsAsync()` line 264-268): Calls API Gateway `getUser?session=JWT` → reads `user.sq_st` from DynamoDB → updates button state
2. **User clicks "Get Paid with Square"** (`handleSquareAuth()` line 850-877): Opens `editUserPage` on API Gateway in new tab — user completes Square OAuth flow there
3. **Re-check** (`recheckSquareAuth()` line 883-908): Calls API Gateway `getUser` again → reads updated `sq_st` → updates button state
4. **At share time**: `addLeed` on API Gateway runs `checkSellerAuth()` server-side

All 4 steps hit API Gateway → Lambda → DynamoDB. Works identically in ShareEx.

---

## 14. Open Questions

1. **Thank-you note: auto-fire or user review?** Current design opens compose window for user review before sending. This matches Responder.js / Thankyou.js behavior. User reviews text, edits if needed, clicks Send manually.

2. **Chrome Web Store or sideloaded?** Currently designed for sideload via zip. Chrome Web Store listing would require separate extension ID and review process.

3. **Share.js clear() after thank-you?** Current flow: Share clears form BEFORE thank-you note runs. This means `this.state.Client.name/email` are cleared before `sendThankYouNote()` reads them. Fix: Move `this.clear()` to AFTER the thank-you note, or capture client data before clear.

---

## 15. Implementation Checklist

For a fresh Claude session implementing this:

1. **Create directory**: `INVOICER/shareex/`
2. **Fix GCalParser bug**: In `client/js/parser/gcal_parser.js` line 23, change `'invoicer_config.json'` to `'leedz_config.json'`. This fix benefits both INVOICER and ShareEx.
3. **Write files from Section 5**: manifest.json, sharex_config.json, LLM_KEY.json, sidebar.html, sidebar.js, build.bat, INSTALL_INSTRUCTIONS.txt
4. **Copy sharex_config.json content from leedz_config.json**: Keep gmailParser, gcalParser sections. Rewrite clientParser prompt for booking extraction (see Section 5C). Add thankYouNote section. Drop ui, db, mcp, responderEmail, outreachEmail, render.
5. **Modify Share.js** (Section 6): Add thankYouEnabled property, checkbox handler, sendThankYouNote(), buildThankYouPrompt(), constructor change for leedzConfig
6. **Fix clear() ordering** (Section 13 Q3): Capture client data before clear, or move clear after thank-you
7. **Add to .gitignore**: `shareex/LLM_KEY.json`, `shareex/dist/`, `shareex/*.zip`
8. **Test build**: Run `shareex/build.bat`, load `shareex/dist/` as unpacked extension
9. **Test on Gmail**: Open email, click extension icon, verify parse → share → thank-you flow
10. **Test on GCal**: Open calendar event popup, click extension icon, verify parse → share flow
11. **Test fallback**: Open any other page, click extension icon, verify raw text extraction → share flow
