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
 * Thin re-export (G4): the enumeration is the kernel's `workspaceRoots`, which
 * reads the registry through a structural port and imports no upstream DSH
 * type. The module augmentation import below is kept for the callers in this
 * package that still widen a cordis `Context` into that port.
 * @module dsh-plugin-project-mcp/host/roots
 */

import type {} from '@deepseek-ai/dsh-workspace'

export { workspaceRoots } from '@dsh-plugins/host-kit/roots'
