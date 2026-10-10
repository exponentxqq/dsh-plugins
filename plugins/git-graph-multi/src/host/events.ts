/**
 * Pure logic behind the /git/events SSE stream: the repeated `path` query
 * parameter of a multi-repository subscription, the per-path poll digest, and
 * the change set of one poll round. No HTTP or Express dependency, so the
 * whole subscription contract stays unit-testable.
 * @module dsh-git-graph-multi/host/events
 */

import type { RepoStatus } from '../core/types.ts'

/** Upper bound on watched repository paths per SSE subscriber. */
export const MAX_EVENT_PATHS = 64

/** Digest of a path that is not (or is no longer) a repository. */
const NO_REPO_DIGEST = 'no-repo'

/**
 * Parse the repeated `path` query parameters of an events request. Empty
 * values are dropped, duplicates keep their first position, and the result is
 * truncated to the first {@link MAX_EVENT_PATHS} entries. Values are never
 * trimmed: a space is a legal path character.
 * @param params - the events request's search parameters.
 * @returns the watched paths, in first-appearance order.
 */
export function parseEventPaths(params: URLSearchParams): string[] {
  const paths: string[] = []
  const seen = new Set<string>()
  for (const value of params.getAll('path')) {
    if (value === '' || seen.has(value)) continue
    seen.add(value)
    paths.push(value)
    if (paths.length === MAX_EVENT_PATHS) break
  }
  return paths
}

/**
 * One path's poll digest: the status snapshot plus its worktree membership.
 * A null status (unusable repository) collapses to a stable sentinel, so a
 * path that never resolves as a repository neither flaps nor hides the
 * worktree half of its neighbours. The field order matches the key the
 * single-path poll always used.
 * @param status - the path's status snapshot, or null when it is not a repository.
 * @param worktreeDigest - the path's last successfully listed worktree digest.
 * @returns the digest compared between poll rounds.
 */
export function pollDigestKey(status: RepoStatus | null, worktreeDigest: string): string {
  if (status === null) return NO_REPO_DIGEST
  return `${status.root}|${status.branch}|${status.head}|wt:${worktreeDigest}`
}

/**
 * Paths whose digest is new or changed, in `current` insertion order. A path
 * that disappeared from `current` is not reported: the stream follows the
 * repositories the subscriber enumerated, and a shrinking set is already
 * visible to the client through the next enumeration.
 * @param previous - the digests pushed at the end of the last round.
 * @param current - the digests computed by this round.
 * @returns the changed paths, ordered like `current`.
 */
export function collectChanges(previous: ReadonlyMap<string, string>, current: ReadonlyMap<string, string>): string[] {
  const changed: string[] = []
  for (const [path, digest] of current) {
    if (previous.get(path) !== digest) changed.push(path)
  }
  return changed
}
