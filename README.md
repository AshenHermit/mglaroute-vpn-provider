<div align="center">

# mglaroute VPN Server

Self-hosted control plane for VPN subscriptions: import, probe, rank, and serve server feeds.

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-3c873a?style=flat-square)
![pnpm](https://img.shields.io/badge/pnpm-10.12.1-f9ad00?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)
![Status](https://img.shields.io/badge/status-active%20development-yellow?style=flat-square)

[Overview](#overview) • [Features](#features) • [Getting started](#getting-started) • [Usage](#usage) • [API](#api) • [Configuration](#configuration) • [Deployment](#deployment) • [Development](#development) • [Docs](#docs)

</div>

## Overview

mglaroute VPN Server manages a fleet of VPN nodes sourced from v2rayN-compatible subscriptions. A NestJS backend imports and parses subscriptions, probes each server through a local xray-core instance, tests named online services through the same proxy session, and computes an **anycast / auto-select** availability score. A React admin panel exposes the controls; a public feed serves the filtered results back to clients.

> [!NOTE]
> The project is in active development. The design and locked decisions live in [PLAN.md](PLAN.md); deploy specifics live in [DEPLOY.md](DEPLOY.md).

## Features

- **Subscription management** — CRUD for subscription links, manual fetch, status and error tracking.
- **Multi-format parser** — `vmess://`, `vless://`, `ss://`, `trojan://`, and base64-encoded clash-style YAML. Bad lines are skipped and counted, never abort the whole parse.
- **Real probing** — latency via TCP fallback or xray-core loopback proxy; DNS resolution recorded per profile.
- **Service reachability** — named services with multiple test URLs are reachable only when **all** URLs return 2xx through the same proxy session. Results are cached per `serviceCheckExpirationSeconds` (default 3600s).
- **Anycast score** — a `0..1` availability score over the last 10 fresh checks (`losses / window.length`), not a boolean. `anycast|auto` in remarks/name forces `1.0`.
- **Admin panel** — setup, login, dashboard, subscriptions, online services, servers, anycast, settings.
- **Public feed** — `GET /api/feed` returns either rebuilt raw subscription links or detailed JSON, with filtering, sorting, and a configurable limit.
- **Secure first run** — setup endpoint is blocked once an admin exists; everything except health, auth setup/login, and the feed requires a JWT.

## Architecture

```text
Subscription URLs
        │
        ▼
NestJS API ── cron / manual trigger ── xray-core proxy ── online service probes
        │                                  │
        ▼                                  ▼
PostgreSQL (config, profiles, scan history)   Redis (state, cache)
        │
        ├── React admin panel  (JWT-protected)
        └── GET /api/feed      (public, raw body)
```

```text
backend/src/
  auth/             first-run gate, setup, login, JWT strategy
  subscriptions/    subscription CRUD + fetch/parse
  profiles/         parsed server profiles
  online-services/  named services with test URLs
  scanner/          parser, xray probes, service checks, anycast score, cron
  query/            filtered/sorted/paginated server queries
  feed/             public subscription / JSON feed
  settings/         scanner settings singleton
  health/, common/  health endpoint, DB/Redis/HTTP, guards, envelope replies

frontend/src/
  pages/            Setup, Login, Dashboard, Subscriptions, OnlineServices,
                    Servers, Settings, Anycast
  components/       layout routes and local shadcn-style Radix UI wrappers
  lib/, stores/     axios client, envelope unwrapping, persisted auth state

scripts/            dev runner and CI deploy script
Caddyfile.template  host-based routing for panel/API
Dockerfile          multi-stage backend + nginx-served frontend
```

## Getting started

### Prerequisites

- Node.js 20+ (CI uses 22)
- pnpm 10.12.1 (via Corepack)
- Docker with Compose
- Optional: a local xray binary for real latency and service checks

### Run locally

```bash
cp .env.example .env
# Edit .env: set JWT_SECRET, DB_PASSWORD, REDIS_PASSWORD
docker compose up -d          # PostgreSQL :5432, Redis :6379
pnpm install
pnpm xray:download            # recommended; enables xray-backed probes
pnpm dev                      # backend watch + Vite dev server
```

Open the admin panel at `http://localhost:5173/setup` and create the first admin account.

- Backend: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/api/docs`
- Frontend: `http://localhost:5173`

> [!TIP]
> `pnpm dev` starts both packages via `scripts/dev.mjs` with coordinated shutdown. To run one side only, use `pnpm backend:dev` or `pnpm frontend:dev`.

### Verify

```bash
curl http://localhost:3000/api/health
pnpm --filter mglaroute-vpn-server-backend test
pnpm --filter mglaroute-vpn-server-backend test:xray
pnpm --filter mglaroute-vpn-server-frontend build
pnpm --filter mglaroute-vpn-server-frontend lint
```

## Usage

1. Sign in at `/setup` (first run only), then `/login`.
2. Add a subscription under **Subscriptions**. The scanner fetches and parses it, then probes profiles on its schedule.
3. Define named services under **Online services** with the URLs clients should be able to reach.
4. Review results under **Servers** and **Anycast**; filter by protocol, reachability, service IDs, anycast, and search.
5. Copy the public feed URL from the panel. The feed includes only `present` profiles from subscriptions with `status=active AND enabled=true`.

| Route | Purpose |
|---|---|
| `/setup` | One-time admin creation |
| `/login` | JWT login |
| `/` | Dashboard |
| `/subscriptions` | Subscription CRUD and manual fetch |
| `/online-services` | Service profiles and test URLs |
| `/servers` | Filtered server table |
| `/anycast` | Anycast score overview |
| `/settings` | Scanner settings |

## API

All endpoints use the `/api` prefix. JSON responses are wrapped as `{ ok, code?, message?, data? }`; the frontend unwraps `data`. Public endpoints are marked below; everything else needs `Authorization: Bearer <token>`.

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Health check |
| `GET` | `/api/auth/first-run` | Public | Whether setup is still needed |
| `POST` | `/api/auth/setup` | Public | Create first admin (once) |
| `POST` | `/api/auth/login` | Public | Issue JWT |
| `GET` | `/api/feed` | Public | Raw subscription links or JSON details |
| `GET` | `/api/auth/me` | JWT | Current user |
| `GET`, `POST` | `/api/subscriptions` | JWT | List / create subscriptions |
| `GET`, `PUT`, `DELETE` | `/api/subscriptions/:id` | JWT | Read / update / delete subscription |
| `POST` | `/api/subscriptions/:id/fetch` | JWT | Fetch and parse a subscription now |
| `GET` | `/api/profiles`, `/api/profiles/:id` | JWT | Profile list / detail |
| `GET` | `/api/profiles/subscription/:subscriptionId` | JWT | Profiles for one subscription |
| `GET`, `POST` | `/api/online-services` | JWT | List / create services |
| `GET` | `/api/online-services/enabled` | JWT | Enabled services only |
| `GET`, `PUT`, `DELETE` | `/api/online-services/:id` | JWT | Service detail / update / delete |
| `GET`, `PUT` | `/api/settings` | JWT | Scanner settings singleton |
| `POST` | `/api/scanner/run` | JWT | Trigger a scan (fire-and-forget) |
| `GET` | `/api/scanner/status` | JWT | Last scan state and result |
| `GET` | `/api/servers` | JWT | Filtered, sorted, paginated servers |
| `GET` | `/api/servers/anycast` | JWT | Anycast score list |
| `GET` | `/api/servers/:id/anycast` | JWT | Anycast detail for one profile |

The feed returns a **raw body**, not the standard envelope:

```bash
curl "http://localhost:3000/api/feed?format=subscription&protocol=vless"
curl "http://localhost:3000/api/feed?format=json&reachable=true&sort=latency_asc&limit=50"
```

Supported feed/query filters include `search`, `protocol`, `reachable`, `anycast`, `services` (comma-separated IDs), `sort` (`latency_asc`, `confidence_desc`, `name_asc`, etc.), `page`/`limit` (feed limit `1..1000`, default `200`). Full request/response schemas are in Swagger at `/api/docs`.

## Configuration

Copy [.env.example](.env.example) to `.env`. The backend reads `.env.local` then `.env`; the frontend uses `VITE_API_URL` at build time.

| Group | Variables | Notes |
|---|---|---|
| Database | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SYNCHRONIZE`, `DB_LOGGING`, `DB_SSL` | Defaults: `localhost:5432`, user/db `mglaroute`. `DB_SYNCHRONIZE=true` for dev, `false` for prod. |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Defaults: `localhost:6379`, db `0`. |
| App | `TZ`, `PORT`, `JWT_SECRET`, `FRONTEND_URL` | `PORT=3000`; `FRONTEND_URL` must be the exact panel origin. |
| Compose / routing | `BACKEND_PORT`, `FRONTEND_PORT`, `VITE_API_URL`, `COMMON_DOMAIN`, `PANEL_SUBDOMAIN`, `BACKEND_SUBDOMAIN`, `CADDY_PORT` | Used by the multi-stage Dockerfile, Vite build, and Caddy templates. |

> [!IMPORTANT]
> Set a strong `JWT_SECRET` and DB/Redis passwords before exposing the service. Never commit `.env`.

> [!WARNING]
> CORS is configured in NestJS from `FRONTEND_URL` only. Do not add `Access-Control-*` headers in Caddy — duplicate CORS headers break browsers. See [DEPLOY.md](DEPLOY.md#cors).

## Deployment

Production uses [docker-compose.prod.yml](docker-compose.prod.yml): PostgreSQL, Redis, the built backend, nginx-served frontend, and Caddy for host-based routing. TLS is terminated by an external Nginx Proxy Manager; Caddy listens on `${CADDY_PORT:-8080}` over plain HTTP.

```bash
cp .env.example .env
# Set production values: JWT_SECRET, FRONTEND_URL, DB/Redis passwords, domains
docker compose -f docker-compose.prod.yml up -d
# Complete first-run setup at https://<panel-domain>/setup
```

Default hosts used here are `admin.mglaroute.ashen-hermit.space` (panel) and `api.mglaroute.ashen-hermit.space` (API). See [DEPLOY.md](DEPLOY.md) for proxy-host setup and health checks, and [CADDY_README.md](CADDY_README.md) for standalone Caddy routing.

**CI/CD:** pushing to `main` or manually dispatching [deploy.yml](.github/workflows/deploy.yml) runs `verify` (backend tests + xray utility tests, frontend build and lint) then an idempotent SSH deploy via `scripts/deploy-remote.sh`. Required repository secrets: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `PROD_ENV`; required variable: `GIT_REMOTE`. Deployments are serialized and never run in parallel.

## Development

| Command | Description |
|---|---|
| `pnpm dev` | Backend watch + Vite dev server |
| `pnpm backend:dev` | Backend only |
| `pnpm frontend:dev` | Frontend only |
| `pnpm xray:download` | Download pinned xray-core into `backend/bin/` |
| `pnpm --filter mglaroute-vpn-server-backend test` | Backend unit tests |
| `pnpm --filter mglaroute-vpn-server-backend test:xray` | xray download/probe utility tests |
| `pnpm --filter mglaroute-vpn-server-frontend lint` | Frontend lint |
| `pnpm --filter mglaroute-vpn-server-frontend build` | Frontend type-check + production build |

The xray version is pinned in `backend/scripts/xray-assets.mjs` and verified by SHA-256 on download. `XRAY_VERSION` and `XRAY_DOWNLOAD_URL` can override local downloads; the Docker build uses the pinned value.

## Limitations

> [!WARNING]
> - Schema is managed by TypeORM `synchronize` in dev. There is no migrations directory yet; with `DB_SYNCHRONIZE=false`, apply schema changes manually before upgrading.
> - The production compose file publishes PostgreSQL and Redis ports to the host for local access. Restrict firewall access or remove those port mappings.
> - `anycastMinSamples` remains in the API/DB for compatibility but is unused. Region/country detection is intentionally out of scope.
> - The client application (`mglaroute-vpn-client`) is planned but not part of this workspace.

## Docs

- [PLAN.md](PLAN.md) — scope, locked decisions, scanner and anycast design.
- [DEPLOY.md](DEPLOY.md) — environment variables, production topology, CORS, CI/CD.
- [CADDY_README.md](CADDY_README.md) — standalone reverse-proxy setup.
- [AGENTS.md](AGENTS.md) — repository conventions and internal module notes.
