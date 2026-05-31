import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * POST /api/promo/validate
 * Проверка валидности промокода. Чтение идёт через service-role клиент, т.к. таблица
 * promo_codes закрыта RLS от прямого доступа анонимов/пользователей (см. supabase_security.sql).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const code = body?.code
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false, error: 'Промокод не указан' }, { status: 400 })
    }

    const { data: promo, error } = await supabaseAdmin
      .from('promo_codes')
      .select('discount_type, discount_value, expires_at, max_uses, used_count, is_active')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .maybeSingle()

    if (error || !promo) {
      return NextResponse.json({ valid: false, error: 'Промокод не найден или неактивен' })
    }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: 'Срок действия промокода истёк' })
    }
    if (promo.max_uses && promo.used_count >= promo.max_uses) {
      return NextResponse.json({ valid: false, error: 'Промокод исчерпан' })
    }

    return NextResponse.json({
      valid: true,
      discount_type: promo.discount_type,
      discount_value: promo.discount_value,
    })
  } catch (error) {
    console.error('Promo validation error:', error)
    return NextResponse.json({ valid: false, error: 'Ошибка проверки промокода' }, { status: 500 })
  }
}
