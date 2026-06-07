/**
 * Публичные ссылки бренда: поддержка, отзывы, Telegram-канал.
 *
 * Единый источник для всего проекта:
 *   • сайт — промо-полоса в шапке, футер, кнопки;
 *   • Telegram-бот — кнопки меню («Поддержка», «Отзывы», «Канал»);
 *   • уведомления бота (запрос отзыва).
 *
 * Читаются из NEXT_PUBLIC_* (чтобы быть доступными в браузере, в клиентских
 * компонентах) с фолбэком на серверные имена (TELEGRAM_*) ради совместимости с
 * уже настроенными окружениями. Заполняются в .env (см. .env.example).
 *
 * ВАЖНО: значения NEXT_PUBLIC_* инлайнятся в клиентский бандл на этапе сборки,
 * поэтому к ним обращаемся полным литералом process.env.NEXT_PUBLIC_*, а не через
 * вычисляемое имя. Пустая строка = ссылка не задана (UI/бот скрывают элемент).
 */

/** Поддержка — ссылка на чат/бота в Telegram (или иной мессенджер). */
export const SUPPORT_URL =
  process.env.NEXT_PUBLIC_SUPPORT_URL ||
  process.env.TELEGRAM_SUPPORT_URL ||
  ''

/** Отзывы — канал/чат с отзывами покупателей. */
export const REVIEWS_URL =
  process.env.NEXT_PUBLIC_REVIEWS_URL ||
  process.env.TELEGRAM_REVIEWS_URL ||
  ''

/** Telegram-канал бренда (новости, дропы ключей, промокоды). */
export const TELEGRAM_CHANNEL_URL =
  process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL ||
  process.env.TELEGRAM_CHANNEL_URL ||
  ''

/** true, если ссылка непустая (есть что показать/открыть). */
export function hasLink(url: string | undefined | null): url is string {
  return typeof url === 'string' && url.trim().length > 0
}
