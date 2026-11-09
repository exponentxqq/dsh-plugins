/**
 * 面板快照构建器：把宿主侧**已经读到**的事实合成一份可直接渲染的快照。
 *
 * 输入全部是读数、输出是一份纯数据（附录 §2.2 的 `PanelSnapshotSchema` 是其形状权威）：
 * 本模块不做 IO、不读时钟、不碰任何宿主服务，也不 import Cordis——因此面板的每一条展示
 * 规则都能在单测里用一份入参直接断言，不需要拉起宿主。读取动作（`ctx.tools.schemas()`、
 * 层的 `visibleNames()`、默认档文件）由调用方（9.1 的控制内核）准备好，构建器只负责推导。
 *
 * 推导链写死（附录 §2.5，**会话口径**）：
 *
 * 1. 候选 = **两读并集 `scoped ∪ carried`**（与掩码引擎同一份语义，见 `mask.ts`）：`scoped`
 *    是本会话该 agent 视角当前可见的名字，也是「可关对象」的唯一来源；`carried` 是本插件
 *    上一轮已生效的掩码（`layer.snapshot().deny`），保证已关条目不因第二读缩小而从清单里
 *    消失。宿主全局层（其它工作区 / 其它 agent 注册的名字）**不参与本模块的任何推导**；
 * 2. 分组：`mcp__<serverName>__<suffix>` 按**首个** `__` 切分（`toolServerOf` 同一条规则），
 *    其余名字里 `skill` 单列「技能」组、剩下的进「内置工具」组；
 * 3. 每条工具三个标记：`disabled`（命中关闭集）/ `protected`（生效保护名单）/
 *    `reserved`（注册表保留名）；
 * 4. `stats` 两计数、`intentOnly`、`notices` 汇总；
 * 5. 两个顶层视图：`skills`（逐技能行，来自 `inputs.skills` 的技能分面读数）与
 *    `workspace`（本会话所属工作区的默认档视图；无法归属时为 `null`）。
 *
 * **与 `/inventory` 的两处刻意差异**（D-9：只在文档与提案的预期管理段落写明，面板**不**加
 * 「本清单只含本会话有效工具」之类的提示行）：两者读的是同一份会话视角（`/inventory` 读
 * `ctx.tools.schemas(agent)`，面板的 `scoped` 即同一表达式），但面板清单仍比 `/inventory`
 * 多两类行——
 *
 * 1. **已关条目仍在清单里**：`/inventory` 只列当前真的可用的东西；面板为了能把关闭项打开，
 *    必须继续列出被本插件自己掩掉的名字（`carried` 保底），因此条目数可能多于 `/inventory`；
 * 2. **多出 `tool:` / `tool:skill` 行**：`/inventory` 只报会话 MCP 服务器与技能；面板还管
 *    内置工具（`tool:<name>` 的整档行）与技能整档（`tool:skill`），这两类行在 `/inventory`
 *    里没有对应条目。
 *
 * 关闭集（`state.disabled`）走**全地址归一**：逐条 `parseAddress` 取规范形文本，不再只取
 * `planMask.matched` 的键。工具掩码不认识技能地址（`skill:<name>` 不进 `deny`、也不在
 * `matched` 里留键，见 `mask.ts`），因此旧口径会让技能关闭项从面板的关闭集里凭空消失。
 * `intentOnly` 因此由两段并成：工具地址在 `planMask.matched` 里命中 0 的键 ∪ 技能地址
 * 在当前技能分面读数里**无安装**（既不在 `visible` 也不在 `shadowed`）的地址。
 *
 * 技能行与工具分组是**互补**关系：`groups` 里的 `skill` 整档行（`kind:'skill'`）保持原样，
 * 逐技能行只出现在顶层 `skills`。技能名不是工具注册名，技能行不能混进 `ToolGroup`，否则该
 * 行只能恒显示「未关闭」，或者迫使技能名进入 `restrict` 的 deny（对未知名字会抛错）。
 *
 * 两条刻意的不变量：
 *
 * - **不携带 `parameters`**：工具 schema 的入参描述可能很大（一台 MCP 服务器几十个工具），
 *   面板只展示名字与描述首 160 字符；入参属于「看得到工具就能自己查」的信息，进快照只会
 *   撑大每次往返的载荷。
 * - **分组只用于展示**：开关语义打的是注册名（`matchesToolName`），分组切错（serverName
 *   本身含 `__` 时首个 `__` 的拆法有歧义，见 §6.1 A12）不会让地址匹配变错。这里**不**做
 *   「`planMask.matched` 之和 vs 组内工具数」的 warn 自检（附录 §2.5）：`PanelInputs`
 *   没有诊断出口，纯函数里打日志会引入 IO；该自检只能由装配层在同一份读数上补一条 warn。
 *
 * @module dsh-plugin-session-tool-toggle/host/panel
 */

import type { DefaultsEntry, DefaultsGroup, DefaultsUniverse } from '../contract.ts'
import { PROTECTED_BASELINE, formatAddress, parseAddress } from './address.ts'
import type { SwitchAddress } from './address.ts'
import { planMask } from './mask.ts'
import type {
  NoticeCode,
  PanelInputs,
  SkillLayerSnapshot,
  StoreKind,
  VisibleToolSchema,
  WorkspacePanelInputs,
} from './types.ts'

/** 描述截断上限（字符）：schema 的 `description` 是 `max(160)`，两处必须是同一个数。 */
export const DESCRIPTION_MAX_LENGTH = 160

/** MCP public name 的前缀：`mcp__<serverName>__<suffix>`。 */
const MCP_PUBLIC_PREFIX = 'mcp__'

/** public name 里 serverName / suffix 的分隔符（与 `address.ts` 的命名契约同一条）。 */
const MCP_PUBLIC_SEPARATOR = '__'

/** 技能工具的注册名：整档只有它一个，单独成组（组地址 `tool:skill`）。 */
const SKILL_NAME = 'skill'

/** 内置工具分组的键；该组不可整组关，所以 `address` 恒为 null。 */
const BUILTIN_GROUP_KEY = 'builtin'

/**
 * 提示码的稳定输出顺序（与 `NoticeCodeSchema` 的枚举顺序一致）。
 *
 * 输出顺序只由这份常量决定，与入参 `notices` 的书写顺序无关：同一组提示码在两个窗口里
 * 必须渲染成同一个顺序，否则「刷新一下提示行换位」会被当成状态变化。
 */
const NOTICE_ORDER: readonly NoticeCode[] = [
  'persistence-degraded',
  'defaults-corrupt',
  'session-subagent',
  'skills-unavailable',
  'skill-shadow-failed',
]

/**
 * 判保留名用的空保护名单。
 *
 * 只问「是不是注册表保留名」：`parseAddress` 的拒绝顺序是「保留名 → 保护名单」，传空集
 * 就不会把保护名误判成保留名。
 */
const NO_PROTECTED_NAMES: ReadonlySet<string> = new Set()

/**
 * 关闭集归一用的保护名单：只用硬编码基线 {@link PROTECTED_BASELINE}。
 *
 * 与 `mask.ts` 的 `PROTECTED_NAMES` 是同一份名单：生效名单只在写入路径（`state.ts` 的
 * `parseDisabledTexts`）过滤，面板是读路径的最后一道容忍。用基线而不是
 * `inputs.protectedNames`，可以保证「面板展示的关闭集」与「掩码实际解析的地址」在同一份
 * 名单上收口——配置追加的保护项若漏进一条坏记录，两边都按普通开关处理，不会一边显示
 * 一边不生效。常量只在 `address.ts` 定义一份，这里不复制。
 */
const TOLERATED_PROTECTED_NAMES: ReadonlySet<string> = new Set(PROTECTED_BASELINE)

/** 空名字集合（不可变，避免每次重建）。 */
const NO_NAMES: ReadonlySet<string> = new Set()

/**
 * 一条工具条目（`ToolEntrySchema` 的宿主侧形状，逐字段同名）。
 *
 * 宿主只给**事实**与稳定码，展示文案（含「受保护」「不可关闭」这类徽标）由 client 用
 * `t()` 组合——同一份快照在 zh / en 两个界面下都能直接渲染。
 */
export interface ToolEntry {
  /** 注册名（MCP 是 public name `mcp__<serverName>__<suffix>`）。 */
  readonly name: string
  /** 展示用短名（MCP 为 public 后缀；skill 与内置工具就是注册名）。 */
  readonly shortName: string
  /** 该条目自己的规范形地址（`mcp:<server>::<suffix>` / `tool:<name>`）。 */
  readonly address: string
  /** 命中当前关闭集（含整组关闭带下来的命中）。 */
  readonly disabled: boolean
  /** 在生效保护名单内：面板据此置灰，宿主解析期也会拒关。 */
  readonly protected: boolean
  /** 注册表保留名（如 `run_code`）：`restrict` 会拒绝，永远不可关。 */
  readonly reserved: boolean
  /** 描述首 160 字符（已截断）；缺省表示无描述。**绝不**携带 `parameters`。 */
  readonly description?: string
}

/** 一个工具分组（`ToolGroupSchema` 的宿主侧形状）。 */
export interface ToolGroup {
  /** 来源：MCP 服务器 / 技能整档 / 内置工具。 */
  readonly kind: 'mcp' | 'skill' | 'builtin'
  /** 分组键：MCP = serverName；skill = `skill`；builtin = `builtin`。 */
  readonly key: string
  /** 整组地址；builtin 分组不可整组关 → null。 */
  readonly address: string | null
  /** 组内工具数。 */
  readonly toolCount: number
  /** 组内被关闭的工具数。 */
  readonly disabledCount: number
  /** 整组层面的关闭状态（`address !== null` 且该组地址在关闭集里）。 */
  readonly disabled: boolean
  /** 组内工具（按注册名升序）。 */
  readonly tools: readonly ToolEntry[]
}

/** 面板的一条技能行（`SkillViewSchema` 的宿主侧形状）。 */
export interface SkillView {
  /** kebab-case 技能名（= `skill:<name>` 的 `<name>`）。 */
  readonly name: string
  /** 描述首 160 字符（已截断）；无缓存时为空串（已关且分面读数里没有它）。 */
  readonly description: string
  /** 在某条 `skill:<name>` 关闭地址里（**意图**）。 */
  readonly disabled: boolean
  /** 本会话已注册影子 stub（**实际生效**；与 `disabled` 构成两态区分）。 */
  readonly shadowed: boolean
}

/** 本会话所属工作区的默认档视图（`WorkspaceViewSchema` 的宿主侧形状）。 */
export interface WorkspaceView {
  /** 工作区键（规范绝对路径）。 */
  readonly key: string
  /** 显示标题（未登记时缺省）。 */
  readonly title?: string
  /** 是否由 `workspaceRegistry` 登记。 */
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

/** 会话状态视图（`StateViewSchema` 的宿主侧形状）。 */
export interface StateView {
  /** 已排序去重的规范形关闭集（不可解析的条目已被丢弃）。 */
  readonly disabled: readonly string[]
  /** 创建时从默认档拍下的快照（`/tools reset` 回到这里）。 */
  readonly snapshot: readonly string[]
  /** 是否已由一条日志记录建立。 */
  readonly seeded: boolean
  /** 最近一次写入的 epoch ms（仅诊断用）。 */
  readonly updatedAt: number
  /** 持久化通道实际形态（降级可观测）。 */
  readonly storeKind: StoreKind
}

/** 默认档视图（`DefaultsViewSchema` 的宿主侧形状）。 */
export interface DefaultsView {
  /** 文件版本。 */
  readonly version: 1
  /** 默认关闭集（文件原样，已由默认档读路径归一）。 */
  readonly disabled: readonly string[]
  /** 绝对路径（面板展示，便于用户手编）。 */
  readonly path: string
  /** 文件可读（false = 不存在，按空档处理）。 */
  readonly readable: boolean
  /** 文件存在但损坏 / 半写（已降级空档）。 */
  readonly corrupt: boolean
}

/** 统计两计数（`PanelSnapshotSchema.stats` 的宿主侧形状）。 */
export interface Stats {
  /** 候选（`scoped ∪ carried` 去重）里掩码后仍可见的名字数（= 候选 − deny）。 */
  readonly visible: number
  /** 当前 deny 名字数（= 掩码实际生效量）。 */
  readonly denied: number
}

/**
 * 面板提示码。
 *
 * 与 `types.ts` 的 {@link NoticeCode} 是同一个类型：附录 §2.2 的形状权威把 `notices` 定为
 * **稳定码数组**（`z.array(NoticeCodeSchema)`），文案与补充说明由 client 用 `t()` 组合，
 * 因此这里**不**引入 `detail` 字段——多一个伴随字段只会让线上形状与契约 parser 漂移。
 */
export type Notice = NoticeCode

/** 面板快照（`PanelSnapshotSchema` 的宿主侧形状；9.4 负责映射到契约 parser）。 */
export interface PanelSnapshot {
  /** 目标会话 id。 */
  readonly sessionId: string
  /** 会话创建时间（epoch ms），面板用它讲「快照来源」。 */
  readonly createdAt: number
  /** 本会话状态视图。 */
  readonly state: StateView
  /** 分组清单（MCP 组按 serverName 升序，随后 skill、builtin）。 */
  readonly groups: readonly ToolGroup[]
  /** 生效保护名单（已排序）。 */
  readonly protectedNames: readonly string[]
  /** 用户级默认档视图。 */
  readonly defaults: DefaultsView
  /**
   * 关闭集里当前匹配不到的地址（「意图已记录、暂无匹配」）。
   *
   * 两段并集：工具地址在掩码计划里命中 0 个注册名 ∪ 技能地址在当前技能分面读数里
   * **无安装**（既不在 `visible` 也不在 `shadowed`）。
   */
  readonly intentOnly: readonly string[]
  /** 统计两计数。 */
  readonly stats: Stats
  /** 降级 / 提示码（已去重、按固定顺序）。 */
  readonly notices: readonly Notice[]
  /** 技能行（按名字升序；只含模型可调用技能 ∪ 当前已遮蔽名字）。 */
  readonly skills: readonly SkillView[]
  /** 本会话所属工作区的默认档视图；`null` = cwd 无法归属 / 无 registry。 */
  readonly workspace: WorkspaceView | null
}

/**
 * 构建一份面板快照。
 *
 * 纯函数：只读 `inputs`，不修改其中任何数组 / Map，同一输入两次调用返回深相等的两份结果。
 * 不抛错：损坏的关闭集条目由 {@link planMask} 静默跳过，未知 serverName / 工具名只是不进
 * 分组或不命中（C10 宽容），空输入得到一份全空的快照。
 * @param inputs - 宿主侧已读到的事实（两读、状态、默认档、保护名单、描述）。
 * @returns 面板快照。
 */
export function buildPanelSnapshot(inputs: PanelInputs): PanelSnapshot {
  // 两读并集（会话口径）→ 候选名。排序在分组之前做：各分组桶的插入顺序因此天然按注册名
  // 升序，不需要对每组再排一次。`carried` 只做保底：它不是「可关对象」的新来源，而是让
  // 上一轮已生效的关闭项继续留在清单里（否则用户再也点不开自己关掉的工具）。
  const candidates = sortedTexts([...inputs.scoped, ...inputs.carried])

  // 与掩码引擎同一份读数：deny / matched 都由它算，面板不与实际掩码各算一遍。
  const plan = planMask({
    scoped: inputs.scoped,
    carried: inputs.carried,
    disabled: inputs.state.disabled,
  })

  // 关闭集：**全地址归一**（逐条 `parseAddress` 取规范形），不再只取 `planMask.matched`
  // 的键。工具掩码刻意不认识技能地址（`skill:<name>` 不进 deny、也不在 matched 里留键，
  // 见 `mask.ts`），只读 matched 会让用户关掉的技能从面板关闭集里消失。
  const closed = closedAddressesOf(inputs.state.disabled)
  const closedTexts = closed.map((entry) => entry.text)
  const closedSkillNames = new Set<string>()
  for (const entry of closed) {
    if (entry.address.kind === 'skill') closedSkillNames.add(entry.address.name)
  }

  // `intentOnly` 三分：工具地址 0 命中 ∪ 技能地址无安装。工具段以 `planMask.matched` 为准
  // （0 也保留键，且与掩码实际解析的地址同一份口径）；技能段用当前技能分面读数判「安装」，
  // 已注册影子 stub 与模型可调用都算安装，只有无安装才是纯意图。
  const installedSkillNames = installedSkillNamesOf(inputs.skills)
  const toolIntentOnly = Array.from(plan.matched)
    .filter(([, hits]) => hits === 0)
    .map(([text]) => text)
  const skillIntentOnly = closed.flatMap((entry) => {
    if (entry.address.kind !== 'skill') return []
    return installedSkillNames.has(entry.address.name) ? [] : [entry.text]
  })
  const intentOnly = sortedTexts([...toolIntentOnly, ...skillIntentOnly])

  // deny 集合：条目的 `disabled` 与 `stats` 的两计数共用这一份，避免「清单已掩、计数未掩」
  // 这类分叉。`planMask.deny` 恒是候选的子集（只收命中过的候选名）。
  const deny = new Set(plan.deny)
  const context: EntryContext = {
    deny,
    protectedNames: new Set(inputs.protectedNames),
    descriptions: inputs.descriptions,
  }

  return {
    sessionId: inputs.sessionId,
    createdAt: inputs.createdAt,
    state: {
      disabled: closedTexts,
      snapshot: [...inputs.state.snapshot],
      seeded: inputs.state.seeded,
      updatedAt: inputs.state.updatedAt,
      storeKind: inputs.storeKind,
    },
    groups: buildGroups(candidates, context, new Set(closedTexts)),
    protectedNames: sortedTexts(inputs.protectedNames),
    defaults: {
      version: inputs.defaults.version,
      disabled: [...inputs.defaults.disabled],
      path: inputs.defaultsPath,
      readable: inputs.defaultsReadable,
      corrupt: inputs.defaultsCorrupt,
    },
    intentOnly,
    stats: {
      visible: candidates.filter((name) => !deny.has(name)).length,
      denied: plan.deny.length,
    },
    notices: noticesOf(inputs),
    skills: skillViewsOf(inputs.skills, closedSkillNames),
    workspace: workspaceViewOf(inputs.workspace),
  }
}

/* ─────────────────── 默认档分组界面的工具宇宙（目标无关） ─────────────────── */

/**
 * `buildDefaultsUniverse` 的输入：全部是宿主侧已读到的会话事实。
 *
 * 与 {@link PanelInputs} 的差别只在「读了什么」：宇宙不关心关闭集、默认档与工作区归属
 * ——它只回答「本会话有哪些地址可以被默认档开关打中」，因此不需要状态读数。
 */
export interface DefaultsUniverseInputs {
  /** 会话层是否可用（false = 只有残留区；`schemas` / `carried` 一律忽略）。 */
  readonly layerReady: boolean
  /** 本会话可见工具的名字 + 描述（`layer.visibleSchemas()`）。 */
  readonly schemas: readonly VisibleToolSchema[]
  /** 上一轮仍受管的名字（`layer.snapshot().deny`；已关条目保留在清单里）。 */
  readonly carried: readonly string[]
  /** 技能分面读数（`layer.skills()`；缺席 = 服务不可用）。 */
  readonly skills?: SkillLayerSnapshot
  /** 生效保护名单（排序后的文本）。 */
  readonly protectedNames: ReadonlySet<string>
}

/** 空宇宙的分组数组（冻结，与空宇宙常量共用一份）。 */
const NO_GROUPS: readonly DefaultsGroup[] = Object.freeze([])

/**
 * 层未就绪时的空宇宙：`layerReady:false` 是**读数**而不是错误，界面据此只渲染残留区。
 *
 * 冻结且复用同一个引用：本模块对该分支不读入参，调用方也可以直接按引用判断「层没就绪」。
 */
const EMPTY_UNIVERSE: DefaultsUniverse = Object.freeze({
  layerReady: false,
  skillsAvailable: false,
  groups: NO_GROUPS,
})

/**
 * 构建默认档分组界面的**工具宇宙**（B 的宿主侧唯一宇宙构建器）。
 *
 * **目标无关**——用户级默认档（`$DSH_HOME/session-tool-toggle/defaults.json`）与工作区级默认档
 * （`workspaces.json` 的一个键）共用这一份宇宙：宇宙只由当前会话的两读（`visibleSchemas()` ∪
 * `snapshot().deny`）与技能分面读数推出，与「正在编辑哪一档」无关，也**不按目标工作区**推导。
 *
 * 与 {@link buildPanelSnapshot} 是「同一套判据、两个出口」：分组规则（首个 `__` 切分、`skill`
 * 单列、其余归内置工具）、三个标记的判据（`protected` / `reserved`）与描述截断
 * （{@link DESCRIPTION_MAX_LENGTH}）都复用同几个私有件，区别只在出口形状——面板要说「哪条被关
 * 了」（`disabled` 与两计数），宇宙只要「有哪些可切换的地址」（{@link DefaultsEntry} 没有
 * `disabled`）。**本函数不改变 `buildPanelSnapshot` 的任何行为**。
 *
 * 纯函数：不读时钟、不做 IO、不改入参（`schemas` / `carried` / `protectedNames` 只读），同一
 * 输入两次调用深相等。
 * @param inputs - 宿主侧已读到的会话事实。
 * @returns 宇宙（`layerReady:false` 时是冻结的空宇宙）。
 */
export function buildDefaultsUniverse(inputs: DefaultsUniverseInputs): DefaultsUniverse {
  // 层读不到就是「没有候选可列」：`schemas` / `carried` 此时只是调用方手里上一次读数的残影，
  // 拿来拼一份看似完整的宇宙会让界面把已经失效的行当成可切换项。
  if (!inputs.layerReady) return EMPTY_UNIVERSE

  // 候选与面板同源：两读并集、排序去重（`carried` 只做保底，理由见文件顶部注释）。排序在
  // 分桶之前做：各桶的插入顺序因此天然按注册名升序，不需要对每组再排一次。
  const candidates = sortedTexts([
    ...inputs.schemas.map((schema) => schema.name),
    ...inputs.carried,
  ])

  // 描述表只由 schema 读数给出：`carried` 只有名字（已关工具读不到 schema），因此残留区 /
  // carried-only 行天然没有描述可展示。
  const descriptions = new Map<string, string>()
  for (const schema of inputs.schemas) descriptions.set(schema.name, schema.description ?? '')

  const servers = new Map<string, DefaultsEntry[]>()
  const builtin: DefaultsEntry[] = []
  // 技能组的存在性只看「技能工具本身还在候选里」：它被整档关掉时从 scoped 消失、由
  // `carried` 带回来，组与组开关因此不会因「用户关过它」而消失。
  let hasSkill = false

  for (const name of candidates) {
    const parts = mcpPartsOf(name)
    if (parts !== undefined) {
      const entry = defaultsEntryOf(
        name,
        parts.suffix,
        formatAddress({ kind: 'mcp-tool', server: parts.server, pattern: parts.suffix }),
        descriptions,
        inputs.protectedNames,
      )
      const bucket = servers.get(parts.server)
      if (bucket === undefined) servers.set(parts.server, [entry])
      else bucket.push(entry)
      continue
    }
    if (name === SKILL_NAME) {
      // 组内行**不来自候选**：技能名不是工具注册名，行要从技能分面读数取（见
      // {@link skillEntriesOf}）。
      hasSkill = true
      continue
    }
    builtin.push(
      defaultsEntryOf(
        name,
        name,
        formatAddress({ kind: 'tool', name }),
        descriptions,
        inputs.protectedNames,
      ),
    )
  }

  // 组顺序写死：MCP 组按 server 升序 → 技能组 → 内置工具组；空组不出现。
  const groups: DefaultsGroup[] = []
  for (const server of Array.from(servers.keys()).sort(compareText)) {
    const tools = servers.get(server)
    if (tools === undefined) continue
    groups.push({
      kind: 'mcp',
      key: server,
      address: formatAddress({ kind: 'mcp-group', server }),
      tools,
    })
  }
  // 技能组**行空也保留**：`skillsAvailable:false` 时界面只留标题与 `tool:skill` 组开关并给
  // 降级提示（D-23），组本身仍在，用户仍可整档关闭技能。
  if (hasSkill) {
    groups.push({
      kind: 'skill',
      key: SKILL_NAME,
      address: formatAddress({ kind: 'tool', name: SKILL_NAME }),
      tools: skillEntriesOf(inputs.skills, inputs.protectedNames),
    })
  }
  if (builtin.length > 0) {
    groups.push({ kind: 'builtin', key: BUILTIN_GROUP_KEY, address: null, tools: builtin })
  }

  return {
    layerReady: true,
    skillsAvailable: inputs.skills?.available === true,
    groups,
  }
}

/**
 * 造一条宇宙条目：两个标记各查一个集合，描述按需截断（与 `toolEntryOf` 同一套判据）。
 * 工作区宇宙复用同一叶子：会话宇宙与工作区宇宙共用本函数造条目，判据不各写一份。
 *
 * 与 `ToolEntry` 的差别只有「没有 `disabled`」：默认档界面把条目的开关状态与目标档的关闭集
 * 求交，宇宙本身不带任何档的口径。
 * @param name - 注册名（MCP 是 public name）。
 * @param shortName - 展示用短名（MCP 为 public 后缀；技能与内置工具就是名字本身）。
 * @param address - 该条目自己的规范形地址。
 * @param descriptions - 描述来源（键是 `name`）；缺省表示没有描述可展示。
 * @param protectedNames - 生效保护名单。
 * @returns 宇宙条目（无描述时不带 `description` 键）。
 */
export function defaultsEntryOf(
  name: string,
  shortName: string,
  address: string,
  descriptions: ReadonlyMap<string, string> | undefined,
  protectedNames: ReadonlySet<string>,
): DefaultsEntry {
  const description = descriptionOf(name, descriptions)
  const entry: DefaultsEntry = {
    address,
    shortName,
    protected: protectedNames.has(name),
    reserved: isReservedName(name),
  }
  // 条件展开的理由同 `toolEntryOf`：键存在但值为 undefined 会让「有没有这个字段」依赖访问
  // 方式（`in` 与 `=== undefined` 给出不同答案）。
  return description === undefined ? entry : { ...entry, description }
}

/**
 * 技能组的行：技能分面读数里模型可调用（`visible`）∪ 已遮蔽（`shadowed`）的技能名。
 *
 * 来源与面板的顶层 `skills` 同一份读数（H6）：`visible` 给名字 + 描述，`shadowed` 只给名字
 * （影子 stub 读不到描述），两集合并集后按名字升序——地址都带同一个 `skill:` 前缀，所以名字
 * 升序就是地址升序。`skills` 缺席或 `available:false` → 空数组：没有技能服务就没有可信的
 * 技能行，界面改出降级提示（组开关仍在）。
 * @param skills - 技能分面读数（可能缺席）。
 * @param protectedNames - 生效保护名单。
 * @returns 按地址升序的技能行（可能为空数组）。
 */
function skillEntriesOf(
  skills: SkillLayerSnapshot | undefined,
  protectedNames: ReadonlySet<string>,
): readonly DefaultsEntry[] {
  if (skills === undefined || !skills.available) return []

  const descriptions = new Map<string, string>()
  for (const row of skills.visible) descriptions.set(row.name, row.description)

  return sortedTexts([...descriptions.keys(), ...skills.shadowed]).map((name) =>
    defaultsEntryOf(name, name, formatAddress({ kind: 'skill', name }), descriptions, protectedNames),
  )
}

/** 一条解析成功的关闭地址：规范形文本 + 地址形状。 */
interface ResolvedClosedAddress {
  /** `formatAddress` 的输出（`state.disabled` 的展示形）。 */
  readonly text: string
  /** 解析出的地址（区分工具面 / 技能面）。 */
  readonly address: SwitchAddress
}

/**
 * 把关闭集原文逐条归一为规范形地址：按文本去重、按文本排序。
 *
 * 容忍纪律与 `mask.ts` 的 `resolveAddresses` 同一份：不可解析的条目（空串、错前缀、保留名、
 * 保护基线、损坏记录里的任意垃圾）静默跳过，不让一条坏记录拖垮整份快照。与 `mask.ts`
 * 的唯一差别是这里**保留**技能地址（`kind === 'skill'`）——工具掩码跳过它，但面板的关闭集
 * 与 `intentOnly` 必须看得见它。
 * @param disabled - 关闭集原文（允许非规范形与脏条目）。
 * @returns 排序去重后的关闭地址；全部不可解析时为空数组。
 */
function closedAddressesOf(disabled: readonly string[]): readonly ResolvedClosedAddress[] {
  const byText = new Map<string, SwitchAddress>()
  for (const text of disabled) {
    const parsed = parseAddress(text, TOLERATED_PROTECTED_NAMES)
    if (!parsed.ok) continue
    if (!byText.has(parsed.text)) byText.set(parsed.text, parsed.address)
  }
  return Array.from(byText)
    .sort(([left], [right]) => compareText(left, right))
    .map(([text, address]) => ({ text, address }))
}

/**
 * 技能分面读数里「已安装」的技能名：模型可调用（`visible`）∪ 已注册影子 stub（`shadowed`）。
 *
 * `skills` 缺席或 `available:false` 时返回空集：没有技能服务时技能地址只记意图，一律进
 * `intentOnly`（与 `SkillLayerSnapshot.available` 的文档语义一致）。
 * @param skills - 技能分面读数（可能缺席）。
 * @returns 已安装技能名集合。
 */
function installedSkillNamesOf(skills: SkillLayerSnapshot | undefined): ReadonlySet<string> {
  if (skills === undefined || !skills.available) return NO_NAMES
  return new Set([...skills.visible.map((row) => row.name), ...skills.shadowed])
}

/**
 * 组装顶层技能行。
 *
 * 来源写死：模型可调用技能（`skills.visible`）∪ 当前已遮蔽名字（`skills.shadowed`），按名字
 * 升序。两个标记各自表达一种事实：`disabled` = 用户意图（在关闭集里），`shadowed` = 本会话
 * 实际生效（层已注册影子 stub）——两者同时为 true 才是「关掉且已生效」。
 *
 * 描述只从 `visible` 取（`shadowed` 只给名字，没有描述来源），按与工具描述同一上限截断；
 * 已遮蔽且不在 `visible` 的行因此是空串（契约允许，client 按「无描述」渲染）。
 * `skills` 缺席或 `available:false` → 空数组：没有技能服务就没有可信的技能行。
 * @param skills - 技能分面读数（可能缺席）。
 * @param closedSkillNames - 关闭集里的技能名（意图）。
 * @returns 按名字升序的技能行。
 */
function skillViewsOf(
  skills: SkillLayerSnapshot | undefined,
  closedSkillNames: ReadonlySet<string>,
): readonly SkillView[] {
  if (skills === undefined || !skills.available) return []

  const descriptions = new Map<string, string>()
  for (const row of skills.visible) descriptions.set(row.name, row.description)
  const shadowed = new Set(skills.shadowed)
  const names = new Set<string>(descriptions.keys())
  for (const name of shadowed) names.add(name)

  const views: SkillView[] = []
  for (const name of names) {
    views.push({
      name,
      description: descriptionOf(name, descriptions) ?? '',
      disabled: closedSkillNames.has(name),
      shadowed: shadowed.has(name),
    })
  }
  views.sort((left, right) => compareText(left.name, right.name))
  return views
}

/**
 * 组装顶层工作区视图。
 *
 * `workspace` 输入缺席或 `attribution` 缺席（cwd 无法归属，fail-closed）时返回 `null`：
 * 面板只展示用户级默认档，不凭空造一个工作区键。`title` 只在登记层给过标题时出现。
 * @param workspace - 工作区档读数（可能缺席）。
 * @returns 工作区视图或 `null`。
 */
function workspaceViewOf(workspace: WorkspacePanelInputs | undefined): WorkspaceView | null {
  if (workspace === undefined) return null
  const attribution = workspace.attribution
  if (attribution === undefined) return null
  return {
    key: attribution.key,
    ...(attribution.title === undefined ? {} : { title: attribution.title }),
    registered: attribution.registered,
    disabled: sortedTexts(workspace.disabled),
    path: workspace.path,
    readable: workspace.readable,
    corrupt: workspace.corrupt,
  }
}

/** 构造工具条目时共用的只读上下文（把三个集合打包，避免逐条目重建）。 */
interface EntryContext {
  /** 当前 deny 集合（`planMask.deny`，逐条目查 `disabled`）。 */
  readonly deny: ReadonlySet<string>
  /** 生效保护名单。 */
  readonly protectedNames: ReadonlySet<string>
  /** 描述来源（public name → 原文）；缺省表示没有描述可展示。 */
  readonly descriptions: ReadonlyMap<string, string> | undefined
}

/**
 * 把候选名分组成三层：MCP 服务器 → 技能 → 内置工具。
 *
 * 只输出**非空**分组：空组在界面上是一行没有内容的标题，纯噪声。MCP 组按 serverName
 * 升序、组内工具按注册名升序（候选名已排序，插入即有序）；skill / builtin 两组固定排在
 * 所有 MCP 组之后，顺序与枚举顺序一致，故整份清单与入参顺序无关。候选只由两读（`scoped`
 * ∪ `carried`）推出，因此**不存在**「全局层有、本会话被别处隐藏」的组。
 * @param candidates - 已排序去重的候选名（两读并集，会话口径）。
 * @param context - 条目标记用的只读上下文。
 * @param closed - 规范化关闭集（判断整组是否关闭）。
 * @returns 分组清单（可能为空数组）。
 */
function buildGroups(
  candidates: readonly string[],
  context: EntryContext,
  closed: ReadonlySet<string>,
): readonly ToolGroup[] {
  const servers = new Map<string, ToolEntry[]>()
  const builtin: ToolEntry[] = []
  const skill: ToolEntry[] = []

  for (const name of candidates) {
    const parts = mcpPartsOf(name)
    if (parts !== undefined) {
      const entry = toolEntryOf(
        name,
        parts.suffix,
        formatAddress({ kind: 'mcp-tool', server: parts.server, pattern: parts.suffix }),
        context,
      )
      const bucket = servers.get(parts.server)
      if (bucket === undefined) servers.set(parts.server, [entry])
      else bucket.push(entry)
      continue
    }
    if (name === SKILL_NAME) {
      skill.push(toolEntryOf(name, name, formatAddress({ kind: 'tool', name }), context))
      continue
    }
    builtin.push(toolEntryOf(name, name, formatAddress({ kind: 'tool', name }), context))
  }

  const groups: ToolGroup[] = []
  const serverNames = Array.from(servers.keys()).sort(compareText)
  for (const server of serverNames) {
    const tools = servers.get(server)
    if (tools === undefined) continue
    groups.push(groupOf('mcp', server, formatAddress({ kind: 'mcp-group', server }), tools, closed))
  }
  if (skill.length > 0) {
    const address = formatAddress({ kind: 'tool', name: SKILL_NAME })
    groups.push(groupOf('skill', SKILL_NAME, address, skill, closed))
  }
  if (builtin.length > 0) {
    groups.push(groupOf('builtin', BUILTIN_GROUP_KEY, null, builtin, closed))
  }
  return groups
}

/**
 * 组装一个分组：计数由工具条目现算，整组关闭状态由组地址是否在关闭集里决定。
 *
 * 注意「在关闭集里」而不是「命中 > 0」：服务器断线时整组意图仍然要显示为已关（C10），
 * 0 命中的地址由 {@link PanelSnapshot.intentOnly} 单独标出。
 * @param kind - 分组来源。
 * @param key - 分组键。
 * @param address - 整组地址（builtin 为 null）。
 * @param tools - 组内工具（已按注册名升序）。
 * @param closed - 规范化关闭集。
 * @returns 分组。
 */
function groupOf(
  kind: ToolGroup['kind'],
  key: string,
  address: string | null,
  tools: readonly ToolEntry[],
  closed: ReadonlySet<string>,
): ToolGroup {
  return {
    kind,
    key,
    address,
    toolCount: tools.length,
    disabledCount: tools.filter((tool) => tool.disabled).length,
    disabled: address !== null && closed.has(address),
    tools,
  }
}

/**
 * 造一条工具条目：三个标记各查一个集合，描述按需截断。
 * @param name - 注册名。
 * @param shortName - 展示用短名。
 * @param address - 该条目自己的规范形地址。
 * @param context - 只读上下文。
 * @returns 工具条目（无描述时不带 `description` 键）。
 */
function toolEntryOf(
  name: string,
  shortName: string,
  address: string,
  context: EntryContext,
): ToolEntry {
  const description = descriptionOf(name, context.descriptions)
  const entry: ToolEntry = {
    name,
    shortName,
    address,
    disabled: context.deny.has(name),
    protected: context.protectedNames.has(name),
    reserved: isReservedName(name),
  }
  // 用条件展开而不是 `description: undefined`：键存在但值为 undefined 会让「快照里到底
  // 有没有这个字段」变得依赖访问方式（`in` 与 `=== undefined` 给出不同答案）。
  return description === undefined ? entry : { ...entry, description }
}

/**
 * 从一个注册名反推 (serverName, suffix)。
 *
 * `mcp__<serverName>__<suffix>` 只切**第一个** `__`（`toolServerOf` 同一条规则）：serverName
 * 文法允许单个 `_`，所以 `mcp__a__b__c` 归 serverName `a`、suffix `b__c`。serverName 自身
 * 含 `__` 时这种拆法有歧义（§6.1 A12）；本插件跟随宿主命名契约、不另行猜测，拆出来的组
 * 只影响展示（开关地址本身不看分组）。
 * @param toolName - 任意注册名。
 * @returns serverName 与非空 suffix；不是 MCP public name 时 undefined。
 */
function mcpPartsOf(
  toolName: string,
): { readonly server: string; readonly suffix: string } | undefined {
  if (!toolName.startsWith(MCP_PUBLIC_PREFIX)) return undefined
  const rest = toolName.slice(MCP_PUBLIC_PREFIX.length)
  const separator = rest.indexOf(MCP_PUBLIC_SEPARATOR)
  if (separator <= 0) return undefined
  const suffix = rest.slice(separator + MCP_PUBLIC_SEPARATOR.length)
  return suffix.length === 0 ? undefined : { server: rest.slice(0, separator), suffix }
}

/**
 * 该注册名是不是注册表保留名（`run_code`）。
 *
 * 刻意**不**在 `panel.ts` 里复制保留名常量：常量只定义在 `address.ts`（R7 裁定），而它没有
 * 导出。这里用一次文法解析问同一份真相——`parseAddress` 的拒绝顺序是「保留名 → 保护名单」，
 * 传空保护名单即只问保留名；MCP public name 先短路为 false（注册表保留名只可能是内置工具名，
 * 与附录 §2.5 的字段表一致）。
 * @param name - 注册名。
 * @returns 是保留名时为 true。
 */
function isReservedName(name: string): boolean {
  if (name.startsWith(MCP_PUBLIC_PREFIX)) return false
  const parsed = parseAddress(`tool:${name}`, NO_PROTECTED_NAMES)
  return !parsed.ok && parsed.code === 'reserved-tool'
}

/**
 * 取注册名的描述并截断到 {@link DESCRIPTION_MAX_LENGTH} 字符。
 *
 * 截断按 UTF-16 码元（与 contract 的 `max(160)` 计数方式一致）；若切点正好落在代理对的
 * 高位，少取一个码元，避免产出孤立代理项。空描述按「无描述」处理：client 不需要为一行
 * 空字符串渲染 `title`。
 * @param name - 注册名（描述 Map 的键）。
 * @param descriptions - 描述来源；缺省表示没有可展示的描述。
 * @returns 截断后的描述；无描述时为 undefined。
 */
function descriptionOf(
  name: string,
  descriptions: ReadonlyMap<string, string> | undefined,
): string | undefined {
  const raw = descriptions?.get(name)
  if (raw === undefined || raw.length === 0) return undefined
  if (raw.length <= DESCRIPTION_MAX_LENGTH) return raw
  const cut = raw.slice(0, DESCRIPTION_MAX_LENGTH)
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

/**
 * 汇总提示码：入参里的码 ∪ 由 `storeKind` / `defaultsCorrupt` 推导出的码，去重后按固定
 * 顺序输出。
 *
 * 推导是「面板不轻信单个字段」的兜底：`storeKind === 'memory'` 本身已经解释了降级，即使
 * 调用方忘了往 `notices` 里塞 `persistence-degraded`，面板也要提示；默认档损坏同理。
 *
 * 产出分工（本函数只负责**排序与去重**）：`skills-unavailable` / `skill-shadow-failed` 由
 * 装配层从技能分面读数得出（`skillsAvailable === false`；或某技能 `disabled ∧ ¬shadowed`，
 * 即意图在、影子 stub 没胜出）后放进 `inputs.notices`；`session-subagent` 同理由调用方按
 * 会话来源给入参。放在装配层是因为面板入参没有「会话来源」，而技能两态在控制读数里已经
 * 算好（`PanelReading.skills` / `skillsAvailable`），两处重复推导反而会分叉。
 * @param inputs - 面板入参。
 * @returns 去重且有序的提示码。
 */
function noticesOf(inputs: PanelInputs): readonly Notice[] {
  const notices = new Set<NoticeCode>(inputs.notices)
  if (inputs.storeKind === 'memory') notices.add('persistence-degraded')
  if (inputs.defaultsCorrupt) notices.add('defaults-corrupt')
  return NOTICE_ORDER.filter((code) => notices.has(code))
}

/**
 * 排序 + 去重（与 `state.ts` / `mask.ts` 同一不变量：UTF-16 码元序，与 locale 无关）。
 * @param texts - 文本列表。
 * @returns 新的排序去重数组。
 */
function sortedTexts(texts: readonly string[]): readonly string[] {
  // 先摊平成可变的 Array（`readonly string[]` 上没有 sort），再去重排序。
  const unique = Array.from(new Set(texts))
  unique.sort(compareText)
  return unique
}

/**
 * 文本比较（UTF-16 码元序，与 `state.ts` / `mask.ts` / `commands.ts` 同一约定）。
 * @param left - 一个文本。
 * @param right - 另一个文本。
 * @returns 负数 / 0 / 正数。
 */
function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
