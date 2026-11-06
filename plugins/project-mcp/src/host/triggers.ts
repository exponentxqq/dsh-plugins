/**
 * The signals that invalidate a scan.
 *
 * Two things can change which servers exist without any file changing:
 *
 * - a primary root gains or loses an additional root (the multi-root
 *   registry), and
 * - a workspace is registered, moved, or removed (a durable domain change).
 *
 * Both are treated as pure triggers: the handler never reads the event payload,
 * and everything the rescan needs it re-reads from the registry itself.
 *
 * Thin re-export (G4): the installation logic (a trigger that cannot be
 * installed is skipped, never fatal) is the kernel's `installTriggers`; only
 * the context slice is kept as the kernel's structural `TriggerContext`, so no
 * upstream DSH type enters this package's trigger path.
 * @module dsh-plugin-project-mcp/host/triggers
 */

export { installTriggers } from '@dsh-plugins/host-kit/triggers'
export type { TriggerContext } from '@dsh-plugins/host-kit/triggers'
