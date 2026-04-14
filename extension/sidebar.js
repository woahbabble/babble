const API = 'https://babble.local:3001/api'
let currentUrl = ''
let replyingTo = null
let token = null
let currentUser = null

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'API_REQUEST',
      url: `${API}${path}`,
      method: options.method || 'GET',
      headers,
      body: options.body || null
    }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
      if (response && response.ok) return resolve(response.data)
      reject(new Error(response?.error || 'API request failed'))
    })
  })
}

window.addEventListener('message', (e) => {
  if (e.data.type === 'BABBLE_URL') {
    currentUrl = e.data.url
    document.getElementById('url-bar').textContent = currentUrl
    loadComments()
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
  })
}

function showLoggedIn() {
  document.getElementById('auth-section').style.display = 'none'
  document.getElementById('compose').style.display = 'block'
  document.getElementById('user-info').textContent = currentUser.username
  document.getElementById('logout-btn').style.display = 'block'
}

function showLoggedOut() {
  document.getElementById('auth-section').style.display = 'block'
  document.getElementById('compose').style.display = 'none'
  document.getElementById('user-info').textContent = ''
  document.getElementById('logout-btn').style.display = 'none'
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
      body: { email, password }
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
    await apiFetch('/auth/signup', {
      method: 'POST',
      body: { username, email, password }
    })
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email, password }
    })
    token = data.token
    currentUser = { username: data.username, id: data.id }
    chrome.storage.local.set({ token: data.token, username: data.username, id: data.id })
    showLoggedIn()
  } catch (err) {
    showError(err.message)
  }
})

document.getElementById('logout-btn').addEventListener('click', () => {
  token = null
  currentUser = null
  chrome.storage.local.remove(['token', 'username', 'id'])
  showLoggedOut()
})

async function loadComments() {
  if (!currentUrl) return
  const section = document.getElementById('comments-section')
  section.innerHTML = '<div class="loading">Loading comments...</div>'
  try {
    const data = await apiFetch(`/comments?url=${encodeURIComponent(currentUrl)}`)
    renderComments(data.comments)
  } catch {
    section.innerHTML = '<div class="loading">Could not load comments</div>'
  }
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
  const top = comments.filter(c => !c.parent_id)
  const replies = comments.filter(c => c.parent_id)
  section.innerHTML = top.map(c => renderComment(c, replies)).join('')
  section.querySelectorAll('.reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      replyingTo = parseInt(btn.dataset.id)
      const username = btn.dataset.username
      document.getElementById('reply-indicator').textContent = `Replying to ${username}`
      document.getElementById('cancel-reply').style.display = 'inline'
      document.getElementById('comment-input').focus()
    })
  })
}

function renderComment(comment, replies, depth = 0) {
  const time = new Date(comment.created_at).toLocaleDateString()
  const commentReplies = replies.filter(r => r.parent_id === comment.id)
  return `
    <div class="comment ${depth > 0 ? 'reply' : ''}">
      <div class="comment-meta">
        <span class="comment-username">${escapeHtml(comment.username)}</span>
        <span class="comment-time">${time}</span>
      </div>
      <div class="comment-body">${escapeHtml(comment.body)}</div>
      <button class="reply-btn" data-id="${comment.id}" data-username="${escapeHtml(comment.username)}">reply</button>
      ${commentReplies.map(r => renderComment(r, replies, depth + 1)).join('')}
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
  document.getElementById('reply-indicator').textContent = ''
  document.getElementById('cancel-reply').style.display = 'none'
})

document.getElementById('submit-btn').addEventListener('click', async () => {
  const body = document.getElementById('comment-input').value.trim()
  if (!body) return showError('Comment cannot be empty')
  if (!token) return showError('Please log in first')
  if (!currentUrl) return showError('Page URL not available')

  try {
    await apiFetch('/comments', {
      method: 'POST',
      body: { url: currentUrl, body, parent_id: replyingTo }
    })
    document.getElementById('comment-input').value = ''
    replyingTo = null
    document.getElementById('reply-indicator').textContent = ''
    document.getElementById('cancel-reply').style.display = 'none'
    loadComments()
  } catch (err) {
    showError(err.message)
  }
})

loadAuth()