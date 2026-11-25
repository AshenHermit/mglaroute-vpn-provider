# Xray version pin — design (small change)

## Intent

Привязать версию xray-core к исходникам проекта, чтобы сборка не тянула `latest` и была воспроизводимой. Пользователь выбрал: «зафиксировать версию в коде, так будет привязка к самому софту внутри проекта».

## Facts found

- `backend/scripts/download-xray.mjs:45-60`: без `XRAY_VERSION` загрузчик дёргает `https://api.github.com/repos/XTLS/Xray-core/releases/latest`; при 403/429 — redirect с github.com.
- `Dockerfile:9`: `RUN npm run xray:download` в `backend-builder`, бинарник копируется в прод на `Dockerfile:29`. `docker-compose.prod.yml:46-48` у backend не имеет `build.args`.
- Последний стабильный тег на 2026-11-24 — `v26.11.9` (опубликован 2026-11-09, проверено через GitHub API).
- Локальный `pnpm xray:download` идёт через тот же скрипт, поэтому фиксация в скрипте покрывает и dev, и Docker.

## Goals

- Одна константа версии в коде, используемая и локально, и в Docker-сборке.
- Деплой не зависит от GitHub API (только от скачивания релиза с github.com).
- Сохранён аварийный override через `XRAY_VERSION` и `XRAY_DOWNLOAD_URL`.

## Non-goals

- Изменение `Dockerfile`, `docker-compose.prod.yml` и workflow — привязка остаётся в софте, а не в инфраструктуре.
- Автообновление версии. Обновление = правка константы вручную.

## Approaches

1. **Константа в загрузчике (выбрано).** `export const XRAY_VERSION = 'v26.11.9'` в `backend/scripts/xray-assets.mjs`, рядом с выбором ассетов; оттуда же `pinnedRelease(platform, arch, tag)` собирает synthetic release. `download-xray.mjs` вызывает его вместо `latest`. Плюсы: одна точка истины для dev и prod, нет новых аргов, тестируется чисто. Минус: обновление = коммит.
2. `ARG XRAY_VERSION` в `Dockerfile` + `build.args` в compose. Минусы: привязка к инфраструктуре, локальный `pnpm xray:download` остаётся на `latest`, больше движущихся частей. Отклонено.
3. GitHub Variable/Secret. Минусы: версия живёт вне репозитория, не привязана к софту. Отклонено.

## Decisions

- `XRAY_VERSION = 'v26.11.9'` в `backend/scripts/xray-assets.mjs`.
- Удалить из `download-xray.mjs` `resolveRelease()` через GitHub API, `resolveFromRedirect()` и `syntheticRelease()` (переезжает в `xray-assets.mjs` как `pinnedRelease`).
- `getWithFallback` остаётся: он нужен для скачивания zip/dgst.
- `XRAY_VERSION` из env по-прежнему имеет приоритет над константой; `XRAY_DOWNLOAD_URL` по-прежнему подменяет URL архива.
- В лог добавить используемый тег.
- `DEPLOY.md#cicd`: строка о зафиксированной версии и двух override-переменных.

## Tests

- RED: в `backend/scripts/xray-assets.test.mjs` тест на `XRAY_VERSION === 'v26.11.9'` и `pinnedRelease('linux','x64')` → URL `.../releases/download/v26.11.9/Xray-linux-64.zip`; тест на кастомный tag.
- GREEN: добавить константу и `pinnedRelease`, переключить `download-xray.mjs`.
- Полный прогон: `cd backend && node --test scripts/*.test.mjs`.

## Constraints

- Никаких изменений `Dockerfile` / compose / workflow.
- sha256-проверка `.dgst` остаётся обязательной.
- Тесты без сети.

## What is left

Ничего; после одобрения — короткий план и выполнение.
