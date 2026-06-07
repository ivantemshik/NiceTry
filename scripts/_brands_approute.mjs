// Разовая диагностика: распределение боевого фида AppRoute по section/categoryName.
// Нужна, чтобы оценить, реально ли закрыть обложки товаров логотипами брендов (section).
// Запуск: node scripts/_brands_approute.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const l of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
}
const baseUrl = (process.env.APPROUTE_BASE_URL || '').trim().replace(/\/+$/, '')
const apiKey = (process.env.APPROUTE_API_KEY || '').trim()
const proxyUrl = (process.env.APPROUTE_OUTBOUND_PROXY || '').trim()

const { request, ProxyAgent } = await import('undici')
const opts = {
  method: 'GET',
  headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  headersTimeout: 30000, bodyTimeout: 30000, signal: AbortSignal.timeout(40000),
}
if (proxyUrl) opts.dispatcher = new ProxyAgent({ uri: proxyUrl, connectTimeout: 15000 })

const res = await request(baseUrl + '/api/v1/services', opts)
const env = await res.body.json()
const items = env.data?.items ?? []

const bySection = new Map() // section -> {services, skus}
const byCategory = new Map()
let totalSku = 0
for (const s of items) {
  const sku = (s.items ?? []).length
  totalSku += sku
  const sec = s.section || '(нет)'
  const cat = s.categoryName || '(нет)'
  const a = bySection.get(sec) || { services: 0, skus: 0 }
  a.services++; a.skus += sku; bySection.set(sec, a)
  const b = byCategory.get(cat) || { services: 0, skus: 0 }
  b.services++; b.skus += sku; byCategory.set(cat, b)
}

console.log(`services ${items.length}, SKU ${totalSku}, distinct sections ${bySection.size}, distinct categories ${byCategory.size}\n`)
console.log('=== категории (categoryName), по SKU ===')
for (const [k, v] of [...byCategory].sort((a, b) => b[1].skus - a[1].skus))
  console.log(`${String(v.skus).padStart(5)} sku  ${String(v.services).padStart(4)} svc  ${k}`)

console.log('\n=== ТОП-40 брендов (section), по SKU ===')
const secs = [...bySection].sort((a, b) => b[1].skus - a[1].skus)
for (const [k, v] of secs.slice(0, 40))
  console.log(`${String(v.skus).padStart(5)} sku  ${String(v.services).padStart(4)} svc  ${k}`)

// Какую долю SKU покрывают топ-N брендов (оценка усилий на section→logo map).
for (const n of [20, 40, 80, 150]) {
  const covered = secs.slice(0, n).reduce((s, [, v]) => s + v.skus, 0)
  console.log(`top-${n} брендов покрывают ${covered}/${totalSku} SKU (${Math.round((covered / totalSku) * 100)}%)`)
}
process.exit(0)
