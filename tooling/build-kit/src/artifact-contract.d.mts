/**
 * `@dsh-plugins/build-kit/artifact-contract` 的类型声明（openspec/changes/
 * residual-convergence, code-design ③.3 / D3）。
 *
 * 实现是纯 `.mjs`（不读盘、不 import vitest / `scripts/lib`），本文件是手写声明
 * （仿 `scripts/lib/artifacts.d.mts` 先例）：四份 `bundle.test.ts` 以子路径静态
 * import 消费，没有声明文件时 TS 会报 TS7016。
 *
 * 全部函数都是无状态纯函数：入参是词数组（由调用方用 `scripts/lib/artifacts.mjs`
 * 的词法器产出，R9 单源），出参是 issue 列表——空数组 = 通过，每条 issue 自带
 * 包名、产物名与期望/实际。
 *
 * @module @dsh-plugins/build-kit/artifact-contract
 */

/**
 * 断言浏览器半是 `window.__ModuleLoader__.load({ id, factory })` 形态。
 * @param input - 输入。
 * @returns issue 列表；空数组 = 通过。缺哪条标记就点名哪条。
 */
export function loaderShellIssues(input: { packageName: string; source: string }): string[]

/**
 * 断言浏览器半的 require 面与声明完全一致、且不泄漏 Node 内建、不自引用。
 * @param input - 输入。
 * @returns issue 列表；空数组 = 通过。
 */
export function requireSurfaceIssues(input: {
  packageName: string
  expected: readonly string[]
  required: readonly string[]
  imported: readonly string[]
}): string[]

/**
 * 断言宿主半产物自包含（`['node:*']` 外部词下无未覆盖词），并把 issue 补上包名与
 * `lib/index.js` 产物名。
 * @param input - 输入。
 * @returns issue 列表；空数组 = 通过。
 */
export function hostSelfContainmentIssues(input: {
  packageName: string
  words: readonly string[]
  externals?: readonly string[]
}): string[]

/**
 * 自包含判据的低层原语（原 `guards.mjs` 的抛出式守卫迁入）：相对块恒合法、`node:*` 需
 * 命中外部词、裸内建名仅当外部词含 `node:*`、通配与包名子路径匹配；失败文案保留
 * 原三段原文。
 * @param input - 输入。
 * @returns issue 列表；空数组 = 通过。
 */
export function selfContainmentIssues(input: {
  words: readonly string[]
  externals: readonly string[]
}): string[]
