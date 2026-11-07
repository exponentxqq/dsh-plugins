import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // The host's published primitives barrel carries bare `.module.css`
      // imports and host-side dependencies the jsdom suite cannot resolve; the
      // stand-in keeps the same DOM shape (see test/stubs/ui-primitives.tsx).
      '@deepseek-ai/dsh-client-ui-primitives': resolve(import.meta.dirname, 'test/stubs/ui-primitives.tsx'),
    },
  },
  test: {
    include: ['test/**/*.spec.ts', 'test/**/*.spec.tsx', 'test/**/*.e2e.ts'],
    pool: 'forks',
    testTimeout: 30_000,
  },
})
