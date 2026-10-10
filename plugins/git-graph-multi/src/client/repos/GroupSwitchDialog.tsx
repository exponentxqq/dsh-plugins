/**
 * The group-switch dialog: pick one branch name from the workspace-wide union
 * (with the repository coverage of each candidate) and switch every repository
 * that has it. Host modal with host pills; the union is fetched by the owner,
 * which also runs the group switch and reports back through `busy` / `error`.
 * @module dsh-git-graph-multi/client/repos/GroupSwitchDialog
 */

import { useEffect, useState } from 'react'
import { Button, Modal, Pill, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitGraphKey } from '../locales.ts'
import type { BranchUnionEntry } from './selection.ts'
import css from './repos.module.css'

/** Props of the group-switch dialog. */
export interface GroupSwitchDialogProps {
  /** Workspace-wide branch-name union with coverage counts (null: still loading). */
  branches: readonly BranchUnionEntry[] | null
  /** Enumerated repository count (the coverage denominator). */
  total: number
  /** A group operation is in flight. */
  busy: boolean
  /** Stable failure sentence of the last attempt (null: none). */
  error: string | null
  /** Run the group switch for the picked branch name. */
  onSubmit: (branch: string) => void
  onClose: () => void
  t: Translate<GitGraphKey>
}

/** Branch names longer than this get a host tooltip with the full name. */
const TOOLTIP_NAME_THRESHOLD = 18
/** Hover dwell before the full-name tooltip appears. */
const TOOLTIP_DELAY_MS = 400
/** Width cap of the full-name tooltip bubble. */
const TOOLTIP_MAX_WIDTH = 320

/**
 * The group-switch dialog.
 * @param props - see {@link GroupSwitchDialogProps}.
 */
export function GroupSwitchDialog({ branches, total, busy, error, onSubmit, onClose, t }: GroupSwitchDialogProps) {
  const [branch, setBranch] = useState('')
  const entries = branches ?? []

  // A refresh can drop the previously picked branch name from the union (the
  // branch was deleted elsewhere); never keep a stale selection around.
  useEffect(() => {
    if (branch !== '' && !entries.some(entry => entry.name === branch)) setBranch('')
  }, [entries, branch])

  /** Busy guard: the mask, Escape, and the close button must not abandon an in-flight group operation. */
  const requestClose = (): void => {
    if (!busy) onClose()
  }

  const canSubmit = !busy && branch !== '' && entries.length > 0

  return (
    <Modal
      open
      onClose={requestClose}
      title={t('group.switch.title')}
      description={t('group.switch.description')}
      closeLabel={t('group.close')}
      className={css.groupDialog}
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('group.switch.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => { if (canSubmit) onSubmit(branch) }}
            disabled={!canSubmit}
            data-gitgraph-group-switch
          >
            {t('group.switch.confirm')}
          </Button>
        </>
      )}
    >
      {/* The host modal owns the dialog element, so the walkthrough hook rides
          the body region it renders inside that dialog. */}
      <div
        className={css.groupDialogBody}
        aria-busy={busy || undefined}
        data-gitgraph-group-switch-dialog
        data-dsh-plugin="git-graph"
        data-dsh-part="group-switch"
      >
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('group.switch.branchLabel')}</span>
          {branches === null
            ? <div className={css.hint} data-gitgraph-group-notice>{t('group.switch.loading')}</div>
            : entries.length === 0
              ? <div className={css.hint} data-gitgraph-group-notice>{t('repos.noUnion')}</div>
              : (
                <div className={css.pillWrap} role="group" aria-label={t('group.switch.branchLabel')}>
                  {entries.map(entry => (
                    <Tooltip
                      key={entry.name}
                      label={entry.name}
                      portal
                      delayMs={TOOLTIP_DELAY_MS}
                      maxWidth={TOOLTIP_MAX_WIDTH}
                      disabled={entry.name.length <= TOOLTIP_NAME_THRESHOLD}
                    >
                      {/* The host pill is not a ref-forwarding component, so the
                          tooltip anchors the slot span around it. */}
                      <span className={css.pillSlot}>
                        <Pill
                          className={css.pill}
                          active={entry.name === branch}
                          aria-pressed={entry.name === branch}
                          aria-label={`${entry.name} · ${t('repos.branchCoverage', { count: entry.count, total })}`}
                          disabled={busy}
                          onClick={() => { setBranch(entry.name) }}
                        >
                          <span className={css.pillName}>{entry.name}</span>
                          <span className={css.pillRatio}>{`· ${entry.count}/${total}`}</span>
                        </Pill>
                      </span>
                    </Tooltip>
                  ))}
                </div>
                )}
        </div>
        {error !== null && <div className={css.formError} role="alert" data-gitgraph-group-error>{error}</div>}
      </div>
    </Modal>
  )
}
