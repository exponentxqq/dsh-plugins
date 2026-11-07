/**
 * 产物守卫的单测：`assertNoDynamicRequire` 的四格（shim 开/关 × `__require`
 * 出现/缺席）与 `assertNoInternalWord` 的失败/放行用例。
 *
 * 词集合级的自包含判据已迁往 `./artifact-contract.mjs`（D3/D4），正面与负面用例在
 * `artifact-contract.test.mjs`。
 */

import { describe, expect, it } from 'vitest'

import { assertNoDynamicRequire, assertNoInternalWord } from '../src/guards.mjs'

describe('assertNoDynamicRequire：shim × __require 四格', () => {
  /** 含 esbuild 动态 require 壳的产物片段。 */
  const withShimCall = 'var mod = __require("node:fs");'
  /** 不含动态 require 壳的产物片段。 */
  const withoutShimCall = 'var mod = 1;'

  it('shim 开 + __require 出现 → 放行', () => {
    expect(() => assertNoDynamicRequire(withShimCall, true)).not.toThrow()
  })

  it('shim 开 + __require 缺席 → 放行', () => {
    expect(() => assertNoDynamicRequire(withoutShimCall, true)).not.toThrow()
  })

  it('shim 关 + __require 出现 → 抛 F3 解释', () => {
    expect(() => assertNoDynamicRequire(withShimCall, false)).toThrow(/__require/)
    expect(() => assertNoDynamicRequire(withShimCall, false)).toThrow(/Dynamic require/)
    expect(() => assertNoDynamicRequire(withShimCall, false)).toThrow(/cjsRequireShim/)
  })

  it('shim 关 + __require 缺席 → 放行', () => {
    expect(() => assertNoDynamicRequire(withoutShimCall, false)).not.toThrow()
  })
})

describe('assertNoInternalWord：内部包词', () => {
  it('产物含 @dsh-plugins/ → 抛错', () => {
    expect(() => assertNoInternalWord('import { buildPlugin } from "@dsh-plugins/build-kit"')).toThrow(
      /@dsh-plugins\//,
    )
  })

  it('干净产物 → 放行', () => {
    expect(() => assertNoInternalWord('export const x = 1')).not.toThrow()
  })
})
