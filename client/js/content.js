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



console.log('LeedzEx content.js loaded');







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

// respond to sidebar requests
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  // Open thank you compose window in Gmail
  if (msg.action === 'openThankYou') {
    (async () => {
      try {
        console.log('=== CONTENT SCRIPT: OPEN THANK YOU ===');
        console.log('Received message:', {
          action: msg.action,
          clientName: msg.clientName,
          clientEmail: msg.clientEmail,
          subject: msg.subject,
          hasBody: !!msg.body,
          bodyLength: msg.body ? msg.body.length : 0,
          bodyPreview: msg.body ? msg.body.substring(0, 200) + '...' : 'null'
        });
        console.log('Full body text received:', msg.body);

        // 1. Click Reply button
        console.log('Looking for Reply button...');
        const replyButton = document.querySelector('[aria-label="Reply"]');
        if (!replyButton) {
          console.error('Reply button not found in DOM');
          throw new Error('Reply button not found');
        }
        console.log('Reply button found, clicking...');
        replyButton.click();
        console.log('Reply button clicked');

        // 2. Wait for compose box to appear
        console.log('Waiting 500ms for compose box...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. Find and populate subject field (if visible)
        console.log('Looking for subject field...');
        const subjectField = document.querySelector('input[name="subjectbox"]');
        if (subjectField && !subjectField.value.startsWith('Re:')) {
          console.log('Subject field found, populating with:', msg.subject);
          subjectField.value = msg.subject || 'Thank you';
          subjectField.dispatchEvent(new Event('input', { bubbles: true }));
          console.log('Subject populated successfully');
        } else {
          console.log('Subject field not found or already has Re:');
        }

        // 4. Find and populate body field
        console.log('Looking for body field...');

        // Try multiple selectors for Gmail compose body
        let bodyField = null;
        const selectors = [
          'div[aria-label="Message Body"][contenteditable="true"]',
          'div[role="textbox"][aria-label="Message Body"]',
          'div[contenteditable="true"][aria-label="Message Body"]',
          'div.Am[contenteditable="true"]',  // Gmail's compose body class
          'div[g_editable="true"]'  // Alternative Gmail class
        ];

        for (const selector of selectors) {
          console.log('Trying selector:', selector);
          bodyField = document.querySelector(selector);
          if (bodyField) {
            console.log('Found body field with selector:', selector);
            break;
          }
        }

        if (!bodyField) {
          console.error('Message body field not found with any selector');
          console.log('Available contenteditable elements:',
            Array.from(document.querySelectorAll('[contenteditable="true"]')).map(el => ({
              tag: el.tagName,
              class: el.className,
              ariaLabel: el.getAttribute('aria-label'),
              role: el.getAttribute('role')
            })));
          throw new Error('Message body field not found');
        }

        console.log('Body field found:', {
          tag: bodyField.tagName,
          class: bodyField.className,
          ariaLabel: bodyField.getAttribute('aria-label'),
          isContentEditable: bodyField.contentEditable
        });
        console.log('Inserting body text (length: ' + (msg.body ? msg.body.length : 0) + ')');
        console.log('Body text to insert:', msg.body);

        // For contenteditable divs, use textContent or innerText, not innerHTML
        // This prevents HTML injection issues and works better with Gmail
        if (bodyField.tagName === 'DIV' && bodyField.contentEditable === 'true') {
          console.log('Using textContent for contenteditable div');
          bodyField.textContent = msg.body || '';
        } else if (bodyField.tagName === 'TEXTAREA') {
          console.log('Using value for textarea');
          bodyField.value = msg.body || '';
        } else {
          console.log('Using innerHTML as fallback');
          bodyField.innerHTML = msg.body || '';
        }

        console.log('Body field content after setting:', bodyField.textContent.substring(0, 200) + '...');

        // Dispatch multiple events to ensure Gmail recognizes the change
        bodyField.dispatchEvent(new Event('input', { bubbles: true }));
        bodyField.dispatchEvent(new Event('change', { bubbles: true }));
        bodyField.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        console.log('Events dispatched');

        // 5. Focus cursor in body (so user can start editing)
        bodyField.focus();
        console.log('Body field focused');

        console.log('=== THANK YOU COMPOSE COMPLETE ===');
        reply({ ok: true });
      } catch (error) {
        console.error('=== ERROR IN OPEN THANK YOU ===');
        console.error('Error details:', error);
        console.error('Error stack:', error.stack);
        reply({ ok: false, error: error.message });
      }
    })();

    return true; // keep port open for async reply
  }

  // Quick identity extraction only (name/email for DB lookup)
  if (msg.type === 'leedz_extract_identity') {
    (async () => {
      try {
        // Get matching parser for current page
        const parser = await getMatchingParser();

        // Call quickExtractIdentity() to get just name/email
        const identity = await parser.quickExtractIdentity();

        reply({
          ok: true,
          identity: identity || { email: null, name: null }
        });
      } catch (e) {
        console.error('Content script identity extraction error:', e);
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

  // Full parse with both client and booking data (for Invoicer page)
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
    if (msg.type) console.log("Received Msg [" + msg.type + "] " + (msg.body || 'no body'));
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