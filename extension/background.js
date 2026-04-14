const ext = globalThis.browser || globalThis.chrome

function sendTabMessage(tabId, payload) {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = ext.tabs.sendMessage(tabId, payload, (response) => {
        if (ext.runtime.lastError) return reject(new Error(ext.runtime.lastError.message))
        resolve(response)
      })
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolve).catch(reject)
      }
    } catch (err) {
      reject(err)
    }
  })
}

function injectContentScript(tabId) {
  if (!ext.scripting || !ext.scripting.executeScript) {
    return Promise.resolve(false)
  }
  return ext.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  }).then(() => true)
}

ext.action.onClicked.addListener(async (tab) => {
  const tabId = tab?.id
  if (!Number.isInteger(tabId)) return
  try {
    const state = await sendTabMessage(tabId, { action: 'getSidebarState' })
    const nextOpen = !Boolean(state?.isOpen)
    await sendTabMessage(tabId, { action: 'setSidebar', open: nextOpen })
    return
  } catch {
    // Content script may not be available yet on this page.
  }

  try {
    const injected = await injectContentScript(tabId)
    if (!injected) return
    setTimeout(() => {
      sendTabMessage(tabId, { action: 'setSidebar', open: true }).catch(() => {})
    }, 100)
  } catch {
    // Ignore to avoid noisy errors in unsupported tabs.
  }
})

// Proxy API calls from sidebar to avoid Chromium blocking localhost
ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'API_REQUEST') {
    const fetchBody = typeof msg.body === 'string'
      ? msg.body
      : msg.body ? JSON.stringify(msg.body) : undefined

    // Add timeout to prevent hanging requests
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    fetch(msg.url, {
      method: msg.method || 'GET',
      headers: msg.headers || {},
      body: fetchBody,
      signal: controller.signal
    })
      .then(async res => {
        clearTimeout(timeoutId)
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          return sendResponse({ ok: false, error: data?.error || `HTTP ${res.status}` })
        }
        sendResponse({ ok: true, data })
      })
      .catch(err => {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
          sendResponse({ ok: false, error: 'Request timeout' })
        } else if (err.message && err.message.includes('Failed to fetch')) {
          sendResponse({
            ok: false,
            error: 'Network/TLS error. Check API URL in extension settings, ensure API is running, and trust local certificates.'
          })
        } else {
          sendResponse({ ok: false, error: err.message })
        }
      })
    return true
  }
})