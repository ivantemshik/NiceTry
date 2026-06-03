// Клиент AppRoute Public API v1.
//
// Режимы работы:
//  - БОЕВОЙ: если в окружении заданы APPROUTE_BASE_URL и APPROUTE_API_KEY (не плейсхолдеры),
//    выполняются реальные HTTP-запросы с заголовком X-API-Key.
//  - МОК: иначе ответы берутся из approute/mock.ts (форма идентична боевой).
//
// Переключение прозрачно для вызывающего кода: бизнес-логика (импорт каталога, заказы)
// работает с одними и теми же типами/методами независимо от режима.
//
// Все секреты читаются ТОЛЬКО на сервере (process.env). Клиент не должен импортироваться
// в клиентских компонентах.
//
// TODO: вставить токен — заполнить APPROUTE_API_KEY и APPROUTE_BASE_URL в .env.local
// реальными значениями, выданными поставщиком, после чего боевой режим включится автоматически.

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
  type AppRouteOrderStatus,
} from './types'
import * as mock from './mock'

const PLACEHOLDER_VALUES = new Set([
  '',
  'your_approute_api_key',
  'your_approute_base_url',
  'TODO',
  'changeme',
])

function rawBaseUrl(): string {
  return (process.env.APPROUTE_BASE_URL || '').trim().replace(/\/+$/, '')
}
function rawApiKey(): string {
  return (process.env.APPROUTE_API_KEY || '').trim()
}

/** Боевой режим включён, только если заданы валидные (не плейсхолдерные) base URL и ключ. */
export function isLiveMode(): boolean {
  // Форс-мок: герметичность тестов/стейджа даже при реальных ключах в окружении.
  // Боевые HTTP-пути покрываются отдельно стабом global.fetch.
  if (process.env.NICETRY_FORCE_SUPPLIER_MOCK === '1') return false
  const base = rawBaseUrl()
  const key = rawApiKey()
  if (PLACEHOLDER_VALUES.has(base) || PLACEHOLDER_VALUES.has(key)) return false
  // base URL должен быть абсолютным http(s)
  return /^https?:\/\//i.test(base) && key.length > 0
}

/** Ошибка AppRoute с привязкой к statusCode/traceId для логирования и обработки в UI. */
export class AppRouteError extends Error {
  statusCode: AppRouteStatusCode
  httpStatus: number
  traceId: string
  errors?: AppRouteEnvelope['errors']

  constructor(
    message: string,
    statusCode: AppRouteStatusCode,
    httpStatus: number,
    traceId: string,
    errors?: AppRouteEnvelope['errors']
  ) {
    super(message)
    this.name = 'AppRouteError'
    this.statusCode = statusCode
    this.httpStatus = httpStatus
    this.traceId = traceId
    this.errors = errors
  }
}

const NON_ERROR_CODES = new Set<AppRouteStatusCode>([
  AppRouteStatusCode.OK,
  AppRouteStatusCode.ACCEPTED,
  AppRouteStatusCode.IDEMPOTENCY_REPLAY,
])

/**
 * Валидация ключа идемпотентности (PDF/ТЗ §глоссарий): referenceId уникален, длина 1..40 символов.
 * Бросаем до отправки запроса, чтобы не тратить вызов поставщика на заведомо невалидный ввод
 * и вернуть тот же VALIDATION_ERROR, что вернул бы боевой API.
 */
function assertReferenceId(referenceId: string): void {
  const len = (referenceId ?? '').length
  if (len < 1 || len > 40) {
    throw new AppRouteError(
      `referenceId must be 1..40 characters (got ${len})`,
      AppRouteStatusCode.VALIDATION_ERROR,
      422,
      '',
      [{ field: 'referenceId', code: 'INVALID_LENGTH', message: 'referenceId length must be 1..40' }]
    )
  }
}

/** Разбор envelope: бросает AppRouteError на не-успешных statusCode, логирует traceId. */
function unwrap<T>(env: AppRouteEnvelope<T>, httpStatus: number): AppRouteEnvelope<T> {
  // Всегда логируем traceId (требование §6 ТЗ — наблюдаемость).
  if (env.traceId) {
    console.info(`[AppRoute] traceId=${env.traceId} statusCode=${env.statusCode} http=${httpStatus}`)
  }
  if (!NON_ERROR_CODES.has(env.statusCode)) {
    throw new AppRouteError(
      env.statusMessage || `AppRoute error (statusCode=${env.statusCode})`,
      env.statusCode,
      httpStatus,
      env.traceId,
      env.errors
    )
  }
  return env
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number | boolean | string[] | undefined>
  body?: unknown
}

/** Низкоуровневый HTTP-запрос к боевому AppRoute. Используется только в isLiveMode(). */
async function liveRequest<T>(path: string, opts: RequestOptions = {}): Promise<AppRouteEnvelope<T>> {
  const url = new URL(rawBaseUrl() + path)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined) continue
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, String(item)))
      else url.searchParams.append(k, String(v))
    }
  }

  const headers: Record<string, string> = {
    'X-API-Key': rawApiKey(),
    Accept: 'application/json',
  }
  const method = opts.method || 'GET'
  let bodyStr: string | undefined
  if (opts.body !== undefined && method === 'POST') {
    // Для POST с телом обязателен Content-Type: application/json (иначе 415).
    headers['Content-Type'] = 'application/json'
    bodyStr = JSON.stringify(opts.body)
  }

  let res: Response
  try {
    res = await fetch(url.toString(), { method, headers, body: bodyStr, cache: 'no-store' })
  } catch (e) {
    throw new AppRouteError(
      `Network error calling AppRoute: ${(e as Error).message}`,
      AppRouteStatusCode.UPSTREAM_ERROR,
      0,
      ''
    )
  }

  let env: AppRouteEnvelope<T>
  try {
    env = (await res.json()) as AppRouteEnvelope<T>
  } catch {
    throw new AppRouteError(
      `Invalid JSON from AppRoute (http=${res.status})`,
      AppRouteStatusCode.INTERNAL_ERROR,
      res.status,
      ''
    )
  }
  return unwrap(env, res.status)
}

// ============================================================
// Публичные методы (одинаковая сигнатура в боевом и мок-режиме)
// ============================================================

// ---- Shop / каталог ----

export async function listServices(): Promise<AppRouteService[]> {
  const env = isLiveMode()
    ? await liveRequest<AppRouteServicesPage>('/api/v1/services')
    : unwrap(mock.mockListServices(), 200)
  return env.data?.items ?? []
}

export async function getService(id: string): Promise<AppRouteService | null> {
  if (isLiveMode()) {
    const env = await liveRequest<AppRouteService>(`/api/v1/services/${encodeURIComponent(id)}`)
    return env.data ?? null
  }
  const env = mock.mockGetService(id)
  if (env.statusCode === AppRouteStatusCode.NOT_FOUND) return null
  return unwrap(env, 200).data ?? null
}

export async function getSteamRates(quotes?: string[]): Promise<AppRouteSteamRates | null> {
  const env = isLiveMode()
    ? await liveRequest<AppRouteSteamRates>('/api/v1/steam-currency/rates', { query: { quotes } })
    : unwrap(mock.mockSteamRates(quotes), 200)
  return env.data ?? null
}

// ---- Accounts / funds ----

export async function listAccounts(): Promise<AppRouteBalanceItem[]> {
  const env = isLiveMode()
    ? await liveRequest<{ items: AppRouteBalanceItem[] }>('/api/v1/accounts')
    : unwrap(mock.mockAccounts(), 200)
  return env.data?.items ?? []
}

export async function listFundsMethods(): Promise<AppRouteFundingMethod[]> {
  const env = isLiveMode()
    ? await liveRequest<{ items: AppRouteFundingMethod[] }>('/api/v1/funds/methods')
    : unwrap(mock.mockFundsMethods(), 200)
  return env.data?.items ?? []
}

export async function createInvoice(methodCode: string, amount: string) {
  if (isLiveMode()) {
    const env = await liveRequest('/api/v1/funds/invoices', {
      method: 'POST',
      body: { methodCode, amount },
    })
    return env.data
  }
  // Мок инвойса
  return unwrap(mock.mockFundsMethods(), 200).data
}

// ---- Orders ----

/** Покупка voucher-кода (shop). Возвращает envelope с orderId/status/result. */
export async function createShopOrder(
  referenceId: string,
  denominationId: string,
  quantity = 1,
  isLongOrder = false
): Promise<AppRouteEnvelope<AppRouteCreateOrderData>> {
  assertReferenceId(referenceId)
  const req: AppRouteCreateOrderRequest = {
    ordersType: 'shop',
    referenceId,
    orders: [{ denominationId, quantity, isLongOrder }],
  }
  if (isLiveMode()) {
    return liveRequest<AppRouteCreateOrderData>('/api/v1/orders', { method: 'POST', body: req })
  }
  return unwrap(mock.mockCreateOrder(req) as AppRouteEnvelope<AppRouteCreateOrderData>, 202)
}

/** Прямое пополнение (dtu). */
export async function createDtuOrder(
  referenceId: string,
  denominationId: string,
  fields: Array<{ key: string; value: string }>,
  options: { quantity?: number; amountCurrencyCode?: string | null } = {}
): Promise<AppRouteEnvelope<AppRouteCreateOrderData>> {
  assertReferenceId(referenceId)
  const req: AppRouteCreateOrderRequest = {
    ordersType: 'dtu',
    referenceId,
    orders: [
      {
        denominationId,
        quantity: options.quantity ?? 1,
        amountCurrencyCode: options.amountCurrencyCode ?? null,
        fields,
      },
    ],
  }
  if (isLiveMode()) {
    return liveRequest<AppRouteCreateOrderData>('/api/v1/orders', { method: 'POST', body: req })
  }
  return unwrap(mock.mockCreateOrder(req) as AppRouteEnvelope<AppRouteCreateOrderData>, 202)
}

/** DTU pre-check (checkOnly=true): валидность аккаунта, quote, nickname. Без referenceId. */
export async function dtuCheck(
  denominationId: string,
  fields: Array<{ key: string; value: string }>,
  amountCurrencyCode?: string | null
): Promise<AppRouteDtuCheckData | null> {
  const req: AppRouteCreateOrderRequest = {
    ordersType: 'dtu',
    checkOnly: true,
    orders: [{ denominationId, quantity: 1, amountCurrencyCode: amountCurrencyCode ?? null, fields }],
  }
  if (isLiveMode()) {
    const env = await liveRequest<AppRouteDtuCheckData>('/api/v1/orders', { method: 'POST', body: req })
    return env.data ?? null
  }
  const env = unwrap(mock.mockCreateOrder(req) as AppRouteEnvelope<AppRouteDtuCheckData>, 200)
  return env.data ?? null
}

/** Список/получение заказов. unhide=true раскрывает полные voucher-коды (требует orderId/referenceId). */
export async function listOrders(params: {
  orderId?: string
  referenceId?: string
  unhide?: boolean
  limit?: number
  offset?: number
}): Promise<AppRouteOrdersPage> {
  if (params.unhide && !params.orderId && !params.referenceId) {
    throw new AppRouteError(
      'unhide=true requires orderId or referenceId',
      AppRouteStatusCode.VALIDATION_ERROR,
      422,
      ''
    )
  }
  if (isLiveMode()) {
    const env = await liveRequest<AppRouteOrdersPage>('/api/v1/orders', {
      query: {
        orderId: params.orderId,
        referenceId: params.referenceId,
        unhide: params.unhide,
        limit: params.limit,
        offset: params.offset,
      },
    })
    return env.data ?? { page: { items: [], hasNext: false } }
  }
  return unwrap(mock.mockListOrders(params), 200).data ?? { page: { items: [], hasNext: false } }
}

const TERMINAL: AppRouteOrderStatus[] = ['SUCCESS', 'PARTIALLY_COMPLETED', 'CANCELLED']

/**
 * Polling статуса заказа с exponential backoff до терминального статуса.
 * Возвращает первый найденный заказ в терминальном статусе (или последний после таймаута).
 */
export async function waitForOrder(
  ref: { orderId?: string; referenceId?: string },
  opts: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number } = {}
) {
  const maxAttempts = opts.maxAttempts ?? 8
  const baseDelay = opts.baseDelayMs ?? 1000
  const maxDelay = opts.maxDelayMs ?? 8000

  let last
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const page = await listOrders({ orderId: ref.orderId, referenceId: ref.referenceId })
    const item = page.page.items.find(
      (o) => o.orderId === ref.orderId || o.reference === ref.referenceId
    )
    last = item
    if (item && TERMINAL.includes(item.status)) return item
    const delay = Math.min(baseDelay * 2 ** attempt, maxDelay)
    await new Promise((r) => setTimeout(r, delay))
  }
  return last
}

/**
 * Раскрыть полные voucher-коды (unhide). Вызывать ТОЛЬКО в момент фактической выдачи
 * покупателю — побочный эффект: код помечается полученным (§5.4 ТЗ).
 */
export async function unhideVouchers(ref: { orderId?: string; referenceId?: string }): Promise<string[]> {
  const page = await listOrders({ ...ref, unhide: true })
  const item = page.page.items.find(
    (o) => o.orderId === ref.orderId || o.reference === ref.referenceId
  )
  if (!item?.vouchers) return []
  return item.vouchers.map((v) => v.pin || v.serialNumber || '').filter(Boolean)
}
