/**
 * 状态模型测试（规范：dsh-session-tool-toggle —— 会话级开关状态、自校验与日志折叠）。
 *
 * 一个用例只钉一条规则：切换的幂等与同引用、规范形与排序、两档自校验降级（字段级 → 空态、
 * 条目级 → 逐条丢弃）、存储层双保险的保护名单，以及日志重放「取最后一条整值记录」。
 */
import { describe, expect, it } from 'vitest'
import { PROTECTED_BASELINE, type SwitchAddress } from '../src/host/address.ts'
import {
  EMPTY_STATE,
  STATE_RECORD_TYPE,
  foldStatus,
  normalizeState,
  parseDisabledTexts,
  withToggled,
} from '../src/host/state.ts'
import type { SessionEventLike, SessionToolState, SpecLog } from '../src/host/types.ts'

/** 生效保护名单的基线集合（生产由装配层算：基线 ∪ config 追加）。 */
const PROTECTED = new Set(PROTECTED_BASELINE)

/** 只关心返回值、不关心告警的用例用它。 */
const QUIET_LOG: SpecLog = { info: () => {}, warn: () => {}, error: () => {} }

/** 收集 warn 的假日志（与 project-mcp 各套件同形）。 */
function recordingLog(): { log: SpecLog; warnings: string[] } {
  const warnings: string[] = []
  return {
    log: { info: () => {}, warn: (message) => warnings.push(message), error: () => {} },
    warnings,
  }
}

/** 常用地址：整组 / 单工具 / 内置工具 / 技能。 */
const MCP_A: SwitchAddress = { kind: 'mcp-group', server: 'a' }
const MCP_B: SwitchAddress = { kind: 'mcp-group', server: 'b' }
const MCP_A_X: SwitchAddress = { kind: 'mcp-tool', server: 'a', pattern: 'x' }
const SKILL: SwitchAddress = { kind: 'tool', name: 'skill' }
const SKILL_OPENSPEC: SwitchAddress = { kind: 'skill', name: 'openspec-propose' }

/** 构造一份合法状态；只覆盖用例关心的字段。 */
function stateOf(overrides: Partial<SessionToolState> = {}): SessionToolState {
  return { version: 1, disabled: [], snapshot: [], seeded: false, updatedAt: 0, ...overrides }
}

/** 构造一条本插件的整值记录事件（`data` 即状态载荷）。 */
function recordOf(seq: number, data: unknown): SessionEventLike {
  return { type: STATE_RECORD_TYPE, seq, time: 1_700_000_000_000 + seq, data, ignorable: true }
}

/** 构造一条非本插件事件：哪怕载荷像状态，也不该被折叠。 */
function foreignEvent(seq: number, data: unknown = { text: '你好' }): SessionEventLike {
  return { type: 'user/message', seq, time: 1_700_000_000_000 + seq, data }
}

describe('EMPTY_STATE', () => {
  it('形状与设计一致，且对象与空数组都被冻结', () => {
    expect(EMPTY_STATE).toEqual({
      version: 1,
      disabled: [],
      snapshot: [],
      seeded: false,
      updatedAt: 0,
    })
    expect(Object.isFrozen(EMPTY_STATE)).toBe(true)
    expect(Object.isFrozen(EMPTY_STATE.disabled)).toBe(true)
    expect(Object.isFrozen(EMPTY_STATE.snapshot)).toBe(true)
  })
})

describe('STATE_RECORD_TYPE', () => {
  it('符合宿主的插件记录文法（dsh-session 的 PLUGIN_RECORD_TYPE）', () => {
    const pluginRecordType = /^plugin:[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/
    expect(pluginRecordType.test(STATE_RECORD_TYPE)).toBe(true)
  })
})

describe('withToggled：关闭集增删', () => {
  it('关闭一个地址：加入关闭集，其余字段与快照数组原样带过去', () => {
    const before = stateOf({ snapshot: ['mcp:b'], seeded: true, updatedAt: 42 })

    const after = withToggled(before, MCP_A, false)

    expect(after).toEqual({ ...before, disabled: ['mcp:a'] })
    expect(after.disabled).not.toBe(before.disabled)
    expect(after.snapshot).toBe(before.snapshot)
  })

  it('同一地址连续关闭两次：第二次返回同一引用（幂等）', () => {
    const once = withToggled(EMPTY_STATE, MCP_A, false)
    const twice = withToggled(once, MCP_A, false)

    expect(twice).toBe(once)
    expect(twice.disabled).toEqual(['mcp:a'])
  })

  it('开启一个不在关闭集里的地址：返回同一引用', () => {
    const state = stateOf({ disabled: ['mcp:a'], seeded: true, updatedAt: 7 })

    expect(withToggled(state, MCP_B, true)).toBe(state)
  })

  it('开启时只移除目标项，其它关闭项保留', () => {
    const state = stateOf({ disabled: ['mcp:a', 'mcp:a::x', 'mcp:b'], seeded: true })

    expect(withToggled(state, MCP_A_X, true).disabled).toEqual(['mcp:a', 'mcp:b'])
  })

  it('关闭集按规范形排序，与插入顺序无关', () => {
    let state = EMPTY_STATE
    for (const address of [MCP_B, MCP_A_X, MCP_A]) state = withToggled(state, address, false)

    expect(state.disabled).toEqual(['mcp:a', 'mcp:a::x', 'mcp:b'])
  })

  it('同一地址反复开关不产生重复条目', () => {
    let state = EMPTY_STATE
    for (const on of [false, true, false, false, true, false]) {
      state = withToggled(state, MCP_A, on)
    }

    expect(state.disabled).toEqual(['mcp:a'])
  })

  it('开 → 关 → 开往返后回到空关闭集（其余字段保留）', () => {
    const base = stateOf({ seeded: true, updatedAt: 7 })

    const off = withToggled(base, MCP_A, false)
    expect(off.disabled).toEqual(['mcp:a'])

    expect(withToggled(off, MCP_A, true)).toEqual(base)
    expect(withToggled(withToggled(off, MCP_A, true), MCP_A, false).disabled).toEqual(['mcp:a'])
  })

  it('文本一律由 formatAddress 生成：skill 落到 tool:skill，整组落到 mcp:<server>', () => {
    expect(withToggled(EMPTY_STATE, SKILL, false).disabled).toEqual(['tool:skill'])
    expect(withToggled(EMPTY_STATE, MCP_A, false).disabled).toEqual(['mcp:a'])
    expect(withToggled(EMPTY_STATE, MCP_A_X, false).disabled).toEqual(['mcp:a::x'])
  })

  it('技能地址按规范形写入，与 tool:skill 共处同一份关闭集', () => {
    const withSkill = withToggled(EMPTY_STATE, SKILL_OPENSPEC, false)
    const both = withToggled(withSkill, SKILL, false)

    expect(withSkill.disabled).toEqual(['skill:openspec-propose'])
    expect(both.disabled).toEqual(['skill:openspec-propose', 'tool:skill'])
    // 开启技能不影响 tool:skill：两者是不同的开关对象。
    expect(withToggled(both, SKILL_OPENSPEC, true).disabled).toEqual(['tool:skill'])
  })

  it('updatedAt 不由 withToggled 更新（时间戳由调用方在写入前打）', () => {
    const before = stateOf({ updatedAt: 1234 })

    expect(withToggled(before, MCP_A, false).updatedAt).toBe(1234)
    // 无变化分支更彻底：连对象都不换，调用方据此跳过写入。
    expect(withToggled(before, MCP_B, true)).toBe(before)
  })
})

describe('normalizeState：整体不可用降级为 EMPTY_STATE', () => {
  /** 损坏载荷表：`[用例说明, 载荷]`。 */
  const corrupt: ReadonlyArray<readonly [string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['数字', 42],
    ['字符串', 'oops'],
    ['数组（不是记录）', []],
    ['空对象（缺 version）', {}],
    ['version 不是 1', { version: 2 }],
    ['只有 disabled 是数组（缺 version）', { disabled: [42] }],
    ['disabled 不是数组', { version: 1, disabled: 'oops' }],
    [
      'snapshot 不是数组',
      { version: 1, disabled: [], snapshot: 'oops', seeded: false, updatedAt: 0 },
    ],
    ['seeded 不是布尔', { version: 1, disabled: [], snapshot: [], seeded: 'yes', updatedAt: 0 }],
    ['updatedAt 是负数', { version: 1, disabled: [], snapshot: [], seeded: false, updatedAt: -1 }],
    [
      'updatedAt 不是有限数',
      { version: 1, disabled: [], snapshot: [], seeded: false, updatedAt: Number.NaN },
    ],
    ['缺 snapshot / seeded / updatedAt', { version: 1, disabled: ['mcp:a'] }],
  ]

  it.each(corrupt)('损坏载荷「%s」降级为空态常量并告警', (_label, raw) => {
    const { log, warnings } = recordingLog()

    expect(normalizeState(raw, log)).toBe(EMPTY_STATE)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('空态')
  })
})

describe('normalizeState：合法载荷与条目级降级', () => {
  it('合法载荷原样通过', () => {
    const raw = {
      version: 1,
      disabled: ['mcp:a', 'tool:skill'],
      snapshot: ['mcp:b'],
      seeded: true,
      updatedAt: 17,
    }

    expect(normalizeState(raw, QUIET_LOG)).toEqual(raw)
    expect(normalizeState(EMPTY_STATE, QUIET_LOG)).toEqual(EMPTY_STATE)
  })

  it('含 skill:<name> 的整值记录原样往返（经 parseAddress 自动接受，不告警）', () => {
    const { log, warnings } = recordingLog()
    const raw = {
      version: 1,
      disabled: ['skill:openspec-propose', 'tool:skill'],
      snapshot: ['skill:openspec-propose'],
      seeded: true,
      updatedAt: 21,
    }

    expect(normalizeState(raw, log)).toEqual(raw)
    // 规范形直接通过：不产生「丢弃」也不产生「归一」告警。
    expect(warnings).toEqual([])
  })

  it('坏条目逐条丢弃，好条目保留，并按字段汇总成一条告警', () => {
    const { log, warnings } = recordingLog()
    const raw = {
      version: 1,
      disabled: ['mcp:a', 42, 'bogus', 'tool:workflow'],
      snapshot: [],
      seeded: true,
      updatedAt: 5,
    }

    expect(normalizeState(raw, log)).toEqual({
      version: 1,
      disabled: ['mcp:a', 'tool:workflow'],
      snapshot: [],
      seeded: true,
      updatedAt: 5,
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('丢弃')
    expect(warnings[0]).toContain('bogus')
  })

  it('可解析但非规范形的条目归一为规范形（语义不变）', () => {
    const { log, warnings } = recordingLog()
    const raw = {
      version: 1,
      disabled: ['mcp:a::*', 'skill'],
      snapshot: ['mcp:a::*'],
      seeded: true,
      updatedAt: 0,
    }

    expect(normalizeState(raw, log)).toEqual({
      version: 1,
      disabled: ['mcp:a', 'tool:skill'],
      snapshot: ['mcp:a'],
      seeded: true,
      updatedAt: 0,
    })
    // 每个字段各汇总一条（disabled / snapshot）。
    expect(warnings).toHaveLength(2)
    expect(warnings.every((warning) => warning.includes('归一'))).toBe(true)
  })

  it('skill 与 skill:* 归一为 tool:skill（整档别名，语义不变）', () => {
    const raw = {
      version: 1,
      disabled: ['skill', 'skill:*'],
      snapshot: ['skill:*'],
      seeded: true,
      updatedAt: 0,
    }

    expect(normalizeState(raw, QUIET_LOG)).toEqual({
      version: 1,
      disabled: ['tool:skill'],
      snapshot: ['tool:skill'],
      seeded: true,
      updatedAt: 0,
    })
  })

  it('顺带修复排序与重复：被外部改写的记录也收敛到规范形', () => {
    const raw = {
      version: 1,
      disabled: ['mcp:b', 'mcp:a', 'mcp:b'],
      snapshot: ['mcp:b', 'mcp:a'],
      seeded: true,
      updatedAt: 0,
    }

    const normalized = normalizeState(raw, QUIET_LOG)

    expect(normalized.disabled).toEqual(['mcp:a', 'mcp:b'])
    expect(normalized.snapshot).toEqual(['mcp:a', 'mcp:b'])
  })

  it('不做保护名单校验：该职责在解析期与 parseDisabledTexts，本函数只守文法', () => {
    const raw = {
      version: 1,
      disabled: ['tool:bash'],
      snapshot: [],
      seeded: false,
      updatedAt: 0,
    }

    // 刻意钉住这条缝：normalizeState 没有名单参数（设计签名如此），因此它放行；
    // 写入路径由 parseDisabledTexts 再筛一次，用户边界由 parseAddress 拒绝。
    expect(normalizeState(raw, QUIET_LOG).disabled).toEqual(['tool:bash'])
  })
})

describe('parseDisabledTexts：存储层双保险', () => {
  it('丢弃保护名单命中项，保留其它合法条目', () => {
    expect(parseDisabledTexts(['mcp:a', 'tool:bash', 'tool:workflow'], PROTECTED)).toEqual([
      'mcp:a',
      'tool:workflow',
    ])
  })

  it('丢弃文法非法、保留名与未知前缀的条目', () => {
    expect(parseDisabledTexts(['bogus', 'mcp:', 'tool:run_code', 'mcp:a::b?'], PROTECTED)).toEqual(
      [],
    )
  })

  it('可解析的非规范形条目归一为规范形', () => {
    expect(parseDisabledTexts(['mcp:a::*', 'skill'], PROTECTED)).toEqual(['mcp:a', 'tool:skill'])
  })

  it('接受 skill:<name>，并把 skill / skill:* 归一为 tool:skill', () => {
    expect(parseDisabledTexts(['skill:openspec-propose', 'skill', 'skill:*'], PROTECTED)).toEqual([
      'skill:openspec-propose',
      'tool:skill',
    ])
  })

  it('技能名非法的条目与其它文法错误同样丢弃', () => {
    expect(parseDisabledTexts(['skill:', 'skill:Foo', 'skill:openspec-propose'], PROTECTED)).toEqual([
      'skill:openspec-propose',
    ])
  })

  it('排序去重', () => {
    expect(parseDisabledTexts(['mcp:b', 'mcp:a', 'mcp:a'], PROTECTED)).toEqual(['mcp:a', 'mcp:b'])
  })

  it('空输入返回空数组', () => {
    expect(parseDisabledTexts([], PROTECTED)).toEqual([])
  })

  it('config 追加的保护名与基线同样丢弃（名单由调用方传入）', () => {
    const withExtra = new Set([...PROTECTED_BASELINE, 'workflow'])

    expect(parseDisabledTexts(['tool:workflow', 'mcp:a'], withExtra)).toEqual(['mcp:a'])
  })

  it('不改入参，返回新数组', () => {
    const input = ['mcp:b', 'mcp:a']
    const kept = parseDisabledTexts(input, PROTECTED)

    expect(kept).not.toBe(input)
    expect(input).toEqual(['mcp:b', 'mcp:a'])
  })
})

describe('foldStatus：读路径日志重放', () => {
  it('空日志返回空态，且不告警（新会话在播种前本来就没有记录）', () => {
    const { log, warnings } = recordingLog()

    expect(foldStatus([], log)).toBe(EMPTY_STATE)
    expect(warnings).toEqual([])
  })

  it('非本插件事件与缺 ignorable 的记录都不算有效记录', () => {
    const missingIgnorable: SessionEventLike = {
      type: STATE_RECORD_TYPE,
      seq: 1,
      time: 1_700_000_000_001,
      data: stateOf({ disabled: ['mcp:a'], seeded: true }),
    }

    expect(foldStatus([foreignEvent(0), missingIgnorable], QUIET_LOG)).toBe(EMPTY_STATE)
  })

  it('多条有效记录取最后一条（历史记录只是历史）', () => {
    const events = [
      recordOf(0, stateOf({ disabled: ['mcp:a'], seeded: true, updatedAt: 1 })),
      foreignEvent(1),
      recordOf(2, stateOf({ disabled: ['mcp:b'], snapshot: ['mcp:a'], seeded: true, updatedAt: 2 })),
      recordOf(3, stateOf({ snapshot: ['mcp:a', 'mcp:b'], seeded: true, updatedAt: 3 })),
    ]

    expect(foldStatus(events, QUIET_LOG)).toEqual({
      version: 1,
      disabled: [],
      snapshot: ['mcp:a', 'mcp:b'],
      seeded: true,
      updatedAt: 3,
    })
  })

  it('重放含 skill:<name> 的整值记录（技能地址是一等状态文本）', () => {
    const events = [
      recordOf(0, stateOf({ disabled: ['skill:openspec-propose'], seeded: true, updatedAt: 1 })),
    ]

    expect(foldStatus(events, QUIET_LOG).disabled).toEqual(['skill:openspec-propose'])
  })

  it('最后一条载荷损坏时降级空态，不回退到更早的记录', () => {
    const events = [
      recordOf(0, stateOf({ disabled: ['mcp:a'], seeded: true, updatedAt: 1 })),
      recordOf(1, { version: 1, disabled: 'oops' }),
    ]
    const { log, warnings } = recordingLog()

    expect(foldStatus(events, log)).toBe(EMPTY_STATE)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('空态')
  })

  it('折叠复用自校验：载荷里的非法条目照样逐条丢弃', () => {
    const events = [
      recordOf(
        0,
        { version: 1, disabled: ['mcp:a', 'bogus'], snapshot: [], seeded: true, updatedAt: 0 },
      ),
    ]

    expect(foldStatus(events, QUIET_LOG).disabled).toEqual(['mcp:a'])
  })

  it('以传入顺序为准（snapshotEvents() 的契约就是 seq 顺序），不按 seq 重排', () => {
    const older = recordOf(5, stateOf({ disabled: ['mcp:a'], seeded: true, updatedAt: 5 }))
    const newer = recordOf(2, stateOf({ disabled: ['mcp:b'], seeded: true, updatedAt: 2 }))

    expect(foldStatus([older, newer], QUIET_LOG).disabled).toEqual(['mcp:b'])
  })
})
