// Разовая проверка покрытия image_url у approute-товаров после синка.
// Запуск: node scripts/_verify_images.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const l of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
}
const { fetch: undiciFetch, Agent } = await import('undici')
const disp = new Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1, connections: 8 })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, global: { fetch: (i, init = {}) => undiciFetch(i, { ...init, dispatcher: disp }) } }
)

const PAGE = 500
let offset = 0, total = 0, withImg = 0, active = 0, activeWithImg = 0
const samples = []
for (;;) {
  const { data, error } = await supabase
    .from('products')
    .select('name, image_url, is_active')
    .eq('supplier', 'approute')
    .range(offset, offset + PAGE - 1)
    .abortSignal(AbortSignal.timeout(30000))
  if (error) { console.error(error.message); process.exit(1) }
  for (const r of data) {
    total++
    if (r.image_url) withImg++
    if (r.is_active) active++
    if (r.is_active && r.image_url) activeWithImg++
    if (r.image_url && samples.length < 8) samples.push(`${r.name}  →  ${r.image_url}`)
  }
  if (data.length < PAGE) break
  offset += PAGE
}
console.log(`approute всего: ${total}`)
console.log(`с image_url:    ${withImg} (${Math.round((withImg / total) * 100)}%)`)
console.log(`активных:       ${active}, из них с картинкой: ${activeWithImg} (${Math.round((activeWithImg / active) * 100)}%)`)
console.log('\nпримеры:')
for (const s of samples) console.log('  ' + s)
process.exit(0)
