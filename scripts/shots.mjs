// Visual verification screenshots via system Chrome (puppeteer-core, no browser download).
// Usage: node scripts/shots.mjs [baseUrl]
// Captures public + authed pages at mobile/tablet/desktop widths into ./screenshots.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:3000'
const OUT = 'screenshots'
const EMAIL = 'visual-check@nicetry.local' // dev-login test user (cleaned up by caller)

const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const WIDTHS = [390, 768, 1280]
const HEIGHT = 900

mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shoot(page, name, width, { full = true } = {}) {
  await page.setViewport({ width, height: HEIGHT, deviceScaleFactor: 1 })
  await sleep(700) // let layout settle / fonts load
  const path = `${OUT}/${name}-${width}.png`
  await page.screenshot({ path, fullPage: full })
  console.log('  ✓', path)
}

async function gotoStable(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 }).catch((e) => {
    console.warn('  ! goto warn', url, e.message)
  })
  await sleep(400)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
})

try {
  const page = await browser.newPage()

  // --- gather real data (product id + category slug) for content-rich shots ---
  await gotoStable(page, `${BASE}/`)
  const data = await page.evaluate(async () => {
    const p = await fetch('/api/products?limit=50').then((r) => r.json()).catch(() => ({}))
    const c = await fetch('/api/categories').then((r) => r.json()).catch(() => ({}))
    return {
      products: (p.products || []).slice(0, 3),
      slug: (c.categories || [])[0]?.slug || '',
    }
  })
  const prodId = data.products[0]?.id
  console.log('data: prodId=%s slug=%s', prodId, data.slug)

  // --- PUBLIC pages (no auth) ---
  const publicPages = [
    ['home', `${BASE}/`],
    ['catalog', `${BASE}/catalog`],
    ['login', `${BASE}/auth/login`],
    ['notfound', `${BASE}/this-page-does-not-exist`],
  ]
  if (prodId) publicPages.push(['product', `${BASE}/product/${prodId}`])
  if (data.slug) publicPages.push(['category', `${BASE}/category/${data.slug}`])

  for (const [name, url] of publicPages) {
    console.log(name, url)
    await gotoStable(page, url)
    for (const w of WIDTHS) await shoot(page, name, w)
  }

  // --- populated CART (inject localStorage) ---
  if (data.products.length) {
    const cart = data.products.slice(0, 2).map((p) => ({
      product: p,
      quantity: 1,
    }))
    await gotoStable(page, `${BASE}/`)
    await page.evaluate((c) => localStorage.setItem('cart', JSON.stringify(c)), cart)
    console.log('cart (populated)')
    await gotoStable(page, `${BASE}/cart`)
    for (const w of WIDTHS) await shoot(page, 'cart-full', w)
  }

  // --- DEV LOGIN → authed pages ---
  const loginRes = await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    return { ok: r.ok, status: r.status, body: await r.text() }
  }, EMAIL)
  console.log('dev-login:', loginRes.status, loginRes.ok ? 'OK' : loginRes.body)

  if (loginRes.ok) {
    // profile
    console.log('profile')
    await gotoStable(page, `${BASE}/profile`)
    for (const w of WIDTHS) await shoot(page, 'profile', w)

    // checkout (cart still populated from above)
    console.log('checkout')
    await gotoStable(page, `${BASE}/checkout`)
    for (const w of WIDTHS) await shoot(page, 'checkout', w)

    // order not-found state
    console.log('order-notfound')
    await gotoStable(page, `${BASE}/orders/00000000-0000-0000-0000-000000000000`)
    for (const w of WIDTHS) await shoot(page, 'order-notfound', w)
  }

  console.log('DONE')
} finally {
  await browser.close()
}
