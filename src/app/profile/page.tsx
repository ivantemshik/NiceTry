'use client'

import { useAuth } from '@/hooks/useAuth'
import { useUser } from '@/hooks/useUser'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

export default function ProfilePage() {
  const { user: authUser, loading: authLoading } = useAuth()
  const { user, loading: userLoading } = useUser()

  if (authLoading || userLoading) {
    return (
      <div className="container py-8">
        <div className="text-center text-muted">Загрузка...</div>
      </div>
    )
  }

  if (!authUser || !user) {
    return (
      <div className="container py-8">
        <div className="text-center text-muted">Пользователь не найден</div>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <h1 className="mb-6">Профиль</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Основная информация */}
        <Card>
          <h2 className="mb-4">Основная информация</h2>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted mb-1">Email</div>
              <div className="font-medium">{user.email}</div>
            </div>

            <div>
              <div className="text-sm text-muted mb-1">Статус</div>
              <div>
                <Badge variant="amber">
                  {user.status?.name || 'Bronze'}
                </Badge>
                {user.status?.discount_percent > 0 && (
                  <span className="text-sm text-muted ml-2">
                    Скидка {user.status.discount_percent}%
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm text-muted mb-1">Реферальный код</div>
              <div className="font-mono font-medium">{user.referral_code}</div>
            </div>

            {user.telegram_id && (
              <div>
                <div className="text-sm text-muted mb-1">Telegram ID</div>
                <div className="font-medium">{user.telegram_id}</div>
              </div>
            )}

            <div>
              <div className="text-sm text-muted mb-1">Дата регистрации</div>
              <div className="font-medium">
                {new Date(user.created_at).toLocaleDateString('ru-RU')}
              </div>
            </div>
          </div>
        </Card>

        {/* Баланс */}
        <Card>
          <h2 className="mb-4">Баланс</h2>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted mb-1">Текущий баланс</div>
              <div className="text-3xl font-bold text-navy">
                {user.balance.toFixed(2)} ₽
              </div>
            </div>

            <Button variant="primary" className="w-full">
              Пополнить баланс
            </Button>
          </div>
        </Card>

        {/* Реферальная программа */}
        <Card className="md:col-span-2">
          <h2 className="mb-4">Реферальная программа</h2>
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Приглашайте друзей и получайте бонусы! Ваша реферальная ссылка:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={`${process.env.NEXT_PUBLIC_SITE_URL}/?ref=${user.referral_code}`}
                readOnly
                className="input flex-1"
              />
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${process.env.NEXT_PUBLIC_SITE_URL}/?ref=${user.referral_code}`
                  )
                }}
              >
                Копировать
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
