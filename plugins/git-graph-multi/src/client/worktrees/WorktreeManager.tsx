/**
 * The worktree manager dialog: every linked worktree of the repository with
 * its branch/head, plus removal of managed worktrees. Dirty worktrees reject
 * once and surface an inline force-confirm; the wt/ branch survives removal
 * unless the row's delete-branch checkbox is on. The primary checkout row is
 * display-only.
 * @module dsh-git-graph-multi/client/worktrees/WorktreeManager
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Checkbox, IconBranchOutlineRegular, IconLoadingOutlineRegular, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { WORKTREE_BRANCH_PREFIX } from '../../core/git-command.ts'
import type { WorktreeInfo, WorktreeListView, WorktreeRemoveResult } from '../../core/types.ts'
import type { GitGraphKey } from '../locales.ts'
import { errorMessage } from '../chips/error-copy.ts'
import css from '../chips/context.module.css'

/** Props of the worktree manager dialog. */
export interface WorktreeManagerProps {
  /** Fetch the fresh worktree list. */
  fetchWorktrees: () => Promise<WorktreeListView | null>
  /** Remove one managed worktree (force/deleteBranch options ride through). */
  onRemove: (worktreePath: string, opts: { force?: boolean; deleteBranch?: boolean }) => Promise<WorktreeRemoveResult>
  /** Close the dialog. */
  onClose: () => void
  t: Translate<GitGraphKey>
}

/**
 * The worktree manager dialog.
 * @param props - see {@link WorktreeManagerProps}.
 */
export function WorktreeManager({ fetchWorktrees, onRemove, onClose, t }: WorktreeManagerProps) {
  const [view, setView] = useState<WorktreeListView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Row awaiting an inline force-confirm after a worktree-dirty rejection. */
  const [forcePath, setForcePath] = useState<string | null>(null)
  /** Rows whose wt/ branch should be deleted together with the worktree. */
  const [branchDelete, setBranchDelete] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState<string | null>(null)
  const busy = pending !== null

  const reload = useCallback(() => {
    let live = true
    setLoading(true)
    void fetchWorktrees().then((fresh) => {
      if (!live) return
      setView(fresh)
      setLoading(false)
    })
    return () => { live = false }
  }, [fetchWorktrees])

  useEffect(() => reload(), [reload])

  /** Busy guard: the mask, Escape, and the close button must not abandon an in-flight removal. */
  const requestClose = (): void => {
    if (!busy) onClose()
  }

  const remove = (item: WorktreeInfo, force: boolean): void => {
    if (busy) return
    setPending(item.path)
    setError(null)
    void onRemove(item.path, { force, deleteBranch: branchDelete.has(item.path) }).then((result) => {
      if (result.ok) {
        setForcePath(null)
        reload()
        return
      }
      if (result.error.code === 'worktree-dirty' && !force) {
        setForcePath(item.path)
        return
      }
      setError(errorMessage(result.error, t))
    }).finally(() => { setPending(null) })
  }

  const toggleBranchDelete = (path: string): void => {
    setBranchDelete((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const rows = view?.worktrees ?? []

  return (
    <Modal
      open
      onClose={requestClose}
      title={t('worktree.manager.title')}
      closeLabel={t('worktree.manager.close')}
      className={css.managerDialog}
      footer={(
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {t('worktree.manager.close')}
        </Button>
      )}
    >
      {/* The host modal owns the dialog element, so the walkthrough hook rides
          the list region it renders inside that dialog. */}
      <div className={css.managerList} data-gitgraph-worktree-manager>
        {loading && <div className={css.graphEmpty}>{t('worktree.manager.loading')}</div>}
        {!loading && rows.length <= 1 && <div className={css.graphEmpty}>{t('worktree.manager.empty')}</div>}
        {!loading && rows.map(item => (
          <div key={item.path} className={css.managerRow} data-main={item.main || undefined}>
            <div className={css.managerInfo}>
              <div className={css.managerHeadline}>
                <IconBranchOutlineRegular size={13} />
                {item.branch === ''
                  ? <Tag tone="quiet" className={css.tagFixed}>{t('worktree.manager.detached')}</Tag>
                  : <span className={css.managerBranch}>{item.branch}</span>}
                {item.main && <Tag tone="neutral" className={css.tagFixed}>{t('worktree.manager.main')}</Tag>}
                <span className={css.managerOid}>{item.head.slice(0, 7)}</span>
              </div>
              <div className={css.managerPath} title={item.path}>{item.path}</div>
              {forcePath === item.path && (
                <div className={css.managerConfirm}>
                  <span>{t('worktree.manager.forceConfirm')}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={css.managerDanger}
                    disabled={busy}
                    onClick={() => { remove(item, true) }}
                  >
                    {t('worktree.manager.forceYes')}
                  </Button>
                </div>
              )}
            </div>
            {!item.main && (
              <div className={css.managerActions}>
                {item.branch.startsWith(WORKTREE_BRANCH_PREFIX) && (
                  <Checkbox
                    checked={branchDelete.has(item.path)}
                    onChange={() => { toggleBranchDelete(item.path) }}
                    label={t('worktree.manager.deleteBranch')}
                    disabled={busy}
                  />
                )}
                <div className={css.managerRowActions}>
                  {pending === item.path && <IconLoadingOutlineRegular className={css.spinner} size={14} />}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => { remove(item, false) }}
                  >
                    {t('worktree.manager.remove')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {error !== null && <div className={css.formError} role="alert">{error}</div>}
    </Modal>
  )
}
