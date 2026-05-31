'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useUser } from '@/hooks/useUser'

export default function Header() {
  const { user: authUser, signOut } = useAuth()
  const { user } = useUser()

  return (
    <header className="bg-white border-b border-border sticky top-0 z-50">
      <div className="container">
        <div className="flex items-center justify-between h-16">
          {/* Логотип */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">N</span>
            </div>
            <span className="text-navy font-bold text-lg">NiceTry</span>
          </Link>

          {/* Поиск */}
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <input
              type="search"
              placeholder="Поиск товаров..."
              className="input"
            />
          </div>

          {/* Правая часть */}
          <div className="flex items-center gap-4">
            {authUser ? (
              <>
                {/* Баланс */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                  <span className="text-sm text-muted">Баланс:</span>
                  <span className="text-sm font-semibold text-navy">
                    {user?.balance?.toFixed(2) || '0.00'} ₽
                  </span>
                </div>

                {/* Статус */}
                {user?.status && (
                  <div className="hidden sm:block">
                    <span className="badge badge-amber">
                      {user.status.name}
                    </span>
                  </div>
                )}

                {/* Меню пользователя */}
                <div className="flex items-center gap-2">
                  <Link href="/profile" className="btn btn-ghost btn-sm">
                    Профиль
                  </Link>
                  <button onClick={signOut} className="btn btn-ghost btn-sm">
                    Выход
                  </button>
                </div>
              </>
            ) : (
              <Link href="/auth/login" className="btn btn-primary btn-sm">
                Войти
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
