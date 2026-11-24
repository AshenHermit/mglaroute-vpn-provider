# Datetime display format and inet guard design

Date: 2026-11-24. Status: **proposed** (awaiting approval).

## Intent / why

`/subscriptions` rendered `lastFetchedAt=2026-11-24T12:25:06.838Z` as `3:25:06 PM`,
because bare `toLocaleString()` uses the browser's en-US 12-hour locale. Operator
wants Russian date order, 24-hour time, and UTC kept in the database while the
browser chooses its own time zone. Separately, subscription
`BLACK_VLESS_RUS_v2rayN` carries `lastError=invalid input syntax for type inet: ""`
from a scan, not from the subscription fetch.

## Goals

1. All rendered timestamps use `ДД.ММ.ГГГГ ЧЧ:ММ:СС` in the browser's local time
   zone, with `hour12: false` and `ru-RU` number/date order.
2. Database values remain UTC; no serialization change on the backend.
3. `TZ=Europe/Moscow` added to backend `.env` and `.env.example` for server-side
   processes only. Does not affect browser formatting.
4. Diagnose the inet error without recreating the subscription. If it repeats
   after a backend restart on current code, add a defensive `net.isIP()` guard
   before any `inet` write/query and a regression test.

## Non-goals / anti-goals

- No change to how TypeORM stores `Date` values (UTC stays).
- No forced browser time zone (`Europe/Moscow` is not hardcoded in frontend).
- No migration / column type change (`inet` stays `inet`).
- No subscription deletion or re-creation.

## Constraints / decisions already made

- Operator: browser decides time zone; format = `ДД.ММ.ГГГГ` + `ЧЧ:ММ:СС`.
- Operator: keep UTC in DB; add `TZ=Europe/Moscow` to env.
- Operator approved approach: restart+scan first for the inet error, shared
  formatter for time, defensive guard only if the error repeats.
- Six call sites render dates today: `AnycastPage.tsx`, `DashboardPage.tsx`,
  `SettingsPage.tsx` (3), `SubscriptionsPage.tsx`.
- `inet` columns are only `scan_history.resolved_ip` and
  `anycast_scores.resolved_ip`; current `scanner.service.ts` already guards
  writes with `if (resolvedIp)` and `resolveIp()` returns `null` on DNS failure.

## Approaches considered

- **Time A — chosen.** Shared `formatDateTime()` in `frontend/src/lib/format.ts`
  using `Intl.DateTimeFormat('ru-RU', { day/month/year/hour/minute/second:
  '2-digit', hour12: false })` with no `timeZone` option. Single definition,
  six call sites replaced. Keeps existing fallback text (`Never`, `-`, etc.).
- **Time B — rejected.** Inline options at each call site; duplication, drifts.
- **Inet A — chosen first.** Restart backend on current code and trigger
  `POST /api/scanner/run`; the existing `if (resolvedIp)` guard should prevent
  `''` from reaching Postgres. No code change if the error clears.
- **Inet B — conditional.** If the error repeats, validate with `net.isIP()`
  before writing/querying `inet`, skip anycast/history for invalid IPs, and add
  a failing-first regression test in `scanner.service.spec.ts`.
- **Inet C — rejected.** Change `inet` to `varchar`: migration + loss of DB-level
  IP validation.

## Design

### Frontend

`formatDateTime(value: string | Date): string` returns the Intl-formatted value.
Each existing ternary keeps its fallback, e.g.
`sub.lastFetchedAt ? formatDateTime(sub.lastFetchedAt) : 'Never'`.

### Backend / env

Add `TZ=Europe/Moscow` after the `# Server` block in root `.env.example` and
near `PORT` in `backend/.env`. No other env value touched; `DB_SYNCHRONIZE=true`
currently set for the one-time schema flip is left as-is until the operator
decides to flip it back.

### Inet verification/fix

1. With backend restarted on current code, trigger a manual scan and re-read
   the subscription row. If `lastError` clears on a successful scan, no code
   change.
2. If it repeats, add `net.isIP(resolvedIp)` validation in `scanProfile`
   before `scanHistoryRepository.create`, `computeAnycastScore` and
   `updateAnycastScore`; treat invalid IPs as no-IP for that profile. Cover with
   a test that feeds a non-IP address and asserts no `inet` write/query.

## Left to the builder

Exact helper name was chosen (`formatDateTime`); fallback strings stay at call
sites; commit messages follow existing Conventional Commit style. Docs update
is limited to env examples if needed.
