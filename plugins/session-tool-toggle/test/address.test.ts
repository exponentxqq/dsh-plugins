/**
 * 地址文法测试（规范：dsh-session-tool-toggle —— 开关对象粒度与地址文法）。
 *
 * 一个用例只断一条规则：规范形（`::*` 与 `skill` / `skill:*` 归一）、失败码（保护名单 /
 * 保留名 / 错前缀 / 通配语法 / serverName / 技能名）、未知 server 的宽容，以及
 * `matchesToolName` 打在 public name 上的全等与前缀语义。
 */
import { describe, expect, it } from 'vitest'
import {
  ADDRESS_GRAMMAR,
  PROTECTED_BASELINE,
  SKILL_PREFIX,
  SKILL_WILDCARD,
  addressesEqual,
  formatAddress,
  matchesToolName,
  parseAddress,
  type ParseErrorCode,
  type ParseResult,
  type SwitchAddress,
} from '../src/host/address.ts'

/** 生效保护名单的基线集合（生产由装配层算：基线 ∪ config 追加）。 */
const PROTECTED = new Set(PROTECTED_BASELINE)

/** 断言解析成功；失败时让用例停在解析处，并带上失败码与文案。 */
function okOf(result: ParseResult): Extract<ParseResult, { ok: true }> {
  if (!result.ok) throw new Error(`期望解析成功，实际是 ${result.code}：${result.message}`)
  return result
}

/** 断言解析失败；成功时让用例停在解析处，并带上规范形。 */
function rejectionOf(result: ParseResult): Extract<ParseResult, { ok: false }> {
  if (result.ok) throw new Error(`期望解析失败，实际解析为 ${result.text}`)
  return result
}

describe('parseAddress：文法与规范形', () => {
  /** 合法输入表：`[输入, 规范形文本, 期望地址]`。 */
  const valid: ReadonlyArray<readonly [string, string, SwitchAddress]> = [
    ['mcp:a', 'mcp:a', { kind: 'mcp-group', server: 'a' }],
    ['mcp:yunxiao', 'mcp:yunxiao', { kind: 'mcp-group', server: 'yunxiao' }],
    // 「关全部子工具」与「关整组」是同一个意图 → 状态里只留整组拼写。
    ['mcp:a::*', 'mcp:a', { kind: 'mcp-group', server: 'a' }],
    ['mcp:a::b', 'mcp:a::b', { kind: 'mcp-tool', server: 'a', pattern: 'b' }],
    ['mcp:a::b*', 'mcp:a::b*', { kind: 'mcp-tool', server: 'a', pattern: 'b*' }],
    [
      'mcp:a::get_issue',
      'mcp:a::get_issue',
      { kind: 'mcp-tool', server: 'a', pattern: 'get_issue' },
    ],
    [
      'mcp:my-server_2::list_pages',
      'mcp:my-server_2::list_pages',
      { kind: 'mcp-tool', server: 'my-server_2', pattern: 'list_pages' },
    ],
    // D6 的反例：照服务器文档抄的 raw 名能解析，但 public name 已被归一 → 匹配为 0。
    [
      'mcp:s::report.download',
      'mcp:s::report.download',
      { kind: 'mcp-tool', server: 's', pattern: 'report.download' },
    ],
    // `skill` 只在解析期归一，状态里只留 `tool:skill`（D3）。
    ['skill', 'tool:skill', { kind: 'tool', name: 'skill' }],
    // `skill:*` 只是整档别名，不引入通配语义（③.1）。
    ['skill:*', 'tool:skill', { kind: 'tool', name: 'skill' }],
    [
      'skill:openspec-propose',
      'skill:openspec-propose',
      { kind: 'skill', name: 'openspec-propose' },
    ],
    ['tool:workflow', 'tool:workflow', { kind: 'tool', name: 'workflow' }],
  ]

  it.each(valid)('「%s」解析为规范形「%s」', (input, text, address) => {
    expect(okOf(parseAddress(input, PROTECTED))).toEqual({ ok: true, address, text })
  })

  it('mcp:a::b* 归一为尾部通配，回显还是同一拼写', () => {
    const result = okOf(parseAddress('mcp:a::b*', PROTECTED))
    expect(result.address).toEqual({ kind: 'mcp-tool', server: 'a', pattern: 'b*' })
    expect(formatAddress(result.address)).toBe('mcp:a::b*')
    expect(result.text).toBe('mcp:a::b*')
  })

  it('mcp:a::* 归一到 mcp:a（状态里只留整组拼写）', () => {
    const result = okOf(parseAddress('mcp:a::*', PROTECTED))
    expect(result.address).toEqual({ kind: 'mcp-group', server: 'a' })
    expect(formatAddress(result.address)).toBe('mcp:a')
    expect(result.text).toBe('mcp:a')
  })

  it('skill 归一为 tool:skill', () => {
    expect(okOf(parseAddress('skill', PROTECTED))).toEqual({
      ok: true,
      address: { kind: 'tool', name: 'skill' },
      text: 'tool:skill',
    })
    // `skill:*` 只是整档别名：技能没有「按前缀批量关」的语义（③.1）。
    expect(okOf(parseAddress('skill:*', PROTECTED)).text).toBe('tool:skill')
    expect(okOf(parseAddress('skill:*', PROTECTED)).address).toEqual({
      kind: 'tool',
      name: 'skill',
    })
  })

  it('skill:<name> 解析为第四类地址，规范形保留 skill: 前缀', () => {
    expect(okOf(parseAddress('skill:openspec-propose', PROTECTED))).toEqual({
      ok: true,
      address: { kind: 'skill', name: 'openspec-propose' },
      text: 'skill:openspec-propose',
    })
    // 多段 kebab 是合法技能名（不限定段数）。
    expect(okOf(parseAddress('skill:openspec-propose-v2', PROTECTED)).address).toEqual({
      kind: 'skill',
      name: 'openspec-propose-v2',
    })
  })

  it('技能名不合 kebab 文法：六种典型输入全部 bad-skill-name，状态零写入', () => {
    for (const input of [
      'skill:',
      'skill:Foo',
      'skill:foo_bar',
      'skill:foo bar',
      'skill:foo-',
      'skill:-foo',
    ]) {
      expect(parseAddress(input, PROTECTED)).toMatchObject({ ok: false, code: 'bad-skill-name' })
    }
  })

  it('技能名拒绝连续连字符与内嵌 ::', () => {
    expect(rejectionOf(parseAddress('skill:foo--bar', PROTECTED)).code).toBe('bad-skill-name')
    expect(rejectionOf(parseAddress('skill:foo::bar', PROTECTED)).code).toBe('bad-skill-name')
  })

  it('bad-skill-name 文案带正则、完整文法与可抄的正例', () => {
    const result = rejectionOf(parseAddress('skill:Foo', PROTECTED))
    expect(result.code).toBe('bad-skill-name')
    expect(result.message).toContain('^[a-z0-9]+(?:-[a-z0-9]+)*$')
    expect(result.message).toContain('skill:openspec-propose')
    expect(result.message).toContain(ADDRESS_GRAMMAR)
  })

  it('SKILL_PREFIX / SKILL_WILDCARD 与文法表一致', () => {
    expect(SKILL_PREFIX).toBe('skill:')
    expect(SKILL_WILDCARD).toBe('*')
  })

  it('未知 serverName 宽容：解析照旧成功（服务器上线后自动生效）', () => {
    expect(okOf(parseAddress('mcp:not-loaded-server', PROTECTED)).address).toEqual({
      kind: 'mcp-group',
      server: 'not-loaded-server',
    })
    expect(okOf(parseAddress('mcp:not-loaded-server::get_*', PROTECTED)).address).toEqual({
      kind: 'mcp-tool',
      server: 'not-loaded-server',
      pattern: 'get_*',
    })
  })

  it('serverName 上限是 32 字符（第 33 个字符被拒）', () => {
    const server = 'x'.repeat(32)
    expect(okOf(parseAddress(`mcp:${server}`, PROTECTED)).address).toEqual({
      kind: 'mcp-group',
      server,
    })
    expect(rejectionOf(parseAddress(`mcp:${'x'.repeat(33)}`, PROTECTED)).code).toBe('bad-server')
  })

  it('解析不做 trim：地址内部的空白是非法输入', () => {
    expect(rejectionOf(parseAddress('mcp:a b', PROTECTED)).code).toBe('bad-server')
    expect(rejectionOf(parseAddress(' mcp:a', PROTECTED)).code).toBe('unknown-prefix')
  })

  /** 失败输入表：`[用例说明, 输入, 失败码]`。 */
  const invalid: ReadonlyArray<readonly [string, string, ParseErrorCode]> = [
    ['空输入', '', 'empty'],
    ['纯空白', '   ', 'empty'],
    ['缺少前缀', 'yunxiao', 'unknown-prefix'],
    ['未知前缀', 'workspace:foo', 'unknown-prefix'],
    ['serverName 为空', 'mcp:', 'bad-server'],
    ['serverName 含空格', 'mcp:a b', 'bad-server'],
    ['serverName 含点', 'mcp:a.b', 'bad-server'],
    ['工具段为空', 'mcp:a::', 'bad-tool-name'],
    ['通配用 ?', 'mcp:a::b?', 'bad-tool-name'],
    ['通配用字符类', 'mcp:a::b[0-9]', 'bad-tool-name'],
    ['通配在中间', 'mcp:a::b*c', 'bad-tool-name'],
    ['通配在开头', 'mcp:a::*b', 'bad-tool-name'],
    ['尾部双星号', 'mcp:a::b**', 'bad-tool-name'],
    ['工具名再带 ::', 'mcp:a::b::c', 'bad-tool-name'],
    ['tool: 后为空', 'tool:', 'bad-tool-name'],
    ['MCP public name 用 tool: 前缀', 'tool:mcp__x__y', 'mcp-tool-uses-tool-prefix'],
    ['残缺的 public name', 'tool:mcp__x', 'mcp-tool-uses-tool-prefix'],
    ['注册表保留名', 'tool:run_code', 'reserved-tool'],
    ['保护基线 bash', 'tool:bash', 'protected-tool'],
    ['保护基线 pwsh', 'tool:pwsh', 'protected-tool'],
  ]

  it.each(invalid)('拒绝：%s', (_label, input, code) => {
    expect(rejectionOf(parseAddress(input, PROTECTED)).code).toBe(code)
  })

  it('tool:mcp__x__y 拒绝并提示改用 mcp: 形式', () => {
    const result = rejectionOf(parseAddress('tool:mcp__x__y', PROTECTED))
    expect(result.code).toBe('mcp-tool-uses-tool-prefix')
    expect(result.message).toContain('mcp:x::y')
    expect(result.message).toContain(ADDRESS_GRAMMAR)
  })

  it('tool:bash 命中保护基线，文案列出保护名单', () => {
    const result = rejectionOf(parseAddress('tool:bash', PROTECTED))
    expect(result.code).toBe('protected-tool')
    expect(result.message).toContain('bash')
    expect(result.message).toContain('pwsh')
  })

  it('config 追加的保护名与基线同样拒绝（名单由调用方传入）', () => {
    const withExtra = new Set([...PROTECTED_BASELINE, 'workflow'])
    expect(rejectionOf(parseAddress('tool:workflow', withExtra)).code).toBe('protected-tool')
    expect(okOf(parseAddress('tool:workflow', PROTECTED)).address).toEqual({
      kind: 'tool',
      name: 'workflow',
    })
  })

  it('每条失败文案都带完整文法一行', () => {
    const inputs = [
      '',
      'yunxiao',
      'workspace:foo',
      'mcp:',
      'mcp:a b',
      'mcp:a::',
      'mcp:a::b?',
      'tool:',
      'tool:mcp__x__y',
      'tool:run_code',
      'tool:bash',
      'skill:',
      'skill:Foo',
    ]
    for (const input of inputs) {
      expect(rejectionOf(parseAddress(input, PROTECTED)).message).toContain(ADDRESS_GRAMMAR)
    }
  })
})

describe('PROTECTED_BASELINE', () => {
  it('是 7 项硬编码基线，含 pwsh', () => {
    expect(PROTECTED_BASELINE).toEqual(['bash', 'pwsh', 'read', 'write', 'edit', 'glob', 'grep'])
    expect(PROTECTED_BASELINE).toHaveLength(7)
  })
})

describe('formatAddress', () => {
  it('四类地址各回一种拼写', () => {
    expect(formatAddress({ kind: 'mcp-group', server: 'yunxiao' })).toBe('mcp:yunxiao')
    expect(formatAddress({ kind: 'mcp-tool', server: 'a', pattern: 'b*' })).toBe('mcp:a::b*')
    expect(formatAddress({ kind: 'tool', name: 'skill' })).toBe('tool:skill')
    expect(formatAddress({ kind: 'skill', name: 'openspec-propose' })).toBe(
      'skill:openspec-propose',
    )
  })

  it('parse → format → parse 是不动点（规范形稳定）', () => {
    const inputs = [
      'mcp:a',
      'mcp:a::*',
      'mcp:a::b',
      'mcp:a::b*',
      'skill',
      'skill:*',
      'skill:openspec-propose',
      'tool:workflow',
    ]
    for (const input of inputs) {
      const first = okOf(parseAddress(input, PROTECTED))
      expect(okOf(parseAddress(formatAddress(first.address), PROTECTED))).toEqual({
        ok: true,
        address: first.address,
        text: first.text,
      })
    }
  })
})

describe('addressesEqual', () => {
  it('同语义的独立对象相等', () => {
    expect(addressesEqual({ kind: 'mcp-group', server: 'a' }, { kind: 'mcp-group', server: 'a' }))
      .toBe(true)
    expect(
      addressesEqual(
        { kind: 'mcp-tool', server: 'a', pattern: 'b*' },
        { kind: 'mcp-tool', server: 'a', pattern: 'b*' },
      ),
    ).toBe(true)
    expect(addressesEqual({ kind: 'tool', name: 'skill' }, { kind: 'tool', name: 'skill' }))
      .toBe(true)
    expect(
      addressesEqual(
        { kind: 'skill', name: 'openspec-propose' },
        { kind: 'skill', name: 'openspec-propose' },
      ),
    ).toBe(true)
  })

  it('kind 不同即不等（整组与单工具是两个意图）', () => {
    expect(
      addressesEqual(
        { kind: 'mcp-group', server: 'a' },
        { kind: 'mcp-tool', server: 'a', pattern: 'b' },
      ),
    ).toBe(false)
    expect(addressesEqual({ kind: 'tool', name: 'a' }, { kind: 'mcp-group', server: 'a' }))
      .toBe(false)
    // 技能名与工具名可能同名，但两者不是同一个开关对象。
    expect(
      addressesEqual({ kind: 'skill', name: 'skill' }, { kind: 'tool', name: 'skill' }),
    ).toBe(false)
  })

  it('serverName 大小写敏感、pattern 原样比较', () => {
    expect(addressesEqual({ kind: 'mcp-group', server: 'A' }, { kind: 'mcp-group', server: 'a' }))
      .toBe(false)
    expect(
      addressesEqual(
        { kind: 'mcp-tool', server: 'a', pattern: 'b*' },
        { kind: 'mcp-tool', server: 'a', pattern: 'b' },
      ),
    ).toBe(false)
  })

  it('归一后同一意图相等：::* 与裸 mcp:a、skill / skill:* 与 tool:skill', () => {
    expect(
      addressesEqual(okOf(parseAddress('mcp:a::*', PROTECTED)).address, {
        kind: 'mcp-group',
        server: 'a',
      }),
    ).toBe(true)
    expect(
      addressesEqual(okOf(parseAddress('skill', PROTECTED)).address, {
        kind: 'tool',
        name: 'skill',
      }),
    ).toBe(true)
    expect(
      addressesEqual(okOf(parseAddress('skill:*', PROTECTED)).address, {
        kind: 'tool',
        name: 'skill',
      }),
    ).toBe(true)
  })
})

describe('matchesToolName', () => {
  const group: SwitchAddress = { kind: 'mcp-group', server: 'a' }

  it('整组命中该服务器的全部 public name，不命中别的服务器与内置工具', () => {
    expect(matchesToolName(group, 'mcp__a__x')).toBe(true)
    // 后缀里再出现 `__` 归工具名：serverName 只认第一段。
    expect(matchesToolName(group, 'mcp__a__x_y__z')).toBe(true)
    expect(matchesToolName(group, 'mcp__b__x')).toBe(false)
    expect(matchesToolName(group, 'bash')).toBe(false)
    expect(matchesToolName(group, 'mcp__a')).toBe(false)
    expect(matchesToolName(group, 'mcp__a__')).toBe(false)
  })

  it('单工具全等匹配打在 public name 的后缀上', () => {
    const exact: SwitchAddress = { kind: 'mcp-tool', server: 'a', pattern: 'x' }
    expect(matchesToolName(exact, 'mcp__a__x')).toBe(true)
    expect(matchesToolName(exact, 'mcp__a__x2')).toBe(false)
    expect(matchesToolName(exact, 'mcp__b__x')).toBe(false)
    // 裸名不是 public name：内置工具的注册名不会被 mcp: 地址命中。
    expect(matchesToolName(exact, 'x')).toBe(false)
  })

  it('尾部 * 是前缀匹配', () => {
    const wildcard: SwitchAddress = { kind: 'mcp-tool', server: 'a', pattern: 'get_*' }
    expect(matchesToolName(wildcard, 'mcp__a__get_issue')).toBe(true)
    expect(matchesToolName(wildcard, 'mcp__a__get_')).toBe(true)
    expect(matchesToolName(wildcard, 'mcp__a__list_issue')).toBe(false)
    expect(matchesToolName(wildcard, 'mcp__b__get_issue')).toBe(false)
  })

  it('不命中被归一改名的 raw 名（D6：只认 public name）', () => {
    const raw: SwitchAddress = { kind: 'mcp-tool', server: 's', pattern: 'report.download' }
    expect(matchesToolName(raw, 'mcp__s__report_download_ab12cd34ef56')).toBe(false)
  })

  it('工具地址只匹配注册名全等', () => {
    const tool: SwitchAddress = { kind: 'tool', name: 'workflow' }
    expect(matchesToolName(tool, 'workflow')).toBe(true)
    expect(matchesToolName(tool, 'workflow_2')).toBe(false)
    expect(matchesToolName(tool, 'mcp__a__workflow')).toBe(false)
  })

  it('skill 地址恒不命中任何注册名（技能名不是工具注册名，永不参与工具掩码）', () => {
    const skill: SwitchAddress = { kind: 'skill', name: 'openspec-propose' }
    expect(matchesToolName(skill, 'openspec-propose')).toBe(false)
    expect(matchesToolName(skill, 'skill')).toBe(false)
    expect(matchesToolName(skill, 'mcp__a__openspec-propose')).toBe(false)
    expect(matchesToolName(skill, '')).toBe(false)
  })

  it('未知 serverName 宽容：不抛错，只是不命中', () => {
    const unknown: SwitchAddress = { kind: 'mcp-tool', server: 'not-loaded', pattern: 'x' }
    expect(() => matchesToolName(unknown, 'mcp__a__x')).not.toThrow()
    expect(matchesToolName(unknown, 'mcp__a__x')).toBe(false)
    expect(matchesToolName({ kind: 'mcp-group', server: 'not-loaded' }, 'mcp__a__x')).toBe(false)
  })

  it('单工具的 * 前缀匹配任意后缀（解析期已把裸 * 归一为整组）', () => {
    expect(matchesToolName({ kind: 'mcp-tool', server: 'a', pattern: '*' }, 'mcp__a__x')).toBe(true)
  })
})
