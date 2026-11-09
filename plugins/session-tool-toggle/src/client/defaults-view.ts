/**
 * 默认档分组界面的浏览器派生（`code-design.md` ③ 3.18；D10 / D11 / D-19）。
 *
 * 三个集合运算把「目标无关的工具宇宙」与「目标档的关闭集」合成界面要的三计数与残留区，
 * 第四个把 `PanelSnapshot` 投影成**用户级默认档的宇宙**：面板快照的 wire 形状不含宇宙
 * （D-19 零新增字段），客户端用快照里的 `groups` + `skills` 现投影一份，与统一弹窗形态
 * 直接拿到的 `WorkspaceValue.universe` 同构；第五个按全局过滤词剪枝宇宙与残差（页面形态，
 * `code-design.md` ③ 3.4）。
 *
 * **纯函数纪律**：不读时钟、不做 IO、不改入参；同一输入两次调用深相等。本模块只
 * `import type` `contract.ts`，不 import 任何宿主模块或 React，因此可同时被浏览器
 * bundle 与 node 单测加载。
 *
 * 与宿主 `src/host/panel.ts` 的分工：宿主负责「本会话有哪些可切换地址」的**事实**
 * （`DefaultsUniverse` / `PanelSnapshot`），这里只做投影与集合运算；地址文法
 * （`formatAddress` / `parseAddress`）一律不重实现——唯一例外是技能组地址
 * {@link SKILL_GROUP_ADDRESS} 的兜底常量（快照按契约必带非空组地址，这个兜底只防坏
 * 快照把整档开关弄丢）。
 *
 * @module dsh-plugin-session-tool-toggle/client/defaults-view
 */

import type {
  DefaultsEntry,
  DefaultsGroup,
  DefaultsUniverse,
  PanelSnapshot,
  SkillView,
  ToolEntry,
  ToolGroup,
} from '../contract.ts'

/** 目标档视图的派生结果（UI 只读这一份）。 */
export interface DefaultsCounts {
  /** 可切换条目数（组开关 + 行开关，去重）。 */
  readonly listed: number
  /** 其中地址已在目标档关闭集里的数量。 */
  readonly inDefaults: number
  /** 目标档关闭集里不在宇宙中的地址数（= `residualOf(...).length`）。 */
  readonly residual: number
}

/**
 * 技能组整档开关的地址。
 *
 * 快照的技能组 `ToolGroup.address` 由宿主 `formatAddress({kind:'tool', name:'skill'})`
 * 生成，恒为 `tool:skill`；客户端不重实现地址文法，只保留这一个常量：坏快照把组地址
 * 给成 `null` 时用它兜底，保证界面仍有整档开关（否则技能组只剩行、无法整档关闭）。
 */
const SKILL_GROUP_ADDRESS = 'tool:skill'

/**
 * 宇宙里所有可切换地址（组开关 + 行开关；Set 语义去重）。
 *
 * 组开关是组地址（`mcp:<server>` / `tool:skill`）；`builtin` 组的 `address === null`，
 * 没有组开关，只有行开关。宇宙为 `null` 或 `layerReady:false` 时返回**空集合**：层未
 * 就绪说明宿主读不到会话清单，即便远端还留着一份残影 `groups` 也不可信，界面只展示
 * 残留区（与 {@link defaultsCountsOf} 的 `listed = 0` 同一口径）。
 *
 * @param universe - 目标无关的工具宇宙（允许 `null` / 未就绪）。
 * @returns 新的只读集合（每次调用独立，调用方可安全遍历）。
 */
export function switchAddressesOf(universe: DefaultsUniverse | null): ReadonlySet<string> {
  const addresses = new Set<string>()
  if (universe === null || !universe.layerReady) return addresses
  for (const group of universe.groups) {
    if (group.address !== null) addresses.add(group.address)
    for (const entry of group.tools) addresses.add(entry.address)
  }
  return addresses
}

/**
 * 目标档的三计数（D11 形状；用户级 / 工作区级同构）。
 *
 * 口径（三计数共用同一份 {@link switchAddressesOf} 结果）：
 *
 * - `listed` = `switchAddressesOf(universe).size`（**开关数**，不是行数：整组开关也是一个
 *   可切换条目；技能组因此是 `tool:skill` + N 个 `skill:<name>`）；
 * - `inDefaults` = `listed` 里地址在 `disabled` 中的个数——**按开关地址逐项计**，所以
 *   `disabled = ['mcp:a']` 只记 1，不会因为组内行也在开关集合里而重复计数；
 * - `residual` = `disabled` 中不在 `switchAddressesOf` 里的地址数（= `residualOf().length`，
 *   按地址去重）；
 * - 宇宙为 `null` 或 `layerReady:false` 时：`listed = 0`、`inDefaults = 0`、
 *   `residual = |disabled|`（界面只显示残留区）。
 *
 * @param universe - 目标无关的工具宇宙（允许 `null` / 未就绪）。
 * @param disabled - 目标档的关闭集（线上契约已归一、排序、去重）。
 * @returns 三计数。
 */
export function defaultsCountsOf(
  universe: DefaultsUniverse | null,
  disabled: readonly string[],
): DefaultsCounts {
  const addresses = switchAddressesOf(universe)
  const disabledSet = new Set(disabled)
  let inDefaults = 0
  for (const address of addresses) {
    if (disabledSet.has(address)) inDefaults += 1
  }
  return {
    listed: addresses.size,
    inDefaults,
    residual: residualOf(universe, disabled).length,
  }
}

/**
 * 残留地址（目标档里不在宇宙中的地址，升序）。
 *
 * 差集对 {@link switchAddressesOf} 的地址集合计算：宇宙为 `null` 或 `layerReady:false`
 * 时集合为空，结果就是整份关闭集的排序去重副本。排序为逐 UTF-16 码元的字典序（与宿主
 * `compareText` 同一序），输出去重——因此 `defaultsCountsOf(...).residual` 恒等于本函数
 * 结果的长度。
 *
 * @param universe - 目标无关的工具宇宙（允许 `null` / 未就绪）。
 * @param disabled - 目标档的关闭集（允许乱序；重复项按地址去重）。
 * @returns 升序的残留地址（新数组，可能是空数组）。
 */
export function residualOf(
  universe: DefaultsUniverse | null,
  disabled: readonly string[],
): readonly string[] {
  const addresses = switchAddressesOf(universe)
  const residual = new Set<string>()
  for (const address of disabled) {
    if (!addresses.has(address)) residual.add(address)
  }
  return Array.from(residual).sort()
}

/** 全局过滤后的默认档视图（页面形态的三件套读数；`code-design.md` ③ 3.4）。 */
export interface DefaultsFilterResult {
  /** 过滤后的宇宙；未过滤 / 宇宙为 null 时**原样返回入参**（identity 稳定）。 */
  readonly universe: DefaultsUniverse | null
  /** 过滤后仍展示的残留地址（差集始终相对**未过滤**宇宙计算，再筛查询词）。 */
  readonly residual: readonly string[]
  /** 查询词是否生效（trim 后非空）。 */
  readonly filtering: boolean
}

/**
 * 页面形态的全局过滤：宇宙按查询词剪枝，残差按地址再筛。
 *
 * 匹配规则（查询词 trim + `toLowerCase()` 后做「包含」判定，大小写不敏感）：
 * - 组级命中 = 组键（MCP server 名 / `builtin`）命中，或该组任一行命中 → **整组保留**；
 * - 行级命中 = `shortName` / `address` / `description` 包含查询词；
 * - 残留 chip = 地址包含查询词。
 *
 * 关键口径（防线：过滤污染残差）：`residual` 的差集始终相对**未过滤**宇宙计算——
 * 先 `residualOf(universe, disabled)` 再按地址筛查询词。过滤只剪枝展示清单，不改变
 * 「哪些档内地址不在宇宙里」的事实；若先剪枝再算差集，收窄的清单会让本该展示的
 * 残留 chip 误判成「宇宙里有」而消失。
 *
 * 未过滤（`query` 缺省 / trim 后为空）时**原样返回入参**（`universe` 保持 identity），
 * `residual` 与 {@link residualOf} 完全一致。宇宙为 `null` 时没有可剪枝的清单，
 * `universe` 照返 `null`、只有残差参与筛选。过滤后的宇宙按引用展开保留宇宙级字段
 * （`skillsAvailable` / `ungroupedMcp` / `skillsComplete`），只替换 `groups`。
 *
 * 纯函数：不改入参；同一输入两次调用深相等（未过滤分支连 identity 都相同）。
 *
 * @param universe - 目标无关的工具宇宙（允许 `null` / 未就绪）。
 * @param disabled - 目标档的关闭集（允许乱序；重复项按地址去重）。
 * @param query - 全局过滤词；`undefined` = 不启用。
 * @returns 过滤后的视图三件套。
 */
export function filterDefaultsView(
  universe: DefaultsUniverse | null,
  disabled: readonly string[],
  query: string | undefined,
): DefaultsFilterResult {
  const needle = (query ?? '').trim().toLowerCase()
  if (needle === '') {
    // 未过滤：宇宙原样返回（identity 稳定），残差走既有口径。
    return { universe, residual: residualOf(universe, disabled), filtering: false }
  }
  // 残差相对未过滤宇宙计算，再按地址筛查询词（差集事实不被过滤改变）。
  const residual = residualOf(universe, disabled).filter((address) =>
    address.toLowerCase().includes(needle),
  )
  if (universe === null) {
    return { universe, residual, filtering: true }
  }
  const groups: DefaultsGroup[] = []
  for (const group of universe.groups) {
    const filtered = filteredGroupOf(group, needle)
    if (filtered !== null) groups.push(filtered)
  }
  return { universe: { ...universe, groups }, residual, filtering: true }
}

/**
 * 按查询词过滤一个组：组级命中 = 组键命中或任一行命中，命中即保留整组（不筛行）。
 * @param group - 待过滤的组。
 * @param needle - 已 trim + 小写的查询词。
 * @returns 过滤后的组；组键与全部行都不命中时 `null`（空组丢弃）。
 */
function filteredGroupOf(group: DefaultsGroup, needle: string): DefaultsGroup | null {
  if (group.key.toLowerCase().includes(needle)) return group
  const hasRowHit = group.tools.some((entry) => entryMatchesQuery(entry, needle))
  return hasRowHit ? group : null
}

/**
 * 行级匹配：`shortName` / `address` / `description` 任一包含查询词即命中。
 * @param entry - 待匹配的条目。
 * @param needle - 已 trim + 小写的查询词。
 * @returns 是否命中。
 */
function entryMatchesQuery(entry: DefaultsEntry, needle: string): boolean {
  if (entry.shortName.toLowerCase().includes(needle)) return true
  if (entry.address.toLowerCase().includes(needle)) return true
  const description = entry.description
  return description !== undefined && description.toLowerCase().includes(needle)
}

/**
 * 用户级默认档的宇宙：从 `PanelSnapshot` 投影（D-19，零新增 wire 字段）。
 *
 * - `groups` 的 `mcp`/`builtin` 组原样投影（`ToolGroup` 的 `kind`/`key`/`address` 照搬，
 *   `tools` → `DefaultsEntry`：`address`/`shortName`/`description`/`protected`/`reserved`
 *   照搬，**丢 `disabled`**——`DefaultsEntry` 没有该字段，条目状态由目标档关闭集求交）；
 * - `kind:'skill'` 组：组地址保留 `tool:skill`，行**换成** `snapshot.skills` 的
 *   `skill:<name>`（`shortName` = 技能名，`description` 取技能行，空串视同无描述而缺省；
 *   `protected`/`reserved` 恒 `false`——技能没有保护名单 / 保留名语义）。`skills` 为空
 *   → 行空数组，组本身仍在（整档开关仍可用）；
 * - `skillsAvailable = !snapshot.notices.includes('skills-unavailable')`；
 * - `layerReady = true`：`PanelSnapshot` 不带层就绪标记，**面板形态只能保守取 `true`**
 *   （快照存在即宿主读到了这个会话；层恰好未就绪时宿主给的是空 `groups`，界面显示
 *   「空清单 + listed 0」而不是谎报 `universeUnavailable`）。统一弹窗形态没有这个歧义，
 *   `WorkspaceValue.universe.layerReady` 是宿主明说的。
 *
 * 纯函数：只为投影新建对象与数组，不改 `snapshot`；同一输入两次调用深相等。
 *
 * @param snapshot - 面板快照（分组清单 + 技能行的唯一输入）。
 * @returns 与统一弹窗形态同构的用户级宇宙。
 */
export function universeOfSnapshot(snapshot: PanelSnapshot): DefaultsUniverse {
  const groups: DefaultsGroup[] = snapshot.groups.map((group) =>
    group.kind === 'skill' ? skillGroupOf(group, snapshot.skills) : projectedGroupOf(group),
  )
  return {
    layerReady: true,
    skillsAvailable: !snapshot.notices.includes('skills-unavailable'),
    groups,
  }
}

/**
 * 投影一个 `mcp` / `builtin` 组：三个分组字段照搬，行只去掉 `disabled`。
 * @param group - 快照里的分组（`kind` 已排除 `skill`）。
 * @returns 默认档分组。
 */
function projectedGroupOf(group: ToolGroup): DefaultsGroup {
  return {
    kind: group.kind,
    key: group.key,
    address: group.address,
    tools: group.tools.map(defaultsEntryOf),
  }
}

/**
 * 投影技能组：组字段照搬（地址兜底 `tool:skill`），行换成技能分面读数里的技能名。
 * @param group - 快照里的技能组。
 * @param skills - `snapshot.skills`（技能行来源；与组的 `tools` 无关）。
 * @returns 默认档技能组。
 */
function skillGroupOf(group: ToolGroup, skills: readonly SkillView[]): DefaultsGroup {
  return {
    kind: 'skill',
    key: group.key,
    address: group.address ?? SKILL_GROUP_ADDRESS,
    tools: skills.map(skillEntryOf),
  }
}

/**
 * 造一条工具行：`ToolEntry` → `DefaultsEntry`，丢 `disabled`（其余照搬）。
 * @param tool - 快照里的工具条目。
 * @returns 默认档条目（无描述时不带 `description` 键）。
 */
function defaultsEntryOf(tool: ToolEntry): DefaultsEntry {
  return {
    address: tool.address,
    shortName: tool.shortName,
    // 条件展开：键存在但值为 undefined 会让「有没有描述」依赖访问方式（`in` 与
    // `=== undefined` 给出不同答案），与宿主 `defaultsEntryOf` 同一纪律。
    ...(tool.description === undefined ? {} : { description: tool.description }),
    protected: tool.protected,
    reserved: tool.reserved,
  }
}

/**
 * 造一条技能行：`SkillView` → `DefaultsEntry`（地址 `skill:<name>`）。
 *
 * 技能的 `protected` / `reserved` 恒 `false`：保护名单与保留名都作用于工具注册名，
 * 技能地址不在其中。空描述视同无描述（宿主 `skillEntriesOf` 的 `descriptionOf` 同口径）。
 * @param skill - 快照里的技能行。
 * @returns 默认档条目（无描述时不带 `description` 键）。
 */
function skillEntryOf(skill: SkillView): DefaultsEntry {
  // 线上契约把 description 定为 string，但投影层按「可能缺席」写（与 DefaultsEntry 的
  // 可选描述一致）：先拓宽再判，避免依赖某个调用方一定给非 undefined。
  const description: string | undefined = skill.description
  return {
    address: `skill:${skill.name}`,
    shortName: skill.name,
    ...(description === undefined || description === '' ? {} : { description }),
    protected: false,
    reserved: false,
  }
}
