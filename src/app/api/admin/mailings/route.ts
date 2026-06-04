import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { processMailing, countRecipients } from '@/lib/telegram/mailing'

// Рассылка может слать сотни сообщений с rate-limit — поднимаем лимит выполнения функции.
export const maxDuration = 60

// GET /api/admin/mailings — все рассылки
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response
    const supabase = guard.admin
    const { data, error } = await supabase.from('mailings').select('*').order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ mailings: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/admin/mailings — создать + отправить рассылку
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response
    const supabase = guard.admin

    const { title, message, image_url, button_text, button_url, segment } = await request.json()
    if (!title || !message) {
      return NextResponse.json({ error: 'title и message обязательны' }, { status: 400 })
    }

    // Снимок размера аудитории + постановка в очередь.
    const total = await countRecipients(segment || 'all')
    const { data: mailing, error } = await supabase
      .from('mailings')
      .insert({
        title,
        message,
        image_url: image_url || null,
        button_text: button_text || null,
        button_url: button_url || null,
        segment: segment || 'all',
        status: 'queued',
        total_count: total,
        sent_count: 0,
        failed_count: 0,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Мгновенный старт отправки в пределах бюджета запроса (резюмируемо). Остаток (если не успели
    // за ~50с) гарантированно дошлёт cron /api/telegram/cron/mailings — отправка НЕ теряется
    // после возврата ответа (в отличие от прежнего fire-and-forget на serverless).
    let progress: { sent: number; failed: number; done: boolean } = { sent: 0, failed: 0, done: false }
    try {
      progress = await processMailing(mailing.id, 50_000)
    } catch (e) {
      console.error('[mailings] initial send error:', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({ mailing, progress }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
