/**
 * dsh-plugin-web-ux 的浏览器半装配。
 *
 * 四项 Web 界面体验共用一个入口：
 *
 * - **Provider 徽章**（不变）：向 `conversation.composer.dock` 追加一枚静态胶囊；
 * - **删除已归档会话**：两个软注册——侧栏行菜单项（`sidebar.workspaces.session.menu.item`，
 *   order 500，仅已归档行）与确认弹窗（`shell.overlay`，order 500）。两者通过插件内的
 *   删除请求 store 通信：slot 的 `inject.hooks` 只能由声明方提供，第三方 entry 无法新增；
 * - **会话管理**：作为统一「工作区配置」弹窗的一个**分节**贡献
 *   （`workspace-config.section`，order 30），由 holder 的 `shell.overlay` 统一弹窗渲染。
 *   分节只做三 tab / 五阶段的管理面本体，打开与关闭都由 holder 拥有；本包不再注册
 *   侧栏 footer 入口或独立浮层（旧的两条 entry 与打开桥已删除）；
 * - **命令结果通知**：把浏览器本地 `command/executed` 事件桥进通知 store，并在
 *   `conversation.input.overlay`（order 10，官方命令弹层 order 1 之后）挂一张可关闭卡片。
 *
 * 一切接触上游的面都是软的：entry 全部经 `slots.inject` 注册（没有座位声明就永不挂载），
 * 事件桥与 `sessions` 防御式读取（缺事件面 / 缺服务分别退化成「没有通知卡」/「不自动隐藏」），
 * `connection` / `workspaces` / `sessions` 在**注入面（渲染期）**才 `ctx.get`，绝不在 apply 期
 * 读取——web 壳的 `workspaces` 要等 remote 网关就绪后才 provide，apply 期读会永久丢掉对应
 * entry。任一项缺席只隐藏受影响的能力，徽章与其它 entry 不受影响。
 *
 * 分节注册采用「贡献方统一形状」（code-design ③3.2）：
 * `slots.inject(SECTION_SEAT, () => register({ name, id, order, label thunk, locale, inject }))`，
 * 失败只 warn、不影响其它注册。`dsh-plugin-workspace-config` 只以 `import type` 消费
 * （devDependency + 类型断言），**不**写进 `dsh.client.inject`：四包之间只有编译期类型依赖，
 * 没有运行时加载边（D3）。
 *
 * @module dsh-plugin-web-ux/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 类型专用：拉 renderer 的 `ctx.slots`、ui-conversation 的 composer 座位、ui-session 的
// session 作用域 props 与 ui-commands 的 `command/executed` 事件声明。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// 类型专用：侧栏行菜单座位（`sidebar.workspaces.session.menu.item`）与
// `ctx.locale` / `ctx.connection` / `ctx.workspaces` 的客户端 face。
// `shell.overlay` 的 SlotMap 增补随 DeleteSessionDialog.tsx 进入本程序。
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
// 类型专用：`command/executed` 事件名在 cordis Events 上的增补。
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// 类型专用：统一「工作区配置」分节的座位增补与 owner 份额类型（仅编译期，运行时零产物）。
import type {} from 'dsh-plugin-workspace-config/client'
import type { WorkspaceConfigSectionSeat } from 'dsh-plugin-workspace-config/client'
import { ProviderBadge, type ProviderBadgeInjected } from './ProviderBadge.tsx'
import { DeleteSessionMenuItem, type DeleteMenuItemInjected } from './DeleteSessionMenuItem.tsx'
import { DeleteSessionDialog, type DeleteDialogInjected } from './DeleteSessionDialog.tsx'
import { CommandNoticeCard, type CommandNoticeInjected } from './CommandNoticeCard.tsx'
import { createNoticeStore } from './notice-store.ts'
import { projectCountSource } from './notice-visibility.ts'
import { createDeleteClient, createSessionManagerClient } from './delete-client.ts'
import { createDeleteRequestStore } from './delete-store.ts'
import {
  SessionManagerSection,
  type SessionManagerSectionInjected,
  type SessionsSource,
} from './SessionManagerDialog.tsx'
import { NS, en, zh } from './locales.ts'

/** 必需的客户端服务：座位注册表、字典与模型目录。 */
export const inject = ['slots', 'locale', 'modelDirectories']

/**
 * 徽章在 dock 座位里的顺序：官方统计胶囊（order 0）之后，且离任何合理兄弟足够远，
 * 两者不会交错。
 */
export const BADGE_ORDER = 10

/** 删除行菜单的座位 id 与顺序：官方归档行（400）之后。 */
export const DELETE_MENU_ID = 'web-ux-delete-session'
export const DELETE_MENU_ORDER = 500

/** 删除确认弹窗的浮层 id 与顺序。 */
export const DELETE_DIALOG_ID = 'web-ux-delete-session-dialog'
export const DELETE_DIALOG_ORDER = 500

/**
 * 通知卡在 composer 浮层里的顺序：官方命令弹层（order 1）之后，两者不抢同一视线。
 */
export const NOTICE_ID = 'web-ux-command-notice'
export const NOTICE_ORDER = 10

/**
 * 会话管理分节的座位名。
 *
 * 贡献方各持一份字面量、由 `WorkspaceConfigSectionSeat` 做类型断言（D3）；
 * `dsh-plugin-workspace-config` 只出现在编译期，不进 bundle。
 */
export const SECTION_SEAT: WorkspaceConfigSectionSeat = 'workspace-config.section'

/**
 * 分节 entry id：沿用旧浮层 id（`web-ux-session-manager`），让日志、断言与排障话术
 * 保持连续；id 只在座位内唯一，跨座位无冲突。
 */
export const SECTION_ID = 'web-ux-session-manager'

/** 分节在统一弹窗 nav 中的顺序：Folders 10 / 工作区默认档 20 / 会话管理 30。 */
export const SECTION_ORDER = 30

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
 * 客户端插件主体：状态行徽章、已归档会话删除面、会话管理分节与命令结果通知卡。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  // 字典先行：声明 `locale: NS` 的 entry 经已安装的 face 渲染，缺字典会 fail loud。
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
      // 壳拒绝这个 entry 时，官方状态行保持原样。
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
      // 没有 composer 浮层座位的壳只是不显示通知卡。
      return () => {}
    }
  })

  // 删除面与它会话管理分节的两个注入面都在渲染期解析 `connection` / `workspaces` /
  // `sessions`：web 壳的工作区服务晚于本插件 `apply` 就绪，apply 期读取会把入口永久
  // 弄丢。晚读同时保住软降级契约——永远不提供这些服务的壳既不渲染入口也不报错。
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
      // 没有行菜单座位的壳只是不显示删除行。
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
      // 没有浮层座位的壳保持其它浮层不受影响。
      return () => {}
    }
  })

  // 会话管理分节（统一「工作区配置」弹窗的第三项，order 30）。holder 在注册
  // `shell.overlay` 时以 `children` 声明 `workspace-config.section`；本包的
  // `slots.inject` 在座位就绪前只登记，就绪后由框架补跑。label 用 thunk：
  // locale 切换时 nav 重新求值，不需要重注册。
  const t = ctx.locale.bind(NS)

  ctx.slots.inject(SECTION_SEAT, () => {
    try {
      return ctx.slots.register(
        {
          name: SECTION_SEAT,
          id: SECTION_ID,
          order: SECTION_ORDER,
          label: () => t('section.label'),
          locale: NS,
          inject: (): SessionManagerSectionInjected => {
            const connection = ctx.get('connection')
            return {
              client: connection === undefined ? undefined : createSessionManagerClient(connection),
              workspaces: ctx.get('workspaces'),
              // sessions 在客户端 Context 的服务类型表里没有声明（只经 ui-session
              // 传递可达），与通知卡同款 unknown 软读后按分节的结构式声明收敛。
              sessions: readService(ctx, 'sessions') as SessionsSource | undefined,
            }
          },
        },
        SessionManagerSection,
      )
    } catch (error) {
      // 分节座位被拒绝时只丢这一节，徽章、删除面与通知卡不受影响。
      ctx.logger?.warn('web-ux: 会话管理分节注册失败，本节不显示', error)
      return () => {}
    }
  })
}
