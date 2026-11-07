import { describe, expect, it } from 'vitest'
import { localeParityIssues } from '../src/locale-parity.ts'

/**
 * `localeParityIssues` 的最小自测：验证四类问题清单（keys / placeholders /
 * empty / required）与「整份一致 → 空数组」的契约。断言直接对着返回的
 * issue 字符串，不引入任何运行器之外的依赖。
 */

/** 一份完整的双语字典：多键 + 双占位符 + 必读键 + 命名空间。 */
const FULL = {
  ns: 'demo',
  zh: {
    title: '标题',
    greeting: '你好，{name}！',
    stats: '共 {count} 个条目，路径 {path}',
  },
  en: {
    title: 'Title',
    greeting: 'Hello, {name}!',
    stats: '{count} items at {path}',
  },
  required: ['title', 'greeting'],
  expectedNs: 'demo',
} as const

describe('localeParityIssues', () => {
  it('双语对称的完整字典返回空清单（含 required 与 expectedNs 核对）', () => {
    expect(localeParityIssues(FULL)).toEqual([])
  })

  it('en 缺键只报一条 [keys]，不误报占位符（缺失键跳过占位符比较）', () => {
    // 运行时漂移模拟：显式放宽为宽字典，穿过编译期 satisfies 的第一层防线。
    const zh: Record<string, string> = { a: '甲 {x}', b: '乙' }
    const en: Record<string, string> = { b: 'B' }
    expect(localeParityIssues({ ns: 'demo', zh, en })).toEqual(['[keys] en 缺少键 "a"'])
  })

  it('en 多余键报一条 [keys]（zh 缺少键）', () => {
    const zh: Record<string, string> = { a: '甲' }
    const en: Record<string, string> = { a: 'A', extra: 'Extra' }
    expect(localeParityIssues({ ns: 'demo', zh, en })).toEqual(['[keys] zh 缺少键 "extra"'])
  })

  it('深结构多键字典：占位符漂移按键检出，顺序无关', () => {
    // stats 的 en 漏了 {path}，其余键一致——只报这一键的 [placeholders]。
    const issues = localeParityIssues({
      ...FULL,
      en: { ...FULL.en, stats: '{count} items' },
    })
    expect(issues).toEqual([
      '[placeholders] en.stats 的占位符 {count} 与 zh 不一致（{count}, {path}）',
    ])
  })

  it('空文案与缺失必读键分别落到 [empty] 与 [required]', () => {
    const issues = localeParityIssues({
      ns: 'demo',
      zh: { title: '', body: '正文' },
      en: { title: 'Title', body: '   ' },
      required: ['missing'],
    })
    expect(issues).toContain('[empty] zh.title 必须是非空字符串')
    expect(issues).toContain('[empty] en.body 必须是非空字符串')
    expect(issues).toContain('[required] zh 缺少必读键 "missing"')
    expect(issues).toContain('[required] en 缺少必读键 "missing"')
  })
})
