/**
 * Session-to-workspace attribution: which workspace's project MCP servers one
 * session may see.
 *
 * A session is created in a directory (`cwd`), which is frequently a
 * subdirectory of the workspace — sometimes reached through a symlink. So
 * attribution walks from the session's own directory upward, canonicalizing
 * each level, and stops at the nearest level that IS one of the registered
 * roots. The workspace owning that root wins, and the session then sees every
 * server defined under that workspace's whole root set (its primary root and
 * the roots granted to it).
 *
 * Nothing matching means nothing is granted: the caller fails closed and hides
 * every project server.
 * @module dsh-plugin-project-mcp/host/attribution
 */

import path from 'node:path'
import type { WorkspaceRoots } from './types.ts'

/** The canonicalization seam (node:fs `realpath` in the host). */
export interface RealpathIo {
  /**
   * Canonicalize one path, resolving symlinks.
   * @param path - the path to canonicalize.
   * @returns the canonical absolute path.
   * @throws when the path does not exist.
   */
  realpath(path: string): Promise<string>
}

/** What one session's cwd was attributed to. */
export interface Attribution {
  /** The workspace that owns the nearest matching root. */
  readonly workspaceRoot: string
  /** The workspace's full root set, in registry spelling (the scan's own spelling). */
  readonly roots: readonly string[]
}

/** One canonical root and the workspace that owns it. */
interface CanonicalRoot {
  readonly canonical: string
  readonly workspaceRoot: string
}

/** Session-to-workspace attribution over the registered root sets. */
export class Attributor {
  /** Canonical root table (rebuilt on every root-set update). */
  private table: readonly CanonicalRoot[] = []
  /** The root sets themselves, in registry spelling. */
  private workspaces: readonly WorkspaceRoots[] = []

  /**
   * @param io - the canonicalization seam.
   */
  constructor(private readonly io: RealpathIo) {}

  /**
   * Rebuild the canonical root table from the current workspace root sets.
   *
   * A root that cannot be canonicalized (it does not exist right now) is left
   * out: attributing a session to a directory nobody can enter would be a
   * fiction, and the scan skipped that root for the same reason.
   * @param workspaces - the ordered root sets, exactly as scanned.
   */
  async update(workspaces: readonly WorkspaceRoots[]): Promise<void> {
    this.workspaces = workspaces
    const table: CanonicalRoot[] = []
    for (const workspace of workspaces) {
      for (const root of workspace.roots) {
        const canonical = await this.canonical(root)
        if (canonical !== undefined) table.push({ canonical, workspaceRoot: workspace.primaryRoot })
      }
    }
    this.table = table
  }

  /**
   * Attribute one session directory.
   * @param cwd - the session's creation directory (an absolute path).
   * @returns the attribution, or null when nothing claims the directory.
   */
  async attribute(cwd: string): Promise<Attribution | null> {
    if (cwd === '' || this.table.length === 0) return null
    let current = path.resolve(cwd)
    for (;;) {
      const canonical = await this.canonical(current)
      if (canonical !== undefined) {
        const hit = this.table.find((root) => root.canonical === canonical)
        if (hit !== undefined) return { workspaceRoot: hit.workspaceRoot, roots: this.rootsOf(hit.workspaceRoot) }
      }
      const parent = path.dirname(current)
      if (parent === current) return null
      current = parent
    }
  }

  /**
   * The root set of one workspace, in registry spelling.
   * @param workspaceRoot - the workspace's primary root.
   * @returns the workspace's roots (empty when the workspace disappeared).
   */
  private rootsOf(workspaceRoot: string): readonly string[] {
    return this.workspaces.find((workspace) => workspace.primaryRoot === workspaceRoot)?.roots ?? []
  }

  /**
   * Canonicalize one path, treating a failure as "not a root".
   * @param candidate - the path to try.
   * @returns the canonical path, or undefined.
   */
  private async canonical(candidate: string): Promise<string | undefined> {
    try {
      return await this.io.realpath(candidate)
    } catch {
      return undefined
    }
  }
}
