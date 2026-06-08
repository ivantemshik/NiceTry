# FINAL_AUDIT_REPORT — NiceTry

**Дата:** 2026-06-08 · **Скоуп:** финальный аудит (ошибки + кибербезопасность) · **Режим:** автономный.
Подробный пошаговый журнал — `WORKLOG_AUDIT.md`.

---

## 1. Сводка

| Severity | Найдено | Исправлено | TODO / решение владельца |
|----------|---------|------------|--------------------------|
| Critical | 1 | 1 | 0 |
| High | 0 | 0 | 0 |
| Medium | 2 | 1 | 1 |
| Low | 3 | 0 | 3 (приняты как осознанный компромисс / конфиг) |

**Итог:** проект в очень хорошем состоянии. Денежные потоки, авторизация, подписи вебхуков/поставщиков, идемпотентность и server-side ценообразование реализованы корректно. Единственная критичная находка — устаревший Next.js с CVE обхода авторизации — исправлена бампом патча. `npm run build` зелёный.

---

## 2. Таблица находок

| ID | Блок | Severity | Описание | Статус | Файл |
|----|------|----------|----------|--------|------|
| A-1 | A/B | **Critical** | Next.js 14.2.3: CVE-2025-29927 — обход авторизации в middleware (+ серия DoS/cache-poisoning) | **fixed** | package.json |
| B-1 | B | Medium | Отсутствуют security-заголовки (nosniff, HSTS, Referrer-Policy, Permissions-Policy) | **fixed** | next.config.js |
| B-2 | B | Medium | `telegram/webhook`: при пустом `WEBHOOK_SECRET` проверка секрета пропускается | TODO (конфиг) | api/telegram/webhook/route.ts |
| C-1 | B | Low | Residual Next advisories (DoS/cache-poisoning) закрываются только мажором Next 16 | TODO (решение владельца) | package.json |
| C-2 | A | Low | `npm audit`: esbuild/glob/minimatch/postcss — dev/build-only, фикс только breaking | TODO (не критично) | devDependencies |
| C-3 | B | Low | `rate-limit.ts` in-memory — не делится между serverless-инстансами | принято (документировано) | lib/rate-limit.ts |

---

## 3. Что исправил

1. **A-1 (Critical):** `next` 14.2.3 → **14.2.35** (и `eslint-config-next` в lockstep). Патч в той же 14.2.x ветке — без breaking-изменений. Закрывает **CVE-2025-29927** (обход middleware-авторизации через заголовок `x-middleware-subrequest`) и набор DoS/cache-poisoning CVE. Прод-уязвимости: 6 high → фактически закрыты для конфигурации приложения. `npm audit`: 13 → 10 (большинство остатка — dev-only).
   - *Защита уже была эшелонирована:* admin-страницы дополнительно гардятся в `admin/layout.tsx` (server-side `redirect`), а admin-API — через `requireAdmin`, поэтому реальный риск эксплуатации был ограничен ещё до бампа.

2. **B-1 (Medium):** добавлены security-заголовки в `next.config.js` (`headers()`): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security` (HSTS, preload), `Permissions-Policy`, `X-DNS-Prefetch-Control`; `poweredByHeader: false`.
   - **Намеренно НЕ выставлен** `X-Frame-Options` / `frame-ancestors`: сайт работает как Telegram Mini App внутри iframe Telegram — запрет фрейминга сломал бы WebApp.

---

## 4. Что проверено и признано корректным (без изменений)

- **Авторизация по коду:** HMAC-SHA256(secret, email:code), `crypto.randomInt`, `timingSafeEqual`, prod fail-fast без секрета, TTL, лимит попыток. Generic-ответ в `send-code` не раскрывает существование ника. Rate-limit IP+email.
- **requireAdmin** на всех admin-API (проверено сплошняком) + server-guard в `admin/layout.tsx`.
- **IDOR:** `orders/[id]` — проверка `user_id === user.id || is_admin` через RLS-сессию.
- **Вебхук pay4game:** проверка подписи по сырому телу, constant-time, идемпотентность (`recordWebhook`), выдача только `success && hold=0`. Сбой поставщика не роняет вебхук.
- **Подписи поставщиков:** Dessly/pay4game HMAC из env, fail-fast.
- **Telegram:** initData HMAC(`WebAppData`) + freshness `auth_date`; подписанные link-токены; webhook-секрет constant-time.
- **Деньги:** server-side пересчёт цен (orders/create, proxy/buy, steam/topup); CAS-списание баланса (защита от двойного списания/гонки); `idempotency_key` UNIQUE на прокси; компенсации/возвраты (`refundHold`, `proportionalRefund`); anti-self-referral.
- **Cron:** `Authorization: Bearer CRON_SECRET` || `x-vercel-cron`.
- **Секреты:** `.env*` в `.gitignore` (только `.env.example` в git); хардкод-секретов нет; service-role только server-side.
- **XSS:** все `dangerouslySetInnerHTML` — статичные SVG-иконки-константы, без user input.
- **dev-login:** заблокирован в prod, кроме явного `ALLOW_DEV_LOGIN=true`.
- **Логи:** код печатается только в dev (`!isProduction`); PII/секреты/токены не логируются.

---

## 5. Осталось (TODO)

- **C-1 (Low):** остаточные advisories Next (DoS/cache-poisoning/SSRF) в `npm audit` помечены как «fix только в Next 16». Это мажорный breaking-upgrade — **вне скоупа** финального аудита (риск поломать боевой app). Конфигурация приложения (App Router, `images.domains: []`, нет i18n Pages Router, нет untrusted remotePatterns) делает большинство из них неприменимыми. → Запланировать апгрейд на Next 15/16 отдельной задачей с регрессом.
- **C-2 (Low):** `esbuild`/`glob`/`minimatch`/`postcss` — транзитивные dev/build-зависимости (vitest/eslint), не попадают в прод-бандл. Фикс только через breaking `npm audit fix --force`. Не трогал.
- **B-2 (Medium):** убедиться, что `WEBHOOK_SECRET` Telegram задан в проде (иначе проверка секрета вебхука пропускается). Опционально — сделать секрет обязательным.

---

## 6. Нужно от владельца (секреты/прод/Supabase)

1. **Env прод (Vercel):** проверить заданность всех боевых секретов — `AUTH_SESSION_SECRET`, `RESEND_API_KEY`, `PAY4GAME_API_TOKEN/SECRET_KEY/PROJECT_ID`, `CRON_SECRET`, `TELEGRAM_*` (включая `WEBHOOK_SECRET`), `SUPABASE_SERVICE_ROLE_KEY`, px6/Dessly/AppRoute-ключи.
2. **`ALLOW_DEV_LOGIN`:** убедиться, что в проде НЕ установлен в `true` (иначе вход без письма).
3. **`WEBHOOK_SECRET` (Telegram):** задать и прописать в `setWebhook` (см. B-2).
4. **Supabase RLS:** подтвердить, что `supabase_security.sql` применён на проде (RLS на `auth_codes`, `payments`, `proxy_orders`, `orders`, `users`, баланс) — проверяется только с доступом к БД.
5. **Решение по Next 16** (C-1): согласовать окно на мажорный апгрейд + регресс.

---

## 7. Итог build/lint/type-check/tests

- `npm run build` — **зелёный** (exit 0), Next 14.2.35 + security-заголовки.
- `tsc --noEmit` — **чисто** (exit 0).
- `npm test` (vitest) — **392 passed / 29 files** (exit 0), после фиксов.
- `npm audit` — 13 → 10 (prod-only: 2; остаток — dev-only / только-мажор).
