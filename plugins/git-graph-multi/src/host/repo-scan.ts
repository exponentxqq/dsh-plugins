/**
 * Workspace repository enumeration: a bounded filesystem walk that recognizes
 * a repository by its `.git` entry — the directory form, or the file pointer
 * a linked worktree / submodule carries — so enumerating a workspace never
 * spawns git per candidate directory. The boundaries mirror design D3: depth
 * is capped, hidden and dependency/build directories are never entered,
 * symlinks are never followed, and a hard directory budget makes a
 * pathological tree converge instead of hanging the request.
 * @module dsh-git-graph-multi/host/repo-scan
 */

import { readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import path from 'node:path'
import type { RepoRef } from '../core/types.ts'

/** Tunable scan boundaries; every default mirrors the change's design. */
export interface RepoScanOptions {
  /** Deepest directory level entered, the scan root being 0. Default {@link DEFAULT_MAX_DEPTH}. */
  maxDepth?: number
  /** Directory-visit budget for one scan. Default {@link DEFAULT_MAX_DIRS}. */
  maxDirs?: number
  /** Directory names never entered. Default {@link DEFAULT_SKIP_DIRS}. */
  skipDirs?: readonly string[]
}

/** Default deepest directory level entered (the scan root being 0). */
export const DEFAULT_MAX_DEPTH = 3

/** Default directory-visit budget for one scan. */
export const DEFAULT_MAX_DIRS = 500

/** Dependency / build-output directories the walk never enters. */
export const DEFAULT_SKIP_DIRS = ['node_modules', 'target', 'dist', 'build', 'out'] as const

/** One directory waiting to be visited, with its distance from the scan root. */
interface PendingDir {
  dir: string
  depth: number
}

/**
 * Enumerate the repositories of one workspace root without running git.
 *
 * A directory holding a `.git` entry is a repository and is not entered, so a
 * nested repository inside it never shows up. The scan root is the single
 * exception: the layout this feature exists for is a workspace whose root is
 * itself a checkout with independent sub-repositories below it (the root's
 * `.gitignore` excludes them), so the root is still walked after being
 * recorded as the primary repository.
 *
 * Directories are visited depth-first in ascending name order; unreadable
 * directories are skipped; the returned rows put the primary checkout first
 * and the rest in ascending name order (the workspace-relative POSIX path).
 * @param root - the workspace root to scan (expected to be a canonical path).
 * @param options - boundary overrides; omitted fields take the defaults.
 * @returns the recognized repositories, empty when the workspace holds none.
 */
export async function scanRepos(root: string, options: RepoScanOptions = {}): Promise<RepoRef[]> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxDirs = options.maxDirs ?? DEFAULT_MAX_DIRS
  const skipDirs = new Set(options.skipDirs ?? DEFAULT_SKIP_DIRS)
  const found: RepoRef[] = []
  let visited = 0
  const pending: PendingDir[] = [{ dir: root, depth: 0 }]

  while (pending.length > 0 && visited < maxDirs) {
    const current = pending.pop()
    if (current === undefined) break
    visited += 1
    const entries = await readEntries(current.dir)
    if (entries === null) continue
    if (entries.some(entry => entry.name === '.git')) {
      found.push(repoRef(root, current.dir))
      if (current.dir !== root) continue
    }
    if (current.depth >= maxDepth) continue
    const children = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !skipDirs.has(entry.name))
      .map(entry => entry.name)
      .sort()
    // Pushed in reverse so the stack pops them back in ascending name order.
    for (const name of children.reverse()) {
      pending.push({ dir: path.join(current.dir, name), depth: current.depth + 1 })
    }
  }

  return sortRepos(found)
}

/** Read one directory, or null when it cannot be read (skipped, never fatal). */
async function readEntries(dir: string): Promise<Dirent[] | null> {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
}

/** The RepoRef for one recognized repository directory. */
function repoRef(root: string, dir: string): RepoRef {
  if (dir === root) return { path: dir, name: path.basename(root), primary: true }
  return {
    path: dir,
    name: path.relative(root, dir).split(path.sep).join('/'),
    primary: false,
  }
}

/** Order the rows: the primary checkout first, the rest by name ascending. */
function sortRepos(repos: RepoRef[]): RepoRef[] {
  return repos.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1
    if (a.name === b.name) return 0
    return a.name < b.name ? -1 : 1
  })
}
