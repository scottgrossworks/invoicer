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