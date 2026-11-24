# Anycast Availability Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace IP-based anycast scoring with an availability-based score stored on `profiles`, so stable servers score near `0.0` and service-loss / regex evidence raises it toward `1.0`.

**Architecture:** `AnycastService` becomes a pure scorer over a 10-entry boolean window on `Profile` plus a regex override. `ScannerService` feeds it only observations from fresh service checks and keeps writing `anycast_scores` solely as a `resolvedIp` lookup for the public feed. Filters keep reading `profile.anycastScore`, so `/api/servers` and `/api/feed` need no API change.

**Tech Stack:** NestJS 10, TypeScript 5.3, TypeORM 0.3 / PostgreSQL jsonb, Jest 29, React 18 / Vite 5.

**Spec:** `docs/superpowers/specs/2026-11-24-anycast-availability-score-design.md`

## Global Constraints

- Window size exactly `10`; export as `ANYCAST_WINDOW_SIZE` from `backend/src/scanner/anycast.service.ts`.
- Regex exactly `/anycast|auto/i`, tested against `profile.remarks` and `profile.name`; match → score `1.0`.
- `score = losses / window.length`; denominator grows with accumulated checks until 10, then slides. Round to 2 decimals (column is `decimal(3,2)`).
- Record an observation only when a fresh service check ran; cached `serviceIds` and TCP fallback never add window entries.
- Baseline `expectedCount` = enabled services with non-empty `testUrls`; loss when `reachableCount < expectedCount`. `expectedCount === 0` → no window entry.
- Fingerprint mismatch clears the window before the current check is recorded; regex is independent of fingerprint.
- `anycastThreshold` stays default `0.5`, editable in `/settings`. `anycastMinSamples` stays in API/DB for compatibility but is unused by scoring.
- No new tables. `anycast_scores` stays keyed by `(profileId, resolvedIp)` and is written on every scan with a known IP.
- No git repo in this workspace — tasks end with verification, not commits.

## Review Focus

- Legacy `profile.anycastScore = 0.9` from the old formula before the next scan — a clean scan must replace it with `0.0`. Test in Task 1 (`clears a legacy nonzero score on clean checks`).
- `expectedCount = 0` (all services have empty `testUrls`) must not create fake losses. Test in Task 1 (`ignores zero expected services`).
- Cached `serviceIds` between fresh checks must not inject clean window entries. Test in Task 2 (`does not record an observation when the service check is cached`).
- Window not yet full: dividing by 10 would understate the score. Test in Task 1 (`scores one loss in four checks as 0.25`).
- Stable score `0.0` must pass `anycast=false` and fail `anycast=true` in both query paths. Test in Task 3.

---

### Task 1: Profile window and scoring service

**Files:**
- Modify: `backend/src/profiles/profile.entity.ts`
- Modify: `backend/src/scanner/anycast.service.ts`
- Create: `backend/src/scanner/anycast.service.spec.ts`

**Interfaces:**
- Consumes: `Profile` entity fields `remarks`, `name`, `servicesFingerprint`, `anycastWindow`, `anycastSamples`, `anycastScore`.
- Produces:
  - `ANYCAST_WINDOW_SIZE: 10`
  - `AnycastCheckObservation { fingerprint: string | null; reachableCount: number; expectedCount: number }`
  - `AnycastService.applyScore(profile: Profile, observation: AnycastCheckObservation | null): number` — mutates `profile.anycastWindow`, `anycastSamples`, `anycastScore`; returns the score.
  - `AnycastService.updateAnycastScore(profileId: string, resolvedIp: string, score: number, sampleCount: number): Promise<void>` — always upserts, including score `0`.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/scanner/anycast.service.spec.ts` with a repo mock and these assertions:

```ts
function makeService() {
  const repo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => v),
  };
  return { service: new AnycastService(repo as any), repo };
}

function profile(overrides: Partial<Profile> = {}) {
  return {
    id: 'p-1', name: 'srv', remarks: null, servicesFingerprint: null,
    anycastWindow: [], anycastSamples: 0, anycastScore: null, ...overrides,
  } as Profile;
}

const check = (fingerprint = 'fp', reachableCount = 1, expectedCount = 1) => ({
  fingerprint, reachableCount, expectedCount,
});
```

Test names and exact expectations:
- `scores one loss in four checks as 0.25` — apply `[check(fingerprint,1,1), check(fingerprint,1,1), check(fingerprint,1,1), check(fingerprint,0,1)]`; expect `score === 0.25`, `samples === 4`, `window === [false,false,false,true]`.
- `ignores zero expected services` — apply `check('fp', 0, 0)`; expect `window === []`, `score === 0`.
- `resets window when service fingerprint changes` — seed `profile({ anycastWindow: [true,true], servicesFingerprint: 'old' })`, apply `check('new', 1, 1)`; expect `window === [false]`, `score === 0`.
- `window caps at ten and oldest entry drops` — apply 10 losses then 10 clean checks with same fingerprint; expect `samples === 10`, `score === 0`, `window.every(v => v === false)`.
- `clears a legacy nonzero score on clean checks` — seed `profile({ anycastScore: 0.9 })`, apply 4 clean checks; expect `score === 0`.
- `regex match forces 1.0 and survives a null observation` — `profile({ remarks: 'AUTO HK' })`, `applyScore(p, null)`; expect `score === 1`, `samples === 0`, `window === []`.
- `updateAnycastScore writes a zero score row` — call `(..., '1.2.3.4', 0, 4)`; expect `repo.create` called with an object containing `profileId: 'p-1'`, `resolvedIp: '1.2.3.4'`, `score: 0`, `sampleCount: 4`, and `repo.save` called.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand scanner/anycast.service.spec.ts`
Expected: FAIL — module has no `applyScore` / `ANYCAST_WINDOW_SIZE`.

- [ ] **Step 3: Implement the entity field and scorer**

In `profile.entity.ts` add after `anycastSamples`:

```ts
  @Column({ type: 'jsonb', default: [] })
  anycastWindow: boolean[];
```

In `anycast.service.ts`: drop the unused `SettingsService` / `ScanHistoryRepository` dependencies, export the constant and interface above, and implement `applyScore` per Global Constraints (copy window, reset on fingerprint mismatch, push only when `expectedCount > 0`, cap/shift to 10, compute losses, regex override, round to 2 decimals, write back and return). Remove the `if (score === null) return;` guard from `updateAnycastScore`; keep the existing `(profileId, resolvedIp)` find-then-create/save upsert.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand scanner/anycast.service.spec.ts`
Expected: PASS — all 7 tests.

### Task 2: Scanner feeds fresh observations into the scorer

**Files:**
- Modify: `backend/src/scanner/scanner.service.ts:155-230`
- Modify: `backend/src/scanner/scanner.service.spec.ts:85-151,173-183`

**Interfaces:**
- Consumes: `AnycastService.applyScore(profile, observation)`, `updateAnycastScore(profileId, resolvedIp, score, sampleCount)`.
- Produces: scanner no longer calls `computeAnycastScore` or `scanHistoryRepository.count` for scoring; `profile.anycastScore` is saved once with the rest of the scan result.

- [ ] **Step 1: Write the failing tests**

In `scanner.service.spec.ts` harness replace the anycast mock with:

```ts
const anycast = {
  applyScore: jest.fn((p: any) => {
    p.anycastScore = 0;
    p.anycastSamples = 0;
    return 0;
  }),
  updateAnycastScore: jest.fn().mockResolvedValue(undefined),
};
```

Test names and exact expectations:
- Update `uses an IP literal directly for anycast and never passes an empty inet`: expect `applyScore` called with `expect.objectContaining({ id: 'p-1' })` and `null`; keep the no-empty-IP assertion; expect `updateAnycastScore` called with `'p-1'`, `'144.31.225.5'`, `0`, `0`.
- `passes fresh service check counts as an observation`: online services `svc-1` (`https://a.test/`), `svc-2` (`https://b.test/`); `serviceCheck.check` resolves `new Set(['https://a.test/'])`; subscription with `autoUpdateIntervalMinutes: 0`; expect `applyScore` second arg to equal `{ fingerprint: fingerprintOf([...]), reachableCount: 1, expectedCount: 2 }`.
- `does not record an observation when the service check is cached`: fixture with `servicesCheckedAt: new Date()` and matching `servicesFingerprint`, one online service with a URL, `probeDelay` non-null; expect `applyScore` second arg `null` and `serviceCheck.check` not called.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand scanner/scanner.service.spec.ts`
Expected: FAIL — `anycast.computeAnycastScore` expectation no longer matches.

- [ ] **Step 3: Rewire `scanProfile`**

Hoist `const fingerprint = computeServicesFingerprint(onlineServices.map(...))` to the top of `scanProfile` (remove the inner declaration). After the session block compute `expectedCount` from `onlineServices.filter(s => (s.testUrls || []).length > 0).length`, `reachableCount` from `this.reachableServiceIds(onlineServices, checkedUrls!)` only when `checkedUrls !== null`, and `observation` as `{ fingerprint, reachableCount, expectedCount }` or `null`. Call `this.anycastService.applyScore(profile, observation)`. Remove the second `profilesRepository.save` and the `scanHistoryRepository.count` call; save the profile once after setting latency/IP fields. Keep `scan_history` writes unchanged. When `resolvedIp` is truthy, call `updateAnycastScore(profile.id, resolvedIp, score, profile.anycastSamples)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand scanner/scanner.service.spec.ts`
Expected: PASS.

### Task 3: Pin filter behavior for stable servers

**Files:**
- Modify: `backend/src/query/server-filter.spec.ts`

**Interfaces:**
- Consumes: `applyServerFilters(qb, filters, threshold)` from `server-filter.ts`.

- [ ] **Step 1: Write the filter regression test**

Add `stable score zero is excluded by anycast=true and included by anycast=false`: call `applyServerFilters` twice with a mocked QB and threshold `0.5`; assert the `true` call contains `profile.anycastScore >= :threshold` and the `false` call contains `profile.anycastScore < :threshold OR profile.anycastScore IS NULL`.

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand query/server-filter.spec.ts`
Expected: PASS — this helper already implements the clause; the test only pins the new semantics. If it fails, fix the clause in `server-filter.ts:40-45`.

- [ ] **Step 3: Verify query detail is not misleading**

Check `backend/src/query/query.service.ts:95-119`: `confidence` must read `profile.anycastScore`. No code change expected; `uniqueIpCount` / `resolvedIps` are informational IP observations only.

### Task 4: Frontend copy and deprecated setting

**Files:**
- Modify: `frontend/src/pages/AnycastPage.tsx:81-83,190-199`
- Modify: `frontend/src/pages/SettingsPage.tsx:232-243,361`

- [ ] **Step 1: Rewrite Anycast page explanation**

Change subtitle to describe score from service availability (0.0–1.0). Replace the About block bullets with: score = share of checks with a lost service in the last 10 fresh checks; `anycast|auto` in `remarks`/`name` → `1.0`; changing service settings resets the window; Sample Count = accumulated checks, max 10. Remove all text claiming the score is confidence that a resolved IP serves multiple locations.

- [ ] **Step 2: Retire the unused setting from the form**

Delete the `anycastMinSamples` input block (`SettingsPage.tsx:232-243`) but keep the `formData.anycastMinSamples` field and PUT payload so the API contract is unchanged. Replace help line 361 with: `anycastMinSamples: retained for API compatibility; unused by the availability-based score.`

- [ ] **Step 3: Verify the frontend builds**

Run: `pnpm --filter mglaroute-vpn-server-frontend build`
Expected: PASS (`tsc && vite build`).

### Task 5: Docs and end-to-end verification

**Files:**
- Modify: `AGENTS.md` (root of server project)
- Modify: `PLAN.md` (server project)

- [ ] **Step 1: Update docs**

In `AGENTS.md` replace the known-gap bullet about degenerating anycast score with the new rule: score = loss share over last 10 fresh service checks, regex override, reset on service settings change, `anycast_scores` only for `resolvedIp`. Update the invariant line `Anycast = confidence ... 1 - uniqueIps/sampleCount` accordingly. In `PLAN.md` update the anycast rows/paragraphs (lines 51, 71-75) to the same model.

- [ ] **Step 2: Run the full backend suite**

Run: `pnpm --filter mglaroute-vpn-server-backend test -- --runInBand`
Expected: PASS, no failures in `feed.service.spec.ts`, `query.service.spec.ts`, `scanner.service.spec.ts`.

- [ ] **Step 3: Verify public feed filtering**

With backend running at `http://localhost:3000`, run:

```bash
curl -s "http://localhost:3000/api/feed?format=json&anycast=false" | jq '.servers[] | {name, anycastConfidence, anycastSamples}'
```

Expected: stable servers appear with `anycastConfidence` `0` or `null`; previously this query returned nothing. Then run the same with `anycast=true` and confirm only regex-matched or high-loss profiles appear (threshold `0.5`).

- [ ] **Step 4: Verify UI**

Open `http://localhost:5173/anycast` and `/settings`; confirm the new explanation text, no `anycastMinSamples` input, and `AnyCast Threshold` still editable.
