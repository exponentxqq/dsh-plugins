/**
 * 宿主半的共享 seam 类型：端口与跨文件数据形状。
 *
 * 所有副作用件（装配层、每 agent 层、状态存储、默认档、命令面、RPC 内核）都只依赖
 * 这里声明的窄接口，因此每条规则都能用假端口在单测里驱动，不需要拉起宿主。
 *
 * 本文件**只声明类型与文档**：不含任何运行时代码，import 全部是 `import type`（编译期擦除）。
 * `ControlDeps.workspaceChoices` 的返回形状是已登记工作区的 `{key,title}` 投影（内联窄面，
 * 与工作区下拉共用一份声明）；诊断端口则是
 * `@dsh-plugins/host-kit/log` 的 `LogSink`（G4 起三份同形适配器只有一份声明）。
 *
 * @module dsh-plugin-session-tool-toggle/host/types
 */

import type { LogSink } from '@dsh-plugins/host-kit/log'

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

/**
 * 诊断端口：`@dsh-plugins/host-kit/log` 的 `LogSink` 别名（G4）。
 *
 * 三份同形日志适配器（project-mcp / user-commands / 本包）只保留一个声明；本包的
 * logger 由 `@dsh-plugins/host-kit/log` 的 `createLog(ctx, prefix)` 承载——前缀在
 * `src/host/index.ts` 的调用点以字面量（`'dsh-plugin-session-tool-toggle'`）指定，
 * 形状由内核钉住。
 */
export type SpecLog = LogSink

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

/** 工具 schema 的轻量投影（面板描述来源；刻意不带 parameters）。 */
export interface VisibleToolSchema {
  /** 工具注册名（`mcp__<server>__<suffix>` / 内置工具名，与地址的 `<name>` 段同一文法）。 */
  readonly name: string
  /** 工具描述原文（可缺省：上游 schema 未必声明描述）。 */
  readonly description?: string
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
  /** 该 agent 视角下**当前可见**工具的名字 + 描述投影（与 {@link visibleNames} 同一读数面）。 */
  visibleSchemas(): readonly VisibleToolSchema[]
  /** systemPrompt 里某个已知段的顺序（`mcp:<server>` 段必须与官方同序）。 */
  sectionOrder(name: 'MCP_SERVERS'): number
}

/** 技能清单的一项（宿主 `SkillSummary` 的窄面）。 */
export interface SkillSummaryLike {
  /** kebab-case 技能名（`skill:<name>` 的 `<name>`，与 `dsh-skill` 的 `SKILL_NAME` 同一文法）。 */
  readonly name: string
  /** 一句话描述（目录消息与面板技能行都用它）。 */
  readonly description: string
  /** 调用方式；影子 stub 把 `modelInvocable` 改为 false、`userInvocable` 保持 true。 */
  readonly invocation: { readonly modelInvocable: boolean; readonly userInvocable: boolean }
  /** 来源标记（来源目录 / builtin 等）。 */
  readonly source?: string
  /** 提供者；同层先到先得时用它判断影子 stub 是否胜出。 */
  readonly provider?: string
  /** 技能文件路径。 */
  readonly path?: string
  /** 何时使用（目录消息用）。 */
  readonly whenToUse?: string
  /** 资源基址（影子 stub 原样复制）。 */
  readonly resourceBase?: unknown
  /** 元数据（影子 stub 原样复制）。 */
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** 技能定义（宿主 `SkillDefinition` 的窄面）：清单字段 + 正文。 */
export interface SkillDefinitionLike extends SkillSummaryLike {
  /** 技能正文（影子 stub 原样复制，`/name` 手动调用仍注入完整正文）。 */
  readonly content: string
}

/**
 * 宿主 SkillRegistry 的窄面（只声明本插件调用的三个方法）。
 *
 * 与 `tools` / `systemPrompt` 的窄面同一纪律：只把本插件真正调用的能力写进类型图，
 * 上游多出来的方法（列表、注销、作用域管理等）不在这里出现。
 */
export interface SkillServiceLike {
  /**
   * 注册一个技能（本插件只用来注册影子 stub）。
   * @param skill - 技能定义；字段与宿主 `SkillDefinition` 同形。
   * @returns 注销该技能的 disposer。
   */
  register(skill: {
    readonly name: string
    readonly description: string
    readonly content: string
    readonly source: string
    readonly provider?: string
    readonly path?: string
    readonly whenToUse?: string
    readonly resourceBase?: unknown
    readonly metadata?: Readonly<Record<string, unknown>>
    readonly invocation?: { readonly modelInvocable: boolean; readonly userInvocable: boolean }
  }): () => void
  /**
   * 取一个技能的完整定义（影子前先抄正文）。
   * @param name - 技能名。
   * @param options - 作用域与超时信号。
   * @returns 定义；不存在时为 undefined。
   */
  get(
    name: string,
    options?: { readonly cwd?: string; readonly scope?: object; readonly signal?: AbortSignal },
  ): Promise<SkillDefinitionLike | undefined>
  /**
   * 读该作用域可见的技能清单。
   * @param options - 作用域。
   * @returns 清单与「是否完整」标记。
   */
  snapshot(options?: {
    readonly cwd?: string
    readonly scope?: object
  }): Promise<{ readonly skills: readonly SkillSummaryLike[]; readonly complete: boolean }>
}

/** agent 子 fiber 交付的技能服务面（**必须**从子 fiber 的 ctx 访问，见 D-3）。 */
export interface SkillScopeHandle {
  /** 该 agent 作用域里的技能服务。 */
  readonly skills: SkillServiceLike
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
 * 会话工作目录 → 工作区键的归属结果（`resolveWorkspaceAttribution` 的出口）。
 *
 * 解析器返回 `undefined` 即 fail-closed（cwd 缺失或 realpath 全程失败，目录已删）：此时
 * 只用用户级默认档，不读工作区档。
 */
export interface WorkspaceAttribution {
  /** 写入 `workspaces.json` 的键：规范绝对路径。 */
  readonly key: string
  /** 该键是否由 `workspaceRegistry` 登记（false = 未登记目录，键来自 cwd 的 realpath）。 */
  readonly registered: boolean
  /** 已登记时的显示标题（面板 / footer 下拉用）。 */
  readonly title?: string
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
  /** 覆盖工作区档路径（绝对路径）。 */
  workspacesFile?: string
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

/** 一个 agent 作用域的技能分面读数（`LayerHandle.skills()`；面板技能行的唯一来源）。 */
export interface SkillLayerSnapshot {
  /** `skills` 服务是否可用（false = 只记意图，面板给 `skills-unavailable`）。 */
  readonly available: boolean
  /** 已注册影子 stub 的技能名（排序）。 */
  readonly shadowed: readonly string[]
  /** 该 agent 视角下**模型可调用**且未被本插件遮蔽的技能（面板技能行来源）。 */
  readonly visible: readonly { readonly name: string; readonly description: string }[]
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
  /**
   * 读本会话当前可见工具的名字 + 描述（面板描述来源）。
   *
   * 未挂载 / 已退场 / 读数失败 → 空数组（不抛错）：面板与默认档界面按「无描述」降级。
   */
  visibleSchemas(): readonly VisibleToolSchema[]
  /**
   * 读本会话的技能分面（影子 stub 与模型可调用技能清单）。
   *
   * `available: false` 表示 `skills` 服务不可用：技能地址只记意图，面板据此补
   * `skills-unavailable` 提示码。
   */
  skills(): SkillLayerSnapshot
  /**
   * 等待在途技能收敛结算（无在途收敛时立即 resolve）。
   *
   * `toggle` / `reset` 之后先 `await` 它再取面板读数，回执里的技能集合才是新状态的结果。
   */
  skillsSettled(): Promise<void>
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
  /**
   * 工作区档文件的绝对路径（`$DSH_HOME/session-tool-toggle/workspaces.json`，
   * `config.workspacesFile` 可覆盖）。
   */
  readonly workspacesPath: string
  /**
   * 工作区档读写端口（与 {@link defaultsIo} 同一实例）。
   *
   * 两份档文件共用同一套原子写与权限位（0o600 / 0o700），因此端口形状复用
   * `DefaultsIo`（`workspaces.ts` 里的 `WorkspaceIo` 就是它的别名）。
   */
  readonly workspacesIo: DefaultsIo
  /**
   * 会话 → 工作区归属（`attribution.ts` 的 `resolveWorkspaceAttribution` 闭包）。
   *
   * 返回 `undefined` = fail-closed（cwd 缺失或 realpath 全程失败）：面板工作区视图为
   * `null`，写工作区档返回 `workspace-unresolved`，播种只用用户级默认档。
   */
  readonly workspaceOf: (session: SessionLike) => Promise<WorkspaceAttribution | undefined>
  /**
   * 已登记工作区投影（`workspaceRegistry.list()` 的 `{path,title}` → `{key,title}`）。
   *
   * 两个消费者：工作区默认档页面的下拉可选项，以及 `{workspacePath}` 的登记白名单——
   * 只有列在这里的规范路径才允许读 / 写工作区档（D-11：拒绝任意路径探测）。
   */
  readonly workspaceChoices: () => readonly { readonly key: string; readonly title?: string }[]
  /** 生效保护名单（基线 ∪ config 追加），装配期算好，只读。 */
  readonly protectedNames: ReadonlySet<string>
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
  /** 技能服务不可用：技能地址只记意图，影子 stub 不生效。 */
  | 'skills-unavailable'
  /** 影子 stub 注册未胜出（同层先到先得）：该技能行的开关不可用。 */
  | 'skill-shadow-failed'

/**
 * 面板快照构建器（`panel.ts`）的输入：全部是宿主侧已经读到的事实。
 *
 * 构建器是纯函数——不碰服务、不做 IO；两读并集（scoped / carried）由调用方
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
  /** 该 agent 视角名字（`layer.visibleNames()`）。 */
  readonly scoped: readonly string[]
  /** 上一轮仍受管的名字（`layer.snapshot().deny`，防第二读缩小导致掩码被抬掉）。 */
  readonly carried: readonly string[]
  /** 生效保护名单（排序后的文本）。 */
  readonly protectedNames: readonly string[]
  /**
   * 本会话的技能分面读数（`layer.skills()`）。
   *
   * 缺席 = 宿主侧没有读到技能面（层未就绪）：面板按「技能不可用」处理。
   */
  readonly skills?: SkillLayerSnapshot
  /** 需要展示的提示码。 */
  readonly notices: readonly NoticeCode[]
  /** 工具描述（public name → 描述原文）；构建器负责截断到 160 字符。 */
  readonly descriptions?: ReadonlyMap<string, string>
}
