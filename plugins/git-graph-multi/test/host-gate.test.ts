/**
 * Workspace-gate and repository-fence tests: the /git boundary must accept a
 * registered workspace root and its subdirectories, reject anything outside
 * the registry (including prefix-sharing siblings), and reject a repository
 * whose own git top level escapes the workspace even though the requested
 * path was inside it.
 * @module dsh-git-graph-multi/test/host-gate
 */

import { mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  headBranchArgv, headShortArgv, operationMarkersArgv, statusPorcelainArgv, topLevelArgv,
  unmergedArgv, worktreeListArgv,
} from '../src/core/git-command.ts'
import { buildWorkspaceGate, GitService, type WorkspaceRootSource } from '../src/host/git-service.ts'
import { cleanup, makeDirs, runnerKey, scriptedRunner, tempDir } from './support.ts'

/** Fixture roots created by a test, removed when it finishes. */
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async root => await cleanup(root)))
})

/** A throwaway canonical directory, so fixture paths match realpath output. */
async function fixtureDir(prefix: string): Promise<string> {
  const dir = await realpath(await tempDir(prefix))
  roots.push(dir)
  return dir
}

/** The registry double the gate reads (the real registry exposes list()). */
function registryOf(paths: readonly string[]): WorkspaceRootSource {
  return { list: () => paths.map(workspacePath => ({ path: workspacePath })) }
}

describe('buildWorkspaceGate', () => {
  it('accepts the workspace root and reports the matched workspace root', async () => {
    const workspace = await fixtureDir('ggm-gate-ws-')
    const gate = buildWorkspaceGate(registryOf([workspace]))
    expect(await gate(workspace)).toEqual({ ok: true, canonical: workspace, workspaceRoot: workspace })
  })

  it('accepts a subdirectory of a registered workspace', async () => {
    const workspace = await fixtureDir('ggm-gate-ws-')
    await makeDirs(workspace, ['packages/app'])
    const gate = buildWorkspaceGate(registryOf([workspace]))
    const verdict = await gate(path.join(workspace, 'packages', 'app'))
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.workspaceRoot).toBe(workspace)
  })

  it('rejects a path outside every registered workspace', async () => {
    const workspace = await fixtureDir('ggm-gate-ws-')
    const outside = await fixtureDir('ggm-gate-out-')
    const verdict = await buildWorkspaceGate(registryOf([workspace]))(outside)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.error.code).toBe('workspace-unknown')
  })

  it('rejects a sibling directory that merely shares the workspace prefix', async () => {
    const workspace = await fixtureDir('ggm-gate-ws-')
    const sibling = `${workspace}-evil`
    await mkdir(sibling, { recursive: true })
    roots.push(sibling)
    const verdict = await buildWorkspaceGate(registryOf([workspace]))(sibling)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.error.code).toBe('workspace-unknown')
  })

  it('prefers the longest matching workspace root when workspaces nest', async () => {
    const outer = await fixtureDir('ggm-gate-ws-')
    const inner = path.join(outer, 'inner')
    await makeDirs(outer, ['inner'])
    const gate = buildWorkspaceGate(registryOf([outer, inner]))
    const verdict = await gate(inner)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.workspaceRoot).toBe(inner)
  })

  it('rejects a path that does not resolve on disk', async () => {
    const workspace = await fixtureDir('ggm-gate-ws-')
    const verdict = await buildWorkspaceGate(registryOf([workspace]))(path.join(workspace, 'missing'))
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.error.code).toBe('workspace-unknown')
  })
})

describe('GitService repository fence', () => {
  it('reads the workspace root through the gate', async () => {
    const workspace = await fixtureDir('ggm-fence-ws-')
    const runner = scriptedRunner({
      [runnerKey(workspace, topLevelArgv())]: { stdout: `${workspace}\n` },
      [runnerKey(workspace, headBranchArgv())]: { stdout: 'main\n' },
      [runnerKey(workspace, statusPorcelainArgv())]: { stdout: ' M src/a.ts\n?? note.txt\n' },
      [runnerKey(workspace, operationMarkersArgv())]: { stdout: '' },
      [runnerKey(workspace, headShortArgv())]: { stdout: 'abc1234\n' },
    })
    const service = new GitService(runner, buildWorkspaceGate(registryOf([workspace])))
    expect(await service.status(workspace)).toEqual({
      root: workspace,
      branch: 'main',
      head: 'abc1234',
      dirtyFiles: 1,
      untrackedFiles: 1,
      conflicts: 0,
      operationInProgress: false,
    })
  })

  it('resolves a subdirectory onto the repository that contains it', async () => {
    const workspace = await fixtureDir('ggm-fence-ws-')
    const sub = path.join(workspace, 'packages')
    await makeDirs(workspace, ['packages'])
    const runner = scriptedRunner({
      [runnerKey(sub, topLevelArgv())]: { stdout: `${workspace}\n` },
      [runnerKey(workspace, headBranchArgv())]: { stdout: 'main\n' },
      [runnerKey(workspace, statusPorcelainArgv())]: { stdout: '' },
      [runnerKey(workspace, operationMarkersArgv())]: { stdout: '' },
      [runnerKey(workspace, headShortArgv())]: { stdout: 'abc1234\n' },
    })
    const service = new GitService(runner, buildWorkspaceGate(registryOf([workspace])))
    const status = await service.status(sub)
    expect(status?.root).toBe(workspace)
    expect(await service.branches(sub)).not.toBeNull()
  })

  it('rejects a path outside every workspace on both reads and mutations', async () => {
    const workspace = await fixtureDir('ggm-fence-ws-')
    const outside = await fixtureDir('ggm-fence-out-')
    const service = new GitService(scriptedRunner({}), buildWorkspaceGate(registryOf([workspace])))
    expect(await service.status(outside)).toBeNull()
    expect(await service.branches(outside)).toBeNull()
    expect(await service.graph(outside)).toBeNull()
    expect(await service.repos(outside)).toBeNull()
    expect(await service.preflight(outside)).toEqual({ code: 'workspace-unknown', message: expect.any(String) })
    const created = await service.createBranch(outside, 'feat/x')
    expect(created).toEqual({ ok: false, error: { code: 'workspace-unknown', message: expect.any(String) } })
  })

  it('rejects a repository whose git top level escapes the workspace', async () => {
    const workspace = await fixtureDir('ggm-fence-ws-')
    const sub = path.join(workspace, 'linked')
    await makeDirs(workspace, ['linked'])
    // The requested path is inside the workspace, but the checkout it belongs
    // to lives outside it: the fence must win over the path's apparent home.
    const outsideRepo = path.join(await fixtureDir('ggm-fence-out-'), 'repo')
    await makeDirs(path.dirname(outsideRepo), ['repo'])
    const runner = scriptedRunner({
      [runnerKey(sub, topLevelArgv())]: { stdout: `${outsideRepo}\n` },
    })
    const service = new GitService(runner, buildWorkspaceGate(registryOf([workspace])))

    expect(await service.status(sub)).toBeNull()
    expect(await service.branches(sub)).toBeNull()
    expect(await service.graph(sub)).toBeNull()
    expect(await service.worktrees(sub)).toBeNull()
    expect(await service.preflight(sub, 'main')).toEqual({ code: 'workspace-unknown', message: expect.any(String) })
    expect(await service.preflight(sub)).toEqual({ code: 'workspace-unknown', message: expect.any(String) })
    expect(await service.defaultBase(sub)).toBeNull()
    expect(await service.switchBranch(sub, 'main')).toEqual({
      ok: false,
      error: { code: 'workspace-unknown', message: expect.any(String) },
    })
    expect(await service.createBranchAt(sub, 'feat/x', 'main')).toEqual({
      ok: false,
      error: { code: 'workspace-unknown', message: expect.any(String) },
    })
    expect(await service.addWorktree(sub, 'wt-name')).toEqual({
      ok: false,
      error: { code: 'workspace-unknown', message: expect.any(String) },
    })
    expect(await service.removeWorktree(sub, outsideRepo)).toEqual({
      ok: false,
      error: { code: 'workspace-unknown', message: expect.any(String) },
    })
  })

  it('accepts a checkout whose top level IS the workspace root when asked about a subdirectory', async () => {
    const workspace = await fixtureDir('ggm-fence-ws-')
    const sub = path.join(workspace, 'service')
    await makeDirs(workspace, ['service'])
    const runner = scriptedRunner({
      [runnerKey(sub, topLevelArgv())]: { stdout: `${workspace}\n` },
      [runnerKey(workspace, headBranchArgv())]: { stdout: 'feat/x\n' },
      [runnerKey(workspace, statusPorcelainArgv())]: { stdout: '' },
      [runnerKey(workspace, operationMarkersArgv())]: { stdout: '' },
      [runnerKey(workspace, headShortArgv())]: { stdout: 'fffffff\n' },
    })
    const service = new GitService(runner, buildWorkspaceGate(registryOf([workspace])))
    const status = await service.status(sub)
    expect(status?.root).toBe(workspace)
    expect(status?.branch).toBe('feat/x')
  })
})

describe('GitService.preflight', () => {
  /**
   * A porcelain worktree list: one record per entry, the branch line omitted
   * for a detached checkout (git prints `detached` instead).
   */
  function worktreeList(records: readonly { path: string; branch?: string }[]): string {
    return records
      .map(record => `worktree ${record.path}\nHEAD 1111111111111111111111111111111111111111\n`
        + (record.branch === undefined ? 'detached\n' : `branch refs/heads/${record.branch}\n`))
      .join('\n')
  }

  /** The guard reads every preflight runs when it does not short-circuit. */
  function guardAnswers(workspace: string, extra: Record<string, { stdout?: string; exitCode?: number }>) {
    return {
      [runnerKey(workspace, topLevelArgv())]: { stdout: `${workspace}\n` },
      [runnerKey(workspace, unmergedArgv())]: { stdout: '' },
      [runnerKey(workspace, operationMarkersArgv())]: { stdout: '' },
      ...extra,
    }
  }

  it('passes a repository already on the target branch even though its own worktree lists it', async () => {
    // The opc regression: portal's only worktree IS the primary checkout, and
    // parseWorktreeBranches reports its `branch refs/heads/feat/x`. There is
    // nothing to switch, so the guard must not reject it.
    const workspace = await fixtureDir('ggm-preflight-ws-')
    const runner = scriptedRunner(guardAnswers(workspace, {
      [runnerKey(workspace, headBranchArgv())]: { stdout: 'feat/x\n' },
      [runnerKey(workspace, worktreeListArgv())]: {
        stdout: worktreeList([{ path: workspace, branch: 'feat/x' }]),
      },
    }))
    const service = new GitService(runner, buildWorkspaceGate(registryOf([workspace])))
    expect(await service.preflight(workspace, 'feat/x')).toBeNull()
  })

  it('ignores the guards entirely when the repository is already on the target (switchBranch short-circuits too)', async () => {
    const workspace = await fixtureDir('ggm-preflight-ws-')
    const runner = scriptedRunner(guardAnswers(workspace, {
      [runnerKey(workspace, headBranchArgv())]: { stdout: 'feat/x\n' },
      [runnerKey(workspace, unmergedArgv())]: { stdout: 'src/a.ts\n' },
      [runnerKey(workspace, worktreeListArgv())]: {
        stdout: worktreeList([{ path: workspace, branch: 'feat/x' }]),
      },
    }))
    const service = new GitService(runner, buildWorkspaceGate(registryOf([workspace])))
    expect(await service.preflight(workspace, 'feat/x')).toBeNull()
  })

  it('still rejects a target branch checked out in ANOTHER worktree', async () => {
    const workspace = await fixtureDir('ggm-preflight-ws-')
    const runner = scriptedRunner(guardAnswers(workspace, {
      [runnerKey(workspace, headBranchArgv())]: { stdout: 'main\n' },
      [runnerKey(workspace, worktreeListArgv())]: {
        stdout: worktreeList([
          { path: workspace, branch: 'main' },
          { path: `${workspace}-wt-feat`, branch: 'feat/x' },
        ]),
      },
    }))
    const service = new GitService(runner, buildWorkspaceGate(registryOf([workspace])))
    expect(await service.preflight(workspace, 'feat/x')).toEqual({
      code: 'branch-in-other-worktree',
      message: expect.any(String),
    })
  })

  it('runs the guards for a detached HEAD (no branch name to short-circuit on)', async () => {
    const workspace = await fixtureDir('ggm-preflight-ws-')
    const runner = scriptedRunner(guardAnswers(workspace, {
      [runnerKey(workspace, headBranchArgv())]: { stdout: 'HEAD\n' },
      [runnerKey(workspace, worktreeListArgv())]: {
        stdout: worktreeList([
          { path: workspace },
          { path: `${workspace}-wt-feat`, branch: 'feat/x' },
        ]),
      },
    }))
    const service = new GitService(runner, buildWorkspaceGate(registryOf([workspace])))
    expect(await service.preflight(workspace, 'feat/x')).toEqual({
      code: 'branch-in-other-worktree',
      message: expect.any(String),
    })
  })

  it('still blocks on unresolved conflicts when the target differs from the current branch', async () => {
    const workspace = await fixtureDir('ggm-preflight-ws-')
    const runner = scriptedRunner(guardAnswers(workspace, {
      [runnerKey(workspace, headBranchArgv())]: { stdout: 'main\n' },
      [runnerKey(workspace, unmergedArgv())]: { stdout: 'src/a.ts\n' },
    }))
    const service = new GitService(runner, buildWorkspaceGate(registryOf([workspace])))
    expect(await service.preflight(workspace, 'feat/x')).toEqual({
      code: 'conflicts-present',
      message: expect.any(String),
    })
  })

  it('keeps the create path (no target) guarded but without the worktree probe', async () => {
    const workspace = await fixtureDir('ggm-preflight-ws-')
    const runner = scriptedRunner(guardAnswers(workspace, {
      [runnerKey(workspace, headBranchArgv())]: { stdout: 'feat/x\n' },
    }))
    const service = new GitService(runner, buildWorkspaceGate(registryOf([workspace])))
    expect(await service.preflight(workspace)).toBeNull()
  })
})
