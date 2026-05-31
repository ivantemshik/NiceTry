import { describe, it, expect } from 'vitest'
import {
  listGames,
  getGame,
  sendGift,
  getTransactionStatus,
  getMerchantBalance,
  isLiveMode,
} from '@/lib/dessly'
import { randomUUID } from 'crypto'

// Мок-режим Dessly (DESSLY_API_KEY — плейсхолдер).

describe('Dessly: режим', () => {
  it('по умолчанию мок-режим (ключ — плейсхолдер)', () => {
    expect(isLiveMode()).toBe(false)
  })
})

describe('Dessly: каталог игр', () => {
  it('listGames возвращает игры', async () => {
    const games = await listGames()
    expect(games.length).toBeGreaterThan(0)
    expect(games.find((g) => g.id === 'dessly_cyberpunk_2077')).toBeDefined()
  })

  it('getGame по id', async () => {
    const g = await getGame('dessly_elden_ring')
    expect(g).not.toBeNull()
    expect(g!.name).toBe('Elden Ring')
    expect(g!.price).toBeGreaterThan(0)
  })

  it('getGame несуществующей игры → null', async () => {
    expect(await getGame('nope')).toBeNull()
  })
})

describe('Dessly: отправка гифта', () => {
  it('sendGift возвращает ссылку на гифт и статус sent', async () => {
    const referenceId = randomUUID()
    const res = await sendGift({ gameId: 'dessly_cyberpunk_2077', recipient: 'steamuser', referenceId })
    expect(res.status).toBe('sent')
    expect(res.transactionId).toBeTruthy()
    expect(res.giftLink).toContain(referenceId)
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
