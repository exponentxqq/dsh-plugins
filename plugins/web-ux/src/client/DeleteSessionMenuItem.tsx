/**
 * 侧栏会话行 「...」 菜单里的「删除会话」入口。
 *
 * 座位是 `sidebar.workspaces.session.menu.item`（ui-workspace 声明的 list，官方
 * pin/rename/fork/archive 占 order 100–400），本项 order 500，排在「取消归档」之后。
 * 入口只对**已归档**会话渲染：未归档行返回 `null`，菜单里连分隔线都不留；归档状态
 * 直接读 client 工作区快照的 `archivedSessionIds`，所以归档/取消归档即时跟随，且本项
 * 自身不发任何请求——可见性判定只是展示层，真正的授权在宿主两个端点里。
 *
 * 点击后先把菜单关掉，再登记删除请求（对话框在 `shell.overlay` 里订阅同一个 store）。
 *
 * @module dsh-plugin-web-ux/client/DeleteSessionMenuItem
 */

import { useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { IconTrashOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only：拉 ui-workspace 的 SlotMap merge（本 slot 的 owner props 与
// `useMenuOpenState` hook 座位）与 ui-renderer 的 `ctx.slots` merge。
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { NS } from './locales.ts'
import type { DeleteRequestStore } from './delete-store.ts'

/** 本入口订阅的工作区快照切片：只关心归档集合。 */
export interface ArchivedSessionsSnapshot {
  /** 注册表全局的归档会话集合。 */
  readonly archivedSessionIds: readonly SessionId[]
}

/**
 * 归档状态的订阅面（结构式声明，不 import 工作区服务的完整类型）：`ctx.workspaces.list`
 * 满足它，测试也只需给一个同形状的假 store。
 */
export interface ArchivedSessionsSource {
  /**
   * 读取 identity 稳定的当前快照。
   * @returns 归档集合所在的工作区快照。
   */
  getSnapshot(): ArchivedSessionsSnapshot
  /**
   * 订阅快照变化。
   * @param listener - 失效回调。
   * @returns 退订函数。
   */
  subscribe(listener: () => void): () => void
}

/** 完整 props：菜单项座位的运行时份额 + 本命名空间的 `t` + 注入面。 */
export type DeleteSessionMenuItemProps = PropsRuntime<'sidebar.workspaces.session.menu.item'>
  & PropsLocale<typeof NS>
  & {
    /** 跨 entry 的删除请求 store（只用到写入面）。 */
    readonly requests: Pick<DeleteRequestStore, 'request'>
    /** client 工作区快照的归档集合。 */
    readonly archived: ArchivedSessionsSource
  }

/**
 * 菜单行。未归档时不渲染任何 DOM。
 * @param props - 菜单项运行时份额、注入面与 `t`。
 * @returns 菜单行按钮，或 `null`（该行不适用）。
 */
export function DeleteSessionMenuItem({
  sessionId,
  displayTitle,
  useMenuOpenState,
  requests,
  archived,
  t,
}: DeleteSessionMenuItemProps): ReactNode {
  // hook 必须全部在 early return 之前调用：菜单开合状态来自座位 owner。
  const [, setMenuOpen] = useMenuOpenState()

  // 座位可能在每次渲染给出新的注入面，而归档集合是常驻的：订阅与读取都骑 ref，
  // useMemo 不依赖注入面 identity，避免每次渲染退订重订。
  const source = useRef(archived)
  source.current = archived
  const subscribe = useMemo(() => (onChange: () => void) => source.current.subscribe(onChange), [])
  // 内容级缓存：useSyncExternalStore 要求快照 identity 稳定，而上游若哪天改成每次
  // 返回新数组，直接用它的数组会让 React 以「快照一直在变」抛 Maximum update depth
  // （整棵侧栏子树崩）。这里按内容比较后复用旧引用，把版本漂移降级成一次普通重渲染。
  const read = useMemo(() => {
    let cached: readonly SessionId[] = []
    return (): readonly SessionId[] => {
      const next = source.current.getSnapshot().archivedSessionIds
      if (next.length !== cached.length || next.some((id, index) => id !== cached[index])) cached = next
      return cached
    }
  }, [])
  const archivedSessionIds = useSyncExternalStore(subscribe, read)

  if (!archivedSessionIds.includes(sessionId)) return null

  return (
    <MenuItemButton
      icon={<IconTrashOutlineRegular />}
      danger
      // 先关菜单再登记请求：对话框挂在覆盖层 slot 上，菜单留在原处会挡住它。
      onSelect={() => {
        setMenuOpen(false)
        requests.request({ sessionId, displayTitle })
      }}
    >
      {t('menu.delete')}
    </MenuItemButton>
  )
}
