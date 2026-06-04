import { describe, it, expect, vi, beforeEach } from 'vitest'

// Задача 2: надёжная рассылка. Тестируем ядро processMailing с лёгким фейком supabaseAdmin
// и мокнутым callTelegram — без реальной БД и сети. Проверяем: rate-limited отправка всем
// получателям, заблокировавший бота считается как failed, статус completed, корректные счётчики.

const h = vi.hoisted(() => ({
  // Состояние «БД»: одна рассылка + список получателей.
  db: {
    mailing: {
      id: 'm1',
      message: 'Привет',
      image_url: null as string | null,
      button_text: null as string | null,
      button_url: null as string | null,
      segment: 'all',
      status: 'queued',
      sent_count: 0,
      failed_count: 0,
      total_count: 0,
    },
    users: [
      { id: '1', telegram_id: 101 },
      { id: '2', telegram_id: 102 }, // заблокирует бота
      { id: '3', telegram_id: 103 },
    ],
  },
  sends: [] as number[],
  blockedId: 102,
}))

vi.mock('@/lib/supabase/admin', () => {
  function from(table: string) {
    let op: 'select' | 'update' | 'insert' = 'select'
    let payload: any = null
    const b: any = {
      select: (_c?: any, _o?: any) => b,
      insert: (p: any) => { op = 'insert'; payload = p; return b },
      update: (p: any) => { op = 'update'; payload = p; return b },
      not: () => b,
      order: () => b,
      eq: () => {
        if (op === 'update' && table === 'mailings') {
          Object.assign(h.db.mailing, payload)
          return Promise.resolve({ data: null, error: null })
        }
        return b
      },
      maybeSingle: () =>
        Promise.resolve({ data: table === 'mailings' ? { ...h.db.mailing } : null, error: null }),
      range: (start: number, end: number) =>
        Promise.resolve({ data: h.db.users.slice(start, end + 1), error: null }),
      // Прямое await на builder (countRecipients) → отдаём count.
      then: (res: any, rej: any) =>
        Promise.resolve({ count: h.db.users.length, data: h.db.users, error: null }).then(res, rej),
    }
    return b
  }
  return { supabaseAdmin: { from } }
})

vi.mock('@/lib/telegram/client', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/telegram/client')>()
  return {
    ...actual,
    callTelegram: vi.fn(async (_method: string, payload: any) => {
      if (payload.chat_id === h.blockedId) {
        throw new actual.TelegramApiError('blocked', 403, 'bot was blocked by the user')
      }
      h.sends.push(payload.chat_id)
      return {}
    }),
  }
})

import { processMailing } from '@/lib/telegram/mailing'

beforeEach(() => {
  h.sends.length = 0
  Object.assign(h.db.mailing, {
    status: 'queued',
    sent_count: 0,
    failed_count: 0,
    total_count: 0,
  })
})

describe('processMailing — надёжная рассылка (Задача 2)', () => {
  it('шлёт всем получателям, блокировку считает как failed, завершает рассылку', async () => {
    const res = await processMailing('m1', 50_000)

    // 3 получателя: 2 успешно, 1 заблокировал бота.
    expect(res.sent).toBe(2)
    expect(res.failed).toBe(1)
    expect(res.done).toBe(true)
    // Реально отправлено только незаблокированным.
    expect(h.sends.sort()).toEqual([101, 103])
    // Счётчики и статус зафиксированы в «БД».
    expect(h.db.mailing.sent_count).toBe(2)
    expect(h.db.mailing.failed_count).toBe(1)
    expect(h.db.mailing.total_count).toBe(3)
    expect(h.db.mailing.status).toBe('completed')
  })

  it('пустая аудитория → сразу completed без отправок', async () => {
    const saved = h.db.users
    h.db.users = []
    try {
      const res = await processMailing('m1', 50_000)
      expect(res.done).toBe(true)
      expect(res.sent).toBe(0)
      expect(h.db.mailing.status).toBe('completed')
      expect(h.sends.length).toBe(0)
    } finally {
      h.db.users = saved
    }
  })
})
