# Babble

Babble is a universal commenting layer for the internet, providing freedom of discussion and discourse.

## Repo Structure

- `server/` — Express API (auth, comments, feed, search, moderation)
- `website/` — Next.js public website (feed, threads, profiles, search, moderation UI)
- `extension/` — Chromium extension sidebar UI
- `db/` — PostgreSQL schema (`init.sql` runs automatically on first container start)

## Local Development (Docker)

Everything runs in Docker. No local Node or Postgres installation required.

### 1) Start the stack

```bash
docker compose up --build
```

Subsequent starts (no rebuild needed):

```bash
docker compose up
```

### 2) Services

| Service | URL | Notes |
| --- | --- | --- |
| Website | <http://localhost:3000> | Next.js frontend |
| API | <http://localhost:3001> | Express REST API |
| pgAdmin | <http://localhost:5050> | Database UI (login below) |
| Postgres | internal port 5432 | Not exposed to host |

### 3) pgAdmin login

- **URL:** <http://localhost:5050>
- **Email:** `admin@babble.dev`
- **Password:** `admin`

To connect to the database inside pgAdmin, add a new server:

| Field    | Value   |
|----------|---------|
| Host     | `db`    |
| Port     | `5432`  |
| Database | `babble`|
| Username | `babble`|
| Password | `babble`|

### 4) Useful commands

```bash
# Stop containers, keep database data
docker compose down

# Stop and wipe the database (fresh start)
docker compose down -v

# View logs for a specific service
docker compose logs -f api

# Rebuild a single service
docker compose up --build api
```

### 5) Extension

The browser extension requires no container. Load it directly into Chrome via `chrome://extensions` → **Load unpacked** → select the `extension/` folder.

`extension/env.js` already points to `localhost:3001` and `localhost:3000` — no changes needed.

### 6) Migrate existing SQLite data (optional)

If you have an existing `babble.db` from a previous local setup, copy it to the repo root and run:

```bash
docker compose run --rm api node server/migrate-to-postgres.js
```

---

## Network Architecture

```text
browser / extension
      │
      ├── localhost:3000  →  [website]  Next.js
      └── localhost:3001  →  [api]      Express
                                │
                         babble-net (internal Docker bridge)
                                │
                             [db]       postgres:16-alpine :5432
```

All services share the internal Docker network `babble-net`. The database is not exposed to the host — only the API and website are reachable from outside the network. pgAdmin connects to `db` via the internal network.

---

## Environment Variables

Copy `.env.example` to `.env` for reference. In Docker, env vars are set directly in `docker-compose.yml` — the `.env` file is not used by the containers.

Key variables for the API:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `PGSSLMODE` | Set to `disable` for local Docker |
| `JWT_SECRET` | Token signing secret (use a strong value in production) |
| `CORS_ORIGINS` | Comma-separated allowed origins, or `*` |
| `ADMIN_TOKEN` | Token for admin API routes |
| `USE_HTTPS` | Set to `0` in Docker (TLS terminated at edge in production) |

---

## Moderation

- User reports: `POST /api/flags`
- Admin API:
  - `GET /api/admin/flags`
  - `POST /api/admin/comments/:id/remove`
  - `POST /api/admin/flags/:id/review`
  - `GET /api/admin/users`
  - `GET /api/admin/threads`
- Admin website page: `/admin/moderation`
- Admin auth header: `x-admin-token: <ADMIN_TOKEN>`

---

## Secret Safety

Never commit real secrets.

- Real secrets live in untracked local files: `.env`, `website/.env.local`
- Only commit templates: `.env.example`, `website/.env.local.example`

Before every commit/push:

```bash
npm run check:secrets
```

### Safe push flow

```bash
npm run check:secrets
git add server extension website scripts db package.json package-lock.json README.md .env.example docker-compose.yml Dockerfile
git diff --cached --name-only
git commit -m "Your message"
git push origin HEAD
```

---

## Production Smoke Checks

```bash
npm run check:secrets:repo
npm run smoke:api
cd website && npm run build
```

---

## Deployment

### API (Railway / Render)

Set environment variables:

- `NODE_ENV=production`
- `DATABASE_URL=<managed-postgres-url>`
- `USE_HTTPS=0` (TLS terminated at the edge)
- `JWT_SECRET=<very-long-random-secret>`
- `CORS_ORIGINS=https://<website-domain>,chrome-extension://<extension-id>,moz-extension://*`
- `ADMIN_TOKEN=<strong-random-token>`

Start command:

```bash
node server/index.js
```

Use `/health` for liveness and `/ready` for readiness probes.

### Website (Vercel / Railway)

Set env:

- `API_URL=https://<api-domain>/api`
- `NEXT_PUBLIC_BABBLE_API_BASE=https://<api-domain>/api`

Build command:

```bash
cd website && npm install && npm run build
```

### Extension (Chrome / Firefox store builds)

Generate the extension environment file before packaging:

```bash
API_URL=https://<api-domain>/api WEBSITE_URL=https://<website-domain> npm run generate:extension-env
```

Then reload the extension in `chrome://extensions`.

### PostgreSQL Migration

To migrate data from an existing SQLite `babble.db` to a fresh Postgres instance:

```bash
DATABASE_URL=<postgres-url> node server/migrate-to-postgres.js
```

Or via Docker:

```bash
docker compose run --rm api node server/migrate-to-postgres.js
```
