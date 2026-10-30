/**
 * 面板状态机（浏览器半，**不依赖 React、不摸 DOM**，可脱离组件单测）。
 *
 * 设计（`code-design.md` 附录 §3.6）把面板的数据流拆成三层：组件只读
 * `getSnapshot()`、只调动作方法；本控制器持有该会话的**唯一一份 client 快照**；
 * `panel-client.ts` 负责线上形状与失败归一。控制器自己的职责边界：
 *
 * - **identity 稳定**：`getSnapshot()` 只在状态真正变化时换新对象，未变化时返回同一引用，
 *   可以直接喂 `useSyncExternalStore(controller.subscribe, controller.getSnapshot)`；
 * - **不做乐观更新**（D17）：`toggle` / `reset` 成功后直接用宿主响应里的新快照整份替换，
 *   失败保留旧快照；界面上的开关翻转永远以宿主返回为准；
 * - **stale-while-revalidate**：重拉（`open()` / `refresh()` / focus / `command/executed`）
 *   期间 `phase` 是 `loading`，但 `snapshot` 仍是上一份可用数据，面板不会闪成空白；
 * - **渲染期软取 client**：`connection` 可能晚于插件 `apply` 就绪（web-ux v1.2.0 的踩坑），
 *   所以构造参数是 `resolveClient()` 而不是一个固定 client；每次动作现取，`undefined` 时
 *   直接进 `failed('unavailable')` 且不发请求。
 *
 * 四类刷新触发（§3.6）：① `open()` 必拉；② 每次成功 mutation 吃响应快照；③ 本会话的
 * `/tools` 命令执行完（`command/executed`）；④ 显式 `refresh()` 与 `focus`。③④ 的订阅面
 * 由外部注入（`subscribeCommandExecuted` / `attachFocusListener`），控制器不直接摸
 * `ctx` 或 `window`：既有 10.5 在装配期桥接的余地，也让本套件能用假端口驱动。
 *
 * 每会话一个实例（组件侧 `useMemo` 按 `sessionId` 缓存；见 10.4），`dispose()` 摘掉全部
 * 订阅并丢弃在途响应。
 *
 * @module dsh-plugin-session-tool-toggle/client/panel-controller
 */

import type { DefaultsAction, DefaultsView, PanelSnapshot } from '../contract.ts'
import { PanelError, type PanelClient } from './panel-client.ts'

/** 面板的可见阶段：`idle`（未打开）→ `loading` → `ready` / `failed`。 */
export type PanelPhase = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * `command/executed` 的窄订阅面：只关心「哪个会话」与「命令名」。
 *
 * 与 `@deepseek-ai/dsh-client-ui-commands` 的事件载荷 `(sessionId, name, result)` 相比
 * 少一个 `result`——面板只把「`/tools` 改过状态」当刷新信号，不消费回执。10.5 可以把
 * `ctx.on('command/executed', …)` 的处理函数直接透传进来（TS 允许少参数）。
 * @param sessionId - 本地提交命令的目标会话。
 * @param name - 命令名（不带前导 `/`）。
 */
export type CommandExecutedHandler = (sessionId: string, name: string) => void

/** 面板的只读状态快照（整体不可变；字段变化时换新对象）。 */
export interface PanelState {
  /**
   * 可见阶段。
   *
   * `failed` 表示**最近一次操作没拿到可用快照**：拉取失败时 `snapshot` 仍可能是上一份
   * 可用数据（stale-while-revalidate），组件据此渲染「旧内容 + 错误行」而不是降级占位。
   */
  readonly phase: PanelPhase
  /** 最近一次成功取得的宿主快照（加载或 mutation 响应；失败时保留旧值）。 */
  readonly snapshot?: PanelSnapshot
  /** 最近一次面板级失败（拉取或 mutation）；成功一次后清空。 */
  readonly error?: PanelError
  /** 在途的开关地址（每个地址一个 in-flight 请求；面板据此禁用对应行）。 */
  readonly pending: ReadonlySet<string>
  /** `reset()` 在途（重置没有地址，用独立标志让整面板禁用）。 */
  readonly resetting: boolean
  /** 用户级默认档写在途（`DefaultsEditor` 据此禁用保存按钮）。 */
  readonly savingDefaults: boolean
  /**
   * 默认档的**活视图**：每次拿到宿主快照（加载 / mutation）都与 `snapshot.defaults`
   * 同步，`updateDefaults` 成功后只替换它。默认档不追溯当前会话，所以保存后**不**重拉
   * 面板快照（§3.4），`DefaultsEditor` 读这个字段而不是 `snapshot.defaults`。
   */
  readonly defaults?: DefaultsView
  /** 默认档写失败；与面板级 `error` 分开，避免一次保存失败糊掉整个面板。 */
  readonly defaultsError?: PanelError
  /** 最近一次成功取得面板快照的时间（`now()`，epoch ms；0 = 还没成功过）。 */
  readonly loadedAt: number
}

/** 构造参数。 */
export interface PanelControllerOptions {
  /**
   * 现取面板客户端。
   *
   * 每次动作调用一次；连接可能晚于 `apply` 就绪，所以**不要**缓存 `undefined`
   * （返回 `undefined` 时控制器进 `failed('unavailable')`，connection 到位后下一次
   * `open()` / `refresh()` 会自然重试）。
   */
  readonly resolveClient: () => PanelClient | undefined
  /** 本控制器服务的会话 id（每个请求都带它，跨会话不复用）。 */
  readonly sessionId: string
  /** 取时间戳（默认 `Date.now`）；测试注入固定值让 `loadedAt` 可断言。 */
  readonly now?: () => number
  /** 状态变化的旁路通知（与 `subscribe` 等价，便于装配期接日志/调试）。 */
  readonly onChange?: () => void
  /**
   * 注入 `command/executed` 订阅面（10.5 用 `ctx.on('command/executed', …)` 实现）。
   * 订阅发生在构造期，退订在 `dispose()`；未注入时该触发源不存在。
   * @param handler - 命令执行回调（只会在本窗口本地提交时被调用，`@mode emit`）。
   * @returns 退订函数。
   */
  readonly subscribeCommandExecuted?: (handler: CommandExecutedHandler) => () => void
  /**
   * 注入 `window` 的 `focus` 订阅面（10.5 用 `window.addEventListener('focus', …)` 实现）。
   * 只在面板打开（`open()`）时挂一次，`close()` / `dispose()` 摘除。
   * @param handler - focus 回调。
   * @returns 摘除函数。
   */
  readonly attachFocusListener?: (handler: () => void) => () => void
}

/** 客户端缺席时的兜底说明（用户看到的主文案仍是 locale 的 `error.unavailable`）。 */
const CLIENT_MISSING_MESSAGE = '面板客户端尚未就绪：connection 可能晚于插件 apply 挂载'

/**
 * 把任意抛出值归一成 {@link PanelError}。
 *
 * `panel-client.ts` 已承诺只抛 `PanelError`；这里兜的是测试替身或未来实现漏抛的
 * 意外值（比如 `TypeError`）。归 `internal` 而不是 `unavailable`：连不上与代码抛错
 * 的排障方向相反，不能混成同一句文案。
 * @param error - 捕获到的任意值。
 * @returns 带稳定码的失败对象。
 */
function asPanelError(error: unknown): PanelError {
  if (error instanceof PanelError) return error
  return new PanelError('internal', error instanceof Error ? error.message : String(error))
}

/**
 * 复制一份 pending 集合并加入地址（**绝不原地修改**已发布给渲染层的 Set）。
 * @param pending - 当前集合。
 * @param address - 要加入的地址。
 * @returns 新集合。
 */
function withPending(pending: ReadonlySet<string>, address: string): ReadonlySet<string> {
  const next = new Set(pending)
  next.add(address)
  return next
}

/**
 * 复制一份 pending 集合并移除地址。
 * @param pending - 当前集合。
 * @param address - 要移除的地址。
 * @returns 新集合。
 */
function withoutPending(pending: ReadonlySet<string>, address: string): ReadonlySet<string> {
  const next = new Set(pending)
  next.delete(address)
  return next
}

/**
 * 每会话一个的面板状态机。
 *
 * 所有动作方法都**不抛错**（失败落进状态），返回值只为测试与调用顺序提供 join 点；
 * 组件侧按 `void controller.toggle(…)` 调用即可。
 */
export class PanelController {
  /** 本控制器服务的会话 id（只读；组件侧 `key` 与调试用）。 */
  readonly sessionId: string

  private readonly options: PanelControllerOptions
  private state: PanelState = {
    phase: 'idle',
    pending: new Set<string>(),
    resetting: false,
    savingDefaults: false,
    loadedAt: 0,
  }
  private readonly listeners = new Set<() => void>()
  private commandDisposer: (() => void) | undefined
  private focusDisposer: (() => void) | undefined
  /** 拉取序号：只有最后一次发出的拉取可以落状态（focus / 命令 / 手动刷新可能重叠）。 */
  private loadSeq = 0
  private disposed = false

  /**
   * @param options - 依赖注入面（见 {@link PanelControllerOptions}）。
   */
  constructor(options: PanelControllerOptions) {
    this.options = options
    this.sessionId = options.sessionId
    this.subscribeCommands()
  }

  /**
   * 读取当前状态（identity 稳定；供 `useSyncExternalStore`）。
   * @returns 当前状态对象，未变化时是同一引用。
   */
  readonly getSnapshot = (): PanelState => this.state

  /**
   * 订阅状态变化（供 `useSyncExternalStore`）。
   * @param listener - 失效回调。
   * @returns 退订函数；已 `dispose()` 时是空操作。
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 打开面板：挂 focus 监听并立即拉取（打开 → 关闭 → 再打开也重拉）。
   * @returns 本次拉取完成的 promise（失败已落状态，不 reject）。
   */
  async open(): Promise<void> {
    if (this.disposed) return
    this.attachFocus()
    await this.refresh()
  }

  /**
   * 关闭面板：摘 focus 监听、回到 `idle`，**保留快照**供下次打开即时渲染。
   *
   * 在途拉取会被序号失效（否则它回来时会把已关闭的面板重新置成 `ready`）；
   * 在途 mutation 仍会清掉自己的 `pending`，但不改变 `idle` 阶段。
   */
  close(): void {
    if (this.disposed) return
    this.detachFocus()
    this.loadSeq += 1
    if (this.state.phase === 'idle' && this.state.error === undefined && this.state.defaultsError === undefined) {
      return
    }
    this.patch({ phase: 'idle', error: undefined, defaultsError: undefined })
  }

  /**
   * 显式重拉面板快照（手动刷新按钮；`open()` 也走这里）。
   *
   * 已在 `loading` 时直接返回：重叠的 focus / 命令事件不重复打宿主。失败时进 `failed`
   * 但保留上一份快照（stale-while-revalidate）。
   * @returns 本次拉取完成的 promise（失败已落状态，不 reject）。
   */
  async refresh(): Promise<void> {
    if (this.disposed || this.state.phase === 'loading') return
    const client = this.resolveClient()
    if (client === undefined) {
      // 直接进 failed（设计 §3.6：undefined 时不发请求），同时作废在途拉取。
      this.loadSeq += 1
      this.patch({ phase: 'failed', error: new PanelError('unavailable', CLIENT_MISSING_MESSAGE) })
      return
    }
    const seq = (this.loadSeq += 1)
    this.patch({ phase: 'loading', error: undefined })
    try {
      const snapshot = await client.panel(this.sessionId)
      this.commitLoad(seq, { phase: 'ready', snapshot, defaults: snapshot.defaults, error: undefined, loadedAt: this.now() })
    } catch (error: unknown) {
      this.commitLoad(seq, { phase: 'failed', error: asPanelError(error) })
    }
  }

  /**
   * 开关一个地址（整组或单工具）。
   *
   * 不做乐观更新：在途期间该地址进 `pending`（面板禁用对应开关），成功后用响应里的
   * `snapshot` 整份替换并清 `error`；失败只清 `pending` 并把失败放进 `error`，旧快照
   * 原样保留。同一地址在途时重复调用被忽略（避免一次点击发两个互相覆盖的请求）。
   * @param address - 规范形地址（`mcp:<server>` / `mcp:<server>::<tool>` / `tool:<name>`）。
   * @param on - `true` 开启（移出关闭集）、`false` 关闭（加入关闭集）。
   * @returns 本次请求完成的 promise（失败已落状态，不 reject）。
   */
  async toggle(address: string, on: boolean): Promise<void> {
    if (this.disposed || this.state.pending.has(address)) return
    const client = this.resolveClient()
    if (client === undefined) {
      this.patch({ error: new PanelError('unavailable', CLIENT_MISSING_MESSAGE), phase: this.mutationPhase() })
      return
    }
    this.patch({ pending: withPending(this.state.pending, address) })
    try {
      const value = await client.toggle(this.sessionId, on, [address])
      if (this.disposed) return
      // 响应里的快照比在途拉取更新：作废更早发出的 panel 请求，避免旧读数覆盖新写。
      this.loadSeq += 1
      this.patch({
        pending: withoutPending(this.state.pending, address),
        snapshot: value.snapshot,
        defaults: value.snapshot.defaults,
        error: undefined,
        phase: this.state.phase === 'idle' ? 'idle' : 'ready',
        loadedAt: this.now(),
      })
    } catch (error: unknown) {
      if (this.disposed) return
      this.patch({
        pending: withoutPending(this.state.pending, address),
        error: asPanelError(error),
        phase: this.mutationPhase(),
      })
    }
  }

  /**
   * 本会话回到创建时快照（与 `toggle` 共享 `ToggleValue` 响应形状）。
   *
   * `pending` 是按地址的，重置没有地址，因此用独立的 `resetting` 标志让面板整体禁用；
   * 成功/失败的快照语义与 `toggle` 相同。
   * @returns 本次请求完成的 promise（失败已落状态，不 reject）。
   */
  async reset(): Promise<void> {
    if (this.disposed || this.state.resetting) return
    const client = this.resolveClient()
    if (client === undefined) {
      this.patch({ error: new PanelError('unavailable', CLIENT_MISSING_MESSAGE), phase: this.mutationPhase() })
      return
    }
    this.patch({ resetting: true })
    try {
      const value = await client.reset(this.sessionId)
      if (this.disposed) return
      this.loadSeq += 1
      this.patch({
        resetting: false,
        snapshot: value.snapshot,
        defaults: value.snapshot.defaults,
        error: undefined,
        phase: this.state.phase === 'idle' ? 'idle' : 'ready',
        loadedAt: this.now(),
      })
    } catch (error: unknown) {
      if (this.disposed) return
      this.patch({ resetting: false, error: asPanelError(error), phase: this.mutationPhase() })
    }
  }

  /**
   * 写用户级默认档（不追溯已存在会话）。
   *
   * 与面板级动作的区别：成功后只替换 `state.defaults`，**不重拉 panel 快照**（默认档
   * 不追溯，§3.4），也不动 `error`；失败进 `defaultsError` 并保持面板可用。在途时
   * `savingDefaults` 为 `true`。
   * @param action - `set` / `off` / `on` / `reset`。
   * @param addresses - 目标地址；`reset` 时不传（契约不允许该组合同现）。
   * @returns 本次请求完成的 promise（失败已落状态，不 reject）。
   */
  async updateDefaults(action: DefaultsAction, addresses?: readonly string[]): Promise<void> {
    if (this.disposed || this.state.savingDefaults) return
    const client = this.resolveClient()
    if (client === undefined) {
      this.patch({ defaultsError: new PanelError('unavailable', CLIENT_MISSING_MESSAGE) })
      return
    }
    this.patch({ savingDefaults: true, defaultsError: undefined })
    try {
      const value = await client.updateDefaults(action, addresses)
      if (this.disposed) return
      this.patch({ savingDefaults: false, defaults: value.defaults, defaultsError: undefined })
    } catch (error: unknown) {
      if (this.disposed) return
      this.patch({ savingDefaults: false, defaultsError: asPanelError(error) })
    }
  }

  /**
   * 摘掉全部订阅（命令事件、focus），清空监听者并丢弃在途响应。
   *
   * 幂等；之后所有动作方法都是空操作，不再发请求。
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.loadSeq += 1
    this.detachFocus()
    this.commandDisposer?.()
    this.commandDisposer = undefined
    this.listeners.clear()
  }

  /**
   * 订阅命令事件：仅「本会话 + `tools`」且面板已打开时才刷新。
   *
   * 面板关闭时不刷新——下一次 `open()` 必拉，凭空把 `phase` 置成 `loading` 会让
   * Modal 自己弹出来。订阅面抛错时静默降级（缺一个刷新触发源，不影响面板可用）。
   */
  private subscribeCommands(): void {
    const subscribe = this.options.subscribeCommandExecuted
    if (subscribe === undefined) return
    try {
      this.commandDisposer = subscribe((sessionId, name) => {
        if (this.disposed || sessionId !== this.sessionId || name !== 'tools') return
        if (this.state.phase === 'idle') return
        void this.refresh()
      })
    } catch {
      this.commandDisposer = undefined
    }
  }

  /** 面板打开时挂一次 focus 监听（重复 `open()` 不重复挂，已挂则不动）。 */
  private attachFocus(): void {
    if (this.focusDisposer !== undefined) return
    const attach = this.options.attachFocusListener
    if (attach === undefined) return
    try {
      this.focusDisposer = attach(() => {
        if (this.disposed || this.state.phase === 'idle') return
        void this.refresh()
      })
    } catch {
      this.focusDisposer = undefined
    }
  }

  /** 摘 focus 监听（未挂时是空操作）。 */
  private detachFocus(): void {
    this.focusDisposer?.()
    this.focusDisposer = undefined
  }

  /**
   * mutation 之后应处的阶段。
   *
   * - 面板已关闭（`idle`）：保持关闭，不因为一次迟到的 mutation 响应把 Modal 打开；
   * - 面板开着且有快照：`ready`（失败只加错误行，不销毁面板，§3.6）；
   * - 面板开着但还没有过任何快照：`failed`（没有可渲染内容）。
   * @returns 目标阶段。
   */
  private mutationPhase(): PanelPhase {
    if (this.state.phase === 'idle') return 'idle'
    return this.state.snapshot === undefined ? 'failed' : 'ready'
  }

  /**
   * 落一次拉取结果：只允许最后一次发出的拉取提交（`close()` / 新拉取会推进序号）。
   * @param seq - 该次拉取启动时的序号。
   * @param change - 要合并进状态的变化。
   */
  private commitLoad(seq: number, change: Partial<PanelState>): void {
    if (this.disposed || seq !== this.loadSeq) return
    this.patch(change)
  }

  /**
   * 合并状态并通知：先 `onChange`，再逐个 `subscribe` 的监听者。
   * @param change - 要覆盖的字段。
   */
  private patch(change: Partial<PanelState>): void {
    this.state = { ...this.state, ...change }
    this.options.onChange?.()
    // 通知期内可能有人退订/订阅：固定住本次的监听者名单，行为可预测。
    for (const listener of Array.from(this.listeners)) listener()
  }

  /**
   * 现取面板客户端。
   *
   * 解析器本身抛错（例如装配期读 `connection` 的方式出错）时按「未就绪」处理：
   * 状态机承诺动作方法不抛错，不能让一个 `TypeError` 漏给渲染层。
   * @returns 客户端或 `undefined`。
   */
  private resolveClient(): PanelClient | undefined {
    try {
      return this.options.resolveClient()
    } catch {
      return undefined
    }
  }

  /**
   * 取当前时间（测试注入固定值）。
   * @returns epoch ms。
   */
  private now(): number {
    return this.options.now?.() ?? Date.now()
  }
}
