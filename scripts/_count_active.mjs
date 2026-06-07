// Сколько approute-товаров активно/скрыто и сколько всего видит витрина.
// Запуск: node scripts/_count_active.mjs
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
const s = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

console.log('Supabase проект:', url)

const head = async (q) => {
  const { count, error } = await q
  if (error) return `ERR ${error.message}`
  return count
}

console.log('products всего            :', await head(s.from('products').select('*', { count: 'exact', head: true })))
console.log('products is_active=true   :', await head(s.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true)))
console.log('approute всего            :', await head(s.from('products').select('*', { count: 'exact', head: true }).eq('supplier', 'approute')))
console.log('approute is_active=true   :', await head(s.from('products').select('*', { count: 'exact', head: true }).eq('supplier', 'approute').eq('is_active', true)))
console.log('approute is_active=false  :', await head(s.from('products').select('*', { count: 'exact', head: true }).eq('supplier', 'approute').eq('is_active', false)))
console.log('categories всего          :', await head(s.from('categories').select('*', { count: 'exact', head: true })))
console.log('categories approute       :', await head(s.from('categories').select('*', { count: 'exact', head: true }).eq('supplier', 'approute')))
process.exit(0)
