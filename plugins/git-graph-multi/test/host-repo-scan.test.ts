/**
 * Workspace repository-scan tests: the walk must recognize both `.git` forms,
 * stop entering a recognized repository (except at the workspace root, where
 * the primary checkout and its independent sub-repositories coexist), honor
 * the depth and directory budgets, skip hidden/dependency directories, and
 * never follow symlinks.
 * @module dsh-git-graph-multi/test/host-repo-scan
 */

import { mkdir, realpath, symlink } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_MAX_DIRS, DEFAULT_MAX_DEPTH, DEFAULT_SKIP_DIRS, scanRepos } from '../src/host/repo-scan.ts'
import { cleanup, makeDirs, tempDir } from './support.ts'

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

describe('scanRepos', () => {
  it('keeps the designed defaults', () => {
    expect(DEFAULT_MAX_DEPTH).toBe(3)
    expect(DEFAULT_MAX_DIRS).toBe(500)
    expect([...DEFAULT_SKIP_DIRS]).toEqual(['node_modules', 'target', 'dist', 'build', 'out'])
  })

  it('returns an empty list for a workspace without any repository', async () => {
    const root = await fixtureDir('ggm-scan-none-')
    await makeDirs(root, ['src/lib', 'docs'])
    expect(await scanRepos(root)).toEqual([])
  })

  it('marks the scan root itself as the primary repository', async () => {
    const root = await fixtureDir('ggm-scan-primary-')
    await makeDirs(root, ['.git', 'src/lib'])
    expect(await scanRepos(root)).toEqual([
      { path: root, name: path.basename(root), primary: true },
    ])
  })

  it('enumerates sub-repositories below a workspace root that is itself a repository', async () => {
    const root = await fixtureDir('ggm-scan-multi-')
    await makeDirs(root, ['.git', 'service/.git', 'portal/.git', 'console/.git', 'docs'])
    expect(await scanRepos(root)).toEqual([
      { path: root, name: path.basename(root), primary: true },
      { path: path.join(root, 'console'), name: 'console', primary: false },
      { path: path.join(root, 'portal'), name: 'portal', primary: false },
      { path: path.join(root, 'service'), name: 'service', primary: false },
    ])
  })

  it('recognizes the `.git` file form (linked worktree / submodule pointer)', async () => {
    const root = await fixtureDir('ggm-scan-pointer-')
    await makeDirs(root, ['service/.git', 'portal/.git'])
    expect(await scanRepos(root)).toEqual([
      { path: path.join(root, 'portal'), name: 'portal', primary: false },
      { path: path.join(root, 'service'), name: 'service', primary: false },
    ])
  })

  it('does not descend into a recognized repository', async () => {
    const root = await fixtureDir('ggm-scan-nested-')
    await makeDirs(root, ['outer/.git', 'outer/inner/.git'])
    expect(await scanRepos(root)).toEqual([
      { path: path.join(root, 'outer'), name: 'outer', primary: false },
    ])
  })

  it('converges at the directory budget and still returns what it found', async () => {
    const root = await fixtureDir('ggm-scan-budget-')
    await makeDirs(root, ['a/.git', 'b/.git', 'c', 'd', 'e'])
    expect(await scanRepos(root, { maxDirs: 2 })).toEqual([
      { path: path.join(root, 'a'), name: 'a', primary: false },
    ])
    expect(await scanRepos(root, { maxDirs: 100 })).toEqual([
      { path: path.join(root, 'a'), name: 'a', primary: false },
      { path: path.join(root, 'b'), name: 'b', primary: false },
    ])
  })

  it('never enters a symlinked directory', async () => {
    const root = await fixtureDir('ggm-scan-link-')
    const target = await fixtureDir('ggm-scan-target-')
    await makeDirs(target, ['repo/.git'])
    await symlink(path.join(target, 'repo'), path.join(root, 'linked'), 'dir')
    expect(await scanRepos(root)).toEqual([])
  })

  it('skips hidden and dependency/build directories', async () => {
    const root = await fixtureDir('ggm-scan-skip-')
    await makeDirs(root, [
      '.hidden/.git', 'node_modules/pkg/.git', 'target/.git',
      'dist/.git', 'build/.git', 'out/.git', 'src/.git',
    ])
    expect(await scanRepos(root)).toEqual([
      { path: path.join(root, 'src'), name: 'src', primary: false },
    ])
  })

  it('respects the depth bound, the scan root being level 0', async () => {
    const root = await fixtureDir('ggm-scan-depth-')
    await makeDirs(root, ['a/b/c/d/.git'])
    expect(await scanRepos(root)).toEqual([])
    expect(await scanRepos(root, { maxDepth: 4 })).toEqual([
      { path: path.join(root, 'a/b/c/d'), name: 'a/b/c/d', primary: false },
    ])
  })

  it('honors a caller-supplied skip list and directory budget', async () => {
    const root = await fixtureDir('ggm-scan-options-')
    await makeDirs(root, ['keep/.git', 'vendor/.git'])
    expect(await scanRepos(root, { skipDirs: ['vendor'] })).toEqual([
      { path: path.join(root, 'keep'), name: 'keep', primary: false },
    ])
    const nested = await fixtureDir('ggm-scan-options-')
    await mkdir(path.join(nested, 'a'), { recursive: true })
    expect(await scanRepos(nested, { maxDirs: 1 })).toEqual([])
  })
})
