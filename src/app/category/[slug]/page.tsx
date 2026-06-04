'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Product, Category } from '@/types'
import { PCard } from '@/components/PCard'
import Breadcrumbs from '@/components/Breadcrumbs'
import Spinner from '@/components/ui/Spinner'
import Link from 'next/link'

export default function CategoryPage() {
  const params = useParams()
  const slug = params.slug as string

  const [category, setCategory] = useState<Category | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    Promise.all([
      fetch('/api/categories').then((res) => res.json()),
      fetch('/api/products?limit=200').then((res) => res.json()),
    ])
      .then(([categoriesData, productsData]) => {
        const foundCategory = categoriesData.categories?.find((c: Category) => c.slug === slug)
        setCategory(foundCategory || null)
        if (foundCategory) {
          const filteredProducts = productsData.products?.filter(
            (p: Product) => p.category_id === foundCategory.id
          )
          setProducts(filteredProducts || [])
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load category:', err)
        setLoading(false)
      })
  }, [slug])

  if (loading) {
    return (
      <div className="container py-8">
        <Spinner label="Загрузка категории…" />
      </div>
    )
  }

  if (!category) {
    return (
      <div className="container py-10">
        <div className="empty-state card max-w-lg mx-auto">
          <div className="ico">
            <svg className="ic" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h3>Категория не найдена</h3>
          <p>Возможно, ссылка устарела. Загляните в общий каталог — нужный товар наверняка там.</p>
          <Link href="/catalog" className="btn btn-primary mt-1">В каталог</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-6 sm:py-8">
      <Breadcrumbs
        items={[
          { label: 'Главная', href: '/' },
          { label: 'Каталог', href: '/catalog' },
          { label: category.name },
        ]}
      />

      <div className="flex items-center gap-3 mb-6">
        {category.icon && (
          <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-2xl flex-none">
            {category.icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate">{category.name}</h1>
          <p className="text-muted text-sm mt-0.5">
            {products.length > 0 ? `${products.length} товаров` : 'Категория'}
          </p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="empty-state card">
          <div className="ico">
            <svg className="ic" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="M4 9h16" />
            </svg>
          </div>
          <h3>В этой категории пока нет товаров</h3>
          <p>Мы регулярно добавляем новые позиции. А пока посмотрите весь каталог.</p>
          <Link href="/catalog" className="btn btn-secondary mt-1">Посмотреть все товары</Link>
        </div>
      ) : (
        <div className="prod-grid">
          {products.map((product) => (
            <PCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
