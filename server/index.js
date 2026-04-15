console.log('Starting Babble...')

require('dotenv').config()

const express = require('express')
const https = require('https')
const fs = require('fs')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const db = require('./db')
const routes = require('./routes')

const app = express()
const PORT = process.env.PORT || 3001
const API_HOST = process.env.API_HOST || 'babble.local'
const CORS_ORIGINS = process.env.CORS_ORIGINS || ''
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || './babble.local-key.pem'
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || './babble.local.pem'
const NODE_ENV = process.env.NODE_ENV || 'development'
const USE_HTTPS = process.env.USE_HTTPS !== '0' && (process.env.USE_HTTPS === '1' || NODE_ENV === 'production')
const GLOBAL_RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || '60000', 10)
const GLOBAL_RATE_LIMIT_MAX = Number.parseInt(process.env.GLOBAL_RATE_LIMIT_MAX || '120', 10)
const allowedOrigins = CORS_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
const allowAllOrigins = allowedOrigins.includes('*')

function isOriginAllowed(origin) {
  if (allowAllOrigins) return true
  return allowedOrigins.includes(origin)
}

app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})
app.use(cors(allowAllOrigins
  ? { origin: '*', credentials: false }
  : {
      origin: (origin, callback) => {
        if (!origin || isOriginAllowed(origin)) return callback(null, true)
        return callback(new Error('Not allowed by CORS'))
      },
      credentials: true
    }))
app.use(express.json())
app.use('/api', rateLimit({
  windowMs: GLOBAL_RATE_LIMIT_WINDOW_MS,
  max: GLOBAL_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many API requests. Please slow down.' }
}), routes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', name: 'Babble API' })
})

app.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1 as ok')
    res.json({ status: 'ready', db: 'ok' })
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message })
  }
})

if (USE_HTTPS) {
  const sslOptions = {
    key: fs.readFileSync(SSL_KEY_PATH),
    cert: fs.readFileSync(SSL_CERT_PATH)
  }
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`Babble API running on https://${API_HOST}:${PORT}`)
  })
} else {
  app.listen(PORT, () => {
    console.log(`Babble API running on http://${API_HOST}:${PORT}`)
  })
}

console.log('Listen called')