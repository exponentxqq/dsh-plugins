/**
 * 面板状态机测试（任务 10.3）：`idle→loading→ready/failed`、`pending` 集、mutation 吃响应
 * 快照、失败保留旧快照、`command/executed` 与 `focus` 两类订阅、客户端晚到与 `dispose`。
 *
 * 全部用例在**假 `PanelClient` + 假事件/焦点端口**上驱动，不拉连接、不碰 DOM、不摸
 * `window`——这正是把控制器做成纯状态机的目的（`code-design.md` 附录 §3.6）。渲染层
 * （10.4）只消费 `getSnapshot()` / `subscribe()`，装配层（10.5）提供两个订阅端口。
 *
 * 三条主验证句对应用例：
 *
 * 1. **并发 toggle 两地址 → `pending` 同时含两者**：两个请求各自挂起时，快照里的 `pending`
 *    同时包含两个地址，且两个请求各自完成后只移除自己；
 * 2. **toggle 失败保留旧快照且 `pending` 清空**：旧 `snapshot` 保持**同一引用**，`pending`
 *    归零，错误进 `error`，面板不销毁（`phase` 仍是 `ready`）；
 * 3. **`command/executed` 他会话 / 他命令不触发**：事件端口发射后 `panel` 调用数不增加。
 *
 * 另按任务清单覆盖：打开即拉取、失败进 `failed`、快照 identity 稳定、stale-while-revalidate、
 * `reset` / `updateDefaults` 的在途标志、客户端晚到、`close` 作废在途拉取、`dispose` 摘监听。
 */
import { describe, expect, it } from 'vitest'
import type {
  DefaultsAction,
  DefaultsValue,
  DefaultsView,
  PanelSnapshot,
  ToggleValue,
  WorkspaceRequest,
  WorkspaceValue,
  WorkspaceView,
} from '../src/contract.ts'
import { PanelError, type PanelClient } from '../src/client/panel-client.ts'
import { PanelController, type CommandExecutedHandler } from '../src/client/panel-controller.ts'

/** 用例里那个活着的会话 id。 */
const SESSION_ID = 'session-1'

/** 另一个会话 id（`command/executed` 的负例用）。 */
const OTHER_SESSION_ID = 'session-2'

/** 固定时钟（epoch ms），让 `loadedAt` 可断言。 */
const NOW = 1_700_000_000_000

/** 默认档文件的假绝对路径（只用于断言透传，不指向任何真实文件）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/** 工作区档文件的假绝对路径（同上）。 */
const WORKSPACES_PATH = '/fake/dsh-home/session-tool-toggle/workspaces.json'

/** 本会话所属工作区的规范路径。 */
const WORKSPACE_PATH = '/workspace/one'

/** footer 下拉里的第二个工作区（按 key 寻址的用例用它）。 */
const OTHER_WORKSPACE_PATH = '/workspace/two'

/**
 * 一份最小的合法面板快照（strict 契约：字段不多不少）。
 * @param overrides - 需要改写的顶层字段。
 * @returns 面板快照。
 */
function snapshot(overrides: Partial<PanelSnapshot> = {}): PanelSnapshot {
  return {
    sessionId: SESSION_ID,
    createdAt: NOW - 1_000,
    state: { disabled: [], snapshot: [], seeded: false, updatedAt: 0, storeKind: 'memory' },
    groups: [],
    protectedNames: ['bash'],
    defaults: defaultsView(),
    hiddenByOthers: [],
    intentOnly: [],
    stats: { visible: 4, catalog: 4, denied: 0, shadowed: 0 },
    notices: [],
    skills: [],
    workspace: workspaceView(),
    ...overrides,
  }
}

/**
 * 一份合法的工作区档视图（面板快照与 `workspace` 端点共用的形状）。
 * @param overrides - 需要改写的字段。
 * @returns 工作区档视图。
 */
function workspaceView(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    key: WORKSPACE_PATH,
    title: '工作区一',
    registered: true,
    disabled: [],
    path: WORKSPACES_PATH,
    readable: true,
    corrupt: false,
    ...overrides,
  }
}

/**
 * `workspace` 端点的成功值。
 * @param overrides - 需要改写的字段（`workspace: null` = 无法归属）。
 * @returns 端点成功值。
 */
function workspaceValue(overrides: Partial<WorkspaceValue> = {}): WorkspaceValue {
  return {
    workspace: workspaceView(),
    choices: [
      { key: WORKSPACE_PATH, title: '工作区一' },
      { key: OTHER_WORKSPACE_PATH, title: '工作区二' },
    ],
    changed: [],
    ...overrides,
  }
}

/**
 * 默认档视图。
 * @param disabled - 默认档关闭集。
 * @param overrides - 需要改写的字段。
 * @returns 默认档视图。
 */
function defaultsView(disabled: readonly string[] = [], overrides: Partial<DefaultsView> = {}): DefaultsView {
  return {
    version: 1,
    disabled: [...disabled],
    path: DEFAULTS_PATH,
    readable: true,
    corrupt: false,
    ...overrides,
  }
}

/**
 * `toggle` / `reset` 的成功值（两者共享 `ToggleValue` 形状）。
 * @param value - 响应里的新快照。
 * @returns 端点成功值。
 */
function mutationValue(value: PanelSnapshot): ToggleValue {
  return {
    snapshot: value,
    mutation: {
      applied: [],
      hiddenTools: 0,
      hiddenSkills: 0,
      visibleBefore: value.stats.visible,
      visibleAfter: value.stats.visible,
      kvRebuild: false,
      notices: [],
    },
  }
}

/**
 * `defaults` 端点的成功值。
 * @param value - 写入后的默认档视图。
 * @returns 端点成功值。
 */
function defaultsValue(value: DefaultsView): DefaultsValue {
  return { defaults: value, changed: [...value.disabled] }
}

/** 一个可手动结算的 promise（并发用例用它把两个请求同时挂在途中）。 */
interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
}

/**
 * 建一个待决 promise。
 * @returns promise 与结算函数。
 */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 假面板客户端：记录每次调用参数，实现可按用例替换（默认拒绝，防止漏配）。 */
class FakePanelClient implements PanelClient {
  /** 每次 `panel` 的 sessionId。 */
  readonly panelCalls: string[] = []
  /** 每次 `toggle` 的参数（地址数组已复制）。 */
  readonly toggleCalls: Array<{ sessionId: string; on: boolean; addresses: readonly string[] }> = []
  /** 每次 `reset` 的 sessionId。 */
  readonly resetCalls: string[] = []
  /** 每次 `updateDefaults` 的参数。 */
  readonly defaultsCalls: Array<{ action: DefaultsAction; addresses?: readonly string[] }> = []
  /** 每次 `workspace` 的请求（地址数组已复制）。 */
  readonly workspaceCalls: WorkspaceRequest[] = []

  /** 下一次 `panel` 的实现。 */
  panelImpl: (sessionId: string) => Promise<PanelSnapshot> = () => Promise.reject(new Error('用例未预置 panel 回复'))
  /** 下一次 `toggle` 的实现。 */
  toggleImpl: (sessionId: string, on: boolean, addresses: readonly string[]) => Promise<ToggleValue> = () =>
    Promise.reject(new Error('用例未预置 toggle 回复'))
  /** 下一次 `reset` 的实现。 */
  resetImpl: (sessionId: string) => Promise<ToggleValue> = () => Promise.reject(new Error('用例未预置 reset 回复'))
  /** 下一次 `updateDefaults` 的实现。 */
  updateDefaultsImpl: (action: DefaultsAction, addresses?: readonly string[]) => Promise<DefaultsValue> = () =>
    Promise.reject(new Error('用例未预置 updateDefaults 回复'))
  /** 下一次 `workspace` 的实现。 */
  workspaceImpl: (request: WorkspaceRequest) => Promise<WorkspaceValue> = () =>
    Promise.reject(new Error('用例未预置 workspace 回复'))

  panel(sessionId: string): Promise<PanelSnapshot> {
    this.panelCalls.push(sessionId)
    return this.panelImpl(sessionId)
  }

  toggle(sessionId: string, on: boolean, addresses: readonly string[]): Promise<ToggleValue> {
    this.toggleCalls.push({ sessionId, on, addresses: [...addresses] })
    return this.toggleImpl(sessionId, on, addresses)
  }

  reset(sessionId: string): Promise<ToggleValue> {
    this.resetCalls.push(sessionId)
    return this.resetImpl(sessionId)
  }

  updateDefaults(action: DefaultsAction, addresses?: readonly string[]): Promise<DefaultsValue> {
    this.defaultsCalls.push(addresses === undefined ? { action } : { action, addresses: [...addresses] })
    return this.updateDefaultsImpl(action, addresses)
  }

  workspace(request: WorkspaceRequest): Promise<WorkspaceValue> {
    this.workspaceCalls.push(
      request.addresses === undefined ? { ...request } : { ...request, addresses: [...request.addresses] },
    )
    return this.workspaceImpl(request)
  }
}

/** 假 `command/executed` 订阅面（10.5 的 `ctx.on` 替身）。 */
class FakeCommandPort {
  private readonly handlers = new Set<CommandExecutedHandler>()
  /** 订阅次数（构造期应恰好 1 次）。 */
  subscribeCalls = 0
  /** 退订次数（`dispose` 应恰好 1 次）。 */
  unsubscribeCalls = 0

  /** 注入给控制器的订阅函数（绑定实例，可安全解构）。 */
  readonly subscribe = (handler: CommandExecutedHandler): (() => void) => {
    this.subscribeCalls += 1
    this.handlers.add(handler)
    return () => {
      this.unsubscribeCalls += 1
      this.handlers.delete(handler)
    }
  }

  /**
   * 模拟一次命令执行事件。
   * @param sessionId - 目标会话。
   * @param name - 命令名。
   */
  emit(sessionId: string, name: string): void {
    for (const handler of Array.from(this.handlers)) handler(sessionId, name)
  }

  /** 当前仍挂着的监听数。 */
  get active(): number {
    return this.handlers.size
  }
}

/** 假 `window` focus 订阅面（10.5 的 `addEventListener` 替身）。 */
class FakeFocusPort {
  private readonly handlers = new Set<() => void>()
  /** 挂监听次数（每次 `open` 只应 +1，重复 `open` 不重复挂）。 */
  attachCalls = 0
  /** 摘监听次数（`close` / `dispose` 各一次）。 */
  detachCalls = 0

  /** 注入给控制器的挂载函数（绑定实例，可安全解构）。 */
  readonly attach = (handler: () => void): (() => void) => {
    this.attachCalls += 1
    this.handlers.add(handler)
    return () => {
      this.detachCalls += 1
      this.handlers.delete(handler)
    }
  }

  /** 模拟一次 `window` focus。 */
  focus(): void {
    for (const handler of Array.from(this.handlers)) handler()
  }

  /** 当前仍挂着的监听数。 */
  get active(): number {
    return this.handlers.size
  }
}

/** 控制器测试台：假 client + 两个假端口 + 可换的 client 解析结果。 */
interface Harness {
  readonly controller: PanelController
  readonly client: FakePanelClient
  readonly commands: FakeCommandPort
  readonly focus: FakeFocusPort
  /** `onChange` 的调用次数。 */
  readonly changes: { count: number }
  /** 替换 `resolveClient()` 的返回值（`undefined` 模拟 connection 未就绪）。 */
  setClient(next: PanelClient | undefined): void
}

/**
 * 建一个受控的控制器测试台。
 * @returns 控制器与全部可观察替身。
 */
function createHarness(): Harness {
  const client = new FakePanelClient()
  let resolved: PanelClient | undefined = client
  const commands = new FakeCommandPort()
  const focus = new FakeFocusPort()
  const changes = { count: 0 }
  const controller = new PanelController({
    resolveClient: () => resolved,
    sessionId: SESSION_ID,
    now: () => NOW,
    onChange: () => {
      changes.count += 1
    },
    subscribeCommandExecuted: commands.subscribe,
    attachFocusListener: focus.attach,
  })
  return {
    controller,
    client,
    commands,
    focus,
    changes,
    setClient: (next) => {
      resolved = next
    },
  }
}

/**
 * 把微任务队列跑干净（事件触发的刷新没有返回 promise 可 await，用固定轮次代替等待）。
 *
 * 轮次留 5 次余量：`refresh()` 自身至少一次 await，`async` 实现再包一层；不依赖
 * 真实定时器，所以用例零抖动。
 */
async function flush(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve()
}

describe('panel controller：打开与拉取', () => {
  it('open()：idle → loading → ready，成功的快照与时间戳落进状态', async () => {
    const { controller, client } = createHarness()
    const gate = deferred<PanelSnapshot>()
    client.panelImpl = () => gate.promise

    expect(controller.getSnapshot().phase).toBe('idle')
    const phases: string[] = []
    controller.subscribe(() => phases.push(controller.getSnapshot().phase))

    const opening = controller.open()

    expect(controller.getSnapshot().phase).toBe('loading')
    expect(controller.getSnapshot().snapshot).toBeUndefined()
    const value = snapshot()
    gate.resolve(value)
    await opening

    const state = controller.getSnapshot()
    expect(state.phase).toBe('ready')
    expect(state.snapshot).toBe(value)
    expect(state.error).toBeUndefined()
    expect(state.loadedAt).toBe(NOW)
    expect(phases).toEqual(['loading', 'ready'])
    expect(client.panelCalls).toEqual([SESSION_ID])
  })

  it('拉取失败：phase=failed + error 带宿主码，动作本身不 reject', async () => {
    const { controller, client } = createHarness()
    client.panelImpl = async () => {
      throw new PanelError('session-not-live', '该会话未在宿主中运行')
    }

    await expect(controller.open()).resolves.toBeUndefined()

    const state = controller.getSnapshot()
    expect(state.phase).toBe('failed')
    expect(state.snapshot).toBeUndefined()
    expect(state.error).toBeInstanceOf(PanelError)
    expect(state.error?.code).toBe('session-not-live')
    expect(state.error?.message).toBe('该会话未在宿主中运行')
  })

  it('客户端缺席：直接 failed(unavailable) 且不发任何请求', async () => {
    const harness = createHarness()
    harness.setClient(undefined)

    await expect(harness.controller.open()).resolves.toBeUndefined()

    const state = harness.controller.getSnapshot()
    expect(state.phase).toBe('failed')
    expect(state.error?.code).toBe('unavailable')
    expect(harness.client.panelCalls).toEqual([])
  })

  it('resolveClient 抛错：按客户端缺席处理，不把异常漏给调用方', async () => {
    const controller = new PanelController({
      resolveClient: () => {
        throw new Error('connection 服务读取失败')
      },
      sessionId: SESSION_ID,
      now: () => NOW,
    })

    await expect(controller.open()).resolves.toBeUndefined()

    expect(controller.getSnapshot().phase).toBe('failed')
    expect(controller.getSnapshot().error?.code).toBe('unavailable')
  })

  it('客户端晚到：先 failed(unavailable)，connection 就绪后再次 open() 成功', async () => {
    const harness = createHarness()
    harness.setClient(undefined)
    await harness.controller.open()
    expect(harness.controller.getSnapshot().phase).toBe('failed')

    const value = snapshot()
    harness.client.panelImpl = async () => value
    harness.setClient(harness.client)
    await harness.controller.open()

    const state = harness.controller.getSnapshot()
    expect(state.phase).toBe('ready')
    expect(state.snapshot).toBe(value)
    expect(state.error).toBeUndefined()
    expect(harness.client.panelCalls).toEqual([SESSION_ID])
  })

  it('stale-while-revalidate：重拉期间保留旧快照，成功后整体替换', async () => {
    const { controller, client } = createHarness()
    const first = snapshot()
    client.panelImpl = async () => first
    await controller.open()

    const gate = deferred<PanelSnapshot>()
    client.panelImpl = () => gate.promise
    const refreshing = controller.refresh()

    expect(controller.getSnapshot().phase).toBe('loading')
    expect(controller.getSnapshot().snapshot).toBe(first)

    const next = snapshot({ stats: { visible: 1, catalog: 4, denied: 3, shadowed: 0 } })
    gate.resolve(next)
    await refreshing

    expect(controller.getSnapshot().phase).toBe('ready')
    expect(controller.getSnapshot().snapshot).toBe(next)
    expect(controller.getSnapshot().loadedAt).toBe(NOW)
  })

  it('重拉失败：failed 与旧快照并存；下一次成功会清掉错误', async () => {
    const { controller, client } = createHarness()
    const first = snapshot()
    client.panelImpl = async () => first
    await controller.open()

    client.panelImpl = async () => {
      throw new PanelError('internal', '宿主内部错误')
    }
    await controller.refresh()

    expect(controller.getSnapshot().phase).toBe('failed')
    expect(controller.getSnapshot().snapshot).toBe(first)
    expect(controller.getSnapshot().error?.code).toBe('internal')

    // 关闭会清掉错误行但保留快照，重开必有新一轮拉取。
    controller.close()
    expect(controller.getSnapshot().phase).toBe('idle')
    expect(controller.getSnapshot().error).toBeUndefined()
    expect(controller.getSnapshot().snapshot).toBe(first)

    const next = snapshot({ state: { ...first.state, disabled: ['mcp:a'] } })
    client.panelImpl = async () => next
    await controller.refresh()

    const state = controller.getSnapshot()
    expect(state.phase).toBe('ready')
    expect(state.snapshot).toBe(next)
    expect(state.error).toBeUndefined()
  })

  it('getSnapshot()：未变化时返回同一引用，变化后换新对象但快照引用稳定', async () => {
    const { controller, client } = createHarness()
    const idle = controller.getSnapshot()
    expect(controller.getSnapshot()).toBe(idle)

    const value = snapshot()
    client.panelImpl = async () => value
    await controller.open()

    const ready = controller.getSnapshot()
    expect(ready).not.toBe(idle)
    expect(controller.getSnapshot()).toBe(ready)
    expect(controller.getSnapshot().snapshot).toBe(value)
  })

  it('onChange 与 subscribe 都随每次状态变化通知', async () => {
    const harness = createHarness()
    let listened = 0
    harness.controller.subscribe(() => {
      listened += 1
    })

    harness.client.panelImpl = async () => snapshot()
    await harness.controller.open()

    // loading + ready 各一次。
    expect(harness.changes.count).toBe(2)
    expect(listened).toBe(2)
  })
})

describe('panel controller：pending 与 mutation', () => {
  it('并发 toggle 两个地址：pending 同时含两者，各自完成后只移除自己', async () => {
    const { controller, client } = createHarness()
    const initial = snapshot()
    client.panelImpl = async () => initial
    await controller.open()

    const first = deferred<ToggleValue>()
    const second = deferred<ToggleValue>()
    const replies = [first.promise, second.promise]
    client.toggleImpl = () => replies.shift()!

    const togglingA = controller.toggle('mcp:a', false)
    const togglingB = controller.toggle('mcp:b', true)

    expect([...controller.getSnapshot().pending].sort()).toEqual(['mcp:a', 'mcp:b'])
    expect(client.toggleCalls).toEqual([
      { sessionId: SESSION_ID, on: false, addresses: ['mcp:a'] },
      { sessionId: SESSION_ID, on: true, addresses: ['mcp:b'] },
    ])

    const afterA = snapshot({ state: { ...initial.state, disabled: ['mcp:a'] } })
    first.resolve(mutationValue(afterA))
    await togglingA

    expect([...controller.getSnapshot().pending]).toEqual(['mcp:b'])
    expect(controller.getSnapshot().snapshot).toBe(afterA)

    const afterB = snapshot({ state: { ...initial.state, disabled: [] } })
    second.resolve(mutationValue(afterB))
    await togglingB

    expect(controller.getSnapshot().pending.size).toBe(0)
    expect(controller.getSnapshot().snapshot).toBe(afterB)
    expect(controller.getSnapshot().phase).toBe('ready')
  })

  it('toggle 成功：直接吃响应里的新快照，不额外拉 panel', async () => {
    const { controller, client } = createHarness()
    const initial = snapshot()
    client.panelImpl = async () => initial
    await controller.open()

    const next = snapshot({ state: { ...initial.state, disabled: ['mcp:a'] } })
    client.toggleImpl = async () => mutationValue(next)

    await controller.toggle('mcp:a', false)

    const state = controller.getSnapshot()
    expect(state.snapshot).toBe(next)
    expect(state.phase).toBe('ready')
    expect(state.error).toBeUndefined()
    expect(client.panelCalls).toEqual([SESSION_ID])
    expect(state.loadedAt).toBe(NOW)
  })

  it('toggle 失败：旧快照保留同一引用、pending 清空、错误进 error、面板不销毁', async () => {
    const { controller, client } = createHarness()
    const initial = snapshot()
    client.panelImpl = async () => initial
    await controller.open()

    client.toggleImpl = async () => {
      throw new PanelError('protected', 'bash 在保护名单内，不能关闭', { names: ['bash'] })
    }

    await controller.toggle('tool:bash', false)

    const state = controller.getSnapshot()
    expect(state.snapshot).toBe(initial)
    expect(state.pending.size).toBe(0)
    expect(state.error).toBeInstanceOf(PanelError)
    expect(state.error?.code).toBe('protected')
    expect(state.error?.details).toEqual({ names: ['bash'] })
    // 面板没被销毁：仍然渲染旧内容 + 顶部错误行。
    expect(state.phase).toBe('ready')
  })

  it('toggle 失败后成功一次会清掉错误行', async () => {
    const { controller, client } = createHarness()
    const initial = snapshot()
    client.panelImpl = async () => initial
    await controller.open()

    client.toggleImpl = async () => {
      throw new PanelError('internal', '宿主内部错误')
    }
    await controller.toggle('mcp:a', false)
    expect(controller.getSnapshot().error?.code).toBe('internal')

    client.toggleImpl = async () => mutationValue(initial)
    await controller.toggle('mcp:a', true)
    expect(controller.getSnapshot().error).toBeUndefined()
  })

  it('同一地址在途时重复 toggle 被忽略（不重复发请求）', async () => {
    const { controller, client } = createHarness()
    const initial = snapshot()
    client.panelImpl = async () => initial
    await controller.open()

    const gate = deferred<ToggleValue>()
    client.toggleImpl = () => gate.promise

    const first = controller.toggle('mcp:a', false)
    const duplicated = controller.toggle('mcp:a', true)
    expect(client.toggleCalls.length).toBe(1)

    gate.resolve(mutationValue(initial))
    await Promise.all([first, duplicated])
    expect(controller.getSnapshot().pending.size).toBe(0)
  })

  it('reset：在途置 resetting，成功后吃响应快照并清标志', async () => {
    const { controller, client } = createHarness()
    const initial = snapshot()
    client.panelImpl = async () => initial
    await controller.open()

    const gate = deferred<ToggleValue>()
    client.resetImpl = () => gate.promise
    const resetting = controller.reset()

    expect(controller.getSnapshot().resetting).toBe(true)

    const next = snapshot()
    gate.resolve(mutationValue(next))
    await resetting

    const state = controller.getSnapshot()
    expect(state.resetting).toBe(false)
    expect(state.snapshot).toBe(next)
    expect(state.phase).toBe('ready')
    expect(client.resetCalls).toEqual([SESSION_ID])
  })

  it('reset 失败：旧快照保留、resetting 清空、错误进 error', async () => {
    const { controller, client } = createHarness()
    const initial = snapshot()
    client.panelImpl = async () => initial
    await controller.open()

    client.resetImpl = async () => {
      throw new PanelError('internal', '宿主内部错误')
    }
    await controller.reset()

    const state = controller.getSnapshot()
    expect(state.snapshot).toBe(initial)
    expect(state.resetting).toBe(false)
    expect(state.error?.code).toBe('internal')
    expect(state.phase).toBe('ready')
  })

  it('updateDefaults：在途置 savingDefaults，成功后更新活视图且不重拉 panel', async () => {
    const { controller, client } = createHarness()
    const initial = snapshot()
    client.panelImpl = async () => initial
    await controller.open()

    const nextDefaults = defaultsView(['mcp:a'])
    const gate = deferred<DefaultsValue>()
    client.updateDefaultsImpl = () => gate.promise
    const saving = controller.updateDefaults('off', ['mcp:a'])

    expect(controller.getSnapshot().savingDefaults).toBe(true)

    gate.resolve(defaultsValue(nextDefaults))
    await saving

    const state = controller.getSnapshot()
    expect(state.savingDefaults).toBe(false)
    expect(state.defaults).toBe(nextDefaults)
    // 默认档不追溯当前会话：快照原样、不重拉。
    expect(state.snapshot).toBe(initial)
    expect(client.panelCalls).toEqual([SESSION_ID])
    expect(client.defaultsCalls).toEqual([{ action: 'off', addresses: ['mcp:a'] }])
  })

  it('updateDefaults(reset)：只发 action，不携带 addresses', async () => {
    const { controller, client } = createHarness()
    client.panelImpl = async () => snapshot()
    await controller.open()
    client.updateDefaultsImpl = async () => defaultsValue(defaultsView([], { readable: false }))

    await controller.updateDefaults('reset')

    expect(client.defaultsCalls).toEqual([{ action: 'reset' }])
  })

  it('updateDefaults 失败：defaultsError 进状态、面板级 error 与旧快照都不动', async () => {
    const { controller, client } = createHarness()
    const initial = snapshot()
    client.panelImpl = async () => initial
    await controller.open()

    // 先制造一条面板级错误，确认默认档失败不会覆盖它。
    client.toggleImpl = async () => {
      throw new PanelError('protected', 'bash 在保护名单内')
    }
    await controller.toggle('tool:bash', false)
    const panelError = controller.getSnapshot().error

    client.updateDefaultsImpl = async () => {
      throw new PanelError('defaults-unwritable', '默认档写入失败', { path: DEFAULTS_PATH, reason: 'EACCES' })
    }
    await controller.updateDefaults('set', ['mcp:a'])

    const state = controller.getSnapshot()
    expect(state.savingDefaults).toBe(false)
    expect(state.defaultsError?.code).toBe('defaults-unwritable')
    expect(state.defaultsError?.details).toEqual({ path: DEFAULTS_PATH, reason: 'EACCES' })
    expect(state.error).toBe(panelError)
    expect(state.snapshot).toBe(initial)
    expect(client.panelCalls).toEqual([SESSION_ID])
  })
})

describe('panel controller：工作区档', () => {
  it('refreshWorkspace：请求精确为 {sessionId, action:"read"}，成功后更新活视图与 choices', async () => {
    const { controller, client } = createHarness()
    const next = workspaceView({ disabled: ['skill:openspec-propose'] })
    const value = workspaceValue({ workspace: next })
    client.workspaceImpl = async () => value

    await controller.refreshWorkspace()

    const state = controller.getSnapshot()
    expect(state.workspace).toBe(next)
    expect(state.workspaceChoices).toEqual(value.choices)
    expect(state.workspaceError).toBeUndefined()
    // 按会话寻址的读：不多带 workspacePath / addresses。
    expect(client.workspaceCalls).toEqual([{ sessionId: SESSION_ID, action: 'read' }])
    // 工作区档不追溯：不为一次工作区刷新重拉整份面板快照。
    expect(client.panelCalls).toEqual([])
  })

  it('refreshWorkspace：workspace 为 null 时折成空档，choices 仍然更新', async () => {
    const { controller, client } = createHarness()
    client.workspaceImpl = async () => workspaceValue({ workspace: null, choices: [] })

    await controller.refreshWorkspace()

    const state = controller.getSnapshot()
    expect(state.workspace).toBeUndefined()
    expect(state.workspaceChoices).toEqual([])
    expect(state.workspaceError).toBeUndefined()
  })

  it('refreshWorkspace 失败：宿主码与 details 进 workspaceError，旧视图保留且不污染面板 error', async () => {
    const { controller, client } = createHarness()
    const first = workspaceView()
    client.workspaceImpl = async () => workspaceValue({ workspace: first })
    await controller.refreshWorkspace()

    client.workspaceImpl = async () => {
      throw new PanelError('workspace-unresolved', '会话 cwd 无法归属', { subject: SESSION_ID })
    }
    await controller.refreshWorkspace()

    const state = controller.getSnapshot()
    expect(state.workspace).toBe(first)
    expect(state.workspaceError?.code).toBe('workspace-unresolved')
    expect(state.workspaceError?.details).toEqual({ subject: SESSION_ID })
    expect(state.error).toBeUndefined()

    // 下一次读成功会清掉错误行。
    client.workspaceImpl = async () => workspaceValue({ workspace: first })
    await controller.refreshWorkspace()
    expect(controller.getSnapshot().workspaceError).toBeUndefined()
  })

  it('refreshWorkspace 客户端缺席（connection 边界失败）：workspaceError=unavailable 且不发请求', async () => {
    const harness = createHarness()
    harness.setClient(undefined)

    await expect(harness.controller.refreshWorkspace()).resolves.toBeUndefined()

    expect(harness.controller.getSnapshot().workspaceError?.code).toBe('unavailable')
    expect(harness.client.workspaceCalls).toEqual([])
  })

  it('updateWorkspace：在途置 savingWorkspace，成功置 workspaceSaved 并吃响应视图', async () => {
    const { controller, client } = createHarness()
    const next = workspaceView({ disabled: ['skill:openspec-propose'] })
    const gate = deferred<WorkspaceValue>()
    client.workspaceImpl = () => gate.promise

    const saving = controller.updateWorkspace('off', ['skill:openspec-propose'])

    expect(controller.getSnapshot().savingWorkspace).toBe(true)
    expect(controller.getSnapshot().workspaceSaved).toBe(false)
    expect(client.workspaceCalls).toEqual([
      { sessionId: SESSION_ID, action: 'off', addresses: ['skill:openspec-propose'] },
    ])

    const value = workspaceValue({ workspace: next, changed: ['skill:openspec-propose'] })
    gate.resolve(value)
    await saving

    const state = controller.getSnapshot()
    expect(state.savingWorkspace).toBe(false)
    expect(state.workspaceSaved).toBe(true)
    expect(state.workspace).toBe(next)
    expect(state.workspaceChoices).toEqual(value.choices)
    expect(state.workspaceError).toBeUndefined()
    // 写工作区档不追溯当前会话：不重拉面板快照。
    expect(client.panelCalls).toEqual([])
  })

  it('updateWorkspace(key)：按 workspacePath 寻址、不带 sessionId', async () => {
    const { controller, client } = createHarness()
    const target = workspaceView({ key: OTHER_WORKSPACE_PATH, title: '工作区二' })
    client.workspaceImpl = async () => workspaceValue({ workspace: target })

    await controller.updateWorkspace('on', ['skill:openspec-propose'], OTHER_WORKSPACE_PATH)

    expect(client.workspaceCalls).toEqual([
      { workspacePath: OTHER_WORKSPACE_PATH, action: 'on', addresses: ['skill:openspec-propose'] },
    ])
    expect(controller.getSnapshot().workspace).toBe(target)
    expect(controller.getSnapshot().workspaceSaved).toBe(true)
  })

  it('updateWorkspace(read, key)：切换工作区不带 addresses，也不谎报「已保存」', async () => {
    const { controller, client } = createHarness()
    const target = workspaceView({ key: OTHER_WORKSPACE_PATH })
    client.workspaceImpl = async () => workspaceValue({ workspace: target })

    await controller.updateWorkspace('read', undefined, OTHER_WORKSPACE_PATH)

    expect(client.workspaceCalls).toEqual([{ workspacePath: OTHER_WORKSPACE_PATH, action: 'read' }])
    expect(controller.getSnapshot().workspace).toBe(target)
    expect(controller.getSnapshot().workspaceSaved).toBe(false)
  })

  it('updateWorkspace(reset)：即便传了空数组也不带 addresses', async () => {
    const { controller, client } = createHarness()
    client.workspaceImpl = async () => workspaceValue()

    await controller.updateWorkspace('reset', [])

    expect(client.workspaceCalls).toEqual([{ sessionId: SESSION_ID, action: 'reset' }])
    expect(controller.getSnapshot().workspaceSaved).toBe(true)
  })

  it('updateWorkspace 失败：workspaceError 带宿主码与 details，旧视图与面板级 error 不动', async () => {
    const { controller, client } = createHarness()
    const initial = snapshot()
    client.panelImpl = async () => initial
    await controller.open()

    const first = workspaceView()
    client.workspaceImpl = async () => workspaceValue({ workspace: first })
    await controller.updateWorkspace('off', ['skill:x'])
    expect(controller.getSnapshot().workspaceSaved).toBe(true)

    // 先制造一条面板级错误，确认工作区失败不会覆盖它。
    client.toggleImpl = async () => {
      throw new PanelError('protected', 'bash 在保护名单内')
    }
    await controller.toggle('tool:bash', false)
    const panelError = controller.getSnapshot().error

    client.workspaceImpl = async () => {
      throw new PanelError('workspace-unwritable', '工作区档写入失败', { path: WORKSPACES_PATH, reason: 'EACCES' })
    }
    await controller.updateWorkspace('set', ['skill:x'])

    const state = controller.getSnapshot()
    expect(state.savingWorkspace).toBe(false)
    expect(state.workspaceSaved).toBe(false)
    expect(state.workspaceError?.code).toBe('workspace-unwritable')
    expect(state.workspaceError?.details).toEqual({ path: WORKSPACES_PATH, reason: 'EACCES' })
    expect(state.workspace).toBe(first)
    expect(state.error).toBe(panelError)
    expect(state.snapshot).toBe(initial)
    expect(client.panelCalls).toEqual([SESSION_ID])
  })

  it('updateWorkspace 在途时重复调用被忽略（savingWorkspace 守卫）', async () => {
    const { controller, client } = createHarness()
    const gate = deferred<WorkspaceValue>()
    client.workspaceImpl = () => gate.promise

    const first = controller.updateWorkspace('off', ['skill:x'])
    const duplicated = controller.updateWorkspace('off', ['skill:y'])
    expect(client.workspaceCalls.length).toBe(1)

    gate.resolve(workspaceValue())
    await Promise.all([first, duplicated])

    expect(controller.getSnapshot().savingWorkspace).toBe(false)
    expect(controller.getSnapshot().workspaceSaved).toBe(true)
  })

  it('open()：把快照里的 workspace 同步成活视图（省一次往返）', async () => {
    const { controller, client } = createHarness()
    const view = workspaceView({ disabled: ['skill:x'] })
    client.panelImpl = async () => snapshot({ workspace: view })

    await controller.open()

    expect(controller.getSnapshot().workspace).toBe(view)
    expect(client.workspaceCalls).toEqual([])
  })
})

describe('panel controller：command/executed 订阅', () => {
  it('本会话 + tools：触发一次刷新并落到新快照', async () => {
    const { controller, client, commands } = createHarness()
    const first = snapshot()
    client.panelImpl = async () => first
    await controller.open()

    const second = snapshot({ stats: { visible: 1, catalog: 4, denied: 3, shadowed: 0 } })
    client.panelImpl = async () => second
    commands.emit(SESSION_ID, 'tools')
    await flush()

    expect(client.panelCalls.length).toBe(2)
    expect(controller.getSnapshot().snapshot).toBe(second)
    expect(controller.getSnapshot().phase).toBe('ready')
  })

  it('他会话：不触发刷新', async () => {
    const { controller, client, commands } = createHarness()
    client.panelImpl = async () => snapshot()
    await controller.open()

    commands.emit(OTHER_SESSION_ID, 'tools')
    await flush()

    expect(client.panelCalls.length).toBe(1)
  })

  it('他命令：不触发刷新', async () => {
    const { controller, client, commands } = createHarness()
    client.panelImpl = async () => snapshot()
    await controller.open()

    commands.emit(SESSION_ID, 'status')
    await flush()

    expect(client.panelCalls.length).toBe(1)
  })

  it('面板关闭（idle）时即便本会话 + tools 也不刷新（下次 open 必拉）', async () => {
    const { controller, client, commands } = createHarness()
    expect(commands.subscribeCalls).toBe(1)

    commands.emit(SESSION_ID, 'tools')
    await flush()

    expect(client.panelCalls).toEqual([])
    expect(controller.getSnapshot().phase).toBe('idle')
  })

  it('构造期订阅一次，dispose 退订后事件不再触发刷新', async () => {
    const { controller, client, commands } = createHarness()
    client.panelImpl = async () => snapshot()
    await controller.open()

    expect(commands.subscribeCalls).toBe(1)
    controller.dispose()
    expect(commands.unsubscribeCalls).toBe(1)
    expect(commands.active).toBe(0)

    commands.emit(SESSION_ID, 'tools')
    await flush()
    expect(client.panelCalls.length).toBe(1)
  })
})

describe('panel controller：focus 与生命周期', () => {
  it('open() 挂一次 focus 监听，focus 触发刷新；close() 摘除后不再刷新', async () => {
    const { controller, client, focus } = createHarness()
    const first = snapshot()
    client.panelImpl = async () => first
    await controller.open()
    expect(focus.attachCalls).toBe(1)

    const second = snapshot({ state: { ...first.state, disabled: ['mcp:a'] } })
    client.panelImpl = async () => second
    focus.focus()
    await flush()
    expect(client.panelCalls.length).toBe(2)
    expect(controller.getSnapshot().snapshot).toBe(second)

    controller.close()
    expect(focus.detachCalls).toBe(1)
    expect(focus.active).toBe(0)
    expect(controller.getSnapshot().phase).toBe('idle')

    focus.focus()
    await flush()
    expect(client.panelCalls.length).toBe(2)
  })

  it('重复 open() 不重复挂 focus 监听', async () => {
    const { controller, client, focus } = createHarness()
    client.panelImpl = async () => snapshot()
    await controller.open()
    await controller.open()

    expect(focus.attachCalls).toBe(1)
  })

  it('close() 保留旧快照；重开以 loading + 旧快照重拉', async () => {
    const { controller, client } = createHarness()
    const first = snapshot()
    client.panelImpl = async () => first
    await controller.open()

    controller.close()
    expect(controller.getSnapshot().phase).toBe('idle')
    expect(controller.getSnapshot().snapshot).toBe(first)

    const gate = deferred<PanelSnapshot>()
    client.panelImpl = () => gate.promise
    const reopening = controller.open()
    expect(controller.getSnapshot().phase).toBe('loading')
    expect(controller.getSnapshot().snapshot).toBe(first)

    const next = snapshot()
    gate.resolve(next)
    await reopening
    expect(controller.getSnapshot().snapshot).toBe(next)
  })

  it('close() 作废在途拉取，不会把已关闭的面板重新置成 ready', async () => {
    const { controller, client } = createHarness()
    const gate = deferred<PanelSnapshot>()
    client.panelImpl = () => gate.promise

    const opening = controller.open()
    expect(controller.getSnapshot().phase).toBe('loading')
    controller.close()
    expect(controller.getSnapshot().phase).toBe('idle')

    gate.resolve(snapshot())
    await opening

    expect(controller.getSnapshot().phase).toBe('idle')
    expect(controller.getSnapshot().snapshot).toBeUndefined()
  })

  it('dispose()：摘 focus、退订命令、清空监听，在途拉取不再落状态', async () => {
    const { controller, client, commands, focus } = createHarness()
    const gate = deferred<PanelSnapshot>()
    client.panelImpl = () => gate.promise
    let notified = 0
    controller.subscribe(() => {
      notified += 1
    })

    const opening = controller.open()
    expect(notified).toBe(1) // loading 一次

    controller.dispose()
    expect(focus.detachCalls).toBe(1)
    expect(focus.active).toBe(0)
    expect(commands.unsubscribeCalls).toBe(1)

    gate.resolve(snapshot())
    await opening

    expect(notified).toBe(1)
    expect(controller.getSnapshot().snapshot).toBeUndefined()
  })

  it('dispose() 幂等，之后所有动作都是空操作', async () => {
    const { controller, client, focus } = createHarness()
    controller.dispose()
    controller.dispose()
    expect(focus.detachCalls).toBe(0)

    await controller.open()
    await controller.toggle('mcp:a', false)
    await controller.reset()
    await controller.updateDefaults('off', ['mcp:a'])
    await controller.refreshWorkspace()
    await controller.updateWorkspace('off', ['skill:x'])
    await flush()

    expect(client.panelCalls).toEqual([])
    expect(client.toggleCalls).toEqual([])
    expect(client.resetCalls).toEqual([])
    expect(client.defaultsCalls).toEqual([])
    expect(client.workspaceCalls).toEqual([])
    expect(controller.getSnapshot().phase).toBe('idle')
  })

  it('subscribe 退订后不再收到通知', async () => {
    const { controller, client } = createHarness()
    let notified = 0
    const unsubscribe = controller.subscribe(() => {
      notified += 1
    })

    client.panelImpl = async () => snapshot()
    await controller.open()
    expect(notified).toBe(2) // loading + ready

    unsubscribe()
    await controller.refresh()
    expect(notified).toBe(2)
  })
})
