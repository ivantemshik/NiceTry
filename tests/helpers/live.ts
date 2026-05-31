// Утилиты для боевых интеграционных тестов против живого Supabase:
// устойчивый вход (повтор при транзиентной задержке auth) и пауза.

import type { SupabaseClient } from '@supabase/supabase-js'

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Повтор операции при ТРАНЗИЕНТНЫХ сбоях сети к Supabase (`TypeError: fetch failed`,
 * ECONNRESET, таймауты). Боевые тесты бьют по реальной БД из локальной среды, где такие
 * блипы случаются — они НЕ должны «мигать» в наборе. Делает до `attempts` попыток с бэк-оффом.
 * Возвращает результат как есть (в т.ч. `{data,error}` Supabase — ошибки уровня БД НЕ ретраятся).
 */
const TRANSIENT = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network|timeout|aborted/i

/**
 * Повтор операции при ТРАНЗИЕНТНЫХ сбоях сети к Supabase. Учитывает ОБА случая, в которых
 * supabase-js сообщает о сетевом сбое: (1) промис отклоняется (throw), (2) промис РЕЗОЛВИТСЯ
 * с `{ error: { message: 'TypeError: fetch failed' } }`. В обоих случаях делаем до `attempts`
 * попыток с бэк-оффом. Ошибки уровня БД (не сетевые) НЕ ретраятся.
 */
export async function retry<T>(fn: () => PromiseLike<T>, attempts = 4, base = 500): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    const isLast = i === attempts - 1
    try {
      const res = await fn()
      const err = (res as { error?: { message?: string } } | null)?.error
      if (err && TRANSIENT.test(String(err.message ?? err)) && !isLast) {
        lastErr = err
        await sleep(base * (i + 1))
        continue
      }
      return res
    } catch (e) {
      lastErr = e
      if (isLast) throw e
      await sleep(base * (i + 1))
    }
  }
  throw lastErr
}

/**
 * Вход с повторами: GoTrue иногда отвечает с задержкой/транзиентной ошибкой.
 * Делает до `attempts` попыток с небольшим бэк-оффом, чтобы тесты не «мигали».
 */
export async function signInWithRetry(
  client: SupabaseClient,
  email: string,
  password: string,
  attempts = 4
): Promise<void> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (!error) return
      lastErr = error
    } catch (e) {
      lastErr = e // транзиентный сетевой сбой
    }
    await sleep(500 * (i + 1))
  }
  throw new Error(`signIn failed after ${attempts} attempts: ${(lastErr as Error)?.message}`)
}

/**
 * Дешёвая массовая зачистка остатков в пространстве имён vitest+ (страховка от транзиентных
 * сбоев пошаговой очистки). БЕЗ перебора пользователей и listUsers — фиксированное число
 * bulk-запросов в FK-безопасном порядке. Auth-пользователи здесь не трогаем (их удаляет
 * основная очистка); цель — не оставить «висячих» строк в public-таблицах БД заказчика.
 */
export async function sweepVitestRows(admin: SupabaseClient): Promise<void> {
  try {
    const { data } = await admin.from('users').select('id').ilike('email', 'vitest+%')
    const ids = (data || []).map((r) => (r as { id: string }).id)
    if (!ids.length) return
    const del = (fn: () => PromiseLike<unknown>) => retry(fn, 3).catch(() => {})
    await del(() => admin.from('referral_earnings').delete().in('referrer_id', ids))
    await del(() => admin.from('referral_earnings').delete().in('referred_user_id', ids))
    await del(() => admin.from('balance_transactions').delete().in('user_id', ids))
    await del(() => admin.from('orders').delete().in('user_id', ids))
    await del(() => admin.from('users').delete().in('id', ids))
  } catch {
    /* best effort */
  }
}

