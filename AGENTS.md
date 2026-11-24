# mglaroute-vpn-server

Server-side VPN provider: NestJS API + React admin panel + background subscription scanner.

## Status
Active development. Substantial code exists. No `.git` repo yet (`.gitignore` only).
Spec: `PLAN.md`. Task-by-task plan: `docs/superpowers/plans/2026-11-23-mglaroute-vpn-server.md`.

## Stack
- pnpm workspace `pnpm@10.12.1`; packages `backend/`, `frontend/`. Root scripts: `pnpm dev` (both via `scripts/dev.mjs`), `pnpm backend:dev`, `pnpm frontend:dev`.
- Backend: NestJS 10, TS 5.3, TypeORM 0.3 + PostgreSQL 16, Redis 7 (ioredis 5), `@nestjs/schedule` 4, JWT/passport-jwt, bcrypt, axios, class-validator, Swagger. Node 20 in Docker.
- Frontend: Vite 5, React 18, react-router-dom 6, Zustand 4 (`persist` → localStorage `auth-storage`), Tailwind 3, local Radix/shadcn-style UI wrappers, axios, lucide-react. TS strict.
- Deploy: multi-stage `Dockerfile` (node:20-alpine builds; nginx:alpine serves `frontend/dist`), Caddy 2 host-based routing, TLS terminated by external Nginx Proxy Manager.

## Layout
`backend/src/`
- `auth/` — first-run gate, setup, login, `/me`, JWT strategy, user entity
- `subscriptions/` — subscription CRUD; `POST /:id/fetch` is partial (see gaps)
- `profiles/` — parsed server profiles; list, `/:id`, `/subscription/:subscriptionId`
- `online-services/` — named service profiles (test URLs) CRUD + `/enabled`
- `scanner/` — parser, TCP latency, DNS resolve, HTTP reachability, anycast score, `ScanHistory`, cron
- `query/` — filtered/sorted/paginated server query + anycast endpoints; only unit spec here (`query.service.spec.ts`)
- `settings/` — `scanner_settings` singleton (`id='singleton'`)
- `health/` — `GET /api/health`
- `common/` — postgres config/data-source, redis, http, guards (JWT / first-run / public), decorators, envelope interceptor + exception filter
- `main.ts` — global prefix `/api`, CORS from `FRONTEND_URL`, `ValidationPipe` (whitelist, forbidNonWhitelisted, implicit conversion), Swagger at `/api/docs`

`frontend/src/`
- `pages/` — Setup, Login, Dashboard, Subscriptions, OnlineServices, Servers, Settings, Anycast
- `components/ui/` — local shadcn-style Radix wrappers; `components/layout/` — Layout, ProtectedRoute/PublicRoute; `ErrorBoundary.tsx`
- `lib/api.ts` — axios client; Bearer token from Zustand store; unwraps envelope `data`; 401 → clear auth + `/login`
- `stores/auth.store.ts` — login/setup/first-run state, token + user persisted

## API (global prefix `/api`)
Every response wrapped `{ ok, code?, message?, data? }` (EnvelopeInterceptor + EnvelopeExceptionFilter). Frontend unwraps `data`; errors throw with envelope `code`.

Public: `GET /api/health`, `GET /api/auth/first-run`, `POST /api/auth/setup`, `POST /api/auth/login`. All else behind `JwtAuthGuard` (`Authorization: Bearer <token>`).

- `GET /api/auth/me`
- Subscriptions: `GET|POST /api/subscriptions`, `GET|PUT|DELETE /api/subscriptions/:id`, `POST /api/subscriptions/:id/fetch` (partial)
- Profiles: `GET /api/profiles`, `GET /api/profiles/:id`, `GET /api/profiles/subscription/:subscriptionId`
- Online services: `GET|POST /api/online-services`, `GET /api/online-services/enabled`, `GET|PUT|DELETE /api/online-services/:id`
- Settings: `GET|PUT /api/settings`
- Scanner: `POST /api/scanner/run`, `GET /api/scanner/status`
- Servers: `GET /api/servers` (`services[]`, `anycast`, `limit`, `page`, `sort`, `search`, `protocol`, `reachable`), `GET /api/servers/anycast`, `GET /api/servers/:id/anycast`
- Swagger UI: `/api/docs`

## Data / invariants
- Tables/entities: `users`, `subscriptions`, `profiles`, `online_services`, `scanner_settings`, `scan_history`, `anycast_scores`.
- Schema via TypeORM `synchronize` (`DB_SYNCHRONIZE=true` dev, `false` prod). Migration scripts exist in `backend/package.json` but no migration files yet — don't assume migrations work.
- Parser accepts `vmess://` (base64 JSON), `vless://`, `ss://` (base64 and method:pass forms), `trojan://`, and base64-encoded clash-style YAML; bad lines skipped and counted, never abort whole parse.
- Anycast = confidence 0..1, `1 - uniqueIps/sampleCount`; `null` until `anycastMinSamples` (default 3). Never a boolean.
- Region/country detection intentionally OUT (see `PLAN.md`).
- First run: `GET /api/auth/first-run` drives `/setup`; setup blocked once an admin exists.
- Scanner: cron `EVERY_5_MINUTES` + manual trigger; `running` flag prevents overlapping runs. Fetch failures set subscription status `error`, preserve previously parsed profiles.

## Env / ports
- Root `.env.example`; `backend/.env` and `frontend/.env` exist locally (gitignored). Backend `PORT=3000`; Vite dev `5173`; prod nginx `80`; Caddy `${CADDY_PORT:-8080}`.
- Vars: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SYNCHRONIZE`, `DB_LOGGING`, `DB_SSL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`, `JWT_SECRET`, `PORT`, `FRONTEND_URL`, `BACKEND_PORT`, `FRONTEND_PORT`, `COMMON_DOMAIN`, `PANEL_SUBDOMAIN`, `BACKEND_SUBDOMAIN`, `CADDY_PORT`; frontend `VITE_API_URL`.
- Local `backend/.env` currently points at remote DB/Redis (`158.255.6.45:15432`, `158.255.6.45:16379`), not docker-compose defaults. Do not overwrite silently.
- CORS lives in NestJS (`FRONTEND_URL`); Caddy must not set `Access-Control-*` (see `DEPLOY.md`). `FRONTEND_URL` must equal exact panel origin.
- Hosts: `admin.mglaroute.ashen-hermit.space` → frontend, `api.mglaroute.ashen-hermit.space` → backend.

## Commands
```bash
cp .env.example .env
docker-compose up -d          # postgres 5432, redis 6379
pnpm install
pnpm dev                      # backend watch + vite dev
```
Prod: `docker-compose -f docker-compose.prod.yml up -d`; first-run at `https://admin.mglaroute.ashen-hermit.space/setup`.
Caddy only: `docker compose -f docker-compose.caddy.yml up -d` (needs external `proxy` network).

## Known gaps — do not claim done
- `POST /api/subscriptions/:id/fetch` only downloads bytes; it does not parse or persist profiles.
- Scanner reads `concurrency` but scans profiles sequentially; no concurrency cap implemented.
- Cron interval fixed at 5 min; `intervalSeconds` setting is logged only, never applied.
- Anycast history is filtered by the same `resolvedIp` before computing unique IPs → unique count is 1, score degenerates toward 1. Verify before relying on it.
- No migrations directory, no git repo, no `mglaroute-vpn-client` in this workspace.

## Conventions
- Terse output (caveman rules at `C:\Users\hermit\.config\opencode\AGENTS.caveman.md`).
- Keep `PLAN.md` / `DEPLOY.md` / `README.md` in sync when behavior changes.
- Backend and client concerns stay separate; shared API/config contracts documented at workspace root.
