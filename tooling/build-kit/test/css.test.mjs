/**
 * `cssModuleContents` 的单测：钉住 code-design D-3 的三条语义——
 * 同包多模块去重、同名类独立作用域、`url()` 与 at-rule 前奏不被改写。
 *
 * 全部是纯函数调用：不启动 esbuild、不碰文件系统。
 */

import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { cssModuleContents } from '../src/css.mjs'

/** 测试包名（写进 `data-dsh-plugin`）。 */
const PACKAGE = 'dsh-plugin-demo'
/** 测试类名前缀（对应生产里的 stt / wux / wsc）。 */
const PREFIX = 'demo'

/**
 * 计算与实现一致的模块哈希（相对路径 sha1 前 6 位）。
 * @param {string} relativePath 模块相对路径。
 * @returns {string} 6 位十六进制摘要。
 */
function hashOf(relativePath) {
  return createHash('sha1').update(relativePath).digest('hex').slice(0, 6)
}

/**
 * 以测试包 / 前缀编译一个 CSS module。
 * @param {string} source CSS 源码。
 * @param {string} relativePath 模块相对路径。
 * @returns {{ contents: string, classMap: Record<string, string> }} 编译结果。
 */
function contentsOf(source, relativePath) {
  return cssModuleContents({ source, relativePath, packageName: PACKAGE, classPrefix: PREFIX })
}

/**
 * 从生成的 JS 模块里取出 `cssText` 的字面量（解开 JSON 字符串转义）。
 * @param {string} contents 生成的 JS 模块源码。
 * @returns {string} 作用域化后的 CSS 文本。
 */
function cssTextOf(contents) {
  const match = /^const cssText = (.*);$/m.exec(contents)
  expect(match).not.toBeNull()
  return JSON.parse(match[1])
}

describe('cssModuleContents：包 + 模块双维度护栏', () => {
  it('同包两个 module 生成两个不同的 data-dsh-css，并各自注入', () => {
    const firstPath = 'src/client/first.module.css'
    const secondPath = 'src/client/second.module.css'
    const first = contentsOf('.card { color: red; }', firstPath)
    const second = contentsOf('.card { color: blue; }', secondPath)
    const firstHash = hashOf(firstPath)
    const secondHash = hashOf(secondPath)

    expect(firstHash).not.toBe(secondHash)
    // 查询与写入都带 data-dsh-css：只按包名查询会让同包第二个模块的样式永不注入。
    expect(first.contents).toContain(`style[data-dsh-plugin="${PACKAGE}"][data-dsh-css="${firstHash}"]`)
    expect(second.contents).toContain(`style[data-dsh-plugin="${PACKAGE}"][data-dsh-css="${secondHash}"]`)
    expect(first.contents).toContain(`style.setAttribute('data-dsh-css', ${JSON.stringify(firstHash)});`)
    expect(second.contents).toContain(`style.setAttribute('data-dsh-css', ${JSON.stringify(secondHash)});`)
    expect(first.contents).toContain(`style.setAttribute('data-dsh-plugin', ${JSON.stringify(PACKAGE)});`)
  })

  it('同名类在两个 module 各自独立作用域', () => {
    const first = contentsOf('.card { color: red; }', 'src/client/first.module.css')
    const second = contentsOf('.card { color: blue; }', 'src/client/second.module.css')

    expect(first.classMap.card).toBe(`demo_card_${hashOf('src/client/first.module.css')}`)
    expect(second.classMap.card).toBe(`demo_card_${hashOf('src/client/second.module.css')}`)
    expect(first.classMap.card).not.toBe(second.classMap.card)
    expect(cssTextOf(first.contents)).toContain(`.${first.classMap.card}`)
    expect(cssTextOf(second.contents)).toContain(`.${second.classMap.card}`)
  })

  it('url() 目标与 at-rule 前奏不被改写', () => {
    const source = [
      '.card {',
      '  background: url("./icon.svg") no-repeat;',
      '}',
      '@media (min-width: 640px) {',
      '  .card { color: red; }',
      '}',
      '',
    ].join('\n')
    const { contents, classMap } = contentsOf(source, 'src/client/card.module.css')
    const cssText = cssTextOf(contents)

    expect(classMap).toEqual({ card: `demo_card_${hashOf('src/client/card.module.css')}` })
    // 选择器前奏里的类名被重写；声明块内的 url() 与 at-rule 前奏原样保留。
    expect(cssText).toContain(`.${classMap.card} {`)
    expect(cssText).toContain('url("./icon.svg")')
    expect(cssText).toContain('@media (min-width: 640px)')
    expect(cssText).not.toContain('demo_svg')
  })

  it('类名前缀由调用方决定（stt / wux / wsc 三值保产物字节）', () => {
    const prefixed = (classPrefix) =>
      cssModuleContents({
        source: '.a { color: red; }',
        relativePath: 'src/a.module.css',
        packageName: 'dsh-plugin-demo',
        classPrefix,
      }).classMap.a
    const hash = hashOf('src/a.module.css')

    expect(prefixed('stt')).toBe(`stt_a_${hash}`)
    expect(prefixed('wux')).toBe(`wux_a_${hash}`)
    expect(prefixed('wsc')).toBe(`wsc_a_${hash}`)
  })

  it('默认导出本地名→作用域名映射，且注入代码只出现一次', () => {
    const { contents, classMap } = contentsOf('.a, .b { color: red; }', 'src/client/two.module.css')

    expect(classMap).toEqual({
      a: `demo_a_${hashOf('src/client/two.module.css')}`,
      b: `demo_b_${hashOf('src/client/two.module.css')}`,
    })
    expect(contents).toContain(`export default ${JSON.stringify(classMap)};`)
    expect(contents.match(/document\.head\.appendChild/g)).toHaveLength(1)
  })

  it('缺少必填参数时给出明确错误（不静默生成坏模块）', () => {
    expect(() => cssModuleContents({ source: '', relativePath: '', packageName: PACKAGE, classPrefix: PREFIX })).toThrow(
      /relativePath/,
    )
    expect(() => cssModuleContents({ source: '', relativePath: 'a.css', packageName: '', classPrefix: PREFIX })).toThrow(
      /packageName/,
    )
    expect(() =>
      cssModuleContents({ source: '', relativePath: 'a.css', packageName: PACKAGE, classPrefix: '' }),
    ).toThrow(/classPrefix/)
  })
})
