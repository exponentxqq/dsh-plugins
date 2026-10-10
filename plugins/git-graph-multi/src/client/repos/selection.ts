/**
 * Pure presentation rules of the flat repository chip row: which chips render,
 * what each one says, which path its verbs carry, and the workspace-wide
 * branch-name union behind the group switch. No React and no network — the chip
 * component only wires these rules to the injected verbs, and a
 * single-repository workspace keeps the exact pre-existing behavior (one chip,
 * branch-only label, no explicit path, no group operations).
 * @module dsh-git-graph-multi/client/repos/selection
 */

import type { RepoStatus, RepoStatusRow, ReposView } from '../../core/types.ts'

/** One branch name of the workspace-wide union with the repository count that has it. */
export interface BranchUnionEntry {
  name: string
  /** How many enumerated repositories hold this branch. */
  count: number
}

/** One chip of the flat repository row. */
export interface ChipEntry {
  /**
   * The explicit repository path the chip's verbs carry. Undefined means the
   * host resolves the session's workspace root — the original single-repository
   * behavior, which a one-repository workspace keeps unchanged.
   */
  path: string | undefined
  /** Display name of the repository (empty for the workspace-root fallback chip). */
  name: string
  /** Whether the label carries the repository name (`name · branch`) or the branch alone. */
  showName: boolean
  /** Current branch ('' = detached HEAD, null = unavailable). */
  branch: string | null
  /** Dirty file count (0 when unavailable). */
  dirty: number
  /** Whether the chip opens its repository's branch panel. */
  available: boolean
  /** Whether this is the workspace's root checkout (the group-operation owner). */
  primary: boolean
}

/** Copy for the two branch states that are not a plain branch name. */
export interface ChipCopy {
  detached: string
  unavailable: string
}

/** Branch-name union across repositories, with the repository count holding each name. */
export function unionBranches(views: ReadonlyArray<{ branches: ReadonlyArray<{ name: string }> } | null>): BranchUnionEntry[] {
  const counts = new Map<string, number>()
  for (const view of views) {
    if (view === null) continue
    for (const branch of view.branches) counts.set(branch.name, (counts.get(branch.name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Root checkout first, then every other repository by display name. The host
 * already enumerates in that order; re-sorting keeps the row independent of a
 * service-side ordering change.
 */
function orderRows(rows: readonly RepoStatusRow[]): RepoStatusRow[] {
  return [...rows].sort((a, b) => {
    if (a.repo.primary !== b.repo.primary) return a.repo.primary ? -1 : 1
    return a.repo.name.localeCompare(b.repo.name)
  })
}

/** One enumerated row as a chip entry. */
function entryOf(row: RepoStatusRow, showName: boolean, path: string | undefined): ChipEntry {
  return {
    path,
    name: row.repo.name,
    showName,
    branch: row.status === null ? null : row.status.branch,
    dirty: row.status === null ? 0 : row.status.dirtyFiles,
    available: row.status !== null,
    primary: row.repo.primary,
  }
}

/**
 * Resolve the chip row of one (enumeration, fallback status) state.
 *
 * - enumeration still running (`undefined`): no chips, so a half-built row
 *   never flashes;
 * - enumeration unavailable (`null`): one workspace-root chip driven by the
 *   fallback status, so a failed scan never hides the control;
 * - exactly one repository: one chip with the pre-existing single-repository
 *   behavior (branch-only label, no explicit path for the root checkout), and
 *   no chip at all while that repository is unusable;
 * - several repositories: one chip per repository, root first, each carrying
 *   its own explicit path, with an unusable repository degraded rather than
 *   dropped.
 *
 * @param view - the enumeration result.
 * @param fallback - the workspace-root status used when the enumeration failed.
 * @returns the chips to render, in row order.
 */
export function planChips(view: ReposView | null | undefined, fallback: RepoStatus | null | undefined): ChipEntry[] {
  if (view === undefined) return []
  if (view === null) {
    if (fallback === undefined || fallback === null) return []
    return [{
      path: undefined,
      name: '',
      showName: false,
      branch: fallback.branch,
      dirty: fallback.dirtyFiles,
      available: true,
      primary: true,
    }]
  }
  const rows = view.repos
  if (rows.length === 0) return []
  if (rows.length === 1) {
    const row = rows[0]
    // The single-repository workspace hides the control entirely when its only
    // repository is unusable (the pre-existing behavior).
    if (row.status === null) return []
    return [entryOf(row, false, row.repo.primary ? undefined : row.repo.path)]
  }
  return orderRows(rows).map(row => entryOf(row, true, row.repo.path))
}

/**
 * The visible text of one chip: `name · branch` in a multi-repository
 * workspace, the branch alone otherwise.
 * @param entry - the chip entry.
 * @param copy - localized copy for the detached and unavailable states.
 * @returns the label text.
 */
export function chipLabel(entry: ChipEntry, copy: ChipCopy): string {
  const branch = entry.branch === null
    ? copy.unavailable
    : entry.branch === ''
      ? copy.detached
      : entry.branch
  return entry.showName ? `${entry.name} · ${branch}` : branch
}
