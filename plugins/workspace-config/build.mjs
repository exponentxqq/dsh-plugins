/**
 * dsh-plugin-workspace-config 的自包含构建脚本（双端）。
 *
 * 本包是**双端**插件，但两端职责极不对称：
 *
 * - **宿主半**（`src/index.ts` → `lib/index.js`）：不承载任何职责的 no-op 载体，只提供
 *   bundle 行所需的锚点。patch 以「裸包名」插入，Web 侧 client-module scan 正是从那一行
 *   读 package.json 的 `dsh.client` 声明；没有这个包根行，浏览器半根本不会被装配进
 *   启动图。产物是一份自包含 ESM，external 仍只有 `node:*`。
 * - **浏览器半**（`src/client/index.ts` → `lib/client.js`）：footer 唯一入口 + 统一弹窗 +
 *   分节座位声明，编成单份 CJS bundle 并包进 `window.__ModuleLoader__.load({ id, factory })`
 *   壳；`react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives`
 *   外置（由浏览器外壳经 loader 的 `require` 提供），CSS modules 编译成运行时 `<style>`
 *   注入，因此不单独产样式表。
 *
 * 类型产物不在这里：`package.json` 的 `build` 先跑 `build:types`（`tsc` 把 d.ts 发到
 * `lib/types/` 下），再进本脚本。本包**必须**发射 d.ts——它是三个贡献方的座位契约
 * 类型权威（`exports["./client"].types` 指向 `lib/types/client/index.d.ts`），而 web-ux /
 * session-tool-toggle 的纯 esbuild 产物不产 d.ts。因此本脚本**绝不能**整目录清 `lib/`：
 * 那会把 `build:types` 刚写好的声明删掉（与 multi-root 的 `clean-lib.mjs` 同一理由），
 * 这里只覆盖自己产出的两个 JS 文件。
 *
 * 外部模块白名单刻意保持极短：`@deepseek-ai/dsh-client-ui-slots` **不能**出现在里面
 * （它没有 `./client` 导出、也不是 loader 模块表里的词），运行时 require 它会命中
 * 「missed the module table」硬错，导致整个客户端模块加载失败（D2）。
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const ROOT = import.meta.dirname
const OUT_DIR = path.join(ROOT, 'lib')
const CLIENT_ENTRY = path.join(ROOT, 'src', 'client', 'index.ts')
/** bundle 身份：浏览器 loader 按这个包名索引模块。 */
const PACKAGE_NAME = 'dsh-plugin-workspace-config'
/** 浏览器外壳交给 factory `require` 的运行时模块（loader 模块表的子集）。 */
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
 * 把 `*.module.css` 编译成「注入一次样式表 + 默认导出 本地名→作用域名 映射」的 JS 模块。
 *
 * 类名只在选择器位置重写，`url()` 目标与 at-rule 前奏不会被误改。防重护栏按「包 + 模块」
 * 两个维度查询：同一个包里的多个 css 模块各自注入自己的样式表，只按包名查询会让第一个
 * 模块注入后、同包其余模块的样式永远被跳过。
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
            value = `wsc_${name}_${hash}`
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
          'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-dsh-plugin="' + PACKAGE_NAME + '"][data-dsh-css="' + hash + '"]\') === null) {',
          '  const style = document.createElement(\'style\');',
          `  style.setAttribute('data-dsh-plugin', ${JSON.stringify(PACKAGE_NAME)});`,
          `  style.setAttribute('data-dsh-css', ${JSON.stringify(hash)});`,
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
 * 清掉上一次构建的 JS 面，只保留 `lib/types/`（`build:types` 的产物）。
 *
 * 与 multi-root 的 `clean-lib.mjs` 同理：类型声明先由 `tsc` 写入 `lib/types/`，
 * 整目录 `rm -rf lib` 会把它们一起删掉，因此这里只覆盖本脚本负责的两个 JS 产物。
 * @returns 清理完成的 Promise。
 */
async function resetJavaScriptFace() {
  await mkdir(OUT_DIR, { recursive: true })
  await rm(path.join(OUT_DIR, 'index.js'), { force: true })
  await rm(path.join(OUT_DIR, 'client.js'), { force: true })
}

/**
 * 构建宿主半：一份自包含 ESM 入口（no-op 锚点），node 内建模块外置。
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
    logLevel: 'warning',
  })
}

/**
 * 构建浏览器半：一份 CJS bundle，包进 ModuleLoader 壳。
 * @returns 构建完成的 Promise。
 */
async function buildClient() {
  const result = await build({
    entryPoints: [CLIENT_ENTRY],
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

if (!existsSync(CLIENT_ENTRY)) {
  throw new Error(
    `[${PACKAGE_NAME}] 缺失浏览器半入口 ${path.relative(ROOT, CLIENT_ENTRY)}：` +
      '本包是双端插件，宿主半与浏览器半必须同时构建（该入口由客户端装配任务创建）。',
  )
}

await resetJavaScriptFace()
await buildHostCarrier()
await buildClient()
console.log(
  `built ${PACKAGE_NAME}: lib/index.js (宿主 no-op 锚点 + client-scan 行), lib/client.js (浏览器半)`,
)
