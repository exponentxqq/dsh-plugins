/**
 * Group-operation orchestration tests: the switch fan-out (implicit feature
 * set + preflight atomicity) and the checked-set branch creation, driven by
 * an in-memory {@link GroupDeps} double that records every call.
 * @module dsh-git-graph-multi/test/host-group-ops
 */

import { describe, expect, it } from 'vitest'
import { groupCreate, groupSwitch } from '../src/host/group-ops.ts'
import type { BranchesView, GitError, GroupDeps, RepoRef, SwitchResult } from '../src/core/types.ts'

const ROOT: RepoRef = { path: '/ws', name: 'ws', primary: true }
const SERVICE: RepoRef = { path: '/ws/service', name: 'service', primary: false }
const PORTAL: RepoRef = { path: '/ws/portal', name: 'portal', primary: false }

/** Every call the double observed, in invocation order. */
interface Calls {
  repos: string[]
  branchesOf: string[]
  preflight: { repoPath: string; target: string | undefined }[]
  switchBranch: { repoPath: string; branch: string }[]
  createBranchAt: { repoPath: string; name: string; base: string | undefined }[]
  defaultBase: string[]
}

/** Scripted behaviour of the double; unset entries fall back to the happy path. */
interface FakeOptions {
  /** Enumeration answer; null models an unusable workspace. */
  repos: RepoRef[] | null
  /** Local branch names per repository; a missing key reads as an unusable repository. */
  branches?: Record<string, string[]>
  /** Preflight rejections per repository. */
  preflight?: Record<string, GitError>
  /** Switch answers per repository. */
  switch?: Record<string, SwitchResult>
  /** Create answers per repository. */
  create?: Record<string, SwitchResult>
  /** Default mainline per repository; a missing key means none resolves. */
  defaults?: Record<string, string | null>
}

/** Build the branch view for one repository. */
function branchesView(root: string, names: readonly string[]): BranchesView {
  return {
    root,
    branch: names[0] ?? '',
    branches: names.map(name => ({ name, current: false })),
    dirtyFiles: 0,
    untrackedFiles: 0,
    conflicts: 0,
    operationInProgress: false,
  }
}

/**
 * Build the recording double.
 * @param options - the scripted answers.
 * @returns the port plus its call log.
 */
function fakeDeps(options: FakeOptions): { deps: GroupDeps; calls: Calls } {
  const calls: Calls = {
    repos: [],
    branchesOf: [],
    preflight: [],
    switchBranch: [],
    createBranchAt: [],
    defaultBase: [],
  }
  const deps: GroupDeps = {
    async repos(workspacePath) {
      calls.repos.push(workspacePath)
      return options.repos
    },
    async branchesOf(repoPath) {
      calls.branchesOf.push(repoPath)
      const names = options.branches?.[repoPath]
      return names === undefined ? null : branchesView(repoPath, names)
    },
    async preflight(repoPath, target) {
      calls.preflight.push({ repoPath, target })
      return options.preflight?.[repoPath] ?? null
    },
    async switchBranch(repoPath, branch) {
      calls.switchBranch.push({ repoPath, branch })
      return options.switch?.[repoPath] ?? { ok: true, branch }
    },
    async createBranchAt(repoPath, name, base) {
      calls.createBranchAt.push({ repoPath, name, base })
      return options.create?.[repoPath] ?? { ok: true, branch: name }
    },
    async defaultBase(repoPath) {
      calls.defaultBase.push(repoPath)
      return options.defaults?.[repoPath] ?? null
    },
  }
  return { deps, calls }
}

describe('groupSwitch', () => {
  it('skips a repository without the branch and never creates it a branch', async () => {
    const { deps, calls } = fakeDeps({
      repos: [ROOT, SERVICE, PORTAL],
      branches: {
        '/ws': ['main', 'feat/x'],
        '/ws/service': ['main', 'feat/x'],
        '/ws/portal': ['main'],
      },
    })

    const view = await groupSwitch(deps, '/ws', 'feat/x')

    expect(view).toStrictEqual({
      action: 'switch',
      branch: 'feat/x',
      results: [
        { repo: ROOT, outcome: 'ok' },
        { repo: SERVICE, outcome: 'ok' },
        { repo: PORTAL, outcome: 'skipped' },
      ],
    })
    expect(calls.repos).toStrictEqual(['/ws'])
    expect(calls.branchesOf).toStrictEqual(['/ws', '/ws/service', '/ws/portal'])
    expect(calls.preflight).toStrictEqual([
      { repoPath: '/ws', target: 'feat/x' },
      { repoPath: '/ws/service', target: 'feat/x' },
    ])
    expect(calls.switchBranch).toStrictEqual([
      { repoPath: '/ws', branch: 'feat/x' },
      { repoPath: '/ws/service', branch: 'feat/x' },
    ])
    expect(calls.createBranchAt).toStrictEqual([])
  })

  it('never guards or switches a repository that lacks the requested branch', async () => {
    const { deps, calls } = fakeDeps({
      repos: [ROOT, SERVICE, PORTAL],
      branches: { '/ws': ['feat/x'], '/ws/service': ['main'], '/ws/portal': ['main'] },
    })

    const view = await groupSwitch(deps, '/ws', 'feat/x')

    expect(view.results).toStrictEqual([
      { repo: ROOT, outcome: 'ok' },
      { repo: SERVICE, outcome: 'skipped' },
      { repo: PORTAL, outcome: 'skipped' },
    ])
    expect(calls.createBranchAt).toStrictEqual([])
    expect(calls.preflight).toStrictEqual([{ repoPath: '/ws', target: 'feat/x' }])
    expect(calls.switchBranch).toStrictEqual([{ repoPath: '/ws', branch: 'feat/x' }])
  })

  it('reports every repository skipped when none owns the branch, changing nothing', async () => {
    const { deps, calls } = fakeDeps({
      repos: [ROOT, SERVICE],
      branches: { '/ws': ['main'], '/ws/service': ['main'] },
    })

    const view = await groupSwitch(deps, '/ws', 'feat/missing')

    expect(view.results).toStrictEqual([
      { repo: ROOT, outcome: 'skipped' },
      { repo: SERVICE, outcome: 'skipped' },
    ])
    expect(calls.preflight).toStrictEqual([])
    expect(calls.switchBranch).toStrictEqual([])
    expect(calls.createBranchAt).toStrictEqual([])
  })

  it('marks a repository unusable between scan and read as skipped', async () => {
    const { deps, calls } = fakeDeps({
      repos: [ROOT, SERVICE],
      branches: { '/ws': ['main', 'feat/x'] },
    })

    const view = await groupSwitch(deps, '/ws', 'feat/x')

    expect(view.results).toStrictEqual([
      { repo: ROOT, outcome: 'ok' },
      { repo: SERVICE, outcome: 'skipped' },
    ])
    expect(calls.switchBranch).toStrictEqual([{ repoPath: '/ws', branch: 'feat/x' }])
  })

  it('keeps every repository untouched when one participant fails preflight', async () => {
    const conflicts: GitError = { code: 'conflicts-present', message: 'unresolved conflicts' }
    const { deps, calls } = fakeDeps({
      repos: [ROOT, SERVICE, PORTAL],
      branches: {
        '/ws': ['main', 'feat/x'],
        '/ws/service': ['main', 'feat/x'],
        '/ws/portal': ['main'],
      },
      preflight: { '/ws/service': conflicts },
    })

    const view = await groupSwitch(deps, '/ws', 'feat/x')

    expect(view.results).toStrictEqual([
      { repo: ROOT, outcome: 'not-run' },
      { repo: SERVICE, outcome: 'failed', error: conflicts },
      { repo: PORTAL, outcome: 'skipped' },
    ])
    // Both participants were guarded; the rejection stopped the whole group.
    expect(calls.preflight).toStrictEqual([
      { repoPath: '/ws', target: 'feat/x' },
      { repoPath: '/ws/service', target: 'feat/x' },
    ])
    expect(calls.switchBranch).toStrictEqual([])
  })

  it('marks every rejected participant and runs none of them', async () => {
    const conflicts: GitError = { code: 'conflicts-present', message: 'unresolved conflicts' }
    const rebasing: GitError = { code: 'operation-in-progress', message: 'rebase in progress' }
    const { deps, calls } = fakeDeps({
      repos: [ROOT, SERVICE],
      branches: { '/ws': ['feat/x'], '/ws/service': ['feat/x'] },
      preflight: { '/ws': conflicts, '/ws/service': rebasing },
    })

    const view = await groupSwitch(deps, '/ws', 'feat/x')

    expect(view.results).toStrictEqual([
      { repo: ROOT, outcome: 'failed', error: conflicts },
      { repo: SERVICE, outcome: 'failed', error: rebasing },
    ])
    expect(calls.switchBranch).toStrictEqual([])
  })

  it('treats a throwing guard as a rejection so nothing is switched', async () => {
    const { deps, calls } = fakeDeps({
      repos: [ROOT, SERVICE],
      branches: { '/ws': ['feat/x'], '/ws/service': ['feat/x'] },
    })
    const guarded: GroupDeps = {
      ...deps,
      preflight: async () => { throw new Error('guard exploded') },
    }

    const view = await groupSwitch(guarded, '/ws', 'feat/x')

    expect(view.results.map(row => row.outcome)).toStrictEqual(['failed', 'failed'])
    expect(view.results[0]!.error).toStrictEqual({ code: 'internal', message: 'guard exploded' })
    expect(calls.switchBranch).toStrictEqual([])
  })

  it('records one repository switch failure while the others still succeed', async () => {
    const locked: GitError = { code: 'branch-in-other-worktree', message: 'branch is checked out elsewhere' }
    const { deps } = fakeDeps({
      repos: [ROOT, SERVICE, PORTAL],
      branches: { '/ws': ['feat/x'], '/ws/service': ['feat/x'], '/ws/portal': ['feat/x'] },
      switch: { '/ws/service': { ok: false, error: locked } },
    })

    const view = await groupSwitch(deps, '/ws', 'feat/x')

    expect(view.results).toStrictEqual([
      { repo: ROOT, outcome: 'ok' },
      { repo: SERVICE, outcome: 'failed', error: locked },
      { repo: PORTAL, outcome: 'ok' },
    ])
  })

  it('returns no rows for an unusable workspace', async () => {
    const { deps, calls } = fakeDeps({ repos: null })

    const view = await groupSwitch(deps, '/ws', 'feat/x')

    expect(view).toStrictEqual({ action: 'switch', branch: 'feat/x', results: [] })
    expect(calls.branchesOf).toStrictEqual([])
  })
})

describe('groupCreate', () => {
  it('branches every checked repository from its own default mainline', async () => {
    const { deps, calls } = fakeDeps({
      repos: [ROOT, SERVICE, PORTAL],
      defaults: { '/ws': 'main', '/ws/service': 'master' },
    })

    const view = await groupCreate(deps, '/ws', ['/ws', '/ws/service'], 'feat/y', 'mainline')

    expect(view).toStrictEqual({
      action: 'create',
      branch: 'feat/y',
      results: [
        { repo: ROOT, outcome: 'ok' },
        { repo: SERVICE, outcome: 'ok' },
        { repo: PORTAL, outcome: 'skipped' },
      ],
    })
    expect(calls.defaultBase).toStrictEqual(['/ws', '/ws/service'])
    expect(calls.createBranchAt).toStrictEqual([
      { repoPath: '/ws', name: 'feat/y', base: 'main' },
      { repoPath: '/ws/service', name: 'feat/y', base: 'master' },
    ])
  })

  it('passes an undefined base for the current-HEAD baseline', async () => {
    const { deps, calls } = fakeDeps({ repos: [ROOT, SERVICE] })

    const view = await groupCreate(deps, '/ws', ['/ws', '/ws/service'], 'feat/y', 'head')

    expect(view.results.map(row => row.outcome)).toStrictEqual(['ok', 'ok'])
    expect(calls.defaultBase).toStrictEqual([])
    expect(calls.createBranchAt).toStrictEqual([
      { repoPath: '/ws', name: 'feat/y', base: undefined },
      { repoPath: '/ws/service', name: 'feat/y', base: undefined },
    ])
  })

  it('fails only the repository whose default mainline does not resolve', async () => {
    const { deps, calls } = fakeDeps({
      repos: [ROOT, SERVICE],
      defaults: { '/ws': 'main', '/ws/service': null },
    })

    const view = await groupCreate(deps, '/ws', ['/ws', '/ws/service'], 'feat/y', 'mainline')

    expect(view.results[0]).toStrictEqual({ repo: ROOT, outcome: 'ok' })
    expect(view.results[1]!.outcome).toBe('failed')
    expect(view.results[1]!.error?.code).toBe('base-ref-not-found')
    expect(calls.createBranchAt).toStrictEqual([{ repoPath: '/ws', name: 'feat/y', base: 'main' }])
  })

  it('lets the other repositories finish when one creation fails', async () => {
    const exists: GitError = { code: 'branch-already-exists', message: 'branch already exists' }
    const { deps } = fakeDeps({
      repos: [ROOT, SERVICE, PORTAL],
      create: { '/ws/service': { ok: false, error: exists } },
    })

    const view = await groupCreate(deps, '/ws', ['/ws', '/ws/service'], 'feat/y', 'head')

    expect(view.results).toStrictEqual([
      { repo: ROOT, outcome: 'ok' },
      { repo: SERVICE, outcome: 'failed', error: exists },
      { repo: PORTAL, outcome: 'skipped' },
    ])
  })

  it('rejects every checked repository on an invalid name without calling git', async () => {
    const { deps, calls } = fakeDeps({ repos: [ROOT, SERVICE, PORTAL] })

    const view = await groupCreate(deps, '/ws', ['/ws', '/ws/service'], 'feat/..', 'mainline')

    expect(view.results).toStrictEqual([
      {
        repo: ROOT,
        outcome: 'failed',
        error: expect.objectContaining({ code: 'invalid-branch-name' }),
      },
      {
        repo: SERVICE,
        outcome: 'failed',
        error: expect.objectContaining({ code: 'invalid-branch-name' }),
      },
      { repo: PORTAL, outcome: 'skipped' },
    ])
    expect(calls.createBranchAt).toStrictEqual([])
    expect(calls.defaultBase).toStrictEqual([])
  })

  it('appends requested paths outside the enumeration as workspace-unknown', async () => {
    const { deps, calls } = fakeDeps({ repos: [ROOT, SERVICE] })

    const view = await groupCreate(deps, '/ws', ['/ws/service', '/ws/ghost'], 'feat/y', 'head')

    expect(view.results).toStrictEqual([
      { repo: ROOT, outcome: 'skipped' },
      { repo: SERVICE, outcome: 'ok' },
      {
        repo: { path: '/ws/ghost', name: 'ghost', primary: false },
        outcome: 'failed',
        error: expect.objectContaining({ code: 'workspace-unknown' }),
      },
    ])
    expect(calls.createBranchAt).toStrictEqual([{ repoPath: '/ws/service', name: 'feat/y', base: undefined }])
  })

  it('matches checked paths after normalization and keeps enumeration order', async () => {
    const { deps, calls } = fakeDeps({ repos: [ROOT, SERVICE] })

    const view = await groupCreate(deps, '/ws', ['/ws/service/', '/ws/.'], 'feat/y', 'head')

    expect(view.results).toStrictEqual([
      { repo: ROOT, outcome: 'ok' },
      { repo: SERVICE, outcome: 'ok' },
    ])
    expect(calls.createBranchAt).toStrictEqual([
      { repoPath: '/ws', name: 'feat/y', base: undefined },
      { repoPath: '/ws/service', name: 'feat/y', base: undefined },
    ])
  })

  it('returns no rows for an unusable workspace and does not validate first', async () => {
    const { deps, calls } = fakeDeps({ repos: null })

    const view = await groupCreate(deps, '/ws', ['/ws'], 'bad name', 'head')

    expect(view).toStrictEqual({ action: 'create', branch: 'bad name', results: [] })
    expect(calls.createBranchAt).toStrictEqual([])
  })

  it('records a throwing creation as that repository only', async () => {
    const { deps } = fakeDeps({
      repos: [ROOT, SERVICE],
      create: { '/ws/service': { ok: true, branch: 'x' } },
    })
    const exploding: GroupDeps = {
      ...deps,
      createBranchAt: async (repoPath, name, base) => {
        if (repoPath === '/ws/service') throw new Error('spawn failed')
        return { ok: true, branch: name }
      },
    }

    const view = await groupCreate(exploding, '/ws', ['/ws', '/ws/service'], 'feat/y', 'head')

    expect(view.results).toStrictEqual([
      { repo: ROOT, outcome: 'ok' },
      { repo: SERVICE, outcome: 'failed', error: { code: 'internal', message: 'spawn failed' } },
    ])
  })
})
