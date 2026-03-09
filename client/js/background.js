//
// 
// 
// 
// 


// Click the extension icon to toggle the sidebar
//
//
chrome.action.onClicked.addListener((tab) => {
  try {
    chrome.tabs.sendMessage(tab.id, { action: "toggleSidebar" }, response => {

      const lastError = chrome.runtime.lastError;
      // Silently handle connection errors
      if (lastError) {
        console.log("Connection error handled:", lastError.message);
      }
    });
  } catch (e) {
    console.log("Error handled:", e.message);
  }
});




// Load LLM key once from LLM_KEY.json (background is always extension context)
let _llmApiKey = null;
async function getLlmApiKey() {
  if (_llmApiKey) return _llmApiKey;
  try {
    const r = await fetch(chrome.runtime.getURL('LLM_KEY.json'));
    if (r.ok) {
      const d = await r.json();
      const key = d['api-key'] || '';
      if (key && !key.includes('PASTE-YOUR-KEY')) _llmApiKey = key;
    }
  } catch (e) {}
  return _llmApiKey;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  //
  // Get the current tab URL
  //
  if (message.type === 'leedz_get_tab_url') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ url: tabs[0]?.url || null, tabId: tabs[0]?.id || null });
    });
    return true; // Keep the message channel open for async response
  }

  // NOTE: leedz_open_dashboard handler removed — openDashboard() now opens
  // dashboard URL directly (no Lambda call) to prevent unwanted magic link emails

  //
  // Handle LLM requests to avoid CORS issues
  //
  if (message.type === 'leedz_llm_request') {
    const { request } = message;
    (async () => {
      const apiKey = await getLlmApiKey();
      if (!apiKey) {
        console.warn('LLM_KEY.json not configured — set your Anthropic key in LLM_KEY.json');
        sendResponse({ ok: false, error: 'LLM API key not configured. Edit LLM_KEY.json.' });
        return;
      }
      request.headers['x-api-key'] = apiKey;
      fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body)
    })
    .then(response => {
      // console.log('DEBUG: Fetch response status:', response.status);
      if (response.ok) {
        return response.json().then(data => {
          // console.log('DEBUG: Sending success response to content script');
          sendResponse({ ok: true, data: data });
        });
      } else {
        console.error('Sending error response to content script - Status:', response.status, response.statusText);
        // Get the error response body for debugging
        response.text().then(errorBody => {
          console.error('Error response body:', errorBody);
        });
        sendResponse({ ok: false, status: response.status, statusText: response.statusText });
      }
    })
      .catch(error => {
        console.error('Fetch failed:', error.message);
        sendResponse({ ok: false, error: error.message });
      });
    })();
    return true;
  }

});


