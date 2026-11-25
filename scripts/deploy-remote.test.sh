#!/usr/bin/env bash
# Tests for scripts/deploy-remote.sh — run with: bash scripts/deploy-remote.test.sh
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/deploy-remote.sh"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
assert_has() { grep -Fq "$1" <<<"$2" || fail "missing substring: $1"; }

test_dry_run_smoke() {
  local out
  out=$(DRY_RUN=1 DEPLOY_PATH=/tmp/mglaroute-dry-run \
    GIT_REMOTE=https://github.com/example/mglaroute-vpn-server.git \
    bash "$SCRIPT" feature/ref 2>&1) || fail "dry-run exited nonzero: $out"
  assert_has '[deploy] деплой feature/ref в /tmp/mglaroute-dry-run (dry-run=1)' "$out"
  assert_has 'docker network create shared-net' "$out"
  assert_has '/tmp/mglaroute-dry-run/docker-compose.prod.yml build --pull' "$out"
  assert_has '/tmp/mglaroute-dry-run/docker-compose.prod.yml up -d --force-recreate --wait' "$out"
  assert_has 'docker image prune -f' "$out"
}

test_missing_git_remote() {
  local out rc
  set +e
  out=$(DRY_RUN=1 DEPLOY_PATH=/tmp/mglaroute-dry-run GIT_REMOTE= bash "$SCRIPT" main 2>&1)
  rc=$?
  set -e
  [ "$rc" -eq 5 ] || fail "expected rc=5 for empty GIT_REMOTE, got $rc: $out"
  assert_has 'GIT_REMOTE' "$out"
}

test_env_normalize_and_validate() {
  local tmp out rc
  tmp=$(mktemp -d)
  mkdir -p "$tmp/deploy"
  printf 'DB_NAME=mglaroute\r\nDB_USER=mglaroute\r\nDB_PASSWORD=pw\r\nFRONTEND_URL=https://admin.example\r\nVITE_API_URL=https://api.example\r\nCOMMON_DOMAIN=example\r\nDB_SYNCHRONIZE=false\r\n' > "$tmp/deploy/.env"
  (
    export DEPLOY_SOURCE_ONLY=1 DRY_RUN=0 DEPLOY_PATH="$tmp/deploy"
    source "$SCRIPT"

    set +e
    out=$(validate_env 2>&1)
    rc=$?
    set -e
    [ "$rc" -eq 4 ] || fail "expected rc=4 for missing JWT_SECRET, got $rc: $out"
    assert_has 'JWT_SECRET' "$out"

    printf 'JWT_SECRET=x\n' >> "$DEPLOY_PATH/.env"
    sed -i 's/^DB_SYNCHRONIZE=.*/DB_SYNCHRONIZE=true/' "$DEPLOY_PATH/.env"
    set +e
    out=$(validate_env 2>&1)
    rc=$?
    set -e
    [ "$rc" -eq 4 ] || fail "expected rc=4 for DB_SYNCHRONIZE=true, got $rc: $out"
    assert_has 'DB_SYNCHRONIZE' "$out"

    sed -i 's/^DB_SYNCHRONIZE=.*/DB_SYNCHRONIZE=false/' "$DEPLOY_PATH/.env"
    validate_env || fail "valid env must pass validate_env"

    normalize_env || fail "normalize_env failed"
    if LC_ALL=C grep -q $'\r' "$DEPLOY_PATH/.env"; then
      fail 'normalize_env left CRLF endings'
    fi
  )
  rm -rf "$tmp"
}

test_first_deploy_preserves_env() {
  local tmp
  tmp=$(mktemp -d)
  mkdir -p "$tmp/bin" "$tmp/deploy"
  cat > "$tmp/bin/git" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GIT_LOG"
if [ "$1" = clone ]; then mkdir -p "${@: -1}"; fi
STUB
  chmod +x "$tmp/bin/git"
  printf 'JWT_SECRET=x\n' > "$tmp/deploy/.env"
  (
    export PATH="$tmp/bin:$PATH" GIT_LOG="$tmp/git.log" \
      DEPLOY_SOURCE_ONLY=1 DRY_RUN=0 DEPLOY_PATH="$tmp/deploy" \
      GIT_REMOTE=https://example.invalid/r.git
    source "$SCRIPT"
    sync_code main
  )
  assert_has 'clone --depth 1 --branch main https://example.invalid/r.git' "$(cat "$tmp/git.log")"
  [ -f "$tmp/deploy/.env" ] || fail 'first deploy lost .env'
  grep -Fq 'JWT_SECRET=x' "$tmp/deploy/.env" || fail 'first deploy overwrote .env'
  [ ! -e "$tmp/deploy.clone" ] || fail 'staging directory left behind'
  rm -rf "$tmp"
}

test_duplicate_env_keys_use_last_value() {
  local tmp out rc
  tmp=$(mktemp -d)
  mkdir -p "$tmp/deploy"
  cat > "$tmp/deploy/.env" <<'ENV'
DB_NAME=mglaroute
DB_USER=mglaroute
DB_PASSWORD=pw
JWT_SECRET=good
FRONTEND_URL=https://admin.example
VITE_API_URL=https://api.example
COMMON_DOMAIN=example
DB_SYNCHRONIZE=false
DB_SYNCHRONIZE=true
ENV
  (
    export DEPLOY_SOURCE_ONLY=1 DRY_RUN=0 DEPLOY_PATH="$tmp/deploy"
    source "$SCRIPT"
    set +e
    out=$(validate_env 2>&1)
    rc=$?
    set -e
    [ "$rc" -eq 4 ] || fail "duplicate DB_SYNCHRONIZE=true must fail, got $rc: $out"
    assert_has 'DB_SYNCHRONIZE' "$out"
  )
  rm -rf "$tmp"
}

test_git_remote_credentials_not_logged() {
  local out
  out=$(DRY_RUN=1 DEPLOY_PATH=/tmp/mglaroute-dry-run \
    GIT_REMOTE=https://token:secret@example.invalid/r.git bash "$SCRIPT" main 2>&1)
  if grep -Fq 'token:secret' <<<"$out"; then
    fail 'GIT_REMOTE credentials leaked into log'
  fi
  assert_has '***@' "$out"
}

test_dry_run_smoke
test_missing_git_remote
test_env_normalize_and_validate
test_first_deploy_preserves_env
test_duplicate_env_keys_use_last_value
test_git_remote_credentials_not_logged
printf 'OK\n'
