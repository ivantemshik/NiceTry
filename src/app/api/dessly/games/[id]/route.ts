import { NextRequest, NextResponse } from 'next/server'
import { getGame, isLiveMode } from '@/lib/dessly'

/**
 * GET /api/dessly/games/[id]?region=RU
 * Издания конкретной игры с ценой под выбранный регион.
 *
 * Dessly отдаёт издание с массивом regions_info[] (цена зависит от региона).
 * Для UI отправки игры мы «уплощаем» каждое издание до одной цены под `region`
 * (если регион не передан/не найден — берём первый доступный регион издания).
 *
 * Ответ: { editions: [{ edition, packageId, price, priceOriginal, discount, region }], live }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const appId = params.id
    const wantRegion = (request.nextUrl.searchParams.get('region') || '').trim().toUpperCase()

    const editions = await getGame(appId)

    const flat = editions
      .map((e) => {
        const rp =
          (wantRegion && e.regions.find((r) => r.region === wantRegion)) || e.regions[0]
        if (!rp) return null
        return {
          edition: e.edition || 'Standard',
          packageId: e.packageId,
          price: rp.price,
          priceOriginal: rp.priceOriginal || rp.price,
          discount: rp.discount,
          region: rp.region,
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null && !!e.packageId)

    return NextResponse.json({ editions: flat, live: isLiveMode() })
  } catch (error: any) {
    console.error('[dessly/games/:id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch game editions' }, { status: 500 })
  }
}
