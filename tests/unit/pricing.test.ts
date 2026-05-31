import { describe, it, expect } from 'vitest'
import { priceRub, buildCategories, buildCatalogProducts } from '@/lib/catalog'
import catalog from '@/data/catalog.json'

// §5.3 ТЗ: price_rub = ceil(price_usd × rate × (1 + markup%/100)).
describe('priceRub — формула ценообразования ТЗ', () => {
  it('эталонный пример ТЗ: Steam 10$ × 80 × +14% = ровно 912 ₽', () => {
    expect(priceRub(10, 80, 14)).toBe(912)
  })

  it('Steam 5$ × 80 × +14% = 456 ₽', () => {
    expect(priceRub(5, 80, 14)).toBe(456)
  })

  it('Dessly Cyberpunk 59.99$ × 82 × +18% = 5805 ₽', () => {
    expect(priceRub(59.99, 82, 18)).toBe(5805)
  })

  it('не страдает от ошибки двоичного представления (800×1.14 ≠ 913)', () => {
    // Наивная формула ceil(usd*rate*(1+m/100)) дала бы 913 из-за 912.0000000000001.
    expect(priceRub(10, 80, 14)).not.toBe(913)
  })

  it('нулевая цена → 0', () => {
    expect(priceRub(0, 80, 14)).toBe(0)
  })

  it('нулевая наценка → ровно usd × rate', () => {
    expect(priceRub(10, 80, 0)).toBe(800)
    expect(priceRub(25, 80, 0)).toBe(2000)
  })

  it('округление вверх до целого рубля', () => {
    // 1$ × 80 × 1.135 = 90.8 → ceil = 91
    expect(priceRub(1, 80, 13.5)).toBe(91)
    // 3$ × 81.3 × 1.155 = 281.7045 → ceil = 282
    expect(priceRub(3, 81.3, 15.5)).toBe(282)
  })

  it('дробный курс обрабатывается корректно', () => {
    // 10$ × 79.5 × 1.16 = 922.2 → ceil = 923
    expect(priceRub(10, 79.5, 16)).toBe(923)
  })

  it('очень большие суммы не теряют точность', () => {
    // 1_000_000$ × 80 × 1.14 = 91_200_000 ровно
    expect(priceRub(1_000_000, 80, 14)).toBe(91_200_000)
  })

  it('результат всегда целое неотрицательное число', () => {
    for (const usd of [0, 0.01, 1, 4.99, 50, 99.99]) {
      for (const rate of [70, 80, 82.5]) {
        for (const m of [0, 13, 14, 18]) {
          const p = priceRub(usd, rate, m)
          expect(Number.isInteger(p)).toBe(true)
          expect(p).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})

describe('buildCategories — категории каталога', () => {
  it('возвращает все 10 категорий из ТЗ §5.3', () => {
    const cats = buildCategories()
    expect(cats).toHaveLength(10)
    const slugs = cats.map((c) => c.slug)
    for (const s of ['steam', 'psn', 'rockstar', 'roblox', 'appstore', 'google', 'wow-time-card', 'blizzard', 'minecraft', 'dessly-games']) {
      expect(slugs).toContain(s)
    }
  })

  it('отсортированы по sort_order', () => {
    const cats = buildCategories()
    const orders = cats.map((c) => c.sort_order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('Steam: наценка 14%, курс 80 (соответствует примеру ТЗ)', () => {
    const steam = buildCategories().find((c) => c.slug === 'steam')!
    expect(steam.markup_percent).toBe(14)
    expect(steam.usd_to_rub_rate).toBe(80)
  })

  it('Dessly-категория помечена supplier=dessly, остальные — approute', () => {
    const cats = buildCategories()
    expect(cats.find((c) => c.slug === 'dessly-games')!.supplier).toBe('dessly')
    expect(cats.filter((c) => c.slug !== 'dessly-games').every((c) => c.supplier === 'approute')).toBe(true)
  })
})

describe('buildCatalogProducts — нормализованный каталог (мок-режим)', () => {
  it('Steam $10 номинал стоит 912 ₽ в собранном каталоге', async () => {
    const products = await buildCatalogProducts()
    const steam10 = products.find((p) => p.id === 'den_steam_10')
    expect(steam10).toBeDefined()
    expect(steam10!.price).toBe(912)
  })

  it('недоступный номинал (inStock=false) помечается is_active=false, stock=0', async () => {
    const products = await buildCatalogProducts()
    const steam100 = products.find((p) => p.id === 'den_steam_100') // inStock:false в catalog.json
    expect(steam100).toBeDefined()
    expect(steam100!.is_active).toBe(false)
    expect(steam100!.stock).toBe(0)
  })

  it('DTU-сервис превращается в один товар topup_auto с min/max в рублях', async () => {
    const products = await buildCatalogProducts()
    const dtu = products.find((p) => p.id === 'svc_steam_topup')
    expect(dtu).toBeDefined()
    expect(dtu!.type).toBe('topup_auto')
    // min 1$ → priceRub(1,80,14)=92 ; max 500$ → priceRub(500,80,14)=45600
    expect(dtu!.min_amount).toBe(priceRub(1, 80, 14))
    expect(dtu!.max_amount).toBe(priceRub(500, 80, 14))
    expect(dtu!.max_amount!).toBeGreaterThan(dtu!.min_amount!)
  })

  it('все 4 типа выдачи присутствуют в каталоге', async () => {
    const products = await buildCatalogProducts()
    const types = new Set(products.map((p) => p.type))
    expect(types.has('instant')).toBe(true)
    expect(types.has('topup_auto')).toBe(true)
    expect(types.has('topup_manual')).toBe(true)
    expect(types.has('manual')).toBe(true)
  })

  it('товары обоих поставщиков (approute + dessly) присутствуют', async () => {
    const products = await buildCatalogProducts()
    const suppliers = new Set(products.map((p) => p.supplier))
    expect(suppliers.has('approute')).toBe(true)
    expect(suppliers.has('dessly')).toBe(true)
  })

  it('каждый shop-номинал маппится на свою категорию с правильной наценкой', async () => {
    const products = await buildCatalogProducts()
    // PSN $10: наценка 16, курс 80 → priceRub(10,80,16) = 928
    const psn10 = products.find((p) => p.id === 'den_psn_10')
    expect(psn10!.price).toBe(priceRub(10, 80, 16))
    expect(psn10!.category!.slug).toBe('psn')
  })

  it('данные каталога согласованы: каждый approuteService ссылается на существующую категорию', () => {
    const slugs = new Set(catalog.categories.map((c) => c.slug))
    for (const svc of catalog.approuteServices) {
      expect(slugs.has(svc.categorySlug)).toBe(true)
    }
  })
})
