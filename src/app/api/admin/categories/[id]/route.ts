import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'

// PATCH /api/admin/categories/[id] — обновление категории.
// Белый список полей (ТЗ §5.3: наценка и курс — под каждую категорию, управляются в админке).
// Намеренно НЕ позволяем менять slug/supplier через этот эндпоинт — это ключи маппинга
// каталога; их смена ломает связь с товарами/импортом.
const ALLOWED_FIELDS = ['name', 'icon', 'markup_percent', 'usd_to_rub_rate', 'is_active', 'sort_order'] as const

const NUMERIC_FIELDS = new Set(['markup_percent', 'usd_to_rub_rate', 'sort_order'])

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response
    const supabase = guard.admin

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 })
    }

    // Фильтруем только разрешённые поля + валидируем числовые (наценка/курс >= 0).
    const update: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (!(key in body)) continue
      let value = (body as Record<string, unknown>)[key]
      if (NUMERIC_FIELDS.has(key)) {
        const n = Number(value)
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: `Поле ${key} должно быть числом ≥ 0` }, { status: 400 })
        }
        value = n
      }
      if (key === 'is_active') value = Boolean(value)
      update[key] = value
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет полей для обновления' }, { status: 400 })
    }
    update.updated_at = new Date().toISOString()

    const { data: category, error } = await supabase
      .from('categories')
      .update(update)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ category })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 })
  }
}
