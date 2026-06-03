'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTelegram } from '@/hooks/useTelegram'
import { computeGiftTotal, isSteamInviteUrl } from '@/lib/dessly-gift'
import type { Product } from '@/types'

interface DesslyConfig {
  commission_percent: number
  mode: 'embed' | 'native'
  widget_url: string | null
  regions: string[]
}

/**
 * Экран «Отправь игру в стим» (Dessly).
 * Режим определяется сервером (/api/dessly/config):
 *  - embed: открываем ГОТОВОЕ окно/виджет Dessly (если заказчик задал DESSLY_WIDGET_URL).
 *    В Telegram Mini App iframe на внешний origin часто блокируется → открываем через
 *    Telegram.WebApp.openLink; на вебе — iframe.
 *  - native: тонкий собственный экран на данных Dessly API (текущий основной путь, см. WORKLOG B1).
 * Светлую бело-синюю тему NiceTry применяем к нашей обёртке; внутри embed — вид Dessly (не трогаем).
 */
export default function SendGamePage() {
  const router = useRouter()
  const { isTelegram } = useTelegram()
  const [config, setConfig] = useState<DesslyConfig | null>(null)
  const [games, setGames] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const [gameId, setGameId] = useState('')
  const [region, setRegion] = useState('RU')
  const [invite, setInvite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/dessly/config')
      .then((r) => r.json())
      .then((c: DesslyConfig) => {
        setConfig(c)
        if (c.regions?.length) setRegion(c.regions[0])
      })
      .catch(() => setConfig({ commission_percent: 4, mode: 'native', widget_url: null, regions: ['RU'] }))
  }, [])

  useEffect(() => {
    fetch('/api/products?limit=200')
      .then((r) => r.json())
      .then((data) => {
        const dessly = (data.products || []).filter(
          (p: Product) => p.supplier === 'dessly' && p.is_active
        )
        setGames(dessly)
        if (dessly[0]) setGameId(dessly[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const selectedGame = useMemo(() => games.find((g) => g.id === gameId) || null, [games, gameId])
  const inviteValid = isSteamInviteUrl(invite)
  const calc = useMemo(
    () => computeGiftTotal(selectedGame?.price || 0, config?.commission_percent ?? 4),
    [selectedGame, config]
  )

  // Открытие готового окна Dessly (embed-режим): в Telegram — openLink, на вебе — iframe ниже.
  const openWidget = () => {
    if (!config?.widget_url) return
    const tg = (window as any).Telegram?.WebApp
    if (isTelegram && tg?.openLink) tg.openLink(config.widget_url)
    else window.open(config.widget_url, '_blank', 'noopener,noreferrer')
  }

  const submit = async () => {
    setMessage(null)
    if (!selectedGame) {
      setMessage({ kind: 'error', text: 'Выберите игру' })
      return
    }
    if (!inviteValid) {
      setMessage({ kind: 'error', text: 'Укажите корректную ссылку-приглашение Steam (https://s.team/p/...)' })
      return
    }
    try {
      setSubmitting(true)
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_method: 'balance',
          items: [
            {
              product_id: selectedGame.id,
              quantity: 1,
              form_data: { recipient: invite.trim(), region },
            },
          ],
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 401) {
        router.push('/auth/login?redirect=/send-game')
        return
      }
      if (!res.ok) {
        setMessage({ kind: 'error', text: body.error || 'Не удалось оформить отправку' })
        return
      }
      setMessage({
        kind: 'success',
        text: `Заказ оформлен (${body.order?.status === 'delivered' ? 'отправлено' : 'в обработке'}). Номер: ${body.order?.order_number || ''}`,
      })
    } catch {
      setMessage({ kind: 'error', text: 'Ошибка сети, повторите попытку' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container py-8" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f1e3c', marginBottom: 6 }}>
          Отправь игру в стим
        </h1>
        <p style={{ color: '#5b6b86' }}>
          Подарите игру по ссылке-приглашению Steam. Оплата — с внутреннего баланса.
        </p>
      </div>

      {/* EMBED: готовое окно Dessly */}
      {config?.mode === 'embed' && config.widget_url ? (
        <div className="card card-pad" style={{ background: '#fff', border: '1px solid #dbe7fb' }}>
          <p style={{ color: '#5b6b86', marginBottom: 14 }}>
            Откроется готовое окно Dessly с выбором игры, издания, региона и расчётом.
          </p>
          <button onClick={openWidget} className="btn btn-primary btn-lg">
            Открыть окно отправки
          </button>
          {/* На вебе дополнительно встраиваем окно; в Telegram оно открывается по кнопке выше. */}
          {!isTelegram && (
            <div style={{ marginTop: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid #dbe7fb' }}>
              <iframe
                src={config.widget_url}
                title="Dessly — отправка игры"
                style={{ width: '100%', height: 620, border: 0 }}
              />
            </div>
          )}
        </div>
      ) : (
        // NATIVE: собственный экран на данных Dessly API
        <div className="card card-pad" style={{ background: '#fff', border: '1px solid #dbe7fb' }}>
          {loading ? (
            <div style={{ color: '#5b6b86' }}>Загрузка…</div>
          ) : games.length === 0 ? (
            <div style={{ color: '#5b6b86' }}>Сейчас нет доступных игр для отправки. Загляните позже.</div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, color: '#0f1e3c' }}>Игра</span>
                <select className="input" value={gameId} onChange={(e) => setGameId(e.target.value)}>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} — {Math.round(g.price)} ₽
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, color: '#0f1e3c' }}>Регион аккаунта</span>
                <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
                  {(config?.regions || ['RU']).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, color: '#0f1e3c' }}>Ссылка-приглашение Steam</span>
                <input
                  className="input"
                  placeholder="https://s.team/p/xxxx-xxxx"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                />
                {invite && !inviteValid && (
                  <span style={{ color: '#c0392b', fontSize: 13 }}>
                    Формат: https://s.team/p/... (или steamcommunity.com/p/...)
                  </span>
                )}
              </label>

              {/* Подсказка как получить ссылку */}
              <details style={{ background: '#f4f8ff', borderRadius: 10, padding: '10px 14px', border: '1px solid #e2ecfb' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#1f6feb' }}>
                  Как получить ссылку-приглашение?
                </summary>
                <ol style={{ margin: '10px 0 0', paddingLeft: 18, color: '#5b6b86', lineHeight: 1.6 }}>
                  <li>Откройте Steam → «Друзья» → «Добавить друга».</li>
                  <li>Нажмите «Скопировать ссылку» под вашим QR-кодом приглашения.</li>
                  <li>Вставьте ссылку вида https://s.team/p/... в поле выше.</li>
                </ol>
              </details>

              {/* Расчёт */}
              <div style={{ borderTop: '1px solid #eef2f8', paddingTop: 14, display: 'grid', gap: 6 }}>
                <Row label="Цена по курсу" value={`${calc.price} ₽`} />
                <Row label={`Комиссия сервиса (${config?.commission_percent ?? 4}%)`} value={`${calc.commission} ₽`} />
                <Row label="К оплате" value={`${calc.total} ₽`} strong />
              </div>

              {message && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: message.kind === 'error' ? '#fdecea' : '#eafaf1',
                    color: message.kind === 'error' ? '#c0392b' : '#1e8449',
                    fontSize: 14,
                  }}
                >
                  {message.text}
                </div>
              )}

              <button
                onClick={submit}
                disabled={submitting || !inviteValid || !selectedGame}
                className="btn btn-primary btn-lg"
              >
                {submitting ? 'Оформляем…' : `К оплате · ${calc.total} ₽`}
              </button>

              <p style={{ fontSize: 12, color: '#8a97ab' }}>
                Нажимая «К оплате», вы подтверждаете отправку игры на указанный аккаунт.{' '}
                <Link href="/offer" className="link">Условия</Link>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: strong ? '#0f1e3c' : '#5b6b86', fontWeight: strong ? 700 : 400 }}>{label}</span>
      <span style={{ color: '#0f1e3c', fontWeight: strong ? 800 : 600, fontSize: strong ? 18 : 15 }}>{value}</span>
    </div>
  )
}
