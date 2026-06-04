-- Миграция (Задача 2): надёжная рассылка через очередь + cron.
--
-- Добавляет к mailings счётчики прогресса и расширяет набор статусов, чтобы отправку можно было
-- ставить в очередь (queued), резюмировать (sending) и доводить до завершения cron'ом.
--
-- Применять через service-role (psql / Supabase SQL editor). Идемпотентна.

-- 1. Новые колонки прогресса.
ALTER TABLE mailings
  ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_count  INTEGER DEFAULT 0;

-- 2. Расширяем разрешённые статусы: добавляем 'queued' и 'failed'.
--    (старый CHECK допускал только draft/scheduled/sending/completed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mailings_status_check'
  ) THEN
    ALTER TABLE mailings DROP CONSTRAINT mailings_status_check;
  END IF;
  ALTER TABLE mailings
    ADD CONSTRAINT mailings_status_check
    CHECK (status IN ('draft', 'scheduled', 'queued', 'sending', 'completed', 'failed'));
END $$;

-- 3. Индекс под выборку незавершённых рассылок cron'ом.
CREATE INDEX IF NOT EXISTS idx_mailings_status ON mailings(status);

-- 4. Перезагрузка schema cache PostgREST (после DDL).
NOTIFY pgrst, 'reload schema';
