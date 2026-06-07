// Быстрая проверка egress: TCP-коннект к прокси, прямой запрос к approute.io (без прокси),
// и запрос через прокси — каждый с коротким жёстким таймаутом. Локализует, что висит.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import net from 'node:net'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const l of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
}
const baseUrl = (process.env.APPROUTE_BASE_URL || '').trim().replace(/\/+$/, '')
const apiKey = (process.env.APPROUTE_API_KEY || '').trim()
const proxyUrl = (process.env.APPROUTE_OUTBOUND_PROXY || '').trim()
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)

// 1) TCP-коннект к хосту прокси
const pu = new URL(proxyUrl)
log(`proxy host ${pu.hostname}:${pu.port} — TCP connect (5s)...`)
await new Promise((resolve) => {
  const sock = net.connect({ host: pu.hostname, port: Number(pu.port) })
  const to = setTimeout(() => { log('  TCP: ТАЙМАУТ 5с (прокси не отвечает)'); sock.destroy(); resolve() }, 5000)
  sock.on('connect', () => { clearTimeout(to); log('  TCP: ok (коннект есть)'); sock.end(); resolve() })
  sock.on('error', (e) => { clearTimeout(to); log('  TCP: ОШИБКА', e.code || e.message); resolve() })
})

const { request, ProxyAgent } = await import('undici')

// 2) Прямой запрос к approute.io без прокси (ждём 403/таймаут — но узнаем, жив ли хост)
log('direct approute.io (8s, без прокси)...')
try {
  const res = await request(baseUrl + '/api/v1/services', {
    method: 'GET', headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    headersTimeout: 8000, bodyTimeout: 8000, signal: AbortSignal.timeout(9000),
  })
  log('  direct HTTP', res.statusCode)
  res.body.dump()
} catch (e) { log('  direct ОШИБКА', e.name, e.code || e.message) }

// 3) Через прокси (10s)
log('via proxy (10s)...')
try {
  const res = await request(baseUrl + '/api/v1/services', {
    method: 'GET', headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    headersTimeout: 10000, bodyTimeout: 10000, signal: AbortSignal.timeout(11000),
    dispatcher: new ProxyAgent({ uri: proxyUrl, connectTimeout: 8000 }),
  })
  log('  proxy HTTP', res.statusCode)
  res.body.dump()
} catch (e) { log('  proxy ОШИБКА', e.name, e.code || e.message) }

log('done')
process.exit(0)
