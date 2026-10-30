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
