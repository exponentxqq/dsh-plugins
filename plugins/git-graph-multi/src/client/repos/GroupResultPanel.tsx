/**
 * The group-operation result panel: one row per participating repository with
 * its outcome (success / skipped / failed / not run) as a host tag, the stable
 * rejection sentence of every failure, and a single-repository retry entry.
 * @module dsh-git-graph-multi/client/repos/GroupResultPanel
 */

import { useMemo } from 'react'
import { Button, IconRefreshOutlineRegular, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { GroupOutcome, GroupResultView } from '../../core/types.ts'
import type { GitGraphKey } from '../locales.ts'
import { errorMessage } from '../chips/error-copy.ts'
import css from './repos.module.css'

/** Props of the group-operation result panel. */
export interface GroupResultPanelProps {
  /** The per-repository result view of the last group operation. */
  result: GroupResultView
  /** A retry is in flight: every control is disabled. */
  busy: boolean
  /** Re-run the same group operation for one repository only. */
  onRetry: (repoPath: string) => void
  onClose: () => void
  t: Translate<GitGraphKey>
}

/** Outcome → dictionary key of its badge label. */
function outcomeLabelKey(outcome: GroupOutcome): GitGraphKey {
  switch (outcome) {
    case 'ok': return 'group.outcome.ok'
    case 'skipped': return 'group.outcome.skipped'
    case 'failed': return 'group.outcome.failed'
    case 'not-run': return 'group.outcome.notRun'
  }
}

/** Outcome → the host tag palette that carries its meaning. */
function outcomeTone(outcome: GroupOutcome): TagTone {
  switch (outcome) {
    case 'ok': return 'success'
    case 'skipped': return 'neutral'
    case 'failed': return 'danger'
    case 'not-run': return 'warning'
  }
}

/**
 * The group-operation result panel.
 * @param props - see {@link GroupResultPanelProps}.
 */
export function GroupResultPanel({ result, busy, onRetry, onClose, t }: GroupResultPanelProps) {
  const counts = useMemo(() => {
    let ok = 0
    let skipped = 0
    let failed = 0
    let notRun = 0
    for (const row of result.results) {
      if (row.outcome === 'ok') ok += 1
      else if (row.outcome === 'skipped') skipped += 1
      else if (row.outcome === 'failed') failed += 1
      else notRun += 1
    }
    return { ok, skipped, failed, notRun }
  }, [result])

  /** Busy guard: the mask, Escape, and the close button must not abandon an in-flight retry. */
  const requestClose = (): void => {
    if (!busy) onClose()
  }

  const title = result.action === 'switch'
    ? t('group.result.switchTitle', { branch: result.branch })
    : t('group.result.createTitle', { branch: result.branch })

  return (
    <Modal
      open
      onClose={requestClose}
      title={title}
      description={t('group.result.summary', counts)}
      closeLabel={t('group.close')}
      className={css.groupDialog}
      footer={(
        <Button variant="outline" onClick={onClose} disabled={busy}>
          {t('group.close')}
        </Button>
      )}
    >
      {/* The host modal owns the dialog element, so the walkthrough hook rides
          the result region it renders inside that dialog. */}
      <div
        className={css.resultBody}
        aria-busy={busy || undefined}
        data-gitgraph-group-result
        data-gitgraph-group-action={result.action}
        data-dsh-plugin="git-graph"
        data-dsh-part="group-result"
      >
        <div className={css.resultList}>
          {result.results.map(row => (
            <div
              key={row.repo.path}
              className={css.resultRow}
              title={row.repo.path}
              data-gitgraph-group-result-row
              data-gitgraph-outcome={row.outcome}
              data-gitgraph-repo-path={row.repo.path}
            >
              <div className={css.resultInfo}>
                <div className={css.resultHeadline}>
                  <span className={css.resultName}>{row.repo.name}</span>
                  {row.repo.primary && <Tag tone="neutral" className={css.repoTag}>{t('repos.primaryBadge')}</Tag>}
                  <span className={css.outcomeBadge} data-gitgraph-outcome-badge>
                    <Tag tone={outcomeTone(row.outcome)}>{t(outcomeLabelKey(row.outcome))}</Tag>
                  </span>
                </div>
                {row.error !== undefined && (
                  <div className={css.resultError} data-gitgraph-outcome-error>{errorMessage(row.error, t)}</div>
                )}
                {row.outcome === 'not-run' && <div className={css.resultHint}>{t('group.outcome.notRunHint')}</div>}
              </div>
              {row.outcome === 'failed' && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<IconRefreshOutlineRegular size={16} />}
                  onClick={() => { onRetry(row.repo.path) }}
                  disabled={busy}
                  data-gitgraph-group-retry
                >
                  {t('group.retry')}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
