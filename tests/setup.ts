// Test setup: load environment variables from .env.local into process.env so that
// integration tests (live Supabase) and server modules read the same configuration
// as `next dev`. Pure-logic and supplier-mock tests do not depend on these, but loading
// them is harmless and keeps a single source of truth.
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function loadEnvFile(file: string) {
  const path = resolve(process.cwd(), file)
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // .env.local wins over any pre-existing shell value to mirror Next.js behaviour.
    process.env[key] = value
  }
}

loadEnvFile('.env.local')

// Default NODE_ENV to 'test' (not 'production') so dev-only routes behave as in dev.
if (!process.env.NODE_ENV) {
  ;(process.env as Record<string, string>).NODE_ENV = 'test'
}
