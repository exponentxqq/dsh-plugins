/**
 * 面板快照构建器测试（规范：dsh-session-tool-toggle —— 面板与 `/tools` 共用同一份读数）。
 *
 * 主线按附录 §2.5 的推导顺序（**会话口径**）：两读并集（`scoped ∪ carried`）→ 分组
 * （首个 `__` 切分）→ 三个条目标记（`disabled` / `protected` / `reserved`）→ `stats`
 * 两计数 → `intentOnly` / `notices`。另加：
 *
 * - **形状**：字段名、嵌套与可选性与附录 §2.2 逐字段对齐；**绝不**出现 `parameters`，
 *   顶层**没有** `hiddenByOthers`、工具条目**没有** `shadowed`（宿主全局层不参与任何推导；
 *   技能行的 `shadowed` 是另一回事，见下）；
 * - **描述**：只取首 160 字符，短描述原样，无描述时连键都不出现（技能行的描述字段恒存在，
 *   无来源时是空串）；
 * - **纯函数**：入参不被修改，同一输入两次调用结果深相等；
 * - **空输入**：空两读 / 空关闭集不抛错，得到一份全空快照；
 * - **技能行与工作区视图**（H6）：顶层 `skills` / `workspace`，技能行的 `disabled`（意图）
 *   与 `shadowed`（实际生效）两态，以及关闭集的**全地址归一**与 `intentOnly` 三分。
 * - **默认档宇宙**（TS17，`buildDefaultsUniverse`）：分组桶（mcp / skill / builtin）与组顺序、
 *   carried-only 行（无描述）、`protected` / `reserved` 标记、描述截断 160、`layerReady:false`
 *   的三键空宇宙、`skills.visible ∪ shadowed` 的技能行，以及「`skill` 不在候选里就没有技能组」。
 *   宇宙与面板同源同判据，但**目标无关**：用户级档与工作区档共用这一份，所以它不带任何档的
 *   关闭集（条目没有 `disabled`）。
 *
 * 两个刻意记录在案的口径（不是断言笔误）：
 *
 * 1. 候选只由**两读**推出：`scoped` 是本会话该 agent 视角当前可见的名字，也是「可关对象」
 *    的唯一来源；`carried` 是本插件上一轮已生效的掩码（`layer.snapshot().deny`），只做
 *    **保底**——让已关条目不因第二读缩小而从清单里消失，否则用户再也点不开自己关掉的工具。
 *    宿主全局层（其它工作区 / 其它 agent 注册的名字）不参与任何推导，因此不存在「在别处
 *    注册、在本会话被隐藏」的行，也就没有 `hiddenByOthers` 与工具条目的 `shadowed`；
 *    `stats` 只有 `visible`（= 候选 − deny）与 `denied` 两计数。
 * 2. `mcp__a__b__c` 按**首个** `__` 归 serverName `a`（§6.1 A12 的已知歧义：与 server
 *    `a__b` + suffix `c` 的拆法不可区分）。歧义只影响展示分组，开关地址匹配不看分组。
 *
 * 技能行与工具分组互补：`groups` 里的 `skill` 整档行保持不变，逐技能行只在顶层 `skills`。
 * `skills.visible` 只给模型可调用技能，`skills.shadowed` 只给名字——因此「已关且已遮蔽」的
 * 行没有描述来源，`description` 是空串（契约允许，注释 §3.6.4 写的就是这条）。
 */
import { describe, expect, it } from 'vitest'
import type { DefaultsEntry, DefaultsGroup } from '../src/contract.ts'
import { buildDefaultsUniverse, buildPanelSnapshot, DESCRIPTION_MAX_LENGTH } from '../src/host/panel.ts'
import type { DefaultsUniverseInputs, ToolEntry, ToolGroup } from '../src/host/panel.ts'
import type {
  DefaultsFile,
  PanelInputs,
  SessionToolState,
  SkillLayerSnapshot,
  WorkspacePanelInputs,
} from '../src/host/types.ts'

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
 * 构造技能分面读数：默认是「服务可用、没有技能」，用例只写它关心的字段。
 * @param partial - 要覆盖的字段。
 * @returns 技能分面读数。
 */
function skillsOf(partial: Partial<SkillLayerSnapshot> = {}): SkillLayerSnapshot {
  return { available: true, shadowed: [], visible: [], ...partial }
}

/** 工作区归属夹具：已登记、带标题（覆盖 `title` 的映射）。 */
const ATTRIBUTION: NonNullable<WorkspacePanelInputs['attribution']> = {
  key: '/home/user/project',
  registered: true,
  title: 'dsh-plugins',
}

/**
 * 构造工作区档读数：默认可归属、空关闭集。
 * @param partial - 要覆盖的字段。
 * @returns 工作区档读数。
 */
function workspaceOf(partial: Partial<WorkspacePanelInputs> = {}): WorkspacePanelInputs {
  return {
    attribution: ATTRIBUTION,
    disabled: [],
    path: '/home/user/.dsh/session-tool-toggle/workspaces.json',
    readable: true,
    corrupt: false,
    ...partial,
  }
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
    const snapshot = buildPanelSnapshot(inputs({ scoped: ['mcp__a__x'] }))

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
    const snapshot = buildPanelSnapshot(inputs({ scoped: ['mcp__a__b__c'] }))

    const group = groupOf(snapshot.groups, 'a')
    expect(group.tools).toHaveLength(1)
    const tool = toolOf(group, 'mcp__a__b__c')
    expect(tool.shortName).toBe('b__c')
    expect(tool.address).toBe('mcp:a::b__c')
  })

  it('serverName 以单下划线开头也按首个 __ 切分（mcp__a_b__x → a_b 组）', () => {
    const snapshot = buildPanelSnapshot(inputs({ scoped: ['mcp__a_b__x'] }))
    expect(groupOf(snapshot.groups, 'a_b').address).toBe('mcp:a_b')
  })

  it('多个服务器按名升序、组内工具按注册名升序（输出与入参顺序无关）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ scoped: ['mcp__b__z', 'mcp__a__y', 'mcp__a__x'] }),
    )
    expect(snapshot.groups.map((group) => group.key)).toEqual(['a', 'b'])
    expect(groupOf(snapshot.groups, 'a').tools.map((tool) => tool.name)).toEqual([
      'mcp__a__x',
      'mcp__a__y',
    ])
  })

  it('非 MCP 名字分入 skill 与 builtin 两组，且排在 MCP 组之后', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ scoped: ['task_board_create', 'skill', 'mcp__a__x', 'bash'] }),
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

  it('两读并集：只在 carried 里出现过的名字也进清单（防止掩码后清单缩水）', () => {
    // 上一轮已被本插件掩掉的名字：scoped 读不到它，只有 carried 带着。会话口径下 carried
    // 不是「可关对象」的新来源，而是保底——让用户还能把自己关掉的工具从清单里打开。
    const snapshot = buildPanelSnapshot(
      inputs({ carried: ['mcp__a__x'], state: stateWith(['mcp:a::x']) }),
    )

    const group = groupOf(snapshot.groups, 'a')
    expect(group.toolCount).toBe(1)
    expect(toolOf(group, 'mcp__a__x').shortName).toBe('x')
    // 已关条目标记照旧：被 deny 命中的候选仍是 disabled，不会因为只有 carried 就变成别的形态。
    expect(toolOf(group, 'mcp__a__x').disabled).toBe(true)
    // 候选只有 carried 里的一个名字、且被 deny 命中 → visible 0 / denied 1。
    expect(snapshot.stats).toEqual({ visible: 0, denied: 1 })
  })

  it('空输入（两读皆空 / 空关闭集）不抛错，得到全空快照', () => {
    const snapshot = buildPanelSnapshot(inputs())

    expect(snapshot.groups).toEqual([])
    expect(snapshot.intentOnly).toEqual([])
    expect(snapshot.notices).toEqual([])
    expect(snapshot.state.disabled).toEqual([])
    // 技能分面与工作区读数都没有输入 → 空视图（不是缺字段）。
    expect(snapshot.skills).toEqual([])
    expect(snapshot.workspace).toBeNull()
    // 会话口径没有「全局层」这一读：两读皆空时不存在任何候选名。
    expect(snapshot.stats).toEqual({ visible: 0, denied: 0 })
  })
})

describe('buildPanelSnapshot：三个条目标记', () => {
  it('run_code → reserved:true；普通内置工具与 MCP 工具恒 false', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ scoped: ['run_code', 'workflow', 'mcp__a__x'] }),
    )

    const builtin = groupOf(snapshot.groups, 'builtin')
    expect(toolOf(builtin, 'run_code').reserved).toBe(true)
    expect(toolOf(builtin, 'workflow').reserved).toBe(false)
    // MCP 条目按附录 §2.5 的字段表恒 reserved:false（public name 不可能是保留名）。
    expect(toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__x').reserved).toBe(false)
  })

  it('protected：命中生效保护名单即为 true（MCP 条目恒 false）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ scoped: ['bash', 'workflow', 'mcp__a__bash'], protectedNames: ['bash', 'read'] }),
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
    // 掩码会让它从 scoped 消失，但 `carried` 会把它带回来（见「两读并集」用例）。
    const snapshot = buildPanelSnapshot(
      inputs({
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
      inputs({ scoped: ['skill'], state: stateWith(['skill']) }),
    )

    const group = groupOf(snapshot.groups, 'skill')
    expect(group.address).toBe('tool:skill')
    expect(group.disabled).toBe(true)
    // 口语别名在关闭集里归一为规范形。
    expect(snapshot.state.disabled).toEqual(['tool:skill'])
  })
})

describe('buildPanelSnapshot：stats 两计数', () => {
  it('visible / denied 各按自己的口径计数（visible = 候选 − deny）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        // 候选 = 两读并集：x / workflow 来自 scoped，y 由 carried 保底。
        scoped: ['mcp__a__x', 'workflow'],
        carried: ['mcp__a__y'],
        state: stateWith(['tool:workflow']),
      }),
    )

    // 候选 3 个、deny 1 个 → visible 2 / denied 1。
    expect(snapshot.stats).toEqual({ visible: 2, denied: 1 })
    // 候选清单不因 scoped 缩水而丢条目：carried 里的 y 仍在 a 组里。
    expect(groupOf(snapshot.groups, 'a').tools.map((tool) => tool.name)).toEqual([
      'mcp__a__x',
      'mcp__a__y',
    ])
    expect(toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__y').disabled).toBe(false)
  })

  it('重复读数只算一次（scoped / carried 去重）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ scoped: ['mcp__a__x', 'mcp__a__x'], carried: ['mcp__a__x'] }),
    )

    expect(snapshot.stats).toEqual({ visible: 1, denied: 0 })
    expect(groupOf(snapshot.groups, 'a').toolCount).toBe(1)
  })
})

describe('buildPanelSnapshot：G4 会话口径（隐藏组 / carried 保底 / 会话外工具 / 形状）', () => {
  it('会话里没有的服务器整组不出现（不存在「被其他作用域隐藏」的组）', () => {
    const snapshot = buildPanelSnapshot(inputs({ scoped: ['mcp__b__y'], carried: [] }))

    expect(snapshot.groups.map((group) => group.key)).toEqual(['b'])
  })

  it('carried 保底：第二读缩小时已关条目仍在清单里（visible 0 / denied 1）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ scoped: [], carried: ['mcp__a__x'], state: stateWith(['mcp:a']) }),
    )

    const group = groupOf(snapshot.groups, 'a')
    expect(toolOf(group, 'mcp__a__x').disabled).toBe(true)
    expect(snapshot.stats).toEqual({ visible: 0, denied: 1 })
  })

  it('关闭会话外工具：不产生条目，只记意图（intentOnly）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ scoped: ['bash'], state: stateWith(['mcp:dbx']) }),
    )

    expect(snapshot.groups.map((group) => group.key)).toEqual(['builtin'])
    expect(snapshot.intentOnly).toEqual(['mcp:dbx'])
  })

  it('形状：顶层键无 hiddenByOthers、stats 只有两键、工具条目无 shadowed', () => {
    const snapshot = buildPanelSnapshot(inputs({ scoped: ['mcp__a__x', 'bash'] }))

    expect(Object.keys(snapshot)).not.toContain('hiddenByOthers')
    expect(Object.keys(snapshot.stats).sort()).toEqual(['denied', 'visible'])
    const tool = toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__x')
    expect(Object.keys(tool)).not.toContain('shadowed')
  })
})

describe('buildPanelSnapshot：关闭集视图与两态区分', () => {
  it('关闭集归一为规范形并按文本排序（别名与非规范形都在这里收口）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
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
      inputs({ scoped: ['mcp__a__x'], state: stateWith(['mcp:zzz']) }),
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

describe('buildPanelSnapshot：技能行（skills）', () => {
  it('G6 出口断言：已关技能行同时带 disabled 与 shadowed，关闭集含 skill:<name>', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        scoped: ['skill'],
        state: stateWith(['skill:openspec-propose', 'skill:ghost']),
        skills: skillsOf({ shadowed: ['openspec-propose'] }),
      }),
    )

    // 已关且已注册影子 stub：disabled（意图）+ shadowed（实际生效）同时为 true。
    // `shadowed` 只给名字、没有描述来源 → description 是空串（契约允许，已关且无缓存）。
    expect(snapshot.skills).toEqual([
      { name: 'openspec-propose', description: '', disabled: true, shadowed: true },
    ])
    expect(snapshot.intentOnly).toEqual(['skill:ghost'])
    expect(snapshot.state.disabled).toContain('skill:openspec-propose')
    // 技能行必须同时带两个事实字段（客户端据此区分「已关但没生效」与「已生效」）。
    expect(snapshot.skills[0]).toHaveProperty('disabled', true)
    expect(snapshot.skills[0]).toHaveProperty('shadowed', true)
  })

  it('技能行 = 模型可调用 ∪ 已遮蔽名字：按名字升序、同名字只出一行', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        skills: skillsOf({
          visible: [
            { name: 'openspec-apply', description: '按任务清单实施变更' },
            { name: 'openspec-propose', description: '起草变更提案' },
          ],
          shadowed: ['openspec-propose', 'zebra-skill'],
        }),
      }),
    )

    expect(snapshot.skills).toEqual([
      { name: 'openspec-apply', description: '按任务清单实施变更', disabled: false, shadowed: false },
      // 同名的 visible 行与 shadowed 名字只出一行；描述取 visible（唯一有描述的来源）。
      { name: 'openspec-propose', description: '起草变更提案', disabled: false, shadowed: true },
      { name: 'zebra-skill', description: '', disabled: false, shadowed: true },
    ])
  })

  it('disabled 是意图、shadowed 是实际生效：已关但仍在 visible 里 → shadowed:false（stub 未胜出）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        state: stateWith(['skill:openspec-propose']),
        skills: skillsOf({
          visible: [{ name: 'openspec-propose', description: '起草变更提案' }],
        }),
      }),
    )

    // 技能已关（意图在），但影子 stub 没胜出：它仍在模型可调用清单里。
    expect(snapshot.skills).toEqual([
      { name: 'openspec-propose', description: '起草变更提案', disabled: true, shadowed: false },
    ])
    // 已安装（在 visible 里）不算「无安装」，因此不进 intentOnly。
    expect(snapshot.intentOnly).toEqual([])
  })

  it('描述按 160 字符截断；空描述的 visible 行给空串（字段恒存在）', () => {
    const raw = '技'.repeat(DESCRIPTION_MAX_LENGTH + 20)
    const snapshot = buildPanelSnapshot(
      inputs({
        skills: skillsOf({
          visible: [
            { name: 'long-skill', description: raw },
            { name: 'empty-skill', description: '' },
          ],
        }),
      }),
    )

    expect(snapshot.skills[0]?.name).toBe('empty-skill')
    expect(snapshot.skills[0]?.description).toBe('')
    expect(snapshot.skills[1]?.description).toHaveLength(DESCRIPTION_MAX_LENGTH)
    expect(snapshot.skills[1]?.description).toBe(raw.slice(0, DESCRIPTION_MAX_LENGTH))
    // 技能行的字段集固定：没有 parameters，description 恒存在（可以是空串）。
    expect(Object.keys(snapshot.skills[0] ?? {}).sort()).toEqual([
      'description',
      'disabled',
      'name',
      'shadowed',
    ])
  })

  it('skills 缺席 → 空技能视图，技能关闭项只记意图（intentOnly）', () => {
    const snapshot = buildPanelSnapshot(inputs({ state: stateWith(['skill:openspec-propose']) }))

    expect(snapshot.skills).toEqual([])
    // 没有技能分面读数就没有「已安装」证据 → 技能地址一律是纯意图。
    expect(snapshot.intentOnly).toEqual(['skill:openspec-propose'])
  })

  it('available:false → 空技能视图（整块降级），技能关闭项只记意图', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        state: stateWith(['skill:openspec-propose']),
        skills: skillsOf({
          available: false,
          shadowed: ['openspec-propose'],
          visible: [{ name: 'openspec-apply', description: '实施变更' }],
        }),
      }),
    )

    expect(snapshot.skills).toEqual([])
    expect(snapshot.intentOnly).toEqual(['skill:openspec-propose'])
  })
})

describe('buildPanelSnapshot：关闭集全地址归一与 intentOnly 三分', () => {
  it('全地址归一：技能地址保留在 state.disabled（旧实现只取 planMask.matched 键会整个丢掉）', () => {
    const snapshot = buildPanelSnapshot(inputs({ state: stateWith(['skill:openspec-propose']) }))

    expect(snapshot.state.disabled).toEqual(['skill:openspec-propose'])
    // 技能地址不参与工具掩码：deny 不变，也不进工具分组。
    expect(snapshot.stats.denied).toBe(0)
    expect(snapshot.groups).toEqual([])
    // 旧口径下 planMask.matched 里根本没有这个键，state.disabled 会是空数组。
    expect(snapshot.state.disabled).toContain('skill:openspec-propose')
  })

  it('归一：skill / skill:* → tool:skill；skill:<name> 保留；非法条目静默丢弃', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        state: stateWith([
          'skill',
          'skill:*',
          'skill:openspec-propose',
          'skill:Foo',
          'tool:bash',
          '',
        ]),
      }),
    )

    // `skill` 与 `skill:*` 是整档别名的两种拼写，归一到 tool:skill；大写技能名、保护基线、
    // 空串都不可解析 → 丢弃。排序按 UTF-16 码元（skill:… < tool:…）。
    expect(snapshot.state.disabled).toEqual(['skill:openspec-propose', 'tool:skill'])
  })

  it('intentOnly 三分：工具地址 0 命中 ∪ 技能地址无安装，合并后排序', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        state: stateWith(['mcp:zzz', 'skill:ghost', 'skill:openspec-propose']),
        skills: skillsOf({
          visible: [{ name: 'openspec-propose', description: '起草变更提案' }],
        }),
      }),
    )

    expect(snapshot.state.disabled).toEqual(['mcp:zzz', 'skill:ghost', 'skill:openspec-propose'])
    // mcp:zzz 命中 0；skill:ghost 无安装；openspec-propose 已安装 → 不在 intentOnly。
    expect(snapshot.intentOnly).toEqual(['mcp:zzz', 'skill:ghost'])
    // 工具地址 0 命中只影响 intentOnly，不产生工具 deny。
    expect(snapshot.stats.denied).toBe(0)
  })

  it('已注册影子 stub 的技能名算「已安装」，不进 intentOnly', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        state: stateWith(['skill:openspec-propose']),
        skills: skillsOf({ shadowed: ['openspec-propose'] }),
      }),
    )

    expect(snapshot.intentOnly).toEqual([])
  })

  it('不可解析条目全部丢弃后关闭集为空（不抛错）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({ state: stateWith(['', 'skill:Foo', 'tool:bash']) }),
    )
    expect(snapshot.state.disabled).toEqual([])
    expect(snapshot.intentOnly).toEqual([])
  })
})

describe('buildPanelSnapshot：工作区视图（workspace）', () => {
  it('workspace 输入缺席 / attribution 缺席 → null（fail-closed，只展示用户级默认档）', () => {
    expect(buildPanelSnapshot(inputs()).workspace).toBeNull()
    expect(buildPanelSnapshot(inputs({ workspace: workspaceOf() })).workspace).not.toBeNull()
    // cwd 无法归属：即使有工作区档读数，也不凭空造一个工作区键。
    expect(
      buildPanelSnapshot(inputs({ workspace: workspaceOf({ attribution: undefined }) })).workspace,
    ).toBeNull()
  })

  it('工作区视图逐字段映射（title / registered / disabled 排序去重 / path / readable / corrupt）', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        workspace: workspaceOf({
          disabled: ['skill:zebra', 'mcp:a', 'skill:zebra'],
          path: '/tmp/workspaces.json',
          readable: false,
          corrupt: true,
        }),
      }),
    )

    expect(snapshot.workspace).toEqual({
      key: '/home/user/project',
      title: 'dsh-plugins',
      registered: true,
      disabled: ['mcp:a', 'skill:zebra'],
      path: '/tmp/workspaces.json',
      readable: false,
      corrupt: true,
    })
  })

  it('未登记工作区没有 title 键；registered:false 原样带出', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        workspace: workspaceOf({
          attribution: { key: '/home/user/scratch', registered: false },
        }),
      }),
    )

    expect(snapshot.workspace).toEqual({
      key: '/home/user/scratch',
      registered: false,
      disabled: [],
      path: '/home/user/.dsh/session-tool-toggle/workspaces.json',
      readable: true,
      corrupt: false,
    })
    expect(snapshot.workspace !== null && 'title' in snapshot.workspace).toBe(false)
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

  it('新增两码（skills-unavailable / skill-shadow-failed）按固定顺序排在既有三码之后', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        // 入参顺序与枚举顺序相反：输出顺序只由 NOTICE_ORDER 决定。
        notices: [
          'skill-shadow-failed',
          'skills-unavailable',
          'session-subagent',
          'defaults-corrupt',
          'persistence-degraded',
        ],
      }),
    )

    expect(snapshot.notices).toEqual([
      'persistence-degraded',
      'defaults-corrupt',
      'session-subagent',
      'skills-unavailable',
      'skill-shadow-failed',
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
        scoped: ['mcp__a__x'],
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
        scoped: ['mcp__a__x', 'mcp__a__y'],
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
      inputs({ scoped: ['workflow'], descriptions: new Map([['workflow', raw]]) }),
    )

    const description = toolOf(groupOf(snapshot.groups, 'builtin'), 'workflow').description
    expect(description).toBe('a'.repeat(DESCRIPTION_MAX_LENGTH - 1))
    // 末位不是高位代理项（159 个 ASCII + 少取的那个码元），所以逐码元与逐码点同长。
    expect(Array.from(description ?? '')).toHaveLength(DESCRIPTION_MAX_LENGTH - 1)
  })

  it('无描述 / 空描述的条目连 description 键都不出现', () => {
    const snapshot = buildPanelSnapshot(
      inputs({
        scoped: ['mcp__a__x', 'workflow'],
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
        scoped: ['mcp__a__x', 'workflow'],
        descriptions: new Map([['mcp__a__x', '列出项目']]),
        skills: skillsOf({ visible: [{ name: 'openspec-propose', description: '起草变更提案' }] }),
        workspace: workspaceOf({ disabled: ['mcp:a'] }),
      }),
    )

    // 顶层字段集固定（没有多的、没有少的）；会话口径下没有 hiddenByOthers。
    expect(Object.keys(snapshot).sort()).toEqual([
      'createdAt',
      'defaults',
      'groups',
      'intentOnly',
      'notices',
      'protectedNames',
      'sessionId',
      'skills',
      'state',
      'stats',
      'workspace',
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
    expect(Object.keys(snapshot.stats).sort()).toEqual(['denied', 'visible'])

    // 工具条目：有描述时多一个 description，除此之外没有别的键（没有 parameters，也没有
    // 会话口径下不存在的 shadowed）。
    const mcpTool = toolOf(groupOf(snapshot.groups, 'a'), 'mcp__a__x')
    expect(Object.keys(mcpTool).sort()).toEqual([
      'address',
      'description',
      'disabled',
      'name',
      'protected',
      'reserved',
      'shortName',
    ])
    const builtinTool = toolOf(groupOf(snapshot.groups, 'builtin'), 'workflow')
    expect(Object.keys(builtinTool).sort()).toEqual([
      'address',
      'disabled',
      'name',
      'protected',
      'reserved',
      'shortName',
    ])

    // 整份快照的序列化里不出现 parameters（工具入参描述只属于模型面，不进面板）。
    expect(JSON.stringify(snapshot)).not.toContain('parameters')

    // 技能行：四个字段全在，没有 parameters。
    expect(Object.keys(snapshot.skills[0] ?? {}).sort()).toEqual([
      'description',
      'disabled',
      'name',
      'shadowed',
    ])
    // 工作区视图：字段集固定，title 是唯一可选键。
    expect(Object.keys(snapshot.workspace ?? {}).sort()).toEqual([
      'corrupt',
      'disabled',
      'key',
      'path',
      'readable',
      'registered',
      'title',
    ])
  })

  it('纯函数：不修改入参，同一输入两次调用深相等', () => {
    const scoped = ['mcp__a__x', 'workflow']
    const carried = ['mcp__a__y']
    const disabled = ['mcp:a::x']
    const descriptions = new Map([['mcp__a__x', '列出项目']])
    const visible = [{ name: 'openspec-propose', description: '起草变更提案' }]
    const shadowed = ['openspec-apply']
    const workspaceDisabled = ['mcp:a']
    const params = inputs({
      scoped,
      carried,
      descriptions,
      state: stateWith(disabled),
      skills: skillsOf({ visible, shadowed }),
      workspace: workspaceOf({ disabled: workspaceDisabled }),
    })

    const first = buildPanelSnapshot(params)
    const second = buildPanelSnapshot(params)

    expect(first).toEqual(second)
    // 入参原样（数组内容、描述 Map、状态都不被就地改写）。
    expect(scoped).toEqual(['mcp__a__x', 'workflow'])
    expect(carried).toEqual(['mcp__a__y'])
    expect(disabled).toEqual(['mcp:a::x'])
    expect(descriptions.size).toBe(1)
    expect(visible).toEqual([{ name: 'openspec-propose', description: '起草变更提案' }])
    expect(shadowed).toEqual(['openspec-apply'])
    expect(workspaceDisabled).toEqual(['mcp:a'])
    // 返回的数组是新引用，调用方改快照不会回写到状态；两次调用之间也不共享数组。
    expect(first.state.disabled).not.toBe(params.state.disabled)
    expect(first.state.snapshot).not.toBe(params.state.snapshot)
    expect(first.protectedNames).not.toBe(params.protectedNames)
    expect(first.skills).not.toBe(second.skills)
    expect(first.workspace?.disabled).not.toBe(workspaceDisabled)
    expect(second.state.snapshot).not.toBe(first.state.snapshot)
    expect(second.stats).not.toBe(first.stats)
  })
})

/* ────────────────── buildDefaultsUniverse（默认档分组界面的宇宙） ────────────────── */

/**
 * 构造宇宙入参：默认「层可用、无候选、无保护名单」，用例只写它关心的字段。
 * @param partial - 要覆盖的字段。
 * @returns 完整入参。
 */
function universeInputs(partial: Partial<DefaultsUniverseInputs> = {}): DefaultsUniverseInputs {
  return { layerReady: true, schemas: [], carried: [], protectedNames: new Set(), ...partial }
}

/**
 * 按分组键取宇宙分组；取不到直接失败。
 * @param groups - 宇宙的分组清单。
 * @param key - 分组键（MCP = serverName；skill = `skill`；builtin = `builtin`）。
 * @returns 该分组。
 */
function universeGroupOf(groups: readonly DefaultsGroup[], key: string): DefaultsGroup {
  const found = groups.find((group) => group.key === key)
  if (found === undefined) {
    throw new Error(`宇宙分组「${key}」不存在：${groups.map((item) => item.key).join('、')}`)
  }
  return found
}

/**
 * 按规范形地址取宇宙条目。
 * @param group - 宇宙分组。
 * @param address - 行地址（`mcp:<server>::<suffix>` / `skill:<name>` / `tool:<name>`）。
 * @returns 该条目。
 */
function universeEntryOf(group: DefaultsGroup, address: string): DefaultsEntry {
  const found = group.tools.find((entry) => entry.address === address)
  if (found === undefined) throw new Error(`条目「${address}」不在分组「${group.key}」里`)
  return found
}

describe('buildDefaultsUniverse：分组桶（mcp / skill / builtin）与组顺序', () => {
  it('MCP 组按 server 升序 → skill 组 → builtin 组；组地址与行地址各就各位', () => {
    const universe = buildDefaultsUniverse(
      universeInputs({
        schemas: [
          { name: 'mcp__b__z' },
          { name: 'mcp__a__x' },
          { name: 'skill' },
          { name: 'bash' },
        ],
        skills: skillsOf({ visible: [{ name: 'openspec-propose', description: '起草变更提案' }] }),
      }),
    )

    expect(universe.layerReady).toBe(true)
    expect(universe.skillsAvailable).toBe(true)
    // 组顺序写死：MCP（server 升序）→ 技能 → 内置工具。
    expect(universe.groups.map((group) => group.kind)).toEqual(['mcp', 'mcp', 'skill', 'builtin'])
    expect(universe.groups.map((group) => group.key)).toEqual(['a', 'b', 'skill', 'builtin'])
    expect(universe.groups.map((group) => group.address)).toEqual([
      'mcp:a',
      'mcp:b',
      'tool:skill',
      null,
    ])

    // 行地址是地址形态而不是注册名：`mcp:<server>::<suffix>` / `skill:<name>` / `tool:<name>`。
    expect(universeEntryOf(universeGroupOf(universe.groups, 'a'), 'mcp:a::x')).toMatchObject({
      address: 'mcp:a::x',
      shortName: 'x',
    })
    expect(universeEntryOf(universeGroupOf(universe.groups, 'b'), 'mcp:b::z').shortName).toBe('z')
    expect(
      universeEntryOf(universeGroupOf(universe.groups, 'skill'), 'skill:openspec-propose')
        .shortName,
    ).toBe('openspec-propose')
    expect(universeEntryOf(universeGroupOf(universe.groups, 'builtin'), 'tool:bash').shortName).toBe(
      'bash',
    )

    // 技能组是**整档开关**：组地址是 `tool:skill`，行地址是 `skill:<name>`（两者不是同一个地址）。
    expect(universeGroupOf(universe.groups, 'skill').address).toBe('tool:skill')
    // 内置工具组不可整组关 → 组地址为 null（界面不渲染组开关）。
    expect(universeGroupOf(universe.groups, 'builtin').address).toBeNull()
  })

  it('carried-only 的名字也成行，且没有 description 键（已关工具读不到 schema）', () => {
    const universe = buildDefaultsUniverse(
      universeInputs({
        schemas: [{ name: 'mcp__a__x', description: '列出目录' }],
        carried: ['mcp__a__y', 'workflow'],
      }),
    )

    // 只由 carried 带回来的名字：上一轮已关、scoped 读不到，由 carried 保底留在清单里。
    const mcpRow = universeEntryOf(universeGroupOf(universe.groups, 'a'), 'mcp:a::y')
    expect(mcpRow.shortName).toBe('y')
    expect('description' in mcpRow).toBe(false)
    // schemas 里有的行照常有描述（描述表只由 schema 读数给出）。
    expect(universeEntryOf(universeGroupOf(universe.groups, 'a'), 'mcp:a::x').description).toBe(
      '列出目录',
    )

    const builtinRow = universeEntryOf(universeGroupOf(universe.groups, 'builtin'), 'tool:workflow')
    expect(builtinRow.shortName).toBe('workflow')
    expect('description' in builtinRow).toBe(false)
  })

  it('skill 不在候选里时没有技能组（技能行不凭空造组）', () => {
    const universe = buildDefaultsUniverse(
      universeInputs({
        schemas: [{ name: 'bash' }],
        skills: skillsOf({ visible: [{ name: 'openspec-propose', description: '起草提案' }] }),
      }),
    )

    // 技能服务可用，但技能工具本身不在候选里 → 没有技能组，也就没有 `tool:skill` 组开关。
    expect(universe.skillsAvailable).toBe(true)
    expect(universe.groups.map((group) => group.kind)).toEqual(['builtin'])
    expect(universe.groups.some((group) => group.key === 'skill')).toBe(false)
  })
})

describe('buildDefaultsUniverse：条目标记与描述截断', () => {
  it('protected / reserved：bash 受保护、run_code 保留，MCP 行恒 false', () => {
    const universe = buildDefaultsUniverse(
      universeInputs({
        schemas: [{ name: 'bash' }, { name: 'run_code' }, { name: 'mcp__a__run_code' }],
        protectedNames: new Set(['bash']),
      }),
    )

    const builtin = universeGroupOf(universe.groups, 'builtin')
    expect(universeEntryOf(builtin, 'tool:bash')).toMatchObject({
      protected: true,
      reserved: false,
    })
    expect(universeEntryOf(builtin, 'tool:run_code')).toMatchObject({
      protected: false,
      reserved: true,
    })
    // MCP public name 恒不是保留名、也不会被保护名单命中（与 `toolEntryOf` 同一判据）。
    expect(
      universeEntryOf(universeGroupOf(universe.groups, 'a'), 'mcp:a::run_code'),
    ).toMatchObject({ protected: false, reserved: false })
  })

  it('描述截断到 160 字符；短描述原样；空描述连键都不出现', () => {
    const raw = '描'.repeat(DESCRIPTION_MAX_LENGTH + 1)
    const universe = buildDefaultsUniverse(
      universeInputs({
        schemas: [
          { name: 'bash', description: raw },
          { name: 'workflow', description: '' },
          { name: 'mcp__a__x', description: '列出项目' },
        ],
      }),
    )

    const builtin = universeGroupOf(universe.groups, 'builtin')
    const truncated = universeEntryOf(builtin, 'tool:bash').description
    expect(truncated).toHaveLength(DESCRIPTION_MAX_LENGTH)
    expect(truncated).toBe(raw.slice(0, DESCRIPTION_MAX_LENGTH))
    // 短描述原样；空串按「无描述」处理（client 不需要为空描述渲染 title）。
    expect(universeEntryOf(builtin, 'tool:workflow')).not.toHaveProperty('description')
    expect(universeEntryOf(builtin, 'tool:workflow').description).toBeUndefined()
    expect(universeEntryOf(universeGroupOf(universe.groups, 'a'), 'mcp:a::x').description).toBe(
      '列出项目',
    )
  })
})

describe('buildDefaultsUniverse：技能组', () => {
  it('技能行 = visible ∪ shadowed，按名字升序；描述只来自 visible', () => {
    const universe = buildDefaultsUniverse(
      universeInputs({
        schemas: [{ name: 'skill' }],
        // 故意乱序，且 shadowed 与 visible 有交集（alpha）：并集去重后仍按名字升序。
        skills: skillsOf({
          visible: [
            { name: 'zeta', description: '末位技能' },
            { name: 'alpha', description: '' },
          ],
          shadowed: ['beta', 'alpha'],
        }),
      }),
    )

    const skill = universeGroupOf(universe.groups, 'skill')
    expect(skill.address).toBe('tool:skill')
    expect(skill.tools.map((entry) => entry.address)).toEqual([
      'skill:alpha',
      'skill:beta',
      'skill:zeta',
    ])
    expect(skill.tools.map((entry) => entry.shortName)).toEqual(['alpha', 'beta', 'zeta'])
    // visible 的空描述按「无描述」处理；shadowed-only 行（beta）没有描述来源，键都不出现。
    expect(universeEntryOf(skill, 'skill:alpha')).not.toHaveProperty('description')
    expect(universeEntryOf(skill, 'skill:beta')).not.toHaveProperty('description')
    expect(universeEntryOf(skill, 'skill:zeta').description).toBe('末位技能')
    expect(universe.skillsAvailable).toBe(true)
  })

  it('available:false → skillsAvailable:false，技能组（含 tool:skill）仍在、行区为空', () => {
    const universe = buildDefaultsUniverse(
      universeInputs({
        schemas: [{ name: 'skill' }, { name: 'bash' }],
        // 服务不可用读数里即使带着旧技能行，也不能拿它们当可信的技能行。
        skills: skillsOf({
          available: false,
          visible: [{ name: 'openspec-propose', description: '起草提案' }],
        }),
      }),
    )

    expect(universe.skillsAvailable).toBe(false)
    expect(universe.groups.map((group) => group.key)).toEqual(['skill', 'builtin'])
    const skill = universeGroupOf(universe.groups, 'skill')
    // 组开关仍在（用户仍可整档关闭技能），只是行区空、界面出降级提示。
    expect(skill.address).toBe('tool:skill')
    expect(skill.tools).toEqual([])
  })
})

describe('buildDefaultsUniverse：层未就绪、纯函数与形状', () => {
  it('layerReady:false → 三键空宇宙（入参一律忽略，且是冻结常量）', () => {
    const universe = buildDefaultsUniverse(
      universeInputs({
        layerReady: false,
        schemas: [{ name: 'mcp__a__x' }, { name: 'skill' }],
        carried: ['bash'],
        skills: skillsOf({ visible: [{ name: 'openspec-propose', description: '起草提案' }] }),
        protectedNames: new Set(['bash']),
      }),
    )

    expect(universe).toEqual({ layerReady: false, skillsAvailable: false, groups: [] })
    expect(Object.keys(universe).sort()).toEqual(['groups', 'layerReady', 'skillsAvailable'])
    expect(Object.isFrozen(universe)).toBe(true)
    expect(Object.isFrozen(universe.groups)).toBe(true)
  })

  it('纯函数：不修改入参，同一输入两次调用深相等；输出与入参书写顺序无关', () => {
    const schemas = [
      { name: 'mcp__a__x', description: '列出目录' },
      { name: 'skill' },
      { name: 'bash' },
    ]
    const carried = ['mcp__a__y']
    const protectedNames = new Set(['bash'])
    const skills = skillsOf({
      visible: [{ name: 'zeta', description: '末位' }],
      shadowed: ['alpha'],
    })

    const first = buildDefaultsUniverse(universeInputs({ schemas, carried, protectedNames, skills }))
    const second = buildDefaultsUniverse(universeInputs({ schemas, carried, protectedNames, skills }))

    expect(first).toEqual(second)
    // 入参原样（数组内容、保护名单、技能读数都不被就地改写）。
    expect(schemas.map((schema) => schema.name)).toEqual(['mcp__a__x', 'skill', 'bash'])
    expect(carried).toEqual(['mcp__a__y'])
    expect([...protectedNames]).toEqual(['bash'])
    expect(skills.visible).toEqual([{ name: 'zeta', description: '末位' }])
    expect(skills.shadowed).toEqual(['alpha'])
    // 两次调用不共享可变数组。
    expect(first.groups).not.toBe(second.groups)
    expect(first.groups[0]?.tools).not.toBe(second.groups[0]?.tools)

    // 入参书写顺序不影响结果（组、组内行、技能行都按名字升序）。
    const reordered = buildDefaultsUniverse(
      universeInputs({
        schemas: [
          { name: 'bash' },
          { name: 'skill' },
          { name: 'mcp__a__x', description: '列出目录' },
        ],
        carried,
        protectedNames,
        skills,
      }),
    )
    expect(reordered).toEqual(first)
  })

  it('形状：宇宙三键 / 组四键 / 条目五键（没有 disabled，也不携带 parameters）', () => {
    const universe = buildDefaultsUniverse(
      universeInputs({
        schemas: [
          { name: 'mcp__a__x', description: '列出项目' },
          { name: 'skill' },
          { name: 'bash' },
        ],
        skills: skillsOf({ visible: [{ name: 'openspec-propose', description: '起草提案' }] }),
      }),
    )

    expect(Object.keys(universeGroupOf(universe.groups, 'a')).sort()).toEqual([
      'address',
      'key',
      'kind',
      'tools',
    ])
    // 有描述的行多一个 description，除此之外没有别的键（宇宙条目没有 disabled）。
    expect(
      Object.keys(universeEntryOf(universeGroupOf(universe.groups, 'a'), 'mcp:a::x')).sort(),
    ).toEqual(['address', 'description', 'protected', 'reserved', 'shortName'])
    expect(
      Object.keys(universeEntryOf(universeGroupOf(universe.groups, 'builtin'), 'tool:bash')).sort(),
    ).toEqual(['address', 'protected', 'reserved', 'shortName'])
    expect(JSON.stringify(universe)).not.toContain('parameters')
    // 宇宙条目没有 `disabled`：开关状态由目标档的关闭集求交，宇宙不带任何档的口径。
    expect(JSON.stringify(universe)).not.toContain('disabled')
  })
})
