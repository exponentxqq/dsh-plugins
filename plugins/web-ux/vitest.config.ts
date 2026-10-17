import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Host-side logic (scan, env expansion, conflict arbitration, attribution,
 * deny derivation) runs in a plain node environment. The browser half is
 * exercised by the badge / delete suites, which opt into jsdom with their own
 * `// @vitest-environment jsdom` docblock instead of switching the default for
 * every suite.
 *
 * The primitives alias is a test-only seam: the published barrel carries bare
 * `.module.css` imports and host-side dependencies the jsdom suite cannot
 * resolve, so every suite loads the stand-in instead (same DOM shape; see
 * test/stubs/ui-primitives.tsx). Component props stay typed against the real
 * package, because TypeScript does not know about this alias.
 */
export default defineConfig({
  // The root tsconfig.json is a solution file (no compilerOptions), so the
  // per-file tsconfig lookup cannot infer `jsx: "react-jsx"` for the stub and
  // the test files; without this the JSX in them compiles to `React.createElement`
  // and throws "React is not defined" at render time.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': resolve(import.meta.dirname, 'test/stubs/ui-primitives.tsx'),
    },
  },
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
  },
})
