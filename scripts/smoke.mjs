// scripts/smoke.mjs — HTTP smoke-тест против ЗАПУЩЕННОГО сервера (UI/SSR + публичные/защищённые роуты).
// Это «E2E-аналог» без браузера: проверяет реальные HTTP-ответы боевой сборки.
//
// Запуск:
//   npm run build
//   npx next start -p 3210   (в отдельном окне)
//   node scripts/smoke.mjs   (или: SMOKE_BASE=http://localhost:3000 node scripts/smoke.mjs)
//
// Выходной код != 0, если хоть одна проверка не прошла.

const BASE = process.env.SMOKE_BASE || 'http://localhost:3210'
let failed = 0
const results = []

function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail })
  if (!cond) failed++
}

async function status(path, opts) {
  const res = await fetch(BASE + path, { redirect: 'manual', ...opts })
  return res
}

// --- Публичные страницы (SSR) ---
for (const p of ['/', '/catalog', '/auth/login', '/cart']) {
  const r = await status(p)
  check(`GET ${p} → 200`, r.status === 200, `code=${r.status}`)
}

// --- Публичные API ---
const prod = await (await status('/api/products?limit=3')).json()
check('GET /api/products возвращает товары', Array.isArray(prod.products) && prod.products.length > 0)
check('товары имеют положительную цену', prod.products.every((p) => Number(p.price) >= 0))

const catRes = await status('/api/categories')
const catBody = await catRes.json()
const cats = catBody.categories || catBody
check('GET /api/categories возвращает 10 категорий', Array.isArray(cats) && cats.length === 10, `len=${cats.length}`)

// фильтр поиска
const s = await (await status('/api/products?search=Steam&limit=50')).json()
check('search=Steam: все результаты содержат Steam', s.products.length > 0 && s.products.every((p) => /steam/i.test(p.name)))

// --- Защита приватных/админских API без авторизации ---
check('GET /api/user/profile без авторизации → 401', (await status('/api/user/profile')).status === 401)
check('GET /api/admin/orders без прав → 401', (await status('/api/admin/orders')).status === 401)

// --- Редиректы защищённых страниц на логин ---
const prof = await status('/profile')
check('GET /profile → редирект (3xx) на логин', prof.status >= 300 && prof.status < 400 && /\/auth\/login/.test(prof.headers.get('location') || ''))
const adm = await status('/admin')
check('GET /admin → редирект (3xx) на логин', adm.status >= 300 && adm.status < 400)

// --- Пауза платежей / авторизация заказа ---
const cardRes = await status('/api/orders/create', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ items: [{ product_id: 'x' }], payment_method: 'card' }),
})
check('POST /api/orders/create без авторизации → 401', cardRes.status === 401)

// --- Промокод ---
const pv = await (
  await status('/api/promo/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'DOESNOTEXIST-' + Math.random().toString(36).slice(2) }),
  })
).json()
check('POST /api/promo/validate (несуществующий) → valid:false', pv.valid === false)

// --- Вывод ---
for (const r of results) {
  // eslint-disable-next-line no-console
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`)
}
// eslint-disable-next-line no-console
console.log(`\n${results.length - failed}/${results.length} проверок прошло`)
process.exit(failed ? 1 : 0)
