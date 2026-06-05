// Временный диагностический скрипт. Запуск: node scripts/_count.mjs
// Считает approute-товары, ищет дубликаты по бизнес-ключу (supplier_service_id, denomination_id)
// и проверяет, не помешают ли дубли по всей таблице созданию глобального UNIQUE-индекса.
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

// Тянем все products с пагинацией. Страница 200 + ретраи: на этой сети undici рвёт
// крупные тела ("TypeError: terminated"), мелкие страницы с повтором проходят надёжно.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function fetchPage(off, page) {
  let lastErr
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const { data, error } = await s
        .from('products')
        .select('id, supplier, supplier_service_id, denomination_id')
        .range(off, off + page - 1)
      if (error) throw new Error(error.message)
      return data
    } catch (e) {
      lastErr = e
      await sleep(500 * attempt)
    }
  }
  throw new Error(`page off=${off}: ${lastErr.message}`)
}
async function fetchAll() {
  const out = []
  const PAGE = 200
  let off = 0
  for (;;) {
    const data = await fetchPage(off, PAGE)
    out.push(...data)
    if (data.length < PAGE) break
    off += PAGE
  }
  return out
}

const all = await fetchAll()
const key = (r) => `${r.supplier ?? '<null>'}::${r.supplier_service_id ?? '<null>'}::${r.denomination_id ?? '<null>'}`

const approute = all.filter((r) => r.supplier === 'approute')

// Дубликаты по бизнес-ключу среди approute.
const groups = new Map()
for (const r of approute) {
  const k = key(r)
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(r.id)
}
const dupGroups = [...groups.entries()].filter(([, ids]) => ids.length > 1)
const dupExtraRows = dupGroups.reduce((n, [, ids]) => n + (ids.length - 1), 0)

// Дубли по всей таблице (помешают глобальному UNIQUE-индексу с NULLS NOT DISTINCT).
const allGroups = new Map()
for (const r of all) {
  const k = key(r)
  allGroups.set(k, (allGroups.get(k) || 0) + 1)
}
const globalDup = [...allGroups.entries()].filter(([, n]) => n > 1)

console.log('--- approute ---')
console.log('всего approute-строк      :', approute.length)
console.log('уникальных бизнес-ключей  :', groups.size)
console.log('групп-дублей (key>1)      :', dupGroups.length)
console.log('лишних строк из-за дублей :', dupExtraRows)
console.log('--- вся таблица products ---')
console.log('всего строк               :', all.length)
console.log('ключей с дублями (блокнут UNIQUE-индекс):', globalDup.length)
if (globalDup.length) {
  console.log('  примеры:', globalDup.slice(0, 10).map(([k, n]) => `${k} ×${n}`))
}
