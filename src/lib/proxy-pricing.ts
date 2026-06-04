// Ценообразование прокси px6 (бек). Цена ВСЕГДА считается здесь, на сервере, перед покупкой —
// фронту доверять нельзя. Логика: берём цену у px6 (в его валюте RUB/USD), при USD переводим в ₽
// по курсу из настроек, затем накручиваем наценку и округляем ВВЕРХ (ceil), как в lib/catalog.ts.

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ProxySettings } from '@/types'
import type { Px6Currency } from '@/lib/px6'

/** Дефолты на случай отсутствия строки proxy_settings (или недоступной БД). */
export const DEFAULT_PROXY_SETTINGS: ProxySettings = {
  markup_percent: 30,
  usd_to_rub_rate: 100,
  is_enabled: true,
  allowed_periods: [7, 14, 30, 90],
  max_count: 50,
}

/**
 * Итоговая цена в ₽ для витрины NiceTry.
 * price_rub = ceil( px6_price_в_₽ × (100 + markup%) / 100 ), где px6_price_в_₽ — цена px6,
 * переведённая в рубли (RUB как есть; USD × курс). Целочисленный множитель (как priceRub).
 */
export function proxyPriceRub(
  px6Price: number,
  px6Currency: Px6Currency,
  markupPercent: number,
  usdToRubRate: number
): number {
  if (!Number.isFinite(px6Price) || px6Price <= 0) return 0
  const inRub = px6Currency === 'USD' ? px6Price * usdToRubRate : px6Price
  const markup = Number.isFinite(markupPercent) && markupPercent > 0 ? markupPercent : 0
  return Math.ceil((inRub * (100 + markup)) / 100)
}

/** Настройки прокси из БД (admin-editable) с фолбэком на дефолты. */
export async function loadProxySettings(): Promise<ProxySettings> {
  try {
    const { data } = await supabaseAdmin
      .from('proxy_settings')
      .select('markup_percent, usd_to_rub_rate, is_enabled, allowed_periods, max_count')
      .eq('id', 1)
      .maybeSingle()
    if (!data) return { ...DEFAULT_PROXY_SETTINGS }
    return {
      markup_percent: Number(data.markup_percent ?? DEFAULT_PROXY_SETTINGS.markup_percent),
      usd_to_rub_rate: Number(data.usd_to_rub_rate ?? DEFAULT_PROXY_SETTINGS.usd_to_rub_rate),
      is_enabled: data.is_enabled ?? DEFAULT_PROXY_SETTINGS.is_enabled,
      allowed_periods:
        Array.isArray(data.allowed_periods) && data.allowed_periods.length
          ? data.allowed_periods.map(Number)
          : DEFAULT_PROXY_SETTINGS.allowed_periods,
      max_count: Number(data.max_count ?? DEFAULT_PROXY_SETTINGS.max_count),
    }
  } catch {
    return { ...DEFAULT_PROXY_SETTINGS }
  }
}

/** Валидация запрошенных параметров против настроек. Возвращает причину отказа или ok. */
export function validateProxyRequest(
  count: number,
  period: number,
  settings: ProxySettings
): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(count) || count < 1) {
    return { ok: false, error: 'Некорректное количество' }
  }
  if (count > settings.max_count) {
    return { ok: false, error: `Максимум ${settings.max_count} прокси за одну покупку` }
  }
  if (!Number.isInteger(period) || period < 1) {
    return { ok: false, error: 'Некорректный срок' }
  }
  if (!settings.allowed_periods.includes(period)) {
    return { ok: false, error: `Доступные сроки (дней): ${settings.allowed_periods.join(', ')}` }
  }
  return { ok: true }
}
