/**
 * 统一「工作区配置」的唯一入口：侧栏底部动作区（`sidebar.footer.action`）里的一颗按钮。
 *
 * 座位由 ui-sidebar 声明（list / root），交给 occupant 的只有几何份额 `wide`：宽栏渲染
 * 「图标 + 文案」的行内按钮，侧栏折叠成 56px 轨道时退化成 28px 方形图标按钮。两个形态
 * 的几何纪律（D6）：
 *
 * - **宽态**：`flex: 1 1 auto; min-width: 0`——入口只占行内可伸缩份额，与同列其它占用者
 *   （官方底部控件、将来的 cordis badge）共存；文案在剩余宽度内用省略号截断。
 * - **折叠态**：固定 `28px` 方形图标。宿主折叠轨内容宽只有 32px（56px 轨减两侧 12px
 *   内边距），28px 留出安全余量；**不用 36px**（会越界靠裁切「看起来还行」）。
 * - **禁止**整行独占：不写 `flex:none`（不可缩，会把同列其它入口挤成残条——R5 的根因），
 *   也不写 `width: calc(100% + 4px)` 那类越过容器内边距的整行宽。
 *
 * `aria-label` 在两态下**恒取** `t('entry.label')`：折叠态没有可见文案，它是这颗按钮
 * 唯一的可访问名；宽态的可见文案与可访问名同文，读屏不会重复。`aria-haspopup="dialog"`
 * 与 `aria-expanded`（绑打开桥的布尔快照）让辅助技术知道它开的是模态弹窗、当前开合状态
 * 如何——`aria-expanded` 跟着 store 走，意味着从弹窗内部关闭后入口的可访问状态也同步复位。
 *
 * 入口本身不做任何判据、也不持有任何状态（D5：**恒在**，零分节也渲染，空态在弹窗内解释）。
 * 点击只向打开桥登记一次「请打开」；弹窗在 `shell.overlay` 上订阅同一个 store 并据此挂载。
 *
 * @module dsh-plugin-workspace-config/client/WorkspaceConfigTrigger
 */

import { useSyncExternalStore, type ReactNode } from 'react'
import { IconWorkspaceTreeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// 类型专用：`sidebar.footer.action` 的 SlotMap 声明与 owner 份额（`{ wide }`）由它直出。
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { WorkspaceConfigOpenStore } from './open-store.ts'
import { NS } from './locales.ts'
import css from './dialog.module.css'

/** 本 entry 的注入面：打开桥（入口只用到写入面，但把完整面给组件便于读开合快照）。 */
export interface WorkspaceConfigTriggerInjected {
  /** 跨 entry 的打开桥（弹窗订阅同一个实例）。 */
  readonly open: WorkspaceConfigOpenStore
}

/**
 * 完整 props：座位的几何份额（ui-sidebar 直出的 `SidebarFooterActionOwnerProps`）、
 * 本命名空间的 `t` 与注入面。
 */
export type WorkspaceConfigTriggerProps = SidebarFooterActionOwnerProps
  & PropsLocale<typeof NS>
  & WorkspaceConfigTriggerInjected

/**
 * 侧栏底部的统一入口（宽栏整行 / 折叠栏方形图标）。
 * @param props - 座位几何份额、命名空间翻译与打开桥。
 * @returns 原生 `button`；两态都带可访问名，点击只请求打开。
 */
export function WorkspaceConfigTrigger({ wide, open, t }: WorkspaceConfigTriggerProps): ReactNode {
  // 快照是布尔基本值，identity 天然稳定；订阅只为让 `aria-expanded` 随开合翻转。
  const expanded = useSyncExternalStore(open.subscribe, open.getSnapshot, open.getSnapshot)

  return (
    <button
      type="button"
      // 两态共用基础类，另加一个形态类：宽态/折叠态的几何差异全部由类名区分，
      // 不依赖 `:has()` 之类由 DOM 结构反向推导的脆弱选择器。
      className={wide ? `${css.trigger} ${css.triggerWide}` : `${css.trigger} ${css.triggerRail}`}
      // 折叠态没有可见文案，这是两态共同的可访问名底线，恒给。
      aria-label={t('entry.label')}
      // 打开的是模态弹窗；`aria-expanded` 绑打开桥，弹窗内关闭后同步复位。
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={() => {
        // 只登记「请打开」：入口不判空分节、不做可见性规则（D5 恒在）。
        open.open()
      }}
    >
      <IconWorkspaceTreeOutlineRegular />
      {/* 宽态才有可见文案；折叠态文案缺席，`aria-label` 仍是唯一可访问名。 */}
      {wide && <span className={css.triggerLabel}>{t('entry.label')}</span>}
    </button>
  )
}
