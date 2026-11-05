/**
 * Session-to-workspace attribution: which workspace's project MCP servers one
 * session may see.
 *
 * A session is created in a directory (`cwd`), frequently a subdirectory of a
 * workspace — sometimes reached through a symlink. So attribution walks from
 * the session's own directory upward, canonicalizing every level, and answers
 * with the workspace claiming the nearest matching root. Roots are indexed in
 * two tiers, which makes the rule "nearest level first, primary root within a
 * level":
 *
 * 1. Two rounds, primary before granted. A workspace's primary root is its own
 *    home; a root merely granted to another workspace is access to it, not
 *    ownership of it. A directory that is one workspace's home must therefore
 *    never be absorbed by a workspace that was granted that directory, however
 *    early the grantor is registered. Within one directory level the primary
 *    table is consulted first.
 * 2. The walk still stops at the nearest level. A root granted to a nearer
 *    workspace beats a primary root further up the tree; the tier order only
 *    decides between roots claiming the very same level.
 * 3. First write wins inside one tier. Each table is filled in registry order
 *    and a claim never overwrites: a doubly granted root stays with the first
 *    registrant, and a duplicate primary root (a registry anomaly) likewise
 *    stays with the first one. No de-duplication is added on purpose: a granted
 *    entry that restates a primary root is harmless, because the primary table
 *    is asked first.
 * 4. The answer keeps registry spelling. A hit is returned verbatim, with the
 *    winner's full root set exactly as scanned — never canonicalized — because
 *    the scan records `ServerSource.root` in registry spelling and visibility
 *    is matched against it (`serverNamesForRoots`); rewriting the roots would
 *    make every match fail.
 * 5. Fail closed. An empty `cwd`, an empty index, or no match all the way up to
 *    the filesystem root yields null, and the caller hides every project
 *    server.
 * 6. Soft dependency degradation. Without dsh-plugin-multi-root-workspace,
 *    every workspace has `roots = [primaryRoot]`, so the granted table stays
 *    empty and attribution is primary-only by construction — no special case.
 * 7. Known boundary with commonRoots. If shared roots are ever enabled, every
 *    workspace is granted the shared root and the granted round keeps its first
 *    write: the registry's first workspace claims it. That is the accepted
 *    consequence of rule 3, not a bug.
 * 8. Division of labour with the scan. `roots.ts` builds one ordered root set
 *    per workspace so that serverName conflicts are arbitrated in registry
 *    order; this module's tiers answer attribution only. The two must not be
 *    merged: a workspace still legitimately sees configurations under a root
 *    granted to it (opc must keep seeing a future config under the dotfiles
 *    root).
 * 9. Terminology. A workspace title is display-only; attribution is decided by
 *    path alone (the workspace titled `os` has primary path `/home/docker`).
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
  /**
   * The winner's primary root, in registry spelling: within one level a
   * primary root beats a granted root, across levels the nearest level wins.
   */
  readonly workspaceRoot: string
  /** The workspace's full root set, in registry spelling (the scan's own spelling). */
  readonly roots: readonly string[]
}

/** One root tier: a canonical root mapped to the answer claiming it. */
type RootTable = ReadonlyMap<string, Attribution>

/** The index one update commits; attribute() snapshots it once per call. */
interface RootIndex {
  readonly primary: RootTable
  readonly granted: RootTable
}

/** The index before any workspace is known. */
const EMPTY_INDEX: RootIndex = { primary: new Map(), granted: new Map() }

/** Session-to-workspace attribution over the registered root sets. */
export class Attributor {
  /** The committed index (rebuilt on every root-set update). */
  private index: RootIndex = EMPTY_INDEX

  /**
   * @param io - the canonicalization seam.
   */
  constructor(private readonly io: RealpathIo) {}

  /**
   * Rebuild the tiered root index from the current workspace root sets.
   *
   * Two rounds, both first-write-wins: primary roots first, then the additional
   * roots granted to each workspace. A root that cannot be canonicalized (it
   * does not exist right now) is left out: attributing a session to a directory
   * nobody can enter would be a fiction, and the scan skipped that root for the
   * same reason.
   * @param workspaces - the ordered root sets, exactly as scanned.
   */
  async update(workspaces: readonly WorkspaceRoots[]): Promise<void> {
    const claims = workspaces.map((workspace) => ({
      workspace,
      claim: { workspaceRoot: workspace.primaryRoot, roots: workspace.roots },
    }))
    const primary = new Map<string, Attribution>()
    const granted = new Map<string, Attribution>()
    // Round one: primary roots. A home outranks a grant, regardless of registry order.
    for (const { workspace, claim } of claims) await this.claim(primary, workspace.primaryRoot, claim)
    // Round two: granted roots. `roots[0]` is the primary root by contract.
    for (const { workspace, claim } of claims) {
      for (const root of workspace.roots.slice(1)) await this.claim(granted, root, claim)
    }
    // One assignment commits both tables: a concurrent attribute() never sees a half-built index.
    this.index = { primary, granted }
  }

  /**
   * Attribute one session directory.
   * @param cwd - the session's creation directory (an absolute path).
   * @returns the attribution, or null when nothing claims the directory.
   */
  async attribute(cwd: string): Promise<Attribution | null> {
    // One snapshot for the whole walk-up: a concurrent update() commits its
    // index atomically, so this call keeps answering from the old one.
    const { primary, granted } = this.index
    if (cwd === '' || (primary.size === 0 && granted.size === 0)) return null
    let current = path.resolve(cwd)
    for (;;) {
      const canonical = await this.canonical(current)
      if (canonical !== undefined) {
        const hit = primary.get(canonical) ?? granted.get(canonical)
        if (hit !== undefined) return hit
      }
      const parent = path.dirname(current)
      if (parent === current) return null
      current = parent
    }
  }

  /**
   * Record one candidate root in one tier, the first write winning.
   * @param table - the tier's table.
   * @param candidate - the root to canonicalize.
   * @param claim - the attribution to record on a first claim.
   */
  private async claim(table: Map<string, Attribution>, candidate: string, claim: Attribution): Promise<void> {
    const canonical = await this.canonical(candidate)
    if (canonical !== undefined && !table.has(canonical)) table.set(canonical, claim)
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
