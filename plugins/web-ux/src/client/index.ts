/**
 * Browser half of dsh-plugin-web-ux.
 *
 * Three features share one entry:
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
 * - The command-result notice feature bridges the browser-local
 *   `command/executed` event into one in-plugin notice store and mounts a
 *   dismissible card on `conversation.input.overlay` (order 10, behind the
 *   official command popup at order 1) — the fallback surface for results with
 *   nowhere to render (empty-session welcome view). The card reads the
 *   main-view retain count per session (`sessions.retainInfo`) and hides
 *   itself the moment the session view (transcript) is open.
 *
 * Everything touching an upstream surface is soft: all entries register
 * through `slots.inject` (a shell without the declaration simply never mounts
 * them), the event bridge and `sessions` are read defensively (a shell without
 * either degrades to "no notice card" / "no auto-hide"), and `connection` /
 * `workspaces` are read with `ctx.get` **inside the inject faces** — never at
 * apply time, because the web shell provides `workspaces` after its remote
 * gateway is ready. A shell missing either service hides the delete entry only
 * and leaves the badge and the notice card untouched.
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
// Type-only: the `command/executed` event name on the cordis Events merge.
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ProviderBadge, type ProviderBadgeInjected } from './ProviderBadge.tsx'
import { DeleteSessionMenuItem, type DeleteMenuItemInjected } from './DeleteSessionMenuItem.tsx'
import { DeleteSessionDialog, type DeleteDialogInjected } from './DeleteSessionDialog.tsx'
import { CommandNoticeCard, type CommandNoticeInjected } from './CommandNoticeCard.tsx'
import { createNoticeStore } from './notice-store.ts'
import { projectCountSource } from './notice-visibility.ts'
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
 * The notice card's seat in the composer overlay: behind the official command
 * popup (`order: 1`) so the two never fight for the same sight line.
 */
export const NOTICE_ID = 'web-ux-command-notice'
export const NOTICE_ORDER = 10

/** 按任意键名软读一个服务（形状由调用方防御式对待；同 multi-root 的 readService）。 */
function readService(ctx: ClientContext, name: string): unknown {
  const reader = ctx as unknown as { get(key: string): unknown }
  try {
    return reader.get(name)
  } catch {
    return undefined
  }
}

/**
 * Client plugin body: the status-row badge, the archived-session delete entries
 * (when the shell provides the connection and workspace services), and the
 * command-result notice card (when the shell emits command executions).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // Dictionaries first: an entry that declares `locale: NS` renders through the
  // installed face and fails loud without one, and every styled entry declares it.
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

  // 命令结果通知：浏览器本地事件桥 + composer 浮层通知卡。事件名是上游公共面
  // （dsh-session-log-export 同款消费）；注册与监听都软包——没有命令面的壳只是
  // 少这个能力，绝不会影响命令执行本身（上游对监听器异常也有兜底）。丢弃载荷
  // 的诊断走 ctx.logger（缺席时静默）。
  const notices = createNoticeStore((message) => {
    try {
      ctx.logger?.warn(`web-ux: ${message}`)
    } catch {
      // logger 缺席时丢弃诊断，不影响通知功能。
    }
  })

  try {
    ctx.on('command/executed', (sessionId, commandName, result) => {
      notices.offer(sessionId, commandName, result)
    })
  } catch {
    // 事件面缺席（极端裁剪的壳）：无通知卡，其余能力不受影响。
  }

  ctx.slots.inject('conversation.input.overlay', () => {
    try {
      return ctx.slots.register(
        {
          name: 'conversation.input.overlay',
          id: NOTICE_ID,
          order: NOTICE_ORDER,
          locale: NS,
          inject: (): CommandNoticeInjected => ({
            notices,
            // 可见性源在渲染期解析：sessions 服务按 unknown 软读（同 multi-root
            // 的 readService），形状不符返回 undefined，卡片跳过隐藏检查。
            visibilityFor: (sessionId: string) => {
              try {
                const sessions = readService(ctx, 'sessions') as { retainInfo?: (id: string) => unknown } | undefined
                return projectCountSource(sessions?.retainInfo?.(sessionId)) ?? undefined
              } catch {
                return undefined
              }
            },
          }),
        },
        CommandNoticeCard,
      )
    } catch {
      // A shell without the composer overlay seat simply shows no notice card.
      return () => {}
    }
  })

  // The two delete entries resolve `connection` / `workspaces` in their inject
  // faces, i.e. at render time, not here: the web shell provides `workspaces`
  // only after its remote gateway is ready, which is later than this plugin's
  // `apply`. An apply-time `ctx.get` would therefore read `undefined` and lose
  // the entries forever, while the badge — unaffected by those services — keeps
  // working. Reading late also preserves the soft-degradation contract: a shell
  // that never provides them renders neither entry and nothing breaks.
  const requests = createDeleteRequestStore()

  ctx.slots.inject('sidebar.workspaces.session.menu.item', () => {
    try {
      return ctx.slots.register(
        {
          name: 'sidebar.workspaces.session.menu.item',
          id: DELETE_MENU_ID,
          order: DELETE_MENU_ORDER,
          locale: NS,
          inject: (): DeleteMenuItemInjected => {
            const workspaces = ctx.get('workspaces')
            return { requests, archived: workspaces?.list }
          },
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
          inject: (): DeleteDialogInjected => {
            const connection = ctx.get('connection')
            return { requests, client: connection === undefined ? undefined : createDeleteClient(connection) }
          },
        },
        DeleteSessionDialog,
      )
    } catch {
      // A shell without the overlay seat keeps every other overlay untouched.
      return () => {}
    }
  })
}
