import { describe, it, expect } from 'vitest'
import {
  mapServiceToCategorySlug,
  normalizeRegion,
  extractRegion,
  PSN_REGIONS,
  REQUIRED_CATEGORY_SLUGS,
} from '@/lib/approute/category-map'

describe('AppRoute → внутренние категории: маппинг по ключевым словам', () => {
  it('быстрый путь: categoryName уже является известным slug', () => {
    expect(mapServiceToCategorySlug({ name: 'x', categoryName: 'steam' })).toBe('steam')
    expect(mapServiceToCategorySlug({ name: 'x', categoryName: 'valorant-ru' })).toBe('valorant-ru')
  })

  it('маппит по названию сервиса, когда categoryName неизвестен', () => {
    const cases: Array<[string, string]> = [
      ['Steam Wallet Code', 'steam'],
      ['PlayStation Network Card', 'psn'],
      ['Roblox Robux Gift Card', 'roblox'],
      ['Rockstar Shark Card', 'rockstar'],
      ['Apple App Store & iTunes', 'appstore'],
      ['Google Play Voucher', 'google'],
      ['World of Warcraft Game Time', 'wow-time-card'],
      ['Battle.net Balance', 'blizzard'],
      ['Minecraft Java Edition', 'minecraft'],
      ['PUBG Mobile UC', 'pubg-mobile'],
      ['Valorant Points', 'valorant-ru'],
    ]
    for (const [name, slug] of cases) {
      expect(mapServiceToCategorySlug({ name, categoryName: 'Unknown Provider Category' }), name).toBe(slug)
    }
  })

  it('возвращает null для сервиса вне нужных категорий', () => {
    expect(mapServiceToCategorySlug({ name: 'Some Random VPN Subscription', categoryName: 'misc' })).toBeNull()
    expect(mapServiceToCategorySlug({ name: '', categoryName: '' })).toBeNull()
  })

  it('покрывает все 11 целевых категорий AppRoute (без dessly-games)', () => {
    expect(REQUIRED_CATEGORY_SLUGS).toHaveLength(11)
    expect(REQUIRED_CATEGORY_SLUGS).not.toContain('dessly-games')
  })
})

describe('PSN регионы: нормализация и извлечение', () => {
  it('PSN_REGIONS — ровно 7 регионов US/PL/DE/FR/TR/IN/UK', () => {
    expect([...PSN_REGIONS].sort()).toEqual(['DE', 'FR', 'IN', 'PL', 'TR', 'UK', 'US'])
  })

  it('normalizeRegion принимает прямые коды и алиасы', () => {
    expect(normalizeRegion('US')).toBe('US')
    expect(normalizeRegion('us')).toBe('US')
    expect(normalizeRegion('GB')).toBe('UK')
    expect(normalizeRegion('United Kingdom')).toBe('UK')
    expect(normalizeRegion('USA')).toBe('US')
    expect(normalizeRegion('Türkiye')).toBe('TR')
    expect(normalizeRegion('JP')).toBeNull() // не входит в поддерживаемый набор
    expect(normalizeRegion('')).toBeNull()
    expect(normalizeRegion(undefined)).toBeNull()
  })

  it('извлекает регион из countryCode, поля region и текста названия — все 7 регионов', () => {
    for (const r of PSN_REGIONS) {
      // через countryCode сервиса
      expect(extractRegion({ name: 'PSN', countryCode: r })).toBe(r)
      // через поле region номинала
      expect(extractRegion({ name: 'PSN' }, { name: '$10', region: r })).toBe(r)
      // через текст названия номинала "PSN $10 (XX)"
      expect(extractRegion({ name: 'PSN Card' }, { name: `$10 (${r})` })).toBe(r)
    }
  })

  it('регион не определён → null', () => {
    expect(extractRegion({ name: 'Steam $10' })).toBeNull()
  })
})
