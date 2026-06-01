import AdminStub from '@/components/admin/AdminStub'

export default function AdminUTMPage() {
  return (
    <AdminStub
      title="UTM-кампании"
      subtitle="Отслеживание источников трафика и конверсий"
      icon={<><path d="M4 19V5M4 19h16M8 16l3-4 3 2 4-6" /></>}
      features={[
        'Создание UTM-меток для кампаний',
        'Генерация ссылок с параметрами',
        'Статистика по источникам трафика',
        'Отчёты по конверсиям и выручке',
        'Интеграция с Google Analytics',
      ]}
    />
  )
}
