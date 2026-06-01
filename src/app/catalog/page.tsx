'use client'

import { useEffect, useState } from 'react'
import { Product, Category } from '@/types'
import { PCard } from '@/components/PCard'
import { ProductFilters, FilterState } from '@/components/ProductFilters'

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  // Поисковый запрос из URL (?search=…) — читаем один раз на клиенте,
  // чтобы переход из шапки реально фильтровал каталог.
  const [initialSearch, setInitialSearch] = useState<string | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    category_id: '',
    type: '',
    supplier: '',
    min_price: '',
    max_price: '',
  })

  useEffect(() => {
    const search = new URLSearchParams(window.location.search).get('search') || ''
    if (search) {
      setInitialSearch(search)
      setFilters((f) => ({ ...f, search }))
    }
    setReady(true)
  }, [])

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories || []))
      .catch((err) => console.error('Failed to load categories:', err))
  }, [])

  useEffect(() => {
    if (!ready) return
    setLoading(true)
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value)
    })
    fetch(`/api/products?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || [])
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load products:', err)
        setLoading(false)
      })
  }, [filters, ready])

  return (
    <div className="container py-6 sm:py-8">
      <div className="mb-5 sm:mb-6">
        <h1>Каталог товаров</h1>
        <p className="text-muted text-sm mt-1">Цифровые товары с моментальной выдачей</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 lg:gap-6 items-start">
        {/* Фильтры */}
        <ProductFilters onFilterChange={setFilters} categories={categories} initial={initialSearch ? { search: initialSearch } : undefined} />

        {/* Список товаров */}
        <div className="min-w-0">
          {loading ? (
            <div className="prod-grid">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="scard">
                  <div className="cover" />
                  <div className="ln" style={{ width: '70%' }} />
                  <div className="ln" style={{ width: '45%', marginBottom: 14 }} />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="empty-state card">
              <div className="ico">
                <svg className="ic" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.2-3.2" />
                </svg>
              </div>
              <h3>Товары не найдены</h3>
              <p>Попробуйте изменить запрос или сбросить фильтры — возможно, нужный товар в другой категории.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 text-sm text-muted">
                Найдено товаров: <span className="font-semibold text-ink">{products.length}</span>
              </div>
              <div className="prod-grid">
                {products.map((product) => (
                  <PCard key={product.id} product={product} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
