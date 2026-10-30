/**
 * 控制内核测试（规范：dsh-session-tool-toggle —— `control.ts` 的四个用例与两条纪律）。
 *
 * 全部用例都在**假 `ControlDeps`** 上驱动，不拉起宿主、不读写真实 `$DSH_HOME`：
 * 状态端口（`StateStore`）、层句柄（`LayerHandle`）、默认档 IO（`DefaultsIo`）与全局层
 * 读数（`catalog`）都是内存替身，因此「写了几次状态、掩码怎么变、文件里落了什么」都能
 * 直接计数断言。
 *
 * 覆盖任务 9.1 的三条主验证句：
 *
 * 1. **保护命中整单拒绝且 `store.write` 调用数为 0**：多地址命令不会留下「一半生效」；
 * 2. **0 匹配地址仍进关闭集且 `matched: 0`**：意图被记录、前缀缓存不重建（宽容语义 C10）；
 * 3. **无变化时返回快照与旧对象同引用**：`withToggled` 同引用短路，两步写入都不发生。
 *
 * 另按设计 ③.7 / D14 覆盖：全有或全无（保护 / 保留名 / 文法一次判完）、固定顺序
 * （`store.write` → `layer.setState` → 组装回执）、`writeDefaults` 失败**向上抛**
 * （供 RPC 映射 `defaults-unwritable`）、`reset` 的对称差计数、写失败降级标记、
 * 三读并集与「被其他作用域隐藏」的读数。
 */
import { describe, expect, it } from 'vitest'
import { PROTECTED_BASELINE } from '../src/host/address.ts'
import { readPanel, resetSession, toggleSession, updateDefaults } from '../src/host/control.ts'
import { planMask } from '../src/host/mask.ts'
import type {
  ControlDeps,
  DefaultsIo,
  LayerHandle,
  LayerSnapshot,
  SessionLike,
  SessionToolState,
  SpecLog,
  StateStore,
  StoreKind,
} from '../src/host/types.ts'

/** 假文件系统里的默认档绝对路径（形状与生产一致，但不指向任何真实文件）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/** 假会话的创建时间（固定值，让「创建于 / 快照来源」可断言）。 */
const CREATED_AT = 1_700_000_000_000

/**
 * 收集日志的假出口（与仓内其它套件同形）。
 * @returns 日志端口 + 三类消息数组。
 */
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

/** 构造一个最小会话（内核只读 `id` / `header` / 事件读面）。 */
function fakeSession(id = 's1'): SessionLike {
  return {
    id,
    header: { isSeeded: true, createdAt: CREATED_AT },
    constructor: Object,
    eventAt: () => undefined,
    snapshotEvents: () => [],
  }
}

/**
 * 假状态端口：整值读、记录**每一次写入尝试**（可令写入抛错以驱动降级路径）。
 *
 * 与 7.1 的命令面套件（只记成功写入）的差别：这里额外有 `writeCalls`，因为任务 9.1 的
 * 验证句问的是「调用数 0」而不是「成功数 0」——整单拒绝时连调用都不该发生。
 */
class FakeStore implements StateStore {
  /** 当前整值状态。 */
  current: SessionToolState

  /** 每一次写入**尝试**的次数（含失败）。 */
  writeCalls = 0

  /** 每一次成功写入的载荷（按顺序）。 */
  readonly writes: SessionToolState[] = []

  /** 共享事件序列（只记 `store.write` / `layer.setState`，用于断言固定顺序）。 */
  private readonly events: string[] | undefined

  /**
   * @param initial - 初始整值状态。
   * @param kind - 实际生效通道（默认 `record`）。
   * @param writeError - 注入的写入错误。
   * @param events - 共享事件序列（可选）。
   */
  constructor(
    initial: SessionToolState,
    readonly kind: StoreKind = 'record',
    private readonly writeError: Error | undefined = undefined,
    events?: string[],
  ) {
    this.current = initial
    this.events = events
  }

  /**
   * 读当前状态。
   * @returns 整值状态（同一引用）。
   */
  read(): SessionToolState {
    return this.current
  }

  /**
   * 写整值状态。
   * @param _session - 目标会话（假实现忽略）。
   * @param state - 新状态。
   */
  write(_session: SessionLike, state: SessionToolState): void {
    this.writeCalls += 1
    if (this.writeError !== undefined) throw this.writeError
    this.writes.push(state)
    this.current = state
    this.events?.push('store.write')
  }
}

/**
 * 假层句柄：按 `planMask` 的三读并集重算掩码，并让名字从 `visibleNames()` 消失。
 *
 * 与生产层同构的两个行为：掩码生效后名字从 `scoped` 消失（所以 carried 必须存在），
 * 遮蔽段只由整组关闭产生。`setState` 抛错时掩码**不更新**（模拟 restrict 失败）。
 */
class FakeLayer implements LayerHandle {
  /** 本会话最新整值状态（`setState` 收到的对象，可与回执的 `state` 做同引用断言）。 */
  applied: SessionToolState

  /** `setState` 被调用的次数（断言「没写状态就不动掩码」）。 */
  setStateCalls = 0

  /** 已生效的 deny（同时是下一轮的 carried）。 */
  private masked: readonly string[] = []

  /** 已生效的遮蔽段服务器。 */
  private sections: readonly string[] = []

  /** 共享事件序列（可选）。 */
  private readonly events: string[] | undefined

  /**
   * @param catalog - 全局层注册名。
   * @param scope - 该 agent **未**被本插件掩码时的视角名字。
   * @param initial - 初始整值状态（构造即应用一次，模拟 `attach`）。
   * @param setStateError - 注入的 `setState` 错误。
   * @param events - 共享事件序列（可选）。
   */
  constructor(
    private readonly catalog: readonly string[],
    private readonly scope: readonly string[],
    initial: SessionToolState,
    private readonly setStateError: Error | undefined = undefined,
    events?: string[],
  ) {
    this.applied = initial
    this.events = events
    this.reconcile()
  }

  /**
   * 应用新状态。
   * @param state - 新整值状态。
   */
  setState(state: SessionToolState): void {
    this.setStateCalls += 1
    if (this.setStateError !== undefined) throw this.setStateError
    this.applied = state
    this.events?.push('layer.setState')
    this.reconcile()
  }

  /**
   * 读已生效的掩码事实。
   * @returns deny / 遮蔽段 / 可见名。
   */
  snapshot(): LayerSnapshot {
    return { deny: this.masked, shadowServers: this.sections, visible: this.visibleNames() }
  }

  /**
   * 读该 agent 视角名字。
   * @returns 未被掩掉的名字。
   */
  visibleNames(): readonly string[] {
    return this.scope.filter((name) => !this.masked.includes(name))
  }

  /** 一轮重算：scoped 读「上一轮掩码之后」的视角，carried 读上一轮 deny。 */
  private reconcile(): void {
    const plan = planMask({
      catalog: this.catalog,
      scoped: this.visibleNames(),
      carried: this.masked,
      disabled: this.applied.disabled,
    })
    this.masked = plan.deny
    this.sections = plan.shadowServers
  }
}

/** 假默认档 IO：内存文件表 + 写入记录（可令写入抛错）。 */
class FakeDefaultsIo implements DefaultsIo {
  /** 路径 → 文件文本。 */
  readonly files = new Map<string, string>()

  /** 每次成功写入的载荷。 */
  readonly writes: { readonly path: string; readonly data: string }[] = []

  /** 注入的写入错误（非空时每次写入都抛，文件不变）。 */
  failWrite: Error | undefined

  /**
   * 读文件（缺失即 ENOENT，走生产同一条降级路径）。
   * @param path - 绝对路径。
   * @returns 文件文本。
   */
  async readFile(path: string): Promise<string> {
    const text = this.files.get(path)
    if (text === undefined) {
      const error = new Error(`ENOENT: 假文件系统里没有 ${path}`) as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    }
    return text
  }

  /**
   * 写文件。
   * @param path - 绝对路径。
   * @param data - 完整文件内容。
   */
  async writeFile(path: string, data: string): Promise<void> {
    if (this.failWrite !== undefined) throw this.failWrite
    this.writes.push({ path, data })
    this.files.set(path, data)
  }
}

/** 假端口的构造参数（只写用例关心的部分）。 */
interface HarnessOptions {
  /** 全局层注册名。 */
  readonly catalog?: readonly string[]
  /** 该 agent 未被掩码时的视角名字（默认与 `catalog` 相同）。 */
  readonly scope?: readonly string[]
  /** 本会话关闭集。 */
  readonly disabled?: readonly string[]
  /** 本会话创建时快照。 */
  readonly snapshot?: readonly string[]
  /** 是否已播种（默认 true）。 */
  readonly seeded?: boolean
  /** 默认档初始条目。 */
  readonly defaults?: readonly string[]
  /** 默认档文件缺失（不预置文件，走 `readDefaults` 的空档降级）。 */
  readonly defaultsMissing?: boolean
  /** 是否提供会话层（默认 true；false 用于层未就绪的降级用例）。 */
  readonly withLayer?: boolean
  /** 注入状态写入错误。 */
  readonly storeWriteError?: Error
  /** 注入 `layer.setState` 错误。 */
  readonly layerSetStateError?: Error
  /** 注入全局层读数错误。 */
  readonly catalogError?: Error
  /** 注入默认档写入错误。 */
  readonly defaultsWriteError?: Error
  /** 实际生效的持久化通道（默认 `record`）。 */
  readonly storeKind?: StoreKind
}

/** 一套假端口 + 可断言的记录。 */
interface Harness {
  readonly deps: ControlDeps
  readonly session: SessionLike
  readonly store: FakeStore
  readonly layer: FakeLayer | undefined
  readonly defaultsIo: FakeDefaultsIo
  readonly log: { readonly log: SpecLog; readonly warnings: string[]; readonly errors: string[] }
  /** `store.write` / `layer.setState` 的调用顺序（固定顺序断言用）。 */
  readonly events: string[]
}

/**
 * 构造一套假端口。
 * @param options - 只覆盖用例关心的字段。
 * @returns 端口、会话与可断言的记录。
 */
function harness(options: HarnessOptions = {}): Harness {
  const session = fakeSession()
  const catalog = options.catalog ?? []
  const scope = options.scope ?? catalog
  const initial: SessionToolState = {
    version: 1,
    disabled: options.disabled ?? [],
    snapshot: options.snapshot ?? [],
    seeded: options.seeded ?? true,
    updatedAt: CREATED_AT,
  }

  const events: string[] = []
  const store = new FakeStore(initial, options.storeKind ?? 'record', options.storeWriteError, events)
  const layer =
    options.withLayer === false
      ? undefined
      : new FakeLayer(catalog, scope, initial, options.layerSetStateError, events)

  const defaultsIo = new FakeDefaultsIo()
  if (options.defaultsMissing !== true) {
    defaultsIo.files.set(
      DEFAULTS_PATH,
      JSON.stringify({ version: 1, disabled: options.defaults ?? [] }),
    )
  }
  defaultsIo.failWrite = options.defaultsWriteError

  const recorded = recordingLog()
  const deps: ControlDeps = {
    store,
    layerFor: (sessionId) => (layer !== undefined && sessionId === session.id ? layer : undefined),
    defaultsPath: DEFAULTS_PATH,
    defaultsIo,
    protectedNames: new Set(PROTECTED_BASELINE),
    catalog: () => {
      if (options.catalogError !== undefined) throw options.catalogError
      return catalog
    },
    log: recorded.log,
  }

  return { deps, session, store, layer, defaultsIo, log: recorded, events }
}

describe('全有或全无：保护 / 保留名 / 文法一次判完再落盘', () => {
  it('保护命中：整单拒绝，store.write 调用数为 0', () => {
    const h = harness({ catalog: ['mcp__a__x', 'mcp__a__y'], scope: ['mcp__a__x', 'mcp__a__y'] })
    const outcome = toggleSession(h.deps, h.session, ['mcp:a', 'tool:bash'], false)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.text).toContain('地址不合法，未做任何改动（1 条不合法）')
    expect(outcome.text).toContain('保护名单')
    // 关键验证句：一条保护命中就让**整单**不写——另一条合法地址也不生效。
    expect(h.store.writeCalls).toBe(0)
    expect(h.store.writes).toHaveLength(0)
    expect(h.layer?.setStateCalls).toBe(0)
    expect(h.store.current.disabled).toEqual([])
  })

  it('保留名 / 文法错误 / 空地址同样整单拒绝，且一次写入都不发生', () => {
    for (const bad of ['tool:run_code', 'mcp:a::b?', 'bogus', '']) {
      const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
      const outcome = toggleSession(h.deps, h.session, ['mcp:a', bad], false)
      expect(outcome.ok, `「${bad}」应被拒绝`).toBe(false)
      expect(h.store.writeCalls, `「${bad}」不应写状态`).toBe(0)
      expect(h.layer?.setStateCalls, `「${bad}」不应动掩码`).toBe(0)
    }
  })

  it('默认档写入同样全有或全无：一条非法就整单拒绝，文件不动', async () => {
    const h = harness({ defaults: ['mcp:b'] })
    const before = h.defaultsIo.files.get(DEFAULTS_PATH)
    const outcome = await updateDefaults(h.deps, 'off', ['mcp:a', 'tool:bash'])

    expect(outcome.ok).toBe(false)
    expect(h.defaultsIo.writes).toHaveLength(0)
    expect(h.defaultsIo.files.get(DEFAULTS_PATH)).toBe(before)
    expect(h.store.writeCalls).toBe(0)
  })
})

describe('0 匹配地址：意图仍被记录（matched:0）', () => {
  it('0 匹配地址：仍进关闭集且 matched:0，但前缀缓存不重建', () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const outcome = toggleSession(h.deps, h.session, ['mcp:zzz'], false)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const report = outcome.report
    expect(report.entries).toEqual([
      { text: 'mcp:zzz', kind: 'mcp-group', matched: 0, wasDisabled: false, changed: true },
    ])
    // 关闭集变了（意图被记录）→ 必须写状态。
    expect(report.changed).toBe(true)
    expect(report.state.disabled).toEqual(['mcp:zzz'])
    expect(h.store.writeCalls).toBe(1)
    // 但已生效的 deny 没有变化 → 不报缓存重建（R15 ②）。
    expect(report.schemaChanged).toBe(false)
    expect(report.visibleBefore).toBe(1)
    expect(report.visibleAfter).toBe(1)
    expect(h.layer?.setStateCalls).toBe(1)
  })

  it('readPanel 对 0 匹配地址给 matched:0（两态区分的键仍在）', async () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'], disabled: ['mcp:zzz'] })
    const reading = await readPanel(h.deps, h.session)
    expect(reading.matched.get('mcp:zzz')).toBe(0)
    expect(reading.closed).toHaveLength(1)
    expect(reading.closed[0]).toMatchObject({ text: 'mcp:zzz', kind: 'mcp-group', matched: 0 })
    expect(reading.appliedDeny).toEqual([])
  })

  it('0 匹配地址开启：从关闭集移除，matched 仍是 0', () => {
    const h = harness({ disabled: ['mcp:zzz'] })
    const outcome = toggleSession(h.deps, h.session, ['mcp:zzz'], true)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.entries[0]?.matched).toBe(0)
    expect(outcome.report.state.disabled).toEqual([])
    expect(outcome.report.changed).toBe(true)
    expect(outcome.report.schemaChanged).toBe(false)
  })
})

describe('无变化：withToggled 同引用短路', () => {
  it('重复关闭：返回快照与旧状态对象同引用，且 store.write 调用数为 0', () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'], disabled: ['mcp:a'] })
    const before = h.store.current
    const outcome = toggleSession(h.deps, h.session, ['mcp:a'], false)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    // 关键验证句：无变化时 `report.state` 就是入参状态本身（`===`）。
    expect(outcome.report.state).toBe(before)
    expect(outcome.report.changed).toBe(false)
    expect(outcome.report.schemaChanged).toBe(false)
    expect(outcome.report.entries[0]?.changed).toBe(false)
    expect(h.store.writeCalls).toBe(0)
    expect(h.layer?.setStateCalls).toBe(0)
  })

  it('重复开启：同样返回旧对象且不写', () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const before = h.store.current
    const outcome = toggleSession(h.deps, h.session, ['mcp:a'], true)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.state).toBe(before)
    expect(outcome.report.changed).toBe(false)
    expect(h.store.writeCalls).toBe(0)
    expect(h.layer?.setStateCalls).toBe(0)
  })
})

describe('固定顺序：withToggled → store.write → layer.setState → 回执', () => {
  it('多地址一次处理：一次 write、一次 setState，顺序固定', () => {
    const h = harness({ catalog: ['mcp__a__x', 'mcp__b__y'], scope: ['mcp__a__x', 'mcp__b__y'] })
    const outcome = toggleSession(h.deps, h.session, ['mcp:a', 'mcp:b'], false)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(h.events).toEqual(['store.write', 'layer.setState'])
    expect(h.store.writeCalls).toBe(1)
    expect(h.layer?.setStateCalls).toBe(1)
    // 层收到的是**同一个**写入对象（不做复制、不复用计划值）。
    expect(h.layer?.applied).toBe(outcome.report.state)
    expect(outcome.report.state.disabled).toEqual(['mcp:a', 'mcp:b'])
  })

  it('状态未变时两步写入都不发生（短路早于写）', () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'], disabled: ['mcp:a'] })
    toggleSession(h.deps, h.session, ['mcp:a'], false)
    expect(h.events).toEqual([])
  })
})

describe('schemaChanged：只由已生效的 deny 变化决定', () => {
  it('关闭真实工具：deny 变化 → 报缓存重建，可见数下降', () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const outcome = toggleSession(h.deps, h.session, ['mcp:a'], false)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.schemaChanged).toBe(true)
    expect(outcome.report.visibleBefore).toBe(1)
    expect(outcome.report.visibleAfter).toBe(0)
  })

  it('开启真实工具：deny 变化 → 报缓存重建，可见数回升', () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'], disabled: ['mcp:a'] })
    const outcome = toggleSession(h.deps, h.session, ['mcp:a'], true)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.schemaChanged).toBe(true)
    expect(outcome.report.visibleBefore).toBe(0)
    expect(outcome.report.visibleAfter).toBe(1)
  })
})

describe('写失败与层缺席：命令不失败，代价进回执', () => {
  it('store.write 抛错：persistFailed=true，layer 仍收到写入后的状态', () => {
    const h = harness({
      catalog: ['mcp__a__x'],
      scope: ['mcp__a__x'],
      storeWriteError: new Error('模拟的会话日志写入失败'),
    })
    const outcome = toggleSession(h.deps, h.session, ['mcp:a'], false)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.persistFailed).toBe(true)
    expect(outcome.report.layerFailed).toBe(false)
    expect(h.store.writeCalls).toBe(1)
    expect(h.store.writes).toHaveLength(0)
    expect(h.layer?.setStateCalls).toBe(1)
    expect(h.layer?.applied.disabled).toEqual(['mcp:a'])
    expect(h.log.errors.some((message) => message.includes('无法写入会话状态'))).toBe(true)
  })

  it('layer.setState 抛错：layerFailed=true，状态已写', () => {
    const h = harness({
      catalog: ['mcp__a__x'],
      scope: ['mcp__a__x'],
      layerSetStateError: new Error('模拟的掩码更新失败'),
    })
    const outcome = toggleSession(h.deps, h.session, ['mcp:a'], false)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.layerFailed).toBe(true)
    expect(outcome.report.persistFailed).toBe(false)
    expect(h.store.writes).toHaveLength(1)
    // 掩码未更新（restrict 抛错的真实后果）：deny 仍是旧的空集。
    expect(h.layer?.snapshot().deny).toEqual([])
    expect(h.log.errors.some((message) => message.includes('无法更新本会话掩码'))).toBe(true)
  })

  it('会话层缺席：可见计数不可信，但状态照写、不调 setState', () => {
    const h = harness({ withLayer: false, catalog: ['mcp__a__x'] })
    const outcome = toggleSession(h.deps, h.session, ['mcp:a'], false)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.visibleKnown).toBe(false)
    expect(outcome.report.visibleBefore).toBe(0)
    expect(outcome.report.visibleAfter).toBe(0)
    expect(h.store.writeCalls).toBe(1)
  })

  it('全局层读数抛错：降级为空表并 warn，开关语义不受影响', async () => {
    const h = harness({ catalogError: new Error('模拟的注册表读取失败') })
    const outcome = toggleSession(h.deps, h.session, ['mcp:a'], false)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.entries[0]?.matched).toBe(0)
    expect(h.log.warnings.some((message) => message.includes('全局层工具注册表'))).toBe(true)

    const reading = await readPanel(h.deps, h.session)
    expect(reading.catalog).toEqual([])
  })
})

describe('reset：回到创建时快照（对称差计数）', () => {
  it('对称差 = 只在一侧出现的条目数（2），并写回快照', () => {
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__b__y', 'mcp__c__z'],
      scope: ['mcp__a__x', 'mcp__b__y', 'mcp__c__z'],
      disabled: ['mcp:a', 'mcp:b'],
      snapshot: ['mcp:b', 'mcp:c'],
    })
    const report = resetSession(h.deps, h.session)
    expect(report.changedCount).toBe(2)
    expect(report.changed).toBe(true)
    expect(report.snapshot).toEqual(['mcp:b', 'mcp:c'])
    expect(report.state.disabled).toEqual(['mcp:b', 'mcp:c'])
    expect(report.schemaChanged).toBe(true)
    expect(h.store.writeCalls).toBe(1)
    expect(h.layer?.setStateCalls).toBe(1)
    expect(h.events).toEqual(['store.write', 'layer.setState'])
  })

  it('无变化：返回旧对象、不写状态、变化项数 0', () => {
    const h = harness({ disabled: ['mcp:a'], snapshot: ['mcp:a'] })
    const before = h.store.current
    const report = resetSession(h.deps, h.session)
    expect(report.state).toBe(before)
    expect(report.changed).toBe(false)
    expect(report.changedCount).toBe(0)
    expect(report.schemaChanged).toBe(false)
    expect(h.store.writeCalls).toBe(0)
    expect(h.layer?.setStateCalls).toBe(0)
  })

  it('快照里的保护名被写入前清洗掉（损坏记录的最后一道容忍）', () => {
    const h = harness({ disabled: [], snapshot: ['mcp:a', 'tool:bash'] })
    const report = resetSession(h.deps, h.session)
    expect(report.snapshot).toEqual(['mcp:a'])
    expect(report.state.disabled).toEqual(['mcp:a'])
    expect(report.changedCount).toBe(1)
  })
})

describe('readPanel：三读并集与默认档读数', () => {
  it('全局层 / 本视角 / 已生效掩码三读合并，本插件已生效掩码不计入隐藏（R18）', async () => {
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__b__y', 'bash'],
      scope: ['mcp__b__y', 'bash'],
      disabled: ['mcp:a'],
    })
    const reading = await readPanel(h.deps, h.session)

    expect(reading.layerReady).toBe(true)
    expect(reading.visible).toBe(2)
    expect(reading.catalog).toEqual(['mcp__a__x', 'mcp__b__y', 'bash'])
    expect(reading.scoped).toEqual(['mcp__b__y', 'bash'])
    expect(reading.appliedDeny).toEqual(['mcp__a__x'])
    expect(reading.appliedShadowServers).toEqual(['a'])
    expect(reading.matched.get('mcp:a')).toBe(1)
    expect(reading.closed).toEqual([
      { text: 'mcp:a', kind: 'mcp-group', matched: 1, shadowed: true },
    ])
    expect(reading.serverGroups).toEqual([
      { server: 'a', address: 'mcp:a', count: 1 },
      { server: 'b', address: 'mcp:b', count: 1 },
    ])
    expect(reading.builtinNames).toEqual(['bash'])
    expect(reading.builtinProtectedNames).toEqual(['bash'])
    // mcp__a__x 是本插件关掉且掩码已生效的名字（在 carried / appliedDeny 里）：
    // 它算不上「被其他作用域隐藏」，否则面板会禁用这一行、用户打不开自己关掉的工具。
    expect(reading.hiddenByOthers).toEqual([])
    expect(reading.protectedNames).toHaveLength(PROTECTED_BASELINE.length)
    expect(reading.defaults).toEqual({ version: 1, disabled: [] })
    expect(reading.defaultsPath).toBe(DEFAULTS_PATH)
    expect(reading.storeKind).toBe('record')
    expect(reading.createdAt).toBe(CREATED_AT)
  })

  it('真被其他作用域掩掉（不在 carried 里）的名字仍然进 hiddenByOthers', async () => {
    // 本会话什么都没关：全局层有 x，本视角看不到，且它不在本插件的掩码里。
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__b__y', 'bash'],
      scope: ['mcp__b__y', 'bash'],
    })
    const reading = await readPanel(h.deps, h.session)

    expect(reading.appliedDeny).toEqual([])
    expect(reading.hiddenByOthers).toEqual(['mcp__a__x'])
  })

  it('层缺席：layerReady=false，隐藏计数为空、可见数不可信', async () => {
    const h = harness({ withLayer: false, catalog: ['mcp__a__x'] })
    const reading = await readPanel(h.deps, h.session)
    expect(reading.layerReady).toBe(false)
    expect(reading.visible).toBe(0)
    expect(reading.hiddenByOthers).toEqual([])
  })

  it('默认档缺失：按空档处理并 warn；内存通道如实上报', async () => {
    const h = harness({ defaultsMissing: true, storeKind: 'memory' })
    const reading = await readPanel(h.deps, h.session)
    expect(reading.defaults).toEqual({ version: 1, disabled: [] })
    expect(reading.storeKind).toBe('memory')
    expect(h.log.warnings.some((message) => message.includes('默认档不可读'))).toBe(true)
  })
})

describe('updateDefaults：只写文件，失败向上抛', () => {
  it('off 追加、on 移除（增量语义）', async () => {
    const off = harness({ defaults: ['mcp:b'] })
    const added = await updateDefaults(off.deps, 'off', ['mcp:a'])
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(added.report.added).toEqual(['mcp:a'])
    expect(added.report.removed).toEqual([])
    expect(JSON.parse(off.defaultsIo.writes[0]?.data ?? '{}')).toEqual({
      version: 1,
      disabled: ['mcp:a', 'mcp:b'],
    })
    expect(off.store.writeCalls).toBe(0)

    const on = harness({ defaults: ['mcp:a', 'mcp:b'] })
    const removed = await updateDefaults(on.deps, 'on', ['mcp:a'])
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.report.removed).toEqual(['mcp:a'])
    expect(JSON.parse(on.defaultsIo.writes[0]?.data ?? '{}')).toEqual({
      version: 1,
      disabled: ['mcp:b'],
    })
  })

  it('set 整份覆盖、reset 清空', async () => {
    const set = harness({ defaults: ['mcp:a'] })
    const covered = await updateDefaults(set.deps, 'set', ['mcp:b', 'mcp:c'])
    expect(covered.ok).toBe(true)
    if (!covered.ok) return
    expect(covered.report.after.disabled).toEqual(['mcp:b', 'mcp:c'])
    expect(JSON.parse(set.defaultsIo.writes[0]?.data ?? '{}')).toEqual({
      version: 1,
      disabled: ['mcp:b', 'mcp:c'],
    })

    const reset = harness({ defaults: ['mcp:a', 'mcp:b'] })
    const cleared = await updateDefaults(reset.deps, 'reset', [])
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(cleared.report.before.disabled).toEqual(['mcp:a', 'mcp:b'])
    expect(cleared.report.after.disabled).toEqual([])
    expect(JSON.parse(reset.defaultsIo.writes[0]?.data ?? '{}')).toEqual({ version: 1, disabled: [] })
    expect(reset.store.writeCalls).toBe(0)
  })

  it('writeDefaults 失败：原样向上抛（供 RPC 映射 defaults-unwritable），文件不动', async () => {
    const failure = new Error('EACCES: 模拟的权限错误')
    const h = harness({ defaults: ['mcp:b'], defaultsWriteError: failure })

    await expect(updateDefaults(h.deps, 'off', ['mcp:a'])).rejects.toThrow(
      'EACCES: 模拟的权限错误',
    )
    expect(h.defaultsIo.writes).toHaveLength(0)
    expect(JSON.parse(h.defaultsIo.files.get(DEFAULTS_PATH) ?? '{}')).toEqual({
      version: 1,
      disabled: ['mcp:b'],
    })
    expect(h.store.writeCalls).toBe(0)
    // 内核先记一条可排查的 error，再抛给上层转译。
    expect(h.log.errors.some((message) => message.includes(`默认档写入失败（${DEFAULTS_PATH}）`))).toBe(
      true,
    )
  })

  it('地址按规范形去重：mcp:a 与 mcp:a::* 是同一意图，只写一条', async () => {
    const h = harness()
    const outcome = await updateDefaults(h.deps, 'set', ['mcp:a', 'mcp:a::*'])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.after.disabled).toEqual(['mcp:a'])
  })
})
