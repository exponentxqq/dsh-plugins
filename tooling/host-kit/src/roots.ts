/**
 * Workspace root enumeration: which directories the scan walks.
 *
 * The primary source is the workspace registry's own order — the order the
 * user sees in the sidebar — so conflict arbitration between workspaces is
 * decided by a durable fact rather than by scan timing. Each primary root then
 * takes the additional roots granted to it by the multi-root registry; that
 * service is a SOFT dependency, so its absence (plugin not installed, or not
 * active) degrades to primary-roots-only instead of failing the scan.
 *
 * Migrated from `plugins/project-mcp/src/host/roots.ts` with the host context
 * replaced by a structural port: the kernel must not import upstream DSH types
 * (H6). The port declares exactly the two services this module reads.
 * @module @dsh-plugins/host-kit/roots
 */

import type { WorkspaceRoots } from './attribution.ts'
import type { MultiRootGrant } from './triggers.ts'

/**
 * The workspace registry slice this module reads.
 *
 * Structural on purpose: upstream's workspace service type has more members,
 * and the host context satisfies this shape without a cast at the
 * call site (the context itself is widened to {@link RootEnumeratorContext}).
 */
export interface RootRegistryPort {
  /**
   * Every registered workspace, in registry order.
   * @returns the workspace entities (only `path` is read).
   */
  list(): readonly { readonly path: string }[]
}

/** The context slice root enumeration reads (a structural port). */
export interface RootEnumeratorContext {
  /**
   * Read one service from the context.
   * @param name - the service name.
   * @returns the service, or undefined when absent.
   */
  get(name: string): unknown
}

/**
 * Enumerate every workspace's ordered root set.
 * @param ctx - any host context (the caller's own fiber is fine).
 * @returns one entry per registered workspace, in registry order; empty when
 * the workspace registry is unavailable.
 */
export function workspaceRoots(ctx: RootEnumeratorContext): readonly WorkspaceRoots[] {
  const registry = ctx.get('workspaceRegistry') as RootRegistryPort | undefined
  if (registry === undefined) return []
  const grant = ctx.get('multiRootRegistry') as MultiRootGrant | undefined

  return registry.list().map((workspace) => {
    const granted = grant?.granted(workspace.path) ?? []
    const roots = [workspace.path]
    for (const root of granted) {
      // `granted` may restate the primary root; the primary is already first,
      // and a root is never scanned twice.
      if (!roots.includes(root)) roots.push(root)
    }
    return { primaryRoot: workspace.path, roots }
  })
}
