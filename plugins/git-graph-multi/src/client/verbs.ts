/**
 * The injected business face of the branch chip: every git verb keyed by the
 * current session id, plus an optional explicit repository path.
 *
 * `repoPath` is what makes the single-workspace/multi-repository split work:
 * `pathOf(sessionId, repoPath)` resolves `repoPath ?? session cwd`, so every
 * verb keeps its original single-repository behavior when the argument is
 * omitted, and acts on exactly one selected repository when it is given.
 *
 * Declared in its own module (not in `index.ts`) so the browser components can
 * type their `inject` prop without importing the plugin body.
 * @module dsh-git-graph-multi/client/verbs
 */

import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  BranchesView, GitFeatureConfig, GraphView, GroupBase, GroupResultView, RepoStatus,
  ReposView, SwitchResult, WorktreeAddResult, WorktreeListView, WorktreeRemoveResult,
} from '../core/types.ts'

/** Injected business face of the branch chip: git verbs, keyed by the current session id. */
export interface GitGraphInjected {
  /** One repository's snapshot (default: the session workspace root); null when not a repository. */
  repoStatus: (sessionId: SessionId | undefined, repoPath?: string) => Promise<RepoStatus | null>
  /** One repository's local branch list with the current branch marked. */
  branches: (sessionId: SessionId | undefined, repoPath?: string) => Promise<BranchesView | null>
  /** `git switch --no-guess <branch>` in one repository (default: the workspace root). */
  switchBranch: (sessionId: SessionId | undefined, branch: string, repoPath?: string) => Promise<SwitchResult>
  /** `git switch --no-guess -c <name>` from that repository's current HEAD. */
  createBranch: (sessionId: SessionId | undefined, name: string, repoPath?: string) => Promise<SwitchResult>
  /** Topo-ordered commit graph of one repository. */
  graph: (sessionId: SessionId | undefined, limit?: number, repoPath?: string) => Promise<GraphView | null>
  /** All linked worktrees of one repository. */
  worktrees: (sessionId: SessionId | undefined, repoPath?: string) => Promise<WorktreeListView | null>
  /** Create a managed worktree, register it as a workspace, and start a session in it. */
  createWorktreeSession: (sessionId: SessionId | undefined, name: string, baseRef?: string, repoPath?: string) => Promise<WorktreeAddResult>
  /** Remove a managed worktree and unregister its workspace when linked. */
  removeWorktree: (sessionId: SessionId | undefined, worktreePath: string, opts?: { force?: boolean; deleteBranch?: boolean }, repoPath?: string) => Promise<WorktreeRemoveResult>
  /** The live feature config (auto-isolation flags + managed home). */
  gitConfig: () => Promise<GitFeatureConfig | null>
  /** Host-pushed branch-state changes for a set of repositories (default: the session workspace root). */
  subscribeChanges: (sessionId: SessionId | undefined, onChange: () => void, repoPaths?: readonly string[]) => () => void
  /** Every repository of the session's workspace with its status snapshot (the flat chip row). */
  repos: (sessionId: SessionId | undefined) => Promise<ReposView | null>
  /** Group switch: switch every repository of the workspace that has `branch`. */
  groupSwitch: (sessionId: SessionId | undefined, branch: string) => Promise<GroupResultView | null>
  /** Group create: create `name` in the selected repositories, from `base`. */
  groupCreate: (sessionId: SessionId | undefined, repos: readonly string[], name: string, base: GroupBase) => Promise<GroupResultView | null>
}
