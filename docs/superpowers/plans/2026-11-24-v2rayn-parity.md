# v2rayN Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scanner show v2rayN-style remarks, measure real delay through a downloaded xray core without the OS proxy, finish a full scan, and auto-refresh subscriptions.

**Architecture:** Parser emits `remarks` plus full `rawConfig`; a per-profile xray process exposes a loopback mixed inbound used by axios for two HTTP GETs. Scanner upserts profiles, isolates per-profile failures, and resolves IP literals without hitting `inet` with `''`. A one-minute cron tick applies both global settings and per-subscription intervals; frontend uses the same field names as backend.

**Tech Stack:** NestJS 10, TypeORM/Postgres, axios, xray-core, adm-zip, Node 20 `node:test`, React/Vite/Zustand.

**Spec:** `docs/superpowers/specs/2026-11-24-v2rayn-parity-design.md`

## Global Constraints

- `DB_SYNCHRONIZE=false` locally and in prod; operator approved one-time flip to `true` for the deploy that adds columns, then back to `false`. Back up Postgres first.
- Scanner network calls must never use `HTTP_PROXY`/`HTTPS_PROXY`: explicit `proxy:false`, except the loopback proxy object in delay GET and the download script (which intentionally uses proxy env).
- Only vmess-base64, vless, ss, trojan and Clash YAML are in scope.
- `profiles` unique index is `(subscriptionId, serverId)`; never blind-insert on refresh.
- `resolvedIp` columns are Postgres `inet`; `''` is invalid.
- Delay metric keeps the name `lastLatencyMs`; real delay is the default.
- No git repo exists at workspace root; commit steps are checkpoints until one is initialized.

## Review Focus

1. Subscription/reachability fetches with host proxy env set — must pass `proxy:false`; test spies on `axios.get` and asserts the option in Task 5.
2. IP-literal address with failing DNS — must not call anycast with `''`; test in Task 5.
3. Re-scan of the same subscription — must update, not duplicate; test in Task 5.
4. vless/trojan `#fragment` and Clash `name` — must become `remarks`; tests in Task 2.
5. Missing xray binary or malformed profile — delay returns `null` and scan continues; tests in Task 4.

---

### Task 1: xray downloader + npm command

**Files:**
- Create: `backend/scripts/xray-assets.mjs`, `backend/scripts/xray-assets.test.mjs`, `backend/scripts/download-xray.mjs`
- Modify: `backend/package.json`, `package.json`, `Dockerfile`
- Create: `.gitignore`

**Interfaces:**
- Produces: `selectAsset(release, platform, arch) -> {name, browser_download_url}`; `parseSha256(text) -> string`; `verifySha256(buffer, expectedHex) -> boolean`; default binary path `<repo>/backend/bin/xray` (`.exe` on win32), overridable by `XRAY_BINARY_PATH`.

- [ ] **Step 1: Write failing tests for asset selection and checksum parsing**

`backend/scripts/xray-assets.test.mjs` (Node `node:test`):
- `selectAsset` with fake release assets names `Xray-win7-64.zip`, `Xray-linux-64.zip`, `Xray-macos-arm64-v8a.zip` returns the exact `browser_download_url` for (`win32`,`x64`), (`linux`,`x64`), (`darwin`,`arm64`).
- `parseSha256('sha256:abc123\n') === 'abc123'`; `verifySha256(Buffer.from('x'), sha256('x')) === true`, wrong digest `false`.
- Unknown platform/arch throws.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test scripts/xray-assets.test.mjs`
Expected: FAIL — module `./xray-assets.mjs` not found.

- [ ] **Step 3: Implement `backend/scripts/xray-assets.mjs`**

Pure ESM helpers: candidate name lists per OS/arch (win32: `Xray-win7-64.zip`, `Xray-win7-arm64-v8a.zip`; linux: `Xray-linux-64.zip`, `Xray-linux-arm64-v8a.zip`; darwin: `Xray-macos-64.zip`, `Xray-macos-arm64-v8a.zip`), matching against `release.assets[].name`; sha256 via `node:crypto`. No network calls in this module.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test scripts/xray-assets.test.mjs`
Expected: PASS.

- [ ] **Step 5: Implement `backend/scripts/download-xray.mjs`**

ESM CLI: axios GET `https://api.github.com/repos/XTLS/Xray-core/releases/latest` (or `XRAY_VERSION` tag) with `Accept: application/vnd.github.v3+json`; select zip asset + its `.dgst` asset; download both as `arraybuffer` one at a time; `verifySha256`; `new AdmZip(zip)` extract to temp dir; copy `xray`/`xray.exe` to `backend/bin/`; `chmod 0o755`; spawn `xray -version` and print output. `XRAY_DOWNLOAD_URL` overrides the zip URL. Do NOT set `proxy:false` as the first attempt — download intentionally honors proxy env; on a transport error (no HTTP response) retry that request directly with `proxy:false`, since a local HTTP proxy may drop TLS tunnels.

- [ ] **Step 6: Wire npm scripts, dependency, ignore and Docker**

`backend/package.json`: add devDependency `"adm-zip": "^0.5.16"`, scripts `"xray:download": "node scripts/download-xray.mjs"`, `"test:xray": "node --test scripts/*.test.mjs"`.
Root `package.json`: `"xray:download": "pnpm --filter mglaroute-vpn-server-backend xray:download"`.
`.gitignore`: `node_modules/`, `backend/bin/`.
`Dockerfile`: after `COPY backend/ ./` add `RUN npm run xray:download`; in `backend-prod` add `COPY --from=backend-builder /app/backend/bin ./backend/bin`.

- [ ] **Step 7: Verify the real download**

Run: `pnpm install && pnpm xray:download`
Expected: prints `Xray <version>`; `backend/bin/xray.exe` exists on Windows. If GitHub is unreachable, rerun with `XRAY_DOWNLOAD_URL` pointing to a mirror.

- [ ] **Step 8: Checkpoint**

Record diff; no git repo yet, so no commit.

---

### Task 2: Parser remarks + Clash stream fields

**Files:**
- Modify: `backend/src/scanner/parser.service.ts`
- Test: `backend/src/scanner/parser.service.spec.ts`

**Interfaces:**
- Consumes: subscription text; `Partial<Profile>` shape from `backend/src/profiles/profile.entity.ts`.
- Produces: `parseSubscriptionText(text): { profiles: ParsedProfile[], skipped: number }`; every `ParsedProfile` has `remarks?: string | null`, `rawConfig: Record<string, any>`; `name` stays `address:port` as fallback.

- [ ] **Step 1: Write failing parser tests**

`parser.service.spec.ts` cases:
- `vless://uuid@h:443?type=ws&host=cdn#My%20RU` → `remarks === 'My RU'`, `rawConfig.type === 'ws'`, `rawConfig.host === 'cdn'`.
- `trojan://pw@h:443?sni=x#TrojanName` → `remarks === 'TrojanName'`, `rawConfig.sni === 'x'`.
- vmess base64 JSON with `ps: 'VM Name'` → `remarks === 'VM Name'`.
- `ss://...#SS%20Name` → `remarks === 'SS Name'`.
- Clash YAML proxy with `name: ClashRU` + `uuid`, `cipher`, `password`, `tls: true`, `network: ws` → `remarks === 'ClashRU'` and those fields present in `rawConfig`.
- Whole-body base64 that decodes to `vless://...` lines → 1 profile with fragment remark.
- Raw Clash YAML (not base64-wrapped) → profiles parsed.
- Two identical URI lines → deduped to 1.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand src/scanner/parser.service.spec.ts`
Expected: FAIL — `remarks` undefined / zero profiles.

- [ ] **Step 3: Implement parser changes**

In `parseLine`: read `url.hash.slice(1)` as remark source for vless/trojan; merge hash `URLSearchParams` into `rawConfig` after query params; vmess use `obj.ps`; ss keeps fragment; `remarks` is separate from `name`. In `parseSubscriptionText`: decode whole body when decoded text contains any of `vmess://|vless://|ss://|trojan://|proxies:`; accept raw YAML containing `proxies:`; dedupe identical lines before parsing. Replace strict Clash regex with a line-based block parser that keeps arbitrary keys under each `- name:` entry and maps them into `rawConfig`.

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Checkpoint**

---

### Task 3: Schema fields + DTO validation

**Files:**
- Modify: `backend/src/profiles/profile.entity.ts`, `backend/src/subscriptions/subscription.entity.ts`, `backend/src/settings/settings.entity.ts`, `backend/src/settings/settings.service.ts`, `backend/src/settings/settings.controller.ts`, `backend/src/subscriptions/dto/create-subscription.dto.ts`
- Create: `backend/src/settings/dto/update-settings.dto.ts`
- Test: `backend/src/settings/settings.dto.spec.ts`, `backend/src/subscriptions/subscriptions.dto.spec.ts`

**Interfaces:**
- Produces: `Profile.remarks?: string|null`, `Profile.present: boolean (default true)`; `Subscription.enabled: boolean (default true)`, `Subscription.autoUpdateIntervalMinutes: number (default 0)`; `ScannerSettings.enabled: boolean (default true)`, `ScannerSettings.latencyThresholdMs: number (default 5000)`; `UpdateSettingsDto` with canonical keys only.

- [ ] **Step 1: Write failing DTO validation tests**

- `plainToInstance(UpdateSettingsDto, {intervalSeconds:600, enabled:true})` validates with no errors.
- Unknown key `scanIntervalMinutes` → validation error under global `whitelist/forbidNonWhitelisted` behaviour.
- `CreateSubscriptionDto` accepts `enabled:false`, `autoUpdateIntervalMinutes:60`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand src/settings/settings.dto.spec.ts src/subscriptions/subscriptions.dto.spec.ts`
Expected: FAIL — DTO/class not found.

- [ ] **Step 3: Add columns and DTOs**

Additive columns with defaults as listed in Interfaces. `UpdateSettingsDto` uses `@IsInt`, `@IsBoolean`, `@IsNumber`, `@IsOptional` and `@ApiPropertyOptional`; controller signature becomes `@Body() updates: UpdateSettingsDto`. Extend `SettingsService.onModuleInit` defaults with `enabled: true`, `latencyThresholdMs: 5000`. Extend create subscription DTO with `@IsOptional @IsBoolean` / `@IsInt @Min(0)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Apply schema with one-time synchronize flip**

Set `DB_SYNCHRONIZE=true` in `backend/.env`, start backend once (`pnpm --filter mglaroute-vpn-server-backend start:dev`, wait for "Nest application successfully started"), stop it, set back to `false`. Verify columns exist with `psql -c "\d profiles"` (or remote via SSH). Back up DB before flipping in prod.

- [ ] **Step 6: Checkpoint**

---

### Task 4: Xray outbound builder + real delay service

**Files:**
- Create: `backend/src/scanner/xray-outbound.builder.ts`, `backend/src/scanner/xray-delay.service.ts`
- Modify: `backend/src/scanner/scanner.module.ts`
- Test: `backend/src/scanner/xray-outbound.builder.spec.ts`, `backend/src/scanner/xray-delay.service.spec.ts`

**Interfaces:**
- Produces: `buildXrayOutbound(profile: Profile): Record<string, any> | null`; `buildDelayConfig(profile: Profile, port: number): Record<string, any>`; `XrayDelayService.measureDelay(profile: Profile, timeoutMs: number): Promise<number|null>` — never throws for expected failures.

- [ ] **Step 1: Write failing builder tests**

Fixtures for vless (ws+tls), vmess (alterId), ss, trojan, vless with `security:'reality'` + `pbk`/`sid` in `rawConfig`. Assert outbound protocol, users/servers, `streamSettings.network`, TLS `serverName`, reality `publicKey`/`shortId`, and that `allowInsecure` maps to `tlsSettings.allowInsecure`. Malformed profile (missing uuid/password) → `null`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand src/scanner/xray-outbound.builder.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement builder**

Map `protocol` to outbound object; merge `rawConfig` keys into stream settings; return `null` when required credentials absent. `buildDelayConfig` wraps outbound with `mixed` inbound on `127.0.0.1:<port>`, `log.loglevel='warning'`, and a `freedom` direct outbound.

- [ ] **Step 4: Run builder tests to verify they pass**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Write failing delay-service tests**

Spy on `child_process.spawn` and `axios.get`: (a) when builder returns `null` → `measureDelay` returns `null`, no spawn; (b) stub a listening loopback TCP server on the chosen port, axios returns 204 twice → returns a positive number and kills the child in `finally`; (c) spawn error → returns `null`, no throw.

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand src/scanner/xray-delay.service.spec.ts`
Expected: FAIL.

- [ ] **Step 7: Implement `XrayDelayService`**

Resolve binary path from `XRAY_BINARY_PATH` or `backend/bin/xray[.exe]`; write temp config; spawn; poll TCP connect up to `XRAY_STARTUP_TIMEOUT_MS` (default 2000); axios GET `XRAY_PING_URL` (default `https://www.google.com/generate_204`) twice with explicit `proxy:{protocol:'http',host:'127.0.0.1',port}`, `timeout:timeoutMs`, 100 ms gap; return min positive elapsed; kill + unlink in `finally`. Register provider in `ScannerModule`.

- [ ] **Step 8: Run tests to verify they pass**

Run: same as Step 6. Expected: PASS.

- [ ] **Step 9: Checkpoint**

---

### Task 5: Scanner refactor — upsert, failure isolation, proxy bypass

**Files:**
- Modify: `backend/src/scanner/scanner.service.ts`, `backend/src/scanner/scanner.controller.ts`, `backend/src/scanner/reachability.service.ts`, `backend/src/subscriptions/subscriptions.service.ts`, `backend/src/query/query.service.ts`, `backend/src/query/query.dto.ts`
- Test: `backend/src/scanner/scanner.service.spec.ts`

**Interfaces:**
- Consumes: `XrayDelayService.measureDelay`, `parseSubscriptionText`, `Profile.present`.
- Produces: `ScannerService.runScan(): Promise<void>`; `getStatus(): {running, lastScanAt, nextScanAt, lastScanResult:{profilesScanned, succeeded, failed, details}}`; per-profile result `{profileId, latency, reachable, error?}`.

- [ ] **Step 1: Write failing tests**

- Spy `axios.get` in `scanSubscription`: assert every call has `proxy:false` (subscription fetch and reachability).
- Profile with address `144.31.225.5` and DNS resolving nothing → `computeAnycastScore` never called with `''`; scan completes.
- A `scanProfile` that throws → next profile still scanned; `lastScanResult.failed >= 1`.
- Re-scan same subscription text → repository `save` called only for updates, not a second insert with new uuid; `serverCount === parsed.length`.
- Fetch failure → stored profiles still scanned and `lastError` set.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand src/scanner/scanner.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Refactor scanner**

Select subscriptions by `enabled=true`. Fetch with `proxy:false`; on failure keep stored profiles and set `lastError`. Upsert parsed profiles by `(subscriptionId, serverId)`, set `remarks`, merge `rawConfig`, set `present=true`, keep scan stats and existing `name` when non-empty; mark missing profiles `present=false`; set `serverCount = parsed.length`. For each profile use `XrayDelayService` (fallback raw TCP only when `delayMode==='tcp'` or binary missing) inside try/catch; worker pool of `settings.concurrency`; resolve IP literals with `net.isIP` before DNS; skip anycast when no resolved IP; extend status shape; update `query.service.ts` to filter `present=true` and search `remarks`.

- [ ] **Step 4: Run tests to verify they pass**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Checkpoint**

---

### Task 6: Auto-update cron + real subscription fetch endpoint

**Files:**
- Modify: `backend/src/scanner/cron.service.ts`, `backend/src/subscriptions/subscriptions.service.ts`, `backend/src/scanner/scanner.service.ts`
- Test: `backend/src/scanner/cron.service.spec.ts`, `backend/src/subscriptions/subscriptions.service.spec.ts`

**Interfaces:**
- Consumes: `ScannerService.runScan`, `SettingsService.getSettings`.
- Produces: `cron.handleCron()` tick; `SubscriptionsService.fetch(id): {ok,message,parsed?}` now parses and upserts.

- [ ] **Step 1: Write failing tests**

- Cron with `settings.enabled=false` → `runScan` not called.
- Cron with `lastScanAt` older than `intervalSeconds*1000` → `runScan` called; younger → not called.
- Subscription with `autoUpdateIntervalMinutes=0` → not refreshed on scan; with `60` and stale `lastFetchedAt` → refreshed; failed fetch leaves `lastFetchedAt` unchanged.
- `fetch(id)` returns parsed profile count and calls the same upsert path.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand src/scanner/cron.service.spec.ts src/subscriptions/subscriptions.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`@Cron(CronExpression.EVERY_MINUTE)` tick checks `enabled` and elapsed time; compute `nextScanAt`. In `runScan`, refresh subscriptions whose interval elapsed (successful fetch only updates `lastFetchedAt`); replace stub `fetch()` with real download+parse+upsert; keep `status=error` on failure but do not exclude from future scans.

- [ ] **Step 4: Run tests to verify they pass**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Checkpoint**

---

### Task 7: Frontend alignment (settings, status, remarks)

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/ServersPage.tsx`, `frontend/src/pages/DashboardPage.tsx`
- Test: no frontend test framework; verify by type-check + browser.

**Interfaces:**
- Consumes: `/api/settings` canonical keys, `/api/scanner/status` new shape, `/api/servers` `remarks`.

- [ ] **Step 1: Update types and form fields in `SettingsPage.tsx`**

Replace `scanIntervalMinutes/scanTimeoutSeconds/scanConcurrency/latencyThresholdMs` with `intervalSeconds/timeoutMs/concurrency/latencyThresholdMs/anycastMinSamples/anycastThreshold/enabled`; display `lastScanAt`, `nextScanAt`, `profilesScanned/succeeded/failed`; poll status every 2 s while `running`.

- [ ] **Step 2: Show remarks in `ServersPage.tsx`**

Render `remarks ?? name` as the primary label; add `remarks` to searchable columns; keep `name` as secondary text.

- [ ] **Step 3: Fix `DashboardPage.tsx` status fields**

Use `lastScanAt` instead of `lastRun`; show failed count.

- [ ] **Step 4: Verify**

Run: `pnpm --filter mglaroute-vpn-server-frontend build`
Expected: PASS (no TS errors). Then browse `http://localhost:5173/settings` and `/servers`, confirm remarks visible and status populated after a scan.

- [ ] **Step 5: Checkpoint**

---

## Self-Review

- Spec coverage: remarks (T2), proxy bypass + real delay (T1, T4, T5), scan bug/upsert (T5), auto-update (T3, T6), settings/status sync (T3, T6, T7), download script (T1), tests for all Review Focus items (T2, T4, T5).
- Type consistency: `ParsedProfile.remarks`, `Profile.present`, `XrayDelayService.measureDelay`, status shape names used unchanged across tasks.
- Open risk: xray binary compatibility on Alpine prod host; verification is Task 1 Step 7 plus Docker build.
