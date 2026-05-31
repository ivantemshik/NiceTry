// scripts/apply-db-security.mjs
//
// Применяет supabase_security.sql (и при необходимости supabase_schema.sql) к боевой БД.
// Закрывает КРИТИЧЕСКУЮ дыру: без этого шага пользователь может прямым REST-запросом
// (публичный anon-ключ + свой JWT) выставить себе is_admin=true и произвольный balance —
// см. TEST_REPORT.md. PostgREST/service-key НЕ выполняют DDL, поэтому нужен прямой
// Postgres-коннект (пароль БД из дашборда Supabase: Settings → Database).
//
// Запуск (PowerShell):
//   $env:SUPABASE_DB_URL="postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres"
//   node scripts/apply-db-security.mjs
//
// Альтернатива без скрипта: открыть Supabase → SQL Editor → вставить и выполнить
// содержимое supabase_security.sql (идемпотентно).

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error(
    'ОШИБКА: переменная SUPABASE_DB_URL не задана.\n' +
      'Возьмите строку подключения в Supabase → Settings → Database → Connection string (URI)\n' +
      'и выполните:\n' +
      '  $env:SUPABASE_DB_URL="postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres"\n' +
      '  node scripts/apply-db-security.mjs'
  )
  process.exit(1)
}

let pg
try {
  pg = await import('pg')
} catch {
  console.error('Не найден пакет "pg". Установите: npm i -D pg')
  process.exit(1)
}

const files = process.argv.slice(2)
const toApply = files.length ? files : ['supabase_security.sql']

const client = new pg.default.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  for (const f of toApply) {
    const sql = readFileSync(resolve(root, f), 'utf8')
    console.log(`Применяю ${f} ...`)
    await client.query(sql)
    console.log(`  ✓ ${f} применён`)
  }
  console.log('Готово. Дыра повышения привилегий закрыта (users_update_own удалён + триггер).')
} catch (e) {
  console.error('Ошибка применения SQL:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
