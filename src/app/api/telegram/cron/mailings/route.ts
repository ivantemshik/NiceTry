import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { processMailing } from '@/lib/telegram/mailing'
import { CRON_SECRET, isConfigured } from '@/lib/telegram/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/telegram/cron/mailings
 *
 * Гарантированное завершение рассылок (Задача 2). POST /api/admin/mailings ставит рассылку в
 * очередь (status=queued) и шлёт первый батч в пределах бюджета запроса; всё, что не успело
 * уйти, дошлёт этот cron — резюмируемо, по курсору (sent_count+failed_count), с rate-limit.
 *
 * Берём по одной незавершённой рассылке за вызов (queued/sending), доводим в пределах бюджета.
 *
 * БЕЗОПАСНОСТЬ: Authorization: Bearer <CRON_SECRET> или служебный заголовок Vercel Cron.
 */
export async function GET(request: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: 'Bot is not configured' }, { status: 503 })

  const auth = request.headers.get('authorization') || ''
  const isVercelCron = request.headers.get('x-vercel-cron') !== null
  const authorized = isVercelCron || (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`)
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Незавершённые рассылки, старые — первыми (FIFO).
  const { data: pending, error } = await supabaseAdmin
    .from('mailings')
    .select('id')
    .in('status', ['queued', 'sending'])
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, processed: null, note: 'no pending mailings' })
  }

  const mailingId = pending[0].id
  const result = await processMailing(mailingId, 50_000)
  return NextResponse.json({ ok: true, mailingId, ...result })
}
