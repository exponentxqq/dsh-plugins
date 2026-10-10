/**
 * The branch panel of one repository: the searchable local branch list with the
 * current branch checked, the dirtiness line, the inline failure notice, and a
 * single "more actions" entry that pushes the operations panel (create branch /
 * Git graph / worktree session / worktree management, plus the group operations
 * of the root checkout). The view never carries side-by-side action buttons —
 * actions live in their own panel. The surface material comes from the host menu
 * surface; success feedback is the owner's toast, because a toast outlives this
 * panel.
 * @module dsh-git-graph-multi/client/chips/BranchPopover
 */

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  IconBranchOutlineRegular,
  IconCheckOutlineMedium,
  IconChevronLeftOutlineMedium,
  IconEllipsisOutlineRegular,
  IconFlatListOutlineRegular,
  IconListPenOutlineRegular,
  IconLoadingOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconSearchOutlineRegular,
  IconWorkspaceTreeOutlineRegular,
  Input,
  MenuSurface,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { BranchesView, SwitchResult } from '../../core/types.ts'
import type { GitGraphKey } from '../locales.ts'
import { errorMessage } from './error-copy.ts'
import { cx, Backdrop } from './Chip.tsx'
import css from './context.module.css'

/** Props of the branch panel. */
export interface BranchPopoverProps {
  view: BranchesView
  /** Repository-level switch verb; resolves to a stable git error on rejection. */
  onSwitch: (branch: string) => Promise<SwitchResult>
  /** Fired after a successful switch, with the branch now checked out (the owner refetches its status and reports the switch). */
  onSwitched: (branch: string) => void
  /** Open the create-branch dialog. */
  onCreate: () => void
  /** Open the Git graph panel. */
  onGraph: () => void
  /** Open the create-worktree (new isolated session) dialog. */
  onCreateWorktree: () => void
  /** Open the worktree manager. */
  onManageWorktrees: () => void
  /**
   * Group-operation entries of the operations panel. Only the workspace root
   * checkout passes this, so a non-root repository cannot render them at all.
   */
  groupOps?: {
    /** Open the group-switch dialog. */
    onSwitch: () => void
    /** Open the group-create dialog. */
    onCreate: () => void
  }
  /** Close the panel (backdrop / after a successful switch). */
  onClose: () => void
  t: Translate<GitGraphKey>
  /** Display name of the repository this panel acts on (multi-repository workspaces); omitted for a single-repository workspace. */
  repoLabel?: string
}

/** Branch names longer than this get a host tooltip with the full name. */
const TOOLTIP_NAME_THRESHOLD = 18
/** Hover dwell before the full-name tooltip appears. */
const TOOLTIP_DELAY_MS = 400
/** Width cap of the full-name tooltip bubble. */
const TOOLTIP_MAX_WIDTH = 320

/** Which face of the panel is showing: the branch view or the pushed operations panel. */
type PanelFace = 'list' | 'ops'

/**
 * The branch panel of one repository.
 * @param props - see {@link BranchPopoverProps}.
 */
export function BranchPopover({ view, onSwitch, onSwitched, onCreate, onGraph, onCreateWorktree, onManageWorktrees, groupOps, onClose, t, repoLabel }: BranchPopoverProps) {
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<PanelFace>('list')
  const busy = pending !== null

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return view.branches
    return view.branches.filter(branch => branch.name.toLowerCase().includes(needle))
  }, [view.branches, query])

  const switchTo = (branch: string): void => {
    if (busy) return
    setPending(branch)
    setError(null)
    void onSwitch(branch).then((result) => {
      if (result.ok) {
        // The owner raises the success toast: it must survive this panel.
        onSwitched(result.branch)
        onClose()
        return
      }
      setError(errorMessage(result.error, t))
    }).finally(() => { setPending(null) })
  }

  /** One operations-panel row: leading icon, title, and a one-line description. */
  const opsRow = (key: string, icon: ReactNode, title: string, description: string, onClick: () => void, part?: string): ReactNode => (
    <Button
      key={key}
      variant="ghost"
      size="sm"
      className={css.opsItem}
      icon={icon}
      onClick={onClick}
      disabled={busy}
      data-gitgraph-ops-item={key}
      data-dsh-part={part}
    >
      <span className={css.opsItemText}>
        <span className={css.opsItemTitle}>{title}</span>
        <span className={css.opsItemDesc}>{description}</span>
      </span>
    </Button>
  )

  const listFace = (
    <>
      <div className={css.search}>
        <Input
          className={css.searchField}
          icon={<IconSearchOutlineRegular size={14} />}
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
          placeholder={t('branch.search')}
          autoFocus
        />
      </div>
      {view.dirtyFiles > 0
        && <div className={css.dirty}>{t('branch.dirty', { count: view.dirtyFiles })}</div>}
      <div className={css.list}>
        {filtered.length === 0
          ? <div className={css.empty}>{t('branch.empty')}</div>
          : filtered.map(branch => (
            <Tooltip
              key={branch.name}
              label={branch.name}
              portal
              delayMs={TOOLTIP_DELAY_MS}
              maxWidth={TOOLTIP_MAX_WIDTH}
              disabled={branch.name.length <= TOOLTIP_NAME_THRESHOLD}
            >
              <button
                type="button"
                className={cx(css.item, branch.current && css.itemActive)}
                onClick={() => { switchTo(branch.name) }}
                role="option"
                aria-selected={branch.current}
                aria-label={branch.name}
                disabled={busy}
              >
                {pending === branch.name
                  ? <IconLoadingOutlineRegular className={css.spinner} size={14} />
                  : <IconBranchOutlineRegular size={14} />}
                <span className={css.itemText}>
                  <span className={css.itemName}>{branch.name}</span>
                </span>
                {branch.current && <IconCheckOutlineMedium className={css.check} size={14} />}
              </button>
            </Tooltip>
          ))}
      </div>
      {error !== null && <div className={css.notice}>{error}</div>}
      <div className={css.footer}>
        <Button
          variant="ghost"
          size="sm"
          className={css.footerButton}
          icon={<IconEllipsisOutlineRegular size={14} />}
          onClick={() => { setPanel('ops') }}
          disabled={busy}
          data-gitgraph-more
        >
          {t('ops.more')}
        </Button>
      </div>
    </>
  )

  const opsFace = (
    <>
      <div className={css.panelHeader}>
        <Button
          variant="ghost"
          size="sm"
          className={css.backEntry}
          icon={<IconChevronLeftOutlineMedium size={14} />}
          onClick={() => { setPanel('list') }}
          aria-label={t('ops.back')}
          data-gitgraph-back
        >
          {t('ops.back')}
        </Button>
        {repoLabel !== undefined && <span className={css.panelRepoLabel} title={repoLabel}>{repoLabel}</span>}
      </div>
      <div className={css.opsStack} data-gitgraph-ops>
        <div className={css.opsGroup}>{t('ops.group.branch')}</div>
        {opsRow('create', <IconPlusOutlineRegular size={14} />, t('branch.create'), t('ops.create.desc'), onCreate)}
        {opsRow('graph', <IconListPenOutlineRegular size={14} />, t('branch.graph'), t('ops.graph.desc'), onGraph)}
        <div className={css.opsGroup}>{t('ops.group.worktree')}</div>
        {opsRow('worktree-create', <IconFlatListOutlineRegular size={14} />, t('worktree.create'), t('ops.worktreeCreate.desc'), onCreateWorktree, 'worktree-create')}
        {opsRow('worktree-manage', <IconWorkspaceTreeOutlineRegular size={14} />, t('worktree.manage'), t('ops.worktreeManage.desc'), onManageWorktrees, 'worktree-manage')}
        {groupOps !== undefined && (
          <>
            <div className={css.opsGroup}>{t('ops.group.group')}</div>
            {opsRow('group-switch', <IconRefreshOutlineRegular size={14} />, t('ops.groupSwitch'), t('ops.groupSwitch.desc'), groupOps.onSwitch)}
            {opsRow('group-create', <IconPlusOutlineRegular size={14} />, t('ops.groupCreate'), t('ops.groupCreate.desc'), groupOps.onCreate, 'group-create')}
          </>
        )}
      </div>
    </>
  )

  return (
    <>
      <Backdrop onClose={onClose} />
      <MenuSurface
        compact
        className={cx(css.popover, panel === 'ops' && css.popoverOps)}
        role={panel === 'list' ? 'listbox' : 'dialog'}
        aria-label={panel === 'list' ? t('branch.search') : t('ops.more')}
        data-gitgraph-popover
      >
        {panel === 'list' ? listFace : opsFace}
      </MenuSurface>
    </>
  )
}
