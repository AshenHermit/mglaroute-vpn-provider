# mglaroute-vpn-server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a NestJS + React admin panel and background scanner that ingests v2rayN-style VPN subscriptions, measures real latency, tests per-server reachability of named online services, scores anycast/auto-select servers, and serves a filtered/sorted server query API. PostgreSQL for durable state, Redis for cache/scan-state.

**Architecture:** NestJS monolith backend (modules under `backend/src/`) + Vite/React/Zustand/shadcn frontend. Single `ApiEnvelope` reply wrapper mirrors v2rayN's `ApiReplies`. Scanner runs as a cron job (`@nestjs/schedule`) over a parsed profile list; scan results feed `profiles` + `scan_results` + `anycast_scores`. Query API at `GET /api/servers` filters by required services, anycast confidence, limit, sort, search.

**Tech Stack:** Node 18+, NestJS, TypeORM (or prisma) + PostgreSQL, Redis (ioredis), zod, bcrypt, JWT, @nestjs/schedule, axios, Vite + React 18 + Zustand + shadcn/ui + Tailwind.

**Spec:** `mglaroute-vpn-server/PLAN.md`

## Global Constraints

- Parser must accept: `vmess://`, `vless://`, `ss://`, `trojan://` (raw URI + base64), and base64-encoded clash-style YAML multi-profile blocks.
- Anycast is a confidence score (0..1), never a boolean. Requires >= `anycast_min_samples` samples before meaningful.
- Region/country detection is OUT (services disagree; meaningless).
- First-run: admin creation blocked once an admin row exists; setup endpoint gated.
- Envelope reply: `{ ok: boolean, code?: string, message?: string, data?: T }` on every API response.
- Auth: JWT stateless, `Authorization: Bearer <token>`. Setup and login endpoints exempt.
- Settings are a singleton row (id=1) with scanner tuning knobs.

## Review Focus

1. **Subscription URL fetch failure** — fetch times out, non-2xx, or empty body. Expect: subscription marked `enabled=false`-safe, error recorded, no crash, profiles from last successful fetch retained.
2. **Malformed profile URI** — garbage inside a valid subscription. Expect: skipped, counted, never aborts the whole parse.
3. **Anycast score before enough samples** — fewer than `anycast_min_samples`. Expect: `confidence` null/omitted, not a bogus 0 or 1.
4. **`/api/servers` filter with no matching servers** — empty result, not 500. `services[]` filter requires ALL listed services reachable.
5. **Scanner concurrency cap** — many profiles, limited concurrency. Expect: no resource exhaustion, all profiles eventually scanned.

---