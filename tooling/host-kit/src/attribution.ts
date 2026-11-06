/**
 * Session-to-workspace attribution: which workspace's roots one session may see.
 *
 * Shared kernel (G4): dsh-plugin-project-mcp and dsh-plugin-user-commands walk a
 * session cwd upward with exactly these rules; their thin adapters decide what a
 * miss means (fail closed for project MCP, degraded keys for commands) and which
 * ladder they apply. Migrated from `plugins/project-mcp/src/host/attribution.ts`
 * with the `roots[0]` position assumption replaced by the #3 ruling (rule 10)
 * and the atomic-rebuild discipline (rule 11).
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
 * 5. The kernel reports walk-up facts; the caller owns the miss policy.
 *    `walkUp` returns `{ hit, canonicalCwd }` and never decides what "nothing
 *    claimed the directory" means. The project-MCP adapter maps a missing `hit`
 *    to null (fail closed); the command adapter may keep `canonicalCwd` as a
 *    degraded key. `RootAttributor.attribute` mirrors the fail-closed reading
 *    only as a convenience for callers that need exactly that.
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
 * 10. `primaryRoot` is the only authority; `roots[0]` is an expectation, not
 *     the contract (#3). `primaryRoot` always enters the primary tier. Every
 *     `roots` entry whose **value** differs from `primaryRoot` enters the
 *     granted tier in original order, including `roots[0]` when it is not the
 *     primary root. No root is ever dropped for a position assumption; the
 *     anomaly (`roots[0] !== primaryRoot`) is reported once through
 *     `RootIndexOptions.onAnomaly`. A duplicate `primaryRoot` registration
 *     stays with the first workspace (and is diagnosed): the returned root set
 *     always belongs to the winning workspace.
 * 11. The index rebuild is atomic. `buildRootIndex` fills fresh tables and
 *     `RootAttributor.update` commits them with one reference assignment; an
 *     `attribute()` call in flight keeps reading the previous complete
 *     snapshot and never observes a cleared or half-filled table — no caller's
 *     miss policy may fire because of a concurrent rescan.
 * @module @dsh-plugins/host-kit/attribution
 */

import path from 'node:path'

/** The canonicalization seam (node:fs `realpath` in the host). */
export interface RealpathPort {
  /**
   * Canonicalize one path, resolving symlinks.
   * @param candidate - the path to canonicalize.
   * @returns the canonical absolute path.
   * @throws when the path does not exist.
   */
  realpath(candidate: string): Promise<string>
}

/** One workspace's ordered root set. */
export interface WorkspaceRoots {
  /** The registered primary root (canonical), i.e. the workspace entity's path. */
  readonly primaryRoot: string
  /** The primary root first, then the roots granted to it, in grant order. */
  readonly roots: readonly string[]
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
export interface RootIndex {
  /** Canonical primary roots, in registry order (first write wins). */
  readonly primary: ReadonlyMap<string, Attribution>
  /** Canonical granted roots, in registry/grant order (first write wins). */
  readonly granted: ReadonlyMap<string, Attribution>
}

/** The index before any workspace is known. Never mutated. */
export const EMPTY_INDEX: RootIndex = { primary: new Map(), granted: new Map() }

/** Resolve one canonical path to the attribution claiming it, if any. */
export type RootLookup = (canonical: string) => Attribution | undefined

/** What one upward walk found. */
export interface WalkResult {
  /** The nearest claiming root's attribution; absent when nothing claimed the walk. */
  readonly hit?: Attribution
  /**
   * The canonical form of the cwd itself (not of an ancestor), when that level
   * canonicalized successfully. Adapters use it as their degraded key.
   */
  readonly canonicalCwd?: string
}

/** Diagnostics hook for registry anomalies the kernel refuses to hide. */
export interface RootIndexOptions {
  /**
   * Receives one line per registry anomaly (`roots[0] !== primaryRoot`,
   * duplicate `primaryRoot`). Never throws by contract of the caller.
   */
  readonly onAnomaly?: (message: string) => void
}

/**
 * Canonicalize one path, treating a failure as "not a root".
 * @param io - the canonicalization seam.
 * @param candidate - the path to try.
 * @returns the canonical path, or undefined.
 */
async function canonicalOf(io: RealpathPort, candidate: string): Promise<string | undefined> {
  try {
    return await io.realpath(candidate)
  } catch {
    return undefined
  }
}

/**
 * Build a complete tiered index from the current workspace root sets.
 *
 * Two rounds, both first-write-wins: primary roots first, then every root whose
 * value differs from its workspace's `primaryRoot`. A root that cannot be
 * canonicalized (it does not exist right now) is left out: attributing a
 * session to a directory nobody can enter would be a fiction, and the scan
 * skipped that root for the same reason.
 *
 * The returned tables are fresh; the caller commits them atomically. Anomalies
 * are reported through `options.onAnomaly` (rule 10) instead of being silently
 * absorbed.
 * @param workspaces - the ordered root sets, exactly as scanned.
 * @param io - the canonicalization seam.
 * @param options - anomaly sink.
 * @returns the new index (not yet committed anywhere).
 */
export async function buildRootIndex(
  workspaces: readonly WorkspaceRoots[],
  io: RealpathPort,
  options: RootIndexOptions = {},
): Promise<RootIndex> {
  const primary = new Map<string, Attribution>()
  const granted = new Map<string, Attribution>()

  // Round one: primary roots. A home outranks a grant, regardless of registry order.
  for (const workspace of workspaces) {
    const claim: Attribution = { workspaceRoot: workspace.primaryRoot, roots: workspace.roots }
    const canonical = await canonicalOf(io, workspace.primaryRoot)
    if (canonical === undefined) continue
    const existing = primary.get(canonical)
    if (existing !== undefined) {
      options.onAnomaly?.(
        `duplicate primary root ${canonical}: ${workspace.primaryRoot} loses to ${existing.workspaceRoot} (first write wins)`,
      )
      continue
    }
    primary.set(canonical, claim)
  }

  // Round two: every non-primary root, by value. `roots[0]` is expected to restate
  // the primary root; when it does not, that entry is a granted root, not a marker.
  for (const workspace of workspaces) {
    const claim: Attribution = { workspaceRoot: workspace.primaryRoot, roots: workspace.roots }
    if (workspace.roots[0] !== workspace.primaryRoot) {
      options.onAnomaly?.(
        `primary root ${workspace.primaryRoot} is not roots[0] (${JSON.stringify(workspace.roots[0])}); `
        + 'claiming it in the primary tier and the remaining roots in the granted tier, without dropping any root',
      )
    }
    for (const root of workspace.roots) {
      if (root === workspace.primaryRoot) continue
      const canonical = await canonicalOf(io, root)
      if (canonical !== undefined && !granted.has(canonical)) granted.set(canonical, claim)
    }
  }

  return { primary, granted }
}

/**
 * Turn one committed index into the lookup used by the walk.
 * @param index - the (immutable snapshot of the) committed index.
 * @returns the tiered lookup: primary first, granted second.
 */
export function lookupIn(index: RootIndex): RootLookup {
  return (canonical) => index.primary.get(canonical) ?? index.granted.get(canonical)
}

/**
 * Walk from one session directory upward, canonicalizing every level, and stop
 * at the nearest claiming root. The nearest level wins; within one level the
 * lookup applies the primary-before-granted tier order.
 * @param cwd - the session's creation directory (an absolute path); empty or
 *   undefined means "no directory", which yields no fact at all.
 * @param lookup - the tiered lookup built by `lookupIn`.
 * @param io - the canonicalization seam.
 * @returns the nearest hit and the cwd's own canonical form (when available).
 */
export async function walkUp(
  cwd: string | undefined,
  lookup: RootLookup,
  io: RealpathPort,
): Promise<WalkResult> {
  if (cwd === undefined || cwd === '') return {}
  const start = path.resolve(cwd)
  let current = start
  let canonicalCwd: string | undefined
  for (;;) {
    const canonical = await canonicalOf(io, current)
    // Only the cwd's own level feeds `canonicalCwd`; an ancestor's success does not.
    if (current === start) canonicalCwd = canonical
    if (canonical !== undefined) {
      const hit = lookup(canonical)
      if (hit !== undefined) {
        return canonicalCwd === undefined ? { hit } : { hit, canonicalCwd }
      }
    }
    const parent = path.dirname(current)
    if (parent === current) return canonicalCwd === undefined ? {} : { canonicalCwd }
    current = parent
  }
}

/** Session-to-workspace attribution over the registered root sets. */
export class RootAttributor {
  /** The committed index (rebuilt on every root-set update, replaced atomically). */
  private committed: RootIndex = EMPTY_INDEX

  /**
   * @param io - the canonicalization seam.
   * @param options - anomaly sink forwarded to every rebuild.
   */
  constructor(
    private readonly io: RealpathPort,
    private readonly options: RootIndexOptions = {},
  ) {}

  /**
   * Rebuild the index from scratch and commit it with one assignment.
   * @param workspaces - the ordered root sets, exactly as scanned.
   */
  async update(workspaces: readonly WorkspaceRoots[]): Promise<void> {
    // Rule 11: build first, then swap. A concurrent attribute() keeps the old snapshot.
    const next = await buildRootIndex(workspaces, this.io, this.options)
    this.committed = next
  }

  /**
   * The currently committed index (a stable snapshot between updates).
   * @returns the committed index.
   */
  index(): RootIndex {
    return this.committed
  }

  /**
   * Attribute one session directory with fail-closed miss semantics.
   *
   * The snapshot is captured once, before any await: a concurrent `update()`
   * commits a whole new index but never changes the tables this call reads.
   * @param cwd - the session's creation directory (an absolute path).
   * @returns the attribution, or null when nothing claims the directory.
   */
  async attribute(cwd: string | undefined): Promise<Attribution | null> {
    const snapshot = this.committed
    if (cwd === undefined || cwd === '') return null
    if (snapshot.primary.size === 0 && snapshot.granted.size === 0) return null
    const { hit } = await walkUp(cwd, lookupIn(snapshot), this.io)
    return hit ?? null
  }
}
