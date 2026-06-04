import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getCountry,
  getCount,
  getPrice,
  buy,
  getProxy,
  check,
  prolong,
  remove,
  isLiveMode,
  px6ErrorMessage,
  Px6Error,
  isPx6InsufficientFunds,
  isValidVersion,
  PROXY_VERSIONS,
} from '@/lib/px6'

// По умолчанию тесты герметичны (NICETRY_FORCE_SUPPLIER_MOCK=1 из setup.ts) — мок-режим.

describe('px6: режим и валидация', () => {
  it('по умолчанию мок-режим (форс-мок в setup)', () => {
    expect(isLiveMode()).toBe(false)
  })

  it('isValidVersion принимает 3/4/5/6 и отклоняет прочее', () => {
    expect(isValidVersion(3)).toBe(true)
    expect(isValidVersion(6)).toBe(true)
    expect(isValidVersion(2)).toBe(false)
    expect(isValidVersion('4')).toBe(false)
  })

  it('px6ErrorMessage маппит известные коды и даёт фолбэк', () => {
    expect(px6ErrorMessage(400)).toMatch(/средств/i)
    expect(px6ErrorMessage(100)).toMatch(/авториз/i)
    expect(px6ErrorMessage(99999, 'raw')).toBe('raw')
    expect(px6ErrorMessage(99999)).toMatch(/код 99999/)
  })

  it('isPx6InsufficientFunds распознаёт error_id 400', () => {
    expect(isPx6InsufficientFunds(new Px6Error('x', 400, 200))).toBe(true)
    expect(isPx6InsufficientFunds(new Px6Error('x', 300, 200))).toBe(false)
    expect(isPx6InsufficientFunds(new Error('x'))).toBe(false)
  })
})

describe('px6: мок-методы (форма ответов)', () => {
  it('getCountry → непустой список стран', async () => {
    const list = await getCountry(PROXY_VERSIONS.ipv4)
    expect(list.length).toBeGreaterThan(0)
    expect(list).toContain('ru')
  })

  it('getCount → число > 0', async () => {
    expect(await getCount('ru', PROXY_VERSIONS.ipv4)).toBeGreaterThan(0)
  })

  it('getPrice → price/priceSingle/currency', async () => {
    const p = await getPrice(5, 30, PROXY_VERSIONS.ipv4)
    expect(p.price).toBeGreaterThan(0)
    expect(p.priceSingle).toBeGreaterThan(0)
    expect(p.count).toBe(5)
    expect(p.period).toBe(30)
    expect(['RUB', 'USD']).toContain(p.currency)
  })

  it('buy → выдаёт count прокси с обязательными полями', async () => {
    const res = await buy({ count: 3, period: 30, country: 'ru', version: PROXY_VERSIONS.ipv4, descr: 'idem-1' })
    expect(res.proxies).toHaveLength(3)
    for (const px of res.proxies) {
      expect(px.ip).toBeTruthy()
      expect(px.port).toBeTruthy()
      expect(px.user).toBeTruthy()
      expect(px.pass).toBeTruthy()
      expect(px.dateEnd).toBeTruthy()
    }
  })

  it('getProxy/check/prolong/remove в мок-режиме не падают', async () => {
    expect(await getProxy()).toEqual([])
    expect((await check('1')).valid).toBe(true)
    expect((await prolong(['1', '2'], 30)).period).toBe(30)
    expect(await remove(['1', '2'])).toBe(2)
  })
})

// ============================================================
// Боевые HTTP-пути: стабим global.fetch, включаем live-режим.
// ============================================================

describe('px6: боевой HTTP (stub fetch)', () => {
  const OLD_ENV = { ...process.env }

  beforeEach(() => {
    process.env.NICETRY_FORCE_SUPPLIER_MOCK = '0'
    process.env.PROXY6_API_KEY = 'test-key-123'
    process.env.PROXY6_API_BASE = 'https://px6.link/api'
    process.env.PROXY6_TIMEOUT_MS = '1000'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...OLD_ENV }
  })

  function stubJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
    return vi.fn(async () =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
    )
  }

  it('live-режим включён при валидном ключе', () => {
    expect(isLiveMode()).toBe(true)
  })

  it('getPrice парсит боевой ответ', async () => {
    vi.stubGlobal(
      'fetch',
      stubJson({ status: 'yes', price: 12.5, price_single: 2.5, period: 30, count: 5, currency: 'RUB' })
    )
    const p = await getPrice(5, 30, PROXY_VERSIONS.ipv4)
    expect(p.price).toBe(12.5)
    expect(p.priceSingle).toBe(2.5)
    expect(p.currency).toBe('RUB')
  })

  it('buy парсит list как { id: {...} }', async () => {
    vi.stubGlobal(
      'fetch',
      stubJson({
        status: 'yes',
        order_id: 777,
        count: 2,
        price: 5,
        period: 30,
        country: 'ru',
        currency: 'RUB',
        balance: 95,
        list: {
          '111': { id: 111, ip: '1.2.3.4', host: '1.2.3.4', port: '8080', user: 'u', pass: 'p', type: 'http', country: 'ru', date: 'd', date_end: 'de', descr: 'idem', active: '1' },
          '112': { id: 112, ip: '1.2.3.5', host: '1.2.3.5', port: '8081', user: 'u2', pass: 'p2', type: 'http', country: 'ru', date: 'd', date_end: 'de', descr: 'idem', active: '1' },
        },
      })
    )
    const res = await buy({ count: 2, period: 30, country: 'ru', version: PROXY_VERSIONS.ipv4, descr: 'idem' })
    expect(res.orderId).toBe('777')
    expect(res.balance).toBe(95)
    expect(res.proxies).toHaveLength(2)
    expect(res.proxies[0].ip).toBe('1.2.3.4')
    expect(res.proxies[0].active).toBe(true)
  })

  it('status:no → Px6Error с маппингом error_id', async () => {
    vi.stubGlobal('fetch', stubJson({ status: 'no', error_id: 300, error: 'not enough proxies' }))
    await expect(getCount('ru', PROXY_VERSIONS.ipv4)).rejects.toMatchObject({ errorId: 300 })
  })

  it('недостаточно средств на px6 (error_id 400) → isPx6InsufficientFunds', async () => {
    vi.stubGlobal('fetch', stubJson({ status: 'no', error_id: 400, error: 'no money' }))
    try {
      await buy({ count: 1, period: 30, country: 'ru', version: PROXY_VERSIONS.ipv4 })
      throw new Error('should have thrown')
    } catch (e) {
      expect(isPx6InsufficientFunds(e)).toBe(true)
    }
  })

  it('429 повторяется и затем успешно проходит', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++
        if (calls === 1) return new Response('rate', { status: 429, headers: { 'retry-after': '0' } })
        return new Response(JSON.stringify({ status: 'yes', count: 7 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })
    )
    const c = await getCount('ru', PROXY_VERSIONS.ipv4)
    expect(c).toBe(7)
    expect(calls).toBe(2)
  })

  it('таймаут (abort) → ретраи исчерпаны → Px6Error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal
          if (signal) signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
      })
    )
    await expect(getCount('ru', PROXY_VERSIONS.ipv4)).rejects.toBeInstanceOf(Px6Error)
  }, 10000)

  it('5xx повторяется и исчерпывается в Px6Error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 502 })))
    await expect(getCount('ru', PROXY_VERSIONS.ipv4)).rejects.toMatchObject({ status: 502 })
  })
})
