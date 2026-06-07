// Разовая проверка: сколько активных не-dessly товаров матчит поисковые термины для шапки.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const l of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
}
const { fetch: uf, Agent } = await import('undici')
const disp = new Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1, connections: 8 })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, global: { fetch: (i, init = {}) => uf(i, { ...init, dispatcher: disp }) } })
const terms = ['Steam','Mobile','Top Up','TopUp','Gift','Subscri','Game Pass','Netflix','Spotify','Discord','Roblox','PUBG','Valorant','PlayStation','Xbox','Apple','Google Play']
for (const t of terms) {
  const { count } = await sb.from('products').select('*', { count:'exact', head:true })
    .eq('is_active', true).neq('supplier','dessly').ilike('name', `%${t}%`)
  console.log(String(count ?? 0).padStart(5), t)
}
