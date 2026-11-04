import { defineConfig } from 'vitest/config'

/**
 * Host-side logic (config schema, credential flow, command registration, the
 * PAT owner) runs in a plain node environment. This package is host-only:
 * there is no browser half to exercise under jsdom.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
