/**
 * 产物守卫：把「构建期能发现的问题」挡在产物落盘之后、调用方收工之前。
 *
 * 三条守卫对应三类历史事故（code-design K6 / D-2）：
 *
 * - {@link assertNoDynamicRequire}：产物里出现 esbuild 的 `__require(` 动态 require
 *   壳却没有开 `cjsRequireShim` → profile 装载该行时抛 “Dynamic require of … is not
 *   supported”（F3），整行 import 失败；
 * - {@link assertNoInternalWord}：产物里出现 `@dsh-plugins/` → 内部包没被内联干净，
 *   而 `link:` 安装不会装被链接包的依赖，运行时解析不到；
 * - {@link assertSelfContained}：产物引用了未声明为外部的模块词 → 自包含铁律被破。
 *
 * @module @dsh-plugins/build-kit/guards
 */

import { isBuiltin } from 'node:module'

/** esbuild 在 ESM 输出里为 CJS 依赖生成的动态 require 壳。 */
const DYNAMIC_REQUIRE_TOKEN = '__require('

/** 内部包作用域：运行时出现即说明内部包没被内联干净（与 B3 同一判据）。 */
const INTERNAL_SCOPE = '@dsh-plugins/'

/**
 * 合法的模块说明符形状。
 *
 * 产物词法器（`scripts/lib/artifacts.mjs` 的 `moduleWords`）按 `from "…"` /
 * `require("…")` 抓词，产物里的文案片段也会被当成词（web-ux 的 locale 文案
 * “Session manager → Migrated” 是已知误报）。守卫只判定形如模块说明符的词，
 * 含空白或非 ASCII 的片段直接跳过。
 */
const MODULE_SPECIFIER = /^(?:node:)?(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(?:\/[a-z0-9._~@-]+)*$/i

/**
 * 断言产物没有「有 `__require` 却没开 shim」的组合。
 * @param {string} code 产物源码。
 * @param {boolean} shimEnabled 调用方是否开启了 `cjsRequireShim`。
 * @returns {void} 通过时静默返回。
 * @throws {Error} 产物含 `__require(` 且未开 shim。
 */
export function assertNoDynamicRequire(code, shimEnabled) {
  if (shimEnabled) return
  if (!code.includes(DYNAMIC_REQUIRE_TOKEN)) return
  throw new Error(
    '产物里出现了 esbuild 的 `__require(` 动态 require 壳，但构建没有开启 cjsRequireShim。\n' +
      '这会在 dsh 装载该行时抛 “Dynamic require of … is not supported”（F3），整行 import 失败。\n' +
      '修法：把 `cjsRequireShim: true` 传给 buildPlugin——banner 会注入绑定到 bundle 自身 URL 的真实 require。',
  )
}

/**
 * 断言产物不含内部包作用域词。
 * @param {string} code 产物源码。
 * @returns {void} 通过时静默返回。
 * @throws {Error} 产物含 `@dsh-plugins/`。
 */
export function assertNoInternalWord(code) {
  if (!code.includes(INTERNAL_SCOPE)) return
  throw new Error(
    '产物里出现了内部包作用域词 `@dsh-plugins/`：内部包只在构建期存在，必须被内联进产物。\n' +
      '否则 profile 装载时解析不到该包（`link:` 安装不会装被链接包的依赖），该行 import 失败。',
  )
}

/**
 * 断言产物的模块词都被「自包含」规则覆盖：Node 内建、相对内部块，或调用方
 * 显式声明的外部词。
 *
 * 与仓级 `check-artifacts.mjs` 的 B2/B5 同一判据：`node:*` 与裸内建名合法
 * （后者只在 external 含 `node:*` 的宿主半合法）；包名外部词同时覆盖其子路径
 * （`react` → `react/jsx-runtime`）；外部词里的 `*` 按通配处理。
 * @param {string[]} words 产物模块词（如 `scripts/lib/artifacts.mjs` 的 `moduleWords`）。
 * @param {string[]} externals 允许的外部词（宿主半为 `['node:*', ...hostExternals]`，
 *   浏览器半为 `clientExternals`）。
 * @returns {void} 通过时静默返回。
 * @throws {Error} 存在未被覆盖的模块词。
 */
export function assertSelfContained(words, externals) {
  const allowed = Array.isArray(externals) ? externals : []
  const offenders = words.filter((word) => isModuleSpecifier(word) && !isAllowedWord(word, allowed))
  if (offenders.length === 0) return
  throw new Error(
    `产物含未声明为外部的模块词：${[...new Set(offenders)].join(', ')}。\n` +
      '自包含铁律：产物只能引用 Node 内建（node:* / 裸内建名）、相对内部块，或调用方显式声明的外部模块；\n' +
      '其余依赖必须被 esbuild 内联进产物。',
  )
}

/**
 * 判断一个词是否形如模块说明符（过滤词法器抓到的文案片段）。
 * @param {unknown} word 模块词。
 * @returns {boolean} 是否形如模块说明符。
 */
function isModuleSpecifier(word) {
  if (typeof word !== 'string' || word === '') return false
  if (word.startsWith('./') || word.startsWith('../')) return !/\s/.test(word)
  return MODULE_SPECIFIER.test(word)
}

/**
 * 判断一个模块词是否被外部词清单覆盖。
 * @param {string} word 模块词。
 * @param {string[]} externals 外部词清单。
 * @returns {boolean} 是否允许。
 */
function isAllowedWord(word, externals) {
  if (word.startsWith('./') || word.startsWith('../')) return true
  if (word.startsWith('node:')) return matchesExternal(word, externals)
  // 裸内建名（buffer / process）由 Node 解析；只在宿主半（external 含 node:*）合法，
  // 浏览器半引用内建名仍然是 bug。
  if (isBuiltin(word)) return externals.includes('node:*') || matchesExternal(word, externals)
  return matchesExternal(word, externals)
}

/**
 * 判断模块词是否命中外部词清单（精确 / 通配 / 包名子路径）。
 * @param {string} word 模块词。
 * @param {string[]} externals 外部词清单。
 * @returns {boolean} 是否命中。
 */
function matchesExternal(word, externals) {
  return externals.some((entry) => {
    if (typeof entry !== 'string' || entry === '') return false
    if (entry === word) return true
    if (entry.includes('*')) return wildcardToRegExp(entry).test(word)
    return !entry.startsWith('.') && !entry.startsWith('/') && word.startsWith(`${entry}/`)
  })
}

/**
 * 把带 `*` 的外部词转成正则。
 * @param {string} pattern 外部词（如 `*.png`）。
 * @returns {RegExp} 匹配该通配的正则。
 */
function wildcardToRegExp(pattern) {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}$`)
}
