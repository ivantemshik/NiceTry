import { NextResponse } from 'next/server'
import {
  DESSLY_SERVICE_COMMISSION_PERCENT_DEFAULT,
  DESSLY_REGIONS,
  resolveSendGameMode,
} from '@/lib/dessly-gift'

/**
 * GET /api/dessly/config
 * Конфиг экрана «Отправь игру в стим» для клиента (публичный, без секретов):
 *  - commission_percent — комиссия сервиса (env DESSLY_SERVICE_COMMISSION_PERCENT, иначе дефолт 4%);
 *    редактирование из админки добавляется в Блоке B4.
 *  - mode/widget_url — embed (если задан DESSLY_WIDGET_URL — готовое окно Dessly) или native
 *    (собственный экран на данных Dessly API). Решение принимается на сервере, т.к. WIDGET_URL —
 *    серверный env без префикса NEXT_PUBLIC.
 *  - regions — список регионов аккаунта.
 */
export async function GET() {
  const envPct = Number(process.env.DESSLY_SERVICE_COMMISSION_PERCENT)
  const commission_percent =
    Number.isFinite(envPct) && envPct >= 0 ? envPct : DESSLY_SERVICE_COMMISSION_PERCENT_DEFAULT

  const entry = resolveSendGameMode(process.env.DESSLY_WIDGET_URL)

  return NextResponse.json({
    commission_percent,
    mode: entry.mode,
    widget_url: entry.mode === 'embed' ? entry.url : null,
    regions: DESSLY_REGIONS,
  })
}
