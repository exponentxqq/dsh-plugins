/**
 * 会话管理分节：统一「工作区配置」弹窗里的第三项（`workspace-config.section`，order 30）。
 *
 * ## 座位与挂载形态
 *
 * 本文件不再注册任何 slot，也不拥有弹窗：`client/index.ts` 以贡献方统一形状把
 * {@link SessionManagerSection} 注册到 holder 声明的 `workspace-config.section` 上，由统一
 * 弹窗按 nav 选中项经 `renderSlot(..., { only })` 渲染。因此**五阶段状态机整体内联在分节
 * 里**（换的只是弹窗右栏的卡片主体），分节自身不渲染 `Modal`、不处理 Escape / 遮罩点击，
 * 关闭由座位 owner 份额提供（`close`，弹窗开合归 holder 所有）。
 *
 * ## 一个分节，五个阶段（D8 / D10）
 *
 * | phase | 主体 | 行内动作条 |
 * |---|---|---|
 * | `select` | 三 tab 列表 + 选择条 | `[取消]` + 该 tab 的动作按钮 |
 * | `confirm` | 摘要 / 被拒清单 / 恢复或删除警示 | `[返回]` + `[确认执行]` |
 * | `running` | `manager.running` | `[取消]`（禁用） |
 * | `done` | 结果计数 + 逐项失败 + warnings | `[关闭]` |
 * | `failed` | 失败码文案 + 宿主兜底 message | `[返回]` + `[关闭]` |
 *
 * 统一弹窗没有统一 footer（D10）：动作条随阶段变化，阶段知识只在本分节里，所以它作为
 * 正文末尾的行内动作条渲染，而不是塞进 holder 的壳。
 *
 * ## 关闭语义（D16）
 *
 * `running` 阶段请求已经发出，界面不能撤销它——分节里的「取消」保持禁用；但**关闭不再被
 * 分节否决**：统一弹窗的关闭按钮 / Escape / 遮罩点击由 holder 直接执行 `open.close()`，
 * 不经过本分节的任何判断。请求在宿主侧继续完成，重新打开分节看列表即可验证结果。这条
 * 行为同时写进 README 与冒烟清单。
 *
 * ## 数据面：判据全部在 model
 *
 * 三份 Plain 快照（`workspaces.list` / `sessions.list` / `list-migrated`）经
 * `session-manager-model.ts` 投影成行集、选项、选择与动作输入。本组件**不写任何过滤
 * 判据**（子代理过滤、归档交集、伪选项聚合、500 上限、running 置灰全部在 model），只做
 * 「把派生结果画出来 + 按阶段分派调用」两件事：
 *
 * - tab 1 `active`：`activeRows` + 批量归档（逐项调用上游 `archiveSession`）；
 * - tab 2 `archived`：`archivedRows` + **双动作**（按本地处置模式 `disposeBatch`；批量
 *   `unarchiveSession`），两者共享同一选择集合；
 * - tab 3 `migrated`：`migratedRows` + `deleteMigrated` / `restoreMigrated`。
 *
 * ## 失败语义：四动作不是一回事
 *
 * - **批量归档 / 批量取消归档**：上游单调用面是**可逆的 registry 操作**，客户端按会话
 *   逐个执行并逐项收集成败（`manager.partial` / `manager.itemFailure`），不适用整单拒绝；
 * - **已归档删除**：`previewBatch` 先在宿主一次算清（软失败清单在确认页剔除并明示），
 *   确认后 `disposeBatch` 发送**剔除了被拒项的那批**——宿主当次重新校验，drift 时整单
 *   拒绝且零副作用，界面落 `failed` 并呈现宿主回传的失败码（首拒码）；
 * - **已迁移删除 / 恢复**：没有预览端点（体积与条数在客户端即可聚合），确认后一次调用；
 *   校验阶段整单拒绝，文件动作失败不回滚、进 `warnings` 逐条列出；
 * - **恢复**（P3=A）：成功后**停在原 tab** 展示 `RestoreOutcome`（恢复数 + 未分组拆分 +
 *   warnings），不自动切走——结果面板与列表同时变化会让人以为条目「丢了」。
 *
 * ## 在途互斥
 *
 * 任一动作在途时阶段已切到 `running`：动作按钮与选择条一起从界面上消失（比逐个 disabled
 * 更彻底，也避免用户在请求已发出后继续改选择），同一时刻只可能有一个动作在飞。tab 2 的
 * 双动作因此天然互斥，不需要额外的锁。
 *
 * ## 软降级（D9 / D18）
 *
 * `client` / `workspaces` / `sessions` 任一缺席 → 分节渲染 `manager.unavailable` 空态。
 * 旧壳里 `client === undefined` 是整颗浮层 `return null`；迁移后 null 等于右列一片空白，
 * 而 nav 仍高亮着「会话管理」，用户既无解释也无从重试——所以改成可见空态（D9）。
 *
 * ## A13：`Menu` 的 portal 在统一弹窗内
 *
 * 工作区选择器用 primitives 的 `Menu`，且默认 `portal: true`（列表渲染到 `document.body`，
 * 否则会被弹窗的滚动容器/遮罩裁剪）。A13 的验证路径：jsdom 按 role 查询不依赖 portal
 * 落点；真机走查菜单不被裁剪、Escape 先关菜单再关弹窗。失败时把
 * {@link WORKSPACE_MENU_PORTAL} 改成 `false` 即可单点退回原地渲染。
 *
 * @module dsh-plugin-web-ux/client/SessionManagerDialog
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  Button,
  Checkbox,
  IconChevronDownOutlineRegular,
  IconRefreshOutlineRegular,
  Menu,
  SegmentedTabs,
  type SegmentedTab,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// 类型专用：统一「工作区配置」分节的 owner 份额（只有 `close`）。holder 不进 bundle，
// 这里只消费类型（D3）。
import type { WorkspaceConfigSectionOwnerProps } from 'dsh-plugin-workspace-config/client'
import {
  MAX_BATCH_TARGETS,
  MAX_LISTED_MIGRATED,
  type DeleteBatchPreview,
  type DisposalMode,
  type MigratedListing,
  type MigratedTarget,
  type RestoredEntry,
} from '../contract.ts'
import { DeleteError, errorKeyOf, type SessionManagerClient } from './delete-client.ts'
// 复用既有对话框的两个纯工具：默认档（迁移归档，与单会话删除一致）与体积格式化
// （`format.bytes|kb|mb` 的同一套四舍五入）。两者都不带状态，跨文件复用不引入耦合。
import { DEFAULT_DISPOSAL_MODE, formatSize } from './DeleteSessionDialog.tsx'
import {
  UNASSIGNED_CHOICE,
  actionsForTab,
  activeRows,
  allSelected,
  archivedRows,
  clearSelection,
  defaultWorkspaceChoice,
  emptySelection,
  migratedRows,
  selectedCount,
  selectedMigratedTargets,
  selectedSessionIds,
  selectAllSelection,
  selectionLimitReached,
  toggleSelection,
  unarchiveSelected,
  workspaceChoices,
  type ManagerAction,
  type ManagerRow,
  type ManagerSelection,
  type ManagerTab,
  type SessionRowView,
  type SessionsSnapshotView,
  type WorkspaceChoiceId,
  type WorkspacesSnapshotView,
} from './session-manager-model.ts'
import { NS, type Key } from './locales.ts'
import css from './session-manager.module.css'

/** 管理浮层在一次打开请求内的阶段（code-design ③.6 的阶段机）。 */
export type ManagerPhase = 'select' | 'confirm' | 'running' | 'done' | 'failed'

/**
 * 工作区选择菜单是否用 portal 渲染（A13 的唯一开关）。
 *
 * 默认 `true`：统一弹窗的正文在滚动容器里，原地菜单会被裁剪。若真机验证发现它与弹窗的
 * 焦点/层级冲突（详见模块注释的验证路径），把它改成 `false` 即退回原地渲染。
 */
export const WORKSPACE_MENU_PORTAL = true

/**
 * 工作区选择器与三 tab 的 DOM id（tab ↔ panel 互指，`SegmentedTabs` 要求一一对应）。
 * 浮层同一时刻只有一个实例，常量足够，也便于用例按 id 断言可访问性关联。
 */
const TAB_IDS: Readonly<Record<ManagerTab, { readonly tab: string; readonly panel: string }>> = {
  active: { tab: 'web-ux-manager-tab-active', panel: 'web-ux-manager-panel-active' },
  archived: { tab: 'web-ux-manager-tab-archived', panel: 'web-ux-manager-panel-archived' },
  migrated: { tab: 'web-ux-manager-tab-migrated', panel: 'web-ux-manager-panel-migrated' },
}

/** 动作 → 按钮文案键。 */
const ACTION_LABELS = {
  archive: 'manager.action.archive',
  dispose: 'manager.action.dispose',
  unarchive: 'manager.action.unarchive',
  purge: 'manager.action.purge',
  restore: 'manager.action.restore',
} as const satisfies Record<ManagerAction['kind'], Key>

/**
 * footer 的动作按钮次序：可逆动作在前、危险动作最后。
 *
 * 动作**集合**来自 model 的 `actionsForTab`（分派的唯一依据），这里只调换呈现顺序——
 * 与 code-design ③.6 的 footer 清单一致（tab 3 是 `[恢复所选]` 在前、`[永久删除所选]`
 * 收尾），避免危险按钮夹在中间。
 */
const ACTION_ORDER: readonly ManagerAction['kind'][] = ['archive', 'dispose', 'unarchive', 'restore', 'purge']

/**
 * 工作区快照的注入面（结构式声明，不 import 上游服务完整类型）。
 * `ctx.workspaces`（`IWorkspaces`）在结构上满足它。
 */
export interface WorkspacesSource {
  /** 身份稳定的工作区快照 + 订阅面。 */
  readonly list: {
    /**
     * 读取当前快照。
     * @returns 工作区行与全局归档集合。
     */
    getSnapshot(): WorkspacesSnapshotView
    /**
     * 订阅快照变化。
     * @param listener - 失效回调。
     * @returns 退订函数。
     */
    subscribe(listener: () => void): () => void
  }
  /**
   * 归档一个会话（tab 1 的批量归档逐项调用它）。
   * @param sessionId - 目标会话。
   * @param options - `stopActivity` 不会被本界面使用（不自动停止运行中的工作）。
   * @returns 完成后落定。
   */
  archiveSession(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<void>
  /**
   * 取消归档一个会话（tab 2 的批量取消归档逐项调用它）。
   * @param sessionId - 目标会话。
   * @returns 完成后落定。
   */
  unarchiveSession(sessionId: string): Promise<void>
}

/**
 * 会话列表快照的注入面（结构式声明）。`ctx.sessions`（`ISessions`）在结构上满足它；
 * 浮层只读快照，不使用 retain/open 等会话生命周期能力。
 */
export interface SessionsSource {
  /** 身份稳定的会话列表快照 + 订阅面。 */
  readonly list: {
    /**
     * 读取当前快照。
     * @returns Host 列表成员与行元数据。
     */
    getSnapshot(): SessionsSnapshotView
    /**
     * 订阅快照变化。
     * @param listener - 失效回调。
     * @returns 退订函数。
     */
    subscribe(listener: () => void): () => void
  }
}

/** 本分节的注入面（三个服务都在渲染期解析，可能缺席）。 */
export interface SessionManagerSectionInjected {
  /** `/web-ux` 通道客户端；connection 服务未就绪时为 `undefined`（渲染不可用空态）。 */
  readonly client: SessionManagerClient | undefined
  /** 工作区快照与归档/取消归档动作；服务未就绪时为 `undefined`（渲染不可用空态）。 */
  readonly workspaces: WorkspacesSource | undefined
  /** 会话列表快照；服务未就绪时为 `undefined`（渲染不可用空态）。 */
  readonly sessions: SessionsSource | undefined
}

/**
 * 完整 props：分节座位的 owner 份额（`{ close }`，弹窗开合归 holder）+ 本命名空间的
 * `t` + 分节注入面。
 */
export type SessionManagerSectionProps = WorkspaceConfigSectionOwnerProps
  & PropsLocale<typeof NS>
  & SessionManagerSectionInjected

/** 一次动作里逐项失败的一行：`reason` 已本地化（失败码查表或上游 message）。 */
interface ItemFailure {
  /** 失败项的目标（会话 id 或归档条目 id）。 */
  readonly id: string
  /** 本地化后的原因。 */
  readonly reason: string
}

/**
 * 动作成功后的结果面板数据。
 *
 * 五类动作的「成功」形状不同：可逆 registry 操作（归档 / 取消归档）逐项成败；批量处置与
 * 物理删除给「已移除 id + 文件失败 warnings」；恢复给「恢复条目 + 降级 warnings」。
 */
type ManagerOutcome =
  | { readonly kind: 'archive'; readonly ok: number; readonly failures: readonly ItemFailure[] }
  | { readonly kind: 'unarchive'; readonly ok: number; readonly failures: readonly ItemFailure[] }
  | { readonly kind: 'dispose'; readonly ok: number; readonly warnings: readonly string[] }
  | { readonly kind: 'purge'; readonly ok: number; readonly warnings: readonly string[] }
  | { readonly kind: 'restore'; readonly restored: readonly RestoredEntry[]; readonly warnings: readonly string[] }

/**
 * `confirm` 阶段冻结的一批执行输入。
 *
 * 确认页的数字必须来自**当次**预览（或本地聚合），执行又必须用**同一批**目标，因此身份、
 * 模式与预览一起冻结在这里；从 confirm 返回再改选择即丢弃它（`resetToSelect`）。
 */
type PendingBatch =
  | { readonly kind: 'archive'; readonly ids: readonly string[] }
  | { readonly kind: 'unarchive'; readonly ids: readonly string[] }
  | {
      readonly kind: 'dispose'
      readonly ids: readonly string[]
      readonly mode: DisposalMode
      readonly preview: DeleteBatchPreview
    }
  | { readonly kind: 'purge'; readonly targets: readonly MigratedTarget[]; readonly bytes: number }
  | { readonly kind: 'restore'; readonly targets: readonly MigratedTarget[]; readonly bytes: number }

/** 「已迁移」列表的加载态（列表是宿主按需拉取的，与本地两个快照不同）。 */
type ListingPhase = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * 拼 class（本插件没有 clsx 依赖，三行足够）。
 * @param values - 类名或假值。
 * @returns 以空格分隔的类名串。
 */
function cx(...values: readonly (string | false | null | undefined)[]): string {
  let result = ''
  for (const value of values) {
    if (typeof value !== 'string' || value === '') continue
    result = result === '' ? value : `${result} ${value}`
  }
  return result
}

/**
 * 从任意抛出物里取稳定失败码：本插件客户端给 `code`（`DeleteError`），上游 registry 拒绝
 * 把码放在 `rpcError.code`（`WorkspaceArchiveError`）。两者都没有时返回 `undefined`，由调用
 * 方决定回退文案。
 * @param error - 抛出值。
 * @returns 稳定失败码，或 `undefined`。
 */
function failureCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as {
    readonly code?: unknown
    readonly rpcError?: { readonly code?: unknown }
  }
  if (typeof candidate.code === 'string' && candidate.code !== '') return candidate.code
  const rpc = candidate.rpcError
  if (rpc !== undefined && typeof rpc.code === 'string' && rpc.code !== '') return rpc.code
  return undefined
}

/**
 * 把任意抛出物归一成可渲染的 {@link DeleteError}（整单失败路径用）。
 * @param error - 预览/执行调用抛出的值。
 * @returns 带稳定失败码的错误；非 DeleteError 一律按自身失败码或 `fallback` 处理。
 */
function asManagerError(error: unknown): DeleteError {
  if (error instanceof DeleteError) return error
  const message = error instanceof Error ? error.message : String(error)
  return new DeleteError(failureCodeOf(error) ?? 'fallback', message)
}

/**
 * 逐项失败的本地化原因：有稳定码就查 `error.<code>` 表（未知码回退 `error.fallback`），
 * 没有码才退到上游 message（宿主兜底说明，不参与本地化）。
 * @param error - 单项调用抛出的值。
 * @param t - 本命名空间的翻译函数。
 * @returns 可渲染的原因文案。
 */
function reasonOf(error: unknown, t: Translate): string {
  const code = failureCodeOf(error)
  if (code !== undefined) return t(errorKeyOf(code))
  if (error instanceof Error && error.message !== '') return error.message
  return String(error)
}

/**
 * 行时间：本地化日期时间串（设计明确不用 primitives 的 `relativeTime`，避免给测试替身
 * 再加一个导出）。
 * @param updatedAt - epoch ms。
 * @returns `toLocaleString()` 的结果。
 */
function formatTime(updatedAt: number): string {
  return new Date(updatedAt).toLocaleString()
}

/**
 * 订阅工作区快照。
 *
 * 注入面可能每次渲染都是新对象（渲染期软读），而订阅与读取必须稳定：两者都骑 `ref`，
 * `useMemo` 不依赖注入面 identity，避免每次渲染退订重订。上游快照本身 identity 稳定，
 * 因此 `getSnapshot` 直接返回它；第三参数给 SSR（`renderToStaticMarkup`）兜底。
 * @param source - 工作区注入面。
 * @returns 当前快照。
 */
function useWorkspacesSnapshot(source: WorkspacesSource): WorkspacesSnapshotView {
  const ref = useRef(source)
  ref.current = source
  const subscribe = useMemo(() => (listener: () => void) => ref.current.list.subscribe(listener), [])
  const read = useMemo(() => () => ref.current.list.getSnapshot(), [])
  return useSyncExternalStore(subscribe, read, read)
}

/**
 * 订阅会话列表快照（与 {@link useWorkspacesSnapshot} 同构）。
 * @param source - 会话注入面。
 * @returns 当前快照。
 */
function useSessionsSnapshot(source: SessionsSource): SessionsSnapshotView {
  const ref = useRef(source)
  ref.current = source
  const subscribe = useMemo(() => (listener: () => void) => ref.current.list.subscribe(listener), [])
  const read = useMemo(() => () => ref.current.list.getSnapshot(), [])
  return useSyncExternalStore(subscribe, read, read)
}

/** 分节主体的 props：三个服务都已确定（外层已把缺席形态挡掉）。 */
interface SessionManagerContentProps {
  /** 通道客户端（确定可用）。 */
  readonly client: SessionManagerClient
  /** 工作区快照与归档/取消归档动作（确定可用）。 */
  readonly workspaces: WorkspacesSource
  /** 会话列表快照（确定可用）。 */
  readonly sessions: SessionsSource
  /** 本命名空间的翻译函数。 */
  readonly t: SessionManagerSectionProps['t']
  /** 座位 owner 的关闭动作（关闭统一弹窗；弹窗开合归 holder）。 */
  readonly close: () => void
}

/** 本文件里的 `t` 形状（从 props 派生，避免重复声明键域）。 */
type Translate = SessionManagerSectionProps['t']

/**
 * 会话管理分节：统一「工作区配置」弹窗右栏里的卡片主体。
 *
 * 三个服务任一缺席时渲染 `manager.unavailable` 空态而不是 `null`（D9）：新壳里 null 等于
 * 右列一片空白，nav 却高亮着本节。确定可用时交给 {@link SessionManagerContent} 持有五阶段
 * 状态机（hooks 只在服务齐全后调用，避免缺席 ↔ 就绪切换时 hooks 数量变化）。
 * @param props - 座位 owner 的 `close`、三个注入面与 `t`。
 * @returns 空态或完整管理面。
 */
export function SessionManagerSection({
  client,
  workspaces,
  sessions,
  t,
  close,
}: SessionManagerSectionProps): ReactNode {
  if (client === undefined || workspaces === undefined || sessions === undefined) {
    return (
      <div className={css.sectionBody}>
        <p className={css.empty}>{t('manager.unavailable')}</p>
      </div>
    )
  }
  return (
    <SessionManagerContent
      client={client}
      workspaces={workspaces}
      sessions={sessions}
      t={t}
      close={close}
    />
  )
}

/**
 * 五阶段管理面本体：工作区选择 → 三 tab 列表 → 动作 →（预览）确认 → 执行 → 结果。
 * @param props - 三个注入面、座位 owner 的关闭动作与 `t`。
 * @returns 分节正文（含正文末尾的行内动作条）。
 */
function SessionManagerContent({ client, workspaces, sessions, t, close }: SessionManagerContentProps): ReactNode {
  const workspacesSnapshot = useWorkspacesSnapshot(workspaces)
  const sessionsSnapshot = useSessionsSnapshot(sessions)
  const choices = useMemo(() => workspaceChoices(workspacesSnapshot), [workspacesSnapshot])

  const [phase, setPhase] = useState<ManagerPhase>('select')
  const [tab, setTab] = useState<ManagerTab>('active')
  const [choice, setChoice] = useState<WorkspaceChoiceId>(
    () => defaultWorkspaceChoice(workspacesSnapshot, sessionsSnapshot),
  )
  const [selection, setSelection] = useState<ManagerSelection>(emptySelection)
  // tab 2 的处置模式：默认迁移归档（与既有单会话删除一致），切换即丢弃上批预览。
  const [mode, setMode] = useState<DisposalMode>(DEFAULT_DISPOSAL_MODE)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pending, setPending] = useState<PendingBatch | null>(null)
  const [outcome, setOutcome] = useState<ManagerOutcome | null>(null)
  const [failure, setFailure] = useState<DeleteError | null>(null)
  const [listing, setListing] = useState<MigratedListing | null>(null)
  const [listingPhase, setListingPhase] = useState<ListingPhase>('idle')
  const [listingError, setListingError] = useState<DeleteError | null>(null)
  const [listingToken, setListingToken] = useState(0)
  const listingLoaded = useRef(false)

  // 默认工作区（最近使用优先）：快照若晚于浮层到达，第一次拿到非空列表时补选；选中的
  // 工作区被删掉时回退到默认档——两种情况都不让选择框指向一个不存在的范围。
  const defaultSettled = useRef(workspacesSnapshot.items.length > 0)
  useEffect(() => {
    if (!defaultSettled.current) {
      if (workspacesSnapshot.items.length === 0) return
      defaultSettled.current = true
      setChoice(defaultWorkspaceChoice(workspacesSnapshot, sessionsSnapshot))
      return
    }
    if (choices.some((item) => item.id === choice)) return
    setChoice(defaultWorkspaceChoice(workspacesSnapshot, sessionsSnapshot))
  }, [choices, choice, sessionsSnapshot, workspacesSnapshot])

  // 「已迁移」列表：首次进入该 tab 才向宿主拉取；点「刷新」与 purge/restore 成功后重发
  // （U2 不轮询）。拉取失败只影响本 tab，界面给可重试的失败文案，不落到整单 failed。
  useEffect(() => {
    if (tab !== 'migrated' || listingLoaded.current) return
    let cancelled = false
    setListingPhase('loading')
    setListingError(null)
    void client.listMigrated().then(
      (value) => {
        if (cancelled) return
        listingLoaded.current = true
        setListing(value)
        setListingPhase('ready')
      },
      (error: unknown) => {
        if (cancelled) return
        setListingError(asManagerError(error))
        setListingPhase('failed')
      },
    )
    return () => {
      cancelled = true
    }
  }, [client, listingToken, tab])

  // —— 行集派生：全部走 model，组件不写过滤判据 ——
  const activeRowList = useMemo(
    () => activeRows(choice, workspacesSnapshot, sessionsSnapshot),
    [choice, sessionsSnapshot, workspacesSnapshot],
  )
  const archivedRowList = useMemo(
    () => archivedRows(choice, workspacesSnapshot, sessionsSnapshot),
    [choice, sessionsSnapshot, workspacesSnapshot],
  )
  const migratedRowList = useMemo(
    () => (listing === null ? [] : migratedRows(choice, workspacesSnapshot, listing)),
    [choice, listing, workspacesSnapshot],
  )
  // 列表与选择条共用的「当前行集」：活跃 / 已归档两个域的行同形，已迁移域另成一支。
  const sessionRowList: readonly SessionRowView[] = tab === 'active' ? activeRowList : archivedRowList
  const rows: readonly ManagerRow[] = tab === 'migrated' ? migratedRowList : sessionRowList
  const effectiveCount = selectedCount(selection, tab, rows)
  const everySelected = allSelected(selection, tab, rows)
  const truncatedCount = tab === 'migrated' && listing?.truncated === true
    ? MAX_LISTED_MIGRATED
    : selectionLimitReached(rows)
      ? MAX_BATCH_TARGETS
      : null

  /**
   * 当前范围为空时的解释文案。
   *
   * 伪选项下三个域各自给专属解释（P1=A）：活跃域恒空（孤儿定义即无归属）、已归档域是
   * 无主已归档、已迁移域是无主迁移目录；一个工作区都没有时活跃域说明「还没有工作区」，
   * 而不是假装某个工作区为空。
   * @returns 本地化空态文案。
   */
  const emptyText = ((): string => {
    if (tab === 'active') {
      if (workspacesSnapshot.items.length === 0) return t('manager.workspace.empty')
      return choice === UNASSIGNED_CHOICE ? t('manager.empty.unassigned') : t('manager.empty.active')
    }
    if (tab === 'archived') {
      return choice === UNASSIGNED_CHOICE ? t('manager.empty.unassigned.archived') : t('manager.empty.archived')
    }
    return choice === UNASSIGNED_CHOICE ? t('manager.empty.unassigned') : t('manager.empty.migrated')
  })()

  /** 选择框触发按钮上的文案：真实工作区标题（空标题回退路径）或伪选项名。 */
  const currentChoice = choices.find((item) => item.id === choice)
  const choiceLabel = currentChoice === undefined || currentChoice.kind === 'unassigned'
    ? t('manager.workspace.unassigned')
    : currentChoice.title === ''
      ? currentChoice.path
      : currentChoice.title

  const tabIds = TAB_IDS[tab]
  const tabItems: readonly [SegmentedTab<ManagerTab>, ...SegmentedTab<ManagerTab>[]] = [
    { value: 'active', label: t('manager.tab.active'), id: TAB_IDS.active.tab, panelId: TAB_IDS.active.panel },
    { value: 'archived', label: t('manager.tab.archived'), id: TAB_IDS.archived.tab, panelId: TAB_IDS.archived.panel },
    { value: 'migrated', label: t('manager.tab.migrated'), id: TAB_IDS.migrated.tab, panelId: TAB_IDS.migrated.panel },
  ]

  /** 回到选择阶段并丢弃确认页与结果（工作区 / tab / 模式变化、`[返回]` 共用）。 */
  const resetToSelect = (): void => {
    setPhase('select')
    setPending(null)
    setOutcome(null)
    setFailure(null)
  }

  /**
   * 切 tab：运行中忽略；其余阶段切换等价于放弃当前确认/结果（阶段回 `select`）。
   * 各 tab 的选择集合由 model 分别保存，切换不会丢另一边的勾选。
   * @param next - 目标 tab。
   */
  const changeTab = (next: ManagerTab): void => {
    if (phase === 'running') return
    setTab(next)
    resetToSelect()
  }

  /**
   * 选工作区：运行中忽略；选择变化即回 `select`（确认页的数字属于旧范围）。
   * @param next - 目标工作区 id 或 {@link UNASSIGNED_CHOICE}。
   */
  const changeChoice = (next: WorkspaceChoiceId): void => {
    setMenuOpen(false)
    if (phase === 'running') return
    setChoice(next)
    resetToSelect()
  }

  /**
   * 切处置模式：**不重发预览**，只回 `select`（3.6：模式与预览同属「当前选择 + 当前
   * mode」，模式变了旧预览即失效，下次点「处置所选」重新预览）。
   * @param next - 目标模式。
   */
  const changeMode = (next: DisposalMode): void => {
    setMode(next)
    resetToSelect()
  }

  /** 重发「已迁移」列表请求（刷新按钮与 purge/restore 成功后共用）。 */
  const reloadListing = (): void => {
    listingLoaded.current = false
    setListingToken((value) => value + 1)
  }

  /**
   * 已迁移域当前选择的执行输入（目标 + 本地聚合体积）。
   * @returns 目标与体积；没有可执行目标时为 `null`。
   */
  const migratedBatch = (): { readonly targets: readonly MigratedTarget[]; readonly bytes: number } | null => {
    const targets = selectedMigratedTargets(migratedRowList, selection.migrated)
    if (targets.length === 0) return null
    let bytes = 0
    for (const row of migratedRowList) {
      if (selection.migrated.has(row.key)) bytes += row.bytes
    }
    return { targets, bytes }
  }

  /**
   * 逐项执行一个可逆动作（批量归档 / 批量取消归档）：串行、绝不因单项失败中断，逐项收集
   * 成败（spec：逐项报告，不整单失败）。
   * @param ids - 目标会话 id（按行序）。
   * @param run - 单项调用。
   * @returns 成功数与失败项。
   */
  const runPerItem = async (
    ids: readonly string[],
    run: (sessionId: string) => Promise<void>,
  ): Promise<{ readonly ok: number; readonly failures: readonly ItemFailure[] }> => {
    let ok = 0
    const failures: ItemFailure[] = []
    for (const sessionId of ids) {
      try {
        await run(sessionId)
        ok += 1
      } catch (error: unknown) {
        failures.push({ id: sessionId, reason: reasonOf(error, t) })
      }
    }
    return { ok, failures }
  }

  /**
   * 「处置所选」的执行范围：预览里被宿主回绝的目标已从本批剔除（确认页明示），执行只送
   * 其余目标；宿主执行期仍会整体复核，drift 时整单拒绝。
   * @param batch - 冻结的 dispose 批次。
   * @returns 实际发送的会话 id。
   */
  const acceptedIdsOf = (batch: Extract<PendingBatch, { kind: 'dispose' }>): readonly string[] => {
    if (batch.preview.rejected.length === 0) return batch.ids
    const rejected = new Set(batch.preview.rejected.map((entry) => entry.sessionId))
    return batch.ids.filter((sessionId) => !rejected.has(sessionId))
  }

  /**
   * 点动作按钮：按 `actionsForTab` 的分派进入确认，或先发预览（dispose）再确认。
   *
   * - 归档 / 取消归档 / 已迁移双动作没有宿主预览端点：直接进确认（摘要来自本地快照）；
   * - 处置（已归档删除）先 `previewBatch`：预览期间置 `running`（阶段机只有五态，预览
   *   不产生副作用，失败仍落 `failed`），成功后进确认并冻结预览。
   * @param action - model 给当前 tab 的动作。
   */
  const startAction = (action: ManagerAction): void => {
    if (phase !== 'select') return
    switch (action.kind) {
      case 'archive': {
        const ids = selectedSessionIds(activeRowList, selection.active)
        if (ids.length === 0) return
        setPending({ kind: 'archive', ids })
        setPhase('confirm')
        return
      }
      case 'unarchive': {
        const ids = unarchiveSelected(selection, archivedRowList)
        if (ids.length === 0) return
        setPending({ kind: 'unarchive', ids })
        setPhase('confirm')
        return
      }
      case 'dispose': {
        const ids = selectedSessionIds(archivedRowList, selection.archived)
        if (ids.length === 0) return
        setPhase('running')
        void client.previewBatch(ids, action.mode).then(
          (preview) => {
            setPending({ kind: 'dispose', ids, mode: action.mode, preview })
            setPhase('confirm')
          },
          (error: unknown) => {
            setFailure(asManagerError(error))
            setPhase('failed')
          },
        )
        return
      }
      case 'purge': {
        const batch = migratedBatch()
        if (batch === null) return
        setPending({ kind: 'purge', targets: batch.targets, bytes: batch.bytes })
        setPhase('confirm')
        return
      }
      case 'restore': {
        const batch = migratedBatch()
        if (batch === null) return
        setPending({ kind: 'restore', targets: batch.targets, bytes: batch.bytes })
        setPhase('confirm')
        return
      }
    }
  }

  /**
   * 确认执行：唯一会调用写动作的地方。
   *
   * 成功后清空**当前 tab** 的选择（其余 tab 保留），恢复成功后重发已迁移列表并停在原 tab
   * 展示结果（P3=A）；失败一律落 `failed`，`[返回]` 可改选重试。
   */
  const runPending = (): void => {
    if (phase !== 'confirm' || pending === null) return
    const batch = pending
    if (batch.kind === 'dispose' && acceptedIdsOf(batch).length === 0) return
    const complete = (next: ManagerOutcome): void => {
      setSelection((current) => clearSelection(current, tab))
      setOutcome(next)
      setPhase('done')
    }
    const fail = (error: unknown): void => {
      setFailure(asManagerError(error))
      setPhase('failed')
    }
    setPhase('running')
    switch (batch.kind) {
      case 'archive':
        void runPerItem(batch.ids, (sessionId) => workspaces.archiveSession(sessionId)).then((result) => {
          complete({ kind: 'archive', ok: result.ok, failures: result.failures })
        })
        return
      case 'unarchive':
        void runPerItem(batch.ids, (sessionId) => workspaces.unarchiveSession(sessionId)).then((result) => {
          complete({ kind: 'unarchive', ok: result.ok, failures: result.failures })
        })
        return
      case 'dispose':
        void client.disposeBatch(acceptedIdsOf(batch), batch.mode).then(
          (value) => {
            complete({ kind: 'dispose', ok: value.removed.length, warnings: value.warnings })
          },
          fail,
        )
        return
      case 'purge':
        void client.deleteMigrated(batch.targets).then(
          (value) => {
            reloadListing()
            complete({ kind: 'purge', ok: value.removed.length, warnings: value.warnings })
          },
          fail,
        )
        return
      case 'restore':
        void client.restoreMigrated(batch.targets).then(
          (value) => {
            reloadListing()
            complete({ kind: 'restore', restored: value.restored, warnings: value.warnings })
          },
          fail,
        )
        return
    }
  }

  /**
   * 确认页摘要里的归档根：处置（已归档删除）来自**当次预览**的回声，已迁移双动作来自
   * 已迁移列表；其余动作不展示这一行（与 code-design ③.6 的摘要口径一致）。
   */
  const confirmArchiveRoot = pending?.kind === 'dispose'
    ? pending.preview.archiveRoot
    : listing?.archiveRoot ?? null

  /** 确认页执行按钮的文案：取消归档有自己的动词，其余动作共用「确认执行」。 */
  const runLabel = pending?.kind === 'unarchive' ? t('manager.unarchive.run') : t('manager.confirm.run')
  /** 执行按钮的危险色：物理删除类动作（永久删除档 / 已迁移永久删除）才上错误色。 */
  const runDanger = pending?.kind === 'purge'
    || (pending?.kind === 'dispose' && pending.mode === 'delete')

  /** 当前 tab 的动作按钮：集合取 `actionsForTab`，顺序按 {@link ACTION_ORDER} 重排。 */
  const actionButtons = [...actionsForTab(tab, mode)]
    .sort((left, right) => ACTION_ORDER.indexOf(left.kind) - ACTION_ORDER.indexOf(right.kind))
    .map((action) => {
      const danger = action.kind === 'purge' || (action.kind === 'dispose' && action.mode === 'delete')
      return (
        <Button
          key={action.kind}
          variant={action.kind === 'unarchive' ? 'outline' : 'primary'}
          className={danger ? css.danger : undefined}
          disabled={effectiveCount === 0}
          onClick={() => {
            startAction(action)
          }}
        >
          {t(ACTION_LABELS[action.kind])}
        </Button>
      )
    })

  const footer = ((): ReactNode => {
    if (phase === 'select') {
      return (
        <>
          <Button variant="outline" onClick={close}>{t('dialog.cancel')}</Button>
          {actionButtons}
        </>
      )
    }
    if (phase === 'confirm') {
      const runnable = pending !== null
        && !(pending.kind === 'dispose' && acceptedIdsOf(pending).length === 0)
      return (
        <>
          <Button variant="outline" onClick={resetToSelect}>{t('manager.confirm.back')}</Button>
          <Button
            variant="primary"
            className={runDanger ? css.danger : undefined}
            onClick={runPending}
            disabled={!runnable}
          >
            {runLabel}
          </Button>
        </>
      )
    }
    if (phase === 'running') {
      // 请求已发出：取消不可用，界面留在原地报告结果（D8 / 既有删除对话框同策略）。
      return <Button variant="outline" onClick={close} disabled>{t('dialog.cancel')}</Button>
    }
    if (phase === 'done') {
      return <Button variant="outline" onClick={close}>{t('manager.close')}</Button>
    }
    return (
      <>
        <Button variant="outline" onClick={resetToSelect}>{t('manager.confirm.back')}</Button>
        <Button variant="outline" onClick={close}>{t('manager.close')}</Button>
      </>
    )
  })()

  return (
    <div className={css.sectionBody}>
      <div className={css.toolbar}>
        {/*
          * 工作区选择器：`Menu` 自带触发按钮的包装与键盘漫游，锚点是我们渲染的按钮
          * （`aria-expanded` 由本地开合状态驱动）。`portal` 默认开启（A13，见模块注释），
          * 冲突时改 `WORKSPACE_MENU_PORTAL` 一处即可退回原地渲染。
          */}
        <Menu
          open={menuOpen}
          anchor={(
            <button
              type="button"
              className={css.workspaceButton}
              aria-label={t('manager.workspace.label')}
              aria-expanded={menuOpen}
              disabled={phase === 'running'}
              onClick={() => {
                setMenuOpen((open) => !open)
              }}
            >
              <IconChevronDownOutlineRegular />
              <span className={css.workspaceName}>{choiceLabel}</span>
            </button>
          )}
          items={choices.map((item) => ({
            id: item.id,
            // 工作区标题可能为空（手改 registry）：此时用项目路径，绝不给一行空菜单项。
            label: item.kind === 'unassigned'
              ? t('manager.workspace.unassigned')
              : item.title === ''
                ? item.path
                : item.title,
          }))}
          selectedId={choice}
          onSelect={changeChoice}
          onClose={() => {
            setMenuOpen(false)
          }}
          portal={WORKSPACE_MENU_PORTAL}
        />
        <SegmentedTabs
          className={css.tabsRow}
          items={tabItems}
          value={tab}
          onChange={changeTab}
          label={t('manager.tabs.label')}
        />
      </div>

      {/*
        * 分节只有一个 tabpanel：tab / panel 通过常量 id 互指，切换只换 panel 内容。
        * 阶段切换也发生在 panel 内，分节不叠第二个弹窗（D8 / D10）。
        */}
      <div role="tabpanel" id={tabIds.panel} aria-labelledby={tabIds.tab}>
        {/*
          * tab 2 的处置方式单选：复用既有 `dialog.mode.*` 文案。运行中整组禁用；
          * 其余阶段切换模式会回 `select`（旧预览作废），因此单选始终可见可改。
          */}
        {tab === 'archived' && (
          <fieldset className={css.modes} disabled={phase === 'running'}>
            <legend>{t('dialog.mode.legend')}</legend>
            <label className={css.modeRow}>
              <input
                type="radio"
                name="web-ux-manager-mode"
                value="archive"
                checked={mode === 'archive'}
                disabled={phase === 'running'}
                onChange={() => {
                  changeMode('archive')
                }}
              />
              <span className={css.modeText}>{t('dialog.mode.archive')}</span>
            </label>
            <label className={css.modeRow}>
              <input
                type="radio"
                name="web-ux-manager-mode"
                value="delete"
                checked={mode === 'delete'}
                disabled={phase === 'running'}
                onChange={() => {
                  changeMode('delete')
                }}
              />
              <span className={css.modeText}>{t('dialog.mode.delete')}</span>
            </label>
          </fieldset>
        )}

        {/* 「已迁移」列表按需拉取：只在选择阶段提供手动刷新，其余阶段不打断当前动作。 */}
        {tab === 'migrated' && phase === 'select' && (
          <Button
            variant="ghost"
            icon={<IconRefreshOutlineRegular />}
            onClick={reloadListing}
            disabled={listingPhase === 'loading'}
          >
            {t('manager.refresh')}
          </Button>
        )}

        {phase === 'select' && (
          <>
            <div className={css.selectionBar}>
              <Checkbox
                label={t('manager.selectAll')}
                checked={everySelected}
                disabled={rows.length === 0}
                onChange={(next) => {
                  setSelection((current) => (
                    next ? selectAllSelection(current, tab, rows) : clearSelection(current, tab)
                  ))
                }}
              />
              <span>{t('manager.selected', { count: effectiveCount })}</span>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelection((current) => clearSelection(current, tab))
                }}
              >
                {t('manager.clear')}
              </Button>
            </div>

            {/* 拉取失败只影响本 tab：先报错（刷新失败时旧列表仍可继续用），再画列表。 */}
            {tab === 'migrated' && listingError !== null && <FailurePanel failure={listingError} t={t} />}

            {tab === 'migrated' && listing === null ? (
              // 拉取中沿用「正在执行…」的过程文案（locales 没有专门的列表加载键）。
              listingError === null ? <p className={css.muted}>{t('manager.running')}</p> : null
            ) : rows.length === 0 ? (
              <p className={css.empty}>{emptyText}</p>
            ) : tab === 'migrated' ? (
              <ul className={css.list}>
                {migratedRowList.map((row) => (
                  <li
                    key={row.key}
                    className={cx(
                      css.row,
                      selection.migrated.has(row.key) && css.rowSelected,
                      !row.selectable && css.rowDisabled,
                    )}
                  >
                    {/* 行标题由 Checkbox 的 label 承载（D9：唯一可访问名，不再放第二个 title）。 */}
                    <Checkbox
                      label={row.sessionId}
                      checked={selection.migrated.has(row.key)}
                      disabled={!row.selectable}
                      onChange={() => {
                        setSelection((current) => toggleSelection(current, 'migrated', row.key))
                      }}
                    />
                    <span className={css.rowMeta} title={row.projectDir}>{row.projectDir}</span>
                    <span className={css.rowMeta}>
                      {t('manager.meta.size', { size: formatSize(row.bytes, t) })}
                    </span>
                    <span className={css.rowMeta}>
                      {t('manager.meta.time', { time: formatTime(row.updatedAt) })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className={css.list}>
                {sessionRowList.map((row) => (
                  <li
                    key={row.key}
                    className={cx(
                      css.row,
                      selection[tab].has(row.key) && css.rowSelected,
                      !row.selectable && css.rowDisabled,
                    )}
                  >
                    <Checkbox
                      label={row.title === '' ? t('manager.untitled') : row.title}
                      checked={selection[tab].has(row.key)}
                      disabled={!row.selectable}
                      onChange={() => {
                        setSelection((current) => toggleSelection(current, tab, row.key))
                      }}
                    />
                    <span className={css.rowMeta}>
                      {t('manager.meta.time', { time: formatTime(row.updatedAt) })}
                    </span>
                    {row.running && (
                      <span className={cx(css.badge, css.badgeRunning)}>{t('manager.badge.running')}</span>
                    )}
                    {row.blank && (
                      <span className={cx(css.badge, css.badgeBlank)}>{t('manager.badge.blank')}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* 截断提示：列表上限（2000）与单批上限（500）共用一句「只列出前 N 个」。 */}
            {truncatedCount !== null && (
              <p className={css.truncated}>{t('manager.truncated', { count: truncatedCount })}</p>
            )}
          </>
        )}

        {phase === 'confirm' && pending !== null && (
          <ConfirmPanel
            pending={pending}
            archiveRoot={confirmArchiveRoot}
            unassigned={choice === UNASSIGNED_CHOICE}
            t={t}
          />
        )}

        {phase === 'running' && <p className={css.muted}>{t('manager.running')}</p>}

        {phase === 'done' && outcome !== null && <OutcomePanel outcome={outcome} t={t} />}

        {phase === 'failed' && failure !== null && <FailurePanel failure={failure} t={t} />}
      </div>

      {/* 行内动作条：统一弹窗没有统一 footer（D10），阶段动作跟着正文一起渲染。 */}
      <div className={css.actions}>{footer}</div>
    </div>
  )
}

/** 确认阶段面板的 props。 */
interface ConfirmPanelProps {
  /** 冻结的本批输入（含 dispose 的预览结果）。 */
  readonly pending: PendingBatch
  /**
   * 摘要里的归档根：处置取当次预览的回声，已迁移双动作取已迁移列表；不可得时为 `null`
   * （该行不渲染）。
   */
  readonly archiveRoot: string | null
  /** 当前是否选中「未匹配工作区」伪选项（决定恢复提示的追加文案）。 */
  readonly unassigned: boolean
  /** 本命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 确认阶段的主体：摘要（目标数 / 并集会话数 / 级联数 / 体积 / 归档根）、被拒清单与动作
 * 专属提示。数字一律来自冻结的预览或本地聚合，不重新估算。
 * @param props - 批次、归档根、伪选项标记与 `t`。
 * @returns 确认面板。
 */
function ConfirmPanel({ pending, archiveRoot, unassigned, t }: ConfirmPanelProps): ReactNode {
  const heading = <p><strong>{t('manager.confirm.title')}</strong></p>

  if (pending.kind === 'unarchive') {
    // 轻确认：可逆的 registry 操作，不涉及文件，也没有被拒清单。
    return (
      <section className={css.summary}>
        {heading}
        <p>{t('manager.unarchive.confirm', { count: pending.ids.length })}</p>
      </section>
    )
  }

  if (pending.kind === 'archive') {
    // 活跃域没有宿主预览：摘要只有目标数（逐项执行，无级联统计/体积）。
    return (
      <section className={css.summary}>
        {heading}
        <ul>
          <li>{t('manager.confirm.targets', { count: pending.ids.length })}</li>
        </ul>
      </section>
    )
  }

  // 以下三类共享「目标数 + 体积 + 归档根」三行，各自再补专属行与提示。
  const sizeKey = pending.kind === 'restore' || (pending.kind === 'dispose' && pending.mode === 'archive')
    ? 'dialog.summary.moveSize' as const
    : 'dialog.summary.size' as const
  const targetCount = pending.kind === 'dispose' ? pending.preview.targetCount : pending.targets.length
  const bytes = pending.kind === 'dispose' ? pending.preview.logBytes : pending.bytes

  return (
    <>
      <section className={css.summary}>
        {heading}
        <ul>
          <li>{t('manager.confirm.targets', { count: targetCount })}</li>
          {pending.kind === 'dispose' && (
            <>
              {/* 并集口径：宿主对全部目标去重后的一次性统计。 */}
              <li>{t('dialog.summary.sessions', { count: pending.preview.sessionCount })}</li>
              <li>{t('manager.confirm.cascade', { count: pending.preview.descendantCount })}</li>
            </>
          )}
          <li>{t(sizeKey, { size: formatSize(bytes, t) })}</li>
          {archiveRoot !== null && (
            <li>{t('manager.confirm.archiveRoot', { path: archiveRoot })}</li>
          )}
        </ul>
        {pending.kind === 'dispose' && pending.mode === 'delete' && <p>{t('dialog.warning.irreversible')}</p>}
        {pending.kind === 'purge' && <p>{t('dialog.warning.irreversible')}</p>}
        {pending.kind === 'restore' && <p>{t('manager.confirm.restore')}</p>}
        {pending.kind === 'restore' && unassigned && <p>{t('manager.confirm.restoreUnassigned')}</p>}
      </section>

      {pending.kind === 'dispose' && pending.preview.rejected.length > 0 && (
        <section className={css.rejected}>
          <p>{t('manager.confirm.rejected', { count: pending.preview.rejected.length })}</p>
          <ul>
            {pending.preview.rejected.map((entry) => (
              <li key={entry.sessionId}>
                {t('manager.itemFailure', { id: entry.sessionId, reason: t(errorKeyOf(entry.code)) })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** 结果面板的 props。 */
interface OutcomePanelProps {
  /** 已落定的动作结果。 */
  readonly outcome: ManagerOutcome
  /** 本命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 结果面板：成功计数 +（恢复时）挂回/未分组拆分 + 逐项失败 + warnings。
 *
 * 恢复停在原 tab 展示它（P3=A）；口径分别是「已移除 id 数」（dispose/purge）、
 * 「成功项数」（archive/unarchive）与「恢复条目数」（restore）。
 * @param props - 结果与 `t`。
 * @returns 结果面板。
 */
function OutcomePanel({ outcome, t }: OutcomePanelProps): ReactNode {
  const summary = outcome.kind === 'archive'
    ? t('manager.done.archive', { count: outcome.ok })
    : outcome.kind === 'unarchive'
      ? t('manager.unarchive.done', { count: outcome.ok })
      : outcome.kind === 'dispose'
        ? t('manager.done.dispose', { count: outcome.ok })
        : outcome.kind === 'purge'
          ? t('manager.done.purge', { count: outcome.ok })
          : t('manager.done.restore', { count: outcome.restored.length })

  const unassigned = outcome.kind === 'restore'
    ? outcome.restored.filter((entry) => entry.workspaceId === null).length
    : 0

  return (
    <>
      <p className={css.result}>{summary}</p>
      {unassigned > 0 && outcome.kind === 'restore' && (
        <p className={css.result}>
          {t('manager.done.restoreSplit', {
            attached: outcome.restored.length - unassigned,
            unassigned,
          })}
        </p>
      )}
      {(outcome.kind === 'archive' || outcome.kind === 'unarchive') && outcome.failures.length > 0 && (
        <section className={css.result}>
          <p>
            {t(
              outcome.kind === 'archive' ? 'manager.partial' : 'manager.unarchive.partial',
              { ok: outcome.ok, failed: outcome.failures.length },
            )}
          </p>
          <ul>
            {outcome.failures.map((item) => (
              <li key={item.id}>{t('manager.itemFailure', { id: item.id, reason: item.reason })}</li>
            ))}
          </ul>
        </section>
      )}
      {(outcome.kind === 'dispose' || outcome.kind === 'purge' || outcome.kind === 'restore')
        && outcome.warnings.length > 0 && (
          <section className={css.warnings}>
            <p>{t('manager.warnings')}</p>
            <ul>
              {outcome.warnings.map((warning) => <li key={warning}><code>{warning}</code></li>)}
            </ul>
          </section>
        )}
    </>
  )
}

/** 失败面板的 props。 */
interface FailurePanelProps {
  /** 归一后的整单失败（或列表拉取失败）。 */
  readonly failure: DeleteError
  /** 本命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 整单失败面板：失败码文案 + 宿主兜底 message（不本地化，作为详情）。
 * @param props - 失败与 `t`。
 * @returns 失败面板。
 */
function FailurePanel({ failure, t }: FailurePanelProps): ReactNode {
  return (
    <>
      <p className={css.failure}>{t('manager.failed', { reason: t(errorKeyOf(failure.code)) })}</p>
      {failure.message !== '' && <p className={css.detail}>{failure.message}</p>}
    </>
  )
}
