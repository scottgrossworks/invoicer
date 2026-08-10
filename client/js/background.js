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

      // Silently handle connection errors (no content script on this tab)
      void chrome.runtime.lastError;
    });
  } catch (e) {
    // console.log("Error handled:", e.message);
  }
});




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

  //
  // Handle LLM requests to avoid CORS issues
  //
  if (message.type === 'leedz_llm_request') {
    const { request } = message;

    fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body)
    })
    .then(response => {
      if (response.ok) {
        return response.json().then(data => {
          sendResponse({ ok: true, data: data });
        });
      } else {
        // Forward the API error body - the sidebar builds the user-facing
        // toast from it (invalid key vs model-not-found vs rate limit).
        response.text()
          .then(errorBody => {
            let apiError = null;
            try { apiError = JSON.parse(errorBody)?.error || null; } catch (e) { /* body not JSON */ }
            console.error(`[LLM] ${response.status} ${apiError?.type || response.statusText}: ${apiError?.message || String(errorBody).slice(0, 200)}`);
            sendResponse({ ok: false, status: response.status, statusText: response.statusText, error: apiError });
          })
          .catch(() => {
            console.error(`[LLM] ${response.status} ${response.statusText}`);
            sendResponse({ ok: false, status: response.status, statusText: response.statusText });
          });
      }
    })
    .catch(error => {
      console.error('[LLM] fetch failed:', error.message);
      sendResponse({ ok: false, error: error.message });
    });

    return true;
  }

  //
  // Handle MCP (gmail) requests to bypass Local Network Access restrictions
  // on the sidebar iframe. The background worker is allowed to reach 127.0.0.1.
  //
  if (message.type === 'leedz_mcp_request') {
    const { url, method, body } = message.request;
    fetch(url, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined
    })
    .then(async (response) => {
      let data = null;
      try { data = await response.json(); } catch (e) { data = null; }
      sendResponse({ ok: response.ok, status: response.status, data });
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });

    return true;
  }

});


