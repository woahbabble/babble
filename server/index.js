console.log('Starting Babble...')

const express = require('express')
const https = require('https')
const fs = require('fs')
const cors = require('cors')
const routes = require('./routes')

console.log('Modules loaded')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}))
app.use(express.json())
app.use('/api', routes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', name: 'Babble API' })
})

const sslOptions = {
  key: fs.readFileSync('./babble.local-key.pem'),
  cert: fs.readFileSync('./babble.local.pem')
}

https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`Babble API running on https://babble.local:${PORT}`)
})

console.log('Listen called')