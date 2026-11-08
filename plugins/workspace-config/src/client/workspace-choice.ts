/**
 * 页面级工作区选择值的**纯投影层**（code-design ③ 3.7、Q8 / Q10）。
 *
 * 页面只持有一个三态选择值（`WorkspaceConfigWorkspaceContext`），本模块承担它的全部
 * 无副作用推导：
 *
 * 1. **候选投影**（{@link pickerItems}）：真实工作区按 **Host 顺序**逐个变成选择值，
 *    「未分配」恒排最后（Q8）——空清单时候选只剩它一项，选择框仍可用。
 * 2. **行 id 编解码**（{@link selectionKeyOf} / {@link selectionFromKey}）：`Menu` 的
 *    `selectedId` / `onSelect` 只认字符串，三态与行 id 的映射全仓只此一处；组件里的
 *    `onSelect` 拿 key、解回值再上调，受控面因此始终是「值而非 key」。
 * 3. **默认选择**（{@link defaultSelection}）：Q10 三档——最近使用 > 当前会话 > 第一项，
 *    清单为空 → 「未分配」。
 * 4. **显示文案**（{@link selectionLabelOf}）：`title` 非空用它，否则用 `path`，二者皆空
 *    才用调用方兜底（未分配 / 未就绪文案）。
 *
 * 本模块刻意**零运行时依赖**：`WorkspaceChoiceItem` 与三态类型都只以 `import type` 取用
 * （编译期擦除），所以它可以被 node 直测，也可以被页面、选择框与将来的分节适配共用。
 *
 * @module dsh-plugin-workspace-config/client/workspace-choice
 */

import type { WorkspaceConfigWorkspaceContext } from '@dsh-plugins/contracts'
import type { WorkspaceChoiceItem } from './workspace-source.ts'

/** 选择框的「未分配」特殊项（Q8；候选里恒排最后）。 */
export const UNASSIGNED: WorkspaceConfigWorkspaceContext = { kind: 'unassigned' }

/** 「拿不到工作区上下文」（清单未就绪 / 服务缺席）——页面下传的空态值。 */
export const NO_CONTEXT: WorkspaceConfigWorkspaceContext = { kind: 'none' }

/** 工作区行 id 的前缀：`workspace:<id>`（`id` 原样拼接，不再转义）。 */
const WORKSPACE_KEY_PREFIX = 'workspace:'

/** 「未分配」行 id（不带前缀，`workspace:` 前缀保证它不会与真实工作区 id 撞车）。 */
const UNASSIGNED_KEY = 'unassigned'

/** 「无上下文」行 id（候选里没有这一项，编解码保持对称以便往返测试与日志排查）。 */
const NO_CONTEXT_KEY = 'none'

/**
 * 选择框的候选：真实工作区（Host 顺序）+ 末项「未分配」（Q8）。
 *
 * 不排序、不去重、不筛空标题——顺序与内容完全由清单源决定（与侧栏一致）；「未分配」
 * 用常量引用追加在末尾，调用方可以用 `===` 断言它排在最后。
 *
 * @param items - 清单源投影出的工作区行（Host 顺序）。
 * @returns 选择值候选；`items` 为空时只含 {@link UNASSIGNED}。
 */
export function pickerItems(
  items: readonly WorkspaceChoiceItem[],
): readonly WorkspaceConfigWorkspaceContext[] {
  return [...items.map(selectionOfItem), UNASSIGNED]
}

/**
 * 把一条清单行变成选择值。
 *
 * `sessionIds` 只服务默认策略的「最近使用」读数，不进选择值（owner 份额是纯数据，
 * 分节不关心会话账本）。
 *
 * @param item - 清单源的一行。
 * @returns `{ kind: 'workspace', id, title, path }`。
 */
export function selectionOfItem(item: WorkspaceChoiceItem): WorkspaceConfigWorkspaceContext {
  return { kind: 'workspace', id: item.id, title: item.title, path: item.path }
}

/**
 * 选择值 → `Menu` 行 id（`workspace:<id>` / `unassigned` / `none`）。
 *
 * @param selection - 当前选择值（三态之一）。
 * @returns 行 id；与 {@link selectionFromKey} 配对，是全仓唯一的编码点。
 */
export function selectionKeyOf(selection: WorkspaceConfigWorkspaceContext): string {
  switch (selection.kind) {
    case 'workspace':
      return `${WORKSPACE_KEY_PREFIX}${selection.id}`
    case 'unassigned':
      return UNASSIGNED_KEY
    case 'none':
      return NO_CONTEXT_KEY
  }
}

/**
 * `Menu` 行 id → 选择值（与 {@link selectionKeyOf} 配对，唯一的解码点）。
 *
 * `unassigned` / `none` 是固定 id，直接解出常量；`workspace:<id>` 只认**候选里存在**的
 * 那一个工作区——工作区被删 / 列表刷新后旧 id 失效即返回 `undefined`，调用方保持现值
 * （页面随后按 Q10 重解析默认档，见 ③ 3.5 的 `chosenValid`）。
 *
 * @param key - `Menu` 回传的行 id。
 * @param items - 当前候选（`pickerItems` 的产物）。
 * @returns 命中的选择值；固定 id 之外认不出或候选里没有该工作区时 `undefined`。
 */
export function selectionFromKey(
  key: string,
  items: readonly WorkspaceConfigWorkspaceContext[],
): WorkspaceConfigWorkspaceContext | undefined {
  if (key === UNASSIGNED_KEY) return UNASSIGNED
  if (key === NO_CONTEXT_KEY) return NO_CONTEXT
  if (!key.startsWith(WORKSPACE_KEY_PREFIX)) return undefined
  const id = key.slice(WORKSPACE_KEY_PREFIX.length)
  return items.find((item) => item.kind === 'workspace' && item.id === id)
}

/**
 * 默认选择（Q10：最近使用 > 当前会话 > 第一项；无工作区 → 未分配）。
 *
 * 1. 每个工作区取成员会话的最大 `updatedAt`，取最大者；**并列取 Host 顺序在前**
 *    （严格大于才替换，因此先到者胜）。只认 `updatedAt > 0` 且有限的读数。
 * 2. 无任何有效 `updatedAt` 时，取「当前会话所属工作区」（`sessionIds` 命中）。
 * 3. 否则取 `items[0]`；`items` 为空取 {@link UNASSIGNED}。
 *
 * @param items - 清单源投影出的工作区行（Host 顺序）。
 * @param usage - 会话 `updatedAt` 读数（`updatedAtById`）；服务缺席时 `undefined`。
 * @param currentSessionId - 当前会话 id（探测不出时 `undefined`）。
 * @returns 应当默认选中的选择值。
 */
export function defaultSelection(
  items: readonly WorkspaceChoiceItem[],
  usage: Readonly<Record<string, { readonly updatedAt: number }>> | undefined,
  currentSessionId: string | undefined,
): WorkspaceConfigWorkspaceContext {
  if (items.length === 0) return UNASSIGNED

  let mostRecent: WorkspaceChoiceItem | undefined
  let mostRecentUpdatedAt = 0
  for (const item of items) {
    const updatedAt = latestUpdatedAtOf(item, usage)
    // 严格大于：并列时先遍历到的工作区（Host 顺序在前）保留，不替换。
    if (updatedAt > mostRecentUpdatedAt) {
      mostRecent = item
      mostRecentUpdatedAt = updatedAt
    }
  }
  if (mostRecent !== undefined) return selectionOfItem(mostRecent)

  if (currentSessionId !== undefined) {
    const own = items.find((item) => item.sessionIds.includes(currentSessionId))
    if (own !== undefined) return selectionOfItem(own)
  }

  const first = items[0]
  return first === undefined ? UNASSIGNED : selectionOfItem(first)
}

/**
 * 显示文案：`title` 非空用它，否则用 `path`，二者皆空用调用方兜底（未分配/未就绪文案）。
 *
 * 「未分配」与「无上下文」没有标题可言，恒用兜底文案（选择框在 `none` 时根本不用这条
 * 路径——它换成未就绪文案并禁用，见 ③ 3.8）。
 *
 * @param selection - 要显示的选择值。
 * @param fallback - 调用方的兜底文案（未分配 / 未就绪）。
 * @returns 显示用字符串（可能是空串之外任意输入）。
 */
export function selectionLabelOf(
  selection: WorkspaceConfigWorkspaceContext,
  fallback: string,
): string {
  if (selection.kind !== 'workspace') return fallback
  if (selection.title !== '') return selection.title
  if (selection.path !== '') return selection.path
  return fallback
}

/**
 * 一条清单行里成员会话的最大 `updatedAt`（只用于最近使用的比较）。
 *
 * 非有限读数（`NaN` / `Infinity`）与负值视同「没有读数」：它们不是有效的「最近使用」，
 * 否则一个坏读数会永久压制所有工作区（与 client-kit `sessionUsageOf` 的保守语义一致）。
 *
 * @param item - 清单源的一行。
 * @param usage - 会话 `updatedAt` 读数；`undefined` 时无读数。
 * @returns 该行成员会话的最大有效 `updatedAt`；没有时 `0`。
 */
function latestUpdatedAtOf(
  item: WorkspaceChoiceItem,
  usage: Readonly<Record<string, { readonly updatedAt: number }>> | undefined,
): number {
  if (usage === undefined) return 0
  let latest = 0
  for (const sessionId of item.sessionIds) {
    const entry = usage[sessionId]
    if (entry === undefined) continue
    if (Number.isFinite(entry.updatedAt) && entry.updatedAt > latest) latest = entry.updatedAt
  }
  return latest
}
