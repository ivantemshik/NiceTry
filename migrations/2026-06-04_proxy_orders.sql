-- Миграция (px6 Этап 2): заказы прокси px6 (proxy6).
--
-- Таблица proxy_orders хранит покупки прокси через px6: параметры заказа, внутреннюю цену
-- (списанную с баланса пользователя, в ₽), цену/валюту у поставщика px6, выданные прокси (jsonb)
-- и статус. Связана с orders (umbrella-заказ для единой истории баланса) и users.
--
-- Деньги: списание с баланса и запись в balance_transactions делает серверный роут
-- /api/proxy/buy через service-role ПОСЛЕ успешного buy у px6 (см. src/app/api/proxy/buy).
-- Идемпотентность: idempotency_key UNIQUE — повторный клик не создаёт второй заказ/списание.
--
-- Применять через service-role (psql / Supabase SQL editor). Идемпотентна.

-- 1. Таблица заказов прокси.
CREATE TABLE IF NOT EXISTS proxy_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  -- umbrella-заказ в orders (для единой истории/баланса). Может быть NULL, если прокси-заказ
  -- ведётся отдельно от orders.
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,

  -- Параметры покупки.
  version         INTEGER NOT NULL CHECK (version IN (3, 4, 5, 6)), -- 3=IPv4 Shared,4=IPv4,5=MTProto,6=IPv6
  country         TEXT NOT NULL,
  count           INTEGER NOT NULL CHECK (count > 0),
  period          INTEGER NOT NULL CHECK (period > 0),              -- срок в днях
  proxy_type      TEXT,                                             -- http | socks (опц.)

  -- Деньги.
  price_internal  DECIMAL(10, 2) NOT NULL CHECK (price_internal >= 0), -- списано с пользователя, ₽
  px6_price       DECIMAL(12, 4),                                   -- цена у px6 (его валюта)
  px6_currency    TEXT CHECK (px6_currency IN ('RUB', 'USD')),

  -- Идентификаторы поставщика + выданные прокси.
  px6_order_id    TEXT,
  proxies         JSONB,                                           -- [{id,ip,host,port,user,pass,type,country,date,date_end,active}]

  -- Жизненный цикл заказа.
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),

  -- Идемпотентность покупки (кладётся также в descr запроса buy у px6).
  idempotency_key TEXT UNIQUE,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proxy_orders_user    ON proxy_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_proxy_orders_status  ON proxy_orders(status);
CREATE INDEX IF NOT EXISTS idx_proxy_orders_created ON proxy_orders(created_at DESC);

-- 2. RLS: пользователь видит ТОЛЬКО свои прокси-заказы. Все записи идут через service-role
--    (серверный роут), как и в orders/balance_transactions — клиент таблицу не мутирует.
ALTER TABLE proxy_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proxy_orders_select_own ON proxy_orders;
CREATE POLICY proxy_orders_select_own ON proxy_orders
  FOR SELECT USING (auth.uid() = user_id);

-- 3. Триггер обновления updated_at.
CREATE OR REPLACE FUNCTION set_proxy_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS proxy_orders_updated_at ON proxy_orders;
CREATE TRIGGER proxy_orders_updated_at BEFORE UPDATE ON proxy_orders
  FOR EACH ROW EXECUTE FUNCTION set_proxy_orders_updated_at();

-- 4. Настройки прокси (наценка/курс — редактируются в админке, НЕ хардкод).
--    Один ряд-синглтон (id=1). Наценка в %, курс USD→RUB (на случай, если px6 в USD).
CREATE TABLE IF NOT EXISTS proxy_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  markup_percent  DECIMAL(5, 2) NOT NULL DEFAULT 30 CHECK (markup_percent >= 0),
  usd_to_rub_rate DECIMAL(8, 2) NOT NULL DEFAULT 100 CHECK (usd_to_rub_rate > 0),
  -- Включает/выключает блок покупки прокси на витрине.
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  -- Допустимые сроки (дни), показываемые на витрине.
  allowed_periods INTEGER[] NOT NULL DEFAULT ARRAY[7, 14, 30, 90],
  -- Максимальное количество прокси за одну покупку (анти-абуз).
  max_count       INTEGER NOT NULL DEFAULT 50 CHECK (max_count > 0),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO proxy_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Настройки читаются всеми (наценка не секрет), пишутся только через service-role (админка).
ALTER TABLE proxy_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proxy_settings_public_read ON proxy_settings;
CREATE POLICY proxy_settings_public_read ON proxy_settings
  FOR SELECT USING (TRUE);

-- 5. Перезагрузка schema cache PostgREST (после DDL).
NOTIFY pgrst, 'reload schema';
