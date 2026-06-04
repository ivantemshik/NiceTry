// Надёжная отправка рассылок в Telegram (Задача 2).
//
// Проблемы старой реализации:
//   1) отправка запускалась как fire-and-forget из POST — на serverless после ответа функция
//      замораживается, и фоновая отправка не завершается (рассылка «не доходит»);
//   2) пагинация переиспользовала один PostgREST-builder с повторными .range()/await — второй
//      вызов падает (builder одноразовый);
//   3) нет ограничения скорости (~30 msg/сек у Telegram) → 429, при этом сообщение терялось.
//
// Решение: РЕЗЮМИРУЕМАЯ отправка батчами с rate-limit. Прогресс хранится в самой строке mailings
// (sent_count + failed_count = курсор-офсет). Функцию можно безопасно вызывать повторно (из POST
// для мгновенного старта и из cron для гарантированного завершения) — она продолжит с места обрыва.

import { supabaseAdmin } from '@/lib/supabase/admin'
import { callTelegram, TelegramApiError } from './client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Telegram допускает ~30 сообщений/сек суммарно. Держим консервативные ~20/сек (50 мс между
// отправками) — запас под общий лимит и параллельные уведомления о заказах.
const SEND_GAP_MS = 50
const BATCH_SIZE = 100

export interface MailingRow {
  id: string
  message: string
  image_url: string | null
  button_text: string | null
  button_url: string | null
  segment: string | null
  status: string
  sent_count: number | null
  failed_count: number | null
  total_count: number | null
}

/** Запрос получателей по сегменту. Пока поддержан 'all' (остальные сегменты → как all). */
function recipientsBase() {
  // Стабильный порядок по id — чтобы офсет-курсор был детерминированным между прогонами.
  return supabaseAdmin
    .from('users')
    .select('id, telegram_id')
    .not('telegram_id', 'is', null)
    .order('id', { ascending: true })
}

/** Кол-во получателей рассылки (для total_count). */
export async function countRecipients(_segment?: string | null): Promise<number> {
  const { count } = await supabaseAdmin
    .from('users')
    .select('id', { head: true, count: 'exact' })
    .not('telegram_id', 'is', null)
  return count || 0
}

export interface ProcessResult {
  sent: number
  failed: number
  done: boolean
}

/**
 * Обрабатывает рассылку батчами в пределах временного бюджета. Резюмируемо: курсор = уже
 * обработанные (sent_count + failed_count). Возвращает дельту за вызов и флаг завершения.
 *
 * @param budgetMs сколько миллисекунд максимум работать за один вызов (под maxDuration функции).
 */
export async function processMailing(mailingId: string, budgetMs = 50_000): Promise<ProcessResult> {
  const startedAt = Date.now()

  const { data: m } = await supabaseAdmin
    .from('mailings')
    .select('*')
    .eq('id', mailingId)
    .maybeSingle()
  if (!m) return { sent: 0, failed: 0, done: true }
  const mailing = m as MailingRow

  if (mailing.status === 'completed') return { sent: 0, failed: 0, done: true }

  // total_count фиксируем один раз (снимок размера аудитории на момент старта).
  let total = mailing.total_count ?? 0
  if (!mailing.total_count) {
    total = await countRecipients(mailing.segment)
    await supabaseAdmin.from('mailings').update({ total_count: total }).eq('id', mailingId)
  }

  let sentTotal = mailing.sent_count ?? 0
  let failedTotal = mailing.failed_count ?? 0

  // Перево­дим в статус «отправляется».
  if (mailing.status !== 'sending') {
    await supabaseAdmin.from('mailings').update({ status: 'sending' }).eq('id', mailingId)
  }

  if (total === 0) {
    await supabaseAdmin.from('mailings').update({ status: 'completed' }).eq('id', mailingId)
    return { sent: 0, failed: 0, done: true }
  }

  const inlineKeyboard =
    mailing.button_text && mailing.button_url
      ? [[{ text: mailing.button_text, url: mailing.button_url }]]
      : undefined

  let sentDelta = 0
  let failedDelta = 0

  while (sentTotal + failedTotal < total) {
    if (Date.now() - startedAt > budgetMs) {
      // Бюджет вызова исчерпан — оставляем статус 'sending', cron продолжит.
      return { sent: sentDelta, failed: failedDelta, done: false }
    }

    const offset = sentTotal + failedTotal
    const { data: users, error } = await recipientsBase().range(offset, offset + BATCH_SIZE - 1)
    if (error) {
      console.error('[mailing] fetch recipients failed:', error.message)
      return { sent: sentDelta, failed: failedDelta, done: false }
    }
    if (!users || users.length === 0) break

    for (const u of users) {
      if (Date.now() - startedAt > budgetMs) {
        await persist(mailingId, sentTotal, failedTotal)
        return { sent: sentDelta, failed: failedDelta, done: false }
      }
      if (!u.telegram_id) {
        failedTotal++
        failedDelta++
        continue
      }
      try {
        if (mailing.image_url) {
          await callTelegram('sendPhoto', {
            chat_id: u.telegram_id,
            photo: mailing.image_url,
            caption: mailing.message,
            parse_mode: 'HTML',
            ...(inlineKeyboard ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {}),
          })
        } else {
          await callTelegram('sendMessage', {
            chat_id: u.telegram_id,
            text: mailing.message,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...(inlineKeyboard ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {}),
          })
        }
        sentTotal++
        sentDelta++
      } catch (e) {
        // Заблокировавшие бота / удалённые / прочие терминальные ошибки — считаем как failed
        // и идём дальше (callTelegram уже отретраил 429 и сетевые сбои внутри).
        if (e instanceof TelegramApiError && !e.isBlocked) {
          console.error('[mailing] send error:', e.errorCode, e.description)
        }
        failedTotal++
        failedDelta++
      }
      await sleep(SEND_GAP_MS)
    }

    // Сохраняем прогресс после каждого батча (резюмируемость при обрыве).
    await persist(mailingId, sentTotal, failedTotal)
  }

  const done = sentTotal + failedTotal >= total
  if (done) {
    await supabaseAdmin
      .from('mailings')
      .update({ status: 'completed', sent_count: sentTotal, failed_count: failedTotal })
      .eq('id', mailingId)
  }
  return { sent: sentDelta, failed: failedDelta, done }
}

async function persist(mailingId: string, sent: number, failed: number) {
  await supabaseAdmin
    .from('mailings')
    .update({ sent_count: sent, failed_count: failed })
    .eq('id', mailingId)
}
