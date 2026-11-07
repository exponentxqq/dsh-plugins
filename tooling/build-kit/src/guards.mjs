/**
 * 产物守卫：把「构建期能发现的问题」挡在产物落盘之后、调用方收工之前。
 *
 * 两条守卫对应两类历史事故（code-design K6 / D-2）：
 *
 * - {@link assertNoDynamicRequire}：产物里出现 esbuild 的 `__require(` 动态 require
 *   壳却没有开 `cjsRequireShim` → profile 装载该行时抛 “Dynamic require of … is not
 *   supported”（F3），整行 import 失败；
 * - {@link assertNoInternalWord}：产物里出现 `@dsh-plugins/` → 内部包没被内联干净，
 *   而 `link:` 安装不会装被链接包的依赖，运行时解析不到。
 *
 * 词集合级的自包含判据不在 build 期（R6：build 期没有词法器）：已收口到
 * `./artifact-contract.mjs` 的 `selfContainmentIssues` /
 * `hostSelfContainmentIssues`，供包内 `bundle.test.ts` 用
 * `scripts/lib/artifacts.mjs` 的词法器产出词数组后调用（D3 / D4）。
 *
 * @module @dsh-plugins/build-kit/guards
 */

/** esbuild 在 ESM 输出里为 CJS 依赖生成的动态 require 壳。 */
const DYNAMIC_REQUIRE_TOKEN = '__require('

/** 内部包作用域：运行时出现即说明内部包没被内联干净（与 B3 同一判据）。 */
const INTERNAL_SCOPE = '@dsh-plugins/'

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
