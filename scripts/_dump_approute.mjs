// Дамп сырого ответа боевого AppRoute /api/v1/services: структура сервиса и item,
// поиск любых полей с картинками. Запуск: node scripts/_dump_approute.mjs
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
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)
log('proxy?', !!proxyUrl, 'base', baseUrl, '→ request /api/v1/services')
const opts = {
  method: 'GET',
  headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  headersTimeout: 30000,
  bodyTimeout: 30000,
  signal: AbortSignal.timeout(40000), // жёсткий потолок на всю операцию (вкл. connect)
}
// connectTimeout ограничивает именно фазу TCP/туннеля через прокси (иначе висит бесконечно).
if (proxyUrl) opts.dispatcher = new ProxyAgent({ uri: proxyUrl, connectTimeout: 15000 })

const res = await request(baseUrl + '/api/v1/services', opts)
log('HTTP', res.statusCode, '→ читаю тело')
const env = await res.body.json()
const items = env.data?.items ?? []
console.log('HTTP', res.statusCode, 'statusCode', env.statusCode, 'services', items.length)

// Собираем все ключи верхнего уровня сервиса и item'ов по всему фиду.
const svcKeys = new Set()
const itemKeys = new Set()
const imageish = new Set()
const reImg = /(image|img|icon|logo|cover|picture|photo|thumb|banner)/i
for (const s of items) {
  for (const k of Object.keys(s)) {
    svcKeys.add(k)
    if (reImg.test(k)) imageish.add('service.' + k)
  }
  for (const it of s.items ?? []) {
    for (const k of Object.keys(it)) {
      itemKeys.add(k)
      if (reImg.test(k)) imageish.add('item.' + k)
    }
  }
}
console.log('\n=== ключи service ===\n', [...svcKeys].sort().join(', '))
console.log('\n=== ключи item ===\n', [...itemKeys].sort().join(', '))
console.log('\n=== похожие на картинку ===\n', [...imageish].sort().join(', ') || '(нет)')

// Полный дамп 2 первых сервисов целиком.
console.log('\n=== первые 2 сервиса целиком ===')
console.log(JSON.stringify(items.slice(0, 2), null, 2))
process.exit(0)
