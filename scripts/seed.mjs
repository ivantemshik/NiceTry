// Сидинг каталога в Supabase из src/data/catalog.json.
// Запуск: npm run seed
// Использует SUPABASE_SERVICE_ROLE_KEY (обходит RLS). Идемпотентно (upsert по slug / supplier+denom).
//
// Формула цены (§5.3 ТЗ): price_rub = ceil(price_usd * usd_to_rub_rate * (1 + markup%/100)).
// Работает независимо от наличия ключей поставщиков — берёт товары-плейсхолдеры из catalog.json.
// (Боевой импорт реальных позиций — через админ-эндпоинт POST /api/products/import.)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// --- Загрузка переменных окружения из .env.local (без зависимости от dotenv) ---
function loadEnv() {
  try {
    const raw = readFileSync(join(root, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
    }
  } catch {
    /* .env.local может отсутствовать в CI — используем process.env */
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

// Целочисленный множитель (100+markup)/100 — избегаем ошибки двоичного представления
// (800*1.14 = 912.0000000000001 → ceil дал бы 913 вместо 912 из примера ТЗ).
const priceRub = (usd, rate, markup) => Math.ceil((usd * rate * (100 + markup)) / 100)

async function run() {
  // 1) Категории
  const slugToId = {}
  const rateBySlug = {}
  const markupBySlug = {}
  for (const c of catalog.categories) {
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
  console.log(`Категорий: ${catalog.categories.length}`)

  let products = 0
  const upsertProduct = async (row, matcher) => {
    const q = supabase.from('products').select('id')
    let existing
    if (matcher.supplier_service_id) {
      let qq = q.eq('supplier', row.supplier).eq('supplier_service_id', matcher.supplier_service_id)
      qq = matcher.denomination_id ? qq.eq('denomination_id', matcher.denomination_id) : qq.is('denomination_id', null)
      existing = (await qq.maybeSingle()).data
    } else {
      existing = (await q.eq('name', row.name).maybeSingle()).data
    }
    if (existing) await supabase.from('products').update(row).eq('id', existing.id)
    else { await supabase.from('products').insert(row); products++ }
  }

  // 2) AppRoute services
  let sort = 0
  for (const svc of catalog.approuteServices) {
    const slug = svc.categorySlug
    const categoryId = slugToId[slug]
    if (!categoryId) continue
    const rate = rateBySlug[slug], markup = markupBySlug[slug]
    if (svc.ordersType === 'dtu') {
      await upsertProduct({
        name: svc.name, description: svc.description || '', type: 'topup_auto', category_id: categoryId,
        price: 0, is_active: true, supplier: 'approute', supplier_service_id: svc.id,
        denomination_id: svc.items?.[0]?.id || null,
        min_amount: priceRub(svc.minAmountUsd ?? 1, rate, markup),
        max_amount: priceRub(svc.maxAmountUsd ?? 500, rate, markup),
        supplier_fields: svc.fields || null, sort_order: sort++,
      }, { supplier_service_id: svc.id, denomination_id: svc.items?.[0]?.id })
    } else {
      // Региональные SKU (PSN: US/PL/DE/FR/TR/IN/UK) — каждый регион отдельным товаром.
      const regions = svc.regions && svc.regions.length ? svc.regions : [null]
      for (const den of svc.items) {
        for (const region of regions) {
          const denomId = region ? `${den.id}_${region.toLowerCase()}` : den.id
          const nameSuffix = region ? ` (${region})` : ''
          await upsertProduct({
            name: `${svc.name} — ${den.name}${nameSuffix}`, description: svc.description || '', type: 'instant',
            category_id: categoryId, price: priceRub(den.price, rate, markup),
            stock: den.inStock ? 100 : 0, is_active: den.inStock, supplier: 'approute',
            supplier_service_id: svc.id, denomination_id: denomId, sort_order: sort++,
          }, { supplier_service_id: svc.id, denomination_id: denomId })
        }
      }
    }
  }

  // 3) Dessly games
  const dSlug = 'dessly-games'
  if (slugToId[dSlug]) {
    for (const g of catalog.desslyGames) {
      await upsertProduct({
        name: g.name, description: `${g.platform} • отправка игры гифтом`, type: 'instant',
        category_id: slugToId[dSlug], price: priceRub(g.price, rateBySlug[dSlug], markupBySlug[dSlug]),
        stock: g.inStock ? 50 : 0, is_active: g.inStock, supplier: 'dessly',
        supplier_service_id: g.id, denomination_id: g.id, sort_order: sort++,
      }, { supplier_service_id: g.id, denomination_id: g.id })
    }
  }

  // 4) Ручные товары
  for (const m of catalog.manualProducts) {
    const categoryId = slugToId[m.categorySlug]
    if (!categoryId) continue
    await upsertProduct({
      name: m.name, description: m.description || '', type: m.type, category_id: categoryId,
      price: m.price_rub ?? 0, is_active: true,
      supplier: catalog.categories.find((c) => c.slug === m.categorySlug)?.supplier || 'approute',
      sort_order: sort++,
    }, { name: m.name })
  }

  console.log(`Товаров добавлено: ${products}`)
  console.log('Готово. Откройте сайт — каталог наполнен.')
}

run().catch((e) => { console.error(e); process.exit(1) })
