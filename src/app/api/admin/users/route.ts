import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'

// GET /api/admin/users - список пользователей
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response
    const supabase = guard.admin

    // Параметры фильтрации
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')

    let query = supabase
      .from('users')
      .select(`
        *,
        user_statuses (name, discount_percent)
      `)
      .order('created_at', { ascending: false })

    if (search) {
      // Экранируем спецсимволы PostgREST-фильтра (,()) во избежание инъекции в .or().
      const safe = search.replace(/[,()*]/g, ' ').trim()
      if (safe) query = query.or(`email.ilike.%${safe}%,telegram_username.ilike.%${safe}%`)
    }

    const { data: users, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ users })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
