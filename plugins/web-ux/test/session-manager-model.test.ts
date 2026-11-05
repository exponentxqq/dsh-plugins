/**
 * 管理浮层纯派生模型（`src/client/session-manager-model.ts`）与打开请求 store
 * （`src/client/session-manager-store.ts`）的单测。
 *
 * 纯 node 环境（vitest 默认 environment），不引 jsdom、不挂 React、不 import 任何
 * 上游包：全部输入都是手写的 Plain 投影（工作区快照 / 会话快照 / `list-migrated`
 * 响应），所以每条判据都能逐项断言。用例逐条对齐 code-design ③.6 的行派生表与动作
 * 分派表：三域行集、伪选项聚合（P1=A）、500 截断（P2=A / D13）、运行中置灰（D15）、
 * 子代理过滤（D14）、选择操作与双动作分派；末尾的 store 契约（seq / identity）是
 * 触达 #21 对 `session-manager-store.ts` 落档要求。
 *
 * @module dsh-plugin-web-ux/test/session-manager-model
 */

import { describe, expect, it } from 'vitest'
import { MAX_BATCH_TARGETS, type MigratedEntry, type MigratedListing } from '../src/contract.ts'
import {
  MANAGER_TABS,
  UNASSIGNED_CHOICE,
  actionsForTab,
  activeRows,
  allSelected,
  archivedRows,
  clearSelection,
  defaultWorkspaceChoice,
  emptySelection,
  entryKeyOf,
  migratedRows,
  selectedCount,
  selectedMigratedTargets,
  selectedSessionIds,
  selectionLimitReached,
  selectAllSelection,
  toggleSelection,
  unarchiveSelected,
  workspaceChoices,
  type SessionRowViewInput,
  type SessionsSnapshotView,
  type WorkspaceRowView,
  type WorkspacesSnapshotView,
} from '../src/client/session-manager-model.ts'
import { createManagerRequestStore } from '../src/client/session-manager-store.ts'

/** 工作区 A 的项目路径。 */
const PATH_A = '/home/dev/alpha'
/** 工作区 B 的项目路径。 */
const PATH_B = '/home/dev/beta'
/** `projectKey(PATH_A)`：归档根下工作区 A 的一级目录名。 */
const PROJECT_A = '--home-dev-alpha--'
/** `projectKey(PATH_B)`。 */
const PROJECT_B = '--home-dev-beta--'
/** 匹配不到任何工作区的项目目录名（伪选项聚合对象）。 */
const PROJECT_ORPHAN = '--home-dev-orphan--'
/** 排序兜底用例里的两个无主项目目录（字典序 alpha < zeta）。 */
const PROJECT_ORPHAN_ZETA = '--home-dev-zeta--'
/** 归档根；行派生不用它，只为构出合法的 `MigratedListing`。 */
const ARCHIVE_ROOT = '/data/dsh/archive/sessions'

/** 造一个工作区行投影；`sessionIds` 顺序即行序。 */
function makeWorkspace(
  workspaceId: string,
  path: string,
  sessionIds: readonly string[],
  title: string = workspaceId,
): WorkspaceRowView {
  return { workspaceId, title, path, sessionIds }
}

/** 造一条会话行元数据投影；未给出的字段取安全默认值。 */
function makeSession(
  displayTitle: string,
  overrides: Partial<SessionRowViewInput> = {},
): SessionRowViewInput {
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
  updatedAt = 0,
  bytes = 0,
): MigratedEntry {
  return { sessionId: dirName, dirName, projectDir, bytes, updatedAt }
}

/** 造一份 `list-migrated` 响应。 */
function makeMigratedListing(
  entries: readonly MigratedEntry[],
  truncated = false,
): MigratedListing {
  return { archiveRoot: ARCHIVE_ROOT, entries, truncated }
}

/** 行集的会话 id 序列（断言行序用）。 */
function idsOf(rows: readonly { readonly sessionId: string }[]): string[] {
  return rows.map((row) => row.sessionId)
}

/** 行集的键序列。 */
function keysOf(rows: readonly { readonly key: string }[]): string[] {
  return rows.map((row) => row.key)
}

describe('工作区选项与默认选择', () => {
  it('选项 = 真实工作区（Host 顺序）+ 末尾一枚伪选项', () => {
    const choices = workspaceChoices(
      makeWorkspaces([
        makeWorkspace('ws-a', PATH_A, [], 'Alpha'),
        makeWorkspace('ws-b', PATH_B, [], 'Beta'),
      ]),
    )
    expect(choices).toEqual([
      { id: 'ws-a', kind: 'workspace', title: 'Alpha', path: PATH_A },
      { id: 'ws-b', kind: 'workspace', title: 'Beta', path: PATH_B },
      { id: UNASSIGNED_CHOICE, kind: 'unassigned', title: '', path: '' },
    ])
    // 没有任何真实工作区时伪选项仍然在：选中它时三个域各自给空态，选项不忽隐忽现。
    expect(workspaceChoices(makeWorkspaces([]))).toEqual([
      { id: UNASSIGNED_CHOICE, kind: 'unassigned', title: '', path: '' },
    ])
  })

  it('默认选中最近使用的工作区：成员会话 max(updatedAt) 最大者（含已归档成员）', () => {
    const workspaces = makeWorkspaces(
      [
        makeWorkspace('ws-a', PATH_A, ['a1', 'a-archived']),
        makeWorkspace('ws-b', PATH_B, ['b1']),
      ],
      ['a-archived'],
    )
    const sessions = makeSessions({
      a1: makeSession('A1', { updatedAt: 100 }),
      // 归档不改变「这个工作区被用过」的事实：已归档成员也参与最近使用计算。
      'a-archived': makeSession('A 归档', { updatedAt: 400 }),
      b1: makeSession('B1', { updatedAt: 300 }),
    })
    expect(defaultWorkspaceChoice(workspaces, sessions)).toBe('ws-a')
  })

  it('最近使用同值或全为 0 时按 Host 顺序取第一个', () => {
    const workspaces = makeWorkspaces([
      makeWorkspace('ws-a', PATH_A, ['a1']),
      makeWorkspace('ws-b', PATH_B, ['b1']),
    ])
    const tied = makeSessions({
      a1: makeSession('A1', { updatedAt: 500 }),
      b1: makeSession('B1', { updatedAt: 500 }),
    })
    expect(defaultWorkspaceChoice(workspaces, tied)).toBe('ws-a')

    const zero = makeSessions({ a1: makeSession('A1'), b1: makeSession('B1') })
    expect(defaultWorkspaceChoice(workspaces, zero)).toBe('ws-a')
  })

  it('没有工作区时回退伪选项；缺元数据的成员不参与最近使用计算', () => {
    expect(defaultWorkspaceChoice(makeWorkspaces([]), makeSessions({}))).toBe(UNASSIGNED_CHOICE)

    const workspaces = makeWorkspaces([
      makeWorkspace('ws-a', PATH_A, ['ghost', 'a1']),
      makeWorkspace('ws-b', PATH_B, ['b1']),
    ])
    const sessions = makeSessions({
      a1: makeSession('A1', { updatedAt: 200 }),
      b1: makeSession('B1', { updatedAt: 100 }),
    })
    expect(defaultWorkspaceChoice(workspaces, sessions)).toBe('ws-a')
  })
})

describe('三域行集：活跃 / 已归档 / 已迁移', () => {
  it('活跃域：成员 ∩ Host 列表 − 归档集合 − 子代理，行序沿用 sessionIds', () => {
    const workspaces = makeWorkspaces(
      [
        makeWorkspace('ws-a', PATH_A, [
          'a',
          'archived',
          'sub',
          'unlisted',
          'missing',
          'a',
          'running',
          'blank',
        ]),
      ],
      ['archived'],
    )
    const snapshot = makeSessions(
      {
        a: makeSession('A 会话', { updatedAt: 10 }),
        archived: makeSession('已归档', { updatedAt: 20 }),
        sub: makeSession('子代理', { origin: 'subagent' }),
        unlisted: makeSession('未进 Host 列表', { updatedAt: 30 }),
        running: makeSession('运行中', { running: true, updatedAt: 40 }),
        blank: makeSession('', { blank: true, updatedAt: 50 }),
      },
      ['a', 'archived', 'sub', 'running', 'blank'],
    )

    const rows = activeRows('ws-a', workspaces, snapshot)
    expect(keysOf(rows)).toEqual(['active:a', 'active:running', 'active:blank'])
    expect(rows[0]).toEqual({
      key: 'active:a',
      sessionId: 'a',
      title: 'A 会话',
      updatedAt: 10,
      running: false,
      blank: false,
      selectable: true,
      workspaceId: 'ws-a',
    })
    // 运行中的行不删，只置灰（D15）。
    expect(rows[1]).toMatchObject({
      sessionId: 'running',
      running: true,
      selectable: false,
      updatedAt: 40,
    })
    // 空标题与空白标记原样下传，由视图兜底文案（模型不做本地化）。
    expect(rows[2]).toMatchObject({ sessionId: 'blank', title: '', blank: true, selectable: true })
  })

  it('活跃域：伪选项恒为空、未知工作区为空（孤儿不属于活跃域）', () => {
    const workspaces = makeWorkspaces([makeWorkspace('ws-a', PATH_A, ['a'])], [])
    const snapshot = makeSessions({ a: makeSession('A') })
    expect(activeRows(UNASSIGNED_CHOICE, workspaces, snapshot)).toEqual([])
    expect(activeRows('ws-gone', workspaces, snapshot)).toEqual([])
  })

  it('已归档域：归档集合 ∩ 工作区成员，滤掉子代理与缺元数据行，运行中保留但置灰', () => {
    const workspaces = makeWorkspaces(
      [makeWorkspace('ws-a', PATH_A, ['a1', 'a2', 'a3', 'a4', 'a5', 'a2'])],
      ['a2', 'a3', 'a4', 'a5', 'orphan-1', 'orphan-2', 'orphan-sub', 'orphan-missing'],
    )
    const snapshot = makeSessions({
      a1: makeSession('活跃成员', { updatedAt: 10 }),
      a2: makeSession('归档二', { updatedAt: 20 }),
      a3: makeSession('归档运行中', { running: true, updatedAt: 30 }),
      a4: makeSession('归档子代理', { origin: 'subagent' }),
      // a5 缺元数据（快照漂移）。
      'orphan-1': makeSession('孤儿一', { updatedAt: 40 }),
      'orphan-2': makeSession('孤儿二', { updatedAt: 50 }),
      'orphan-sub': makeSession('孤儿子代理', { origin: 'subagent' }),
      // orphan-missing 也缺元数据。
    })

    const rows = archivedRows('ws-a', workspaces, snapshot)
    expect(keysOf(rows)).toEqual(['archived:a2', 'archived:a3'])
    expect(rows[0]).toMatchObject({
      sessionId: 'a2',
      title: '归档二',
      workspaceId: 'ws-a',
      running: false,
      selectable: true,
    })
    expect(rows[1]).toMatchObject({ sessionId: 'a3', running: true, selectable: false })

    // 同一份快照下两域互斥：只有未归档的 a1 是活跃行。
    expect(idsOf(activeRows('ws-a', workspaces, snapshot))).toEqual(['a1'])
  })

  it('已归档域伪选项：聚合「已归档 − 全部工作区成员」，含孤儿已归档（P1=A）', () => {
    const workspaces = makeWorkspaces(
      [
        makeWorkspace('ws-a', PATH_A, ['a2']),
        makeWorkspace('ws-b', PATH_B, ['b-member', 'b-archived']),
      ],
      ['a2', 'b-member', 'b-archived', 'orphan-1', 'orphan-2', 'orphan-sub', 'orphan-missing'],
    )
    const snapshot = makeSessions({
      a2: makeSession('A2'),
      'b-member': makeSession('B 成员'),
      'b-archived': makeSession('B 归档'),
      'orphan-1': makeSession('孤儿一', { updatedAt: 10 }),
      'orphan-2': makeSession('孤儿二', { updatedAt: 20 }),
      'orphan-sub': makeSession('孤儿子代理', { origin: 'subagent' }),
    })

    // 真实工作区只看自己的成员位：A 不会看到 B 的归档。
    expect(idsOf(archivedRows('ws-a', workspaces, snapshot))).toEqual(['a2'])
    expect(idsOf(archivedRows('ws-b', workspaces, snapshot))).toEqual(['b-member', 'b-archived'])

    // 伪选项按 archivedSessionIds 顺序列出不属于任何工作区的已归档会话。
    const orphans = archivedRows(UNASSIGNED_CHOICE, workspaces, snapshot)
    expect(keysOf(orphans)).toEqual(['archived:orphan-1', 'archived:orphan-2'])
    expect(orphans.map((row) => row.workspaceId)).toEqual([null, null])
    expect(orphans[0]).toMatchObject({ title: '孤儿一', selectable: true })

    expect(archivedRows('ws-gone', workspaces, snapshot)).toEqual([])
  })

  it('已归档域：归档集合为空时两个选项都是空态', () => {
    const workspaces = makeWorkspaces([makeWorkspace('ws-a', PATH_A, ['a'])], [])
    const snapshot = makeSessions({ a: makeSession('A') })
    expect(archivedRows('ws-a', workspaces, snapshot)).toEqual([])
    expect(archivedRows(UNASSIGNED_CHOICE, workspaces, snapshot)).toEqual([])
  })

  it('已迁移域：按 projectKey 正推匹配工作区（不要求会话是成员位），按 updatedAt 倒序', () => {
    const workspaces = makeWorkspaces([
      makeWorkspace('ws-a', PATH_A, ['a1']),
      makeWorkspace('ws-b', PATH_B, []),
    ])
    const listing = makeMigratedListing([
      makeMigratedEntry('alpha-new', PROJECT_A, 300, 10),
      makeMigratedEntry('alpha-old', PROJECT_A, 100, 20),
      makeMigratedEntry('alpha-unlisted', PROJECT_A, 200, 30),
      makeMigratedEntry('alpha-old', PROJECT_A, 100, 20), // 同身份重复条目，按 key 去重
      makeMigratedEntry('beta-1', PROJECT_B, 250, 40),
      makeMigratedEntry('orphan-1', PROJECT_ORPHAN, 150, 50),
    ])

    const rowsA = migratedRows('ws-a', workspaces, listing)
    // alpha-unlisted 从不出现在 A 的成员位，但目录匹配到 A，所以属于 A 的已迁移域。
    expect(idsOf(rowsA)).toEqual(['alpha-new', 'alpha-unlisted', 'alpha-old'])
    expect(rowsA[0]).toEqual({
      key: entryKeyOf('migrated', 'alpha-new', PROJECT_A),
      sessionId: 'alpha-new',
      dirName: 'alpha-new',
      projectDir: PROJECT_A,
      bytes: 10,
      updatedAt: 300,
      workspaceId: 'ws-a',
      selectable: true,
    })

    expect(idsOf(migratedRows('ws-b', workspaces, listing))).toEqual(['beta-1'])
    const orphans = migratedRows(UNASSIGNED_CHOICE, workspaces, listing)
    expect(idsOf(orphans)).toEqual(['orphan-1'])
    expect(orphans[0]).toMatchObject({ projectDir: PROJECT_ORPHAN, workspaceId: null })
    expect(migratedRows('ws-gone', workspaces, listing)).toEqual([])
  })

  it('已迁移域排序：updatedAt 相同按 dirName 字典序，再相同按 projectDir 兜底', () => {
    const workspaces = makeWorkspaces([makeWorkspace('ws-a', PATH_A, [])])
    const listing = makeMigratedListing([
      makeMigratedEntry('dup', PROJECT_ORPHAN_ZETA, 100),
      makeMigratedEntry('dup', PROJECT_ORPHAN, 100),
      makeMigratedEntry('bravo', PROJECT_ORPHAN_ZETA, 100),
    ])

    const rows = migratedRows(UNASSIGNED_CHOICE, workspaces, listing)
    expect(rows.map((row) => `${row.dirName}@${row.projectDir}`)).toEqual([
      `bravo@${PROJECT_ORPHAN_ZETA}`,
      `dup@${PROJECT_ORPHAN}`,
      `dup@${PROJECT_ORPHAN_ZETA}`,
    ])
  })

  it('已迁移域：空列表与无孤儿时的伪选项都是空态', () => {
    const workspaces = makeWorkspaces([makeWorkspace('ws-a', PATH_A, [])])
    expect(migratedRows('ws-a', workspaces, makeMigratedListing([]))).toEqual([])
    expect(
      migratedRows(
        UNASSIGNED_CHOICE,
        workspaces,
        makeMigratedListing([makeMigratedEntry('x', PROJECT_A, 1)]),
      ),
    ).toEqual([])
  })
})

describe('行标识', () => {
  it('带域前缀：同一会话在三个 tab / 两个项目目录下互不碰撞', () => {
    expect(entryKeyOf('active', 's1')).toBe('active:s1')
    expect(entryKeyOf('archived', 's1')).toBe('archived:s1')
    expect(entryKeyOf('migrated', 's1', PROJECT_A)).toBe('migrated:--home-dev-alpha--/s1')
    expect(entryKeyOf('migrated', 's1', PROJECT_B)).toBe('migrated:--home-dev-beta--/s1')

    const keys = new Set([
      entryKeyOf('active', 's1'),
      entryKeyOf('archived', 's1'),
      entryKeyOf('migrated', 's1', PROJECT_A),
      entryKeyOf('migrated', 's1', PROJECT_B),
    ])
    expect(keys.size).toBe(4)
  })
})

describe('500 截断（P2=A / D13）', () => {
  it('501 行全选截到 500：selectionLimitReached、满 500 后 toggle 不生效、动作输入截断', () => {
    const ids = Array.from({ length: MAX_BATCH_TARGETS + 1 }, (_, index) => `session-${index}`)
    const byId: Record<string, SessionRowViewInput> = {}
    for (const id of ids) byId[id] = makeSession(id, { updatedAt: 1000 })
    const workspaces = makeWorkspaces([makeWorkspace('ws-a', PATH_A, ids)])
    const rows = activeRows('ws-a', workspaces, makeSessions(byId, ids))

    expect(rows).toHaveLength(MAX_BATCH_TARGETS + 1)
    expect(selectionLimitReached(rows)).toBe(true)
    // 恰好 500 行时不提示分批。
    expect(selectionLimitReached(rows.slice(0, MAX_BATCH_TARGETS))).toBe(false)

    const selected = selectAllSelection(emptySelection(), 'active', rows)
    expect(selected.active.size).toBe(MAX_BATCH_TARGETS)
    expect(selected.active.has(rows[MAX_BATCH_TARGETS].key)).toBe(false)
    // 全选口径与截断口径一致：超过 500 时选中前 500 个就显示为「已全选」，再点一次清空。
    expect(allSelected(selected, 'active', rows)).toBe(true)
    expect(selectedCount(selected, 'active', rows)).toBe(MAX_BATCH_TARGETS)

    const blocked = toggleSelection(selected, 'active', rows[MAX_BATCH_TARGETS].key)
    expect(blocked).toBe(selected)
    expect(blocked.active.size).toBe(MAX_BATCH_TARGETS)

    const actionIds = selectedSessionIds(rows, selected.active)
    expect(actionIds).toHaveLength(MAX_BATCH_TARGETS)
    expect(actionIds[0]).toBe('session-0')
    expect(actionIds.at(-1)).toBe(`session-${MAX_BATCH_TARGETS - 1}`)
    expect(actionIds).not.toContain(`session-${MAX_BATCH_TARGETS}`)

    // 动作输入自带截断：即便选择集合被外部塞进 501 个键，也只投影前 500 个。
    const forged = new Set(rows.map((row) => row.key))
    const forgedIds = selectedSessionIds(rows, forged)
    expect(forgedIds).toHaveLength(MAX_BATCH_TARGETS)
    expect(forgedIds).not.toContain(`session-${MAX_BATCH_TARGETS}`)

    // 退掉一个后上限让位：第 501 个键可以再选进来。
    const freed = toggleSelection(selected, 'active', rows[0].key)
    expect(freed.active.size).toBe(MAX_BATCH_TARGETS - 1)
    expect(toggleSelection(freed, 'active', rows[MAX_BATCH_TARGETS].key).active.size).toBe(
      MAX_BATCH_TARGETS,
    )
  })

  it('上限按可勾选行计算：500 可选 + 1 运行中时不提示截断，全选只覆盖可选行', () => {
    const ids = Array.from({ length: MAX_BATCH_TARGETS + 1 }, (_, index) => `session-${index}`)
    const byId: Record<string, SessionRowViewInput> = {}
    for (const id of ids) byId[id] = makeSession(id, { updatedAt: 1000, running: id === 'session-0' })
    const rows = activeRows(
      'ws-a',
      makeWorkspaces([makeWorkspace('ws-a', PATH_A, ids)]),
      makeSessions(byId, ids),
    )

    expect(rows).toHaveLength(MAX_BATCH_TARGETS + 1)
    expect(selectionLimitReached(rows)).toBe(false)
    const selected = selectAllSelection(emptySelection(), 'active', rows)
    expect(selected.active.size).toBe(MAX_BATCH_TARGETS)
    expect(selected.active.has('active:session-0')).toBe(false)
    expect(selectedSessionIds(rows, selected.active)).not.toContain('session-0')
  })

  it('已迁移域同样截到 500：全选、提示与 {projectDir, dirName} 动作输入一致', () => {
    const entries = Array.from({ length: MAX_BATCH_TARGETS + 1 }, (_, index) =>
      makeMigratedEntry(`session-${String(index).padStart(3, '0')}`, PROJECT_A, 10_000 - index),
    )
    const rows = migratedRows(
      'ws-a',
      makeWorkspaces([makeWorkspace('ws-a', PATH_A, [])]),
      makeMigratedListing(entries),
    )

    expect(rows).toHaveLength(MAX_BATCH_TARGETS + 1)
    expect(selectionLimitReached(rows)).toBe(true)
    const selected = selectAllSelection(emptySelection(), 'migrated', rows)
    expect(selected.migrated.size).toBe(MAX_BATCH_TARGETS)

    const targets = selectedMigratedTargets(rows, selected.migrated)
    expect(targets).toHaveLength(MAX_BATCH_TARGETS)
    expect(targets[0]).toEqual({ projectDir: PROJECT_A, dirName: 'session-000' })
    expect(targets.at(-1)).toEqual({
      projectDir: PROJECT_A,
      dirName: `session-${String(MAX_BATCH_TARGETS - 1).padStart(3, '0')}`,
    })
    expect(targets).not.toContainEqual({ projectDir: PROJECT_A, dirName: 'session-500' })

    const forged = new Set(rows.map((row) => row.key))
    expect(selectedMigratedTargets(rows, forged)).toHaveLength(MAX_BATCH_TARGETS)
    expect(toggleSelection(selected, 'migrated', rows[MAX_BATCH_TARGETS].key)).toBe(selected)
  })
})

describe('运行中置灰（D15）', () => {
  it('运行中行保留在行集里但不可勾选；全选、计数与动作输入都跳过它', () => {
    const workspaces = makeWorkspaces([makeWorkspace('ws-a', PATH_A, ['run', 'idle'])])
    const snapshot = makeSessions({
      run: makeSession('运行中', { running: true, updatedAt: 20 }),
      idle: makeSession('空闲', { updatedAt: 10 }),
    })
    const rows = activeRows('ws-a', workspaces, snapshot)
    expect(idsOf(rows)).toEqual(['run', 'idle'])
    expect(rows[0].selectable).toBe(false)
    expect(rows[1].selectable).toBe(true)

    const selected = selectAllSelection(emptySelection(), 'active', rows)
    expect([...selected.active]).toEqual(['active:idle'])

    // 即使绕过复选框直接写入运行中行的键，下游口径也会跳过它。
    const explicit = toggleSelection(emptySelection(), 'active', 'active:run')
    expect(selectedCount(explicit, 'active', rows)).toBe(0)
    expect(selectedSessionIds(rows, explicit.active)).toEqual([])
    expect(allSelected(explicit, 'active', rows)).toBe(false)
  })

  it('行集里只有运行中行时全选复选框不亮（没有任何可选键）', () => {
    const workspaces = makeWorkspaces([makeWorkspace('ws-a', PATH_A, ['run'])], ['run'])
    const rows = archivedRows(
      'ws-a',
      workspaces,
      makeSessions({ run: makeSession('运行中', { running: true }) }),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].selectable).toBe(false)
    expect(allSelected(emptySelection(), 'archived', rows)).toBe(false)
    expect(selectAllSelection(emptySelection(), 'archived', rows).archived.size).toBe(0)
  })
})

describe('选择操作', () => {
  it('空选择：三个 tab 各自独立的空集合（不共享同一份 Set）', () => {
    const first = emptySelection()
    expect(MANAGER_TABS.map((tab) => first[tab].size)).toEqual([0, 0, 0])
    expect(first.active).not.toBe(first.archived)
    expect(first.archived).not.toBe(first.migrated)
    const second = emptySelection()
    expect(second.active).not.toBe(first.active)
  })

  it('toggle 增删只改当前 tab，其余 tab 的集合 identity 不变', () => {
    const before = emptySelection()
    const added = toggleSelection(before, 'archived', 'archived:a2')
    expect(added).not.toBe(before)
    expect([...added.archived]).toEqual(['archived:a2'])
    expect(added.active).toBe(before.active)
    expect(added.migrated).toBe(before.migrated)

    const removed = toggleSelection(added, 'archived', 'archived:a2')
    expect(removed.archived.size).toBe(0)
    expect(removed.active).toBe(before.active)
  })

  it('clear 只清当前 tab，其他 tab 的选择保留', () => {
    let selection = emptySelection()
    selection = toggleSelection(selection, 'active', 'active:a')
    selection = toggleSelection(selection, 'archived', 'archived:b')
    const cleared = clearSelection(selection, 'active')
    expect(cleared.active.size).toBe(0)
    expect([...cleared.archived]).toEqual(['archived:b'])
  })

  it('全选是替换而非并集：清掉陈旧键，其他 tab 选择保留', () => {
    const workspaces = makeWorkspaces([makeWorkspace('ws-a', PATH_A, ['a', 'b'])])
    const rows = activeRows(
      'ws-a',
      workspaces,
      makeSessions({ a: makeSession('A', { updatedAt: 2 }), b: makeSession('B', { updatedAt: 1 }) }),
    )
    let selection = toggleSelection(emptySelection(), 'active', 'active:stale')
    selection = toggleSelection(selection, 'archived', 'archived:keep')
    const selected = selectAllSelection(selection, 'active', rows)
    expect([...selected.active]).toEqual(['active:a', 'active:b'])
    expect(selected.active.has('active:stale')).toBe(false)
    expect([...selected.archived]).toEqual(['archived:keep'])
  })

  it('allSelected 与截断口径一致，selectedCount 只数当前行集里的可选行', () => {
    const rows = activeRows(
      'ws-a',
      makeWorkspaces([makeWorkspace('ws-a', PATH_A, ['a', 'b'])]),
      makeSessions({ a: makeSession('A'), b: makeSession('B') }),
    )

    let partial = toggleSelection(emptySelection(), 'active', rows[0].key)
    expect(allSelected(partial, 'active', rows)).toBe(false)
    expect(selectedCount(partial, 'active', rows)).toBe(1)

    // 切换工作区后残留的键不计入「已选 N 个」，但会让 allSelected 为 false（集合不等）。
    partial = toggleSelection(partial, 'active', 'active:gone')
    expect(selectedCount(partial, 'active', rows)).toBe(1)
    expect(allSelected(partial, 'active', rows)).toBe(false)

    const all = selectAllSelection(emptySelection(), 'active', rows)
    expect(allSelected(all, 'active', rows)).toBe(true)
    expect(selectedCount(all, 'active', rows)).toBe(rows.length)
    expect(selectedCount(emptySelection(), 'active', rows)).toBe(0)
  })

  it('动作输入按行序投影、忽略残留键并跳过不可选行', () => {
    const rows = activeRows(
      'ws-a',
      makeWorkspaces([makeWorkspace('ws-a', PATH_A, ['a', 'run', 'b'])]),
      makeSessions({
        a: makeSession('A'),
        run: makeSession('运行中', { running: true }),
        b: makeSession('B'),
      }),
    )
    const selected = new Set(['active:b', 'active:run', 'active:a', 'active:gone'])
    expect(selectedSessionIds(rows, selected)).toEqual(['a', 'b'])
  })
})

describe('双动作分派', () => {
  it('三个 tab 的动作列表：tab1 归档、tab2 dispose+unarchive、tab3 purge+restore', () => {
    expect(MANAGER_TABS).toEqual(['active', 'archived', 'migrated'])
    expect(actionsForTab('active')).toEqual([{ kind: 'archive' }])
    expect(actionsForTab('archived')).toEqual([
      { kind: 'dispose', mode: 'archive' },
      { kind: 'unarchive' },
    ])
    expect(actionsForTab('archived', 'delete')).toEqual([
      { kind: 'dispose', mode: 'delete' },
      { kind: 'unarchive' },
    ])
    expect(actionsForTab('migrated')).toEqual([{ kind: 'purge' }, { kind: 'restore' }])
  })

  it('tab2 双动作共享同一选择集合：dispose 与 unarchive 投影出同一组会话 id', () => {
    const workspaces = makeWorkspaces(
      [makeWorkspace('ws-a', PATH_A, ['a2', 'a3'])],
      ['a2', 'a3'],
    )
    const rows = archivedRows(
      'ws-a',
      workspaces,
      makeSessions({
        a2: makeSession('归档二'),
        a3: makeSession('归档运行中', { running: true }),
      }),
    )
    let selection = emptySelection()
    selection = toggleSelection(selection, 'archived', 'archived:a2')
    selection = toggleSelection(selection, 'archived', 'archived:a3')

    expect(selectedSessionIds(rows, selection.archived)).toEqual(['a2'])
    expect(unarchiveSelected(selection, rows)).toEqual(['a2'])
    expect(unarchiveSelected(emptySelection(), rows)).toEqual([])
  })

  it('tab3 动作输入是 {projectDir, dirName}：按行序、忽略残留键', () => {
    const workspaces = makeWorkspaces([makeWorkspace('ws-a', PATH_A, [])])
    const rows = migratedRows(
      'ws-a',
      workspaces,
      makeMigratedListing([
        makeMigratedEntry('alpha-new', PROJECT_A, 300),
        makeMigratedEntry('alpha-unlisted', PROJECT_A, 200),
        makeMigratedEntry('alpha-old', PROJECT_A, 100),
      ]),
    )

    let selection = emptySelection()
    selection = toggleSelection(selection, 'migrated', rows[2].key)
    selection = toggleSelection(selection, 'migrated', rows[0].key)
    selection = toggleSelection(selection, 'migrated', 'migrated:--home-dev-orphan--/gone')

    expect(selectedMigratedTargets(rows, selection.migrated)).toEqual([
      { projectDir: PROJECT_A, dirName: 'alpha-new' },
      { projectDir: PROJECT_A, dirName: 'alpha-old' },
    ])
    expect(selectedMigratedTargets(rows, new Set())).toEqual([])
  })
})

describe('打开请求 store 契约（seq / identity）', () => {
  it('初始为空闲；连续 request 每次都换新对象并自增 seq', () => {
    const store = createManagerRequestStore()
    expect(store.source.getSnapshot()).toBeNull()

    store.request()
    const first = store.source.getSnapshot()
    expect(first).not.toBeNull()
    expect(first?.seq).toBe(1)

    store.request()
    const second = store.source.getSnapshot()
    expect(second).not.toBe(first)
    expect(second?.seq).toBe(2)
  })

  it('订阅者在通知时读到的是当时快照', () => {
    const store = createManagerRequestStore()
    const seen: Array<number | null> = []
    const unsubscribe = store.source.subscribe(() => {
      seen.push(store.source.getSnapshot()?.seq ?? null)
    })

    store.request()
    store.request()
    store.settle()
    expect(seen).toEqual([1, 2, null])
    unsubscribe()
  })

  it('settle 回 null 且幂等：重复调用不重复通知，下次 request 继续递增序号', () => {
    const store = createManagerRequestStore()
    let notifications = 0
    const unsubscribe = store.source.subscribe(() => {
      notifications += 1
    })

    store.request()
    expect(notifications).toBe(1)
    store.settle()
    expect(store.source.getSnapshot()).toBeNull()
    expect(notifications).toBe(2)

    store.settle()
    expect(store.source.getSnapshot()).toBeNull()
    expect(notifications).toBe(2)

    store.request()
    expect(store.source.getSnapshot()?.seq).toBe(2)
    unsubscribe()
  })

  it('退订后不再收到通知，其他订阅者仍保持订阅', () => {
    const store = createManagerRequestStore()
    let firstCalls = 0
    let secondCalls = 0
    const unsubscribeFirst = store.source.subscribe(() => {
      firstCalls += 1
    })
    const unsubscribeSecond = store.source.subscribe(() => {
      secondCalls += 1
    })

    store.request()
    expect(firstCalls).toBe(1)
    expect(secondCalls).toBe(1)

    unsubscribeFirst()
    store.request()
    expect(firstCalls).toBe(1)
    expect(secondCalls).toBe(2)

    unsubscribeSecond()
    store.settle()
    expect(firstCalls).toBe(1)
    expect(secondCalls).toBe(2)
  })
})
