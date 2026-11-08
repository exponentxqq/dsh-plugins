// @vitest-environment jsdom
/**
 * 会话管理分节（`src/client/SessionManagerDialog.tsx`）的交互契约测试。
 *
 * 用例逐条对齐 code-design 触达面 #48、③.6 的阶段机 / 动作分派表与 ③ 3.9 的份额消费矩阵：
 * 页面级工作区上下文三态（`workspace` → 真实行集 / `unassigned` → 孤儿行集 / `none` → 空态）、
 * 三 tab 各取各的数据（migrated 首次进入才向宿主拉取）、复选 / 全选 / 清空与 500 单批上限
 * 截断、预览 → 确认 → 执行 → 结果的五阶段推进、整单拒绝落 `failed`、预览软失败在确认页
 * 呈现并从本批剔除、tab 1 归档逐项报告、tab 2 双动作（处置 / 取消归档逐项报告）、tab 3
 * 永久删除与恢复（未分组拆分 + warnings + 停在原 tab）、换工作区即重挂，以及三服务缺席时的
 * 空态（D9）。
 *
 * 页面化后本组件是 holder（`dsh-plugin-workspace-config`）页面里的一个分节：它不渲染
 * Modal、不自绘遮罩、**不拥有工作区选择框**，也不拿到任何关闭回调（owner 份额只剩
 * `{ workspace }`，Q7）。footer 各阶段按 ③ 3.10：`select` 只剩动作按钮、`running` 的
 * 取消禁用且不接回调、`done` / `failed` 的「完成」（`manager.finish`）回到 `select`。
 *
 * 范式沿用 `test/delete-dialog.test.tsx`：`t` 用 canonical 中文词典查表、每个用例只
 * 覆盖自己关心的那条路径；primitives 由 `test/stubs/ui-primitives.tsx` 替身提供。
 * CSS Modules 由 vitest 管线加载，无需在此声明。
 *
 * @module dsh-plugin-web-ux/test/session-manager-dialog
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { WorkspaceConfigWorkspaceContext } from '@dsh-plugins/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_BATCH_TARGETS,
  MAX_LISTED_MIGRATED,
  type DeleteBatchPreview,
  type DeleteOutcome,
  type MigratedEntry,
  type MigratedListing,
  type MigratedTarget,
  type RestoreOutcome,
} from '../src/contract.ts'
import { DeleteError, type SessionManagerClient } from '../src/client/delete-client.ts'
import {
  SessionManagerSection,
  type SessionManagerSectionProps,
  type SessionsSource,
  type WorkspacesSource,
} from '../src/client/SessionManagerDialog.tsx'
import {
  type SessionRowViewInput,
  type SessionsSnapshotView,
  type WorkspaceRowView,
  type WorkspacesSnapshotView,
} from '../src/client/session-manager-model.ts'
import { zh, type Key } from '../src/client/locales.ts'

afterEach(cleanup)

// —— 快照夹具：两个真实工作区 + 一条孤儿归档 + 三条已迁移条目 ——

/** 工作区 A 的项目路径。 */
const PATH_A = '/home/dev/alpha'
/** 工作区 B 的项目路径。 */
const PATH_B = '/home/dev/beta'
/** `projectKey(PATH_A)`：归档根下工作区 A 的一级目录名。 */
const PROJECT_A = '--home-dev-alpha--'
/** 匹配不到任何工作区的项目目录名（伪选项聚合对象）。 */
const PROJECT_ORPHAN = '--home-dev-orphan--'
/** 假宿主解析出的归档根。 */
const ARCHIVE_ROOT = '/data/dsh/archive/sessions'

/** 工作区 A 的活跃会话（默认持有量）。 */
const ACTIVE_A1 = 's-alpha-1'
/** 工作区 A 的第二个活跃会话。 */
const ACTIVE_A2 = 's-alpha-2'
/** 工作区 A 的运行中会话：行保留但不可勾选（D15）。 */
const ACTIVE_RUNNING = 's-alpha-running'
/** 工作区 A 的第一条已归档会话。 */
const ARCHIVED_A1 = 's-alpha-archived-1'
/** 工作区 A 的第二条已归档会话。 */
const ARCHIVED_A2 = 's-alpha-archived-2'
/** 工作区 B 的唯一活跃会话。 */
const ACTIVE_B = 's-beta-1'
/** 不属于任何工作区的已归档会话（伪选项 tab 2 的对象）。 */
const ORPHAN_ARCHIVED = 's-orphan-archived'
/** 归档根下匹配工作区 A 的第一条已迁移条目。 */
const MIGRATED_A1 = 's-migrated-1'
/** 归档根下匹配工作区 A 的第二条已迁移条目。 */
const MIGRATED_A2 = 's-migrated-2'
/** 归档根下匹配不到工作区的已迁移条目。 */
const MIGRATED_ORPHAN = 's-migrated-orphan'

// —— owner 份额夹具：页面选择框下传的三态值 ——

/** 份额：选中工作区 A（默认夹具；行集来自 `ws-a`）。 */
const WORKSPACE_A: WorkspaceConfigWorkspaceContext = {
  kind: 'workspace',
  id: 'ws-a',
  title: '项目甲',
  path: PATH_A,
}
/** 份额：选中工作区 B（换选用例的重挂目标）。 */
const WORKSPACE_B: WorkspaceConfigWorkspaceContext = {
  kind: 'workspace',
  id: 'ws-b',
  title: '项目乙',
  path: PATH_B,
}
/** 份额：选择框的「未分配」项（孤儿归档 / 已迁移行集）。 */
const WORKSPACE_UNASSIGNED: WorkspaceConfigWorkspaceContext = { kind: 'unassigned' }
/** 份额：页面拿不到工作区上下文（工作区服务未就绪 / 清单为空）。 */
const WORKSPACE_NONE: WorkspaceConfigWorkspaceContext = { kind: 'none' }

/** 造一个工作区行投影；`sessionIds` 顺序即行序。 */
function makeWorkspace(
  workspaceId: string,
  title: string,
  path: string,
  sessionIds: readonly string[],
): WorkspaceRowView {
  return { workspaceId, title, path, sessionIds }
}

/** 造一条会话行元数据投影；未给出的字段取安全默认值。 */
function makeSession(displayTitle: string, overrides: Partial<SessionRowViewInput> = {}): SessionRowViewInput {
  return { displayTitle, running: false, updatedAt: 0, blank: false, ...overrides }
}

/** 造一份会话快照；`ids` 缺省取 `byId` 的键（Host 列表成员）。 */
function makeSessions(
  byId: Readonly<Record<string, SessionRowViewInput | undefined>>,
  ids: readonly string[] = Object.keys(byId),
): SessionsSnapshotView {
  return { ids, byId }
}

/** 造一份工作区快照（`archivedSessionIds` 是注册表全局归档集合）。 */
function makeWorkspaces(
  items: readonly WorkspaceRowView[],
  archivedSessionIds: readonly string[] = [],
): WorkspacesSnapshotView {
  return { items, archivedSessionIds }
}

/** 造一条归档根条目；`sessionId` 与 `dirName` 当前恒等（D12）。 */
function makeMigratedEntry(
  dirName: string,
  projectDir: string,
  updatedAt: number,
  bytes: number,
): MigratedEntry {
  return { sessionId: dirName, dirName, projectDir, bytes, updatedAt }
}

/** 造一份 `list-migrated` 响应。 */
function makeListing(entries: readonly MigratedEntry[], truncated = false): MigratedListing {
  return { archiveRoot: ARCHIVE_ROOT, entries, truncated }
}

/** 默认工作区快照：A 的最近使用时间（甲一 3000）大于 B（1000）。 */
const WORKSPACES = makeWorkspaces(
  [
    makeWorkspace('ws-a', '项目甲', PATH_A, [ACTIVE_A1, ACTIVE_A2, ACTIVE_RUNNING, ARCHIVED_A1, ARCHIVED_A2]),
    makeWorkspace('ws-b', '项目乙', PATH_B, [ACTIVE_B]),
  ],
  [ARCHIVED_A1, ARCHIVED_A2, ORPHAN_ARCHIVED],
)

/** 默认会话快照：行元数据与 Host 列表成员。 */
const SESSIONS = makeSessions({
  [ACTIVE_A1]: makeSession('甲一', { updatedAt: 3000 }),
  [ACTIVE_A2]: makeSession('甲二', { updatedAt: 2000 }),
  [ACTIVE_RUNNING]: makeSession('甲运行', { updatedAt: 1500, running: true }),
  [ARCHIVED_A1]: makeSession('甲归档一', { updatedAt: 2500 }),
  [ARCHIVED_A2]: makeSession('甲归档二', { updatedAt: 2400 }),
  [ACTIVE_B]: makeSession('乙一', { updatedAt: 1000 }),
  [ORPHAN_ARCHIVED]: makeSession('孤儿归档', { updatedAt: 500 }),
})

/** 默认已迁移列表：两条属于工作区 A、一条无主；按 `updatedAt` 倒序排列。 */
const MIGRATED_LISTING = makeListing([
  makeMigratedEntry(MIGRATED_A1, PROJECT_A, 4000, 2048),
  makeMigratedEntry(MIGRATED_A2, PROJECT_A, 3000, 1024),
  makeMigratedEntry(MIGRATED_ORPHAN, PROJECT_ORPHAN, 2000, 512),
])

/** 用 canonical 中文词典模拟框架注入的 `t`（含 `{name}` 插值）。 */
function translate(key: Key, params?: Record<string, unknown>): string {
  const template = zh[key]
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/** 一个可手动落定的 promise。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** 把一批待处理微任务冲干净（列表拉取、确认后的执行链等）。 */
async function flush(): Promise<void> {
  await act(async () => {})
}

/** 预览响应：`rejected` 默认空，用例只覆盖自己关心的软失败。 */
function previewOf(sessionIds: readonly string[]): DeleteBatchPreview {
  return {
    targetCount: sessionIds.length,
    sessionCount: sessionIds.length,
    descendantCount: 0,
    logBytes: 2048,
    archiveRoot: ARCHIVE_ROOT,
    rejected: [],
  }
}

/** 默认成功的假管理客户端；每个用例只覆盖自己关心的那条路径。 */
function fakeClient(overrides: Partial<SessionManagerClient> = {}): SessionManagerClient {
  const base: SessionManagerClient = {
    preview: vi.fn(async () => ({
      sessionCount: 1,
      descendantCount: 0,
      logBytes: 0,
      archiveRoot: ARCHIVE_ROOT,
    })),
    remove: vi.fn(async () => ({ removed: [], warnings: [] })),
    previewBatch: vi.fn(async (sessionIds: readonly string[]) => previewOf(sessionIds)),
    disposeBatch: vi.fn(async (sessionIds: readonly string[]): Promise<DeleteOutcome> => ({
      removed: [...sessionIds],
      warnings: [],
    })),
    listMigrated: vi.fn(async () => MIGRATED_LISTING),
    deleteMigrated: vi.fn(async (entries: readonly MigratedTarget[]): Promise<DeleteOutcome> => ({
      removed: entries.map((entry) => entry.dirName),
      warnings: [],
    })),
    restoreMigrated: vi.fn(async (entries: readonly MigratedTarget[]): Promise<RestoreOutcome> => ({
      restored: entries.map((entry) => ({ sessionId: entry.dirName, workspaceId: 'ws-a' })),
      warnings: [],
    })),
  }
  return Object.assign(base, overrides)
}

/** 假工作区注入面：稳定快照 + 两个可替换的逐项动作。 */
function fakeWorkspaces(
  snapshot: WorkspacesSnapshotView = WORKSPACES,
  overrides: Partial<WorkspacesSource> = {},
): WorkspacesSource {
  const base: WorkspacesSource = {
    list: { getSnapshot: () => snapshot, subscribe: () => () => {} },
    archiveSession: vi.fn(async () => {}),
    unarchiveSession: vi.fn(async () => {}),
  }
  return Object.assign(base, overrides)
}

/** 假会话注入面：只读快照。 */
function fakeSessions(snapshot: SessionsSnapshotView = SESSIONS): SessionsSource {
  return { list: { getSnapshot: () => snapshot, subscribe: () => () => {} } }
}

/** 渲染参数：注入面传 `null` 表示缺席（软降级用例）；`workspace` 缺省为工作区 A。 */
interface RenderOptions {
  readonly workspace?: WorkspaceConfigWorkspaceContext
  readonly client?: SessionManagerClient | null
  readonly workspaces?: WorkspacesSource | null
  readonly sessions?: SessionsSource | null
}

/**
 * 造一份分节 props（座位 owner 份额只剩 `{ workspace }`，无关闭回调）。
 * @param options - 三个注入面与 owner 份额的替身；缺省用内置夹具。
 * @returns 可直接渲染的 props。
 */
function managerProps(options: RenderOptions = {}): SessionManagerSectionProps {
  const client = options.client === null ? undefined : options.client ?? fakeClient()
  const workspaces = options.workspaces === null ? undefined : options.workspaces ?? fakeWorkspaces()
  const sessions = options.sessions === null ? undefined : options.sessions ?? fakeSessions()
  const workspace = options.workspace ?? WORKSPACE_A
  return { workspace, client, workspaces, sessions, t: translate } as unknown as SessionManagerSectionProps
}

/**
 * 渲染会话管理分节。
 * @param options - 三个注入面与 owner 份额的替身；缺省用内置夹具。
 * @returns render 结果（换选重挂用例用它的 `rerender`）。
 */
function renderManager(options: RenderOptions = {}) {
  return render(<SessionManagerSection {...managerProps(options)} />)
}

/** 当前选中的 tab 文案。 */
function selectedTabLabel(): string | null {
  return screen.getByRole('tab', { selected: true }).textContent
}

/** 造一份超过单批上限的活跃域快照（全选截断用例）。 */
function makeBulkFixture(
  count: number,
): { workspace: WorkspaceConfigWorkspaceContext; workspaces: WorkspacesSnapshotView; sessions: SessionsSnapshotView } {
  const ids = Array.from({ length: count }, (_, index) => `s-bulk-${String(index)}`)
  const byId: Record<string, SessionRowViewInput> = {}
  for (const id of ids) byId[id] = makeSession(`批量 ${id}`, { updatedAt: 1 })
  return {
    // 份额必须指向这份快照里的工作区：行集寻址键不再由节内默认档推导（③ 3.9）。
    workspace: { kind: 'workspace', id: 'ws-bulk', title: '批量工作区', path: PATH_A },
    workspaces: makeWorkspaces([makeWorkspace('ws-bulk', '批量工作区', PATH_A, ids)]),
    sessions: makeSessions(byId, ids),
  }
}

describe('分节挂载与软降级', () => {
  it('直接渲染分节（无 Modal 根）：三 tab、份额决定的行集与选择条都在', () => {
    const view = renderManager()

    // 分节不拥有弹窗：DOM 里没有 dialog 角色，也没有 Modal 的 portal 节点；
    // 标题、遮罩与页面级选择框全部由 holder 提供。
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(view.container.querySelector('[data-modal="true"]')).toBeNull()
    // 节内不再有工作区选择框（唯一入口归 holder 页面，③ 3.9 / Q8）。
    expect(screen.queryByRole('menu')).toBeNull()
    expect(view.container.querySelector('[aria-haspopup="menu"]')).toBeNull()

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      zh['manager.tab.active'],
      zh['manager.tab.archived'],
      zh['manager.tab.migrated'],
    ])
    expect(selectedTabLabel()).toBe(zh['manager.tab.active'])
    // 份额 `workspace` 的 id 决定行集：工作区 A 的活跃会话在列。
    expect(screen.getByRole('checkbox', { name: '甲一' })).toBeDefined()
    // 已归档行只出现在「已归档」域，不在活跃域。
    expect(screen.queryByRole('checkbox', { name: '甲归档一' })).toBeNull()
    expect(screen.getByText(translate('manager.selected', { count: 0 }))).toBeDefined()
  })

  it('select 阶段没有取消按钮：footer 只剩当前 tab 的动作按钮（Q7）', () => {
    renderManager()

    expect(screen.queryByRole('button', { name: zh['dialog.cancel'] })).toBeNull()
    expect(screen.getByRole('button', { name: zh['manager.action.archive'] })).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    expect(screen.getByRole('button', { name: zh['manager.action.dispose'] })).toBeDefined()
    expect(screen.getByRole('button', { name: zh['manager.action.unarchive'] })).toBeDefined()
    expect(screen.queryByRole('button', { name: zh['dialog.cancel'] })).toBeNull()
  })

  it('client 缺席时渲染 manager.unavailable 空态，而不是什么都不出现（D9）', () => {
    renderManager({ client: null })

    expect(screen.getByText(zh['manager.unavailable'])).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('工作区或会话快照缺席时同样渲染不可用空态而不是空白右列', () => {
    renderManager({ workspaces: null })
    expect(screen.getByText(zh['manager.unavailable'])).toBeDefined()
    cleanup()

    renderManager({ sessions: null })
    expect(screen.getByText(zh['manager.unavailable'])).toBeDefined()
  })

  it('running 阶段没有关闭出口：取消禁用且不接回调，分节不自绘遮罩（D16）', () => {
    const preview = deferred<DeleteBatchPreview>()
    const client = fakeClient({ previewBatch: vi.fn(() => preview.promise) })
    const view = renderManager({ client })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: '甲归档一' }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.dispose'] }))
    expect(screen.getByText(zh['manager.running'])).toBeDefined()

    // 分节不画弹窗 / 遮罩：Escape 与页面离开都归 holder，分节没有拦截面。
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('[data-modal="true"]')).toBeNull()
    // 行内「取消」仍禁用且不接 onClick：请求已经发出，界面无法撤销它（③ 3.10）。
    const cancel = screen.getByRole('button', { name: zh['dialog.cancel'] }) as HTMLButtonElement
    expect(cancel.disabled).toBe(true)
    fireEvent.click(cancel)
    expect(client.disposeBatch).not.toHaveBeenCalled()

    // 重新挂载 = 页面重进：阶段、选择、预览全部复位，结果由宿主侧继续完成。
    view.unmount()
    renderManager()
    expect(selectedTabLabel()).toBe(zh['manager.tab.active'])
    expect(screen.getByText(translate('manager.selected', { count: 0 }))).toBeDefined()
  })
})

describe('workspace 份额三态', () => {
  it('workspace：行集来自份额的 id，换 id 即换行集', () => {
    const view = renderManager()

    expect(screen.getByRole('checkbox', { name: '甲一' })).toBeDefined()
    expect(screen.queryByRole('checkbox', { name: '乙一' })).toBeNull()

    view.rerender(<SessionManagerSection {...managerProps({ workspace: WORKSPACE_B })} />)

    expect(screen.getByRole('checkbox', { name: '乙一' })).toBeDefined()
    expect(screen.queryByRole('checkbox', { name: '甲一' })).toBeNull()
  })

  it('unassigned：活跃域空态，已归档域聚合孤儿行且可参与动作', () => {
    renderManager({ workspace: WORKSPACE_UNASSIGNED })

    expect(screen.getByText(zh['manager.empty.unassigned'])).toBeDefined()
    expect(screen.queryByRole('checkbox', { name: '甲一' })).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    // 真实工作区的已归档成员不出现在「未分配」域。
    expect(screen.queryByRole('checkbox', { name: '甲归档一' })).toBeNull()
    const orphan = screen.getByRole('checkbox', { name: '孤儿归档' }) as HTMLInputElement
    expect(orphan.disabled).toBe(false)
    fireEvent.click(orphan)

    expect(screen.getByText(translate('manager.selected', { count: 1 }))).toBeDefined()
    expect((screen.getByRole('button', { name: zh['manager.action.dispose'] }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: zh['manager.action.unarchive'] }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('none：渲染 manager.unavailable 空态，不渲染 tab 也不发寻址请求', () => {
    const client = fakeClient()
    renderManager({ workspace: WORKSPACE_NONE, client })

    expect(screen.getByText(zh['manager.unavailable'])).toBeDefined()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(client.listMigrated).not.toHaveBeenCalled()
  })

  it('换 workspace 即重挂：阶段回 select、选择集合与 tab 全部复位', async () => {
    const client = fakeClient()
    const view = renderManager({ client })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: '甲归档一' }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.dispose'] }))
    await flush()
    expect(screen.getByRole('button', { name: zh['manager.confirm.run'] })).toBeDefined()

    // holder 选择框换选 = 份额变化 → `key` 重挂分节：确认页离场、回到默认 tab 与空选择。
    view.rerender(<SessionManagerSection {...managerProps({ workspace: WORKSPACE_B })} />)

    expect(screen.queryByRole('button', { name: zh['manager.confirm.run'] })).toBeNull()
    expect(selectedTabLabel()).toBe(zh['manager.tab.active'])
    expect(screen.getByText(translate('manager.selected', { count: 0 }))).toBeDefined()
    expect(screen.getByRole('checkbox', { name: '乙一' })).toBeDefined()
    expect(screen.getByRole('button', { name: zh['manager.action.archive'] })).toBeDefined()
  })
})

describe('tab 切换与按需拉取', () => {
  it('三 tab 各取各的数据；migrated 首次进入才拉取，重进不重拉、刷新显式重发', async () => {
    const client = fakeClient()
    renderManager({ client })

    expect(screen.getByRole('checkbox', { name: '甲一' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    expect(screen.getByRole('checkbox', { name: '甲归档一' })).toBeDefined()
    // tab 2 的处置方式单选只在已归档域出现；tab 1/2 都不请求宿主。
    expect(screen.getByRole('radio', { name: zh['dialog.mode.archive'] })).toBeDefined()
    expect(client.listMigrated).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.migrated'] }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: MIGRATED_A1 })).toBeDefined())
    expect(client.listMigrated).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('web-ux-manager-tab-migrated')
    // 份额给的工作区选项下只列匹配到该工作区的条目，无主目录归「未分配」。
    expect(screen.queryByRole('checkbox', { name: MIGRATED_ORPHAN })).toBeNull()

    // 离开再回来：列表已加载，不重发。
    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.active'] }))
    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.migrated'] }))
    await flush()
    expect(client.listMigrated).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: zh['manager.refresh'] }))
    await waitFor(() => expect(client.listMigrated).toHaveBeenCalledTimes(2))
  })

  it('迁移列表被宿主截断时提示 2000 上限', async () => {
    const listing = makeListing([makeMigratedEntry(MIGRATED_A1, PROJECT_A, 1000, 10)], true)
    const client = fakeClient({ listMigrated: vi.fn(async () => listing) })
    renderManager({ client })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.migrated'] }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: MIGRATED_A1 })).toBeDefined())
    expect(screen.getByText(translate('manager.truncated', { count: MAX_LISTED_MIGRATED }))).toBeDefined()
  })
})

describe('选择与单批上限', () => {
  it('复选 / 全选 / 清空：运行中的行置灰且不进入全选', async () => {
    renderManager()

    const first = screen.getByRole('checkbox', { name: '甲一' }) as HTMLInputElement
    fireEvent.click(first)
    expect(screen.getByText(translate('manager.selected', { count: 1 }))).toBeDefined()
    fireEvent.click(first)
    expect(screen.getByText(translate('manager.selected', { count: 0 }))).toBeDefined()

    const running = screen.getByRole('checkbox', { name: '甲运行' }) as HTMLInputElement
    expect(running.disabled).toBe(true)
    expect(screen.getByText(zh['manager.badge.running'])).toBeDefined()

    fireEvent.click(screen.getByRole('checkbox', { name: zh['manager.selectAll'] }))
    expect(screen.getByText(translate('manager.selected', { count: 2 }))).toBeDefined()
    expect((screen.getByRole('checkbox', { name: zh['manager.selectAll'] }) as HTMLInputElement).checked).toBe(true)
    expect(running.checked).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: zh['manager.clear'] }))
    expect(screen.getByText(translate('manager.selected', { count: 0 }))).toBeDefined()
  })

  it('超过单批上限时只选前 500 个并给出截断提示', async () => {
    const bulk = makeBulkFixture(MAX_BATCH_TARGETS + 1)
    renderManager({
      workspace: bulk.workspace,
      workspaces: fakeWorkspaces(bulk.workspaces),
      sessions: fakeSessions(bulk.sessions),
    })

    expect(screen.getByText(translate('manager.truncated', { count: MAX_BATCH_TARGETS }))).toBeDefined()
    expect(screen.queryByText(translate('manager.truncated', { count: MAX_BATCH_TARGETS + 1 }))).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: zh['manager.selectAll'] }))
    expect(screen.getByText(translate('manager.selected', { count: MAX_BATCH_TARGETS }))).toBeDefined()
    // 第 501 行不在截断集合里：复选框仍可点，但全选没有把它选进去。
    const overflow = screen.getByRole('checkbox', {
      name: `批量 s-bulk-${String(MAX_BATCH_TARGETS)}`,
    }) as HTMLInputElement
    expect(overflow.checked).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: zh['manager.clear'] }))
    expect(screen.getByText(translate('manager.selected', { count: 0 }))).toBeDefined()
  })
})

describe('阶段机：处置（已归档删除）', () => {
  it('预览 → 确认 → 执行 → 结果，摘要取当次预览，预览期与执行期都冻结其它输入', async () => {
    const preview = deferred<DeleteBatchPreview>()
    const disposal = deferred<DeleteOutcome>()
    const client = fakeClient({
      previewBatch: vi.fn(() => preview.promise),
      disposeBatch: vi.fn(() => disposal.promise),
    })
    renderManager({ client })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: '甲归档一' }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.dispose'] }))

    // 预览在途：阶段已切到 running，动作按钮 / 选择条 / 勾选行整体离场。
    expect(client.previewBatch).toHaveBeenCalledWith([ARCHIVED_A1], 'archive')
    expect(screen.getByText(zh['manager.running'])).toBeDefined()
    expect((screen.getByRole('button', { name: zh['dialog.cancel'] }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: zh['manager.action.dispose'] })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect((screen.getByRole('radio', { name: zh['dialog.mode.archive'] }) as HTMLInputElement).disabled).toBe(true)
    // 在途点 tab 不切走，也不触发迁移列表拉取。
    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.migrated'] }))
    expect(selectedTabLabel()).toBe(zh['manager.tab.archived'])
    expect(client.listMigrated).not.toHaveBeenCalled()

    await act(async () => {
      preview.resolve({
        targetCount: 1,
        sessionCount: 3,
        descendantCount: 2,
        logBytes: 2048,
        archiveRoot: ARCHIVE_ROOT,
        rejected: [],
      })
    })

    // 确认页：标题与执行按钮同文案「确认执行」，数字全部来自预览。
    expect(screen.getAllByText(zh['manager.confirm.title']).length).toBeGreaterThan(1)
    expect(screen.getByRole('button', { name: zh['manager.confirm.run'] })).toBeDefined()
    expect(screen.getByText(translate('manager.confirm.targets', { count: 1 }))).toBeDefined()
    expect(screen.getByText(translate('dialog.summary.sessions', { count: 3 }))).toBeDefined()
    expect(screen.getByText(translate('manager.confirm.cascade', { count: 2 }))).toBeDefined()
    expect(screen.getByText(translate('dialog.summary.moveSize', { size: '2 KB' }))).toBeDefined()
    expect(screen.getByText(translate('manager.confirm.archiveRoot', { path: ARCHIVE_ROOT }))).toBeDefined()
    // 归档档不可逆警示不出现；确认页的「归档目录」来自当次预览回声。
    expect(screen.queryByText(zh['dialog.warning.irreversible'])).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: zh['manager.confirm.run'] }))
    expect(client.disposeBatch).toHaveBeenCalledWith([ARCHIVED_A1], 'archive')
    expect(screen.getByText(zh['manager.running'])).toBeDefined()
    expect((screen.getByRole('button', { name: zh['dialog.cancel'] }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      disposal.resolve({ removed: [ARCHIVED_A1], warnings: [] })
    })

    expect(screen.getByText(translate('manager.done.dispose', { count: 1 }))).toBeDefined()
    expect(screen.getByRole('button', { name: zh['manager.finish'] })).toBeDefined()
    expect(screen.queryByRole('button', { name: zh['manager.action.dispose'] })).toBeNull()

    // 完成 = 终点态的出口：阶段回 select（结果离场、动作按钮重现），页面本身不被关闭。
    fireEvent.click(screen.getByRole('button', { name: zh['manager.finish'] }))
    expect(screen.queryByText(translate('manager.done.dispose', { count: 1 }))).toBeNull()
    expect(screen.getByRole('button', { name: zh['manager.action.dispose'] })).toBeDefined()
    expect(screen.getByText(translate('manager.selected', { count: 0 }))).toBeDefined()
    expect(selectedTabLabel()).toBe(zh['manager.tab.archived'])
  })

  it('执行被整单拒绝：落 failed 展示首个失败码与宿主 message，返回后保留选择', async () => {
    const client = fakeClient({
      previewBatch: vi.fn(async () => previewOf([ARCHIVED_A1])),
      disposeBatch: vi.fn(async () => {
        throw new DeleteError('not-archived', `session "${ARCHIVED_A1}" is not archived`)
      }),
    })
    renderManager({ client })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: '甲归档一' }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.dispose'] }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: zh['manager.confirm.run'] }))

    await waitFor(() => expect(screen.getByText(translate('manager.failed', { reason: zh['error.not-archived'] }))).toBeDefined())
    expect(screen.getByText(`session "${ARCHIVED_A1}" is not archived`)).toBeDefined()
    expect(client.disposeBatch).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: zh['manager.confirm.back'] }))
    expect(screen.getByText(translate('manager.selected', { count: 1 }))).toBeDefined()
    expect(selectedTabLabel()).toBe(zh['manager.tab.archived'])
    expect(screen.queryByRole('button', { name: zh['manager.confirm.run'] })).toBeNull()
  })

  it('failed 的「完成」回到 select：失败面板离场，页面不被关闭', async () => {
    const client = fakeClient({
      previewBatch: vi.fn(async () => previewOf([ARCHIVED_A1])),
      disposeBatch: vi.fn(async (): Promise<DeleteOutcome> => {
        throw new DeleteError('internal', 'host exploded')
      }),
    })
    renderManager({ client })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: '甲归档一' }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.dispose'] }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: zh['manager.confirm.run'] }))

    const failedText = translate('manager.failed', { reason: zh['error.internal'] })
    await waitFor(() => expect(screen.getByText(failedText)).toBeDefined())
    expect(screen.getByRole('button', { name: zh['manager.confirm.back'] })).toBeDefined()
    expect(screen.getByRole('button', { name: zh['manager.finish'] })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: zh['manager.finish'] }))
    expect(screen.queryByText(failedText)).toBeNull()
    expect(screen.getByRole('button', { name: zh['manager.action.dispose'] })).toBeDefined()
    expect(selectedTabLabel()).toBe(zh['manager.tab.archived'])
  })

  it('模式切换不重发预览：回 select 改档后计数仍为 1，下一次动作才重新预览', async () => {
    const client = fakeClient()
    renderManager({ client })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: '甲归档一' }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.dispose'] }))
    await flush()
    expect(client.previewBatch).toHaveBeenCalledTimes(1)
    expect(client.previewBatch).toHaveBeenCalledWith([ARCHIVED_A1], 'archive')

    fireEvent.click(screen.getByRole('button', { name: zh['manager.confirm.back'] }))
    fireEvent.click(screen.getByRole('radio', { name: zh['dialog.mode.delete'] }))

    expect((screen.getByRole('radio', { name: zh['dialog.mode.delete'] }) as HTMLInputElement).checked).toBe(true)
    // 关键口径：仅切模式不请求宿主；选择也仍然保留。
    expect(client.previewBatch).toHaveBeenCalledTimes(1)
    expect(screen.getByText(translate('manager.selected', { count: 1 }))).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.dispose'] }))
    await flush()
    expect(client.previewBatch).toHaveBeenCalledTimes(2)
    expect(client.previewBatch).toHaveBeenLastCalledWith([ARCHIVED_A1], 'delete')
    expect(screen.getByText(translate('dialog.summary.size', { size: '2 KB' }))).toBeDefined()
    expect(screen.getByText(zh['dialog.warning.irreversible'])).toBeDefined()
    expect(screen.queryByText(zh['dialog.warning.archive'])).toBeNull()
  })
})

describe('预览软失败（被拒项呈现与剔除）', () => {
  it('确认页列出被拒清单，执行只发送接收项', async () => {
    const client = fakeClient({
      previewBatch: vi.fn(async () => ({
        targetCount: 2,
        sessionCount: 2,
        descendantCount: 0,
        logBytes: 4096,
        archiveRoot: ARCHIVE_ROOT,
        rejected: [{ sessionId: ARCHIVED_A1, code: 'session-live', message: 'session is still live' }],
      })),
      disposeBatch: vi.fn(async () => ({ removed: [ARCHIVED_A2], warnings: [] })),
    })
    renderManager({ client })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: zh['manager.selectAll'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.dispose'] }))
    await flush()

    expect(screen.getByText(translate('manager.confirm.rejected', { count: 1 }))).toBeDefined()
    expect(screen.getByText(
      translate('manager.itemFailure', { id: ARCHIVED_A1, reason: zh['error.session-live'] }),
    )).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: zh['manager.confirm.run'] }))
    // 软失败项已从本批剔除：执行只送接收项。
    expect(client.disposeBatch).toHaveBeenCalledWith([ARCHIVED_A2], 'archive')
    expect(client.disposeBatch).not.toHaveBeenCalledWith([ARCHIVED_A1, ARCHIVED_A2], 'archive')

    await waitFor(() => expect(screen.getByText(translate('manager.done.dispose', { count: 1 }))).toBeDefined())
  })

  it('预览把全部目标剔除时确认按钮不可用，不会发出空批次', async () => {
    const client = fakeClient({
      previewBatch: vi.fn(async () => ({
        targetCount: 1,
        sessionCount: 1,
        descendantCount: 0,
        logBytes: 1024,
        archiveRoot: ARCHIVE_ROOT,
        rejected: [{ sessionId: ARCHIVED_A1, code: 'not-archived', message: 'gone' }],
      })),
    })
    renderManager({ client })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: '甲归档一' }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.dispose'] }))
    await flush()

    const run = screen.getByRole('button', { name: zh['manager.confirm.run'] }) as HTMLButtonElement
    expect(run.disabled).toBe(true)
    fireEvent.click(run)
    expect(client.disposeBatch).not.toHaveBeenCalled()
  })
})

describe('逐项执行：tab 1 归档与 tab 2 取消归档', () => {
  it('tab 1：单项失败不中断整批，结果给出 done / partial 与逐项原因', async () => {
    const archiveSession = vi.fn(async (sessionId: string) => {
      if (sessionId === ACTIVE_A2) throw new DeleteError('session-live', 'still live')
    })
    const workspaces = fakeWorkspaces(WORKSPACES, { archiveSession })
    renderManager({ workspaces })

    fireEvent.click(screen.getByRole('checkbox', { name: '甲一' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '甲二' }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.archive'] }))

    expect(screen.getByText(translate('manager.confirm.targets', { count: 2 }))).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: zh['manager.confirm.run'] }))

    await waitFor(() => expect(screen.getByText(translate('manager.done.archive', { count: 1 }))).toBeDefined())
    expect(archiveSession).toHaveBeenCalledTimes(2)
    expect(archiveSession).toHaveBeenNthCalledWith(1, ACTIVE_A1)
    expect(archiveSession).toHaveBeenNthCalledWith(2, ACTIVE_A2)
    expect(screen.getByText(translate('manager.partial', { ok: 1, failed: 1 }))).toBeDefined()
    expect(screen.getByText(
      translate('manager.itemFailure', { id: ACTIVE_A2, reason: zh['error.session-live'] }),
    )).toBeDefined()
  })

  it('tab 2：取消归档走轻确认，逐项执行后按 done / partial 呈现', async () => {
    const unarchiveSession = vi.fn(async (sessionId: string) => {
      if (sessionId === ARCHIVED_A2) throw new DeleteError('not-archived', 'gone')
    })
    const workspaces = fakeWorkspaces(WORKSPACES, { unarchiveSession })
    const client = fakeClient()
    renderManager({ client, workspaces })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: zh['manager.selectAll'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.unarchive'] }))

    expect(screen.getByText(translate('manager.unarchive.confirm', { count: 2 }))).toBeDefined()
    expect(screen.getByRole('button', { name: zh['manager.unarchive.run'] })).toBeDefined()
    // 轻确认没有预览端点参与，也没有「确认执行」按钮（动词不同）。
    expect(screen.queryByRole('button', { name: zh['manager.confirm.run'] })).toBeNull()
    expect(client.previewBatch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: zh['manager.unarchive.run'] }))

    await waitFor(() => expect(screen.getByText(translate('manager.unarchive.done', { count: 1 }))).toBeDefined())
    expect(unarchiveSession).toHaveBeenCalledTimes(2)
    expect(unarchiveSession).toHaveBeenNthCalledWith(1, ARCHIVED_A1)
    expect(unarchiveSession).toHaveBeenNthCalledWith(2, ARCHIVED_A2)
    expect(screen.getByText(translate('manager.unarchive.partial', { ok: 1, failed: 1 }))).toBeDefined()
    expect(screen.getByText(
      translate('manager.itemFailure', { id: ARCHIVED_A2, reason: zh['error.not-archived'] }),
    )).toBeDefined()
    expect(client.disposeBatch).not.toHaveBeenCalled()
  })
})

describe('tab 3 已迁移：永久删除与恢复', () => {
  it('恢复：确认摘要 → 结果含未分组拆分与 warnings，并停在「已迁移」tab', async () => {
    const restoreMigrated = vi.fn(async (): Promise<RestoreOutcome> => ({
      restored: [
        { sessionId: MIGRATED_A1, workspaceId: 'ws-a' },
        { sessionId: MIGRATED_A2, workspaceId: null },
      ],
      warnings: [`attach: ${MIGRATED_A2}: workspace "ws-a" is archived`],
    }))
    const client = fakeClient({ restoreMigrated })
    renderManager({ client })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.migrated'] }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: MIGRATED_A1 })).toBeDefined())
    fireEvent.click(screen.getByRole('checkbox', { name: zh['manager.selectAll'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.restore'] }))

    expect(screen.getByText(translate('manager.confirm.targets', { count: 2 }))).toBeDefined()
    expect(screen.getByText(translate('dialog.summary.moveSize', { size: '3 KB' }))).toBeDefined()
    expect(screen.getByText(translate('manager.confirm.archiveRoot', { path: ARCHIVE_ROOT }))).toBeDefined()
    expect(screen.getByText(zh['manager.confirm.restore'])).toBeDefined()
    expect(screen.queryByText(zh['dialog.warning.irreversible'])).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: zh['manager.confirm.run'] }))
    expect(restoreMigrated).toHaveBeenCalledWith([
      { projectDir: PROJECT_A, dirName: MIGRATED_A1 },
      { projectDir: PROJECT_A, dirName: MIGRATED_A2 },
    ])

    await waitFor(() => expect(screen.getByText(translate('manager.done.restore', { count: 2 }))).toBeDefined())
    expect(screen.getByText(translate('manager.done.restoreSplit', { attached: 1, unassigned: 1 }))).toBeDefined()
    expect(screen.getByText(zh['manager.warnings'])).toBeDefined()
    expect(screen.getByText(`attach: ${MIGRATED_A2}: workspace "ws-a" is archived`)).toBeDefined()
    // P3=A：恢复成功后停在原 tab，结果面板与列表同时可见。
    expect(selectedTabLabel()).toBe(zh['manager.tab.migrated'])
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('web-ux-manager-tab-migrated')
    // 成功后重发迁移列表（不轮询）。
    await waitFor(() => expect(client.listMigrated).toHaveBeenCalledTimes(2))
  })

  it('永久删除：警示 + 体积 → 结果计数与逐条 warnings', async () => {
    const warning = `rm ${ARCHIVE_ROOT}/${PROJECT_A}/${MIGRATED_A1}: EACCES`
    const deleteMigrated = vi.fn(async (): Promise<DeleteOutcome> => ({
      removed: [MIGRATED_A1],
      warnings: [warning],
    }))
    const client = fakeClient({ deleteMigrated })
    renderManager({ client })

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.migrated'] }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: MIGRATED_A1 })).toBeDefined())
    fireEvent.click(screen.getByRole('checkbox', { name: MIGRATED_A1 }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.purge'] }))

    expect(screen.getByText(translate('dialog.summary.size', { size: '2 KB' }))).toBeDefined()
    expect(screen.getByText(zh['dialog.warning.irreversible'])).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: zh['manager.confirm.run'] }))
    expect(deleteMigrated).toHaveBeenCalledWith([{ projectDir: PROJECT_A, dirName: MIGRATED_A1 }])

    await waitFor(() => expect(screen.getByText(translate('manager.done.purge', { count: 1 }))).toBeDefined())
    expect(screen.getByText(zh['manager.warnings'])).toBeDefined()
    expect(screen.getByText(warning)).toBeDefined()
    await waitFor(() => expect(client.listMigrated).toHaveBeenCalledTimes(2))
  })
})
