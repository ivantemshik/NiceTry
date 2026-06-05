// Временный диагностический скрипт: локализует висяк в sync-approute.
// Замеряет каждый шаг с таймаутами. Запуск: node scripts/_diag-approute.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function loadEnv() {
  try {
    const raw = readFileSync(join(root, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
    }
  } catch {}
}
loadEnv()

const baseUrl = (process.env.APPROUTE_BASE_URL || '').trim().replace(/\/+$/, '')
const apiKey = (process.env.APPROUTE_API_KEY || '').trim()
const proxyUrl = (process.env.APPROUTE_OUTBOUND_PROXY || '').trim()
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const t = () => new Date().toISOString().slice(11, 23)
const log = (...a) => console.log(t(), ...a)

const catMap = JSON.parse(readFileSync(join(root, 'src/data/approute-category-map.json'), 'utf8'))
const catalog = JSON.parse(readFileSync(join(root, 'src/data/catalog.json'), 'utf8'))
const KNOWN = new Set(catMap.categories.map((c) => c.slug))
function mapServiceToSlug(svc) {
  if (svc.categoryName && KNOWN.has(svc.categoryName)) return svc.categoryName
  const hay = [svc.categoryName, svc.subcategoryName, svc.section, svc.name].filter(Boolean).join(' ').toLowerCase()
  if (!hay.trim()) return null
  for (const entry of catMap.categories) {
    if (entry.keywords.some((kw) => hay.includes(kw.toLowerCase()))) return entry.slug
  }
  return null
}

async function main() {
  log('START diag')

  // --- ШАГ 1: fetchLiveServices через undici ProxyAgent (как в sync) ---
  log('STEP1 fetch /api/v1/services через прокси...')
  let services = []
  try {
    const init = { headers: { 'X-API-Key': apiKey, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(40000) }
    if (proxyUrl) {
      const { ProxyAgent } = await import('undici')
      init.dispatcher = new ProxyAgent(proxyUrl)
    }
    const t0 = Date.now()
    const res = await fetch(baseUrl + '/api/v1/services', init)
    log(`STEP1 ответ получен HTTP ${res.status}, ${Date.now() - t0}ms, читаю json...`)
    const env = await res.json()
    log(`STEP1 json распаршен, ${Date.now() - t0}ms, statusCode=${env.statusCode}, items=${env.data?.items?.length}`)
    services = env.data?.items ?? []
  } catch (e) {
    log('STEP1 ОШИБКА/таймаут:', e.name, e.message)
  }

  // --- ШАГ 2: сколько товаров реально замаппится ---
  const approuteCats = catalog.categories.filter((c) => c.supplier === 'approute')
  const knownSlugs = new Set(approuteCats.map((c) => c.slug))
  let productRows = 0, mappedSvc = 0, skippedSvc = 0
  const bySlug = {}
  for (const svc of services) {
    const slug = mapServiceToSlug(svc)
    if (!slug || !knownSlugs.has(slug)) { skippedSvc++; continue }
    mappedSvc++
    bySlug[slug] = (bySlug[slug] || 0) + 1
    if (svc.type === 'dtu') { productRows += 1 }
    else {
      const regions = svc.regions && svc.regions.length ? svc.regions : [null]
      productRows += (svc.items?.length || 0) * regions.length
    }
  }
  log(`STEP2 маппинг: сервисов всего=${services.length}, замаплено=${mappedSvc}, пропущено=${skippedSvc}`)
  log(`STEP2 ожидаемых строк-товаров (SKU)=${productRows}`, JSON.stringify(bySlug))

  // --- ШАГ 3: запрос к Supabase (тест прямого соединения) ---
  log('STEP3 Supabase select с таймаутом 15с...')
  try {
    const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } })
    const t0 = Date.now()
    const { data, error } = await supabase
      .from('products').select('id').eq('supplier', 'approute').limit(1)
      .abortSignal(AbortSignal.timeout(15000))
    log(`STEP3 ответ ${Date.now() - t0}ms, error=${error?.message || 'нет'}, rows=${data?.length}`)
  } catch (e) {
    log('STEP3 ОШИБКА/таймаут:', e.name, e.message)
  }

  // --- ШАГ 4: тест ЗАПИСИ (update существующей approute-строки) с таймаутом ---
  log('STEP4 Supabase WRITE-тест (update) с таймаутом 15с...')
  try {
    const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } })
    const { data: one } = await supabase.from('products').select('id,name').eq('supplier', 'approute').limit(1).single()
    if (!one) { log('STEP4 нет approute-строк для теста'); }
    else {
      const t0 = Date.now()
      const { error } = await supabase.from('products').update({ name: one.name }).eq('id', one.id).abortSignal(AbortSignal.timeout(15000))
      log(`STEP4 WRITE ответ ${Date.now() - t0}ms, error=${error?.message || 'нет'}`)
    }
  } catch (e) {
    log('STEP4 WRITE ОШИБКА/таймаут:', e.name, e.message)
  }

  // --- ШАГ 5: серия из 10 upsert-циклов (select+update) как в реальном синке, замер ---
  log('STEP5 10 итераций select+update (как в sync), замер...')
  try {
    const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } })
    const { data: rows } = await supabase.from('products').select('id,name').eq('supplier', 'approute').limit(10)
    const t0 = Date.now()
    for (const r of rows || []) {
      await supabase.from('products').select('id').eq('id', r.id).maybeSingle().abortSignal(AbortSignal.timeout(15000))
      await supabase.from('products').update({ name: r.name }).eq('id', r.id).abortSignal(AbortSignal.timeout(15000))
    }
    const ms = Date.now() - t0
    log(`STEP5 10 циклов за ${ms}ms (~${Math.round(ms / 10)}ms/товар) -> прогноз на 2193: ${Math.round((ms / 10) * 2193 / 1000)}с`)
  } catch (e) {
    log('STEP5 ОШИБКА/таймаут:', e.name, e.message)
  }

  log('DONE diag')
  process.exit(0)
}
main()
