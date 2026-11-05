/**
 * 每 agent 层测试（规范：dsh-session-tool-toggle —— 会话级工具面开关）。
 *
 * 全部用例都在**假 surface** 上驱动，不拉起宿主：层对外的唯一接触面是
 * `ScopedSurface`（restrict / guard / section / visibleNames / sectionOrder）与
 * `catalog()` 读数，因此「装了几次掩码、守卫拦不拦、段参数是什么」都能直接计数断言。
 *
 * 六条不变量各有一组用例（编号与 `src/host/session-layer.ts` 的文件头一致）：
 *
 * - I1：guard 只装一次，闭包读实时关闭集；
 * - I2：同一 deny 集合的二次 `refresh()` 不产生新的 `restrict()` 调用；
 * - I3：`restrict` 抛错 → 从活读数重推并重试一次，仍失败则保持无掩码（guard 仍拦）；
 * - I4：遮蔽段的 name / order / text / interpolate 与官方段同形；
 * - I5：`detach` 分步容错，`inactive context` 静默且不抛；
 * - I6：`restrict` 同步触发 `tools/change`（进而同步回调 `refresh()`）时 `reconcile()`
 *   对重入幂等——不递归、能返回、记账正确，且不吞掉之后真正的 `setState` 变化。
 *
 * 假 surface 刻意模拟两件真实行为：掩码生效后名字从 `visibleNames()` 消失（carried 因此
 * 必须存在，否则第二读会缩小 → 掩码被抬掉 → 振荡），以及 `restrict` 对未知名抛错。
 */
import { describe, expect, it } from 'vitest'
import {
  SessionLayer,
  agentSurface,
  type SessionLayerPorts,
} from '../src/host/session-layer.ts'
import type {
  AgentLike,
  ScopedSurface,
  SessionLike,
  SessionToolState,
  SkillDefinitionLike,
  SkillScopeHandle,
  SkillServiceLike,
  SkillSummaryLike,
  SpecLog,
} from '../src/host/types.ts'

/** 宿主里 `MCP_SERVERS` 段的真实顺序（假 surface 原样返回，用 I4 断言它被透传）。 */
const MCP_SERVERS_ORDER = 3100

/** 一条遮蔽段的入参（与 `ScopedSurface.section` 同形）。 */
interface SectionInput {
  readonly name: string
  readonly order: number
  readonly text: string
  readonly interpolate?: boolean
}

/** 收集三类日志的假出口（与仓内其它套件同形）。 */
function recordingLog(): {
  log: SpecLog
  infos: string[]
  warnings: string[]
  errors: string[]
} {
  const infos: string[] = []
  const warnings: string[] = []
  const errors: string[] = []
  return {
    log: {
      info: (message) => infos.push(message),
      warn: (message) => warnings.push(message),
      error: (message) => errors.push(message),
    },
    infos,
    warnings,
    errors,
  }
}

/** 只关心返回值、不关心日志的用例用它。 */
const QUIET_LOG: SpecLog = { info: () => {}, warn: () => {}, error: () => {} }

/** 构造一份状态；只覆盖用例关心的字段。 */
function stateOf(
  disabled: readonly string[] = [],
  overrides: Partial<SessionToolState> = {},
): SessionToolState {
  return {
    version: 1,
    disabled,
    snapshot: disabled,
    seeded: true,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

/** 构造一个最小 agent；`ctx` 由用例决定（假作用域或空对象）。 */
function fakeAgent(id = 's1', ctx: unknown = {}): AgentLike {
  const session: SessionLike = {
    id,
    header: { isSeeded: true, createdAt: 1_700_000_000_000 },
    constructor: Object,
    eventAt: () => undefined,
    snapshotEvents: () => [],
  }
  return { session, ctx }
}

/**
 * 假工具面：记录每一次 `restrict` / `section` / `guard` 调用，并模拟掩码的可见性后果。
 *
 * - `names` 是**未掩码**的注册集（catalog 读数也用它，见 {@link harness}）；
 * - 掩码生效后 `visibleNames()` 少掉被掩的名字（真实行为）；
 * - `setRefuse` 让某次（或每次）`restrict` 抛错，用来驱动 I3；
 * - `setOnRestrict` 在每次**成功**的 `restrict` 返回 disposer **之前**同步回调，用来模拟
 *   `dsh-scope` 的 `ScopedLayers.effect` 在返回前广播 `tools/change`（I6 / R26）；
 * - `setInactive` 让**所有 disposer** 抛 `inactive context`，用来驱动 I5。
 * @param options - 初始注册名与 `MCP_SERVERS` 段顺序。
 * @returns 假 surface 与它的调用记录。
 */
function fakeSurface(options: { names?: readonly string[]; order?: number } = {}) {
  const names = [...(options.names ?? [])]
  const order = options.order ?? MCP_SERVERS_ORDER

  const restrictCalls: { readonly deny: readonly string[]; readonly ok: boolean }[] = []
  const sectionCalls: SectionInput[] = []
  const sections = new Map<string, SectionInput>()
  const guardCalls: ((execution: { readonly name: string }) => string | undefined)[] = []
  const activeGuards: ((execution: { readonly name: string }) => string | undefined)[] = []

  let applied: readonly string[] = []
  let restricted = false
  let lifted = 0
  let refuse: ((deny: readonly string[], call: number) => string | undefined) | undefined
  let onRestrict: ((deny: readonly string[]) => void) | undefined
  let inactive = false
  let visibleError: Error | undefined

  const scopeError = (service: string) =>
    new Error(`cannot get required service "${service}" in inactive context`)

  const surface: ScopedSurface = {
    restrict(filter) {
      const call = restrictCalls.length
      const reason = refuse?.(filter.deny, call)
      if (reason !== undefined) {
        restrictCalls.push({ deny: filter.deny, ok: false })
        throw new Error(reason)
      }
      restrictCalls.push({ deny: filter.deny, ok: true })
      applied = filter.deny
      restricted = true
      // 真实顺序：先应用掩码，再同步广播 tools/change，最后才把 disposer 返给调用方。
      // 插件层的 refresh() 就在这一行里重入 reconcile()（I6 的现场）。
      onRestrict?.(filter.deny)
      return () => {
        if (inactive) throw scopeError('tools')
        lifted += 1
        applied = []
        restricted = false
      }
    },
    guard(guard) {
      guardCalls.push(guard)
      activeGuards.push(guard)
      return () => {
        if (inactive) throw scopeError('tools')
        const index = activeGuards.indexOf(guard)
        if (index >= 0) activeGuards.splice(index, 1)
      }
    },
    section(section) {
      sectionCalls.push(section)
      sections.set(section.name, section)
      return () => {
        if (inactive) throw scopeError('systemPrompt')
        sections.delete(section.name)
      }
    },
    visibleNames: () => {
      if (visibleError !== undefined) throw visibleError
      return names.filter((name) => !applied.includes(name))
    },
    sectionOrder: (name) => {
      if (name !== 'MCP_SERVERS') throw new Error(`意外的段顺序名：${name}`)
      return order
    },
  }

  return {
    surface,
    restrictCalls,
    sectionCalls,
    guardCalls,
    activeGuards,
    get restricted(): boolean {
      return restricted
    },
    get lifted(): number {
      return lifted
    },
    /** 已装上的遮蔽段段名（排序）。 */
    sectionNames: (): string[] => Array.from(sections.keys()).sort(),
    /** catalog 读数：未掩码的注册集（拷贝，避免用例之间串改）。 */
    registry: (): string[] => [...names],
    /** 模拟「名字在读与写之间从注册表消失」。 */
    drop: (name: string): void => {
      const index = names.indexOf(name)
      if (index >= 0) names.splice(index, 1)
    },
    /** 设定某次 `restrict` 的失败原因（返回字符串即抛错）。 */
    setRefuse: (next: ((deny: readonly string[], call: number) => string | undefined) | undefined): void => {
      refuse = next
    },
    /** 设定「每次成功 restrict 返回前同步广播 change」的回调（I6）。 */
    setOnRestrict: (next: ((deny: readonly string[]) => void) | undefined): void => {
      onRestrict = next
    },
    /** 让所有 disposer 抛 `inactive context`。 */
    setInactive: (next: boolean): void => {
      inactive = next
    },
    /** 让 `visibleNames()` 抛一个非退场错误。 */
    setVisibleError: (next: Error | undefined): void => {
      visibleError = next
    },
  }
}

/**
 * 搭一个「假 surface + 假日志 + catalog 读同一份注册集」的层。
 * @param options - 注册名、初始状态与段顺序。
 * @returns 层、假 surface 与日志收集器。
 */
function harness(options: { names?: readonly string[]; order?: number } = {}) {
  const fake = fakeSurface(options)
  const { log, infos, warnings, errors } = recordingLog()
  const ports: SessionLayerPorts = {
    log,
    catalog: () => fake.registry(),
    openSurface: async (_agent, use) => {
      use(fake.surface)
    },
  }
  return { layer: new SessionLayer(ports), fake, log, infos, warnings, errors }
}

describe('attach：首轮掩码、遮蔽段与守卫', () => {
  it('首轮掩码在 attach 返回前已生效（供 agent/created await）', async () => {
    const fake = fakeSurface({ names: ['mcp__a__x', 'mcp__a__y', 'bash'] })
    const layer = new SessionLayer({
      log: QUIET_LOG,
      catalog: () => fake.registry(),
      // 延迟一个微任务才交付工具面：attach 必须等它，否则 agent 的首步会看到未掩的工具。
      openSurface: async (_agent, use) => {
        await Promise.resolve()
        use(fake.surface)
      },
    })

    const pending = layer.attach(fakeAgent(), stateOf(['mcp:a']))
    expect(fake.restrictCalls).toHaveLength(0)

    await pending
    expect(fake.restrictCalls).toHaveLength(1)
    expect(fake.restrictCalls[0].deny).toEqual(['mcp__a__x', 'mcp__a__y'])
    expect(fake.restricted).toBe(true)
  })

  it('I4：遮蔽段 name 恒为 mcp:<server>、order 用 MCP_SERVERS、text 空、不插值', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a']))

    expect(fake.sectionCalls).toHaveLength(1)
    expect(fake.sectionCalls[0]).toEqual({
      name: 'mcp:a',
      order: MCP_SERVERS_ORDER,
      text: '',
      interpolate: false,
    })
  })

  it('I1：guard 只装一次，且闭包读实时关闭集', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x', 'workflow'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a']))

    // 重算与状态变更都不重装守卫。
    layer.refresh()
    layer.refresh()
    layer.setState(stateOf(['mcp:a', 'tool:workflow']))
    expect(fake.guardCalls).toHaveLength(1)

    const guard = fake.guardCalls[0]
    // 关闭集变了，同一个守卫闭包的判定随之改变（免重装、免窗口）。
    expect(guard({ name: 'workflow' })).toContain('已在本会话被')
    expect(guard({ name: 'mcp__a__x' })).toContain('已在本会话被')
    expect(guard({ name: 'bash' })).toBeUndefined()
  })

  it('服务器断线（无匹配名字）时只装遮蔽段，guard 仍拦', async () => {
    const { layer, fake } = harness({ names: ['bash'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a']))

    // deny 只含读数里真实出现的名字：没有名字就没有 restrict 调用（未知名会抛错）。
    expect(fake.restrictCalls).toHaveLength(0)
    expect(fake.sectionNames()).toEqual(['mcp:a'])
    expect(fake.guardCalls[0]({ name: 'mcp__a__x' })).toContain('已在本会话被')
    expect(layer.snapshot()).toEqual({ deny: [], shadowServers: ['a'], visible: ['bash'] })
  })

  it('单工具关闭只摘 schema，不装遮蔽段（D2）', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x', 'mcp__a__y'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a::x']))

    expect(fake.restrictCalls[0].deny).toEqual(['mcp__a__x'])
    expect(fake.sectionCalls).toHaveLength(0)
    expect(layer.snapshot().shadowServers).toEqual([])
  })

  it('snapshot / visibleNames 报一手事实（掩码后该 agent 看不到被关的名字）', async () => {
    const { layer } = harness({ names: ['mcp__a__x', 'mcp__a__y', 'bash'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a']))

    expect(layer.snapshot()).toEqual({
      deny: ['mcp__a__x', 'mcp__a__y'],
      shadowServers: ['a'],
      visible: ['bash'],
    })
    expect(layer.visibleNames()).toEqual(['bash'])
  })
})

describe('diff 守卫（I2）', () => {
  it('同一 deny 集的二次 refresh 不产生新的 restrict 调用', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x', 'mcp__a__y', 'bash'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a']))
    expect(fake.restrictCalls).toHaveLength(1)

    // 第一轮掩码已让名字从 visibleNames 消失；carried 把它们带过这一轮，否则会振荡。
    layer.refresh()
    layer.refresh()

    expect(fake.restrictCalls).toHaveLength(1)
    expect(fake.sectionCalls).toHaveLength(1)
    expect(fake.lifted).toBe(0)
  })

  it('二次 refresh 前改 disabled → restrict 调用数 === 2 且新 deny 正确', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x', 'mcp__b__y', 'bash'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a']))
    expect(fake.restrictCalls).toHaveLength(1)

    layer.setState(stateOf(['mcp:a', 'mcp:b']))

    expect(fake.restrictCalls).toHaveLength(2)
    expect(fake.restrictCalls[1].deny).toEqual(['mcp__a__x', 'mcp__b__y'])
    expect(fake.sectionNames()).toEqual(['a', 'b'].map((server) => `mcp:${server}`))
  })

  it('setState 传同内容的另一份状态：不重装', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x', 'bash'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a']))

    layer.setState(stateOf(['mcp:a']))

    expect(fake.restrictCalls).toHaveLength(1)
  })

  it('deny 不变、只有遮蔽段变化时不重装掩码', async () => {
    // 服务器只有一个工具 x：先单工具关 x，再把整组关掉 —— deny 仍是 {x}，但多了遮蔽段。
    const { layer, fake } = harness({ names: ['mcp__a__x', 'bash'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a::x']))
    expect(fake.restrictCalls).toHaveLength(1)
    expect(fake.sectionCalls).toHaveLength(0)

    layer.setState(stateOf(['mcp:a::x', 'mcp:a']))

    expect(fake.restrictCalls).toHaveLength(1)
    expect(fake.sectionNames()).toEqual(['mcp:a'])
    expect(layer.snapshot().shadowServers).toEqual(['a'])
  })

  it('撤掉整组关闭：掩码缩小、对应遮蔽段撤掉', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x', 'mcp__b__y'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a', 'mcp:b']))
    expect(fake.sectionNames()).toEqual(['mcp:a', 'mcp:b'])

    layer.setState(stateOf(['mcp:a']))

    expect(fake.restrictCalls).toHaveLength(2)
    expect(fake.restrictCalls[1].deny).toEqual(['mcp__a__x'])
    expect(fake.sectionNames()).toEqual(['mcp:a'])
  })
})

describe('I3：restrict 抛错 → 从活读数重推并重试一次', () => {
  it('名字在读与写之间消失：重试一次成功，deny 不含消失的名字', async () => {
    const fake = fakeSurface({ names: ['mcp__a__x', 'mcp__a__y'] })
    fake.setRefuse((_deny, call) => {
      if (call > 0) return undefined
      // 模拟注册表在 catalog 读与 restrict 写之间丢掉了这个工具。
      fake.drop('mcp__a__y')
      return 'tools.restrict() names unknown global tool "mcp__a__y"'
    })
    const { log, errors } = recordingLog()
    const layer = new SessionLayer({ log, catalog: () => fake.registry(), openSurface: async (_a, use) => { use(fake.surface) } })

    await layer.attach(fakeAgent(), stateOf(['mcp:a']))

    expect(fake.restrictCalls).toHaveLength(2)
    expect(fake.restrictCalls[0]).toMatchObject({ ok: false })
    expect(fake.restrictCalls[0].deny).toEqual(['mcp__a__x', 'mcp__a__y'])
    expect(fake.restrictCalls[1]).toMatchObject({ ok: true })
    expect(fake.restrictCalls[1].deny).toEqual(['mcp__a__x'])
    expect(fake.restricted).toBe(true)
    expect(layer.snapshot().deny).toEqual(['mcp__a__x'])
    // 失败过一次，所以有且只有一条 error（重试成功不额外记错）。
    expect(errors).toHaveLength(1)
    // 遮蔽段照常装上：它由关闭集决定，与某个工具是否还在无关。
    expect(fake.sectionNames()).toEqual(['mcp:a'])
    // guard 仍能拦被关的名字（含刚刚消失的那个）。
    expect(fake.guardCalls[0]({ name: 'mcp__a__x' })).toContain('已在本会话被')
  })

  it('重试仍失败：保持无掩码（guard 仍拦）+ error 日志', async () => {
    const fake = fakeSurface({ names: ['mcp__a__x', 'mcp__a__y'] })
    fake.setRefuse((_deny, call) => {
      fake.drop('mcp__a__y')
      return call === 0
        ? 'tools.restrict() names unknown global tool "mcp__a__y"'
        : 'tools.restrict() names unknown global tool "mcp__a__x"'
    })
    const { log, errors } = recordingLog()
    const layer = new SessionLayer({ log, catalog: () => fake.registry(), openSurface: async (_a, use) => { use(fake.surface) } })

    await layer.attach(fakeAgent(), stateOf(['mcp:a']))

    expect(fake.restrictCalls).toHaveLength(2)
    expect(fake.restrictCalls.every((call) => !call.ok)).toBe(true)
    expect(fake.restricted).toBe(false)
    expect(layer.snapshot().deny).toEqual([])
    expect(errors).toHaveLength(2)
    expect(fake.activeGuards).toHaveLength(1)
    expect(fake.guardCalls[0]({ name: 'mcp__a__x' })).toContain('已在本会话被')
  })

  it('重推结果与失败组相同：跳过重试（同一组未知名字再调一次也没用）', async () => {
    const fake = fakeSurface({ names: ['mcp__a__x'] })
    fake.setRefuse(() => 'tools.restrict() names unknown global tool "mcp__a__x"')
    const { log, errors } = recordingLog()
    const layer = new SessionLayer({ log, catalog: () => fake.registry(), openSurface: async (_a, use) => { use(fake.surface) } })

    await layer.attach(fakeAgent(), stateOf(['mcp:a']))

    expect(fake.restrictCalls).toHaveLength(1)
    expect(fake.restricted).toBe(false)
    expect(errors.some((message) => message.includes('跳过重试'))).toBe(true)
  })
})

describe('I6：restrict 同步触发 tools/change 的重入幂等（R26）', () => {
  it('restrict 返回 dispose 前同步回调 refresh：不递归、能返回、deny 记账正确', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x', 'mcp__a__y', 'bash'] })
    let echoes = 0
    fake.setOnRestrict(() => {
      echoes += 1
      // 兜底阀：若重入闸失效，这里会在 50 次后抛错而不是把测试进程拖进栈溢出。
      if (echoes > 50) throw new Error('重入未收敛：restrict 同步回声超过 50 次')
      // 模拟 dsh-scope 的 ScopedLayers.effect：在 restrict() 返回 disposer 之前同步
      // 广播 tools/change，装配层监听器同步回调本层 refresh()。
      layer.refresh()
    })

    await layer.attach(fakeAgent(), stateOf(['mcp:a']))

    // 回声确实发生过（用例不是空转），但只允许一次真实的 restrict。
    expect(echoes).toBe(1)
    expect(fake.restrictCalls).toHaveLength(1)
    expect(fake.restrictCalls[0].deny).toEqual(['mcp__a__x', 'mcp__a__y'])
    expect(fake.restricted).toBe(true)
    // 记账是「已装上」的那一组，不是重入时的旧值。
    expect(layer.snapshot()).toMatchObject({
      deny: ['mcp__a__x', 'mcp__a__y'],
      shadowServers: ['a'],
    })
    // 闸没有卡死：锁已释放，之后独立的 refresh 仍是幂等 no-op。
    expect(() => layer.refresh()).not.toThrow()
    expect(fake.restrictCalls).toHaveLength(1)
  })

  it('连续两次真实 setState（不同 deny）仍各触发一次 restrict（闸不吞合法变化）', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x', 'mcp__b__y', 'bash'] })
    // 每次成功的 restrict 都同步广播一次 change，模拟生产环境。
    fake.setOnRestrict(() => layer.refresh())

    await layer.attach(fakeAgent(), stateOf(['mcp:a']))
    expect(fake.restrictCalls).toHaveLength(1)

    // setState 不在 reconcile 的同步栈里：重入闸必须放行，两次变化各装一次掩码。
    layer.setState(stateOf(['mcp:b']))
    layer.setState(stateOf(['mcp:a', 'mcp:b']))

    expect(fake.restrictCalls).toHaveLength(3)
    expect(fake.restrictCalls[1].deny).toEqual(['mcp__b__y'])
    expect(fake.restrictCalls[2].deny).toEqual(['mcp__a__x', 'mcp__b__y'])
    expect(layer.snapshot().deny).toEqual(['mcp__a__x', 'mcp__b__y'])
  })

  it('I3 重试路径不被闸挡住：首次 restrict 抛错 → 重推 → 重试一次成功', async () => {
    const fake = fakeSurface({ names: ['mcp__a__x', 'mcp__a__y'] })
    fake.setRefuse((_deny, call) => {
      if (call > 0) return undefined
      // 模拟注册表在 catalog 读与 restrict 写之间丢掉了这个工具。
      fake.drop('mcp__a__y')
      return 'tools.restrict() names unknown global tool "mcp__a__y"'
    })
    const { log, errors } = recordingLog()
    const layer = new SessionLayer({
      log,
      catalog: () => fake.registry(),
      openSurface: async (_a, use) => {
        use(fake.surface)
      },
    })
    // 成功的那次（即 I3 的重试）同样在返回 disposer 前同步广播 change。
    fake.setOnRestrict(() => layer.refresh())

    await layer.attach(fakeAgent(), stateOf(['mcp:a']))

    // 闸在 reconcile 入口，因此同一轮里的重试照常发生：共两次调用，第二次成功。
    expect(fake.restrictCalls).toHaveLength(2)
    expect(fake.restrictCalls[0]).toMatchObject({ ok: false })
    expect(fake.restrictCalls[1]).toMatchObject({ ok: true })
    expect(fake.restrictCalls[1].deny).toEqual(['mcp__a__x'])
    expect(fake.restricted).toBe(true)
    expect(layer.snapshot().deny).toEqual(['mcp__a__x'])
    // 失败过一次，重试成功不额外记错。
    expect(errors).toHaveLength(1)
  })
})

describe('detach：分步容错（I5）', () => {
  it('抬掩码、撤 section、撤 guard 并清账，二次 detach 是 no-op', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x', 'mcp__b__y'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a', 'mcp:b']))
    expect(fake.restricted).toBe(true)

    layer.detach()

    expect(fake.restricted).toBe(false)
    expect(fake.sectionNames()).toEqual([])
    expect(fake.activeGuards).toHaveLength(0)
    expect(layer.snapshot()).toEqual({ deny: [], shadowServers: [], visible: [] })
    expect(layer.visibleNames()).toEqual([])

    expect(() => layer.detach()).not.toThrow()
    expect(fake.restrictCalls).toHaveLength(1)
  })

  it('surface 抛 inactive context 时 detach 不抛、静默，后续状态变更也不抛', async () => {
    const { layer, fake, errors, warnings } = harness({ names: ['mcp__a__x'] })
    await layer.attach(fakeAgent(), stateOf(['mcp:a']))
    fake.setInactive(true)

    expect(() => layer.detach()).not.toThrow()
    // 退场不是失败：既不该记 error，也不该告警。
    expect(errors).toHaveLength(0)
    expect(warnings).toHaveLength(0)
    expect(layer.snapshot()).toEqual({ deny: [], shadowServers: [], visible: [] })

    expect(() => layer.refresh()).not.toThrow()
    expect(() => layer.setState(stateOf(['mcp:a']))).not.toThrow()
    expect(fake.restrictCalls).toHaveLength(1)
  })

  it('detach 之后 setState / refresh 不再碰工具面', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x'] })
    await layer.attach(fakeAgent(), stateOf([]))
    layer.detach()

    layer.setState(stateOf(['mcp:a']))
    layer.refresh()

    expect(fake.restrictCalls).toHaveLength(0)
    expect(fake.guardCalls).toHaveLength(1)
  })
})

describe('退场与读数失败', () => {
  it('catalog 读抛 inactive context：不抛、不记 error，并停止后续重算', async () => {
    let catalogCalls = 0
    const { log, errors } = recordingLog()
    const layer = new SessionLayer({
      log,
      catalog: () => {
        catalogCalls += 1
        throw new Error('cannot get required service "tools" in inactive context')
      },
      openSurface: async (_agent, use) => {
        use(fakeSurface().surface)
      },
    })

    await expect(layer.attach(fakeAgent(), stateOf(['mcp:a']))).resolves.toBeUndefined()
    expect(() => layer.refresh()).not.toThrow()

    expect(catalogCalls).toBe(1)
    expect(errors).toHaveLength(0)
  })

  it('读视图失败（非退场）：降级为空读数、记一条 error，不抛', async () => {
    const { layer, fake, errors } = harness({ names: ['mcp__a__x'] })
    fake.setVisibleError(new Error('boom'))
    await layer.attach(fakeAgent(), stateOf(['mcp:a']))

    // catalog 仍给出名字，所以掩码照样生效；只是一次读数失败被记下来了。
    expect(errors.some((message) => message.includes('读本会话的工具视图失败'))).toBe(true)
    expect(fake.restrictCalls[0].deny).toEqual(['mcp__a__x'])
  })
})

describe('agentSurface：子 fiber 内的生产适配', () => {
  /** 一个假 agent.ctx：记录 inject 的依赖名并同步交付服务面。 */
  function fakeAgentContext(names: readonly string[]) {
    const calls = {
      deps: [] as string[][],
      restrict: [] as (readonly string[])[],
      guards: 0,
      sections: [] as SectionInput[],
      orderNames: [] as string[],
      schemaScopes: [] as unknown[],
    }
    const serviceScope = {
      tools: {
        restrict: (filter: { readonly deny: readonly string[] }) => {
          calls.restrict.push(filter.deny)
          return () => {}
        },
        guard: () => {
          calls.guards += 1
          return () => {}
        },
        schemas: (scope?: object) => {
          calls.schemaScopes.push(scope)
          return names.map((name) => ({ name }))
        },
      },
      systemPrompt: {
        section: (section: SectionInput) => {
          calls.sections.push(section)
          return () => {}
        },
        getSectionOrder: (name: string) => {
          calls.orderNames.push(name)
          return MCP_SERVERS_ORDER
        },
      },
    }
    const ctx = {
      inject: (deps: readonly string[], callback: (scope: typeof serviceScope) => void) => {
        calls.deps.push([...deps])
        callback(serviceScope)
        return Promise.resolve()
      },
    }
    return { calls, ctx }
  }

  it('依赖名是 tools / systemPrompt，视图按 agent 这个 scope key 取', async () => {
    const { calls, ctx } = fakeAgentContext(['mcp__a__x'])
    const agent = fakeAgent('s1', ctx)
    const surface = await new Promise<ScopedSurface>((resolve) => {
      void agentSurface(agent, resolve)
    })

    expect(calls.deps).toEqual([['tools', 'systemPrompt']])
    expect(surface.visibleNames()).toEqual(['mcp__a__x'])
    expect(calls.schemaScopes[0]).toBe(agent)

    surface.restrict({ deny: ['mcp__a__x'] })
    expect(calls.restrict).toEqual([['mcp__a__x']])
    expect(surface.sectionOrder('MCP_SERVERS')).toBe(MCP_SERVERS_ORDER)
    expect(calls.orderNames).toEqual(['MCP_SERVERS'])
  })

  it('agent.ctx 没有 inject：以 rejected Promise 交付，由 attach 记 error 而不冒泡', async () => {
    await expect(agentSurface(fakeAgent('s9', {}), () => {})).rejects.toThrow(/inject/)

    const { log, errors, warnings } = recordingLog()
    const layer = new SessionLayer({ log, catalog: () => [] })
    await expect(layer.attach(fakeAgent('s9', {}), stateOf())).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(warnings).toHaveLength(1)
  })

  it('默认 openSurface 走 agentSurface：attach 端到端穿过假 ctx', async () => {
    const { calls, ctx } = fakeAgentContext(['mcp__a__x'])
    const layer = new SessionLayer({ log: QUIET_LOG, catalog: () => ['mcp__a__x'] })

    await layer.attach(fakeAgent('s1', ctx), stateOf(['mcp:a']))

    expect(calls.deps).toEqual([['tools', 'systemPrompt']])
    expect(calls.guards).toBe(1)
    expect(calls.restrict).toEqual([['mcp__a__x']])
    expect(calls.sections).toEqual([
      { name: 'mcp:a', order: MCP_SERVERS_ORDER, text: '', interpolate: false },
    ])
  })
})

/*
 * 技能分面（组 3 / H4）：假件与工具面的同款纪律——只实现本层真正调用的三个方法
 * （register / get / snapshot），并把「调用方句柄」「get 的作用域与信号」「register 的入参」
 * 全部记账。因此 D-2（stub 全量复制）、D-3（经子 fiber 句柄）、D-4（同步返回 + 有界收敛）、
 * D-5（同步先取 + 软 fiber 不 await）与 H4 的时序纪律都能用计数与身份直接断言。
 */

/** 一个可控结算的 Promise（把「取正文」卡在在途状态，观察 `setState` 的同步窗口）。 */
function deferred<T = void>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 假技能定义：字段填满，便于断言 stub 复制了全量字段（D-2）。 */
function skillOf(name: string, overrides: Partial<SkillDefinitionLike> = {}): SkillDefinitionLike {
  return {
    name,
    description: `${name} 的描述`,
    content: `${name} 的完整正文`,
    source: 'filesystem',
    provider: 'filesystem',
    path: `/skills/${name}/SKILL.md`,
    whenToUse: `当需要 ${name} 时`,
    resourceBase: { kind: 'directory', path: `/skills/${name}` },
    metadata: { marker: name },
    invocation: { modelInvocable: true, userInvocable: true },
    ...overrides,
  }
}

/** 从定义里摘出宿主 `SkillSummary` 形状（清单观测用；不含 `content`）。 */
function summaryOf(
  definition: SkillDefinitionLike,
  overrides: Partial<SkillSummaryLike> = {},
): SkillSummaryLike {
  return {
    name: definition.name,
    description: definition.description,
    invocation: definition.invocation,
    source: definition.source,
    provider: definition.provider,
    path: definition.path,
    whenToUse: definition.whenToUse,
    resourceBase: definition.resourceBase,
    metadata: definition.metadata,
    ...overrides,
  }
}

/** 一次 `register` 的记录。 */
interface SkillRegisterCall {
  /** register 的入参（stub 形状）。 */
  readonly skill: Parameters<SkillServiceLike['register']>[0]
  /** 被调用的服务对象（断言它就是 inject 交付的子 fiber 句柄里的那一份）。 */
  readonly receiver: SkillServiceLike
}

/** 一次 `get` 的记录。 */
interface SkillGetCall {
  readonly name: string
  readonly options: Parameters<SkillServiceLike['get']>[1]
}

/**
 * 假技能服务：register / get / snapshot 全部记账。
 * @param options - 初始定义、清单观测、完整性、同层先到先得、在途闸门与失败注入。
 * @returns 假句柄、调用记录与几个测试钩子。
 */
function fakeSkillScope(
  options: {
    definitions?: readonly SkillDefinitionLike[]
    catalog?: readonly SkillSummaryLike[]
    complete?: boolean
    firstWins?: boolean
    holdGet?: Promise<void>
    getError?: Error
  } = {},
) {
  const definitions = new Map(
    (options.definitions ?? []).map((definition) => [definition.name, definition]),
  )
  let catalog = [
    ...(options.catalog ?? (options.definitions ?? []).map((definition) => summaryOf(definition))),
  ]
  let complete = options.complete ?? true
  const registerCalls: SkillRegisterCall[] = []
  const getCalls: SkillGetCall[] = []
  const snapshotCalls: { readonly scope?: object }[] = []
  const disposed: string[] = []
  const throwingDisposers = new Set<string>()
  const registered = new Map<string, SkillSummaryLike>()

  const skills: SkillServiceLike = {
    register(skill) {
      registerCalls.push({ skill, receiver: skills })
      // 同层先到先得：上游 warn + 返回 no-op disposer，且不进入清单。
      if (options.firstWins === true) return () => {}
      registered.set(skill.name, {
        name: skill.name,
        description: skill.description,
        invocation: skill.invocation ?? { modelInvocable: true, userInvocable: true },
        source: skill.source,
        provider: skill.provider,
        path: skill.path,
        whenToUse: skill.whenToUse,
        resourceBase: skill.resourceBase,
        metadata: skill.metadata,
      })
      return () => {
        if (throwingDisposers.has(skill.name)) throw new Error(`dispose ${skill.name} 失败`)
        disposed.push(skill.name)
        registered.delete(skill.name)
      }
    },
    async get(name, getOptions) {
      getCalls.push({ name, options: getOptions })
      await options.holdGet
      if (options.getError !== undefined) throw options.getError
      return definitions.get(name)
    },
    async snapshot(snapshotOptions) {
      snapshotCalls.push({ scope: snapshotOptions?.scope })
      const merged = new Map(catalog.map((summary) => [summary.name, summary]))
      for (const [name, summary] of registered) merged.set(name, summary)
      return {
        skills: Array.from(merged.values()).sort((left, right) =>
          left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
        ),
        complete,
      }
    },
  }

  const scope: SkillScopeHandle = { skills }

  return {
    scope,
    skills,
    registerCalls,
    getCalls,
    snapshotCalls,
    disposed,
    /** 这些技能的 disposer 抛错（驱动 detach 的分步容错）。 */
    setDisposeThrows(names: readonly string[]): void {
      throwingDisposers.clear()
      for (const name of names) throwingDisposers.add(name)
    },
    /** 替换清单观测（可同时改完整性，驱动 R3 ④ 的「不把缺席当删除」）。 */
    setCatalog(next: readonly SkillSummaryLike[], nextComplete = true): void {
      catalog = [...next]
      complete = nextComplete
    },
  }
}

/**
 * 假 agent 上下文：`get` 与 `inject` 分别可控。
 *
 * - `immediate`：同步 `get('skills')` 的返回（undefined = 服务晚到，只能走软 fiber）；
 * - `fiber`：`inject(['skills'], cb)` 交付的句柄（undefined = 永不交付，模拟未装 `dsh-skill`）；
 * - `deliverImmediately: false`：测试手动 `deliver()`；
 * - `neverSettles`：`inject` 返回永不结算的 thenable（验证 `attach` 不 await fiber，D-5）。
 * @param options - 同步服务、fiber 句柄与结算行为。
 * @returns 假 ctx、inject 依赖记录、监听器记录与手动驱动钩子。
 */
function fakeSkillAgentContext(options: {
  immediate?: SkillServiceLike
  fiber?: SkillScopeHandle
  deliverImmediately?: boolean
  neverSettles?: boolean
}) {
  const injectDeps: string[][] = []
  const listeners: (() => void)[] = []
  let pendingDelivery: (() => void) | undefined

  const ctx = {
    get(name: string): unknown {
      return name === 'skills' ? options.immediate : undefined
    },
    inject(
      names: readonly string[],
      callback: (scope: SkillScopeHandle) => void,
    ): PromiseLike<unknown> {
      injectDeps.push([...names])
      const deliver = (): void => {
        if (options.fiber !== undefined) callback(options.fiber)
      }
      if (options.deliverImmediately ?? true) deliver()
      else pendingDelivery = deliver
      if (options.neverSettles === true) return new Promise<unknown>(() => {})
      return Promise.resolve()
    },
    on(name: string, listener: () => void): () => void {
      if (name !== 'skills/change') throw new Error(`意外的监听事件：${name}`)
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
  }

  return {
    ctx,
    injectDeps,
    listeners,
    /** 交付晚到的 fiber（配 `deliverImmediately: false`）。 */
    deliver(): void {
      pendingDelivery?.()
    },
    /** 模拟 skills/change：按 H4 只应刷新清单缓存，不应触发注册。 */
    emitSkillsChange(): void {
      for (const listener of [...listeners]) listener()
    },
  }
}

/**
 * 等一个宏任务，让 fire-and-forget 的清单刷新结算。
 *
 * 刻意不用 `skillsSettled()`：清单刷新不在它的等待面内（它的有界性只覆盖取正文），
 * 这里验证的是「skills/change 之后缓存确实更新」。
 * @returns 下一个宏任务后 resolve。
 */
function flushCatalog(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('技能分面（H4 / D-2 / D-3 / D-4 / D-5）', () => {
  it('无 skills 服务：工具掩码照常生效，技能分面报告不可用（关键回归）', async () => {
    const { layer, fake } = harness({ names: ['mcp__a__x', 'bash'] })

    await layer.attach(fakeAgent('s1', {}), stateOf(['mcp:a', 'skill:x']))

    // 技能分面缺席只让技能地址「只记意图」，工具掩码照旧生效。
    expect(layer.snapshot().deny).toEqual(['mcp__a__x'])
    expect(fake.restrictCalls).toHaveLength(1)
    expect(layer.skills()).toEqual({ available: false, shadowed: [], visible: [] })
    await expect(layer.skillsSettled()).resolves.toBeUndefined()
  })

  it('同步先取：attach 返回时 stub 已注册、清单已刷新（D-5 常态路径）', async () => {
    const skills = fakeSkillScope({ definitions: [skillOf('x')] })
    const agentCtx = fakeSkillAgentContext({ immediate: skills.skills, fiber: skills.scope })
    const { layer } = harness()
    const agent = fakeAgent('s1', agentCtx.ctx)

    await layer.attach(agent, stateOf(['skill:x']))

    expect(layer.skills().available).toBe(true)
    expect(layer.skills().shadowed).toEqual(['x'])
    // 影子前定义按 agent 作用域取，且带 AbortSignal（2s 上限由实现常量给出）。
    expect(skills.getCalls).toHaveLength(1)
    expect(skills.getCalls[0].options?.scope).toBe(agent)
    expect(skills.getCalls[0].options?.signal).toBeInstanceOf(AbortSignal)
    expect(skills.snapshotCalls[0]?.scope).toBe(agent)
    // 软 fiber 仍装上（刷新句柄）；结算后不重复注册。
    expect(agentCtx.injectDeps).toEqual([['skills']])
    await layer.skillsSettled()
    expect(skills.registerCalls).toHaveLength(1)
  })

  it('软 fiber 晚到补挂：register 经 inject 交付的子 fiber 句柄调用（D-3）', async () => {
    const skills = fakeSkillScope({ definitions: [skillOf('x')] })
    const agentCtx = fakeSkillAgentContext({
      immediate: undefined,
      fiber: skills.scope,
      deliverImmediately: false,
    })
    const { layer } = harness()

    await layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf(['skill:x']))

    // fiber 未交付：不注册、不阻塞 attach，available 如实报 false。
    expect(agentCtx.injectDeps).toEqual([['skills']])
    expect(skills.registerCalls).toHaveLength(0)
    expect(layer.skills()).toMatchObject({ available: false, shadowed: [] })

    agentCtx.deliver()
    await layer.skillsSettled()

    expect(skills.registerCalls).toHaveLength(1)
    // 调用方就是 inject 回调交付的那一份服务（agent 子 fiber 的 scope），不是缓存的服务。
    expect(skills.registerCalls[0].receiver).toBe(skills.skills)
    expect(layer.skills()).toMatchObject({ available: true, shadowed: ['x'] })
  })

  it('软 fiber 永不结算（未装 dsh-skill）也不阻塞 attach（D-5）', async () => {
    const agentCtx = fakeSkillAgentContext({ immediate: undefined, neverSettles: true })
    const { layer, fake } = harness({ names: ['mcp__a__x'] })

    await expect(
      layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf(['mcp:a'])),
    ).resolves.toBeUndefined()

    expect(fake.restrictCalls).toHaveLength(1)
    expect(agentCtx.injectDeps).toEqual([['skills']])
    expect(layer.skills().available).toBe(false)
  })

  it('setState 同步返回后 shadowed 不含新名；await skillsSettled() 后含（D-4）', async () => {
    const hold = deferred()
    const real = skillOf('x')
    const skills = fakeSkillScope({ definitions: [real], holdGet: hold.promise })
    const agentCtx = fakeSkillAgentContext({ immediate: skills.skills, fiber: skills.scope })
    const { layer } = harness()

    await layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf([]))
    expect(skills.registerCalls).toHaveLength(0)

    layer.setState(stateOf(['skill:x']))
    // 同步返回：取正文还在途，stub 尚未注册（回执必须等 skillsSettled）。
    expect(layer.skills().shadowed).not.toContain('x')

    hold.resolve()
    await layer.skillsSettled()

    expect(layer.skills().shadowed).toContain('x')
    expect(skills.registerCalls).toHaveLength(1)
    // D-2：stub 复制真实定义全量字段，只把 invocation 改成「模型不可见、手动可调」。
    const stub = skills.registerCalls[0].skill
    expect(stub.invocation).toEqual({ modelInvocable: false, userInvocable: true })
    expect(stub).toMatchObject({
      name: real.name,
      description: real.description,
      content: real.content,
      source: real.source,
      provider: real.provider,
      path: real.path,
      whenToUse: real.whenToUse,
      resourceBase: real.resourceBase,
      metadata: real.metadata,
    })
  })

  it('重复 setState 同一状态不重复注册（diff 守卫）', async () => {
    const skills = fakeSkillScope({ definitions: [skillOf('x')] })
    const agentCtx = fakeSkillAgentContext({ immediate: skills.skills, fiber: skills.scope })
    const { layer } = harness()

    await layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf(['skill:x']))
    await layer.skillsSettled()
    expect(skills.registerCalls).toHaveLength(1)
    expect(skills.getCalls).toHaveLength(1)

    layer.setState(stateOf(['skill:x']))
    await layer.skillsSettled()

    expect(skills.registerCalls).toHaveLength(1)
    // 正文已在影子前缓存里，无需再取一遍（面板描述也用它）。
    expect(skills.getCalls).toHaveLength(1)
  })

  it('整档 tool:skill 关闭：registerCalls === 0，且原 stub 立即 dispose（A8/D-16）', async () => {
    const skills = fakeSkillScope({ definitions: [skillOf('x')] })
    const agentCtx = fakeSkillAgentContext({ immediate: skills.skills, fiber: skills.scope })
    const { layer } = harness()

    // 首挂即整档关闭：计划为空 → 不取正文、不注册。
    await layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf(['skill:x', 'tool:skill']))
    await layer.skillsSettled()
    expect(skills.registerCalls).toHaveLength(0)
    expect(skills.getCalls).toHaveLength(0)
    expect(layer.skills().shadowed).toEqual([])

    // 重新打开整档：按关闭集补注册。
    layer.setState(stateOf(['skill:x']))
    await layer.skillsSettled()
    expect(skills.registerCalls).toHaveLength(1)
    expect(skills.disposed).toEqual([])

    // 再关整档：撤是同步的（不等 skillsSettled），register 次数不增加。
    layer.setState(stateOf(['skill:x', 'tool:skill']))
    expect(layer.skills().shadowed).toEqual([])
    expect(skills.disposed).toEqual(['x'])
    expect(skills.registerCalls).toHaveLength(1)
  })

  it('同层先到先得：register 返回 no-op → shadowed 为空、记 skill-shadow-failed（F8）', async () => {
    const real = skillOf('x')
    // 清单里同名条目属于另一个 runtime stub（provider 已不是影子前那一个）。
    const occupied = summaryOf(real, { provider: 'runtime' })
    const skills = fakeSkillScope({ definitions: [real], catalog: [occupied], firstWins: true })
    const agentCtx = fakeSkillAgentContext({ immediate: skills.skills, fiber: skills.scope })
    const { layer, warnings, errors } = harness()

    await layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf(['skill:x']))
    await layer.skillsSettled()

    // 调用过 register，但没胜出：本层不记账（面板据此禁用该行）。
    expect(skills.registerCalls).toHaveLength(1)
    expect(layer.skills().shadowed).toEqual([])
    expect(warnings.some((message) => message.includes('skill-shadow-failed'))).toBe(true)
    expect(errors).toHaveLength(0)
    // 该行仍出现在可见清单里（它是同层先占者的真实条目，不是本层的影子）。
    expect(layer.skills().visible.map((summary) => summary.name)).toEqual(['x'])
  })

  it('代数守卫：取正文期间状态又变 → 旧轮作废，不注册过期 stub', async () => {
    const hold = deferred()
    const skills = fakeSkillScope({ definitions: [skillOf('x')], holdGet: hold.promise })
    const agentCtx = fakeSkillAgentContext({ immediate: skills.skills, fiber: skills.scope })
    const { layer } = harness()

    await layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf([]))

    layer.setState(stateOf(['skill:x']))
    layer.setState(stateOf([])) // 立刻反悔：旧一轮回来时必须作废

    hold.resolve()
    await layer.skillsSettled()

    expect(layer.skills().shadowed).toEqual([])
    expect(skills.registerCalls).toHaveLength(0)
  })

  it('skills/change 只刷新清单缓存；tools/change 不触发技能收敛（H4）', async () => {
    const skills = fakeSkillScope({ definitions: [skillOf('x')] })
    const agentCtx = fakeSkillAgentContext({ immediate: skills.skills, fiber: skills.scope })
    const { layer } = harness({ names: ['mcp__a__x'] })

    await layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf([]))
    await layer.skillsSettled()
    const registersBefore = skills.registerCalls.length
    const getsBefore = skills.getCalls.length

    // tools/change：只重算工具掩码，不碰技能分面。
    layer.refresh()
    await layer.skillsSettled()
    expect(skills.registerCalls).toHaveLength(registersBefore)
    expect(skills.getCalls).toHaveLength(getsBefore)

    // skills/change：只刷新清单缓存，不触发注册。
    skills.setCatalog([summaryOf(skillOf('x')), summaryOf(skillOf('y'))])
    agentCtx.emitSkillsChange()
    await flushCatalog()

    expect(layer.skills().visible.map((summary) => summary.name)).toEqual(['x', 'y'])
    expect(skills.registerCalls).toHaveLength(registersBefore)
    expect(skills.getCalls).toHaveLength(getsBefore)
  })

  it('snapshot.complete === false：保留旧条目，不把缺席当删除（R3 ④）', async () => {
    const skills = fakeSkillScope({ definitions: [skillOf('x'), skillOf('y')] })
    const agentCtx = fakeSkillAgentContext({ immediate: skills.skills, fiber: skills.scope })
    const { layer } = harness()

    await layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf([]))
    expect(layer.skills().visible.map((summary) => summary.name)).toEqual(['x', 'y'])

    // 不完整观测里 y 缺席：面板不该闪掉它（上游同样保留上一份可用目录）。
    skills.setCatalog([summaryOf(skillOf('x'))], false)
    agentCtx.emitSkillsChange()
    await flushCatalog()

    expect(layer.skills().visible.map((summary) => summary.name)).toEqual(['x', 'y'])
  })

  it('detach 逐个 dispose 影子 stub：一个抛错不阻止其余清理（H4/I5）', async () => {
    const skills = fakeSkillScope({ definitions: [skillOf('x'), skillOf('y')] })
    const agentCtx = fakeSkillAgentContext({ immediate: skills.skills, fiber: skills.scope })
    const { layer, errors } = harness({ names: ['mcp__a__x'] })

    await layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf(['skill:x', 'skill:y', 'mcp:a']))
    await layer.skillsSettled()
    expect(layer.skills().shadowed).toEqual(['x', 'y'])

    skills.setDisposeThrows(['x'])
    expect(() => layer.detach()).not.toThrow()

    // x 的 disposer 抛错只记一条 error；y 照常撤掉，层账也全部清空。
    expect(skills.disposed).toEqual(['y'])
    expect(layer.skills()).toEqual({ available: false, shadowed: [], visible: [] })
    expect(errors.some((message) => message.includes('撤掉技能 x 的影子 stub 失败'))).toBe(true)
  })

  it('未安装技能：get 返回 undefined 时留作意图，不注册、不抛', async () => {
    const skills = fakeSkillScope({ definitions: [] })
    const agentCtx = fakeSkillAgentContext({ immediate: skills.skills, fiber: skills.scope })
    const { layer, errors } = harness()

    await layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf(['skill:ghost']))
    await layer.skillsSettled()

    // 同步首轮与 fiber 晚到补挂各会尝试一次取正文；两次都拿不到定义 → 只留意图。
    expect(skills.getCalls.length).toBeGreaterThanOrEqual(1)
    expect(skills.getCalls.every((call) => call.name === 'ghost')).toBe(true)
    expect(skills.registerCalls).toHaveLength(0)
    expect(layer.skills().shadowed).toEqual([])
    expect(errors).toHaveLength(0)
  })

  it('取正文失败（超时 / 服务异常）：不注册、不抛，记一条 error', async () => {
    const skills = fakeSkillScope({
      definitions: [skillOf('x')],
      getError: new Error('The operation was aborted due to timeout'),
    })
    const agentCtx = fakeSkillAgentContext({ immediate: skills.skills, fiber: skills.scope })
    const { layer, errors } = harness()

    await layer.attach(fakeAgent('s1', agentCtx.ctx), stateOf(['skill:x']))
    await expect(layer.skillsSettled()).resolves.toBeUndefined()

    expect(skills.registerCalls).toHaveLength(0)
    expect(layer.skills().shadowed).toEqual([])
    expect(errors.some((message) => message.includes('取技能 x 的正文失败'))).toBe(true)
  })
})
