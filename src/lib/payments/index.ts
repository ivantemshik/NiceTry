// Абстракция платежа с двумя реализациями, переключаемыми флагом env PAYMENTS_MODE.
//
//   PAYMENTS_MODE=mock  — имитация успешной оплаты (см. ./mock). Деньги не принимаются,
//                         весь после-платёжный поток (заказ → ник → авто-вход → ЛК) работает.
//   PAYMENTS_MODE=live  — место для будущего боевого шлюза (см. ./live, пока заглушка-TODO).
//
// ВАЖНО: при подключении реального шлюза меняется ТОЛЬКО ./live.ts — UI и поток заказа
// (создание заказа, экран ника, авто-вход, личный кабинет) остаются без изменений, т.к.
// различается лишь способ получить «оплата успешна» (этот модуль).

import { createMockPayment } from './mock'
import { createLivePayment } from './live'

export type PaymentsMode = 'mock' | 'live'

/** Данные заказа, передаваемые в платёж (сумма авторитетно посчитана на сервере). */
export interface PaymentOrderInput {
  orderId: string
  orderNumber: string
  /** Сумма к оплате в рублях. */
  amount: number
  /** Почта плательщика (для чека/привязки). */
  email: string
}

/** Результат попытки оплаты. Единый для mock и live — поток после оплаты одинаков. */
export interface PaymentResult {
  status: 'paid' | 'failed'
  /** ID платежа у провайдера (в mock — синтетический mock_*). */
  paymentId: string
  mode: PaymentsMode
  /** true → это ДЕМО-оплата (mock), деньги не приняты. Используется для пометок в UI/заказе. */
  demo: boolean
  /** Человекочитаемая причина при status='failed'. */
  error?: string
}

/** Текущий режим оплаты из env (по умолчанию mock — безопасно для незаведённого шлюза). */
export function paymentsMode(): PaymentsMode {
  return process.env.PAYMENTS_MODE === 'live' ? 'live' : 'mock'
}

/** Включён ли режим ДЕМО-оплаты (mock). */
export function isMockPayments(): boolean {
  return paymentsMode() === 'mock'
}

/**
 * Создать (и для mock — сразу подтвердить) платёж по заказу.
 * Диспетчеризация по PAYMENTS_MODE. Возвращает единый PaymentResult.
 */
export async function createPayment(input: PaymentOrderInput): Promise<PaymentResult> {
  if (paymentsMode() === 'live') {
    return createLivePayment(input)
  }
  return createMockPayment(input)
}
