// Точечный тест записи в Supabase: одна upsert-пачка с ПОЛНОЙ распечаткой причины ошибки.
// Reads проходят, а upsert падает с "TypeError: fetch failed" детерминированно — нужен e.cause.
// Запуск: node scripts/_test_write.mjs
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

const dump = (label, e) => {
  console.log(`\n=== ${label} ===`)
  console.log('name:', e?.name, '| message:', e?.message)
  let c = e?.cause, depth = 0
  while (c && depth < 5) {
    console.log(`  cause[${depth}]:`, c.name || '', c.code || '', c.message || c)
    c = c.cause
    depth++
  }
}

// Берём 100 реальных approute-строк и пробуем их же upsert-нуть обратно (no-op обновление).
console.log('читаю 100 строк...')
const { data: rows, error: readErr } = await supabase
  .from('products').select('*').eq('supplier', 'approute').limit(100)
if (readErr) { console.log('read error:', readErr.message); process.exit(1) }
console.log(`прочитано ${rows.length}, пробую upsert тем же набором...`)

// Тест 1: upsert полной пачки 100 (как в синке)
try {
  const { error } = await supabase.from('products').upsert(rows, { onConflict: 'id' })
  console.log('UPSERT 100:', error ? 'PostgREST error: ' + error.message : 'OK')
} catch (e) { dump('UPSERT 100 threw', e) }

// Тест 2: upsert одной строки — отделяем «размер тела» от «самой операции»
try {
  const { error } = await supabase.from('products').upsert([rows[0]], { onConflict: 'id' })
  console.log('UPSERT 1:', error ? 'PostgREST error: ' + error.message : 'OK')
} catch (e) { dump('UPSERT 1 threw', e) }

// Тест 3: простой update одной строки (не upsert) — работал в diag STEP4
try {
  const { error } = await supabase.from('products').update({ name: rows[0].name }).eq('id', rows[0].id)
  console.log('UPDATE 1:', error ? 'PostgREST error: ' + error.message : 'OK')
} catch (e) { dump('UPDATE 1 threw', e) }

process.exit(0)
