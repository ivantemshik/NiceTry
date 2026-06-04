import { NextRequest, NextResponse } from 'next/server'
import { getCountry, isValidVersion, PROXY_VERSION_LABELS, Px6Error, type ProxyVersion } from '@/lib/px6'
import { loadProxySettings } from '@/lib/proxy-pricing'

// Конфиг зависит от админских настроек (proxy_settings) и наличия у px6 — всегда живой ответ.
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/proxy/config[?version=]
 *
 * Конфиг для витрины покупки прокси: доступные версии, сроки, лимиты, флаг включения и —
 * если передан version — список стран под эту версию (из px6 getCountry). Без секретов.
 */
export async function GET(request: NextRequest) {
  try {
    const settings = await loadProxySettings()
    const versionParam = Number(request.nextUrl.searchParams.get('version'))

    let countries: string[] | undefined
    if (isValidVersion(versionParam)) {
      countries = await getCountry(versionParam as ProxyVersion)
    }

    return NextResponse.json({
      enabled: settings.is_enabled,
      versions: Object.entries(PROXY_VERSION_LABELS).map(([value, label]) => ({
        value: Number(value),
        label,
      })),
      periods: settings.allowed_periods,
      max_count: settings.max_count,
      countries,
    })
  } catch (e) {
    if (e instanceof Px6Error) {
      return NextResponse.json({ error: e.message }, { status: 502 })
    }
    console.error('[proxy/config] unexpected error:', e)
    return NextResponse.json({ error: 'Не удалось загрузить конфигурацию' }, { status: 500 })
  }
}
