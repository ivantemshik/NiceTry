import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHmac } from 'crypto'
import {
  listGames,
  getGame,
  resolvePackage,
  sendGift,
  getTransactionStatus,
  getMerchantBalance,
  isLiveMode,
  isSteamInviteUrl,
  desslyErrorMessage,
  DesslyError,
} from '@/lib/dessly'

// Боевой режим Dessly через СТАБ global.fetch (реальная сеть не используется).
// Проверяем РЕАЛЬНЫЙ контракт по dessly-openapi.json (Блок DSL-5):
//   - база https://desslyhub.com, подписанная авторизация X-Api-Key + X-Timestamp + X-Signature;
//   - подпись X-Signature = HMAC-SHA256(secret, apiKey + timestamp + body), lowercase hex;
//   - каталог /api/v1/catalog/steam-gift/games(/{app_id});
//   - выдача через единый orders-флоу: POST /api/v1/orders (service_type=steam_gift),
//     статус GET /api/v1/orders/{id}; баланс GET /api/v1/balance;
//   - error_code (строкой) в заказе → DesslyGiftResponse.errorCode/ message.

const KEY = 'test-dessly-key'
const SECRET = 'test-dessly-secret'

const orig = {
  mock: process.env.NICETRY_FORCE_SUPPLIER_MOCK,
  key: process.env.DESSLY_API_KEY,
  secret: process.env.DESSLY_API_SECRET,
  base: process.env.DESSLY_BASE_URL,
}

beforeEach(() => {
  process.env.NICETRY_FORCE_SUPPLIER_MOCK = '0' // снимаем форс-мок → боевой путь
  process.env.DESSLY_API_KEY = KEY
  process.env.DESSLY_API_SECRET = SECRET // боевой режим требует И ключ, И секрет (DSL-3/DSL-5)
  delete process.env.DESSLY_BASE_URL // дефолт https://desslyhub.com
})

afterEach(() => {
  if (orig.mock === undefined) delete process.env.NICETRY_FORCE_SUPPLIER_MOCK
  else process.env.NICETRY_FORCE_SUPPLIER_MOCK = orig.mock
  if (orig.key === undefined) delete process.env.DESSLY_API_KEY
  else process.env.DESSLY_API_KEY = orig.key
  if (orig.secret === undefined) delete process.env.DESSLY_API_SECRET
  else process.env.DESSLY_API_SECRET = orig.secret
  if (orig.base === undefined) delete process.env.DESSLY_BASE_URL
  else process.env.DESSLY_BASE_URL = orig.base
  vi.unstubAllGlobals()
})

function stubFetch(jsonBody: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

/** Эталонная подпись по спеке: HMAC-SHA256(secret, apiKey + timestamp + body) → lowercase hex. */
function expectedSig(timestamp: string, body: string): string {
  return createHmac('sha256', SECRET).update(`${KEY}${timestamp}${body}`).digest('hex')
}

/** Достаёт (headers, body) из первого вызова стаба fetch. */
function callOf(fn: ReturnType<typeof stubFetch>) {
  const [url, opts] = fn.mock.calls[0] as unknown as [string, any]
  return { url, opts, headers: opts.headers as Record<string, string>, body: (opts.body as string) || '' }
}

describe('Dessly: боевой режим — реальный контракт (стаб fetch)', () => {
  it('isLiveMode=true при заданном ключе+секрете и снятом форс-моке', () => {
    expect(isLiveMode()).toBe(true)
  })

  it('подпись X-Signature точно совпадает с HMAC-SHA256(secret, apiKey+timestamp+body) для GET (пустое тело)', async () => {
    const fn = stubFetch({ games: [] })
    await listGames()
    const { headers, body } = callOf(fn)
    expect(body).toBe('') // GET — тело пустое
    expect(headers['X-Api-Key']).toBe(KEY)
    expect(headers['X-Timestamp']).toMatch(/^\d+$/)
    // КЛЮЧЕВОЕ: значение подписи воспроизводится формулой из спеки (не просто формат).
    expect(headers['X-Signature']).toBe(expectedSig(headers['X-Timestamp'], ''))
    expect(headers['X-Signature']).toMatch(/^[0-9a-f]{64}$/)
    expect(headers.apikey).toBeUndefined()
    expect(headers.Authorization).toBeUndefined()
  })

  it('listGames: GET /api/v1/catalog/steam-gift/games, нормализует { games:[{app_id,name}] }', async () => {
    const fn = stubFetch({ games: [{ name: 'Cyberpunk 2077', app_id: 1091500 }] })
    const games = await listGames()
    expect(games[0].id).toBe('1091500')
    expect(games[0].appid).toBe(1091500)
    expect(games[0].name).toBe('Cyberpunk 2077')
    expect(callOf(fn).url).toBe('https://desslyhub.com/api/v1/catalog/steam-gift/games')
  })

  it('getGame: GET /api/v1/catalog/steam-gift/games/{app_id}, парсит editions + regions_info', async () => {
    const fn = stubFetch({
      game: [
        {
          edition: 'Standard',
          package_id: 555,
          regions_info: [
            { region: 'RU', discount: '94', price: '10', price_original: '60' },
            { region: 'KZ', discount: '0', price: '55', price_original: '55' },
          ],
        },
      ],
    })
    const editions = await getGame('1091500')
    expect(editions).toHaveLength(1)
    expect(editions[0].edition).toBe('Standard')
    expect(editions[0].packageId).toBe(555)
    expect(editions[0].regions[0]).toEqual({ region: 'RU', price: 10, priceOriginal: 60, discount: 94 })
    expect(callOf(fn).url).toBe('https://desslyhub.com/api/v1/catalog/steam-gift/games/1091500')
  })

  it('resolvePackage: по app_id + регион → package_id и цена нужного региона', async () => {
    stubFetch({
      game: [
        {
          edition: 'Standard',
          package_id: 777,
          regions_info: [
            { region: 'RU', discount: '0', price: '10', price_original: '10' },
            { region: 'KZ', discount: '0', price: '55', price_original: '55' },
          ],
        },
      ],
    })
    const pkg = await resolvePackage('1091500', 'KZ')
    expect(pkg).not.toBeNull()
    expect(pkg!.packageId).toBe(777)
    expect(pkg!.price).toBe(55)
    expect(pkg!.region).toBe('KZ')
  })

  it('resolvePackage: недоступный регион → null', async () => {
    stubFetch({
      game: [{ edition: 'Standard', package_id: 1, regions_info: [{ region: 'RU', price: '1', price_original: '1', discount: '0' }] }],
    })
    expect(await resolvePackage('1091500', 'ZZ')).toBeNull()
  })

  it('sendGift: POST /api/v1/orders, тело steam_gift-заказа + корректная подпись над телом', async () => {
    const fn = stubFetch({ order_id: 12345, status: 'executing' })
    const res = await sendGift({
      inviteUrl: 'https://s.team/p/abcd-1234',
      packageId: 555,
      region: 'RU',
      reference: 'ref-1',
    })
    // order_id → transactionId; executing → pending (опрос продолжится).
    expect(res.transactionId).toBe('12345')
    expect(res.status).toBe('pending')

    const { url, opts, headers, body } = callOf(fn)
    expect(url).toBe('https://desslyhub.com/api/v1/orders')
    expect(opts.method).toBe('POST')
    expect(headers['Content-Type']).toBe('application/json')
    // Подпись считается над РЕАЛЬНЫМ телом POST.
    expect(headers['X-Signature']).toBe(expectedSig(headers['X-Timestamp'], body))
    expect(JSON.parse(body)).toEqual({
      payment_method: 'balance',
      service_type: 'steam_gift',
      service_params: {
        invite_url: 'https://s.team/p/abcd-1234',
        package_id: '555', // service_params.package_id — строкой (спека)
        region: 'RU',
      },
      reference: 'ref-1',
    })
    // НЕ должно быть старой плоской формы.
    expect(JSON.parse(body).invite_url).toBeUndefined()
    expect(JSON.parse(body).package_id).toBeUndefined()
  })

  it('sendGift: status "completed" при создании → sent (без опроса)', async () => {
    stubFetch({ order_id: 1, status: 'completed' })
    const res = await sendGift({ inviteUrl: 'https://s.team/p/x', packageId: 1, region: 'RU' })
    expect(res.status).toBe('sent')
  })

  it('getTransactionStatus: GET /api/v1/orders/{id}; failed + error_code "-55" → failed + код/сообщение', async () => {
    const fn = stubFetch({ order_id: 12345, order_status: 'failed', error_code: '-55' })
    const res = await getTransactionStatus('12345')
    expect(res.status).toBe('failed')
    expect(res.errorCode).toBe(-55)
    expect(res.message).toBe('У получателя уже есть эта игра')
    expect(callOf(fn).url).toBe('https://desslyhub.com/api/v1/orders/12345')
  })

  it('getTransactionStatus: completed → sent; canceled → failed', async () => {
    stubFetch({ order_id: 1, order_status: 'completed' })
    expect((await getTransactionStatus('1')).status).toBe('sent')
    stubFetch({ order_id: 2, order_status: 'canceled' })
    expect((await getTransactionStatus('2')).status).toBe('failed')
  })

  it('getMerchantBalance: GET /api/v1/balance, balance-строка → число', async () => {
    const fn = stubFetch({ balance: '1.5000', overdraft: '0', reserve: '0', available_balance: '1.5000' })
    const bal = await getMerchantBalance()
    expect(bal.balance).toBe(1.5)
    expect(bal.currency).toBe('USD')
    const { url, opts } = callOf(fn)
    expect(url).toBe('https://desslyhub.com/api/v1/balance')
    expect(opts.method).toBe('GET')
  })

  it('HTTP-ошибка (problem+json) с error_code в теле → DesslyError несёт код и статус', async () => {
    stubFetch({ error_code: -3, title: 'Forbidden', status: 403 }, false, 403)
    try {
      await listGames()
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(DesslyError)
      expect((e as DesslyError).code).toBe(-3)
      expect((e as DesslyError).status).toBe(403)
    }
  })

  it('DESSLY_BASE_URL переопределяет базу', async () => {
    process.env.DESSLY_BASE_URL = 'https://stage.desslyhub.com'
    const fn = stubFetch({ games: [] })
    await listGames()
    expect(callOf(fn).url).toBe('https://stage.desslyhub.com/api/v1/catalog/steam-gift/games')
  })
})

describe('desslyErrorMessage — карта кодов', () => {
  it('известные коды → русские сообщения', () => {
    expect(desslyErrorMessage(-2)).toContain('Недостаточно средств')
    expect(desslyErrorMessage(-51)).toContain('добавления в друзья')
    expect(desslyErrorMessage(-58)).toContain('Регион получателя')
  })
  it('неизвестный код → дефолт с номером', () => {
    expect(desslyErrorMessage(-9999)).toContain('-9999')
  })
})

describe('isSteamInviteUrl — валидация ссылки-приглашения', () => {
  it('принимает корректные s.team / steamcommunity ссылки', () => {
    expect(isSteamInviteUrl('https://s.team/p/abcd-1234')).toBe(true)
    expect(isSteamInviteUrl('https://s.team/p/fkne-rktw/XYZ123')).toBe(true)
    expect(isSteamInviteUrl('https://steamcommunity.com/p/abcd-1234')).toBe(true)
  })
  it('отклоняет некорректные', () => {
    expect(isSteamInviteUrl('http://s.team/p/abcd')).toBe(false) // не https
    expect(isSteamInviteUrl('https://example.com/p/abcd')).toBe(false)
    expect(isSteamInviteUrl('https://steamcommunity.com/id/profilename')).toBe(false)
    expect(isSteamInviteUrl('')).toBe(false)
    expect(isSteamInviteUrl('просто текст')).toBe(false)
  })
})
