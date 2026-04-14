const express = require('express')
const router = express.Router()
const db = require('./db')
const { signup, login, requireAuth } = require('./auth')

function normalizeUrl(url) {
  try {
    const u = new URL(url)
    u.searchParams.delete('utm_source')
    u.searchParams.delete('utm_medium')
    u.searchParams.delete('utm_campaign')
    u.searchParams.delete('utm_term')
    u.searchParams.delete('utm_content')
    u.hash = ''
    return u.toString().replace(/\/$/, '').toLowerCase()
  } catch {
    return url.toLowerCase().trim()
  }
}

// Auth routes
router.post('/auth/signup', (req, res) => {
  try {
    const { username, email, password } = req.body
    if (!username || !email || !password)
      return res.status(400).json({ error: 'All fields required' })
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    const user = signup(username, email, password)
    res.json({ success: true, user })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/auth/login', (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' })
    const result = login(email, password)
    res.json(result)
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
})

// Get comments for a URL
router.get('/comments', (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'URL required' })
  const normalized = normalizeUrl(url)
  const comments = db.prepare(`
    SELECT c.id, c.body, c.parent_id, c.created_at,
           u.username, u.id as user_id
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.url_normalized = ?
    ORDER BY c.created_at ASC
  `).all(normalized)
  res.json({ url: normalized, comments })
})

// Post a comment
router.post('/comments', requireAuth, (req, res) => {
  const { url, body, parent_id } = req.body
  if (!url || !body)
    return res.status(400).json({ error: 'URL and body required' })
  if (body.trim().length < 1)
    return res.status(400).json({ error: 'Comment cannot be empty' })
  if (body.length > 10000)
    return res.status(400).json({ error: 'Comment too long' })
  const normalized = normalizeUrl(url)
  const result = db.prepare(`
    INSERT INTO comments (url, url_normalized, body, user_id, parent_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(url, normalized, body.trim(), req.user.id, parent_id || null)
  const comment = db.prepare(`
    SELECT c.id, c.body, c.parent_id, c.created_at,
           u.username, u.id as user_id
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid)
  res.json(comment)
})

// Get top commented URLs (the front page feed)
router.get('/feed', (req, res) => {
  const sites = db.prepare(`
    SELECT url, url_normalized,
           COUNT(*) as comment_count,
           MAX(created_at) as last_activity
    FROM comments
    GROUP BY url_normalized
    ORDER BY comment_count DESC
    LIMIT 50
  `).all()
  res.json(sites)
})

module.exports = router