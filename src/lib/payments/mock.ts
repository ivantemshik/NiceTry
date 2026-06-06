// ДЕМО-реализация платежа (PAYMENTS_MODE=mock).
//
// Всегда возвращает «успешно оплачено» с синтетическим paymentId. Деньги НЕ принимаются —
// это заглушка, чтобы прогнать весь поток (гостевой чекаут → заказ → ник → авто-вход → ЛК)
// end-to-end без реального эквайринга. Небольшая задержка имитирует обращение к шлюзу.
//
// Все артефакты этого режима в UI/заказе помечаются «[DEMO]», чтобы не уехать в прод как боевое.

import { randomBytes } from 'crypto'
import type { PaymentOrderInput, PaymentResult } from './index'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function createMockPayment(input: PaymentOrderInput): Promise<PaymentResult> {
  // Имитация сетевого обращения к платёжному шлюзу (для реализма UI-«обработки»).
  await sleep(600)

  const paymentId = `mock_${randomBytes(8).toString('hex')}`

  // Заглушка ВСЕГДА успешна — её задача провести поток. (При желании отлаживать «отказ»
  // оплаты можно временно вернуть status:'failed' здесь.)
  return {
    status: 'paid',
    paymentId,
    mode: 'mock',
    demo: true,
  }
}
