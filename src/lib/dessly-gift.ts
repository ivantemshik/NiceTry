// Чистые хелперы экрана «Отправь игру в стим» (Dessly). Без I/O — тестируются изолированно.
//
// Модель интеграции (см. WORKLOG, Блок B1): по доступной документации Dessly — REST/JSON API
// без готового встраиваемого окна. Поэтому основной путь — нативный экран на данных Dessly
// (ПРИОРИТЕT 2). Заложен upgrade-path: если задан DESSLY_WIDGET_URL (заказчик подтвердит
// hosted-окно/виджет), точка входа открывает его как embed/openLink без переделки.

/**
 * Комиссия сервиса по умолчанию (%), показывается на экране отправки игры (на скрине — 4%).
 * НЕ хардкод в компоненте: значение отдаётся эндпоинтом /api/dessly/config (с возможным
 * override через env), а админ-настройка комиссии добавляется в Блоке B4.
 */
export const DESSLY_SERVICE_COMMISSION_PERCENT_DEFAULT = 4

/** Регионы аккаунта Steam для отправки гифта (как на скринах Dessly). */
export const DESSLY_REGIONS = ['RU', 'CN', 'KR', 'ID', 'VN', 'IN', 'TR', 'UA', 'KZ'] as const

/**
 * Валидация ссылки-приглашения Steam: https://s.team/p/<code> или
 * https://steamcommunity.com/p/<code>. Используется фолбэк-экраном отправки игры (Блок B2)
 * и перед боевым sendGift, чтобы не отправлять заведомо некорректную ссылку.
 */
export const STEAM_INVITE_RE = /^https:\/\/(s\.team\/p\/[A-Za-z0-9_-]+|steamcommunity\.com\/p\/[A-Za-z0-9_-]+)(\/[A-Za-z0-9_-]+)?\/?$/

export function isSteamInviteUrl(url: string): boolean {
  return STEAM_INVITE_RE.test((url || '').trim())
}

/**
 * Итог к оплате за отправку игры: цена позиции (₽) + комиссия сервиса (%).
 * Комиссия округляется до рубля; итог = цена + комиссия. Возвращает обе величины для UI.
 */
export function computeGiftTotal(
  priceRub: number,
  commissionPercent: number
): { price: number; commission: number; total: number } {
  const price = Math.max(0, Math.round(Number(priceRub) || 0))
  const pct = Number.isFinite(commissionPercent) && commissionPercent > 0 ? commissionPercent : 0
  const commission = Math.round((price * pct) / 100)
  return { price, commission, total: price + commission }
}

export type SendGameMode = { mode: 'embed'; url: string } | { mode: 'native' }

/**
 * Определяет режим точки входа «Отправь игру в стим»:
 *  - embed: если задан валидный http(s) URL готового окна/виджета Dessly (DESSLY_WIDGET_URL);
 *  - native: иначе — собственный тонкий экран на данных Dessly API (текущий основной путь).
 */
export function resolveSendGameMode(widgetUrl?: string | null): SendGameMode {
  const url = (widgetUrl || '').trim()
  const PLACEHOLDERS = new Set(['', 'your_dessly_widget_url', 'TODO', 'changeme'])
  if (!PLACEHOLDERS.has(url) && /^https?:\/\//i.test(url)) {
    return { mode: 'embed', url }
  }
  return { mode: 'native' }
}
