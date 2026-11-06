/**
 * CSS modules 编译：把 `*.module.css` 变成「注入一次样式表 + 默认导出
 * 本地名→作用域名映射」的 JS 模块。
 *
 * 三条必须钉住的语义（code-design D-3）：
 *
 * - 类名只在选择器位置重写，`url()` 目标与 at-rule 前奏不会被误改；
 * - 防重护栏**固定按「包 + 模块」双维度**（`data-dsh-plugin` + `data-dsh-css`）：
 *   只按包名查询会让同包第二个模块的样式永不注入（v1.4.0 的 delete 样式即因此
 *   从未生效）；`session-tool-toggle` 当前只有 1 个 css module 所以 bug 不可见，
 *   kit 统一成双维度后历史修复由单测钉住；
 * - 类名前缀由调用方传入（`stt` / `wux` / `wsc`），保证迁移前后产物字节可比。
 *
 * @module @dsh-plugins/build-kit/css
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * 计算模块作用域标识：相对路径的 sha1 前 6 位。
 *
 * 与现有三份 `build.mjs` 的算法逐字一致（`sha1(path.relative(ROOT, args.path))`
 * 取前 6 位），因此迁移不会改变类名与 `data-dsh-css` 的取值。
 * @param {string} relativePath 模块相对包目录的路径（POSIX 或平台原生分隔符均可）。
 * @returns {string} 6 位十六进制摘要。
 */
function moduleHash(relativePath) {
  return createHash('sha1').update(relativePath).digest('hex').slice(0, 6)
}

/**
 * 编译一个 CSS module 的源码（**纯函数**：不碰文件系统、不启动 esbuild）。
 * @param {object} options 编译选项。
 * @param {string} options.source CSS 源码。
 * @param {string} options.relativePath 模块相对包目录的路径（参与哈希）。
 * @param {string} options.packageName 包名（写进 `data-dsh-plugin`，也是 loader 的 id）。
 * @param {string} options.classPrefix 作用域类名前缀（`stt` / `wux` / `wsc`）。
 * @returns {{ contents: string, classMap: Record<string, string> }} 生成的 JS 模块源码与类名映射。
 */
export function cssModuleContents({ source, relativePath, packageName, classPrefix }) {
  if (typeof source !== 'string') {
    throw new Error('[build-kit/css] source 必须是字符串')
  }
  if (typeof relativePath !== 'string' || relativePath === '') {
    throw new Error('[build-kit/css] relativePath 不能为空：它是作用域哈希的唯一输入')
  }
  if (typeof packageName !== 'string' || packageName === '') {
    throw new Error('[build-kit/css] packageName 不能为空：它写进 data-dsh-plugin')
  }
  if (typeof classPrefix !== 'string' || classPrefix === '') {
    throw new Error('[build-kit/css] classPrefix 不能为空：它决定作用域类名前缀')
  }

  const hash = moduleHash(relativePath)
  /** @type {Map<string, string>} */
  const scoped = new Map()
  /**
   * 把本地类名映射为作用域名（同名只映射一次）。
   * @param {string} name 本地类名。
   * @returns {string} 作用域名。
   */
  const rename = (name) => {
    let value = scoped.get(name)
    if (value === undefined) {
      value = `${classPrefix}_${name}_${hash}`
      scoped.set(name, value)
    }
    return value
  }
  // 只在「选择器前奏」里重写类名：`(^|\})` 限定到块边界之后、`{` 之前的文本，
  // 因此声明块内的 `url("./x.svg")` 与 at-rule 前奏（如 `@media (min-width: 640px)`）
  // 不会被误改。
  const css = source.replace(/(^|\})([^{}]*)\{/g, (_match, close, prelude) =>
    close + prelude.replace(/\.(-?[_a-zA-Z][\w-]*)/g, (_dot, name) => `.${rename(name)}`) + '{',
  )
  /** @type {Record<string, string>} */
  const classMap = {}
  for (const [local, value] of scoped) classMap[local] = value
  const contents = [
    `const cssText = ${JSON.stringify(css)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-dsh-plugin="' +
      packageName +
      '"][data-dsh-css="' +
      hash +
      '"]\') === null) {',
    '  const style = document.createElement(\'style\');',
    `  style.setAttribute('data-dsh-plugin', ${JSON.stringify(packageName)});`,
    `  style.setAttribute('data-dsh-css', ${JSON.stringify(hash)});`,
    '  style.textContent = cssText;',
    '  document.head.appendChild(style);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
    '',
  ].join('\n')
  return { contents, classMap }
}

/**
 * esbuild 插件：把 `*.module.css` 交给 {@link cssModuleContents} 编译。
 *
 * 插件名与现有三份 `build.mjs` 一致（`dsh-css-modules-inline`），不影响产物字节。
 * @param {object} options 插件选项。
 * @param {string} options.root 包目录的绝对路径（用于计算相对路径哈希）。
 * @param {string} options.packageName 包名（写进 `data-dsh-plugin`）。
 * @param {string} options.classPrefix 作用域类名前缀。
 * @returns {import('esbuild').Plugin} esbuild 插件。
 */
export function cssModulesPlugin({ root, packageName, classPrefix }) {
  return {
    name: 'dsh-css-modules-inline',
    setup(pluginBuild) {
      pluginBuild.onLoad({ filter: /\.module\.css$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const relativePath = path.relative(root, args.path)
        const { contents } = cssModuleContents({ source, relativePath, packageName, classPrefix })
        return { contents, loader: 'js' }
      })
    },
  }
}
