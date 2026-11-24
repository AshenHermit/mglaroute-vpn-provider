# Online services through xray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure which enabled online services work through each VPN server via a real xray proxy, cache the result per server with expiry/invalidation, and show it in `/servers`.

**Architecture:** Keep everything in the existing NestJS/TypeORM backend. A fingerprint helper detects service-set changes; `XrayDelayService` gains a session helper that keeps one xray core alive; a new `ServiceCheckService` GETs service URLs through that core and keeps only 2xx results; the scanner stores reachable service IDs on `Profile`; `QueryService` and the React pages expose them. No new tables.

**Tech Stack:** NestJS 10, TypeORM 0.3 + PostgreSQL, axios, Jest/ts-jest, React 18 + Vite 5 + Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-24-online-services-through-vpn-design.md`

All file paths below are relative to `mglaroute-vpn-server/`.

## Global Constraints

- Only reachable service **IDs** stored; names stay editable in `online_services`.
- Service reachable only when **all** its `testUrls` return 2xx through the xray proxy; empty `testUrls` ⇒ never reachable. A URL shared by several services maps to all of their IDs.
- Service check runs only after a successful xray delay (`latency !== null`); skipped on TCP fallback / no binary / session failure, with no timestamp change.
- Recheck only when `servicesCheckedAt` is null, fingerprint differs, or elapsed ≥ `serviceCheckExpirationSeconds * 1000`; never clear the stored list when the server is unreachable.
- `XRAY_BINARY_PATH=./bin/xray.exe` in `backend/.env`; xray path resolves relative to backend cwd. No OS proxy fallback: service requests must carry an explicit loopback proxy config, never `proxy: false`.
- Keep `scan_history` writes for every scanned profile/service URL (anycast sample count depends on them); `reachable` comes from the fresh check or the stored list.
- `DB_SYNCHRONIZE=false` in dev/prod and no migrations. New columns need a **one-time, operator-approved** flip to `true`, backend restart, then flip back. Never overwrite `backend/.env` silently.
- Existing `*.spec.ts` are advisory, not a strict gate: edit or relax them where they encode old direct-check behaviour.
- Working tree already has unrelated dirty files (`backend/scripts/*`, v2rayN docs). Commit **only** the explicit files listed in each task; never `git add -A`.

## Review Focus

- 403/404/5xx on a service URL ⇒ service absent from `serviceIds` even if other URLs pass — pinned in Task 2 (`ServiceCheckService` spec).
- A new or URL-edited service invalidates a fresh check before expiry — pinned in Task 1 (fingerprint spec) and Task 3 (scanner spec).
- `latency === null` / xray missing ⇒ no proxy requests and no `servicesCheckedAt` stamp — pinned in Task 3.
- Empty `testUrls` and a URL shared by two services ⇒ no vacuous success, both IDs recorded — pinned in Task 2 and Task 3.
- Stored list survives a later unreachable scan; history rows still written — pinned in Task 3.

---

### Task 1: Expiration setting + service-set fingerprint

**Files:**
- Modify: `backend/src/settings/settings.entity.ts`, `backend/src/settings/settings.service.ts`, `backend/src/settings/dto/update-settings.dto.ts`
- Create: `backend/src/scanner/service-fingerprint.ts`, `backend/src/scanner/service-fingerprint.spec.ts`
- Modify: `backend/src/settings/settings.dto.spec.ts`

**Interfaces:**
- Consumes: enabled `OnlineService[]` (`{ id: string; testUrls: string[]; isEnabled: boolean }`).
- Produces: `computeServicesFingerprint(services: Array<{ id: string; testUrls: string[] }>): string` (sha256 hex, stable across URL order; empty set has its own stable value) and `ScannerSettings.serviceCheckExpirationSeconds: number` (default 3600, `@IsInt @Min(1)`).

- [ ] **Step 1: Write failing fingerprint spec**

In `backend/src/scanner/service-fingerprint.spec.ts`, assert: (a) same services with URLs in different order give the same string; (b) adding a service, editing a URL, and toggling `isEnabled` (caller passes only enabled services) each change the string; (c) an empty array returns a stable non-empty string.

- [ ] **Step 2: Run it to confirm failure**

Run: `cd backend && pnpm test -- --runInBand scanner/service-fingerprint.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Use `node:crypto` `createHash('sha256')`. Input: services sorted by `id`, each encoded `${id}:${[...testUrls].sort().join(',')}`, joined with `|`. Hash the joined string. Do not export anything else.

- [ ] **Step 4: Add the setting**

`settings.entity.ts`: `@Column({ default: 3600 }) serviceCheckExpirationSeconds: number;`
`settings.service.ts`: add `serviceCheckExpirationSeconds: 3600` to the seeded singleton.
`update-settings.dto.ts`: add `serviceCheckExpirationSeconds?: number` with `@ApiPropertyOptional({ default: 3600 })`, `@IsOptional()`, `@IsInt()`, `@Min(1)`.
`settings.dto.spec.ts`: assert a payload containing `serviceCheckExpirationSeconds: 7200` validates with zero errors.

- [ ] **Step 5: Run tests and build**

Run: `cd backend && pnpm test -- --runInBand scanner/service-fingerprint.spec.ts settings/settings.dto.spec.ts && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit only these files**

`git add backend/src/scanner/service-fingerprint.ts backend/src/scanner/service-fingerprint.spec.ts backend/src/settings/settings.entity.ts backend/src/settings/settings.service.ts backend/src/settings/dto/update-settings.dto.ts backend/src/settings/settings.dto.spec.ts && git commit -m "feat: add service fingerprint and expiration setting"`

---

### Task 2: xray session helper + proxy service check

**Files:**
- Modify: `backend/src/scanner/xray-delay.service.ts`, `backend/src/scanner/xray-delay.service.spec.ts`
- Create: `backend/src/scanner/service-check.service.ts`, `backend/src/scanner/service-check.service.spec.ts`

**Interfaces:**
- Consumes: `Profile`, existing `buildDelayConfig`/`buildXrayOutbound`, axios.
- Produces: exported `DelayProxy = { protocol: 'http'; host: '127.0.0.1'; port: number }`; `XrayDelayService.withProxy<T>(profile: Profile, timeoutMs: number, callback: (proxy: DelayProxy) => Promise<T>): Promise<T | null>` (null when outbound/build/spawn/bind fails; child killed after callback, including on throw); `XrayDelayService.probeDelay(proxy: DelayProxy, timeoutMs: number): Promise<number | null>` (the existing two GETs through an already-running proxy, min positive sample); `measureDelay` unchanged in signature/behaviour and implemented as `withProxy` + `probeDelay`; `ServiceCheckService.check(urls: string[], proxy: DelayProxy, timeoutMs: number): Promise<Set<string>>` returning URLs whose final status is 2xx.

- [ ] **Step 1: Write failing service-check spec**

Assert: (a) 200 and 204 URLs are returned; (b) 403, 404, 500 and network errors are not; (c) every `axios.get` call carries the exact supplied `proxy` object and `validateStatus: () => true`; (d) empty `urls` resolves to an empty `Set`.

- [ ] **Step 2: Write failing withProxy spec**

Extend `xray-delay.service.spec.ts`: (a) callback receives `{ protocol: 'http', host: '127.0.0.1', port: expect.any(Number) }` and the mocked child is still alive during the callback; (b) `kill` called after callback resolves and also when callback rejects; (c) existing `measureDelay` cases still hold.

- [ ] **Step 3: Run to confirm failure**

Run: `cd backend && pnpm test -- --runInBand scanner/service-check.service.spec.ts scanner/xray-delay.service.spec.ts`
Expected: FAIL — missing symbols.

- [ ] **Step 4: Implement `ServiceCheckService`**

Promise-all over `urls`; `await axios.get(url, { proxy, timeout: timeoutMs, validateStatus: () => true })`; add URL to the Set only when `status >= 200 && status < 300`; catch per-URL errors and omit. No `proxy: false` branch.

- [ ] **Step 5: Refactor `XrayDelayService`**

Extract the current spawn/free-port/wait/kill lifecycle into `withProxy`; it returns `null` on build/binary/bind failure and propagates callback results. Extract the two GETs/min-positive logic into `probeDelay(proxy, timeoutMs)`, callable while the core is alive. Implement `measureDelay` as `withProxy(profile, timeoutMs, (proxy) => probeDelay(proxy, timeoutMs))`. Keep `isAvailable()` and `binaryPath()` unchanged.

- [ ] **Step 6: Run tests and build**

Run: `cd backend && pnpm test -- --runInBand scanner/service-check.service.spec.ts scanner/xray-delay.service.spec.ts && pnpm build`
Expected: PASS.

- [ ] **Step 7: Commit only these files**

`git add backend/src/scanner/xray-delay.service.ts backend/src/scanner/xray-delay.service.spec.ts backend/src/scanner/service-check.service.ts backend/src/scanner/service-check.service.spec.ts && git commit -m "feat: add xray proxy session and service check"`

---

### Task 3: Profile columns + scanner gating and persistence

**Files:**
- Modify: `backend/src/profiles/profile.entity.ts`, `backend/src/scanner/scanner.service.ts`, `backend/src/scanner/scanner.module.ts`, `backend/src/scanner/scanner.service.spec.ts`

**Interfaces:**
- Consumes: `computeServicesFingerprint`, `ServiceCheckService.check`, `XrayDelayService.withProxy`, `ScannerSettings.serviceCheckExpirationSeconds`.
- Produces: `Profile.serviceIds: string[]` (jsonb, default `[]`), `Profile.servicesCheckedAt: Date | null`, `Profile.servicesFingerprint: string | null`; `/servers` rows carry those via Task 4. Scanner keeps `scanProfile`'s result shape `{ profileId, latency, reachable, resolvedIp }`.

- [ ] **Step 1: Write failing scanner spec cases**

Update the harness in `scanner.service.spec.ts`: inject a `serviceCheck = { check: jest.fn() }`, give settings `serviceCheckExpirationSeconds: 3600`, and mock `xrayDelay.withProxy` as `jest.fn(async (_profile, _timeout, cb) => cb(proxy))` plus `probeDelay: jest.fn().mockResolvedValue(42)`; keep `isAvailable: jest.fn().mockReturnValue(true)`. Add assertions: (a) latency `null` ⇒ `serviceCheck.check` not called and `servicesCheckedAt` unchanged; (b) stamped timestamp + matching fingerprint ⇒ not called, while null timestamp ⇒ called; (c) changed service URL ⇒ called; (d) only services whose every URL is in the returned Set land in the saved profile's `serviceIds`; (e) service requests never use `proxy: false` (relax the existing blanket `proxy:false` assertion to subscription-fetch calls only); (f) history rows still saved when a check is skipped.

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && pnpm test -- --runInBand scanner/scanner.service.spec.ts`
Expected: FAIL — new fields/mocks absent.

- [ ] **Step 3: Add Profile columns**

`profile.entity.ts`: `@Column({ type: 'jsonb', default: [] }) serviceIds: string[];`, `@Column({ type: 'timestamp', nullable: true }) servicesCheckedAt: Date | null;`, `@Column({ type: 'varchar', nullable: true }) servicesFingerprint: string | null;` — all additive.

- [ ] **Step 4: Rewire the scanner**

In `scanner.service.ts`: inject `ServiceCheckService` (drop the now-unused `ReachabilityService` injection and update the harness arity). In `scanProfile`: compute the current fingerprint from enabled services; when xray is available, wrap the whole probe in **one** `withProxy(profile, timeoutMs, callback)` call, get latency via `probeDelay(proxy, timeoutMs)`, and inside the same callback call `serviceCheck.check(allUrls, proxy, timeoutMs)` when latency is non-null and the check is due. Build a URL→serviceIds map, keep a service only when it has ≥1 URL and **every** URL is in the returned Set, then save `serviceIds`/`servicesCheckedAt`/`servicesFingerprint`. On TCP fallback keep the existing TCP latency path and skip service checks. When not due, reuse stored `serviceIds` for history `reachable`. On session/callback failure, save nothing service-related. Add `ServiceCheckService` to `scanner.module.ts` providers.

- [ ] **Step 5: Run tests and build**

Run: `cd backend && pnpm test -- --runInBand scanner/scanner.service.spec.ts && pnpm build`
Expected: PASS.

- [ ] **Step 6: Ask the operator for the one-time schema flip**

Do not edit `backend/.env` without permission. Ask the operator to set `DB_SYNCHRONIZE=true`, restart backend once so the three columns are created, then set `false` and restart again. Functional verification waits for this.

- [ ] **Step 7: Commit only these files**

`git add backend/src/profiles/profile.entity.ts backend/src/scanner/scanner.service.ts backend/src/scanner/scanner.module.ts backend/src/scanner/scanner.service.spec.ts && git commit -m "feat: cache expiring reachable services per profile"`

---

### Task 4: `/api/servers` service fields and filter

**Files:**
- Modify: `backend/src/query/query.service.ts`, `backend/src/query/query.service.spec.ts`

**Interfaces:**
- Consumes: `Profile.serviceIds`, `Profile.servicesCheckedAt`, existing `QueryServersDto.services?: string[]`.
- Produces: server rows with `services: string[]` and `servicesCheckedAt: string | null`; `services[]` filter means every requested ID is present.

- [ ] **Step 1: Write failing query spec cases**

Assert: (a) a profile with `serviceIds: ['svc-1']` is mapped to `services: ['svc-1']` and `servicesCheckedAt` preserved; (b) `queryServers({ services: ['svc-1'] })` adds a jsonb-containment clause on `profile.serviceIds` with JSON-encoded IDs; (c) absent `serviceIds` maps to `[]`.

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && pnpm test -- --runInBand query/query.service.spec.ts`
Expected: FAIL — fields missing.

- [ ] **Step 3: Implement**

Add `if (dto.services?.length) qb.andWhere('profile.serviceIds @> :serviceIds::jsonb', { serviceIds: JSON.stringify(dto.services) });` and the two fields in the `servers.map(...)` projection.

- [ ] **Step 4: Run tests and build**

Run: `cd backend && pnpm test -- --runInBand query/query.service.spec.ts && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit only these files**

`git add backend/src/query/query.service.ts backend/src/query/query.service.spec.ts && git commit -m "feat: expose and filter reachable services in servers API"`

---

### Task 5: Settings page + Servers page

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/ServersPage.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/settings` (`serviceCheckExpirationSeconds`), `GET /api/online-services/enabled` (`{ id, name }[]`), `GET /api/servers` rows from Task 4.
- Produces: editable expiration input; `Services` column with one badge per reachable ID resolved to its name; optional service filter sending `services[]=<id>`.

- [ ] **Step 1: Add the settings input**

`ScannerSettings` and `SettingsForm` gain `serviceCheckExpirationSeconds: number`; default 3600; load it in `fetchSettings`, submit via existing `api.put('/api/settings', formData)`, add a number input (min 60, max 604800) and an info line.

- [ ] **Step 2: Add the services column**

In `ServersPage.tsx`, extend `Server` with `services: string[]` and `servicesCheckedAt: string | null`. Fetch `/api/online-services/enabled` alongside servers, build `id → name`. Add a `Services` table head/cell rendering badges for `server.services` (fallback label to the raw ID when a name is unavailable); show `-` when empty. Keep `colSpan` for the empty row in sync.

- [ ] **Step 3: Add the service filter**

Add a Select in the filter card sourced from the same enabled list; send `params.append('services[]', id)` when chosen; include the selection in the `useEffect` dependency list.

- [ ] **Step 4: Build and manual check**

Run: `cd frontend && pnpm build`
Expected: PASS. Then open `http://localhost:5173/servers` (login `admin` if needed) and confirm the column renders; open `/settings` and confirm the expiration field loads/saves.

- [ ] **Step 5: Commit only these files**

`git add frontend/src/pages/SettingsPage.tsx frontend/src/pages/ServersPage.tsx && git commit -m "feat: show reachable services and expiration setting"`

---

### Task 6: Docs sync + end-to-end verification

**Files:**
- Modify: `AGENTS.md`, `PLAN.md`, `README.md` (only if it documents settings/server columns)

**Interfaces:**
- Consumes: all above.
- Produces: docs matching implemented behaviour; final verification evidence.

- [ ] **Step 1: Update docs**

`AGENTS.md`: add the three `profiles` columns, `serviceCheckExpirationSeconds` setting, and `/api/servers` `services[]` filter note. `PLAN.md`: update data model and scanner flow (check through xray only after successful delay, expiry + fingerprint invalidation, 2xx rule).

- [ ] **Step 2: Verify backend**

Run: `cd backend && pnpm test -- --runInBand && pnpm build`
Expected: PASS (advisory specs updated where they encoded old behaviour).

- [ ] **Step 3: Verify live behaviour**

With the schema flip applied and backend restarted: trigger `POST /api/scanner/run`, then `GET /api/servers`; confirm reachable IDs appear, a second run within the expiry window does not re-check, and editing a service URL forces a re-check on the next run.

- [ ] **Step 4: Commit docs**

`git add AGENTS.md PLAN.md README.md && git commit -m "docs: document expiring service checks"`
