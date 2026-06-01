// Удаляет тестового пользователя, созданного скриптом скриншотов (dev-login),
// чтобы не оставлять висячих строк в боевой БД заказчика.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// грузим .env.local вручную (без зависимостей)
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = 'visual-check@nicetry.local'

if (!url || !key) {
  console.error('Нет SUPABASE env — пропускаю очистку')
  process.exit(0)
}

const admin = createClient(url, key, { auth: { persistSession: false } })

// найдём пользователя по email среди auth-пользователей
let target = null
for (let page = 1; page <= 20 && !target; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
  if (error) { console.error(error.message); break }
  target = data.users.find((u) => u.email === EMAIL)
  if (data.users.length < 200) break
}

if (!target) {
  console.log('Тестовый пользователь не найден — очистка не требуется')
  process.exit(0)
}

await admin.from('orders').delete().eq('user_id', target.id)
await admin.from('users').delete().eq('id', target.id)
const { error: delErr } = await admin.auth.admin.deleteUser(target.id)
console.log(delErr ? `Ошибка удаления: ${delErr.message}` : `Удалён тестовый пользователь ${EMAIL} (${target.id})`)
