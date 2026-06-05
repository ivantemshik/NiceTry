import type { ProductType } from '@/types'

/**
 * Группы каталога для навигации в шапке (catnav) и ссылок «?group=…».
 * Пункт шапки — это не одна категория, а набор slug'ов категорий (cats)
 * и/или типов товаров (types). Slug'и — из src/data/catalog.json (та же
 * таксономия, что в БД после seed/import).
 */
export interface CatalogGroup {
  slug: string
  label: string
  /** Slug'и категорий, входящих в группу */
  cats?: string[]
  /** Типы товаров (например, пополнения) */
  types?: ProductType[]
}

export const CATALOG_GROUPS: CatalogGroup[] = [
  { slug: 'steam', label: 'Steam', cats: ['steam'] },
  { slug: 'mobile', label: 'Mobile-игры', cats: ['pubg-mobile', 'roblox'] },
  { slug: 'topup', label: 'Пополнения', types: ['topup_auto', 'topup_manual'] },
  { slug: 'subscriptions', label: 'Подписки', cats: ['wow-time-card'] },
  { slug: 'gift-cards', label: 'Gift-карты', cats: ['steam', 'psn', 'appstore', 'google'] },
  { slug: 'popular', label: 'Популярное', cats: ['steam', 'psn', 'pubg-mobile', 'roblox'] },
]

export function findCatalogGroup(slug: string | null | undefined): CatalogGroup | undefined {
  if (!slug) return undefined
  return CATALOG_GROUPS.find((g) => g.slug === slug)
}
