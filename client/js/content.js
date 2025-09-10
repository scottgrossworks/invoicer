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







// respond to sidebar requests
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'leedz_parse_page') {
    (async () => {
      try {
        // console.log('Content script received parse request for:', msg.parser);
        
        // Import the parser dynamically
        let parser;
        switch (msg.parser) {
          case 'LinkedInParser':
            const { default: LinkedInParser } = await import(chrome.runtime.getURL('js/parser/linkedin_parser.js'));
            parser = new LinkedInParser();
            break;
          case 'GmailParser':
            const { default: GmailParser } = await import(chrome.runtime.getURL('js/parser/gmail_parser.js'));
            parser = new GmailParser();
            break;
          case 'GCalParser':
            const { default: GCalParser } = await import(chrome.runtime.getURL('js/parser/gcal_parser.js'));
            parser = new GCalParser();
            break;
          case 'XParser':
            const { default: XParser } = await import(chrome.runtime.getURL('js/parser/x_parser.js'));
            parser = new XParser();
            break;
          default:
            throw new Error(`Unknown parser: ${msg.parser}`);
        }

        // Reconstruct proper State instance from serialized data
        const { StateFactory } = await import(chrome.runtime.getURL('js/state.js'));
        const stateInstance = await StateFactory.create();
        stateInstance.fromObject(msg.state);

        // Initialize and run the parser with proper State instance
        await parser.initialize(stateInstance);
        await parser.parse(stateInstance);
        
        this.STATE = stateInstance;

        console.log('Parser extracted data:', this.STATE);
        
        reply({
          ok: true,
          data: this.STATE  
        });
      } catch (e) {
        console.error('Content script parser error:', e);
        reply({ ok: false, error: e.message });
      }
    })();

    return true; // keep port open for async reply
  
  } else {
    console.log("Received Msg [" + msg.type + "] " + (msg.body || 'no body'));
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