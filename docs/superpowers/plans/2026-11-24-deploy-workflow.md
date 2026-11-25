# Deploy Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions deploy workflow and an idempotent remote deploy script for `mglaroute-vpn-server`, mirroring the Wired deploy principle.

**Architecture:** Thin workflow prepares SSH + `.env` then pipes `scripts/deploy-remote.sh` over SSH; the script owns all server-side logic (preflight, code sync, `.env` validation, `docker compose` on `docker-compose.prod.yml`). Shell tests use `DRY_RUN=1` and stubbed `git`; workflow tests parse the YAML with PyYAML.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`), pnpm 10.12.1, Node 22 runner / Node 20 Docker, bash, Python 3.12 + PyYAML 6.0.1, Docker Compose v2.

**Spec:** `mglaroute-vpn-server/docs/superpowers/specs/2026-11-24-deploy-workflow-design.md`

## Global Constraints

- Reference: `C:\Users\hermit\webdev\Wired\.github\workflows\deploy.yml` and `C:\Users\hermit\webdev\Wired\scripts\deploy-remote.sh` (read-only source of the pattern).
- No `.git` repo in this project yet — omit commit steps until one is initialized.
- Bash is `C:\Program Files\Git\bin\bash.exe`; Python 3.12 has PyYAML 6.0.1. Run tests from `mglaroute-vpn-server/`.
- Default deploy path: `/home/mglaroute-vpn-provider`. Server user: root (script keeps NOPASSWD-sudo fallback).
- Compose file: `docker-compose.prod.yml` (overridable via `COMPOSE_FILE`). External Docker network: `shared-net`.
- Prod required `.env` keys: `DB_NAME DB_USER DB_PASSWORD JWT_SECRET FRONTEND_URL VITE_API_URL COMMON_DOMAIN`; `DB_SYNCHRONIZE` must equal `false`.
- Workflow env names exactly: `SSH_HOST SSH_USER SSH_PORT SSH_PRIVATE_KEY DEPLOY_PATH PROD_ENV DEPLOY_REF GIT_REMOTE COMPOSE_FILE`.
- Verify commands exactly: `pnpm install --frozen-lockfile`, `pnpm --filter mglaroute-vpn-server-backend test`, `pnpm --filter mglaroute-vpn-server-backend test:xray`, `pnpm --filter mglaroute-vpn-server-frontend build`, `pnpm --filter mglaroute-vpn-server-frontend lint`.
- Script exit codes: 2 preflight, 3 not-a-git-dir, 4 bad `.env`, 5 missing `GIT_REMOTE`.
- Source-only guard: `DEPLOY_SOURCE_ONLY=1` must prevent `main()` from running when the script is sourced by tests.

## Review Focus

1. **Missing `GIT_REMOTE`** — must exit 5 before any filesystem or Docker action, even under `DRY_RUN=1`. Test: Task 1, `test_missing_git_remote`.
2. **First deploy with only `.env` in `DEPLOY_PATH`** — clone into staging and move `.env` into it; never overwrite the secret file. Test: Task 1, `test_first_deploy_preserves_env` (stub `git`).
3. **`.env` with CRLF / missing keys / `DB_SYNCHRONIZE=true`** — normalize to LF, chmod 600, fail with code 4 naming the key; reject `true`. Test: Task 1, `test_env_normalize_and_validate`.
4. **PyYAML parses top-level `on` as boolean `True`** — workflow test must accept both `True` and `'on'` keys. Test: Task 2, `test_triggers_and_guards`.
5. **Wrong compose file or missing external network** — script must create `shared-net` and use `docker-compose.prod.yml`; DRY_RUN log must show both exact strings. Test: Task 1, `test_dry_run_smoke`.

---

### Task 1: Remote deploy script

**Files:**
- Create: `mglaroute-vpn-server/scripts/deploy-remote.sh`
- Test: `mglaroute-vpn-server/scripts/deploy-remote.test.sh`

**Interfaces:**
- Consumes: env `DEPLOY_PATH` (default `/home/mglaroute-vpn-provider`), `GIT_REMOTE` (required), `COMPOSE_FILE` (default `docker-compose.prod.yml`), `DRY_RUN`, `DEPLOY_SOURCE_ONLY`; positional `ref` (default `main`).
- Produces: functions `detect_sudo`, `ensure_docker`, `ensure_network`, `check_path_ownership`, `sync_code`, `normalize_env`, `validate_env`, `compose`, `main`, `die`, `run`, `log`; exit codes 2/3/4/5. Workflow pipes the script to SSH with `ref` as `$1`.

- [ ] **Step 1: Write the failing shell test**

Create `scripts/deploy-remote.test.sh` with:
- `set -Eeuo pipefail`, `SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy-remote.sh"`, helpers `fail()` and `assert_has()` (`grep -Fq`).
- `test_dry_run_smoke`: capture output of
  `DRY_RUN=1 DEPLOY_PATH=/tmp/mglaroute-dry-run GIT_REMOTE=https://github.com/example/mglaroute-vpn-server.git bash "$SCRIPT" feature/ref 2>&1`
  and assert substrings: `[deploy] деплой feature/ref в /tmp/mglaroute-dry-run (dry-run=1)`, `docker network create shared-net`, `/tmp/mglaroute-dry-run/docker-compose.prod.yml build --pull`, `/tmp/mglaroute-dry-run/docker-compose.prod.yml up -d --force-recreate --wait`, `docker image prune -f`.
- `test_missing_git_remote`: with `GIT_REMOTE=` and `DRY_RUN=1`, expect exit code 5 and output containing `GIT_REMOTE`.
- `test_env_normalize_and_validate`: source with `DEPLOY_SOURCE_ONLY=1 DRY_RUN=0` and a temp `DEPLOY_PATH`; write `.env` with CRLF and all required keys minus `JWT_SECRET`, expect `validate_env` rc 4 naming `JWT_SECRET`; add `JWT_SECRET=x` and `DB_SYNCHRONIZE=true`, expect rc 4 naming `DB_SYNCHRONIZE`; set `DB_SYNCHRONIZE=false`, expect rc 0; then `normalize_env` must leave no `\r` and set mode 600.
- `test_first_deploy_preserves_env`: stub `git` in a temp `PATH` (logs `$*` to `$GIT_LOG`, `mkdir -p` last arg for `clone`), temp `DEPLOY_PATH` containing only `.env` with `JWT_SECRET=x`; source script (`DEPLOY_SOURCE_ONLY=1`, `DRY_RUN=0`, `GIT_REMOTE=https://example.invalid/r.git`), call `sync_code main`; assert log contains `clone --depth 1 --branch main https://example.invalid/r.git` and `$DEPLOY_PATH/.clone/.env` exists.

Print `OK` at end.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/deploy-remote.test.sh`
Expected: FAIL — `deploy-remote.sh: No such file or directory`.

- [ ] **Step 3: Implement `scripts/deploy-remote.sh`**

Write the script with `set -Eeuo pipefail`, `REF="${1:-main}"`, defaults above, `REQUIRED_KEYS` from Global Constraints, `export GIT_TERMINAL_PROMPT=0`, `log/die/run` helpers. Implement:
- `detect_sudo`: skip under `DRY_RUN`; root → empty `SUDO`; else `sudo -n true` → `SUDO=sudo`; else `die ... 2`.
- `ensure_docker`: skip install under `DRY_RUN`; else install via `get.docker.com` when absent, add user to `docker` group, verify `docker info`, set `DOCKER="$SUDO docker"` if needed, require `docker compose version`.
- `ensure_network`: `docker network inspect shared-net || docker network create shared-net` through `run`.
- `check_path_ownership`: skip under `DRY_RUN`; `find "$DEPLOY_PATH" -maxdepth 2 ! -user "$(id -un)"` → `die ... 2` with `chown` hint.
- `sync_code`: if `.git` exists → `git config --global --add safe.directory`, `git fetch --depth 1 origin "$REF"`, `git reset --hard FETCH_HEAD`; elif dir has entries other than `.env` → `die ... 3`; else clone into `"${DEPLOY_PATH%/}.clone"`, `mv "$DEPLOY_PATH/.env" "$staging/.env"`, `rmdir "$DEPLOY_PATH"`, `mv "$staging" "$DEPLOY_PATH"`.
- `normalize_env`: `sed -i 's/\r$//'`, `chmod 600`.
- `validate_env`: for each required key read value via `awk -F=`, collect empties → `die ... 4`; also require `DB_SYNCHRONIZE=false` → `die ... 4`.
- `compose()`: `run $DOCKER compose --project-directory "$DEPLOY_PATH" --env-file "$DEPLOY_PATH/.env" -f "$DEPLOY_PATH/$COMPOSE_FILE" "$@"`.
- `main`: check `GIT_REMOTE` non-empty → `die ... 5` first; then `detect_sudo`, `ensure_docker`, `ensure_network`, `check_path_ownership`, `sync_code`, `normalize_env`, `validate_env`, `compose build --pull`, `compose up -d --force-recreate --wait`, `run $DOCKER image prune -f`.
- Guard: `if [ "${DEPLOY_SOURCE_ONLY:-0}" != "1" ]; then main "$@"; fi`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/deploy-remote.test.sh`
Expected: `OK`, no failures.

- [ ] **Step 5: Local smoke against the real compose file**

Run:
`DRY_RUN=1 DEPLOY_PATH=/tmp/mglaroute-dry-run GIT_REMOTE=https://example.invalid/r.git bash scripts/deploy-remote.sh main`
Expected: log shows build/up commands with `docker-compose.prod.yml` and `docker image prune -f`, exit 0.

---

### Task 2: GitHub Actions deploy workflow

**Files:**
- Create: `mglaroute-vpn-server/.github/workflows/deploy.yml`
- Test: `mglaroute-vpn-server/scripts/deploy-workflow.test.py`

**Interfaces:**
- Consumes: `scripts/deploy-remote.sh` from Task 1 (must exist in repo root checkout).
- Produces: workflow with jobs `verify` and `deploy`; `deploy` pipes the script over SSH with `DEPLOY_REF` as `$1` and forwards `DEPLOY_PATH`, `GIT_REMOTE`, `COMPOSE_FILE` as remote env.

- [ ] **Step 1: Write the failing workflow test**

Create `scripts/deploy-workflow.test.py` using `unittest`, `pathlib`, `yaml`:
- `ROOT = Path(__file__).resolve().parent.parent`, `WF = ROOT/'.github/workflows/deploy.yml'`, loader `yaml.safe_load(WF.read_text(encoding='utf-8'))`.
- `test_triggers_and_guards`: `triggers = d.get(True, d.get('on'))`; assert `push.branches == ['main']`, `workflow_dispatch.inputs.ref.default == 'main'`, `concurrency == {'group':'deploy-production','cancel-in-progress':False}`, `permissions == {'contents':'read'}`.
- `test_verify_job`: assert exact `run` strings from Global Constraints present in `jobs.verify.steps`.
- `test_deploy_job`: `dep = jobs['deploy']`; assert `needs == 'verify'`, `environment == 'production'`, `timeout-minutes == 60`; assert `secrets.SSH_HOST`, `secrets.SSH_USER`, `secrets.SSH_PRIVATE_KEY`, `secrets.PROD_ENV` appear in `dep['env']`; assert `DEPLOY_PATH == "${{ vars.DEPLOY_PATH || '/home/mglaroute-vpn-provider' }}"`, `GIT_REMOTE == '${{ vars.GIT_REMOTE }}'`, `COMPOSE_FILE == 'docker-compose.prod.yml'`; assert some deploy step `run` contains `< scripts/deploy-remote.sh`.
- `if __name__ == '__main__': unittest.main()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python scripts/deploy-workflow.test.py`
Expected: FAIL — workflow file missing.

- [ ] **Step 3: Implement `.github/workflows/deploy.yml`**

Follow the reference structure with Russian step names:
- `name: Deploy`; triggers `push: branches: [main]`, `workflow_dispatch: inputs.ref` (description in Russian, `required: false`, `default: main`, `type: string`).
- `concurrency` and `permissions` per spec.
- `verify` job on `ubuntu-latest`: `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4` with `node-version: 22`, `cache: pnpm`, then the five exact verify commands as separate named steps.
- `deploy` job: `needs: verify`, `runs-on: ubuntu-latest`, `environment: production`, `timeout-minutes: 60`, `env` with all names from Global Constraints; `SSH_PORT: ${{ secrets.SSH_PORT || '22' }}`, `DEPLOY_REF: ${{ inputs.ref || 'main' }}`.
- Deploy steps: checkout; SSH setup (`mkdir ~/.ssh`, chmod 700, write `id_ed25519` from `$SSH_PRIVATE_KEY`, chmod 600, `ssh-keyscan -p "$SSH_PORT" -H "$SSH_HOST"` into `known_hosts`, chmod 600); deploy-dir preflight via heredoc `DEPLOY_PATH=%q bash -s` checking `mkdir -p` and write permission on dir and `.env`; write `.env` via `printf '%s\n' "$PROD_ENV" | ssh ... "umask 077 && cat > $env_file"`; run remote script via `ssh ... "DEPLOY_PATH=$(printf %q "$DEPLOY_PATH") GIT_REMOTE=$(printf %q "$GIT_REMOTE") COMPOSE_FILE=$(printf %q "$COMPOSE_FILE") bash -s -- $(printf %q "$DEPLOY_REF")" < scripts/deploy-remote.sh`. Quote with `printf %q` exactly as the reference does.

- [ ] **Step 4: Run test to verify it passes**

Run: `python scripts/deploy-workflow.test.py`
Expected: `OK` (3 tests).

---

### Task 3: Deployment docs

**Files:**
- Modify: `mglaroute-vpn-server/DEPLOY.md` (append after «Health Check»)
- Test: `mglaroute-vpn-server/scripts/deploy-workflow.test.py`

**Interfaces:**
- Consumes: final workflow and script from Tasks 1–2.
- Produces: documented secrets/vars names used by the workflow.

- [ ] **Step 1: Add failing doc assertion to the existing test**

In `scripts/deploy-workflow.test.py` add:
`test_deploy_docs`: `txt = (ROOT/'DEPLOY.md').read_text(encoding='utf-8')`; assert `'## CI/CD' in txt`; for each of `SSH_HOST SSH_USER SSH_PRIVATE_KEY PROD_ENV GIT_REMOTE DEPLOY_PATH DRY_RUN` assert token present.

- [ ] **Step 2: Run test to verify it fails**

Run: `python scripts/deploy-workflow.test.py`
Expected: FAIL on `test_deploy_docs`.

- [ ] **Step 3: Append the CI/CD section to `DEPLOY.md`**

Add `## CI/CD` with: trigger description (push to `main` / manual `workflow_dispatch` with `ref`), a secrets table (`SSH_HOST`, `SSH_USER` = `root`, `SSH_PORT` optional default 22, `SSH_PRIVATE_KEY`, `PROD_ENV` = full prod `.env` content) and a variables table (`GIT_REMOTE` required, `DEPLOY_PATH` default `/home/mglaroute-vpn-provider`), note that `environment: production` may hold the same values, and the local DRY_RUN command:
`DRY_RUN=1 DEPLOY_PATH=/tmp/mglaroute-dry-run GIT_REMOTE=<repo-url> bash scripts/deploy-remote.sh main`.
State that `DB_SYNCHRONIZE=false` is enforced by the deploy script.

- [ ] **Step 4: Run all tests to verify they pass**

Run:
`bash scripts/deploy-remote.test.sh`
`python scripts/deploy-workflow.test.py`
Expected: `OK` from both.

- [ ] **Step 5: Final sanity check**

Run: `python -c "import yaml,pathlib; yaml.safe_load(pathlib.Path('.github/workflows/deploy.yml').read_text(encoding='utf-8')); print('yaml ok')"`
Expected: `yaml ok`.
