// Мок-слой AppRoute. Имитирует реальные ответы API (envelope, statusCode, маскирование,
// асинхронный заказ + polling, unhide) на основе единого каталога src/data/catalog.json.
// Используется, пока в .env.local не заданы реальные APPROUTE_BASE_URL и APPROUTE_API_KEY.
// Форма ответов идентична реальному API, поэтому переключение на боевой режим не требует
// изменений в бизнес-логике (см. approute/client.ts).

import catalog from '@/data/catalog.json'
import {
  AppRouteStatusCode,
  type AppRouteEnvelope,
  type AppRouteService,
  type AppRouteServicesPage,
  type AppRouteBalanceItem,
  type AppRouteFundingMethod,
  type AppRouteSteamRates,
  type AppRouteCreateOrderRequest,
  type AppRouteCreateOrderData,
  type AppRouteDtuCheckData,
  type AppRouteOrdersPage,
  type AppRouteOrderListItem,
  type AppRouteVoucher,
  type AppRouteOrderStatus,
} from './types'

let traceCounter = 0
function nextTraceId(): string {
  traceCounter += 1
  return `mock-trace-${Date.now().toString(36)}-${traceCounter}`
}

function ok<T>(data: T, statusCode = AppRouteStatusCode.OK, statusMessage = 'OK'): AppRouteEnvelope<T> {
  return {
    status: statusCode === AppRouteStatusCode.OK ? 'SUCCESS' : 'OK',
    statusCode,
    statusMessage,
    traceId: nextTraceId(),
    data,
  }
}

// ---- Каталог из catalog.json → форма AppRouteService ----

type RawService = (typeof catalog.approuteServices)[number]

function toService(raw: RawService): AppRouteService {
  const anyRaw = raw as RawService & {
    minAmountUsd?: number
    maxAmountUsd?: number
    regions?: string[]
    fields?: Array<{ key: string; name: string; type: string; required: boolean }>
  }
  return {
    id: raw.id,
    name: raw.name,
    type: raw.ordersType as 'shop' | 'dtu',
    categoryName: raw.categorySlug,
    description: raw.description,
    minAmountUsd: anyRaw.minAmountUsd,
    maxAmountUsd: anyRaw.maxAmountUsd,
    regions: anyRaw.regions,
    fields: anyRaw.fields?.map((f) => ({
      key: f.key,
      name: f.name,
      type: (f.type as 'text' | 'email' | 'phone' | 'number') || 'text',
      required: f.required,
    })),
    items: raw.items.map((it) => ({
      id: it.id,
      name: it.name,
      price: it.price,
      currency: it.currency,
      inStock: it.inStock,
    })),
  }
}

export function mockServices(): AppRouteServicesPage {
  return { items: catalog.approuteServices.map(toService) }
}

export function mockListServices(): AppRouteEnvelope<AppRouteServicesPage> {
  return ok(mockServices())
}

export function mockGetService(id: string): AppRouteEnvelope<AppRouteService | null> {
  const raw = catalog.approuteServices.find((s) => s.id === id)
  if (!raw) {
    return {
      status: 'OK',
      statusCode: AppRouteStatusCode.NOT_FOUND,
      statusMessage: 'Not found',
      traceId: nextTraceId(),
      data: null,
      errors: [{ field: 'id', code: 'NOT_FOUND', message: 'Service not found' }],
    }
  }
  return ok(toService(raw))
}

export function mockAccounts(): AppRouteEnvelope<{ items: AppRouteBalanceItem[] }> {
  return ok({
    items: [
      { currency: 'USD', balance: 1000, available: 950, reserved: 50, overdraftLimit: 0 },
    ],
  })
}

export function mockFundsMethods(): AppRouteEnvelope<{ items: AppRouteFundingMethod[] }> {
  return ok({
    items: [
      {
        code: 'USDT_TRC20',
        name: 'Tether USDT (TRC-20)',
        minAmount: 10,
        commission: 0,
        ttlMinutes: 60,
        confirmationsRequired: 1,
        address: 'TMockAddrXXXXXXXXXXXXXXXXXXXXXXXX',
        memoTag: undefined,
      },
    ],
  })
}

export function mockSteamRates(quotes?: string[]): AppRouteEnvelope<AppRouteSteamRates> {
  const all: AppRouteSteamRates['items'] = [
    { quoteCurrencyCode: 'RUB', rate: 80, fetchedAt: new Date(0).toISOString() },
    { quoteCurrencyCode: 'KZT', rate: 450, fetchedAt: new Date(0).toISOString() },
    { quoteCurrencyCode: 'UAH', rate: 40, fetchedAt: new Date(0).toISOString() },
  ]
  const items = quotes && quotes.length ? all.filter((r) => quotes.includes(r.quoteCurrencyCode)) : all
  return ok({ baseCurrencyCode: 'USD', items })
}

// ---- Заказы: in-memory store для реалистичного polling/unhide ----

interface MockOrder {
  orderId: string
  referenceId: string
  ordersType: 'shop' | 'dtu'
  status: AppRouteOrderStatus
  createdAtMs: number
  denominationId: string
  quantity: number
  fullVouchers: string[] // полные коды (для unhide)
  attributes?: Record<string, string>
}

const orderStore = new Map<string, MockOrder>() // ключ: referenceId
const orderById = new Map<string, MockOrder>() // ключ: orderId

function genVoucher(denominationId: string): string {
  const prefix = denominationId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()
  const seed = (orderStore.size + 1) * 7919
  const body = seed.toString(36).toUpperCase().padStart(8, '0')
  return `${prefix}-${body}-${body.split('').reverse().join('')}`
}

function maskVoucher(code: string): string {
  return '****' + code.slice(-4)
}

/**
 * Симуляция ошибок поставщика для тестов и отладки UI.
 * Если denominationId имеет вид `force_<CODE>` (например `force_OUT_OF_STOCK`), мок возвращает
 * envelope с соответствующим statusCode — клиент (unwrap) бросит AppRouteError, что позволяет
 * проверить обработку всех кодов ошибок из ТЗ §5.4 (OUT_OF_STOCK, INSUFFICIENT_FUNDS,
 * VALIDATION_ERROR, UPSTREAM_ERROR, LIMIT_REACHED/429 и т.д.). Реальные id (`den_steam_10`)
 * этим путём не затрагиваются.
 */
const FORCE_PREFIX = 'force_'
const FORCE_CODES: Record<string, AppRouteStatusCode> = {
  OUT_OF_STOCK: AppRouteStatusCode.OUT_OF_STOCK,
  INSUFFICIENT_FUNDS: AppRouteStatusCode.INSUFFICIENT_FUNDS,
  VALIDATION_ERROR: AppRouteStatusCode.VALIDATION_ERROR,
  UPSTREAM_ERROR: AppRouteStatusCode.UPSTREAM_ERROR,
  LIMIT_REACHED: AppRouteStatusCode.LIMIT_REACHED,
  UNAUTHORIZED: AppRouteStatusCode.UNAUTHORIZED,
  FORBIDDEN: AppRouteStatusCode.FORBIDDEN,
  NOT_FOUND: AppRouteStatusCode.NOT_FOUND,
  CONFLICT: AppRouteStatusCode.CONFLICT,
  INTERNAL_ERROR: AppRouteStatusCode.INTERNAL_ERROR,
}

function forcedErrorEnvelope(
  denominationId: string
): AppRouteEnvelope<AppRouteCreateOrderData | AppRouteDtuCheckData> | null {
  if (!denominationId.startsWith(FORCE_PREFIX)) return null
  const codeName = denominationId.slice(FORCE_PREFIX.length).toUpperCase()
  const statusCode = FORCE_CODES[codeName]
  if (statusCode === undefined) return null
  return {
    status: 'ERROR',
    statusCode,
    statusMessage: codeName.replace(/_/g, ' '),
    traceId: nextTraceId(),
    data: null,
    errors: [{ field: 'denominationId', code: codeName, message: `Simulated ${codeName}` }],
  }
}

export function mockCreateOrder(
  req: AppRouteCreateOrderRequest
): AppRouteEnvelope<AppRouteCreateOrderData | AppRouteDtuCheckData> {
  const item = req.orders?.[0]
  if (!item || !item.denominationId) {
    return {
      status: 'OK',
      statusCode: AppRouteStatusCode.VALIDATION_ERROR,
      statusMessage: 'Validation error',
      traceId: nextTraceId(),
      data: null,
      errors: [{ field: 'orders[0].denominationId', code: 'REQUIRED', message: 'denominationId is required' }],
    }
  }

  // Симуляция ошибок поставщика (force_<CODE>) — см. forcedErrorEnvelope.
  const forced = forcedErrorEnvelope(item.denominationId)
  if (forced) return forced

  // DTU pre-check (checkOnly=true)
  if (req.ordersType === 'dtu' && req.checkOnly) {
    const data: AppRouteDtuCheckData = {
      canRecharge: true,
      providerStatus: 'OK',
      providerMessage: 'Account verified',
      nickname: 'MockPlayer',
      quote: { amount: '10', currency: 'USD' },
    }
    return ok<AppRouteDtuCheckData>(data)
  }

  if (!req.referenceId) {
    return {
      status: 'OK',
      statusCode: AppRouteStatusCode.VALIDATION_ERROR,
      statusMessage: 'Validation error',
      traceId: nextTraceId(),
      data: null,
      errors: [{ field: 'referenceId', code: 'REQUIRED', message: 'referenceId is required for purchases' }],
    }
  }

  // Идемпотентность: повтор того же referenceId возвращает первый результат
  const existing = orderStore.get(req.referenceId)
  if (existing) {
    return {
      status: 'OK',
      statusCode: AppRouteStatusCode.IDEMPOTENCY_REPLAY,
      statusMessage: 'Idempotent replay',
      traceId: nextTraceId(),
      data: buildOrderData(existing),
    }
  }

  const orderId = `AR-${Date.now().toString(36)}-${(orderById.size + 1).toString(36)}`.toUpperCase()
  const order: MockOrder = {
    orderId,
    referenceId: req.referenceId,
    ordersType: req.ordersType,
    status: 'IN_PROGRESS',
    createdAtMs: Date.now(),
    denominationId: item.denominationId,
    quantity: item.quantity || 1,
    fullVouchers:
      req.ordersType === 'shop'
        ? Array.from({ length: item.quantity || 1 }, () => genVoucher(item.denominationId))
        : [],
    attributes:
      req.ordersType === 'dtu'
        ? { providerStatus: 'SUCCESS', rechargedAmount: '10', currency: 'USD' }
        : undefined,
  }
  orderStore.set(order.referenceId, order)
  orderById.set(order.orderId, order)

  // POST /orders → 202 / ACCEPTED (IN_PROGRESS) — клиент дожидается через polling.
  return {
    status: 'IN_PROGRESS',
    statusCode: AppRouteStatusCode.ACCEPTED,
    statusMessage: 'OK',
    traceId: nextTraceId(),
    data: buildOrderData(order),
  }
}

function settle(order: MockOrder): void {
  // Мок: через ~1.2с после создания заказ переходит в терминальный статус SUCCESS.
  if (order.status === 'IN_PROGRESS' && Date.now() - order.createdAtMs >= 1200) {
    order.status = 'SUCCESS'
  }
}

function buildOrderData(order: MockOrder, unhide = false): AppRouteCreateOrderData {
  settle(order)
  let vouchers: AppRouteVoucher[] | null = null
  if (order.ordersType === 'shop') {
    vouchers = order.fullVouchers.map((code) => ({
      pin: unhide ? code : maskVoucher(code),
      masked: !unhide,
    }))
  }
  return {
    orderId: order.orderId,
    status: order.status,
    result: {
      vouchers,
      attributes: order.ordersType === 'dtu' ? order.attributes : undefined,
    },
  }
}

export function mockListOrders(params: {
  orderId?: string
  referenceId?: string
  unhide?: boolean
}): AppRouteEnvelope<AppRouteOrdersPage> {
  let order: MockOrder | undefined
  if (params.orderId) order = orderById.get(params.orderId)
  else if (params.referenceId) order = orderStore.get(params.referenceId)

  const toListItem = (o: MockOrder): AppRouteOrderListItem => {
    const data = buildOrderData(o, params.unhide)
    return {
      orderId: o.orderId,
      reference: o.referenceId,
      status: o.status,
      itemId: o.denominationId,
      quantity: o.quantity,
      amount: o.quantity,
      vouchers: data.result.vouchers,
    }
  }

  const items = order ? [toListItem(order)] : Array.from(orderById.values()).map(toListItem)
  return ok({ page: { items, hasNext: false } })
}
