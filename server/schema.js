const { pgTable, bigserial, text, boolean, integer, bigint, timestamp, unique, check, index } = require('drizzle-orm/pg-core')
const { sql } = require('drizzle-orm')

const users = pgTable('users', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  username: text('username').unique().notNull(),
  email: text('email').unique().notNull(),
  password: text('password').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  reputation: integer('reputation').notNull().default(100),
  isShadowBanned: boolean('is_shadow_banned').notNull().default(false),
  bio: text('bio').notNull().default(''),
  isDeleted: boolean('is_deleted').notNull().default(false),
})

const threads = pgTable('threads', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  url: text('url').notNull(),
  urlNormalized: text('url_normalized').unique().notNull(),
  archiveUrl: text('archive_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_threads_url_normalized').on(t.urlNormalized),
])

const comments = pgTable('comments', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  url: text('url').notNull(),
  urlNormalized: text('url_normalized').notNull(),
  body: text('body').notNull(),
  bodyNormalized: text('body_normalized'),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id),
  parentId: bigint('parent_id', { mode: 'bigint' }).references(() => comments.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  isRemoved: boolean('is_removed').notNull().default(false),
  anchorText: text('anchor_text'),
  anchorSelector: text('anchor_selector'),
  isLowQuality: boolean('is_low_quality').notNull().default(false),
  isThePit: boolean('is_the_pit').notNull().default(false),
  layerId: text('layer_id').notNull().default('public'),
}, (t) => [
  index('idx_comments_url').on(t.urlNormalized),
  unique('idx_comments_unique_thread_body').on(t.urlNormalized, t.bodyNormalized),
])

const commentVotes = pgTable('comment_votes', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  commentId: bigint('comment_id', { mode: 'bigint' }).notNull().references(() => comments.id),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id),
  vote: integer('vote').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_comment_votes_comment').on(t.commentId),
  unique('idx_comment_votes_unique_user_comment').on(t.userId, t.commentId),
])

const commentFlags = pgTable('comment_flags', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  commentId: bigint('comment_id', { mode: 'bigint' }).notNull().references(() => comments.id),
  reporterUserId: bigint('reporter_user_id', { mode: 'bigint' }).notNull().references(() => users.id),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: text('reviewed_by'),
}, (t) => [
  index('idx_flags_status_created').on(t.status, t.createdAt),
  unique('idx_flags_unique_reporter_comment').on(t.commentId, t.reporterUserId),
])

const siteTags = pgTable('site_tags', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  urlNormalized: text('url_normalized').notNull(),
  tag: text('tag').notNull(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_site_tags_url').on(t.urlNormalized),
  index('idx_site_tags_tag').on(t.tag),
  unique('idx_site_tags_unique_user_url_tag').on(t.userId, t.urlNormalized, t.tag),
])

const subscriptions = pgTable('subscriptions', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull().references(() => users.id),
  domain: text('domain').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('idx_subscriptions_domain').on(t.domain),
  unique('idx_subscriptions_unique_user_domain').on(t.userId, t.domain),
])

module.exports = { users, threads, comments, commentVotes, commentFlags, siteTags, subscriptions }
