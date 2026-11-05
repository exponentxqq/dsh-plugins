/**
 * 掩码计划测试（规范：dsh-session-tool-toggle —— 掩码名单只从活注册表推导）。
 *
 * 三条主线：
 *
 * - **三读并集**（D10）：catalog / scoped / carried 各自单独也能让名字进入 deny；服务器
 *   断线（三读都没有该组名字）时不抛错、deny 为空，但整组的遮蔽意图保留；
 * - **匹配语义**（D6）：尾部 `*` 只打在 public name 的后缀上，不命中别的 server、不命中
 *   同名不同后缀的名字；
 * - **整组 vs 单工具**（D2）：只有整组关闭产生 section 遮蔽段，单工具关闭不产生。
 *
 * 外加 `guardReason` 的两态、`matched` 的「0 也保留键」，以及纯函数性质（不改入参、
 * 同一输入结果相等）。
 *
 * 还有一条范围约束（H3）：工具掩码**不认识**技能地址，`skill:<name>` 永不进 `deny`、不在
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
  return { catalog: [], scoped: [], carried: [], disabled: [], ...partial }
}

describe('planMask：三读并集', () => {
  it('catalog 单独就能让名字进入 deny（被别的机制掩掉的名字仍算已知）', () => {
    // scoped 里没有 mcp__a__x：它被别的机制（如 project-mcp 的工作区隔离）掩掉了。
    // catalog 是全局层读数，不受任何 agent 限制 → 这个名字仍然算「已知」，必须进 deny。
    const plan = planMask(inputs({ catalog: ['mcp__a__x'], disabled: ['mcp:a'] }))
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.matched.get('mcp:a')).toBe(1)
  })

  it('scoped 单独就能让名字进入 deny（全局层读不到时仍生效）', () => {
    const plan = planMask(inputs({ catalog: [], scoped: ['mcp__b__y'], disabled: ['mcp:b'] }))
    expect(plan.deny).toEqual(['mcp__b__y'])
  })

  it('carried 名字保持：catalog / scoped 都没有它时仍在 deny', () => {
    // 本插件上一轮的掩码让 mcp__a__x 从 scoped 消失；carried 把它带过这一轮，
    // 否则第二读会缩小 → 掩码被抬掉 → 下一轮又掩上（振荡）。
    const plan = planMask(inputs({ carried: ['mcp__a__x'], disabled: ['mcp:a'] }))
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.matched.get('mcp:a')).toBe(1)
  })

  it('同一个名字在三个读面重复出现只记一次命中', () => {
    const plan = planMask(
      inputs({
        catalog: ['mcp__a__x'],
        scoped: ['mcp__a__x'],
        carried: ['mcp__a__x'],
        disabled: ['mcp:a'],
      }),
    )
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.matched.get('mcp:a')).toBe(1)
  })

  it('服务器断线（三读都不含 mcp__a__*）不抛错且 deny 为空', () => {
    const disconnected = inputs({
      catalog: ['bash', 'mcp__b__y'],
      scoped: ['bash'],
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
      catalog: ['mcp__a__x', 'mcp__a__y', 'bash'],
      scoped: ['bash'],
      carried: ['mcp__a__x'],
      disabled: ['mcp:a'],
    })
    expect(plan.deny).toEqual(['mcp__a__x', 'mcp__a__y'])
    expect(plan.shadowServers).toEqual(['a'])
    expect(plan.matched.get('mcp:a')).toBe(2)
  })

  it('deny 排序（稳定顺序是 diff 守卫的前提）', () => {
    const plan = planMask(
      inputs({ catalog: ['mcp__a__z', 'mcp__a__m', 'mcp__a__a'], disabled: ['mcp:a'] }),
    )
    expect(plan.deny).toEqual(['mcp__a__a', 'mcp__a__m', 'mcp__a__z'])
  })

  it('单工具关闭只摘匹配到的名字', () => {
    const plan = planMask(
      inputs({ catalog: ['mcp__a__x', 'mcp__a__y'], disabled: ['mcp:a::x'] }),
    )
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.matched.get('mcp:a::x')).toBe(1)
  })

  it('内置工具只命中内置注册名', () => {
    const plan = planMask(
      inputs({ catalog: ['workflow', 'notes_create', 'mcp__a__workflow'], disabled: ['tool:workflow'] }),
    )
    expect(plan.deny).toEqual(['workflow'])
    expect(plan.matched.get('tool:workflow')).toBe(1)
  })

  it('skill 在解析期归一为 tool:skill，命中键也是规范形', () => {
    const plan = planMask(inputs({ catalog: ['skill'], disabled: ['skill'] }))
    expect(plan.deny).toEqual(['skill'])
    expect(plan.matched.get('tool:skill')).toBe(1)
    expect(plan.matched.has('skill')).toBe(false)
  })

  it('空入参：三个面都为空', () => {
    const plan = planMask({ catalog: [], scoped: [], carried: [], disabled: [] })
    expect(plan.deny).toEqual([])
    expect(plan.shadowServers).toEqual([])
    expect(plan.matched.size).toBe(0)
  })
})

describe('planMask：技能地址不进工具掩码（H3）', () => {
  it('G2-c 目标断言：只有技能地址的关闭集不产生 deny / shadowServers / matched 键', () => {
    // 技能名不是工具注册名：即使读数里确实有 `skill` 这个工具，`skill:foo` 也不参与工具掩码。
    const plan = planMask({ catalog: ['skill'], scoped: ['skill'], carried: [], disabled: ['skill:foo'] })
    expect(plan).toEqual({ deny: [], shadowServers: [], matched: new Map() })
  })

  it('多条技能地址同样全部跳过（不进 deny、不计数、不留键）', () => {
    const plan = planMask(
      inputs({ catalog: ['skill', 'mcp__a__x'], disabled: ['skill:foo', 'skill:bar', 'skill:foo'] }),
    )
    expect(plan.deny).toEqual([])
    expect(plan.shadowServers).toEqual([])
    expect(plan.matched.size).toBe(0)
  })

  it('技能地址与 mcp 地址混排：只有 mcp 部分进 deny / matched / 遮蔽段', () => {
    const plan = planMask(
      inputs({
        catalog: ['skill', 'mcp__a__x'],
        scoped: ['mcp__a__x'],
        disabled: ['skill:foo', 'mcp:a'],
      }),
    )
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.shadowServers).toEqual(['a'])
    expect(Array.from(plan.matched.keys())).toEqual(['mcp:a'])
    expect(plan.matched.get('mcp:a')).toBe(1)
  })

  it('carried 里的技能名也不进 deny（技能名不是工具注册名）', () => {
    const plan = planMask(inputs({ catalog: ['skill'], carried: ['skill'], disabled: ['skill:foo'] }))
    expect(plan.deny).toEqual([])
    expect(plan.matched.size).toBe(0)
  })

  it('关键区分：tool:skill（整档，kind === tool）仍按工具走既有 deny 逻辑', () => {
    // `tool:skill` 是「关掉整档 skill 工具」的工具地址，不是技能地址；裸别名 `skill` 在解析期
    // 归一到同一条规范形（见上方「skill 在解析期归一为 tool:skill」用例）。
    const plan = planMask(
      inputs({ catalog: ['skill'], scoped: ['skill'], disabled: ['tool:skill'] }),
    )
    expect(plan.deny).toEqual(['skill'])
    expect(plan.shadowServers).toEqual([])
    expect(plan.matched.get('tool:skill')).toBe(1)
  })
})

describe('planMask：尾部 * 只匹配 public name', () => {
  it('mcp:a::get_* 命中 mcp__a__get_x，不命中别的 server、不命中别的后缀', () => {
    const plan = planMask(
      inputs({
        catalog: ['mcp__a__get_x', 'mcp__b__get_x', 'mcp__a__list_x'],
        disabled: ['mcp:a::get_*'],
      }),
    )
    expect(plan.deny).toEqual(['mcp__a__get_x'])
    expect(plan.matched.get('mcp:a::get_*')).toBe(1)
  })

  it('通配地址不产生遮蔽段（单工具 ≠ 整组）', () => {
    const plan = planMask(
      inputs({ catalog: ['mcp__a__get_x'], disabled: ['mcp:a::get_*'] }),
    )
    expect(plan.shadowServers).toEqual([])
  })

  it('carried 里已从活读数消失的名字，配合通配地址仍进 deny', () => {
    const plan = planMask(
      inputs({ carried: ['mcp__a__get_x'], catalog: ['mcp__a__list_x'], disabled: ['mcp:a::get_*'] }),
    )
    expect(plan.deny).toEqual(['mcp__a__get_x'])
    expect(plan.matched.get('mcp:a::get_*')).toBe(1)
  })
})

describe('planMask：整组 vs 单工具的 section 遮蔽差异', () => {
  it('整组关闭 mcp:a → shadowServers 为 [a]', () => {
    const plan = planMask(inputs({ catalog: ['mcp__a__x'], disabled: ['mcp:a'] }))
    expect(plan.shadowServers).toEqual(['a'])
  })

  it('单工具关闭 mcp:a::x → shadowServers 为空', () => {
    const plan = planMask(inputs({ catalog: ['mcp__a__x'], disabled: ['mcp:a::x'] }))
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.shadowServers).toEqual([])
  })

  it('内置工具关闭 tool:workflow → shadowServers 为空', () => {
    const plan = planMask(inputs({ catalog: ['workflow'], disabled: ['tool:workflow'] }))
    expect(plan.shadowServers).toEqual([])
  })

  it('mcp:a::* 与 mcp:a 同义 → 仍产生遮蔽段', () => {
    const plan = planMask(inputs({ catalog: ['mcp__a__x'], disabled: ['mcp:a::*'] }))
    expect(plan.deny).toEqual(['mcp__a__x'])
    expect(plan.shadowServers).toEqual(['a'])
    expect(plan.matched.has('mcp:a')).toBe(true)
  })

  it('多个整组关闭：shadowServers 排序去重', () => {
    const plan = planMask(
      inputs({
        catalog: ['mcp__b__x', 'mcp__a__y', 'mcp__a__x'],
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
      inputs({ catalog: ['mcp__a__x'], disabled: ['mcp:a', 'mcp:a', 'mcp:a::*'] }),
    )
    expect(plan.shadowServers).toEqual(['a'])
    expect(plan.matched.size).toBe(1)
    expect(plan.matched.get('mcp:a')).toBe(1)
  })
})

describe('planMask：命中计数 matched', () => {
  it('0 命中的地址仍在 matched 里（值 0，回执靠它区分两态）', () => {
    const plan = planMask(inputs({ catalog: ['mcp__a__x'], disabled: ['mcp:b'] }))
    expect(plan.deny).toEqual([])
    expect(plan.shadowServers).toEqual(['b'])
    expect(plan.matched.get('mcp:b')).toBe(0)
    expect(plan.matched.size).toBe(1)
  })

  it('计数按命中名字数（整组关掉两个只算 2，不按读数累加）', () => {
    const plan = planMask(
      inputs({
        catalog: ['mcp__a__x', 'mcp__a__y', 'bash', 'workflow'],
        scoped: ['mcp__a__x', 'bash'],
        disabled: ['mcp:a'],
      }),
    )
    expect(plan.matched.get('mcp:a')).toBe(2)
  })

  it('不可解析 / 保护名单 / 保留名的文本静默跳过（不抛错、不进 matched）', () => {
    const dirty = inputs({
      catalog: ['mcp__a__x', 'bash'],
      disabled: ['', '   ', 'garbage', 'mcp:', 'mcp:a:::x', 'foo:bar', 'tool:bash', 'tool:run_code'],
    })
    expect(() => planMask(dirty)).not.toThrow()
    const plan = planMask(dirty)
    expect(plan.deny).toEqual([])
    expect(plan.shadowServers).toEqual([])
    expect(plan.matched.size).toBe(0)
  })

  it('脏条目与合法条目混在一起时只留下合法的那条', () => {
    const plan = planMask(inputs({ catalog: ['mcp__a__x'], disabled: ['???', 'mcp:a'] }))
    expect(Array.from(plan.matched.keys())).toEqual(['mcp:a'])
    expect(plan.matched.get('mcp:a')).toBe(1)
  })

  it('matched 键按规范形排序，与入参顺序无关', () => {
    const plan = planMask(
      inputs({ catalog: ['mcp__a__x', 'mcp__b__y'], disabled: ['mcp:b', 'mcp:a'] }),
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
  it('不改动入参（三份读数与关闭集原样保留）', () => {
    const catalog = Object.freeze(['mcp__a__x', 'bash'])
    const scoped = Object.freeze(['bash'])
    const carried = Object.freeze(['mcp__a__x'])
    const disabled = Object.freeze(['mcp:a', 'garbage'])
    planMask({ catalog, scoped, carried, disabled })
    expect(catalog).toEqual(['mcp__a__x', 'bash'])
    expect(scoped).toEqual(['bash'])
    expect(carried).toEqual(['mcp__a__x'])
    expect(disabled).toEqual(['mcp:a', 'garbage'])
  })

  it('同一输入两次调用结果相等（Map 也参与深比较）', () => {
    const one = inputs({
      catalog: ['mcp__a__x', 'mcp__a__y', 'bash'],
      scoped: ['bash'],
      carried: ['mcp__a__x'],
      disabled: ['mcp:a', 'mcp:b'],
    })
    expect(planMask(one)).toEqual(planMask(one))
  })
})
