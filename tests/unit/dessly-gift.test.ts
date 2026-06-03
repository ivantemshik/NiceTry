import { describe, it, expect } from 'vitest'
import {
  computeGiftTotal,
  resolveSendGameMode,
  isSteamInviteUrl,
  DESSLY_REGIONS,
  DESSLY_SERVICE_COMMISSION_PERCENT_DEFAULT,
} from '@/lib/dessly-gift'

// Блок B2: чистые хелперы экрана «Отправь игру в стим».

describe('computeGiftTotal — расчёт «К оплате» (цена + комиссия %)', () => {
  it('комиссия 4% на скрине: 1000 ₽ + 4% = 1040 ₽', () => {
    expect(computeGiftTotal(1000, 4)).toEqual({ price: 1000, commission: 40, total: 1040 })
  })

  it('округляет комиссию до рубля', () => {
    // 1999 * 4% = 79.96 → 80
    expect(computeGiftTotal(1999, 4)).toEqual({ price: 1999, commission: 80, total: 2079 })
  })

  it('комиссия 0% → к оплате равно цене', () => {
    expect(computeGiftTotal(500, 0)).toEqual({ price: 500, commission: 0, total: 500 })
  })

  it('отрицательная/невалидная цена → 0, без NaN', () => {
    expect(computeGiftTotal(-100, 4)).toEqual({ price: 0, commission: 0, total: 0 })
    expect(computeGiftTotal(NaN, 4)).toEqual({ price: 0, commission: 0, total: 0 })
  })

  it('невалидная комиссия трактуется как 0%', () => {
    expect(computeGiftTotal(1000, NaN)).toEqual({ price: 1000, commission: 0, total: 1000 })
    expect(computeGiftTotal(1000, -5)).toEqual({ price: 1000, commission: 0, total: 1000 })
  })

  it('округляет дробную цену до рубля перед расчётом', () => {
    expect(computeGiftTotal(1000.4, 10)).toEqual({ price: 1000, commission: 100, total: 1100 })
  })
})

describe('resolveSendGameMode — выбор embed/native точки входа', () => {
  it('без WIDGET_URL → native (текущий основной путь)', () => {
    expect(resolveSendGameMode(undefined)).toEqual({ mode: 'native' })
    expect(resolveSendGameMode(null)).toEqual({ mode: 'native' })
    expect(resolveSendGameMode('')).toEqual({ mode: 'native' })
  })

  it('плейсхолдеры не считаются валидным окном → native', () => {
    expect(resolveSendGameMode('your_dessly_widget_url')).toEqual({ mode: 'native' })
    expect(resolveSendGameMode('TODO')).toEqual({ mode: 'native' })
    expect(resolveSendGameMode('changeme')).toEqual({ mode: 'native' })
  })

  it('не-URL строка → native (а не битый embed)', () => {
    expect(resolveSendGameMode('просто текст')).toEqual({ mode: 'native' })
    expect(resolveSendGameMode('ftp://x')).toEqual({ mode: 'native' })
  })

  it('валидный http(s) URL → embed с этим URL', () => {
    expect(resolveSendGameMode('https://widget.dessly.example/send')).toEqual({
      mode: 'embed',
      url: 'https://widget.dessly.example/send',
    })
    expect(resolveSendGameMode('  https://w.example  ')).toEqual({
      mode: 'embed',
      url: 'https://w.example',
    })
  })
})

describe('isSteamInviteUrl — реэкспортируется и доступен хелперам B2', () => {
  it('валидная короткая ссылка', () => {
    expect(isSteamInviteUrl('https://s.team/p/abcd-1234')).toBe(true)
  })
  it('невалидная ссылка', () => {
    expect(isSteamInviteUrl('https://example.com/p/abcd')).toBe(false)
  })
})

describe('константы экрана', () => {
  it('комиссия по умолчанию 4% (как на скрине)', () => {
    expect(DESSLY_SERVICE_COMMISSION_PERCENT_DEFAULT).toBe(4)
  })
  it('регионы включают RU первым', () => {
    expect(DESSLY_REGIONS[0]).toBe('RU')
    expect(DESSLY_REGIONS).toContain('KZ')
  })
})
