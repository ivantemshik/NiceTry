// Конфигурация Telegram-бота и Mini App.
//
// Все значения читаются ТОЛЬКО на сервере (без префикса NEXT_PUBLIC), кроме username,
// который безопасно показать клиенту (он публичен). Токен бота — секрет, в браузер не попадает.

/** Токен бота (секрет). Пустая строка в окружениях без Telegram (часть тестов). */
export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''

/** Публичный username бота (без @). Используется для deep-link t.me/<username>?start=... */
export const BOT_USERNAME =
  process.env.TELEGRAM_BOT_USERNAME ||
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
  ''

/** URL, который открывается в Mini App (витрина сайта). */
export const WEBAPP_URL =
  process.env.TELEGRAM_WEBAPP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:3000'

/**
 * Секрет для заголовка X-Telegram-Bot-Api-Secret-Token у webhook.
 * Telegram присылает его в каждом апдейте — так мы убеждаемся, что запрос пришёл от Telegram,
 * а не от постороннего, узнавшего URL вебхука. Фолбэк выводится из токена бота детерминированно,
 * чтобы set-webhook и проверка совпали даже без явного TELEGRAM_WEBHOOK_SECRET.
 */
export const WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET ||
  (BOT_TOKEN ? `whk_${BOT_TOKEN.split(':')[0]}` : '')

// Публичные ссылки бренда (поддержка, отзывы, канал) живут в едином модуле
// src/lib/links.ts — он читает их из env и безопасен для клиента. Реэкспортируем
// для серверного кода бота/уведомлений, чтобы не плодить источники правды.
export { SUPPORT_URL, REVIEWS_URL, TELEGRAM_CHANNEL_URL } from '@/lib/links'

/** Срок жизни токена привязки аккаунта (15 минут). */
export const LINK_TOKEN_TTL_SEC = 15 * 60

/** Максимальный возраст initData для авторизации Mini App (24 часа). */
export const INITDATA_MAX_AGE_SEC = 24 * 60 * 60

/** Через сколько часов после выдачи просить отзыв (ТЗ §5.8). Настраивается env'ом. */
export const REVIEW_REQUEST_DELAY_HOURS = Number(process.env.TELEGRAM_REVIEW_DELAY_HOURS || 24)

/** Секрет для cron-эндпоинтов (Vercel Cron / ручной вызов). */
export const CRON_SECRET = process.env.CRON_SECRET || WEBHOOK_SECRET

/** Синтетический email для пользователей, пришедших впервые через Telegram. */
export function syntheticEmail(telegramId: number | string): string {
  return `tg${telegramId}@telegram.nicetry.local`
}

export function isConfigured(): boolean {
  return Boolean(BOT_TOKEN)
}
