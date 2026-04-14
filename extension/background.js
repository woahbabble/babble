chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' }, (response) => {
    if (chrome.runtime.lastError) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).then(() => {
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' })
        }, 100)
      })
    }
  })
})

// Proxy API calls from sidebar to avoid Chromium blocking localhost
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'API_REQUEST') {
    const fetchBody = typeof msg.body === 'string'
      ? msg.body
      : msg.body ? JSON.stringify(msg.body) : undefined

    fetch(msg.url, {
      method: msg.method || 'GET',
      headers: msg.headers || {},
      body: fetchBody
    })
      .then(async res => {
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          return sendResponse({ ok: false, error: data?.error || `HTTP ${res.status}` })
        }
        sendResponse({ ok: true, data })
      })
      .catch(err => sendResponse({ ok: false, error: err.message }))
    return true
  }
})