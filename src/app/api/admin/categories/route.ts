import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'

// GET /api/admin/categories — список категорий (для управления наценкой/курсом/видимостью).
// Только администратор (requireAdmin).
export async function GET() {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response
    const supabase = guard.admin

    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ categories: categories || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 })
  }
}
