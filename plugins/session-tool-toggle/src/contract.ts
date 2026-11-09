/**
 * session-tool-toggle 的线上契约：宿主半与浏览器半共享的唯一事实来源。
 *
 * 两端各自内联一份（客户端 bundle 与宿主产物各打包一次），不共享任何运行时身份。
 * 本模块有三类职责：
 *
 * - **常量骨架**：通道名、四个端点、9 个宿主失败码 + 2 个传输码、长度/数量上限；
 * - **形状**：`code-design.md` 附录 §2.2 的 zod 草案是**形状权威**，这里逐字段抄成
 *   TS 接口（只有数据形状，不含 zod）；
 * - **边界校验**：四个端点的请求 parser、四个成功值的响应 parser，以及失败细节
 *   （`details`）的校验器。`parse*` 一律**不抛错**：失败时给一句可读的简体中文说明，
 *   让两端都能把"形状不对"变成 `bad-request` / `bad-response` 而不是崩溃。
 *
 * **strict 是全模块统一的边界规则：未知字段即越界。** 请求越界 = 版本漂移或注入；
 * 响应越界 = 对端与本端不是同一版契约（客户端据此报 `bad-response`）。静默丢弃未知
 * 字段会让两端的形状漂移在半年后才以错渲染的形式暴露，因此请求与响应都拒绝契约外
 * 的字段（响应比 §2.2 的 zod 草案更严：草案只对请求标了 `.strict()`）。
 *
 * 本模块不得 import `node:*` 或 `@deepseek-ai/*`（会被内联进浏览器 bundle），也不引
 * `zod`：两端各内联一份手写实现，让浏览器半零额外运行时依赖（D16）。因此本文件没有
 * 任何 import 行，也不能引用宿主侧实现（`./host/*`）——地址文法校验在宿主的
 * `address.ts`，这里只做长度/数量护栏。
 *
 * @module dsh-plugin-session-tool-toggle/contract
 */

/** Connection RPC 通道：两端的绝对逻辑通道名（包名即通道名，与 `/web-ux` 同一约定）。 */
export const CHANNEL = '/session-tool-toggle'

/** 读面板快照（清单 + 关闭集 + 保护名单 + 统计 + 提示 + 技能行）。 */
export const PANEL_ENDPOINT = 'panel'

/** 批量开/关（`on` 布尔 + 地址列表）；全有或全无，成功值内含变更后的新快照。 */
export const TOGGLE_ENDPOINT = 'toggle'

/** 本会话回到创建时快照（语义 = `state.snapshot`）。 */
export const RESET_ENDPOINT = 'reset'

/**
 * 工作区级默认档读 / 写（`read` / `set` / `off` / `on` / `reset`）。
 *
 * 只按工作区规范路径寻址（页面统一选择框与未来的上游座位）。工作区档只影响之后新建的
 * 会话，不追溯。
 */
export const WORKSPACE_ENDPOINT = 'workspace'

/** 全部端点名，供两端穷举与测试表驱动（顺序即文档 / 诊断顺序）。 */
export const ENDPOINTS = ['panel', 'toggle', 'reset', 'workspace'] as const

/** 端点名类型。 */
export type SessionToolToggleEndpoint = (typeof ENDPOINTS)[number]

/** `workspace` 端点的动作集（`read` 是缺省值）。 */
export const WORKSPACE_ACTIONS = ['read', 'set', 'off', 'on', 'reset'] as const

/** `workspace` 动作类型。 */
export type WorkspaceAction = (typeof WORKSPACE_ACTIONS)[number]

/**
 * 宿主侧稳定失败码（9 个）。业务拒绝码保留自己的语义，不合并成 `internal`：
 * 界面按码给本地化文案，宿主 `message` 只作二级说明。
 */
export const HOST_FAILURE_CODES = [
  /** 端点未知 / 请求体不合形状 / 未知 action。 */
  'bad-request',
  /** 地址文法解析失败（细节里带 `parseCode`）。 */
  'bad-address',
  /** 命中保护名单（整单拒绝，不写任何状态）。 */
  'protected',
  /** 保留名（`run_code` 等，`restrict` 会抛）。 */
  'reserved',
  /** 会话不在宿主中运行（已归档 / 已结束 / 不存在的 id）。 */
  'session-not-live',
  /** 默认档写入失败（权限 / 磁盘 / 目录不可建）。 */
  'defaults-unwritable',
  /** 未预期抛错（宿主已 warn）。 */
  'internal',
  /** 会话 cwd 无法归属 / 工作区路径未登记或不可 realpath。 */
  'workspace-unresolved',
  /** 工作区档写入失败（细节里带 `{path, reason}`）。 */
  'workspace-unwritable',
] as const

/** 宿主失败码类型。 */
export type HostFailureCode = (typeof HOST_FAILURE_CODES)[number]

/**
 * 传输侧失败码（2 个，由 client 合成，不是宿主码）：
 * `unavailable` = 传输抛错 / 通道未挂载，`bad-response` = 信封不可读或响应过不了 parser。
 */
export const TRANSPORT_FAILURE_CODES = ['unavailable', 'bad-response'] as const

/** 传输侧失败码类型。 */
export type TransportFailureCode = (typeof TRANSPORT_FAILURE_CODES)[number]

/** 全部已知失败码：宿主码在前、传输码在后。 */
export const FAILURE_CODES = [...HOST_FAILURE_CODES, ...TRANSPORT_FAILURE_CODES] as const

/** 失败码类型（未知码由调用方按兜底文案渲染）。 */
export type FailureCode = (typeof FAILURE_CODES)[number]

/**
 * 判断一个字符串是否为已知失败码。
 * @param code - 线上信封里的错误码。
 * @returns 已知失败码时为 true。
 */
export function isFailureCode(code: string): code is FailureCode {
  return (FAILURE_CODES as readonly string[]).includes(code)
}

/** 会话 id 的长度上限（宿主会把它当单段目录名使用）。 */
export const SESSION_ID_MAX_LENGTH = 255

/** 单条地址的长度上限：超长即视为异常输入。 */
export const ADDRESS_MAX_LENGTH = 200

/**
 * 工作区路径的长度上限（与 {@link ADDRESS_MAX_LENGTH} 同级的线上护栏）。
 *
 * 只挡异常输入；`/` 开头、绝对路径、realpath 是否成功等文法与归属判断在宿主侧。
 */
export const MAX_WORKSPACE_PATH_LENGTH = 4096

/** 一次请求允许携带的地址数量上限。 */
export const MAX_ADDRESSES = 64

/** 工具分组的来源：MCP 服务器 / skill 整档 / 内置工具（§2.2 `ToolGroupSchema.kind`）。 */
export const TOOL_GROUP_KINDS = ['mcp', 'skill', 'builtin'] as const

/** 工具分组来源类型。 */
export type ToolGroupKind = (typeof TOOL_GROUP_KINDS)[number]

/** MCP 组的配置来源（R15）：profile 级（所有工作区可见）/ 本工作区项目级。 */
export const GROUP_SOURCES = ['user', 'project'] as const

/** MCP 组配置来源类型。 */
export type GroupSource = (typeof GROUP_SOURCES)[number]

/**
 * 面板提示码：`PanelSnapshot.notices` 与 `Mutation.notices` 的元素（§2.2 `NoticeCodeSchema`）。
 *
 * 宿主只给码，文案由 client 用 `t()` 组合。类型名取 `NoticeView` 而不是 `NoticeCode`，
 * 避免与宿主侧 `host/types.ts` 的同名类型在同一次 import 里撞名（两者是同一组取值）。
 */
export const NOTICE_CODES = [
  /** 记录通道不可用，已降级内存态。 */
  'persistence-degraded',
  /** 默认档损坏 / 半写，已按空档处理。 */
  'defaults-corrupt',
  /** 子代理会话：不继承父会话的会话级开关。 */
  'session-subagent',
  /** 技能服务不可用：技能地址只记意图，影子 stub 不生效。 */
  'skills-unavailable',
  /** 影子 stub 注册未胜出（同层先到先得）：该技能行的开关不可用。 */
  'skill-shadow-failed',
] as const

/** 面板提示码类型。 */
export type NoticeView = (typeof NOTICE_CODES)[number]

/** 状态实际生效的持久化通道（§2.2 `StateViewSchema.storeKind`，降级可观测）。 */
export const STORE_KINDS = ['record', 'memory'] as const

/** 持久化通道类型（线上视图用；与宿主侧 `StoreKind` 同形，名字避开撞名）。 */
export type StateStoreKind = (typeof STORE_KINDS)[number]

/** 默认档文件的格式版本（§2.2 `DefaultsViewSchema.version`，当前只有 1）。 */
export const DEFAULTS_VERSION = 1

/** 工具描述在快照里的截断上限（§2.2 `z.string().max(160)`）。 */
export const DESCRIPTION_MAX_LENGTH = 160

/* ────────────────────────── 请求形状（§2.2 草案逐字段） ────────────────────────── */

/**
 * `panel` / `reset` 共用的请求体：只带目标会话 id。
 *
 * 会话 id 的来源是 client 的 session-scope 座位 prop，不从 URL / localStorage / DOM 猜
 * （§2.4）；宿主收到后还要做 `agents.get` 与 `session.id` 身份对账两步。
 */
export interface PanelRequest {
  /** 目标会话 id（非空、≤{@link SESSION_ID_MAX_LENGTH}）。 */
  readonly sessionId: string
}

/** `reset` 的请求体与 `panel` 同形（§2.2 `ResetRequestSchema = PanelRequestSchema`）。 */
export type ResetRequest = PanelRequest

/**
 * `toggle` 的请求体：批量开/关。
 *
 * 全有或全无（D19）：任一地址文法非法 / 命中保护名单 / 是保留名 → 整单拒绝，不写任何
 * 状态。线上只做长度/数量护栏，文法校验的唯一权威在宿主 `address.ts`。
 */
export interface ToggleRequest {
  /** 目标会话 id。 */
  readonly sessionId: string
  /** `true` = 开启（从关闭集移除），`false` = 关闭（加入关闭集）。 */
  readonly on: boolean
  /** 目标地址：1–{@link MAX_ADDRESSES} 条，每条 1–{@link ADDRESS_MAX_LENGTH} 字符。 */
  readonly addresses: readonly string[]
}

/**
 * `workspace` 端点的请求体：工作区级默认档读 / 写（只按工作区规范路径寻址，strict）。
 *
 * `workspacePath` 用于页面统一选择框（只接受已登记工作区的规范路径）。工作区档只影响
 * 之后新建的会话，不追溯。`action` 缺省 = `read`。
 */
export interface WorkspaceRequest {
  /** 目标工作区规范路径。 */
  readonly workspacePath: string
  /** 动作；缺省 = `read`。 */
  readonly action?: WorkspaceAction
  /** `set` / `off` / `on` 必需（1–{@link MAX_ADDRESSES} 条），`read` / `reset` 禁止出现。 */
  readonly addresses?: readonly string[]
}

/* ────────────────────────── 响应形状（§2.2 草案逐字段） ────────────────────────── */

/** 一条工具条目。宿主给**事实**，本地化文案由 client 用 `t()` 组合。 */
export interface ToolEntry {
  /** 注册名（MCP 是 public name `mcp__<server>__<suffix>`）。 */
  readonly name: string
  /** 展示用短名（MCP 为 public 后缀；builtin 与 name 相同）。 */
  readonly shortName: string
  /** 该条目自己的规范形地址（`mcp:<s>::<suffix>` / `tool:<name>`）。 */
  readonly address: string
  /** 命中当前关闭集。 */
  readonly disabled: boolean
  /** 在生效保护名单内（拒关）。 */
  readonly protected: boolean
  /** 保留名（如 `run_code`，restrict 拒绝）。 */
  readonly reserved: boolean
  /** 描述首 {@link DESCRIPTION_MAX_LENGTH} 字符（已截断），缺省表示无描述。 */
  readonly description?: string
}

/** 一个工具分组（MCP 服务器 / skill 整档 / 内置工具）。 */
export interface ToolGroup {
  /** 分组来源。 */
  readonly kind: ToolGroupKind
  /** 分组键：MCP = serverName；skill = 'skill'；builtin = 'builtin'。 */
  readonly key: string
  /** 整组地址；builtin 分组不可整组关 → `null`。 */
  readonly address: string | null
  /** 组内条目数。 */
  readonly toolCount: number
  /** 组内命中关闭集的条目数。 */
  readonly disabledCount: number
  /** 整组地道的关闭状态（`address !== null` 且命中关闭集）。 */
  readonly disabled: boolean
  /** 组内条目。 */
  readonly tools: readonly ToolEntry[]
}

/** 会话级开关状态的可视化视图（关闭集 + 创建时快照 + 持久化通道）。 */
export interface StateView {
  /** 已排序去重的规范形关闭集。 */
  readonly disabled: readonly string[]
  /** 创建时快照（默认档拍下的那一份）。 */
  readonly snapshot: readonly string[]
  /** 是否已由一条日志记录建立。 */
  readonly seeded: boolean
  /** 最后更新时间（epoch ms）。 */
  readonly updatedAt: number
  /** 持久化通道实际形态（降级可观测）。 */
  readonly storeKind: StateStoreKind
}

/** 用户级默认档视图。 */
export interface DefaultsView {
  /** 文件格式版本（§2.2 的 `z.literal(1)`：恒等于 {@link DEFAULTS_VERSION}）。 */
  readonly version: typeof DEFAULTS_VERSION
  /** 默认档里的关闭集（新会话的快照来源）。 */
  readonly disabled: readonly string[]
  /** 绝对路径（面板展示，便于手编）。 */
  readonly path: string
  /** 文件可读（false = 不存在，按空档处理）。 */
  readonly readable: boolean
  /** 文件存在但损坏 / 半写（已降级空档）。 */
  readonly corrupt: boolean
}

/** 面板摘要的两计数。 */
export interface StatsView {
  /** 本会话当前可见工具数（掩码后）。 */
  readonly visible: number
  /** 当前 deny 名字数（= 掩码实际生效量）。 */
  readonly denied: number
}

/** 面板快照与 `workspace` 端点共用的工作区档视图。 */
export interface WorkspaceView {
  /** 工作区键（规范绝对路径）。 */
  readonly key: string
  /** 显示标题（未登记时缺省）。 */
  readonly title?: string
  /** 是否由 workspaceRegistry 登记。 */
  readonly registered: boolean
  /** 该工作区当前的默认关闭集（已归一、排序）。 */
  readonly disabled: readonly string[]
  /** 工作区档文件绝对路径（面板展示，便于手编）。 */
  readonly path: string
  /** 文件可读（false = 不存在，按空档处理）。 */
  readonly readable: boolean
  /** 文件存在但损坏 / 半写（已降级空档）。 */
  readonly corrupt: boolean
}

/** 技能行（面板的技能分面；与 `groups` 里的 `skill` 整档行互补）。 */
export interface SkillView {
  /** kebab-case 技能名（= `skill:<name>` 的 `<name>`）。 */
  readonly name: string
  /** 描述（≤ 160 字符；已关且无缓存时为空串）。 */
  readonly description: string
  /** 在关闭集里（意图）。 */
  readonly disabled: boolean
  /** 本会话已注册影子 stub（实际生效；与 disabled 构成两态区分）。 */
  readonly shadowed: boolean
}

/** `panel` 端点的成功值：面板快照。 */
export interface PanelSnapshot {
  /** 目标会话 id。 */
  readonly sessionId: string
  /** 会话创建时间（epoch ms），面板用它讲「快照来源」。 */
  readonly createdAt: number
  /** 会话级开关状态视图。 */
  readonly state: StateView
  /** 分组清单。 */
  readonly groups: readonly ToolGroup[]
  /** 生效保护名单（基线 ∪ config 追加）。 */
  readonly protectedNames: readonly string[]
  /** 关闭集里当前命中 0 个注册名的地址（"意图已记录、暂无匹配"）。 */
  readonly intentOnly: readonly string[]
  /** 两计数。 */
  readonly stats: StatsView
  /** 降级 / 子代理提示码。 */
  readonly notices: readonly NoticeView[]
  /** 技能行（按名字升序；只含模型可调用技能 ∪ 当前已遮蔽名字）。 */
  readonly skills: readonly SkillView[]
}

/** 逐地址回执。 */
export interface MutationApplied {
  /** 本次操作的地址（规范形）。 */
  readonly address: string
  /** 本次是开启（true）还是关闭（false）。 */
  readonly on: boolean
  /** 当前命中注册名数（0 = 意图已记、暂无匹配）。 */
  readonly matched: number
}

/** 一次变更的回执（只报计数与代价形状，D7）。 */
export interface Mutation {
  /** 逐地址回执。 */
  readonly applied: readonly MutationApplied[]
  /** deny 集合的变化量（可为负）。 */
  readonly hiddenTools: number
  /** 本次影子 stub 集合的变化量（可为负；0 = 技能可见性没变）。 */
  readonly hiddenSkills: number
  /** 变更前可见工具数。 */
  readonly visibleBefore: number
  /** 变更后可见工具数。 */
  readonly visibleAfter: number
  /** 是否提示「前缀缓存将从第一个变化的 schema token 起重建一次」；工具 schema 或技能目录任一变化 → true。 */
  readonly kvRebuild: boolean
  /** 本次变更产生的提示码。 */
  readonly notices: readonly NoticeView[]
}

/**
 * `toggle` 的成功值：变更后的新快照 + 变更回执（一次往返拿全）。
 *
 * `reset` 与 `toggle` 共享本形状（D20）：`reset` 语义 = 回到 `state.snapshot`，回执里的
 * `applied` 是「被移除的关闭项」（`on` 恒为 `true`）。
 */
export interface ToggleValue {
  /** 变更后的新快照。 */
  readonly snapshot: PanelSnapshot
  /** 变更回执。 */
  readonly mutation: Mutation
}

/** `reset` 的成功值：与 {@link ToggleValue} 同形。 */
export type ResetValue = ToggleValue

/* ────────────────────────── 默认档宇宙（分组开关界面，§3.15） ────────────────────────── */

/** 默认档分组界面的一条可切换条目（目标无关：用户级档与工作区档共用）。 */
export interface DefaultsEntry {
  /** 规范形地址（行地址：`mcp:<server>::<tool>` / `skill:<name>` / `tool:<name>`）。 */
  readonly address: string
  /** 展示用短名（MCP 为 public 后缀；技能与内置工具为名字本身）。 */
  readonly shortName: string
  /** 描述首 160 字符；缺省 = 无描述（已关且本会话读不到 schema 描述）。 */
  readonly description?: string
  /** 在生效保护名单内（写路径会拒绝）。 */
  readonly protected: boolean
  /** 注册表保留名（`run_code`）：`restrict` 拒绝，永远不可关。 */
  readonly reserved: boolean
  /**
   * 技能行：模型可经 `skill` 工具加载（默认档里「占对话 token」）。
   * 与 `userInvocable` **成对出现**；只在 `skill:<name>` 地址上合法。
   */
  readonly modelInvocable?: boolean
  /** 技能行：用户可经 `/<name>` 手动调用。 */
  readonly userInvocable?: boolean
  /** 技能行：来源（`dsh-skill` 的 `source` 原值；短标签由 client 映射）。 */
  readonly source?: string
}

/** 一个默认档分组。`kind:'skill'` 的行是 `skill:<name>`，组地址是 `tool:skill`。 */
export interface DefaultsGroup {
  /** 分组来源（与 `ToolGroupKind` 同取值域）。 */
  readonly kind: 'mcp' | 'skill' | 'builtin'
  /** 分组键：MCP = serverName；skill = `skill`；builtin = `builtin`。 */
  readonly key: string
  /** 整组开关的地址；`builtin` 不可整组关 → `null`。 */
  readonly address: string | null
  /** 组内可切换条目（按地址升序）。 */
  readonly tools: readonly DefaultsEntry[]
  /**
   * MCP 组的配置来源（R15）：`'user'` = profile 级配置（所有工作区可见）、`'project'` =
   * 本工作区 `.dsh/mcp/` 的项目级配置。只允许出现在 `kind: 'mcp'` 组上；`'project'` 组
   * 仅在**目标工作区**的根集归属下才出现（其他工作区的项目级服务器整组不进清单）。
   */
  readonly source?: 'user' | 'project'
  /**
   * 组是否计入对话 token（R15）：MCP 组恒 `true`——每个可见工具的 schema 与服务器指令都
   * 进入每次请求。只允许出现在 `kind: 'mcp'` 组上（技能组有逐行 `modelInvocable`，内置组
   * 本就计入且组级标注无意义）。
   */
  readonly countsTokens?: boolean
}

/** 默认档宇宙（目标无关形状）：`{sessionId}` 的会话宇宙与 `{workspacePath}` 的工作区宇宙共用。 */
export interface DefaultsUniverse {
  /** 会话层读数是否可用（false = 读不到清单，界面只能展示残留区）。 */
  readonly layerReady: boolean
  /** 技能服务是否可用（false = 技能组只保留 `tool:skill` 组开关 + 降级提示）。 */
  readonly skillsAvailable: boolean
  /** 分组（MCP 组按 server 升序 → 技能组 → 内置工具组；空组不出现）。 */
  readonly groups: readonly DefaultsGroup[]
  /** 工作区宇宙：`mcp__` 前缀但无法还原服务器名的工具数（未归组；缺省 = 0）。 */
  readonly ungroupedMcp?: number
  /** 工作区宇宙：技能目录观测是否完整（缺省 = 未观测 / 旧响应）。 */
  readonly skillsComplete?: boolean
  /**
   * 工作区宇宙：因属于**其他工作区**的项目级 MCP 而被整组剔除的服务器数（R15；缺省 = 0）。
   * 页面据此显示「另有 N 个其他工作区的项目级 MCP 未列入」注记；仅 >0 时出现。
   */
  readonly foreignProjectMcp?: number
}

/** `workspace` 端点的成功值：目标工作区视图 + 实际写入项 + 目标工具宇宙。 */
export interface WorkspaceValue {
  /** 目标工作区视图；`null` = 路径未登记 / 目标无法归属。 */
  readonly workspace: WorkspaceView | null
  /** 本次实际写入的规范形地址（`read` 时为空数组）。 */
  readonly changed: readonly string[]
  /**
   * 目标工具宇宙：该工作区的宇宙（全局工具注册表 ∪ 该 cwd 技能），本版本**不再返回 null**；
   * `null` 只为混合版本兼容保留（旧宿主），新宿主不产生。
   */
  readonly universe: DefaultsUniverse | null
}

/* ────────────────────────── 失败细节（§2.3 details 表） ────────────────────────── */

/** `bad-request` 的细节：一句可读的校验说明。 */
export interface BadRequestDetails {
  /** 哪里不合形状（parser 的 `message`）。 */
  readonly issues?: string
}

/** `bad-address` 的细节：原文 + 地址解析失败码（`address.ts` 的 `ParseErrorCode`）。 */
export interface BadAddressDetails {
  /** 被拒绝的原文。 */
  readonly address: string
  /** `address.ts` 的解析失败码。 */
  readonly parseCode: string
}

/** `protected` / `reserved` 的细节：命中的名字（整单拒绝，见 D19）。 */
export interface NameListDetails {
  /** 命中的名字列表（至少一项）。 */
  readonly names: readonly string[]
}

/** `session-not-live` 的细节：请求里那个会话 id。 */
export interface SessionNotLiveDetails {
  /** 未在宿主中运行的会话 id。 */
  readonly sessionId: string
}

/** `defaults-unwritable` 的细节：目标路径 + 原因。 */
export interface DefaultsUnwritableDetails {
  /** 写入目标（绝对路径）。 */
  readonly path: string
  /** 底层失败原因（`Error.message`）。 */
  readonly reason: string
}

/** `workspace-unresolved` 的细节：失败主体（会话 id 或被拒绝的路径原文）。 */
export interface WorkspaceUnresolvedDetails {
  /** 失败主体：会话 id 或被拒绝的路径原文（面板按此渲染占位符）。 */
  readonly subject: string
}

/** 已知的失败细节形状（`internal` 的 `{}` 不在其中：它没有结构化信息）。 */
export type FailureDetails =
  | BadRequestDetails
  | BadAddressDetails
  | NameListDetails
  | SessionNotLiveDetails
  | DefaultsUnwritableDetails
  | WorkspaceUnresolvedDetails

/* ────────────────────────── 解析结果与内部助手 ────────────────────────── */

/**
 * 一次解析的结果：值，或一句说明哪里不合契约的话。
 *
 * `parse*` 从不抛错——两端都可能拿到"半对"的输入（浏览器发出的旧版本请求、宿主返回的
 * 新版本响应），把结构不符变成可读的失败原因，比让异常穿透到渲染层更可控。
 */
export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string }

/** 构造失败结果（`Parsed<T>` 的失败分支与 `T` 无关，可直接返回）。 */
function fail(message: string): { readonly ok: false; readonly message: string } {
  return { ok: false, message }
}

/**
 * 读一个「对象」形状。
 *
 * `subject` 是**字段路径前缀**（如 `panel 请求体`、`panel 快照.state`），错误文案统一
 * 拼成 `<前缀>.<字段>`，让两端日志里的失败位置可 grep。
 */
function readObject(value: unknown, subject: string): Parsed<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${subject} 不是对象`)
  }
  return { ok: true, value: value as Record<string, unknown> }
}

/**
 * 读一个「strict 对象」：是对象，且只允许 `allowed` 里的字段。
 *
 * 未知字段即越界——这条规则同时服务于请求（版本漂移 / 注入）与响应（两端契约不同版）。
 */
function readStrictObject(
  value: unknown,
  subject: string,
  allowed: readonly string[],
): Parsed<Record<string, unknown>> {
  const object = readObject(value, subject)
  if (!object.ok) return object
  const unknown = Object.keys(object.value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) return fail(`${subject} 含未知字段：${unknown.join(', ')}`)
  return object
}

/** 字符串字段的限制（`undefined` = 该方向不限）。 */
interface StringLimits {
  /** 最小长度（取 1 时拒绝空串）。 */
  readonly minLength?: number
  /** 最大长度。 */
  readonly maxLength?: number
}

/**
 * 读必填字符串字段。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @param limits - 长度限制。
 * @returns 字段值，或不合契约的原因。
 */
function readStringField(
  record: Record<string, unknown>,
  key: string,
  subject: string,
  limits: StringLimits = {},
): Parsed<string> {
  const value = record[key]
  if (typeof value !== 'string') return fail(`${subject}.${key} 不是字符串`)
  const minLength = limits.minLength ?? 0
  if (value.length < minLength) return fail(`${subject}.${key} 为空`)
  const maxLength = limits.maxLength
  if (maxLength !== undefined && value.length > maxLength) {
    return fail(`${subject}.${key} 超过 ${maxLength} 字符（实际 ${value.length}）`)
  }
  return { ok: true, value }
}

/**
 * 读可选字符串字段：字段缺省（或值为 `undefined`）时返回 `undefined`。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @param limits - 长度限制。
 * @returns 字段值、`undefined`，或不合契约的原因。
 */
function readOptionalStringField(
  record: Record<string, unknown>,
  key: string,
  subject: string,
  limits: StringLimits = {},
): Parsed<string | undefined> {
  if (record[key] === undefined) return { ok: true, value: undefined }
  return readStringField(record, key, subject, limits)
}

/**
 * 读布尔字段。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @returns 布尔值，或不合契约的原因。
 */
function readBooleanField(record: Record<string, unknown>, key: string, subject: string): Parsed<boolean> {
  const value = record[key]
  if (typeof value !== 'boolean') return fail(`${subject}.${key} 不是布尔值`)
  return { ok: true, value }
}

/**
 * 读可选布尔字段：字段缺省（或值为 `undefined`）时返回 `undefined`。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @returns 布尔值、`undefined`，或不合契约的原因。
 */
function readOptionalBooleanField(
  record: Record<string, unknown>,
  key: string,
  subject: string,
): Parsed<boolean | undefined> {
  if (record[key] === undefined) return { ok: true, value: undefined }
  return readBooleanField(record, key, subject)
}

/**
 * 读可选枚举字段（缺省 = 键不存在；存在但取值越界 → 拒绝）。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @param allowed - 允许的取值表。
 * @returns 枚举值或 `undefined`，或不合契约的原因。
 */
function readOptionalEnumField<T extends string>(
  record: Record<string, unknown>,
  key: string,
  subject: string,
  allowed: readonly T[],
): Parsed<T | undefined> {
  if (record[key] === undefined) return { ok: true, value: undefined }
  return readEnumField(record, key, subject, allowed)
}

/**
 * 读非负安全整数字段（计数、epoch ms）。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @returns 非负整数，或不合契约的原因。
 */
function readCountField(record: Record<string, unknown>, key: string, subject: string): Parsed<number> {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return fail(`${subject}.${key} 不是非负安全整数`)
  }
  return { ok: true, value }
}

/**
 * 读可选非负安全整数字段：字段缺省（或值为 `undefined`）时返回 `undefined`。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @returns 非负整数、`undefined`，或不合契约的原因。
 */
function readOptionalCountField(
  record: Record<string, unknown>,
  key: string,
  subject: string,
): Parsed<number | undefined> {
  if (record[key] === undefined) return { ok: true, value: undefined }
  return readCountField(record, key, subject)
}

/**
 * 读有符号安全整数字段（`hiddenTools` 允许为负）。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @returns 安全整数，或不合契约的原因。
 */
function readIntField(record: Record<string, unknown>, key: string, subject: string): Parsed<number> {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return fail(`${subject}.${key} 不是安全整数`)
  }
  return { ok: true, value }
}

/**
 * 读可空字符串字段（`null` 是合法值；缺省**不是**）。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @returns 字符串、`null`，或不合契约的原因。
 */
function readNullableStringField(
  record: Record<string, unknown>,
  key: string,
  subject: string,
): Parsed<string | null> {
  const value = record[key]
  if (value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return fail(`${subject}.${key} 不是字符串或 null`)
  return { ok: true, value }
}

/** 字符串数组字段的限制。 */
interface StringArrayLimits {
  /** 元素数量下限。 */
  readonly minItems?: number
  /** 元素数量上限。 */
  readonly maxItems?: number
  /** 单个元素的最小长度。 */
  readonly itemMinLength?: number
  /** 单个元素的最大长度。 */
  readonly itemMaxLength?: number
}

/**
 * 读字符串数组字段（总是复制成独立数组，不把输入数组泄漏给调用方）。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @param limits - 数量与元素长度限制。
 * @returns 字符串数组，或不合契约的原因。
 */
function readStringArrayField(
  record: Record<string, unknown>,
  key: string,
  subject: string,
  limits: StringArrayLimits = {},
): Parsed<readonly string[]> {
  const value = record[key]
  if (!Array.isArray(value)) return fail(`${subject}.${key} 不是数组`)
  const items = value as unknown[]
  const minItems = limits.minItems ?? 0
  if (items.length < minItems) return fail(`${subject}.${key} 至少需要 ${minItems} 项（实际 ${items.length}）`)
  const maxItems = limits.maxItems
  if (maxItems !== undefined && items.length > maxItems) {
    return fail(`${subject}.${key} 超过上限 ${maxItems} 项（实际 ${items.length}）`)
  }
  const result: string[] = []
  const itemMinLength = limits.itemMinLength ?? 0
  const itemMaxLength = limits.itemMaxLength
  for (const [index, item] of items.entries()) {
    const itemSubject = `${subject}.${key}[${index}]`
    if (typeof item !== 'string') return fail(`${itemSubject} 不是字符串`)
    if (item.length < itemMinLength) return fail(`${itemSubject} 为空`)
    if (itemMaxLength !== undefined && item.length > itemMaxLength) {
      return fail(`${itemSubject} 超过 ${itemMaxLength} 字符（实际 ${item.length}）`)
    }
    result.push(item)
  }
  return { ok: true, value: result }
}

/**
 * 读对象数组字段：逐项交给 `readItem`，项级失败原样上抛（含具体下标）。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @param readItem - 单元素解析器；收到的 `subject` 已含下标。
 * @returns 数组，或不合契约的原因。
 */
function readArrayField<T>(
  record: Record<string, unknown>,
  key: string,
  subject: string,
  readItem: (item: unknown, itemSubject: string) => Parsed<T>,
): Parsed<readonly T[]> {
  const value = record[key]
  if (!Array.isArray(value)) return fail(`${subject}.${key} 不是数组`)
  const result: T[] = []
  for (const [index, item] of (value as unknown[]).entries()) {
    const parsed = readItem(item, `${subject}.${key}[${index}]`)
    if (!parsed.ok) return parsed
    result.push(parsed.value)
  }
  return { ok: true, value: result }
}

/**
 * 读枚举字段（`allowed` 是纯数据常量表）。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @param allowed - 允许的取值表。
 * @returns 枚举值，或不合契约的原因。
 */
function readEnumField<T extends string>(
  record: Record<string, unknown>,
  key: string,
  subject: string,
  allowed: readonly T[],
): Parsed<T> {
  const value = record[key]
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    return fail(`${subject}.${key} 不是已知取值（${allowed.join(' / ')}）`)
  }
  return { ok: true, value: value as T }
}

/**
 * 读枚举数组字段（`notices`）。
 * @param record - 已通过 strict 检查的对象。
 * @param key - 字段名。
 * @param subject - 字段路径前缀。
 * @param allowed - 允许的取值表。
 * @returns 枚举值数组，或不合契约的原因。
 */
function readEnumArrayField<T extends string>(
  record: Record<string, unknown>,
  key: string,
  subject: string,
  allowed: readonly T[],
): Parsed<readonly T[]> {
  return readArrayField<T>(record, key, subject, (item, itemSubject) => {
    if (typeof item !== 'string' || !(allowed as readonly string[]).includes(item)) {
      return fail(`${itemSubject} 不是已知取值（${allowed.join(' / ')}）`)
    }
    return { ok: true, value: item as T }
  })
}

/* ────────────────────────── 请求 parser（4 个端点） ────────────────────────── */

/** `panel` 请求的字段集（strict）。 */
const PANEL_REQUEST_KEYS = ['sessionId'] as const

/** `toggle` 请求的字段集（strict）。 */
const TOGGLE_REQUEST_KEYS = ['sessionId', 'on', 'addresses'] as const

/** `workspace` 请求的字段集（strict）。 */
const WORKSPACE_REQUEST_KEYS = ['workspacePath', 'action', 'addresses'] as const

/**
 * 校验 `panel` 端点的请求体。
 * @param raw - 通道收到（或发出）的原始请求体。
 * @returns 请求，或不合契约的原因。
 */
export function parsePanelRequest(raw: unknown): Parsed<PanelRequest> {
  const subject = 'panel 请求体'
  const body = readStrictObject(raw, subject, PANEL_REQUEST_KEYS)
  if (!body.ok) return body
  const sessionId = readStringField(body.value, 'sessionId', subject, {
    minLength: 1,
    maxLength: SESSION_ID_MAX_LENGTH,
  })
  if (!sessionId.ok) return sessionId
  return { ok: true, value: { sessionId: sessionId.value } }
}

/**
 * 校验 `reset` 端点的请求体（与 `panel` 同形）。
 * @param raw - 原始请求体。
 * @returns 请求，或不合契约的原因。
 */
export function parseResetRequest(raw: unknown): Parsed<ResetRequest> {
  const subject = 'reset 请求体'
  const body = readStrictObject(raw, subject, PANEL_REQUEST_KEYS)
  if (!body.ok) return body
  const sessionId = readStringField(body.value, 'sessionId', subject, {
    minLength: 1,
    maxLength: SESSION_ID_MAX_LENGTH,
  })
  if (!sessionId.ok) return sessionId
  return { ok: true, value: { sessionId: sessionId.value } }
}

/**
 * 校验 `toggle` 端点的请求体。
 *
 * 只做**长度/数量**护栏（文法在宿主 `address.ts`）：条数 1–{@link MAX_ADDRESSES}、
 * 每条 1–{@link ADDRESS_MAX_LENGTH} 字符。超出即整单拒绝（D19），不做截断。
 * @param raw - 原始请求体。
 * @returns 请求，或不合契约的原因。
 */
export function parseToggleRequest(raw: unknown): Parsed<ToggleRequest> {
  const subject = 'toggle 请求体'
  const body = readStrictObject(raw, subject, TOGGLE_REQUEST_KEYS)
  if (!body.ok) return body
  const sessionId = readStringField(body.value, 'sessionId', subject, {
    minLength: 1,
    maxLength: SESSION_ID_MAX_LENGTH,
  })
  if (!sessionId.ok) return sessionId
  const on = readBooleanField(body.value, 'on', subject)
  if (!on.ok) return on
  const addresses = readStringArrayField(body.value, 'addresses', subject, {
    minItems: 1,
    maxItems: MAX_ADDRESSES,
    itemMinLength: 1,
    itemMaxLength: ADDRESS_MAX_LENGTH,
  })
  if (!addresses.ok) return addresses
  return { ok: true, value: { sessionId: sessionId.value, on: on.value, addresses: addresses.value } }
}

/**
 * 校验 `workspace` 端点的请求体（只按工作区规范路径寻址，strict）。
 *
 * `workspacePath` 必需：1–{@link MAX_WORKSPACE_PATH_LENGTH} 字符且以 `/` 开头（只接受
 * 已登记工作区的规范路径；归属与文法的最终判断在宿主侧）。按会话 id 的旧寻址形态已随
 * P-1=b 收缩移除：携带 `sessionId` 的请求被 strict 规则按未知字段拒绝（`bad-request`）。
 *
 * `action` 缺省 `read`；`set` / `off` / `on` 必须带 1–{@link MAX_ADDRESSES} 条地址，
 * `read` / `reset` 不得出现地址。
 *
 * `action` 在返回值里**总是**归一为显式取值（缺省补 `read`）：宿主 dispatcher 因此不必
 * 在每个分支里再写一次 `?? 'read'`，也不会把「缺省」误读成未知动作。
 * @param raw - 原始请求体。
 * @returns 请求，或不合契约的原因。
 */
export function parseWorkspaceRequest(raw: unknown): Parsed<WorkspaceRequest> {
  const subject = 'workspace 请求体'
  const body = readStrictObject(raw, subject, WORKSPACE_REQUEST_KEYS)
  if (!body.ok) return body
  const record = body.value
  const workspacePath = readStringField(record, 'workspacePath', subject, {
    minLength: 1,
    maxLength: MAX_WORKSPACE_PATH_LENGTH,
  })
  if (!workspacePath.ok) return workspacePath
  if (!workspacePath.value.startsWith('/')) return fail(`${subject}.workspacePath 必须以 / 开头`)
  const action =
    record['action'] === undefined ? undefined : readEnumField(record, 'action', subject, WORKSPACE_ACTIONS)
  if (action !== undefined && !action.ok) return action
  const resolvedAction: WorkspaceAction = action === undefined ? 'read' : action.value
  const hasAddresses = record['addresses'] !== undefined
  if (resolvedAction === 'read' || resolvedAction === 'reset') {
    if (hasAddresses) return fail(`${subject}.addresses 在 action=${resolvedAction} 时不允许出现`)
    return { ok: true, value: { workspacePath: workspacePath.value, action: resolvedAction } }
  }
  if (!hasAddresses) return fail(`${subject}.addresses 在 action=${resolvedAction} 时必需`)
  const addresses = readStringArrayField(record, 'addresses', subject, {
    minItems: 1,
    maxItems: MAX_ADDRESSES,
    itemMinLength: 1,
    itemMaxLength: ADDRESS_MAX_LENGTH,
  })
  if (!addresses.ok) return addresses
  return {
    ok: true,
    value: {
      workspacePath: workspacePath.value,
      action: resolvedAction,
      addresses: addresses.value,
    },
  }
}

/** 请求 parser 的统一签名。 */
export type RequestParser = (raw: unknown) => Parsed<
  PanelRequest | ToggleRequest | WorkspaceRequest
>

/**
 * 端点 → 请求 parser 的表。
 *
 * 派发层（宿主 `rpc.ts` / 客户端 `panel-client.ts`）不必自己 switch：漏一个端点会被
 * 类型检查抓住，也不会出现"某端点忘了校验"的静默路径。
 */
export const REQUEST_PARSERS: Readonly<Record<SessionToolToggleEndpoint, RequestParser>> = {
  panel: parsePanelRequest,
  toggle: parseToggleRequest,
  reset: parseResetRequest,
  workspace: parseWorkspaceRequest,
}

/* ────────────────────────── 响应 parser（4 个成功值） ────────────────────────── */

/** `ToolEntry` 的字段集（strict）。 */
const TOOL_ENTRY_KEYS = [
  'name',
  'shortName',
  'address',
  'disabled',
  'protected',
  'reserved',
  'description',
] as const

/** `ToolGroup` 的字段集（strict）。 */
const TOOL_GROUP_KEYS = ['kind', 'key', 'address', 'toolCount', 'disabledCount', 'disabled', 'tools'] as const

/** `StateView` 的字段集（strict）。 */
const STATE_VIEW_KEYS = ['disabled', 'snapshot', 'seeded', 'updatedAt', 'storeKind'] as const

/** `StatsView` 的字段集（strict）。 */
const STATS_VIEW_KEYS = ['visible', 'denied'] as const

/** `WorkspaceView` 的字段集（strict）。 */
const WORKSPACE_VIEW_KEYS = ['key', 'title', 'registered', 'disabled', 'path', 'readable', 'corrupt'] as const

/** `DefaultsEntry` 的字段集（strict；技能三字段只允许在 `skill:` 行上且 invocation 成对）。 */
const DEFAULTS_ENTRY_KEYS = [
  'address',
  'shortName',
  'description',
  'protected',
  'reserved',
  'modelInvocable',
  'userInvocable',
  'source',
] as const

/** `DefaultsGroup` 的字段集（strict；source/countsTokens 只允许在 mcp 组上）。 */
const DEFAULTS_GROUP_KEYS = ['kind', 'key', 'address', 'tools', 'source', 'countsTokens'] as const

/** `DefaultsUniverse` 的字段集（strict；后两键只由工作区宇宙产生，缺省 = 旧响应）。 */
const DEFAULTS_UNIVERSE_KEYS = [
  'layerReady',
  'skillsAvailable',
  'groups',
  'ungroupedMcp',
  'skillsComplete',
  'foreignProjectMcp',
] as const

/** `SkillView` 的字段集（strict）。 */
const SKILL_VIEW_KEYS = ['name', 'description', 'disabled', 'shadowed'] as const

/** `PanelSnapshot` 的字段集（strict；**不含** `parameters`）。 */
const PANEL_SNAPSHOT_KEYS = [
  'sessionId',
  'createdAt',
  'state',
  'groups',
  'protectedNames',
  'intentOnly',
  'stats',
  'notices',
  'skills',
] as const

/** `MutationApplied` 的字段集（strict）。 */
const MUTATION_APPLIED_KEYS = ['address', 'on', 'matched'] as const

/** `Mutation` 的字段集（strict）。 */
const MUTATION_KEYS = [
  'applied',
  'hiddenTools',
  'hiddenSkills',
  'visibleBefore',
  'visibleAfter',
  'kvRebuild',
  'notices',
] as const

/**
 * 校验一条工具条目。
 * @param value - 原始值。
 * @param subject - 字段路径前缀（已含分组与下标）。
 * @returns 条目，或不合契约的原因。
 */
function readToolEntry(value: unknown, subject: string): Parsed<ToolEntry> {
  const object = readStrictObject(value, subject, TOOL_ENTRY_KEYS)
  if (!object.ok) return object
  const record = object.value
  const name = readStringField(record, 'name', subject, { minLength: 1 })
  if (!name.ok) return name
  const shortName = readStringField(record, 'shortName', subject, { minLength: 1 })
  if (!shortName.ok) return shortName
  const address = readStringField(record, 'address', subject, { minLength: 1 })
  if (!address.ok) return address
  const disabled = readBooleanField(record, 'disabled', subject)
  if (!disabled.ok) return disabled
  const isProtected = readBooleanField(record, 'protected', subject)
  if (!isProtected.ok) return isProtected
  const reserved = readBooleanField(record, 'reserved', subject)
  if (!reserved.ok) return reserved
  const description = readOptionalStringField(record, 'description', subject, {
    maxLength: DESCRIPTION_MAX_LENGTH,
  })
  if (!description.ok) return description
  const entry: ToolEntry = {
    name: name.value,
    shortName: shortName.value,
    address: address.value,
    disabled: disabled.value,
    protected: isProtected.value,
    reserved: reserved.value,
    // 可选字段只在确实带了描述时出现：面板用 `description === undefined` 判断有无描述，
    // 伪造一个 `description: undefined` 的键会让 `Object.keys` / JSON 序列化多一项。
    ...(description.value === undefined ? {} : { description: description.value }),
  }
  return { ok: true, value: entry }
}

/**
 * 校验一个工具分组。
 * @param value - 原始值。
 * @param subject - 字段路径前缀（已含下标）。
 * @returns 分组，或不合契约的原因。
 */
function readToolGroup(value: unknown, subject: string): Parsed<ToolGroup> {
  const object = readStrictObject(value, subject, TOOL_GROUP_KEYS)
  if (!object.ok) return object
  const record = object.value
  const kind = readEnumField(record, 'kind', subject, TOOL_GROUP_KINDS)
  if (!kind.ok) return kind
  const key = readStringField(record, 'key', subject, { minLength: 1 })
  if (!key.ok) return key
  const address = readNullableStringField(record, 'address', subject)
  if (!address.ok) return address
  const toolCount = readCountField(record, 'toolCount', subject)
  if (!toolCount.ok) return toolCount
  const disabledCount = readCountField(record, 'disabledCount', subject)
  if (!disabledCount.ok) return disabledCount
  const disabled = readBooleanField(record, 'disabled', subject)
  if (!disabled.ok) return disabled
  const tools = readArrayField(record, 'tools', subject, readToolEntry)
  if (!tools.ok) return tools
  return {
    ok: true,
    value: {
      kind: kind.value,
      key: key.value,
      address: address.value,
      toolCount: toolCount.value,
      disabledCount: disabledCount.value,
      disabled: disabled.value,
      tools: tools.value,
    },
  }
}

/**
 * 校验会话状态视图。
 * @param value - 原始值。
 * @param subject - 字段路径前缀。
 * @returns 状态视图，或不合契约的原因。
 */
function readStateView(value: unknown, subject: string): Parsed<StateView> {
  const object = readStrictObject(value, subject, STATE_VIEW_KEYS)
  if (!object.ok) return object
  const record = object.value
  const disabled = readStringArrayField(record, 'disabled', subject)
  if (!disabled.ok) return disabled
  const snapshot = readStringArrayField(record, 'snapshot', subject)
  if (!snapshot.ok) return snapshot
  const seeded = readBooleanField(record, 'seeded', subject)
  if (!seeded.ok) return seeded
  const updatedAt = readCountField(record, 'updatedAt', subject)
  if (!updatedAt.ok) return updatedAt
  const storeKind = readEnumField(record, 'storeKind', subject, STORE_KINDS)
  if (!storeKind.ok) return storeKind
  return {
    ok: true,
    value: {
      disabled: disabled.value,
      snapshot: snapshot.value,
      seeded: seeded.value,
      updatedAt: updatedAt.value,
      storeKind: storeKind.value,
    },
  }
}

/**
 * 校验两计数。
 * @param value - 原始值。
 * @param subject - 字段路径前缀。
 * @returns 统计视图，或不合契约的原因。
 */
function readStatsView(value: unknown, subject: string): Parsed<StatsView> {
  const object = readStrictObject(value, subject, STATS_VIEW_KEYS)
  if (!object.ok) return object
  const record = object.value
  const visible = readCountField(record, 'visible', subject)
  if (!visible.ok) return visible
  const denied = readCountField(record, 'denied', subject)
  if (!denied.ok) return denied
  return {
    ok: true,
    value: {
      visible: visible.value,
      denied: denied.value,
    },
  }
}

/**
 * 校验一条技能行。
 * @param value - 原始值。
 * @param subject - 字段路径前缀（已含下标）。
 * @returns 技能行，或不合契约的原因。
 */
function readSkillView(value: unknown, subject: string): Parsed<SkillView> {
  const object = readStrictObject(value, subject, SKILL_VIEW_KEYS)
  if (!object.ok) return object
  const record = object.value
  const name = readStringField(record, 'name', subject, { minLength: 1 })
  if (!name.ok) return name
  // 描述允许为空串（已关且无缓存），但仍受与工具描述相同的截断上限约束。
  const description = readStringField(record, 'description', subject, {
    maxLength: DESCRIPTION_MAX_LENGTH,
  })
  if (!description.ok) return description
  const disabled = readBooleanField(record, 'disabled', subject)
  if (!disabled.ok) return disabled
  const shadowed = readBooleanField(record, 'shadowed', subject)
  if (!shadowed.ok) return shadowed
  return {
    ok: true,
    value: {
      name: name.value,
      description: description.value,
      disabled: disabled.value,
      shadowed: shadowed.value,
    },
  }
}

/**
 * 校验工作区档视图（面板与 `workspace` 端点共用）。
 * @param value - 原始值。
 * @param subject - 字段路径前缀。
 * @returns 工作区视图，或不合契约的原因。
 */
function readWorkspaceView(value: unknown, subject: string): Parsed<WorkspaceView> {
  const object = readStrictObject(value, subject, WORKSPACE_VIEW_KEYS)
  if (!object.ok) return object
  const record = object.value
  const key = readStringField(record, 'key', subject, { minLength: 1 })
  if (!key.ok) return key
  const title = readOptionalStringField(record, 'title', subject)
  if (!title.ok) return title
  const registered = readBooleanField(record, 'registered', subject)
  if (!registered.ok) return registered
  const disabled = readStringArrayField(record, 'disabled', subject)
  if (!disabled.ok) return disabled
  const path = readStringField(record, 'path', subject, { minLength: 1 })
  if (!path.ok) return path
  const readable = readBooleanField(record, 'readable', subject)
  if (!readable.ok) return readable
  const corrupt = readBooleanField(record, 'corrupt', subject)
  if (!corrupt.ok) return corrupt
  return {
    ok: true,
    value: {
      key: key.value,
      ...(title.value === undefined ? {} : { title: title.value }),
      registered: registered.value,
      disabled: disabled.value,
      path: path.value,
      readable: readable.value,
      corrupt: corrupt.value,
    },
  }
}

/**
 * 校验可空的工作区视图（`null` = cwd 无法归属 / 无 registry）。
 * @param value - 原始值。
 * @param subject - 字段路径前缀。
 * @returns 工作区视图、`null`，或不合契约的原因。
 */
function readNullableWorkspaceView(value: unknown, subject: string): Parsed<WorkspaceView | null> {
  if (value === null) return { ok: true, value: null }
  return readWorkspaceView(value, subject)
}

/**
 * 校验默认档宇宙里的一条可切换条目。
 * @param value - 原始值。
 * @param subject - 字段路径前缀（已含分组与下标）。
 * @returns 条目，或不合契约的原因。
 */
function readDefaultsEntry(value: unknown, subject: string): Parsed<DefaultsEntry> {
  const object = readStrictObject(value, subject, DEFAULTS_ENTRY_KEYS)
  if (!object.ok) return object
  const record = object.value
  const address = readStringField(record, 'address', subject, { minLength: 1 })
  if (!address.ok) return address
  const shortName = readStringField(record, 'shortName', subject, { minLength: 1 })
  if (!shortName.ok) return shortName
  // 可选字段缺省不补键：界面用 `description === undefined` 判断有无描述（与 `readToolEntry` 同款）。
  const description = readOptionalStringField(record, 'description', subject, {
    maxLength: DESCRIPTION_MAX_LENGTH,
  })
  if (!description.ok) return description
  const isProtected = readBooleanField(record, 'protected', subject)
  if (!isProtected.ok) return isProtected
  const reserved = readBooleanField(record, 'reserved', subject)
  if (!reserved.ok) return reserved
  const modelInvocable = readOptionalBooleanField(record, 'modelInvocable', subject)
  if (!modelInvocable.ok) return modelInvocable
  const userInvocable = readOptionalBooleanField(record, 'userInvocable', subject)
  if (!userInvocable.ok) return userInvocable
  const source = readOptionalStringField(record, 'source', subject, { minLength: 1 })
  if (!source.ok) return source
  // invocation 对：`modelInvocable` / `userInvocable` 必须同给同缺（只给一个 → 拒绝）。
  const hasPair = modelInvocable.value !== undefined && userInvocable.value !== undefined
  const hasAnyInvocation = modelInvocable.value !== undefined || userInvocable.value !== undefined
  if (hasAnyInvocation && !hasPair) {
    return fail(`${subject} 的 modelInvocable 与 userInvocable 必须成对出现`)
  }
  // 技能字段只允许在 `skill:` 行上：MCP / 内置行带了即越界（即使是一对合法的 invocation）。
  if (hasAnyInvocation && !address.value.startsWith('skill:')) {
    return fail(`${subject} 只有 skill: 地址允许携带技能字段`)
  }
  // `source` 与 invocation 对同生：出现 `source` 时缺对 → 拒绝。
  if (source.value !== undefined && !hasPair) {
    return fail(`${subject} 出现 source 时 modelInvocable 与 userInvocable 必须同时在场`)
  }
  return {
    ok: true,
    value: {
      address: address.value,
      shortName: shortName.value,
      ...(description.value === undefined ? {} : { description: description.value }),
      protected: isProtected.value,
      reserved: reserved.value,
      ...(hasPair
        ? { modelInvocable: modelInvocable.value, userInvocable: userInvocable.value }
        : {}),
      ...(source.value === undefined ? {} : { source: source.value }),
    },
  }
}

/**
 * 校验一个默认档分组。
 * @param value - 原始值。
 * @param subject - 字段路径前缀（已含下标）。
 * @returns 分组，或不合契约的原因。
 */
function readDefaultsGroup(value: unknown, subject: string): Parsed<DefaultsGroup> {
  const object = readStrictObject(value, subject, DEFAULTS_GROUP_KEYS)
  if (!object.ok) return object
  const record = object.value
  const kind = readEnumField(record, 'kind', subject, TOOL_GROUP_KINDS)
  if (!kind.ok) return kind
  const key = readStringField(record, 'key', subject, { minLength: 1 })
  if (!key.ok) return key
  const address = readNullableStringField(record, 'address', subject)
  if (!address.ok) return address
  const tools = readArrayField(record, 'tools', subject, readDefaultsEntry)
  if (!tools.ok) return tools
  // R15 组级来源与 token 标注：只允许 `kind: 'mcp'` 组携带（技能组有逐行 invocation 标注、
  // 内置组无来源分野——带了即越界，与「技能字段只允许 `skill:` 行」同一 fail-closed 纪律）。
  const source = readOptionalEnumField(record, 'source', subject, GROUP_SOURCES)
  if (!source.ok) return source
  const countsTokens = readOptionalBooleanField(record, 'countsTokens', subject)
  if (!countsTokens.ok) return countsTokens
  const hasGroupMeta = source.value !== undefined || countsTokens.value !== undefined
  if (hasGroupMeta && kind.value !== 'mcp') {
    return fail(`${subject} 的 source/countsTokens 只允许出现在 mcp 分组上`)
  }
  return {
    ok: true,
    value: {
      kind: kind.value,
      key: key.value,
      address: address.value,
      tools: tools.value,
      ...(source.value === undefined ? {} : { source: source.value }),
      ...(countsTokens.value === undefined ? {} : { countsTokens: countsTokens.value }),
    },
  }
}

/**
 * 校验可空的默认档宇宙（`null` = `{workspacePath}` 寻址，没有会话视角）。
 * @param value - 原始值。
 * @param subject - 字段路径前缀。
 * @returns 宇宙、`null`，或不合契约的原因。
 */
function readNullableDefaultsUniverse(value: unknown, subject: string): Parsed<DefaultsUniverse | null> {
  if (value === null) return { ok: true, value: null }
  const object = readStrictObject(value, subject, DEFAULTS_UNIVERSE_KEYS)
  if (!object.ok) return object
  const record = object.value
  const layerReady = readBooleanField(record, 'layerReady', subject)
  if (!layerReady.ok) return layerReady
  const skillsAvailable = readBooleanField(record, 'skillsAvailable', subject)
  if (!skillsAvailable.ok) return skillsAvailable
  const groups = readArrayField(record, 'groups', subject, readDefaultsGroup)
  if (!groups.ok) return groups
  const ungroupedMcp = readOptionalCountField(record, 'ungroupedMcp', subject)
  if (!ungroupedMcp.ok) return ungroupedMcp
  const skillsComplete = readOptionalBooleanField(record, 'skillsComplete', subject)
  if (!skillsComplete.ok) return skillsComplete
  const foreignProjectMcp = readOptionalCountField(record, 'foreignProjectMcp', subject)
  if (!foreignProjectMcp.ok) return foreignProjectMcp
  return {
    ok: true,
    value: {
      layerReady: layerReady.value,
      skillsAvailable: skillsAvailable.value,
      groups: groups.value,
      // 工作区宇宙专属字段缺省不补键：缺省语义由类型注释约定（`ungroupedMcp` = 0、
      // `skillsComplete` = 未观测 / 旧响应、`foreignProjectMcp` = 0），伪造 `undefined`
      // 键会让 JSON 多一项。
      ...(ungroupedMcp.value === undefined ? {} : { ungroupedMcp: ungroupedMcp.value }),
      ...(skillsComplete.value === undefined ? {} : { skillsComplete: skillsComplete.value }),
      ...(foreignProjectMcp.value === undefined ? {} : { foreignProjectMcp: foreignProjectMcp.value }),
    },
  }
}

/**
 * 校验面板快照（`panel` 的成功值，也是 `toggle` / `reset` 成功值里的 `snapshot`）。
 *
 * 快照**不携带**工具入参 schema（`parameters`）：面板不展示入参，携带它会让响应体积
 * 随工具数线性膨胀。该字段因此落在 strict 的"未知字段"一侧，出现即拒绝。
 * @param value - 原始值。
 * @param subject - 字段路径前缀。
 * @returns 快照，或不合契约的原因。
 */
function readPanelSnapshot(value: unknown, subject: string): Parsed<PanelSnapshot> {
  const object = readStrictObject(value, subject, PANEL_SNAPSHOT_KEYS)
  if (!object.ok) return object
  const record = object.value
  const sessionId = readStringField(record, 'sessionId', subject, { minLength: 1 })
  if (!sessionId.ok) return sessionId
  const createdAt = readCountField(record, 'createdAt', subject)
  if (!createdAt.ok) return createdAt
  const state = readStateView(record['state'], `${subject}.state`)
  if (!state.ok) return state
  const groups = readArrayField(record, 'groups', subject, readToolGroup)
  if (!groups.ok) return groups
  const protectedNames = readStringArrayField(record, 'protectedNames', subject)
  if (!protectedNames.ok) return protectedNames
  const intentOnly = readStringArrayField(record, 'intentOnly', subject)
  if (!intentOnly.ok) return intentOnly
  const stats = readStatsView(record['stats'], `${subject}.stats`)
  if (!stats.ok) return stats
  const notices = readEnumArrayField(record, 'notices', subject, NOTICE_CODES)
  if (!notices.ok) return notices
  const skills = readArrayField(record, 'skills', subject, readSkillView)
  if (!skills.ok) return skills
  return {
    ok: true,
    value: {
      sessionId: sessionId.value,
      createdAt: createdAt.value,
      state: state.value,
      groups: groups.value,
      protectedNames: protectedNames.value,
      intentOnly: intentOnly.value,
      stats: stats.value,
      notices: notices.value,
      skills: skills.value,
    },
  }
}

/**
 * 校验一条逐地址回执。
 * @param value - 原始值。
 * @param subject - 字段路径前缀（已含下标）。
 * @returns 回执，或不合契约的原因。
 */
function readMutationApplied(value: unknown, subject: string): Parsed<MutationApplied> {
  const object = readStrictObject(value, subject, MUTATION_APPLIED_KEYS)
  if (!object.ok) return object
  const record = object.value
  const address = readStringField(record, 'address', subject, { minLength: 1 })
  if (!address.ok) return address
  const on = readBooleanField(record, 'on', subject)
  if (!on.ok) return on
  const matched = readCountField(record, 'matched', subject)
  if (!matched.ok) return matched
  return { ok: true, value: { address: address.value, on: on.value, matched: matched.value } }
}

/**
 * 校验变更回执。
 * @param value - 原始值。
 * @param subject - 字段路径前缀。
 * @returns 回执，或不合契约的原因。
 */
function readMutation(value: unknown, subject: string): Parsed<Mutation> {
  const object = readStrictObject(value, subject, MUTATION_KEYS)
  if (!object.ok) return object
  const record = object.value
  const applied = readArrayField(record, 'applied', subject, readMutationApplied)
  if (!applied.ok) return applied
  const hiddenTools = readIntField(record, 'hiddenTools', subject)
  if (!hiddenTools.ok) return hiddenTools
  const hiddenSkills = readIntField(record, 'hiddenSkills', subject)
  if (!hiddenSkills.ok) return hiddenSkills
  const visibleBefore = readCountField(record, 'visibleBefore', subject)
  if (!visibleBefore.ok) return visibleBefore
  const visibleAfter = readCountField(record, 'visibleAfter', subject)
  if (!visibleAfter.ok) return visibleAfter
  const kvRebuild = readBooleanField(record, 'kvRebuild', subject)
  if (!kvRebuild.ok) return kvRebuild
  const notices = readEnumArrayField(record, 'notices', subject, NOTICE_CODES)
  if (!notices.ok) return notices
  return {
    ok: true,
    value: {
      applied: applied.value,
      hiddenTools: hiddenTools.value,
      hiddenSkills: hiddenSkills.value,
      visibleBefore: visibleBefore.value,
      visibleAfter: visibleAfter.value,
      kvRebuild: kvRebuild.value,
      notices: notices.value,
    },
  }
}

/**
 * 校验 `toggle` / `reset` 共用的成功值（`snapshot` + `mutation`）。
 * @param value - 原始值。
 * @param subject - 字段路径前缀。
 * @returns 成功值，或不合契约的原因。
 */
function readToggleValue(value: unknown, subject: string): Parsed<ToggleValue> {
  const object = readStrictObject(value, subject, ['snapshot', 'mutation'] as const)
  if (!object.ok) return object
  const snapshot = readPanelSnapshot(object.value['snapshot'], `${subject}.snapshot`)
  if (!snapshot.ok) return snapshot
  const mutation = readMutation(object.value['mutation'], `${subject}.mutation`)
  if (!mutation.ok) return mutation
  return { ok: true, value: { snapshot: snapshot.value, mutation: mutation.value } }
}

/**
 * 校验 `panel` 端点的成功值。
 * @param raw - 端点返回的原始值。
 * @returns 面板快照，或不合契约的原因。
 */
export function parsePanelSnapshot(raw: unknown): Parsed<PanelSnapshot> {
  return readPanelSnapshot(raw, 'panel 快照')
}

/**
 * 校验 `toggle` 端点的成功值（新快照 + 变更回执）。
 * @param raw - 端点返回的原始值。
 * @returns 成功值，或不合契约的原因。
 */
export function parseToggleValue(raw: unknown): Parsed<ToggleValue> {
  return readToggleValue(raw, 'toggle 响应')
}

/**
 * 校验 `reset` 端点的成功值。
 *
 * 与 `toggle` 同形（D20），只是 `applied` 的语义是"被移除的关闭项"（`on` 恒为 `true`）。
 * @param raw - 端点返回的原始值。
 * @returns 成功值，或不合契约的原因。
 */
export function parseResetValue(raw: unknown): Parsed<ResetValue> {
  return readToggleValue(raw, 'reset 响应')
}

/**
 * 校验 `workspace` 端点的成功值（目标工作区视图 + 实际写入项 + 目标工具宇宙）。
 *
 * `workspace` 为 `null` 是合法读数（路径未登记 / 目标无法归属）：面板按空档展示，
 * 不把它当响应损坏。`universe` 同理由 {@link readNullableDefaultsUniverse} 处理，
 * 但**键本身必填**（`null` 合法）：旧响应一律拒绝，沿 D-14 的版本漂移报警。
 * @param raw - 端点返回的原始值。
 * @returns 成功值，或不合契约的原因。
 */
export function parseWorkspaceValue(raw: unknown): Parsed<WorkspaceValue> {
  const subject = 'workspace 响应'
  const object = readStrictObject(raw, subject, ['workspace', 'changed', 'universe'] as const)
  if (!object.ok) return object
  const workspace = readNullableWorkspaceView(object.value['workspace'], `${subject}.workspace`)
  if (!workspace.ok) return workspace
  const changed = readStringArrayField(object.value, 'changed', subject, { itemMinLength: 1 })
  if (!changed.ok) return changed
  const universe = readNullableDefaultsUniverse(object.value['universe'], `${subject}.universe`)
  if (!universe.ok) return universe
  return {
    ok: true,
    value: {
      workspace: workspace.value,
      changed: changed.value,
      universe: universe.value,
    },
  }
}

/* ────────────────────────── 失败细节 parser ────────────────────────── */

/** 一个细节对象里是否**恰好**只有这些字段（多字段 = 不是已知形状）。 */
function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record)
  return keys.length === expected.length && expected.every((key) => keys.includes(key))
}

/**
 * 把信封里的 `details`（`Record<string, unknown>`）归一成已知形状。
 *
 * `details` 只作二级灰字与文案占位符（`{address}` / `{names}`，见 `code-design` §3.5），
 * **不参与本地化**。因此这里对"读不出来"一律降级为 `undefined`（调用方退回兜底文案），
 * 从不抛错；对已知形状则要求**恰好**是那张表里的字段（多字段说明两端契约不同版）。
 * @param details - 失败信封里的原始 `details`。
 * @returns 已知的细节形状，或 `undefined`。
 */
export function parseFailureDetails(details: unknown): FailureDetails | undefined {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return undefined
  const record = details as Record<string, unknown>
  if (hasExactKeys(record, ['issues']) && typeof record['issues'] === 'string') {
    return { issues: record['issues'] }
  }
  if (
    hasExactKeys(record, ['address', 'parseCode']) &&
    typeof record['address'] === 'string' &&
    typeof record['parseCode'] === 'string'
  ) {
    return { address: record['address'], parseCode: record['parseCode'] }
  }
  if (hasExactKeys(record, ['names']) && Array.isArray(record['names'])) {
    const names: string[] = []
    for (const name of record['names'] as unknown[]) {
      if (typeof name !== 'string') return undefined
      names.push(name)
    }
    return { names }
  }
  if (hasExactKeys(record, ['sessionId']) && typeof record['sessionId'] === 'string') {
    return { sessionId: record['sessionId'] }
  }
  if (
    hasExactKeys(record, ['path', 'reason']) &&
    typeof record['path'] === 'string' &&
    typeof record['reason'] === 'string'
  ) {
    return { path: record['path'], reason: record['reason'] }
  }
  if (hasExactKeys(record, ['subject']) && typeof record['subject'] === 'string') {
    return { subject: record['subject'] }
  }
  return undefined
}
