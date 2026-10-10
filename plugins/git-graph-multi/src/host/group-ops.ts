/**
 * Group branch operations over a workspace's repositories: switch every
 * repository that owns one branch name, or create the same branch in a
 * user-checked set. Pure orchestration — every git action goes through the
 * {@link GroupDeps} port, every repository is addressed by the canonical
 * path the enumeration produced, and the module owns no state of its own.
 * @module dsh-git-graph-multi/host/group-ops
 */

import path from 'node:path'
import { validateBranchName } from '../core/git-command.ts'
import type {
  BranchesView,
  GitError,
  GroupBase,
  GroupDeps,
  GroupRepoResult,
  GroupResultView,
  RepoRef,
} from '../core/types.ts'

/**
 * Canonicalize a repository path for membership tests.
 *
 * Enumerated paths are already canonical: the scan starts at the realpath'd
 * workspace root and never follows a symlink. Resolving the requested
 * spelling (dot segments, duplicate or trailing separators) is therefore the
 * exact equivalent of a realpath for every path the enumeration can hand the
 * browser, and keeps this module free of filesystem access.
 * @param value - a repository path as submitted by the client.
 * @returns the normalized absolute path.
 */
function canonicalPath(value: string): string {
  return path.resolve(value)
}

/** One thrown value as a single-line host message. */
function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : 'git operation failed'
}

/** The stable rejection of a branch name the pure validator refuses. */
function invalidBranchName(name: string, reason: string): GitError {
  return { code: 'invalid-branch-name', message: `invalid branch name "${name}": ${reason}` }
}

/** The stable rejection of a requested repository outside the enumeration. */
function workspaceUnknown(repoPath: string): GitError {
  return { code: 'workspace-unknown', message: `no repository is enumerated at ${repoPath}` }
}

/**
 * Read one repository's branch list. A throwing port is reported as the
 * `null` (no longer usable) outcome the port documents, so one broken
 * repository can never abort the whole group report.
 * @param deps - the group-operation port.
 * @param repoPath - the repository to read.
 * @returns the branch view, or null when the repository is unusable.
 */
async function branchesOrNull(deps: GroupDeps, repoPath: string): Promise<BranchesView | null> {
  try {
    return await deps.branchesOf(repoPath)
  } catch {
    return null
  }
}

/**
 * Run one repository's pre-mutation guard. A throwing guard counts as a
 * rejection: the group must never mutate anything on an unproven preflight.
 * @param deps - the group-operation port.
 * @param repoPath - the participant repository.
 * @param branch - the switch target.
 * @returns the rejection, or null when the switch may proceed.
 */
async function preflightOrRejected(deps: GroupDeps, repoPath: string, branch: string): Promise<GitError | null> {
  try {
    return await deps.preflight(repoPath, branch)
  } catch (cause) {
    return { code: 'internal', message: messageOf(cause) }
  }
}

/**
 * Switch one participant onto the branch, folding a thrown port call into
 * that repository's own `failed` row.
 * @param deps - the group-operation port.
 * @param repo - the participant repository.
 * @param branch - the switch target.
 * @returns the repository's result row.
 */
async function switchOne(deps: GroupDeps, repo: RepoRef, branch: string): Promise<GroupRepoResult> {
  try {
    const switched = await deps.switchBranch(repo.path, branch)
    return switched.ok ? { repo, outcome: 'ok' } : { repo, outcome: 'failed', error: switched.error }
  } catch (cause) {
    return { repo, outcome: 'failed', error: { code: 'internal', message: messageOf(cause) } }
  }
}

/**
 * Create the branch in one checked repository from the resolved baseline,
 * folding a thrown port call into that repository's own `failed` row.
 * @param deps - the group-operation port.
 * @param repo - the checked repository.
 * @param name - the new branch name.
 * @param base - `mainline` resolves each repository's own default mainline,
 *   `head` passes `undefined` so the port branches from the current HEAD.
 * @returns the repository's result row.
 */
async function createOne(deps: GroupDeps, repo: RepoRef, name: string, base: GroupBase): Promise<GroupRepoResult> {
  try {
    let from: string | undefined
    if (base === 'mainline') {
      const resolved = await deps.defaultBase(repo.path)
      if (resolved === null) {
        return {
          repo,
          outcome: 'failed',
          error: { code: 'base-ref-not-found', message: `no default mainline resolves in ${repo.name}` },
        }
      }
      from = resolved
    }
    const created = await deps.createBranchAt(repo.path, name, from)
    return created.ok ? { repo, outcome: 'ok' } : { repo, outcome: 'failed', error: created.error }
  } catch (cause) {
    return { repo, outcome: 'failed', error: { code: 'internal', message: messageOf(cause) } }
  }
}

/**
 * Switch every repository of the workspace that owns `branch` onto it.
 *
 * Implicit feature set (D7): a repository takes part exactly when its local
 * branch list contains the name; a repository without the branch is reported
 * `skipped` and is never given a new branch. Preflight atomicity (D5): the
 * guard runs on every participant first, and one rejection leaves every
 * repository untouched — no `switchBranch` call happens at all.
 * @param deps - the group-operation port (production: the workspace-gated service).
 * @param workspacePath - the workspace root to enumerate.
 * @param branch - the existing local branch name to switch to.
 * @returns the group view with one row per candidate repository, in enumeration order.
 */
export async function groupSwitch(deps: GroupDeps, workspacePath: string, branch: string): Promise<GroupResultView> {
  const repos = await deps.repos(workspacePath)
  if (repos === null) return { action: 'switch', branch, results: [] }

  const listings = await Promise.all(repos.map(repo => branchesOrNull(deps, repo.path)))
  const owns = listings.map(view => view !== null && view.branches.some(row => row.name === branch))
  // A participant starts as not-run: it only becomes ok once its own switch
  // succeeded, so a preflight rejection leaves every other row honest.
  const results: GroupRepoResult[] = repos.map((repo, index) => (
    owns[index] ? { repo, outcome: 'not-run' } : { repo, outcome: 'skipped' }
  ))
  const participants = repos.map((_, index) => index).filter(index => owns[index])
  if (participants.length === 0) return { action: 'switch', branch, results }

  const verdicts = await Promise.all(participants.map(index => preflightOrRejected(deps, repos[index].path, branch)))
  if (verdicts.some(verdict => verdict !== null)) {
    for (const [position, index] of participants.entries()) {
      const error = verdicts[position]
      if (error !== null) results[index] = { repo: repos[index], outcome: 'failed', error }
    }
    return { action: 'switch', branch, results }
  }

  const switched = await Promise.all(participants.map(index => switchOne(deps, repos[index], branch)))
  for (const [position, index] of participants.entries()) results[index] = switched[position]
  return { action: 'switch', branch, results }
}

/**
 * Create `name` in every checked repository of the workspace.
 *
 * The pure name validator gates every checked repository before any git call
 * (D5/`invalid-branch-name`); the default baseline is each repository's own
 * default mainline, or its current HEAD when `base` is `head` (D6); a single
 * repository's failure never blocks the others and nothing is rolled back.
 * Rows follow enumeration order, with requested paths outside the
 * enumeration appended as `workspace-unknown` in request order.
 * @param deps - the group-operation port (production: the workspace-gated service).
 * @param workspacePath - the workspace root to enumerate.
 * @param repoPaths - the checked repository paths, as submitted by the client.
 * @param name - the new branch name (validated here, gated again by the service).
 * @param base - the baseline for every checked repository.
 * @returns the group view with one row per candidate and unknown repository.
 */
export async function groupCreate(
  deps: GroupDeps,
  workspacePath: string,
  repoPaths: readonly string[],
  name: string,
  base: GroupBase,
): Promise<GroupResultView> {
  const repos = await deps.repos(workspacePath)
  if (repos === null) return { action: 'create', branch: name, results: [] }

  const enumerated = new Set(repos.map(repo => canonicalPath(repo.path)))
  const checked = new Set(repoPaths.map(requested => canonicalPath(requested)))
  const chosen = repos.map(repo => checked.has(canonicalPath(repo.path)))
  const results: GroupRepoResult[] = repos.map(repo => ({ repo, outcome: 'skipped' }))

  /** Append one failed row per requested path the enumeration does not know. */
  const appendUnknown = (): void => {
    for (const requested of repoPaths) {
      const canonical = canonicalPath(requested)
      if (enumerated.has(canonical)) continue
      results.push({
        repo: { path: canonical, name: path.basename(canonical), primary: false },
        outcome: 'failed',
        error: workspaceUnknown(canonical),
      })
    }
  }

  const invalid = validateBranchName(name)
  if (invalid !== null) {
    for (let index = 0; index < repos.length; index += 1) {
      if (!chosen[index]) continue
      results[index] = { repo: repos[index], outcome: 'failed', error: invalidBranchName(name, invalid) }
    }
    appendUnknown()
    return { action: 'create', branch: name, results }
  }

  await Promise.all(repos.map(async (repo, index) => {
    if (!chosen[index]) return
    results[index] = await createOne(deps, repo, name, base)
  }))
  appendUnknown()
  return { action: 'create', branch: name, results }
}
