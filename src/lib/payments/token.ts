// Подписанный checkout-токен.
//
// Выдаётся клиенту в ответе на создание гостевого заказа и требуется при finalize (ник → аккаунт).
// Без него любой, кто угадает UUID заказа, мог бы «забрать» чужую почту и получить на неё сессию.
// Токен = HMAC-SHA256(AUTH_SESSION_SECRET, `${orderId}:${email}`) — привязан к заказу и почте,
// проверяется за постоянное время. Тот же секрет, что и у кодов входа (см. lib/auth/codes).

import { createHmac, timingSafeEqual } from 'crypto'

function secret(): string {
  const s = process.env.AUTH_SESSION_SECRET
  if (s && s.length > 0) return s
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SESSION_SECRET не задан в production — невозможно подписать checkout-токен')
  }
  return 'dev-insecure-auth-secret'
}

/** Подписать checkout-токен для пары (orderId, email). */
export function signCheckoutToken(orderId: string, email: string): string {
  return createHmac('sha256', secret())
    .update(`${orderId}:${email.toLowerCase()}`)
    .digest('hex')
}

/** Проверить токен за постоянное время. */
export function verifyCheckoutToken(orderId: string, email: string, token: string): boolean {
  if (!token) return false
  const expected = signCheckoutToken(orderId, email)
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(token, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
