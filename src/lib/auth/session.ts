// Минт Supabase-сессии без отправки письма (общий helper).
//
// Тот же приём, что в /api/auth/verify-code и /api/auth/dev-login:
//   admin.createUser (idempotent, email_confirm) → admin.generateLink(magiclink) →
//   supabase.auth.verifyOtp(token_hash) — пишет сессионные cookies серверным клиентом.
// Возвращает { ok } либо { ok:false, error } (детали — в логах).

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Выдать сессию (cookies) для указанной почты через переданный серверный клиент.
 * Почта должна быть уже нормализована (нижний регистр).
 */
export async function mintSessionForEmail(
  supabase: SupabaseClient,
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1) Гарантируем auth-пользователя (email уже подтверждён логикой выше — оплата/код).
  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (createError && !/registered|already/i.test(createError.message)) {
    console.error('[session] createUser error:', createError)
    return { ok: false, error: 'create_user_failed' }
  }

  // 2) Одноразовый token_hash без письма.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[session] generateLink error:', linkError)
    return { ok: false, error: 'generate_link_failed' }
  }

  // 3) Подтверждаем token_hash серверным клиентом → сессия в cookies.
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })
  if (verifyError) {
    console.error('[session] verifyOtp error:', verifyError)
    return { ok: false, error: 'verify_otp_failed' }
  }

  return { ok: true }
}
