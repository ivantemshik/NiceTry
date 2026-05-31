import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeSessionClient, makeAdminClient, MockDb } from '../helpers/supabase-mock'

// Мутабельное состояние моков (vi.mock-фабрики читают его в момент вызова).
const state: { session: any; admin: any } = { session: null, admin: null }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => state.session,
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (t: string) => state.admin.from(t),
    auth: { admin: {} },
  },
}))

// Импортируем роуты ПОСЛЕ объявления моков.
import { POST as ordersCreatePOST } from '@/app/api/orders/create/route'
import { GET as orderGetGET } from '@/app/api/orders/[id]/route'
import { GET as adminOrdersGET } from '@/app/api/admin/orders/route'
import { PATCH as profilePATCH } from '@/app/api/user/profile/route'

function jsonReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/orders/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  state.session = null
  state.admin = null
})

describe('POST /api/orders/create — авторизация и пауза платежей', () => {
  it('401 без авторизации', async () => {
    state.session = makeSessionClient({ user: null })
    const res = await ordersCreatePOST(jsonReq({ items: [{ product_id: 'x' }], payment_method: 'balance' }))
    expect(res.status).toBe(401)
  })

  it('400 при пустой корзине', async () => {
    state.session = makeSessionClient({ user: { id: 'u1' } })
    const res = await ordersCreatePOST(jsonReq({ items: [], payment_method: 'balance' }))
    expect(res.status).toBe(400)
  })

  it('400 если items не массив', async () => {
    state.session = makeSessionClient({ user: { id: 'u1' } })
    const res = await ordersCreatePOST(jsonReq({ payment_method: 'balance' }))
    expect(res.status).toBe(400)
  })

  it('501 для оплаты картой (ПАУЗА — эквайринг не подключён)', async () => {
    state.session = makeSessionClient({ user: { id: 'u1' } })
    const res = await ordersCreatePOST(jsonReq({ items: [{ product_id: 'x' }], payment_method: 'card' }))
    expect(res.status).toBe(501)
  })

  it('501 для оплаты криптой (ПАУЗА)', async () => {
    state.session = makeSessionClient({ user: { id: 'u1' } })
    const res = await ordersCreatePOST(jsonReq({ items: [{ product_id: 'x' }], payment_method: 'crypto' }))
    expect(res.status).toBe(501)
  })

  it('501 если способ оплаты не указан (не balance)', async () => {
    state.session = makeSessionClient({ user: { id: 'u1' } })
    const res = await ordersCreatePOST(jsonReq({ items: [{ product_id: 'x' }] }))
    expect(res.status).toBe(501)
  })
})

describe('GET /api/orders/[id] — контроль доступа (IDOR)', () => {
  const req = new NextRequest('http://localhost/api/orders/o1')

  it('401 без авторизации', async () => {
    state.session = makeSessionClient({ user: null })
    const res = await orderGetGET(req, { params: { id: 'o1' } })
    expect(res.status).toBe(401)
  })

  it('404 если заказ не найден', async () => {
    const db: MockDb = { tables: { orders: { data: null, error: { message: 'not found' } } } }
    state.session = makeSessionClient({ user: { id: 'A' }, db })
    const res = await orderGetGET(req, { params: { id: 'o1' } })
    expect(res.status).toBe(404)
  })

  it('403 при попытке открыть ЧУЖОЙ заказ не-админом (IDOR заблокирован)', async () => {
    const db: MockDb = {
      tables: {
        orders: { data: { id: 'o1', user_id: 'B' } }, // заказ принадлежит B
        users: { data: { is_admin: false } }, // запрашивает A — не админ
      },
    }
    state.session = makeSessionClient({ user: { id: 'A' }, db })
    const res = await orderGetGET(req, { params: { id: 'o1' } })
    expect(res.status).toBe(403)
  })

  it('200 владельцу собственного заказа', async () => {
    const db: MockDb = {
      tables: {
        orders: { data: { id: 'o1', user_id: 'A' } },
        order_items: { data: [] },
      },
    }
    state.session = makeSessionClient({ user: { id: 'A' }, db })
    const res = await orderGetGET(req, { params: { id: 'o1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.order.id).toBe('o1')
  })

  it('200 админу при просмотре чужого заказа', async () => {
    const db: MockDb = {
      tables: {
        orders: { data: { id: 'o1', user_id: 'B' } },
        users: { data: { is_admin: true } }, // A — админ
        order_items: { data: [] },
      },
    }
    state.session = makeSessionClient({ user: { id: 'A' }, db })
    const res = await orderGetGET(req, { params: { id: 'o1' } })
    expect(res.status).toBe(200)
  })
})

describe('GET /api/admin/orders — гард администратора (requireAdmin)', () => {
  const req = new NextRequest('http://localhost/api/admin/orders')

  it('401 без авторизации', async () => {
    state.session = makeSessionClient({ user: null })
    state.admin = makeAdminClient({})
    const res = await adminOrdersGET(req)
    expect(res.status).toBe(401)
  })

  it('403 для не-админа', async () => {
    state.session = makeSessionClient({ user: { id: 'u1' } })
    state.admin = makeAdminClient({ tables: { users: { data: { is_admin: false } } } })
    const res = await adminOrdersGET(req)
    expect(res.status).toBe(403)
  })

  it('200 для админа со списком заказов', async () => {
    state.session = makeSessionClient({ user: { id: 'admin1' } })
    state.admin = makeAdminClient({
      tables: {
        users: { data: { is_admin: true } },
        orders: { data: [{ id: 'o1' }, { id: 'o2' }] },
      },
    })
    const res = await adminOrdersGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orders).toHaveLength(2)
  })
})

describe('PATCH /api/user/profile — белый список полей (защита от подмены balance/is_admin)', () => {
  function patchReq(body: unknown) {
    return new Request('http://localhost/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  }

  it('401 без авторизации', async () => {
    state.session = makeSessionClient({ user: null })
    const res = await profilePATCH(patchReq({ telegram_id: '123' }))
    expect(res.status).toBe(401)
  })

  it('попытка изменить balance/is_admin/status_id игнорируется — в БД уходит ТОЛЬКО telegram_id', async () => {
    const db: MockDb = { tables: { users: { data: { id: 'u1', telegram_id: '999' } } } }
    state.session = makeSessionClient({ user: { id: 'u1' } })
    state.admin = makeAdminClient(db)
    const res = await profilePATCH(
      patchReq({ telegram_id: '999', balance: 999999, is_admin: true, status_id: 'gold', referral_code: 'HACK' })
    )
    expect(res.status).toBe(200)
    // Проверяем РЕАЛЬНУЮ полезную нагрузку апдейта: только telegram_id, без чувствительных полей.
    const updateCall = (db.calls || []).find((c) => c.op === 'update')
    expect(updateCall).toBeDefined()
    const payload = updateCall!.payload as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['telegram_id'])
    expect(payload.balance).toBeUndefined()
    expect(payload.is_admin).toBeUndefined()
    expect(payload.status_id).toBeUndefined()
    expect(payload.referral_code).toBeUndefined()
  })

  it('400 если нет разрешённых полей для обновления', async () => {
    state.session = makeSessionClient({ user: { id: 'u1' } })
    state.admin = makeAdminClient({})
    const res = await profilePATCH(patchReq({ balance: 5000 }))
    expect(res.status).toBe(400)
  })
})
