let sidebarOpen = false
let sidebarFrame = null
let sidebarHost = null
let shadowRootRef = null
let lastSelection = { text: '', selector: '' }

function cssSelectorForElement(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return ''
  if (el.id) return `#${el.id}`
  const parts = []
  let current = el
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
    let selector = current.tagName.toLowerCase()
    if (current.classList && current.classList.length > 0) {
      selector += `.${[...current.classList].slice(0, 2).join('.')}`
    }
    const parent = current.parentElement
    if (parent) {
      const siblings = [...parent.children].filter((child) => child.tagName === current.tagName)
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1
        selector += `:nth-of-type(${idx})`
      }
    }
    parts.unshift(selector)
    current = current.parentElement
  }
  return parts.join(' > ')
}

function captureSelection() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    lastSelection = { text: '', selector: '' }
    return lastSelection
  }
  const text = selection.toString().trim().slice(0, 500)
  if (!text) {
    lastSelection = { text: '', selector: '' }
    return lastSelection
  }
  const range = selection.getRangeAt(0)
  const node = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement
  lastSelection = {
    text,
    selector: cssSelectorForElement(node)
  }
  return lastSelection
}

function sendContextToSidebar() {
  if (!sidebarFrame || !sidebarFrame.contentWindow) return
  let websiteAuth = null
  let websiteTheme = ''
  try {
    const websiteToken = window.localStorage.getItem('babbleWebsiteToken')
    if (websiteToken) {
      websiteAuth = {
        token: websiteToken,
        username: window.localStorage.getItem('babbleWebsiteUsername') || '',
        id: window.localStorage.getItem('babbleWebsiteUserId') || ''
      }
    }
    websiteTheme = window.localStorage.getItem('babbleTheme') || document.documentElement.getAttribute('data-theme') || ''
  } catch (_) {
    websiteAuth = null
    websiteTheme = ''
  }
  sidebarFrame.contentWindow.postMessage({
    type: 'BABBLE_CONTEXT',
    url: window.location.href,
    selection: lastSelection,
    websiteAuth,
    websiteTheme
  }, '*')
}

function createSidebar() {
  sidebarHost = document.createElement('div')
  sidebarHost.style.cssText = `
    all: initial;
    position: fixed;
    top: 0;
    right: 0;
    width: 380px;
    height: 100%;
    z-index: 2147483647;
    pointer-events: none;
  `
  document.documentElement.appendChild(sidebarHost)
  shadowRootRef = sidebarHost.attachShadow({ mode: 'closed' })

  sidebarFrame = document.createElement('iframe')
  sidebarFrame.src = chrome.runtime.getURL('sidebar.html')
  sidebarFrame.style.cssText = `
    all: initial;
    position: absolute;
    top: 0;
    right: 0;
    width: 380px;
    height: 100%;
    border: none;
    box-shadow: -2px 0 12px rgba(0,0,0,0.15);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    pointer-events: auto;
  `
  shadowRootRef.appendChild(sidebarFrame)
  sidebarFrame.addEventListener('load', () => {
    sendContextToSidebar()
  })
}

function toggleSidebar() {
  captureSelection()
  if (!sidebarFrame) createSidebar()
  sidebarOpen = !sidebarOpen
  if (sidebarHost) {
    sidebarHost.style.pointerEvents = sidebarOpen ? 'auto' : 'none'
  }
  sidebarFrame.style.transform = sidebarOpen
    ? 'translateX(0)'
    : 'translateX(100%)'
  if (sidebarOpen) {
    sendContextToSidebar()
  }
}

function setSidebarOpen(nextOpen) {
  captureSelection()
  if (!sidebarFrame) createSidebar()
  sidebarOpen = Boolean(nextOpen)
  if (sidebarHost) {
    sidebarHost.style.pointerEvents = sidebarOpen ? 'auto' : 'none'
  }
  sidebarFrame.style.transform = sidebarOpen
    ? 'translateX(0)'
    : 'translateX(100%)'
  if (sidebarOpen) {
    sendContextToSidebar()
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getSidebarState') {
    sendResponse({ ok: true, isOpen: sidebarOpen })
    return true
  }
  if (msg.action === 'setSidebar') {
    setSidebarOpen(Boolean(msg.open))
    sendResponse({ ok: true, isOpen: sidebarOpen })
    return true
  }
  if (msg.action === 'toggleSidebar') {
    toggleSidebar()
    sendResponse({ ok: true, isOpen: sidebarOpen })
  }
  return true
})

window.addEventListener('message', (e) => {
  if (e.data.type === 'BABBLE_GET_URL') {
    captureSelection()
    sendContextToSidebar()
  }
  if (e.data.type === 'BABBLE_SET_WEBSITE_PREFS') {
    const websiteOrigin = (e.data.websiteOrigin || '').trim()
    if (!websiteOrigin || window.location.origin !== websiteOrigin) return
    try {
      const nextTheme = (e.data.theme || '').trim()
      const nextToken = (e.data.token || '').trim()
      const nextUsername = (e.data.username || '').trim()
      const nextUserId = e.data.userId == null ? '' : String(e.data.userId)

      if (nextTheme) {
        window.localStorage.setItem('babbleTheme', nextTheme)
        document.documentElement.setAttribute('data-theme', nextTheme)
        window.dispatchEvent(new Event('babble-theme-changed'))
      }
      if (nextToken) {
        window.localStorage.setItem('babbleWebsiteToken', nextToken)
        if (nextUsername) window.localStorage.setItem('babbleWebsiteUsername', nextUsername)
        if (nextUserId) window.localStorage.setItem('babbleWebsiteUserId', nextUserId)
        window.dispatchEvent(new Event('babble-auth-changed'))
      }
      if (e.data.clearToken) {
        window.localStorage.removeItem('babbleWebsiteToken')
        window.localStorage.removeItem('babbleWebsiteUsername')
        window.localStorage.removeItem('babbleWebsiteUserId')
        window.dispatchEvent(new Event('babble-auth-changed'))
      }
    } catch (_) {
      // Ignore localStorage failures
    }
    sendContextToSidebar()
  }
})

document.addEventListener('selectionchange', () => {
  captureSelection()
})

window.addEventListener('storage', () => {
  sendContextToSidebar()
})

window.addEventListener('babble-theme-changed', () => {
  sendContextToSidebar()
})

window.addEventListener('babble-auth-changed', () => {
  sendContextToSidebar()
})