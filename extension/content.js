let sidebarOpen = false
let sidebarFrame = null

function createSidebar() {
  sidebarFrame = document.createElement('iframe')
  sidebarFrame.src = chrome.runtime.getURL('sidebar.html')
  sidebarFrame.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 380px;
    height: 100%;
    border: none;
    z-index: 2147483647;
    box-shadow: -2px 0 12px rgba(0,0,0,0.15);
    transform: translateX(100%);
    transition: transform 0.3s ease;
  `
  document.body.appendChild(sidebarFrame)
}

function toggleSidebar() {
  if (!sidebarFrame) createSidebar()
  sidebarOpen = !sidebarOpen
  sidebarFrame.style.transform = sidebarOpen
    ? 'translateX(0)'
    : 'translateX(100%)'
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'toggleSidebar') {
    toggleSidebar()
    sendResponse({ ok: true })
  }
  return true
})

window.addEventListener('message', (e) => {
  if (e.data.type === 'BABBLE_GET_URL') {
    if (sidebarFrame) {
      sidebarFrame.contentWindow.postMessage({
        type: 'BABBLE_URL',
        url: window.location.href
      }, '*')
    }
  }
})