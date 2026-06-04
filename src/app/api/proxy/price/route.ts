import { NextRequest, NextResponse } from 'next/server'
import { getPrice, getCount, isValidVersion, Px6Error, type ProxyVersion } from '@/lib/px6'
import { loadProxySettings, proxyPriceRub, validateProxyRequest } from '@/lib/proxy-pricing'

// Цена зависит от админских настроек (наценка/курс) и наличия у px6 — всегда живой ответ.
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/proxy/price?version=&count=&period=&country=
 *
 * Считает ИТОГОВУЮ цену в ₽ на сервере (наценка из proxy_settings, НЕ из фронта) и проверяет
 * наличие. Используется витриной для динамического показа цены (debounce). Это НЕ покупка —
 * деньги не двигаются. Покупка отдельно пересчитывает цену перед списанием (/api/proxy/buy).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const version = Number(sp.get('version'))
    const count = Number(sp.get('count'))
    const period = Number(sp.get('period'))
    const country = (sp.get('country') || '').trim().toLowerCase()

    if (!isValidVersion(version)) {
      return NextResponse.json({ error: 'Некорректная версия прокси' }, { status: 400 })
    }
    if (!country) {
      return NextResponse.json({ error: 'Не указана страна' }, { status: 400 })
    }

    const settings = await loadProxySettings()
    if (!settings.is_enabled) {
      return NextResponse.json({ error: 'Покупка прокси временно недоступна' }, { status: 503 })
    }

    const valid = validateProxyRequest(count, period, settings)
    if (!valid.ok) {
      return NextResponse.json({ error: valid.error }, { status: 400 })
    }

    // Наличие: сколько прокси доступно к покупке у px6 по стране/версии.
    const available = await getCount(country, version as ProxyVersion)
    if (available < count) {
      return NextResponse.json({
        available,
        inStock: false,
        price: null,
        error: available <= 0 ? 'Нет в наличии' : `Доступно только ${available}`,
      })
    }

    const px6 = await getPrice(count, period, version as ProxyVersion)
    const priceRub = proxyPriceRub(px6.price, px6.currency, settings.markup_percent, settings.usd_to_rub_rate)
    const priceSingleRub = proxyPriceRub(
      px6.priceSingle,
      px6.currency,
      settings.markup_percent,
      settings.usd_to_rub_rate
    )

    return NextResponse.json({
      inStock: true,
      available,
      count,
      period,
      version,
      country,
      price: priceRub,
      price_single: priceSingleRub,
      currency: 'RUB',
    })
  } catch (e) {
    if (e instanceof Px6Error) {
      return NextResponse.json({ error: e.message }, { status: 502 })
    }
    console.error('[proxy/price] unexpected error:', e)
    return NextResponse.json({ error: 'Не удалось рассчитать цену' }, { status: 500 })
  }
}
