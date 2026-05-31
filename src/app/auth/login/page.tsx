'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Ошибка отправки')
        return
      }

      setMessage(data.message)
      setEmail('')
    } catch (err) {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  // Локальный вход без письма (обходит лимит почты Supabase). Только в dev-режиме.
  const handleDevLogin = async () => {
    if (!email) {
      setError('Введите email')
      return
    }
    setLoading(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Ошибка входа')
        return
      }

      // Сессия установлена в cookies — перезагружаем на главную.
      window.location.href = '/'
    } catch (err) {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="card card-pad w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-navy text-2xl font-bold mb-2">Вход в NiceTry</h1>
          <p className="text-muted text-sm">
            Введите email — мы отправим ссылку для входа
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="input"
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
              {message}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading}
          >
            {loading ? 'Отправка...' : 'Получить ссылку для входа'}
          </button>

          {process.env.NODE_ENV === 'development' && (
            <button
              type="button"
              onClick={handleDevLogin}
              className="btn btn-ghost w-full"
              disabled={loading}
            >
              Войти без письма (dev)
            </button>
          )}
        </form>

        <div className="mt-6 text-center text-sm text-muted">
          <p>Нет аккаунта? Просто введите email — мы создадим его автоматически</p>
        </div>
      </div>
    </div>
  )
}
