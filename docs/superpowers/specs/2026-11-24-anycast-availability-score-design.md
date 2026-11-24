# Anycast score из доступности сервисов — дизайн

Дата: 2026-11-24

## Intent / why

Текущий score (`1 - uniqueIps/sampleCount` по строкам `scan_history` с одним IP) измеряет не anycast, а стабильность резолва: чем дольше сервер живёт, тем ближе score к 1. Из-за порога `0.5` почти все просканированные серверы помечаются anycast, и `anycast=false` в `/api/feed` возвращает пустоту. Замена: score отражает гипотезу «сервер anycast» по поведению доступности онлайн-сервисов и по явному признаку в `remarks`.

## Goals

- Stable сервер → score около `0.0`.
- Потеря доступа к онлайн-сервису двигает score к `1.0`.
- `anycast|auto` в `remarks`/`name` → score `1.0` сразу, без накопления.
- Смена конфигурации сервисов (правка URL, удаление, disable) обнуляет накопленную историю.
- `anycast=true|false` в `/api/servers` и `/api/feed` начинает фильтровать корректно.

## Non-goals / anti-goals

- Не использовать DNS/IP как证据 anycast. IP остаётся только informational полем для feed.
- Не добавлять геолокацию, ASN, RTT-триангуляцию.
- Не создавать новые таблицы, не менять контракт `GET /api/feed`.
- Не трогать `serviceIds` и логику проверки сервисов — только потребовать свежий результат.

## Constraints

- `profiles.anycastScore` — `decimal(3,2)`, 0..1; фильтры читают именно его (`server-filter.ts:40-45`, `feed.service.ts:39`).
- Свежая проверка сервисов происходит только когда `due` (fingerprint отличается или истёк `serviceCheckExpirationSeconds`, default 3600); между проверками `scan_history` получает кэш `serviceIds` (`scanner.service.ts:171-190, 206-218`).
- `servicesFingerprint` — sha256 от id + отсортированных testUrl включённых сервисов (`service-fingerprint.ts:3-9`), меняется при правке URL / удалении / disable.
- Схема через TypeORM `synchronize`; миграций нет.

## Approaches

1. **Столбцы в `profiles` (выбрано).** Новый `anycastWindow jsonb` — последние 10 флагов потерь; переиспользуются `anycastScore` и `anycastSamples`. `anycast_scores` остаётся хранилищем `resolvedIp` для `/api/feed`. Плюсы: фильтры и feed не меняются, одна запись на профиль, минимальные изменения схемы. Минусы: доступны только текущие 10 флагов, старые строки `anycast_scores` перестают быть оценкой.
2. **Отдельная таблица `anycast_checks`.** Строка на каждую свежую проверку с `reachableCount`, `expectedCount`, `loss`, `fingerprint`. Плюсы: полная аудируемость и пересчёт. Минусы: новая entity, миграция, больше записей и кода.
3. **Переделка `anycast_scores` в одну строку на профиль.** Плюс: всё в одном месте. Минусы: ломается уникальный индекс `(profileId, resolvedIp)` и `FeedService.resolveIps()`, плюс detail-эндпоинт.

Выбран вариант 1: самый дешёвый и не ломает существующие фильтры.

## Решения (как считаем)

- `ANYCAST_WINDOW_SIZE = 10`, константа в `AnycastService`. Нового поля в настройках нет.
- Окно хранится в `profile.anycastWindow`: массив boolean, `true` = в этой проверке была потеря. Длина ≤ 10. `profile.anycastSamples = window.length`.
- `score = losses / window.length`, знаменатель растёт до 10, затем окно скользящее. Старые проверки выпадают сами — отдельного decay не нужно.
- Запись в окно только когда в скане была **свежая** проверка сервисов (`okUrls !== null`). Кэш `serviceIds` и TCP-fallback запись не добавляют.
- База сравнения: количество включённых сервисов, у которых `testUrls` не пустой. Потеря = `reachableCount < expectedCount`. Если `expectedCount === 0`, окно не обновляется.
- Regex `/anycast|auto/i` по `remarks` и `name`: совпадение → `score = 1.0` независимо от окна. Совпадение пересчитывается каждый скан, в том числе без свежей проверки.
- При `profile.servicesFingerprint !== fingerprint` окно очищается до записи текущей проверки. Regex от fingerprint не зависит.
- `anycast_scores` продолжает получать строку при каждом已知 `resolvedIp` (score в строке informational), чтобы `/api/feed` сохранил `resolvedIp`. `GET /api/servers/:id/anycast` берёт `confidence` из `profile.anycastScore`; `uniqueIps`/`resolvedIps` остаются как观测 IP, не как аргумент за score.
- Порог `anycastThreshold` остаётся default `0.5` и остаётся редактируемым в `/settings`: при окне 10 для `anycast=true` нужно 5 проверок с потерей. `anycast=false` теперь включает стабильные серверы со score `0.0` и legacy `NULL`.

## Что остаётся исполнителю

- Переписать `AnycastService`: новые входы, расчёт по окну, regex, reset по fingerprint, запись `resolvedIp` без要求 score.
- Обновить `Profile` entity и вызов в `ScannerService`, не меняя `scan_history`.
- Обновить `QueryService.getAnycastDetail` под novoем semantics и убрать misleading-текст про «confidence that IP serves multiple locations» во frontend.
- Тесты: regex override, 1 потеря / 4 проверки = 0.25, кап окна 10, сброс по fingerprint, отсутствие свежей проверки, `anycast=false` возвращает стабильные профили.
- Документация: `AGENTS.md` (убрать known gap про degenerating score), `PLAN.md`, `AnycastPage.tsx`, `SettingsPage.tsx` help-текст.

План работ составляется после одобрения этого документа.
