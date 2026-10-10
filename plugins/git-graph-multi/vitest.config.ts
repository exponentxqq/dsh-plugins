import { defineConfig } from 'vitest/config'

/**
 * Host-side unit tests only: the git gate, the repo scan, and the group
 * operations are plain node modules. The browser half is exercised through
 * the GUI acceptance pass instead (no jsdom seat in this package).
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
