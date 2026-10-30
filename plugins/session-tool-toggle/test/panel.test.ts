/**
 * 面板快照构建器测试（规范：dsh-session-tool-toggle —— 面板与 `/tools` 共用同一份读数）。
 *
 * 主线按附录 §2.5 的推导顺序：三读并集 → 分组（首个 `__` 切分）→ 四条目标记 →
 * `stats` 四计数 → `hiddenByOthers` / `intentOnly` / `notices`。另加：
 *
 * - **形状**：字段名、嵌套与可选性与附录 §2.2 逐字段对齐；**绝不**出现 `parameters`；
 * - **描述**：只取首 160 字符，短描述原样，无描述时连键都不出现；
 * - **纯函数**：入参不被修改，同一输入两次调用结果深相等；
 * - **空输入**：空 catalog / 空关闭集不抛错，得到一份全空快照。
 *
 * 两个刻意记录在案的口径（不是断言笔误）：
 *
 * 1. `shadowed` / `hiddenByOthers` 按 diff-matrix R18 = `catalog \ (scoped ∪ carried)`：
 *    `carried` 是本插件**已生效**的掩码，必须从差集里排除——否则本会话关掉且已生效的工具
 *    会同时带 `disabled` 与 `shadowed`，而面板对 shadowed 行禁用开关（附录 §3.3），用户就
 *    在分组清单里打不开自己关掉的工具了。真被其他作用域掩掉的名字仍照常计入（见「R18 口径」
 *    两个用例）。
 * 2. `mcp__a__b__c` 按**首个** `__` 归 serverName `a`（§6.1 A12 的已知歧义：与 server
 *    `a__b` + suffix `c` 的拆法不可区分）。歧义只影响展示分组，开关地址匹配不看分组。
 */
import { describe, expect, it } from 'vitest'
import { buildPanelSnapshot, DESCRIPTION_MAX_LENGTH } from '../src/host/panel.ts'
import type { ToolEntry, ToolGroup } from '../src/host/panel.ts'
import type { DefaultsFile, PanelInputs, SessionToolState } from '../src/host/types.ts'

/** 空状态：新会话 / 空日志的合法取值（关闭集与快照都为空）。 */
const EMPTY_STATE: SessionToolState = {
  version: 1,
  disabled: [],
  snapshot: [],
  seeded: false,
  updatedAt: 0,
}

/** 空默认档：文件不存在 / 损坏降级后的合法取值。 */
const EMPTY_DEFAULTS: DefaultsFile = { version: 1, disabled: [] }

/**
 * 构造面板入参：用例只写它关心的字段，其余取「新会话、无关闭、记录通道」的基线。
 * @param partial - 要覆盖的字段。
 * @returns 完整入参。
 */
function inputs(partial: Partial<PanelInputs> = {}): PanelInputs {
  return {
    sessionId: 'session-1',
    createdAt: 1_700_000_000_000,
    state: EMPTY_STATE,
    storeKind: 'record',
    catalog: [],
    scoped: [],
    carried: [],
    protectedNames: [],
    defaults: EMPTY_DEFAULTS,
    defaultsPath: '/home/user/.dsh/session-tool-toggle/defaults.json',
    defaultsReadable: true,
    defaultsCorrupt: false,
    notices: [],
    ...partial,
  }
}

/**
 * 构造带关闭集的状态（快照与更新时间取默认值，用例只关心关闭集）。
 * @param disabled - 关闭集原文（允许非规范形，构建器按掩码引擎口径归一）。
 * @returns 状态。
 */
function stateWith(disabled: readonly string[]): SessionToolState {
  return { ...EMPTY_STATE, disabled, updatedAt: 42 }
}

/**
 * 按分组键取组；取不到直接失败，避免用例里写一堆 `?.[0]`。
 * @param groups - 快照的分组清单。
 * @param key - 分组键（MCP = serverName；skill = `skill`；builtin = `builtin`）。
 * @returns 该分组。
 */
function groupOf(groups: readonly ToolGroup[], key: string): ToolGroup {
  const found = groups.find((group) => group.key === key)
  if (found === undefined) {
    throw new Error(`分组「${key}」不存在：${groups.map((item) => item.key).join('、')}`)
  }
  return found
}

/**
 * 按注册名取工具条目。
 * @param group - 分组。
 * @param name - 注册名。
 * @returns 该工具条目。
 */
function toolOf(group: ToolGroup, name: string): ToolEntry {
  const found = group.tools.find((tool) => tool.name === name)
  if (found === undefined) throw new Error(`工具「${name}」不在分组「${group.key}」里`)
  return found
}

describe('buildPanelSnapshot：分组（首个 __ 切分）', () => {
  it('mcp__a__x 归 a 组：组键是 serverName，条目短名是 public 后缀', () => {
    const snapshot = buildPanelSnapshot(inputs({ catalog: ['mcp__a__x'], scoped: ['mcp__a__x'] }))

    expect(snapshot.groups).toHaveLength(1)
    const group = groupOf(snapshot.groups, 'a')
    expect(group.kind).toBe('mcp')
    expect(group.address).toBe('mcp:a')
    expect(group.toolCount).toBe(1)

    const tool = toolOf(group, 'mcp__a__x')
    expect(tool.shortName).toBe('x')
    expect(tool.address).toBe('mcp:a::x')
  })

  it('mcp__a__b__c 归 a 组（记录 §6.1 A12 的歧义）', () => {
    // 只切首个 `__`：serverName 文法允许单个 `_`，所以后缀里的 `__` 归工具名。
    // 歧义：与「serverName = a__b、后缀 = c」的拆法不可区分；本插件跟随宿主命名契约，
    // 不猜。展示分组可能把两台服务器并成一组，但开关地址匹配打的是注册名，不会错。
    const snapshot = buildPanelSnapshot(inputs({ catalog: ['mcp__a__b__c'] }))

    const group = groupOf(snapshot.groups, 'a')
    expect(group.tools).toHaveLength(1)
    const tool = toolOf(group, 'mcp__a__b__c')
    expect(tool.shortName).toBe('b__c')
    expect(tool.address).toBe('mcp:a::b__c')
  })

  it('serverName 以单下划线开头也按首个 __ 切分（mcp__a_b__x → a_b 组）', () => {
    const snapshot = buildPanelSnapshot(inputs({ catalog: ['mcp__a_b__x'] }))
    expect(groupOf(snapshot.groups, 'a_b').address).toBe('mcp:a_b')
  })

  it('多个服务器按名升序、组内工具按注册名升序（输出与入参顺序无关）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ catalog: ['mcp__b__z', 'mcp__a__y', 'mcp__a__x'] }),
    )
    expect(snapshot.groups.map((group) => group.key)).toEqual(['a', 'b'])
    expect(groupOf(snapshot.groups, 'a').tools.map((tool) => tool.name)).toEqual([
      'mcp__a__x',
      'mcp__a__y',
    ])
  })

  it('非 MCP 名字分入 skill 与 builtin 两组，且排在 MCP 组之后', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ catalog: ['task_board_create', 'skill', 'mcp__a__x', 'bash'] }),
    )

    expect(snapshot.groups.map((group) => group.key)).toEqual(['a', 'skill', 'builtin'])

    const skill = groupOf(snapshot.groups, 'skill')
    expect(skill.kind).toBe('skill')
    expect(skill.address).toBe('tool:skill')
    const skillTool = toolOf(skill, 'skill')
    expect(skillTool.shortName).toBe('skill')
    expect(skillTool.address).toBe('tool:skill')

    const builtin = groupOf(snapshot.groups, 'builtin')
    expect(builtin.kind).toBe('builtin')
    // builtin 分组不可整组关 → 组地址为 null。
    expect(builtin.address).toBeNull()
    expect(builtin.tools.map((tool) => tool.name)).toEqual(['bash', 'task_board_create'])
    expect(toolOf(builtin, 'bash').address).toBe('tool:bash')
  })

  it('三读并集：只在 carried 里出现过的名字也进清单（防止掩码后清单缩水）', () => {
    // 上一轮已被本插件掩掉的名字：catalog / scoped 都读不到它，只有 carried 带着。
    const snapshot = buildPanelSnapshot(inputs({ carried: ['mcp__a__x'] }))

    expect(groupOf(snapshot.groups, 'a').toolCount).toBe(1)
    expect(toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__x').shortName).toBe('x')
    // 三读并集不改变「全局层有几个名字」的统计：catalog 仍是 0。
    expect(snapshot.stats.catalog).toBe(0)
    expect(snapshot.stats.visible).toBe(0)
  })

  it('空输入（空 catalog / 空关闭集）不抛错，得到全空快照', () => {
    const snapshot = buildPanelSnapshot(inputs())

    expect(snapshot.groups).toEqual([])
    expect(snapshot.hiddenByOthers).toEqual([])
    expect(snapshot.intentOnly).toEqual([])
    expect(snapshot.notices).toEqual([])
    expect(snapshot.state.disabled).toEqual([])
    expect(snapshot.stats).toEqual({ visible: 0, catalog: 0, denied: 0, shadowed: 0 })
  })
})

describe('buildPanelSnapshot：四条目标记', () => {
  it('run_code → reserved:true；普通内置工具与 MCP 工具恒 false', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ catalog: ['run_code', 'workflow', 'mcp__a__x'] }),
    )

    const builtin = groupOf(snapshot.groups, 'builtin')
    expect(toolOf(builtin, 'run_code').reserved).toBe(true)
    expect(toolOf(builtin, 'workflow').reserved).toBe(false)
    // MCP 条目按附录 §2.5 的字段表恒 reserved:false（public name 不可能是保留名）。
    expect(toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__x').reserved).toBe(false)
  })

  it('protected：命中生效保护名单即为 true（MCP 条目恒 false）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ catalog: ['bash', 'workflow', 'mcp__a__bash'], protectedNames: ['bash', 'read'] }),
    )

    const builtin = groupOf(snapshot.groups, 'builtin')
    expect(toolOf(builtin, 'bash').protected).toBe(true)
    expect(toolOf(builtin, 'workflow').protected).toBe(false)
    // 保护名单是内置工具名清单，不会误命中同名的 MCP public name。
    expect(toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__bash').protected).toBe(false)
    // 视图里的保护名单已排序。
    expect(snapshot.protectedNames).toEqual(['bash', 'read'])
  })

  it('disabled：命中单工具关闭集；整组未关时组标记为未关', () => {
    // 这里刻意让 scoped 仍包含被关名字，以便单独验证 disabled 标记；真实读数里本插件的
    // 掩码会让它从 scoped 消失，但 `carried` 会把它从「被其他作用域隐藏」里排除（见「R18 口径」用例）。
    const snapshot = buildPanelSnapshot(
      inputs({
        catalog: ['mcp__a__x', 'mcp__a__y', 'workflow'],
        scoped: ['mcp__a__x', 'mcp__a__y', 'workflow'],
        state: stateWith(['mcp:a::x', 'tool:workflow']),
      }),
    )

    const groupA = groupOf(snapshot.groups, 'a')
    expect(toolOf(groupA, 'mcp__a__x').disabled).toBe(true)
    expect(toolOf(groupA, 'mcp__a__y').disabled).toBe(false)
    expect(groupA.disabledCount).toBe(1)
    // 只关了单工具，没有整组关。
    expect(groupA.disabled).toBe(false)

    const builtin = groupOf(snapshot.groups, 'builtin')
    expect(toolOf(builtin, 'workflow').disabled).toBe(true)
    expect(builtin.disabledCount).toBe(1)
    // builtin 没有组地址 → 永远不能整组关。
    expect(builtin.disabled).toBe(false)

    expect(snapshot.stats.denied).toBe(2)
  })

  it('整组关闭：组 disabled:true、组内每条都 disabled，组地址进关闭集', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        catalog: ['mcp__a__x', 'mcp__a__y'],
        scoped: ['mcp__a__x', 'mcp__a__y'],
        state: stateWith(['mcp:a']),
      }),
    )

    const group = groupOf(snapshot.groups, 'a')
    expect(group.disabled).toBe(true)
    expect(group.disabledCount).toBe(group.toolCount)
    expect(snapshot.state.disabled).toEqual(['mcp:a'])
    expect(toolOf(group, 'mcp__a__x').disabled).toBe(true)
    expect(toolOf(group, 'mcp__a__y').disabled).toBe(true)
  })

  it('skill 整档关闭：组地址 tool:skill 命中，组标记为已关', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ catalog: ['skill'], scoped: ['skill'], state: stateWith(['skill']) }),
    )

    const group = groupOf(snapshot.groups, 'skill')
    expect(group.address).toBe('tool:skill')
    expect(group.disabled).toBe(true)
    // 口语别名在关闭集里归一为规范形。
    expect(snapshot.state.disabled).toEqual(['tool:skill'])
  })

  it('被其它作用域隐藏的名字进 hiddenByOthers，且对应条目 shadowed:true', () => {
    // mcp__a__x 在全局层注册过，但本 agent 视角看不到（被别的作用域掩掉，如 project-mcp
    // 的工作区隔离），且不在本插件的 carried 里；本插件不能把它「开回来」，面板据此置灰。
    const snapshot = buildPanelSnapshot(
      inputs({
        catalog: ['mcp__a__x', 'mcp__a__y', 'bash'],
        scoped: ['mcp__a__y', 'bash'],
      }),
    )

    expect(snapshot.hiddenByOthers).toEqual(['mcp__a__x'])
    expect(toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__x').shadowed).toBe(true)
    expect(toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__y').shadowed).toBe(false)
    expect(toolOf(groupOf(snapshot.groups, 'builtin'), 'bash').shadowed).toBe(false)
    // 只从 catalog 取差集：只在 scoped 里出现的名字不算「被隐藏」。
    expect(snapshot.hiddenByOthers).not.toContain('mcp__a__y')
    expect(snapshot.stats.shadowed).toBe(1)
  })

  it('shadowed 口径（R18）：本插件已生效掩码不算「被其他作用域隐藏」', () => {
    // 真实读数：关掉 mcp:a::x 之后本插件的掩码生效 → x 从 scoped 消失，同时 x 出现在
    // carried（= layer.snapshot().deny）里。它必须被排除，否则该条目同时 disabled + shadowed，
    // 而面板对 shadowed 行禁用开关 → 用户打不开自己关掉的工具（R18 修正理由）。
    const snapshot = buildPanelSnapshot(
      inputs({
        catalog: ['mcp__a__x'],
        scoped: [],
        carried: ['mcp__a__x'],
        state: stateWith(['mcp:a::x']),
      }),
    )

    const tool = toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__x')
    expect(tool.disabled).toBe(true)
    expect(tool.shadowed).toBe(false)
    expect(snapshot.hiddenByOthers).toEqual([])
    expect(snapshot.stats.shadowed).toBe(0)
  })

  it('shadowed 口径（R18）：真被别处掩掉（不在 carried 里）的名字仍然计入', () => {
    // x 由本插件掩掉（在 carried 里）→ 排除；y 在全局层注册、本视角看不到且不在 carried 里
    // → 真·被其他作用域隐藏，仍然计入。
    const snapshot = buildPanelSnapshot(
      inputs({
        catalog: ['mcp__a__x', 'mcp__a__y'],
        scoped: [],
        carried: ['mcp__a__x'],
      }),
    )

    expect(snapshot.hiddenByOthers).toEqual(['mcp__a__y'])
    expect(toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__x').shadowed).toBe(false)
    expect(toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__y').shadowed).toBe(true)
    expect(snapshot.stats.shadowed).toBe(1)
  })
})

describe('buildPanelSnapshot：stats 四计数', () => {
  it('visible / catalog / denied / shadowed 各按自己的口径计数', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        // 全局层 4 个；本视角 2 个；carried 把 y 带进候选；z 被别的作用域隐藏（不在 carried 里）。
        catalog: ['mcp__a__x', 'mcp__a__y', 'mcp__a__z', 'workflow'],
        scoped: ['mcp__a__x', 'workflow'],
        carried: ['mcp__a__y'],
        state: stateWith(['tool:workflow']),
      }),
    )

    expect(snapshot.stats).toEqual({
      visible: 2,
      catalog: 4,
      denied: 1,
      shadowed: 1,
    })
    // 候选清单不因 scoped 缩水而丢条目：y / z 仍在 a 组里；只有 z（非本插件掩掉）标 shadowed。
    expect(groupOf(snapshot.groups, 'a').tools.map((tool) => tool.name)).toEqual([
      'mcp__a__x',
      'mcp__a__y',
      'mcp__a__z',
    ])
    expect(toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__y').shadowed).toBe(false)
    expect(toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__z').shadowed).toBe(true)
  })

  it('重复读数只算一次（catalog / scoped 去重）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        catalog: ['mcp__a__x', 'mcp__a__x'],
        scoped: ['mcp__a__x', 'mcp__a__x'],
      }),
    )

    expect(snapshot.stats.catalog).toBe(1)
    expect(snapshot.stats.visible).toBe(1)
    expect(groupOf(snapshot.groups, 'a').toolCount).toBe(1)
  })
})

describe('buildPanelSnapshot：关闭集视图与两态区分', () => {
  it('关闭集归一为规范形并按文本排序（别名与非规范形都在这里收口）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        catalog: ['mcp__a__x', 'skill'],
        scoped: ['mcp__a__x', 'skill'],
        state: stateWith(['skill', 'mcp:a::*']),
      }),
    )

    // `skill` → `tool:skill`；`mcp:a::*` 是「关整组」的另一种拼写 → `mcp:a`。
    expect(snapshot.state.disabled).toEqual(['mcp:a', 'tool:skill'])
    expect(snapshot.intentOnly).toEqual([])
    expect(groupOf(snapshot.groups, 'a').disabled).toBe(true)
    expect(groupOf(snapshot.groups, 'skill').disabled).toBe(true)
  })

  it('intentOnly：关闭集里命中 0 个注册名的地址单独列出（意图已记录、暂无匹配）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ catalog: ['mcp__a__x'], scoped: ['mcp__a__x'], state: stateWith(['mcp:zzz']) }),
    )

    expect(snapshot.state.disabled).toEqual(['mcp:zzz'])
    expect(snapshot.intentOnly).toEqual(['mcp:zzz'])
    expect(snapshot.stats.denied).toBe(0)
    expect(groupOf(snapshot.groups, 'a').disabled).toBe(false)
  })

  it('状态视图原样带出快照 / seeded / updatedAt / storeKind', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        storeKind: 'memory',
        state: { ...stateWith(['mcp:a']), snapshot: ['mcp:a'], seeded: true },
      }),
    )

    expect(snapshot.state).toEqual({
      disabled: ['mcp:a'],
      snapshot: ['mcp:a'],
      seeded: true,
      updatedAt: 42,
      storeKind: 'memory',
    })
  })

  it('默认档视图逐字段映射（版本 / 条目 / 路径 / 可读 / 损坏）', () => {
    const defaults: DefaultsFile = { version: 1, disabled: ['mcp:a', 'tool:workflow'] }
    const snapshot = buildPanelSnapshot(
      inputs({
        defaults,
        defaultsPath: '/tmp/defaults.json',
        defaultsReadable: false,
        defaultsCorrupt: true,
      }),
    )

    expect(snapshot.defaults).toEqual({
      version: 1,
      disabled: ['mcp:a', 'tool:workflow'],
      path: '/tmp/defaults.json',
      readable: false,
      corrupt: true,
    })
    // 会话标识与创建时间直接透传（面板用它们讲「快照来源」）。
    expect(snapshot.sessionId).toBe('session-1')
    expect(snapshot.createdAt).toBe(1_700_000_000_000)
  })
})

describe('buildPanelSnapshot：notices', () => {
  it('入参提示码 ∪ 由 storeKind / defaultsCorrupt 推导的码，去重后按固定顺序', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        storeKind: 'memory',
        defaultsCorrupt: true,
        // 入参顺序刻意打乱且有重复：输出顺序只由固定顺序决定。
        notices: ['session-subagent', 'persistence-degraded', 'session-subagent'],
      }),
    )

    expect(snapshot.notices).toEqual([
      'persistence-degraded',
      'defaults-corrupt',
      'session-subagent',
    ])
  })

  it('record 通道且默认档正常时没有提示码', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ storeKind: 'record', defaultsCorrupt: false, notices: [] }),
    )
    expect(snapshot.notices).toEqual([])
  })

  it('子代理会话的提示码只由入参带进来（构建器不猜会话来源）', () => {
    const snapshot = buildPanelSnapshot(inputs({ notices: ['session-subagent'] }))
    expect(snapshot.notices).toEqual(['session-subagent'])
  })
})

describe('buildPanelSnapshot：描述截断', () => {
  it('超长描述截断到 160 字符（不加省略号，与契约的 max(160) 同口径）', () => {
    const raw = '描'.repeat(DESCRIPTION_MAX_LENGTH + 40)
    const snapshot = buildPanelSnapshot(
      inputs({
        catalog: ['mcp__a__x'],
        descriptions: new Map([['mcp__a__x', raw]]),
      }),
    )

    const tool = toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__x')
    expect(tool.description).toHaveLength(DESCRIPTION_MAX_LENGTH)
    expect(tool.description).toBe(raw.slice(0, DESCRIPTION_MAX_LENGTH))
  })

  it('恰好 160 字符不截断；短描述原样保留', () => {
    const exact = 'a'.repeat(DESCRIPTION_MAX_LENGTH)
    const snapshot = buildPanelSnapshot(
      inputs({
        catalog: ['mcp__a__x', 'mcp__a__y'],
        descriptions: new Map([
          ['mcp__a__x', exact],
          ['mcp__a__y', '列项目'],
        ]),
      }),
    )

    const group = groupOf(snapshot.groups, 'a')
    expect(toolOf(group, 'mcp__a__x').description).toBe(exact)
    expect(toolOf(group, 'mcp__a__y').description).toBe('列项目')
  })

  it('截断点落在代理对中间时少取一个码元（不产出孤立代理项）', () => {
    // 159 个 ASCII + 一个 2 码元的 emoji：第 160 个码元是高位代理项 → 少取一个。
    const raw = `${'a'.repeat(DESCRIPTION_MAX_LENGTH - 1)}😀尾巴`
    const snapshot = buildPanelSnapshot(
      inputs({ catalog: ['workflow'], descriptions: new Map([['workflow', raw]]) }),
    )

    const description = toolOf(groupOf(snapshot.groups, 'builtin'), 'workflow').description
    expect(description).toBe('a'.repeat(DESCRIPTION_MAX_LENGTH - 1))
    // 末位不是高位代理项（159 个 ASCII + 少取的那个码元），所以逐码元与逐码点同长。
    expect(Array.from(description ?? '')).toHaveLength(DESCRIPTION_MAX_LENGTH - 1)
  })

  it('无描述 / 空描述的条目连 description 键都不出现', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        catalog: ['mcp__a__x', 'workflow'],
        descriptions: new Map([['mcp__a__x', '']]),
      }),
    )

    const mcpTool = toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__x')
    const builtinTool = toolOf(groupOf(snapshot.groups, 'builtin'), 'workflow')
    expect('description' in mcpTool).toBe(false)
    expect('description' in builtinTool).toBe(false)
  })
})

describe('buildPanelSnapshot：形状（附录 §2.2）', () => {
  it('快照逐字段对齐，且绝不携带 parameters', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        catalog: ['mcp__a__x', 'workflow'],
        scoped: ['mcp__a__x', 'workflow'],
        descriptions: new Map([['mcp__a__x', '列出项目']]),
      }),
    )

    // 顶层字段集固定（没有多的、没有少的）。
    expect(Object.keys(snapshot).sort()).toEqual([
      'createdAt',
      'defaults',
      'groups',
      'hiddenByOthers',
      'intentOnly',
      'notices',
      'protectedNames',
      'sessionId',
      'state',
      'stats',
    ])
    expect(Object.keys(snapshot.state).sort()).toEqual([
      'disabled',
      'seeded',
      'snapshot',
      'storeKind',
      'updatedAt',
    ])
    expect(Object.keys(snapshot.defaults).sort()).toEqual([
      'corrupt',
      'disabled',
      'path',
      'readable',
      'version',
    ])
    expect(Object.keys(snapshot.stats).sort()).toEqual([
      'catalog',
      'denied',
      'shadowed',
      'visible',
    ])

    // 工具条目：有描述时多一个 description，除此之外没有别的键（尤其没有 parameters）。
    const mcpTool = toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__x')
    expect(Object.keys(mcpTool).sort()).toEqual([
      'address',
      'description',
      'disabled',
      'name',
      'protected',
      'reserved',
      'shadowed',
      'shortName',
    ])
    const builtinTool = toolOf(groupOf(snapshot.groups, 'builtin'), 'workflow')
    expect(Object.keys(builtinTool).sort()).toEqual([
      'address',
      'disabled',
      'name',
      'protected',
      'reserved',
      'shadowed',
      'shortName',
    ])

    // 整份快照的序列化里不出现 parameters（工具入参描述只属于模型面，不进面板）。
    expect(JSON.stringify(snapshot)).not.toContain('parameters')
  })

  it('纯函数：不修改入参，同一输入两次调用深相等', () => {
    const catalog = ['mcp__a__x', 'workflow']
    const scoped = ['mcp__a__x']
    const disabled = ['mcp:a::x']
    const descriptions = new Map([['mcp__a__x', '列出项目']])
    const params = inputs({
      catalog,
      scoped,
      carried: ['mcp__a__y'],
      descriptions,
      state: stateWith(disabled),
    })

    const first = buildPanelSnapshot(params)
    const second = buildPanelSnapshot(params)

    expect(first).toEqual(second)
    // 入参原样（数组内容、描述 Map、状态都不被就地改写）。
    expect(catalog).toEqual(['mcp__a__x', 'workflow'])
    expect(scoped).toEqual(['mcp__a__x'])
    expect(disabled).toEqual(['mcp:a::x'])
    expect(descriptions.size).toBe(1)
    // 返回的数组是新引用，调用方改快照不会回写到状态；两次调用之间也不共享数组。
    expect(first.state.disabled).not.toBe(params.state.disabled)
    expect(first.state.snapshot).not.toBe(params.state.snapshot)
    expect(first.protectedNames).not.toBe(params.protectedNames)
    expect(second.state.snapshot).not.toBe(first.state.snapshot)
    expect(second.hiddenByOthers).not.toBe(first.hiddenByOthers)
  })
})
