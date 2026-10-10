/**
 * `/git/repos` aggregate tests plus the service verbs the group operations
 * build on: one call must return every repository of the gated workspace with
 * its status, a repository that stopped being usable must degrade to a
 * `status: null` row instead of failing the view, and the scan root is always
 * the gated workspace root (never the requested subdirectory).
 * @module dsh-git-graph-multi/test/host-repos
 */

import { realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkRefFormatArgv, createBranchArgv, createBranchAtArgv, headBranchArgv, headShortArgv,
  operationMarkersArgv, statusPorcelainArgv, topLevelArgv, unmergedArgv, verifyRefArgv, verifyRevArgv,
} from '../src/core/git-command.ts'
import { isReposView } from '../src/core/types.ts'
import { buildWorkspaceGate, GitService, type GitRunner } from '../src/host/git-service.ts'
import { cleanup, makeDirs, runnerKey, scriptedRunner, tempDir, type ScriptedAnswers } from './support.ts'

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

/** A service whose gate accepts exactly one workspace root. */
function serviceFor(workspace: string, runner: GitRunner): GitService {
  return new GitService(runner, buildWorkspaceGate({ list: () => [{ path: workspace }] }))
}

/** Script the five git reads one repository status needs. */
function statusAnswers(
  answers: ScriptedAnswers,
  root: string,
  status: { branch?: string; porcelain?: string; head?: string; marker?: string } = {},
): void {
  answers[runnerKey(root, topLevelArgv())] = { stdout: `${root}\n` }
  answers[runnerKey(root, headBranchArgv())] = { stdout: `${status.branch ?? 'main'}\n` }
  answers[runnerKey(root, statusPorcelainArgv())] = { stdout: status.porcelain ?? '' }
  answers[runnerKey(root, operationMarkersArgv())] = { stdout: status.marker ?? '' }
  answers[runnerKey(root, headShortArgv())] = { stdout: `${status.head ?? 'abc1234'}\n` }
}

describe('GitService.repos', () => {
  it('returns every workspace repository with its status in one read', async () => {
    const workspace = await fixtureDir('ggm-repos-ws-')
    await makeDirs(workspace, ['.git', 'service/.git', 'portal/.git', 'docs'])
    const serviceRepo = path.join(workspace, 'service')
    const portalRepo = path.join(workspace, 'portal')
    // The root checkout is mid-merge: the aggregate row must report it.
    await writeFile(path.join(workspace, 'MERGE_HEAD'), 'deadbeef\n', 'utf8')
    const answers: ScriptedAnswers = {}
    statusAnswers(answers, workspace, {
      branch: 'main',
      porcelain: ' M a.ts\n?? b.ts\nUU c.ts\n',
      head: 'aaaaaaa',
      marker: 'MERGE_HEAD\n',
    })
    statusAnswers(answers, serviceRepo, { branch: 'feat/x', head: 'bbbbbbb' })
    statusAnswers(answers, portalRepo, { branch: 'main', porcelain: '?? only.txt\n', head: 'ccccccc' })

    const view = await serviceFor(workspace, scriptedRunner(answers)).repos(workspace)
    if (view === null) throw new Error('repos() returned null for a registered workspace')
    expect(isReposView(view)).toBe(true)
    expect(view.workspaceRoot).toBe(workspace)
    // Primary first, every other repository by name.
    expect(view.repos.map(row => row.repo.name)).toEqual([path.basename(workspace), 'portal', 'service'])
    expect(view.repos.map(row => row.repo.primary)).toEqual([true, false, false])
    const [rootRow, portalRow, serviceRow] = view.repos
    expect(rootRow?.status).toEqual({
      root: workspace,
      branch: 'main',
      head: 'aaaaaaa',
      dirtyFiles: 1,
      untrackedFiles: 1,
      conflicts: 1,
      operationInProgress: true,
    })
    expect(portalRow?.status).toMatchObject({ root: portalRepo, branch: 'main', dirtyFiles: 0, untrackedFiles: 1 })
    expect(serviceRow?.status).toMatchObject({ root: serviceRepo, branch: 'feat/x', head: 'bbbbbbb' })
  })

  it('reports a repository that stopped being usable as status null without failing the view', async () => {
    const workspace = await fixtureDir('ggm-repos-ws-')
    await makeDirs(workspace, ['service/.git', 'portal/.git'])
    const portalRepo = path.join(workspace, 'portal')
    const answers: ScriptedAnswers = {}
    statusAnswers(answers, portalRepo, { branch: 'main' })
    // The service repository's top-level probe is deliberately left
    // unscripted: the runner fails it loudly (exitCode 1), which is exactly
    // the "no longer a repository" case the aggregate must absorb.
    const view = await serviceFor(workspace, scriptedRunner(answers)).repos(workspace)
    if (view === null) throw new Error('repos() returned null for a registered workspace')
    expect(view.repos.map(row => row.repo.name)).toEqual(['portal', 'service'])
    expect(view.repos[0]?.status).not.toBeNull()
    expect(view.repos[1]?.status).toBeNull()
  })

  it('returns null for a path outside every registered workspace', async () => {
    const workspace = await fixtureDir('ggm-repos-ws-')
    const outside = await fixtureDir('ggm-repos-out-')
    expect(await serviceFor(workspace, scriptedRunner({})).repos(outside)).toBeNull()
  })

  it('returns an empty repository list for a workspace without repositories', async () => {
    const workspace = await fixtureDir('ggm-repos-ws-')
    await makeDirs(workspace, ['docs', 'notes'])
    expect(await serviceFor(workspace, scriptedRunner({})).repos(workspace)).toEqual({
      workspaceRoot: workspace,
      repos: [],
    })
  })

  it('scans the workspace root even when asked from a subdirectory', async () => {
    const workspace = await fixtureDir('ggm-repos-ws-')
    await makeDirs(workspace, ['service/.git', 'portal/.git'])
    const answers: ScriptedAnswers = {}
    statusAnswers(answers, path.join(workspace, 'service'), { branch: 'feat/x' })
    statusAnswers(answers, path.join(workspace, 'portal'), { branch: 'main' })
    const view = await serviceFor(workspace, scriptedRunner(answers)).repos(path.join(workspace, 'service'))
    if (view === null) throw new Error('repos() returned null for a workspace subdirectory')
    expect(view.workspaceRoot).toBe(workspace)
    expect(view.repos.map(row => row.repo.name)).toEqual(['portal', 'service'])
  })
})

describe('GitService.defaultBase', () => {
  it('probes origin/HEAD, then main, then master, then HEAD', async () => {
    const workspace = await fixtureDir('ggm-base-ws-')
    const answers: ScriptedAnswers = {
      [runnerKey(workspace, topLevelArgv())]: { stdout: `${workspace}\n` },
      [runnerKey(workspace, verifyRevArgv('main'))]: { exitCode: 0 },
    }
    // origin/HEAD is left unscripted (unresolvable), main answers: main wins.
    expect(await serviceFor(workspace, scriptedRunner(answers)).defaultBase(workspace)).toBe('main')
  })

  it('prefers the remote HEAD when it resolves', async () => {
    const workspace = await fixtureDir('ggm-base-ws-')
    const answers: ScriptedAnswers = {
      [runnerKey(workspace, topLevelArgv())]: { stdout: `${workspace}\n` },
      [runnerKey(workspace, verifyRevArgv('origin/HEAD'))]: { exitCode: 0 },
    }
    expect(await serviceFor(workspace, scriptedRunner(answers)).defaultBase(workspace)).toBe('origin/HEAD')
  })

  it('falls back to the current HEAD, and to null when nothing resolves', async () => {
    const workspace = await fixtureDir('ggm-base-ws-')
    const answers: ScriptedAnswers = {
      [runnerKey(workspace, topLevelArgv())]: { stdout: `${workspace}\n` },
      [runnerKey(workspace, verifyRevArgv('HEAD'))]: { exitCode: 0 },
    }
    expect(await serviceFor(workspace, scriptedRunner(answers)).defaultBase(workspace)).toBe('HEAD')
    const bare: ScriptedAnswers = {
      [runnerKey(workspace, topLevelArgv())]: { stdout: `${workspace}\n` },
    }
    expect(await serviceFor(workspace, scriptedRunner(bare)).defaultBase(workspace)).toBeNull()
  })
})

describe('GitService.createBranchAt', () => {
  /** The argv-level reads every branch creation runs before the mutation. */
  function createAnswers(workspace: string, extra: ScriptedAnswers): ScriptedAnswers {
    return {
      [runnerKey(workspace, topLevelArgv())]: { stdout: `${workspace}\n` },
      [runnerKey(workspace, checkRefFormatArgv('feat/x'))]: { exitCode: 0 },
      [runnerKey(workspace, unmergedArgv())]: { stdout: '' },
      [runnerKey(workspace, operationMarkersArgv())]: { stdout: '' },
      ...extra,
    }
  }

  it('creates the branch at the given base revision', async () => {
    const workspace = await fixtureDir('ggm-create-ws-')
    const answers = createAnswers(workspace, {
      [runnerKey(workspace, verifyRefArgv('feat/x'))]: { exitCode: 1 },
      [runnerKey(workspace, verifyRevArgv('origin/main'))]: { exitCode: 0 },
      [runnerKey(workspace, createBranchAtArgv('feat/x', 'origin/main'))]: { exitCode: 0 },
    })
    expect(await serviceFor(workspace, scriptedRunner(answers)).createBranchAt(workspace, 'feat/x', 'origin/main'))
      .toEqual({ ok: true, branch: 'feat/x' })
  })

  it('rejects an unresolvable base revision', async () => {
    const workspace = await fixtureDir('ggm-create-ws-')
    const answers = createAnswers(workspace, {
      [runnerKey(workspace, verifyRefArgv('feat/x'))]: { exitCode: 1 },
    })
    const result = await serviceFor(workspace, scriptedRunner(answers)).createBranchAt(workspace, 'feat/x', 'nope')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('base-ref-not-found')
  })

  it('rejects a duplicate branch before any mutation', async () => {
    const workspace = await fixtureDir('ggm-create-ws-')
    const answers = createAnswers(workspace, {
      [runnerKey(workspace, verifyRefArgv('feat/x'))]: { exitCode: 0 },
    })
    const result = await serviceFor(workspace, scriptedRunner(answers)).createBranchAt(workspace, 'feat/x', 'main')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('branch-already-exists')
  })

  it('creates from the current HEAD when the base is omitted', async () => {
    const workspace = await fixtureDir('ggm-create-ws-')
    const answers = createAnswers(workspace, {
      [runnerKey(workspace, verifyRefArgv('feat/x'))]: { exitCode: 1 },
      [runnerKey(workspace, createBranchArgv('feat/x'))]: { exitCode: 0 },
    })
    expect(await serviceFor(workspace, scriptedRunner(answers)).createBranch(workspace, 'feat/x'))
      .toEqual({ ok: true, branch: 'feat/x' })
  })

  it('rejects a mirror-invalid branch name without spawning git', async () => {
    const workspace = await fixtureDir('ggm-create-ws-')
    const result = await serviceFor(workspace, scriptedRunner({})).createBranchAt(workspace, 'bad name', 'main')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-branch-name')
  })
})
