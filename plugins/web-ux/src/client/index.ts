/**
 * Browser half of dsh-plugin-web-ux.
 *
 * Two features share one entry:
 *
 * - The provider badge (unchanged) appends one static capsule to the
 *   `conversation.composer.dock` list slot, the ambient row below the composer
 *   card that the official stats capsule already occupies.
 * - The archived-session delete feature contributes two soft entries: the
 *   sidebar row menu item (`sidebar.workspaces.session.menu.item`, order 500,
 *   archived rows only) and its confirmation dialog (`shell.overlay`). The two
 *   talk through one in-plugin request store, because a slot's `inject.hooks`
 *   can only be supplied by the slot's declarer and a third-party entry cannot
 *   add one.
 *
 * Everything touching an upstream surface is soft: the badge and the menu item
 * register through `slots.inject` (a shell without the declaration simply never
 * mounts them), and `connection` / `workspaces` are read with `ctx.get` rather
 * than listed in the cordis `inject` contract — a shell missing either service
 * hides the delete entry only and leaves the badge untouched.
 *
 * @module dsh-plugin-web-ux/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer's ctx.slots merge (the renderer owns the slot
// registry), ui-conversation's SlotMap merge (the composer dock key), and
// ui-session's SessionStandardProps merge (sessionId on session-scope slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: the sidebar row-menu slot contract, plus the CLIENT faces that
// publish `ctx.locale` / `ctx.connection` / `ctx.workspaces` on the browser
// context. `shell.overlay`'s SlotMap merge rides DeleteSessionDialog.tsx.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ProviderBadge, type ProviderBadgeInjected } from './ProviderBadge.tsx'
import { DeleteSessionMenuItem } from './DeleteSessionMenuItem.tsx'
import { DeleteSessionDialog } from './DeleteSessionDialog.tsx'
import { createDeleteClient } from './delete-client.ts'
import { createDeleteRequestStore } from './delete-store.ts'
import { NS, en, zh } from './locales.ts'

/** Required services: the slot registry, the dictionaries, the model directory. */
export const inject = ['slots', 'locale', 'modelDirectories']

/**
 * The badge's seat in the dock: after the official stats capsule (`order: 0`)
 * and far enough below any plausible sibling that the two never interleave.
 */
export const BADGE_ORDER = 10

/** The delete row's slot id and order: after the shipped archive row (400). */
export const DELETE_MENU_ID = 'web-ux-delete-session'
export const DELETE_MENU_ORDER = 500

/** The confirmation dialog's overlay id and order. */
export const DELETE_DIALOG_ID = 'web-ux-delete-session-dialog'
export const DELETE_DIALOG_ORDER = 500

/**
 * Client plugin body: the status-row badge plus — when the shell provides the
 * connection and workspace services — the archived-session delete entries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // Dictionaries first: an entry that declares `locale: NS` renders through the
  // installed face and fails loud without one, and both delete entries declare it.
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'web-ux: dictionaries')

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

  // Soft reads, never hard `inject` entries: a shell without either service
  // loses the delete entry (and says so once in the log) but keeps the badge.
  const connection = ctx.get('connection')
  const workspaces = ctx.get('workspaces')
  if (connection === undefined || workspaces === undefined) {
    ctx.logger.warn(
      'web-ux: the connection or workspaces service is missing; the archived-session delete entry stays hidden',
    )
    return
  }

  const requests = createDeleteRequestStore()
  const client = createDeleteClient(connection)

  ctx.slots.inject('sidebar.workspaces.session.menu.item', () => {
    try {
      return ctx.slots.register(
        {
          name: 'sidebar.workspaces.session.menu.item',
          id: DELETE_MENU_ID,
          order: DELETE_MENU_ORDER,
          locale: NS,
          inject: () => ({ requests, archived: workspaces.list, client }),
        },
        DeleteSessionMenuItem,
      )
    } catch {
      // A shell without the row-menu seat simply shows no delete row.
      return () => {}
    }
  })

  ctx.slots.inject('shell.overlay', () => {
    try {
      return ctx.slots.register(
        {
          name: 'shell.overlay',
          id: DELETE_DIALOG_ID,
          order: DELETE_DIALOG_ORDER,
          locale: NS,
          inject: () => ({ requests, client }),
        },
        DeleteSessionDialog,
      )
    } catch {
      // A shell without the overlay seat keeps every other overlay untouched.
      return () => {}
    }
  })
}
