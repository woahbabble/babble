const DEFAULT_API_BASE = globalThis.BABBLE_RUNTIME_CONFIG?.API_URL || 'https://babble.local:3001/api'
const DEFAULT_WEBSITE_BASE = globalThis.BABBLE_RUNTIME_CONFIG?.WEBSITE_URL || 'http://localhost:3000'
let apiBase = DEFAULT_API_BASE
let websiteBase = DEFAULT_WEBSITE_BASE
let currentView = 'comments'
let currentUrl = ''
let replyingTo = null
let anchorText = ''
let anchorSelector = ''
let anchorSource = 'none'
let anchorFromUser = ''
let pitMode = false
let commentSort = 'top'
let feedSort = 'popular'
let theme = 'paper'
let token = null
let currentUser = null
let lastPageSelection = { text: '', selector: '' }
let toastTimer = null

const ALLOWED_THEMES = ['paper', 'midnight', 'dusk', 'clay', 'fjord', 'violet']

function normalizeTheme(value) {
  const v = (value || '').toString().trim().toLowerCase()
  return ALLOWED_THEMES.includes(v) ? v : 'paper'
}

function applyTheme(nextTheme) {
  theme = normalizeTheme(nextTheme)
  document.documentElement.setAttribute('data-theme', theme)
}

function switchView(view) {
  currentView = view
  document.getElementById('comments-tab').classList.toggle('active', view === 'comments')
  document.getElementById('feed-tab').classList.toggle('active', view === 'feed')
  document.getElementById('comments-section').classList.toggle('active', view === 'comments')
  document.getElementById('feed-section').classList.toggle('active', view === 'feed')
  document.getElementById('url-bar').style.display = view === 'comments' ? 'block' : 'none'
  document.getElementById('compose').style.display = (view === 'comments' && token) ? 'block' : 'none'

  if (view === 'feed') {
    loadFeed()
  } else {
    loadComments()
  }
}

function setReplyAnchor(text, selector = '', source = 'page', sourceUser = '') {
  anchorText = (text || '').trim()
  anchorSelector = (selector || '').trim()
  anchorSource = source
  anchorFromUser = sourceUser
  if (!anchorText) return
  const short = anchorText.length > 120 ? `${anchorText.slice(0, 117)}...` : anchorText
  const prefix = anchorSource === 'comment'
    ? `Quote from @${anchorFromUser || 'user'}: `
    : 'Quote from page: '
  document.getElementById('reply-indicator').textContent = `${prefix}"${short}"`
  document.getElementById('cancel-reply').style.display = 'inline'
}

function clearReplyAnchor() {
  anchorText = ''
  anchorSelector = ''
  anchorSource = 'none'
  anchorFromUser = ''
  if (!replyingTo) {
    document.getElementById('reply-indicator').textContent = ''
    document.getElementById('cancel-reply').style.display = 'none'
  }
}

function updateThreadLink(url) {
  const link = document.getElementById('open-thread-link')
  if (!url) {
    link.style.visibility = 'hidden'
    link.href = '#'
    return
  }
  link.style.visibility = 'visible'
  const base = `${websiteBase}/thread/${encodeURIComponent(url)}`
  const hash = new URLSearchParams()
  hash.set('babble_theme', theme)
  if (token) hash.set('babble_token', token)
  link.href = `${base}#${hash.toString()}`
}

function updateAccountLink() {
  const link = document.getElementById('open-account-link')
  if (!link) return
  const base = `${websiteBase}/account`
  const hash = new URLSearchParams()
  hash.set('babble_theme', theme)
  if (token) hash.set('babble_token', token)
  link.href = `${base}#${hash.toString()}`
}

function showSyncToast(message) {
  const toast = document.getElementById('sync-toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('show')
  }, 2200)
}

function getWebsiteOrigin() {
  try {
    return new URL(websiteBase).origin
  } catch (_) {
    return ''
  }
}

function syncToWebsiteIfPresent() {
  window.parent.postMessage({
    type: 'BABBLE_SET_WEBSITE_PREFS',
    websiteOrigin: getWebsiteOrigin(),
    theme,
    token: token || '',
    username: currentUser?.username || '',
    userId: currentUser?.id || '',
    clearToken: !token
  }, '*')
}

document.getElementById('comments-tab').addEventListener('click', () => switchView('comments'))
document.getElementById('feed-tab').addEventListener('click', () => switchView('feed'))

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (token && !options.skipAuth) headers.Authorization = `Bearer ${token}`
  if (options.body && typeof options.body !== 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({
        action: 'API_REQUEST',
        url: `${apiBase}${path}`,
        method: options.method || 'GET',
        headers,
        body: options.body || null
      }, (response) => {
        if (chrome.runtime.lastError) {
          // Handle extension context invalidation
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            reject(new Error('Extension was reloaded. Please try again.'))
          } else {
            reject(new Error(chrome.runtime.lastError.message))
          }
          return
        }
        if (response && response.ok) return resolve(response.data)
        reject(new Error(response?.error || 'API request failed'))
      })
    } catch (err) {
      reject(new Error('Extension context error. Please refresh the page.'))
    }
  })
}

function healthUrlFromApiBase(base) {
  return `${base.replace(/\/api\/?$/, '')}/health`
}

function loadRuntimeConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiBase', 'websiteBase', 'pitMode', 'commentSort', 'feedSort', 'theme'], (data) => {
      apiBase = data.apiBase || DEFAULT_API_BASE
      websiteBase = data.websiteBase || DEFAULT_WEBSITE_BASE
      pitMode = Boolean(data.pitMode)
      commentSort = ['top', 'newest', 'oldest'].includes(data.commentSort) ? data.commentSort : 'top'
      feedSort = ['popular', 'active', 'newest', 'oldest'].includes(data.feedSort) ? data.feedSort : 'popular'
      applyTheme(data.theme || 'paper')
      const apiInput = document.getElementById('api-base-input')
      const websiteInput = document.getElementById('website-base-input')
      const pitCheckbox = document.getElementById('pit-mode-checkbox')
      const sortSelect = document.getElementById('comment-sort-select')
      const feedSortSelect = document.getElementById('feed-sort-select')
      const themeSelect = document.getElementById('theme-select')
      const quickThemeSelect = document.getElementById('theme-select-quick')
      if (apiInput) apiInput.value = apiBase
      if (websiteInput) websiteInput.value = websiteBase
      if (pitCheckbox) pitCheckbox.checked = pitMode
      if (sortSelect) sortSelect.value = commentSort
      if (feedSortSelect) feedSortSelect.value = feedSort
      if (themeSelect) themeSelect.value = theme
      if (quickThemeSelect) quickThemeSelect.value = theme
      resolve()
    })
  })
}

function setConfigStatus(message, isError = false) {
  const el = document.getElementById('config-status')
  if (!el) return
  el.textContent = message
  el.style.display = message ? 'block' : 'none'
  el.style.color = isError ? '#e53e3e' : '#666'
}

window.addEventListener('message', (e) => {
  if (e.data.type === 'BABBLE_CONTEXT') {
    maybeLinkWebsiteAccount(e.data.websiteAuth)
    maybeLinkWebsiteTheme(e.data.websiteTheme)
    currentUrl = e.data.url
    updateThreadLink(currentUrl)
    const selectedText = e.data.selection?.text || ''
    const selectedSelector = e.data.selection?.selector || ''
    lastPageSelection = { text: selectedText, selector: selectedSelector }
    if (selectedText) {
      setReplyAnchor(selectedText, selectedSelector, 'page')
    } else if (!replyingTo) {
      clearReplyAnchor()
    }
    if (currentView === 'comments') {
      document.getElementById('url-bar').textContent = currentUrl
      loadComments()
    }
  }
})

window.parent.postMessage({ type: 'BABBLE_GET_URL' }, '*')

function loadAuth() {
  chrome.storage.local.get(['token', 'username', 'id'], (data) => {
    if (data.token) {
      token = data.token
      currentUser = { username: data.username, id: data.id }
      showLoggedIn()
    } else {
      showLoggedOut()
    }
    // Initialize view
    switchView(currentView)
  })
}

function maybeLinkWebsiteAccount(websiteAuth) {
  if (!websiteAuth || !websiteAuth.token || token) return
  token = websiteAuth.token
  currentUser = {
    username: websiteAuth.username || 'linked-user',
    id: websiteAuth.id || null
  }
  chrome.storage.local.set({
    token: websiteAuth.token,
    username: currentUser.username,
    id: currentUser.id
  })
  showLoggedIn()
  showSyncToast(`Linked account from website as @${currentUser.username}`)
}

function maybeLinkWebsiteTheme(websiteTheme) {
  const normalized = normalizeTheme(websiteTheme)
  if (!websiteTheme || normalized === theme) return
  applyTheme(normalized)
  const themeSelect = document.getElementById('theme-select')
  const quickSelect = document.getElementById('theme-select-quick')
  if (themeSelect) themeSelect.value = theme
  if (quickSelect) quickSelect.value = theme
  chrome.storage.local.set({ theme })
  showSyncToast(`Theme synced from website: ${theme}`)
}

function showLoggedIn() {
  document.getElementById('auth-section').style.display = 'none'
  document.getElementById('compose').style.display = currentView === 'comments' ? 'block' : 'none'
  document.getElementById('user-info').textContent = currentUser?.username || ''
  document.getElementById('logout-btn').style.display = 'block'
  updateThreadLink(currentUrl)
  updateAccountLink()
  syncToWebsiteIfPresent()
}

function showLoggedOut() {
  document.getElementById('auth-section').style.display = 'block'
  document.getElementById('compose').style.display = 'none'
  document.getElementById('user-info').textContent = ''
  document.getElementById('logout-btn').style.display = 'none'
  updateThreadLink(currentUrl)
  updateAccountLink()
  syncToWebsiteIfPresent()
}

let signingUp = false

document.getElementById('login-btn').addEventListener('click', async () => {
  if (signingUp) {
    signingUp = false
    document.getElementById('auth-title').textContent = 'Log in to Babble'
    document.getElementById('username-input').style.display = 'none'
    document.getElementById('signup-btn').textContent = 'Create account'
    document.getElementById('login-btn').textContent = 'Log in'
    showError('')
    return
  }

  const email = document.getElementById('email-input').value.trim()
  const password = document.getElementById('password-input').value
  showError('')
  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true
    })
    token = data.token
    currentUser = { username: data.username, id: data.id }
    chrome.storage.local.set({ token: data.token, username: data.username, id: data.id })
    showLoggedIn()
    loadComments()
  } catch (err) {
    showError(err.message)
  }
})
document.getElementById('signup-btn').addEventListener('click', async () => {
  if (!signingUp) {
    signingUp = true
    document.getElementById('auth-title').textContent = 'Create account'
    document.getElementById('username-input').style.display = 'block'
    document.getElementById('signup-btn').textContent = 'Sign up'
    document.getElementById('login-btn').textContent = 'Back to login'
    return
  }
  const username = document.getElementById('username-input').value.trim()
  const email = document.getElementById('email-input').value.trim()
  const password = document.getElementById('password-input').value
  showError('')
  try {
    const data = await apiFetch('/auth/signup', {
      method: 'POST',
      body: { username, email, password },
      skipAuth: true
    })
    token = data.token
    currentUser = { username: data.username, id: data.id }
    chrome.storage.local.set({ token: data.token, username: data.username, id: data.id })
    showLoggedIn()
    loadComments()
  } catch (err) {
    showError(err.message)
  }
})

document.getElementById('logout-btn').addEventListener('click', () => {
  token = null
  currentUser = null
  chrome.storage.local.remove(['token', 'username', 'id'])
  showLoggedOut()
  syncToWebsiteIfPresent()
})

document.getElementById('settings-toggle').addEventListener('click', () => {
  const panel = document.getElementById('settings-panel')
  const isOpen = panel.style.display === 'block'
  panel.style.display = isOpen ? 'none' : 'block'
})

document.getElementById('save-config-btn').addEventListener('click', async () => {
  const apiInput = document.getElementById('api-base-input').value.trim()
  const websiteInput = document.getElementById('website-base-input').value.trim()
  if (!apiInput || !websiteInput) {
    setConfigStatus('API base and website base are required.', true)
    return
  }
  apiBase = apiInput.replace(/\/$/, '')
  websiteBase = websiteInput.replace(/\/$/, '')
  const pitCheckbox = document.getElementById('pit-mode-checkbox')
  pitMode = Boolean(pitCheckbox?.checked)
  const sortSelect = document.getElementById('comment-sort-select')
  commentSort = ['top', 'newest', 'oldest'].includes(sortSelect?.value) ? sortSelect.value : 'top'
  const feedSortSelect = document.getElementById('feed-sort-select')
  feedSort = ['popular', 'active', 'newest', 'oldest'].includes(feedSortSelect?.value) ? feedSortSelect.value : 'popular'
  const themeSelect = document.getElementById('theme-select')
  applyTheme(themeSelect?.value || theme)
  chrome.storage.local.set({ apiBase, websiteBase, pitMode, commentSort, feedSort, theme })
  updateThreadLink(currentUrl)
  updateAccountLink()
  syncToWebsiteIfPresent()
  setConfigStatus('Saved. Reloading feed/comments...')
  if (currentView === 'feed') loadFeed()
  else loadComments()
})

document.getElementById('theme-select-quick').addEventListener('change', (e) => {
  applyTheme(e.target.value)
  const themeSelect = document.getElementById('theme-select')
  if (themeSelect) themeSelect.value = theme
  chrome.storage.local.set({ theme })
  updateThreadLink(currentUrl)
  updateAccountLink()
  syncToWebsiteIfPresent()
})

document.getElementById('test-api-btn').addEventListener('click', () => {
  setConfigStatus('Testing API connection...')
  chrome.runtime.sendMessage({
    action: 'API_REQUEST',
    url: healthUrlFromApiBase(apiBase),
    method: 'GET',
    headers: {},
    body: null
  }, (response) => {
    if (chrome.runtime.lastError) {
      setConfigStatus(`API test failed: ${chrome.runtime.lastError.message}`, true)
      return
    }
    if (response && response.ok) {
      setConfigStatus('API connection OK.')
      return
    }
    const error = response?.error || 'Unknown error'
    setConfigStatus(`API test failed: ${error}`, true)
  })
})

async function loadComments() {
  if (!currentUrl) return
  const section = document.getElementById('comments-section')
  section.innerHTML = '<div class="loading">Loading comments...</div>'
  try {
    const data = await apiFetch(`/comments?url=${encodeURIComponent(currentUrl)}&sort=${encodeURIComponent(commentSort)}${pitMode ? '&mode=pit' : ''}`)
    renderComments(data.comments)
  } catch (err) {
    section.innerHTML = `<div class="loading">${escapeHtml(err.message || 'Could not load comments')}</div>`
  }
}

async function loadFeed() {
  const section = document.getElementById('feed-section')
  section.innerHTML = '<div class="loading">Loading feed...</div>'
  try {
    const data = await apiFetch(`/feed?include_meta=1&sort=${encodeURIComponent(feedSort)}&page=1&page_size=50`)
    renderFeed(data.items || data)
  } catch (err) {
    section.innerHTML = `<div class="loading">${escapeHtml(err.message || 'Could not load feed')}</div>`
  }
}

function renderFeed(sites) {
  const section = document.getElementById('feed-section')
  if (!sites || sites.length === 0) {
    section.innerHTML = `
      <div id="empty-state">
        <p>No discussions yet.<br>Be the first to comment on a page!</p>
      </div>`
    return
  }

  section.innerHTML = sites.map(site => `
    <div class="feed-item" data-url="${escapeHtml(site.url)}">
      <div class="feed-url">${escapeHtml(site.url)}</div>
      <div class="feed-stats">${site.comment_count} comment${site.comment_count !== 1 ? 's' : ''}</div>
    </div>
  `).join('')

  section.querySelectorAll('.feed-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.dataset.url
      // Switch to comments view and load that URL's comments
      switchView('comments')
      currentUrl = url
      updateThreadLink(currentUrl)
      document.getElementById('url-bar').textContent = url
      loadComments()
    })
  })
}

function renderComments(comments) {
  const section = document.getElementById('comments-section')
  if (!comments || comments.length === 0) {
    section.innerHTML = `
      <div id="empty-state">
        <p>No comments yet.<br>Be the first to say something.</p>
      </div>`
    return
  }

  if (commentSort === 'newest') {
    comments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } else if (commentSort === 'top') {
    comments.sort((a, b) => (b.score || 0) - (a.score || 0) || new Date(a.created_at) - new Date(b.created_at))
  } else {
    comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }

  const top = comments.filter(c => !c.parent_id)
  const replies = comments.filter(c => c.parent_id)

  section.innerHTML = top.map(c => renderComment(c, replies)).join('')

  section.querySelectorAll('.reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      replyingTo = parseInt(btn.dataset.id, 10)
      const username = btn.dataset.username
      document.getElementById('reply-indicator').textContent = `Replying to ${username}`
      document.getElementById('cancel-reply').style.display = 'inline'
      document.getElementById('comment-input').focus()
    })
  })

  section.querySelectorAll('.quote-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      replyingTo = parseInt(btn.dataset.id, 10)
      const username = btn.dataset.username || 'user'
      const preview = (btn.dataset.preview || '').trim()
      if (preview) {
        setReplyAnchor(preview, `comment:${replyingTo}`, 'comment', username)
      }
      if (!preview) {
        document.getElementById('reply-indicator').textContent = `Replying to ${username} (no quote)`
      }
      document.getElementById('cancel-reply').style.display = 'inline'
      document.getElementById('comment-input').focus()
    })
  })

  section.querySelectorAll('.report-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!token) {
        showError('Please log in first')
        return
      }
      const commentId = Number.parseInt(btn.dataset.id, 10)
      const reason = window.prompt('Reason for report?')
      if (!reason || !reason.trim()) return
      try {
        await apiFetch('/flags', {
          method: 'POST',
          body: { comment_id: commentId, reason: reason.trim() }
        })
        showError('') // clear previous errors
      } catch (err) {
        showError(err.message || 'Failed to submit report')
      }
    })
  })

  section.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!token) {
        showError('Please log in first')
        return
      }
      const commentId = Number.parseInt(btn.dataset.id, 10)
      const vote = Number.parseInt(btn.dataset.vote, 10)
      try {
        await apiFetch(`/comments/${commentId}/vote`, {
          method: 'POST',
          body: { vote }
        })
        loadComments()
      } catch (err) {
        showError(err.message || 'Failed to submit vote')
      }
    })
  })
}

function renderComment(comment, allReplies, depth = 0) {
  const time = new Date(comment.created_at).toLocaleDateString()
  const commentReplies = allReplies
    .filter(r => r.parent_id === comment.id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const lowQualityClass = pitMode && comment.is_low_quality ? ' pit-low-quality' : ''
  const upActive = comment.user_vote === 1 ? ' active' : ''
  const downActive = comment.user_vote === -1 ? ' active' : ''
  const quotePreview = (comment.body || '').trim().slice(0, 240)
  const quoteLabel = (comment.anchor_selector || '').startsWith('comment:')
    ? 'Quoted from another comment'
    : comment.anchor_text ? 'Quoted from page' : ''
  return `
    <div class="comment ${depth > 0 ? 'reply' : ''}${lowQualityClass}">
      <div class="comment-row">
        <div class="vote-rail">
          <button class="vote-btn vote-up${upActive}" data-id="${comment.id}" data-vote="1" title="Upvote">▲</button>
          <span class="vote-score">${comment.score || 0}</span>
          <button class="vote-btn vote-down${downActive}" data-id="${comment.id}" data-vote="-1" title="Downvote">▼</button>
          ${comment.user_vote ? `<button class="vote-btn vote-clear" data-id="${comment.id}" data-vote="0" title="Clear vote">•</button>` : ''}
        </div>
        <div class="comment-main">
          <div class="comment-meta">
            <span class="comment-username">${escapeHtml(comment.username)}</span>
            <span class="comment-time">${time}</span>
          </div>
          ${comment.anchor_text ? `
            <div class="comment-quote-wrap">
              <div class="comment-quote-label">${escapeHtml(quoteLabel)}</div>
              <blockquote class="comment-quote">${escapeHtml(comment.anchor_text)}</blockquote>
            </div>
          ` : ''}
          <div class="comment-body">${escapeHtml(comment.body)}</div>
          <button class="reply-btn" data-id="${comment.id}" data-username="${escapeHtml(comment.username)}">reply</button>
          <button class="quote-btn" data-id="${comment.id}" data-username="${escapeHtml(comment.username)}" data-preview="${escapeHtml(quotePreview)}">quote</button>
          <button class="report-btn" data-id="${comment.id}">report</button>
        </div>
      </div>
      ${commentReplies.map(r => renderComment(r, allReplies, depth + 1)).join('')}
    </div>`
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function showError(msg) {
  const el = document.getElementById('error-msg')
  el.textContent = msg
  el.style.display = msg ? 'block' : 'none'
}

document.getElementById('cancel-reply').addEventListener('click', () => {
  replyingTo = null
  clearReplyAnchor()
})

document.getElementById('quote-selection-btn').addEventListener('click', () => {
  const text = (lastPageSelection.text || '').trim()
  if (!text) {
    showError('Select text on the page first, then click quote page selection.')
    return
  }
  setReplyAnchor(text, lastPageSelection.selector || '', 'page')
  showError('')
  document.getElementById('comment-input').focus()
})

document.getElementById('submit-btn').addEventListener('click', async () => {
  const body = document.getElementById('comment-input').value.trim()
  if (!body) return showError('Comment cannot be empty')
  if (!token) return showError('Please log in first')
  if (!currentUrl) return showError('Page URL not available')

  const submitBtn = document.getElementById('submit-btn')
  const originalText = submitBtn.textContent
  submitBtn.textContent = 'Posting...'
  submitBtn.disabled = true
  showError('')

  try {
    await apiFetch('/comments', {
      method: 'POST',
      body: {
        url: currentUrl,
        body,
        parent_id: replyingTo,
        anchor_text: anchorText || null,
        anchor_selector: anchorSelector || null
      }
    })
    document.getElementById('comment-input').value = ''
    replyingTo = null
    clearReplyAnchor()
    loadComments()
  } catch (err) {
    showError(err.message || 'Failed to post comment')
  } finally {
    submitBtn.textContent = originalText
    submitBtn.disabled = false
  }
})

async function init() {
  await loadRuntimeConfig()
  const quickSelect = document.getElementById('theme-select-quick')
  if (quickSelect) quickSelect.value = theme
  loadAuth()
  updateThreadLink('')
  updateAccountLink()
  syncToWebsiteIfPresent()
}

init()