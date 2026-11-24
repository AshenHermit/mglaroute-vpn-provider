# Public Server Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public `GET /api/feed` returning VPN links (`format=subscription`) or scan-enriched JSON (`format=json`) from profiles of active+enabled subscriptions, plus dark-by-default admin UI and a Dashboard link generator.

**Architecture:** New NestJS `feed/` module reuses existing `Profile`/`AnycastScore`/`ScannerSettings` entities. Query filters/sort are extracted from `QueryService` into `query/server-filter.ts` so `/api/servers` and the public feed share semantics without changing the `/api/servers` response. Links are rebuilt from canonical profile columns plus whitelisted `rawConfig` keys (source URI is not stored). Controller uses `@Res()` to bypass `EnvelopeInterceptor` and `@Public()` to bypass guards. Frontend is a controlled-state Card that builds the public URL with `URLSearchParams`.

**Tech Stack:** NestJS 10 + TypeORM 0.3 + class-validator/class-transformer + Jest (ts-jest); React 18 + Vite 5 + Tailwind 3 + local Radix/shadcn wrappers.

**Spec:** `docs/superpowers/specs/2026-11-24-public-server-feed-design.md` (approved; operator overrides: one endpoint with `format=`, active = `status=active AND enabled=true`).

## Global Constraints

- All queries: `profile.present = true` AND parent subscription `status = active` AND `enabled = true`.
- Public endpoint: no JWT, `@Public()` on controller class, no `@ApiBearerAuth()`.
- Global `ValidationPipe`: `whitelist:true, forbidNonWhitelisted:true` — every accepted query param must be declared in `FeedQueryDto`.
- Global prefix `/api`; raw body via `@Res()` (`EnvelopeInterceptor` must not wrap it). Validation errors still arrive as JSON envelope — acceptable.
- Sort whitelist exactly (copy from `QueryServersDto`): `latency_asc, latency_desc, confidence_asc, confidence_desc, name_asc, name_desc, address_asc, address_desc, port_asc, port_desc, protocol_asc, protocol_desc`; default `latency_asc`.
- `limit`: default 200, min 1, max 1000; no `page` param.
- `format` values: `subscription` (default) and `json`; unknown → 400 via `@IsIn`.
- Anycast threshold from `scanner_settings` row `id='singleton'`, fallback `0.5`.
- `resolvedIp` = newest `anycast_scores.resolvedIp` (`lastUpdated DESC`); `null` when no rows; never fall back to `profile.address`.
- Dedup exact link strings, preserve first-seen order. `count = servers.length`; `skipped` = null-link + duplicate drops only.
- No DB schema change, no new dependencies, no commits unless operator asks.
- Update `AGENTS.md`, `PLAN.md`, `README.md` when behavior changes.

## Review Focus

- Expired/errored/disabled subscriptions must contribute zero servers — test in Task 3 with a subscription join assertion.
- Non-present profiles must never leak — test via shared filter helper in Task 1 and feed query in Task 3.
- REALITY/TLS links must survive rebuild (`pbk`, `sid`, `flow`, `type=xhttp`, `alpn`, `fp`) — test in Task 2 with a REALITY profile.
- Public response must be raw body, not `{ok,data}` — verify with a real HTTP call in Task 4.
- Unknown/undeclared query params must 400 while all documented params are accepted — DTO validation test in Task 3 and HTTP check in Task 4.

---

### Task 1: Shared filter/sort helper

**Files:**
- Create: `backend/src/query/server-filter.ts`
- Modify: `backend/src/query/query.service.ts`
- Test: `backend/src/query/server-filter.spec.ts`

**Interfaces:**
- Produces: `export interface ServerFilters { search?: string; protocol?: string; reachable?: boolean; services?: string[]; anycast?: boolean }`
- Produces: `applyServerFilters(qb: SelectQueryBuilder<Profile>, filters: ServerFilters, threshold: number): void` — adds `profile.present = true` plus search/protocol/reachable/services/anycast clauses.
- Produces: `applyServerSort(qb: SelectQueryBuilder<Profile>, sort?: string): void` — default `latency_asc`.

- [ ] **Step 1: Write failing tests** in `server-filter.spec.ts`: mock QB (`andWhere`, `orderBy` as `jest.fn()`), assert: `present = :present`; `services` produces `@> :serviceIds::jsonb` with `JSON.stringify([...])`; `anycast=false` produces `OR ... IS NULL`; `applyServerSort` unknown → `profile.lastLatencyMs` ASC.
- [ ] **Step 2:** `pnpm --filter mglaroute-vpn-server-backend test -- server-filter.spec.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement helper by moving clauses/switch from `query.service.ts` verbatim; `QueryService` imports it, keeps pagination + row mapping unchanged.
- [ ] **Step 4:** `pnpm --filter mglaroute-vpn-server-backend test` → PASS (existing `query.service.spec.ts` still green).

### Task 2: Subscription link builder

**Files:**
- Create: `backend/src/feed/subscription-link.builder.ts`
- Test: `backend/src/feed/subscription-link.builder.spec.ts`

**Interfaces:**
- Produces: `buildProfileLink(profile: Profile): string | null`.

- [ ] **Step 1: Write failing tests**: vless REALITY (assert `security=reality`, `pbk`, `sid`, `flow`, `type=xhttp`, `fp`, encoded remark); vmess (`vmess://` + base64 decodes to JSON with `v:'2'`, `ps`, `add`, `port`, `id`); ss (`ss://` base64 of `method:password`); trojan password + query params; missing `uuid`/`password` → `null`; remark with spaces/emoji is encoded; no empty params in query.
- [ ] **Step 2:** run builder spec → FAIL (module missing).
- [ ] **Step 3:** Implement. Source values: canonical `Profile` fields override `rawConfig`; whitelisted raw keys exactly `security, sni, fp, pbk, publicKey, sid, shortId, spx, flow, encryption, type, path, host, alpn, serviceName, headerType, mode, packetEncoding, allowInsecure, extra, skip-cert-verify`; arrays → `join(',')`; omit undefined/null/empty. `encodeURIComponent` for remark. `Buffer.from(json,'utf8').toString('base64')` for vmess and ss userinfo.
- [ ] **Step 4:** builder spec → PASS.

### Task 3: Feed DTO + service

**Files:**
- Create: `backend/src/feed/dto/feed-query.dto.ts`, `backend/src/feed/feed.service.ts`
- Test: `backend/src/feed/feed.service.spec.ts`, `backend/src/feed/feed-query.dto.spec.ts`

**Interfaces:**
- Produces: `class FeedQueryDto { format?: 'json'|'subscription'; anycast?: boolean; reachable?: boolean; protocol?: string; search?: string; sort?: string; services?: string[]; limit?: number }` — all `@IsOptional`; `services` `@Transform` accepts `a,b` or repeated/array; booleans as in `QueryServersDto`; `limit` `@Min(1) @Max(1000)` default 200.
- Consumes: `applyServerFilters`, `applyServerSort`, `buildProfileLink`.
- Produces: `FeedService.generate(dto: FeedQueryDto): Promise<{ body: string; contentType: 'application/json'|'text/plain; charset=utf-8' }>`. Internally `getProfiles(dto)` and `buildJson(dto)`.

- [ ] **Step 1: Write failing tests**: service harness with mocked `createQueryBuilder`, `findOne` (settings threshold 0.5), `anycastScoreRepository.find` (two rows, newest first). Assert QB contains `subscription.status` and `subscription.enabled` clauses, `present`, `services @>`, anycast threshold, `.take(200)` and no `.skip`; `format=json` body parses to `{generatedAt,count,skipped,servers}` with `resolvedIp` from newest score and null when absent, ISO dates; `format=subscription` body = unique links joined by `\n` + trailing `\n`, empty → `''`; duplicate link increments `skipped`; null-link profile increments `skipped`. DTO spec: unknown param fails, comma services becomes `['a','b']`, `limit=1001` fails, bad `format` fails.
- [ ] **Step 2:** run feed specs → FAIL.
- [ ] **Step 3:** Implement service. Query: `createQueryBuilder('profile').innerJoin('profile.subscription','subscription')`, `andWhere('subscription.status = :status', {status: SubscriptionStatus.ACTIVE})`, `andWhere('subscription.enabled = :enabled', {enabled:true})`, shared filters, sort, `.take(limit).getMany()`. Load scores with `find({ where:{ profileId: In(ids) }, order:{ lastUpdated:'DESC' } })`, first per profile. Map JSON rows exactly: `id,name,remarks,protocol,address,port,link,latencyMs,reachable,anycastConfidence,anycastSamples,resolvedIp,lastScannedAt,services,servicesCheckedAt`.
- [ ] **Step 4:** feed specs → PASS.

### Task 4: Public controller + module wiring + docs

**Files:**
- Create: `backend/src/feed/feed.controller.ts`, `backend/src/feed/feed.module.ts`
- Modify: `backend/src/app.module.ts`, `AGENTS.md`, `PLAN.md`, `README.md`

**Interfaces:**
- Consumes: `FeedService.generate`, `FeedQueryDto`.
- Produces: `GET /api/feed?format=json|subscription&...`.

- [ ] **Step 1:** Write controller/module: `@Controller('feed')`, `@Public()` at class level, `@Get()` with `@Query() dto: FeedQueryDto` and `@Res() res: Response`, `res.type(result.contentType).send(result.body)`; no `JwtAuthGuard`, no `@ApiBearerAuth()`; Swagger `@ApiOperation`/`@ApiQuery` for `format`. `FeedModule` = `TypeOrmModule.forFeature([Profile, AnycastScore, ScannerSettings, Subscription])` + controller/service; add to `AppModule.imports`.
- [ ] **Step 2:** `pnpm --filter mglaroute-vpn-server-backend build` → PASS.
- [ ] **Step 3:** Against running backend (`localhost:3000`) verify: `curl -i 'http://localhost:3000/api/feed?format=subscription'` → `200`, `Content-Type: text/plain`, body lines start with `vless://`/`ss://`/`vmess://`/`trojan://`; `curl -i '...format=json'` → `application/json` with no `ok/data` envelope; no `Authorization` header; `format=bogus` → 400.
- [ ] **Step 4:** Update `AGENTS.md` API list (public endpoint), `PLAN.md`, `README.md` with endpoint/params example.

### Task 5: Dark theme + Dashboard feed panel

**Files:**
- Modify: `frontend/index.html`, `frontend/src/index.css`, `frontend/src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: public `GET /api/feed` URL; `GET /api/online-services/enabled` (array of `{id,name}`).

- [ ] **Step 1:** `index.html`: `<html lang="en" class="dark">`. `index.css`: add `color-scheme: dark;` to `body` rule.
- [ ] **Step 2:** Dashboard new Card after "Last Scan": controlled `useState` for format, protocol, anycast, reachable, sort, search, limit (number 1..1000), selected service ids (`Set<string>`), generated URL, copy state, error. Load enabled services via `api.get<{id:string;name:string}[]>('/api/online-services/enabled')` in `useEffect`, ignore failure.
- [ ] **Step 3:** `Generate` builds `base = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/,'')`, `params = new URLSearchParams({ format })`, append only non-default values (`sort` only if !== `latency_asc`, `limit` only if !== 200, `protocol`, `search`, `anycast`, `reachable`, `services` as comma list). Show readonly `Input` + `Copy` (`navigator.clipboard.writeText`) + `Open` anchor (`target="_blank" rel="noopener noreferrer"`). Add warning text that link is public.
- [ ] **Step 4:** `pnpm --filter mglaroute-vpn-server-frontend build` → PASS; open `http://localhost:5173`, confirm dark background and generated link opens the feed.

## Self-Review

- Spec sections covered: intent/goals (Tasks 3-5), constraints (global), approaches (approved one-endpoint), URI builder (Task 2), formats (Task 3), frontend (Task 5), tests (Tasks 1-3), docs (Task 4).
- Review Focus inputs each pinned to a test/HTTP check above.
- Type names consistent across tasks: `ServerFilters`, `applyServerFilters`, `applyServerSort`, `buildProfileLink`, `FeedQueryDto`, `FeedService.generate`.
