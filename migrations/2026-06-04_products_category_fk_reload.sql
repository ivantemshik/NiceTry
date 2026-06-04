-- Миграция (Задача 4): схема products↔categories и перезагрузка PostgREST schema cache.
--
-- Симптом: при редактировании товара в админке Supabase возвращал
--   "Could not find the 'categories' column of 'products' in the schema cache".
--
-- Причина (двойная):
--  1) Код PATCH /api/admin/products/[id] слал в .update() весь объект товара,
--     включая вложенный `categories` (из GET) — это поле НЕ колонка products.
--     => исправлено в коде (whitelist колонок). См. src/app/api/admin/products/[id]/route.ts
--  2) Дополнительно PostgREST мог не видеть FK-связь products.category_id -> categories.id
--     в schema cache (устаревший кэш), из-за чего падал и embed `categories(...)`.
--
-- Связь — ОДИН-КО-МНОГИМ через products.category_id FK (НЕ many-to-many).
-- Эта миграция гарантирует наличие FK с предсказуемым именем и перезагружает кэш.
--
-- Применять через service-role (psql / Supabase SQL editor). Идемпотентна.

-- 1. Гарантируем, что колонка существует (на случай старых БД).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id UUID;

-- 2. Гарантируем FK с явным именем (PostgREST использует его для embed).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_category_id_fkey'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Индекс под фильтрацию каталога по категории (Задача 3).
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- 4. Перезагрузка schema cache PostgREST (обязательно после DDL).
NOTIFY pgrst, 'reload schema';
