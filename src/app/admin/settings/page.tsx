'use client'

import { useState, useEffect } from 'react'

interface UserStatus {
  id: string
  name: string
  discount_percent: number
  min_spent: number
  sort_order: number
}

interface Category {
  id: string
  name: string
  slug: string
  markup_percent: number
  usd_to_rub_rate: number
  is_active: boolean
  supplier: string
}

export default function AdminSettingsPage() {
  const [statuses, setStatuses] = useState<UserStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<UserStatus>>({})

  // Категории: наценка/курс/видимость (ТЗ §5.3 — под каждую категорию отдельно).
  const [categories, setCategories] = useState<Category[]>([])
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCat, setEditCat] = useState<Partial<Category>>({})

  useEffect(() => {
    fetchStatuses()
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/admin/categories')
      const data = await res.json()
      setCategories(data.categories || [])
    } catch (error) {
      console.error('Failed to fetch categories:', error)
    }
  }

  const handleSaveCat = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markup_percent: editCat.markup_percent,
          usd_to_rub_rate: editCat.usd_to_rub_rate,
          is_active: editCat.is_active,
        }),
      })
      if (res.ok) {
        setEditingCatId(null)
        fetchCategories()
      } else {
        alert('Ошибка при обновлении категории')
      }
    } catch (error) {
      console.error('Failed to update category:', error)
      alert('Ошибка при обновлении категории')
    }
  }

  const fetchStatuses = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/settings/statuses')
      const data = await res.json()
      setStatuses(data.statuses || [])
    } catch (error) {
      console.error('Failed to fetch statuses:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (status: UserStatus) => {
    setEditingId(status.id)
    setEditData(status)
  }

  const handleSave = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/settings/statuses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })

      if (res.ok) {
        setEditingId(null)
        fetchStatuses()
      } else {
        alert('Ошибка при обновлении статуса')
      }
    } catch (error) {
      console.error('Failed to update status:', error)
      alert('Ошибка при обновлении статуса')
    }
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditData({})
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-[30px] font-bold text-navy mb-2">Настройки</h1>
        <p className="text-muted">Управление системными параметрами</p>
      </div>

      {/* Статусы пользователей */}
      <div className="card mb-6">
        <div className="p-6 border-b border-border">
          <h2 className="text-[17px] font-bold text-navy">
            Статусы пользователей
          </h2>
          <p className="text-sm text-muted mt-1">
            Настройка уровней и скидок для пользователей
          </p>
        </div>

        {loading ? (
          <div className="p-6 text-center text-muted">Загрузка...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-bg border-b border-border">
                <tr>
                  <th className="text-left p-4 text-sm font-semibold text-navy">
                    Название
                  </th>
                  <th className="text-right p-4 text-sm font-semibold text-navy">
                    Скидка (%)
                  </th>
                  <th className="text-right p-4 text-sm font-semibold text-navy">
                    Мин. потрачено (₽)
                  </th>
                  <th className="text-center p-4 text-sm font-semibold text-navy">
                    Порядок
                  </th>
                  <th className="text-right p-4 text-sm font-semibold text-navy">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody>
                {statuses.map((status) => (
                  <tr
                    key={status.id}
                    className="border-b border-border hover:bg-gray-bg"
                  >
                    {editingId === status.id ? (
                      <>
                        <td className="p-4">
                          <input
                            type="text"
                            value={editData.name || ''}
                            onChange={(e) =>
                              setEditData({ ...editData, name: e.target.value })
                            }
                            className="input"
                          />
                        </td>
                        <td className="p-4">
                          <input
                            type="number"
                            value={editData.discount_percent || 0}
                            onChange={(e) =>
                              setEditData({
                                ...editData,
                                discount_percent: parseFloat(e.target.value),
                              })
                            }
                            className="input text-right"
                            step="0.01"
                            min="0"
                            max="100"
                          />
                        </td>
                        <td className="p-4">
                          <input
                            type="number"
                            value={editData.min_spent || 0}
                            onChange={(e) =>
                              setEditData({
                                ...editData,
                                min_spent: parseFloat(e.target.value),
                              })
                            }
                            className="input text-right"
                            step="0.01"
                            min="0"
                          />
                        </td>
                        <td className="p-4">
                          <input
                            type="number"
                            value={editData.sort_order || 0}
                            onChange={(e) =>
                              setEditData({
                                ...editData,
                                sort_order: parseInt(e.target.value),
                              })
                            }
                            className="input text-center"
                            min="0"
                          />
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleSave(status.id)}
                              className="btn btn-sm btn-primary"
                            >
                              Сохранить
                            </button>
                            <button
                              onClick={handleCancel}
                              className="btn btn-sm btn-ghost"
                            >
                              Отмена
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-4">
                          <div className="font-semibold text-navy">
                            {status.name}
                          </div>
                        </td>
                        <td className="p-4 text-right text-muted">
                          {status.discount_percent}%
                        </td>
                        <td className="p-4 text-right text-muted">
                          {status.min_spent.toFixed(2)} ₽
                        </td>
                        <td className="p-4 text-center text-muted">
                          {status.sort_order}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleEdit(status)}
                            className="btn btn-sm btn-ghost"
                          >
                            Редактировать
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Категории: наценка / курс / видимость (ТЗ §5.3) */}
      <div className="card mb-6">
        <div className="p-6 border-b border-border">
          <h2 className="text-[17px] font-bold text-navy">Категории: наценка и курс</h2>
          <p className="text-sm text-muted mt-1">
            Наценка и курс USD→₽ задаются под каждую категорию. Цена считается как
            ceil(USD × курс × (1 + наценка%/100)).
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-bg border-b border-border">
              <tr>
                <th className="text-left p-4 text-sm font-semibold text-navy">Категория</th>
                <th className="text-left p-4 text-sm font-semibold text-navy">Поставщик</th>
                <th className="text-right p-4 text-sm font-semibold text-navy">Наценка (%)</th>
                <th className="text-right p-4 text-sm font-semibold text-navy">Курс USD→₽</th>
                <th className="text-center p-4 text-sm font-semibold text-navy">Активна</th>
                <th className="text-right p-4 text-sm font-semibold text-navy">Действия</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="border-b border-border hover:bg-gray-bg">
                  {editingCatId === cat.id ? (
                    <>
                      <td className="p-4 font-semibold text-navy">{cat.name}</td>
                      <td className="p-4 text-muted">{cat.supplier}</td>
                      <td className="p-4">
                        <input
                          type="number"
                          value={editCat.markup_percent ?? 0}
                          onChange={(e) => setEditCat({ ...editCat, markup_percent: parseFloat(e.target.value) })}
                          className="input text-right"
                          step="0.01"
                          min="0"
                        />
                      </td>
                      <td className="p-4">
                        <input
                          type="number"
                          value={editCat.usd_to_rub_rate ?? 0}
                          onChange={(e) => setEditCat({ ...editCat, usd_to_rub_rate: parseFloat(e.target.value) })}
                          className="input text-right"
                          step="0.01"
                          min="0"
                        />
                      </td>
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={editCat.is_active ?? true}
                          onChange={(e) => setEditCat({ ...editCat, is_active: e.target.checked })}
                        />
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleSaveCat(cat.id)} className="btn btn-sm btn-primary">
                            Сохранить
                          </button>
                          <button onClick={() => setEditingCatId(null)} className="btn btn-sm btn-ghost">
                            Отмена
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-4 font-semibold text-navy">{cat.name}</td>
                      <td className="p-4 text-muted">{cat.supplier}</td>
                      <td className="p-4 text-right text-muted">{cat.markup_percent}%</td>
                      <td className="p-4 text-right text-muted">{cat.usd_to_rub_rate}</td>
                      <td className="p-4 text-center">
                        <span className={`badge ${cat.is_active ? 'badge-stock' : 'badge-out'}`}>
                          {cat.is_active ? 'Да' : 'Нет'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => {
                            setEditingCatId(cat.id)
                            setEditCat(cat)
                          }}
                          className="btn btn-sm btn-ghost"
                        >
                          Редактировать
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted">
                    Категории не загружены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
