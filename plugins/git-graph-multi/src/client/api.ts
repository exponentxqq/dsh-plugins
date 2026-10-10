/**
 * Browser client for the host /git/* routes: typed JSON envelope calls plus
 * the SSE change subscription. Same-origin relative fetch (the page and the
 * routes share the webserver).
 * @module dsh-git-graph-multi/client/api
 */

import { subscribeSharedEvents } from './sse-leader.ts'
import type {
  BranchesView, GitError, GitFeatureConfig, GraphView, GroupBase, GroupResultView, RepoStatus,
  ReposView, WorktreeListView,
} from '../core/types.ts'

/** One /git envelope response. */
export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: GitError }

/** Transport failure (fetch threw or the response was not JSON). */
const TRANSPORT_ERROR: GitError = { code: 'internal', message: 'git route unavailable' }

/**
 * POST one JSON payload and decode the envelope; never throws.
 *
 * `path` is DOCUMENT-RELATIVE (no leading slash): the harness serves the GUI
 * with `<base href="./">`, so a sub-path deployment resolves the route
 * against its entry directory. A root-absolute path escapes that prefix and
 * never reaches the host route (issue #1707); the official client posts its
 * own routes the same way.
 */
async function post<T>(path: string, payload: Record<string, unknown>): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    return { ok: false, error: TRANSPORT_ERROR }
  }
  try {
    const envelope = await response.json() as unknown
    if (typeof envelope !== 'object' || envelope === null) return { ok: false, error: TRANSPORT_ERROR }
    const record = envelope as Record<string, unknown>
    if (record.ok === true) return { ok: true, value: record.value as T }
    return { ok: false, error: (record.error as GitError | undefined) ?? TRANSPORT_ERROR }
  } catch {
    return { ok: false, error: TRANSPORT_ERROR }
  }
}

/** Typed git operations over the wire. */
export class GitApi {
  /** The repository snapshot (null: not a git repository / not a workspace). */
  status(path: string): Promise<ApiResult<RepoStatus | null>> {
    return post('git/status', { path })
  }

  /** Local branch list with the current branch marked. */
  branches(path: string): Promise<ApiResult<BranchesView | null>> {
    return post('git/branches', { path })
  }

  /** Workspace-level `git switch --no-guess <branch>` (host guards first). */
  switchBranch(path: string, branch: string): Promise<ApiResult<{ branch: string }>> {
    return post('git/switch', { path, branch })
  }

  /** `git switch --no-guess -c <name>` from the current HEAD. */
  createBranch(path: string, name: string): Promise<ApiResult<{ branch: string }>> {
    return post('git/create-branch', { path, name })
  }

  /** Group switch: switch every repository of the workspace that has `branch` (guarded, preflight-atomic). */
  groupSwitch(path: string, branch: string): Promise<ApiResult<GroupResultView>> {
    return post('git/group-switch', { path, branch })
  }

  /** Group create: create `name` in the selected repositories, from each one's `base`. */
  groupCreate(path: string, repos: readonly string[], name: string, base: GroupBase): Promise<ApiResult<GroupResultView>> {
    return post('git/group-create', { path, repos, name, base })
  }

  /** Topo-ordered commit graph across branches/tags/remotes. */
  graph(path: string, limit?: number): Promise<ApiResult<GraphView | null>> {
    return post('git/graph', limit === undefined ? { path } : { path, limit })
  }

  /** All linked worktrees of the workspace's repository. */
  worktrees(path: string): Promise<ApiResult<WorktreeListView | null>> {
    return post('git/worktrees', { path })
  }

  /** Every repository of the workspace with its status snapshot (the overview; null: not a workspace). */
  repos(path: string): Promise<ApiResult<ReposView | null>> {
    return post('git/repos', { path })
  }

  /** Create a managed worktree on a new wt/<name> branch (host picks the path). */
  addWorktree(path: string, name: string, baseRef?: string): Promise<ApiResult<{ path: string; branch: string; name: string }>> {
    return post('git/worktree-add', baseRef === undefined ? { path, name } : { path, name, baseRef })
  }

  /** Remove a managed worktree (dirty rejects unless force; deleteBranch drops the wt/ branch). */
  removeWorktree(path: string, worktreePath: string, opts?: { force?: boolean; deleteBranch?: boolean }): Promise<ApiResult<{ removed: true }>> {
    return post('git/worktree-remove', { path, worktreePath, force: opts?.force === true, deleteBranch: opts?.deleteBranch === true })
  }

  /** The live feature config (auto-isolation flags + managed worktree home). */
  config(): Promise<ApiResult<GitFeatureConfig>> {
    return post('git/config', {})
  }
}

/**
 * Subscribe to host-pushed branch-state changes for a set of repository paths
 * (the host polls every watched path while a subscriber is connected). One
 * shared stream covers the whole set: the browser's per-origin HTTP pool is
 * capped at 6, so a stream per repository is not an option. The paths are
 * sorted and deduplicated, which keeps the URL stable so two tabs watching the
 * same set share a single relay.
 * @param paths - repository paths to watch (empty: no stream is opened).
 * @param onChange - fired on every pushed change.
 * @returns the disposer closing the stream.
 */
export function subscribeChanges(paths: readonly string[], onChange: () => void): () => void {
  const watched = [...new Set(paths.filter(path => path !== ''))].sort()
  if (watched.length === 0) return () => {}
  const query = watched.map(path => `path=${encodeURIComponent(path)}`).join('&')
  // The stream is shared browser-wide through the cross-tab leader relay
  // (issue #383): two tabs of the same workspace must not pin two SSE
  // connections against the per-origin HTTP pool.
  return subscribeSharedEvents(`git/events?${query}`, 'change', () => { onChange() })
}
