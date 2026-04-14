require('dotenv').config()

const path = require('path')
const Database = require('better-sqlite3')
const { Client } = require('pg')

const sqlitePath = path.join(__dirname, '../babble.db')
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required for Postgres migration.')
  process.exit(1)
}

const sqlite = new Database(sqlitePath, { readonly: true })
const pg = new Client({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
})

function normalizeBool(v) {
  return v ? true : false
}

async function createSchema() {
  await pg.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      reputation INTEGER NOT NULL DEFAULT 100,
      is_shadow_banned BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS threads (
      id BIGINT PRIMARY KEY,
      url TEXT NOT NULL,
      url_normalized TEXT UNIQUE NOT NULL,
      archive_url TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS comments (
      id BIGINT PRIMARY KEY,
      url TEXT NOT NULL,
      url_normalized TEXT NOT NULL,
      body TEXT NOT NULL,
      body_normalized TEXT,
      user_id BIGINT NOT NULL REFERENCES users(id),
      parent_id BIGINT REFERENCES comments(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      is_removed BOOLEAN NOT NULL DEFAULT FALSE,
      anchor_text TEXT,
      anchor_selector TEXT,
      is_low_quality BOOLEAN NOT NULL DEFAULT FALSE,
      is_the_pit BOOLEAN NOT NULL DEFAULT FALSE,
      layer_id TEXT NOT NULL DEFAULT 'public'
    );

    CREATE TABLE IF NOT EXISTS comment_votes (
      id BIGINT PRIMARY KEY,
      comment_id BIGINT NOT NULL REFERENCES comments(id),
      user_id BIGINT NOT NULL REFERENCES users(id),
      vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, comment_id)
    );

    CREATE TABLE IF NOT EXISTS comment_flags (
      id BIGINT PRIMARY KEY,
      comment_id BIGINT NOT NULL REFERENCES comments(id),
      reporter_user_id BIGINT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT
    );

    CREATE TABLE IF NOT EXISTS site_tags (
      id BIGINT PRIMARY KEY,
      url_normalized TEXT NOT NULL,
      tag TEXT NOT NULL,
      user_id BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, url_normalized, tag)
    );

    CREATE INDEX IF NOT EXISTS idx_comments_url ON comments(url_normalized);
    CREATE INDEX IF NOT EXISTS idx_flags_status_created ON comment_flags(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_site_tags_url ON site_tags(url_normalized);
    CREATE INDEX IF NOT EXISTS idx_site_tags_tag ON site_tags(tag);
    CREATE INDEX IF NOT EXISTS idx_comment_votes_comment ON comment_votes(comment_id);
  `)
}

async function copyTable(tableName, rows, mapper, insertSql) {
  for (const row of rows) {
    const values = mapper(row)
    await pg.query(insertSql, values)
  }
  console.log(`Copied ${rows.length} rows: ${tableName}`)
}

async function run() {
  await pg.connect()
  await createSchema()

  const users = sqlite.prepare(`SELECT * FROM users`).all()
  await copyTable(
    'users',
    users,
    (r) => [r.id, r.username, r.email, r.password, r.created_at, r.reputation ?? 100, normalizeBool(r.is_shadow_banned)],
    `INSERT INTO users (id, username, email, password, created_at, reputation, is_shadow_banned)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO NOTHING`
  )

  const threads = sqlite.prepare(`SELECT * FROM threads`).all()
  await copyTable(
    'threads',
    threads,
    (r) => [r.id, r.url, r.url_normalized, r.archive_url, r.created_at],
    `INSERT INTO threads (id, url, url_normalized, archive_url, created_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO NOTHING`
  )

  const comments = sqlite.prepare(`SELECT * FROM comments`).all()
  await copyTable(
    'comments',
    comments,
    (r) => [
      r.id, r.url, r.url_normalized, r.body, r.body_normalized ?? null, r.user_id, r.parent_id ?? null, r.created_at,
      normalizeBool(r.is_removed), r.anchor_text ?? null, r.anchor_selector ?? null,
      normalizeBool(r.is_low_quality), normalizeBool(r.is_the_pit), r.layer_id ?? 'public'
    ],
    `INSERT INTO comments (
      id, url, url_normalized, body, body_normalized, user_id, parent_id, created_at,
      is_removed, anchor_text, anchor_selector, is_low_quality, is_the_pit, layer_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (id) DO NOTHING`
  )

  const commentVotes = sqlite.prepare(`SELECT * FROM comment_votes`).all()
  await copyTable(
    'comment_votes',
    commentVotes,
    (r) => [r.id, r.comment_id, r.user_id, r.vote, r.created_at],
    `INSERT INTO comment_votes (id, comment_id, user_id, vote, created_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO NOTHING`
  )

  const commentFlags = sqlite.prepare(`SELECT * FROM comment_flags`).all()
  await copyTable(
    'comment_flags',
    commentFlags,
    (r) => [r.id, r.comment_id, r.reporter_user_id, r.reason, r.status, r.created_at, r.reviewed_at, r.reviewed_by],
    `INSERT INTO comment_flags (id, comment_id, reporter_user_id, reason, status, created_at, reviewed_at, reviewed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO NOTHING`
  )

  const siteTags = sqlite.prepare(`SELECT * FROM site_tags`).all()
  await copyTable(
    'site_tags',
    siteTags,
    (r) => [r.id, r.url_normalized, r.tag, r.user_id, r.created_at],
    `INSERT INTO site_tags (id, url_normalized, tag, user_id, created_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO NOTHING`
  )

  await pg.query(`SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1), true)`)
    .catch(() => {})
  await pg.query(`SELECT setval('threads_id_seq', COALESCE((SELECT MAX(id) FROM threads), 1), true)`)
    .catch(() => {})
  await pg.query(`SELECT setval('comments_id_seq', COALESCE((SELECT MAX(id) FROM comments), 1), true)`)
    .catch(() => {})
  await pg.query(`SELECT setval('comment_votes_id_seq', COALESCE((SELECT MAX(id) FROM comment_votes), 1), true)`)
    .catch(() => {})
  await pg.query(`SELECT setval('comment_flags_id_seq', COALESCE((SELECT MAX(id) FROM comment_flags), 1), true)`)
    .catch(() => {})
  await pg.query(`SELECT setval('site_tags_id_seq', COALESCE((SELECT MAX(id) FROM site_tags), 1), true)`)
    .catch(() => {})

  console.log('Postgres migration finished.')
  await pg.end()
}

run().catch(async (err) => {
  console.error('Migration failed:', err)
  // TODO: Add rollback logic to drop created tables on failure
  try { await pg.end() } catch {}
  process.exit(1)
})
