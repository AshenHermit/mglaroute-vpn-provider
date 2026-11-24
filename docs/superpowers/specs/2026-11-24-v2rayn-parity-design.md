# v2rayN parity: remarks, proxy-free real delay, scan fix, auto-update

Date: 2026-11-24. Status: **proposed** (awaiting approval).

## Intent / why

Align the scanner with v2rayN behaviour the operator asked for: show subscription
remarks instead of `address:port`; measure server delay the way v2rayN does
(through a local proxy core, never through the OS proxy); make a full scan of all
106 profiles actually finish; and refresh the server list automatically.

Live evidence (2026-11-24, `/api`): 106 profiles, only 2 with `lastScannedAt`,
subscription `status=error`, `lastError=invalid input syntax for type inet: ""`,
`lastScanResult.profilesScanned=0` on later cron runs. Host env has
`HTTP_PROXY=http://127.0.0.1:10808`.

## Goals

1. `remarks` captured per v2rayN rules and shown in `/api/servers` + UI.
2. Delay measured via per-profile xray core + HTTP GET through loopback proxy;
   no OS proxy anywhere in scanner network calls.
3. One scan covers every profile; a bad profile cannot abort the run or poison
   the subscription status permanently.
4. Re-scan upserts profiles; disappeared servers hidden but history kept.
5. Per-subscription auto-update interval + real global cron interval; settings
   and scanner status shapes aligned with frontend.
6. Script + npm command to download xray-core, sha256-verified.

## Non-goals / anti-goals

- No region/country detection, no client app, no BullMQ.
- No v2ray JSON / sing-box / vmess-URI / socks/hy2/tuic subscription formats:
  scope is vmess-base64, vless, ss, trojan plus Clash YAML (operator choice).
- No real download/speed test (only delay).
- No password/UI changes, no new auth rules.
- Never let a subscription string execute arbitrary code outside the xray
  config generated from parsed fields.

## Constraints

- NestJS 10 + TypeORM + Postgres, `DB_SYNCHRONIZE=false` locally and in prod;
  no migration files exist. Operator chose a one-time flip to `true` for one
  deploy, then back to `false` (backup DB first). Dev `.env` also has `false`,
  so the same flip is required locally before code changes take effect.
- Existing tables must keep their rows; changes are additive columns.
- `profiles` has unique index `(subscriptionId, serverId)` — blind re-insert
  fails, so refresh must upsert.
- `resolvedIp` columns are `inet`; `''` is invalid.
- v2rayN remark sources: vmess `ps`, vless/trojan/ss `#fragment`, clash `name`,
  v2ray JSON `remarks`, sing-box `tag`.
- v2rayN delay = HTTP GET `https://www.google.com/generate_204` twice through
  `socks5://127.0.0.1:<per-test-port>` to a throwaway core; take min positive.

## Approaches considered

### Remarks
- **Add `remarks` column (chosen by operator).** Parser fills it; `name` stays
  the `address:port` fallback. No destructive rename, history keeps working.
- Overwrite `name`. Rejected: loses existing stable label and search semantics.

### Delay
- **Per-profile xray process (chosen by operator).** One short-lived core with
  `mixed` inbound on a free loopback port; outbound built from the profile;
  2 GETs via explicit HTTP proxy; min positive; kill core in `finally`.
  Worker pool capped by `settings.concurrency`. Isolated, simple, supports all
  four protocols; costs one spawn (~1 s) per profile.
- Single long-lived multi-inbound core. Rejected: routing/state complexity,
  port collisions, one bad profile can affect others.
- Keep raw TCP. Rejected by operator.

### Download script
- **GitHub Releases API + `.dgst` sha256 + zip extract (chosen).** Asset chosen
  by OS/arch at runtime (handles renames such as `Xray-win7-64.zip`);
  `adm-zip` devDependency for cross-platform unzip; binary at
  `backend/bin/xray[.exe]`, gitignored; `XRAY_BINARY_PATH` override.
- Hardcoded URL per platform. Rejected: asset names already changed upstream.

## Decisions (how it gets built)

### 1. Parser (`scanner/parser.service.ts`)
- Add `remarks` to `Partial<Profile>` output:
  - vmess legacy: `obj.ps`; vmess URI: fragment.
  - vless/trojan: `decodeURIComponent(url.hash.slice(1))`, fallback
    `params.get('name')`, fallback `''`; fall back to `address:port` only for
    `name`.
  - ss: existing fragment decode → `remarks`.
  - clash: `name` field → `remarks`; parse uuid/password/cipher, TLS, ws/http
    path/host and other stream fields into `rawConfig` (required by outbound
    builder).
  - merge hash params into `rawConfig` for vless/trojan so `pbk`, `sid`, `spx`,
    `type`, `host`, `path`, `fp`, `flow`, `alpn` survive (reality support).
- Base64 whole-body subscription: decode if decoded content contains
  `vmess://|vless://|ss://|trojan://` as well as `proxies:`; parse decoded
  lines. Accept raw (unwrapped) Clash YAML. Dedupe identical lines like v2rayN.

### 2. Profile entity + API
- `Profile.remarks: string | null` (additive column).
- `Profile.present: boolean` default `true` — hidden-but-kept for stale servers.
- `GET /api/servers` and `GET /api/profiles` return `remarks`; `/api/servers`
  filters `present = true`. `search` matches `remarks` first, then `name`,
  then `address`.

### 3. Real delay (`scanner/xray-delay.service.ts`, new)
- `measureDelay(profile, timeoutMs): Promise<number | null>`; never throws for
  expected failures; returns `null` + warning log on missing binary / bad
  config / spawn error.
- Config: `log.loglevel=warning`; `inbounds=[{protocol:'mixed', listen:'127.0.0.1',
  port:<free>, settings:{auth:'noauth'}, tag:'delay-in'}]`; `outbounds=[profile
  outbound, {protocol:'freedom',tag:'direct'}]`; no geodata needed for IP/host
  destinations.
- Outbound builder (`scanner/xray-outbound.builder.ts`) from `protocol`,
  `address`, `port`, `uuid`, `password`, `alterId`, plus `rawConfig`:
  - vmess/vless `vnext.users`, ss/trojan `servers`.
  - `streamSettings`: `network` from `network`/`type`, TLS/reality from
    `security`, `serverName` from `sni`/`host`, `alpn`/`fingerprint`, ws/h2/http/
    grpc/xhttp path+host+serviceName, reality `publicKey`/`shortId`/`spiderX`.
  - Unsupported or incomplete profile → `null`, not a throw.
- Spawn `xray -c <tmp config>` with `cwd=<bin dir>`, `stdio:'ignore'`; wait up
  to 2 s for loopback port; axios `proxy:{protocol:'http',host:'127.0.0.1',port}`
  with `proxy` explicitly set (overrides env), `timeout: timeoutMs`,
  `validateStatus: s => s >= 200 && s < 400`; 2 attempts 100 ms apart; min
  positive elapsed ms; `SIGTERM` + temp file cleanup in `finally`.
- Ping URL: `process.env.XRAY_PING_URL` default
  `https://www.google.com/generate_204`.
- Worker pool in `scanSubscription`: `Promise.all` over chunks of
  `settings.concurrency`; each worker scans one profile with per-profile
  `try/catch`; results carry `{profileId, latency, reachable, error?}`.
- `LatencyService` (raw TCP) stays as an explicitly-labelled fallback only,
  used when `XRAY_BINARY_PATH` missing or `delayMode=tcp` setting is set;
  default is real delay.

### 4. Fix the "2 servers" bug (`scanner/scanner.service.ts`)
- Resolve IP: if `net.isIP(profile.address)` → use the address itself; else
  `resolve4` → `resolve6` → `null`. Never pass `''` to anycast; skip anycast
  entirely when `resolvedIp === null`.
- Wrap each `scanProfile` call in `try/catch`; log and record per-profile error,
  continue. `profilesScanned` counts attempted, with `succeeded`/`failed`.
- Fetch/parse/persist: for each parsed profile find existing by
  `(subscriptionId, serverId)`; update mutable config fields, set `present=true`,
  keep scan stats; create only when absent. Set `serverCount = parsed.length`
  instead of incrementing. Mark `present=false` on profiles not in the new
  subscription body (only when a fresh fetch succeeded).
- Select subscriptions for scan by `enabled=true`, not by `status=ACTIVE`;
  transient errors keep `status=error` for UI but never make the sub
  permanently invisible.

### 5. Auto-update + settings/status
- Subscription entity: `enabled:boolean default true`,
  `autoUpdateIntervalMinutes:int default 0` (0 = no periodic refresh).
  DTOs and UI expose them; `POST /api/subscriptions/:id/fetch` becomes a real
  fetch+parse+upsert (replaces byte-count stub).
- Cron: `@Cron(EVERY_MINUTE)` tick; if `settings.enabled` and
  `now - lastScanAt >= intervalSeconds*1000`, run a scan. `nextScanAt` derived
  from `lastScanAt + intervalSeconds`; status exposes it.
- Settings: keep backend canonical names; add `enabled:boolean default true`
  and `latencyThresholdMs:int default 5000`; DTO with class-validator so
  `whitelist`/`forbidNonWhitelisted` accepts exactly those keys. Frontend
  `SettingsPage.tsx` switches from `scanIntervalMinutes`/`scanTimeoutSeconds`/
  `latencyThresholdMs` mismatch to canonical fields + new `enabled`.
- Status: `{running, lastScanAt, nextScanAt, lastScanResult:{profilesScanned,
  succeeded, failed, details}}`; frontend shows last run, next run, counts and
  failures. Poll status every 2 s while a scan runs.

### 6. Proxy bypass
- `axios.get` in subscription fetch, stub fetch, reachability, and delay GET:
  explicit `proxy:false` (scan/network side) or explicit loopback `proxy` object
  (delay GET). Download script is the sole place that intentionally uses proxy
  env.

### 7. Xray download script
- `backend/scripts/download-xray.mjs`, run via
  `pnpm xray:download` at repo root (delegates to backend script).
- Steps: GET `https://api.github.com/repos/XTLS/Xray-core/releases/latest`
  (or `XRAY_VERSION` tag) with axios → pick asset from `release.assets` by
  OS/arch candidate list → download `.zip` + `.zip.dgst` → verify sha256 →
  unzip with `adm-zip` → write `backend/bin/xray[.exe]` chmod 755 → print
  `xray -version`. `XRAY_DOWNLOAD_URL` overrides the asset URL for mirrors.
- Add `adm-zip` to backend devDependencies; add `backend/bin/` to root
  `.gitignore`; document in `README.md`/`DEPLOY.md`.
- `Dockerfile`: in `backend-builder` run `npm run xray:download` after
  `COPY backend/ ./`; in `backend-prod` add
  `COPY --from=backend-builder /app/backend/bin ./backend/bin`. Binary is
  Linux x64 (`Xray-linux-64.zip`) inside `node:20-alpine`; verify musl/glibc
  compatibility at build time (`xray -version`).

## Tests (TDD before implementation)

- Parser: remarks from `#fragment` for vless/trojan/ss, `ps` for vmess, clash
  `name`; base64 plain-text and raw YAML; hash params in `rawConfig`;
  dedupe.
- Xray outbound builder: one fixture per protocol + reality; malformed → null.
- Scanner: DNS failure for IP-literal no longer calls anycast with `''`;
  per-profile throw does not stop the batch; upsert updates rather than inserts.
- Settings DTO rejects unknown keys, accepts canonical keys.

## Builder-check resolutions

1. **Schema rollout (operator):** one-time `DB_SYNCHRONIZE=true` deploy, then
   set back to `false`; back up Postgres first. Same for local `.env`.
2. **Interval semantics (builder call):** global cron ticks every minute; a
   scan processes enabled subscriptions and refreshes only those whose
   `lastFetchedAt` is older than `autoUpdateIntervalMinutes`. Failed fetches
   keep the old `lastFetchedAt` (only successes update it), so failures retry
   on the next tick. `settings.enabled=false` blocks the whole cron scan;
   manual `POST /api/scanner/run` still works.
3. **Parser scope (operator):** four URI schemes + Clash YAML only. Clash
   entries must keep `uuid`/`password`/`cipher`/TLS/ws fields for the outbound
   builder, otherwise delay is useless for Clash profiles.
4. **Fetch-failure coverage (builder call):** on fetch failure keep scanning
   already-stored profiles; set `lastError`, keep `status=error` for UI.
5. **History/reachability (builder call):** keep online-service URL checks and
   anycast scoring; URL checks go direct with `proxy:false` (they test the
   service, not the profile). `lastReachable = delay !== null` as before;
   `latencyThresholdMs` drives only the UI "slow" badge.
6. **Outbound flags (builder call):** honor `allowInsecure`/`skip-cert-verify`,
   `flow`, `encryption`, fingerprint, ALPN and reality `pbk`/`sid`/`spx` when
   present in `rawConfig`.
7. **Name vs remarks (builder call):** on upsert keep the stored `name` when
   non-empty; only fill `remarks` from the parser and set `name` when absent.
   Search checks `remarks`, then `name`, then `address`.
8. **Status persistence (builder call):** `lastScanAt`/`nextScanAt` remain
   in-memory; after restart the first eligible cron tick runs immediately.

## Risks / open items left to builder

- Free-port race between choose-port and xray bind: retry once with a new port
  if the port is already listening.
- Xray startup time varies; wait loop is 2 s by default, configurable via
  `XRAY_STARTUP_TIMEOUT_MS`.
- Real delay through a core needs network egress from the backend host; on the
  remote deploy host verify the binary runs (glibc/musl) before relying on it.
- GeoIP/GeoSite dat files are not bundled; routing uses raw addresses only.
