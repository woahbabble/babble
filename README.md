# Babble

Babble is a universal commenting layer for the internet.

## Repo Structure

- `server/` - Express API (auth, comments, feed, search, moderation)
- `extension/` - Chromium extension sidebar UI
- `website/` - Next.js public website (feed, threads, profiles, search, moderation UI)

## Local Setup

### 1) API server

```bash
cp .env.example .env
```

Set `ADMIN_TOKEN` in `.env` to a strong random value.
Set `API_URL` to your API base URL.

Run:

```bash
node server/index.js
```

### 2) Website

```bash
cp website/.env.local.example website/.env.local
cd website
npm install
npm run dev
```

### 3) NSFW blocklist sync

From `website/`:

```bash
npm run sync:nsfw
```

This refreshes `website/data/nsfw-blocklist.txt` from the maintained upstream source.

### 4) Extension runtime env file

Generate extension runtime defaults from env:

```bash
API_URL=https://babble.local:3001/api WEBSITE_URL=http://localhost:3000 npm run generate:extension-env
```

Then reload the extension in `chrome://extensions`.

## Moderation

- User reports: `POST /api/flags`
- Admin review API:
  - `GET /api/admin/flags`
  - `POST /api/admin/comments/:id/remove`
  - `POST /api/admin/flags/:id/review`
- Admin website page: `/admin/moderation`
- Admin auth header: `x-admin-token: <ADMIN_TOKEN>`

## Secret Safety

Never commit real secrets.

- Real secrets live in untracked local env files:
  - `.env`
  - `website/.env.local`
- Only commit templates:
  - `.env.example`
  - `website/.env.local.example`

Before every commit/push:

```bash
npm run check:secrets
```

This blocks common secret leaks in staged files (env files, key material, and suspicious content patterns).

## Safe Push Flow

```bash
npm run check:secrets
git add server extension website scripts package.json package-lock.json README.md .env.example
git diff --cached --name-only
git commit -m "Your message"
git push origin HEAD
```

Confirm staged file list does not include `.env` or `website/.env.local` before committing.

## Production Smoke Checks

From repo root:

```bash
npm run check:secrets:repo
npm run smoke:api
cd website && npm run build
```

## PostgreSQL Migration (Production)

1. Create a Postgres database (Railway/Render managed PostgreSQL).
2. Set `DATABASE_URL` in `.env`.
3. Run migration copy from local SQLite:

```bash
npm run migrate:postgres
```

This creates tables in Postgres and copies users/comments/flags/tags/votes/threads.

## Deployment

### API on Railway or Render

- Set environment variables:
  - `NODE_ENV=production`
  - `DATABASE_URL=<managed-postgres-url>`
  - `USE_HTTPS=0` (Railway/Render terminate TLS at the edge)
  - `JWT_SECRET=<very-long-random-secret>`
  - `API_URL=https://<api-domain>/api`
  - `CORS_ORIGINS=https://<website-domain>,chrome-extension://<extension-id>,moz-extension://*`
  - `ADMIN_TOKEN=<strong-random-token>`
  - rate-limit vars as needed
- Start command:

```bash
node server/index.js
```

Use `/health` for liveness and `/ready` for readiness checks.

### Website on Vercel or Railway

- Set env:
  - `API_URL=https://<api-domain>/api`
  - `NEXT_PUBLIC_BABBLE_API_BASE=https://<api-domain>/api`
- Build command:

```bash
cd website && npm install && npm run build
```

### Extension (Chrome/Firefox store builds)

Generate environment file before packaging:

```bash
API_URL=https://<api-domain>/api WEBSITE_URL=https://<website-domain> npm run generate:extension-env
```
