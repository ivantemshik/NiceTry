# Что передать следующему разработчику

## 📦 Доступы и ключи

### 1. GitHub репозиторий
```
https://github.com/ivantemshik/NiceTry
```
**Действия:**
- Дать доступ к репозиторию (Settings → Collaborators)
- Или: разработчик клонирует публичный репозиторий

### 2. Supabase (нужно пригласить)
**Владелец должен пригласить разработчика в проект:**

1. Откройте https://supabase.com
2. Войдите в свой аккаунт
3. Выберите проект `ikdxebfmvkrmnfmhzmoo`
4. Перейдите в **Settings** → **Team**
5. Нажмите **Invite member**
6. Введите email разработчика
7. Выберите роль: **Developer**

**После приглашения разработчик:**
- Получит доступ к проекту Supabase
- Сможет посмотреть ключи в Settings → API
- Сможет работать с БД через SQL Editor
- Сможет смотреть логи и таблицы

**Ключи для .env.local:**
Разработчик найдёт их в Supabase Dashboard → Settings → API:
```env
NEXT_PUBLIC_SUPABASE_URL=https://ikdxebfmvkrmnfmhzmoo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=... (из Project API keys → anon public)
SUPABASE_SERVICE_ROLE_KEY=... (из Project API keys → service_role secret)
```

### 3. API ключи (нужно получить)
**От вас требуется передать:**

#### AppRoute API
```env
APPROUTE_API_KEY=ваш_ключ_здесь
APPROUTE_BASE_URL=https://api.approute.com (или другой URL)
```
**Где взять:**
- Зарегистрироваться на AppRoute
- Получить API ключ в личном кабинете
- Передать разработчику

#### Dessly API
```env
DESSLY_API_KEY=ваш_ключ_здесь
```
**Где взять:**
- Зарегистрироваться на Dessly
- Получить API ключ
- Передать разработчику

---

## 📋 Инструкции для разработчика

### Шаг 1: Клонирование проекта
```bash
git clone https://github.com/ivantemshik/NiceTry.git
cd NiceTry
npm install
```

### Шаг 2: Настройка .env.local
**Создать файл `.env.local` в корне проекта:**
```env
# Supabase (получить из Supabase Dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://ikdxebfmvkrmnfmhzmoo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш_anon_key_из_supabase
SUPABASE_SERVICE_ROLE_KEY=ваш_service_role_key_из_supabase

# AppRoute API (получить от владельца)
APPROUTE_API_KEY=ключ_от_владельца
APPROUTE_BASE_URL=url_от_владельца

# Dessly API (получить от владельца)
DESSLY_API_KEY=ключ_от_владельца

# Site
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Шаг 3: Запуск проекта
```bash
npm run dev
```
Открыть: http://localhost:3000

### Шаг 4: Следовать инструкциям
Открыть файл: **HANDOFF_INSTRUCTIONS.md**

---

## 📝 Документация для разработчика

В репозитории есть вся документация:
- `HANDOFF_INSTRUCTIONS.md` — **ГЛАВНОЕ ТЗ** для разработчика
- `README.md` — описание проекта
- `WORKLOG.md` — история всех изменений
- `FINAL_REPORT.md` — отчёт о проделанной работе
- `NEXT_STEPS.md` — следующие шаги
- `SUPABASE_SETUP.md` — инструкция по Supabase
- `DEPLOYMENT.md` — гайд по деплою

---

## ✅ Чек-лист передачи

### Что вы должны сделать:

- [ ] Дать доступ к GitHub репозиторию (или сделать публичным)
- [ ] **Пригласить разработчика в Supabase проект** (Settings → Team → Invite member, роль: Developer)
- [ ] Получить ключ AppRoute API
- [ ] Получить ключ Dessly API
- [ ] Передать ключи API разработчику (безопасно, не в открытом виде)

### Что разработчик должен сделать:

- [ ] Принять приглашение в Supabase (проверить email)
- [ ] Клонировать репозиторий
- [ ] Установить зависимости (`npm install`)
- [ ] Создать `.env.local` и добавить ключи (из Supabase Dashboard + от владельца)
- [ ] Запустить проект (`npm run dev`)
- [ ] Следовать инструкциям в `HANDOFF_INSTRUCTIONS.md`

---

## 🔐 Безопасность

**Как передать ключи безопасно:**
1. Через зашифрованный мессенджер (Telegram, Signal)
2. Через защищённый сервис (1Password, Bitwarden)
3. НЕ через email в открытом виде
4. НЕ в коммитах Git

---

## 📞 Контакты

Если у разработчика возникнут вопросы:
1. Проверить документацию в репозитории
2. Проверить `WORKLOG.md` — там вся история
3. Спросить у вас

---

## 🎯 Цель работы разработчика

**Импортировать 20-30 товаров → Протестировать → Исправить баги → Подготовить к верификации**

После этого: ⏸️ **ПАУЗА** — подать заявку на верификацию в платёжную систему.

---

**Дата:** 2026-05-31  
**Статус:** Готово к передаче
