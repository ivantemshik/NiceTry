-- Боевая выдача Dessly (и любых instant-товаров с формой) через ОТЛОЖЕННЫЙ платёж pay4game.
--
-- Применить в Supabase → SQL Editor. Идемпотентно (можно прогонять повторно).
--
-- Зачем: при оплате с баланса выдача синхронная — form_data позиции (invite-ссылка Steam, регион,
-- издание/package_id для Dessly) есть прямо в запросе. При оплате через pay4game выдача происходит
-- ПОЗЖЕ, в вебхуке status — поэтому form_data нужно сохранить на момент чекаута, иначе вебхуку
-- нечем выдать гифт. Колонка nullable: для товаров без формы (ключи/AppRoute) остаётся NULL.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS form_data JSONB;
