/**
 * 工作区宇宙的纯构造与读数编排测试（`code-design.md` ③ 3.1 / 变更任务 1.3）。
 *
 * 覆盖七组口径：
 *
 * 1. MCP 归组表驱动（照搬 /inventory 的 `MCP_SERVER_PATTERN`，第一个 `__` 为边界）：
 *    `mcp__a__x` → 组 a、`mcp__a__b__c` → 组 a（suffix 保留 `b__c`）；
 * 2. `mcp__` 前缀但正则不命中（`mcp__a.b__x` / `mcp__x` / `mcp__x__`）→ 只计
 *    `ungroupedMcp`，不生成行、不进内置组；
 * 3. 技能行 `/inventory` 并集口径（`modelInvocable || userInvocable`）、按名称升序、
 *    行带 `modelInvocable/userInvocable/source` 三字段；
 * 4. `skills` 缺席 → `skillsAvailable:false` 且技能组只有组开关；`skillsComplete`
 *    仅在技能快照存在时透传；
 * 5. 条件展开：`ungroupedMcp` 仅在 `>0` 时出现在键里（`Object.keys` 断言）；
 * 6. 组形状与条目判据：组顺序写死（MCP server 升序 → 技能组 → 内置组）、内置组无组开关、
 *    `protected` / `reserved` / 描述截断与面板同源；`EMPTY_WORKSPACE_UNIVERSE` 冻结空宇宙；
 * 7. reader 失败矩阵（工具 / 技能服务缺席或抛错均降级、永不抛、日志按矩阵区分）；
 *    纯函数性质：同入参两次调用深相等、入参不被修改。
 *
 * 全部用最小字面量夹具驱动，不碰任何真实 IO。
 */
import { describe, expect, it } from 'vitest'
import type { DefaultsEntry, DefaultsUniverse } from '../src/contract.ts'
import type { SkillSummaryLike, SpecLog, VisibleToolSchema } from '../src/host/types.ts'
import {
  EMPTY_WORKSPACE_UNIVERSE,
  buildWorkspaceUniverse,
  createWorkspaceUniverseReader,
  type WorkspaceUniverseFacts,
  type WorkspaceUniverseHostAccess,
} from '../src/host/workspace-universe.ts'

/* ────────────────────────── 夹具 ────────────────────────── */

/**
 * 造一条工具 schema。
 * @param name - 工具注册名（`mcp__<server>__<suffix>` 或内置工具名）。
 * @param description - 描述原文（缺省 = 无描述）。
 * @returns 工具 schema 投影。
 */
function schema(name: string, description?: string): VisibleToolSchema {
  return description === undefined ? { name } : { name, description }
}

/**
 * 造一条技能快照条目。
 * @param name - kebab-case 技能名。
 * @param modelInvocable - 模型可经 `skill` 工具加载。
 * @param userInvocable - 用户可经 `/<name>` 手动调用。
 * @param source - 来源标记（缺省 = 快照未带来源）。
 * @returns 技能摘要。
 */
function skillSummary(
  name: string,
  modelInvocable: boolean,
  userInvocable: boolean,
  source?: string,
): SkillSummaryLike {
  return {
    name,
    description: `技能 ${name} 的一句话描述`,
    invocation: { modelInvocable, userInvocable },
    ...(source === undefined ? {} : { source }),
  }
}

/**
 * 造一份构造事实（缺省：无候选、无快照、空保护名单）。
 * @param overrides - 需要改写的字段。
 * @returns 工作区宇宙的构造事实。
 */
function facts(overrides: Partial<WorkspaceUniverseFacts> = {}): WorkspaceUniverseFacts {
  return { schemas: [], protectedNames: new Set<string>(), ...overrides }
}

/**
 * 造一个收集 warn 的诊断桩。
 * @returns 端口本身与收到的全部 warn 文案。
 */
function logSink(): { readonly log: SpecLog; readonly warnings: string[] } {
  const warnings: string[] = []
  return {
    warnings,
    log: {
      info: () => {},
      warn: (message) => {
        warnings.push(message)
      },
      error: () => {},
    },
  }
}

/**
 * 造一个装配层宿主面桩：`get` 从名字袋现取（缺 = undefined）。
 * @param parts - 两个服务槽（`tools` / `skills`），传 undefined 即「服务缺席」。
 * @param log - 诊断端口。
 * @param protectedNames - 生效保护名单（缺省为空）。
 * @returns reader 的宿主面。
 */
function readerAccess(
  parts: { readonly tools?: unknown; readonly skills?: unknown; readonly projectMcp?: unknown },
  log: SpecLog,
  protectedNames: ReadonlySet<string> = new Set<string>(),
): WorkspaceUniverseHostAccess {
  const services = new Map<string, unknown>([
    ['tools', parts.tools],
    ['skills', parts.skills],
    ['projectMcp', parts.projectMcp],
  ])
  return { get: (name) => services.get(name), protectedNames, log }
}

/** 全部短名扁平化：归组断言用（未归组名不得出现在任何行上）。 */
function allShortNames(universe: DefaultsUniverse): readonly string[] {
  return universe.groups.flatMap((group) => group.tools.map((entry: DefaultsEntry) => entry.shortName))
}

/* ────────────────────────── MCP 归组 ────────────────────────── */

describe('buildWorkspaceUniverse：MCP 归组（/inventory 同款正则）', () => {
  it.each([
    {
      label: '常规两段名：server a、suffix x',
      name: 'mcp__a__x',
      server: 'a',
      suffix: 'x',
    },
    {
      label: 'suffix 内含双下划线：server a、suffix 保留 b__c（第一个 __ 为边界）',
      name: 'mcp__a__b__c',
      server: 'a',
      suffix: 'b__c',
    },
  ])('$label', ({ name, server, suffix }) => {
    const universe = buildWorkspaceUniverse(facts({ schemas: [schema(name)] }))

    const mcpGroup = universe.groups.find((group) => group.kind === 'mcp')
    expect(mcpGroup?.key).toBe(server)
    expect(mcpGroup?.address).toBe(`mcp:${server}`)
    expect(mcpGroup?.tools).toEqual([
      { address: `mcp:${server}::${suffix}`, shortName: suffix, protected: false, reserved: false },
    ])
    // 候选全部合法归组：未归组计数不出现（条件展开）。
    expect(Object.keys(universe)).not.toContain('ungroupedMcp')
  })

  it.each([
    { label: 'server 段含点（不在 [A-Za-z0-9_-] 字符类）', name: 'mcp__a.b__x' },
    { label: '没有第二个 __ 边界', name: 'mcp__x' },
    { label: '__ 边界之后为空', name: 'mcp__x__' },
  ])('$label（%s）→ 只计未归组，不生成行、不进内置组', ({ name }) => {
    // 同屏放一个合法内置工具：证明未归组条目既不成行也不混进内置组。
    const universe = buildWorkspaceUniverse(facts({ schemas: [schema(name), schema('bash')] }))

    expect(universe.ungroupedMcp).toBe(1)
    expect(Object.keys(universe)).toContain('ungroupedMcp')
    // 只剩内置组；未归组名不得出现在任何组的任何行上。
    expect(universe.groups.map((group) => group.kind)).toEqual(['builtin'])
    expect(allShortNames(universe)).toEqual(['bash'])
    expect(allShortNames(universe)).not.toContain(name)
  })

  it('多个未归组条目累加计数，全部未归组时 groups 为空', () => {
    const universe = buildWorkspaceUniverse(
      facts({ schemas: ['mcp__a.b__x', 'mcp__x', 'mcp__x__'].map((name) => schema(name)) }),
    )
    expect(universe.ungroupedMcp).toBe(3)
    // 无合法 MCP、无技能、内置为空：三组都不出现（空组不出现）。
    expect(universe.groups).toEqual([])
    expect(universe.layerReady).toBe(true)
  })
})

/* ────────────────────────── 技能行 ────────────────────────── */

describe('buildWorkspaceUniverse：技能行（union 过滤 + 三字段）', () => {
  it('行取 modelInvocable || userInvocable 并集，按名称升序', () => {
    const universe = buildWorkspaceUniverse(
      facts({
        schemas: [schema('bash')],
        skills: [
          // 两种调用方式皆 false：本工作区用不到，不计入（与 /inventory 同口径）。
          skillSummary('delta', false, false),
          skillSummary('beta', false, true, 'user-dsh'),
          skillSummary('gamma', true, false, 'custom'),
          skillSummary('alpha', true, true, 'project-dsh'),
        ],
        skillsComplete: true,
      }),
    )

    const skillGroup = universe.groups.find((group) => group.kind === 'skill')
    expect(skillGroup?.tools.map((row) => row.shortName)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('行带 modelInvocable/userInvocable/source 三字段，地址为 skill:<name>', () => {
    const universe = buildWorkspaceUniverse(
      facts({
        schemas: [schema('bash')],
        skills: [skillSummary('alpha', true, false, 'project-dsh')],
        skillsComplete: true,
      }),
    )

    const row = universe.groups.find((group) => group.kind === 'skill')?.tools[0]
    expect(row).toMatchObject({
      address: 'skill:alpha',
      shortName: 'alpha',
      modelInvocable: true,
      userInvocable: false,
      source: 'project-dsh',
      protected: false,
      reserved: false,
    })
  })

  it('快照未带 source 的行不带 source 键（条件展开：键存在值 undefined 会被 wire strict 拒绝）', () => {
    const universe = buildWorkspaceUniverse(
      facts({
        schemas: [schema('bash')],
        skills: [skillSummary('gamma', true, false)],
      }),
    )

    const row = universe.groups.find((group) => group.kind === 'skill')?.tools[0]
    expect(row?.address).toBe('skill:gamma')
    expect('source' in (row as DefaultsEntry)).toBe(false)
  })

  it('skill 工具缺席但快照非空：技能组仍出现（A6：影子 stub 生效不依赖 skill 工具）', () => {
    const universe = buildWorkspaceUniverse(
      facts({
        schemas: [schema('bash')],
        skills: [skillSummary('alpha', true, false, 'project-dsh')],
      }),
    )

    expect(universe.groups.map((group) => group.kind)).toEqual(['skill', 'builtin'])
  })
})

/* ────────────────────────── skills 缺席与 skillsComplete ────────────────────────── */

describe('buildWorkspaceUniverse：skills 缺席与 skillsComplete 透传', () => {
  it('skills 缺席 → skillsAvailable:false，技能组只有组开关（行空）', () => {
    // 候选里有 skill 工具：技能组存在；快照缺席 → 无行、只留 tool:skill 组开关。
    const universe = buildWorkspaceUniverse(
      facts({ schemas: [schema('skill'), schema('bash')] }),
    )

    expect(universe.layerReady).toBe(true)
    expect(universe.skillsAvailable).toBe(false)
    const skillGroup = universe.groups.find((group) => group.kind === 'skill')
    expect(skillGroup).toEqual({ kind: 'skill', key: 'skill', address: 'tool:skill', tools: [] })
    expect(Object.keys(universe)).not.toContain('skillsComplete')
  })

  it('skills 与候选里的 skill 工具都缺席：技能组不出现', () => {
    const universe = buildWorkspaceUniverse(facts({ schemas: [schema('bash')] }))
    expect(universe.skillsAvailable).toBe(false)
    expect(universe.groups.map((group) => group.kind)).toEqual(['builtin'])
  })

  it('skillsComplete 随快照透传（空快照也透传），skills 缺席时不透传', () => {
    // 快照存在（哪怕空数组）：complete 原值透传，键出现。
    const emptySnapshot = buildWorkspaceUniverse(
      facts({ schemas: [], skills: [], skillsComplete: false }),
    )
    expect(Object.keys(emptySnapshot)).toContain('skillsComplete')
    expect(emptySnapshot.skillsComplete).toBe(false)

    // skills 缺席：调用方即使传了 skillsComplete 也不透传（仅在快照存在时有意义）。
    const withoutSkills = buildWorkspaceUniverse(
      facts({ schemas: [], skillsComplete: true }) as WorkspaceUniverseFacts,
    )
    expect(Object.keys(withoutSkills)).not.toContain('skillsComplete')

    // 快照存在但调用方没给 complete：键不出现（缺省 = 未观测）。
    const noFlag = buildWorkspaceUniverse(facts({ schemas: [], skills: [] }))
    expect(Object.keys(noFlag)).not.toContain('skillsComplete')
  })
})

/* ────────────────────────── 组形状与条目判据 ────────────────────────── */

describe('buildWorkspaceUniverse：组形状与条目判据', () => {
  it('组顺序写死：MCP 组按 server 升序 → 技能组 → 内置组', () => {
    const universe = buildWorkspaceUniverse(
      facts({
        schemas: [schema('mcp__b__y'), schema('bash'), schema('skill'), schema('mcp__a__x')],
        skills: [skillSummary('alpha', true, true, 'project-dsh')],
        skillsComplete: true,
      }),
    )

    expect(universe.groups.map((group) => [group.kind, group.key])).toEqual([
      ['mcp', 'a'],
      ['mcp', 'b'],
      ['skill', 'skill'],
      ['builtin', 'builtin'],
    ])
    expect(universe.skillsAvailable).toBe(true)
    expect(universe.skillsComplete).toBe(true)
  })

  it('内置组没有组开关（address null）；skill 工具单列、不进内置组', () => {
    const universe = buildWorkspaceUniverse(facts({ schemas: [schema('bash'), schema('skill')] }))

    const builtin = universe.groups.find((group) => group.kind === 'builtin')
    expect(builtin?.key).toBe('builtin')
    expect(builtin?.address).toBeNull()
    expect(builtin?.tools.map((entry) => entry.shortName)).toEqual(['bash'])
  })

  it('protected / reserved 与面板同源：protectedNames 命中注册名，run_code 是保留名', () => {
    const universe = buildWorkspaceUniverse(
      facts({
        schemas: [schema('mcp__a__x'), schema('bash'), schema('run_code')],
        protectedNames: new Set(['mcp__a__x', 'bash']),
      }),
    )

    const mcpRow = universe.groups.find((group) => group.kind === 'mcp')?.tools[0]
    expect(mcpRow).toMatchObject({ shortName: 'x', protected: true, reserved: false })
    const builtin = universe.groups.find((group) => group.kind === 'builtin')
    expect(builtin?.tools).toEqual([
      { address: 'tool:bash', shortName: 'bash', protected: true, reserved: false },
      { address: 'tool:run_code', shortName: 'run_code', protected: false, reserved: true },
    ])
  })

  it('描述截断为首 160 字符；无描述的条目不带 description 键', () => {
    const universe = buildWorkspaceUniverse(
      facts({ schemas: [schema('mcp__a__x', '工'.repeat(200)), schema('mcp__a__y')] }),
    )

    const tools = universe.groups.find((group) => group.kind === 'mcp')?.tools ?? []
    expect(tools[0].description).toBe('工'.repeat(160))
    expect('description' in tools[1]).toBe(false)
  })
})

/* ────────────────────────── 空宇宙常量 ────────────────────────── */

describe('EMPTY_WORKSPACE_UNIVERSE', () => {
  it('冻结空宇宙：layerReady:false，只有三个键，无未归组 / 快照键', () => {
    expect(EMPTY_WORKSPACE_UNIVERSE).toEqual({ layerReady: false, skillsAvailable: false, groups: [] })
    expect(Object.keys(EMPTY_WORKSPACE_UNIVERSE).sort()).toEqual([
      'groups',
      'layerReady',
      'skillsAvailable',
    ])
    expect(Object.isFrozen(EMPTY_WORKSPACE_UNIVERSE)).toBe(true)
  })
})

/* ────────────────────────── reader 读数编排 ────────────────────────── */

describe('createWorkspaceUniverseReader：失败矩阵（永不抛）', () => {
  it('工具服务缺席：返回空宇宙 + warn 一次（闭包内去重）', async () => {
    const { log, warnings } = logSink()
    const reader = createWorkspaceUniverseReader(
      readerAccess({ skills: { snapshot: async () => ({ skills: [], complete: true }) } }, log),
    )

    const first = await reader('/ws/a')
    const second = await reader('/ws/a')

    expect(first).toEqual(EMPTY_WORKSPACE_UNIVERSE)
    expect(second).toEqual(EMPTY_WORKSPACE_UNIVERSE)
    expect(first.layerReady).toBe(false)
    // 同一降级只刷一次屏：两次读数只 warn 一条。
    expect(warnings).toHaveLength(1)
  })

  it('tools.schemas() 抛错：返回空宇宙 + warn 带错误原文', async () => {
    const { log, warnings } = logSink()
    const reader = createWorkspaceUniverseReader(
      readerAccess(
        {
          tools: {
            schemas: () => {
              throw new Error('注册表炸了')
            },
          },
        },
        log,
      ),
    )

    const universe = await reader('/ws/a')

    expect(universe).toEqual(EMPTY_WORKSPACE_UNIVERSE)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('注册表炸了')
  })

  it('技能服务缺席：仍构造宇宙（skillsAvailable:false），不 warn（受支持的降级）', async () => {
    const { log, warnings } = logSink()
    const reader = createWorkspaceUniverseReader(
      readerAccess({ tools: { schemas: () => [schema('mcp__a__x'), schema('skill')] } }, log),
    )

    const universe = await reader('/ws/a')

    expect(universe.layerReady).toBe(true)
    expect(universe.skillsAvailable).toBe(false)
    expect(universe.groups.map((group) => group.kind)).toEqual(['mcp', 'skill'])
    expect(Object.keys(universe)).not.toContain('skillsComplete')
    expect(warnings).toHaveLength(0)
  })

  it('skills.snapshot() 抛错：同一降级 + 每次都 warn（技能是软分面，不去重）', async () => {
    const { log, warnings } = logSink()
    const reader = createWorkspaceUniverseReader(
      readerAccess(
        {
          tools: { schemas: () => [schema('bash')] },
          skills: {
            snapshot: async () => {
              throw new Error('技能目录炸了')
            },
          },
        },
        log,
      ),
    )

    const first = await reader('/ws/a')
    const second = await reader('/ws/a')

    expect(first.layerReady).toBe(true)
    expect(first.skillsAvailable).toBe(false)
    expect(first).toEqual(second)
    expect(Object.keys(first)).not.toContain('skillsComplete')
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('技能目录炸了')
  })

  it('正常路径：完整宇宙；snapshot 收到 cwd 实参；skillsComplete 与 protectedNames 生效', async () => {
    const { log, warnings } = logSink()
    const seenCwd: readonly string[] = []
    const reader = createWorkspaceUniverseReader({
      get: (name) =>
        name === 'tools'
          ? { schemas: () => [schema('mcp__a__x', 'A 的工具')] }
          : name === 'skills'
            ? {
                snapshot: async (options: { readonly cwd: string }) => {
                  ;(seenCwd as string[]).push(options.cwd)
                  return {
                    skills: [skillSummary('alpha', true, true, 'project-dsh')],
                    complete: false,
                  }
                },
              }
          : undefined,
      protectedNames: new Set(['mcp__a__x']),
      log,
    })

    const universe = await reader('/ws/demo')

    expect(seenCwd).toEqual(['/ws/demo'])
    expect(universe.layerReady).toBe(true)
    expect(universe.skillsAvailable).toBe(true)
    expect(universe.skillsComplete).toBe(false)
    expect(universe.groups.map((group) => group.kind)).toEqual(['mcp', 'skill'])
    // 保护名单经由 reader 传进构造器：MCP 行按注册名命中 protected。
    expect(universe.groups[0].tools[0]).toMatchObject({
      address: 'mcp:a::x',
      shortName: 'x',
      protected: true,
    })
    expect(warnings).toHaveLength(0)
  })
})

/* ────────────────────────── 纯函数性质 ────────────────────────── */

describe('R15：项目级过滤与组级标注（foreignProjectMcp / source / countsTokens）', () => {
  /** 两台服务器的公共夹具：figma（项目级候选）+ codebase-memory（profile 级）。 */
  function twoServerFacts(
    overrides: Pick<WorkspaceUniverseFacts, 'projectServers' | 'projectServersHere'>,
  ): WorkspaceUniverseFacts {
    return facts({
      schemas: [schema('mcp__figma__get_file'), schema('mcp__codebase-memory__search_code')],
      ...overrides,
    })
  }

  it('项目级且不在本工作区归属下 → 整组剔除 + foreignProjectMcp 计数', () => {
    const universe = buildWorkspaceUniverse(twoServerFacts({
      projectServers: new Set(['figma']),
      projectServersHere: new Set<string>(),
    }))

    const keys = universe.groups.map((group) => group.key)
    expect(keys).toEqual(['codebase-memory'])
    expect(universe.foreignProjectMcp).toBe(1)
    expect(universe.groups[0]?.source).toBe('user')
  })

  it('归属命中 → source: project；profile 级 → source: user', () => {
    const universe = buildWorkspaceUniverse(twoServerFacts({
      projectServers: new Set(['figma']),
      projectServersHere: new Set(['figma']),
    }))

    expect(universe.groups.map((group) => group.key)).toEqual(['codebase-memory', 'figma'])
    expect(universe.groups.map((group) => group.source)).toEqual(['user', 'project'])
    expect(universe.foreignProjectMcp).toBeUndefined()
  })

  it('归属读数失败（null）→ fail-closed：全部项目级组剔除并计数', () => {
    const universe = buildWorkspaceUniverse(twoServerFacts({
      projectServers: new Set(['figma']),
      projectServersHere: null,
    }))

    expect(universe.groups.map((group) => group.key)).toEqual(['codebase-memory'])
    expect(universe.foreignProjectMcp).toBe(1)
  })

  it('projectServers 缺席（插件未装配）→ 无过滤，全部组标 user，无计数键', () => {
    const universe = buildWorkspaceUniverse(twoServerFacts({}))

    expect(universe.groups.map((group) => group.key)).toEqual(['codebase-memory', 'figma'])
    expect(universe.groups.every((group) => group.source === 'user')).toBe(true)
    expect(universe.foreignProjectMcp).toBeUndefined()
    expect(Object.keys(universe)).not.toContain('foreignProjectMcp')
  })

  it('mcp 组带 countsTokens: true；技能组与内置组不带该键', () => {
    const universe = buildWorkspaceUniverse(facts({
      schemas: [schema('mcp__a__x'), schema('skill'), schema('bash')],
      skills: [skillSummary('spec-flow', true, true)],
    }))

    const mcp = universe.groups.find((group) => group.kind === 'mcp')
    const skillGroup = universe.groups.find((group) => group.kind === 'skill')
    const builtin = universe.groups.find((group) => group.kind === 'builtin')
    expect(mcp?.countsTokens).toBe(true)
    expect(Object.keys(skillGroup ?? {})).not.toContain('countsTokens')
    expect(Object.keys(builtin ?? {})).not.toContain('countsTokens')
    expect(Object.keys(skillGroup ?? {})).not.toContain('source')
  })

  it('全部剔除时 groups 可能只剩内置组；foreignProjectMcp 仍计数', () => {
    const universe = buildWorkspaceUniverse(facts({
      schemas: [schema('mcp__figma__get_file'), schema('bash')],
      projectServers: new Set(['figma']),
      projectServersHere: new Set<string>(),
    }))

    expect(universe.groups.map((group) => group.kind)).toEqual(['builtin'])
    expect(universe.foreignProjectMcp).toBe(1)
  })
})

describe('R15：reader 的 projectMcp 编排（软读 + 降级矩阵）', () => {
  const tools = { schemas: () => [schema('mcp__figma__get_file'), schema('mcp__cb__search')] }

  it('projectMcp 缺席 → facts 无两键（全部组标 user），不 warn', async () => {
    const { log, warnings } = logSink()
    const reader = createWorkspaceUniverseReader(readerAccess({ tools }, log))

    const universe = await reader('/ws/a')

    expect(universe.groups.map((group) => group.source)).toEqual(['user', 'user'])
    expect(universe.foreignProjectMcp).toBeUndefined()
    expect(warnings).toHaveLength(0)
  })

  it('managedServerNames() 抛错 → 整层降级 EMPTY + warn 带原文（来源分野不可信）', async () => {
    const { log, warnings } = logSink()
    const reader = createWorkspaceUniverseReader(readerAccess({
      tools,
      projectMcp: {
        managedServerNames: () => {
          throw new Error('声明清单炸了')
        },
        serverNamesForWorkspace: async () => new Set<string>(),
      },
    }, log))

    const universe = await reader('/ws/a')

    expect(universe).toEqual(EMPTY_WORKSPACE_UNIVERSE)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('声明清单炸了')
  })

  it('serverNamesForWorkspace() 抛错 → fail-closed：项目级组剔除 + warn 一次', async () => {
    const { log, warnings } = logSink()
    const reader = createWorkspaceUniverseReader(readerAccess({
      tools,
      projectMcp: {
        managedServerNames: () => new Set(['figma']),
        serverNamesForWorkspace: () => {
          throw new Error('归属炸了')
        },
      },
    }, log))

    const first = await reader('/ws/a')
    const second = await reader('/ws/a')

    expect(first.groups.map((group) => group.key)).toEqual(['cb'])
    expect(first.foreignProjectMcp).toBe(1)
    // 结构性失败按一次去重：两次读数只 warn 一条。
    expect(warnings).toHaveLength(1)
    expect(second.foreignProjectMcp).toBe(1)
  })

  it('归属返回 null → 同 fail-closed（服务在、路径不被认领）', async () => {
    const { log, warnings } = logSink()
    const reader = createWorkspaceUniverseReader(readerAccess({
      tools,
      projectMcp: {
        managedServerNames: () => new Set(['figma']),
        serverNamesForWorkspace: async () => null,
      },
    }, log))

    const universe = await reader('/nowhere')

    expect(universe.groups.map((group) => group.key)).toEqual(['cb'])
    expect(universe.foreignProjectMcp).toBe(1)
    expect(warnings).toHaveLength(0)
  })

  it('正常路径：workspacePath 原样传给归属查询，命中组标 project', async () => {
    const { log } = logSink()
    const seen: string[] = []
    const reader = createWorkspaceUniverseReader(readerAccess({
      tools,
      skills: { snapshot: async () => ({ skills: [], complete: true }) },
      projectMcp: {
        managedServerNames: () => new Set(['figma']),
        serverNamesForWorkspace: async (path: string) => {
          seen.push(path)
          return new Set(['figma'])
        },
      },
    }, log))

    const universe = await reader('/ws/target')

    expect(seen).toEqual(['/ws/target'])
    const figma = universe.groups.find((group) => group.key === 'figma')
    expect(figma?.source).toBe('project')
    expect(figma?.countsTokens).toBe(true)
  })
})

describe('纯函数性质', () => {
  it('同入参两次调用深相等，入参不被修改', () => {
    const input = facts({
      schemas: [
        schema('mcp__a__x', '描述'),
        schema('mcp__a.b__x'),
        schema('skill'),
        schema('bash'),
      ],
      skills: [skillSummary('beta', false, true, 'user-dsh'), skillSummary('alpha', true, true)],
      skillsComplete: true,
      protectedNames: new Set(['bash']),
    })
    const before = structuredClone(input)

    const first = buildWorkspaceUniverse(input)
    const second = buildWorkspaceUniverse(input)

    expect(first).toEqual(second)
    expect(input).toEqual(before)
  })
})
