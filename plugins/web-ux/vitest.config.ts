import { defineConfig } from 'vitest/config'

/**
 * Host-side logic (scan, env expansion, conflict arbitration, attribution,
 * deny derivation) runs in a plain node environment. The browser half is
 * exercised by the badge behaviour test, which opts into jsdom with its own
 * `// @vitest-environment jsdom` docblock instead of switching the default
 * for every suite.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
  },
})
