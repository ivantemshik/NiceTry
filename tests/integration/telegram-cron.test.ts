import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ── моки: notify + supabaseAdmin (управляемый стейт) ──
const h = vi.hoisted(() => ({
  reviewRequested: [] as string[],
  orders: [] as any[],
  existingByOrder: {} as Record<string, boolean>, // есть отзыв/маркер?
  insertError: null as any, // ошибка на INSERT маркера (например 23505)
  inserted: [] as any[],
}))

vi.mock('@/lib/telegram/notify', () => ({
  notifyReviewRequest: vi.fn(async (userId: string) => {
    h.reviewRequested.push(userId)
    return { sent: true }
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'orders') {
        const b: any = {
          select: () => b,
          eq: () => b,
          lte: () => b,
          not: () => b,
          limit: async () => ({ data: h.orders, error: null }),
        }
        return b
      }
      // reviews
      const b: any = {
        _orderId: null as string | null,
        select: () => b,
        eq: (_col: string, val: any) => {
          b._orderId = val
          return b
        },
        limit: () => b,
        maybeSingle: async () => ({
          data: b._orderId && h.existingByOrder[b._orderId] ? { id: 'r1' } : null,
          error: null,
        }),
        insert: async (row: any) => {
          if (h.insertError) return { error: h.insertError }
          h.inserted.push(row)
          h.existingByOrder[row.order_id] = true
          return { error: null }
        },
      }
      return b
    },
  },
}))

import { GET as cronGET } from '@/app/api/telegram/cron/review-requests/route'
import { CRON_SECRET } from '@/lib/telegram/config'

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/telegram/cron/review-requests', { method: 'GET', headers })
}

beforeEach(() => {
  h.reviewRequested.length = 0
  h.orders = []
  h.existingByOrder = {}
  h.insertError = null
  h.inserted.length = 0
})

describe('GET /api/telegram/cron/review-requests — авторизация и идемпотентность (Блок 6 аудита)', () => {
  it('401 без секрета — посторонний не запускает рассылку', async () => {
    const res = await cronGET(req())
    expect(res.status).toBe(401)
    expect(h.reviewRequested).toHaveLength(0)
  })

  it('401 при неверном Bearer-секрете', async () => {
    const res = await cronGET(req({ authorization: 'Bearer WRONG' }))
    expect(res.status).toBe(401)
  })

  it('с валидным CRON_SECRET шлёт запрос отзыва и ставит маркер', async () => {
    h.orders = [{ id: 'o1', order_number: 'NT-1', user_id: 'u1' }]
    const res = await cronGET(req({ authorization: `Bearer ${CRON_SECRET}` }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requested).toBe(1)
    expect(h.reviewRequested).toEqual(['u1'])
    expect(h.inserted[0]).toMatchObject({ order_id: 'o1', comment: 'review_requested' })
  })

  it('повторный запуск: маркер уже есть → пропуск, дубля уведомления нет (идемпотентность)', async () => {
    h.orders = [{ id: 'o1', order_number: 'NT-1', user_id: 'u1' }]
    h.existingByOrder = { o1: true }
    const res = await cronGET(req({ authorization: `Bearer ${CRON_SECRET}` }))
    const body = await res.json()
    expect(body.requested).toBe(0)
    expect(body.skipped).toBe(1)
    expect(h.reviewRequested).toHaveLength(0)
  })

  it('гонка: INSERT маркера падает 23505 → пропуск, без уведомления (атомарный дедуп)', async () => {
    h.orders = [{ id: 'o1', order_number: 'NT-1', user_id: 'u1' }]
    h.insertError = { code: '23505', message: 'duplicate key' }
    const res = await cronGET(req({ authorization: `Bearer ${CRON_SECRET}` }))
    const body = await res.json()
    expect(body.requested).toBe(0)
    expect(body.skipped).toBe(1)
    expect(h.reviewRequested).toHaveLength(0)
  })

  it('заголовок x-vercel-cron авторизует (Vercel Cron)', async () => {
    h.orders = []
    const res = await cronGET(req({ 'x-vercel-cron': '1' }))
    expect(res.status).toBe(200)
  })
})
