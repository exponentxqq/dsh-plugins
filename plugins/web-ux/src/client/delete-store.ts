/**
 * 菜单项与对话框之间的共享请求 store。
 *
 * 两个 entry 是两个独立的 slot 注册，而 slot 的 `inject.hooks` 只能由 slot 声明方
 * （ui-workspace / ui-layout）提供，第三方无法新增——所以跨 entry 通信不能用框架的
 * hook 座位，改用插件内一个极小的可订阅快照：菜单项写入「要删哪一行」，`shell.overlay`
 * 里的对话框订阅它。快照 identity 稳定（只在显式动作时换新对象），可以直接喂给
 * `useSyncExternalStore`。
 *
 * @module dsh-plugin-web-ux/client/delete-store
 */

/** 一次删除请求的目标：行身份 + 该行当前显示的标题（宿主侧预览拿不到标题）。 */
export interface DeleteTarget {
  /** 侧栏那一行对应的会话 id。 */
  readonly sessionId: string
  /** 行上显示的标题，仅用于对话框展示。 */
  readonly displayTitle: string
  /**
   * 请求序号：每次 `request` 自增，对话框按它做 key。同一行被重复点击时也要重启
   * 预览（而不是被 React 的 key 复用吃掉），这是区分「同一次请求」的唯一身份。
   */
  readonly seq: number
}

/** 登记一次请求时调用方要给的字段（序号由 store 自己发）。 */
export type DeleteRequestInput = Omit<DeleteTarget, 'seq'>

/** 只读订阅面：对话框消费的最小接口。 */
export interface DeleteRequestSource {
  /**
   * 读取当前请求（identity 稳定）。
   * @returns 当前目标，或空闲时的 null。
   */
  getSnapshot(): DeleteTarget | null
  /**
   * 订阅请求变化。
   * @param listener - 失效回调。
   * @returns 退订函数。
   */
  subscribe(listener: () => void): () => void
}

/** 请求 store 的完整面。 */
export interface DeleteRequestStore {
  /** 供对话框 `useSyncExternalStore` 使用的只读面。 */
  readonly source: DeleteRequestSource
  /**
   * 登记一次删除请求（菜单项点击）。
   * @param target - 被点击的那一行；序号由 store 自己发。
   */
  request(target: DeleteRequestInput): void
  /** 结束当前请求（取消 / 关闭 / 删除完成后关闭）。 */
  settle(): void
}

/**
 * 建一个请求 store。
 * @returns 新的 store；初始空闲。
 */
export function createDeleteRequestStore(): DeleteRequestStore {
  let snapshot: DeleteTarget | null = null
  let seq = 0
  const listeners = new Set<() => void>()

  const publish = (next: DeleteTarget | null): void => {
    snapshot = next
    for (const listener of Array.from(listeners)) listener()
  }

  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    // 显式点击每次都换新对象并换新序号：重复点同一行也应重启预览，而不是被
    // identity 比较或 React 的 key 复用吃掉。
    request: (target) => {
      seq += 1
      publish({ sessionId: target.sessionId, displayTitle: target.displayTitle, seq })
    },
    settle: () => {
      if (snapshot !== null) publish(null)
    },
  }
}
