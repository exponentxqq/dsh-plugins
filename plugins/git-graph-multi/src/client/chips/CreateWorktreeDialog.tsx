/**
 * The create-worktree dialog: host modal + input + buttons, a base-branch
 * host menu (default: the checkout's current branch), and readable rejection
 * copy. Success registers the worktree as a workspace and starts a new session
 * in it (the owner owns that flow).
 * @module dsh-git-graph-multi/client/chips/CreateWorktreeDialog
 */

import { useState } from 'react'
import { Button, IconChevronDownOutlineRegular, Input, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { sanitizeWorktreeName } from '../../core/git-command.ts'
import type { BranchRow, WorktreeAddResult } from '../../core/types.ts'
import type { GitGraphKey } from '../locales.ts'
import { errorMessage } from './error-copy.ts'
import css from './context.module.css'

/** Props of the create-worktree dialog. */
export interface CreateWorktreeDialogProps {
  /** Local branches for the base picker. */
  branches: BranchRow[]
  /** The checkout's current branch (the picker default); empty when detached. */
  currentBranch: string
  /** The create flow: host worktree-add, then workspace registration + session start. */
  onCreate: (name: string, baseRef: string | undefined) => Promise<WorktreeAddResult>
  /** Close the dialog (cancel or after a successful create). */
  onClose: () => void
  t: Translate<GitGraphKey>
}

/**
 * The create-worktree-and-start-session dialog.
 * @param props - see {@link CreateWorktreeDialogProps}.
 */
export function CreateWorktreeDialog({ branches, currentBranch, onCreate, onClose, t }: CreateWorktreeDialogProps) {
  const [name, setName] = useState('')
  const [baseRef, setBaseRef] = useState(currentBranch)
  const [baseOpen, setBaseOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sanitized = sanitizeWorktreeName(name)
  // A detached checkout has no branch name to show; the base stays unset and
  // the button names that state with the shared copy.
  const baseLabel = baseRef === '' ? t('branch.detached') : baseRef

  /** Busy guard: the mask, Escape, and the close button must not abandon an in-flight create. */
  const requestClose = (): void => {
    if (!pending) onClose()
  }

  const submit = (): void => {
    if (pending) return
    if (sanitized === null) {
      setError(t('error.invalidWorktreeName'))
      return
    }
    setPending(true)
    setError(null)
    void onCreate(sanitized, baseRef === '' ? undefined : baseRef).then((result) => {
      if (result.ok) {
        onClose()
        return
      }
      setError(errorMessage(result.error, t))
    }).finally(() => { setPending(false) })
  }

  return (
    <Modal
      open
      onClose={requestClose}
      title={t('worktree.dialog.title')}
      description={t('worktree.dialog.description')}
      closeLabel={t('worktree.dialog.cancel')}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('worktree.dialog.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={pending || name.trim() === ''}
          >
            {t('worktree.dialog.confirm')}
          </Button>
        </>
      )}
    >
      <div className={css.form} data-gitgraph-worktree-dialog>
        <div className={css.field}>
          <label className={css.fieldLabel} htmlFor="git-graph-worktree-name">
            {t('worktree.dialog.nameLabel')}
          </label>
          <Input
            id="git-graph-worktree-name"
            className={css.fieldInput}
            value={name}
            onChange={(event) => { setName(event.target.value) }}
            placeholder={t('worktree.dialog.namePlaceholder')}
            onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
            data-modal-autofocus
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('worktree.dialog.baseLabel')}</span>
          <Menu
            open={baseOpen}
            anchor={(
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setBaseOpen(open => !open) }}
                disabled={pending}
                aria-haspopup="menu"
                aria-expanded={baseOpen}
              >
                <span className={css.baseValue}>{baseLabel}</span>
                <IconChevronDownOutlineRegular size={12} />
              </Button>
            )}
            items={branches.map(branch => ({ id: branch.name, label: branch.name }))}
            selectedId={baseRef === '' ? undefined : baseRef}
            onSelect={(id) => {
              setBaseRef(id)
              setBaseOpen(false)
            }}
            onClose={() => { setBaseOpen(false) }}
            portal
          />
        </div>
        {error !== null && <div className={css.formError} role="alert">{error}</div>}
      </div>
    </Modal>
  )
}
