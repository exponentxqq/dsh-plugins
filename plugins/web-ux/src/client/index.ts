/**
 * Browser half of dsh-plugin-web-ux: the provider badge in the composer status
 * row. It appends one entry to the `conversation.composer.dock` list slot —
 * the ambient row below the composer card that the official stats capsule
 * already occupies — and registers no host service, so the host face carries
 * every MCP concern.
 *
 * The entry is a static capsule: no click handler, no popover, no mutation of
 * any official seat. Its only data source is the per-session model directory
 * injected through the slot face.
 * @module dsh-plugin-web-ux/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer's ctx.slots merge (the renderer owns the slot
// registry) and ui-conversation's SlotMap merge (the composer dock key); the
// dock's session-scope standard props (sessionId) come from ui-session.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ProviderBadge, type ProviderBadgeInjected } from './ProviderBadge.tsx'

/** Required services: the slot registry and the per-session model directory. */
export const inject = ['slots', 'modelDirectories']

/**
 * The badge's seat in the dock: after the official stats capsule (`order: 0`)
 * and far enough below any plausible sibling that the two never interleave.
 */
export const BADGE_ORDER = 10

/**
 * Client plugin body: one status-row entry, registered through the slot
 * declaration so a shell without the dock simply never mounts it.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.composer.dock', () => {
    try {
      return ctx.slots.register(
        {
          name: 'conversation.composer.dock',
          id: 'web-ux-provider',
          order: BADGE_ORDER,
          inject: (): ProviderBadgeInjected => ({
            directoryFor: (sessionId: SessionId) => ctx.modelDirectories.directoryFor(sessionId),
          }),
        },
        ProviderBadge,
      )
    } catch {
      // A shell that rejects the entry keeps its official status row untouched.
      return () => {}
    }
  })
}
