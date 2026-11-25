#!/usr/bin/env bash
#
# Идемпотентный деплой mglaroute-vpn-server на сервер.
#
#   DEPLOY_PATH=/home/mglaroute-vpn-provider GIT_REMOTE=<repo-url> \
#     bash deploy-remote.sh [ref]
#
# Переменные:
#   DEPLOY_PATH   каталог деплоя
#   GIT_REMOTE    origin репозитория (обязателен)
#   COMPOSE_FILE  compose-файл (по умолчанию docker-compose.prod.yml)
#   DRY_RUN=1     печатать команды вместо выполнения (docker не требуется)
#   DEPLOY_SOURCE_ONLY=1  только объявить функции (для тестов)
#
# Коды выхода: 2 — preflight, 3 — каталог не git, 4 — плохой .env,
#              5 — не задан GIT_REMOTE.

set -Eeuo pipefail

REF="${1:-main}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/mglaroute-vpn-provider}"
GIT_REMOTE="${GIT_REMOTE:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DRY_RUN="${DRY_RUN:-0}"

REQUIRED_KEYS="DB_NAME DB_USER DB_PASSWORD JWT_SECRET FRONTEND_URL VITE_API_URL COMMON_DOMAIN"

SUDO=""
DOCKER="docker"

export GIT_TERMINAL_PROMPT=0

log() {
  # Redact credentials embedded in URLs (vars are not masked in CI logs).
  local message
  message=$(printf '%s' "$*" | sed -E 's#(https?://)[^/@]+@#\1***@#')
  printf '[deploy] %s\n' "$message"
}

die() {
  local message="$1"
  local code="${2:-1}"
  printf '[deploy] ОШИБКА: %s\n' "$message" >&2
  exit "$code"
}

run() {
  if [ "$DRY_RUN" = "1" ]; then
    log "dry-run: $*"
    return 0
  fi
  "$@"
}

detect_sudo() {
  if [ "$DRY_RUN" = "1" ]; then
    log "dry-run: проверка sudo пропущена"
    return 0
  fi
  if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
    return 0
  fi
  if sudo -n true 2>/dev/null; then
    SUDO="sudo"
    return 0
  fi
  die "пользователю $(id -un) нужен sudo без пароля (NOPASSWD)" 2
}

ensure_docker() {
  if [ "$DRY_RUN" = "1" ]; then
    log "dry-run: проверка/установка docker пропущена"
    return 0
  fi
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "docker и docker compose уже установлены"
  else
    log "устанавливаю docker через get.docker.com"
    $SUDO sh -c 'curl -fsSL https://get.docker.com | sh'
    $SUDO usermod -aG docker "$(id -un)" || true
  fi
  if ! docker info >/dev/null 2>&1; then
    if [ -n "$SUDO" ] && $SUDO docker info >/dev/null 2>&1; then
      DOCKER="$SUDO docker"
    else
      die "docker daemon недоступен" 2
    fi
  fi
  $DOCKER compose version >/dev/null 2>&1 || die "docker compose недоступен" 2
}

ensure_network() {
  if [ "$DRY_RUN" = "1" ]; then
    run $DOCKER network create shared-net
    return 0
  fi
  if $DOCKER network inspect shared-net >/dev/null 2>&1; then
    log "сеть shared-net уже есть"
  else
    log "создаю сеть shared-net"
    run $DOCKER network create shared-net
  fi
}

check_path_ownership() {
  if [ ! -e "$DEPLOY_PATH" ]; then
    return 0
  fi
  if [ "$DRY_RUN" = "1" ]; then
    log "dry-run: проверка владельца $DEPLOY_PATH пропущена"
    return 0
  fi
  local foreign
  foreign=$(find "$DEPLOY_PATH" -maxdepth 2 ! -user "$(id -un)" -print -quit 2>/dev/null || true)
  if [ -n "$foreign" ]; then
    die "в $DEPLOY_PATH есть файлы другого владельца (например $foreign); выполните: $SUDO chown -R $(id -un) $DEPLOY_PATH" 2
  fi
}

sync_code() {
  if [ -d "$DEPLOY_PATH/.git" ]; then
    git config --global --add safe.directory "$DEPLOY_PATH" >/dev/null 2>&1 || true
    if [ "$DRY_RUN" != "1" ] && [ ! -w "$DEPLOY_PATH/.git" ]; then
      die "нет прав на запись в $DEPLOY_PATH/.git; выполните: $SUDO chown -R $(id -un) $DEPLOY_PATH" 2
    fi
    log "обновляю код в $DEPLOY_PATH до $REF"
    run git -C "$DEPLOY_PATH" fetch --depth 1 origin "$REF"
    run git -C "$DEPLOY_PATH" reset --hard FETCH_HEAD
  elif [ -e "$DEPLOY_PATH" ]; then
    if [ ! -d "$DEPLOY_PATH" ]; then
      die "$DEPLOY_PATH существует и это не каталог" 3
    fi
    # Workflow пишет .env до первого клонирования: пустой каталог
    # (или каталог только с .env) — ожидаемое состояние первого деплоя.
    local unexpected
    unexpected=$(find "$DEPLOY_PATH" -mindepth 1 -maxdepth 1 ! -name '.env' -print -quit)
    if [ -n "$unexpected" ]; then
      die "$DEPLOY_PATH существует, но это не git-репозиторий (найден $unexpected); освободите каталог вручную" 3
    fi
    log "клонирую $GIT_REMOTE ($REF) в $DEPLOY_PATH"
    local staging="${DEPLOY_PATH%/}.clone"
    run rm -rf "$staging"
    run git clone --depth 1 --branch "$REF" "$GIT_REMOTE" "$staging"
    if [ -f "$DEPLOY_PATH/.env" ]; then
      run mv "$DEPLOY_PATH/.env" "$staging/.env"
    fi
    run rmdir "$DEPLOY_PATH"
    run mv "$staging" "$DEPLOY_PATH"
  else
    log "клонирую $GIT_REMOTE ($REF) в $DEPLOY_PATH"
    run git clone --depth 1 --branch "$REF" "$GIT_REMOTE" "$DEPLOY_PATH"
  fi
}

normalize_env() {
  local env_file="$DEPLOY_PATH/.env"
  if [ "$DRY_RUN" = "1" ]; then
    log "dry-run: нормализую $env_file (CRLF -> LF)"
    return 0
  fi
  [ -f "$env_file" ] || die "нет $env_file: workflow пишет его из секрета PROD_ENV" 4
  sed -i 's/\r$//' "$env_file"
  chmod 600 "$env_file" 2>/dev/null || true
}

# Compose uses the LAST occurrence of a duplicated key — match that behavior.
env_value() {
  awk -F= -v k="$1" '$0 ~ "^" k "=" { v=substr($0, index($0, "=")+1); sub(/\r$/, "", v) } END { print v }' "$2"
}

validate_env() {
  local env_file="$DEPLOY_PATH/.env"
  if [ "$DRY_RUN" = "1" ]; then
    log "dry-run: проверяю обязательные ключи в $env_file"
    return 0
  fi
  [ -f "$env_file" ] || die "нет $env_file: workflow пишет его из секрета PROD_ENV" 4
  local missing="" key value
  for key in $REQUIRED_KEYS; do
    value=$(env_value "$key" "$env_file")
    if [ -z "$value" ]; then
      missing="$missing $key"
    fi
  done
  if [ -n "$missing" ]; then
    die "в $env_file пустые обязательные ключи:$missing" 4
  fi
  value=$(env_value DB_SYNCHRONIZE "$env_file")
  if [ "$value" != "false" ]; then
    die "DB_SYNCHRONIZE должен быть false в проде (сейчас: ${value:-<пусто>})" 4
  fi
}

compose() {
  run $DOCKER compose \
    --project-directory "$DEPLOY_PATH" \
    --env-file "$DEPLOY_PATH/.env" \
    -f "$DEPLOY_PATH/$COMPOSE_FILE" \
    "$@"
}

main() {
  log "деплой $REF в $DEPLOY_PATH (dry-run=$DRY_RUN)"
  [ -n "$GIT_REMOTE" ] || die "GIT_REMOTE не задан: передайте vars.GIT_REMOTE в workflow" 5
  detect_sudo
  ensure_docker
  ensure_network
  check_path_ownership
  sync_code
  normalize_env
  validate_env
  compose build --pull
  compose up -d --force-recreate --wait
  run $DOCKER image prune -f
  log "готово"
}

if [ "${DEPLOY_SOURCE_ONLY:-0}" != "1" ]; then
  main "$@"
fi
