import { describe, it, expect } from 'vitest'
import {
  listServices,
  getService,
  getSteamRates,
  listAccounts,
  listFundsMethods,
  createShopOrder,
  createDtuOrder,
  dtuCheck,
  listOrders,
  waitForOrder,
  unhideVouchers,
  isLiveMode,
  AppRouteError,
} from '@/lib/approute'
import { AppRouteStatusCode } from '@/lib/approute/types'
import { randomUUID } from 'crypto'

// Эти тесты работают в МОК-режиме (APPROUTE_BASE_URL — плейсхолдер). Форма ответов мока
// идентична боевому API, поэтому проверяемая бизнес-логика одинакова в обоих режимах.

describe('AppRoute: режим', () => {
  it('по умолчанию мок-режим (нет реального BASE_URL)', () => {
    expect(isLiveMode()).toBe(false)
  })
})

describe('AppRoute: каталог сервисов', () => {
  it('listServices возвращает непустой список сервисов', async () => {
    const services = await listServices()
    expect(services.length).toBeGreaterThan(0)
    const steam = services.find((s) => s.id === 'svc_steam_giftcard')
    expect(steam).toBeDefined()
    expect(steam!.items.length).toBeGreaterThan(0)
  })

  it('getService по id возвращает сервис', async () => {
    const svc = await getService('svc_steam_giftcard')
    expect(svc).not.toBeNull()
    expect(svc!.name).toContain('Steam')
  })

  it('getService для несуществующего id → null', async () => {
    const svc = await getService('svc_does_not_exist')
    expect(svc).toBeNull()
  })

  it('DTU-сервис содержит обязательные fields (account_reference)', async () => {
    const svc = await getService('svc_steam_topup')
    expect(svc!.type).toBe('dtu')
    expect(svc!.fields?.some((f) => f.key === 'account_reference' && f.required)).toBe(true)
  })
})

describe('AppRoute: курсы Steam', () => {
  it('getSteamRates возвращает RUB-курс', async () => {
    const rates = await getSteamRates(['RUB'])
    expect(rates).not.toBeNull()
    expect(rates!.baseCurrencyCode).toBe('USD')
    const rub = rates!.items.find((r) => r.quoteCurrencyCode === 'RUB')
    expect(rub?.rate).toBeGreaterThan(0)
  })
})

describe('AppRoute: баланс магазина и пополнение', () => {
  it('listAccounts возвращает баланс в USD', async () => {
    const accounts = await listAccounts()
    expect(accounts.length).toBeGreaterThan(0)
    expect(accounts[0].currency).toBe('USD')
    expect(accounts[0].balance).toBeGreaterThan(0)
  })

  it('listFundsMethods возвращает способы пополнения', async () => {
    const methods = await listFundsMethods()
    expect(methods.length).toBeGreaterThan(0)
    expect(methods[0].code).toBeTruthy()
  })
})

describe('AppRoute: покупка кода (shop) — полный цикл с polling и unhide', () => {
  it('createShopOrder → 202/IN_PROGRESS, затем polling до SUCCESS, затем unhide раскрывает код', async () => {
    const referenceId = randomUUID()
    const created = await createShopOrder(referenceId, 'den_steam_10', 1)
    expect(created.data?.orderId).toBeTruthy()
    // Сразу после создания заказ ещё не терминальный (асинхронность).
    expect(created.data?.status).toBe('IN_PROGRESS')

    const orderId = created.data!.orderId
    const settled = await waitForOrder(
      { orderId, referenceId },
      { baseDelayMs: 200, maxDelayMs: 400, maxAttempts: 20 }
    )
    expect(settled?.status).toBe('SUCCESS')

    // До unhide коды маскированы.
    const masked = await listOrders({ orderId, referenceId })
    const maskedVoucher = masked.page.items[0].vouchers?.[0]
    expect(maskedVoucher?.masked).toBe(true)
    expect(maskedVoucher?.pin).toMatch(/^\*\*\*\*/)

    // unhide раскрывает полный код.
    const codes = await unhideVouchers({ orderId, referenceId })
    expect(codes.length).toBe(1)
    expect(codes[0]).not.toMatch(/^\*\*\*\*/)
    expect(codes[0].length).toBeGreaterThan(5)
  })

  it('идемпотентность: повтор того же referenceId не создаёт второй заказ', async () => {
    const referenceId = randomUUID()
    const first = await createShopOrder(referenceId, 'den_steam_20', 1)
    const second = await createShopOrder(referenceId, 'den_steam_20', 1)
    // Тот же orderId возвращается на повтор (IDEMPOTENCY_REPLAY).
    expect(second.data?.orderId).toBe(first.data?.orderId)
  })

  it('unhide без orderId/referenceId запрещён (бросает ошибку)', async () => {
    await expect(listOrders({ unhide: true })).rejects.toThrow(/orderId or referenceId/)
  })
})

describe('AppRoute: пополнение (DTU)', () => {
  it('dtuCheck (checkOnly) возвращает quote и подтверждение аккаунта без referenceId', async () => {
    const check = await dtuCheck('den_steam_dtu', [{ key: 'account_reference', value: 'player123' }])
    expect(check).not.toBeNull()
    expect(check!.canRecharge).toBe(true)
    expect(check!.quote?.currency).toBe('USD')
  })

  it('createDtuOrder возвращает заказ; результат в attributes после settle', async () => {
    const referenceId = randomUUID()
    const created = await createDtuOrder(referenceId, 'den_steam_dtu', [
      { key: 'account_reference', value: 'player123' },
    ])
    expect(created.data?.orderId).toBeTruthy()
    const settled = await waitForOrder(
      { referenceId },
      { baseDelayMs: 200, maxDelayMs: 400, maxAttempts: 20 }
    )
    expect(settled?.status).toBe('SUCCESS')
  })
})

describe('AppRoute: обработка ошибок поставщика (ТЗ §5.4)', () => {
  const cases: Array<[string, AppRouteStatusCode]> = [
    ['force_OUT_OF_STOCK', AppRouteStatusCode.OUT_OF_STOCK],
    ['force_INSUFFICIENT_FUNDS', AppRouteStatusCode.INSUFFICIENT_FUNDS],
    ['force_VALIDATION_ERROR', AppRouteStatusCode.VALIDATION_ERROR],
    ['force_UPSTREAM_ERROR', AppRouteStatusCode.UPSTREAM_ERROR],
    ['force_LIMIT_REACHED', AppRouteStatusCode.LIMIT_REACHED],
    ['force_UNAUTHORIZED', AppRouteStatusCode.UNAUTHORIZED],
    ['force_FORBIDDEN', AppRouteStatusCode.FORBIDDEN],
    ['force_INTERNAL_ERROR', AppRouteStatusCode.INTERNAL_ERROR],
  ]

  for (const [denom, expectedCode] of cases) {
    it(`${denom} → AppRouteError со statusCode=${expectedCode} и traceId`, async () => {
      try {
        await createShopOrder(randomUUID(), denom, 1)
        throw new Error('должна была быть выброшена AppRouteError')
      } catch (e) {
        expect(e).toBeInstanceOf(AppRouteError)
        const err = e as AppRouteError
        expect(err.statusCode).toBe(expectedCode)
        expect(err.traceId).toBeTruthy()
      }
    })
  }
})
