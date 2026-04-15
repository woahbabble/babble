const { Pool } = require('pg')
const { drizzle } = require('drizzle-orm/node-postgres')
const schema = require('./schema')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
})

const db = drizzle(pool, { schema })

module.exports = pool
module.exports.db = db
