/**
 * 产物契约断言：三份双端 `test/bundle.test.ts` 里逐字重复的结构层断言，收敛为
 * **无状态纯函数**——入参是词数组，出参是 issue 列表（空数组 = 通过）。
 *
 * 设计边界（openspec/changes/residual-convergence, code-design ③.3 / D3 / D4）：
 *
 * - 纯 `.mjs`、零依赖（只用 `node:module` 的 `isBuiltin`）：**不读盘**、不 import
 *   vitest、不 import `scripts/lib`。词数组由调用方用词法器
 *   （`scripts/lib/artifacts.mjs`，R9 单源）产出后传入，本模块不重复实现词法；
 * - 每条 issue 自带包名 + 产物名 + 期望/实际，测试失败时无需再拼上下文；
 * - `selfContainmentIssues` 是原 `guards.mjs` 自包含守卫（build-kit 死导出，D4）判据的
 *   无状态化：词法判定与失败文案逐字保留，只把「抛 Error」换成「返回 issue」。
 *
 * 消费形态（三份 `test/bundle.test.ts`，见本目录 README）：
 *
 * ```js
 * expect(loaderShellIssues({ packageName, source })).toEqual([])
 * expect(requireSurfaceIssues({ packageName, expected, required, imported })).toEqual([])
 * expect(hostSelfContainmentIssues({ packageName, words })).toEqual([])
 * ```
 *
 * @module @dsh-plugins/build-kit/artifact-contract
 */

import { isBuiltin } from 'node:module'

/** 浏览器半产物名（loader 壳与 require 面断言的对象）。 */
const CLIENT_ARTIFACT = 'lib/client.js'
/** 宿主半产物名（自包含断言的对象）。 */
const HOST_ARTIFACT = 'lib/index.js'

/**
 * 浏览器半 ModuleLoader 壳必须包含的标记；`id` 一条按包名生成。
 * @param {string} packageName 包名（loader 的 `id`）。
 * @returns {{ label: string, token: string }[]} 标记清单（按断言顺序）。
 */
function loaderShellMarkers(packageName) {
  return [
    { label: 'loader 入口', token: 'window.__ModuleLoader__.load({' },
    { label: '包身份 id', token: `id: ${JSON.stringify(packageName)}` },
    { label: 'factory 形态', token: 'factory: (require) => {' },
  ]
}

/**
 * 断言浏览器半是 `window.__ModuleLoader__.load({ id, factory })` 形态。
 *
 * 原有断言强度逐字保留：三条标记都必须以字面量出现（`id` 用
 * `JSON.stringify(packageName)` 生成，与旧用例的模板字符串一致）。
 * @param {object} input 输入。
 * @param {string} input.packageName 包名（同时是 loader 的 `id`）。
 * @param {string} input.source `lib/client.js` 的源码。
 * @returns {string[]} issue 列表；空数组 = 通过。缺哪条标记就点名哪条。
 */
export function loaderShellIssues({ packageName, source }) {
  return loaderShellMarkers(packageName)
    .filter(({ token }) => !source.includes(token))
    .map(
      ({ label, token }) =>
        `[${packageName}] ${CLIENT_ARTIFACT}: 缺少 ModuleLoader 壳标记（${label}）：\`${token}\`\n` +
        '期望：产物含该字面量标记；实际：未出现，产物不是 window.__ModuleLoader__.load({ id, factory }) 形态。',
    )
}

/**
 * 断言浏览器半的 require 面与声明完全一致、且不泄漏 Node 内建、不自引用。
 *
 * 原有三条断言的强度逐字保留：
 *
 * 1. `required`（`requiredWords(source)` 去重排序）与 `expected` 精确集合相等——
 *    多一个说明被意外打进/漏进 external，少一个说明组件没被真正打进产物；
 * 2. `imported` 中无 `node:*`（浏览器壳不提供 Node 内建）；
 * 3. `imported` 中无 `packageName` 子串（自引用命中「missed the module table」硬错）。
 *
 * 三类问题各产一条 issue（探测命令以「1 条集合不等 + 1 条自引用 = 2 条」为准）。
 * @param {object} input 输入。
 * @param {string} input.packageName 包名。
 * @param {string[]} input.expected 声明的浏览器 external 词（如 `CLIENT_REQUIRES`）。
 * @param {string[]} input.required 产物里的 `require("…")` 词（`requiredWords`）。
 * @param {string[]} input.imported 产物里的静态 import/require 词（`importedWords`）。
 * @returns {string[]} issue 列表；空数组 = 通过。
 */
export function requireSurfaceIssues({ packageName, expected, required, imported }) {
  const issues = []
  const expectedWords = uniqueSorted(expected)
  const requiredWords = uniqueSorted(required)

  const extra = requiredWords.filter((word) => !expectedWords.includes(word))
  const missing = expectedWords.filter((word) => !requiredWords.includes(word))
  if (extra.length > 0 || missing.length > 0) {
    issues.push(
      `[${packageName}] ${CLIENT_ARTIFACT}: require 面与声明的 external 集合不相等：` +
        `多余 ${formatWords(extra)}；缺失 ${formatWords(missing)}` +
        `（期望：${formatWords(expectedWords)}；实际：${formatWords(requiredWords)}）。`,
    )
  }

  const nodeLeaks = uniqueSorted(
    imported.filter((word) => typeof word === 'string' && word.startsWith('node:')),
  )
  if (nodeLeaks.length > 0) {
    issues.push(
      `[${packageName}] ${CLIENT_ARTIFACT}: 浏览器半出现 Node 内建依赖 ${formatWords(nodeLeaks)}` +
        '（期望：无 node: 词；实际：浏览器壳不提供 Node 内建，运行时 require 会失败）。',
    )
  }

  const selfReferences = uniqueSorted(
    imported.filter((word) => typeof word === 'string' && word.includes(packageName)),
  )
  if (selfReferences.length > 0) {
    issues.push(
      `[${packageName}] ${CLIENT_ARTIFACT}: 浏览器半自引用本包 ${formatWords(selfReferences)}` +
        '（期望：无自引用；实际：模块表里没有本包，运行时 require 会失败）。',
    )
  }

  return issues
}

/**
 * 断言宿主半产物自包含：模块词只能是 Node 内建、相对内部块或外部词。
 *
 * 等价于 `selfContainmentIssues({ words, externals })`，只是把结果补上包名与产物名
 * （`lib/index.js`）。默认 `externals = ['node:*']`：宿主半的裸内建名合法，任何
 * `@deepseek-ai/*` / 未内联的裸包名都会成为 issue。
 * @param {object} input 输入。
 * @param {string} input.packageName 包名。
 * @param {string[]} input.words 产物模块词（如 `scripts/lib/artifacts.mjs` 的 `importedWords`）。
 * @param {string[]} [input.externals] 允许的外部词，默认 `['node:*']`。
 * @returns {string[]} issue 列表；空数组 = 通过。未覆盖词去重列出。
 */
export function hostSelfContainmentIssues({ packageName, words, externals = ['node:*'] }) {
  return selfContainmentIssues({ words, externals }).map(
    (issue) => `[${packageName}] ${HOST_ARTIFACT}: ${issue}`,
  )
}

/**
 * 自包含判据的低层原语（原 `guards.mjs` 的抛出式守卫迁入，D4）。
 *
 * 词法判定逐条保留：
 *
 * - 相对块（`./x.js` / `../x.js`）恒合法；
 * - `node:*` 需命中 `externals`；
 * - 裸内建名（`buffer` / `process`）仅当 `externals` 含 `node:*` 合法
 *   （浏览器半引用内建名仍然是 bug）；
 * - 外部词支持通配（`*.png`）与包名子路径（`react` → `react/jsx-runtime`）；
 * - 词法器抓到的文案片段（含空白 / 非 ASCII）不参与判定。
 *
 * 失败文案是原守卫的三段原文，逐字保留。
 * @param {object} input 输入。
 * @param {string[]} input.words 产物模块词。
 * @param {string[]} input.externals 允许的外部词。
 * @returns {string[]} issue 列表；空数组 = 通过。全部未覆盖词去重后合成一条 issue。
 */
export function selfContainmentIssues({ words, externals }) {
  const allowed = Array.isArray(externals) ? externals : []
  const offenders = words.filter((word) => isModuleSpecifier(word) && !isAllowedWord(word, allowed))
  if (offenders.length === 0) return []
  return [
    `产物含未声明为外部的模块词：${[...new Set(offenders)].join(', ')}。\n` +
      '自包含铁律：产物只能引用 Node 内建（node:* / 裸内建名）、相对内部块，或调用方显式声明的外部模块；\n' +
      '其余依赖必须被 esbuild 内联进产物。',
  ]
}

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

/**
 * 去重并按字典序排序（与 `scripts/lib/artifacts.mjs` 的词法器输出同形，便于比较）。
 * @param {string[]} words 词数组。
 * @returns {string[]} 去重排序后的词。
 */
function uniqueSorted(words) {
  return [...new Set(words)].sort()
}

/**
 * 把词数组渲染成 issue 里的「期望/实际」片段。
 * @param {string[]} words 词数组。
 * @returns {string} 形如 `["react", "react/jsx-runtime"]`。
 */
function formatWords(words) {
  return `[${words.join(', ')}]`
}
