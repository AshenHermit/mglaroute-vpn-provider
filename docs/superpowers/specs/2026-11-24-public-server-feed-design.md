# Публичная выдача серверов: подписка + JSON со сканом

Дата: 2026-11-24. Статус: **approved** (правка оператора 2026-11-24: один эндпоинт с `format=`; активные подписки = `status=active AND enabled=true`).

## Intent / why

Оператор хочет выдавать список серверов по публичной ссылке в двух видах:
обычная VPN-подписка (как `https://raw.githubusercontent.com/hiztin/VLESS-PO-GRIBI/main/deploy/subscriptions/1.txt`
— plain-текст, одна строка = один URI `vless://`/`vmess://`/`ss://`/`trojan://`)
и JSON с подробностями mglaroute-сканирования. На Dashboard нужна панель,
которая собирает такую ссылку из настраиваемых параметров выдачи.
Интерфейс по умолчанию тёмный.

## Goals

1. Один публичный endpoint'а без JWT:
   - `format=subscription` → `text/plain; charset=utf-8`, URI по строке.
   - `format=json` → `application/json`, мета + серверы с данными скана.
2. Одинаковый набор фильтров для обоих форматов, совпадающий с `/api/servers`.
3. Dashboard: форма параметров + сгенерированная ссылка + копирование/открытие.
4. Тёмная тема по умолчанию (`class="dark"` на `<html>`).
5. Тесты на сборку URI и на фильтрацию/форматы выдачи.

## Non-goals / anti-goals

- Нет токенов, разовых ключей, rate-limit и авторизации на выдаче: ссылка публичная.
- Нет новых форматов (sing-box, Clash YAML, v2ray JSON) на выходе; только 4 URI-схемы.
- Нет переключателя темы (только дефолт dark).
- Нет правки схемы БД, миграций, сканера и парсера.
- Не менять контракт `/api/servers` и его ответ.

## Constraints

- NestJS 10 global prefix `/api`; `EnvelopeInterceptor` оборачивает ВСЁ в
  `{ok,data}`. VPN-клиенты и внешние потребители JSON должны получить raw body →
  контроллер использует `@Res()` и пишет ответ сам; интерceptor к такому телу не применяется.
- `FirstRunGuard` глобальный, но пропускает `@Public()`. `JwtAuthGuard` ставится
  только явно на контроллерах → новый контроллер его НЕ ставит.
- Глобальный `ValidationPipe`: `whitelist: true, forbidNonWhitelisted: true` —
  DTO должен объявлять все принимаемые query-параметры, иначе 400.
- `Profile.present=true` — обязательное условие выдачи (скрытые записи не отдаём).
- Публичная выдача берёт только профили из подписок с `status=active AND enabled=true`
  (решение оператора 2026-11-24).
- Актуальные поля скана: `lastLatencyMs`, `lastReachable`, `anycastScore`,
  `anycastSamples`, `lastScannedAt`, `serviceIds`, `servicesCheckedAt`;
  `resolvedIp` живёт в `anycast_scores` (`inet`).
- `rawConfig` (jsonb) содержит исходные параметры REALITY (`pbk`, `sid`, `spx`),
  `flow`, `encryption`, `type=xhttp`, `alpn`, `fp`. Без него собранная ссылка
  теряет работоспособность.
- Фронт: Vite + React 18 + локальные shadcn/Radix-обёртки; `VITE_API_URL=http://localhost:3000`.
- Репозиторий теперь git (чистый); коммит без явной просьбы не делать.

## Approaches considered

1. Два публичных пути `/api/feed/subscription` и `/api/feed/json`: короткая
   ссылка, content-type не зависит от параметра. Отвергнуто оператором 2026-11-24.
2. **Один путь `/api/feed?format=subscription|json` (выбрано оператором)**:
   меньше файлов, один контракт, формат явно задан параметром. Content-type
   определяется значением `format`, это допустимо для публичной выдачи.
3. Переиспользовать `/api/servers`. Отвергнуто: JWT + envelope, не публично.

## Decisions (how it gets built)

### 1. Backend module `feed/`

Файлы: `feed.module.ts`, `feed.controller.ts`, `feed.service.ts`,
`dto/feed-query.dto.ts`, `subscription-link.builder.ts`, spec-файлы.

- `FeedModule`: `TypeOrmModule.forFeature([Profile, AnycastScore, ScannerSettings, Subscription])`,
  controller + provider; в `AppModule` добавить в `imports`.
- `FeedController`: `@Controller('feed')`, `@Public()` на классе; без JwtAuthGuard.
  Один `@Get()` принимает `@Query() dto: FeedQueryDto`, отвечает через `@Res()`
  (`res.type(...).send(...)`) в зависимости от `dto.format`. Swagger-аннотации —
  как у остальных контроллеров, но без `@ApiBearerAuth()`.
- `FeedQueryDto` (все поля optional):
  `format?: 'json'|'subscription'` (default `subscription`), `anycast?: boolean`,
  `reachable?: boolean`, `protocol?: string`,
  `search?: string`, `sort?: string` (тот же `IsIn`-список, что в `QueryServersDto`),
  `services?: string[]` (приходит из query как `services=a,b` → `@Transform` в массив),
  `limit?: number` (`@Min(1) @Max(1000)`, default 200). `page` отсутствует.
  Булевы — `@Transform` как в `QueryServersDto`.
- Общий фильтр: вынести логику из `QueryService.queryServers` в
  `query/server-filter.ts` — `applyServerFilters(qb, filters, threshold)` — и
  использовать её и в `QueryService`, и в `FeedService`, чтобы фильтры не
  расходились. `QueryService` сохраняет текущий контракт и пагинацию.
- `FeedService.getProfiles(dto)`: `qb.andWhere('profile.present = true')` +
  `innerJoin('profile.subscription', 'subscription')` с
  `subscription.status = active AND subscription.enabled = true` + общий фильтр
  + `orderBy` по `sort` + `.take(limit)` (без skip) + `getMany()`.
  Порог anycast берётся из `scanner_settings` (`id='singleton'`, default 0.5).
- `resolvedIp`: одним запросом `anycast_scores` для найденных profile ids,
  `orderBy lastUpdated DESC`, первая запись на профиль (как в `getAnycastList`).
  **Решение агента:** если строк нет → `null` (не подставлять `profile.address`):
  `resolvedIp` означает результат скана, а не адрес из конфига.

### 2. Сборка URI — `subscription-link.builder.ts`

`buildProfileLink(profile: Profile): string | null`. Источник значений — whitelist
параметров из `rawConfig`, канонические поля `Profile` перекрывают их.

- vless: `vless://<uuid>@<address>:<port>?<params>#<encodeURIComponent(remarks ?? name)>`.
  Params (если есть): `security`, `sni`, `fp`, `pbk`, `sid`, `spx`, `flow`,
  `encryption`, `type`, `path`, `host`, `alpn`, `serviceName`, `headerType`,
  `mode`, `packetEncoding`, `allowInsecure`, `extra`. Массивы (`alpn`) → `join(',')`.
- vmess: JSON (`v:'2'`, `ps`, `add`, `port`, `id`, `aid`, `scy`, `net`, `type`,
  `host`, `path`, `tls`, `sni`, `alpn`, `fp`, `skip-cert-verify`) → base64 UTF-8.
- ss: `ss://<base64(method:password)>@<address>:<port>#<encodeURIComponent(remarks ?? name)>`.
- trojan: `trojan://<password>@<address>:<port>?<security/sni/host/path/type/alpn/fp/flow/allowInsecure>#<remark>`.
- Недостающие `uuid` (vless/vmess) или `password` (ss/trojan) → `null`, профиль
  пропускается. Дедуп по точной строке URI с сохранением порядка.

### 3. Форматы ответа

- subscription (`format=subscription`): строки URI через `\n` + финальный `\n`;
  пустой результат → пустое тело.
- json (`format=json`):
  `{ generatedAt, count, skipped, servers: [{ id, name, remarks, protocol,
    address, port, link, latencyMs, reachable, anycastConfidence, anycastSamples,
    resolvedIp, lastScannedAt, services, servicesCheckedAt }] }`.
  Даты — ISO-строки. `rawConfig` и секреты сверх URI в JSON не кладём.
  **Решение агента:** `count = servers.length` (фактически выданные уникальные
  серверы); `skipped` = число профилей из отобранных, которые не попали в выдачу
  из-за `null`-ссылки (нет credentials) или дедупа. Отфильтрованные на уровне
  запроса строки (не прошедшие `present`/фильтры/limit) в `skipped` не входят.

### 4. Фронтенд

- `frontend/index.html`: `<html lang="en" class="dark">`.
- `DashboardPage.tsx`: новая `Card` «Server feed» после stat-карточек:
  - `Select` формата (`subscription`/`json`), протокола, anycast (`any`/`true`/`false`),
    reachable (`any`/`true`/`false`), sort; `Input` search и limit (1..1000).
  - Список включённых сервисов из `/api/online-services/enabled` (id + name),
    выбор через `Switch`; если запрос упал — просто пустой список.
  - Кнопка «Generate» собирает URL: `import.meta.env.VITE_API_URL || location.origin`
    + `/api/feed` + `URLSearchParams` с `format=<format>` и только не-default параметрами.
  - Readonly `Input` со ссылкой, кнопка `Copy` (`navigator.clipboard.writeText`)
    и ссылка «Open» (`target="_blank" rel="noopener noreferrer"`).
  - Текст-предупреждение: ссылка публичная, ключи доступны любому, кто её получил.
  - `api`-клиент для самой ссылки не использовать: она открывается/копируется как есть.
- Новые зависимости не нужны.

### 5. Тесты (TDD до реализации)

- `subscription-link.builder.spec.ts`: vless REALITY (pbk/sid/flow/xhttp),
  vmess base64, ss, trojan, отсутствие credentials → `null`, экранирование remark.
- `feed.service.spec.ts`: фильтры (anycast порог из settings, services, protocol,
  reachable, search, sort, limit cap), дедуп ссылок, формат JSON, resolvedIp,
  `present=false` не попадает в выдачу.
- Фронт: `pnpm --filter mglaroute-vpn-server-frontend build` + ручная проверка
  генерации/копирования ссылки в браузере на `http://localhost:5173`.

### 6. Документация

Обновить `AGENTS.md` (список API), `PLAN.md`, `README.md` по действующему правилу
«keep in sync when behavior changes».

## Risks / open items left to builder

- Точный порядок whitelist-параметров в URI не важен для клиентов; выбрать
  стабильный порядок и придерживаться его в тестах.
- Поведение `@Res()` с глобальным `EnvelopeExceptionFilter` при ошибке валидации:
  ошибка остаётся JSON-envelope (`{ok:false,...}`) — это допустимо.
- Производительность: `limit` до 1000 и один дополнительный запрос anycast_scores;
  кэш не добавляем.
