/**
 * 技能遮蔽计划测试（规范：dsh-session-tool-toggle —— 技能级开关（仅模型可见性））。
 *
 * 五组表驱动用例（任务 2.2）：
 *
 * - **空集**：全空入参 → 四输出全空；
 * - **未知名**：`installed` 没有该名 → `matched` 0 也保留键、`intentOnly` 含之；
 * - **重复**：同一地址重复出现 → `shadowNames` / `closedTexts` 排序去重；
 * - **整档关闭**：`toolSkillClosed:true` → `shadowNames` 空，
 *   `closedTexts` / `matched` / `intentOnly` 仍如实输出；
 * - **与工具/MCP 地址隔离**：`mcp:*` / `tool:*` 条目不进任何技能输出。
 *
 * 外加脏条目与整档别名的容忍（不抛错）、kebab 文法的正例，以及纯函数性质；文件末尾是
 * code-design G2 的出口断言。
 */
import { describe, expect, it } from 'vitest'
import {
  SKILL_TOOL_ADDRESS,
  planSkills,
  type SkillsPlan,
  type SkillsPlanInputs,
} from '../src/host/skills-plan.ts'

/** 构造入参：用例只写它关心的字段，其余一律空。 */
function inputs(partial: Partial<SkillsPlanInputs> = {}): SkillsPlanInputs {
  return { disabled: [], installed: [], toolSkillClosed: false, ...partial }
}

/** 一组表驱动用例：入参 + 四个输出的期望值（Map 也参与深比较）。 */
interface PlanCase {
  readonly label: string
  readonly inputs: SkillsPlanInputs
  readonly shadowNames: readonly string[]
  readonly closedTexts: readonly string[]
  readonly matched: ReadonlyMap<string, number>
  readonly intentOnly: readonly string[]
}

/** 逐字段断言四个输出，失败时能直接看出是哪一项。 */
function expectPlan(actual: SkillsPlan, expected: PlanCase): void {
  expect(actual.shadowNames).toEqual(expected.shadowNames)
  expect(actual.closedTexts).toEqual(expected.closedTexts)
  expect(actual.matched).toEqual(expected.matched)
  expect(actual.intentOnly).toEqual(expected.intentOnly)
}

describe('planSkills：空集', () => {
  const cases: ReadonlyArray<{ readonly label: string; readonly value: SkillsPlanInputs }> = [
    { label: '全空入参', value: inputs() },
    {
      label: '活清单非空但关闭集为空',
      value: inputs({ installed: ['openspec-propose', 'fix-2'] }),
    },
    {
      label: '关闭集只有脏条目',
      value: inputs({ disabled: ['', '   ', 'garbage', 'mcp:a', 'tool:bash'] }),
    },
  ]

  it.each(cases)('$label → 四输出全空', ({ value }) => {
    const plan = planSkills(value)
    expect(plan.shadowNames).toEqual([])
    expect(plan.closedTexts).toEqual([])
    expect(plan.matched).toEqual(new Map())
    expect(plan.intentOnly).toEqual([])
  })
})

describe('planSkills：未知名（意图保留）', () => {
  const cases: readonly PlanCase[] = [
    {
      label: '未安装技能：matched 0 保留键、intentOnly 含之',
      inputs: inputs({ disabled: ['skill:ghost'] }),
      shadowNames: ['ghost'],
      closedTexts: ['skill:ghost'],
      matched: new Map([['skill:ghost', 0]]),
      intentOnly: ['skill:ghost'],
    },
    {
      label: '已安装与未安装混合：只有 0 命中进 intentOnly',
      inputs: inputs({ disabled: ['skill:ghost', 'skill:real'], installed: ['real'] }),
      shadowNames: ['ghost', 'real'],
      closedTexts: ['skill:ghost', 'skill:real'],
      matched: new Map([
        ['skill:ghost', 0],
        ['skill:real', 1],
      ]),
      intentOnly: ['skill:ghost'],
    },
    {
      label: '活清单与关闭集完全不相交：全部是意图',
      inputs: inputs({ disabled: ['skill:b'], installed: ['a', 'c'] }),
      shadowNames: ['b'],
      closedTexts: ['skill:b'],
      matched: new Map([['skill:b', 0]]),
      intentOnly: ['skill:b'],
    },
  ]

  it.each(cases)('$label', (testCase) => {
    expectPlan(planSkills(testCase.inputs), testCase)
  })

  it('matched 里「键在、值 0」与「没关」可区分', () => {
    const plan = planSkills(inputs({ disabled: ['skill:ghost'] }))
    expect(plan.matched.has('skill:ghost')).toBe(true)
    expect(plan.matched.get('skill:ghost')).toBe(0)
    expect(plan.matched.has('skill:never-mentioned')).toBe(false)
  })
})

describe('planSkills：重复条目', () => {
  const cases: readonly PlanCase[] = [
    {
      label: '同一地址重复出现：shadowNames / closedTexts 去重排序',
      inputs: inputs({
        disabled: ['skill:b', 'skill:a', 'skill:b'],
        installed: ['a', 'b'],
      }),
      shadowNames: ['a', 'b'],
      closedTexts: ['skill:a', 'skill:b'],
      matched: new Map([
        ['skill:a', 1],
        ['skill:b', 1],
      ]),
      intentOnly: [],
    },
    {
      label: '重复的未安装地址：matched 只有一个键、值 0',
      inputs: inputs({ disabled: ['skill:ghost', 'skill:ghost', 'skill:ghost'] }),
      shadowNames: ['ghost'],
      closedTexts: ['skill:ghost'],
      matched: new Map([['skill:ghost', 0]]),
      intentOnly: ['skill:ghost'],
    },
    {
      label: '活清单自身重复也只算 0/1 命中',
      inputs: inputs({ disabled: ['skill:a', 'skill:a'], installed: ['a', 'a'] }),
      shadowNames: ['a'],
      closedTexts: ['skill:a'],
      matched: new Map([['skill:a', 1]]),
      intentOnly: [],
    },
  ]

  it.each(cases)('$label', (testCase) => {
    expectPlan(planSkills(testCase.inputs), testCase)
  })

  it('去重后的地址数：三个重复条目只留一个 matched 键', () => {
    const plan = planSkills(
      inputs({ disabled: ['skill:a', 'skill:a', 'skill:a'], installed: ['a'] }),
    )
    expect(plan.matched.size).toBe(1)
    expect(Array.from(plan.matched.keys())).toEqual(['skill:a'])
  })
})

describe('planSkills：整档关闭', () => {
  const cases: readonly PlanCase[] = [
    {
      label: '整档关闭 + 已安装技能：shadowNames 空、其余如实',
      inputs: inputs({
        disabled: ['skill:a'],
        installed: ['a'],
        toolSkillClosed: true,
      }),
      shadowNames: [],
      closedTexts: ['skill:a'],
      matched: new Map([['skill:a', 1]]),
      intentOnly: [],
    },
    {
      label: '整档关闭 + 未安装技能：意图仍然输出',
      inputs: inputs({ disabled: ['skill:ghost'], toolSkillClosed: true }),
      shadowNames: [],
      closedTexts: ['skill:ghost'],
      matched: new Map([['skill:ghost', 0]]),
      intentOnly: ['skill:ghost'],
    },
    {
      label: '整档关闭 + 多个技能：closedTexts 排序、matched 逐条 0/1',
      inputs: inputs({
        disabled: ['skill:y', 'skill:x'],
        installed: ['x'],
        toolSkillClosed: true,
      }),
      shadowNames: [],
      closedTexts: ['skill:x', 'skill:y'],
      matched: new Map([
        ['skill:x', 1],
        ['skill:y', 0],
      ]),
      intentOnly: ['skill:y'],
    },
  ]

  it.each(cases)('$label', (testCase) => {
    expectPlan(planSkills(testCase.inputs), testCase)
  })

  it('G2 出口断言：整档关闭时 shadowNames 为空', () => {
    expect(planSkills({ disabled: ['skill:x', 'skill:y', 'tool:skill'], installed: ['x'], toolSkillClosed: true }).shadowNames).toEqual([])
  })

  it('重新打开整档后 shadowNames 按关闭集恢复（含未安装名，由分面留作意图）', () => {
    const plan = planSkills(
      inputs({
        disabled: ['skill:y', 'skill:x'],
        installed: ['x'],
        toolSkillClosed: false,
      }),
    )
    expect(plan.shadowNames).toEqual(['x', 'y'])
  })

  it('整档地址本身不是逐技能地址：closedTexts / matched 里都没有 tool:skill', () => {
    const plan = planSkills(
      inputs({ disabled: ['tool:skill', 'skill:a'], installed: ['a'], toolSkillClosed: true }),
    )
    expect(plan.closedTexts).toEqual(['skill:a'])
    expect(plan.matched.has(SKILL_TOOL_ADDRESS)).toBe(false)
  })
})

describe('planSkills：与 mcp / 工具地址隔离', () => {
  const cases: readonly PlanCase[] = [
    {
      label: 'mcp 整组、mcp 单工具与内置工具都不进技能输出',
      inputs: inputs({
        disabled: ['mcp:a', 'mcp:a::x', 'tool:bash', 'tool:workflow'],
        installed: ['bash', 'workflow'],
      }),
      shadowNames: [],
      closedTexts: [],
      matched: new Map(),
      intentOnly: [],
    },
    {
      label: '技能地址与工具地址混排：只留技能那条',
      inputs: inputs({
        disabled: ['mcp:a', 'skill:keep', 'tool:bash'],
        installed: ['keep', 'bash'],
      }),
      shadowNames: ['keep'],
      closedTexts: ['skill:keep'],
      matched: new Map([['skill:keep', 1]]),
      intentOnly: [],
    },
    {
      label: '整档别名（裸 skill / skill:* / tool:skill）不被当作逐技能地址',
      inputs: inputs({ disabled: ['skill', 'skill:*', 'tool:skill'], installed: ['skill'] }),
      shadowNames: [],
      closedTexts: [],
      matched: new Map(),
      intentOnly: [],
    },
    {
      label: '工具名与技能名同名也不互通（tool:workflow 不生成 workflow 技能）',
      inputs: inputs({ disabled: ['tool:workflow'], installed: ['workflow'] }),
      shadowNames: [],
      closedTexts: [],
      matched: new Map(),
      intentOnly: [],
    },
  ]

  it.each(cases)('$label', (testCase) => {
    expectPlan(planSkills(testCase.inputs), testCase)
  })
})

describe('planSkills：脏条目容忍（不抛错）', () => {
  const dirty = [
    '',
    '   ',
    'garbage',
    'skill:',
    'skill:Foo',
    'skill:foo_bar',
    'skill:foo bar',
    'skill:foo-',
    'skill:-foo',
    'skill:foo::bar',
    'skill:foo/bar',
    'skill:*',
    'skill',
    'mcp:a',
    'mcp:a::x',
    'tool:bash',
    'tool:run_code',
    'tool:skill',
  ]

  it('全部脏条目静默跳过，四输出全空', () => {
    const value = inputs({ disabled: dirty, installed: ['Foo', 'foo_bar'] })
    expect(() => planSkills(value)).not.toThrow()
    expectPlan(planSkills(value), {
      label: '脏条目',
      inputs: value,
      shadowNames: [],
      closedTexts: [],
      matched: new Map(),
      intentOnly: [],
    })
  })

  it('脏条目与合法条目混排：只留合法那条', () => {
    const plan = planSkills(inputs({ disabled: ['???', 'skill:ok', 'skill:Foo'], installed: ['ok'] }))
    expect(plan.closedTexts).toEqual(['skill:ok'])
    expect(plan.shadowNames).toEqual(['ok'])
    expect(plan.intentOnly).toEqual([])
  })

  it('kebab 文法正例：数字、连字符与常见技能名都能识别', () => {
    const plan = planSkills(
      inputs({
        disabled: ['skill:fix-2', 'skill:openspec-propose'],
        installed: ['fix-2'],
      }),
    )
    expect(plan.closedTexts).toEqual(['skill:fix-2', 'skill:openspec-propose'])
    expect(plan.shadowNames).toEqual(['fix-2', 'openspec-propose'])
    expect(plan.matched.get('skill:fix-2')).toBe(1)
    expect(plan.matched.get('skill:openspec-propose')).toBe(0)
  })

  it('`skill:abc*` 这类非规范形拼写不是逐技能地址（不做通配）', () => {
    const plan = planSkills(inputs({ disabled: ['skill:abc*'], installed: ['abc'] }))
    expect(plan.closedTexts).toEqual([])
    expect(plan.intentOnly).toEqual([])
  })
})

describe('planSkills：纯函数性质', () => {
  it('不改动入参（关闭集与活清单原样保留）', () => {
    const disabled = Object.freeze(['skill:b', 'skill:a', 'garbage'])
    const installed = Object.freeze(['a'])
    planSkills({ disabled, installed, toolSkillClosed: false })
    expect(disabled).toEqual(['skill:b', 'skill:a', 'garbage'])
    expect(installed).toEqual(['a'])
  })

  it('同一输入两次调用结果相等（Map 参与深比较）', () => {
    const value = inputs({
      disabled: ['skill:b', 'skill:a', 'skill:ghost'],
      installed: ['a'],
    })
    expect(planSkills(value)).toEqual(planSkills(value))
  })

  it('输出与入参顺序无关（稳定排序是 diff 守卫的前提）', () => {
    const one = planSkills(
      inputs({ disabled: ['skill:b', 'skill:a'], installed: ['b', 'a'] }),
    )
    const two = planSkills(
      inputs({ disabled: ['skill:a', 'skill:b'], installed: ['a', 'b'] }),
    )
    expect(one).toEqual(two)
    expect(Array.from(one.matched.keys())).toEqual(['skill:a', 'skill:b'])
  })

  it('整档地址常量的规范形', () => {
    expect(SKILL_TOOL_ADDRESS).toBe('tool:skill')
  })
})
