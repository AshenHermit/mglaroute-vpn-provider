# Online-service availability through xray (per-profile, expiring)

Date: 2026-11-24. Status: **proposed** (awaiting approval).

## Intent / why

`/servers` must show which named online services actually work **through each
VPN server**. Today `ScannerService.scanProfile` checks every enabled service
URL on every scan for every profile via `axios.get(url, { proxy: false })`, i.e.
from the host, not through the profile's VPN. That answer is not per-server,
ignores reachability, and is re-paid on every scan. Operator wants a real
xray-mediated check, run only when the server is reachable and the previous
result has expired.

## Goals

1. Check service URLs through a per-profile xray core (single core per profile,
   same session as the delay probe). Result: IDs of enabled `OnlineService`
   rows reachable through that server.
2. Run the check only after a successful xray delay probe (`latency !== null`);
   skip when xray is unavailable or TCP fallback is used.
3. Re-run only when expired or invalidated, never just because a scan happened.
4. New setting `serviceCheckExpirationSeconds` (`scanner_settings`, default
   3600), editable via `PUT /api/settings` and the Settings page.
5. Persist only reachable service IDs on `Profile`; expose them in
   `GET /api/servers` and render them as badges on `/servers`.
6. Invalidate stored checks when the enabled service set or any of its test
   URLs changes (new service, URL edit, enable/disable, delete).

## Non-goals / anti-goals

- No storing service names (they are editable; IDs are stable).
- No clearing a stored service list when a later scan finds the server
  unreachable — stale-until-expiry is intended.
- No rewrite of `scan_history` / anycast scoring. Keep existing history writes
  so anycast sample counts do not change.
- No forced re-check when xray fails to start; keep previous data and retry on
  the next scan.
- No new tables (operator picked approach A), no client app, no region detection.

## Constraints / decisions already made

- Operator decisions: real check through xray; store and show **only reachable**
  services; store **IDs**; URL change or new service expires previous checks;
  build approach **A**.
- `DB_SYNCHRONIZE=false` in dev and prod, no migrations directory. Additive
  columns require the same one-time `true` flip (with backup) used for the
  previous v2rayN-parity change.
- Local xray: `XRAY_BINARY_PATH=./bin/xray.exe` in `backend/.env`; path is
  resolved relative to the backend process cwd. TCP fallback exists only when
  the binary is missing.
- `settings.delayMode` is read by `ScannerService` but absent from entity/DTO;
  effectively xray mode whenever the binary exists. Service checks require the
  xray path; in TCP fallback they are skipped.
- One `OnlineService` has multiple `testUrls`. Operator decision: the service
  counts as reachable only if **all** its URLs return a **successful** HTTP
  status through the proxy — 2xx (200, 204, …), not `403`/`404`/`5xx`. Use
  `validateStatus: () => true` only to inspect the status, then classify 2xx as
  success; axios follows redirects as usual. Builder calls: a service with an
  empty `testUrls` array is never reachable (no vacuous "all passed"), and a URL
  shared by several services maps to all of their IDs.
- Extra latency per checked profile: one xray core + N HTTP requests. Existing
  `concurrency` cap bounds parallelism; expiration keeps this occasional.
- Existing `*.spec.ts` are advisory, **not a strict gate**. Operator has not
  approved them; they may be edited or relaxed to match new behaviour. In
  particular `scanner.service.spec.ts` currently asserts `proxy: false` for all
  axios calls, which conflicts with service checks through the proxy.

## Approaches considered

- **A — chosen.** Additive jsonb columns on `Profile`
  (`serviceIds: string[]`, `servicesCheckedAt`, `servicesFingerprint`). Refactor
  `XrayDelayService` into a session helper that owns the xray process and exposes
  the loopback proxy; run delay and service HTTP checks in one session. Minimal
  code, one core per profile, and `services[]` filtering maps directly to jsonb
  containment. Tradeoff: service data is not a first-class relation.
- **B — rejected.** `profile_services` table (profileId, serviceId, checkedAt).
  Cleaner joins/filters, but needs a migration and still needs the xray session
  refactor to avoid two cores per profile.
- **C — rejected.** Derive results from latest `scan_history` rows. Pollutes the
  anycast sample stream with service checks and makes reads heavier.

## Design

### Data model

`Profile` gains:

| column | type | purpose |
|---|---|---|
| `serviceIds` | `jsonb`, default `[]` | IDs of enabled services reachable through this server |
| `servicesCheckedAt` | `timestamp`, nullable | when the last successful service check finished |
| `servicesFingerprint` | `varchar`, nullable | fingerprint of the enabled-service set at that check |

`ScannerSettings` gains `serviceCheckExpirationSeconds` (int, default 3600).
`UpdateSettingsDto` accepts it (`@IsInt`, `@Min(1)`); `SettingsService` seeds it.

### Fingerprint / invalidation

Fingerprint = sha256 of enabled services sorted by id, each encoded as
`${id}:${urls.sort().join(',')}`, joined with `|`. Computed by a small helper
shared by scanner and query/tests. Stored on the profile with the result.
A check is due when:

- `servicesCheckedAt` is null, **or**
- `servicesFingerprint !== currentFingerprint`, **or**
- `now - servicesCheckedAt >= serviceCheckExpirationSeconds * 1000`.

This covers new services, URL edits, enable/disable and deletes without hooks
in `OnlineServicesService` and survives restarts.

### Scanner flow

1. Fetch/upsert profiles as today; load enabled services once per subscription.
2. Per profile, `XrayDelayService.withProxy(profile, timeoutMs, callback)` starts
   one xray core on a free loopback port and yields `{ protocol: 'http', host:
   '127.0.0.1', port }`. `measureDelay` keeps its current signature and is
   implemented on top of this helper.
3. Measure delay through that proxy. On `null` (or TCP fallback / no xray):
   skip service check, keep stored `serviceIds`/timestamps.
4. If a check is due, `ServiceCheckService.check(urls, proxy, timeoutMs)` GETs
   all URLs of all enabled services through the proxy. Keep a URL→serviceId map;
   a service is reachable only when **all** its URLs succeed with 2xx. Set
   `serviceIds` to those IDs, `servicesCheckedAt = now`,
   `servicesFingerprint = current`. Save the profile. If the session fails
   mid-check, do not stamp anything and keep the previous result.
5. If not due, reuse stored `serviceIds` for the history rows.
6. Continue writing `scan_history` rows for every scanned profile/service URL as
   today, with `reachable` from the current check or the stored list, so anycast
   sample counting is unchanged.

`ServiceCheckService` is a new provider in `ScannerModule`; it must never fall
back to `proxy: false` (no OS-proxy leak, same rule as the delay probe).

### API / frontend

- `QueryService.queryServers` maps `serviceIds` → `services: string[]` and
  `servicesCheckedAt`; implements the existing `services[]` DTO filter as
  "all requested IDs present" via jsonb containment (`@>`) on `serviceIds`.
- `/servers` fetches `/api/online-services/enabled` once for id→name and renders
  a `Services` column: one badge per reachable service, names from that map.
  Builder call: include a small service filter Select in the existing filter
  card; it is cheap because the service list is already loaded.
- Settings page gains `serviceCheckExpirationSeconds` input and its info line.

### Docs / tests

- Update `AGENTS.md`, `PLAN.md` (data model + scanner flow), `README.md` if it
  documents settings/columns.
- Tests are best-effort and advisory: update/relax existing specs that encode
  the old direct-check behaviour, and add lightweight checks for fingerprint
  due/not-due logic, only-reachable IDs, skip on `latency === null`, and the
  `services[]` filter. No strict test gate until the operator approves the specs.

## Left to the builder

Exact naming of the helper and private methods, badge truncation threshold, and
whether the service filter Select is wired before or after the column; none of
these change the behaviour above.
