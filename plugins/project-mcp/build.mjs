/**
 * Self-contained build for dsh-plugin-project-mcp.
 *
 * This package is HOST-ONLY (the browser half stays in `dsh-plugin-web-ux`):
 * `src/index.ts` becomes one ESM entry in `lib/`. Node builtins stay external;
 * every package dependency is BUNDLED (`yaml` is the only one) because a
 * `link:` install does not install the linked package's dependencies — the
 * artifact must be self-contained to load.
 *
 * The MCP client (`@deepseek-ai/dsh-mcp-client`) is deliberately NOT bundled:
 * the plugin imports it at runtime through `ctx.loader.import`, so it always
 * matches the installed dsh version instead of freezing a peer copy — and, by
 * resolving against the profile's own directory, it shares ONE module instance
 * with the profile-level MCP rows (which is what lets mcp-client itself reject
 * a project server that collides with a profile server name).
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
const PACKAGE_NAME = 'dsh-plugin-project-mcp'

/** Build the host half: one ESM entry, everything but node builtins bundled. */
async function buildHost() {
  await build({
    entryPoints: [path.join(ROOT, 'src/index.ts')],
    outdir: OUT_DIR,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
    external: ['node:*'],
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
