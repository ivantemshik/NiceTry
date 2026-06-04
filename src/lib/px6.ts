// Клиент px6 (proxy6) — поставщик прокси (IPv4 Shared / IPv4 / MTProto / IPv6).
// Источник истины: proxy6_api.pdf (копия офиц. доки) + https://px6.me/ru/developers.
//
// КОНТРАКТ API (сверено с публичной докой; PDF — для финальной сверки имён полей владельцем):
//   База:    https://px6.link/api/{API_KEY}/{method}/?{params}   — всегда GET, ответ JSON (UTF-8)
//   Успех:   { status:"yes", user_id, balance, currency:"RUB"|"USD", ... }
//   Ошибка:  { status:"no", error_id:<int>, error:"<text>" }
//   Лимит:   не более 3 запросов/сек → иначе HTTP 429. Делаем throttle + ретраи.
//
//   Версии прокси (version): 3 = IPv4 Shared, 4 = IPv4, 5 = MTProto, 6 = IPv6.
//
//   Методы:
//     getcountry?version=          → { list:["ru","us",...] }  (страны под версию, ISO-2)
//     getcount?country=&version=   → { count:<int> }            (доступно к покупке)
//     getprice?count=&period=&version= → { price, price_single, period, count }
//     getproxy[?state=&descr=]     → { list_count, list:{ "<id>":{...proxy...} } }
//     buy?count=&period=&country=&version=[&type=&descr=&auto_prolong&nokey]
//                                  → { count, price, period, country, list:{ "<id>":{...proxy...} } }
//     prolong?period=&ids=         → { price, period, list:{...} }
//     delete?ids= | delete?descr=  → { count }
//     check?ids=                   → { proxy_id, proxy_status }
//
//   Объект прокси (list[id]) — поля по доке px6:
//     id, ip, host, port, user, pass, type ("http"|"socks"), country, date (куплен),
//     date_end (срок), unixtime, unixtime_end, descr, active ("1"|"0").
//
// РЕЖИМ: боевой включается ТОЛЬКО при валидном PROXY6_API_KEY (не плейсхолдер). Иначе — мок
// (та же форма ответов), чтобы фолбэк без ключа не бил боевыми запросами по покупателям.
// Форс-мок для герметичных тестов: NICETRY_FORCE_SUPPLIER_MOCK=1 (как у Dessly/AppRoute).

const DEFAULT_BASE_URL = 'https://px6.link/api'

const PLACEHOLDER_VALUES = new Set([
  '',
  'your_proxy6_api_key',
  'your_px6_api_key',
  'TODO',
  'changeme',
])

// ============================================================
// Публичные типы
// ============================================================

/** Версии прокси px6. */
export const PROXY_VERSIONS = {
  ipv4Shared: 3,
  ipv4: 4,
  mtproto: 5,
  ipv6: 6,
} as const

export type ProxyVersion = (typeof PROXY_VERSIONS)[keyof typeof PROXY_VERSIONS]

export const PROXY_VERSION_LABELS: Record<number, string> = {
  3: 'IPv4 Shared',
  4: 'IPv4',
  5: 'MTProto',
  6: 'IPv6',
}

export function isValidVersion(v: unknown): v is ProxyVersion {
  return v === 3 || v === 4 || v === 5 || v === 6
}

/** Валюта баланса/цен px6. */
export type Px6Currency = 'RUB' | 'USD'

/** Нормализованный объект прокси (из buy/getproxy). */
export interface Px6Proxy {
  id: string
  ip: string
  /** host = публичный IP/домен для подключения (часто совпадает с ip). */
  host: string
  port: string
  user: string
  pass: string
  /** Тип протокола: http | socks. */
  type: string
  country: string
  /** Дата покупки (как отдаёт px6). */
  date: string
  /** Дата окончания срока. */
  dateEnd: string
  descr: string
  active: boolean
}

export interface Px6Price {
  /** Итоговая цена за весь объём/период (в валюте аккаунта px6). */
  price: number
  /** Цена за 1 прокси за период. */
  priceSingle: number
  period: number
  count: number
  currency: Px6Currency
}

export interface Px6BuyResult {
  /** Внутренний id заказа px6 (order_id), если присутствует в ответе. */
  orderId?: string
  count: number
  price: number
  period: number
  country: string
  currency: Px6Currency
  balance: number
  proxies: Px6Proxy[]
}

// ============================================================
// Ошибки и коды
// ============================================================

/** Карта error_id → человекочитаемое сообщение (по странице кодов ошибок px6). */
const PX6_ERROR_MESSAGES: Record<number, string> = {
  30: 'Неизвестная ошибка px6',
  100: 'Ошибка авторизации (неверный ключ API)',
  105: 'Неверный IP-адрес запроса',
  110: 'Неверный метод API',
  200: 'Ошибка в параметре count (количество)',
  210: 'Ошибка в параметре period (срок)',
  220: 'Ошибка в параметре country (страна)',
  230: 'Ошибка в списке идентификаторов прокси (ids)',
  240: 'Ошибка в параметре version (версия прокси)',
  250: 'Ошибка в параметре descr (описание)',
  260: 'Ошибка в параметре type (тип прокси)',
  270: 'Ошибка в параметре времени',
  280: 'Ошибка в параметре активности',
  300: 'Недостаточно доступных прокси для покупки',
  400: 'Недостаточно средств на балансе px6',
  404: 'Элемент не найден',
  410: 'Ошибка расчёта стоимости',
}

export function px6ErrorMessage(errorId: number, fallback?: string): string {
  return PX6_ERROR_MESSAGES[errorId] || fallback || `Ошибка px6 (код ${errorId})`
}

export class Px6Error extends Error {
  /** error_id из тела ответа px6 (0 при сетевой/HTTP-ошибке без тела). */
  errorId: number
  /** HTTP-статус (0 при сетевой ошибке). */
  status: number
  constructor(message: string, errorId: number, status = 0) {
    super(message)
    this.name = 'Px6Error'
    this.errorId = errorId
    this.status = status
  }
}

/** Недостаточно средств на балансе ПОСТАВЩИКА px6 (error_id 400) — заказ не проводим. */
export function isPx6InsufficientFunds(e: unknown): boolean {
  return e instanceof Px6Error && e.errorId === 400
}

// ============================================================
// Конфиг / режим
// ============================================================

function baseUrl(): string {
  return (process.env.PROXY6_API_BASE || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
}

function apiKey(): string {
  return (process.env.PROXY6_API_KEY || '').trim()
}

/** Боевой режим: задан валидный (не плейсхолдерный) ключ И не включён форс-мок. */
export function isLiveMode(): boolean {
  if (process.env.NICETRY_FORCE_SUPPLIER_MOCK === '1') return false
  const key = apiKey()
  return key.length > 0 && !PLACEHOLDER_VALUES.has(key)
}

// ============================================================
// Throttle ≤ 3 req/sec (общий для процесса) + утилиты
// ============================================================

const RATE_WINDOW_MS = 1000
const RATE_MAX = 3
let recentCalls: number[] = []

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Ждём слот, чтобы не превысить 3 запроса в скользящем окне 1с. */
async function acquireSlot(): Promise<void> {
  // Цикл: чистим окно, если есть место — занимаем слот, иначе ждём до освобождения старейшего.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now()
    recentCalls = recentCalls.filter((t) => now - t < RATE_WINDOW_MS)
    if (recentCalls.length < RATE_MAX) {
      recentCalls.push(now)
      return
    }
    const waitMs = RATE_WINDOW_MS - (now - recentCalls[0]) + 5
    await sleep(Math.max(waitMs, 5))
  }
}

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function toStr(v: unknown): string {
  return v == null ? '' : String(v)
}

function requestTimeoutMs(): number {
  return Number(process.env.PROXY6_TIMEOUT_MS) || 15000
}
const MAX_RETRIES = 3

// ============================================================
// Низкоуровневый HTTP
// ============================================================

interface Px6RawResponse {
  status: 'yes' | 'no'
  error_id?: number
  error?: string
  user_id?: string | number
  balance?: string | number
  currency?: string
  [k: string]: unknown
}

function buildUrl(method: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const query = qs.toString()
  return `${baseUrl()}/${apiKey()}/${method}/${query ? `?${query}` : ''}`
}

/**
 * Единый вызов метода px6: throttle → fetch с таймаутом → ретраи на 429/сетевые/5xx →
 * разбор `status:"yes"|"no"`. На `status:"no"` бросаем Px6Error с маппингом error_id.
 */
async function call(
  method: string,
  params: Record<string, string | number | undefined> = {}
): Promise<Px6RawResponse> {
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await acquireSlot()
    const url = buildUrl(method, params)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs())
    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch (e) {
      clearTimeout(timer)
      lastErr = new Px6Error(`Сетевая ошибка при обращении к px6: ${(e as Error).message}`, 0, 0)
      // Сетевые сбои/таймаут — безопасно повторить (кроме buy: идемпотентность обеспечивается
      // descr-ключом на уровне роута, см. /api/proxy/buy).
      if (attempt < MAX_RETRIES - 1) {
        await sleep(400 * (attempt + 1))
        continue
      }
      throw lastErr
    }
    clearTimeout(timer)

    // 429 — превышен лимит запросов. Ждём и повторяем.
    if (res.status === 429) {
      lastErr = new Px6Error('Превышен лимит запросов к px6 (429)', 0, 429)
      if (attempt < MAX_RETRIES - 1) {
        const retryAfter = Number(res.headers.get('retry-after')) || 1
        await sleep(Math.max(retryAfter * 1000, 400 * (attempt + 1)))
        continue
      }
      throw lastErr
    }

    // 5xx — повторяем; прочие не-2xx — пробуем разобрать тело (px6 кладёт ошибку в JSON и при 200).
    if (res.status >= 500) {
      lastErr = new Px6Error(`px6 вернул ${res.status}`, 0, res.status)
      if (attempt < MAX_RETRIES - 1) {
        await sleep(400 * (attempt + 1))
        continue
      }
      throw lastErr
    }

    const text = await res.text().catch(() => '')
    let json: Px6RawResponse
    try {
      json = JSON.parse(text) as Px6RawResponse
    } catch {
      throw new Px6Error(`Некорректный ответ px6: ${text.slice(0, 200)}`, 0, res.status)
    }

    if (json.status === 'no') {
      const errorId = toNum(json.error_id)
      throw new Px6Error(px6ErrorMessage(errorId, json.error), errorId, res.status)
    }
    return json
  }
  throw (lastErr instanceof Error ? lastErr : new Px6Error('Не удалось выполнить запрос к px6', 0, 0))
}

// ============================================================
// Нормализация прокси
// ============================================================

function normalizeProxy(id: string, raw: Record<string, unknown>): Px6Proxy {
  return {
    id: toStr(raw.id) || id,
    ip: toStr(raw.ip),
    host: toStr(raw.host) || toStr(raw.ip),
    port: toStr(raw.port),
    user: toStr(raw.user),
    pass: toStr(raw.pass),
    type: toStr(raw.type),
    country: toStr(raw.country),
    date: toStr(raw.date),
    dateEnd: toStr(raw.date_end),
    descr: toStr(raw.descr),
    active: toStr(raw.active) === '1' || raw.active === true,
  }
}

function parseProxyList(list: unknown): Px6Proxy[] {
  if (!list || typeof list !== 'object') return []
  const out: Px6Proxy[] = []
  // px6 отдаёт list как { "<id>": {...} } (объект) — но иногда как массив. Поддерживаем оба.
  if (Array.isArray(list)) {
    for (const item of list) {
      if (item && typeof item === 'object') {
        out.push(normalizeProxy(toStr((item as Record<string, unknown>).id), item as Record<string, unknown>))
      }
    }
  } else {
    for (const [id, item] of Object.entries(list as Record<string, unknown>)) {
      if (item && typeof item === 'object') {
        out.push(normalizeProxy(id, item as Record<string, unknown>))
      }
    }
  }
  return out
}

function parseCurrency(v: unknown): Px6Currency {
  return toStr(v).toUpperCase() === 'USD' ? 'USD' : 'RUB'
}

// ============================================================
// Мок-режим (та же форма ответов, без сети)
// ============================================================

const MOCK_COUNTRIES = ['ru', 'us', 'de', 'gb', 'fr', 'nl', 'ua', 'pl']
const MOCK_PRICE_PER_DAY_USD = 0.05 // условная цена за прокси/день в мок-режиме

function mockProxy(index: number, country: string, version: number, period: number, descr: string): Px6Proxy {
  const start = '2026-06-04 12:00:00'
  // date_end = старт + period дней (грубо, для мока).
  const end = `2026-${String(6 + Math.floor((4 + period) / 30)).padStart(2, '0')}-${String(((4 + period) % 30) || 1).padStart(2, '0')} 12:00:00`
  return {
    id: `mock-${Date.now()}-${index}`,
    ip: `10.0.${index}.${index + 1}`,
    host: `10.0.${index}.${index + 1}`,
    port: String(8000 + index),
    user: `user${index}`,
    pass: `pass${index}${version}`,
    type: version === 5 ? 'socks' : 'http',
    country,
    date: start,
    dateEnd: end,
    descr,
    active: true,
  }
}

// ============================================================
// Публичные методы
// ============================================================

/** Список стран (ISO-2), доступных под версию прокси. */
export async function getCountry(version: ProxyVersion): Promise<string[]> {
  if (!isLiveMode()) return [...MOCK_COUNTRIES]
  const res = await call('getcountry', { version })
  const list = res.list
  return Array.isArray(list) ? list.map(String) : []
}

/** Доступное к покупке количество прокси по стране и версии. */
export async function getCount(country: string, version: ProxyVersion): Promise<number> {
  if (!isLiveMode()) return 250
  const res = await call('getcount', { country, version })
  return toNum(res.count)
}

/** Цена за count прокси на period дней (в валюте аккаунта px6). */
export async function getPrice(
  count: number,
  period: number,
  version: ProxyVersion
): Promise<Px6Price> {
  if (!isLiveMode()) {
    const priceSingle = MOCK_PRICE_PER_DAY_USD * period
    return {
      price: +(priceSingle * count).toFixed(2),
      priceSingle: +priceSingle.toFixed(2),
      period,
      count,
      currency: 'USD',
    }
  }
  const res = await call('getprice', { count, period, version })
  return {
    price: toNum(res.price),
    priceSingle: toNum(res.price_single),
    period: toNum(res.period) || period,
    count: toNum(res.count) || count,
    currency: parseCurrency(res.currency),
  }
}

export interface BuyParams {
  count: number
  period: number
  country: string
  version: ProxyVersion
  /** Тип прокси: http | socks (опц.; для version 3/4/6). */
  type?: 'http' | 'socks'
  /** Описание заказа — используем как ключ идемпотентности. */
  descr?: string
  autoProlong?: boolean
}

/** Покупка прокси. Деньги списываются с баланса px6; возвращает выданные прокси. */
export async function buy(params: BuyParams): Promise<Px6BuyResult> {
  if (!isLiveMode()) {
    const period = params.period
    const priceSingle = MOCK_PRICE_PER_DAY_USD * period
    const proxies = Array.from({ length: params.count }, (_, i) =>
      mockProxy(i, params.country, params.version, period, params.descr || '')
    )
    return {
      orderId: `mock-order-${Date.now()}`,
      count: params.count,
      price: +(priceSingle * params.count).toFixed(2),
      period,
      country: params.country,
      currency: 'USD',
      balance: 1000,
      proxies,
    }
  }
  const res = await call('buy', {
    count: params.count,
    period: params.period,
    country: params.country,
    version: params.version,
    type: params.type,
    descr: params.descr,
    auto_prolong: params.autoProlong ? '' : undefined,
  })
  return {
    orderId: res.order_id != null ? toStr(res.order_id) : undefined,
    count: toNum(res.count) || params.count,
    price: toNum(res.price),
    period: toNum(res.period) || params.period,
    country: toStr(res.country) || params.country,
    currency: parseCurrency(res.currency),
    balance: toNum(res.balance),
    proxies: parseProxyList(res.list),
  }
}

/** Список купленных прокси (опц. фильтр по состоянию active|expired|expiring|all и descr). */
export async function getProxy(opts: { state?: string; descr?: string } = {}): Promise<Px6Proxy[]> {
  if (!isLiveMode()) return []
  const res = await call('getproxy', { state: opts.state, descr: opts.descr })
  return parseProxyList(res.list)
}

/** Проверка работоспособности прокси по id. */
export async function check(id: string): Promise<{ id: string; valid: boolean }> {
  if (!isLiveMode()) return { id, valid: true }
  const res = await call('check', { ids: id })
  return { id: toStr(res.proxy_id) || id, valid: res.proxy_status === true || toStr(res.proxy_status) === 'true' }
}

/** Продление прокси (ids — список id через запятую) на period дней. */
export async function prolong(
  ids: string[],
  period: number
): Promise<{ price: number; period: number; currency: Px6Currency; proxies: Px6Proxy[] }> {
  if (!isLiveMode()) {
    return { price: MOCK_PRICE_PER_DAY_USD * period * ids.length, period, currency: 'USD', proxies: [] }
  }
  const res = await call('prolong', { period, ids: ids.join(',') })
  return {
    price: toNum(res.price),
    period: toNum(res.period) || period,
    currency: parseCurrency(res.currency),
    proxies: parseProxyList(res.list),
  }
}

/** Удаление прокси по id. Возвращает количество удалённых. */
export async function remove(ids: string[]): Promise<number> {
  if (!isLiveMode()) return ids.length
  const res = await call('delete', { ids: ids.join(',') })
  return toNum(res.count)
}
