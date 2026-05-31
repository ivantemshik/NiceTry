import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCatalogProducts } from '@/lib/catalog'
import type { Product } from '@/types'

/**
 * GET /api/products
 * Список товаров с фильтрами. Источник — таблица products (Supabase).
 * Если БД пуста/недоступна, отдаётся сгенерированный каталог из поставщиков (мок→боевой),
 * чтобы витрина была наполнена сразу. Query: category_id, type, supplier, min_price,
 * max_price, search, limit, offset.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const categoryId = searchParams.get('category_id')
  const type = searchParams.get('type')
  const supplier = searchParams.get('supplier')
  const minPrice = searchParams.get('min_price')
  const maxPrice = searchParams.get('max_price')
  const search = searchParams.get('search')
  const limit = clampInt(searchParams.get('limit'), 50, 1, 200)
  const offset = clampInt(searchParams.get('offset'), 0, 0, 100000)

  try {
    const supabase = await createClient()

    let query = supabase
      .from('products')
      .select('*, category:categories(id, name, slug)', { count: 'exact' })
      .eq('is_active', true)

    if (categoryId) query = query.eq('category_id', categoryId)
    if (type) query = query.eq('type', type)
    if (supplier) query = query.eq('supplier', supplier)
    if (minPrice) query = query.gte('price', parseFloat(minPrice))
    if (maxPrice) query = query.lte('price', parseFloat(maxPrice))
    if (search) query = query.ilike('name', `%${search}%`)

    query = query
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: products, error, count } = await query

    if (!error && products && products.length > 0) {
      return NextResponse.json({ products, total: count || products.length, limit, offset })
    }
    // Пустая БД или ошибка — фолбэк на сгенерированный каталог.
    return fallbackResponse({ categoryId, type, supplier, minPrice, maxPrice, search, limit, offset })
  } catch (error) {
    console.error('[products] DB unavailable, using catalog fallback:', error)
    return fallbackResponse({ categoryId, type, supplier, minPrice, maxPrice, search, limit, offset })
  }
}

interface FilterArgs {
  categoryId: string | null
  type: string | null
  supplier: string | null
  minPrice: string | null
  maxPrice: string | null
  search: string | null
  limit: number
  offset: number
}

async function fallbackResponse(f: FilterArgs) {
  try {
    let products = await buildCatalogProducts()
    products = applyFilters(products, f)
    const total = products.length
    const paged = products.slice(f.offset, f.offset + f.limit)
    return NextResponse.json({ products: paged, total, limit: f.limit, offset: f.offset, source: 'catalog-fallback' })
  } catch (e) {
    console.error('[products] fallback failed:', e)
    return NextResponse.json({ products: [], total: 0, limit: f.limit, offset: f.offset })
  }
}

function applyFilters(products: Product[], f: FilterArgs): Product[] {
  return products.filter((p) => {
    if (f.categoryId && p.category_id !== f.categoryId && p.category?.slug !== f.categoryId) return false
    if (f.type && p.type !== f.type) return false
    if (f.supplier && p.supplier !== f.supplier) return false
    if (f.minPrice && p.price < parseFloat(f.minPrice)) return false
    if (f.maxPrice && p.price > parseFloat(f.maxPrice)) return false
    if (f.search && !p.name.toLowerCase().includes(f.search.toLowerCase())) return false
    return p.is_active
  })
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const n = parseInt(raw || '', 10)
  if (Number.isNaN(n)) return def
  return Math.min(max, Math.max(min, n))
}
