import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Resolve the "@/..." alias manually (avoids the ESM-only vite-tsconfig-paths plugin,
// which cannot be require()'d from a CJS-context config in this project).
const srcDir = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: srcDir + '/$1' }],
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
    // Run files sequentially to avoid races on the shared mock order store and live DB.
    fileParallelism: false,
    sequence: { concurrent: false },
    reporters: ['default'],
  },
})
