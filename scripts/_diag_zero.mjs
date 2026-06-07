// Диагностика: товары с ценой 0 по поставщикам и типам (вся таблица).
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function page(off, p) {
  for (let a = 1; a <= 5; a++) {
    try {
      const { data, error } = await s
        .from('products')
        .select('id, name, type, price, stock, is_active, supplier')
        .range(off, off + p - 1)
      if (error) throw new Error(error.message)
      return data
    } catch (e) {
      if (a === 5) throw e
      await sleep(400 * a)
    }
  }
}
const all = []
for (let off = 0; ; off += 200) {
  const d = await page(off, 200)
  all.push(...d)
  if (d.length < 200) break
}

const grp = (rows, f) => {
  const m = {}
  for (const r of rows) {
    const k = f(r)
    m[k] = (m[k] || 0) + 1
  }
  return m
}
console.log('Всего:', all.length)
console.log('По поставщику:', grp(all, (r) => r.supplier ?? '<null>'))
const zero = all.filter((r) => r.price === 0)
console.log('price=0 всего:', zero.length)
console.log('price=0 по поставщику:', grp(zero, (r) => r.supplier ?? '<null>'))
console.log('price=0 & is_active по поставщику:', grp(zero.filter((r) => r.is_active), (r) => r.supplier ?? '<null>'))
console.log('--- примеры price=0 & is_active ---')
for (const r of zero.filter((r) => r.is_active).slice(0, 20)) {
  console.log(`  [${r.supplier}] type=${r.type} stock=${r.stock} ${r.name}`)
}
process.exit(0)
