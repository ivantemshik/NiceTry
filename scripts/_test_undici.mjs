// Точечный тест egress к AppRoute через undici ProxyAgent.
// Цель: понять, почему undici висит, когда curl через тот же прокси отдаёт 200 за ~10с.
// Запуск: node scripts/_test_undici.mjs
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
const URL = baseUrl + '/api/v1/services'

const t = () => new Date().toISOString().slice(11, 23)
const log = (...a) => console.log(t(), ...a)

const undici = await import('undici')
log('undici version:', undici.default?.version || process.versions.undici || '?')

// --- Тест A: ProxyAgent + undici.request (низкоуровневый, без fetch-обёртки) ---
async function testRequest() {
  log('A: undici.request через ProxyAgent, 90с...')
  const dispatcher = new undici.ProxyAgent({ uri: proxyUrl })
  const t0 = Date.now()
  try {
    const res = await undici.request(URL, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      dispatcher,
      headersTimeout: 90000,
      bodyTimeout: 90000,
    })
    log(`A: статус ${res.statusCode} за ${Date.now() - t0}ms, читаю тело...`)
    const text = await res.body.text()
    log(`A: тело ${text.length} байт за ${Date.now() - t0}ms`)
  } catch (e) {
    log(`A: ОШИБКА за ${Date.now() - t0}ms:`, e.name, e.message, e.code || '')
  } finally {
    await dispatcher.close().catch(() => {})
  }
}

// --- Тест B: fetch + ProxyAgent, но БЕЗ AbortSignal (вдруг сигнал и есть причина) ---
async function testFetchNoSignal() {
  log('B: fetch через ProxyAgent, без AbortSignal, 90с собственный таймер...')
  const dispatcher = new undici.ProxyAgent({ uri: proxyUrl })
  const t0 = Date.now()
  const timer = setTimeout(() => log('B: всё ещё висит на 60с...'), 60000)
  try {
    const res = await fetch(URL, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      dispatcher,
    })
    log(`B: статус ${res.status} за ${Date.now() - t0}ms, читаю json...`)
    const j = await res.json()
    log(`B: json ok за ${Date.now() - t0}ms, items=${j?.data?.items?.length}`)
  } catch (e) {
    log(`B: ОШИБКА за ${Date.now() - t0}ms:`, e.name, e.message, e.code || '')
  } finally {
    clearTimeout(timer)
    await dispatcher.close().catch(() => {})
  }
}

await testRequest()
await testFetchNoSignal()
log('DONE')
process.exit(0)
