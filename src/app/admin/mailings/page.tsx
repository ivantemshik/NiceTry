import AdminStub from '@/components/admin/AdminStub'

export default function AdminMailingsPage() {
  return (
    <AdminStub
      title="Рассылки"
      subtitle="Управление рассылками в Telegram"
      icon={<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>}
      features={[
        'Создание рассылок для Telegram',
        'Сегментация пользователей',
        'Шаблоны сообщений',
        'Отложенная отправка',
        'Статистика доставки и открытий',
      ]}
    />
  )
}
