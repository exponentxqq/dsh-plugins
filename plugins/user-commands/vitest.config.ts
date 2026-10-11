import { defineConfig } from 'vitest/config'

/**
 * Host-side logic (discovery, frontmatter parsing, conflict arbitration,
 * attribution, layer registration, invocation, watcher-driven reload) runs in
 * a plain node environment. This package is host-only: there is no browser half
 * to exercise under jsdom.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
