import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const DATA_PATH = resolve(process.cwd(), 'src/data/popular-games.json')

const NOTE =
  'Top Steam games by global popularity (app_id → rank). Used by /api/dessly/games?sort=popularity. Edit via admin panel or directly. Lower rank = more popular. Games not in this list appear after, sorted alphabetically.'

/**
 * GET /api/admin/popular-games — получить текущий список популярных игр
 * PUT /api/admin/popular-games — обновить список { popular: [{app_id, name}] }
 */
export async function GET() {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response
    // Читаем файл с диска (а не import), чтобы всегда отдавать актуальную версию
    // после правок и не зависеть от кэша модулей.
    const raw = readFileSync(DATA_PATH, 'utf-8')
    const data = JSON.parse(raw)
    return NextResponse.json({ popular: data.popular || [], _note: data._note || NOTE })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to read popular games' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response

    const body = await request.json()
    if (!body || !Array.isArray(body.popular)) {
      return NextResponse.json({ error: 'Invalid format: { popular: [{app_id, name}] }' }, { status: 400 })
    }

    // Валидация
    for (const item of body.popular) {
      if (!item.app_id || typeof item.app_id !== 'number' || !item.name) {
        return NextResponse.json(
          { error: `Invalid entry: each must have app_id (number) and name (string)` },
          { status: 400 }
        )
      }
    }

    const json = JSON.stringify(
      {
        _note: NOTE,
        popular: body.popular,
      },
      null,
      2
    ) + '\n'

    writeFileSync(DATA_PATH, json, 'utf-8')
    return NextResponse.json({ success: true, count: body.popular.length })
  } catch (e: any) {
    console.error('[admin/popular-games] PUT error:', e)
    return NextResponse.json({ error: 'Failed to update popular games' }, { status: 500 })
  }
}
