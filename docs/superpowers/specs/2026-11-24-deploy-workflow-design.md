# Deploy workflow для mglaroute-vpn-server

Дата: 2026-11-24

## Намерение

Автоматизировать выкладку сервера по образцу `C:\Users\hermit\webdev\Wired\.github\workflows\deploy.yml`:
проверки в CI → деплой по SSH на существующий сервер. Пользователь выбрал **пару** файлов:
workflow + адаптированный remotный скрипт.

## Goals

- `push` в `main` и ручной `workflow_dispatch` с выбором `ref` деплоят одинаково.
- Verify ловит поломки до SSH-шагов.
- Деплой идемпотентен: повторный запуск не ломает `.env`, код и контейнеры.
- Секреты не попадают в лог: `.env` пишется из `PROD_ENV`, приватный ключ — из `SSH_PRIVATE_KEY`.

## Non-goals / антицели

- Не трогаем существующий `docker-compose.prod.yml`, `Dockerfile`, Caddy-конфиг.
- Не мигрируем на GitHub Container Registry — образы строятся на сервере.
- Не добавляем автодеплой клиента (`mglaroute-vpn-client` ещё нет).
- Не отменяем уже идущий деплой (`cancel-in-progress: false`).

## Constraints / находки по проекту

- Compose prod: `docker-compose.prod.yml`; сеть `shared-net` объявлена `external: true` — скрипт должен её создать при отсутствии.
- Пакеты: `mglaroute-vpn-server-backend`, `mglaroute-vpn-server-frontend`. pnpm из `packageManager: pnpm@10.12.1`; lockfile есть.
- Скрипты проверок: backend `test` (jest), `test:xray` (`node --test scripts/*.test.mjs`, файлы есть); frontend `build` (= `tsc && vite build`) и `lint` (`--max-warnings 0`). Отдельных `test` / `check-types` / `build:shared` у фронта нет.
- Сервер: root@158.255.6.45, каталог `/home/mglaroute-vpn-provider` (CREDENTIALS.md). sudo не требуется, но скрипт оставляет fallback на NOPASSWD sudo.
- GitHub remote URL репозитория неизвестен (локального git нет) → передаём через `vars.GIT_REMOTE`, без хардкода.
- Prod `.env` обязательные ключи: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `FRONTEND_URL`, `VITE_API_URL`, `COMMON_DOMAIN`; `DB_SYNCHRONIZE` должен быть `false`.

## Approaches

1. **Пара файлов (выбран пользователем).** `.github/workflows/deploy.yml` + `scripts/deploy-remote.sh`, как в Wired. Workflow готовит SSH и `.env`, скрипт делает идемпотентную синхронизацию кода и `docker compose`. Плюс: вся серверная логика проверяема локально через `DRY_RUN=1`, workflow остаётся тонким. Минус: два файла вместо одного.
2. **Только workflow, SSH-команды инлайн.** Меньше файлов, но длинный heredoc в YAML, нет сухого прогона, harder поддерживать.
3. **build-push-action + container registry.** Образы собираются в CI — требует registry и прав на сервере, ломает текущую модель `build: context/target` в prod compose. Не подходит.

## Решение (как строим)

### `.github/workflows/deploy.yml`

- `name: Deploy`; `on: push branches: [main]` + `workflow_dispatch` с `ref` (default `main`).
- `concurrency: group deploy-production, cancel-in-progress: false`; `permissions: contents: read`.
- Job `verify` (ubuntu-latest): checkout → `pnpm/action-setup@v4` → `actions/setup-node@v4` (Node 22, `cache: pnpm`) → `pnpm install --frozen-lockfile` → `pnpm --filter mglaroute-vpn-server-backend test` → `pnpm --filter mglaroute-vpn-server-backend test:xray` → `pnpm --filter mglaroute-vpn-server-frontend build` → `pnpm --filter mglaroute-vpn-server-frontend lint`.
- Job `deploy`: `needs: verify`, `environment: production`, `timeout-minutes: 60`. Env: `SSH_HOST`, `SSH_USER`, `SSH_PORT` (`|| '22'`), `SSH_PRIVATE_KEY`, `DEPLOY_PATH` (`vars.DEPLOY_PATH || '/home/mglaroute-vpn-provider'`), `PROD_ENV`, `DEPLOY_REF` (`inputs.ref || 'main'`), `GIT_REMOTE` (`vars.GIT_REMOTE`), `COMPOSE_FILE` (`docker-compose.prod.yml`).
- Шаги: checkout (нужен `scripts/deploy-remote.sh`) → локальная проверка `GIT_REMOTE` и `PROD_ENV` через `validate_env` из скрипта (до записи `.env` на сервер) → настройка SSH → проверка прав на каталог → запись `.env` (`umask 077`) → `ssh ... < scripts/deploy-remote.sh` с `ref` аргументом.

### `scripts/deploy-remote.sh`

- Сигнатура: `DEPLOY_PATH=... GIT_REMOTE=... [COMPOSE_FILE=...] bash deploy-remote.sh [ref]`; `DRY_RUN=1` печатает команды.
- Коды выхода: 2 preflight (права/sudo/docker), 3 не git-каталог, 4 плохой `.env`, 5 нет `GIT_REMOTE`.
- Функции по образцу Wired: `detect_sudo`, `ensure_docker`, `ensure_network` (`shared-net`), `check_path_ownership`, `sync_code` (fetch/reset либо clone с переносом `.env`), `normalize_env` (CRLF→LF, chmod 600), `validate_env` (обязательные ключи + `DB_SYNCHRONIZE=false`), `compose` (`--project-directory`, `--env-file`, `-f "$COMPOSE_FILE"`).
- `main`: `compose build --pull` → `compose up -d --force-recreate --wait` → `docker image prune -f`.

### Документация

- `DEPLOY.md`: раздел «CI/CD» — таблица secrets (`SSH_HOST`, `SSH_USER`, `SSH_PORT` (опционально, по умолчанию `22`), `SSH_PRIVATE_KEY`, `PROD_ENV`) и vars (`GIT_REMOTE`, `DEPLOY_PATH`), описание ручного workflow_dispatch и DRY_RUN-проверки.

## Оставшееся исполнителю

- Точный `GIT_REMOTE` (URL GitHub-репозитория) задаётся пользователем в `vars`.
- Значения `PROD_ENV` и SSH-ключа задаются пользователем в `secrets`.
- Проверить `pnpm --filter ... test` / `lint` локально до включения workflow, если есть сомнения в текущем состоянии кода.
