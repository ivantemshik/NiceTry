# ТЗ для следующего разработчика — Импорт товаров и тестирование

## Цель
Подтянуть товары через API (AppRoute/Dessly), протестировать функционал проекта, исправить найденные баги.

---

## Задача 1: Импорт товаров через API

### 1.1 Получить доступ к Supabase
**Владелец проекта должен пригласить вас:**
1. Проверьте email — должно прийти приглашение от Supabase
2. Примите приглашение
3. Войдите в https://supabase.com
4. Откройте проект `ikdxebfmvkrmnfmhzmoo`

**Получить ключи API:**
1. В Supabase Dashboard перейдите в **Settings** → **API**
2. Скопируйте:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY`

### 1.2 Получить реальные ключи API
**От владельца проекта нужно получить:**
- `APPROUTE_API_KEY` — ключ AppRoute API
- `APPROUTE_BASE_URL` — базовый URL AppRoute
- `DESSLY_API_KEY` — ключ Dessly API

**Добавить в `.env.local`:**
```env
# Supabase (из Supabase Dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://ikdxebfmvkrmnfmhzmoo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш_anon_key
SUPABASE_SERVICE_ROLE_KEY=ваш_service_role_key

# AppRoute API (от владельца)
APPROUTE_API_KEY=ваш_ключ_approute
APPROUTE_BASE_URL=https://api.approute.com

# Dessly API (от владельца)
DESSLY_API_KEY=ваш_ключ_dessly

# Site
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 1.2 Обновить заглушки на реальные API
**Файлы для изменения:**
- `src/lib/approute.ts` — заменить моковые данные на реальные запросы
- `src/lib/dessly.ts` — заменить моковые данные на реальные запросы

**Что нужно реализовать:**
```typescript
// src/lib/approute.ts
export class AppRouteClient {
  async getServices(): Promise<AppRouteService[]> {
    const response = await fetch(`${this.baseUrl}/services`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    })
    return await response.json()
  }
  
  // Аналогично для getDenominations, createOrder, getOrderStatus
}
```

### 1.3 Создать категории в БД
**Через Supabase SQL Editor или админ-панель:**
```sql
INSERT INTO categories (name, slug, icon, supplier, is_active, sort_order) VALUES
  ('Игры', 'games', '🎮', 'dessly', true, 1),
  ('Steam', 'steam', '💨', 'approute', true, 2),
  ('PlayStation', 'playstation', '🎮', 'approute', true, 3),
  ('Xbox', 'xbox', '🎮', 'approute', true, 4),
  ('Подписки', 'subscriptions', '⭐', 'approute', true, 5);
```

### 1.4 Импортировать товары
**Через админ-панель:**
1. Войти как админ: `/admin`
2. Перейти в "Товары" → "Импорт из AppRoute"
3. Нажать кнопку импорта
4. Проверить, что товары появились в каталоге

**Или через API route:**
```bash
curl -X POST http://localhost:3000/api/products/import \
  -H "Content-Type: application/json"
```

---

## Задача 2: Тестирование функционала

### 2.1 Авторизация
- [ ] Регистрация через email (magic link)
- [ ] Вход через magic link
- [ ] Выход из системы
- [ ] Просмотр профиля
- [ ] Проверка middleware (защита `/profile`, `/admin`)

### 2.2 Каталог и товары
- [ ] Главная страница отображается корректно
- [ ] Каталог показывает все товары
- [ ] Фильтры работают (категория, тип, поиск)
- [ ] Страница товара открывается
- [ ] Кнопка "В корзину" работает

### 2.3 Корзина и оформление
- [ ] Добавление товаров в корзину
- [ ] Изменение количества
- [ ] Удаление товаров
- [ ] Расчёт итоговой суммы
- [ ] Применение промокода
- [ ] Оформление заказа (без оплаты)

### 2.4 Админ-панель
- [ ] Dashboard показывает статистику
- [ ] Управление товарами (CRUD)
- [ ] Управление заказами (статусы, возвраты)
- [ ] Управление пользователями (баланс, статус, админ)
- [ ] Создание промокодов
- [ ] Настройки статусов

---

## Задача 3: Исправление багов

### Найденные баги (исправить):
1. **Header не отображается** — исправлено в layout.tsx
2. **Главная страница пустая** — проверить импорты компонентов
3. **Ошибки TypeScript** — проверить типы в `src/types/index.ts`

### Как искать баги:
```bash
# Проверить логи dev-сервера
npm run dev

# Проверить сборку
npm run build

# Проверить TypeScript
npx tsc --noEmit
```

### Логирование:
Все ошибки логировать в консоль:
```typescript
console.error('[Component Name] Error:', error)
```

---

## Задача 4: Подготовка к верификации

### 4.1 Проверить наличие товаров
- Минимум 20-30 товаров в каталоге
- Разные категории
- Корректные цены
- Описания на русском

### 4.2 Проверить работу заказов
- Создание заказа работает
- Статусы меняются
- История заказов сохраняется

### 4.3 Создать тестовые данные
- 5-10 тестовых пользователей
- 10-20 тестовых заказов
- 3-5 промокодов

---

## Что передать от владельца проекта

### 1. Доступы
- **GitHub репозиторий:** https://github.com/ivantemshik/NiceTry
- **Supabase проект:** URL и ключи (уже в `.env.local`)

### 2. API ключи
- AppRoute API Key
- AppRoute Base URL
- Dessly API Key

### 3. Документация
- `README.md` — описание проекта
- `WORKLOG.md` — журнал разработки
- `FINAL_REPORT.md` — отчёт о проделанной работе
- `NEXT_STEPS.md` — следующие шаги
- `SUPABASE_SETUP.md` — инструкция по Supabase

### 4. Инструкции
```bash
# Клонировать репозиторий
git clone https://github.com/ivantemshik/NiceTry.git
cd NiceTry

# Установить зависимости
npm install

# Настроить .env.local (добавить реальные ключи API)
# Файл уже существует с ключами Supabase

# Запустить dev-сервер
npm run dev

# Открыть браузер
http://localhost:3000
```

---

## Критерии готовности

### Перед паузой должно быть:
- ✅ 20-30 товаров в каталоге (реальные из API)
- ✅ Все основные функции протестированы
- ✅ Найденные баги исправлены
- ✅ Проект собирается без ошибок (`npm run build`)
- ✅ Тестовые данные созданы
- ✅ Документация обновлена (если были изменения)

### После этого:
⏸️ **ПАУЗА** — подать заявку на верификацию в платёжную систему

---

## Контакты и вопросы

Если возникнут вопросы:
1. Проверить документацию в репозитории
2. Проверить `WORKLOG.md` — там история всех изменений
3. Проверить комментарии в коде
4. Спросить у владельца проекта

---

**Дата создания:** 2026-05-31  
**Автор:** Claude Opus 4.8  
**Статус:** Готово к передаче
