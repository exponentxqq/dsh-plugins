/**
 * 工作区宇宙构建器：按**目标工作区**（而非会话）回答「本工作区有哪些地址可被默认档开关打中」。
 *
 * 读数面（④ D1）：工具用插件上下文的**未受限全局**注册表（`ctx.get('tools').schemas()`，不传
 * scope），技能用 `ctx.get('skills').snapshot({ cwd: workspacePath })`（全局层 + 该 cwd 项目
 * 技能）。全局注册表是进程级并集，MCP 服务器来自所有已加载工作区；技能必须带 cwd，否则会把
 * 其他工作区的项目技能列进本工作区档。
 *
 * 归组口径**照搬 `/inventory`**（④ D3，与面板的 `mcpPartsOf` 刻意分开）：面板的切分对 server
 * 字符集更宽（允许 `.`），会把 `mcp__a.b__x` 归成组 `a.b`；`/inventory` 正则下它是**未归组**。
 * 复用面板的分组循环会破坏这条口径，因此分组循环另写，只复用 `defaultsEntryOf` 叶子（地址 /
 * 描述截断 / 保护名 / 保留名判据仍然单点）。
 *
 * 分层与 `panel.ts` 同款：{@link buildWorkspaceUniverse} 是纯构造（零 IO / 零 Cordis，单测直接
 * 驱动），{@link createWorkspaceUniverseReader} 是读数编排（宿主服务现取 + 降级 + 日志，
 * **永不抛错**）。装配点（`host/index.ts`）只做一行映射，不再有业务分支。
 *
 * @module dsh-plugin-session-tool-toggle/host/workspace-universe
 */

import type { DefaultsEntry, DefaultsGroup, DefaultsUniverse } from '../contract.ts'
import { formatAddress } from './address.ts'
import { defaultsEntryOf } from './panel.ts'
import type { SkillSummaryLike, SpecLog, VisibleToolSchema } from './types.ts'

/**
 * MCP public name 到服务器的归组正则。
 *
 * **逐字照搬** `plugins/user-commands/src/host/inventory.ts` 的同名常量（页面宇宙归组口径的
 * 唯一锚点）。跨包只能双份，不能 import：本包产物必须自包含（跨插件 import 破坏 bundle
 * 自包含，产物守卫 B 组会拦），上游也没有导出该私有常量。两份必须同批修改——任何一侧改正则
 * 都要让另一侧跟上，否则页面清单与 `/inventory` 的归组口径分叉。
 *
 * `([A-Za-z0-9_-]+?)` 惰性匹配并取**第一个** `__` 作边界：serverName 里允许单个 `_`
 * （如 `my_server`），因此惰性扩张会在 `my_server` 处才满足 `__`。`mcp__` 前缀但正则不命中
 * （含 `mcp__x`、`mcp__x__`、`mcp__a.b__x`）→ 未归组计数，不生成开关行——`tool:mcp__…` 是
 * 非法地址（地址文法拒绝该前缀），点开关必然 `bad-address`。
 */
const MCP_SERVER_PATTERN = /^mcp__([A-Za-z0-9_-]+?)__(.+)$/

/** MCP public name 的前缀：`mcp__<serverName>__<suffix>`（归组正则只对它执行）。 */
const MCP_PUBLIC_PREFIX = 'mcp__'

/** 技能工具的注册名：整档只有它一个，单独成组（组地址 `tool:skill`）。 */
const SKILL_NAME = 'skill'

/** 内置工具分组的键；该组不可整组关，所以 `address` 恒为 null。 */
const BUILTIN_GROUP_KEY = 'builtin'

/** 空宇宙的分组数组（冻结，与空宇宙常量共用一份引用）。 */
const NO_GROUPS: readonly DefaultsGroup[] = Object.freeze([])

/**
 * 冻结空宇宙：工具服务缺席 / 读失败时的**唯一**返回值，`layerReady:false` 是读数而不是错误，
 * 界面据此只渲染残留区。
 *
 * 不带 `ungroupedMcp` / `skillsComplete` 键：宇宙级可选键只在有内容时出现（wire 自检的
 * strict 字段集据此放行新旧两种形状）。冻结且复用同一个引用：本模块对该分支不读入参，
 * 调用方也可以直接按引用判断「工具层没就绪」。
 */
export const EMPTY_WORKSPACE_UNIVERSE: DefaultsUniverse = Object.freeze({
  layerReady: false,
  skillsAvailable: false,
  groups: NO_GROUPS,
})

/* ─────────────────── 纯构造（零 IO / 零 Cordis，单测直接驱动） ─────────────────── */

/**
 * 工作区宇宙的构造事实：全部由装配层读到，本函数只做纯推导。
 */
export interface WorkspaceUniverseFacts {
  /** 插件上下文可见的**未受限全局**工具注册表（`ctx.tools.schemas()`，不传 scope）。 */
  readonly schemas: readonly VisibleToolSchema[]
  /** `ctx.skills.snapshot({ cwd: workspacePath })` 的清单；缺席 = 技能服务不可用 / 读取失败。 */
  readonly skills?: readonly SkillSummaryLike[]
  /** 技能目录观测是否完整（`snapshot().complete`）；仅在 `skills` 存在时有意义。 */
  readonly skillsComplete?: boolean
  /** 生效保护名单（与面板 / 命令面同源）。 */
  readonly protectedNames: ReadonlySet<string>
  /**
   * 项目级 MCP 服务器声明全集（project-mcp 的 claim 读数，R15）；缺席 = project-mcp 插件
   * 未装配——此时清单里不可能有项目级服务器，全部 MCP 组按 `'user'` 标注。
   */
  readonly projectServers?: ReadonlySet<string>
  /**
   * **目标工作区**根集归属下的项目级服务器声明（R15）。`null` = 归属读数失败——fail-closed：
   * 全部项目级组整组剔除并计入 `foreignProjectMcp`（宁暂时少列，不把别家工作区的服务器
   * 列进本工作区档）。缺席 = 无归属读数（与 `projectServers` 缺席同现）。
   */
  readonly projectServersHere?: ReadonlySet<string> | null
}

/**
 * 按工作区构造工具宇宙（目标 = 一个工作区规范路径）。
 *
 * 归组口径照搬 `/inventory`（见文件头与 {@link MCP_SERVER_PATTERN}）：
 *
 * - MCP：`MCP_SERVER_PATTERN`，第一个 `__` 为边界；`mcp__` 前缀但正则不命中 → **未归组计数**
 *   （`ungroupedMcp`），不进内置组、不生成行（④ D4）；
 * - `skill` 单列技能组（组地址 `tool:skill`），行来自技能快照而非候选工具名（技能名不是工具
 *   注册名，不能生成 `tool:<name>` 行）；
 * - 其余 → 内置工具组（无组地址）。
 *
 * 输出规则（逐条可断言）：
 *
 * 1. `layerReady: true`（工具事实已由调用方读到；缺席由调用方返回空宇宙）；
 * 2. `groups` 顺序写死：MCP 组按 server 升序 → 技能组 → 内置组（非空时）；空组不出现；技能组
 *    在「候选里有 `skill` 工具」**或**「技能快照非空」时出现（6.1 A6：技能开关的生效机制是
 *    每 agent 层影子 stub，不依赖 `skill` 工具；组开关 `tool:skill` 仍是合法地址）；
 * 3. MCP 行：`address = formatAddress({ kind: 'mcp-tool', server, pattern: suffix })`、
 *    `shortName = suffix`，描述取 schema 描述并截断 160（叶子单点）；
 * 4. 技能行：快照中 `modelInvocable || userInvocable` 的条目（`/inventory` 并集口径），按名称
 *    升序；行带 `modelInvocable` / `userInvocable` / `source`（④ D5；`source` 原值上网，快照
 *    缺来源时不带该键）；`skills` 缺席时 `skillsAvailable:false`、技能组只有组开关 + 降级提示
 *    （与面板同形）；
 * 5. `skillsComplete` 仅在技能快照存在时透传；`ungroupedMcp` 仅在 `> 0` 时出现——宇宙级可选
 *    键按「有内容才有键」的纪律条件展开，键存在但值为 undefined 会让「有没有这个字段」依赖
 *    访问方式（`in` 与 `=== undefined` 给出不同答案）。
 *
 * 纯函数：不读时钟、不做 IO、不改入参；同一入参两次调用深相等。
 * @param facts - 装配层已读到的工作区事实。
 * @returns 宇宙。
 */
export function buildWorkspaceUniverse(facts: WorkspaceUniverseFacts): DefaultsUniverse {
  // 描述表只由 schema 读数给出（与面板同一口径）：描述经 `defaultsEntryOf` 截断 160。
  const descriptions = new Map<string, string>()
  for (const schema of facts.schemas) descriptions.set(schema.name, schema.description ?? '')

  const servers = new Map<string, DefaultsEntry[]>()
  const builtin: DefaultsEntry[] = []
  let ungroupedMcp = 0
  // 技能组的存在性有两个来源（6.1 A6）：候选里有 `skill` 工具（整档组开关）**或**技能快照
  // 非空（逐技能行）。影子 stub 不依赖 `skill` 工具本身注册，缺它不等于缺技能。
  let hasSkillTool = false

  // 排序在分桶之前做（与面板同一不变量）：各桶的插入顺序因此天然按注册名升序，
  // 不需要对每组再排一次；去重保证全局注册表的重复投影不会产出重复行。
  for (const name of sortedUniqueTexts(facts.schemas.map((schema) => schema.name))) {
    if (name.startsWith(MCP_PUBLIC_PREFIX)) {
      const match = MCP_SERVER_PATTERN.exec(name)
      if (match === null) {
        // 未归组只计数（④ D4）：不进内置组、不成行——`tool:mcp__…` 是非法地址，塞进任何
        // 可切换集合都会让点开关必然 `bad-address`；静默丢弃则用户会以为清单完整。
        ungroupedMcp += 1
        continue
      }
      const server = match[1] as string
      const suffix = match[2] as string
      const entry = defaultsEntryOf(
        name,
        suffix,
        formatAddress({ kind: 'mcp-tool', server, pattern: suffix }),
        descriptions,
        facts.protectedNames,
      )
      const bucket = servers.get(server)
      if (bucket === undefined) servers.set(server, [entry])
      else bucket.push(entry)
      continue
    }
    if (name === SKILL_NAME) {
      // 组内行**不来自候选**：技能名不是工具注册名，行要从技能快照取
      // （见 {@link workspaceSkillEntriesOf}）。
      hasSkillTool = true
      continue
    }
    builtin.push(
      defaultsEntryOf(name, name, formatAddress({ kind: 'tool', name }), descriptions, facts.protectedNames),
    )
  }

  // 组顺序写死：MCP 组按 server 升序 → 技能组 → 内置工具组；空组不出现。
  // R15 外来组剔除（在升序循环里做，剔除后计数不破坏顺序不变量）：项目级声明但不在
  // 目标工作区根集归属下 → 整组丢弃并计入 foreignProjectMcp。归属读数失败（`null`）
  // 视为「无一属于本工作区」——fail-closed 与 project-mcp 隔离闸门同向。
  const projectServers = facts.projectServers
  const projectServersHere = facts.projectServersHere
  let foreignProjectMcp = 0
  const groups: DefaultsGroup[] = []
  for (const server of Array.from(servers.keys()).sort(compareText)) {
    const tools = servers.get(server)
    if (tools === undefined) continue
    const isProject = projectServers !== undefined && projectServers.has(server)
    if (isProject && (projectServersHere === null || projectServersHere === undefined || !projectServersHere.has(server))) {
      foreignProjectMcp += 1
      continue
    }
    groups.push({
      kind: 'mcp',
      key: server,
      address: formatAddress({ kind: 'mcp-group', server }),
      tools,
      // R15 组级标注：来源（项目级只在归属命中时可达此处）+ token 计入（MCP 恒真）。
      source: isProject ? 'project' : 'user',
      countsTokens: true,
    })
  }
  const skills = facts.skills
  if (hasSkillTool || (skills !== undefined && skills.length > 0)) {
    groups.push({
      kind: 'skill',
      key: SKILL_NAME,
      address: formatAddress({ kind: 'tool', name: SKILL_NAME }),
      tools: workspaceSkillEntriesOf(skills, facts.protectedNames),
    })
  }
  if (builtin.length > 0) {
    groups.push({ kind: 'builtin', key: BUILTIN_GROUP_KEY, address: null, tools: builtin })
  }

  return {
    layerReady: true,
    skillsAvailable: skills !== undefined,
    groups,
    ...(ungroupedMcp > 0 ? { ungroupedMcp } : {}),
    ...(foreignProjectMcp > 0 ? { foreignProjectMcp } : {}),
    ...(skills !== undefined && facts.skillsComplete !== undefined
      ? { skillsComplete: facts.skillsComplete }
      : {}),
  }
}

/**
 * 技能组的行：技能快照里模型可调用（`modelInvocable`）∪ 用户可调用（`userInvocable`）的条目。
 *
 * 并集口径照搬 `/inventory` 的 `skillRows`：模型经 `skill` 工具、用户经 `/name` 手势都能
 * 「用上」该技能；两者皆 false 的条目本工作区用不到，不计入。行地址 `skill:<name>` 与面板
 * 技能行同形（地址都带同一个 `skill:` 前缀，名字升序就是地址升序）。三个详情字段
 * （④ D5）是 `DefaultsEntry` 的可选字段而非新条目类型：清单渲染 / 三计数 / 残差不需要为技能
 * 行分支。`skills` 缺席 → 空数组：没有技能服务就没有可信的技能行，界面改出降级提示（组开关
 * 仍在，与面板同形）。
 * @param skills - 技能快照（可能缺席）。
 * @param protectedNames - 生效保护名单。
 * @returns 按名称升序的技能行（可能为空数组）。
 */
function workspaceSkillEntriesOf(
  skills: readonly SkillSummaryLike[] | undefined,
  protectedNames: ReadonlySet<string>,
): readonly DefaultsEntry[] {
  if (skills === undefined) return []

  const descriptions = new Map<string, string>()
  for (const skill of skills) descriptions.set(skill.name, skill.description)

  return skills
    .filter((skill) => skill.invocation.modelInvocable || skill.invocation.userInvocable)
    .map((skill) => ({
      ...defaultsEntryOf(
        skill.name,
        skill.name,
        formatAddress({ kind: 'skill', name: skill.name }),
        descriptions,
        protectedNames,
      ),
      modelInvocable: skill.invocation.modelInvocable,
      userInvocable: skill.invocation.userInvocable,
      // `source` 原值上网（④ D5 / D14：locale 短标签是 client 的事）；快照缺来源时不带该键。
      ...(skill.source === undefined ? {} : { source: skill.source }),
    }))
    .sort((left, right) => compareText(left.shortName, right.shortName))
}

/* ─────────────────── 读数编排（宿主服务现取 + 降级 + 日志） ─────────────────── */

/**
 * 装配层交给 reader 的最小宿主面：`ctx.get` 现取，reader 内部收窄。
 *
 * 装配点只有一行映射：`readWorkspaceUniverse: createWorkspaceUniverseReader({
 * get: (name) => ctx.get(name), protectedNames, log })`——`ctx.get` 软读不在 `inject` 里硬
 * 依赖，服务缺席由 reader 降级，不阻塞插件加载。
 */
export interface WorkspaceUniverseHostAccess {
  /** 按服务名现取宿主服务（`ctx.get`）；缺席返回 `undefined`。 */
  readonly get: (name: string) => unknown
  /** 生效保护名单（与面板 / 命令面同源，透传给构造器）。 */
  readonly protectedNames: ReadonlySet<string>
  /** 诊断端口（降级时 warn）。 */
  readonly log: SpecLog
}

/** 宿主工具注册表的窄面（只声明本模块调用的能力，`ctx.get('tools')` 的收窄目标）。 */
interface GlobalToolsLike {
  /** 未受限全局注册表（不传 scope）：工作区宇宙的工具读数面（④ D1）。 */
  schemas(): readonly VisibleToolSchema[]
}

/** 宿主技能目录的窄面（`ctx.get('skills')` 的收窄目标）。 */
interface SkillCatalogLike {
  /**
   * 读该 cwd 可见的技能清单（全局层 + 项目技能）。
   * @param options - 作用域（工作区规范路径）。
   * @returns 清单与「目录观测是否完整」标记。
   */
  snapshot(options: { readonly cwd: string }): Promise<{
    readonly skills: readonly SkillSummaryLike[]
    readonly complete: boolean
  }>
}

/**
 * project-mcp 归属查询服务的窄面（`ctx.get('projectMcp')` 的收窄目标，R15）。
 *
 * 与 `@deepseek-ai/cordis` 侧的 `ProjectMcpAttribution` 声明同形——跨插件只窄不 import：
 * 本包产物必须自包含（B 组产物守卫），且 project-mcp 未装配时本面根本不存在（软读降级）。
 */
interface ProjectMcpAttributionLike {
  /** 全部项目级服务器声明（claim 语义；含加载中 / 失败的）。 */
  managedServerNames(): ReadonlySet<string>
  /**
   * 按工作区规范路径读该工作区根集归属下的声明。
   * @param path - 工作区规范路径。
   * @returns 声明集合；路径不被任何工作区认领 → `null`（归属失败）。
   */
  serverNamesForWorkspace(path: string): Promise<ReadonlySet<string> | null>
}

/**
 * 造一个「按工作区路径读宇宙」的端口；**永不抛错**。
 *
 * 失败矩阵（每行一个分支，装配层零分支）：
 *
 * | 情形 | 返回 | 日志 |
 * |---|---|---|
 * | `ctx.get('tools')` 为 `undefined` | {@link EMPTY_WORKSPACE_UNIVERSE} | warn 一次（闭包内去重，避免每次读刷屏） |
 * | `tools.schemas()` 抛错 | 同上 | warn 带原文 |
 * | `ctx.get('skills')` 为 `undefined` | `buildWorkspaceUniverse({schemas})`（`skillsAvailable:false`） | 不 warn（受支持的降级） |
 * | `skills.snapshot({cwd})` 抛错 | 同上 | warn（每次；技能是软分面） |
 * | 正常 | 完整宇宙 | 无 |
 *
 * 工具缺席与读失败都返回**同一个**冻结空宇宙（`layerReady:false`）：空宇宙是读数而不是错误。
 * @param access - 装配层交给 reader 的最小宿主面。
 * @returns 按工作区规范路径读宇宙的异步函数。
 */
export function createWorkspaceUniverseReader(
  access: WorkspaceUniverseHostAccess,
): (workspacePath: string) => Promise<DefaultsUniverse> {
  // 工具服务缺席是**结构性**降级（一次 warn 足够；每次读都 warn 会在页面反复刷新时刷屏）。
  let toolsAbsentWarned = false
  // R15 归属读数失败也是结构性降级（fail-closed 丢项目级组），同样按一次 warn 去重。
  let attributionFailedWarned = false
  return async (workspacePath: string): Promise<DefaultsUniverse> => {
    const tools = access.get('tools') as GlobalToolsLike | undefined
    if (tools === undefined) {
      if (!toolsAbsentWarned) {
        toolsAbsentWarned = true
        access.log.warn('工具注册表服务缺席，工作区默认档页面无清单可列（界面将只展示残留区）')
      }
      return EMPTY_WORKSPACE_UNIVERSE
    }
    let schemas: readonly VisibleToolSchema[]
    try {
      schemas = tools.schemas()
    } catch (error) {
      // 读失败可能是瞬时的（注册表重扫窗口），每次 warn 带原文，便于按时间定位。
      access.log.warn(`读取全局工具注册表失败，工作区默认档页面无清单可列：${messageOf(error)}`)
      return EMPTY_WORKSPACE_UNIVERSE
    }

    // R15 项目级 MCP 来源读数（软读；project-mcp 未装配是合法部署矩阵，不 warn）：
    //
    // | 情形 | facts 形状 | 效果 |
    // |---|---|---|
    // | 插件缺席 | 两键缺省 | 全部 MCP 组标 `'user'`（此时不存在项目级来源） |
    // | managed 读数抛错 | 整层降级 EMPTY | 来源分野不可信，宁可不列（同 `schemas()` 抛错纪律） |
    // | 归属抛错 / `null` | `projectServersHere: null` | fail-closed：项目级组整组剔除 + 计数 |
    // | 正常 | 两集透传 | 归属命中标 `'project'`、其余标 `'user'` |
    let projectServers: ReadonlySet<string> | undefined
    let projectServersHere: ReadonlySet<string> | null | undefined
    const projectMcp = access.get('projectMcp') as ProjectMcpAttributionLike | undefined
    if (projectMcp !== undefined) {
      try {
        projectServers = projectMcp.managedServerNames()
      } catch (error) {
        access.log.warn(`读取项目级 MCP 声明清单失败，工作区默认档页面无清单可列：${messageOf(error)}`)
        return EMPTY_WORKSPACE_UNIVERSE
      }
      try {
        projectServersHere = await projectMcp.serverNamesForWorkspace(workspacePath)
      } catch (error) {
        projectServersHere = null
        if (!attributionFailedWarned) {
          attributionFailedWarned = true
          access.log.warn(
            `读取工作区 ${workspacePath} 的项目级 MCP 归属失败，`
              + `项目级服务器暂不列入（fail-closed）：${messageOf(error)}`,
          )
        }
      }
    }

    // 技能是软分面：缺席是受支持的降级（`skillsAvailable:false`、技能组只有组开关），不打日志；
    // 快照抛错才 warn，且降级到「无技能行」而不是整个宇宙不可用。
    const skills = access.get('skills') as SkillCatalogLike | undefined
    if (skills === undefined) {
      return buildWorkspaceUniverse({
        schemas,
        protectedNames: access.protectedNames,
        ...(projectServers === undefined ? {} : { projectServers }),
        ...(projectServersHere === undefined ? {} : { projectServersHere }),
      })
    }
    let snapshot: Awaited<ReturnType<SkillCatalogLike['snapshot']>>
    try {
      snapshot = await skills.snapshot({ cwd: workspacePath })
    } catch (error) {
      access.log.warn(`读取工作区 ${workspacePath} 的技能清单失败，技能行降级为空：${messageOf(error)}`)
      return buildWorkspaceUniverse({
        schemas,
        protectedNames: access.protectedNames,
        ...(projectServers === undefined ? {} : { projectServers }),
        ...(projectServersHere === undefined ? {} : { projectServersHere }),
      })
    }
    return buildWorkspaceUniverse({
      schemas,
      skills: snapshot.skills,
      skillsComplete: snapshot.complete,
      protectedNames: access.protectedNames,
      ...(projectServers === undefined ? {} : { projectServers }),
      ...(projectServersHere === undefined ? {} : { projectServersHere }),
    })
  }
}

/**
 * 取错误文案（非 `Error` 也不会抛；与 `rpc.ts` 等的私有件同一形状）。
 * @param error - 任意值。
 * @returns 文案。
 */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return String(error)
  } catch {
    return '不可渲染的错误'
  }
}

/**
 * 排序 + 去重（与 `panel.ts` / `mask.ts` 同一不变量：UTF-16 码元序，与 locale 无关）。
 * @param texts - 文本列表。
 * @returns 新的排序去重数组。
 */
function sortedUniqueTexts(texts: readonly string[]): readonly string[] {
  // 先摊平成可变的 Array（`readonly string[]` 上没有 sort），再去重排序。
  const unique = Array.from(new Set(texts))
  unique.sort(compareText)
  return unique
}

/**
 * 文本比较（UTF-16 码元序，与 `panel.ts` / `state.ts` / `mask.ts` 同一约定）。
 * @param left - 一个文本。
 * @param right - 另一个文本。
 * @returns 负数 / 0 / 正数。
 */
function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
