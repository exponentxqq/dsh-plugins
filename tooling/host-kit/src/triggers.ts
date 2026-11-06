/**
 * The signals that invalidate a scan.
 *
 * Two things can change which configuration exists without any file changing:
 *
 * - a primary root gains or loses an additional root (the multi-root
 *   registry), and
 * - a workspace is registered, moved, or removed (a durable domain change).
 *
 * Both are treated as pure triggers. The handler never reads the event payload
 * — the payload's exact shape is a private detail of whichever subsystem
 * emitted it, and everything the rescan needs it re-reads from the registry
 * itself. That is also why a `domain/changed` for an unrelated domain is
 * harmless: the rescan is declarative and idempotent.
 *
 * Migrated from `plugins/project-mcp/src/host/triggers.ts:48-67`; the context
 * is a structural port, so the kernel imports no upstream DSH type.
 * @module @dsh-plugins/host-kit/triggers
 */

/**
 * The additional-root enumerator the host halves soft-depend on (provided by
 * dsh-plugin-multi-root-workspace). Absent — that plugin is not installed or
 * not active — the scan simply sees each workspace's primary root alone.
 */
export interface MultiRootGrant {
  /**
   * The canonical paths of every usable root granted to one primary root.
   * @param primaryRoot - the session workspace root (any spelling).
   * @returns the granted roots, in registry order.
   */
  granted(primaryRoot: string): readonly string[]
  /**
   * Observe registry changes.
   * @param listener - called with the canonical primary root after each durable change.
   * @returns the disposer that stops observing.
   */
  onChange(listener: (primaryRoot: string) => void): () => void
}

/** The context slice trigger installation touches (a structural port). */
export interface TriggerContext {
  /**
   * Read one service from the context.
   * @param name - the service name.
   * @returns the service, or undefined when absent.
   */
  get(name: string): unknown
  /**
   * Subscribe to a host event.
   * @param event - the event name.
   * @param listener - the trigger.
   * @returns the disposer that stops listening.
   */
  on(event: 'domain/changed', listener: () => void): () => void
}

/**
 * Install the rescan triggers.
 *
 * A trigger that cannot be installed (its service is absent, or its
 * subscription fails) is simply skipped: the remaining triggers and the manual
 * command still work, so losing one signal degrades freshness rather than the
 * feature.
 * @param ctx - the context slice to subscribe on.
 * @param rescan - the rescan to run.
 * @returns one disposer per installed trigger.
 */
export function installTriggers(ctx: TriggerContext, rescan: () => void): readonly (() => void)[] {
  const disposers: (() => void)[] = []

  const grant = ctx.get('multiRootRegistry') as MultiRootGrant | undefined
  if (grant !== undefined) {
    try {
      // The payload is deliberately ignored (see the module docblock).
      disposers.push(grant.onChange(() => rescan()))
    } catch {
      // The registry is present but not subscribable in this build; the
      // domain trigger below still covers durable changes.
    }
  }

  try {
    disposers.push(ctx.on('domain/changed', () => rescan()))
  } catch {
    // No event bus for this event: the manual reload command remains the fallback.
  }

  return disposers
}
