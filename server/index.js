console.log('Starting Babble...')

const express = require('express')
const cors = require('cors')
const routes = require('./routes')

console.log('Modules loaded')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())
app.use('/api', routes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', name: 'Babble API' })
})

app.listen(PORT, () => {
  console.log(`Babble API running on http://localhost:${PORT}`)
})

console.log('Listen called')