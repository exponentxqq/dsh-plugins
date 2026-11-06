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
 * 掩码的来源是本插件自己的 `planMask(...)`（两读并集：scoped ∪ carried，见
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
 * ## 技能分面（组 3，H4）
 *
 * 技能开关不能用工具掩码实现（`skill:<name>` 永远不进 `tools.restrict` 的 deny，那边对
 * 未知名字抛错），而是在该 agent 的技能层注册一条**同名影子 stub**：定义复制真实条目，
 * 只把 `invocation` 改成「模型不可见、手动可调」（D-2）。四条决策直接决定实现形状：
 *
 * - **D-2** stub 复制真实定义全量字段（含 `content`）：`/name` 手动调用走 `skills.get`
 *   取正文，空正文会让用户拿到空壳；
 * - **D-3** register / get / snapshot 一律经 `agent.ctx.inject(['skills'], scope => …)`
 *   交付的 `scope` 句柄调用；`ctx.get('skills')` 的返回值只用作首轮临时句柄，fiber 一到
 *   就整体替换。绝不在插件根 ctx 上调用（那会落 global 层，把技能对所有会话关掉）；
 * - **D-4** `setState` 保持同步 `void`；技能收敛异步但**有界**（每次 `get` 带
 *   `AbortSignal.timeout(SKILL_CAPTURE_TIMEOUT_MS)`），`skillsSettled()` 等在途轮次；
 * - **D-5** `attach` 先用 `agent.ctx.get('skills')` 同步取一次（web profile 常态已就绪），
 *   再装软 fiber 供晚到补挂；软 fiber **不 await**——没装 `dsh-skill` 的组合里它永不结算，
 *   await 会把宿主串行广播的 `agent/created` 永久挂起。
 *
 * 时序纪律（H4）：`tools/change` 路径**不**触发技能收敛；`skills/change` 只刷新清单缓存
 * （不注册、不重算），收敛只由状态变更与挂载驱动。
 *
 * @module dsh-plugin-session-tool-toggle/host/session-layer
 */

import { guardReason, planMask, type MaskPlan } from './mask.ts'
import { SKILL_TOOL_ADDRESS, planSkills } from './skills-plan.ts'
import { EMPTY_STATE } from './state.ts'
import type {
  AgentLike,
  LayerHandle,
  LayerSnapshot,
  ScopedSurface,
  SessionToolState,
  SkillDefinitionLike,
  SkillLayerSnapshot,
  SkillScopeHandle,
  SkillServiceLike,
  SkillSummaryLike,
  SpecLog,
  VisibleToolSchema,
} from './types.ts'

/** 遮蔽段的段名前缀：必须与 `dsh-mcp-client` 的全局段同名，遮蔽才成立（D4）。 */
const MCP_SECTION_PREFIX = 'mcp:'

/** 中央分配的段顺序名：`mcp:<server>` 段必须与官方 MCP 行同序（I4）。 */
const MCP_SERVERS_ORDER = 'MCP_SERVERS'

/** 一条诊断里最多列几个名字，其余折成计数（避免日志被上百个 MCP 名撑爆）。 */
const REPORTED_NAMES = 6

/**
 * 取技能正文的超时上限（毫秒）：`skillsSettled()` 的有界性由这个常量兜底（D-4）。
 *
 * 上游 `SkillRegistry.get` 会等 provider 加载，不设上限时一个卡住的 provider 能让
 * 命令回执与 `agent/created` 一起悬住。
 */
const SKILL_CAPTURE_TIMEOUT_MS = 2000

/**
 * 影子前定义缓存的上限（U3）：关闭集通常 < 10，但连续开关会留下正文。
 *
 * 先进先出淘汰；被淘汰的定义仍可从下一次 `get` 重新取（唯一代价是一次读）。
 */
const MAX_CACHED_SKILL_BODIES = 64

/**
 * 真实定义缺 `source` 时 stub 的兜底来源标记。
 *
 * 窄面里 `source` 是可选的（`SkillSummaryLike` 不强求），但上游 `register` 的形状要求
 * 字符串；用上游自己的 runtime 标记，不冒充任何真实 provider。
 */
const RUNTIME_SKILL_SOURCE = 'runtime'

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

/** 层的外部依赖：诊断出口与取工具面的方式。 */
export interface SessionLayerPorts {
  /** 诊断出口（生产是 `scanLog` 同形的进程日志，单测收集）。 */
  readonly log: SpecLog
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
   * 同步读一个服务（Cordis `ctx.get` 的简写语义），**不**建立子 fiber。
   *
   * 技能分面用它判断「`skills` 现在就绪」（D-5）：命中就当场完成首轮收敛，不必等 fiber。
   * @param name - 服务名（本层只读 `skills`）。
   * @returns 服务值；未提供或不可用时为 undefined。
   */
  get?(name: string): unknown
  /**
   * 等依赖服务就绪后在子 fiber 内运行回调（Cordis `ctx.inject` 的简写语义）。
   * @param deps - 依赖服务名。
   * @param callback - 在子作用域里运行的回调。
   * @returns 随 fiber 加载结束而结算的 thenable。
   */
  inject(
    deps: readonly string[],
    callback: (scope: AgentServiceScope & Partial<SkillScopeHandle>) => void,
  ): PromiseLike<unknown>
  /**
   * 监听一个事件（Cordis `ctx.on` 的简写语义），返回移除该监听的回调。
   *
   * 技能分面只监听 `skills/change` 刷新清单缓存（H4）；监听器随 agent 的 fiber 自动卸载，
   * 显式 disposer 只是让 `detach` 能更早收尾。
   * @param name - 事件名。
   * @param listener - 事件回调。
   * @returns 移除该监听的 disposer；监听未被注册时 Cordis 可能返回布尔值。
   */
  on?(name: string, listener: () => void): (() => void) | boolean
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
    /** 某个作用域视角下的工具 schema（本层取名字与描述，**不带** parameters）。 */
    schemas(scope?: object): readonly {
      readonly name: string
      /** 描述原文（可缺省：上游 schema 未必声明描述）。 */
      readonly description?: string
    }[]
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
    visibleSchemas: () =>
      scope.tools.schemas(agent).map(({ name, description }) => ({ name, description })),
    sectionOrder: (name) => scope.systemPrompt.getSectionOrder(name),
  }
}

/**
 * 一个会话（一个 agent）的层。一个实例只服务一个 agent：`attach` 绑定 agent，`detach`
 * 解绑；`LayerHandle` 的 `setState` / `snapshot` / `visibleNames` / `visibleSchemas` 是命令面
 * 与 Web 面板的唯一读写路径（`types.ts` 的 `LayerHandle`）。
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
   * 技能服务的 agent 子 fiber 句柄（D-3；`detach` 后清空）。
   *
   * 由 `agent.ctx.inject(['skills'], scope => …)` 交付并保存；`ctx.get('skills')` 的返回值
   * 只在首轮当临时句柄（D-5），fiber 一到就被这里整体替换。之后每次 register / get /
   * snapshot 都经它调用——句柄属于 agent 子 fiber，注册因此落 agent 层。
   */
  private skillScope: SkillScopeHandle | undefined

  /**
   * 影子前定义缓存：name → 真实定义。
   *
   * 两个用途：注册 stub 时复制全量字段（D-2），以及面板展示已关技能的真实描述；`liftShadow`
   * 时丢弃。上限 {@link MAX_CACHED_SKILL_BODIES}，先进先出（U3）。
   */
  private readonly skillBodies = new Map<string, SkillDefinitionLike>()

  /** 已注册 stub：name → disposer。键集就是「已生效的 shadowed」（`skills()` 的唯一来源）。 */
  private readonly shadows = new Map<string, () => void>()

  /**
   * 注册未胜出的技能名（同层先到先得，F8）。
   *
   * 上游 `register` 对同名 runtime 条目 warn + 返回 no-op disposer；本层在回读校验发现
   * provider 不符时把名字记进来，面板据此禁用该行（`skill-shadow-failed`）。
   */
  private readonly failed = new Set<string>()

  /** 最近一次 `snapshot({scope: agent})` 的清单（`visible` 与 `installed` 都从它读缓存）。 */
  private skillSummaries: readonly SkillSummaryLike[] = []

  /** 技能分面的收敛代数：旧一轮在 await 之后发现代数变了就作废（防旧覆盖新）。 */
  private skillGeneration = 0

  /** 在途收敛（`skillsSettled()` 等它；无在途时是已结算的 Promise）。 */
  private skillTask: Promise<void> = Promise.resolve()

  /** `skills/change` 监听的 disposer（`detach` 时显式卸载；缺省 undefined）。 */
  private skillListenerDispose: (() => void) | undefined

  /**
   * @param ports - 诊断出口与取工具面的方式。
   */
  constructor(ports: SessionLayerPorts) {
    this.log = ports.log
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

    // 技能分面与工具面相互独立：工具面取不到时技能开关仍要装；反过来技能服务缺席
    // 也不能影响工具掩码（关键回归）。
    try {
      await this.mountSkills(agent)
    } catch (error) {
      this.absorbFailure(error, `${this.label()}：挂载技能分面失败`)
    }
  }

  /**
   * 状态变更：重算掩码，并只在 deny / shadowServers 变化时重装（I2 的 diff 守卫）。
   *
   * 刻意**不** `await agent.whenIdle()`（D7）：命令 handler 同步返回回执，需要的一致性由
   * guard 提供——被关工具从这一刻起不可调用，即使这一轮请求的 schema 还没重算。
   *
   * 技能分面同步**只**做「撤」（状态变成「开」必须立刻恢复可见），补缺 stub 的正文读取
   * 在 `skillTask` 里异步进行（D-4）；命令面/RPC 用 `skillsSettled()` 等它。
   * @param state - 新的整值状态。
   */
  setState(state: SessionToolState): void {
    this.state = state
    this.reconcile()
    this.scheduleSkills()
  }

  /**
   * `tools/change` 全量重算：两读并集（scoped ∪ carried）重新取一遍，结果与当前掩码相同则
   * 什么都不做。
   *
   * 幂等是硬要求：`restrict` 自己会触发 `tools/change`，一次不幂等的重算会喂自己。
   *
   * 刻意**不**触发技能收敛（H4）：工具注册表的变化与技能分面无关，顺手重算只会让
   * 每次工具注册都白读一遍技能正文。
   */
  refresh(): void {
    this.reconcile()
  }

  /**
   * 拆卸：抬掩码、撤 section、撤 guard、逐个 dispose 影子 stub、清账。
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

    // 4) 逐个 dispose 影子 stub（H4）：与 section 同一纪律，一个失败不阻止其余清理。
    this.liftSkills()

    // 5) 清账：即使上面的 disposer 全部抛错，层自己的账也必须是干净的（I5）。
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
   * 该 agent 视角下当前可见工具的名字 + 描述（面板描述来源，`VisibleToolSchema` 投影）。
   *
   * 与 {@link visibleNames} 同一读数面、同一降级纪律：只取 `name` 与可选的 `description`，
   * **不带** `parameters`（契约见 `types.ts`）。读失败降级成空数组——描述是展示用的增强
   * 信息，一次只读请求不该因为它失败而失败。
   * @returns 可见工具的轻量投影；未挂载 / 已退场 / 读失败时为空。
   */
  visibleSchemas(): readonly VisibleToolSchema[] {
    const surface = this.surface
    if (surface === undefined || this.retreat) return []
    try {
      return surface.visibleSchemas()
    } catch (error) {
      this.absorbFailure(error, `${this.label()}：读本会话的工具描述失败`)
      return []
    }
  }

  /**
   * 读本会话的技能分面。
   *
   * 三个字段都是**一手事实**：`shadowed` 是本层已经注册成功的 stub 键集，`visible` 是最近
   * 一次 `snapshot({scope: agent})` 的结果过滤掉「模型不可调用」与「本层已遮蔽」后的行；
   * `available` 只表示 `skills` 服务是否已经交付（false = 技能地址只记意图，面板给
   * `skills-unavailable`）。
   * @returns 技能分面读数。
   */
  skills(): SkillLayerSnapshot {
    const shadowed = Array.from(this.shadows.keys()).sort(compareSkillName)
    const visible = this.skillSummaries
      .filter((summary) => summary.invocation.modelInvocable && !this.shadows.has(summary.name))
      .map((summary) => ({ name: summary.name, description: summary.description }))
      .sort((left, right) => compareSkillName(left.name, right.name))
    return { available: this.skillScope !== undefined, shadowed, visible }
  }

  /**
   * 等待在途技能收敛结算（无在途时立即 resolve）。
   *
   * `setState` 是同步的，注册 stub 的正文读取在 `skillTask` 里异步进行；命令面/RPC 在组装
   * 回执前 await 本方法，回执里的技能集合才是新状态的结果（D-4）。收敛不会 reject：
   * 内部失败都已降级成日志，调用方拿到的永远是「已结算」。
   * @returns 当前在途轮次（含此前的轮次）全部结算后 resolve。
   */
  skillsSettled(): Promise<void> {
    return this.skillTask.then(
      () => undefined,
      () => undefined,
    )
  }

  /**
   * 装技能分面：先同步取一次（web profile 常态已就绪），再装软 fiber 供晚到补挂（D-5）。
   *
   * 两段顺序不可交换：`get` 是同步读，给出「现在就绪」的确定性；fiber 只是兜底与刷新句柄。
   * 软 fiber **不 await**：没装 `dsh-skill` 的组合里 `inject` 的 pending effect 永不结算，
   * await 会把宿主串行广播的 `agent/created` 永久挂起（D-5 反例：新会话开不出来）。
   *
   * 只有真正暴露 `get` 的 Cordis 上下文才进入技能分面：没有 `get` 的窄面无法判断「服务现在
   * 就绪」，装了也只会得到一条永不结算的 fiber。
   * @param agent - 目标 agent（提供会话与子 fiber 的上下文）。
   * @returns 首轮收敛完成后结算（软 fiber 是否结算不影响它）。
   */
  private async mountSkills(agent: AgentLike): Promise<void> {
    const ctx = injectableContextOf(agent)
    if (ctx === undefined || typeof ctx.get !== 'function') return

    // ① 同步先取：拿到即以「清单缓存 + 首轮收敛」完成挂载（agent/created 会 await 本函数）。
    //    清单先读一次：`planSkills` 的 `installed` 与 stub 的回读校验都依赖这份缓存。
    const immediate = this.readSkillService(ctx)
    if (immediate !== undefined) {
      this.adoptSkillScope({ skills: immediate })
      await this.refreshSkillCatalog()
      this.scheduleSkills()
      await this.skillsSettled()
    }

    // ② 软 fiber：晚到补挂并刷新句柄；**不 await**（见方法注释）。
    if (typeof ctx.inject !== 'function') return
    try {
      const pending = ctx.inject(['skills'], (scope) => {
        // 层可能已经 detach（fiber 的结算晚于退场）：不再采纳句柄，避免把分面装回来。
        if (this.agent === undefined) return
        const handle = skillHandleOf(scope)
        if (handle === undefined) return
        this.adoptSkillScope(handle)
        // 晚到：先把清单缓存读回来（fire-and-forget，不阻塞 fiber 结算），再收敛一轮。
        void this.refreshSkillCatalog()
        this.scheduleSkills()
      })
      void Promise.resolve(pending).catch((error: unknown) => {
        this.absorbFailure(error, `${this.label()}：安装技能服务的子 fiber 失败`)
      })
    } catch (error) {
      // 假 inject 或宿主重载期可能同步抛错；技能分面退化为「只记意图」，不影响工具掩码。
      this.absorbFailure(error, `${this.label()}：安装技能服务的子 fiber 失败`)
    }
  }

  /**
   * 一轮技能收敛：算计划 → 撤多余的 stub（同步）→ 补缺的 stub（异步取正文）。
   *
   * 代数守卫（`skillGeneration`）防旧一轮覆盖新一轮：每轮开头取号，任何 await 之后发现
   * 号变了就整轮作废（状态在取正文期间又变了）。撤的动作**不受**代数影响：状态已经变回
   * 「开」，必须立刻恢复可见，不能等下一轮。
   *
   * 并发轮次是刻意允许的（`scheduleSkills` 不串行化）：代数守卫保证只有一个轮次能补注册，
   * 而 `shadows` 的 diff 守卫保证已经生效的 stub 不会被重复注册。
   */
  private async reconcileSkills(): Promise<void> {
    if (this.skillScope === undefined || this.retreat) return
    const generation = ++this.skillGeneration
    const plan = planSkills({
      disabled: this.state.disabled,
      // 最近一次 snapshot 的**原始**名字集（含已遮蔽条目）：不读服务，读缓存。
      installed: this.skillNames(),
      toolSkillClosed: this.state.disabled.includes(SKILL_TOOL_ADDRESS),
    })

    // ① 撤：同步、立即，且不受 generation 影响（状态已变为「开」，必须马上恢复）。
    for (const name of Array.from(this.shadows.keys())) {
      if (!plan.shadowNames.includes(name)) this.liftShadow(name)
    }
    for (const name of Array.from(this.failed)) {
      if (!plan.shadowNames.includes(name)) this.failed.delete(name)
    }

    // ② 补：异步取正文；每个 capture 都有 2s 超时上限，`skillsSettled()` 因此有界。
    for (const name of plan.shadowNames) {
      if (this.shadows.has(name) || this.failed.has(name)) continue
      const cached = this.skillBodies.get(name)
      const definition = cached ?? (await this.captureSkill(name))
      if (generation !== this.skillGeneration) return // 期间状态又变了，本轮作废
      if (this.retreat) return
      if (definition === undefined) continue // 未安装：留作意图
      this.shadowSkill(definition)
    }
  }

  /**
   * 取一个技能的真实定义（影子前），失败返回 undefined。
   *
   * **必须**用 `this.skillScope`（agent 子 fiber 交付的句柄）现取 `scope.skills.get(...)`，
   * 并把 `scope: this.agent` 与 `signal: AbortSignal.timeout(SKILL_CAPTURE_TIMEOUT_MS)` 一起传：
   * 前者决定「在哪个作用域解析技能」，后者保证 `skillsSettled()` 不会被不合作的 provider 拖死（D-3/D-4）。
   * @param name - 技能名。
   * @returns 真实定义；未安装 / 超时 / 服务不可用时 undefined。
   */
  private async captureSkill(name: string): Promise<SkillDefinitionLike | undefined> {
    const scope = this.skillScope
    const agent = this.agent
    if (scope === undefined || agent === undefined || this.retreat) return undefined
    // 会话 cwd 用会话头的原始值：本层没有 `workingDirectory` 端口，`snapshot`/`get` 的
    // cwd 只用于工作区敏感的 provider，缺省与真实 cwd 不一致时最多漏掉项目级技能，不影响
    // 影子 stub 的作用域（scope 才是胜出层）。
    const cwd = agent.session.header.cwd
    try {
      const definition = await scope.skills.get(name, {
        ...(cwd === undefined ? {} : { cwd }),
        scope: agent,
        signal: AbortSignal.timeout(SKILL_CAPTURE_TIMEOUT_MS),
      })
      if (definition === undefined) return undefined
      this.rememberSkillBody(definition)
      return definition
    } catch (error) {
      this.absorbFailure(
        error,
        `${this.label()}：取技能 ${name} 的正文失败（上限 ${SKILL_CAPTURE_TIMEOUT_MS}ms 或服务不可用）`,
      )
      return undefined
    }
  }

  /**
   * 注册一个影子 stub；注册后回读校验（同层先到先得，F8）。
   *
   * stub 形状（D-2）：`{...realDefinition, invocation:{modelInvocable:false, userInvocable:true}}`
   * ——只改 invocation，正文/描述/path/resourceBase 全量复制，`/name` 手动调用才注入完整正文。
   *
   * 回读校验的证据是**最近一次清单缓存里该 name 的 provider**：正常情况下 `get` 取到的定义
   * 与清单里的胜出条目的是同一 provider；不同则说明同层已经有别人先占（上游 `register`
   * 会 warn + 返回 no-op disposer），本层立刻撤账并记入 `failed`，面板据此禁用该行。
   * @param definition - 影子前真实定义。
   * @returns 是否注册成功（记账）。
   */
  private shadowSkill(definition: SkillDefinitionLike): boolean {
    const scope = this.skillScope
    if (scope === undefined || this.agent === undefined) return false
    const name = definition.name

    let dispose: () => void
    try {
      dispose = scope.skills.register({
        ...definition,
        // 上游 register 的形状要求 source 是字符串；窄面里可选，缺省用上游的 runtime 标记。
        source: definition.source ?? RUNTIME_SKILL_SOURCE,
        invocation: { modelInvocable: false, userInvocable: true },
      })
    } catch (error) {
      this.failed.add(name)
      this.absorbFailure(error, `${this.label()}：注册技能 ${name} 的影子 stub 失败（skill-shadow-failed）`)
      return false
    }

    // 先记账再回读：`shadows` 是本层的一手事实，`skills()` 的 shadowed 只读它。
    this.shadows.set(name, dispose)
    this.rememberSkillBody(definition)
    this.failed.delete(name)

    const wantedProvider = definition.provider
    const recorded = this.skillSummaries.find((summary) => summary.name === name)
    if (
      wantedProvider !== undefined &&
      recorded !== undefined &&
      recorded.provider !== undefined &&
      recorded.provider !== wantedProvider
    ) {
      // 未胜出：撤掉 no-op disposer 与账目（保留定义缓存，面板仍要展示真实描述）。
      this.shadows.delete(name)
      try {
        dispose()
      } catch (error) {
        this.absorbFailure(error, `${this.label()}：撤掉技能 ${name} 未胜出的影子 stub 失败`)
      }
      this.failed.add(name)
      this.log.warn(
        `${this.label()}：技能 ${name} 的影子 stub 未胜出（skill-shadow-failed）：清单 provider 为 ${recorded.provider}，影子前为 ${wantedProvider}`,
      )
      return false
    }

    this.log.info(`${this.label()}：已注册技能 ${name} 的影子 stub（模型不可见，/name 手动调用保留）`)
    return true
  }

  /**
   * 撤掉一个 stub（幂等、容错），并丢弃影子前定义缓存。
   *
   * 每次 dispose 独立 try/catch：`detach` 的逐个 dispose（H4）与状态翻转都走这里，
   * 一个 disposer 抛错不能让其余技能留在遮蔽态。
   * @param name - 技能名。
   */
  private liftShadow(name: string): void {
    const dispose = this.shadows.get(name)
    this.shadows.delete(name)
    this.skillBodies.delete(name)
    if (dispose === undefined) return
    try {
      dispose()
    } catch (error) {
      this.absorbFailure(error, `${this.label()}：撤掉技能 ${name} 的影子 stub 失败`)
    }
  }

  /**
   * 采纳一份技能句柄：保存并确保 `skills/change` 监听已装上。
   * @param scope - `inject(['skills'])` 回调交付的句柄（或同步 `get` 的临时包装）。
   */
  private adoptSkillScope(scope: SkillScopeHandle): void {
    // 已 detach 的层不再采纳任何句柄：fiber 的结算可能晚于退场。
    if (this.agent === undefined) return
    this.skillScope = scope
    this.installSkillListener()
  }

  /**
   * 监听 `skills/change`：只刷新清单缓存（H4），不注册、不重算。
   *
   * 监听器挂在 agent 的 ctx 上（Cordis 的事件服务是根 ctx 共享的），因此能收到技能注册表
   * 的变更；它随 agent fiber 自动卸载，这里保存 disposer 只是让 `detach` 能更早收尾。
   */
  private installSkillListener(): void {
    if (this.skillListenerDispose !== undefined) return
    const ctx = this.agent === undefined ? undefined : injectableContextOf(this.agent)
    const on = ctx?.on
    if (ctx === undefined || on === undefined) return
    try {
      const dispose = on.call(ctx, 'skills/change', () => {
        void this.refreshSkillCatalog()
      })
      // Cordis 的 `on` 在被拦截（返回 bail 值）时可能给布尔值；只有函数才是 disposer。
      if (typeof dispose === 'function') this.skillListenerDispose = dispose
    } catch (error) {
      this.absorbFailure(error, `${this.label()}：监听 skills/change 失败`)
    }
  }

  /**
   * 读一次该 agent 视角的技能清单，刷新缓存并校验已注册的影子。
   *
   * `complete === false` 时不做「删旧」：上游在观测不完整时保留上一份可用目录，本层同样把
   * 缺席当成未知而不是删除（R3 ④），否则一次 provider 抖动会让面板闪掉整组技能。
   * 失败只降级成日志：技能分面不可用不该影响工具掩码与命令回执。
   */
  private async refreshSkillCatalog(): Promise<void> {
    const scope = this.skillScope
    const agent = this.agent
    if (scope === undefined || agent === undefined || this.retreat) return
    // cwd 口径同 `captureSkill`：会话头原始值；`scope: agent` 才是胜出层的决定因素。
    const cwd = agent.session.header.cwd
    try {
      const snapshot = await scope.skills.snapshot({
        ...(cwd === undefined ? {} : { cwd }),
        scope: agent,
      })
      // 句柄已被 fiber 刷新或层已退场：这一份旧观测作废。
      if (this.skillScope !== scope || this.retreat) return
      this.mergeSkillCatalog(snapshot.skills, snapshot.complete)
      this.verifySkillShadows()
      this.clearResolvedFailures()
    } catch (error) {
      this.absorbFailure(error, `${this.label()}：读技能清单失败`)
    }
  }

  /**
   * 把一次清单观测并入缓存。
   * @param skills - 本次观测到的清单。
   * @param complete - 观测是否完整（false 时保留旧条目，不把缺席当删除）。
   */
  private mergeSkillCatalog(skills: readonly SkillSummaryLike[], complete: boolean): void {
    if (complete) {
      this.skillSummaries = [...skills]
      return
    }
    const merged = new Map(this.skillSummaries.map((summary) => [summary.name, summary]))
    for (const summary of skills) merged.set(summary.name, summary)
    this.skillSummaries = Array.from(merged.values())
  }

  /**
   * 清单刷新后校验已注册的影子：同名条目的 provider 必须仍是影子前那一个。
   *
   * 这是 F8 的「下一次读数」形态：`shadowSkill` 的同步回读看的是注册前的缓存，若注册其实
   * 被同层先占者吃掉，`skills/change` 之后的这份新清单才会露出真实 provider。
   */
  private verifySkillShadows(): void {
    for (const [name, dispose] of Array.from(this.shadows)) {
      const definition = this.skillBodies.get(name)
      const recorded = this.skillSummaries.find((summary) => summary.name === name)
      if (
        definition?.provider === undefined ||
        recorded?.provider === undefined ||
        recorded.provider === definition.provider
      ) {
        continue
      }
      this.shadows.delete(name)
      this.failed.add(name)
      try {
        dispose()
      } catch (error) {
        this.absorbFailure(error, `${this.label()}：撤掉技能 ${name} 未胜出的影子 stub 失败`)
      }
      this.log.warn(
        `${this.label()}：技能 ${name} 的影子 stub 在清单刷新后未胜出（skill-shadow-failed）：provider 为 ${recorded.provider}`,
      )
    }
  }

  /**
   * 冲突解除后允许重试：名字从清单消失、或清单 provider 已回到影子前定义时清掉 `failed`。
   *
   * 不清 `failed` 的话，同层先占者消失后本会话永远关不掉这个技能；清掉后下一次状态变更
   * （或重新挂载）会重新取正文并注册。
   */
  private clearResolvedFailures(): void {
    for (const name of Array.from(this.failed)) {
      const definition = this.skillBodies.get(name)
      const recorded = this.skillSummaries.find((summary) => summary.name === name)
      if (recorded === undefined) {
        this.failed.delete(name)
        continue
      }
      if (definition?.provider !== undefined && recorded.provider === definition.provider) {
        this.failed.delete(name)
      }
    }
  }

  /**
   * 记住一份影子前定义（用于 stub 复制与面板描述），并按上限先进先出淘汰（U3）。
   * @param definition - 真实定义。
   */
  private rememberSkillBody(definition: SkillDefinitionLike): void {
    this.skillBodies.delete(definition.name)
    this.skillBodies.set(definition.name, definition)
    while (this.skillBodies.size > MAX_CACHED_SKILL_BODIES) {
      const oldest = this.skillBodies.keys().next()
      if (oldest.done === true) break
      this.skillBodies.delete(oldest.value)
    }
  }

  /**
   * 安排一轮技能收敛（异步、不阻塞调用方）。
   *
   * 轮次之间不串行：代数守卫保证旧轮在 await 之后作废，`shadows` 的 diff 守卫保证已经
   * 生效的 stub 不被重复注册。`skillTask` 只记录「还要等哪些轮次」，永不 reject。
   */
  private scheduleSkills(): void {
    if (this.skillScope === undefined || this.retreat) return
    const round = this.reconcileSkills()
    const previous = this.skillTask
    this.skillTask = Promise.all([previous, round]).then(
      () => undefined,
      () => undefined,
    )
  }

  /**
   * 同步读技能服务（D-5 的第一步）。
   * @param ctx - agent 的窄面上下文。
   * @returns 技能服务；`get` 抛错（退场 / 未就绪）时 undefined。
   */
  private readSkillService(ctx: Partial<InjectableAgentContext>): SkillServiceLike | undefined {
    const get = ctx.get
    if (get === undefined) return undefined
    try {
      return skillServiceOf(get.call(ctx, 'skills'))
    } catch (error) {
      this.absorbFailure(error, `${this.label()}：同步读取 skills 服务失败`)
      return undefined
    }
  }

  /**
   * 当前清单缓存里的原始技能名（含已遮蔽条目；`planSkills` 的 `installed` 输入）。
   * @returns 技能名列表。
   */
  private skillNames(): readonly string[] {
    return this.skillSummaries.map((summary) => summary.name)
  }

  /**
   * 拆卸技能分面：作废在途轮次 → 逐个 dispose stub → 卸载监听 → 清账。
   *
   * 与 `detach` 的其它步骤同一纪律：显式拆卸时先把代数加一，旧一轮即使已经在 await 里，
   * 回来也会作废，不会把 stub 重新注册到已卸载的作用域上。
   */
  private liftSkills(): void {
    this.skillGeneration += 1
    for (const name of Array.from(this.shadows.keys())) this.liftShadow(name)
    this.failed.clear()
    this.skillSummaries = []
    this.skillBodies.clear()

    const dispose = this.skillListenerDispose
    this.skillListenerDispose = undefined
    if (dispose !== undefined) {
      try {
        dispose()
      } catch (error) {
        this.absorbFailure(error, `${this.label()}：卸载 skills/change 监听失败`)
      }
    }

    this.skillScope = undefined
    this.skillTask = Promise.resolve()
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
   * 算一轮掩码计划（本会话可见读数 + 本会话关闭集）。
   *
   * 候选集只剩两读：`scoped`（本会话视角）与 `carried`（上一轮仍受管的名字）。**没有**全局
   * 层读数：会话外的工具不该因为「全局注册过」就进 deny（那会为一组本会话根本看不见的名字
   * 白装掩码，且掩码口径与本会话视图脱节）。代价是「关闭本会话暂不可见的工具」只记意图
   * （`matched: 0`），等它出现后由 `tools/change → refresh()` 补上。
   *
   * `carried` 由调用方给：常规重算传已生效的 deny（防第二读缩小导致振荡），I3 的重推
   * 传空数组（刚刚失败的那一组名字不能再被带回来）。
   * @param surface - 工具面（读 scoped）。
   * @param carried - 上一轮仍受管的名字。
   * @returns 计划；读数失败且无法继续时 undefined。
   */
  private plan(surface: ScopedSurface, carried: readonly string[]): MaskPlan | undefined {
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

    return planMask({ scoped, carried, disabled: this.state.disabled })
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
 * 把 `agent.ctx` 收窄成技能分面要用的最小面（缺省字段全部视为「不可用」）。
 * @param agent - 目标 agent。
 * @returns 窄面上下文；`ctx` 不是对象时 undefined。
 */
function injectableContextOf(agent: AgentLike): Partial<InjectableAgentContext> | undefined {
  const ctx = agent.ctx
  if (ctx === null || ctx === undefined || typeof ctx !== 'object') return undefined
  return ctx as Partial<InjectableAgentContext>
}

/**
 * 校验一份 inject 回调交付的作用域，只取其中的 `skills` 服务。
 *
 * 用结构校验而不是 `as`：真实宿主与单测假件都可能交付不带 `skills` 的作用域（例如只注入了
 * `tools` / `systemPrompt` 的 fiber），不能把 `undefined.skills.register` 留到调用期炸。
 * @param value - 交付的作用域（`unknown`）。
 * @returns 窄面句柄；`skills` 不是可用服务时 undefined。
 */
function skillHandleOf(value: unknown): SkillScopeHandle | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const skills = skillServiceOf((value as Partial<SkillScopeHandle>).skills)
  if (skills === undefined) return undefined
  return { skills }
}

/**
 * 校验一个值是否具备 {@link SkillServiceLike} 的三个方法。
 * @param value - 待校验的服务值。
 * @returns 窄面服务；形状不符时 undefined。
 */
function skillServiceOf(value: unknown): SkillServiceLike | undefined {
  if (value === null || value === undefined || typeof value !== 'object') return undefined
  const candidate = value as Partial<SkillServiceLike>
  if (
    typeof candidate.register !== 'function' ||
    typeof candidate.get !== 'function' ||
    typeof candidate.snapshot !== 'function'
  ) {
    return undefined
  }
  return candidate as SkillServiceLike
}

/**
 * 技能名比较（UTF-16 码元序）：与上游 `snapshot` 的排序同口径，且与 locale 无关。
 * @param left - 一个技能名。
 * @param right - 另一个技能名。
 * @returns 负数 / 0 / 正数。
 */
function compareSkillName(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
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
