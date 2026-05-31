-- ============================================================
-- NiceTry — усиление безопасности БД (RLS / права доступа)
-- Применять ПОСЛЕ supabase_schema.sql. Идемпотентно (можно запускать повторно).
--
-- Модель доступа:
--   • Публичное чтение: только активные строки витрины (categories, products, banners, user_statuses).
--   • Приватное чтение «только своё»: users, orders, order_items, balance_transactions,
--     referral_earnings, reviews (уже настроено в основной схеме).
--   • Полностью закрытые от анонимов/пользователей: product_keys (voucher-коды!), promo_codes,
--     referral_settings, utm_*, mailings. Доступ к ним — ТОЛЬКО через service-role (серверные
--     роуты после проверки прав), который обходит RLS.
--   • Все мутации витрины/заказов идут через service-role в серверных API-роутах,
--     поэтому INSERT/UPDATE-политик для anon/authenticated намеренно нет.
-- ============================================================

-- Включаем RLS на таблицах, где он не был включён.
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_keys      ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_statuses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm_campaigns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm_clicks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailings          ENABLE ROW LEVEL SECURITY;

-- ---- Публичное чтение активных строк витрины ----

DROP POLICY IF EXISTS categories_public_read ON categories;
CREATE POLICY categories_public_read ON categories
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS products_public_read ON products;
CREATE POLICY products_public_read ON products
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS banners_public_read ON banners;
CREATE POLICY banners_public_read ON banners
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS user_statuses_public_read ON user_statuses;
CREATE POLICY user_statuses_public_read ON user_statuses
  FOR SELECT USING (TRUE);

-- ---- Полностью закрытые таблицы ----
-- RLS включён, политик для anon/authenticated НЕТ → доступ только service-role.
-- product_keys: критично — содержит выданные voucher-коды.
-- promo_codes: проверяется на сервере (service-role), чтобы нельзя было перебирать коды.
-- referral_settings / utm_* / mailings: только админ через серверные роуты.
-- (явные политики не создаём — отсутствие политики = deny для обычных ролей)

-- ============================================================
-- Недостающая INSERT-политика для users (на случай прямого создания профиля
-- клиентским сессионным клиентом). Профиль создаётся серверным роутом через
-- service-role, поэтому политика опциональна, но безопасна: позволить вставку
-- ТОЛЬКО собственной строки.
-- ============================================================
DROP POLICY IF EXISTS users_insert_self ON users;
CREATE POLICY users_insert_self ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- ВАЖНО про права колонок: чтобы пользователь не мог поднять себе is_admin или
-- произвольно менять balance напрямую через PATCH сессионным клиентом, политика
-- users_update_own ограничивается так, чтобы запрещать изменение защищённых полей.
-- В Postgres RLS нельзя «по колонкам» в одной политике, поэтому защищаемся через
-- триггер, откатывающий изменение is_admin/balance/status_id не-сервисными ролями.
-- ============================================================
CREATE OR REPLACE FUNCTION protect_sensitive_user_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Сервисная роль (service_role) обходит проверку — серверные роуты доверенные.
  IF current_setting('request.jwt.claim.role', TRUE) IS DISTINCT FROM 'service_role'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NEW.is_admin   IS DISTINCT FROM OLD.is_admin   THEN NEW.is_admin   := OLD.is_admin;   END IF;
    IF NEW.balance    IS DISTINCT FROM OLD.balance    THEN NEW.balance    := OLD.balance;    END IF;
    IF NEW.status_id  IS DISTINCT FROM OLD.status_id  THEN NEW.status_id  := OLD.status_id;  END IF;
    IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN NEW.referral_code := OLD.referral_code; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS users_protect_fields ON users;
CREATE TRIGGER users_protect_fields BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION protect_sensitive_user_fields();
