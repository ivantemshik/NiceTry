-- Миграция (аудит бота, Блок 6): атомарный дедуп запроса отзыва.
--
-- Проблема: cron /api/telegram/cron/review-requests делает SELECT-существует → INSERT-маркер
-- неатомарно. Две пересекающиеся выполнения (Vercel Cron + ручной вызов) могли пройти проверку
-- обе и отправить уведомление об отзыве дважды.
--
-- Решение: UNIQUE(order_id) на reviews — второй INSERT маркера падает с 23505, и роут его
-- пропускает (skipped++). Один отзыв/маркер на заказ.
--
-- Применять через service-role (psql / Supabase SQL editor). Идемпотентна (IF NOT EXISTS).
-- Если в reviews уже есть дубли по order_id — сначала удалить лишние, иначе создание индекса упадёт.

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_order ON reviews(order_id);
