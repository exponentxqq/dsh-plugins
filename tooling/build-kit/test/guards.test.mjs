/**
 * 产物守卫的单测：`assertNoDynamicRequire` 的四格（shim 开/关 × `__require`
 * 出现/缺席）、`assertNoInternalWord` 的内部包词失败用例，以及
 * `assertSelfContained` 的自包含判据。
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_CLIENT_EXTERNALS } from '../src/client.mjs'
import { assertNoDynamicRequire, assertNoInternalWord, assertSelfContained } from '../src/guards.mjs'

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

describe('assertSelfContained：自包含判据', () => {
  it('宿主半：node:* 与裸内建名合法', () => {
    expect(() => assertSelfContained(['node:fs', 'node:path', 'buffer', 'process'], ['node:*'])).not.toThrow()
  })

  it('浏览器半：默认外部清单与相对内部块合法', () => {
    expect(() =>
      assertSelfContained(
        ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives', './chunk-abc.js'],
        DEFAULT_CLIENT_EXTERNALS,
      ),
    ).not.toThrow()
  })

  it('未声明为外部的包 → 抛错并列出词', () => {
    expect(() => assertSelfContained(['@dsh-plugins/build-kit'], ['node:*'])).toThrow(/@dsh-plugins\/build-kit/)
  })

  it('浏览器半不得引用 Node 内建（外部词里没有 node:*）', () => {
    expect(() => assertSelfContained(['fs'], [])).toThrow(/fs/)
  })

  it('词法器抓到的文案片段不参与判定', () => {
    expect(() => assertSelfContained(['Session manager → Migrated'], ['node:*'])).not.toThrow()
  })

  it('外部词支持通配', () => {
    expect(() => assertSelfContained(['icon.png'], ['*.png'])).not.toThrow()
    expect(() => assertSelfContained(['icon.png'], [])).toThrow(/icon\.png/)
  })
})
