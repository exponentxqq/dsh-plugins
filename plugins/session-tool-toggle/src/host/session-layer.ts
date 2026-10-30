/**
 * 每 agent 层：把「本会话关了什么」翻译成一个 agent 作用域上的三个具体效果。
 *
 * 层只做三件事，且全部在该 agent 的子 fiber
 * （`agent.ctx.inject(['tools','systemPrompt'], …)`）内注册：
 *
 * - **restrict**：把 deny 集合掩进该 agent 的工具视图，schema 从模型请求里消失；
 * - **guard**：执行期守卫，闭包读**实时**关闭集，被关工具的迟到调用会得到可读理由；
 * - **section**：整组关闭时注册一条与 `mcp:<server>` **同名**的空段，遮蔽服务器指令段。
 *   同名遮蔽只在 agent 作用域安全（D4）：全局层注册同名段会把该指令段对所有会话吞掉，
 *   同一层里重复注册还会抛错。
 *
 * 掩码的来源是本插件自己的 `planMask(...)`（三读并集：catalog / scoped / carried，见
 * `mask.ts`），因此这里与 `project-mcp` 的隔离层结构同构，差别只有 deny 的推导来源：
 * 那边是「工作区归属」，这边是「会话开关状态」。先例：`plugins/project-mcp/src/host/
 * isolation.ts` 的 attach / detach / refresh 生命周期、diff 守卫、restrict 抛错重试一次、
 * `inactive context` 视为退场。
 *
 * 六条不变量（每条都有单测钉住，见 `test/session-layer.test.ts`）：
 *
 * - **I1** guard 只装一次，闭包读 `state.disabled` 的最新值 —— 开关变化只重算掩码，
 *   从不重装守卫，因此「命令返回后关掉的东西立刻不可调」没有窗口；
 * - **I2** 同一 deny 集合的二次 `refresh()` **不**产生新的 `restrict()` 调用：`restrict`
 *   自己会触发 `tools/change`，重装一个没有变化的集合会自激；
 * - **I3** `restrict` 抛错（名字在读与写之间从注册表消失）→ 抬掉旧掩码、从活读数重推
 *   一次、重试**一次**；仍失败则保持无掩码（guard 仍在拦）+ error 日志；
 * - **I4** section 的 name 恒为 `mcp:<server>`、`order = sectionOrder('MCP_SERVERS')`、
 *   `text: ''`、`interpolate: false`；
 * - **I5** `detach` 里每步各自 try/catch，`inactive context` 静默（那是退场，不是失败）；
 * - **I6** `restrict()` 可能**同步**触发 `tools/change`（`dsh-scope` 的 `ScopedLayers.effect`
 *   在返回 disposer 之前就广播）：`reconcile()` 必须对该重入幂等——同步回声直接跳过，
 *   不得再发起一次 `restrict`（R26：否则 `restrict → change → refresh → reconcile`
 *   无限递归，`/tools off` 永不返回）。
 *
 * 两条刻意的取舍：
 *
 * - **不 await `agent.whenIdle()`**（D7）：状态变更即时应用，长轮次里回执不会卡住；
 *   需要的一致性由 guard 提供，下一次请求会经 `tools/change` 自动收敛。
 * - **`snapshot()` 报「一手事实」**：deny / shadowServers 都是**已经装上**的集合，
 *   而不是计划值。`restrict` 失败时 deny 为空是真相（模型仍看得见 schema），命令面用
 *   `state.disabled` 解释意图，不该让读数替失败背锅。
 *
 * @module dsh-plugin-session-tool-toggle/host/session-layer
 */

import { guardReason, planMask, type MaskPlan } from './mask.ts'
import { EMPTY_STATE } from './state.ts'
import type {
  AgentLike,
  LayerHandle,
  LayerSnapshot,
  ScopedSurface,
  SessionToolState,
  SpecLog,
} from './types.ts'

/** 遮蔽段的段名前缀：必须与 `dsh-mcp-client` 的全局段同名，遮蔽才成立（D4）。 */
const MCP_SECTION_PREFIX = 'mcp:'

/** 中央分配的段顺序名：`mcp:<server>` 段必须与官方 MCP 行同序（I4）。 */
const MCP_SERVERS_ORDER = 'MCP_SERVERS'

/** 一条诊断里最多列几个名字，其余折成计数（避免日志被上百个 MCP 名撑爆）。 */
const REPORTED_NAMES = 6

/**
 * 在 agent 的子 fiber 内交付一个 {@link ScopedSurface}。
 *
 * 生产实现是 {@link agentSurface}；单测注入假实现，因此层本身不需要拉起宿主，也不需要
 * 认识 Cordis。回调式而不是「返回 surface」式，是因为效果必须注册在 `ctx.inject` 的子
 * fiber 里才能随该 agent 一起卸载。
 */
export type SurfaceOpener = (
  agent: AgentLike,
  use: (surface: ScopedSurface) => void,
) => Promise<void>

/** 层的外部依赖：诊断出口、全局读数、取工具面的方式。 */
export interface SessionLayerPorts {
  /** 诊断出口（生产是 `scanLog` 同形的进程日志，单测收集）。 */
  readonly log: SpecLog
  /**
   * 宿主**全局层**的工具注册名（插件自身 ctx 读，**不受**任何 agent 限制）。
   *
   * 这必须是**未掩码**的注册集：从 agent 已被本插件掩过的视图推导 deny 会算出越来越小的
   * 集合，于是「掩上 → 抬掉 → 再掩上」地振荡（`mask.ts` 的 carried 正是为此存在）。
   */
  readonly catalog: () => readonly string[]
  /** 取工具面的方式；缺省是 {@link agentSurface}（生产唯一实现）。 */
  readonly openSurface?: SurfaceOpener
}

/**
 * `agent.ctx` 的最小面：本层只用 `inject`，且只用它建立子 fiber。
 *
 * 真实类型是 Cordis `Context`（`types.ts` 把 `AgentLike.ctx` 声明成 `unknown`），这里按
 * 结构类型收窄，因此本模块不 import 任何宿主包——构建产物仍是零运行时依赖。
 */
interface InjectableAgentContext {
  /**
   * 等依赖服务就绪后在子 fiber 内运行回调（Cordis `ctx.inject` 的简写语义）。
   * @param deps - 依赖服务名。
   * @param callback - 在子作用域里运行的回调。
   * @returns 随 fiber 加载结束而结算的 thenable。
   */
  inject(
    deps: readonly string[],
    callback: (scope: AgentServiceScope) => void,
  ): PromiseLike<unknown>
}

/**
 * 子 fiber 里实际拿到的两个服务的窄面（与宿主的 `Tools` / `SystemPrompt` 同形）。
 *
 * 只声明本层真正调用的五个方法：多声明一个就多一处与宿主 API 漂移的接触面。
 */
interface AgentServiceScope {
  /** 工具注册表（`@deepseek-ai/dsh-tools` 的 `Tools`）。 */
  readonly tools: {
    /** 追加一条 deny 掩码，返回抬起它的 disposer。 */
    restrict(filter: { readonly deny: readonly string[] }): () => void
    /** 装一个执行期守卫，返回卸载它的 disposer。 */
    guard(guard: (execution: { readonly name: string }) => string | undefined): () => void
    /** 某个作用域视角下的工具 schema（本层只取名字）。 */
    schemas(scope?: object): readonly { readonly name: string }[]
  }
  /** 系统提示注册表（`@deepseek-ai/dsh-system-prompt` 的 `SystemPrompt`）。 */
  readonly systemPrompt: {
    /** 在当前作用域注册一条指令段，返回撤掉它的 disposer。 */
    section(section: {
      readonly name: string
      readonly order: number
      readonly text: string
      readonly interpolate?: boolean
    }): () => void
    /** 中央分配的段顺序（`mcp:<server>` 必须与官方 MCP 行同序）。 */
    getSectionOrder(name: string): number
  }
}

/**
 * 生产用的工具面打开器：在该 agent 的子 fiber 内取 `tools` 与 `systemPrompt`。
 *
 * 官方先例是 `dsh-file-reference-local` 的 `agent.ctx.inject(['systemPrompt','tools'], …)`
 * 用法：效果注册在子 fiber 上，随 agent 卸载而卸载；本层的显式 disposer 只是让它能
 * 更早、更精确地抬掉某个效果（`detach` 与 diff 守卫）。
 *
 * 失败以 rejected Promise 交付（缺 `inject`、fiber 加载抛错），由 {@link SessionLayer.attach}
 * 转成一条 error 日志——一个 agent 的装配失败不该冒泡成 `agent/created` 的异常。
 *
 * @param agent - 目标 agent。
 * @param use - 拿到工具面后的回调（在子 fiber 内同步执行）。
 * @returns 子 fiber 加载结束后结算。
 */
export function agentSurface(
  agent: AgentLike,
  use: (surface: ScopedSurface) => void,
): Promise<void> {
  const ctx = agent.ctx as Partial<InjectableAgentContext> | null | undefined
  if (ctx === null || ctx === undefined || typeof ctx.inject !== 'function') {
    return Promise.reject(
      new Error('agent.ctx 上没有 inject()：无法在该会话的子 fiber 内取到 tools / systemPrompt'),
    )
  }
  try {
    return Promise.resolve(
      ctx.inject(['tools', 'systemPrompt'], (scope) => {
        use(surfaceOf(scope, agent))
      }),
    ).then(() => undefined)
  } catch (error) {
    // 假 inject 或宿主重载期可能同步抛错；统一转成 rejected Promise，调用方只需一条路径。
    return Promise.reject(error)
  }
}

/**
 * 把子作用域的两个服务收成 {@link ScopedSurface}。
 *
 * `schemas(agent)` 显式传 agent 对象（宿主用它当 scope key，与 `project-mcp` 的
 * `scopedTools` 同一约定）：不传会读到全局层，而模型可见的 MCP 行在某些部署里坐在
 * agent 平面，只读全局会漏。
 * @param scope - 子 fiber 交付的服务面。
 * @param agent - 目标 agent（同时是 `scope key`）。
 * @returns 窄面。
 */
function surfaceOf(scope: AgentServiceScope, agent: AgentLike): ScopedSurface {
  return {
    restrict: (filter) => scope.tools.restrict(filter),
    guard: (guard) => scope.tools.guard(guard),
    section: (section) => scope.systemPrompt.section(section),
    visibleNames: () => scope.tools.schemas(agent).map((schema) => schema.name),
    sectionOrder: (name) => scope.systemPrompt.getSectionOrder(name),
  }
}

/**
 * 一个会话（一个 agent）的层。一个实例只服务一个 agent：`attach` 绑定 agent，`detach`
 * 解绑；`LayerHandle` 的 `setState` / `snapshot` / `visibleNames` 是命令面与 Web 面板的
 * 唯一读写路径（`types.ts` 的 `LayerHandle`）。
 *
 * 生命周期（由装配层驱动，见任务 8.1）：
 *
 * 1. `agent/created` → `await attach(agent, state)`（返回 Promise 是为了先于该会话的首次
 *    装配：首轮掩码在模型看到工具列表之前就已生效）；
 * 2. 状态变更（命令 / RPC）→ `setState(state)`；
 * 3. `tools/change` → `refresh()`（幂等，全量重算）；
 * 4. agent 退场 → `detach()`（或装配层把 `detach` 挂进 agent 自己的 effect）。
 */
export class SessionLayer implements LayerHandle {
  /** 诊断出口。 */
  private readonly log: SpecLog

  /** 全局层读数（未掩码的注册集）。 */
  private readonly catalog: () => readonly string[]

  /** 取工具面的方式。 */
  private readonly openSurface: SurfaceOpener

  /** 绑定的 agent（`detach` 后清空）。 */
  private agent: AgentLike | undefined

  /** 交付的工具面（`detach` 后清空）。 */
  private surface: ScopedSurface | undefined

  /** 最新整值状态；`state.disabled` 是 guard 与掩码的共同输入。 */
  private state: SessionToolState = EMPTY_STATE

  /** 当前**已生效**的 deny 集合（同时是下一轮的 carried）。 */
  private deny: readonly string[] = []

  /** 已装上的遮蔽段：server → disposer。键集就是「已生效的 shadowServers」。 */
  private readonly sections = new Map<string, () => void>()

  /** 当前掩码的 disposer（没有掩码时 undefined）。 */
  private restriction: (() => void) | undefined

  /** 当前守卫的 disposer（守卫只装一次，见 I1）。 */
  private guardDispose: (() => void) | undefined

  /**
   * 该 agent 的作用域已被观察到「不活动」（Cordis `inactive context`）。
   *
   * 那是退场而不是失败：`detach` 时逐项抬效果本来就会撞上，宿主卸载期还会为每个工具
   * 的注销各触发一次 `tools/change`。一旦置位就不再重算，避免把一次退场记成一轮失败。
   */
  private retreat = false

  /**
   * 重入闸：当前是否正身处一轮 {@link reconcile}（I6）。
   *
   * `restrict()` 可能**同步**触发 `tools/change`：`dsh-scope` 的 `ScopedLayers.effect` 在
   * 返回 disposer 之前就广播，而装配层的监听器（`src/host/index.ts`）会同步回调每个层的
   * `refresh()`。这条重入路径**只可能**来自本轮刚发起的那次 `restrict`：此时计划与掩码
   * 都是本轮刚算出的值，且 `this.deny` 要等 `surface.restrict()` 返回后才更新。若放它进来，
   * 重入的 `reconcile()` 会拿旧账判「deny 变了」→ 再 `restrict` → 再重入，无限递归
   * （R26：实测调用栈 1,485 帧、CPU 100%、`/tools off` 永不返回）。
   *
   * 因此入口直接返回：跳过的一定是「本轮 restrict 的同步回声」，而不是信息丢失——真实的
   * 后续变化（`setState` / 用户操作 / 异步工具注册）不会发生在 `restrict` 的同步栈里，
   * 它们会在下一次独立的 `reconcile()` 中照常生效。
   *
   * 闸必须放在 `reconcile()` 入口而不是 `restrict()` 内部：I3 的重试（首次失败 → 从活读数
   * 重推 → 再 `restrict` 一次）是**同一个** `reconcile()` 调用内的合法路径，不能被它挡住。
   */
  private reconciling = false

  /**
   * @param ports - 诊断出口、全局读数与取工具面的方式。
   */
  constructor(ports: SessionLayerPorts) {
    this.log = ports.log
    this.catalog = ports.catalog
    this.openSurface = ports.openSurface ?? agentSurface
  }

  /**
   * 挂载：在 agent 的子 fiber 内装 guard（一次）并应用首轮掩码。
   *
   * 顺序写死：先装 guard 再应用掩码。反过来的话，首轮 `restrict` 生效到 guard 装上之间的
   * 极短窗口里，被关工具仍可被调用。
   *
   * 失败不冒泡：`agent/created` 是串行广播，一个会话的层装配失败不该让会话创建失败；
   * 代价是那个会话的开关退化为「无效果」，由 error 日志暴露。
   * @param agent - 目标 agent（提供会话与子 fiber 的上下文）。
   * @param state - 该会话的当前状态（`agent/created` 里刚从存储读到的整值）。
   * @returns 子 fiber 加载结束且首轮掩码已应用后结算。
   */
  async attach(agent: AgentLike, state: SessionToolState): Promise<void> {
    if (this.agent !== undefined) {
      this.log.warn(`${this.label()}：层已挂载，忽略重复 attach`)
      return
    }

    this.agent = agent
    this.state = state
    this.retreat = false

    try {
      await this.openSurface(agent, (surface) => {
        this.surface = surface
        this.installGuard(surface)
        this.reconcile()
      })
    } catch (error) {
      this.absorbFailure(error, `${this.label()}：无法在 agent 的子 fiber 内取到工具面`)
    }

    if (this.surface === undefined) {
      this.log.warn(`${this.label()}：未取到工具面，本会话的开关暂时不生效`)
    }
  }

  /**
   * 状态变更：重算掩码，并只在 deny / shadowServers 变化时重装（I2 的 diff 守卫）。
   *
   * 刻意**不** `await agent.whenIdle()`（D7）：命令 handler 同步返回回执，需要的一致性由
   * guard 提供——被关工具从这一刻起不可调用，即使这一轮请求的 schema 还没重算。
   * @param state - 新的整值状态。
   */
  setState(state: SessionToolState): void {
    this.state = state
    this.reconcile()
  }

  /**
   * `tools/change` 全量重算：三读并集重新取一遍，结果与当前掩码相同则什么都不做。
   *
   * 幂等是硬要求：`restrict` 自己会触发 `tools/change`，一次不幂等的重算会喂自己。
   */
  refresh(): void {
    this.reconcile()
  }

  /**
   * 拆卸：抬掩码、撤 section、撤 guard、清账。
   *
   * 每一步各自 try/catch（I5）：某一步撞上 `inactive context` 只说明作用域已经先行退场，
   * 不该阻止其余步骤收尾，也不该记成 error。`detach` 幂等，第二次调用是纯 no-op。
   */
  detach(): void {
    const surface = this.surface
    // 标签要在清空 agent 之前取：诊断里必须能指认是哪个会话。
    const label = this.label()

    // 1) 抬掩码。disposer 已经拿到，不依赖 surface 仍然活着。
    this.liftRestriction()

    // 2) 撤 section：逐个独立容错，一个失败不阻止后面的清理。
    for (const [server, dispose] of Array.from(this.sections)) {
      this.sections.delete(server)
      try {
        dispose()
      } catch (error) {
        this.absorbFailure(error, `${label}：撤掉 ${sectionNameOf(server)} 的遮蔽段失败`)
      }
    }

    // 3) 撤 guard。
    this.liftGuard()

    // 4) 清账：即使上面的 disposer 全部抛错，层自己的账也必须是干净的（I5）。
    this.surface = undefined
    this.agent = undefined
    this.deny = []
    this.state = EMPTY_STATE
    this.retreat = false
    if (surface !== undefined) this.log.info(`${label}：已拆卸每 agent 层`)
  }

  /**
   * 读当前**已生效**的掩码事实（不是计划值，见文件头）。
   * @returns 已生效的 deny / 遮蔽段服务器 / 该 agent 视角的可见名。
   */
  snapshot(): LayerSnapshot {
    return {
      deny: this.deny,
      shadowServers: this.appliedSections(),
      visible: this.visibleNames(),
    }
  }

  /**
   * 该 agent 视角下当前可见的工具名（面板 `scoped` 读数的来源）。
   *
   * 失败一律降级成空数组：读视图失败时，面板与 `/tools status` 应该显示「没有可见工具」
   * 而不是让一次只读请求失败。
   * @returns 可见工具名；未挂载 / 已退场 / 读失败时为空。
   */
  visibleNames(): readonly string[] {
    const surface = this.surface
    if (surface === undefined || this.retreat) return []
    try {
      return surface.visibleNames()
    } catch (error) {
      this.absorbFailure(error, `${this.label()}：读本会话的工具视图失败`)
      return []
    }
  }

  /**
   * 装执行期守卫（I1：只装一次）。
   *
   * 闭包读 `this.state.disabled`，因此开关变更**从不**需要重装守卫：`setState` 只更新
   * 状态再重算掩码，守卫在那一刻起就按新集合拒绝调用。
   *
   * 先抬旧 disposer 是防御性的：`ctx.inject` 的回调会在依赖服务变化时随 fiber 重载重跑，
   * 那时旧效果已随 fiber 卸掉，但本层的记账可能还留着——不先清掉就会调到一个已失效的
   * disposer，或在重载后误以为守卫还在。
   * @param surface - 工具面。
   */
  private installGuard(surface: ScopedSurface): void {
    this.liftGuard()
    try {
      this.guardDispose = surface.guard((execution) => guardReason(execution.name, this.state.disabled))
      this.log.info(`${this.label()}：已装执行期守卫（闭包读实时关闭集，只装一次）`)
    } catch (error) {
      this.absorbFailure(error, `${this.label()}：无法安装执行期守卫`)
    }
  }

  /** 抬掉当前守卫（幂等、容错）。 */
  private liftGuard(): void {
    const dispose = this.guardDispose
    if (dispose === undefined) return
    this.guardDispose = undefined
    try {
      dispose()
    } catch (error) {
      this.absorbFailure(error, `${this.label()}：撤销执行期守卫失败`)
    }
  }

  /**
   * 一轮重算：算计划 → diff 守卫 → 按需重装掩码 / 遮蔽段。
   *
   * 两个机制分别做 diff：只有 deny 变化才动 `restrict`，只有遮蔽段集合变化才动 section。
   * 这样「单工具关闭」这类不产生遮蔽段的状态变化不会白白重装一次掩码（反之亦然）。
   */
  private reconcile(): void {
    const surface = this.surface
    if (surface === undefined || this.retreat) return

    // I6：同步重入闸。`restrict()` 内部会同步广播 `tools/change`，监听器又会同步回调本方法；
    // 这条回声一定属于当前这一轮，直接返回即可（详见 `reconciling` 字段的安全性论证）。
    // 放在入口而不是 `restrict()` 里，是为了不挡住 I3 的重试路径。
    if (this.reconciling) return

    this.reconciling = true
    try {
      const plan = this.plan(surface, this.deny)
      if (plan === undefined) return

      const denyChanged = !sameDeny(plan.deny, this.deny)
      const shadowChanged = !sameDeny(plan.shadowServers, this.appliedSections())
      if (!denyChanged && !shadowChanged) return

      if (denyChanged) {
        // restrict 不可增量修改：抬掉旧掩码再从完整集合重装，账目才只有一份。
        this.liftRestriction()
        this.applyDeny(surface, plan.deny)
      }
      this.reconcileSections(surface, plan.shadowServers)
    } catch (error) {
      // 各步骤内部已经各自兜底；这里是最后一道，保证一个会话的重算失败不会冒到调用方。
      this.absorbFailure(error, `${this.label()}：重算每 agent 掩码失败`)
    } finally {
      // 无论走完、提前 return 还是兜底 catch，都必须解锁——否则这个会话之后的重算全被吞掉。
      this.reconciling = false
    }
  }

  /**
   * 算一轮掩码计划（三读并集 + 本会话关闭集）。
   *
   * `carried` 由调用方给：常规重算传已生效的 deny（防第二读缩小导致振荡），I3 的重推
   * 传空数组（刚刚失败的那一组名字不能再被带回来）。
   * @param surface - 工具面（读 scoped）。
   * @param carried - 上一轮仍受管的名字。
   * @returns 计划；读数失败且无法继续时 undefined。
   */
  private plan(surface: ScopedSurface, carried: readonly string[]): MaskPlan | undefined {
    let catalog: readonly string[]
    try {
      catalog = this.catalog()
    } catch (error) {
      // 插件自身 ctx 读不到服务 = 本进程正在卸载：这是退场，不是失败。
      this.absorbFailure(error, `${this.label()}：读宿主全局工具注册表失败`)
      return undefined
    }
    if (this.retreat) return undefined

    let scoped: readonly string[]
    try {
      scoped = surface.visibleNames()
    } catch (error) {
      // 一个 agent 作用域可能先于插件退场；它自己的 disposer 会把本层 detach 掉，
      // 所以这里退化成空读数继续算，而不是让整轮重算失败。
      this.absorbFailure(error, `${this.label()}：读本会话的工具视图失败`)
      scoped = []
    }
    if (this.retreat) return undefined

    return planMask({ catalog, scoped, carried, disabled: this.state.disabled })
  }

  /**
   * 应用一组 deny（一次 `restrict`），失败时按 I3 重推并重试一次。
   *
   * 重推用**活读数**且不带 carried：失败几乎总是「名字在读与写之间从注册表消失了」，
   * 把刚刚失败的名字再带回来只会原地失败。重推结果与失败组相同时不重试——同一组未知
   * 名字不可能因为再调一次就变成已知，重试只会多一条同样的日志。
   * @param surface - 工具面。
   * @param deny - 计划里的 deny（已排序）。
   */
  private applyDeny(surface: ScopedSurface, deny: readonly string[]): void {
    if (deny.length === 0) {
      this.deny = []
      return
    }
    if (this.restrict(surface, deny)) return
    if (this.retreat) return

    const fresh = this.plan(surface, [])
    if (fresh === undefined || fresh.deny.length === 0) return
    if (sameDeny(fresh.deny, deny)) {
      this.log.error(`${this.label()}：重推后的掩码与失败的那一组相同，跳过重试（guard 仍在拦）`)
      return
    }
    this.restrict(surface, fresh.deny)
  }

  /**
   * 装一次掩码，成功才记账（`this.deny` 只描述**已生效**的集合）。
   * @param surface - 工具面。
   * @param deny - 要掩掉的名字（已排序）。
   * @returns 是否成功。
   */
  private restrict(surface: ScopedSurface, deny: readonly string[]): boolean {
    try {
      this.restriction = surface.restrict({ deny })
      this.deny = deny
      this.log.info(`${this.label()}：已掩掉 ${deny.length} 个工具定义 [${sample(deny)}]`)
      return true
    } catch (error) {
      // 保持无掩码是刻意的：调用方会从活读数重推并重试，而 guard 已经拦得住调用。
      this.absorbFailure(
        error,
        `${this.label()}：无法掩掉 ${deny.length} 个工具定义 [${sample(deny)}]（名字可能已在读与写之间消失）`,
      )
      return false
    }
  }

  /** 抬掉当前掩码（幂等、容错），并把生效集清空。 */
  private liftRestriction(): void {
    const dispose = this.restriction
    this.restriction = undefined
    this.deny = []
    if (dispose === undefined) return
    try {
      dispose()
    } catch (error) {
      this.absorbFailure(error, `${this.label()}：抬起旧掩码失败`)
    }
  }

  /**
   * 让已装上的遮蔽段与计划一致：多退少补，已有的不动。
   * @param surface - 工具面。
   * @param servers - 计划里的 shadowServers（已排序）。
   */
  private reconcileSections(surface: ScopedSurface, servers: readonly string[]): void {
    const wanted = new Set(servers)

    for (const [server, dispose] of Array.from(this.sections)) {
      if (wanted.has(server)) continue
      this.sections.delete(server)
      try {
        dispose()
        this.log.info(`${this.label()}：已撤掉 ${sectionNameOf(server)} 的遮蔽段`)
      } catch (error) {
        this.absorbFailure(error, `${this.label()}：撤掉 ${sectionNameOf(server)} 的遮蔽段失败`)
      }
    }

    for (const server of servers) {
      if (this.sections.has(server)) continue
      try {
        const order = surface.sectionOrder(MCP_SERVERS_ORDER)
        this.sections.set(server, surface.section({
          // I4：name 必须与官方全局段同名，否则遮蔽不成立；order 必须与官方同序。
          name: sectionNameOf(server),
          order,
          text: '',
          interpolate: false,
        }))
        this.log.info(`${this.label()}：已遮蔽 ${sectionNameOf(server)} 指令段`)
      } catch (error) {
        // 装不上的段不进账：下一轮 refresh 会因「计划 ≠ 已生效」再试一次。
        this.absorbFailure(error, `${this.label()}：遮蔽 ${sectionNameOf(server)} 指令段失败`)
      }
    }
  }

  /**
   * 已生效的遮蔽段服务器（排序；与计划同一比较口径）。
   * @returns 排序后的 server 名。
   */
  private appliedSections(): readonly string[] {
    return Array.from(this.sections.keys()).sort()
  }

  /**
   * 记录一次失败；`inactive context` 静默（那是退场，见 {@link retreat}）。
   * @param error - 抛出的值。
   * @param message - 简体中文诊断前缀。
   */
  private absorbFailure(error: unknown, message: string): void {
    if (isInactiveContextError(error)) {
      this.retreat = true
      return
    }
    this.log.error(`${message}：${describeError(error)}`)
  }

  /**
   * 诊断用的会话标签。
   * @returns `session-tool-toggle：会话 <id>`（未挂载时 `(未挂载)`）。
   */
  private label(): string {
    const id = this.agent?.session.id ?? '(未挂载)'
    return `session-tool-toggle：会话 ${id}`
  }
}

/**
 * 两轮集合是否相同（R10 裁定：`sameDeny` 由本文件内部实现、**不**导出到 `mask.ts`）。
 *
 * 按位置比较即可：两侧都保证**排序去重**（`planMask` 的输出与 `appliedSections`）。排序
 * 稳定是这条捷径成立的前提，也是 diff 守卫不被「同一集合换了个顺序」骗过的前提。
 * @param left - 一组已排序的文本。
 * @param right - 另一组已排序的文本。
 * @returns 完全相同（长度与每一项）时为 true。
 */
function sameDeny(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((text, index) => text === right[index])
}

/**
 * 遮蔽段的段名：`mcp:<server>`（与官方全局段同名）。
 * @param server - 服务器名。
 * @returns 段名。
 */
function sectionNameOf(server: string): string {
  return `${MCP_SECTION_PREFIX}${server}`
}

/**
 * 该错误是否是 Cordis 的「上下文已不活动」——插件 fiber 或某个 agent 作用域已经卸载。
 *
 * 宿主卸载时工具注册表逐个注销工具，每次注销都触发 `tools/change`，这些读数**就是**退场
 * 本身而不是失败（照抄 `project-mcp/src/host/isolation.ts` 的同一判定：Cordis
 * `src/reflect.ts` 的 `cannot get required service "…" in inactive context`）。
 * @param error - 抛出的值。
 * @returns 是否为 inactive context 错误。
 */
function isInactiveContextError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('inactive context')
}

/**
 * 把一个 `unknown` 写成诊断里可读的一行。
 * @param error - 抛出的值。
 * @returns 错误消息或字符串化后的值。
 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 诊断清单：最多列 {@link REPORTED_NAMES} 条，超出部分折成计数。
 * @param names - 待展示的名字。
 * @returns 逗号分隔的片段。
 */
function sample(names: readonly string[]): string {
  const head = names.slice(0, REPORTED_NAMES).join(', ')
  return names.length > REPORTED_NAMES ? `${head}, +${names.length - REPORTED_NAMES}` : head
}
