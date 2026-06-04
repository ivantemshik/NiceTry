import { describe, it, expect } from 'vitest'
import {
  proxyPriceRub,
  validateProxyRequest,
  DEFAULT_PROXY_SETTINGS,
} from '@/lib/proxy-pricing'

describe('proxyPriceRub', () => {
  it('RUB: наценка применяется и округляется вверх', () => {
    // 100 ₽ × 1.30 = 130
    expect(proxyPriceRub(100, 'RUB', 30, 100)).toBe(130)
    // 99 ₽ × 1.30 = 128.7 → ceil 129
    expect(proxyPriceRub(99, 'RUB', 30, 100)).toBe(129)
  })

  it('USD: переводится по курсу, затем наценка, ceil', () => {
    // 2 USD × 100 = 200 ₽ × 1.30 = 260
    expect(proxyPriceRub(2, 'USD', 30, 100)).toBe(260)
    // 0.05 USD × 90 = 4.5 ₽ × 1.20 = 5.4 → ceil 6
    expect(proxyPriceRub(0.05, 'USD', 20, 90)).toBe(6)
  })

  it('нулевая/отрицательная цена → 0', () => {
    expect(proxyPriceRub(0, 'RUB', 30, 100)).toBe(0)
    expect(proxyPriceRub(-5, 'USD', 30, 100)).toBe(0)
  })

  it('нулевая наценка → только перевод валюты', () => {
    expect(proxyPriceRub(100, 'RUB', 0, 100)).toBe(100)
    expect(proxyPriceRub(1, 'USD', 0, 95)).toBe(95)
  })
})

describe('validateProxyRequest', () => {
  const s = DEFAULT_PROXY_SETTINGS // count<=50, periods [7,14,30,90]

  it('валидный запрос', () => {
    expect(validateProxyRequest(5, 30, s)).toEqual({ ok: true })
  })

  it('count > max_count → отказ', () => {
    const r = validateProxyRequest(51, 30, s)
    expect(r.ok).toBe(false)
  })

  it('count < 1 / нецелое → отказ', () => {
    expect(validateProxyRequest(0, 30, s).ok).toBe(false)
    expect(validateProxyRequest(1.5, 30, s).ok).toBe(false)
  })

  it('период не из списка → отказ', () => {
    const r = validateProxyRequest(5, 31, s)
    expect(r.ok).toBe(false)
  })
})
