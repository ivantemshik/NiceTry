# NiceTry — магазин цифровых товаров

> Пополнение игровых аккаунтов, ключи и коды активации, gift-карты, подписки

## Стек

- **Frontend:** Next.js 14 (App Router) + React + TypeScript
- **Backend:** Supabase (Auth, Database, Storage)
- **Styling:** Tailwind CSS (дизайн-система из index.html)
- **Деплой:** Vercel (автодеплой из GitHub)

## Быстрый старт

### Локальная разработка

1. Установите зависимости:
```bash
npm install
```

2. Скопируйте `.env.example` в `.env.local` и заполните переменные окружения

3. Запустите dev-сервер:
```bash
npm run dev
```

Или используйте `.bat` скрипт:
```bash
start.bat
```

Сайт будет доступен по адресу: http://localhost:3000

### Команды

- `npm run dev` — запуск dev-сервера
- `npm run build` — сборка для продакшена
- `npm run start` — запуск prod-сервера
- `npm run lint` — проверка кода
- `npm run type-check` — проверка типов TypeScript

## Структура проекта

```
NiceTry/
├── src/
│   ├── app/              # Next.js App Router (страницы)
│   ├── components/       # React-компоненты
│   ├── lib/              # Утилиты, API-клиенты
│   ├── types/            # TypeScript типы
│   └── styles/           # Глобальные стили
├── public/               # Статические файлы
├── index.html            # Эталон дизайна (референс)
├── ТЗ_NiceTry.md         # Техническое задание
├── WORKLOG.md            # Журнал разработки
└── start.bat             # Локальный запуск (Windows)
```

## Документация

- **ТЗ:** `ТЗ_NiceTry.md` — полное техническое задание
- **Дизайн:** `index.html` — эталон внешнего вида
- **WORKLOG:** `WORKLOG.md` — журнал разработки (append-only)
- **AppRoute API:** `AppRoute_Public_API_Documentation_RU.pdf`
- **Dessly API:** https://desslyhub.readme.io/reference/introduction

## Поставщики

- **AppRoute** — gift-карты и пополнения (цены в USD)
- **Dessly** — отправка игр/гифтов (цены в USD)

## Этапы разработки

- [x] **Этап 0:** Подготовка (репозиторий, структура, стек)
- [ ] **Этап 1:** Фронтенд-визуал (готов: index.html)
- [ ] **Этап 2:** Бэкенд-каркас и авторизация
- [ ] **Этап 3:** Каталог и интеграция с поставщиком
- [ ] **Этап 4:** Полная админ-панель
- [ ] **⏸️ ПАУЗА:** Заявка на платёжную систему + верификация
- [ ] **Этап 5:** Приём платежей (после верификации)
- [ ] **Этап 6:** Telegram-бот, WebApp, уведомления
- [ ] **Этап 7:** Пост-MVP (крипто-оплата)

## Безопасность

⚠️ **Все секреты хранятся только в переменных окружения:**
- X-API-Key AppRoute
- Ключ Dessly
- Ключи Pay4game
- Supabase Service Role Key

**Никогда не коммитьте `.env` файлы в репозиторий!**

## Деплой

Автоматический деплой в Vercel:
- Push в `main` → production
- Pull Request → preview

## Лицензия

Proprietary — все права защищены
