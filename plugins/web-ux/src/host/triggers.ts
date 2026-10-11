/**
 * The signals that invalidate a scan.
 *
 * Two things can change which servers exist without any file changing:
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
 * @module dsh-plugin-web-ux/host/triggers
 */

import type { MultiRootGrant } from './types.ts'

/** The context slice trigger installation touches. */
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
      disposers.push(grant.onChange(() => rescan()))
    } catch {
      // The registry is present but not subscribable in this build; the
      // domain trigger below still covers durable changes.
    }
  }

  try {
    disposers.push(ctx.on('domain/changed', () => rescan()))
  } catch {
    // No event bus for this event: `/mcp-reload` remains the fallback.
  }

  return disposers
}
