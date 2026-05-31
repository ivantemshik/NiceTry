# Деплой NiceTry на Vercel

## Автоматический деплой из GitHub

Проект настроен на автоматический деплой в Vercel при каждом push в репозиторий.

### Шаг 1: Подключение репозитория к Vercel

1. Перейдите на https://vercel.com
2. Войдите через GitHub
3. Нажмите **Add New** → **Project**
4. Выберите репозиторий `ivantemshik/NiceTry`
5. Нажмите **Import**

### Шаг 2: Настройка переменных окружения

В настройках проекта Vercel добавьте переменные окружения:

#### Обязательные (для Этапа 2):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
NEXT_PUBLIC_SITE_URL=https://your-domain.vercel.app
```

#### Для Этапа 3 (интеграция с поставщиками):
```
APPROUTE_API_KEY=your_approute_key
APPROUTE_BASE_URL=https://api.approute.com
DESSLY_API_KEY=your_dessly_key
```

#### Для Этапа 5 (приём платежей):
```
PAY4GAME_MERCHANT_ID=your_merchant_id
PAY4GAME_SECRET_KEY=your_secret_key
```

#### Для Этапа 6 (Telegram-бот):
```
TELEGRAM_BOT_TOKEN=your_bot_token
```

### Шаг 3: Настройка домена (опционально)

1. В настройках проекта Vercel откройте **Domains**
2. Добавьте свой домен
3. Настройте DNS записи согласно инструкциям Vercel
4. Обновите `NEXT_PUBLIC_SITE_URL` на ваш домен

### Шаг 4: Обновление Supabase Redirect URLs

После деплоя добавьте production URL в Supabase:

1. Откройте Supabase → **Authentication** → **URL Configuration**
2. Добавьте в **Redirect URLs**:
   ```
   https://your-domain.vercel.app/auth/callback
   ```

### Автоматический деплой

После настройки каждый push в `main` ветку автоматически:
1. Запускает сборку проекта
2. Деплоит на production
3. Отправляет уведомление о статусе

Pull Request создают preview-деплои для тестирования.

## Локальная проверка перед деплоем

```bash
# Сборка production версии
npm run build

# Запуск production сервера локально
npm run start
```

## Troubleshooting

### Ошибка сборки "Module not found"
- Проверьте, что все зависимости в `package.json`
- Запустите `npm install` локально

### Ошибка "Environment variable not found"
- Убедитесь, что все переменные окружения добавлены в Vercel
- Переменные с префиксом `NEXT_PUBLIC_` доступны на клиенте
- Остальные — только на сервере

### Ошибка подключения к Supabase
- Проверьте правильность URL и ключей
- Убедитесь, что redirect URLs настроены в Supabase

## Мониторинг

- **Логи:** Vercel Dashboard → Deployments → Logs
- **Аналитика:** Vercel Analytics (включается в настройках)
- **Ошибки:** Vercel Dashboard → Errors

---

**Следующий шаг:** После успешного деплоя протестируйте авторизацию и основные функции.
