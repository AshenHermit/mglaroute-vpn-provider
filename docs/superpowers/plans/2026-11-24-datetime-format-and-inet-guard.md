# Datetime Format and Inet Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every timestamp on the admin pages as `ДД.ММ.ГГГГ ЧЧ:ММ:СС` in the browser's local zone, keep UTC in the DB, add `TZ=Europe/Moscow` to env, and diagnose the `inet: ""` scan error on current code with a conditional defensive guard.

**Architecture:** One pure frontend helper owns formatting; six call sites keep their existing fallbacks. No backend serialization changes. The inet fix is deliberately conditional: restart + manual scan first, add a `net.isIP()` guard with a regression test only if the error repeats.

**Tech Stack:** React 18 + Vite 5 + TypeScript, `Intl.DateTimeFormat`, NestJS 10 + TypeORM/PostgreSQL, Jest.

**Spec:** `docs/superpowers/specs/2026-11-24-datetime-format-and-inet-guard-design.md`

All paths below are relative to `mglaroute-vpn-server/`.

## Global Constraints

- Format is `ДД.ММ.ГГГГ ЧЧ:ММ:СС` — **4-digit year**, 24-hour, dot separators, space between date and time.
- `formatDateTime(value: string | Date): string` uses `Intl.DateTimeFormat('ru-RU', ...)` with **no `timeZone` option**; browser local zone decides the hour.
- DB keeps UTC; no backend date serialization change. `TZ=Europe/Moscow` affects server processes only.
- Existing fallback strings stay exactly: `Never`, `Not scheduled`, `No scans performed yet`, `-`.
- `backend/.env` has `DB_SYNCHRONIZE=true` from the previous schema flip — **leave it untouched**.
- Frontend has no test runner; verify the helper with a one-off Node check that transpiles the real `format.ts` via the installed `typescript`, plus `pnpm build`. No new dependency.
- Working tree has unrelated dirty files (`backend/scripts/*`, v2rayN docs, online-services docs). Commit only the paths listed in each task; never `git add -A`.

## Review Focus

- 2026 date must render `24.11.2026`, not `24.11.26` — pinned in Task 1 by exact output assertion.
- Browser zone must win: `2026-11-24T12:25:06.838Z` → `12:25:06` under `TZ=UTC`, `15:25:06` under `TZ=Europe/Moscow` — pinned in Task 1 by two runs of the transpiled helper.
- Null/absent values must keep their fallback instead of throwing or showing `Invalid Date` — pinned in Task 1 by a grep check over all six call sites and `pnpm build`.
- Invalid/empty IP must never reach an `inet` column if the error repeats after restart — pinned in Task 3 by a failing-first `scanner.service.spec.ts` case (conditional task).
- No silent env mutation: `DB_SYNCHRONIZE` stays `true`, only `TZ` is added — pinned in Task 2 by reading `.env` before/after.

---

### Task 1: Shared datetime formatter + six call sites

**Files:**
- Create: `frontend/src/lib/format.ts`
- Modify: `frontend/src/pages/SubscriptionsPage.tsx`, `frontend/src/pages/DashboardPage.tsx`, `frontend/src/pages/AnycastPage.tsx`, `frontend/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: raw ISO strings / `Date` values already present at the six call sites.
- Produces: `formatDateTime(value: string | Date): string` in `frontend/src/lib/format.ts`.

- [ ] **Step 1: Write a failing one-off check against the real source**

Create a temporary script in the git-ignored plan workspace (not committed): `C:/Users/hermit/AppData/Local/Temp/opencode/format-check.cjs` that reads `frontend/src/lib/format.ts`, transpiles it with the installed `typescript` package (`transpileModule`, CommonJS), loads it via `new Function`, then asserts:
  - `formatDateTime('2026-11-24T12:25:06.838Z') === '24.11.2026 15:25:06'` with `TZ=Europe/Moscow`
  - same input `=== '24.11.2026 12:25:06'` with `TZ=UTC`
  - `formatDateTime(new Date('2026-01-02T03:04:05Z')) === '02.01.2026 06:04:05'` with `TZ=Europe/Moscow` (leading zeros)

Run: `cd mglaroute-vpn-server/frontend && TZ=Europe/Moscow node <script> && TZ=UTC node <script>`
Expected: FAIL — `format.ts` does not exist.

- [ ] **Step 2: Implement `formatDateTime`**

In `frontend/src/lib/format.ts`: export `formatDateTime(value: string | Date): string`. Build `Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })` (no `timeZone`), call `formatToParts(new Date(value))`, collect `day/month/year/hour/minute/second`, return `${day}.${month}.${year} ${hour}:${minute}:${second}`. Do not hardcode a timezone.

- [ ] **Step 3: Run the one-off check until it passes**

Run the same two commands from Step 1.
Expected: PASS — all three assertions in both runs (UTC run asserts only the first value as `12:25:06`; adjust the script to branch on `process.env.TZ` so the leading-zero case is checked in the Moscow run only).

- [ ] **Step 4: Replace the six call sites**

Import `formatDateTime` from `../lib/format` in `SubscriptionsPage.tsx`, `DashboardPage.tsx`, `AnycastPage.tsx`, `SettingsPage.tsx`. Replace each `new Date(X).toLocaleString()` with `formatDateTime(X)`, preserving the ternary and fallback:
  - `SubscriptionsPage.tsx:256` → `sub.lastFetchedAt ? formatDateTime(sub.lastFetchedAt) : 'Never'`
  - `DashboardPage.tsx:105` → `stats?.lastScan ? formatDateTime(stats.lastScan) : 'No scans performed yet'`
  - `AnycastPage.tsx:175` → `entry.lastUpdated ? formatDateTime(entry.lastUpdated) : '-'`
  - `SettingsPage.tsx:314` → `status?.lastScanAt ? formatDateTime(status.lastScanAt) : 'Never'`
  - `SettingsPage.tsx:321` → `status?.nextScanAt ? formatDateTime(status.nextScanAt) : 'Not scheduled'`
  - `SettingsPage.tsx:354` → `settings?.updatedAt ? formatDateTime(settings.updatedAt) : 'Never'`

- [ ] **Step 5: Verify no call site was missed and build**

Run: `grep -R "toLocaleString()" frontend/src` (expect no matches) and `cd frontend && pnpm build`.
Expected: no matches; build passes.

- [ ] **Step 6: Commit**

`git add frontend/src/lib/format.ts frontend/src/pages/SubscriptionsPage.tsx frontend/src/pages/DashboardPage.tsx frontend/src/pages/AnycastPage.tsx frontend/src/pages/SettingsPage.tsx` then `git commit -m "feat: format timestamps in Russian 24-hour style"`.

---

### Task 2: TZ env + plan/spec docs

**Files:**
- Modify: `.env.example`
- Modify (local, not tracked): `backend/.env`
- Commit new docs: `docs/superpowers/specs/2026-11-24-datetime-format-and-inet-guard-design.md`, `docs/superpowers/plans/2026-11-24-datetime-format-and-inet-guard.md`

**Interfaces:**
- Consumes: none.
- Produces: `TZ=Europe/Moscow` present in both env files; `DB_SYNCHRONIZE` unchanged at `true` in `backend/.env`.

- [ ] **Step 1: Add TZ to the env example**

In `.env.example`, add `TZ=Europe/Moscow` directly after the `# Server` comment (before `PORT=3000`). Do not change any other line.

- [ ] **Step 2: Add TZ to local backend env**

In `backend/.env`, add `TZ=Europe/Moscow` directly after `PORT=3000`. Verify line `DB_SYNCHRONIZE=true` is still present and unchanged. This file is gitignored — no commit step for it.

- [ ] **Step 3: Verify**

Run: `grep -n "TZ=\|DB_SYNCHRONIZE" .env.example backend/.env`.
Expected: both files show `TZ=Europe/Moscow`; `backend/.env` still shows `DB_SYNCHRONIZE=true`; `.env.example` still shows its own `DB_SYNCHRONIZE=true`.

- [ ] **Step 4: Commit docs and env example**

`git add .env.example docs/superpowers/specs/2026-11-24-datetime-format-and-inet-guard-design.md docs/superpowers/plans/2026-11-24-datetime-format-and-inet-guard.md` then `git commit -m "docs: add datetime/inet design, plan and TZ example"`.

---

### Task 3: Live restart, scan, conditional inet guard

**Files (only if the error repeats):**
- Modify: `backend/src/scanner/scanner.service.ts`, `backend/src/scanner/scanner.service.spec.ts`

**Interfaces:**
- Consumes: `resolveIp(address): Promise<string | null>` and the `if (resolvedIp)` blocks at `scanner.service.ts:195-228`.
- Produces: when needed, `net.isIP(resolvedIp)` validation before any `scanHistoryRepository.create/save/count`, `computeAnycastScore`, `updateAnycastScore`, and `rawConfig.resolvedIps`; when not needed, no code change.

- [ ] **Step 1: Start backend and frontend on the current code**

User killed both processes and permitted restart. Start `cd backend && pnpm start:dev` (port 3000) and `cd frontend && pnpm dev --host` (port 5173) as background shell commands. Verify `GET http://localhost:3000/health` responds before continuing.

- [ ] **Step 2: Trigger a manual scan and re-read the subscription**

`POST /api/auth/login` with `{"username":"admin","password":"GZrMkbJyA6DEyXP"}` → capture token. `POST /api/scanner/run` with `Authorization: Bearer <token>`, wait for `GET /api/scanner/status` to show the run finished, then `GET /api/subscriptions` and read `lastError` for `BLACK_VLESS_RUS_v2rayN`.

Expected: `lastError` is cleared after a successful scan. If it still reads `invalid input syntax for type inet: ""`, continue to Step 3; otherwise skip to Step 6.

- [ ] **Step 3: Verify the formatted UI in the browser**

Open `http://localhost:5173/subscriptions`, log in if needed, and confirm `Last Fetch` now reads `ДД.ММ.ГГГГ ЧЧ:ММ:СС` (24-hour, 4-digit year). Also check `/settings`, `/dashboard`, `/anycast` render the same format. Close any tabs opened.

- [ ] **Step 4 (conditional): Write a failing regression test**

Only if the inet error repeated. In `backend/src/scanner/scanner.service.spec.ts`, add a case where DNS resolves to an empty/invalid string, assert that no `scanHistoryRepository.create/save/count`, `computeAnycastScore` or `updateAnycastScore` call happens with that value.
Run: `cd backend && pnpm exec jest --runInBand scanner/scanner.service.spec.ts`
Expected: FAIL — invalid IP still reaches the repositories.

- [ ] **Step 5 (conditional): Guard and verify**

In `scanProfile`, require `resolvedIp && net.isIP(resolvedIp)` for every `inet` write/query and the `rawConfig.resolvedIps` assignment; treat invalid values as no IP for that profile. Re-run Step 4's command, then `cd backend && pnpm build`.
Expected: PASS; commit `backend/src/scanner/scanner.service.ts backend/src/scanner/scanner.service.spec.ts` with `fix: reject invalid IPs before inet writes`.

- [ ] **Step 6: Final verification and ledger**

Run `cd backend && pnpm exec jest --runInBand && pnpm build` and `cd frontend && pnpm build`. Record the inet outcome (cleared / guarded) in the plan workspace ledger. If no code change was needed, there is no commit for Step 5.
