// Подбор рабочего размера upsert-пачки к Supabase на этой сети.
// Известно: upsert 1 — ок, upsert 100 — рвётся (большое POST-тело). Ищем порог.
// Запуск: node scripts/_test_batch.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const l of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const { fetch: undiciFetch, Agent } = await import('undici')
const dispatcher = new Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1, connections: 8 })
const sbFetch = (input, init = {}) => undiciFetch(input, { ...init, dispatcher })
const supabase = createClient(url, key, { auth: { persistSession: false }, global: { fetch: sbFetch } })

const { data: rows } = await supabase.from('products').select('*').eq('supplier', 'approute').limit(100)
console.log(`прочитано ${rows.length} строк. Средний размер строки JSON: ~${Math.round(JSON.stringify(rows).length / rows.length)} байт`)

async function tryBatch(n) {
  const part = rows.slice(0, n)
  const bytes = JSON.stringify(part).length
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await supabase.from('products').upsert(part, { onConflict: 'id' })
      if (error) { console.log(`  batch ${n} (${bytes}b): попытка ${attempt} → PostgREST: ${error.message}`); continue }
      console.log(`  batch ${n} (${bytes}b): OK (попытка ${attempt})`)
      return true
    } catch (e) {
      console.log(`  batch ${n} (${bytes}b): попытка ${attempt} → threw ${e.message}`)
    }
  }
  return false
}

for (const n of [75, 50, 25, 10]) {
  await tryBatch(n)
}
process.exit(0)
