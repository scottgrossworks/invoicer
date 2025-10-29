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

// respond to sidebar requests
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'leedz_parse_page') {
    (async () => {
      try {
        // console.log('Content script received parse request for:', msg.parser);

        // Load parser dynamically from config
        const parser = await loadParser(msg.parser);

        // Reconstruct proper State instance from serialized data
        const { StateFactory } = await import(chrome.runtime.getURL('js/state.js'));
        const stateInstance = await StateFactory.create_blank();
        stateInstance.fromObject(msg.state);

        // Initialize and run the parser with proper State instance
        await parser.initialize(stateInstance);
        const parseResult = await parser.parse(stateInstance);

        // Check if parser returned data directly (like ClientParser)
        // or modified state (like GmailParser, GCalParser)
        const data = parseResult && typeof parseResult === 'object' && parseResult.clients
          ? parseResult  // Direct return (ClientParser)
          : stateInstance.toObject();  // State-based (GmailParser, etc.)

        // console.log('Parser extracted data:', data);

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