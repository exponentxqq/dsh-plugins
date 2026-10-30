/**
 * dsh-plugin-session-tool-toggle 的自包含构建脚本（双端）。
 *
 * 本包是**双端**插件：
 *
 * - **宿主半**：`src/index.ts` → `lib/index.js`，一份自包含 ESM 产物，只把
 *   `node:*` 留在外部。它是 `/tools` 命令面与 Connection RPC 通道
 *   `/session-tool-toggle` 的宿主载体，同时还是 bundle 行所需的锚点——注册行保持
 *   「裸包名」插入，Web 侧 client-module scan 正是从那一行读 package.json 的
 *   `dsh.client` 声明。
 * - **浏览器半**：`src/client/index.ts` → `lib/client.js`，一份 CJS bundle，包进
 *   `window.__ModuleLoader__.load({ id, factory })` 壳；`react` / `react-dom` /
 *   `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` 外置（由浏览器外壳
 *   通过 loader 的 `require` 提供），CSS modules 编译成运行时 `<style>` 注入，因此
 *   不需要单独构建样式表。
 *
 * 宿主产物里的 `banner` 注入真实 `require`：被一起打进来的纯 CJS 依赖（`zod` 等）
 * 会在模块求值期调用 `require('process')` 之类的核心模块，esbuild 的 `__require`
 * 壳会直接抛 “Dynamic require of ... is not supported”。绑定到 bundle 自身 URL 的
 * `require` 让这些调用可解析，同时产物仍然自包含（不在运行时解析本包 node_modules）。
 *
 * 不产 d.ts、不产 sourcemap：插件由 dsh 运行时消费，不供其他 TypeScript 引用。
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const ROOT = import.meta.dirname
const OUT_DIR = path.join(ROOT, 'lib')
/** bundle 身份：浏览器 loader 按这个包名索引模块。 */
const PACKAGE_NAME = 'dsh-plugin-session-tool-toggle'
/** 浏览器外壳交给 factory `require` 的运行时模块。 */
const CLIENT_EXTERNALS = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/**
 * 给一段文本的每一行加缩进（把 CJS bundle 嵌进 factory 用）。
 * @param text - 原始文本。
 * @param levels - 制表符层级。
 * @returns 缩进后的文本。
 */
function indent(text, levels) {
  const pad = '\t'.repeat(levels)
  return text
    .split('\n')
    .map((line) => (line === '' ? line : pad + line))
    .join('\n')
}

/**
 * 把 `*.module.css` 编译成「注入一次样式表 + 默认导出 本地名→作用域名 映射」的 JS
 * 模块。类名只在选择器位置重写，`url()` 目标与 at-rule 前奏不会被误改。
 * @returns esbuild 插件。
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
            value = `stt_${name}_${hash}`
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

/**
 * 构建宿主半：一份自包含 ESM 入口，node 内建模块外置。
 * @returns 构建完成的 Promise。
 */
async function buildHostCarrier() {
  await build({
    entryPoints: [path.join(ROOT, 'src/index.ts')],
    outdir: OUT_DIR,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
    external: ['node:*'],
    banner: {
      js: "import { createRequire as __dshCreateRequire } from 'node:module';\nconst require = __dshCreateRequire(import.meta.url);",
    },
    logLevel: 'warning',
  })
}

/**
 * 构建浏览器半：一份 CJS bundle，包进 ModuleLoader 壳。
 * @returns 构建完成的 Promise。
 */
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
await buildHostCarrier()
await buildClient()
console.log(`built ${PACKAGE_NAME}: lib/index.js (宿主半 + client-scan 锚点), lib/client.js (浏览器半)`)
