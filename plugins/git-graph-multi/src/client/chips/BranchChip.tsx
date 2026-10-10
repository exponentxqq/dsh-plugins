/**
 * The git branch chip row for blank sessions. It mounts in the selector context
 * hole (`conversation.input.selector.context`) beside the official workspace
 * selector. On shells that dropped the hole, it uses `conversation.input.dock`
 * only for the blank-session hero phase: the row then occupies its own line
 * directly under the official hero workspace row, sharing that row's content
 * box (the same `0 16px 0 20px` inset) so both rows' chips left-align. The
 * placement is pure CSS on the row's own box — it never reaches into the
 * shell's DOM, so no shell class name or mount order can move it. It is
 * intentionally absent while a session is running.
 *
 * In a multi-repository workspace the row renders one chip per enumerated
 * repository (root checkout first, then by display name): every chip opens that
 * repository's own branch panel, so the multi-repository experience matches the
 * single-repository one instead of drilling through a workspace overview. The
 * root checkout's operations panel additionally carries the group operations.
 * A workspace with at most one repository keeps the original single-repository
 * surface (branch-only label, no group operations).
 * @module dsh-git-graph-multi/client/chips/BranchChip
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconBranchOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BranchesView, GroupBase, GroupRepoResult, GroupResultView, RepoStatus, ReposView,
} from '../../core/types.ts'
import type { GitGraphInjected } from '../verbs.ts'
import { chipLabel, planChips, unionBranches, type BranchUnionEntry, type ChipEntry } from '../repos/selection.ts'
import { Chip, cx } from './Chip.tsx'
import { BranchPopover } from './BranchPopover.tsx'
import { CreateBranchDialog } from './CreateBranchDialog.tsx'
import { CreateWorktreeDialog } from './CreateWorktreeDialog.tsx'
import { WorktreeManager } from '../worktrees/WorktreeManager.tsx'
import { GraphDialog } from '../graph/GraphDialog.tsx'
import { GroupCreateDialog } from '../repos/GroupCreateDialog.tsx'
import { GroupSwitchDialog } from '../repos/GroupSwitchDialog.tsx'
import { GroupResultPanel } from '../repos/GroupResultPanel.tsx'
import css from './context.module.css'

/** Full props of the branch chip row: either seat's runtime share (the session-maybe context hole or the dock fallback's blank-session hero) + the git-graph inject face + the locale seat. */
export type BranchChipProps =
  (PropsRuntime<'conversation.input.selector.context'> | PropsRuntime<'conversation.input.dock'>)
  & GitGraphInjected
  & PropsLocale<'git-graph'>

/** Minimum gap between window-focus git refetches (ms). */
export const FOCUS_REFRESH_MIN_MS = 5_000

/** One host toast: the sequence remounts the banner so a repeat switch restarts its cycle. */
interface ChipToast {
  seq: number
  text: string
}

/** The repository-scoped dialog a chip's operations panel can open. */
type RepoDialog = 'create' | 'graph' | 'worktree-create' | 'worktree-manage'

const SKIN_CENTER_BODY_ATTR = 'data-dsh-skin-center'
const DARK_THEME_BODY_ATTR = 'data-ds-dark-theme'
const DSH_BODY_ATTR_PREFIX = 'data-dsh-'

/** Whether a body attribute belongs to an applied skin rather than the skin center shell. */
function hasAppliedSkinBodyAttr(name: string): boolean {
  return name.startsWith(DSH_BODY_ATTR_PREFIX) && name !== SKIN_CENTER_BODY_ATTR
}

/** Whether the page is using the unskinned stock light theme. */
function readStockLightTheme(): boolean {
  if (typeof document === 'undefined') return false
  const body = document.body
  if (!body.hasAttribute(SKIN_CENTER_BODY_ATTR) || body.hasAttribute(DARK_THEME_BODY_ATTR)) return false
  return !body.getAttributeNames().some(hasAppliedSkinBodyAttr)
}

/** Track stock-light theme changes from body attributes. */
function useStockLightTheme(): boolean {
  const [stockLightTheme, setStockLightTheme] = useState(readStockLightTheme)

  useEffect(() => {
    const update = (): void => { setStockLightTheme(readStockLightTheme()) }
    update()
    if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return undefined
    const observer = new MutationObserver(update)
    observer.observe(document.body, { attributes: true })
    return () => { observer.disconnect() }
  }, [])

  return stockLightTheme
}

/**
 * The git branch chip row for blank sessions.
 * @param props - the composed entry props of whichever seat it mounted in.
 */
export function BranchChip(props: BranchChipProps) {
  const sessionId = props.sessionId
  // Blank-session flag from the standard session list. The selector never
  // throws for a missing session id / row, so the hook can stay mounted
  // while the session baseline is still loading.
  const blankSession = props.useSessions((state): boolean => {
    if (sessionId === undefined) return false
    const sessions = state as { byId?: Record<string, { blank?: boolean }> }
    return sessions.byId?.[sessionId]?.blank === true
  })
  // The dock seat carries the composer snapshot. It exposes the selector
  // only in the blank hero phase; the session-maybe context seat uses the
  // session baseline's blank flag instead.
  const dockSeat = 'session' in props && 'input' in props
  const sessionSnapshot = dockSeat ? props.session : undefined
  // 0.1.2 cohort: the composer phase machine is gone from the snapshot; the
  // blank empty-log mirror plus open state covers the same show-selector seat.
  const heroSeat = sessionSnapshot?.blank === true && (sessionSnapshot.openState === 'open' || blankSession === true)
  const showBranchSelector = dockSeat ? heroSeat : blankSession
  const stockLightTheme = useStockLightTheme()

  /** Repository enumeration of the session workspace: undefined = scanning, null = unavailable (fall back to the workspace root). */
  const [reposView, setReposView] = useState<ReposView | null | undefined>(undefined)
  /** Workspace-root status used only when the enumeration failed. */
  const [fallbackRepo, setFallbackRepo] = useState<RepoStatus | null | undefined>(undefined)
  /** Which repository's panel is open: null = none, '' = the workspace-root chip. */
  const [openPath, setOpenPath] = useState<string | null>(null)
  /** Branch list of the open panel, tagged with the repository key it was fetched for. */
  const [branches, setBranches] = useState<{ key: string; view: BranchesView | null } | null>(null)
  /** The repository the currently open dialog acts on (undefined: the workspace root / a workspace-wide dialog). */
  const [dialogPath, setDialogPath] = useState<string | undefined>(undefined)
  const [createOpen, setCreateOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [worktreeCreateOpen, setWorktreeCreateOpen] = useState(false)
  const [worktreeManageOpen, setWorktreeManageOpen] = useState(false)
  const [groupSwitchOpen, setGroupSwitchOpen] = useState(false)
  const [groupCreateOpen, setGroupCreateOpen] = useState(false)
  /** Branch-name union behind the group-switch dialog (null: still collecting). */
  const [groupUnion, setGroupUnion] = useState<readonly BranchUnionEntry[] | null>(null)
  const [groupBusy, setGroupBusy] = useState(false)
  /** Per-repository result of the last group operation (null: none to report). */
  const [groupResult, setGroupResult] = useState<GroupResultView | null>(null)
  /** Stable failure sentence shown inside the open group dialog (null: none). */
  const [groupError, setGroupError] = useState<string | null>(null)
  /** Bumped to force a re-enumeration (panel open, external change, or a finished operation). */
  const [refreshToken, setRefreshToken] = useState(0)
  /** Host toast of the last successful switch (null: none showing). */
  const [toast, setToast] = useState<ChipToast | null>(null)
  const toastSeq = useRef(0)
  /** The last group operation, replayed for one repository by the result panel's retry. */
  const lastGroupRef = useRef<{ action: 'switch' | 'create'; branch: string; base: GroupBase } | null>(null)

  const repoRows = reposView === undefined || reposView === null ? [] : reposView.repos
  // The pure rules live in repos/selection.ts: which chips render, what each
  // one says, and which path its verbs carry. A one-repository workspace (and a
  // failed enumeration) therefore keeps the pre-existing single-repository
  // surface instead of growing a row.
  const chips = planChips(reposView, fallbackRepo)
  const multi = chips.length > 1
  // The group operations belong to the root checkout. A workspace whose root is
  // not itself a repository has no primary row, so the first chip of the row
  // (root-first order) carries them rather than leaving them unreachable.
  const groupOwner: ChipEntry | undefined = multi ? (chips.find(entry => entry.primary) ?? chips[0]) : undefined

  // The watched repository set: every enumerated repository, or the workspace
  // root while the enumeration is pending/unavailable. One shared SSE stream
  // covers the whole set (the per-origin connection pool forbids one stream per
  // repository); a push re-enumerates, which refreshes every chip at once.
  const watchPaths = useMemo(
    () => (reposView === null || reposView === undefined ? undefined : reposView.repos.map(row => row.repo.path)),
    [reposView],
  )
  const watchKey = watchPaths === undefined ? '' : watchPaths.join('\n')
  const watchPathsRef = useRef<readonly string[] | undefined>(undefined)
  watchPathsRef.current = watchPaths

  const refreshAll = useCallback((): void => {
    setRefreshToken(token => token + 1)
  }, [])

  // Enumerate the workspace's repositories once the selector shows. The scan
  // stays lazy (never part of the status polling) and never starts for an
  // active session. A failed request falls back to the pre-existing
  // workspace-root behavior instead of hiding the row.
  useEffect(() => {
    if (!showBranchSelector) return undefined
    let live = true
    props.repos(sessionId).then((view) => {
      if (live) setReposView(view)
    }).catch(() => {
      if (live) setReposView(null)
    })
    return () => { live = false }
  }, [showBranchSelector, props.repos, sessionId, refreshToken])

  // The enumeration failed: one workspace-root chip driven by the plain status
  // read, so a failed scan never removes the control.
  useEffect(() => {
    if (!showBranchSelector || reposView !== null) return undefined
    let live = true
    setFallbackRepo(undefined)
    props.repoStatus(sessionId).then((status) => {
      if (live) setFallbackRepo(status)
    }).catch(() => {
      if (live) setFallbackRepo(null)
    })
    return () => { live = false }
  }, [showBranchSelector, reposView, props.repoStatus, sessionId, refreshToken])

  // Blank-session data stays fresh through host-pushed changes and a throttled
  // focus refresh. Active sessions never subscribe or start a Git round trip.
  const lastFocusRefetch = useRef(0)
  useEffect(() => {
    if (!showBranchSelector) return undefined
    const unsubscribe = props.subscribeChanges(sessionId, refreshAll, watchPathsRef.current)
    const onFocus = (): void => {
      const now = Date.now()
      if (now - lastFocusRefetch.current < FOCUS_REFRESH_MIN_MS) return
      lastFocusRefetch.current = now
      refreshAll()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [showBranchSelector, props.subscribeChanges, sessionId, watchKey, refreshAll])

  // Fetch the fresh branch list of the open repository each time its panel
  // opens (and again after a pushed change or a finished operation).
  useEffect(() => {
    if (!showBranchSelector || openPath === null) return undefined
    const key = openPath
    let live = true
    setBranches(null)
    props.branches(sessionId, key === '' ? undefined : key).then((view) => {
      if (live) setBranches({ key, view })
    }).catch(() => {
      if (live) setBranches({ key, view: null })
    })
    return () => { live = false }
  }, [showBranchSelector, openPath, props.branches, sessionId, refreshToken])

  // Active sessions intentionally expose no branch-selection control. Loading
  // and non-repository workspaces likewise render no dead control.
  if (!showBranchSelector || chips.length === 0) return null

  const copy = { detached: props.t('branch.detached'), unavailable: props.t('repos.unavailable') }
  const openKey = openPath ?? ''
  const panelBranches = branches !== null && branches.key === openKey ? branches.view : null
  const dialogBranches = branches !== null && branches.key === (dialogPath ?? '') ? branches.view : null

  const toggleChip = (entry: ChipEntry): void => {
    const key = entry.path ?? ''
    setOpenPath(prev => (prev === key ? null : key))
  }

  const closePopover = (): void => { setOpenPath(null) }

  /** Report a successful switch through the host toast, which outlives the closed panel. */
  const reportSwitched = (branch: string): void => {
    refreshAll()
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text: props.t('toast.switchSuccess', { branchName: branch }) })
  }

  /** Leave the panel and open one repository-scoped dialog on the same repository. */
  const openRepoDialog = (path: string | undefined, dialog: RepoDialog): void => {
    setDialogPath(path)
    setOpenPath(null)
    if (dialog === 'create') setCreateOpen(true)
    if (dialog === 'graph') setGraphOpen(true)
    if (dialog === 'worktree-create') setWorktreeCreateOpen(true)
    if (dialog === 'worktree-manage') setWorktreeManageOpen(true)
  }

  /** Open the group-switch dialog and collect the workspace-wide branch union behind it. */
  const openGroupSwitch = (): void => {
    setDialogPath(undefined)
    setOpenPath(null)
    setGroupError(null)
    setGroupUnion(null)
    setGroupSwitchOpen(true)
    void Promise.all(repoRows.map(row => props.branches(sessionId, row.repo.path)))
      .then((views) => { setGroupUnion(unionBranches(views)) })
      .catch(() => { setGroupUnion([]) })
  }

  const openGroupCreate = (): void => {
    setDialogPath(undefined)
    setOpenPath(null)
    setGroupError(null)
    setGroupCreateOpen(true)
  }

  const submitGroupSwitch = (branch: string): void => {
    setGroupBusy(true)
    setGroupError(null)
    void props.groupSwitch(sessionId, branch).then((result) => {
      if (result === null) {
        setGroupError(props.t('repos.groupFailed'))
        return
      }
      lastGroupRef.current = { action: 'switch', branch, base: 'mainline' }
      setGroupSwitchOpen(false)
      setGroupResult(result)
      refreshAll()
    }).catch(() => {
      setGroupError(props.t('repos.groupFailed'))
    }).finally(() => { setGroupBusy(false) })
  }

  const submitGroupCreate = (paths: readonly string[], name: string, base: GroupBase): void => {
    setGroupBusy(true)
    setGroupError(null)
    void props.groupCreate(sessionId, paths, name, base).then((result) => {
      if (result === null) {
        setGroupError(props.t('repos.groupFailed'))
        return
      }
      lastGroupRef.current = { action: 'create', branch: name, base }
      setGroupCreateOpen(false)
      setGroupResult(result)
      refreshAll()
    }).catch(() => {
      setGroupError(props.t('repos.groupFailed'))
    }).finally(() => { setGroupBusy(false) })
  }

  // Single-repository retry: replay the same-named operation on exactly one
  // repository (a group create keeps the original per-repository base), then
  // patch its row and refresh the views after a success.
  const retryRepo = (repoPath: string): void => {
    const last = lastGroupRef.current
    const rows = groupResult === null ? [] : groupResult.results
    const existing = rows.find(row => row.repo.path === repoPath)
    if (last === null || existing === undefined) return
    const target = existing.repo
    setGroupBusy(true)
    const settle = (row: GroupRepoResult): void => {
      setGroupResult(prev => (prev === null
        ? prev
        : { ...prev, results: prev.results.map(item => (item.repo.path === row.repo.path ? row : item)) }))
    }
    const fail = (): void => {
      settle({ repo: target, outcome: 'failed', error: { code: 'internal', message: props.t('repos.groupFailed') } })
    }
    if (last.action === 'switch') {
      void props.switchBranch(sessionId, last.branch, repoPath).then((result) => {
        if (result.ok) {
          settle({ repo: target, outcome: 'ok' })
          refreshAll()
          return
        }
        settle({ repo: target, outcome: 'failed', error: result.error })
      }).catch(fail).finally(() => { setGroupBusy(false) })
      return
    }
    void props.groupCreate(sessionId, [repoPath], last.branch, last.base).then((result) => {
      const row = result === null ? undefined : result.results.find(item => item.repo.path === repoPath)
      if (row === undefined) {
        fail()
        return
      }
      settle(row)
      if (row.outcome === 'ok') refreshAll()
    }).catch(fail).finally(() => { setGroupBusy(false) })
  }

  const chipNode = (
    <div
      data-gitgraph-chip-anchor
      data-dsh-plugin="git-graph"
      data-dsh-part="chip"
      data-gitgraph-stock-light={stockLightTheme || undefined}
      data-gitgraph-multi={multi || undefined}
      className={cx(css.anchor, heroSeat && css.anchorHero)}
    >
      <div className={css.chipWrap} data-gitgraph-chips>
        {chips.map((entry) => {
          const key = entry.path ?? ''
          const open = openPath === key
          const ownsGroupOps = groupOwner !== undefined && entry === groupOwner
          return (
            <span className={css.chipSlot} key={key === '' ? 'root' : key}>
              <Chip
                hero={heroSeat}
                icon={<IconBranchOutlineRegular size={14} />}
                label={chipLabel(entry, copy)}
                ariaLabel={multi ? props.t('chip.aria.branchRepo', { name: entry.name }) : props.t('chip.aria.branch')}
                open={open}
                onClick={() => { toggleChip(entry) }}
                disabled={!entry.available}
                primary={multi && entry.primary}
                title={entry.path ?? entry.name}
                repoPath={entry.path}
                badge={entry.dirty > 0
                  ? <span className={css.chipBadge} title={props.t('branch.dirty', { count: entry.dirty })}>{entry.dirty}</span>
                  : undefined}
              />
              {open && panelBranches !== null && (
                <BranchPopover
                  view={panelBranches}
                  repoLabel={multi ? entry.name : undefined}
                  onSwitch={(branch) => props.switchBranch(sessionId, branch, entry.path)}
                  onSwitched={reportSwitched}
                  onCreate={() => { openRepoDialog(entry.path, 'create') }}
                  onGraph={() => { openRepoDialog(entry.path, 'graph') }}
                  onCreateWorktree={() => { openRepoDialog(entry.path, 'worktree-create') }}
                  onManageWorktrees={() => { openRepoDialog(entry.path, 'worktree-manage') }}
                  groupOps={ownsGroupOps ? { onSwitch: openGroupSwitch, onCreate: openGroupCreate } : undefined}
                  onClose={closePopover}
                  t={props.t}
                />
              )}
            </span>
          )
        })}
      </div>
      {createOpen && (
        <CreateBranchDialog
          onCreate={(name) => props.createBranch(sessionId, name, dialogPath)}
          onClose={() => { setCreateOpen(false); refreshAll() }}
          t={props.t}
        />
      )}
      {graphOpen && (
        <GraphDialog
          graph={(limit) => props.graph(sessionId, limit, dialogPath)}
          onClose={() => { setGraphOpen(false) }}
          t={props.t}
        />
      )}
      {worktreeCreateOpen && dialogBranches !== null && (
        <CreateWorktreeDialog
          branches={dialogBranches.branches}
          currentBranch={dialogBranches.branch}
          onCreate={(name, baseRef) => props.createWorktreeSession(sessionId, name, baseRef, dialogPath)}
          onClose={() => { setWorktreeCreateOpen(false); refreshAll() }}
          t={props.t}
        />
      )}
      {worktreeManageOpen && (
        <WorktreeManager
          fetchWorktrees={() => props.worktrees(sessionId, dialogPath)}
          onRemove={(worktreePath, opts) => props.removeWorktree(sessionId, worktreePath, opts, dialogPath)}
          onClose={() => { setWorktreeManageOpen(false) }}
          t={props.t}
        />
      )}
      {groupSwitchOpen && (
        <GroupSwitchDialog
          branches={groupUnion}
          total={repoRows.length}
          busy={groupBusy}
          error={groupError}
          onSubmit={submitGroupSwitch}
          onClose={() => { setGroupSwitchOpen(false) }}
          t={props.t}
        />
      )}
      {groupCreateOpen && (
        <GroupCreateDialog
          repos={repoRows.map(row => row.repo)}
          initialSelection={repoRows.filter(row => !row.repo.primary).map(row => row.repo.path)}
          busy={groupBusy}
          error={groupError}
          onSubmit={submitGroupCreate}
          onClose={() => { setGroupCreateOpen(false) }}
          t={props.t}
        />
      )}
      {groupResult !== null && (
        <GroupResultPanel
          result={groupResult}
          busy={groupBusy}
          onRetry={retryRepo}
          onClose={() => { setGroupResult(null) }}
          t={props.t}
        />
      )}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          tone="success"
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )

  return chipNode
}
