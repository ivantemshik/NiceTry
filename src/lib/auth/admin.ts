import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Гард администратора для серверных API-роутов.
 *
 * Паттерн (как в /api/products/import и /api/orders/create):
 *   1) Аутентификация по сессии пользователя (анонимный/сессионный клиент).
 *   2) Проверка флага is_admin.
 *   3) Привилегированные операции выполняются через service-role клиент (supabaseAdmin),
 *      который ОБХОДИТ RLS. Это необходимо, потому что строгие RLS-политики
 *      (см. supabase_security.sql) намеренно запрещают anon/authenticated прямой доступ
 *      к закрытым таблицам (promo_codes, product_keys и т.д.) и любые мутации витрины/заказов.
 *
 * Service-role ключ читается только на сервере (process.env.SUPABASE_SERVICE_ROLE_KEY,
 * без префикса NEXT_PUBLIC) и НИКОГДА не попадает в клиентский бандл.
 *
 * Использование:
 *   const guard = await requireAdmin()
 *   if (!guard.ok) return guard.response
 *   const supabase = guard.admin   // далее работаем через service-role
 */
export type AdminGuardResult =
  | { ok: true; userId: string; admin: typeof supabaseAdmin }
  | { ok: false; response: NextResponse }

export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  // is_admin читаем через service-role, чтобы не зависеть от RLS-политики users.
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, userId: user.id, admin: supabaseAdmin }
}
