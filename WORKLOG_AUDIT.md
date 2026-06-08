# WORKLOG — Финальный аудит NiceTry

Формат: блок → находка → severity → действие.

## Старт
- Проект найден: `C:\Users\user\Desktop\NiceTry`. Next 14.2.3, Supabase, без WORKLOG_AUDIT (свежий старт).
- Запущены базовые проверки: build / lint / type-check / npm audit (в фоне).

## Базовые проверки
- `tsc --noEmit` → EXIT 0, чисто.
- `npm audit` → 13 уязв.: 2 critical, 6 high, 5 moderate. Нужны имена пакетов (см. ниже). Severity: HIGH/MED.

## Блок B — Кибербезопасность (просмотр кода)
- `lib/auth/admin.ts` requireAdmin: сессия→is_admin через service-role→ok. ✅ ОК.
- `lib/auth/codes.ts`: HMAC-SHA256(secret, email:code), randomInt, timingSafeEqual, prod fail-fast если нет секрета. ✅ ОК.
- `middleware.ts`: защита /profile,/orders,/balance,/admin + проверка is_admin. ✅ ОК. (Прим.: повторная проверка is_admin в каждом admin API через requireAdmin — defense-in-depth, ОК.)
- `pay4game/webhook`: raw body→verifyWebhookSignature(constant-time)→идемпотентность(recordWebhook)→выдача только success&&hold=0. ✅ ОК.
- `payments/pay4game.ts`: HMAC подписи, timingSafeEqual на вебхуке, ключи из env fail-fast. ✅ ОК.
- `payments/fulfillment.ts`: идемпотентная выдача (CAS new→paid), сбой поставщика не роняет вебхук. ✅ ОК.
- `proxy/buy`: server-side price, idempotency_key UNIQUE, CAS-холд баланса, refundHold-компенсация. ✅ ОК.
- `telegram/verify.ts`: initData HMAC(WebAppData), auth_date freshness, подписанные link-токены. ✅ ОК.
- `auth/dev-login`: заблокирован в prod кроме ALLOW_DEV_LOGIN=true. ⚠️ см. TODO (риск если флаг включат на проде).
- crons (dessly/reconcile, telegram/mailings): Bearer CRON_SECRET || x-vercel-cron. ✅ ОК (x-vercel-cron Vercel срезает извне — LOW).
- `auth/send-code`: rate-limit IP+email(cooldown/hourly), generic-ответ (не раскрывает существование ника). ✅ ОК.
- `orders/create`: server-side пересчёт цен, CAS-списание, возвраты, anti-self-referral. ✅ ОК.

## Находки и фиксы
- **A-1 [CRITICAL→fixed] Next.js 14.2.3 → 14.2.35.** CVE-2025-29927 (обход авторизации в middleware) + куча DoS/cache-poisoning. Бамп патча в той же 14.2.x ветке (без breaking). `npm i next@14.2.35 eslint-config-next@14.2.35`. Audit: 13→10 уязв., prod-only: 2.
- **B-1 [MEDIUM→fixed] Нет security-заголовков.** Добавил в next.config.js: X-Content-Type-Options=nosniff, Referrer-Policy, HSTS, Permissions-Policy, X-DNS-Prefetch-Control, poweredByHeader=false. X-Frame-Options НЕ ставил намеренно (ломает Telegram Mini App iframe).
- `orders/[id]`: IDOR-проверка order.user_id===user.id || is_admin, через RLS-сессию. ✅ ОК.
- Все admin API-роуты → requireAdmin (проверено find -L). ✅ ОК.
- `admin/layout.tsx`: server-side guard (redirect если !is_admin) — defense-in-depth поверх middleware (важно на фоне CVE-2025-29927). ✅ ОК.
- dangerouslySetInnerHTML (page.tsx, Header.tsx): только статичные SVG-иконки-константы, без user input. ✅ Не XSS.
- `.env*` в .gitignore (только .env.example в git). Хардкод-секретов нет. ✅ ОК.
- `resend.ts:107` логирует код — но строго `!isProduction`; в prod без ключа throw. ✅ Безопасно.
- `telegram/webhook`: secret constant-time. ⚠️ если WEBHOOK_SECRET пуст — проверка пропускается (TODO: требовать секрет).
- rate-limit.ts: in-memory (не делится между serverless-инстансами) — осознанный компромисс, документирован. LOW (для денег основная защита — подписи/CAS).

## Осталось (TODO)
- Next residual advisories (DoS/cache-poisoning) закрываются только мажором Next 16 — вне скоупа (сломает app). Конфиг приложения (App Router, images.domains=[]) делает большинство неприменимыми. → решение владельца.
- esbuild/glob/minimatch/postcss — dev/build-only зависимости (vitest/eslint). Фикс только через breaking. Не трогаю.
- WEBHOOK_SECRET / ALLOW_DEV_LOGIN — конфиг прода (раздел «Нужно от владельца»).

## Финал
- `npm run build` → EXIT 0 (зелёный, Next 14.2.35 + security-заголовки).
- `npm test` → 392 passed / 29 files, EXIT 0.
- `tsc --noEmit` → EXIT 0.
- Отчёт собран в FINAL_AUDIT_REPORT.md. Critical (A-1) исправлен, Medium (B-1) исправлен, остальное — TODO/решение владельца. АУДИТ ЗАВЕРШЁН.
