/**
 * 浏览器半骨架：把 `<root>/src/client/index.ts` 编成一份 CJS bundle，再包进
 * `window.__ModuleLoader__.load({ id, factory })` 壳，写到 `lib/client.js`。
 *
 * 壳的缩进/换行逐字沿用 `plugins/web-ux/build.mjs:136-147`，保证迁移前后产物
 * 字节可比；外置词默认取三个双端包现有 `CLIENT_EXTERNALS` 的并集（loader 模块表
 * 的子集，由浏览器外壳通过 factory 的 `require` 提供）。
 *
 * @module @dsh-plugins/build-kit/client
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { build } from 'esbuild'

import { cssModulesPlugin } from './css.mjs'

/**
 * 浏览器外壳交给 factory `require` 的默认运行时模块（loader 模块表的子集）。
 *
 * 三个双端包（session-tool-toggle / web-ux / workspace-config）的清单逐字相同；
 * `react-dom/client`、`react/jsx-dev-runtime` 当前未必被用到，保留是为了让
 * 「允许的外部词」与 loader 模块表保持同一形状，而不是等某个包用到时才补。
 * @type {string[]}
 */
export const DEFAULT_CLIENT_EXTERNALS = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/**
 * 给一段文本的每一行加缩进（把 CJS bundle 嵌进 factory 用）。
 *
 * 空行不加尾随空白——与现有三份 `build.mjs` 的 `indent` 逐字一致，否则产物
 * 会多出行尾空白、字节不再可比。
 * @param {string} text 原始文本。
 * @param {number} levels 制表符层级。
 * @returns {string} 缩进后的文本。
 */
export function indentBlock(text, levels) {
  const pad = '\t'.repeat(levels)
  return text
    .split('\n')
    .map((line) => (line === '' ? line : pad + line))
    .join('\n')
}

/**
 * 把 CJS bundle 包进 ModuleLoader 壳（缩进/换行逐字沿用
 * `plugins/web-ux/build.mjs:136-147`）。
 * @param {object} options 壳化选项。
 * @param {string} options.packageName 包名（同时是 loader 的模块 `id`）。
 * @param {string} options.code esbuild 产出的 CJS 代码。
 * @returns {string} 壳化后的模块文本（以换行结尾）。
 */
export function moduleLoaderShell({ packageName, code }) {
  return [
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(packageName)},`,
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    indentBlock(code, 2),
    '\t\treturn module.exports;',
    '\t}',
    '});',
    '',
  ].join('\n')
}

/**
 * 构建浏览器半并写入 `<outDir>/client.js`。
 * @param {object} options 构建选项。
 * @param {string} options.root 包目录的绝对路径（CSS module 哈希的相对基准）。
 * @param {string} options.entry 浏览器入口的绝对路径。
 * @param {string} options.outDir 产物目录的绝对路径（通常为 `<root>/lib`）。
 * @param {string} options.packageName 包名（loader 的模块 `id`）。
 * @param {string[]} [options.clientExternals] 覆盖默认外部词清单。
 * @param {string} options.cssClassPrefix 作用域类名前缀（双端必填）。
 * @returns {Promise<void>} 构建完成的 Promise。
 */
export async function buildClientHalf({
  root,
  entry,
  outDir,
  packageName,
  clientExternals = DEFAULT_CLIENT_EXTERNALS,
  cssClassPrefix,
}) {
  const result = await build({
    // 与宿主半同理：把 `absWorkingDir` 钉到包目录，产物里的 `// path` 注释不受
    // 调用方 cwd 影响（esbuild 默认值取的是 import 时的 process.cwd()）。
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    external: clientExternals,
    plugins: [cssModulesPlugin({ root, packageName, classPrefix: cssClassPrefix })],
    logLevel: 'warning',
  })
  const code = result.outputFiles[0].text
  await writeFile(path.join(outDir, 'client.js'), moduleLoaderShell({ packageName, code }))
}
