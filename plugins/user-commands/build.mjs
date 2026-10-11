/**
 * Self-contained build for dsh-plugin-user-commands.
 *
 * This package is HOST-ONLY (no browser half): `src/index.ts` becomes one ESM
 * entry in `lib/`. Node builtins stay external; `yaml` (frontmatter parsing) is
 * BUNDLED because a `link:` install does not install the linked package's
 * dependencies — the artifact must be self-contained to load.
 *
 * `@deepseek-ai/dsh-llm` is deliberately NOT bundled: `createUserMessage` comes
 * from the running harness, resolved by the harness's own module router (the
 * established multi-root-workspace pattern), so this plugin and the host share
 * ONE message-identity implementation instead of freezing a private copy of it.
 *
 * No d.ts and no sourcemaps: the plugin is consumed by the dsh runtime, not by
 * other TypeScript.
 */

import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const ROOT = import.meta.dirname
const OUT_DIR = path.join(ROOT, 'lib')
/** Bundle identity: loader diagnostics key this package by this name. */
const PACKAGE_NAME = 'dsh-plugin-user-commands'

/** Build the host half: one ESM entry, everything but the exempt modules inlined. */
async function buildHost() {
  await build({
    entryPoints: [path.join(ROOT, 'src/index.ts')],
    outdir: OUT_DIR,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
    // The harness modules stay outside the bundle (see the module docblock).
    external: ['node:*', '@deepseek-ai/dsh-llm'],
    // `yaml` ships CommonJS whose code calls `require('process')` /
    // `require('buffer')`. Bundling CJS into an ESM output turns those into
    // esbuild's `__require` shim, which throws "Dynamic require of ... is not
    // supported" the moment the module is evaluated — the row then fails to
    // import at boot. A real `require` bound to the bundle's own URL lets those
    // core-module requires resolve while the artifact stays self-contained (no
    // runtime resolution against this package's node_modules).
    banner: {
      js: "import { createRequire as __dshCreateRequire } from 'node:module';\nconst require = __dshCreateRequire(import.meta.url);",
    },
    logLevel: 'warning',
  })
}

await rm(OUT_DIR, { recursive: true, force: true })
await mkdir(OUT_DIR, { recursive: true })
await buildHost()
console.log(`built ${PACKAGE_NAME}: lib/index.js`)
