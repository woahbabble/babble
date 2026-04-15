-- db/init.sql
-- Runs automatically on first Postgres container start.

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reputation INTEGER NOT NULL DEFAULT 100,
  is_shadow_banned BOOLEAN NOT NULL DEFAULT FALSE,
  bio TEXT NOT NULL DEFAULT '',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS threads (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  url_normalized TEXT UNIQUE NOT NULL,
  archive_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threads_url_normalized ON threads(url_normalized);

CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
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
  layer_id TEXT NOT NULL DEFAULT 'public',
  CONSTRAINT idx_comments_unique_thread_body UNIQUE (url_normalized, body_normalized)
);

CREATE INDEX IF NOT EXISTS idx_comments_url ON comments(url_normalized);

CREATE TABLE IF NOT EXISTS comment_votes (
  id BIGSERIAL PRIMARY KEY,
  comment_id BIGINT NOT NULL REFERENCES comments(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT idx_comment_votes_unique_user_comment UNIQUE (user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_votes_comment ON comment_votes(comment_id);

CREATE TABLE IF NOT EXISTS comment_flags (
  id BIGSERIAL PRIMARY KEY,
  comment_id BIGINT NOT NULL REFERENCES comments(id),
  reporter_user_id BIGINT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  CONSTRAINT idx_flags_unique_reporter_comment UNIQUE (comment_id, reporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_flags_status_created ON comment_flags(status, created_at DESC);

CREATE TABLE IF NOT EXISTS site_tags (
  id BIGSERIAL PRIMARY KEY,
  url_normalized TEXT NOT NULL,
  tag TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT idx_site_tags_unique_user_url_tag UNIQUE (user_id, url_normalized, tag)
);

CREATE INDEX IF NOT EXISTS idx_site_tags_url ON site_tags(url_normalized);
CREATE INDEX IF NOT EXISTS idx_site_tags_tag ON site_tags(tag);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  domain TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT idx_subscriptions_unique_user_domain UNIQUE (user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_domain ON subscriptions(domain);
