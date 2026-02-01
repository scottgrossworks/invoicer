// content.js
//
// toggle the sidebar panel

let ACTIVE = false;





//
// 
//
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {


  if (message.action === "toggleSidebar") {
    toggleSidebar();
  } else {

    // console.log("[LeedzEx] content.js > [" + message.type + "] " + message.body);
  }
});






// Load config once at startup
let LEEDZ_CONFIG = null;

async function loadConfig() {
  if (LEEDZ_CONFIG) return LEEDZ_CONFIG;

  try {
    const configUrl = chrome.runtime.getURL('leedz_config.json');
    const response = await fetch(configUrl);
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.status}`);
    }
    LEEDZ_CONFIG = await response.json();
    console.log('Content script loaded config with', LEEDZ_CONFIG.parsers?.length || 0, 'parsers');
    return LEEDZ_CONFIG;
  } catch (error) {
    console.error('Failed to load leedz_config.json:', error);
    throw error;
  }
}

// Dynamically load parser based on config
async function loadParser(parserName) {
  const config = await loadConfig();

  // Find parser config by name
  const parserConfig = config.parsers?.find(p => p.name === parserName);

  if (!parserConfig) {
    throw new Error(`Parser "${parserName}" not found in config. Available parsers: ${config.parsers?.map(p => p.name).join(', ')}`);
  }

  // Dynamic import using module path from config
  const module = await import(chrome.runtime.getURL(parserConfig.module));

  // Get the default export (parser class)
  const ParserClass = module.default;

  if (!ParserClass) {
    throw new Error(`Parser class not found in ${parserConfig.module}`);
  }

  // Instantiate and return
  return new ParserClass();
}

// Find matching parser for current page URL
async function getMatchingParser() {
  const config = await loadConfig();
  const currentUrl = window.location.href;

  // Try each parser's checkPageMatch() method
  for (const parserConfig of config.parsers || []) {
    const parser = await loadParser(parserConfig.name);
    const matches = await parser.checkPageMatch(currentUrl);
    if (matches) {
      return parser;
    }
  }

  throw new Error('No matching parser found for current page');
}

/**
 * Unified Gmail compose window handler
 * @param {Object} options
 * @param {string} options.mode - 'reply' or 'compose'
 * @param {string} options.to - Recipient email (for compose mode)
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Email body
 * @param {string} options.actionName - For logging (e.g. 'THANK YOU', 'RESPONDER')
 */
async function openGmailCompose({ mode, to, subject, body, actionName }) {
  console.log(`=== CONTENT SCRIPT: OPEN ${actionName} ===`);
  // console.log('Received:', {
  //   mode,
  //   to,
  //   subject,
  //   hasBody: !!body,
  //   bodyLength: body ? body.length : 0,
  //   bodyPreview: body ? body.substring(0, 200) + '...' : 'null'
  // });

  // STEP 1: Open compose window
  if (mode === 'reply') {
    const replyButton = document.querySelector('[aria-label="Reply"]');
    if (!replyButton) {
      throw new Error('Reply button not found');
    }
    replyButton.click();
    await new Promise(resolve => setTimeout(resolve, 500));
  } else if (mode === 'compose') {
    const composeButton = document.querySelector('[aria-label="Compose"]') ||
                         Array.from(document.querySelectorAll('[role="button"]')).find(btn => btn.textContent.includes('Compose')) ||
                         document.querySelector('.T-I.T-I-KE.L3');
    if (!composeButton) {
      throw new Error('Compose button not found');
    }
    composeButton.click();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Populate TO field
    if (to) {
      const toField = document.querySelector('input[name="to"]') ||
                     document.querySelector('textarea[name="to"]');
      if (toField) {
        toField.value = to;
        toField.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  // STEP 2: Populate subject field
  const subjectField = document.querySelector('input[name="subjectbox"]');
  if (subjectField && !subjectField.value.startsWith('Re:')) {
    subjectField.value = subject || '';
    subjectField.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // STEP 3: Populate body field
  const selectors = [
    'div[aria-label="Message Body"][contenteditable="true"]',
    'div[role="textbox"][aria-label="Message Body"]',
    'div[contenteditable="true"][aria-label="Message Body"]',
    'div.Am[contenteditable="true"]',
    'div[g_editable="true"]'
  ];

  let bodyField = null;
  for (const selector of selectors) {
    bodyField = document.querySelector(selector);
    if (bodyField) break;
  }

  if (!bodyField) {
    console.error('Message body field not found with any selector');
    // console.log('Available contenteditable elements:',
    //   Array.from(document.querySelectorAll('[contenteditable="true"]')).map(el => ({
    //     tag: el.tagName,
    //     class: el.className,
    //     ariaLabel: el.getAttribute('aria-label'),
    //     role: el.getAttribute('role')
    //   })));
    throw new Error('Message body field not found');
  }

  // Insert body content
  if (bodyField.tagName === 'DIV' && bodyField.contentEditable === 'true') {
    const htmlBody = (body || '').replace(/\n/g, '<br>');
    bodyField.innerHTML = htmlBody;
  } else if (bodyField.tagName === 'TEXTAREA') {
    bodyField.value = body || '';
  } else {
    bodyField.innerHTML = body || '';
  }

  // Dispatch events
  bodyField.dispatchEvent(new Event('input', { bubbles: true }));
  bodyField.dispatchEvent(new Event('change', { bubbles: true }));
  bodyField.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));

  // Focus cursor
  bodyField.focus();
}

/**
 * Helper to handle Gmail compose actions consistently
 */
function handleGmailComposeAction(msg, reply, composeOptions) {
  (async () => {
    try {
      await openGmailCompose(composeOptions);
      reply({ ok: true });
    } catch (error) {
      console.error(`Error opening ${composeOptions.actionName} compose:`, error);
      reply({ ok: false, error: error.message });
    }
  })();
  return true; // keep port open for async reply
}

// respond to sidebar requests
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  // Open thank you compose window in Gmail
  if (msg.action === 'openThankYou') {
    return handleGmailComposeAction(msg, reply, {
      mode: 'reply',
      subject: msg.subject || 'Thank you',
      body: msg.body,
      actionName: 'THANK YOU'
    });
  }

  // Open responder compose window in Gmail
  if (msg.action === 'openResponder') {
    return handleGmailComposeAction(msg, reply, {
      mode: 'reply',
      subject: msg.subject || 'Re: Your Inquiry',
      body: msg.body,
      actionName: 'RESPONDER'
    });
  }

  // Open outreach compose window in Gmail (NEW email, not reply)
  if (msg.action === 'openOutreach') {
    return handleGmailComposeAction(msg, reply, {
      mode: 'compose',
      to: msg.clientEmail,
      subject: msg.subject || `Services for ${msg.clientName}`,
      body: msg.body,
      actionName: 'OUTREACH'
    });
  }

  // Quick identity extraction only (name/email for DB lookup)
  // NOTE: This is optional - not all parsers implement quickExtractIdentity()
  if (msg.type === 'leedz_extract_identity') {
    (async () => {
      try {
        // Get matching parser for current page
        const parser = await getMatchingParser();

        // Check if parser has quickExtractIdentity method
        if (typeof parser.quickExtractIdentity !== 'function') {
          console.log('Parser does not support quickExtractIdentity - returning null');
          reply({
            ok: true,
            identity: { email: null, name: null }
          });
          return;
        }

        // Call quickExtractIdentity() to get just name/email
        const identity = await parser.quickExtractIdentity();

        reply({
          ok: true,
          identity: identity || { email: null, name: null }
        });
      } catch (e) {
        console.log('Content script identity extraction error:', e.message);
        reply({ ok: false, error: e.message });
      }
    })();

    return true; // keep port open for async reply
  }

  // Extract client data only (for ClientCapture page)
  if (msg.type === 'leedz_extract_client') {
    (async () => {
      try {
        // Get matching parser for current page
        const parser = await getMatchingParser();

        // Reconstruct State instance
        const { StateFactory } = await import(chrome.runtime.getURL('js/state.js'));
        const stateInstance = await StateFactory.create_blank();
        stateInstance.fromObject(msg.state);

        // Initialize and run parser (includes LLM extraction)
        await parser.initialize(stateInstance);
        await parser.parse(stateInstance); // Full parse (procedural + LLM)

        // Return state with Clients array populated
        reply({
          ok: true,
          data: stateInstance.toObject()
        });
      } catch (e) {
        console.error('Content script client extraction error:', e);
        reply({ ok: false, error: e.message });
      }
    })();

    return true; // keep port open for async reply
  }

  // Full parse with both client and booking data (for Booker page)
  if (msg.type === 'leedz_parse_page') {
    (async () => {
      try {
        // Load parser dynamically from config
        const parser = await loadParser(msg.parser);

        // Reconstruct proper State instance from serialized data
        const { StateFactory } = await import(chrome.runtime.getURL('js/state.js'));
        const stateInstance = await StateFactory.create_blank();
        stateInstance.fromObject(msg.state);

        // Initialize and run the parser with proper State instance
        await parser.initialize(stateInstance);
        const parseResult = await parser.parse(stateInstance);

        // Use state object as data
        const data = stateInstance.toObject();

        // console.log('=== PARSE COMPLETE ===');
        // console.log('Client data being returned:', data.Client);
        // console.log('Booking data being returned:', data.Booking);

        reply({
          ok: true,
          data: data
        });
      } catch (e) {
        console.error('Content script parser error:', e);
        reply({ ok: false, error: e.message });
      }
    })();

    return true; // keep port open for async reply

  } else {
    // if (msg.type) console.log("Received Msg [" + msg.type + "] " + (msg.body || 'no body'));
  }
  return false; // close port
});



//
// send leedz_open_sidebar message and 
// leedz_close_sidebar message to content.html
//
 function toggleSidebar () {
  const pane = document.getElementById('leedz-sidebar-container');

  if (pane) {
    // If sidebar exists, close it
    requestAnimationFrame(() => {
      pane.style.transform = 'translateX(100%)';
    });
    pane.addEventListener('transitionend', () => pane.remove(), { once: true });
  } else {
    // Create a completely isolated iframe
    const iframe = document.createElement('iframe');
    iframe.id = "leedz-sidebar-container";
    iframe.src = chrome.runtime.getURL("sidebar.html");
    
    // Style the iframe to be positioned as a sidebar
    Object.assign(iframe.style, {
      position: "fixed",
      top: "0",
      right: "0",
      width: "420px",
      height: "100vh",
      zIndex: "2147483647", // Maximum z-index value
      border: "none",
      transform: "translateX(100%)",
      transition: "transform 0.4s ease",
      boxShadow: "-6px 0 18px rgba(0,0,0,0.2)"
    });
    
    // Append directly to body
    document.body.appendChild(iframe);
    
    // Animate it in
    requestAnimationFrame(() => {
      iframe.style.transform = "translateX(0)";
    });
  }
}