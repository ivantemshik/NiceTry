import { describe, it, expect } from 'vitest'
import {
  applyPromoCode,
  calculateDiscount,
  formatNumber,
  truncate,
  generateReferralCode,
  generateOrderNumber,
} from '@/lib/utils'

describe('applyPromoCode (utils)', () => {
  it('процентный: 10% от 1000 = 900', () => {
    expect(applyPromoCode(1000, 'percent', 10)).toBe(900)
  })
  it('фиксированный: 1000 - 300 = 700', () => {
    expect(applyPromoCode(1000, 'fixed', 300)).toBe(700)
  })
  it('фиксированный больше суммы → не отрицателен', () => {
    expect(applyPromoCode(200, 'fixed', 500)).toBe(0)
  })
})

describe('calculateDiscount (utils)', () => {
  it('скидка 8% от 1000 = 920 к оплате', () => {
    expect(calculateDiscount(1000, 8)).toBe(920)
  })
  it('0% → без изменений', () => {
    expect(calculateDiscount(1000, 0)).toBe(1000)
  })
})

describe('formatNumber — локализация ₽ (разделитель тысяч)', () => {
  it('форматирует с пробелом-разделителем тысяч (ru-RU)', () => {
    // Intl ru-RU использует неразрывный пробел (U+00A0) как разделитель групп.
    const s = formatNumber(1499)
    expect(s.replace(/ /g, ' ')).toBe('1 499')
  })
})

describe('truncate', () => {
  it('короче лимита — без изменений', () => {
    expect(truncate('abc', 10)).toBe('abc')
  })
  it('длиннее лимита — обрезает с многоточием', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde...')
  })
})

describe('generateReferralCode', () => {
  it('8 символов A-Z0-9', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode()
      expect(code).toMatch(/^[A-Z0-9]{8}$/)
    }
  })
  it('коды различаются (не константа)', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateReferralCode()))
    expect(set.size).toBeGreaterThan(90)
  })
})

describe('generateOrderNumber', () => {
  it('формат NT-XXXXXX', () => {
    expect(generateOrderNumber()).toMatch(/^NT-\d{6}$/)
  })
})
