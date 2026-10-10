/**
 * The shared chip button: one pill in the context row above the input. The flat
 * multi-repository row renders one per enumerated repository, so the chip also
 * carries the repository it acts on, its dirty-file badge, and the degraded
 * state of an unusable repository.
 * @module dsh-git-graph-multi/client/chips/Chip
 */

import type { ReactNode } from 'react'
import { IconChevronDownOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './context.module.css'

/** Join conditional class names (the dependency-free clsx stand-in). */
export function cx(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ')
}

/** Props of one context chip. */
export interface ChipProps {
  icon: ReactNode
  label: string
  ariaLabel: string
  open: boolean
  onClick: () => void
  /** Hero-phase pill style (transparent 28px pill, the official hero-row chip recipe). */
  hero?: boolean
  /** Trailing badge (the dirty-file count); omitted when the repository is clean. */
  badge?: ReactNode
  /** An unusable repository: the chip is inert and rendered in its degraded state. */
  disabled?: boolean
  /** Native tooltip text (the repository path, or the root-checkout marker). */
  title?: string
  /** Whether the leading icon marks the workspace root checkout. */
  primary?: boolean
  /** The repository this chip acts on (the walkthrough hook; omitted for the workspace-root chip). */
  repoPath?: string
}

/** The pill button shared by the flat repository chip row. */
export function Chip({ icon, label, ariaLabel, open, onClick, hero = false, badge, disabled = false, title, primary = false, repoPath }: ChipProps) {
  return (
    <button
      type="button"
      data-gitgraph-chip
      data-gitgraph-chip-repo={repoPath}
      className={cx(css.chip, open && css.chipOpen, hero && css.chipHero, disabled && css.chipDisabled)}
      onClick={disabled ? undefined : onClick}
      aria-label={ariaLabel}
      aria-expanded={open}
      disabled={disabled}
      title={title}
    >
      <span className={cx(css.chipIcon, primary && css.chipIconPrimary)}>{icon}</span>
      <span className={css.chipLabel} title={label}>{label}</span>
      {badge}
      <IconChevronDownOutlineMedium className={css.chipChevron} size={12} />
    </button>
  )
}

/** Full-screen transparent backdrop closing the open popover/dialog on click. */
export function Backdrop({ onClose }: { onClose: () => void }) {
  return <div className={css.backdrop} onClick={onClose} />
}
