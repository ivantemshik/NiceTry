import { describe, it, expect } from 'vitest'
import {
  listGames,
  getGame,
  resolvePackage,
  sendGift,
  getTransactionStatus,
  getMerchantBalance,
  isLiveMode,
} from '@/lib/dessly'
import { randomUUID } from 'crypto'

// Мок-режим Dessly (DESSLY_API_KEY — плейсхолдер / форс-мок).

describe('Dessly: режим', () => {
  it('по умолчанию мок-режим (ключ — плейсхолдер)', () => {
    expect(isLiveMode()).toBe(false)
  })
})

describe('Dessly: каталог игр (мок)', () => {
  it('listGames возвращает игры с appid', async () => {
    const games = await listGames()
    expect(games.length).toBeGreaterThan(0)
    const cp = games.find((g) => g.id === 'dessly_cyberpunk_2077')
    expect(cp).toBeDefined()
    expect(cp!.appid).toBeGreaterThan(0)
  })

  it('getGame возвращает издание с package_id и регионами', async () => {
    const editions = await getGame('dessly_elden_ring')
    expect(editions.length).toBeGreaterThan(0)
    expect(editions[0].packageId).toBeGreaterThan(0)
    expect(editions[0].regions.find((r) => r.region === 'RU')).toBeDefined()
  })

  it('getGame несуществующей игры → пустой массив', async () => {
    expect(await getGame('nope')).toEqual([])
  })

  it('resolvePackage по id игры и региону → packageId + цена', async () => {
    const pkg = await resolvePackage('dessly_elden_ring', 'RU')
    expect(pkg).not.toBeNull()
    expect(pkg!.packageId).toBeGreaterThan(0)
    expect(pkg!.price).toBeGreaterThan(0)
    expect(pkg!.region).toBe('RU')
  })
})

describe('Dessly: отправка гифта (мок)', () => {
  it('sendGift возвращает ссылку на гифт и статус sent', async () => {
    const reference = randomUUID()
    const res = await sendGift({
      inviteUrl: 'https://s.team/p/abcd-1234',
      packageId: 555,
      region: 'RU',
      reference,
    })
    expect(res.status).toBe('sent')
    expect(res.transactionId).toBeTruthy()
    expect(res.giftLink).toContain(reference)
  })

  it('getTransactionStatus возвращает статус', async () => {
    const res = await getTransactionStatus('dessly-xyz')
    expect(['pending', 'sent', 'failed']).toContain(res.status)
  })

  it('getMerchantBalance возвращает баланс в USD', async () => {
    const bal = await getMerchantBalance()
    expect(bal.currency).toBe('USD')
    expect(bal.balance).toBeGreaterThan(0)
  })
})
