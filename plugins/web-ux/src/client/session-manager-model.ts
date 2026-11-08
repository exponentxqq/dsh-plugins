/**
 * 会话管理分节的纯派生模型：把三份 Plain 快照（工作区、会话列表、已迁移列表）投影成
 * 三个会话域的行集，并提供选择操作与动作输入。
 *
 * ## 为什么单独成模块
 *
 * 管理面的**全部判据**集中在这里，组件只负责把派生结果画出来（code-design ③.6）：
 *
 * - **子代理过滤**（D14 / A14）：活跃域与已归档域都不出现 `origin === 'subagent'`
 *   的行——侧栏本来就不显示子代理，管理面出现它们会和「删除父会话级联」的既有语义
 *   打架；孤立归档子代理没有管理入口是已接受的代价；
 * - **已归档集合交集**（D14）：已归档域的行集 = `archivedSessionIds ∩ 所选工作区的
 *   sessionIds`，不是注册表全局归档集合；
 * - **伪选项聚合**（P1=A）：`'unassigned'` 选项下，已归档域列出「已归档但不属于任何
 *   工作区成员」的孤儿会话，已迁移域列出「项目目录匹配不到任何工作区」的目录；活跃域
 *   恒为空（孤儿定义即无归属，未归档会话必在持久化里，不属于本选项管辖区）；
 * - **上限截断**（P2=A / D13）：全选与动作输入都截断到 `MAX_BATCH_TARGETS`（500），
 *   {@link selectionLimitReached} 供界面提示「需分批」；
 * - **运行中置灰**（D15）：`running` 行保留在列表里（用户要能看到），但
 *   `selectable === false`，全选与动作输入都会跳过它；服务端拒绝仍是竞态兜底。
 *
 * ## 页面级工作区选择不在这里
 *
 * 「候选清单 / 默认档 / 三态编解码」归 holder：统一选择框由
 * `@dsh-plugins/workspace-config` 的页面渲染，投影在它的 `workspace-choice.ts`
 * （`pickerItems` / `defaultSelection` / `selectionKeyOf` 一族）。本模块只接一个 **id**
 * ——真实工作区 id 或 {@link UNASSIGNED_CHOICE}——据此投影行集，不再造选项、不猜默认
 * 工作区；页面下传的三态值到 id 的映射由分节完成。
 *
 * ## 纯度
 *
 * 本模块不 import React、cordis、locale、connection 或任何 store：输入全是 Plain
 * 数据（`ctx.workspaces.list` / `ctx.sessions.list` / `list-migrated` 响应的投影），
 * 输出也全是 Plain 数据，因此可以在纯 node 环境下逐条断言。它只 import 两个同样纯的
 * 模块：`../contract.ts`（共享类型与上限常量）与 `../project-key.ts`（`projectKey`
 * 正推匹配）。
 *
 * 本地化文案不在这里：行里的 `title` 可能是空串（视图用 `manager.untitled` 兜底），
 * 伪选项没有文案（空态文案由分节给），`running` / `blank` 只是标记（视图渲染
 * `manager.badge.*`）。
 *
 * ## 行序
 *
 * 活跃域与已归档域沿用 `workspace.sessionIds` 的顺序（上游的手工顺序，与侧栏分组
 * 一致），伪选项下的孤儿已归档行沿用 `archivedSessionIds` 的顺序；已迁移域按
 * `updatedAt` 倒序、同值按 `dirName` / `projectDir` 字典序（U4）。这里不做「最近
 * 使用优先」的重排——那是导航面的排序职责。
 *
 * @module dsh-plugin-web-ux/client/session-manager-model
 */

import {
  MAX_BATCH_TARGETS,
  type DisposalMode,
  type MigratedEntry,
  type MigratedListing,
  type MigratedTarget,
} from '../contract.ts'
import { workspaceForProjectDir } from '../project-key.ts'

/** 三个会话域，数组顺序即界面 tab 顺序（活跃 / 已归档 / 已迁移）。 */
export const MANAGER_TABS = ['active', 'archived', 'migrated'] as const

/** 会话域。 */
export type ManagerTab = (typeof MANAGER_TABS)[number]

/**
 * 「未分配」伪选项的 id（本插件内部哨兵，不进座位契约）。
 *
 * 真实工作区 id 是上游生成的 uuid，不会与这个字面量冲突，所以行集函数只用一个 `id`
 * 空间就能同时表达「真实工作区」与「未分配」。页面级选择框归 holder（三态值 + 行 key），
 * 这里只承接分节映射下来的 id。
 */
export const UNASSIGNED_CHOICE = 'unassigned'

/** 行集函数的取值空间：真实工作区 id，或 {@link UNASSIGNED_CHOICE}。 */
export type WorkspaceChoiceId = string

/**
 * 工作区行投影：只取管理面用到的字段。
 *
 * `WorkspaceView`（上游工作区快照的行）结构上满足它；测试只需给同形状的 Plain 对象。
 * `sessionIds` 是「登记在该工作区名下的会话」，上游按手工顺序给出——归档会话的槽位
 * 保留（A5），所以它同时也是已归档域交集的输入。
 */
export interface WorkspaceRowView {
  /** 工作区 id（`workspace.json` 的键）。 */
  readonly workspaceId: string
  /** 工作区显示标题。 */
  readonly title: string
  /** 工作区的项目目录绝对路径（只用于 `projectKey` 匹配，不用于拼路径）。 */
  readonly path: string
  /** 登记在该工作区名下的会话 id，按手工顺序。 */
  readonly sessionIds: readonly string[]
}

/** 工作区快照投影：`ctx.workspaces.list.getSnapshot()` 的切片。 */
export interface WorkspacesSnapshotView {
  /** 全部真实工作区，按 Host 分组顺序。 */
  readonly items: readonly WorkspaceRowView[]
  /** 注册表全局的归档会话集合（跨工作区）。 */
  readonly archivedSessionIds: readonly string[]
}

/** 会话行投影的输入：`ctx.sessions.list.getSnapshot().byId[id]` 的切片。 */
export interface SessionRowViewInput {
  /** 人类可读标题（可能为空串：视图用 `manager.untitled` 兜底）。 */
  readonly displayTitle: string
  /** Host 运行态；为 true 的行在活跃域与已归档域都置灰不可选（D15）。 */
  readonly running: boolean
  /** 最近更新时间（epoch ms），用于行时间与稳定排序。 */
  readonly updatedAt: number
  /** 是否为「空白会话」占位行（视图渲染 `manager.badge.blank`）。 */
  readonly blank: boolean
  /** 粗粒度来源；`'subagent'` 的行不进管理面（D14）。 */
  readonly origin?: 'subagent'
}

/** 会话列表快照投影：`ctx.sessions.list.getSnapshot()` 的切片。 */
export interface SessionsSnapshotView {
  /**
   * Host 列表成员（`SessionListState.ids`）。活跃域只用它判定成员资格——`byId` 还
   * 含「保留的子代理兜底行」，不能当成 Host 列表成员（code-design ② 的实测结论）。
   */
  readonly ids: readonly string[]
  /** 行元数据；查不到（快照漂移）的行由派生函数跳过。 */
  readonly byId: Readonly<Record<string, SessionRowViewInput | undefined>>
}

/** 活跃 / 已归档域的一行。 */
export interface SessionRowView {
  /** 跨 tab 唯一的行标识（{@link entryKeyOf} 的结果），选择集合存的就是它。 */
  readonly key: string
  /** 会话 id（动作输入用它）。 */
  readonly sessionId: string
  /** 行标题；空串表示上游没有标题，由视图兜底。 */
  readonly title: string
  /** 最近更新时间（epoch ms）。 */
  readonly updatedAt: number
  /** Host 运行态；视图据此渲染 `manager.badge.running`。 */
  readonly running: boolean
  /** 空白会话占位行；视图据此渲染 `manager.badge.blank`。 */
  readonly blank: boolean
  /** 是否可勾选：运行中的行置灰（D15），全选与动作输入都会跳过。 */
  readonly selectable: boolean
  /** 归属工作区；伪选项下的孤儿已归档行为 `null`。 */
  readonly workspaceId: string | null
}

/** 已迁移域的一行（归档根下的一条会话目录）。 */
export interface MigratedRowView {
  /** 跨 tab 唯一的行标识（{@link entryKeyOf} 的结果）。 */
  readonly key: string
  /** 会话 id（= 目录名，D12 不做前缀归一）。 */
  readonly sessionId: string
  /** 归档根下的会话目录名（回写请求的文件系统键）。 */
  readonly dirName: string
  /** 归档根下的一级项目目录名。 */
  readonly projectDir: string
  /** 目录内一层文件的体积之和（不递归，D11）。 */
  readonly bytes: number
  /** 目录 mtime（epoch ms），行时间与排序用。 */
  readonly updatedAt: number
  /** 正推匹配到的工作区；匹配不到为 `null`（伪选项聚合的对象）。 */
  readonly workspaceId: string | null
  /** 已迁移行恒可选（目录里没有运行态概念，处置由宿主校验兜底）。 */
  readonly selectable: boolean
}

/** 选择与全选能处理的行：两个域的行集在「标识 + 可勾选」上同形。 */
export type ManagerRow = SessionRowView | MigratedRowView

/**
 * 一次动作分派（code-design ③.6 的「动作分派」表）。
 *
 * 与设计概览（design.md）里的 archive/delete/unarchive/deleteMigrated/restoreMigrated
 * 是同一组语义的两种写法：`dispose` 即概览里的 delete（携带处置模式），`purge` 即
 * deleteMigrated，`restore` 即 restoreMigrated；`unarchive` 是落档期增补的 tab 2
 * 批量取消归档。动作名刻意取调用面的形状（`dispose` / `purge`）而不是语义名，避免
 * 「删除已归档会话」与「永久删除归档目录」在类型层面看起来是同一件事。
 */
export type ManagerAction =
  | { readonly kind: 'archive' }
  | { readonly kind: 'dispose'; readonly mode: DisposalMode }
  | { readonly kind: 'unarchive' }
  | { readonly kind: 'purge' }
  | { readonly kind: 'restore' }

/**
 * 选择集合：以 tab 为键（切 tab 保留各自选择），值是行标识的集合。
 *
 * 行标识跨 tab 唯一（{@link entryKeyOf} 带域前缀），所以不同 tab 的键不会互相命中；
 * 动作输入一律从「当前行集 ∩ 选择集合」投影，切换工作区后残留的键自然失效、不会
 * 被误执行。
 */
export type ManagerSelection = Readonly<Record<ManagerTab, ReadonlySet<string>>>

/** 取所选工作区；伪选项或快照里已不存在的工作区返回 `undefined`。 */
function workspaceOf(
  choice: WorkspaceChoiceId,
  workspaces: WorkspacesSnapshotView,
): WorkspaceRowView | undefined {
  if (choice === UNASSIGNED_CHOICE) return undefined
  return workspaces.items.find((workspace) => workspace.workspaceId === choice)
}

/** 全部工作区成员 id 的并集（伪选项下判定「孤儿」用）。 */
function memberSet(workspaces: WorkspacesSnapshotView): Set<string> {
  const members = new Set<string>()
  for (const workspace of workspaces.items) {
    for (const sessionId of workspace.sessionIds) members.add(sessionId)
  }
  return members
}

/**
 * 造一条活跃 / 已归档行。
 * @param tab - 行所属域（活跃或已归档）。
 * @param workspaceId - 归属工作区；伪选项下为 `null`。
 * @param sessionId - 会话 id。
 * @param summary - 该会话的行元数据投影。
 * @returns 行视图。
 */
function sessionRow(
  tab: 'active' | 'archived',
  workspaceId: string | null,
  sessionId: string,
  summary: SessionRowViewInput,
): SessionRowView {
  return {
    key: entryKeyOf(tab, sessionId),
    sessionId,
    title: summary.displayTitle,
    updatedAt: summary.updatedAt,
    running: summary.running,
    blank: summary.blank,
    // D15：运行中的行不删，只置灰；全选与动作输入按 selectable 跳过。
    selectable: !summary.running,
    workspaceId,
  }
}

/**
 * 造一行「已迁移」视图。
 * @param entry - 宿主返回的归档条目。
 * @param workspaceId - 正推匹配到的工作区；匹配不到为 `null`。
 * @returns 行视图。
 */
function migratedRow(entry: MigratedEntry, workspaceId: string | null): MigratedRowView {
  return {
    key: entryKeyOf('migrated', entry.dirName, entry.projectDir),
    sessionId: entry.sessionId,
    dirName: entry.dirName,
    projectDir: entry.projectDir,
    bytes: entry.bytes,
    updatedAt: entry.updatedAt,
    workspaceId,
    selectable: true,
  }
}

/**
 * 已迁移域的排序：`updatedAt` 倒序（最近归档在前），同值按 `dirName` 字典序；两者
 * 都相同时再按 `projectDir` 兜底，保证同一份列表每次派生的顺序完全一致（U4）。
 * @param left - 左行。
 * @param right - 右行。
 * @returns 排序比较值。
 */
function compareMigrated(left: MigratedRowView, right: MigratedRowView): number {
  if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
  if (left.dirName !== right.dirName) return left.dirName < right.dirName ? -1 : 1
  if (left.projectDir === right.projectDir) return 0
  return left.projectDir < right.projectDir ? -1 : 1
}

/**
 * 当前行集里可勾选的行标识，按行序截断到单批上限。
 *
 * 全选与「是否已全选」共用同一口径：上限之外的行选不进去，界面用
 * {@link selectionLimitReached} 提示分批，而不是让选择集合无界增长。
 * @param rows - 当前 tab 的行集。
 * @returns 可勾选的键（最多 {@link MAX_BATCH_TARGETS} 个）。
 */
function selectableKeys(rows: readonly ManagerRow[]): readonly string[] {
  const keys: string[] = []
  for (const row of rows) {
    if (!row.selectable) continue
    keys.push(row.key)
    if (keys.length >= MAX_BATCH_TARGETS) break
  }
  return keys
}

/**
 * 换掉某一个 tab 的选择集合，其余 tab 原样保留（identity 也不变）。
 * @param selection - 当前选择集合。
 * @param tab - 要替换的 tab。
 * @param next - 该 tab 的新集合。
 * @returns 新的选择集合。
 */
function withTabSelection(
  selection: ManagerSelection,
  tab: ManagerTab,
  next: ReadonlySet<string>,
): ManagerSelection {
  return {
    active: tab === 'active' ? next : selection.active,
    archived: tab === 'archived' ? next : selection.archived,
    migrated: tab === 'migrated' ? next : selection.migrated,
  }
}

/**
 * 跨 tab 唯一的行标识。
 *
 * - 活跃 / 已归档域：`<tab>:<sessionId>`；
 * - 已迁移域：`<tab>:<projectDir>/<dirName>`——同一个会话 id 可能在两个项目目录下各
 *   有一份（D3），目录名必须进键；键取 `dirName`（文件系统身份）而不是 `sessionId`，
 *   两者当前恒等但契约里刻意分开。
 *
 * 前缀让同一会话在「活跃」与「已归档」两个 tab 里是两个不同的键（选择集合按 tab
 * 分开存，执行成功后只清当前 tab）。
 * @param tab - 行所属域。
 * @param sessionId - 活跃 / 已归档域：会话 id；已迁移域：目录名。
 * @param projectDir - 已迁移域必填：归档根下的一级项目目录名。
 * @returns 跨 tab 唯一的行标识。
 */
export function entryKeyOf(tab: 'active' | 'archived', sessionId: string): string
export function entryKeyOf(tab: 'migrated', dirName: string, projectDir: string): string
export function entryKeyOf(tab: ManagerTab, id: string, projectDir?: string): string {
  return tab === 'migrated' ? `${tab}:${projectDir ?? ''}/${id}` : `${tab}:${id}`
}

/**
 * 活跃域行集：所选工作区的成员、未归档、Host 列表成员，滤掉子代理。
 *
 * 伪选项下恒为空（P1=A）；所选工作区已不在快照里（工作区被删）也返回空。失效回退
 * （重解析默认值）由 holder 页面负责（Q10），本模块不猜默认工作区。行序沿用
 * `workspace.sessionIds`，与侧栏分组顺序一致。
 * @param choice - 所选工作区 id 或 {@link UNASSIGNED_CHOICE}。
 * @param workspaces - 工作区快照投影。
 * @param sessions - 会话列表快照投影。
 * @returns 活跃行。
 */
export function activeRows(
  choice: WorkspaceChoiceId,
  workspaces: WorkspacesSnapshotView,
  sessions: SessionsSnapshotView,
): readonly SessionRowView[] {
  const workspace = workspaceOf(choice, workspaces)
  if (workspace === undefined) return []
  const archived = new Set(workspaces.archivedSessionIds)
  const listed = new Set(sessions.ids)
  const seen = new Set<string>()
  const rows: SessionRowView[] = []
  for (const sessionId of workspace.sessionIds) {
    if (seen.has(sessionId) || !listed.has(sessionId) || archived.has(sessionId)) continue
    const summary = sessions.byId[sessionId]
    if (summary === undefined || summary.origin === 'subagent') continue
    seen.add(sessionId)
    rows.push(sessionRow('active', workspace.workspaceId, sessionId, summary))
  }
  return rows
}

/**
 * 已归档域行集：归档集合与所选工作区成员的交集，滤掉子代理（D14）。
 *
 * 伪选项下改为「孤儿已归档」：`archivedSessionIds − 全部工作区成员并集`（P1=A），
 * 这类会话没有工作区入口，但同样可处置、可取消归档。行序：真实工作区沿用
 * `workspace.sessionIds`，伪选项沿用 `archivedSessionIds` 的顺序。运行中的归档会话
 * 同样置灰（D15），服务端拒绝是竞态兜底。
 * @param choice - 所选工作区 id 或 {@link UNASSIGNED_CHOICE}。
 * @param workspaces - 工作区快照投影。
 * @param sessions - 会话列表快照投影。
 * @returns 已归档行。
 */
export function archivedRows(
  choice: WorkspaceChoiceId,
  workspaces: WorkspacesSnapshotView,
  sessions: SessionsSnapshotView,
): readonly SessionRowView[] {
  const archived = new Set(workspaces.archivedSessionIds)
  const seen = new Set<string>()
  const rows: SessionRowView[] = []
  if (choice === UNASSIGNED_CHOICE) {
    const members = memberSet(workspaces)
    for (const sessionId of workspaces.archivedSessionIds) {
      if (seen.has(sessionId) || members.has(sessionId)) continue
      const summary = sessions.byId[sessionId]
      if (summary === undefined || summary.origin === 'subagent') continue
      seen.add(sessionId)
      rows.push(sessionRow('archived', null, sessionId, summary))
    }
    return rows
  }
  const workspace = workspaceOf(choice, workspaces)
  if (workspace === undefined) return []
  for (const sessionId of workspace.sessionIds) {
    if (seen.has(sessionId) || !archived.has(sessionId)) continue
    const summary = sessions.byId[sessionId]
    if (summary === undefined || summary.origin === 'subagent') continue
    seen.add(sessionId)
    rows.push(sessionRow('archived', workspace.workspaceId, sessionId, summary))
  }
  return rows
}

/**
 * 已迁移域行集：归档根条目按项目目录正推匹配工作区（`projectKey` 只做匹配，D4）。
 *
 * 真实工作区选项下只留匹配到该工作区的条目；伪选项下只留匹配不到任何工作区的
 * 条目（P1=A 的已迁移半边）。排序按 U4（`updatedAt` 倒序，同值按目录名）。
 * @param choice - 所选工作区 id 或 {@link UNASSIGNED_CHOICE}。
 * @param workspaces - 工作区快照投影（匹配输入）。
 * @param listing - `list-migrated` 响应（`archiveRoot` 不参与行派生）。
 * @returns 已迁移行。
 */
export function migratedRows(
  choice: WorkspaceChoiceId,
  workspaces: WorkspacesSnapshotView,
  listing: MigratedListing,
): readonly MigratedRowView[] {
  const seen = new Set<string>()
  const rows: MigratedRowView[] = []
  for (const entry of listing.entries) {
    const owner = workspaceForProjectDir(entry.projectDir, workspaces.items)
    const matched = choice === UNASSIGNED_CHOICE ? owner === null : owner === choice
    if (!matched) continue
    const row = migratedRow(entry, owner)
    if (seen.has(row.key)) continue
    seen.add(row.key)
    rows.push(row)
  }
  return rows.sort(compareMigrated)
}

/**
 * 一个 tab 的动作分派（code-design ③.6 的动作分派表）。
 *
 * - 活跃域：批量归档；
 * - 已归档域：**双动作**——按当前处置模式删除（`dispose`）与批量取消归档
 *   （`unarchive`，落档增补），两者共享同一选择集合；
 * - 已迁移域：物理删除（`purge`）与恢复（`restore`）。
 *
 * 动作的启用与否只取决于选择集合是否为空，由视图判断 `selection[tab].size`——那不是
 * 过滤判据，不需要进模型。
 * @param tab - 当前 tab。
 * @param mode - 已归档域当前选中的处置模式（默认迁移归档，与既有单会话删除一致）。
 * @returns 该 tab 的动作列表（按界面按钮顺序）。
 */
export function actionsForTab(tab: ManagerTab, mode: DisposalMode = 'archive'): readonly ManagerAction[] {
  switch (tab) {
    case 'active':
      return [{ kind: 'archive' }]
    case 'archived':
      return [{ kind: 'dispose', mode }, { kind: 'unarchive' }]
    case 'migrated':
      return [{ kind: 'purge' }, { kind: 'restore' }]
  }
}

/**
 * 建一个空选择集合（三个 tab 各一个空集合）。
 *
 * 每次返回全新的 `Set`：`ReadonlySet` 只是类型约束，运行时仍可被误改，共用同一份
 * 空集合会让一个 tab 的误写污染其他 tab。
 * @returns 空选择集合。
 */
export function emptySelection(): ManagerSelection {
  return { active: new Set<string>(), archived: new Set<string>(), migrated: new Set<string>() }
}

/**
 * 勾选 / 取消勾选一行。
 *
 * 加选时强制单批上限：已选满 {@link MAX_BATCH_TARGETS} 个再点新行不生效（返回原
 * 对象），界面用 {@link selectionLimitReached} 提示分批——上限判定只在模型里做，
 * 组件不重复比较数字。
 * @param selection - 当前选择集合。
 * @param tab - 行所在 tab。
 * @param key - 行的 {@link entryKeyOf} 标识。
 * @returns 新的选择集合（未变化时返回原对象，供 `useState` 跳过重渲染）。
 */
export function toggleSelection(
  selection: ManagerSelection,
  tab: ManagerTab,
  key: string,
): ManagerSelection {
  const current = selection[tab]
  if (current.has(key)) {
    const next = new Set(current)
    next.delete(key)
    return withTabSelection(selection, tab, next)
  }
  if (current.size >= MAX_BATCH_TARGETS) return selection
  const next = new Set(current)
  next.add(key)
  return withTabSelection(selection, tab, next)
}

/**
 * 清空某一个 tab 的选择（其余 tab 保留）。
 * @param selection - 当前选择集合。
 * @param tab - 要清空的 tab。
 * @returns 新的选择集合。
 */
export function clearSelection(selection: ManagerSelection, tab: ManagerTab): ManagerSelection {
  return withTabSelection(selection, tab, new Set<string>())
}

/**
 * 全选：把该 tab 当前行集里可勾选的行按行序取前 {@link MAX_BATCH_TARGETS} 个。
 *
 * 运行中的行不进全选（D15）；超限时只选前 500 个，界面据
 * {@link selectionLimitReached} 提示「需分批」。
 * @param selection - 当前选择集合（其余 tab 保留）。
 * @param tab - 当前 tab。
 * @param rows - 该 tab 的行集。
 * @returns 新的选择集合。
 */
export function selectAllSelection(
  selection: ManagerSelection,
  tab: ManagerTab,
  rows: readonly ManagerRow[],
): ManagerSelection {
  return withTabSelection(selection, tab, new Set(selectableKeys(rows)))
}

/**
 * 选择条的全选复选框是否应显示为勾选。
 *
 * 口径与 {@link selectAllSelection} 完全一致：选择集合恰好等于「可勾选行的上限截断
 * 集」时为 true。超过 500 行时全选只会选前 500 个，复选框仍显示勾选，用户再点一次
 * 即可清空（否则截断场景下复选框永远点不亮，用户无法用同一个控件清空）。
 * @param selection - 当前选择集合。
 * @param tab - 当前 tab。
 * @param rows - 该 tab 的行集。
 * @returns 是否已全选。
 */
export function allSelected(
  selection: ManagerSelection,
  tab: ManagerTab,
  rows: readonly ManagerRow[],
): boolean {
  const keys = selectableKeys(rows)
  if (keys.length === 0) return false
  const current = selection[tab]
  return current.size === keys.length && keys.every((key) => current.has(key))
}

/**
 * 当前行集里实际被选中的行数（「已选 N 个」的 N）。
 *
 * 切换工作区后选择集合里可能残留上一个工作区的键，它们不在当前行集里，不能计入
 * 显示与动作输入；动作输入同样按「当前行集 ∩ 选择集合」投影，因此不会误执行。
 * @param selection - 当前选择集合。
 * @param tab - 当前 tab。
 * @param rows - 该 tab 的行集。
 * @returns 有效选中行数。
 */
export function selectedCount(
  selection: ManagerSelection,
  tab: ManagerTab,
  rows: readonly ManagerRow[],
): number {
  const current = selection[tab]
  let count = 0
  for (const row of rows) {
    if (row.selectable && current.has(row.key)) count += 1
  }
  return count
}

/**
 * 全选是否会触发单批上限截断：该 tab 的可勾选行数超过 {@link MAX_BATCH_TARGETS}。
 *
 * 与 {@link selectAllSelection} 的截断判定同一口径；界面据此显示「条目过多，只
 * 列出前 {count} 个」的分批提示，数字用 `MAX_BATCH_TARGETS`，组件不自行比较。
 * @param rows - 该 tab 的行集。
 * @returns 是否需要截断提示。
 */
export function selectionLimitReached(rows: readonly ManagerRow[]): boolean {
  let selectable = 0
  for (const row of rows) {
    if (!row.selectable) continue
    selectable += 1
    if (selectable > MAX_BATCH_TARGETS) return true
  }
  return false
}

/**
 * 从行集与选择集合投影出会话 id（活跃域的归档循环、已归档域的处置预览都用它）。
 *
 * 按行序输出、去重、跳过不可选行（运行中）、截断到 {@link MAX_BATCH_TARGETS}；不在
 * 当前行集里的残留键自然被忽略。
 * @param rows - 当前 tab 的会话行。
 * @param selected - 该 tab 的选择集合（`selection[tab]`）。
 * @returns 要处置的会话 id。
 */
export function selectedSessionIds(
  rows: readonly SessionRowView[],
  selected: ReadonlySet<string>,
): readonly string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row.selectable || !selected.has(row.key) || seen.has(row.sessionId)) continue
    seen.add(row.sessionId)
    ids.push(row.sessionId)
    if (ids.length >= MAX_BATCH_TARGETS) break
  }
  return ids
}

/**
 * 已归档域「取消归档」的动作输入（落档增补）：当前行集里被勾选的会话 id。
 *
 * 语义与 {@link selectedSessionIds} 完全相同（按行序、去重、跳过不可选、上限 500），
 * 只是把 tab 固定为已归档域，让调用点读起来就是「这次取消归档要处理哪些会话」。
 * @param selection - 当前选择集合。
 * @param rows - 已归档域的行集。
 * @returns 要逐个调用上游 `unarchiveSession` 的会话 id。
 */
export function unarchiveSelected(
  selection: ManagerSelection,
  rows: readonly SessionRowView[],
): readonly string[] {
  return selectedSessionIds(rows, selection.archived)
}

/**
 * 已迁移域的动作输入：被勾选的条目投影成线上请求目标（`projectDir` + `dirName`）。
 *
 * 按行序、按 `projectDir/dirName` 去重、截断到 {@link MAX_BATCH_TARGETS}；体积/时间
 * 不进请求（宿主只按身份定位）。`deleteMigrated` 与 `restoreMigrated` 共用这份输入。
 * @param rows - 已迁移域的行集。
 * @param selected - 该 tab 的选择集合（`selection.migrated`）。
 * @returns 要处置的归档条目目标。
 */
export function selectedMigratedTargets(
  rows: readonly MigratedRowView[],
  selected: ReadonlySet<string>,
): readonly MigratedTarget[] {
  const targets: MigratedTarget[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!selected.has(row.key)) continue
    const identity = `${row.projectDir}/${row.dirName}`
    if (seen.has(identity)) continue
    seen.add(identity)
    targets.push({ projectDir: row.projectDir, dirName: row.dirName })
    if (targets.length >= MAX_BATCH_TARGETS) break
  }
  return targets
}
