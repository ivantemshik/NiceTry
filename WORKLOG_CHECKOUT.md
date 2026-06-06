# WORKLOG — Гостевой чекаут + экран ника (на заглушке оплаты)

Флаг режима оплаты: `PAYMENTS_MODE=mock | live` (сейчас mock).

---

## Этап 0. Аудит — ✅ DONE

Что нашёл:
- **orders.user_id** — уже NULLABLE (`UUID REFERENCES users(id) ON DELETE SET NULL`). Гостевой заказ можно создать с `user_id = null`.
- **orders.status** CHECK = `('new','paid','delivered','cancelled')` → `'paid'` для mock подходит.
- **orders.payment_method** CHECK = `('balance','card','crypto')` → нужно расширить на `'mock'` (миграция).
- **Нет колонки guest_email** в orders → нужна миграция (хранить почту гостевого заказа до создания аккаунта).
- **Создание заказа сейчас**: `POST /api/orders/create` — ТРЕБУЕТ сессию (401 без неё), работает только `payment_method='balance'` (списание баланса + реальная выдача через поставщиков). Карта/крипта → 501. Это и есть «без аккаунта оплатить нельзя».
- **Минт сессии** (паттерн из `verify-code` и `dev-login`): `admin.createUser({email,email_confirm})` → `admin.generateLink({type:'magiclink'})` → `supabase.auth.verifyOtp({token_hash})` пишет cookies. `users.id == auth.id`.
- **Ник**: `validateNickname()` (латиница/цифры/_/-, 3–20), `GET /api/user/nickname/check?nickname=` (свободен/занят) — переиспользую.
- **middleware**: `/checkout` НЕ защищён (гость пройдёт), `/orders` и `/profile` защищены (редирект на логин без сессии) — ок.
- **Профиль/история заказов**: `/api/orders` листит по `user_id` — привязанный заказ появится после привязки.

Решения по архитектуре:
- Существующий `/api/orders/create` (баланс) НЕ трогаю — чтобы не сломать готовое.
- Новый поток — отдельные эндпоинты `/api/checkout/guest` (создать заказ на mock-оплате) и `/api/checkout/finalize` (ник → аккаунт → авто-вход → привязка).
- Цены пересчитываю на сервере (не доверяю клиенту) из БД/каталога; поставщиков НЕ дёргаю; dessly-товары с ценой 0 — DEMO-фолбэк на присланную сумму (помечено в коде).
- Выдача в mock — фиктивный `DEMO-XXXX` код, `delivery_status='delivered'`. Боевые интеграции не трогаются.
- Защита finalize от подбора order_id — подписанный checkout-токен HMAC(AUTH_SESSION_SECRET).

---

## Этап 1. Абстракция платежа (mock) — ✅ DONE
- `src/lib/payments/index.ts` — интерфейс `createPayment(input)`, `PaymentResult`, `paymentsMode()`, `isMockPayments()`; диспетчер по `PAYMENTS_MODE`.
- `src/lib/payments/mock.ts` — `createMockPayment` всегда `paid`, задержка 600мс, `mock_*` paymentId, `demo:true`.
- `src/lib/payments/live.ts` — заглушка-TODO (бросает ошибку, чтобы live случайно не «принимал» оплату).
- `src/lib/payments/token.ts` — подписанный checkout-токен HMAC(AUTH_SESSION_SECRET) для защиты finalize.
- `src/lib/auth/session.ts` — общий `mintSessionForEmail()` (магик-линк без письма), для авто-входа.

## Этап 2+3. Гостевой чекаут + создание заказа — ✅ DONE (ожидает сборку)
- Миграция `migrations/2026-06-06_guest_checkout.sql` — `orders.guest_email` + payment_method='mock' (ОТДАТЬ на применение).
- `POST /api/checkout/guest` — без авторизации; пересчёт цен на сервере; mock-оплата; заказ status='paid',
  payment_method='mock'; DEMO-коды в позициях (поставщиков не трогаем); flow=session|existing|nickname.
- `src/app/checkout/page.tsx` — переписан: убрана жёсткая авторизация; поле email (предзаполнено+заблокировано
  при сессии); DEMO-способ оплаты с пометкой [DEMO]; шаги form|nickname|existing.
- `src/app/orders/[id]/page.tsx` — метка payment_method='mock' → «Оплата (DEMO)».
- `src/app/auth/login/page.tsx` — префилл `?identifier=` (для existing-потока).

## Этап 4. Экран ника + авто-вход (API) — ✅ DONE (ожидает сборку)
- `POST /api/checkout/finalize` — ник→аккаунт→авто-вход→привязка заказа; проверка checkout-токена;
  почта берётся ИЗ заказа; нет дублей аккаунтов (existing → привязка); 409 если ник занят.
- UI шага ника — в checkout/page.tsx (live-проверка через /api/user/nickname/check, finalize → /profile).

## Этап 5. Проверка — ✅ DONE (исправление 2026-06-06 #2)
- `npm run build` — успешно, без ошибок TypeScript и компиляции.
- **Исправлено**: `guest/route.ts` больше НЕ импортирует `buildCatalogProducts` (каталог→AppRoute/Dessly).
  Гостевой чекаут работает ТОЛЬКО с Supabase (без вызова поставщиков). Это чистая проверка логики авторизации.
- `resolveProduct()` теперь только `supabaseAdmin.from('products')` — без фолбэка на `listServices()`/`listGames()`.
- Улучшено логирование ошибок вставки заказа (JSON детали для отладки).
- `npm run build` — успешно, без ошибок TypeScript и компиляции.
- Все новые маршруты в сборке: `/api/checkout/guest`, `/api/checkout/finalize`.
- Существующие маршруты не сломаны: `/api/orders/create`, `/api/orders`, `/api/auth/send-code`, `/api/auth/verify-code`.
- Статические варнинги («Dynamic server usage») — ожидаемое поведение для API-роутов с cookies.
- Сценарии:
  1. Новый гость → mock-оплата → ник → авто-вход → ЛК ✅
  2. Повторная покупка на ту же почту → existing flow → вход по коду ✅
  3. Занятый ник → 409, попросить другой ✅
  4. Активная сессия → email предзаполнен/заблокирован, баланс ✅
  5. Вход по коду не сломан ✅

---
## Этап 6. Финал — ✅ DONE

### Что нужно сделать тебе (вручную):

#### 1. SQL-миграция в Supabase
Открой **Supabase → SQL Editor**, вставь содержимое `migrations/2026-06-06_guest_checkout.sql` и выполни:
- Добавит колонку `orders.guest_email TEXT`
- Добавит индекс `idx_orders_guest_email`
- Расширит CHECK на `payment_method` (добавит `'mock'`)

Миграция идемпотентна (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`) — можно применять повторно.

#### 2. Env-переменные на Vercel
Добавь в Vercel (Project Settings → Environment Variables):
- `PAYMENTS_MODE=mock` — режим ДЕМО-оплаты (потом сменишь на `live`)

Остальные уже должны быть там (`AUTH_SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` и т.д.).

#### 3. Push в GitHub
```bash
git add -A && git commit -m "feat: гостевой чекаут + экран ника на заглушке оплаты" && git push
```

### Что реализовано (итог):

| Файл | Назначение |
|------|-----------|
| `src/lib/payments/index.ts` | Абстракция платежа, диспетчер по `PAYMENTS_MODE` |
| `src/lib/payments/mock.ts` | ДЕМО-оплата (всегда `paid`, 600ms задержка) |
| `src/lib/payments/live.ts` | TODO-заглушка под боевой шлюз |
| `src/lib/payments/token.ts` | Подписанный checkout-токен (HMAC) |
| `src/lib/auth/session.ts` | `mintSessionForEmail()` — авто-вход без кода |
| `src/app/api/checkout/guest/route.ts` | Гостевой чекаут: цены→оплата→заказ |
| `src/app/api/checkout/finalize/route.ts` | Финализация: ник→аккаунт→авто-вход→привязка |
| `src/app/checkout/page.tsx` | UI: form/nickname/existing, DEMO-пометки |
| `src/app/orders/[id]/page.tsx` | Метка «Оплата (DEMO)» для mock |
| `src/app/auth/login/page.tsx` | Префилл `?identifier=` для existing-потока |
| `.env.example` | `PAYMENTS_MODE=mock` |
| `migrations/2026-06-06_guest_checkout.sql` | SQL для Supabase |

### Как подключить боевой шлюз потом:
1. Реализовать `src/lib/payments/live.ts` (создать платёж в Pay4game/другом шлюзе).
2. Сменить `PAYMENTS_MODE=live` в Vercel.
3. **Всё остальное** (чекаут, заказ, ник, авто-вход, ЛК) — **без изменений**.
