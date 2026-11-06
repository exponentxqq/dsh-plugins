/**
 * 掩码计划测试（规范：dsh-session-tool-toggle —— 掩码名单只从本会话两读推导）。
 *
 * 三条主线：
 *
 * - **两读并集**（本变更 D-1）：候选 = `scoped ∪ carried`；`scoped` / `carried` 各自单独
 *   也能让名字进入 deny；名字不在两读里时（纯意图）不产生 deny，但整组的遮蔽意图保留；
 *   服务器断线（两读都不含该组名字）时不抛错、deny 为空；
 * - **匹配语义**：尾部 `*` 只打在 public name 的后缀上，不命中别的 server、不命中
 *   同名不同后缀的名字；
 * - **整组 vs 单工具**：只有整组关闭产生 section 遮蔽段，单工具关闭不产生。
 *
 * 外加 `guardReason` 的两态、`matched` 的「0 也保留键」，以及纯函数性质（不改入参、
 * 同一输入结果相等）。
 *
 * 还有一条范围约束：工具掩码**不认识**技能地址，`skill:<name>` 永不进 `deny`、不在
 * `matched` 里留键；而 `tool:skill` 是整档工具地址，仍按既有工具逻辑拒绝。
 */
import { describe, expect, it } from 'vitest'
import { guardReason, planMask, type MaskInputs } from '../src/host/mask.ts'

/**
 * 构造入参：用例只写它关心的读面，其余一律空数组。
 * @param partial - 要覆盖的字段。
 * @returns 完整入参。
 */
function inputs(partial: Partial<MaskInputs>): MaskInputs {
  return { scoped: [], carried: [], disabled: [], ...partial }
}

describe('planMask：两读并集', () => {
  it('名字不在 scoped ∪ carried 里：纯意图不产生 deny（matched 0、遮蔽意图保留）', () => {
    // 纯意图：用户在会话里关了 mcp:a，但本会话当前没有该服务器的任何工具。
    // 两读里都没有 mcp__a__* 这个名字 → 候选里没有它 → deny 为空（deny 绝不包含读不到的
    // 名字，否则 restrict 会抛错）。遮蔽段与 0 命中键仍照旧产生：意图与在线状态无关。
    expect(planMask({ scoped: [], carried: [], disabled: ['mcp:a'] })).toEqual({
      deny: [],
      shadowServers: ['a'],
      matched: new Map([['mcp:a', 0]]),
    })
  })

  it('scoped 单独就能让名字进入 deny（本会话读数里有它时就生效）', () => {
    expect(planMask({ scoped: ['mcp__a__x'], carried: [], disabled: ['mcp:a'] }).deny).toEqual([
      'mcp__a__x',
    ])
  })

  it('carried 保底：scoped 里已经没有它时仍在 deny', () => {
    // 本插件上一轮的掩码让 mcp__a__x 从 scoped 消失；carried 把它带过这一轮，
    // 否则第二读会缩小 → 掩码被抬掉 → 下一轮又掩上（振荡）。
    expect(
      planMask({ scoped: ['mcp__b__y'], carried: ['mcp__a__x'], disabled: ['mcp:a'] }).deny,
    ).toEqual(['mcp__a__x'])
  })

  it('同一个名字在两个读面重复出现只记一次命中', () => {
    const plan = planMask(
      inputs({
        scoped: ['mcp__a__x'],
        carried: ['mcp__a__x'],
        disabled: ['mcp:a'],
      }),
    )
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.matched.get('mcp:a')).toBe(1)
  })

  it('服务器断线（两读都不含 mcp__a__*）不抛错且 deny 为空', () => {
    const disconnected = inputs({
      scoped: ['bash', 'mcp__b__y'],
      carried: [],
      disabled: ['mcp:a'],
    })
    expect(() => planMask(disconnected)).not.toThrow()
    const plan = planMask(disconnected)
    expect(plan.deny).toEqual([])
    // 意图保持：遮蔽段由关闭集决定，与服务是否在线无关（空段在渲染期被丢弃）。
    expect(plan.shadowServers).toEqual(['a'])
  })
})

describe('planMask：deny 推导', () => {
  it('§5 T3 断言：整组关闭 → deny 为排序后的两条，shadowServers 为该服务器', () => {
    const plan = planMask({
      scoped: ['bash', 'mcp__a__y'],
      carried: ['mcp__a__x'],
      disabled: ['mcp:a'],
    })
    expect(plan.deny).toEqual(['mcp__a__x', 'mcp__a__y'])
    expect(plan.shadowServers).toEqual(['a'])
    expect(plan.matched.get('mcp:a')).toBe(2)
  })

  it('deny 排序（稳定顺序是 diff 守卫的前提）', () => {
    const plan = planMask(
      inputs({ scoped: ['mcp__a__z', 'mcp__a__m', 'mcp__a__a'], disabled: ['mcp:a'] }),
    )
    expect(plan.deny).toEqual(['mcp__a__a', 'mcp__a__m', 'mcp__a__z'])
  })

  it('单工具关闭只摘匹配到的名字', () => {
    const plan = planMask(
      inputs({ scoped: ['mcp__a__x', 'mcp__a__y'], disabled: ['mcp:a::x'] }),
    )
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.matched.get('mcp:a::x')).toBe(1)
  })

  it('内置工具只命中内置注册名', () => {
    const plan = planMask(
      inputs({
        scoped: ['workflow', 'notes_create', 'mcp__a__workflow'],
        disabled: ['tool:workflow'],
      }),
    )
    expect(plan.deny).toEqual(['workflow'])
    expect(plan.matched.get('tool:workflow')).toBe(1)
  })

  it('skill 在解析期归一为 tool:skill，命中键也是规范形', () => {
    const plan = planMask(inputs({ scoped: ['skill'], disabled: ['skill'] }))
    expect(plan.deny).toEqual(['skill'])
    expect(plan.matched.get('tool:skill')).toBe(1)
    expect(plan.matched.has('skill')).toBe(false)
  })

  it('空入参：两个读面都为空', () => {
    const plan = planMask({ scoped: [], carried: [], disabled: [] })
    expect(plan.deny).toEqual([])
    expect(plan.shadowServers).toEqual([])
    expect(plan.matched.size).toBe(0)
  })
})

describe('planMask：技能地址不进工具掩码（H3）', () => {
  it('G2-c 目标断言：只有技能地址的关闭集不产生 deny / shadowServers / matched 键', () => {
    // 技能名不是工具注册名：即使读数里确实有 `skill` 这个工具，`skill:foo` 也不参与工具掩码。
    const plan = planMask({ scoped: ['skill'], carried: [], disabled: ['skill:foo'] })
    expect(plan).toEqual({ deny: [], shadowServers: [], matched: new Map() })
  })

  it('多条技能地址同样全部跳过（不进 deny、不计数、不留键）', () => {
    const plan = planMask(
      inputs({ scoped: ['skill', 'mcp__a__x'], disabled: ['skill:foo', 'skill:bar', 'skill:foo'] }),
    )
    expect(plan.deny).toEqual([])
    expect(plan.shadowServers).toEqual([])
    expect(plan.matched.size).toBe(0)
  })

  it('技能地址与 mcp 地址混排：只有 mcp 部分进 deny / matched / 遮蔽段', () => {
    const plan = planMask(
      inputs({
        scoped: ['skill', 'mcp__a__x'],
        disabled: ['skill:foo', 'mcp:a'],
      }),
    )
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.shadowServers).toEqual(['a'])
    expect(Array.from(plan.matched.keys())).toEqual(['mcp:a'])
    expect(plan.matched.get('mcp:a')).toBe(1)
  })

  it('carried 里的技能名也不进 deny（技能名不是工具注册名）', () => {
    const plan = planMask(inputs({ carried: ['skill'], disabled: ['skill:foo'] }))
    expect(plan.deny).toEqual([])
    expect(plan.matched.size).toBe(0)
  })

  it('关键区分：tool:skill（整档，kind === tool）仍按工具走既有 deny 逻辑', () => {
    // `tool:skill` 是「关掉整档 skill 工具」的工具地址，不是技能地址；裸别名 `skill` 在解析期
    // 归一到同一条规范形（见上方「skill 在解析期归一为 tool:skill」用例）。
    const plan = planMask(inputs({ scoped: ['skill'], disabled: ['tool:skill'] }))
    expect(plan.deny).toEqual(['skill'])
    expect(plan.shadowServers).toEqual([])
    expect(plan.matched.get('tool:skill')).toBe(1)
  })
})

describe('planMask：尾部 * 只匹配 public name', () => {
  it('mcp:a::get_* 命中 mcp__a__get_x，不命中别的 server、不命中别的后缀', () => {
    const plan = planMask(
      inputs({
        scoped: ['mcp__a__get_x', 'mcp__b__get_x', 'mcp__a__list_x'],
        disabled: ['mcp:a::get_*'],
      }),
    )
    expect(plan.deny).toEqual(['mcp__a__get_x'])
    expect(plan.matched.get('mcp:a::get_*')).toBe(1)
  })

  it('通配地址不产生遮蔽段（单工具 ≠ 整组）', () => {
    const plan = planMask(inputs({ scoped: ['mcp__a__get_x'], disabled: ['mcp:a::get_*'] }))
    expect(plan.shadowServers).toEqual([])
  })

  it('carried 里已从活读数消失的名字，配合通配地址仍进 deny', () => {
    const plan = planMask(
      inputs({
        carried: ['mcp__a__get_x'],
        scoped: ['mcp__a__list_x'],
        disabled: ['mcp:a::get_*'],
      }),
    )
    expect(plan.deny).toEqual(['mcp__a__get_x'])
    expect(plan.matched.get('mcp:a::get_*')).toBe(1)
  })
})

describe('planMask：整组 vs 单工具的 section 遮蔽差异', () => {
  it('整组关闭 mcp:a → shadowServers 为 [a]', () => {
    const plan = planMask(inputs({ scoped: ['mcp__a__x'], disabled: ['mcp:a'] }))
    expect(plan.shadowServers).toEqual(['a'])
  })

  it('单工具关闭 mcp:a::x → shadowServers 为空', () => {
    const plan = planMask(inputs({ scoped: ['mcp__a__x'], disabled: ['mcp:a::x'] }))
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.shadowServers).toEqual([])
  })

  it('内置工具关闭 tool:workflow → shadowServers 为空', () => {
    const plan = planMask(inputs({ scoped: ['workflow'], disabled: ['tool:workflow'] }))
    expect(plan.shadowServers).toEqual([])
  })

  it('mcp:a::* 与 mcp:a 同义 → 仍产生遮蔽段', () => {
    const plan = planMask(inputs({ scoped: ['mcp__a__x'], disabled: ['mcp:a::*'] }))
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.shadowServers).toEqual(['a'])
    expect(plan.matched.has('mcp:a')).toBe(true)
  })

  it('多个整组关闭：shadowServers 排序去重', () => {
    const plan = planMask(
      inputs({
        scoped: ['mcp__b__x', 'mcp__a__y', 'mcp__a__x'],
        disabled: ['mcp:b', 'mcp:a'],
      }),
    )
    expect(plan.shadowServers).toEqual(['a', 'b'])
    expect(plan.deny).toEqual(['mcp__a__x', 'mcp__a__y', 'mcp__b__x'])
    expect(plan.matched.get('mcp:a')).toBe(2)
    expect(plan.matched.get('mcp:b')).toBe(1)
  })

  it('重复的整组条目只产生一个遮蔽段与一个键', () => {
    const plan = planMask(
      inputs({ scoped: ['mcp__a__x'], disabled: ['mcp:a', 'mcp:a', 'mcp:a::*'] }),
    )
    expect(plan.shadowServers).toEqual(['a'])
    expect(plan.matched.size).toBe(1)
    expect(plan.matched.get('mcp:a')).toBe(1)
  })
})

describe('planMask：命中计数 matched', () => {
  it('0 命中的地址仍在 matched 里（值 0，回执靠它区分两态）', () => {
    const plan = planMask(inputs({ scoped: ['mcp__a__x'], disabled: ['mcp:b'] }))
    expect(plan.deny).toEqual([])
    expect(plan.shadowServers).toEqual(['b'])
    expect(plan.matched.get('mcp:b')).toBe(0)
    expect(plan.matched.size).toBe(1)
  })

  it('计数按命中名字数（整组关掉两个只算 2，不按读数累加）', () => {
    const plan = planMask(
      inputs({
        scoped: ['mcp__a__x', 'mcp__a__y', 'bash', 'workflow'],
        carried: ['mcp__a__x'],
        disabled: ['mcp:a'],
      }),
    )
    expect(plan.matched.get('mcp:a')).toBe(2)
  })

  it('不可解析 / 保护名单 / 保留名的文本静默跳过（不抛错、不进 matched）', () => {
    const dirty = inputs({
      scoped: ['mcp__a__x', 'bash'],
      disabled: ['', '   ', 'garbage', 'mcp:', 'mcp:a:::x', 'foo:bar', 'tool:bash', 'tool:run_code'],
    })
    expect(() => planMask(dirty)).not.toThrow()
    const plan = planMask(dirty)
    expect(plan.deny).toEqual([])
    expect(plan.shadowServers).toEqual([])
    expect(plan.matched.size).toBe(0)
  })

  it('脏条目与合法条目混在一起时只留下合法的那条', () => {
    const plan = planMask(inputs({ scoped: ['mcp__a__x'], disabled: ['???', 'mcp:a'] }))
    expect(Array.from(plan.matched.keys())).toEqual(['mcp:a'])
    expect(plan.matched.get('mcp:a')).toBe(1)
  })

  it('matched 键按规范形排序，与入参顺序无关', () => {
    const plan = planMask(
      inputs({ scoped: ['mcp__a__x', 'mcp__b__y'], disabled: ['mcp:b', 'mcp:a'] }),
    )
    expect(Array.from(plan.matched.keys())).toEqual(['mcp:a', 'mcp:b'])
  })
})

describe('guardReason', () => {
  it('整组关闭命中：理由含工具名与被关的地址，并提示 /tools on 恢复', () => {
    const reason = guardReason('mcp__a__get_x', ['mcp:a'])
    expect(reason).toBeDefined()
    expect(reason).toContain('mcp__a__get_x')
    expect(reason).toContain('mcp:a')
    expect(reason).toContain('/tools on mcp:a')
  })

  it('单工具通配命中：理由里的地址是规范形拼写', () => {
    const reason = guardReason('mcp__a__get_x', ['mcp:a::get_*'])
    expect(reason).toContain('mcp__a__get_x')
    expect(reason).toContain('mcp:a::get_*')
  })

  it('内置工具命中', () => {
    expect(guardReason('workflow', ['tool:workflow'])).toContain('tool:workflow')
  })

  it('未被任何地址命中时返回 undefined', () => {
    expect(guardReason('mcp__b__get_x', ['mcp:a'])).toBeUndefined()
    expect(guardReason('mcp__a__list_x', ['mcp:a::get_*'])).toBeUndefined()
    expect(guardReason('notes_create', ['tool:workflow'])).toBeUndefined()
    expect(guardReason('mcp__zzz__x', ['mcp:a'])).toBeUndefined()
  })

  it('空关闭集返回 undefined', () => {
    expect(guardReason('mcp__a__x', [])).toBeUndefined()
  })

  it('关闭集含不可解析条目时不抛错，只是不命中', () => {
    const dirty = ['???', 'mcp:', 'tool:bash', 'tool:run_code']
    expect(() => guardReason('mcp__a__x', dirty)).not.toThrow()
    expect(guardReason('mcp__a__x', dirty)).toBeUndefined()
    expect(guardReason('bash', dirty)).toBeUndefined()
  })
})

describe('guardReason：技能地址不产生工具拒绝理由（H3）', () => {
  it('技能地址不命中任何工具名（含同名情形）', () => {
    expect(guardReason('skill', ['skill:foo'])).toBeUndefined()
    expect(guardReason('foo', ['skill:foo'])).toBeUndefined()
    expect(guardReason('mcp__a__x', ['skill:foo'])).toBeUndefined()
  })

  it('技能地址与工具地址混排：只按工具地址拒绝', () => {
    expect(guardReason('mcp__a__x', ['skill:foo', 'mcp:a'])).toContain('mcp:a')
  })

  it('关键区分：tool:skill 仍按工具拒绝（整档工具地址，不是技能地址）', () => {
    const reason = guardReason('skill', ['tool:skill'])
    expect(reason).toBeDefined()
    expect(reason).toContain('tool:skill')
  })
})

describe('planMask：纯函数性质', () => {
  it('不改动入参（两份读数与关闭集原样保留）', () => {
    const scoped = Object.freeze(['mcp__a__y', 'bash'])
    const carried = Object.freeze(['mcp__a__x'])
    const disabled = Object.freeze(['mcp:a', 'garbage'])
    planMask({ scoped, carried, disabled })
    expect(scoped).toEqual(['mcp__a__y', 'bash'])
    expect(carried).toEqual(['mcp__a__x'])
    expect(disabled).toEqual(['mcp:a', 'garbage'])
  })

  it('同一输入两次调用结果相等（Map 也参与深比较）', () => {
    const one = inputs({
      scoped: ['mcp__a__x', 'mcp__a__y', 'bash'],
      carried: ['mcp__a__x'],
      disabled: ['mcp:a', 'mcp:b'],
    })
    expect(planMask(one)).toEqual(planMask(one))
  })
})
