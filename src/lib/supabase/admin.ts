import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Fetch с повтором на УРОВНЕ СОЕДИНЕНИЯ (когда fetch отклоняется — `TypeError: fetch failed`,
 * ECONNRESET, EAI_AGAIN и т.п.). Такие сбои почти всегда означают, что запрос не дошёл до сервера,
 * поэтому повтор безопасен и для записей. HTTP-ответы с ошибкой (4xx/5xx) НЕ повторяются — это
 * легитимные ответы приложения. Повышает надёжность серверных операций при сетевых блипах.
 */
async function retryingFetch(input: RequestInfo | URL, init?: RequestInit, attempts = 3): Promise<Response> {
  // Service-role операции ВСЕГДА должны видеть живые данные (балансы, заказы, proxy_settings).
  // Next.js по умолчанию кэширует GET-fetch в Data Cache — из-за этого админка пишет настройки
  // (POST к PostgREST, не кэшируется), а витрина читает их устаревшую копию из кэша. no-store
  // выключает кэш для всех чтений через этот клиент.
  const noStoreInit: RequestInit = { ...init, cache: 'no-store' }
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, noStoreInit)
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  throw lastErr
}

// Admin client для серверных операций (создание пользователей, обход RLS).
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: { fetch: retryingFetch },
})
