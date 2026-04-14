function toPositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return n
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

function createRateLimiter({
  windowMs,
  max,
  message = 'Too many requests',
  keyGenerator
}) {
  const hits = new Map()

  // Periodic cleanup to prevent unbounded growth.
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits.entries()) {
      if (entry.resetAt <= now) {
        hits.delete(key)
      }
    }
  }, Math.max(windowMs, 10_000)).unref()

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now()
    const key = keyGenerator ? keyGenerator(req) : getClientIp(req)
    const existing = hits.get(key)

    if (!existing || existing.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    if (existing.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
      res.set('Retry-After', String(retryAfterSeconds))
      return res.status(429).json({ error: message })
    }

    existing.count += 1
    return next()
  }
}

function buildRateLimitsFromEnv() {
  return {
    signup: createRateLimiter({
      windowMs: toPositiveInt(process.env.RL_SIGNUP_WINDOW_MS, 15 * 60 * 1000),
      max: toPositiveInt(process.env.RL_SIGNUP_MAX, 10),
      message: 'Too many signup attempts. Please try again later.'
    }),
    login: createRateLimiter({
      windowMs: toPositiveInt(process.env.RL_LOGIN_WINDOW_MS, 15 * 60 * 1000),
      max: toPositiveInt(process.env.RL_LOGIN_MAX, 30),
      message: 'Too many login attempts. Please try again later.'
    }),
    comments: createRateLimiter({
      windowMs: toPositiveInt(process.env.RL_COMMENTS_WINDOW_MS, 60 * 1000),
      max: toPositiveInt(process.env.RL_COMMENTS_MAX, 5),
      message: 'Comment rate limit reached. Slow down and try again shortly.'
    }),
    search: createRateLimiter({
      windowMs: toPositiveInt(process.env.RL_SEARCH_WINDOW_MS, 60 * 1000),
      max: toPositiveInt(process.env.RL_SEARCH_MAX, 60),
      message: 'Search rate limit reached. Please wait a moment and retry.'
    })
  }
}

module.exports = {
  buildRateLimitsFromEnv
}
