/**
 * Self-contained build for dsh-plugin-git-graph-multi.
 *
 * Two faces, one script:
 *
 * - **host** — `src/index.ts` and `src/invariant.ts` become ESM entries in
 *   `lib/`. Node builtins stay external; every package dependency is BUNDLED
 *   (`@deepseek-ai/schemastery` is the only one) because a `link:` install
 *   does not install the linked package's dependencies — the artifact must be
 *   self-contained to load.
 * - **client** — `src/client/index.ts` becomes a single CJS bundle wrapped in
 *   the `window.__ModuleLoader__.load({ id, factory })` shell contract, with
 *   `react` / `react-dom` / `react/jsx-runtime` /
 *   `@deepseek-ai/dsh-client-ui-primitives` externalized (the browser shell
 *   provides them through the loader's `require`), and CSS modules compiled
 *   into a runtime `<style>` injection so no separate stylesheet is served.
 *
 * No d.ts and no sourcemaps: the design (D9) drops both to keep the artifact
 * small; the plugin is consumed by the dsh runtime, not by other TypeScript.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const ROOT = import.meta.dirname
const OUT_DIR = path.join(ROOT, 'lib')
/** Bundle identity: the loader keys the browser module by this package name. */
const PACKAGE_NAME = 'dsh-plugin-git-graph-multi'
/** Runtime modules the browser shell hands to the factory's `require`. */
const CLIENT_EXTERNALS = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/** Indent every line of a block (used to nest the CJS bundle in the factory). */
function indent(text, levels) {
  const pad = '\t'.repeat(levels)
  return text
    .split('\n')
    .map((line) => (line === '' ? line : pad + line))
    .join('\n')
}

/**
 * esbuild plugin compiling `*.module.css` into a JS module that injects the
 * (class-name-scoped) stylesheet once and default-exports the local→scoped
 * class map. Class names are rewritten only in selector position, so `url()`
 * targets and at-rule preludes are never touched.
 */
function cssModulesPlugin() {
  return {
    name: 'dsh-css-modules-inline',
    setup(pluginBuild) {
      pluginBuild.onLoad({ filter: /\.module\.css$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const hash = createHash('sha1').update(path.relative(ROOT, args.path)).digest('hex').slice(0, 6)
        const scoped = new Map()
        const rename = (name) => {
          let value = scoped.get(name)
          if (value === undefined) {
            value = `ggm_${name}_${hash}`
            scoped.set(name, value)
          }
          return value
        }
        const css = source.replace(/(^|\})([^{}]*)\{/g, (_match, close, prelude) =>
          close + prelude.replace(/\.(-?[_a-zA-Z][\w-]*)/g, (_dot, name) => `.${rename(name)}`) + '{')
        const classMap = {}
        for (const [local, value] of scoped) classMap[local] = value
        const contents = [
          `const cssText = ${JSON.stringify(css)};`,
          'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-dsh-plugin="' + PACKAGE_NAME + '"]\') === null) {',
          '  const style = document.createElement(\'style\');',
          `  style.setAttribute('data-dsh-plugin', ${JSON.stringify(PACKAGE_NAME)});`,
          '  style.textContent = cssText;',
          '  document.head.appendChild(style);',
          '}',
          `export default ${JSON.stringify(classMap)};`,
          '',
        ].join('\n')
        return { contents, loader: 'js' }
      })
    },
  }
}

/** Build the host half: two ESM entries, everything but node builtins bundled. */
async function buildHost() {
  await build({
    entryPoints: [path.join(ROOT, 'src/index.ts'), path.join(ROOT, 'src/invariant.ts')],
    outdir: OUT_DIR,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
    external: ['node:*'],
    logLevel: 'warning',
  })
}

/** Build the browser half: one CJS bundle inside the ModuleLoader shell. */
async function buildClient() {
  const result = await build({
    entryPoints: [path.join(ROOT, 'src/client/index.ts')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    external: CLIENT_EXTERNALS,
    plugins: [cssModulesPlugin()],
    logLevel: 'warning',
  })
  const code = result.outputFiles[0].text
  const wrapped = [
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(PACKAGE_NAME)},`,
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    indent(code, 2),
    '\t\treturn module.exports;',
    '\t}',
    '});',
    '',
  ].join('\n')
  await writeFile(path.join(OUT_DIR, 'client.js'), wrapped)
}

await rm(OUT_DIR, { recursive: true, force: true })
await mkdir(OUT_DIR, { recursive: true })
await buildHost()
await buildClient()
console.log(`built ${PACKAGE_NAME}: lib/index.js, lib/invariant.js, lib/client.js`)
