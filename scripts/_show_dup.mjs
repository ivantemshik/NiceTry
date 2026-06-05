// Временный диагностический скрипт. Запуск: node scripts/_show_dup.mjs
// Показывает approute-строки, у которых supplier_service_id и denomination_id оба NULL
// (это и есть дубль, блокирующий UNIQUE-индекс).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const l of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data, error } = await s
  .from('products')
  .select('*')
  .eq('supplier', 'approute')
  .is('supplier_service_id', null)
  .is('denomination_id', null)
if (error) throw new Error(error.message)
console.log('найдено строк:', data.length)
console.dir(data, { depth: null })
