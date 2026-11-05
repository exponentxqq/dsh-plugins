/**
 * 管理浮层的「打开请求」store（跨 entry 通信）。
 *
 * 入口与浮层是两个独立的 slot 注册（`sidebar.footer.action` 与 `shell.overlay`），
 * 而 slot 的 `inject.hooks` 只能由 slot 声明方（ui-sidebar / ui-layout）提供，第三方
 * 无法新增——所以跨 entry 通信不能用框架的 hook 座位，改用插件内一个极小的可订阅
 * 快照：入口只写「请打开管理浮层」，浮层订阅它。快照 identity 稳定（只在显式动作时
 * 换新对象），可以直接喂给 `useSyncExternalStore`。
 *
 * 与 `delete-store.ts` 同构（同一 seq/identity 契约），仅载荷域不同：删除请求要带
 * 「删哪一行」，管理浮层不需要任何目标——工作区 / 会话 / 已迁移条目全部由浮层自己的
 * 快照与请求派生，打开请求只承载「第几次打开」。`seq` 是唯一的身份，浮层按它做
 * React `key`：关掉后再点一次也要重挂主体（阶段机、选择、预览全部重置），而不是被
 * React 的 key 复用吃掉。
 *
 * @module dsh-plugin-web-ux/client/session-manager-store
 */

/** 一次「打开管理浮层」请求：只带序号，无业务载荷。 */
export interface ManagerRequest {
  /**
   * 请求序号：每次 `request` 自增，浮层按它做 React `key`。同一入口被重复点击时
   * 也要重挂浮层主体（而不是被 React 的 key 复用吃掉），这是区分「同一次请求」的
   * 唯一身份。
   */
  readonly seq: number
}

/** 只读订阅面：浮层消费的最小接口。 */
export interface ManagerRequestSource {
  /**
   * 读取当前请求（identity 稳定）。
   * @returns 当前请求，或空闲时的 null。
   */
  getSnapshot(): ManagerRequest | null
  /**
   * 订阅请求变化。
   * @param listener - 失效回调。
   * @returns 退订函数。
   */
  subscribe(listener: () => void): () => void
}

/** 请求 store 的完整面。 */
export interface ManagerRequestStore {
  /** 供浮层 `useSyncExternalStore` 使用的只读面。 */
  readonly source: ManagerRequestSource
  /** 登记一次打开请求（入口点击）；序号由 store 自己发。 */
  request(): void
  /** 结束当前请求（关闭浮层）。 */
  settle(): void
}

/**
 * 建一个管理浮层的打开请求 store。
 * @returns 新的 store；初始空闲。
 */
export function createManagerRequestStore(): ManagerRequestStore {
  let snapshot: ManagerRequest | null = null
  let seq = 0
  const listeners = new Set<() => void>()

  const publish = (next: ManagerRequest | null): void => {
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
    // 显式点击每次都换新对象并换新序号：重复点同一入口也应重挂浮层，而不是被
    // identity 比较或 React 的 key 复用吃掉。
    request: () => {
      seq += 1
      publish({ seq })
    },
    settle: () => {
      if (snapshot !== null) publish(null)
    },
  }
}
