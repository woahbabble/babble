const express = require('express')
const router = express.Router()
const db = require('./db')
const { signup, login, requireAuth, optionalAuth } = require('./auth')
const { buildRateLimitsFromEnv } = require('./rateLimit')
const rateLimits = buildRateLimitsFromEnv()

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

function parsePositiveInt(value, fallback, max = 100) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, max)
}

function normalizeCommentBody(text) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

function sanitizeText(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\u0000/g, '')
    .trim()
}

function normalizeTag(tag) {
  return tag.trim().toLowerCase()
}

function normalizeDomain(domain) {
  const value = (domain || '').toString().trim().toLowerCase()
  if (!value) return ''
  return value.replace(/^\*\./, '').replace(/\.$/, '')
}

function normalizeLayerId(layerId) {
  const value = (layerId || '').toString().trim().toLowerCase()
  if (!value) return 'public'
  if (!/^[a-z0-9_-]{1,32}$/.test(value)) return 'public'
  return value
}

function luhnValid(number) {
  let sum = 0
  let shouldDouble = false
  for (let i = number.length - 1; i >= 0; i -= 1) {
    let digit = Number.parseInt(number[i], 10)
    if (shouldDouble) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    shouldDouble = !shouldDouble
  }
  return sum % 10 === 0
}

function detectPiiSignals(text) {
  const value = String(text || '')
  const phonePattern = /(?:\+?\d[\d().\s-]{7,}\d)/g
  const addressPattern = /\b\d{1,5}\s+[a-z0-9.'-]+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct)\b/i
  const ccCandidatePattern = /\b(?:\d[ -]*?){13,19}\b/g

  const ccMatches = value.match(ccCandidatePattern) || []
  let hasCreditCard = false
  for (const match of ccMatches) {
    const digits = match.replace(/\D/g, '')
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      hasCreditCard = true
      break
    }
  }

  return {
    hasCreditCard,
    hasPhone: phonePattern.test(value),
    hasAddress: addressPattern.test(value)
  }
}

function buildArchiveUrl(url) {
  return `https://web.archive.org/web/*/${url}`
}

function buildArchiveCandidates(url) {
  const encoded = encodeURIComponent(url)
  return [
    { label: 'Wayback Machine', url: `https://web.archive.org/web/*/${url}`, provider: 'wayback' },
    { label: 'Archive.today', url: `https://archive.today/?run=1&url=${encoded}`, provider: 'archive_today' },
    { label: 'Archive.ph', url: `https://archive.ph/?run=1&url=${encoded}`, provider: 'archive_ph' },
    { label: 'Archive.is', url: `https://archive.is/?run=1&url=${encoded}`, provider: 'archive_is' }
  ]
}

function ensureThreadArchive(url, normalized) {
  const existing = db.prepare(`
    SELECT archive_url
    FROM threads
    WHERE url_normalized = ?
  `).get(normalized)
  if (existing) return existing.archive_url

  const archiveUrl = buildArchiveUrl(url)
  db.prepare(`
    INSERT INTO threads (url, url_normalized, archive_url)
    VALUES (?, ?, ?)
  `).run(url, normalized, archiveUrl)
  return archiveUrl
}

function requireAdmin(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN || ''
  if (!adminToken) {
    return res.status(503).json({ error: 'Admin mode not configured' })
  }
  const token = req.headers['x-admin-token']
  if (!token || token !== adminToken) {
    return res.status(403).json({ error: 'Admin access denied' })
  }
  return next()
}

function applyShadowBanByReputation(userId) {
  const user = db.prepare(`
    SELECT id, reputation
    FROM users
    WHERE id = ?
  `).get(userId)
  if (!user) return null
  const shouldShadowBan = user.reputation < 0
  db.prepare(`
    UPDATE users
    SET is_shadow_banned = ?
    WHERE id = ?
  `).run(shouldShadowBan ? 1 : 0, userId)
  return { userId, reputation: user.reputation, is_shadow_banned: shouldShadowBan }
}

// Auth routes
router.post('/auth/signup', rateLimits.signup, (req, res) => {
  try {
    const { username, email, password } = req.body
    if (!username || !email || !password)
      return res.status(400).json({ error: 'All fields required' })
    if (password.length < 12)
      return res.status(400).json({ error: 'Password must be at least 12 characters' })
    const user = signup(username, email, password)
    // Auto-login after successful signup
    const { login } = require('./auth')
    const result = login(user.email, password)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/auth/login', rateLimits.login, (req, res) => {
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
router.get('/comments', optionalAuth, (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'URL required' })
  const normalized = normalizeUrl(url)
  const mode = req.query.mode === 'pit' || req.query.view_mode === 'pit' ? 'pit' : 'default'
  const sort = ['oldest', 'newest', 'top'].includes(req.query.sort) ? req.query.sort : 'oldest'
  const userId = req.user?.id || null
  const orderBy = sort === 'newest'
    ? 'c.created_at DESC'
    : sort === 'top'
      ? 'score DESC, c.created_at ASC'
      : 'c.created_at ASC'
  const comments = db.prepare(`
    SELECT c.id, c.body, c.parent_id, c.created_at,
           CASE WHEN u.is_deleted = 1 THEN '[deleted]' ELSE u.username END as username,
           u.id as user_id,
           u.reputation, u.is_shadow_banned,
           COALESCE(vs.score, 0) as score,
           uv.vote as user_vote,
           c.anchor_text, c.anchor_selector,
           c.is_low_quality, c.is_the_pit, c.layer_id
    FROM comments c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN (
      SELECT comment_id, SUM(vote) as score
      FROM comment_votes
      GROUP BY comment_id
    ) vs ON vs.comment_id = c.id
    LEFT JOIN comment_votes uv
      ON uv.comment_id = c.id AND uv.user_id = ?
    WHERE c.url_normalized = ? AND c.is_removed = 0
      AND (
        ? = 'pit'
        OR (
          c.is_low_quality = 0
          AND u.is_shadow_banned = 0
        )
      )
    ORDER BY ${orderBy}
  `).all(userId, normalized, mode)
  const archive = db.prepare(`
    SELECT archive_url
    FROM threads
    WHERE url_normalized = ?
  `).get(normalized)
  res.json({
    url: normalized,
    archive_url: archive?.archive_url || null,
    archive_links: buildArchiveCandidates(url),
    mode,
    view_mode: mode,
    sort,
    comments: comments.map((comment) => ({
      ...comment,
      user_vote: comment.user_vote || 0,
      is_low_quality: Boolean(comment.is_low_quality),
      is_the_pit: Boolean(comment.is_the_pit),
      is_shadow_banned: Boolean(comment.is_shadow_banned),
      is_hidden_by_default: Boolean(comment.is_low_quality || comment.is_shadow_banned)
    }))
  })
})

router.get('/me/profile', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, username, email, bio, reputation, is_shadow_banned, is_deleted, created_at
    FROM users
    WHERE id = ?
  `).get(req.user.id)
  if (!user || user.is_deleted) return res.status(404).json({ error: 'User not found' })
  res.json({ user })
})

router.post('/me/profile', requireAuth, (req, res) => {
  const bio = (req.body.bio || '').toString().trim()
  if (bio.length > 400) return res.status(400).json({ error: 'Bio too long (max 400 chars)' })
  db.prepare(`
    UPDATE users
    SET bio = ?
    WHERE id = ? AND is_deleted = 0
  `).run(bio, req.user.id)
  const user = db.prepare(`
    SELECT id, username, email, bio, reputation, is_shadow_banned, is_deleted, created_at
    FROM users
    WHERE id = ?
  `).get(req.user.id)
  if (!user || user.is_deleted) return res.status(404).json({ error: 'User not found' })
  res.json({ ok: true, user })
})

// Post a comment
router.post('/comments', requireAuth, rateLimits.comments, (req, res) => {
  try {
    const { url, body, parent_id, anchor_text, anchor_selector, layer_id } = req.body
    if (!url || !body)
      return res.status(400).json({ error: 'URL and body required' })
    if (body.trim().length < 1)
      return res.status(400).json({ error: 'Comment cannot be empty' })
    if (body.length > 10000)
      return res.status(400).json({ error: 'Comment too long' })

    const normalized = normalizeUrl(url)
    const cleanedBody = sanitizeText(body)
    const bodyNormalized = normalizeCommentBody(cleanedBody)
    const cleanedAnchorText = anchor_text ? String(anchor_text).trim() : null
    const cleanedAnchorSelector = anchor_selector ? String(anchor_selector).trim() : null
    const cleanedLayerId = normalizeLayerId(layer_id)
    if (cleanedAnchorText && cleanedAnchorText.length > 500) {
      return res.status(400).json({ error: 'anchor_text too long' })
    }
    if (cleanedAnchorSelector && cleanedAnchorSelector.length > 500) {
      return res.status(400).json({ error: 'anchor_selector too long' })
    }

    const pii = detectPiiSignals(cleanedBody)
    if (pii.hasCreditCard) {
      return res.status(400).json({ error: 'Comment blocked: possible credit card number detected' })
    }

    const author = db.prepare(`
      SELECT id, is_shadow_banned
      FROM users
      WHERE id = ?
    `).get(req.user.id)
    if (!author) return res.status(401).json({ error: 'Invalid user' })

    const autoLowQuality = pii.hasPhone || pii.hasAddress
    const autoPit = autoLowQuality || Boolean(author.is_shadow_banned)

    const archiveUrl = ensureThreadArchive(url, normalized)

    const result = db.prepare(`
      INSERT INTO comments (
        url, url_normalized, body, body_normalized, user_id, parent_id,
        anchor_text, anchor_selector, is_low_quality, is_the_pit, layer_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      url,
      normalized,
      cleanedBody,
      bodyNormalized,
      req.user.id,
      parent_id || null,
      cleanedAnchorText,
      cleanedAnchorSelector,
      autoLowQuality ? 1 : 0,
      autoPit ? 1 : 0,
      cleanedLayerId
    )

    const comment = db.prepare(`
      SELECT c.id, c.body, c.parent_id, c.created_at,
             u.username, u.id as user_id,
             u.reputation, u.is_shadow_banned,
             0 as score,
             0 as user_vote,
             c.anchor_text, c.anchor_selector,
             c.is_low_quality, c.is_the_pit, c.layer_id
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid)
    res.json({
      ...comment,
      archive_url: archiveUrl,
      moderation: {
        pii_flagged: autoLowQuality,
        auto_pit: autoPit
      },
      is_low_quality: Boolean(comment.is_low_quality),
      is_the_pit: Boolean(comment.is_the_pit),
      is_shadow_banned: Boolean(comment.is_shadow_banned),
      is_hidden_by_default: Boolean(comment.is_low_quality || comment.is_shadow_banned)
    })
  } catch (err) {
    if (err.message.includes('idx_comments_unique_thread_body')) {
      return res.status(409).json({ error: 'This exact comment already exists on this thread' })
    }
    res.status(500).json({ error: 'Failed to save comment' })
  }
})

router.post('/comments/:id/vote', requireAuth, (req, res) => {
  const commentId = Number.parseInt(req.params.id, 10)
  const vote = Number.parseInt(req.body.vote, 10)
  if (!Number.isFinite(commentId) || commentId < 1) {
    return res.status(400).json({ error: 'Valid comment id required' })
  }
  if (![1, -1, 0].includes(vote)) {
    return res.status(400).json({ error: 'vote must be 1, -1, or 0' })
  }

  const comment = db.prepare(`
    SELECT c.id, c.is_removed, c.user_id, u.reputation
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(commentId)
  if (!comment || comment.is_removed) {
    return res.status(404).json({ error: 'Comment not found' })
  }
  if (comment.user_id === req.user.id) {
    return res.status(400).json({ error: 'You cannot vote on your own comment' })
  }

  const previousVoteRow = db.prepare(`
    SELECT vote
    FROM comment_votes
    WHERE comment_id = ? AND user_id = ?
  `).get(commentId, req.user.id)
  const previousVote = previousVoteRow?.vote || 0

  if (vote === 0) {
    db.prepare(`
      DELETE FROM comment_votes
      WHERE comment_id = ? AND user_id = ?
    `).run(commentId, req.user.id)
  } else {
    db.prepare(`
      INSERT INTO comment_votes (comment_id, user_id, vote)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, comment_id)
      DO UPDATE SET vote = excluded.vote, created_at = CURRENT_TIMESTAMP
    `).run(commentId, req.user.id, vote)
  }

  const reputationDelta = vote - previousVote
  if (reputationDelta !== 0) {
    const newReputation = comment.reputation + reputationDelta
    db.prepare(`
      UPDATE users
      SET reputation = ?
      WHERE id = ?
    `).run(newReputation, comment.user_id)
    applyShadowBanByReputation(comment.user_id)
  }

  const score = db.prepare(`
    SELECT COALESCE(SUM(vote), 0) as score
    FROM comment_votes
    WHERE comment_id = ?
  `).get(commentId).score

  const userVoteRow = db.prepare(`
    SELECT vote
    FROM comment_votes
    WHERE comment_id = ? AND user_id = ?
  `).get(commentId, req.user.id)

  if (score <= -10) {
    db.prepare(`
      UPDATE comments
      SET is_low_quality = 1,
          is_the_pit = 1
      WHERE id = ?
    `).run(commentId)
  }

  return res.json({ comment_id: commentId, score, user_vote: userVoteRow?.vote || 0 })
})

router.post('/comments/:id/report', requireAuth, (req, res) => {
  const commentId = Number.parseInt(req.params.id, 10)
  const reason = (req.body.reason || 'reported').toString().trim()
  if (!Number.isFinite(commentId) || commentId < 1) {
    return res.status(400).json({ error: 'Valid comment id required' })
  }
  if (reason.length > 500) return res.status(400).json({ error: 'Reason too long' })

  const comment = db.prepare(`
    SELECT c.id, c.user_id, c.is_removed
    FROM comments c
    WHERE c.id = ?
  `).get(commentId)
  if (!comment || comment.is_removed) return res.status(404).json({ error: 'Comment not found' })

  try {
    db.prepare(`
      INSERT INTO comment_flags (comment_id, reporter_user_id, reason)
      VALUES (?, ?, ?)
    `).run(commentId, req.user.id, reason || 'reported')
  } catch (err) {
    if (err.message.includes('idx_flags_unique_reporter_comment')) {
      return res.status(409).json({ error: 'You have already reported this comment' })
    }
    return res.status(500).json({ error: 'Failed to submit report' })
  }

  // Slight reputation penalty for reported comment author.
  db.prepare(`
    UPDATE users
    SET reputation = reputation - 2
    WHERE id = ?
  `).run(comment.user_id)
  const moderationState = applyShadowBanByReputation(comment.user_id)

  // Auto-mark reported comments as low quality and pit-facing.
  db.prepare(`
    UPDATE comments
    SET is_low_quality = 1,
        is_the_pit = 1
    WHERE id = ?
  `).run(commentId)

  res.json({
    ok: true,
    comment_id: commentId,
    moderation: moderationState
  })
})

// Get top commented URLs (the front page feed)
router.get('/feed', (req, res) => {
  const includeMeta = req.query.include_meta === '1'
  const rawSort = (req.query.sort || '').toString().trim().toLowerCase()
  const sortAliases = { top: 'popular', trending: 'popular', most_liked: 'popular' }
  const sort = ['active', 'popular', 'newest', 'oldest'].includes(rawSort)
    ? rawSort
    : sortAliases[rawSort] || 'popular'
  const tag = req.query.tag ? normalizeTag(String(req.query.tag)) : ''
  const page = parsePositiveInt(req.query.page, 1, 10000)
  const pageSize = parsePositiveInt(req.query.page_size, 25, 100)
  const offset = (page - 1) * pageSize

  const orderBy = sort === 'active'
    ? 'last_activity DESC, comment_count DESC'
    : sort === 'newest'
      ? 'last_activity DESC, comment_count DESC'
      : sort === 'oldest'
        ? 'first_activity ASC, comment_count DESC'
        : sort === 'popular'
      ? 'comment_count DESC, last_activity DESC'
      : 'comment_count DESC, last_activity DESC'

  const items = tag
    ? db.prepare(`
      SELECT c.url, c.url_normalized, t.archive_url,
             COUNT(*) as comment_count,
             MAX(c.created_at) as last_activity,
             MIN(c.created_at) as first_activity,
             CAST(COUNT(*) AS REAL) / MAX(((julianday('now') - julianday(MIN(c.created_at))) * 24.0), 1.0) as activity_density
      FROM comments c
      JOIN site_tags st ON st.url_normalized = c.url_normalized
      LEFT JOIN threads t ON t.url_normalized = c.url_normalized
      WHERE c.is_removed = 0 AND st.tag = ?
      GROUP BY c.url_normalized
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(tag, pageSize, offset)
    : db.prepare(`
      SELECT c.url, c.url_normalized, t.archive_url,
             COUNT(*) as comment_count,
             MAX(c.created_at) as last_activity,
             MIN(c.created_at) as first_activity,
             CAST(COUNT(*) AS REAL) / MAX(((julianday('now') - julianday(MIN(c.created_at))) * 24.0), 1.0) as activity_density
      FROM comments c
      LEFT JOIN threads t ON t.url_normalized = c.url_normalized
      WHERE c.is_removed = 0
      GROUP BY c.url_normalized
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(pageSize, offset)

  const tagRows = items.length
    ? db.prepare(`
      SELECT url_normalized, tag, COUNT(*) as votes
      FROM site_tags
      WHERE url_normalized IN (${items.map(() => '?').join(',')})
      GROUP BY url_normalized, tag
      ORDER BY votes DESC, tag ASC
    `).all(...items.map((item) => item.url_normalized))
    : []
  const tagsByUrl = {}
  for (const row of tagRows) {
    if (!tagsByUrl[row.url_normalized]) tagsByUrl[row.url_normalized] = []
    tagsByUrl[row.url_normalized].push({ tag: row.tag, votes: row.votes })
  }
  const itemsWithTags = items.map((item) => ({
    ...item,
    tags: tagsByUrl[item.url_normalized] || []
  }))

  if (!includeMeta) {
    return res.json(itemsWithTags)
  }

  const totalItems = tag
    ? db.prepare(`
      SELECT COUNT(*) as count
      FROM (
        SELECT 1
        FROM comments c
        JOIN site_tags st ON st.url_normalized = c.url_normalized
        WHERE c.is_removed = 0 AND st.tag = ?
        GROUP BY c.url_normalized
      )
    `).get(tag).count
    : db.prepare(`
      SELECT COUNT(*) as count
      FROM (SELECT 1 FROM comments WHERE is_removed = 0 GROUP BY url_normalized)
    `).get().count
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const availableTags = db.prepare(`
    SELECT tag, COUNT(DISTINCT url_normalized) as thread_count
    FROM site_tags
    GROUP BY tag
    ORDER BY thread_count DESC, tag ASC
    LIMIT 100
  `).all()

  res.json({
    items: itemsWithTags,
    pagination: {
      page,
      page_size: pageSize,
      total_items: totalItems,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1
    },
    sort,
    tag: tag || null,
    available_tags: availableTags
  })
})

// Get public user profile and recent comments
router.get('/users/:username', (req, res) => {
  const { username } = req.params
  const sort = ['oldest', 'newest'].includes(req.query.sort) ? req.query.sort : 'newest'
  const orderBy = sort === 'oldest' ? 'c.created_at ASC' : 'c.created_at DESC'
  const user = db.prepare(`
    SELECT id, username, bio, reputation, created_at, is_deleted
    FROM users
    WHERE LOWER(username) = LOWER(?)
  `).get(username)

  if (!user || user.is_deleted) return res.status(404).json({ error: 'User not found' })

  const stats = db.prepare(`
    SELECT COUNT(*) as total_comments,
           COUNT(DISTINCT url_normalized) as threads_participated
    FROM comments
    WHERE user_id = ? AND is_removed = 0
  `).get(user.id)

  const comments = db.prepare(`
    SELECT c.id, c.body, c.parent_id, c.created_at, c.url, c.url_normalized
    FROM comments c
    WHERE c.user_id = ? AND c.is_removed = 0
    ORDER BY ${orderBy}
    LIMIT 100
  `).all(user.id)

  res.json({
    user: {
      id: user.id,
      username: user.username,
      bio: user.bio,
      reputation: user.reputation,
      created_at: user.created_at
    },
    stats,
    comments,
    sort
  })
})

router.get('/users/:username/comments', (req, res) => {
  const { username } = req.params
  const limit = parsePositiveInt(req.query.limit, 20, 100)
  const offset = Math.max(0, Number.parseInt(req.query.offset || '0', 10) || 0)
  const user = db.prepare(`
    SELECT id, username, is_deleted
    FROM users
    WHERE LOWER(username) = LOWER(?)
  `).get(username)
  if (!user || user.is_deleted) return res.status(404).json({ error: 'User not found' })

  const comments = db.prepare(`
    SELECT c.id, c.body, c.created_at, c.url, c.url_normalized
    FROM comments c
    WHERE c.user_id = ? AND c.is_removed = 0
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(user.id, limit, offset)

  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM comments
    WHERE user_id = ? AND is_removed = 0
  `).get(user.id).count

  res.json({
    username: user.username,
    limit,
    offset,
    total,
    comments
  })
})

// Search URLs and comments
router.get('/search', rateLimits.search, (req, res) => {
  const q = (req.query.q || '').toString().trim()
  if (!q) return res.status(400).json({ error: 'Query required' })
  if (q.length < 2) return res.status(400).json({ error: 'Query too short' })

  const like = `%${q.toLowerCase()}%`
  const tag = req.query.tag ? normalizeTag(String(req.query.tag)) : ''
  const threadPage = parsePositiveInt(req.query.thread_page, 1, 10000)
  const threadPageSize = parsePositiveInt(req.query.thread_page_size, 25, 100)
  const commentPage = parsePositiveInt(req.query.comment_page, 1, 10000)
  const commentPageSize = parsePositiveInt(req.query.comment_page_size, 50, 200)
  const threadOffset = (threadPage - 1) * threadPageSize
  const commentOffset = (commentPage - 1) * commentPageSize

  const threads = tag
    ? db.prepare(`
      SELECT c.url, c.url_normalized, t.archive_url,
             COUNT(*) as comment_count,
             MAX(c.created_at) as last_activity
      FROM comments c
      JOIN site_tags st ON st.url_normalized = c.url_normalized
      LEFT JOIN threads t ON t.url_normalized = c.url_normalized
      WHERE LOWER(c.url_normalized) LIKE ? AND c.is_removed = 0 AND st.tag = ?
      GROUP BY c.url_normalized
      ORDER BY comment_count DESC, last_activity DESC
      LIMIT ? OFFSET ?
    `).all(like, tag, threadPageSize, threadOffset)
    : db.prepare(`
      SELECT c.url, c.url_normalized, t.archive_url,
             COUNT(*) as comment_count,
             MAX(c.created_at) as last_activity
      FROM comments c
      LEFT JOIN threads t ON t.url_normalized = c.url_normalized
      WHERE LOWER(c.url_normalized) LIKE ? AND c.is_removed = 0
      GROUP BY c.url_normalized
      ORDER BY comment_count DESC, last_activity DESC
      LIMIT ? OFFSET ?
    `).all(like, threadPageSize, threadOffset)

  const threadTagRows = threads.length
    ? db.prepare(`
      SELECT url_normalized, tag, COUNT(*) as votes
      FROM site_tags
      WHERE url_normalized IN (${threads.map(() => '?').join(',')})
      GROUP BY url_normalized, tag
      ORDER BY votes DESC, tag ASC
    `).all(...threads.map((item) => item.url_normalized))
    : []
  const threadTagsByUrl = {}
  for (const row of threadTagRows) {
    if (!threadTagsByUrl[row.url_normalized]) threadTagsByUrl[row.url_normalized] = []
    threadTagsByUrl[row.url_normalized].push({ tag: row.tag, votes: row.votes })
  }
  const threadsWithTags = threads.map((item) => ({
    ...item,
    tags: threadTagsByUrl[item.url_normalized] || []
  }))

  const totalThreads = tag
    ? db.prepare(`
      SELECT COUNT(*) as count
      FROM (
        SELECT 1
        FROM comments c
        JOIN site_tags st ON st.url_normalized = c.url_normalized
        WHERE LOWER(c.url_normalized) LIKE ? AND c.is_removed = 0 AND st.tag = ?
        GROUP BY c.url_normalized
      )
    `).get(like, tag).count
    : db.prepare(`
      SELECT COUNT(*) as count
      FROM (
        SELECT 1
        FROM comments
        WHERE LOWER(url_normalized) LIKE ? AND is_removed = 0
        GROUP BY url_normalized
      )
    `).get(like).count

  const comments = tag
    ? db.prepare(`
      SELECT c.id, c.body, c.created_at, c.url_normalized,
             CASE WHEN u.is_deleted = 1 THEN '[deleted]' ELSE u.username END as username
      FROM comments c
      JOIN users u ON u.id = c.user_id
      JOIN site_tags st ON st.url_normalized = c.url_normalized
      WHERE c.is_removed = 0
        AND st.tag = ?
        AND (LOWER(c.body) LIKE ? OR LOWER(c.url_normalized) LIKE ?)
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).all(tag, like, like, commentPageSize, commentOffset)
    : db.prepare(`
      SELECT c.id, c.body, c.created_at, c.url_normalized,
             CASE WHEN u.is_deleted = 1 THEN '[deleted]' ELSE u.username END as username
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.is_removed = 0 AND (LOWER(c.body) LIKE ? OR LOWER(c.url_normalized) LIKE ?)
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).all(like, like, commentPageSize, commentOffset)

  const totalComments = tag
    ? db.prepare(`
      SELECT COUNT(*) as count
      FROM comments c
      JOIN site_tags st ON st.url_normalized = c.url_normalized
      WHERE c.is_removed = 0
        AND st.tag = ?
        AND (LOWER(c.body) LIKE ? OR LOWER(c.url_normalized) LIKE ?)
    `).get(tag, like, like).count
    : db.prepare(`
      SELECT COUNT(*) as count
      FROM comments c
      WHERE c.is_removed = 0 AND (LOWER(c.body) LIKE ? OR LOWER(c.url_normalized) LIKE ?)
    `).get(like, like).count

  const availableTags = db.prepare(`
    SELECT tag, COUNT(DISTINCT url_normalized) as thread_count
    FROM site_tags
    GROUP BY tag
    ORDER BY thread_count DESC, tag ASC
    LIMIT 100
  `).all()

  res.json({
    q,
    threads: threadsWithTags,
    comments,
    tag: tag || null,
    available_tags: availableTags,
    pagination: {
      threads: {
        page: threadPage,
        page_size: threadPageSize,
        total_items: totalThreads,
        total_pages: Math.max(1, Math.ceil(totalThreads / threadPageSize)),
        has_next: threadPage * threadPageSize < totalThreads,
        has_prev: threadPage > 1
      },
      comments: {
        page: commentPage,
        page_size: commentPageSize,
        total_items: totalComments,
        total_pages: Math.max(1, Math.ceil(totalComments / commentPageSize)),
        has_next: commentPage * commentPageSize < totalComments,
        has_prev: commentPage > 1
      }
    }
  })
})

router.get('/subscriptions', requireAuth, (req, res) => {
  const items = db.prepare(`
    SELECT domain, created_at
    FROM subscriptions
    WHERE user_id = ?
    ORDER BY domain ASC
  `).all(req.user.id)
  res.json({ subscriptions: items })
})

router.post('/subscribe', requireAuth, (req, res) => {
  const input = (req.body.hostname || req.body.domain || '').toString().trim()
  let domain = normalizeDomain(input)
  if (!domain) return res.status(400).json({ error: 'hostname required' })
  // If user passed a URL, extract hostname.
  if (domain.includes('://')) {
    try {
      domain = new URL(domain).hostname.toLowerCase()
    } catch {
      return res.status(400).json({ error: 'Invalid hostname' })
    }
  }
  if (!/^[a-z0-9.-]+$/.test(domain) || !domain.includes('.')) {
    return res.status(400).json({ error: 'Invalid hostname' })
  }

  try {
    db.prepare(`
      INSERT INTO subscriptions (user_id, domain)
      VALUES (?, ?)
    `).run(req.user.id, domain)
  } catch (err) {
    if (err.message.includes('idx_subscriptions_unique_user_domain')) {
      return res.status(409).json({ error: 'Already subscribed to this domain' })
    }
    return res.status(500).json({ error: 'Failed to subscribe' })
  }

  const subscriptions = db.prepare(`
    SELECT domain
    FROM subscriptions
    WHERE user_id = ?
    ORDER BY domain ASC
  `).all(req.user.id)
  res.json({ ok: true, subscriptions })
})

router.delete('/subscribe', requireAuth, (req, res) => {
  const domain = normalizeDomain((req.body.domain || '').toString())
  if (!domain) return res.status(400).json({ error: 'domain required' })
  db.prepare(`
    DELETE FROM subscriptions
    WHERE user_id = ? AND domain = ?
  `).run(req.user.id, domain)
  res.json({ ok: true })
})

router.get('/feed/subscriptions', requireAuth, (req, res) => {
  const includeMeta = req.query.include_meta === '1'
  const rawSort = (req.query.sort || '').toString().trim().toLowerCase()
  const sortAliases = { top: 'popular', trending: 'popular', most_liked: 'popular' }
  const sort = ['active', 'popular', 'newest', 'oldest'].includes(rawSort)
    ? rawSort
    : sortAliases[rawSort] || 'popular'
  const page = parsePositiveInt(req.query.page, 1, 10000)
  const pageSize = parsePositiveInt(req.query.page_size, 25, 100)
  const offset = (page - 1) * pageSize
  const orderBy = sort === 'active'
    ? 'last_activity DESC, comment_count DESC'
    : sort === 'newest'
      ? 'last_activity DESC, comment_count DESC'
      : sort === 'oldest'
        ? 'first_activity ASC, comment_count DESC'
        : sort === 'popular'
      ? 'comment_count DESC, last_activity DESC'
      : 'comment_count DESC, last_activity DESC'

  const domains = db.prepare(`
    SELECT domain
    FROM subscriptions
    WHERE user_id = ?
  `).all(req.user.id).map((row) => row.domain)
  if (!domains.length) {
    return res.json({
      items: [],
      pagination: { page, page_size: pageSize, total_items: 0, total_pages: 1, has_next: false, has_prev: false },
      sort,
      source: 'subscriptions'
    })
  }

  const domainCondition = domains
    .map(() => `(c.url_normalized LIKE ? OR c.url_normalized LIKE ?)`)
    .join(' OR ')
  const domainParams = domains.flatMap((domain) => [`http://${domain}/%`, `https://${domain}/%`])

  const items = db.prepare(`
    SELECT c.url, c.url_normalized, t.archive_url,
           COUNT(*) as comment_count,
           MAX(c.created_at) as last_activity,
           MIN(c.created_at) as first_activity,
           CAST(COUNT(*) AS REAL) / MAX(((julianday('now') - julianday(MIN(c.created_at))) * 24.0), 1.0) as activity_density
    FROM comments c
    LEFT JOIN threads t ON t.url_normalized = c.url_normalized
    WHERE c.is_removed = 0 AND (${domainCondition})
    GROUP BY c.url_normalized
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...domainParams, pageSize, offset)

  const tagRows = items.length
    ? db.prepare(`
      SELECT url_normalized, tag, COUNT(*) as votes
      FROM site_tags
      WHERE url_normalized IN (${items.map(() => '?').join(',')})
      GROUP BY url_normalized, tag
      ORDER BY votes DESC, tag ASC
    `).all(...items.map((item) => item.url_normalized))
    : []
  const tagsByUrl = {}
  for (const row of tagRows) {
    if (!tagsByUrl[row.url_normalized]) tagsByUrl[row.url_normalized] = []
    tagsByUrl[row.url_normalized].push({ tag: row.tag, votes: row.votes })
  }
  const itemsWithTags = items.map((item) => ({
    ...item,
    tags: tagsByUrl[item.url_normalized] || []
  }))

  if (!includeMeta) return res.json(itemsWithTags)

  const totalItems = db.prepare(`
    SELECT COUNT(*) as count
    FROM (
      SELECT 1
      FROM comments c
      WHERE c.is_removed = 0 AND (${domainCondition})
      GROUP BY c.url_normalized
    )
  `).get(...domainParams).count
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  res.json({
    items: itemsWithTags,
    pagination: {
      page,
      page_size: pageSize,
      total_items: totalItems,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1
    },
    sort,
    source: 'subscriptions'
  })
})

router.post('/me/reset-history', requireAuth, (req, res) => {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM comment_votes WHERE user_id = ?`).run(req.user.id)
    db.prepare(`DELETE FROM site_tags WHERE user_id = ?`).run(req.user.id)
    db.prepare(`DELETE FROM subscriptions WHERE user_id = ?`).run(req.user.id)
    db.prepare(`DELETE FROM comment_flags WHERE reporter_user_id = ?`).run(req.user.id)
    db.prepare(`
      UPDATE comments
      SET body = '[history reset]',
          body_normalized = '[history reset]#' || id,
          anchor_text = NULL,
          anchor_selector = NULL,
          is_low_quality = 0,
          is_the_pit = 0
      WHERE user_id = ? AND is_removed = 0
    `).run(req.user.id)
  })
  tx()
  res.json({ ok: true })
})

router.delete('/me/profile', requireAuth, (req, res) => {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM comment_votes WHERE user_id = ?`).run(req.user.id)
    db.prepare(`DELETE FROM site_tags WHERE user_id = ?`).run(req.user.id)
    db.prepare(`DELETE FROM subscriptions WHERE user_id = ?`).run(req.user.id)
    db.prepare(`DELETE FROM comment_flags WHERE reporter_user_id = ?`).run(req.user.id)
    db.prepare(`
      UPDATE users
      SET username = ?,
          email = ?,
          password = ?,
          bio = '',
          reputation = 0,
          is_shadow_banned = 1,
          is_deleted = 1
      WHERE id = ?
    `).run(
      `deleted_${req.user.id}`,
      `deleted_${req.user.id}@invalid.local`,
      '!',
      req.user.id
    )
  })
  tx()
  res.json({ ok: true })
})

router.get('/tags', (req, res) => {
  const url = (req.query.url || '').toString().trim()
  if (!url) return res.status(400).json({ error: 'URL required' })
  const normalized = normalizeUrl(url)
  const tags = db.prepare(`
    SELECT tag, COUNT(*) as votes
    FROM site_tags
    WHERE url_normalized = ?
    GROUP BY tag
    ORDER BY votes DESC, tag ASC
  `).all(normalized)
  res.json({ url: normalized, tags })
})

router.post('/tags', requireAuth, (req, res) => {
  const url = (req.body.url || '').toString().trim()
  const tag = normalizeTag((req.body.tag || '').toString())
  if (!url) return res.status(400).json({ error: 'URL required' })
  if (!tag) return res.status(400).json({ error: 'Tag required' })
  if (!/^[a-z0-9-]{2,30}$/.test(tag)) {
    return res.status(400).json({ error: 'Tag must be 2-30 chars: lowercase letters, numbers, hyphen' })
  }
  const normalized = normalizeUrl(url)
  try {
    db.prepare(`
      INSERT INTO site_tags (url_normalized, tag, user_id)
      VALUES (?, ?, ?)
    `).run(normalized, tag, req.user.id)
  } catch (err) {
    if (err.message.includes('idx_site_tags_unique_user_url_tag')) {
      return res.status(409).json({ error: 'You already added this tag to this site' })
    }
    return res.status(500).json({ error: 'Failed to add tag' })
  }
  const tags = db.prepare(`
    SELECT tag, COUNT(*) as votes
    FROM site_tags
    WHERE url_normalized = ?
    GROUP BY tag
    ORDER BY votes DESC, tag ASC
  `).all(normalized)
  return res.json({ url: normalized, tags })
})

// Report a comment for moderation
router.post('/flags', requireAuth, (req, res) => {
  const commentId = Number.parseInt(req.body.comment_id, 10)
  const reason = (req.body.reason || '').toString().trim()
  if (!Number.isFinite(commentId) || commentId < 1) {
    return res.status(400).json({ error: 'Valid comment_id required' })
  }
  if (!reason) return res.status(400).json({ error: 'Reason required' })
  if (reason.length > 500) return res.status(400).json({ error: 'Reason too long' })

  const comment = db.prepare(`
    SELECT id, is_removed
    FROM comments
    WHERE id = ?
  `).get(commentId)
  if (!comment || comment.is_removed) {
    return res.status(404).json({ error: 'Comment not found' })
  }

  try {
    const result = db.prepare(`
      INSERT INTO comment_flags (comment_id, reporter_user_id, reason)
      VALUES (?, ?, ?)
    `).run(commentId, req.user.id, reason)
    return res.json({ id: result.lastInsertRowid, status: 'open' })
  } catch (err) {
    if (err.message.includes('idx_flags_unique_reporter_comment')) {
      return res.status(409).json({ error: 'You have already reported this comment' })
    }
    return res.status(500).json({ error: 'Failed to submit report' })
  }
})

// Admin: list reports
router.get('/admin/flags', requireAdmin, (req, res) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status)
    ? req.query.status
    : 'open'
  const page = parsePositiveInt(req.query.page, 1, 10000)
  const pageSize = parsePositiveInt(req.query.page_size, 25, 100)
  const offset = (page - 1) * pageSize

  const items = db.prepare(`
    SELECT f.id, f.comment_id, f.reason, f.status, f.created_at, f.reviewed_at, f.reviewed_by,
           reporter.username AS reporter_username,
           c.body AS comment_body, c.url, c.url_normalized, c.created_at AS comment_created_at,
           author.username AS comment_author
    FROM comment_flags f
    JOIN users reporter ON reporter.id = f.reporter_user_id
    JOIN comments c ON c.id = f.comment_id
    JOIN users author ON author.id = c.user_id
    WHERE f.status = ?
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(status, pageSize, offset)

  const totalItems = db.prepare(`
    SELECT COUNT(*) as count
    FROM comment_flags
    WHERE status = ?
  `).get(status).count

  res.json({
    items,
    pagination: {
      page,
      page_size: pageSize,
      total_items: totalItems,
      total_pages: Math.max(1, Math.ceil(totalItems / pageSize)),
      has_next: page * pageSize < totalItems,
      has_prev: page > 1
    },
    status
  })
})

// Admin: remove a comment (soft delete)
router.post('/admin/comments/:id/remove', requireAdmin, (req, res) => {
  const commentId = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(commentId) || commentId < 1) {
    return res.status(400).json({ error: 'Valid comment id required' })
  }

  const result = db.prepare(`
    UPDATE comments
    SET is_removed = 1,
        body = '[removed by moderators]',
        body_normalized = '[removed by moderators]#' || id
    WHERE id = ? AND is_removed = 0
  `).run(commentId)

  if (!result.changes) return res.status(404).json({ error: 'Comment not found or already removed' })
  return res.json({ ok: true })
})

// Admin: resolve/dismiss a report
router.post('/admin/flags/:id/review', requireAdmin, (req, res) => {
  const flagId = Number.parseInt(req.params.id, 10)
  const status = req.body.status
  if (!Number.isFinite(flagId) || flagId < 1) return res.status(400).json({ error: 'Valid flag id required' })
  if (!['resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'status must be resolved or dismissed' })
  }

  const result = db.prepare(`
    UPDATE comment_flags
    SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = 'admin'
    WHERE id = ? AND status = 'open'
  `).run(status, flagId)

  if (!result.changes) return res.status(404).json({ error: 'Open flag not found' })
  return res.json({ ok: true, status })
})

router.get('/admin/users', requireAdmin, (req, res) => {
  const shadowOnly = req.query.shadow_only === '1'
  const q = (req.query.q || '').toString().trim().toLowerCase()
  const like = `%${q}%`
  const users = shadowOnly
    ? db.prepare(`
      SELECT id, username, email, reputation, is_shadow_banned, is_deleted, created_at
      FROM users
      WHERE is_shadow_banned = 1 AND is_deleted = 0 AND (? = '' OR LOWER(username) LIKE ? OR LOWER(email) LIKE ?)
      ORDER BY reputation ASC, created_at DESC
      LIMIT 200
    `).all(q, like, like)
    : db.prepare(`
      SELECT id, username, email, reputation, is_shadow_banned, is_deleted, created_at
      FROM users
      WHERE is_deleted = 0 AND (? = '' OR LOWER(username) LIKE ? OR LOWER(email) LIKE ?)
      ORDER BY is_shadow_banned DESC, reputation ASC, created_at DESC
      LIMIT 200
    `).all(q, like, like)
  res.json({ users })
})

router.post('/admin/users/:id/restore', requireAdmin, (req, res) => {
  const userId = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(userId) || userId < 1) return res.status(400).json({ error: 'Valid user id required' })
  const reputation = Number.isFinite(Number(req.body.reputation))
    ? Number.parseInt(req.body.reputation, 10)
    : 25
  const safeReputation = Math.max(0, Math.min(10000, reputation))
  const result = db.prepare(`
    UPDATE users
    SET is_shadow_banned = 0,
        reputation = CASE WHEN reputation < ? THEN ? ELSE reputation END
    WHERE id = ?
  `).run(safeReputation, safeReputation, userId)
  if (!result.changes) return res.status(404).json({ error: 'User not found' })
  res.json({ ok: true, user_id: userId, reputation: safeReputation })
})

router.get('/admin/threads', requireAdmin, (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase()
  const like = `%${q}%`
  const threads = db.prepare(`
    SELECT t.url, t.url_normalized, t.archive_url, t.created_at,
           COUNT(c.id) as comment_count,
           SUM(CASE WHEN c.is_the_pit = 1 THEN 1 ELSE 0 END) as pit_comment_count,
           MAX(c.created_at) as last_activity
    FROM threads t
    LEFT JOIN comments c ON c.url_normalized = t.url_normalized AND c.is_removed = 0
    WHERE (? = '' OR LOWER(t.url_normalized) LIKE ?)
    GROUP BY t.url_normalized
    ORDER BY pit_comment_count DESC, last_activity DESC
    LIMIT 200
  `).all(q, like)
  res.json({ threads })
})

router.post('/admin/threads/exile', requireAdmin, (req, res) => {
  const urlNormalized = (req.body.url_normalized || '').toString().trim().toLowerCase()
  if (!urlNormalized) return res.status(400).json({ error: 'url_normalized required' })
  const result = db.prepare(`
    UPDATE comments
    SET is_the_pit = 1,
        is_low_quality = 1
    WHERE url_normalized = ? AND is_removed = 0
  `).run(urlNormalized)
  res.json({ ok: true, url_normalized: urlNormalized, affected_comments: result.changes })
})

router.post('/admin/threads/restore', requireAdmin, (req, res) => {
  const urlNormalized = (req.body.url_normalized || '').toString().trim().toLowerCase()
  if (!urlNormalized) return res.status(400).json({ error: 'url_normalized required' })
  const result = db.prepare(`
    UPDATE comments
    SET is_the_pit = 0,
        is_low_quality = 0
    WHERE url_normalized = ? AND is_removed = 0
  `).run(urlNormalized)
  res.json({ ok: true, url_normalized: urlNormalized, affected_comments: result.changes })
})

module.exports = router