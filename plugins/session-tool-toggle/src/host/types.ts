/**
 * 宿主半的共享 seam 类型：端口与跨文件数据形状。
 *
 * 所有副作用件（装配层、每 agent 层、状态存储、默认档、命令面、RPC 内核）都只依赖
 * 这里声明的窄接口，因此每条规则都能用假端口在单测里驱动，不需要拉起宿主。
 *
 * 本文件**只声明类型与文档**：不含任何运行时代码，也不 import 任何模块（端口形状
 * 是所有下游模块的公共契约，不应把某个具体实现拖进类型图）。
 *
 * @module dsh-plugin-session-tool-toggle/host/types
 */

/** 一条已提交事件的最小面（真实类型是宿主的 `SessionEvent`）。 */
export interface SessionEventLike {
  /** 事件类型；`plugin:` 前缀的是插件记录。 */
  readonly type: string
  /** 会话内单调递增序号。 */
  readonly seq: number
  /** 提交时间（epoch ms）。 */
  readonly time: number
  /** 事件载荷。 */
  readonly data: unknown
  /** 插件记录事件恒带 `ignorable: true`。 */
  readonly ignorable?: true
}

/** 本插件用到的 `Session` 面（真实对象是宿主的 `Session` 实例）。 */
export interface SessionLike {
  /** 会话 id（宿主生成，会作为单段目录名使用）。 */
  readonly id: string
  /** 会话头：工作目录、是否已播种、创建时间、来源标记。 */
  readonly header: {
    /** 会话创建时的工作目录。 */
    readonly cwd?: string
    /** 是否已完成播种（seeded）。 */
    readonly isSeeded: boolean
    /** 创建时间（epoch ms）。 */
    readonly createdAt: number
    /**
     * 来源标记（DSH `SessionHeader.origin`）：`'subagent'` = 子代理会话，缺省 = 顶级会话。
     *
     * 面板据此补 `session-subagent` 提示码；只声明本插件实际消费的字面量，不做宽字符串。
     */
    readonly origin?: 'subagent'
  }
  /** 身份断言用：应与宿主 `dsh-session` 的 `Session` 类全等。 */
  readonly constructor: unknown
  /** 按序号读一条事件（真实方法名是单数 `eventAt`）。 */
  eventAt(seq: number): SessionEventLike | undefined
  /** 读一段已提交事件（`sessionProjections` 缺席时的重放兜底读面）。 */
  snapshotEvents(fromSeq?: number, toSeqExclusive?: number): readonly SessionEventLike[]
}

/** 本插件用到的 `Agent` 面（`agent/created` 的载荷）。 */
export interface AgentLike {
  /** 该 agent 的会话。 */
  readonly session: SessionLike
  /** 真实类型是 Cordis Context；按 `ctx.inject` / `ctx.effect` 的最小面使用。 */
  readonly ctx: unknown
  /** agent 的模型选择（子代理/队友会话据此判断来源，可缺省）。 */
  readonly options?: { readonly provider?: string; readonly model?: string }
}

/** 诊断端口（与 project-mcp 的 `ScanLog` 同形，便于单测收集日志）。 */
export interface SpecLog {
  /** 记录一条值得进进程日志的状态变化。 */
  info(message: string): void
  /** 记录一条「已降级但继续运行」的情况。 */
  warn(message: string): void
  /** 记录一次失败。 */
  error(message: string): void
}

/**
 * 整值会话状态：一条记录永远写全量（whole-value event rule）。
 *
 * `disabled` 与 `snapshot` 里只存**规范形文本**（`formatAddress` 的输出），因此状态
 * 文件/记录可读、可比较、可重放。
 */
export interface SessionToolState {
  /** 状态版本，供未来迁移。 */
  readonly version: 1
  /** 本会话的关闭集，已排序去重的规范形文本。 */
  readonly disabled: readonly string[]
  /** 本会话创建时从默认档拍下的快照（`/tools reset` 回到这里）。 */
  readonly snapshot: readonly string[]
  /** 是否已由一条日志记录建立（false = 空日志 / 新会话 / 插件安装前的旧会话）。 */
  readonly seeded: boolean
  /** 最近一次写入的 epoch ms（仅诊断用）。 */
  readonly updatedAt: number
}

/** 持久化通道的实际形态。 */
export type StoreKind = 'record' | 'memory'

/**
 * 会话状态端口。两条实现同一契约，按可用性择一：
 * `RecordStateStore`（宿主 `dsh-session` 模块可用时写会话日志）与
 * `MemoryStateStore`（身份断言失败 / 写入抛错后的内存降级）。
 */
export interface StateStore {
  /** 实际生效的通道（面板与 `/tools status` 用它解释降级）。 */
  readonly kind: StoreKind
  /**
   * 读本会话状态：投影优先，`sessionProjections` 缺失时用日志重放兜底，
   * 两者都没有则空态 + 一次 warn。
   * @param session - 目标会话。
   * @returns 规范化后的整值状态（永不抛错）。
   */
  read(session: SessionLike): SessionToolState
  /**
   * 写整值状态；失败抛错由调用方降级（内存态 + 告警），不得让命令/请求失败。
   * @param session - 目标会话。
   * @param state - 新的整值状态。
   */
  write(session: SessionLike, state: SessionToolState): void
}

/**
 * 一个 agent 作用域的可写面（由 `agent.ctx.inject(['tools','systemPrompt'])` 交付）。
 *
 * 这是每 agent 层唯一允许触达的宿主面：掩码、守卫、指令段遮蔽三件事都从这里下发，
 * 层本身不认识 Cordis。
 */
export interface ScopedSurface {
  /**
   * 追加一条 deny 掩码。
   * @param filter - 要隐藏的工具注册名。
   * @returns 抬起该掩码的 disposer。
   */
  restrict(filter: { readonly deny: readonly string[] }): () => void
  /**
   * 装一个执行期守卫（被关工具的迟到调用会得到可读拒绝理由）。
   * @param guard - 返回拒绝理由则拒绝执行，返回 undefined 则放行。
   * @returns 卸载该守卫的 disposer。
   */
  guard(guard: (execution: { readonly name: string }) => string | undefined): () => void
  /**
   * 装一条系统提示指令段（整组关闭时用同名空段遮蔽 `mcp:<server>`）。
   * @param section - 段名、顺序、正文与插值开关。
   * @returns 卸载该段的 disposer。
   */
  section(section: {
    readonly name: string
    readonly order: number
    readonly text: string
    readonly interpolate?: boolean
  }): () => void
  /** 该 agent 视角下的工具注册名（上一轮掩码已生效，因此可能缺名字）。 */
  visibleNames(): readonly string[]
  /** systemPrompt 里某个已知段的顺序（`mcp:<server>` 段必须与官方同序）。 */
  sectionOrder(name: 'MCP_SERVERS'): number
}

/** 宿主那一份 `dsh-session` 的写入面（只有 `Session` 类身份匹配时才会被构造）。 */
export interface HostSessionApi {
  /**
   * 追加一条插件记录（整值事件，`ignorable: true`）。
   * @param session - 目标会话（必须来自宿主那一份 `dsh-session`）。
   * @param type - 记录类型（`plugin:<插件名>/<记录名>` 文法）。
   * @param data - 整值载荷。
   * @returns 新事件的序号。
   */
  appendPluginRecord(session: SessionLike, type: string, data: unknown): number
}

/** 宿主 `dsh-session` 模块的解析选项。 */
export interface HostRuntimeOptions {
  /** 配置覆盖：绝对路径（排障 / 单测注入）。 */
  readonly modulePath?: string
  /** 诊断出口。 */
  readonly log: SpecLog
}

/** 用户级默认档文件形状（`$DSH_HOME/session-tool-toggle/defaults.json`）。 */
export interface DefaultsFile {
  /** 文件版本。 */
  readonly version: 1
  /** 默认关闭集，规范形文本。 */
  readonly disabled: readonly string[]
}

/** 默认档读写端口：生产实现是 `node:fs` + 原子写，单测注入假实现。 */
export interface DefaultsIo {
  /**
   * 读一个文件。
   * @param path - 绝对路径。
   * @returns 文件 UTF-8 文本。
   */
  readFile(path: string): Promise<string>
  /**
   * 原子写一个文件（目录不存在时自动创建）。
   * @param path - 绝对路径。
   * @param data - 完整文件内容。
   */
  writeFile(path: string, data: string): Promise<void>
}

/**
 * 插件配置（全部可选，`cordis.patch.yml` 不带 `config:` 段）。
 *
 * 这是 `schemastery` 校验面的 TypeScript 形状；实现落在装配层，不在这里。
 */
export interface Config {
  /** 持久化通道：`auto` = 宿主模块可用则写会话日志，否则内存态。默认 `auto`。 */
  storage?: 'auto' | 'memory'
  /** 在 `PROTECTED_BASELINE` 之上**追加**保护名（不能减项）。 */
  protectedTools?: string[]
  /** 覆盖默认档路径（绝对路径）。 */
  defaultsFile?: string
  /** 覆盖宿主模块解析锚点（绝对路径，排障 / 单测用）。 */
  hostModuleBase?: string
}

/** 层的一手事实：`/tools status` 与 Web 面板统计共用同一份读数。 */
export interface LayerSnapshot {
  /** 当前生效的 deny 集合（排序）。 */
  readonly deny: readonly string[]
  /** 需要遮蔽 `mcp:<server>` 指令段的服务器（只由整组关闭产生）。 */
  readonly shadowServers: readonly string[]
  /** 该 agent 视角当前可见的工具名。 */
  readonly visible: readonly string[]
}

/**
 * 层的控制面。命令内核与 RPC 内核都只通过它改状态，不直接摸 `restrict` / `guard`，
 * 因此「同一会话只有一条写入路径」是类型层面的事实而不是约定。
 */
export interface LayerHandle {
  /**
   * 状态变更：重算掩码，并只在 deny / 遮蔽段变化时重装。
   * @param state - 新的整值状态。
   */
  setState(state: SessionToolState): void
  /** 读当前掩码事实。 */
  snapshot(): LayerSnapshot
  /** 读该 agent 视角的可见工具名（面板 `scoped` 读数的来源）。 */
  visibleNames(): readonly string[]
}

/**
 * 控制内核（`control.ts`）的依赖注入面。
 *
 * 由装配层构造**一份**，同时交给命令面（文本前端）与 Web RPC（通道派发），因此面板
 * 与 `/tools` 不存在两份状态；命令面拿不到 `StateStore`，绕过内核直写会被类型拒绝。
 */
export interface ControlDeps {
  /** 会话状态端口（记录通道或内存降级）。 */
  readonly store: StateStore
  /**
   * 按 sessionId 取该会话的层句柄；会话不在宿主中运行时返回 undefined
   * （RPC 侧据此回 `session-not-live`）。
   */
  readonly layerFor: (sessionId: string) => LayerHandle | undefined
  /** 默认档文件的绝对路径。 */
  readonly defaultsPath: string
  /** 默认档读写端口。 */
  readonly defaultsIo: DefaultsIo
  /** 生效保护名单（基线 ∪ config 追加），装配期算好，只读。 */
  readonly protectedNames: ReadonlySet<string>
  /**
   * 宿主**全局层**的工具注册名（未掩码，不受任何 agent 限制）。
   *
   * 取法（装配层）：`ctx.tools.schemas().map((schema) => schema.name)`——**插件自身 ctx**
   * 读，与 `project-mcp` 的 `catalogOf` 同一表达式。`/tools status` 的「可关对象分组计数」、
   * 「全局层有 vs 未注册」两态区分、以及「被其他作用域隐藏」的计数都必须读未掩码的全局层；
   * {@link LayerHandle} 只给该 agent 视角（`visibleNames`），推不出全局层（R15 ①，任务 9.1
   * 由 `ToolsCommandDeps` 并入本接口，命令面与 RPC 因此共用同一份内核依赖）。
   */
  readonly catalog: () => readonly string[]
  /** 诊断出口。 */
  readonly log: SpecLog
}

/** 面板的降级 / 提示码：宿主只给码，文案由 client 用 `t()` 组合。 */
export type NoticeCode =
  /** 记录通道不可用，已降级内存态。 */
  | 'persistence-degraded'
  /** 默认档损坏 / 半写，已按空档处理。 */
  | 'defaults-corrupt'
  /** 子代理会话：不继承父会话的会话级开关。 */
  | 'session-subagent'

/**
 * 面板快照构建器（`panel.ts`）的输入：全部是宿主侧已经读到的事实。
 *
 * 构建器是纯函数——不碰服务、不做 IO；三读并集（catalog / scoped / carried）由调用方
 * 按掩码引擎的同一语义准备好，保证「面板清单」与「实际掩码」同源。
 */
export interface PanelInputs {
  /** 目标会话 id。 */
  readonly sessionId: string
  /** 会话创建时间（epoch ms），面板用它讲「快照来源」。 */
  readonly createdAt: number
  /** 会话状态（关闭集 + 创建时快照）。 */
  readonly state: SessionToolState
  /** 状态实际生效的持久化通道。 */
  readonly storeKind: StoreKind
  /** 全局层名字（插件根 ctx 的 `tools.schemas()`，不受任何 agent 限制）。 */
  readonly catalog: readonly string[]
  /** 该 agent 视角名字（`layer.visibleNames()`）。 */
  readonly scoped: readonly string[]
  /** 上一轮仍受管的名字（`layer.snapshot().deny`，防第二读缩小导致掩码被抬掉）。 */
  readonly carried: readonly string[]
  /** 生效保护名单（排序后的文本）。 */
  readonly protectedNames: readonly string[]
  /** 默认档当前内容。 */
  readonly defaults: DefaultsFile
  /** 默认档文件绝对路径（面板展示，便于手编）。 */
  readonly defaultsPath: string
  /** 默认档文件可读（false = 不存在，按空档处理）。 */
  readonly defaultsReadable: boolean
  /** 默认档文件存在但损坏 / 半写（已降级空档）。 */
  readonly defaultsCorrupt: boolean
  /** 需要展示的提示码。 */
  readonly notices: readonly NoticeCode[]
  /** 工具描述（public name → 描述原文）；构建器负责截断到 160 字符。 */
  readonly descriptions?: ReadonlyMap<string, string>
}
