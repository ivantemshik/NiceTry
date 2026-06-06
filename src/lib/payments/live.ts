// БОЕВАЯ реализация платежа (PAYMENTS_MODE=live) — ЗАГЛУШКА-TODO.
//
// Здесь будет интеграция реального платёжного шлюза (например, Pay4game — см. .env.example:
// PAY4GAME_MERCHANT_ID / PAY4GAME_SECRET_KEY). Контракт менять НЕЛЬЗЯ: функция обязана вернуть
// тот же PaymentResult, что и mock, чтобы поток после оплаты (заказ → ник → авто-вход → ЛК)
// остался без изменений.
//
// Типовой боевой сценарий (для будущей реализации):
//   1) Создать платёж в шлюзе по сумме заказа → получить payment URL / payment_id.
//   2) Редиректнуть/показать форму оплаты пользователю.
//   3) Подтверждение оплаты приходит АСИНХРОННО (webhook/callback от шлюза) → там и вызывать
//      финализацию заказа (привязка/создание аккаунта), а не в этой функции.
// Поэтому при подключении live, скорее всего, появится отдельный webhook-роут, который дергает
// тот же finalize-путь, что и mock-поток.

import type { PaymentOrderInput, PaymentResult } from './index'

export async function createLivePayment(_input: PaymentOrderInput): Promise<PaymentResult> {
  // TODO: реализовать боевой шлюз. До этого момента live-режим намеренно не работает,
  // чтобы случайно не выпустить «оплату», которая ничего не принимает.
  throw new Error(
    'PAYMENTS_MODE=live: боевой платёжный шлюз ещё не реализован (src/lib/payments/live.ts). ' +
      'Используйте PAYMENTS_MODE=mock или реализуйте createLivePayment.'
  )
}
