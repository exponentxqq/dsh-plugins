// @vitest-environment jsdom
/**
 * 会话管理浮层（`src/client/SessionManagerDialog.tsx`）的交互契约测试。
 *
 * 用例逐条对齐 code-design 触达面 #23 与 ③.6 的阶段机 / 动作分派表：工作区选择
 * （Menu portal、默认最近使用、伪选项）、三 tab 各取各的数据（migrated 首次进入才
 * 向宿主拉取）、复选 / 全选 / 清空与 500 单批上限截断、预览 → 确认 → 执行 → 结果的
 * 五阶段推进、整单拒绝落 `failed`、预览软失败在确认页呈现并从本批剔除、tab 1 归档
 * 逐项报告、tab 2 双动作（处置 / 取消归档逐项报告）、tab 3 永久删除与恢复（未分组
 * 拆分 + warnings + 停在原 tab）、在途互斥（动作按钮与选择条整体消失）以及服务缺席
 * 的两级软降级。
 *
 * 范式沿用 `test/delete-dialog.test.tsx`：用真实请求 store 驱动组件、`t` 用 canonical
 * 中文词典查表、每个用例只覆盖自己关心的那条路径；primitives 由
 * `test/stubs/ui-primitives.tsx` 替身提供（Menu 的 portal 形态与真组件一致，列表进
 * `document.body`，查询按 role 而不依赖落点）。CSS Modules 由 vitest 管线加载，无需在
 * 此声明。
 *
 * @module dsh-plugin-web-ux/test/session-manager-dialog
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  SessionManagerDialog,
  type SessionManagerDialogProps,
  type SessionsSource,
  type WorkspacesSource,
} from '../src/client/SessionManagerDialog.tsx'
import {
  type SessionRowViewInput,
  type SessionsSnapshotView,
  type WorkspaceRowView,
  type WorkspacesSnapshotView,
} from '../src/client/session-manager-model.ts'
import { createManagerRequestStore, type ManagerRequestStore } from '../src/client/session-manager-store.ts'
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

/** 工作区 A 的活跃会话（最近使用，默认选中 A）。 */
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

/** 渲染参数：`null` 表示该注入面缺席（软降级用例）。 */
interface RenderOptions {
  readonly client?: SessionManagerClient | null
  readonly workspaces?: WorkspacesSource | null
  readonly sessions?: SessionsSource | null
}

/**
 * 渲染浮层并给出它的请求 store。
 * @param options - 三个注入面的替身；缺省用内置夹具。
 * @returns render 结果 + 用于发起打开请求的 store。
 */
function renderManager(options: RenderOptions = {}) {
  const store = createManagerRequestStore()
  const client = options.client === null ? undefined : options.client ?? fakeClient()
  const workspaces = options.workspaces === null ? undefined : options.workspaces ?? fakeWorkspaces()
  const sessions = options.sessions === null ? undefined : options.sessions ?? fakeSessions()
  const props = { requests: store, client, workspaces, sessions, t: translate } as unknown as SessionManagerDialogProps
  return { ...render(<SessionManagerDialog {...props} />), store }
}

/** 登记一次「打开管理浮层」请求（入口按钮的动作）。 */
async function openManager(store: ManagerRequestStore): Promise<void> {
  await act(async () => {
    store.request()
  })
}

/** 工作区选择器的触发按钮（可访问名来自 `aria-label`）。 */
function workspaceTrigger(): HTMLButtonElement {
  return screen.getByRole('button', { name: zh['manager.workspace.label'] }) as HTMLButtonElement
}

/** 打开菜单并点选一项；工作区换选即回 `select` 并重建行集。 */
function chooseWorkspace(label: string): void {
  fireEvent.click(workspaceTrigger())
  fireEvent.click(screen.getByRole('menuitem', { name: label }))
}

/** 当前选中的 tab 文案。 */
function selectedTabLabel(): string | null {
  return screen.getByRole('tab', { selected: true }).textContent
}

/** 造一份超过单批上限的活跃域快照（全选截断用例）。 */
function makeBulkFixture(count: number): { workspaces: WorkspacesSnapshotView; sessions: SessionsSnapshotView } {
  const ids = Array.from({ length: count }, (_, index) => `s-bulk-${String(index)}`)
  const byId: Record<string, SessionRowViewInput> = {}
  for (const id of ids) byId[id] = makeSession(`批量 ${id}`, { updatedAt: 1 })
  return {
    workspaces: makeWorkspaces([makeWorkspace('ws-bulk', '批量工作区', PATH_A, ids)]),
    sessions: makeSessions(byId, ids),
  }
}

describe('外壳与软降级', () => {
  it('没有打开请求时不渲染任何 DOM', () => {
    const { container } = renderManager()

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('打开请求后渲染模态框、三 tab 与默认工作区，取消即结束请求', async () => {
    const view = renderManager()
    await openManager(view.store)

    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe(zh['manager.title'])
    expect(screen.getByText(zh['manager.description'])).toBeDefined()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      zh['manager.tab.active'],
      zh['manager.tab.archived'],
      zh['manager.tab.migrated'],
    ])
    expect(selectedTabLabel()).toBe(zh['manager.tab.active'])
    // 默认工作区：两份快照里最近使用时间最大的工作区 A。
    expect(workspaceTrigger().textContent).toContain('项目甲')
    expect(screen.getByRole('checkbox', { name: '甲一' })).toBeDefined()
    // 已归档行只出现在「已归档」域，不在活跃域。
    expect(screen.queryByRole('checkbox', { name: '甲归档一' })).toBeNull()
    expect(screen.getByText(translate('manager.selected', { count: 0 }))).toBeDefined()

    fireEvent.click(screen.getByText(zh['dialog.cancel']))
    expect(view.store.source.getSnapshot()).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('连接通道缺席时静默不渲染（没有管理面），请求仍由入口负责收尾', async () => {
    const view = renderManager({ client: null })
    await openManager(view.store)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(view.store.source.getSnapshot()).not.toBeNull()
  })

  it('工作区或会话快照缺席时渲染不可用空态而不是什么都不出现', async () => {
    const missingWorkspaces = renderManager({ workspaces: null })
    await openManager(missingWorkspaces.store)
    expect(screen.getByText(zh['manager.unavailable'])).toBeDefined()
    expect(screen.getByRole('dialog')).toBeDefined()
    cleanup()

    const missingSessions = renderManager({ sessions: null })
    await openManager(missingSessions.store)
    expect(screen.getByText(zh['manager.unavailable'])).toBeDefined()
  })
})

describe('工作区选择器与伪选项', () => {
  it('默认选中最近使用的工作区；Menu 打开、换选后回填并切换列表', async () => {
    const view = renderManager()
    await openManager(view.store)

    expect(workspaceTrigger().textContent).toContain('项目甲')
    expect(workspaceTrigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(workspaceTrigger())
    expect(workspaceTrigger().getAttribute('aria-expanded')).toBe('true')
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '项目甲',
      '项目乙',
      zh['manager.workspace.unassigned'],
    ])
    // 选中行走 `data-selected`；portal 出去的列表落在 body 下（A13 默认开启）。
    expect(within(menu).getByRole('menuitem', { name: '项目甲' }).getAttribute('data-selected')).toBe('true')
    expect(menu.parentElement).toBe(document.body)

    fireEvent.click(within(menu).getByRole('menuitem', { name: '项目乙' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(workspaceTrigger().getAttribute('aria-expanded')).toBe('false')
    expect(workspaceTrigger().textContent).toContain('项目乙')
    expect(screen.getByRole('checkbox', { name: '乙一' })).toBeDefined()
    expect(screen.queryByRole('checkbox', { name: '甲一' })).toBeNull()
  })

  it('伪选项：活跃域专属空态，已归档域聚合孤儿行且可参与动作', async () => {
    const view = renderManager()
    await openManager(view.store)

    chooseWorkspace(zh['manager.workspace.unassigned'])
    expect(workspaceTrigger().textContent).toContain(zh['manager.workspace.unassigned'])
    expect(screen.getByText(zh['manager.empty.unassigned'])).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    const orphan = screen.getByRole('checkbox', { name: '孤儿归档' }) as HTMLInputElement
    expect(orphan.disabled).toBe(false)
    fireEvent.click(orphan)

    expect(screen.getByText(translate('manager.selected', { count: 1 }))).toBeDefined()
    expect((screen.getByRole('button', { name: zh['manager.action.dispose'] }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: zh['manager.action.unarchive'] }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('tab 切换与按需拉取', () => {
  it('三 tab 各取各的数据；migrated 首次进入才拉取，重进不重拉、刷新显式重发', async () => {
    const client = fakeClient()
    const view = renderManager({ client })
    await openManager(view.store)

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
    // 真实工作区选项下只列匹配到该工作区的条目，无主目录归伪选项。
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
    const view = renderManager({ client })
    await openManager(view.store)

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.migrated'] }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: MIGRATED_A1 })).toBeDefined())
    expect(screen.getByText(translate('manager.truncated', { count: MAX_LISTED_MIGRATED }))).toBeDefined()
  })
})

describe('选择与单批上限', () => {
  it('复选 / 全选 / 清空：运行中的行置灰且不进入全选', async () => {
    const view = renderManager()
    await openManager(view.store)

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
    const view = renderManager({ workspaces: fakeWorkspaces(bulk.workspaces), sessions: fakeSessions(bulk.sessions) })
    await openManager(view.store)

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
    const view = renderManager({ client })
    await openManager(view.store)

    fireEvent.click(screen.getByRole('tab', { name: zh['manager.tab.archived'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: '甲归档一' }))
    fireEvent.click(screen.getByRole('button', { name: zh['manager.action.dispose'] }))

    // 预览在途：阶段已切到 running，动作按钮 / 选择条 / 勾选行整体离场。
    expect(client.previewBatch).toHaveBeenCalledWith([ARCHIVED_A1], 'archive')
    expect(screen.getByText(zh['manager.running'])).toBeDefined()
    expect((screen.getByRole('button', { name: zh['dialog.cancel'] }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: zh['manager.action.dispose'] })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(workspaceTrigger().disabled).toBe(true)
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
    expect(screen.getByText(zh['manager.close'])).toBeDefined()
    expect(screen.queryByRole('button', { name: zh['manager.action.dispose'] })).toBeNull()
  })

  it('执行被整单拒绝：落 failed 展示首个失败码与宿主 message，返回后保留选择', async () => {
    const client = fakeClient({
      previewBatch: vi.fn(async () => previewOf([ARCHIVED_A1])),
      disposeBatch: vi.fn(async () => {
        throw new DeleteError('not-archived', `session "${ARCHIVED_A1}" is not archived`)
      }),
    })
    const view = renderManager({ client })
    await openManager(view.store)

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

  it('模式切换不重发预览：回 select 改档后计数仍为 1，下一次动作才重新预览', async () => {
    const client = fakeClient()
    const view = renderManager({ client })
    await openManager(view.store)

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
    const view = renderManager({ client })
    await openManager(view.store)

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
    const view = renderManager({ client })
    await openManager(view.store)

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
    const view = renderManager({ workspaces })
    await openManager(view.store)

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
    const view = renderManager({ client, workspaces })
    await openManager(view.store)

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
    const view = renderManager({ client })
    await openManager(view.store)

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
    const view = renderManager({ client })
    await openManager(view.store)

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
