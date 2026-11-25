# Deployment Guide

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DB_HOST | PostgreSQL host | localhost |
| DB_PORT | PostgreSQL port | 5432 |
| DB_USER | PostgreSQL user | mglaroute |
| DB_PASSWORD | PostgreSQL password | mglaroute (dev only); strong random in prod |
| DB_NAME | PostgreSQL database | mglaroute |
| DB_SYNCHRONIZE | Auto-sync schema | true (dev), false (prod) |
| REDIS_HOST | Redis host | localhost |
| REDIS_PORT | Redis port | 6379 |
| REDIS_PASSWORD | Redis password (`requirepass`) | none (dev only); strong random in prod |
| JWT_SECRET | JWT signing secret | (required in prod) |
| PORT | Backend port | 3000 |
| FRONTEND_URL | Frontend URL for CORS | http://localhost:5173 |
| COMMON_DOMAIN | Root domain | ashen-hermit.space |
| PANEL_SUBDOMAIN | Admin panel subdomain | admin.mglaroute |
| BACKEND_SUBDOMAIN | API subdomain | api.mglaroute |
| CADDY_PORT | Port for external proxy to connect to Caddy | 8080 |

## Production Deployment

### Architecture

```
┌─────────────────────────────────────────────────────┐
│              Root Nginx Proxy Manager               │
│  (TLS termination, rate limiting, firewall)         │
└──────┬──────────────────────┬───────────────────────┘
       │                      │
       ▼                      ▼
┌──────────────────┐   ┌──────────────────┐
│  Caddy           │   │  Other services  │
│  (port 8080)     │   │  (VPN server,    │
│                  │   │   etc.)          │
└──┬───────────┬────┘   └──────────────────┘
   │   │   │
   ▼   ▼   ▼
┌─────────┐ ┌──────────┐ ┌──────────┐
│ Frontend│ │ Backend  │ │PostgreSQL│
│ (React) │ │ (NestJS) │ │          │
└─────────┘ └────┬─────┘ └──────────┘
                  │
                  ▼
            ┌──────────┐
            │  Redis   │
            │ (cache)  │
            └──────────┘
```

### Subdomain Routing

| Subdomain | Service | Purpose |
|-----------|---------|---------|
| `admin.mglaroute.ashen-hermit.space` | Frontend container | Admin panel UI |
| `api.mglaroute.ashen-hermit.space` | Backend container | REST API |

### Root Proxy Setup (Nginx Proxy Manager)

Create two proxy hosts pointing to Caddy on port ${CADDY_PORT:-8080}:

1. **Admin Panel**
   - Domain: `admin.mglaroute.ashen-hermit.space`
   - Forward: `http://127.0.0.1:${CADDY_PORT:-8080}` (Caddy)
   - Scheme: `http`
   - Block WebSockets: `yes`

2. **API**
   - Domain: `api.mglaroute.ashen-hermit.space`
   - Forward: `http://127.0.0.1:${CADDY_PORT:-8080}` (Caddy)
   - Scheme: `http`
   - Block WebSockets: `yes`

Caddy handles internal routing based on Host header. No TLS at Caddy level — root proxy terminates TLS.

### Deploy Steps

1. Copy `.env.example` to `.env`
2. Set production values (especially `JWT_SECRET`, `FRONTEND_URL`)
3. With `DB_SYNCHRONIZE=false`, apply pending schema changes manually before starting the backend:
   ```sql
   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS "anycastWindow" jsonb NOT NULL DEFAULT '[]'::jsonb;
   ```
   Dev with `DB_SYNCHRONIZE=true` adds this column automatically.
4. Run `docker-compose -f docker-compose.prod.yml up -d`
5. Complete first-run setup at `https://admin.mglaroute.ashen-hermit.space/setup`

### CORS

The admin panel (`admin.*`) and API (`api.*`) live on different subdomains, so the
browser enforces CORS. NestJS (`backend/src/main.ts`) handles it with
`app.enableCors()` using `FRONTEND_URL`. Caddy is only a reverse proxy — do not
add `Access-Control-*` there. Caddy's `respond` directive cannot set those
headers, and a second CORS layer duplicates `Access-Control-Allow-Origin`, which
browsers reject.

`FRONTEND_URL` must be the exact panel origin, e.g.
`https://admin.mglaroute.ashen-hermit.space`. Verify after deploy:

```bash
curl -sI -X OPTIONS \
  -H "Origin: https://admin.mglaroute.ashen-hermit.space" \
  -H "Access-Control-Request-Method: POST" \
  https://api.mglaroute.ashen-hermit.space/api/auth/first-run
```

### Health Check
- Backend: `GET https://api.mglaroute.ashen-hermit.space/api/health`
- Frontend: `GET https://admin.mglaroute.ashen-hermit.space/`

## CI/CD

`.github/workflows/deploy.yml` runs on every push to `main` and on manual
`workflow_dispatch` (input `ref`, default `main`). Two jobs:

1. `verify` — `pnpm install --frozen-lockfile`, backend `test` and `test:xray`,
   frontend `build` (tsc + vite) and `lint`.
2. `deploy` — over SSH to the production server (`environment: production`,
   `timeout-minutes: 60`). Writes `.env` from `PROD_ENV`, then streams
   `scripts/deploy-remote.sh` to the server. The script is idempotent:
   `git fetch/reset` or clone into a staging dir (preserving `.env`), normalize
   `.env` to LF, then `docker compose -f docker-compose.prod.yml build --pull`
   and `up -d --force-recreate --wait`, followed by `docker image prune -f`.
   It creates the external `shared-net` network if missing. Deploys never run
   in parallel (`concurrency: deploy-production`, `cancel-in-progress: false`).

xray-core is pinned to `v26.11.9` in `backend/scripts/xray-assets.mjs`;
`pnpm xray:download` uses that tag in both dev and Docker builds. A local
download can be overridden with `XRAY_VERSION` (other tag) or
`XRAY_DOWNLOAD_URL` (mirror archive) environment variables; these are not
passed into the Docker build; a production upgrade requires editing the constant
and redeploying.

### Repository secrets

| Secret | Value |
|--------|-------|
| `SSH_HOST` | Server address (e.g. `158.255.6.45`) |
| `SSH_USER` | SSH user (`root`) |
| `SSH_PORT` | Optional, default `22` |
| `SSH_PRIVATE_KEY` | Ed25519 private key content |
| `PROD_ENV` | Full production `.env` file content |

### Repository variables

| Variable | Value |
|----------|-------|
| `GIT_REMOTE` | GitHub clone URL of this repository (required) |
| `DEPLOY_PATH` | Optional, default `/home/mglaroute-vpn-provider` |

The deploy script rejects an empty `GIT_REMOTE` (exit 5) and a `.env` with
missing required keys or `DB_SYNCHRONIZE=true` (exit 4). Secrets and variables
may also be set on the `production` environment instead of repository level.

Local dry-run (no docker needed):

```bash
DRY_RUN=1 DEPLOY_PATH=/tmp/mglaroute-dry-run GIT_REMOTE=<repo-url> \
  bash scripts/deploy-remote.sh main
```