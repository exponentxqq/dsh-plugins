/**
 * Browser half of dsh-plugin-web-ux.
 *
 * Four features share one entry:
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
 * - The session-manager feature contributes two more soft entries bridged by
 *   one in-plugin request store (the same pattern as the delete pair): a
 *   footer action in the sidebar (`sidebar.footer.action`, order 100) and its
 *   dialog on `shell.overlay` (order 520, behind the delete dialog's 500 so
 *   the two never show together).
 *
 * Everything touching an upstream surface is soft: all entries register
 * through `slots.inject` (a shell without the declaration simply never mounts
 * them), the event bridge and `sessions` are read defensively (a shell without
 * either degrades to "no notice card" / "no auto-hide"), and `connection` /
 * `workspaces` / `sessions` are read with `ctx.get` **inside the inject
 * faces** — never at apply time, because the web shell provides `workspaces`
 * only after its remote gateway is ready. A shell missing one of them hides the
 * affected entry only — the manager trigger without `connection`, the manager
 * dialog's list without `workspaces` / `sessions` — and leaves the badge and
 * every other entry untouched.
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
// Type-only: ui-sidebar's SlotMap merge — the `sidebar.footer.action` seat this
// module registers into (the entry's own props ride SessionManagerTrigger.tsx).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
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
import { createDeleteClient, createSessionManagerClient } from './delete-client.ts'
import { createDeleteRequestStore } from './delete-store.ts'
import { SessionManagerTrigger, type SessionManagerTriggerInjected } from './SessionManagerTrigger.tsx'
import {
  SessionManagerDialog,
  type SessionManagerDialogInjected,
  type SessionsSource,
} from './SessionManagerDialog.tsx'
import { createManagerRequestStore } from './session-manager-store.ts'
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

/**
 * The session-manager trigger's seat in the sidebar footer: after the shipped
 * foot controls (the sidebar sorts a list slot by `order`).
 */
export const MANAGER_TRIGGER_ID = 'web-ux-session-manager-trigger'
export const MANAGER_TRIGGER_ORDER = 100

/**
 * The session-manager dialog's overlay id and order: behind the delete dialog
 * (`order: 500`) so the two never show together.
 */
export const MANAGER_OVERLAY_ID = 'web-ux-session-manager'
export const MANAGER_OVERLAY_ORDER = 520

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

  // 会话管理面与删除面同构：入口（侧栏底部）与浮层（shell 层）是两个独立 entry，
  // 通过一个请求 store 桥接——slot 的 inject.hooks 只能由声明方提供，第三方无法新增
  // （D7）。三个服务一律在注入面（渲染期）解析，理由同上方删除面：web 壳的工作区 /
  // 会话服务晚于本插件 `apply` 就绪，apply 期读取会把入口永久弄丢（D18）。连接通道
  // 缺席只藏入口、浮层静默；工作区或会话快照缺席时浮层保留「服务未就绪」空态，让
  // 用户看到解释而不是什么都没有。
  const managerRequests = createManagerRequestStore()

  ctx.slots.inject('sidebar.footer.action', () => {
    try {
      return ctx.slots.register(
        {
          name: 'sidebar.footer.action',
          id: MANAGER_TRIGGER_ID,
          order: MANAGER_TRIGGER_ORDER,
          locale: NS,
          inject: (): SessionManagerTriggerInjected => ({
            requests: managerRequests,
            // 渲染期解析：connection 可能晚于 apply 就绪；缺席时入口整颗不渲染。
            ready: ctx.get('connection') !== undefined,
          }),
        },
        SessionManagerTrigger,
      )
    } catch {
      // A shell without the footer-action seat simply shows no manager entry.
      return () => {}
    }
  })

  ctx.slots.inject('shell.overlay', () => {
    try {
      return ctx.slots.register(
        {
          name: 'shell.overlay',
          id: MANAGER_OVERLAY_ID,
          order: MANAGER_OVERLAY_ORDER,
          locale: NS,
          inject: (): SessionManagerDialogInjected => {
            const connection = ctx.get('connection')
            return {
              requests: managerRequests,
              client: connection === undefined ? undefined : createSessionManagerClient(connection),
              workspaces: ctx.get('workspaces'),
              // sessions 在客户端 Context 的服务类型表里没有声明（只经 ui-session
              // 传递可达），与通知卡同款 unknown 软读后按浮层的结构式声明收敛。
              sessions: readService(ctx, 'sessions') as SessionsSource | undefined,
            }
          },
        },
        SessionManagerDialog,
      )
    } catch {
      // A shell without the overlay seat keeps every other overlay untouched.
      return () => {}
    }
  })
}
