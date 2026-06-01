import AdminStub from '@/components/admin/AdminStub'

export default function AdminBannersPage() {
  return (
    <AdminStub
      title="Баннеры"
      subtitle="Управление баннерами на главной странице"
      icon={<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 16l-5-5-9 8" /></>}
      features={[
        'Загрузка изображений баннеров',
        'Настройка ссылок и позиций',
        'Управление порядком отображения',
        'Планирование показа по датам',
      ]}
    />
  )
}
