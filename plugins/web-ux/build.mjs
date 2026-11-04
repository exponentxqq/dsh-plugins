/**
 * dsh-plugin-web-ux 的自包含构建脚本（双端）。
 *
 * 本包自 archived-session-delete 变更起是**双端**插件（delete-or-archive 变更再把单一的
 * 「删除」扩为「删除或移动到归档目录」）：宿主半不再只是空壳载体，它承载 Connection RPC
 * 通道 `/web-ux` 的 `preview-delete` / `delete-session` 两个端点（纯宿主工作——工作区注册
 * 表清理，加会话日志与投影缓存的删除或迁移），浏览器半在 provider 徽章旁提供侧栏处置入
 * 口及其确认弹窗。
 *
 * 浏览器半：`src/client/index.ts` 编成单份 CJS bundle，包进
 * `window.__ModuleLoader__.load({ id, factory })` 壳；`react` / `react-dom` /
 * `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` 外置（由浏览器外壳经
 * loader 的 `require` 提供），CSS modules 编译成运行时 `<style>` 注入，因此不单独产样式
 * 表。
 *
 * 宿主半：`src/index.ts` 编成一份自包含 ESM 产物（`lib/index.js`），**external 仍只有
 * `node:*`**。`Config` 用的 Schemastery（`@deepseek-ai/schemastery`，`archiveRoot` 配置
 * 键的原生 schema）由构建**内联**进产物：`link:` 安装不会装被链接包的依赖，产物必须自
 * 包含才能加载；这也正是宿主运行时不解析任何 `@deepseek-ai/*` 的原因
 * （`test/bundle.test.ts` 的自包含断言守护这一点，见设计 A10）。宿主半既是处置端点的
 * RPC 载体，也是 bundle 行所需的锚点：注册行保持「裸包名」插入，Web 侧 client-module
 * scan 正是从那一行读 `dsh.client`。
 *
 * 不产 d.ts、不产 sourcemap：插件由 dsh 运行时消费，不供其他 TypeScript 引用。
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const ROOT = import.meta.dirname
const OUT_DIR = path.join(ROOT, 'lib')
/** Bundle identity: the loader keys the browser module by this package name. */
const PACKAGE_NAME = 'dsh-plugin-web-ux'
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
            value = `wux_${name}_${hash}`
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
          // 防重护栏按「包 + 模块」两个维度查询：一个包里的多个 css 模块各自注入
          // 自己的样式表。只按包名查询会让第一个模块注入后，同包其余模块的样式
          // 永远被跳过（v1.4.0 的 delete 样式即因此从未生效）。
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
 * Build the host half: one self-contained ESM entry holding the `/web-ux`
 * Connection RPC channel (session-delete) plus the bare-name anchor row, with
 * node builtins external.
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
await buildHostCarrier()
await buildClient()
console.log(`built ${PACKAGE_NAME}: lib/index.js (host RPC carrier + client-scan anchor), lib/client.js`)
