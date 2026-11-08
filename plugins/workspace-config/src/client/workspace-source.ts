/**
 * 工作区清单源（holder 自持；`code-design.md` ③ §3.6）。
 *
 * 页面的统一工作区选择框与默认选择策略（Q10 的「最近使用」档）都要一份「已登记
 * 工作区」清单，而清单的唯一来源是上游 `workspaces` 客户端服务的 `list` 快照（Host
 * 权威顺序，与侧栏一致）。本模块把它投影成一份只读快照源，直接喂
 * `useSyncExternalStore`——因此 `getSnapshot()` 的 identity 稳定是硬要求。
 *
 * **三个生命周期事实**：
 *
 * 1. **服务晚到**：`workspaces` 可能晚于 holder 的 `apply` 就绪，所以绑定走
 *    `ctx.inject(['workspaces'], …)`——服务到达才执行回调；在 `apply` 期用 `ctx.get`
 *    硬读会把「未就绪」固化成永久缺失（D-选择框 的裁定）。
 * 2. **双版本记忆**（与 `sections.ts` 同族纪律）：版本一是「服务在不在」（`bound`），
 *    版本二是「上游快照的 identity」。两个版本都没变时 `getSnapshot()` 原样返回上一次
 *    的投影对象，变了才重建。上游 `WorkspaceSource.getSnapshot()` 自己保证 identity
 *    稳定（见下表），所以按快照 identity 记忆等价于按内容记忆，且不必逐字段比较。
 * 3. **服务退场**：注入回调返回的清理函数（服务退场 / holder 卸载时由 cordis 调用）
 *    先摘上游订阅、再把记忆复位成 `pending`，然后通知订阅者——页面回落「未就绪」，
 *    而不是指着一份已经失效的清单。
 *
 * **`pending` 的语义**（页面据此把份额降到 `{ kind: 'none' }`）：服务未绑定、快照读不出、
 * 或上游自己的到达生命周期尚未走到 `ready`，三者都算「未就绪」。**零工作区**与
 * **未就绪**是不同事实：前者是 `ready` 且零行（选择框只剩「未分配」），后者是「还不知道」。
 *
 * **为什么本文件零上游 DSH 包 import（连类型也不引）**：清单源只需按结构软读上游
 * （`ctx.inject` 回调、`list.getSnapshot` / `list.subscribe`），上游形状以上表锚点记录，
 * 不必固化成编译期依赖；代价是 `ctx` 只能收 `unknown`（`ClientContext` 类型来自上游
 * cordis 包），收益是本模块能在不含上游类型的测试环境里用假 ctx 直接驱动
 * （契约见 `code-design.md` ① §1.1 的「零上游 import」断言与 `test/workspace-source.test.ts`）。
 * 消费方照常传 `apply` 拿到的浏览器根上下文即可：结构软读落空时本模块停在 `pending`，
 * 不抛错（降级路径是设计的一部分，见 ⑥ A1）。
 *
 * **上游快照锚点**（dsh 0.2.2-rc.1 安装树，路径相对其 `node_modules/`，供漂移时定位；
 * 本文件不 import 其中任何模块）：
 *
 * | 事实 | 位置 |
 * | --- | --- |
 * | 客户端 `ctx.inject(['workspaces'], …)` 的实际用法 | `dsh-client-ui-sidebar-browser/lib/client.js:1812-1813` |
 * | `IWorkspaces.list`（客户端服务的 `list` 面） | `dsh-api-workspace-controller/lib/types/client/service.d.ts:38-44` |
 * | `WorkspaceSource`（`getSnapshot` identity 稳定 + `subscribe`） | 同文件 `:27-36` |
 * | `WorkspaceListPhase`（`pending` 单调到 `ready`） | `dsh-api-workspace-controller/lib/types/client/model.d.ts:7` |
 * | `WorkspaceSnapshot`（`items` / `phase` / `state`；无工作区时 `items` 为空数组） | 同文件 `:9-18` |
 * | `WorkspaceView`（`workspaceId` / `path` / `title` / `sessionIds` / 时间戳） | `dsh-api-workspace-controller/lib/types/types.d.ts:13-28` |
 *
 * @module dsh-plugin-workspace-config/client/workspace-source
 */

/** 选择框/默认策略用的一行（纯数据；`sessionIds` 只用于「最近使用」）。 */
export interface WorkspaceChoiceItem {
  /** Host 的 `WorkspaceId`（选择值的身份，也是选择框 Menu 行的编解码键）。 */
  readonly id: string
  /** 用户可见标题（可能为空串：显示时由消费方的 `selectionLabelOf` 用 `path` 兜底）。 */
  readonly title: string
  /** 规范绝对路径（与 `WorkspaceView.path` 同源，是各分节自己的寻址键）。 */
  readonly path: string
  /** 账到该工作区的会话 id（Host 手动顺序；「最近使用」档按它取会话 `updatedAt`）。 */
  readonly sessionIds: readonly string[]
}

/** 清单快照：`pending` = workspaces 服务未就绪（页面仍可渲染，份额给 `{kind:'none'}`）。 */
export interface WorkspaceListSnapshot {
  /** 到达阶段：`ready` 时 `items` 才是权威清单（含「零工作区」）。 */
  readonly phase: 'pending' | 'ready'
  /** 已登记工作区（Host 顺序，**不**按标题排序）；`pending` 时恒为空。 */
  readonly items: readonly WorkspaceChoiceItem[]
}

/** uSES 可用的只读源（getSnapshot 保证 identity 稳定）。 */
export interface WorkspaceListSource {
  /**
   * 读取当前清单快照（identity 稳定）。
   * @returns 当前快照；两个记忆版本都没变时返回上一次的**同一引用**。
   */
  getSnapshot(): WorkspaceListSnapshot
  /**
   * 订阅清单变化（服务到达 / 上游快照变化 / 服务退场）。
   * @param listener - 变化回调（无参数）。
   * @returns 退订函数（幂等）。
   */
  subscribe(listener: () => void): () => void
}

/**
 * 注入回调拿到的 scope 里本模块用到的唯一一栏。
 *
 * 声明成可选的 `unknown`：scope 是上游 cordis 在运行时交给回调的对象，按结构软读，
 * 不引任何类型。
 */
interface WorkspaceScopePort {
  /** 依赖声明里的 `workspaces` 服务（服务已就绪才会进回调）。 */
  readonly workspaces?: unknown
}

/** 上游 `list` 的最小结构面：只有本模块真正调用的两个方法。 */
interface WorkspaceListPort {
  /** 读当前快照（**按方法调用**：真实 store 要读 `this`，摘出来裸调会丢绑定）。 */
  getSnapshot(): unknown
  /** 订阅快照变化。 */
  subscribe(listener: () => void): () => void
}

/**
 * `ctx.inject` 的最小结构面。
 *
 * 只声明本模块用到的调用形态：返回的 fiber 不需要持有（它挂在调用方 `ctx` 的 fiber
 * 树上，holder 卸载时随树销毁，进而触发回调返回的清理函数）。
 */
interface InjectionPort {
  inject(
    deps: readonly string[],
    callback: (scope: WorkspaceScopePort) => (() => void) | undefined,
  ): unknown
}

/**
 * 空清单的共享只读数组。
 *
 * `pending` 与「`ready` 但零工作区」两种快照都复用它：空清单是同一个事实，复用让
 * identity 稳定覆盖到这两种边界。
 */
const NO_ITEMS: readonly WorkspaceChoiceItem[] = Object.freeze([])

/** 空会话 id 列表的共享只读数组（`WorkspaceChoiceItem.sessionIds` 的空结果复用它）。 */
const NO_SESSION_IDS: readonly string[] = Object.freeze([])

/** 服务未就绪的共享快照（`pending` 恒零行；引用稳定，可直接喂 uSES）。 */
const PENDING: WorkspaceListSnapshot = Object.freeze<WorkspaceListSnapshot>({
  phase: 'pending',
  items: NO_ITEMS,
})

/** 「`ready` 且零工作区」的共享快照（与 `PENDING` 的差别只有 `phase`）。 */
const READY_EMPTY: WorkspaceListSnapshot = Object.freeze<WorkspaceListSnapshot>({
  phase: 'ready',
  items: NO_ITEMS,
})

/** 「还没读过上游快照」的哨兵（`getSnapshot()` 不可能返回这个 symbol）。 */
const UNSET: symbol = Symbol('workspace-source/unset')

/**
 * 从 `ctx` 软读出可注入面。
 * @param ctx - 浏览器侧根上下文（`apply` 的入参）；类型未知以免引入上游类型。
 * @returns `ctx` 本身（`ctx.inject` 由上游 mixin 绑定过，方法调用安全），或它不可
 *   注入时 `undefined`。
 */
function injectionPortOf(ctx: unknown): InjectionPort | undefined {
  if (ctx === null || typeof ctx !== 'object') return undefined
  return typeof (ctx as { inject?: unknown }).inject === 'function'
    ? (ctx as InjectionPort)
    : undefined
}

/**
 * 从 `workspaces` 服务软读出 `list` 端口。
 *
 * 缺 `getSnapshot` / `subscribe` 任一即视为「形状不符」：清单源停在 `pending`，而不是
 * 在渲染期抛错。上游基线必然提供这两个方法（见模块头的锚点表），这条分支只为让软读
 * 有确定的降级终态。
 * @param service - 注入回调里 `scope.workspaces` 的值。
 * @returns `list` 端口，或形状不符时 `undefined`。
 */
function listPortOf(service: unknown): WorkspaceListPort | undefined {
  if (service === null || typeof service !== 'object') return undefined
  const list = (service as { list?: unknown }).list
  if (list === null || typeof list !== 'object') return undefined
  const candidate = list as { getSnapshot?: unknown; subscribe?: unknown }
  if (typeof candidate.getSnapshot !== 'function') return undefined
  if (typeof candidate.subscribe !== 'function') return undefined
  return list as WorkspaceListPort
}

/**
 * 上游快照 → 对外快照。
 *
 * 两条判定，顺序有意：
 *
 * 1. **`items` 必须是数组**：不是数组说明这个组合没给出可用清单（形状漂移 / 极简壳），
 *    按未就绪处理——宁可在页面上说「还没就绪」，也不要凭空宣告「没有工作区」。
 * 2. **上游 `phase` 未到 `ready` 也是未就绪**：上游的到达生命周期是单调
 *    `pending → ready`（`WorkspaceListPhase`），半份清单不能喂给选择框，否则默认策略
 *    会在清单落地前先选出「未分配」，页面还会闪一次。
 *
 * 投影按 `WorkspaceView` → {@link WorkspaceChoiceItem} 逐字段取，**保持 Host 顺序**
 * （不排序，与侧栏一致）：`id` 取 `workspaceId`，`title` / `path` 取原值，`sessionIds`
 * 过滤掉非字符串项。无身份的行走不进选择框（它既不能编解码 Menu 行，也不能参与
 * `only` 过滤）。
 * @param raw - 上游 `list.getSnapshot()` 的返回值（形状未知）。
 * @returns 投影后的快照；未就绪返回共享的 {@link PENDING}。
 */
function projectSnapshot(raw: unknown): WorkspaceListSnapshot {
  if (raw === null || typeof raw !== 'object') return PENDING
  const items = (raw as { readonly items?: unknown }).items
  if (!Array.isArray(items)) return PENDING
  if ((raw as { readonly phase?: unknown }).phase === 'pending') return PENDING
  const projected: WorkspaceChoiceItem[] = []
  for (const row of items) {
    const item = itemOf(row)
    if (item !== undefined) projected.push(item)
  }
  return projected.length === 0 ? READY_EMPTY : { phase: 'ready', items: projected }
}

/**
 * 一行 `WorkspaceView` → {@link WorkspaceChoiceItem}。
 * @param row - 上游快照 `items` 里的一项（形状未知）。
 * @returns 投影行；不是对象或没有可用 `workspaceId` 时 `undefined`。
 */
function itemOf(row: unknown): WorkspaceChoiceItem | undefined {
  if (row === null || typeof row !== 'object') return undefined
  const view = row as {
    readonly workspaceId?: unknown
    readonly title?: unknown
    readonly path?: unknown
    readonly sessionIds?: unknown
  }
  const id = view.workspaceId
  if (typeof id !== 'string' || id === '') return undefined
  return {
    id,
    // `title` 允许为空串（消费方用 `path` 兜底显示）；`path` 缺失同样降级成空串。
    title: typeof view.title === 'string' ? view.title : '',
    path: typeof view.path === 'string' ? view.path : '',
    sessionIds: sessionIdsOf(view.sessionIds),
  }
}

/**
 * 会话 id 列表的软读。
 * @param value - `WorkspaceView.sessionIds` 的值（形状未知）。
 * @returns 只含非空字符串的数组；空结果复用共享的 {@link NO_SESSION_IDS}。
 */
function sessionIdsOf(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return NO_SESSION_IDS
  const ids: string[] = []
  for (const id of value) {
    if (typeof id === 'string' && id !== '') ids.push(id)
  }
  return ids.length === 0 ? NO_SESSION_IDS : ids
}

/**
 * 建一个工作区清单源：`ctx.inject(['workspaces'], …)` 绑定 `list.getSnapshot/subscribe`；
 * 服务退场回落 `pending` 并通知；同一快照内容不重建（identity 稳定）。
 *
 * 绑定在**调用期**建立（`apply` 期构造一次），不按订阅者引用计数：清单只有一份，上游
 * 订阅也只有一个，页面挂载 / 卸载不需要重新协商依赖。注入回调的清理函数由 cordis 在
 * 服务退场或 holder 卸载时调用，因此「回落 `pending`」在两种情况下都成立。
 *
 * @param ctx - 浏览器侧根上下文（`apply` 的入参）。收 `unknown` 是本文件「零上游 import」
 *   契约的直接代价（`ClientContext` 类型来自上游 cordis 包）；结构软读落空时清单源停在
 *   `pending`，不抛错。
 * @returns 清单源；构造后立刻可用（未绑定时读 `pending`）。
 */
export function createWorkspaceListSource(ctx: unknown): WorkspaceListSource {
  const listeners = new Set<() => void>()

  /** 版本一：当前绑定的上游 `list`（`undefined` = 服务未就绪 / 已退场）。 */
  let bound: WorkspaceListPort | undefined
  /** 版本二：最近一次读到的上游快照 identity（{@link UNSET} = 尚无）。 */
  let upstream: unknown = UNSET
  /** 对外快照的记忆（两个版本都没变时原样返回它）。 */
  let cached: WorkspaceListSnapshot = PENDING
  /** 上游变化订阅的退订函数（与 `bound` 成对设置 / 清除）。 */
  let stopUpstream: (() => void) | undefined

  /** 通知所有订阅者（先快照再派发：回调里退订不会打乱本轮迭代）。 */
  const notify = (): void => {
    for (const listener of Array.from(listeners)) listener()
  }

  /** 复位成 `pending` 记忆（服务退场时调用；幂等）。 */
  const reset = (): void => {
    bound = undefined
    upstream = UNSET
    cached = PENDING
  }

  /**
   * 服务到达：绑定 `list` 并转发它的变化。
   * @param service - `scope.workspaces` 的值。
   * @returns 退场清理函数（幂等）；形状不符 / 订阅失败时 `undefined`（停在 `pending`）。
   */
  const attach = (service: unknown): (() => void) | undefined => {
    const list = listPortOf(service)
    if (list === undefined) return undefined
    let stop: () => void
    try {
      stop = list.subscribe(notify)
    } catch {
      // 订阅失败按「未就绪」处理：宁可页面停在 pending，也不让 apply 期抛错。
      return undefined
    }
    bound = list
    upstream = UNSET
    cached = PENDING
    stopUpstream = stop
    let detached = false
    // 到达本身就是一次变化（pending → ready，或仍是上游自己的 pending）。
    notify()
    return () => {
      if (detached) return
      detached = true
      const release = stopUpstream
      stopUpstream = undefined
      // 先摘上游订阅再改记忆：退场后迟到的上游通知不该再走到我们的订阅者。
      try {
        release?.()
      } catch {
        // 退订失败不影响回落：记忆复位与通知才是页面依赖的事实。
      }
      reset()
      notify()
    }
  }

  const source: WorkspaceListSource = {
    getSnapshot: () => {
      const list = bound
      if (list === undefined) return PENDING
      let raw: unknown
      try {
        // 按方法调用（真实 store 要读 `this`）。
        raw = list.getSnapshot()
      } catch {
        // 读数不可用 = 未就绪：调用方的降级路径比异常向上冒泡更有用。
        return PENDING
      }
      if (raw === upstream) return cached
      upstream = raw
      cached = projectSnapshot(raw)
      return cached
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  // 注入绑定：服务到达才跑回调；回调返回的清理函数由 cordis 在退场 / 卸载时调用。
  // `inject` 不可用（结构软读落空）时清单源永远 pending——页面照常渲染「未就绪」。
  injectionPortOf(ctx)?.inject(['workspaces'], (scope) => attach(scope.workspaces))

  return source
}
