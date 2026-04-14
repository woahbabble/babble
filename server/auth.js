const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const db = require('./db')

function resolveJwtSecret() {
  const value = (process.env.JWT_SECRET || '').trim()
  if (process.env.NODE_ENV === 'production') {
    if (!value || value === 'babble-dev-secret' || value.length < 24) {
      throw new Error('JWT_SECRET must be set to a strong value in production')
    }
  }
  return value || 'babble-dev-secret'
}

const JWT_SECRET = resolveJwtSecret()

function signup(username, email, password) {
  const hashed = bcrypt.hashSync(password, 10)
  const stmt = db.prepare(`
    INSERT INTO users (username, email, password)
    VALUES (?, ?, ?)
  `)
  try {
    const result = stmt.run(username, email, hashed)
    return { id: result.lastInsertRowid, username, email }
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      throw new Error('Username or email already taken')
    }
    throw err
  }
}

function login(email, password) {
  const user = db.prepare(`
    SELECT * FROM users WHERE email = ?
  `).get(email)
  if (!user) throw new Error('No account with that email')
  if (user.is_deleted) throw new Error('Account has been deleted')
  const valid = bcrypt.compareSync(password, user.password)
  if (!valid) throw new Error('Wrong password')
  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '30d' }
  )
  return { token, username: user.username, id: user.id }
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'Not logged in' })
  const token = header.replace('Bearer ', '')
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization
  if (!header) return next()
  const token = header.replace('Bearer ', '')
  try {
    req.user = jwt.verify(token, JWT_SECRET)
  } catch {
    // Ignore invalid token for optional auth paths.
  }
  return next()
}

module.exports = { signup, login, requireAuth, optionalAuth }