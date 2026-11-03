/**
 * `/inventory` 的**纯逻辑层**：MCP 工具归组与清单文本渲染。
 *
 * 分层纪律（见变更 design D7）：本模块零 IO、零宿主 import——读服务、拿 agent、降级判定
 * 全部在 `inventory-command.ts`；这里只做「给定读数 → 确定性文本」的纯函数，
 * 因此每条规则都能用表驱动单测直接断言。
 *
 * MCP 归组口径（design D3）：输入是**该会话作用域可见工具名**（`ctx.tools.schemas(agent)`），
 * 只认 `mcp-client` 的公开名约定 `mcp__<serverName>__<rawName>`。公开名在归一化/64 字符
 * 截断后会追加哈希、可能吃掉 `__` 边界，这类名字进「未归组」计数——本模块绝不猜测服务器名
 * （猜出来的名字会误导用户去执行 `/tools off mcp:<server>`）。
 *
 * 已知限制：`serverName` 文法允许 `_`，因此 `a__b` 这种名字的归组存在歧义；公开名本身已是
 * `mcp-client` 的有损投影，无法无损反推，这里按「第一个 `__` 即边界」处理。
 * @module dsh-plugin-user-commands/host/inventory
 */

/** 命令名（满足 dsh-commands 的 `^[a-z][a-z0-9_-]*$`；不占用插件保留名）。 */
export const INVENTORY_COMMAND_NAME = 'inventory'

/** 发现界面里的一句话说明。 */
export const INVENTORY_COMMAND_DESCRIPTION =
  '列出本会话实际可见的 MCP 服务器与可用 skill（宿主侧直接求值，不产生模型请求）'

/** 命令的用法行（本命令不接受参数）。 */
export const INVENTORY_USAGE = `/${INVENTORY_COMMAND_NAME}（不接受参数）`

/** MCP 工具公开名的固定前缀（`mcp-client` 的约定）。 */
export const MCP_TOOL_PREFIX = 'mcp__'

/** Skill 描述在清单里的最大字符数（超出截断并补省略号）。 */
export const SKILL_DESCRIPTION_MAX_LENGTH = 60

/**
 * 一条 MCP 公开名到服务器的解析规则。
 *
 * `([A-Za-z0-9_-]+?)` 惰性匹配并取**第一个** `__` 作边界：serverName 里允许单个 `_`
 * （如 `my_server`），因此惰性扩张会在 `my_server` 处才满足 `__`。
 */
const MCP_SERVER_PATTERN = /^mcp__([A-Za-z0-9_-]+?)__(.+)$/

/** 一个 MCP 服务器的归组结果。 */
export interface McpServerGroup {
  /** 服务器名（`serverName`，与 `/tools mcp:<server>` 同一标识）。 */
  readonly name: string
  /** 该服务器在本会话可见的工具公开名，按名升序。 */
  readonly tools: readonly string[]
}

/** MCP 段的归组结果。 */
export interface McpGrouping {
  /** 可见服务器，按名称升序。 */
  readonly servers: readonly McpServerGroup[]
  /** 以 `mcp__` 开头但无法还原服务器名的公开名，按名升序。 */
  readonly ungrouped: readonly string[]
  /** 可见的 MCP 工具总数（含未归组者）。 */
  readonly totalTools: number
}

/** 一条 skill 的清单行。 */
export interface SkillRow {
  /** skill 名（kebab-case）。 */
  readonly name: string
  /** 已折叠空白并截断的描述（可能为空串）。 */
  readonly description: string
  /** 模型是否可经 `skill` 工具加载。 */
  readonly modelInvocable: boolean
  /** 用户是否可经 `/name` 手势调用。 */
  readonly userInvocable: boolean
  /** 来源（`dsh-skill` 的 `source` 原始值）。 */
  readonly source: string
}

/** Skill 段读数：可用条目 + 目录观测是否完整。 */
export interface SkillSection {
  /** 可用 skill 行，按名称升序。 */
  readonly rows: readonly SkillRow[]
  /** 目录观测是否完整（`complete === false` 时列表可能缺项）。 */
  readonly complete: boolean
}

/**
 * Skill 快照的最小面：`dsh-skill` 的 `SkillSummary` 在这里的窄投影。
 *
 * 只声明本模块消费的字段；`inventory-command.ts` 的端口把宿主对象 cast 成它，
 * 于是本模块不依赖任何宿主包。
 */
export interface SkillSummaryLike {
  /** skill 名（kebab-case）。 */
  readonly name: string
  /** 短路由描述。 */
  readonly description: string
  /** 调用策略。 */
  readonly invocation: {
    /** 模型可调用。 */
    readonly modelInvocable: boolean
    /** 用户可调用。 */
    readonly userInvocable: boolean
  }
  /** 来源标签。 */
  readonly source: string
}

/** 命令要渲染的完整读数。 */
export interface InventoryReading {
  /** 会话当前工作目录；`undefined` = 未能解析（项目级 skill 可能缺失）。 */
  readonly cwd?: string
  /** MCP 段读数；`undefined` = 服务缺席或读取失败。 */
  readonly mcp?: McpGrouping
  /** MCP 段不可读时的说明；缺省用兜底文案。 */
  readonly mcpNote?: string
  /** Skill 段读数；`undefined` = 服务缺席或读取失败。 */
  readonly skills?: SkillSection
  /** Skill 段不可读时的说明；缺省用兜底文案。 */
  readonly skillsNote?: string
}

/** 来源短标签（未知来源原样输出）。 */
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  'project-dsh': '项目',
  'project-agents': '项目(agents)',
  custom: '自定义',
  'user-dsh': '用户',
  'user-agents': '用户(agents)',
  bundled: '内置',
  runtime: '运行时',
}

/**
 * 把可见工具名按 `mcp__<server>__<tool>` 归组。
 *
 * 非 `mcp__` 前缀的工具（内置工具、MCP 资源工具等）一律忽略——MCP 段只回答
 * 「哪些 MCP 服务器可用」。
 * @param toolNames - 该 agent 作用域可见的工具名（`tools.schemas(agent)` 的 name 投影）。
 * @returns 服务器归组、未归组名单与 MCP 工具总数。
 */
export function groupMcpTools(toolNames: readonly string[]): McpGrouping {
  const byServer = new Map<string, string[]>()
  const ungrouped: string[] = []
  let totalTools = 0

  for (const name of toolNames) {
    if (!name.startsWith(MCP_TOOL_PREFIX)) continue
    totalTools += 1
    const match = MCP_SERVER_PATTERN.exec(name)
    if (match === null) {
      ungrouped.push(name)
      continue
    }
    const serverName = match[1] as string
    const tools = byServer.get(serverName)
    if (tools === undefined) byServer.set(serverName, [name])
    else tools.push(name)
  }

  const servers = Array.from(byServer, ([name, tools]) => ({ name, tools: tools.sort() }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  return { servers, ungrouped: ungrouped.sort(), totalTools }
}

/**
 * 把 skill 快照投影成清单行：过滤两种调用方式都不可用的条目，按名称升序。
 *
 * 保留 `modelInvocable || userInvocable` 的并集：模型经 `skill` 工具、用户经 `/name`
 * 手势都能「用上」该 skill；两者皆 false 的条目本会话用不到，不计入。
 * @param skills - 注册表在会话 cwd 与 agent 作用域下给出的 skill 摘要。
 * @returns 清单行（描述已折叠空白并截断）。
 */
export function skillRows(skills: readonly SkillSummaryLike[]): readonly SkillRow[] {
  return skills
    .filter((skill) => skill.invocation.modelInvocable || skill.invocation.userInvocable)
    .map((skill) => ({
      name: skill.name,
      description: normalizeDescription(skill.description),
      modelInvocable: skill.invocation.modelInvocable,
      userInvocable: skill.invocation.userInvocable,
      source: skill.source,
    }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
}

/**
 * 折叠空白并截断描述。
 * @param description - 原始描述。
 * @returns 供清单显示的描述（空串保持空串）。
 */
function normalizeDescription(description: string): string {
  const collapsed = description.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= SKILL_DESCRIPTION_MAX_LENGTH) return collapsed
  return `${collapsed.slice(0, SKILL_DESCRIPTION_MAX_LENGTH - 1)}…`
}

/**
 * 调用方式标记：模型与用户两侧各一态，共三种可见组合。
 * @param row - 一条 skill 行。
 * @returns 形如 `模型+/name` / `仅模型` / `仅 /name` 的标记。
 */
function invocationLabel(row: SkillRow): string {
  if (row.modelInvocable && row.userInvocable) return '模型+/name'
  if (row.modelInvocable) return '仅模型'
  return '仅 /name'
}

/**
 * 来源短标签。
 * @param source - `dsh-skill` 的原始来源值。
 * @returns 简体中文短标签；未知来源原样返回。
 */
function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

/**
 * 渲染 MCP 段。
 * @param reading - 完整读数。
 * @param lines - 写入目标（按行追加）。
 */
function renderMcp(reading: InventoryReading, lines: string[]): void {
  if (reading.mcp === undefined) {
    lines.push(`MCP 服务器：${reading.mcpNote ?? '读取可见工具面失败'}`)
    return
  }
  const { servers, ungrouped, totalTools } = reading.mcp
  if (servers.length === 0) {
    lines.push(
      ungrouped.length === 0
        ? 'MCP 服务器（0 台）：本会话当前没有可见的 MCP 工具'
        : `MCP 服务器（0 台，共 ${totalTools} 个工具）`,
    )
  } else {
    lines.push(`MCP 服务器（${servers.length} 台，共 ${totalTools} 个工具）`)
    for (const server of servers) {
      lines.push(`- ${server.name}：${server.tools.length} 个工具`)
    }
  }
  if (ungrouped.length > 0) {
    lines.push(`未归组：${ungrouped.length} 个 MCP 工具（公开名归一化/截断后无法还原服务器名）`)
  }
}

/**
 * 渲染 Skill 段。
 * @param reading - 完整读数。
 * @param lines - 写入目标（按行追加）。
 */
function renderSkills(reading: InventoryReading, lines: string[]): void {
  if (reading.skills === undefined) {
    lines.push(`Skill：${reading.skillsNote ?? '读取 skill 目录失败'}`)
    return
  }
  const { rows, complete } = reading.skills
  if (rows.length === 0) {
    lines.push('Skill（0 个）：本会话当前没有可用 skill')
  } else {
    lines.push(`Skill（${rows.length} 个）`)
    for (const row of rows) {
      const head = row.description === '' ? row.name : `${row.name} — ${row.description}`
      lines.push(`- ${head}（${invocationLabel(row)}，${sourceLabel(row.source)}）`)
    }
  }
  if (!complete) lines.push('（注意：技能目录观测不完整，列表可能缺项）')
  if (reading.cwd === undefined) lines.push('（未能解析会话工作目录，项目级 skill 可能缺失）')
}

/**
 * 渲染整份清单：首行 cwd，随后固定 MCP 段与 Skill 段。
 * @param reading - 完整读数。
 * @returns 简体中文多行纯文本（无尾随换行）。
 */
export function renderInventory(reading: InventoryReading): string {
  const lines: string[] = [`会话清单（cwd：${reading.cwd ?? '未知'}）`, '']
  renderMcp(reading, lines)
  lines.push('')
  renderSkills(reading, lines)
  return lines.join('\n')
}
