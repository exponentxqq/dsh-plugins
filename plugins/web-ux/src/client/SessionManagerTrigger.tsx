/**
 * 会话管理面的全局入口：侧栏底部动作区（`sidebar.footer.action`）里的一颗按钮。
 *
 * 座位由 ui-sidebar 声明（list / root），交给 occupant 的只有几何份额 `wide`：宽栏渲染
 * 「图标 + 文案」的整行按钮，侧栏折叠成 56px 轨道时只留图标；`aria-label` 在两种形态下
 * 恒取 `t('manager.action')`——折叠态没有可见文案，它是这颗按钮唯一的可访问名。
 *
 * 入口本身不做任何判据、也不持有任何状态：宿主通道未就绪（`ready === false`）时整颗
 * 入口 `return null`，不留一颗点了没反应的死按钮；点击只是往跨 entry 的
 * `ManagerRequestStore` 登记一次「打开管理浮层」的请求（无载荷、无参数），浮层在
 * `shell.overlay` 上订阅同一个 store 并据此挂载。过滤、选择、批量判据全部留在 model。
 *
 * 座位 props 直接取上游声明：owner 份额是 ui-sidebar 直出的
 * `SidebarFooterActionOwnerProps`（`{ wide: boolean }`）。声明方是本包
 * devDependency，座位契约与 props 类型都由它的声明提供，本文件只做 type-only
 * 引用、不增补任何类型表。
 *
 * @module dsh-plugin-web-ux/client/SessionManagerTrigger
 */

import type { ReactNode } from 'react'
import { IconChecklistOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only：座位契约（`sidebar.footer.action` 的座位声明在 client 入口，
// owner props 也由它直出）；注册面仍会按真实座位校验 props 的可赋值性。
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { NS } from './locales.ts'
import type { ManagerRequestStore } from './session-manager-store.ts'
import css from './session-manager.module.css'

/**
 * 本 entry 的注入面。`ready` 在渲染期才解析（connection 服务可能晚于插件 `apply`
 * 就绪）：为 false 时入口整体不渲染。
 */
export interface SessionManagerTriggerInjected {
  /** 跨 entry 的打开请求 store（只用到写入面）。 */
  readonly requests: Pick<ManagerRequestStore, 'request'>
  /** connection 是否可用；false 时整颗入口不渲染（没有通道就没有管理面）。 */
  readonly ready: boolean
}

/**
 * 完整 props：座位的 owner 份额（ui-sidebar 直出的 `SidebarFooterActionOwnerProps`）、
 * 本命名空间的 `t` 与注入面。
 */
export type SessionManagerTriggerProps = SidebarFooterActionOwnerProps
  & PropsLocale<typeof NS>
  & SessionManagerTriggerInjected

/**
 * 侧栏底部的会话管理入口。服务未就绪时不渲染任何 DOM。
 * @param props - 座位几何份额、打开请求 store、就绪标记与 `t`。
 * @returns 宽栏为图标 + 文案整行按钮、折叠栏为图标按钮；未就绪时为 `null`。
 */
export function SessionManagerTrigger({
  wide,
  requests,
  ready,
  t,
}: SessionManagerTriggerProps): ReactNode {
  // 软降级：没有宿主通道时管理面无从谈起，静默不渲染而不是画一颗禁用按钮。
  if (!ready) return null

  return (
    <button
      type="button"
      className={css.trigger}
      // 折叠态只剩图标，这颗可访问名是宽窄两形态的共同底线，恒给。
      aria-label={t('manager.action')}
      onClick={() => {
        // 只登记「请打开」：不传目标、不做判定，浮层自己派生一切。
        requests.request()
      }}
    >
      <IconChecklistOutlineRegular />
      {wide && <span className={css.triggerLabel}>{t('manager.action')}</span>}
    </button>
  )
}
