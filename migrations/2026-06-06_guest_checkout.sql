-- Гостевой чекаут (mock-оплата): хранить почту заказа до создания аккаунта
-- и разрешить payment_method='mock' для ДЕМО-оплаты.
--
-- Применить в Supabase → SQL Editor. Идемпотентно (можно прогонять повторно).

-- 1) Почта гостевого заказа. user_id уже nullable (ON DELETE SET NULL), поэтому
--    гостевой заказ создаётся с user_id=NULL и guest_email=<почта с чекаута>.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_email TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_guest_email ON orders(guest_email);

-- 2) Разрешить payment_method='mock' (ДЕМО-оплата). Пересоздаём CHECK-ограничение.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('balance', 'card', 'crypto', 'mock'));
