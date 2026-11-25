# Xray Version Pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin xray-core to `v26.11.9` in source code so local download and Docker build stop following `latest`.

**Architecture:** Version constant lives next to asset selection in `backend/scripts/xray-assets.mjs`; `pinnedRelease()` builds a synthetic release with direct release URLs. The downloader uses it by default, so no GitHub API call and no Dockerfile/compose changes. Env overrides stay.

**Tech Stack:** Node 20 ESM, `node:test`, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-24-xray-version-pin-design.md`

## Global Constraints

- `XRAY_VERSION = 'v26.11.9'` exactly.
- No changes to `Dockerfile`, `docker-compose.prod.yml`, or `.github/workflows/deploy.yml`.
- sha256 verification of `.dgst` stays mandatory.
- Tests must not use network.
- No git repo in workspace: no commit steps.

## Review Focus

- A future release changing `latest` must not change what this project builds — pinned test pins the exact tag string and full Linux x64 URL.
- `XRAY_DOWNLOAD_URL` mirror override must still derive `<url>.dgst` — existing code path unchanged; verify by reading `download-xray.mjs:84-89` after edit.
- `XRAY_VERSION` env override must still work for one-off upgrades — pinned test covers an explicit tag.
- Windows/macOS asset names must remain correct — existing `assetNamesFor` tests stay green.
- Deploy docs must state the pinned version — `DEPLOY.md` edit.

---

### Task 1: Pin xray version in code

**Files:**
- Modify: `backend/scripts/xray-assets.mjs`
- Modify: `backend/scripts/xray-assets.test.mjs`
- Modify: `backend/scripts/download-xray.mjs`
- Modify: `DEPLOY.md`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `XRAY_VERSION: string` = `'v26.11.9'`, exported from `backend/scripts/xray-assets.mjs`.
  - `pinnedRelease(platform: string, arch: string, tag?: string): { tag_name: string, assets: Array<{name: string, browser_download_url: string}> }`, exported from `backend/scripts/xray-assets.mjs`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/scripts/xray-assets.test.mjs`:

```js
import * as assets from './xray-assets.mjs';

test('pinned xray version is fixed in code', () => {
  assert.equal(assets.XRAY_VERSION, 'v26.11.9');
  const release = assets.pinnedRelease('linux', 'x64');
  assert.equal(release.tag_name, 'v26.11.9');
  assert.equal(
    release.assets[0].browser_download_url,
    'https://github.com/XTLS/Xray-core/releases/download/v26.11.9/Xray-linux-64.zip',
  );
});

test('pinnedRelease accepts an explicit tag override', () => {
  const release = assets.pinnedRelease('win32', 'x64', 'v1.2.3');
  assert.equal(
    release.assets[0].browser_download_url,
    'https://github.com/XTLS/Xray-core/releases/download/v1.2.3/Xray-win7-64.zip',
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test scripts/xray-assets.test.mjs`

Expected: FAIL — `assets.XRAY_VERSION` is `undefined`, not `'v26.11.9'`.

- [ ] **Step 3: Implement the pinned version in `backend/scripts/xray-assets.mjs`**

Add `export const XRAY_VERSION = 'v26.11.9';` and:

```js
export function pinnedRelease(platform, arch, tag = XRAY_VERSION) {
  const base = `https://github.com/XTLS/Xray-core/releases/download/${tag}`;
  return {
    tag_name: tag,
    assets: assetNamesFor(platform, arch).map((name) => ({
      name,
      browser_download_url: `${base}/${name}`,
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test scripts/xray-assets.test.mjs`

Expected: PASS.

- [ ] **Step 5: Switch the downloader to the pinned release**

In `backend/scripts/download-xray.mjs`:
- import `XRAY_VERSION` and `pinnedRelease` from `./xray-assets.mjs`;
- delete the local `syntheticRelease`, `resolveFromRedirect`, and the GitHub API `resolveRelease`;
- replace `resolveRelease()` with a synchronous call returning `pinnedRelease(PLATFORM, ARCH, process.env.XRAY_VERSION || XRAY_VERSION)`;
- keep `getWithFallback` for `downloadBuffer`, keep `XRAY_DOWNLOAD_URL` and `.dgst` logic unchanged;
- print the tag used in the success log.

- [ ] **Step 6: Verify the downloader no longer contacts the API**

Run: `cd backend && grep -n "api.github.com\\|releases/latest\\|XRAY_VERSION\\|pinnedRelease" scripts/download-xray.mjs scripts/xray-assets.mjs`

Expected: no `api.github.com` or `releases/latest` in `download-xray.mjs`; `XRAY_VERSION` and `pinnedRelease` present.

- [ ] **Step 7: Document the pin**

In `DEPLOY.md` under `## CI/CD`, add one line: xray-core pinned to `v26.11.9` via `backend/scripts/xray-assets.mjs`; one-off override via `XRAY_VERSION` / `XRAY_DOWNLOAD_URL` build env.

- [ ] **Step 8: Run the full xray script suite**

Run: `cd backend && node --test scripts/*.test.mjs`

Expected: PASS, all xray tests green, no network access.

- [ ] **Step 9: Verify no config drift**

Run: `cd mglaroute-vpn-server && git diff -- Dockerfile docker-compose.prod.yml .github/workflows/deploy.yml 2>/dev/null || echo "no git repo: files unchanged by plan"`

Expected: no changes to those files.
