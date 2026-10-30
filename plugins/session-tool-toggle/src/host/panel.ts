/**
 * 面板快照构建器：把宿主侧**已经读到**的事实合成一份可直接渲染的快照。
 *
 * 输入全部是读数、输出是一份纯数据（附录 §2.2 的 `PanelSnapshotSchema` 是其形状权威）：
 * 本模块不做 IO、不读时钟、不碰任何宿主服务，也不 import Cordis——因此面板的每一条展示
 * 规则都能在单测里用一份入参直接断言，不需要拉起宿主。读取动作（`ctx.tools.schemas()`、
 * 层的 `visibleNames()`、默认档文件）由调用方（9.1 的控制内核）准备好，构建器只负责推导。
 *
 * 推导链写死（附录 §2.5）：
 *
 * 1. 三读并集 `catalog ∪ scoped ∪ carried` 得到候选名（与掩码引擎同一份语义，见 `mask.ts`）；
 * 2. 分组：`mcp__<serverName>__<suffix>` 按**首个** `__` 切分（`toolServerOf` 同一条规则），
 *    其余名字里 `skill` 单列「技能」组、剩下的进「内置工具」组；
 * 3. 每条工具四个标记：`disabled`（命中关闭集）/ `protected`（生效保护名单）/
 *    `reserved`（注册表保留名）/ `shadowed`（全局层有、本会话看不见，**且不是本插件掩的**）；
 * 4. `stats` 四计数、`hiddenByOthers`、`intentOnly`、`notices` 汇总。
 *
 * 一条与面板交互直接相关的口径（diff-matrix R18）：「被其他作用域隐藏」= `catalog \ (scoped
 * ∪ carried)`。`carried` 是本插件**已生效**的掩码（`layer.snapshot().deny`），它同样会让名字
 * 从 `scoped` 消失；若把这类名字也算作「被别的作用域隐藏」，用户自己关掉的工具就会同时带
 * `disabled` 与 `shadowed`，而面板对 `shadowed` 行**禁用开关**（附录 §3.3）→ 用户在分组清单
 * 里再也打不开自己关掉的工具（只能绕去关闭集 chip）。因此本插件掩掉的名字必须从差集里排除。
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

import { formatAddress, parseAddress } from './address.ts'
import { planMask } from './mask.ts'
import type { NoticeCode, PanelInputs, StoreKind } from './types.ts'

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
]

/**
 * 判保留名用的空保护名单。
 *
 * 只问「是不是注册表保留名」：`parseAddress` 的拒绝顺序是「保留名 → 保护名单」，传空集
 * 就不会把保护名误判成保留名。
 */
const NO_PROTECTED_NAMES: ReadonlySet<string> = new Set()

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
  /**
   * 全局层有、本会话看不见，**且不是本插件掩掉的**（`catalog \ (scoped ∪ carried)`，R18）。
   *
   * 本插件已生效的掩码（`carried`）造成的「看不见」不算：它由用户自己的开关决定，面板
   * 必须让这一行的开关可点，用户才能把工具打开。
   */
  readonly shadowed: boolean
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

/** 统计四计数（`PanelSnapshotSchema.stats` 的宿主侧形状）。 */
export interface Stats {
  /** 本会话当前可见工具数（掩码后）。 */
  readonly visible: number
  /** 全局层（不受任何 agent 限制）名字数。 */
  readonly catalog: number
  /** 当前 deny 名字数（= 掩码实际生效量）。 */
  readonly denied: number
  /** `hiddenByOthers.length` 的镜像，省一次客户端计算。 */
  readonly shadowed: number
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
  /** 全局层有、本会话看不到的名字（`catalog \ (scoped ∪ carried)`，已排序；R18）。 */
  readonly hiddenByOthers: readonly string[]
  /** 关闭集里当前命中 0 个注册名的地址（「意图已记录、暂无匹配」）。 */
  readonly intentOnly: readonly string[]
  /** 统计四计数。 */
  readonly stats: Stats
  /** 降级 / 提示码（已去重、按固定顺序）。 */
  readonly notices: readonly Notice[]
}

/**
 * 构建一份面板快照。
 *
 * 纯函数：只读 `inputs`，不修改其中任何数组 / Map，同一输入两次调用返回深相等的两份结果。
 * 不抛错：损坏的关闭集条目由 {@link planMask} 静默跳过，未知 serverName / 工具名只是不进
 * 分组或不命中（C10 宽容），空输入得到一份全空的快照。
 * @param inputs - 宿主侧已读到的事实（三读、状态、默认档、保护名单、描述）。
 * @returns 面板快照。
 */
export function buildPanelSnapshot(inputs: PanelInputs): PanelSnapshot {
  // 三读并集 → 候选名。排序在分组之前做：各分组桶的插入顺序因此天然按注册名升序，
  // 不需要对每组再排一次。
  const candidates = sortedTexts([...inputs.catalog, ...inputs.scoped, ...inputs.carried])
  const catalogNames = uniqueTexts(inputs.catalog)
  const scopedNames = uniqueTexts(inputs.scoped)

  // 与掩码引擎同一份读数：deny / matched 都由它算，面板不与实际掩码各算一遍。
  const plan = planMask({
    catalog: inputs.catalog,
    scoped: inputs.scoped,
    carried: inputs.carried,
    disabled: inputs.state.disabled,
  })

  // 「被其他作用域隐藏」按 diff-matrix R18 的口径 = `catalog \ (scoped ∪ carried)`：`carried`
  // 是本插件**已生效**的掩码（`layer.snapshot().deny`），它同样会让名字从 scoped 消失。若把
  // 它也算作「被其他作用域隐藏」，本会话关掉且已生效的工具会同时带 `disabled` 与 `shadowed`，
  // 而面板对 shadowed 行禁用开关（附录 §3.3）→ 用户无法在分组清单里把自己关掉的工具打开。
  // 命令面（`control.ts` 的 `readPanel`）用同一口径，两处不能分叉。
  const scopedSet = new Set(scopedNames)
  const carriedSet = new Set(inputs.carried)
  const hiddenByOthers = sortedTexts(
    catalogNames.filter((name) => !scopedSet.has(name) && !carriedSet.has(name)),
  )

  // 关闭集：`planMask` 的键就是规范化后的关闭地址（含 0 命中的条目，两态区分靠它）。
  const closedTexts = sortedTexts(Array.from(plan.matched.keys()))
  const intentOnly = closedTexts.filter((text) => plan.matched.get(text) === 0)

  const context: EntryContext = {
    deny: new Set(plan.deny),
    hidden: new Set(hiddenByOthers),
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
    hiddenByOthers,
    intentOnly,
    stats: {
      visible: scopedNames.length,
      catalog: catalogNames.length,
      denied: plan.deny.length,
      shadowed: hiddenByOthers.length,
    },
    notices: noticesOf(inputs),
  }
}

/** 构造工具条目时共用的只读上下文（把四个集合打包，避免逐条目重建）。 */
interface EntryContext {
  /** 当前 deny 集合（`planMask.deny`，逐条目查 `disabled`）。 */
  readonly deny: ReadonlySet<string>
  /** 被其他作用域隐藏（已排除本插件掩码）的名字（逐条目查 `shadowed`）。 */
  readonly hidden: ReadonlySet<string>
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
 * 所有 MCP 组之后，顺序与枚举顺序一致，故整份清单与入参顺序无关。
 * @param candidates - 已排序去重的候选名（三读并集）。
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
 * 造一条工具条目：四个标记各查一个集合，描述按需截断。
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
    shadowed: context.hidden.has(name),
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
 * 去重（保持首次出现序）。
 * @param texts - 文本列表。
 * @returns 去重后的新数组。
 */
function uniqueTexts(texts: readonly string[]): readonly string[] {
  return Array.from(new Set(texts))
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
