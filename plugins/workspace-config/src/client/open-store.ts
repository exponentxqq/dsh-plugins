/**
 * 统一「工作区配置」弹窗的打开桥（跨 entry 通信）。
 *
 * footer 入口（`sidebar.footer.action`）与统一弹窗（`shell.overlay`）是两个独立的
 * slot 注册，而 slot 的 `inject.hooks` 只能由座位声明方（ui-sidebar / ui-layout）提供，
 * 第三方无法新增——所以入口与弹窗之间的通信不能用框架的 hook 座位，改用一个插件内
 * 极小的可订阅快照：入口只写「请打开弹窗」，弹窗订阅它。快照是**布尔值**，identity
 * 天然稳定（`true`/`false` 是基本值），可以直接喂给 `useSyncExternalStore`。
 *
 * 为什么不是 web-ux 那样的 `seq` 请求对象（D15）：统一弹窗在关闭时整颗返回 `null`，
 * 子树（含本地 `selected` 之外的 Modal 内部状态）已整体卸载，重开天然复位；`seq` 只会
 * 多一个字段与一次无意义的重挂。更关键的是，重挂的 `key` 一旦包住弹窗子树，就会把
 * nav 的「选中节」状态一起重置，与 D8「选中节跨开合记忆」直接冲突。
 *
 * 开合的**唯一**所有权在本 store：入口只调 `open()`，弹窗只订阅并在关闭动作（自绘
 * 关闭按钮、`Modal` 的 Escape / 遮罩点击）里调 `close()`。弹窗内分节拿到的 `close`
 * 份额也是它，分节不拥有开合状态。
 *
 * @module dsh-plugin-workspace-config/client/open-store
 */

/**
 * 打开桥的完整面（uSES 只读面 + 两个显式动作）。
 *
 * `open()` / `close()` 幂等：值未变化时不通知订阅者，避免无谓重渲染。
 */
export interface WorkspaceConfigOpenStore {
  /**
   * 读取当前开合快照（`true` = 弹窗应打开）。
   * @returns 布尔快照；identity 天然稳定，可直接作为 `useSyncExternalStore` 的 getSnapshot。
   */
  getSnapshot(): boolean
  /**
   * 订阅开合变化。
   * @param listener - 变化回调（无参数）。
   * @returns 退订函数（幂等）。
   */
  subscribe(listener: () => void): () => void
  /** 请求打开弹窗（已打开时无操作）。 */
  open(): void
  /** 请求关闭弹窗（已关闭时无操作）。 */
  close(): void
}

/**
 * 建一个打开桥。
 * @returns 新的 store；初始为关闭态（`false`）。
 */
export function createOpenStore(): WorkspaceConfigOpenStore {
  let snapshot = false
  const listeners = new Set<() => void>()

  /** 写入新快照；只有值真正变化时才通知，保持「动作幂等」的可观测语义。 */
  const publish = (next: boolean): void => {
    if (next === snapshot) return
    snapshot = next
    for (const listener of Array.from(listeners)) listener()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    open: () => {
      publish(true)
    },
    close: () => {
      publish(false)
    },
  }
}
