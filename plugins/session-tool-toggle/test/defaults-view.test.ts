/**
 * `defaults-view` 纯派生函数测试（`code-design.md` ③ 3.18 / TS14）。
 *
 * 覆盖五组口径：
 *
 * 1. `switchAddressesOf`：组开关 + 行开关并集去重，`builtin` 无组开关；
 * 2. `defaultsCountsOf` 三计数：**整组关闭只计组开关**（不重复计组内行）、命中 / 残留混合、
 *    `null` 与 `layerReady:false` 的零 listed 降级；
 * 3. `residualOf`：排序差集、去重、全在档时为空；
 * 4. `universeOfSnapshot`：`mcp`/`builtin` 投影丢 `disabled`、技能组行换 `skill:<name>`、
 *    `notices` 的 `skills-unavailable` → `skillsAvailable:false`、空 `groups`；
 * 5. 纯函数性：同输入两次调用深相等、入参不被改写；
 * 6. `filterDefaultsView`（`code-design.md` ③3.4，G4.3）：空查询 identity、组键 / 行 /
 *    描述 / 残留命中、大小写与空白归一、无命中、残差不污染（差集按未过滤宇宙求差再筛词）。
 *
 * 全部用最小 `DefaultsUniverse` / `PanelSnapshot` 字面量夹具，不碰任何真实 IO。
 */
import { describe, expect, it } from 'vitest'
import type {
  DefaultsEntry,
  DefaultsUniverse,
  PanelSnapshot,
  SkillView,
  ToolEntry,
  ToolGroup,
} from '../src/contract.ts'
import {
  defaultsCountsOf,
  filterDefaultsView,
  residualOf,
  switchAddressesOf,
  universeOfSnapshot,
} from '../src/client/defaults-view.ts'

/** 用例里那个活着的会话 id。 */
const SESSION_ID = 'session-1'

/** 会话创建时间（固定值，让快照可断言）。 */
const CREATED_AT = 1_700_000_000_000

/** 默认档文件的假绝对路径（不指向任何真实文件）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/**
 * 造一条默认档条目。
 * @param address - 规范形地址。
 * @param shortName - 展示用短名。
 * @param overrides - 需要改写的字段。
 * @returns 默认档条目。
 */
function entry(address: string, shortName: string, overrides: Partial<DefaultsEntry> = {}): DefaultsEntry {
  return { address, shortName, protected: false, reserved: false, ...overrides }
}

/**
 * 三组齐全的最小宇宙（mcp 组 + 技能组 + 内置工具组）。
 *
 * 可切换地址共 8 个：`mcp:a` 组开关 + 2 个 mcp 行 + `tool:skill` 组开关 + 2 个技能行 +
 * 2 个内置行（`builtin` 组 `address:null`，没有组开关）。
 * @param overrides - 需要改写的顶层字段。
 * @returns 工具宇宙。
 */
function fixtureUniverse(overrides: Partial<DefaultsUniverse> = {}): DefaultsUniverse {
  return {
    layerReady: true,
    skillsAvailable: true,
    groups: [
      {
        kind: 'mcp',
        key: 'a',
        address: 'mcp:a',
        tools: [entry('mcp:a::x', 'x'), entry('mcp:a::y', 'y', { description: 'Y 工具' })],
      },
      {
        kind: 'skill',
        key: 'skill',
        address: 'tool:skill',
        tools: [entry('skill:alpha', 'alpha'), entry('skill:beta', 'beta')],
      },
      {
        kind: 'builtin',
        key: 'builtin',
        address: null,
        tools: [
          entry('tool:bash', 'bash', { protected: true }),
          entry('tool:run_code', 'run_code', { reserved: true }),
        ],
      },
    ],
    ...overrides,
  }
}

/** 上面那份宇宙的全部可切换地址（升序，与默认 `Array#sort` 同序）。 */
const FIXTURE_ADDRESSES = [
  'mcp:a',
  'mcp:a::x',
  'mcp:a::y',
  'skill:alpha',
  'skill:beta',
  'tool:bash',
  'tool:run_code',
  'tool:skill',
] as const

/**
 * 造一条面板工具条目。
 * @param address - 条目地址。
 * @param shortName - 展示用短名（同时作为注册名缺省）。
 * @param overrides - 需要改写的字段。
 * @returns 工具条目。
 */
function tool(address: string, shortName: string, overrides: Partial<ToolEntry> = {}): ToolEntry {
  return {
    name: shortName,
    shortName,
    address,
    disabled: false,
    protected: false,
    reserved: false,
    ...overrides,
  }
}

/**
 * 造一个面板分组（计数现算；`disabled` 缺省 false）。
 * @param kind - 分组来源。
 * @param key - 分组键。
 * @param address - 整组地址（builtin 为 null）。
 * @param tools - 组内条目。
 * @param overrides - 需要改写的字段。
 * @returns 工具分组。
 */
function group(
  kind: ToolGroup['kind'],
  key: string,
  address: string | null,
  tools: readonly ToolEntry[],
  overrides: Partial<ToolGroup> = {},
): ToolGroup {
  return {
    kind,
    key,
    address,
    toolCount: tools.length,
    disabledCount: tools.filter((entryOfGroup) => entryOfGroup.disabled).length,
    disabled: false,
    tools,
    ...overrides,
  }
}

/**
 * 造一条技能行。
 * @param name - 技能名。
 * @param description - 描述（空串 = 无描述）。
 * @param overrides - 需要改写的字段。
 * @returns 技能行。
 */
function skill(name: string, description: string, overrides: Partial<SkillView> = {}): SkillView {
  return { name, description, disabled: false, shadowed: false, ...overrides }
}

/**
 * 造一份最小的合法面板快照（strict 契约：字段不多不少）。
 * @param overrides - 需要改写的顶层字段。
 * @returns 面板快照。
 */
function snapshot(overrides: Partial<PanelSnapshot> = {}): PanelSnapshot {
  return {
    sessionId: SESSION_ID,
    createdAt: CREATED_AT,
    state: { disabled: [], snapshot: [], seeded: false, updatedAt: 0, storeKind: 'memory' },
    groups: [],
    protectedNames: [],
    defaults: { version: 1, disabled: [], path: DEFAULTS_PATH, readable: true, corrupt: false },
    intentOnly: [],
    stats: { visible: 0, denied: 0 },
    notices: [],
    skills: [],
    workspace: null,
    ...overrides,
  }
}

/**
 * 三组齐全、且每组都带「已关 / 受保护 / 保留名」条目的快照。
 *
 * 技能组在快照里的 `tools` 是单个 `skill` 工具行（`tool:skill`）——投影时会被
 * `snapshot.skills` 的技能行整体替换，这个夹具用来证明「替换」而不是「追加」。
 * @param overrides - 需要改写的顶层字段。
 * @returns 面板快照。
 */
function catalogSnapshot(overrides: Partial<PanelSnapshot> = {}): PanelSnapshot {
  return snapshot({
    groups: [
      group(
        'mcp',
        'a',
        'mcp:a',
        [tool('mcp:a::x', 'x', { disabled: true }), tool('mcp:a::y', 'y', { description: 'Y 工具' })],
        { disabled: true },
      ),
      group('skill', 'skill', 'tool:skill', [tool('tool:skill', 'skill')]),
      group('builtin', 'builtin', null, [
        tool('tool:bash', 'bash', { protected: true, disabled: true }),
        tool('tool:run_code', 'run_code', { reserved: true }),
      ]),
    ],
    skills: [
      skill('alpha', 'Alpha 技能'),
      // 空描述 = 无描述，投影后不带 `description` 键。
      skill('beta', '', { disabled: true, shadowed: true }),
    ],
    ...overrides,
  })
}

describe('switchAddressesOf', () => {
  it('组开关与行开关取并集，builtin 组没有组开关', () => {
    const addresses = switchAddressesOf(fixtureUniverse())
    expect(addresses.size).toBe(FIXTURE_ADDRESSES.length)
    expect([...addresses].sort()).toEqual([...FIXTURE_ADDRESSES])
    // builtin 的组地址是 null：集合里没有第二个空串 / null 之类的伪地址。
    expect(addresses.has('')).toBe(false)
    expect(addresses.has('null')).toBe(false)
  })

  it('重复地址按 Set 语义去重', () => {
    const universe = fixtureUniverse({
      groups: [
        {
          kind: 'mcp',
          key: 'a',
          address: 'mcp:a',
          tools: [entry('mcp:a::x', 'x'), entry('mcp:a::x', 'x')],
        },
        {
          kind: 'mcp',
          key: 'a',
          address: 'mcp:a',
          tools: [entry('mcp:a::x', 'x')],
        },
      ],
    })
    expect([...switchAddressesOf(universe)].sort()).toEqual(['mcp:a', 'mcp:a::x'])
  })

  it('宇宙为 null 或 layerReady:false 时没有可切换地址', () => {
    expect(switchAddressesOf(null).size).toBe(0)
    expect(switchAddressesOf(fixtureUniverse({ layerReady: false })).size).toBe(0)
  })
})

describe('defaultsCountsOf', () => {
  it('整组关闭只计组开关，不重复计组内行', () => {
    // 关掉 mcp:a 组时，禁用集里只有组地址；8 个开关地址中只命中 1 个——
    // 若按「组内每行也查一次 disabled」实现，这里会变成 3。
    expect(defaultsCountsOf(fixtureUniverse(), ['mcp:a'])).toEqual({
      listed: 8,
      inDefaults: 1,
      residual: 0,
    })
  })

  it('行地址同样计入 inDefaults（含技能组开关）', () => {
    expect(
      defaultsCountsOf(fixtureUniverse(), ['mcp:a', 'mcp:a::x', 'skill:alpha', 'tool:skill']),
    ).toEqual({ listed: 8, inDefaults: 4, residual: 0 })
  })

  it('命中与残留混合：残留数等于 residualOf 的长度', () => {
    const disabled = ['tool:zzz', 'mcp:a', 'aaa']
    const counts = defaultsCountsOf(fixtureUniverse(), disabled)
    expect(counts).toEqual({ listed: 8, inDefaults: 1, residual: 2 })
    expect(counts.residual).toBe(residualOf(fixtureUniverse(), disabled).length)
  })

  it('宇宙为 null：全部关闭项都算残留', () => {
    expect(defaultsCountsOf(null, ['tool:bash', 'mcp:a'])).toEqual({
      listed: 0,
      inDefaults: 0,
      residual: 2,
    })
    expect(defaultsCountsOf(null, [])).toEqual({ listed: 0, inDefaults: 0, residual: 0 })
  })

  it('layerReady:false 的残影分组不参与计数', () => {
    const universe = fixtureUniverse({ layerReady: false })
    expect(defaultsCountsOf(universe, ['mcp:a::x', 'zzz'])).toEqual({
      listed: 0,
      inDefaults: 0,
      residual: 2,
    })
  })

  it('空 groups 的已就绪宇宙：listed 0，关闭集全是残留', () => {
    const universe = fixtureUniverse({ groups: [] })
    expect(defaultsCountsOf(universe, ['mcp:a'])).toEqual({
      listed: 0,
      inDefaults: 0,
      residual: 1,
    })
  })
})

describe('residualOf', () => {
  it('只保留宇宙外的地址，且输出升序', () => {
    expect(
      residualOf(fixtureUniverse(), ['zzz', 'skill:beta', 'aaa', 'mcp:a::x', 'tool:zeta']),
    ).toEqual(['aaa', 'tool:zeta', 'zzz'])
  })

  it('重复的残留地址按地址去重', () => {
    expect(residualOf(fixtureUniverse(), ['zzz', 'aaa', 'zzz', 'aaa'])).toEqual(['aaa', 'zzz'])
  })

  it('宇宙为 null / layerReady:false：整份关闭集都是残留（排序去重）', () => {
    expect(residualOf(null, ['zzz', 'mcp:a', 'aaa'])).toEqual(['aaa', 'mcp:a', 'zzz'])
    expect(residualOf(fixtureUniverse({ layerReady: false }), ['zzz', 'mcp:a'])).toEqual([
      'mcp:a',
      'zzz',
    ])
  })

  it('全部在宇宙内时为空数组', () => {
    expect(residualOf(fixtureUniverse(), [...FIXTURE_ADDRESSES])).toEqual([])
  })
})

describe('universeOfSnapshot', () => {
  it('mcp/builtin 组原样投影，行丢掉 disabled', () => {
    const projected = universeOfSnapshot(catalogSnapshot())

    expect(projected.groups[0]).toEqual({
      kind: 'mcp',
      key: 'a',
      address: 'mcp:a',
      tools: [
        { address: 'mcp:a::x', shortName: 'x', protected: false, reserved: false },
        {
          address: 'mcp:a::y',
          shortName: 'y',
          description: 'Y 工具',
          protected: false,
          reserved: false,
        },
      ],
    })
    expect(projected.groups[2]).toEqual({
      kind: 'builtin',
      key: 'builtin',
      address: null,
      tools: [
        { address: 'tool:bash', shortName: 'bash', protected: true, reserved: false },
        { address: 'tool:run_code', shortName: 'run_code', protected: false, reserved: true },
      ],
    })
    // DefaultsEntry 没有 disabled：投影必须整键丢掉，而不是置 false。
    expect('disabled' in projected.groups[0].tools[0]).toBe(false)
    expect('disabled' in projected.groups[2].tools[0]).toBe(false)
  })

  it('技能组：组地址保留 tool:skill，行换成 snapshot.skills 的 skill:<name>', () => {
    const projected = universeOfSnapshot(catalogSnapshot())
    const skillGroup = projected.groups[1]

    expect(skillGroup).toEqual({
      kind: 'skill',
      key: 'skill',
      address: 'tool:skill',
      tools: [
        {
          address: 'skill:alpha',
          shortName: 'alpha',
          description: 'Alpha 技能',
          protected: false,
          reserved: false,
        },
        // 空描述缺省；技能行恒不可保护 / 不可保留。
        { address: 'skill:beta', shortName: 'beta', protected: false, reserved: false },
      ],
    })
    // 快照里技能组自带的 `tool:skill` 工具行被替换，而不是被追加到技能行前面。
    expect(skillGroup.tools.map((row) => row.address)).toEqual(['skill:alpha', 'skill:beta'])
  })

  it('skills 为空：技能组保留、行空（整档开关仍在）', () => {
    const projected = universeOfSnapshot(
      snapshot({
        groups: [group('skill', 'skill', 'tool:skill', [])],
        skills: [],
      }),
    )
    expect(projected.groups).toEqual([
      { kind: 'skill', key: 'skill', address: 'tool:skill', tools: [] },
    ])
    expect([...switchAddressesOf(projected)]).toEqual(['tool:skill'])
  })

  it('notices 含 skills-unavailable → skillsAvailable:false，其余提示码不影响', () => {
    expect(universeOfSnapshot(snapshot()).skillsAvailable).toBe(true)
    expect(
      universeOfSnapshot(snapshot({ notices: ['persistence-degraded', 'session-subagent'] }))
        .skillsAvailable,
    ).toBe(true)
    expect(
      universeOfSnapshot(snapshot({ notices: ['skills-unavailable'] })).skillsAvailable,
    ).toBe(false)
  })

  it('空 groups → 空 groups 宇宙，layerReady 保守为 true，listed 0', () => {
    const projected = universeOfSnapshot(snapshot())
    expect(projected).toEqual({ layerReady: true, skillsAvailable: true, groups: [] })
    expect(defaultsCountsOf(projected, ['mcp:a'])).toEqual({
      listed: 0,
      inDefaults: 0,
      residual: 1,
    })
  })
})

describe('纯函数性', () => {
  it('计数 / 残留 / 地址集合：同输入两次调用深相等，入参不被改写', () => {
    const universe = fixtureUniverse()
    const disabled = ['zzz', 'mcp:a', 'aaa']
    const universeBefore = structuredClone(universe)
    const disabledBefore = [...disabled]

    const counts = defaultsCountsOf(universe, disabled)
    const residual = residualOf(universe, disabled)
    const addresses = [...switchAddressesOf(universe)].sort()

    expect(defaultsCountsOf(universe, disabled)).toEqual(counts)
    expect(residualOf(universe, disabled)).toEqual(residual)
    expect([...switchAddressesOf(universe)].sort()).toEqual(addresses)
    expect(universe).toEqual(universeBefore)
    expect(disabled).toEqual(disabledBefore)
  })

  it('快照投影：同输入两次调用深相等，快照不被改写', () => {
    const input = catalogSnapshot()
    const before = structuredClone(input)

    const first = universeOfSnapshot(input)
    const second = universeOfSnapshot(input)

    expect(first).toEqual(second)
    expect(input).toEqual(before)
  })
})

describe('filterDefaultsView', () => {
  it('空查询（undefined / 空串 / 全空白）返回入参 identity，残差与 residualOf 一致', () => {
    const universe = fixtureUniverse()
    const disabled = ['zzz', 'mcp:a', 'aaa']
    // 基准锚点：`mcp:a` 在宇宙内被差集剔除，只剩宇宙外的两项（升序）。
    expect(residualOf(universe, disabled)).toEqual(['aaa', 'zzz'])

    for (const query of [undefined, '', '   ']) {
      const view = filterDefaultsView(universe, disabled, query)
      // 未过滤：宇宙原样返回入参（identity 稳定），不是深相等的新对象。
      expect(view.universe).toBe(universe)
      expect(view.filtering).toBe(false)
      // 残差口径与现行 residualOf 完全一致（code-design.md ③3.4）。
      expect(view.residual).toEqual(residualOf(universe, disabled))
    }

    // null 宇宙 + 空查询：identity 语义同样成立（null 原样透传）。
    expect(filterDefaultsView(null, disabled, undefined)).toEqual({
      universe: null,
      residual: ['aaa', 'mcp:a', 'zzz'],
      filtering: false,
    })
  })

  it('组键命中：整组保留（组开关 + 全部行），其余组滤掉', () => {
    const base = fixtureUniverse()
    // 查询词 'skill' 命中技能组键：组级命中保留整组（组开关行 + alpha/beta），
    // mcp / 内置组的键与行都不含 'skill'，被滤掉。
    expect(filterDefaultsView(base, [], 'skill').universe).toEqual(
      fixtureUniverse({ groups: [base.groups[1]] }),
    )
    // 'builtin' 键同理：内置组整组保留。
    expect(filterDefaultsView(base, [], 'builtin').universe).toEqual(
      fixtureUniverse({ groups: [base.groups[2]] }),
    )
  })

  it('行命中（shortName / address）保留整组', () => {
    const base = fixtureUniverse()
    // shortName 命中：alpha 行命中 → 技能组整组保留（beta 行仍在）。
    expect(filterDefaultsView(base, [], 'alpha').universe).toEqual(
      fixtureUniverse({ groups: [base.groups[1]] }),
    )
    // address 命中：y 行地址命中 → mcp 组整组保留（x 行仍在）。
    expect(filterDefaultsView(base, [], 'mcp:a::y').universe).toEqual(
      fixtureUniverse({ groups: [base.groups[0]] }),
    )
  })

  it('描述命中：命中行的整组保留', () => {
    const base = fixtureUniverse()
    // 夹具里只有 mcp 组 y 行带 description 'Y 工具'：描述命中 → 整组保留。
    expect(filterDefaultsView(base, [], '工具').universe).toEqual(
      fixtureUniverse({ groups: [base.groups[0]] }),
    )
  })

  it('残留 chip 按 address 包含命中，查询词大小写归一', () => {
    const disabled = ['tool:zzz', 'aaa', 'mcp:a']
    const view = filterDefaultsView(fixtureUniverse(), disabled, 'zzz')
    // 'zzz' 不命中任何组（展示面清空）；'tool:zzz'（宇宙外）address 含查询词保留，
    // 'aaa' 不含被筛掉，'mcp:a' 本就不是残留。
    expect(view.universe).toEqual({ layerReady: true, skillsAvailable: true, groups: [] })
    expect(view.residual).toEqual(['tool:zzz'])
    // 查询词大写：归一化后等价命中。
    expect(filterDefaultsView(fixtureUniverse(), disabled, 'ZZZ').residual).toEqual(['tool:zzz'])
  })

  it('查询词大小写与前后空白归一后匹配', () => {
    const base = fixtureUniverse()
    const expected = fixtureUniverse({ groups: [base.groups[1]] })
    // 'ALPHA'（大写）与 '  Alpha  '（前后空白）trim + 小写后都与 'alpha' 等价命中。
    expect(filterDefaultsView(base, [], 'ALPHA').universe).toEqual(expected)
    expect(filterDefaultsView(base, [], '  Alpha  ').universe).toEqual(expected)
  })

  it('无命中：组清空、残留清空，查询词仍视为生效', () => {
    const view = filterDefaultsView(fixtureUniverse(), ['zzz'], '不存在的词')
    // 过滤启用时宇宙是新对象：groups 清空但 layerReady / skillsAvailable 保留。
    expect(view.universe).toEqual({ layerReady: true, skillsAvailable: true, groups: [] })
    expect(view.residual).toEqual([])
    expect(view.filtering).toBe(true)
  })

  it('残差不污染：差集按未过滤宇宙求差，再筛查询词', () => {
    const disabled = ['tool:bash', 'tool:zzz']
    // builtin 组被 'zzz' 滤出展示面，但 'tool:bash' 在未过滤宇宙内——
    // 若差集错误地在过滤后宇宙上求，它会与 'tool:zzz' 一起被误判为残留。
    expect(filterDefaultsView(fixtureUniverse(), disabled, 'zzz').residual).toEqual(['tool:zzz'])
    // 残差再按查询词筛：'bash' 命中 builtin 组展示，'tool:zzz' 不含查询词而被隐藏。
    expect(filterDefaultsView(fixtureUniverse(), disabled, 'bash').residual).toEqual([])
  })

  it('null 宇宙 + 查询词：universe 原样 null，残差为全集再筛查询词', () => {
    const view = filterDefaultsView(null, ['zzz', 'aaa', 'mcp:a'], 'zzz')
    expect(view.universe).toBeNull()
    expect(view.filtering).toBe(true)
    // null 宇宙求差 = 整份关闭集（排序去重），再按 address 包含筛掉 'aaa' / 'mcp:a'。
    expect(view.residual).toEqual(['zzz'])
  })
})
