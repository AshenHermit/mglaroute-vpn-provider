# mglaroute-vpn-server — Design + Implementation Plan

Stack (from AGENTS.md): NestJS backend, Vite + React + Zustand + shadcn/ui frontend.
DB: PostgreSQL (durable config + scan history) + Redis (cache, scan state, rate limit, optional queue).

## Scope

Admin panel + background scanner for a fleet of VPN servers pulled from
subscriptions (v2rayN-compatible). Scanner measures real latency, tests
per-server reachability of named online services, and flags anycast /
auto-select servers via IP-churn confidence.

## Decisions (locked)

- Drop region/country detection. Different services disagree; meaningless.
- DB = PostgreSQL + Redis. Postgres holds config + scan history. Redis holds
  hot scan results, counters, rate-limit, optional BullMQ queue.
- Parser reuses v2rayN set: `vmess://`, `vless://`, `ss://`, `trojan://`,
  plus base64-encoded clash-style YAML (multi-profile).
- Anycast = confidence score over scan history, NOT a boolean.
  Gate: >= 3 samples before score is meaningful.

## Architecture (NestJS modules)

```
backend/
  auth/            setup (first-run admin), login, JWT sessions
  subscriptions/   SubItem CRUD + fetch/parse
  profiles/        ProfileItem parse, per-subscription server list
  online-services/ OnlineServiceProfile (name + urls) CRUD
  scanner/         cron: latency test, service reachability, anycast score
  query/           filtered/sorted server list API
  settings/        scanner settings singleton
  common/          redis, postgres, http client, envelope reply
frontend/
  pages: Setup, Login, Dashboard, Subscriptions, OnlineServices,
         Servers, ScannerSettings, AnyCast
```

## Data model (PostgreSQL)

| table | purpose |
|---|---|
| `admin` | id, password_hash, created_at, is_setup (first-run gate) |
| `subscriptions` | mirrors v2rayN `SubItem`: id, remarks, url, more_url, enabled, user_agent, request_headers, filter, auto_update_interval, update_time, convert_target, memo, sort, pre_socks_port, custom_core_type |
| `profiles` | mirrors v2rayN `ProfileItem`: id, sub_id, config_type, address, port, password, username, network, flow, remarks, last_latency, last_seen, reachable, resolved_ips jsonb; plus `serviceIds jsonb` (reachable service IDs only, never names), `servicesCheckedAt timestamp`, `servicesFingerprint varchar` |
| `online_service_profiles` | id, name, urls jsonb, enabled, is_default |
| `scanner_settings` | singleton: scan_interval, concurrency, connect_timeout, service_timeout, service_check_expiration_seconds (default 3600), anycast_min_samples, anycast_threshold |
| `scan_results` | id, profile_id, latency_ms, services jsonb {url:bool}, resolved_ips jsonb, scanned_at |
| `anycast_scores` | profile_id, confidence (0..1), sample_count, unique_ip_count, updated_at |

## Scanner flow (cron, Node cron or BullMQ)

1. enabled subscriptions → fetch URL (UA + headers) → parse profiles
2. per profile: when the local xray binary exists, start one xray core and keep
   it for the whole probe; measure delay through its loopback proxy in the same
   session. Otherwise use the legacy TCP connect to address:port (no service
   check in that path).
3. after a successful xray delay (`latency !== null`) and only when the cached
   result is due — `servicesCheckedAt` null, fingerprint of the enabled-service
   set (ids + sorted URLs) changed, or elapsed >= `service_check_expiration_seconds`
   — GET every enabled service URL through that same proxy. A service counts as
   reachable only when ALL its test URLs return 2xx (403/404/5xx fail; empty URL
   list never reachable). Store only reachable service IDs plus timestamp and
   fingerprint. No OS-proxy fallback. On xray/session failure keep the previous
   result and retry next scan; a later unreachable scan does not clear it.
4. resolve DNS of profile address → record resolved IP
5. upsert `scan_results`, update `profiles` (last_latency, last_seen,
   serviceIds/servicesCheckedAt/servicesFingerprint, resolved_ips), recompute
   anycast score. `scan_history` keeps one row per scanned profile/service URL
   so anycast sample counts are unchanged.

Anycast score: `confidence = 1 - (uniqueResolvedIps / sampleCount)`, clamped
[0,1]. Only valid when `sampleCount >= anycast_min_samples`.

## API routes (REST JSON, envelope like v2rayN `ApiReplies`)

- `POST /api/setup` — first-run admin create (blocked if admin exists)
- `POST /api/auth/login` → JWT
- `GET  /api/health`
- `GET /api/subscriptions`, `POST`, `GET/:id`, `PUT/:id`, `DELETE/:id`, `PUT/:id/toggle`
- `GET /api/subscriptions/:id/profiles`
- `GET /api/online-services`, `POST`, `PUT/:id`, `DELETE/:id`
- `GET /api/settings`, `PUT /api/settings`
- `POST /api/scanner/run`, `GET /api/scanner/status`
- `GET /api/servers` — query params:
  - `services[]` — all must be reachable
  - `anycast` = `true|false|any`
  - `limit`
  - `sort` = `latency_asc|latency_desc|confidence_desc`
  - `search` — remarks/address substring
- `GET /api/servers/:id/anycast`

## Phases

1. **Scaffold** — repo, NestJS, docker-compose (postgres+redis), frontend scaffold,
   auth + first-run setup, envelope reply, settings singleton
2. **Core CRUD** — subscriptions, profiles, online-services, settings endpoints
3. **Scanner** — parser, latency test, service reachability, anycast detection,
   cron runner, manual trigger
4. **Query API** — `/api/servers` filtered/sorted, anycast endpoint
5. **Frontend** — all pages wired to API
6. **Polish** — docker, env config, tests, deploy notes

## Open questions

- Scanner: BullMQ queue vs plain cron. Default: plain `@nestjs/schedule` cron
  until load proves otherwise.
- Auth: JWT stateless vs session+Redis. Default: JWT (stateless, simple).
- Online services: ship built-in defaults (youtube, discord, google, etc.) or
  empty. Default: small built-in set, user can edit/delete.