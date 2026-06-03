// Клиент Dessly API (поставщик отправки игр / гифтов в Steam).
// Источник истины: dessly-openapi.json (официальная спека Desslyhub API v1, OpenAPI 3.1) —
// получена от владельца и заменяет устаревший readme.io-reference (Блок DSL-5).
//
// АВТОРИЗАЦИЯ (подписанные запросы; подтверждено спекой + живым сервером, Блок DSL-3/DSL-5):
//   X-Api-Key:   <merchant API key>          (DESSLY_API_KEY, 32 hex-символа)
//   X-Timestamp: <unix-время в секундах>     (строкой; должно быть в пределах ±5 мин серверного времени)
//   X-Signature: HMAC-SHA256(secret, apiKey + timestamp + body) — lowercase hex; пустое тело = ""
//                (secret = DESSLY_API_SECRET; в запрос НЕ передаётся). См. signRequest.
//   NB: в прозе Introduction опечатка «X-Ap-Key» — реальное имя заголовка во всех методах `X-Api-Key`.
//
// РЕАЛЬНЫЙ контракт эндпоинтов (dessly-openapi.json):
//   База:    https://desslyhub.com  (/api/v1)
//   GET  /api/v1/balance                              — баланс { balance, overdraft, reserve, available_balance } (строки, $)
//   GET  /api/v1/catalog/steam-gift/games             — список игр { games: [{ app_id, name }] }
//   GET  /api/v1/catalog/steam-gift/games/{app_id}    — издания/регионы игры
//        → { game: [{ edition, package_id, regions_info: [{ region, discount, price, price_original }] }] } (цены строками)
//   POST /api/v1/orders                               — создание заказа (выдача через единый orders-флоу)
//        тело: { payment_method:"balance", service_type:"steam_gift",
//                service_params:{ invite_url, package_id, region }, reference? } → { order_id, status }
//   GET  /api/v1/orders/{order_id}                    — статус заказа
//        → { order_status, error_code?, service_result:{ bot_id, invite_url, pkg_id, region }, ... }
//
// Статусы заказа: pending | paid | executing | completed | failed | canceled.
//   completed → выдан (sent); pending/paid/executing → в обработке (pending); failed/canceled → провал.
// Провал гифта приходит как error_code (СТРОКОЙ, напр. "-55") в теле заказа — не как HTTP-ошибка.
// HTTP-ошибки — RFC7807 application/problem+json { error_code:int, detail, title, status }.
//
// Режимы: боевой — только если заданы И DESSLY_API_KEY, И DESSLY_API_SECRET (нужен для подписи);
// иначе мок из catalog.json. Это fail-safe: с одним ключом (без секрета) клиент НЕ бьёт боевыми
// 401 по покупателям, а отдаёт каталог-фолбэк. Форма публичных ответов одинакова в обоих режимах.

import { createHmac } from 'crypto'
import catalog from '@/data/catalog.json'

const DEFAULT_BASE_URL = 'https://desslyhub.com'

const PLACEHOLDER_VALUES = new Set(['', 'your_dessly_api_key', 'your_dessly_api_secret', 'TODO', 'changeme'])

// ============================================================
// Публичные типы
// ============================================================

export interface DesslyGame {
  /** app_id игры в Steam (строкой). */
  id: string
  name: string
  /** Числовой appid из ответа Dessly (для getGame). */
  appid: number
  /** Цена в мок-режиме (из catalog.json). Боевой `games` цену НЕ отдаёт — берётся из getGame по региону. */
  price: number
  currency: string
  platform: string
  inStock: boolean
}

/** Цена издания в конкретном регионе (regions_info[]). */
export interface DesslyRegionPrice {
  region: string
  /** Финальная цена (вкл. скидки/комиссии), как отдаёт Dessly (число). */
  price: number
  /** Цена до скидки. */
  priceOriginal: number
  /** Скидка (как отдаёт Dessly). */
  discount: number
}

/** Издание игры (элемент массива `game[]`). */
export interface DesslyEdition {
  edition: string
  packageId: number
  regions: DesslyRegionPrice[]
}

export type DesslyGiftStatus = 'pending' | 'sent' | 'failed'

export interface DesslyGiftRequest {
  /** Ссылка-приглашение Steam получателя (https://s.team/p/... | steamcommunity.com/p/...). */
  inviteUrl: string
  /** package_id издания (из getGame). */
  packageId: number
  /** Регион аккаунта получателя (RU/KZ/...). */
  region: string
  /** Опциональный идентификатор на нашей стороне (идемпотентность/трекинг). */
  reference?: string
}

export interface DesslyGiftResponse {
  transactionId: string
  status: DesslyGiftStatus
  giftLink?: string
  message?: string
  /** Сырой error_code от Dessly (если был). */
  errorCode?: number
}

// Валидатор ссылки-приглашения Steam вынесен в client-safe модуль (без process.env/catalog),
// чтобы фолбэк-экран отправки игры (клиентский компонент) не тянул серверный клиент в бандл.
export { STEAM_INVITE_RE, isSteamInviteUrl } from './dessly-gift'

// ============================================================
// Конфиг / режим
// ============================================================

function baseUrl(): string {
  return (process.env.DESSLY_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
}
function apiKey(): string {
  return (process.env.DESSLY_API_KEY || '').trim()
}
function apiSecret(): string {
  return (process.env.DESSLY_API_SECRET || '').trim()
}

/**
 * Боевой режим включён, только если заданы валидные (не плейсхолдерные) КЛЮЧ И СЕКРЕТ.
 * Секрет обязателен: живой Dessly требует подпись X-Signature (Блок DSL-3). Без секрета остаёмся
 * в мок-режиме — иначе боевые запросы вернут 401 «invalid signature» прямо покупателям.
 */
export function isLiveMode(): boolean {
  // Форс-мок: герметичность тестов/стейджа даже при реальных ключах в окружении.
  // Боевые HTTP-пути покрываются отдельно стабом global.fetch.
  if (process.env.NICETRY_FORCE_SUPPLIER_MOCK === '1') return false
  const key = apiKey()
  const secret = apiSecret()
  return (
    key.length > 0 &&
    !PLACEHOLDER_VALUES.has(key) &&
    secret.length > 0 &&
    !PLACEHOLDER_VALUES.has(secret)
  )
}

// ============================================================
// Ошибки и коды
// ============================================================

/** Карта error_code → человекочитаемое сообщение (по странице Error Codes). */
const DESSLY_ERROR_MESSAGES: Record<number, string> = {
  [-1]: 'Внутренняя ошибка сервиса Dessly',
  [-2]: 'Недостаточно средств на балансе поставщика',
  [-3]: 'Некорректная сумма',
  [-4]: 'Некорректное тело запроса',
  [-5]: 'Доступ запрещён (проверьте apikey)',
  [-51]: 'Некорректная ссылка для добавления в друзья',
  [-52]: 'Некорректный App ID',
  [-53]: 'Информация об игре не найдена',
  [-54]: 'У получателя нет основной игры',
  [-55]: 'У получателя уже есть эта игра',
  [-56]: 'Не удалось добавить получателя в друзья',
  [-57]: 'Некорректно указан регион покупателя',
  [-58]: 'Регион получателя недоступен для гифта',
  [-59]: 'Пользователь не добавил/удалил бота из списка друзей',
  [-100]: 'Некорректный логин Steam',
  [-120]: 'Некорректное значение валюты',
  [-121]: 'Валюта не поддерживается',
  [-151]: 'Некорректный ID транзакции',
  [-152]: 'Транзакция не найдена',
  [-153]: 'Не указан номер страницы',
  [-200]: 'Мобильная игра не найдена',
  [-201]: 'Позиция мобильной игры не найдена',
  [-202]: 'Источник варианта не найден',
  [-300]: 'Ваучер не найден',
  [-301]: 'Ваучер недоступен',
}

export function desslyErrorMessage(code: number): string {
  return DESSLY_ERROR_MESSAGES[code] || `Ошибка Dessly (код ${code})`
}

export class DesslyError extends Error {
  /** HTTP-статус (или 0 при сетевой ошибке, 502 при ошибке в теле). */
  status: number
  /** Сырой error_code Dessly, если ошибка пришла в теле ответа. */
  code?: number
  constructor(message: string, status: number, code?: number) {
    super(message)
    this.name = 'DesslyError'
    this.status = status
    this.code = code
  }
}

// ============================================================
// Низкоуровневый HTTP (подписанные запросы)
// ============================================================

/**
 * Подпись запроса Dessly (X-Signature) — по официальной спеке dessly-openapi.json (Блок DSL-5):
 *
 *   signature = HMAC-SHA256(secret, apiKey + timestamp + body)  → lowercase hex
 *
 * Каноническая строка — простая конкатенация (БЕЗ метода/пути/разделителей): публичный apiKey
 * (X-Api-Key), затем X-Timestamp (unix-сек строкой), затем сырое тело запроса. Для GET (пустое
 * тело) используется пустая строка. Секрет (DESSLY_API_SECRET) в запрос не передаётся.
 */
function signRequest(timestamp: string, body: string): string {
  const canonical = `${apiKey()}${timestamp}${body}`
  return createHmac('sha256', apiSecret()).update(canonical).digest('hex')
}

async function liveRequest<T>(
  path: string,
  opts: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}
): Promise<T> {
  const method = opts.method || 'GET'
  let body = ''
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined && method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  // Подписанная авторизация Dessly: X-Api-Key + X-Timestamp + X-Signature (dessly-openapi.json,
  // подтверждено живым сервером; см. WORKLOG DSL-3/DSL-5). Подпись = HMAC-SHA256(secret, apiKey+ts+body).
  const timestamp = Math.floor(Date.now() / 1000).toString()
  headers['X-Api-Key'] = apiKey()
  headers['X-Timestamp'] = timestamp
  headers['X-Signature'] = signRequest(timestamp, body)

  let res: Response
  try {
    res = await fetch(baseUrl() + path, { method, headers, body: body || undefined, cache: 'no-store' })
  } catch (e) {
    throw new DesslyError(`Network error calling Dessly: ${(e as Error).message}`, 0)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // Попробуем достать error_code даже из не-2xx тела.
    let code: number | undefined
    try {
      code = (JSON.parse(text) as { error_code?: number })?.error_code
    } catch {
      /* not json */
    }
    throw new DesslyError(
      code != null ? desslyErrorMessage(code) : `Dessly API error ${res.status}: ${text.slice(0, 200)}`,
      res.status,
      code
    )
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  // КЛЮЧЕВОЕ: Dessly кладёт error_code в тело даже при HTTP 200. error_code < 0 → ошибка.
  const ec = json?.error_code
  if (typeof ec === 'number' && ec < 0) {
    throw new DesslyError(desslyErrorMessage(ec), 502, ec)
  }
  return json as T
}

// ============================================================
// Нормализация / маппинг
// ============================================================

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Маппинг статуса заказа Dessly (order_status) → наш статус выдачи. */
function mapStatus(s: unknown): DesslyGiftStatus {
  const v = String(s ?? '').toLowerCase()
  if (v === 'completed') return 'sent'
  if (v === 'pending' || v === 'paid' || v === 'executing') return 'pending'
  // failed, canceled, неизвестное → провал (деньги у поставщика возвращены).
  return 'failed'
}

// ---- Мок-данные из catalog.json ----

function mockGames(): DesslyGame[] {
  return catalog.desslyGames.map((g) => ({
    id: g.id,
    name: g.name,
    appid: hashToAppid(g.id),
    price: g.price,
    currency: g.currency,
    platform: g.platform,
    inStock: g.inStock,
  }))
}

/** Детерминированный «appid»/«package_id» для мок-режима (стабильный по id игры). */
function hashToAppid(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return (h % 9_000_000) + 1_000_000
}

// ============================================================
// Публичные методы
// ============================================================

/** Список игр, доступных для отправки гифтом. GET /api/v1/catalog/steam-gift/games */
export async function listGames(): Promise<DesslyGame[]> {
  if (isLiveMode()) {
    const data = await liveRequest<{ games?: Array<Record<string, unknown>> }>(
      '/api/v1/catalog/steam-gift/games'
    )
    const games = Array.isArray(data.games) ? data.games : []
    return games.map((g) => {
      const appid = toNum(g.app_id)
      return {
        id: String(appid || g.app_id || ''),
        name: String(g.name ?? ''),
        appid,
        // Боевой `games` цену не отдаёт — она зависит от региона/издания (см. getGame).
        price: 0,
        currency: 'USD',
        platform: 'Steam',
        inStock: true,
      }
    })
  }
  return mockGames()
}

/**
 * Издания и региональные цены игры по app_id.
 * GET /api/v1/catalog/steam-gift/games/{app_id}
 * → { game: [{ edition, package_id, regions_info: [{ region, discount, price, price_original }] }] }
 */
export async function getGame(appId: string | number): Promise<DesslyEdition[]> {
  if (isLiveMode()) {
    const data = await liveRequest<{ game?: Array<Record<string, unknown>> }>(
      `/api/v1/catalog/steam-gift/games/${encodeURIComponent(String(appId))}`
    )
    const editions = Array.isArray(data.game) ? data.game : []
    return editions.map((e) => ({
      edition: String(e.edition ?? ''),
      packageId: toNum(e.package_id),
      regions: (Array.isArray(e.regions_info) ? e.regions_info : []).map(
        (r: Record<string, unknown>) => ({
          region: String(r.region ?? '').toUpperCase(),
          price: toNum(r.price),
          priceOriginal: toNum(r.price_original),
          discount: toNum(r.discount),
        })
      ),
    }))
  }
  // Мок: одно издание со всеми регионами по цене из catalog.json.
  // Резолвим товары каталога и любой id по конвенции dessly_* (так их сидит seed.mjs:
  // denomination_id = id игры вида dessly_<game>). Неизвестный app_id → пусто («игра не найдена»).
  const key = String(appId)
  const g = mockGames().find((x) => x.id === key || x.appid === Number(appId))
  const known = g != null || key.startsWith('dessly_')
  if (!known) return []
  const price = g?.price ?? 19.99
  const regions = ['RU', 'KZ', 'UA', 'TR', 'CN', 'KR', 'ID', 'VN', 'IN'].map((region) => ({
    region,
    price,
    priceOriginal: price,
    discount: 0,
  }))
  return [{ edition: 'Standard', packageId: hashToAppid(key), regions }]
}

/**
 * Разрешает package_id (и цену) для отправки гифта: по app_id игры, региону и (опц.) названию издания.
 * Возвращает null, если издание/регион недоступны. Используется перед sendGift в потоке выдачи.
 */
export async function resolvePackage(
  appId: string | number,
  region: string,
  editionName?: string
): Promise<{ packageId: number; price: number; region: string; edition: string } | null> {
  const editions = await getGame(appId)
  if (!editions.length) return null
  const wantRegion = String(region || '').toUpperCase()
  const wantEdition = (editionName || '').trim().toLowerCase()

  // Выбор издания: по имени (если задано), иначе первое.
  const edition =
    (wantEdition && editions.find((e) => e.edition.toLowerCase() === wantEdition)) || editions[0]
  if (!edition || !edition.packageId) return null

  const rp =
    edition.regions.find((r) => r.region === wantRegion) || (wantRegion ? undefined : edition.regions[0])
  if (!rp) return null

  return { packageId: edition.packageId, price: rp.price, region: rp.region, edition: edition.edition }
}

/**
 * Отправка игры гифтом через единый orders-флоу. POST /api/v1/orders
 * Тело: { payment_method:"balance", service_type:"steam_gift",
 *         service_params:{ invite_url, package_id, region }, reference? } → { order_id, status }.
 * order_id используется как transactionId для последующего опроса getTransactionStatus.
 */
export async function sendGift(req: DesslyGiftRequest): Promise<DesslyGiftResponse> {
  if (isLiveMode()) {
    const data = await liveRequest<Record<string, unknown>>('/api/v1/orders', {
      method: 'POST',
      body: {
        payment_method: 'balance',
        service_type: 'steam_gift',
        service_params: {
          invite_url: req.inviteUrl,
          // package_id в service_params типизирован спекой как string (хотя в каталоге — число).
          package_id: String(req.packageId),
          region: req.region,
        },
        // reference — внешний идентификатор для идемпотентности (дубликат → error_code -9).
        ...(req.reference ? { reference: req.reference } : {}),
      },
    })
    return {
      transactionId: String(data.order_id ?? ''),
      status: mapStatus(data.status),
    }
  }
  // Мок: гифт «отправлен».
  const ref = req.reference || `pkg${req.packageId}`
  return {
    transactionId: `dessly-${Date.now().toString(36)}`,
    status: 'sent',
    giftLink: `https://store.steampowered.com/gift/mock-${ref}`,
  }
}

/**
 * Статус заказа (выдачи гифта). GET /api/v1/orders/{order_id}
 * → { order_status, error_code?, service_result:{ bot_id, invite_url, pkg_id, region } }.
 * order_status: pending|paid|executing|completed|failed|canceled. error_code приходит СТРОКОЙ
 * (напр. "-55") при провале выдачи — конвертируем в число и человекочитаемое сообщение.
 */
export async function getTransactionStatus(transactionId: string): Promise<DesslyGiftResponse> {
  if (isLiveMode()) {
    const data = await liveRequest<Record<string, unknown>>(
      `/api/v1/orders/${encodeURIComponent(transactionId)}`
    )
    const ecRaw = data.error_code
    const codeNum = ecRaw != null && ecRaw !== '' ? Number(ecRaw) : NaN
    const code = Number.isFinite(codeNum) ? codeNum : undefined
    return {
      transactionId,
      status: mapStatus(data.order_status),
      message: code != null ? desslyErrorMessage(code) : (data.detail as string | undefined),
      errorCode: code,
    }
  }
  return { transactionId, status: 'sent' }
}

/**
 * Баланс мерчанта. GET /api/v1/balance
 * → { balance, overdraft, reserve, available_balance } (строки, $). Берём текущий balance.
 */
export async function getMerchantBalance(): Promise<{ balance: number; currency: string }> {
  if (isLiveMode()) {
    const data = await liveRequest<Record<string, unknown>>('/api/v1/balance')
    return { balance: toNum(data.balance), currency: 'USD' }
  }
  return { balance: 1000, currency: 'USD' }
}
