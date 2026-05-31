// Единый построитель каталога из поставщиков (AppRoute + Dessly) + ручные товары.
// Используется:
//   1) импортёром /api/products/import — запись в Supabase (боевой путь);
//   2) фолбэком витрины (/api/products, /api/products/[id], /api/categories), когда БД
//      пуста или недоступна — чтобы каталог был виден сразу, ещё до сидинга/ключей.
//
// Формула цены (§5.3 ТЗ): price_rub = ceil(price_usd * usd_to_rub_rate * (1 + markup%/100)).
// Наценка и курс берутся из категории (плейсхолдеры в catalog.json, редактируются в админке).

import catalog from '@/data/catalog.json'
import { listServices, type AppRouteService } from '@/lib/approute'
import { listGames, type DesslyGame } from '@/lib/dessly'
import type { Product, Category, ProductType } from '@/types'

export interface CatalogCategory extends Category {
  usd_to_rub_rate: number
}

type RawCategory = (typeof catalog.categories)[number]

/**
 * Цена в рублях по формуле ТЗ: price_rub = ceil(price_usd × rate × (1 + markup%/100)).
 * Используем целочисленный множитель (100+markup)/100 вместо (1+markup/100), иначе ошибка
 * двоичного представления даёт +1: например 800×1.14 = 912.0000000000001 → ceil = 913,
 * тогда как по ТЗ должно быть ровно 912 (10$ ×80 +14%).
 */
export function priceRub(priceUsd: number, rate: number, markupPercent: number): number {
  return Math.ceil((priceUsd * rate * (100 + markupPercent)) / 100)
}

function catFromRaw(raw: RawCategory): CatalogCategory {
  return {
    id: raw.slug, // в фолбэк-режиме идентификатор категории = slug
    name: raw.name,
    slug: raw.slug,
    icon: raw.icon,
    markup_percent: raw.markup_percent,
    usd_to_rub_rate: raw.usd_to_rub_rate,
    supplier: raw.supplier as 'approute' | 'dessly',
    is_active: true,
    sort_order: raw.sort_order,
  }
}

export function buildCategories(): CatalogCategory[] {
  return catalog.categories.map(catFromRaw).sort((a, b) => a.sort_order - b.sort_order)
}

function categoryBySlug(slug: string): CatalogCategory | undefined {
  return buildCategories().find((c) => c.slug === slug)
}

const NOW = new Date(0).toISOString() // детерминированная метка в фолбэк-режиме

function appRouteProducts(services: AppRouteService[]): Product[] {
  const products: Product[] = []
  for (const svc of services) {
    const cat = categoryBySlug(svc.categoryName || '')
    if (!cat) continue
    const isDtu = svc.type === 'dtu'
    const productType: ProductType = isDtu ? 'topup_auto' : 'instant'

    if (isDtu) {
      // Пополнение (авто): один товар на сервис, цена вводится пользователем.
      const minUsd = svc.minAmountUsd ?? 1
      const maxUsd = svc.maxAmountUsd ?? 500
      products.push({
        id: svc.id,
        name: svc.name,
        description: svc.description || '',
        type: productType,
        category_id: cat.id,
        category: { name: cat.name, slug: cat.slug },
        price: 0,
        stock: undefined,
        is_active: true,
        supplier: 'approute',
        supplier_id: svc.id,
        denomination_id: svc.items[0]?.id,
        min_amount: priceRub(minUsd, cat.usd_to_rub_rate, cat.markup_percent),
        max_amount: priceRub(maxUsd, cat.usd_to_rub_rate, cat.markup_percent),
        supplier_fields: svc.fields ?? null,
        created_at: NOW,
        updated_at: NOW,
      })
      continue
    }

    // shop: отдельный товар на каждый номинал (denomination).
    for (const den of svc.items) {
      products.push({
        id: den.id,
        name: `${svc.name} — ${den.name}`,
        description: svc.description || '',
        type: productType,
        category_id: cat.id,
        category: { name: cat.name, slug: cat.slug },
        price: priceRub(den.price, cat.usd_to_rub_rate, cat.markup_percent),
        stock: den.inStock ? 100 : 0,
        is_active: den.inStock,
        supplier: 'approute',
        supplier_id: svc.id,
        denomination_id: den.id,
        created_at: NOW,
        updated_at: NOW,
      })
    }
  }
  return products
}

function desslyProducts(games: DesslyGame[]): Product[] {
  const cat = categoryBySlug('dessly-games')
  if (!cat) return []
  return games.map((g) => ({
    id: g.id,
    name: g.name,
    description: `${g.platform} • отправка игры гифтом`,
    type: 'instant' as ProductType,
    category_id: cat.id,
    category: { name: cat.name, slug: cat.slug },
    price: priceRub(g.price, cat.usd_to_rub_rate, cat.markup_percent),
    stock: g.inStock ? 50 : 0,
    is_active: g.inStock,
    supplier: 'dessly' as const,
    supplier_id: g.id,
    denomination_id: g.id,
    created_at: NOW,
    updated_at: NOW,
  }))
}

function manualProducts(): Product[] {
  return catalog.manualProducts.map((m, i) => {
    const cat = categoryBySlug(m.categorySlug)
    const anyM = m as typeof m & { price_rub?: number }
    return {
      id: `manual-${i}-${m.categorySlug}`,
      name: m.name,
      description: m.description || '',
      type: m.type as ProductType,
      category_id: cat?.id || m.categorySlug,
      category: cat ? { name: cat.name, slug: cat.slug } : undefined,
      price: anyM.price_rub ?? 0,
      is_active: true,
      supplier: (cat?.supplier || 'approute') as 'approute' | 'dessly',
      created_at: NOW,
      updated_at: NOW,
    }
  })
}

/**
 * Полный нормализованный каталог из поставщиков (мок или боевой режим — прозрачно).
 */
export async function buildCatalogProducts(): Promise<Product[]> {
  const [services, games] = await Promise.all([
    listServices().catch((e) => {
      console.error('[catalog] listServices failed:', e)
      return [] as AppRouteService[]
    }),
    listGames().catch((e) => {
      console.error('[catalog] listGames failed:', e)
      return [] as DesslyGame[]
    }),
  ])

  let sort = 0
  const all = [...appRouteProducts(services), ...desslyProducts(games), ...manualProducts()]
  return all.map((p) => ({ ...p, sort_order: sort++ } as Product & { sort_order: number }))
}
