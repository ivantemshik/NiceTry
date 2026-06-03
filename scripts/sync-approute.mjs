// Синхронизация каталога AppRoute в Supabase.
// Запуск: npm run sync:approute
//
// Источник позиций:
//   - БОЕВОЙ режим (заданы валидные APPROUTE_BASE_URL + APPROUTE_API_KEY): тянет GET /api/v1/services
//     из реального AppRoute, маппит таксономию поставщика → внутренние категории по ключевым словам
//     (src/data/approute-category-map.json).
//   - ФОЛБЭК (ключ/URL — плейсхолдеры): берёт мок-каталог из src/data/catalog.json, чтобы витрина
//     оставалась наполненной без боевого ключа (деградация без ключей, §7 правил сессии).
//
// Идемпотентно: апсерт по (supplier, supplier_service_id, denomination_id) — повторный запуск не плодит дубли.
// Цена: ceil(usd * rate * (100 + markup) / 100) целочисленным множителем (без off-by-one).
// Регионы PSN (US/PL/DE/FR/TR/IN/UK) разворачиваются в отдельные SKU.
//
// Использует SUPABASE_SERVICE_ROLE_KEY (обходит RLS). Только AppRoute-категории (Dessly — отдельно).

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
  } catch {
    /* .env.local может отсутствовать — используем process.env */
  }
}
loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Не заданы NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
const catalog = JSON.parse(readFileSync(join(root, 'src/data/catalog.json'), 'utf8'))
const catMap = JSON.parse(readFileSync(join(root, 'src/data/approute-category-map.json'), 'utf8'))

const PLACEHOLDERS = new Set(['', 'your_approute_api_key', 'your_approute_base_url', 'TODO', 'changeme'])
const baseUrl = (process.env.APPROUTE_BASE_URL || '').trim().replace(/\/+$/, '')
const apiKey = (process.env.APPROUTE_API_KEY || '').trim()
const FORCE_MOCK = process.env.NICETRY_FORCE_SUPPLIER_MOCK === '1'
const isLive =
  !FORCE_MOCK &&
  !PLACEHOLDERS.has(baseUrl) &&
  !PLACEHOLDERS.has(apiKey) &&
  /^https?:\/\//i.test(baseUrl) &&
  apiKey.length > 0

const priceRub = (usd, rate, markup) => Math.ceil((usd * rate * (100 + markup)) / 100)

// Маппинг сервиса AppRoute → внутренний slug по ключевым словам (зеркало src/lib/approute/category-map.ts).
const KNOWN = new Set(catMap.categories.map((c) => c.slug))
function mapServiceToSlug(svc) {
  if (svc.categoryName && KNOWN.has(svc.categoryName)) return svc.categoryName
  const hay = [svc.categoryName, svc.subcategoryName, svc.section, svc.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (!hay.trim()) return null
  for (const entry of catMap.categories) {
    if (entry.keywords.some((kw) => hay.includes(kw.toLowerCase()))) return entry.slug
  }
  return null
}

// Боевой запрос списка сервисов AppRoute (envelope { data: { items } }).
async function fetchLiveServices() {
  const res = await fetch(baseUrl + '/api/v1/services', {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    cache: 'no-store',
  })
  const env = await res.json()
  // statusCode 0/1/2 — не ошибка (см. types.ts). Иначе бросаем.
  if (![0, 1, 2].includes(env.statusCode)) {
    throw new Error(`AppRoute error statusCode=${env.statusCode}: ${env.statusMessage || ''}`)
  }
  return env.data?.items ?? []
}

// Фолбэк: сервисы из мок-каталога в форме AppRouteService.
function fallbackServices() {
  return catalog.approuteServices.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.ordersType,
    categoryName: s.categorySlug,
    description: s.description,
    minAmountUsd: s.minAmountUsd,
    maxAmountUsd: s.maxAmountUsd,
    regions: s.regions,
    fields: s.fields,
    items: s.items,
  }))
}

async function run() {
  console.log(isLive ? 'AppRoute: БОЕВОЙ режим (реальный API)' : 'AppRoute: ФОЛБЭК (мок-каталог из catalog.json)')

  // 1) Категории AppRoute (без dessly-games) → upsert, карта slug→id.
  const slugToId = {}
  const rateBySlug = {}
  const markupBySlug = {}
  const approuteCats = catalog.categories.filter((c) => c.supplier === 'approute')
  for (const c of approuteCats) {
    rateBySlug[c.slug] = c.usd_to_rub_rate
    markupBySlug[c.slug] = c.markup_percent
    const { data: existing } = await supabase.from('categories').select('id').eq('slug', c.slug).maybeSingle()
    const row = {
      name: c.name, slug: c.slug, icon: c.icon, markup_percent: c.markup_percent,
      usd_to_rub_rate: c.usd_to_rub_rate, supplier: c.supplier, is_active: true, sort_order: c.sort_order,
    }
    if (existing) {
      await supabase.from('categories').update(row).eq('id', existing.id)
      slugToId[c.slug] = existing.id
    } else {
      const { data } = await supabase.from('categories').insert(row).select('id').single()
      slugToId[c.slug] = data?.id
    }
  }

  // 2) Сервисы → товары (идемпотентный апсерт).
  const services = isLive ? await fetchLiveServices() : fallbackServices()
  let imported = 0
  let updated = 0
  let skipped = 0
  let sort = 0

  const upsertProduct = async (row, denomId) => {
    let qq = supabase
      .from('products')
      .select('id')
      .eq('supplier', 'approute')
      .eq('supplier_service_id', row.supplier_service_id)
    qq = denomId ? qq.eq('denomination_id', denomId) : qq.is('denomination_id', null)
    const { data: existing } = await qq.maybeSingle()
    if (existing) {
      await supabase.from('products').update(row).eq('id', existing.id)
      updated++
    } else {
      await supabase.from('products').insert(row)
      imported++
    }
  }

  for (const svc of services) {
    const slug = mapServiceToSlug(svc)
    if (!slug || !slugToId[slug]) {
      skipped++
      continue
    }
    const categoryId = slugToId[slug]
    const rate = rateBySlug[slug]
    const markup = markupBySlug[slug]

    if (svc.type === 'dtu') {
      const denomId = svc.items?.[0]?.id || null
      await upsertProduct(
        {
          name: svc.name, description: svc.description || '', type: 'topup_auto', category_id: categoryId,
          price: 0, is_active: true, supplier: 'approute', supplier_service_id: svc.id, denomination_id: denomId,
          min_amount: priceRub(svc.minAmountUsd ?? 1, rate, markup),
          max_amount: priceRub(svc.maxAmountUsd ?? 500, rate, markup),
          supplier_fields: svc.fields || null, sort_order: sort++,
        },
        denomId
      )
    } else {
      const regions = svc.regions && svc.regions.length ? svc.regions : [null]
      for (const den of svc.items) {
        for (const region of regions) {
          const denomId = region ? `${den.id}_${region.toLowerCase()}` : den.id
          const nameSuffix = region ? ` (${region})` : ''
          await upsertProduct(
            {
              name: `${svc.name} — ${den.name}${nameSuffix}`, description: svc.description || '', type: 'instant',
              category_id: categoryId, price: priceRub(den.price, rate, markup),
              stock: den.inStock ? 100 : 0, is_active: den.inStock, supplier: 'approute',
              supplier_service_id: svc.id, denomination_id: denomId, sort_order: sort++,
            },
            denomId
          )
        }
      }
    }
  }

  console.log(`Категорий AppRoute: ${approuteCats.length}`)
  console.log(`Товаров: добавлено ${imported}, обновлено ${updated}, пропущено (вне категорий) ${skipped}`)
  console.log('Готово.')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
