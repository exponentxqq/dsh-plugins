/**
 * The group-create dialog: pick the repositories, name the branch, and choose
 * the per-repository base (default mainline vs current HEAD). Host modal with
 * host checkboxes, segmented base control, and text input. Pure props — the
 * owner runs the group create and reports back through `busy` / `error`.
 * @module dsh-git-graph-multi/client/repos/GroupCreateDialog
 */

import { useState } from 'react'
import { Button, Checkbox, Input, Modal, SegmentedControl, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SegmentedControlOption } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { GroupBase, RepoRef } from '../../core/types.ts'
import type { GitGraphKey } from '../locales.ts'
import css from './repos.module.css'

/** Props of the group-create dialog. */
export interface GroupCreateDialogProps {
  /** Every enumerated repository, root checkout first. */
  repos: readonly RepoRef[]
  /** Paths checked on open (the owner pre-checks every non-primary repository). */
  initialSelection: readonly string[]
  /** A group create is in flight. */
  busy: boolean
  /** Stable failure sentence of the last attempt (null: none). */
  error: string | null
  /** Submit the checked repositories, the branch name, and the per-repository base. */
  onSubmit: (paths: readonly string[], name: string, base: GroupBase) => void
  onClose: () => void
  t: Translate<GitGraphKey>
}

/** Base id of the segmented base control (its segments derive `<id>-<value>`). */
const BASE_CONTROL_ID = 'gitgraph-group-base'

/**
 * The group-create dialog.
 * @param props - see {@link GroupCreateDialogProps}.
 */
export function GroupCreateDialog({ repos, initialSelection, busy, error, onSubmit, onClose, t }: GroupCreateDialogProps) {
  const [selected, setSelected] = useState<readonly string[]>(initialSelection)
  const [name, setName] = useState('')
  const [base, setBase] = useState<GroupBase>('mainline')

  const toggle = (path: string): void => {
    setSelected(prev => (prev.includes(path) ? prev.filter(item => item !== path) : [...prev, path]))
  }

  /** Busy guard: the mask, Escape, and the close button must not abandon an in-flight create. */
  const requestClose = (): void => {
    if (!busy) onClose()
  }

  const baseOptions: readonly SegmentedControlOption<GroupBase>[] = [
    { value: 'mainline', label: t('group.base.mainline') },
    { value: 'head', label: t('group.base.head') },
  ]

  const trimmed = name.trim()
  const canSubmit = !busy && trimmed !== '' && selected.length > 0

  return (
    <Modal
      open
      onClose={requestClose}
      title={t('group.create.title')}
      description={t('group.create.description')}
      closeLabel={t('group.close')}
      className={css.groupDialog}
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('group.create.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => { if (canSubmit) onSubmit(selected, trimmed, base) }}
            disabled={!canSubmit}
            data-gitgraph-group-submit
          >
            {t('group.create.confirm')}
          </Button>
        </>
      )}
    >
      {/* The host modal owns the dialog element, so the walkthrough hook rides
          the form region it renders inside that dialog. */}
      <div
        className={css.groupDialogBody}
        aria-busy={busy || undefined}
        data-gitgraph-group-dialog
        data-dsh-plugin="git-graph"
        data-dsh-part="group-create"
      >
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('group.create.reposLabel')}</span>
          <div className={css.checkList}>
            {repos.map(repo => (
              // The host checkbox does not forward DOM props, so both row hooks
              // ride the wrapper the checkbox is rendered in.
              <div
                key={repo.path}
                className={css.checkRow}
                title={repo.path}
                data-gitgraph-group-repo={repo.path}
                data-gitgraph-group-check
              >
                <Checkbox
                  checked={selected.includes(repo.path)}
                  onChange={() => { toggle(repo.path) }}
                  label={repo.name}
                  disabled={busy}
                  className={css.checkLabel}
                />
                {repo.primary && <Tag tone="neutral" className={css.repoTag}>{t('repos.primaryBadge')}</Tag>}
              </div>
            ))}
          </div>
          {selected.length === 0 && <div className={css.hint}>{t('group.create.noSelection')}</div>}
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('group.create.nameLabel')}</span>
          <Input
            value={name}
            onChange={(event) => { setName(event.target.value) }}
            placeholder={t('group.create.namePlaceholder')}
            aria-label={t('group.create.nameLabel')}
            disabled={busy}
            data-modal-autofocus
            data-gitgraph-group-name
          />
        </div>
        <div className={css.field} data-gitgraph-group-base>
          <span className={css.fieldLabel}>{t('group.create.baseLabel')}</span>
          <SegmentedControl
            id={BASE_CONTROL_ID}
            value={base}
            options={baseOptions}
            onChange={(next) => { setBase(next) }}
            label={t('group.create.baseLabel')}
            disabled={busy}
            className={css.baseControl}
          />
        </div>
        {error !== null && <div className={css.formError} role="alert" data-gitgraph-group-error>{error}</div>}
      </div>
    </Modal>
  )
}
