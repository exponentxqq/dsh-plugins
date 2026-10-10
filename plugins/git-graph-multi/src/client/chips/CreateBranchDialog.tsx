/**
 * The create-branch dialog: host modal + input + buttons, with the pure
 * validation mirror for instant feedback, the host `check-ref-format` gate as
 * the authority, and readable rejection copy.
 * @module dsh-git-graph-multi/client/chips/CreateBranchDialog
 */

import { useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { validateBranchName } from '../../core/git-command.ts'
import type { SwitchResult } from '../../core/types.ts'
import type { GitGraphKey } from '../locales.ts'
import { errorMessage } from './error-copy.ts'
import css from './context.module.css'

/** Props of the create-branch dialog. */
export interface CreateBranchDialogProps {
  /** The host create verb (`git switch --no-guess -c <name>` from HEAD). */
  onCreate: (name: string) => Promise<SwitchResult>
  /** Close the dialog (cancel or after a successful create). */
  onClose: () => void
  t: Translate<GitGraphKey>
}

/**
 * The create-and-switch dialog.
 * @param props - see {@link CreateBranchDialogProps}.
 */
export function CreateBranchDialog({ onCreate, onClose, t }: CreateBranchDialogProps) {
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Busy guard: the mask, Escape, and the close button must not abandon an in-flight create. */
  const requestClose = (): void => {
    if (!pending) onClose()
  }

  const submit = (): void => {
    if (pending) return
    const trimmed = name.trim()
    if (validateBranchName(trimmed) !== null) {
      setError(t('error.invalidBranchName'))
      return
    }
    setPending(true)
    setError(null)
    void onCreate(trimmed).then((result) => {
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
      title={t('branch.createDialog.title')}
      description={t('branch.createDialog.description')}
      closeLabel={t('branch.createDialog.cancel')}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('branch.createDialog.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={pending || name.trim() === ''}
          >
            {t('branch.createDialog.confirm')}
          </Button>
        </>
      )}
    >
      <div className={css.form}>
        <div className={css.field}>
          <label className={css.fieldLabel} htmlFor="git-graph-branch-name">
            {t('branch.createDialog.nameLabel')}
          </label>
          <Input
            id="git-graph-branch-name"
            className={css.fieldInput}
            value={name}
            onChange={(event) => { setName(event.target.value) }}
            placeholder={t('branch.createDialog.placeholder')}
            onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
            data-modal-autofocus
          />
        </div>
        {error !== null && <div className={css.formError} role="alert">{error}</div>}
      </div>
    </Modal>
  )
}
