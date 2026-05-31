import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Генерация уникального реферального кода
function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// GET /api/user/profile - получить профиль текущего пользователя
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      )
    }

    // Получаем профиль из таблицы users
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select(`
        *,
        status:user_statuses(name, discount_percent)
      `)
      .eq('id', user.id)
      .single()

    if (profileError) {
      // Если профиля нет - создаём его
      if (profileError.code === 'PGRST116') {
        const referralCode = generateReferralCode()

        // Получаем Bronze статус
        const { data: bronzeStatus } = await supabase
          .from('user_statuses')
          .select('id')
          .eq('name', 'Bronze')
          .single()

        const { data: newProfile, error: createError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            email: user.email!,
            referral_code: referralCode,
            status_id: bronzeStatus?.id,
            balance: 0
          })
          .select(`
            *,
            status:user_statuses(name, discount_percent)
          `)
          .single()

        if (createError) {
          console.error('Create profile error:', createError)
          return NextResponse.json(
            { error: 'Ошибка создания профиля' },
            { status: 500 }
          )
        }

        return NextResponse.json(newProfile)
      }

      console.error('Profile error:', profileError)
      return NextResponse.json(
        { error: 'Ошибка получения профиля' },
        { status: 500 }
      )
    }

    return NextResponse.json(profile)
  } catch (error) {
    console.error('Profile error:', error)
    return NextResponse.json(
      { error: 'Ошибка сервера' },
      { status: 500 }
    )
  }
}

// PATCH /api/user/profile - обновить профиль
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { telegram_id } = body

    // Обновляем только разрешённые поля
    const updates: any = {}
    if (telegram_id !== undefined) {
      updates.telegram_id = telegram_id
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select(`
        *,
        status:user_statuses(name, discount_percent)
      `)
      .single()

    if (updateError) {
      console.error('Update profile error:', updateError)
      return NextResponse.json(
        { error: 'Ошибка обновления профиля' },
        { status: 500 }
      )
    }

    return NextResponse.json(updatedProfile)
  } catch (error) {
    console.error('Update profile error:', error)
    return NextResponse.json(
      { error: 'Ошибка сервера' },
      { status: 500 }
    )
  }
}
