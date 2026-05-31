import { describe, it, expect, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { POST as promoValidatePOST } from '@/app/api/promo/validate/route'
import { retry } from '../helpers/live'

// Боевой тест валидации промокодов против живой БД (роут использует service-role напрямую).

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const createdCodes: string[] = []

async function makePromo(fields: Record<string, unknown>): Promise<string> {
  const code = `VAL${randomUUID().slice(0, 6).toUpperCase()}`
  const { error } = await retry(() =>
    admin.from('promo_codes').insert({
      code,
      discount_type: 'percent',
      discount_value: 10,
      is_active: true,
      used_count: 0,
      ...fields,
    })
  )
  if (error) throw new Error(error.message)
  createdCodes.push(code)
  return code
}

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/promo/validate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

// Вызов роута с ретраем на транзиентный 500 (валидация промокода идемпотентна и read-only).
async function validate(body: unknown): Promise<{ status: number; json: any }> {
  return retry(async () => {
    const res = await promoValidatePOST(req(body))
    const json = await res.json()
    if (res.status >= 500) throw new Error('transient 500')
    return { status: res.status, json }
  })
}

afterAll(async () => {
  for (const code of createdCodes) await retry(() => admin.from('promo_codes').delete().eq('code', code)).catch(() => {})
})

describe('POST /api/promo/validate', () => {
  it('валидный активный промокод → valid:true с типом и значением', async () => {
    const code = await makePromo({ discount_type: 'percent', discount_value: 15 })
    const { json: body } = await validate({ code })
    expect(body.valid).toBe(true)
    expect(body.discount_type).toBe('percent')
    expect(Number(body.discount_value)).toBe(15)
  })

  it('код в нижнем регистре нормализуется к верхнему', async () => {
    const code = await makePromo({})
    const { json: body } = await validate({ code: code.toLowerCase() })
    expect(body.valid).toBe(true)
  })

  it('несуществующий промокод → valid:false', async () => {
    const { json: body } = await validate({ code: 'NOPE-' + randomUUID().slice(0, 6) })
    expect(body.valid).toBe(false)
  })

  it('пустой код → 400 valid:false', async () => {
    const { status, json: body } = await validate({})
    expect(status).toBe(400)
    expect(body.valid).toBe(false)
  })

  it('просроченный промокод → valid:false', async () => {
    const code = await makePromo({ expires_at: '2020-01-01T00:00:00Z' })
    const { json: body } = await validate({ code })
    expect(body.valid).toBe(false)
    expect(body.error).toMatch(/истёк/i)
  })

  it('исчерпанный лимит использований → valid:false', async () => {
    const code = await makePromo({ max_uses: 5, used_count: 5 })
    const { json: body } = await validate({ code })
    expect(body.valid).toBe(false)
    expect(body.error).toMatch(/исчерпан/i)
  })

  it('неактивный промокод → valid:false', async () => {
    const code = await makePromo({ is_active: false })
    const { json: body } = await validate({ code })
    expect(body.valid).toBe(false)
  })

  it('SQL-инъекция в коде не ломает запрос (параметризация)', async () => {
    const { json: body } = await validate({ code: "' OR '1'='1" })
    // Должен вернуть «не найден», а не утечь все промокоды / упасть.
    expect(body.valid).toBe(false)
  })
})
