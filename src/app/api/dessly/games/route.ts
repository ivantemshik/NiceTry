import { NextRequest, NextResponse } from 'next/server'
import { listGames, isLiveMode } from '@/lib/dessly'
import popularData from '@/data/popular-games.json'

interface GameEntry {
  app_id: number
  name: string
  image_url: string | null
  image_fallback: boolean
  popular: boolean
}

/**
 * GET /api/dessly/games
 * Живой список игр Dessly с поиском, сортировкой и пагинацией.
 *
 * Query params:
 *   search  — фильтр по названию
 *   sort    — 'popularity' (по умолчанию: популярные → алфавит) | 'name' (строго алфавит)
 *   limit   — размер страницы (по умолчанию 100, макс 5000)
 *   offset  — смещение
 *
 * Сортировка popularity: игры из popular-games.json первыми (по рангу),
 * остальные — по алфавиту. При поиске сортировка отключается (релевантность).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const search = (sp.get('search') || '').trim().toLowerCase()
    const sort = (sp.get('sort') || 'popularity').toLowerCase()
    const limit = clamp(sp.get('limit'), 100, 1, 5000)
    const offset = clamp(sp.get('offset'), 0, 0, 50000)

    const games = await listGames()

    // Строим карту популярности (app_id → rank)
    const popRank = new Map<number, number>()
    for (let i = 0; i < popularData.popular.length; i++) {
      popRank.set(popularData.popular[i].app_id, i)
    }

    // Преобразуем в GameEntry
    let entries: GameEntry[] = games.map((g) => {
      const appId = g.appid || Number(g.id) || 0
      return {
        app_id: appId,
        name: g.name,
        image_url: appId
          ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
          : null,
        image_fallback: !appId,
        popular: popRank.has(appId),
      }
    })

    // Поиск
    if (search.length >= 2) {
      entries = entries.filter((g) => g.name.toLowerCase().includes(search))
    } else if (search.length === 1) {
      entries = entries.filter((g) => g.name.toLowerCase().startsWith(search))
    }

    // Сортировка: при поиске — не трогаем (сохраняем порядок от Dessly),
    // иначе — по популярности или алфавиту
    if (sort === 'popularity' && !search) {
      entries.sort((a, b) => {
        const ra = popRank.get(a.app_id) ?? 999999
        const rb = popRank.get(b.app_id) ?? 999999
        if (ra !== rb) return ra - rb
        return a.name.localeCompare(b.name)
      })
    } else if (sort === 'name' && !search) {
      entries.sort((a, b) => a.name.localeCompare(b.name))
    }

    const total = entries.length
    const page = entries.slice(offset, offset + limit)

    return NextResponse.json({
      games: page,
      total,
      limit,
      offset,
      live: isLiveMode(),
    })
  } catch (error: any) {
    console.error('[dessly/games] error:', error)
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 })
  }
}

function clamp(raw: string | null, def: number, min: number, max: number): number {
  const n = parseInt(raw || '', 10)
  if (Number.isNaN(n)) return def
  return Math.min(max, Math.max(min, n))
}
