# Инструкция по Push в GitHub

## Проблема
```
Authentication failed for 'https://github.com/ivantemshik/NiceTry.git/'
```

GitHub требует аутентификацию для push операций.

## Решение: Personal Access Token (PAT)

### Шаг 1: Создание токена

1. Откройте: https://github.com/settings/tokens/new
2. Заполните форму:
   - **Note:** `NiceTry Development`
   - **Expiration:** `90 days` (или больше)
   - **Scopes:** ✅ `repo` (полный доступ к репозиториям)
3. Нажмите **Generate token**
4. **ВАЖНО:** Скопируйте токен (показывается только один раз!)

### Шаг 2: Push с токеном

Замените `YOUR_TOKEN` на ваш токен:

```bash
git push https://YOUR_TOKEN@github.com/ivantemshik/NiceTry.git master
```

### Шаг 3: Сохранение токена (опционально)

Чтобы не вводить токен каждый раз:

```bash
git config credential.helper store
git push origin master
```

При запросе введите:
- **Username:** `ivantemshik`
- **Password:** `YOUR_TOKEN` (ваш Personal Access Token)

Токен сохранится и больше не будет запрашиваться.

## Альтернатива: SSH ключ

Если предпочитаете SSH:

```bash
# 1. Генерация ключа (если нет)
ssh-keygen -t ed25519 -C "your_email@example.com"

# 2. Копирование публичного ключа
cat ~/.ssh/id_ed25519.pub

# 3. Добавление на GitHub
# https://github.com/settings/keys

# 4. Изменение remote на SSH
git remote set-url origin git@github.com:ivantemshik/NiceTry.git

# 5. Push
git push -u origin master
```

## Что будет отправлено

- **7 коммитов** (от инициализации до исправления схемы БД)
- **26 файлов** (код, документация, конфигурация)
- **~3,000 строк** кода и документации

## После успешного push

Репозиторий будет доступен по адресу:
https://github.com/ivantemshik/NiceTry

Можно будет:
- Подключить к Vercel для автодеплоя
- Клонировать на другие машины
- Работать с Pull Requests
