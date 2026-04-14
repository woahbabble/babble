const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, '../babble.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    url_normalized TEXT NOT NULL,
    body TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    parent_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES comments(id)
  );

  CREATE INDEX IF NOT EXISTS idx_comments_url 
    ON comments(url_normalized);
`)

const hasUserReputation = db.prepare(`
  SELECT 1
  FROM pragma_table_info('users')
  WHERE name = 'reputation'
`).get()

if (!hasUserReputation) {
  db.exec(`
    ALTER TABLE users ADD COLUMN reputation INTEGER NOT NULL DEFAULT 100;
  `)
}

const hasUserShadowBanned = db.prepare(`
  SELECT 1
  FROM pragma_table_info('users')
  WHERE name = 'is_shadow_banned'
`).get()

if (!hasUserShadowBanned) {
  db.exec(`
    ALTER TABLE users ADD COLUMN is_shadow_banned INTEGER NOT NULL DEFAULT 0;
  `)
}

const hasUserBio = db.prepare(`
  SELECT 1
  FROM pragma_table_info('users')
  WHERE name = 'bio'
`).get()

if (!hasUserBio) {
  db.exec(`
    ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
  `)
}

const hasUserDeleted = db.prepare(`
  SELECT 1
  FROM pragma_table_info('users')
  WHERE name = 'is_deleted'
`).get()

if (!hasUserDeleted) {
  db.exec(`
    ALTER TABLE users ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
  `)
}

const hasBodyNormalized = db.prepare(`
  SELECT 1
  FROM pragma_table_info('comments')
  WHERE name = 'body_normalized'
`).get()

if (!hasBodyNormalized) {
  db.exec(`
    ALTER TABLE comments ADD COLUMN body_normalized TEXT;
  `)
}

db.exec(`
  UPDATE comments
  SET body_normalized = LOWER(TRIM(body))
  WHERE body_normalized IS NULL;
`)

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_unique_thread_body
    ON comments(url_normalized, body_normalized);
`)

const hasIsRemoved = db.prepare(`
  SELECT 1
  FROM pragma_table_info('comments')
  WHERE name = 'is_removed'
`).get()

if (!hasIsRemoved) {
  db.exec(`
    ALTER TABLE comments ADD COLUMN is_removed INTEGER NOT NULL DEFAULT 0;
  `)
}

const hasAnchorText = db.prepare(`
  SELECT 1
  FROM pragma_table_info('comments')
  WHERE name = 'anchor_text'
`).get()

if (!hasAnchorText) {
  db.exec(`
    ALTER TABLE comments ADD COLUMN anchor_text TEXT;
  `)
}

const hasAnchorSelector = db.prepare(`
  SELECT 1
  FROM pragma_table_info('comments')
  WHERE name = 'anchor_selector'
`).get()

if (!hasAnchorSelector) {
  db.exec(`
    ALTER TABLE comments ADD COLUMN anchor_selector TEXT;
  `)
}

const hasIsLowQuality = db.prepare(`
  SELECT 1
  FROM pragma_table_info('comments')
  WHERE name = 'is_low_quality'
`).get()

if (!hasIsLowQuality) {
  db.exec(`
    ALTER TABLE comments ADD COLUMN is_low_quality INTEGER NOT NULL DEFAULT 0;
  `)
}

const hasIsThePit = db.prepare(`
  SELECT 1
  FROM pragma_table_info('comments')
  WHERE name = 'is_the_pit'
`).get()

if (!hasIsThePit) {
  db.exec(`
    ALTER TABLE comments ADD COLUMN is_the_pit INTEGER NOT NULL DEFAULT 0;
  `)
}

const hasLayerId = db.prepare(`
  SELECT 1
  FROM pragma_table_info('comments')
  WHERE name = 'layer_id'
`).get()

if (!hasLayerId) {
  db.exec(`
    ALTER TABLE comments ADD COLUMN layer_id TEXT NOT NULL DEFAULT 'public';
  `)
}

db.exec(`
  CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    url_normalized TEXT UNIQUE NOT NULL,
    archive_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_threads_url_normalized
    ON threads(url_normalized);
`)

const missingThreads = db.prepare(`
  SELECT c.url, c.url_normalized
  FROM comments c
  LEFT JOIN threads t ON t.url_normalized = c.url_normalized
  WHERE t.id IS NULL
  GROUP BY c.url_normalized
`).all()

const insertThread = db.prepare(`
  INSERT INTO threads (url, url_normalized, archive_url)
  VALUES (?, ?, ?)
`)

for (const row of missingThreads) {
  insertThread.run(row.url, row.url_normalized, `https://web.archive.org/web/*/${encodeURIComponent(row.url)}`)
}

db.exec(`
  CREATE TABLE IF NOT EXISTS comment_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    reporter_user_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    reviewed_by TEXT,
    FOREIGN KEY (comment_id) REFERENCES comments(id),
    FOREIGN KEY (reporter_user_id) REFERENCES users(id)
  );
`)

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_flags_unique_reporter_comment
    ON comment_flags(comment_id, reporter_user_id);
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_flags_status_created
    ON comment_flags(status, created_at DESC);
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS site_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_normalized TEXT NOT NULL,
    tag TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    domain TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`)

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_unique_user_domain
    ON subscriptions(user_id, domain);
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_subscriptions_domain
    ON subscriptions(domain);
`)

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_site_tags_unique_user_url_tag
    ON site_tags(user_id, url_normalized, tag);
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_site_tags_url
    ON site_tags(url_normalized);
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_site_tags_tag
    ON site_tags(tag);
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS comment_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (comment_id) REFERENCES comments(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`)

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_votes_unique_user_comment
    ON comment_votes(user_id, comment_id);
`)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_comment_votes_comment
    ON comment_votes(comment_id);
`)

module.exports = db