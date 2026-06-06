import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { validateNickname } from '@/lib/auth/nickname'
import { normalizeEmail } from '@/lib/auth/codes'
import { verifyCheckoutToken } from '@/lib/payments/token'
import { mintSessionForEmail } from '@/lib/auth/session'

/**
 * POST /api/checkout/finalize — завершение гостевого заказа: ник → аккаунт → авто-вход → привязка.
 *
 * Тело: { order_id, nickname, token }.
 *   - Заказ должен быть гостевым (user_id=NULL) со статусом 'paid' и заполненным guest_email.
 *   - token подписан на (order_id, guest_email) при создании заказа — защита от подбора order_id.
 *   - Почта берётся ИЗ ЗАКАЗА (не с клиента) — источник истины.
 *
 * По «Продолжить»:
 *   1) Если по почте уже есть аккаунт (гонка/повторная покупка) — НЕ плодим дубль: привязываем
 *      заказ к нему, ник не трогаем, выдаём сессию (авто-вход).
 *   2) Иначе создаём аккаунт с ником (латиница/цифры/_/-, 3–20, уникальный), выдаём сессию
 *      (авто-вход без кода) и привязываем заказ.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const orderId = String(body?.order_id ?? '').trim()
    const token = String(body?.token ?? '').trim()
    const nickname = String(body?.nickname ?? '').trim()

    if (!orderId || !token) {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
    }

    // Загружаем заказ (service-role).
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, user_id, guest_email, status')
      .eq('id', orderId)
      .maybeSingle()

    if (!order || !order.guest_email) {
      return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
    }

    const email = normalizeEmail(order.guest_email)

    // Проверка подписи токена (привязан к order_id + почте).
    if (!verifyCheckoutToken(order.id, email, token)) {
      return NextResponse.json({ error: 'Сессия оформления недействительна' }, { status: 403 })
    }

    // Заказ уже привязан к аккаунту (повторный finalize / сессия активна на чекауте) —
    // ник не нужен, просто выдаём сессию для авто-входа на эту почту.
    if (order.user_id) {
      const supabase = await createClient()
      const minted = await mintSessionForEmail(supabase, email)
      if (!minted.ok) {
        return NextResponse.json({ error: 'Не удалось войти. Войдите по коду.' }, { status: 500 })
      }
      return NextResponse.json({ success: true, alreadyLinked: true })
    }

    // По почте уже есть аккаунт? Не плодим дубль — привязываем заказ к нему, ник не спрашиваем.
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    const supabase = await createClient()

    if (existingUser) {
      const minted = await mintSessionForEmail(supabase, email)
      if (!minted.ok) {
        return NextResponse.json({ error: 'Не удалось войти. Войдите по коду.' }, { status: 500 })
      }
      await supabaseAdmin.from('orders').update({ user_id: existingUser.id }).eq('id', order.id)
      return NextResponse.json({ success: true, existedAccount: true })
    }

    // Новый аккаунт — нужен валидный свободный ник.
    const v = validateNickname(nickname)
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 })
    }
    // Предпроверка занятости (финальная гарантия — UNIQUE-индекс LOWER(nickname), код 23505 ниже).
    const { data: nickTaken } = await supabaseAdmin
      .from('users')
      .select('id')
      .ilike('nickname', nickname)
      .maybeSingle()
    if (nickTaken) {
      return NextResponse.json({ error: 'Этот ник уже занят' }, { status: 409 })
    }

    // Минтим сессию (создаёт auth-пользователя + cookies). После — узнаём его id.
    const minted = await mintSessionForEmail(supabase, email)
    if (!minted.ok) {
      return NextResponse.json({ error: 'Не удалось завершить оформление' }, { status: 500 })
    }
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Не удалось завершить оформление' }, { status: 500 })
    }

    // Создаём профиль с ником (как в /api/user/nickname: реф-код + статус Bronze).
    const referralCode = (() => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      let c = ''
      for (let i = 0; i < 8; i++) c += chars.charAt(Math.floor(Math.random() * chars.length))
      return c
    })()
    const { data: bronze } = await supabaseAdmin
      .from('user_statuses')
      .select('id')
      .eq('name', 'Bronze')
      .maybeSingle()

    const { error: profileError } = await supabaseAdmin.from('users').insert({
      id: authUser.id,
      email,
      nickname,
      referral_code: referralCode,
      status_id: bronze?.id ?? null,
      balance: 0,
    })
    if (profileError) {
      // Гонка по нику/реф-коду.
      if ((profileError as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'Этот ник уже занят' }, { status: 409 })
      }
      console.error('[checkout/finalize] profile insert failed:', profileError)
      return NextResponse.json({ error: 'Не удалось создать аккаунт' }, { status: 500 })
    }

    // Привязываем заказ к новому аккаунту.
    await supabaseAdmin.from('orders').update({ user_id: authUser.id }).eq('id', order.id)

    return NextResponse.json({ success: true, nickname })
  } catch (error) {
    console.error('[checkout/finalize] unexpected error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
