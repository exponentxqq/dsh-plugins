/**
 * Workspace root enumeration: which directories the scan walks.
 *
 * The primary source is the workspace registry's own order — the order the
 * user sees in the sidebar — so conflict arbitration between workspaces is
 * decided by a durable fact rather than by scan timing. Each primary root then
 * takes the additional roots granted to it by the multi-root registry; that
 * service is a SOFT dependency, so its absence (plugin not installed, or not
 * active) degrades to primary-roots-only instead of failing the scan.
 * @module dsh-plugin-project-mcp/host/roots
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-workspace'
import type { MultiRootGrant, WorkspaceRoots } from './types.ts'

/**
 * Enumerate every workspace's ordered root set.
 * @param ctx - any host context (the caller's own fiber is fine).
 * @returns one entry per registered workspace, in registry order; empty when
 * the workspace registry is unavailable.
 */
export function workspaceRoots(ctx: Context): readonly WorkspaceRoots[] {
  const registry = ctx.get('workspaceRegistry')
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
