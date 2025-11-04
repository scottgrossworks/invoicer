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
    //console.log('DEBUG: Background script received LLM request');
    const { request } = message;
    
    // console.log('DEBUG: Making fetch to:', request.url);
    // console.log('DEBUG: Request method:', request.method);
    // console.log('DEBUG: Request headers:', request.headers);
    // console.log('DEBUG: Request body:', JSON.stringify(request.body, null, 2));
    
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
    
    return true;
  }

});


