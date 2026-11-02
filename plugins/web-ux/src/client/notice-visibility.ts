/**
 * 「会话视图正在主视图渲染」的可见性信号（design D2）。
 *
 * 上游公开面是 `ctx.sessions.retainInfo(sessionId)`：一个 `ObservableSnapshot`
 * 快照源，载荷 `SessionRetainInfo` 携带 `retainedBy` 按来源统计的本地引用数，
 * 其中 `mainView` 为正即会话视图已打开（transcript 可见）——框架自身判定主视图
 * 会话用的同一信号，multi-root-workspace 的 compat 层已有同款防御投影先例。
 *
 * 本模块刻意**不 import 上游类型**：`sessions` 服务像 multi-root 一样按
 * `unknown` 软读，形状变化只会让计数归零（隐藏检查退化为「总是显示卡片」，
 * 走卡片自身的 TTL / 手动关闭路径），绝不会抛错。
 *
 * @module dsh-plugin-web-ux/client/notice-visibility
 */

/** 卡片消费的可见性快照源：主视图引用计数（identity 稳定，可喂 `useSyncExternalStore`）。 */
export interface CountSnapshotSource {
  /** 读取当前计数（同一状态返回同一数值）。 */
  getSnapshot(): number
  /** 订阅计数变化；返回退订函数。 */
  subscribe(listener: () => void): () => void
}

/**
 * 从一条 retain 信息投影主视图引用计数。
 * @param info - 上游 `SessionRetainInfo` 或任何形状（防御式，不信任上游版本演化）。
 * @returns `retainedBy.mainView` 的数值；缺字段、非对象、非有限数值一律 0。
 */
export function mainViewCountOf(info: unknown): number {
  if (info === null || typeof info !== 'object') return 0
  const retainedBy = (info as { retainedBy?: unknown }).retainedBy
  if (retainedBy === null || typeof retainedBy !== 'object') return 0
  const mainView = (retainedBy as { mainView?: unknown }).mainView
  return typeof mainView === 'number' && Number.isFinite(mainView) && mainView > 0 ? mainView : 0
}

/**
 * 把上游 retain 快照源包装成计数快照源。
 * @param raw - 上游 `retainInfo(sessionId)` 的返回值或任何形状。
 * @returns 包装后的计数源；`raw` 缺 `getSnapshot`/`subscribe` 方法时为 `null`
 *   （调用方按「无可见性信号」处理，跳过隐藏检查）。
 */
export function projectCountSource(raw: unknown): CountSnapshotSource | null {
  if (raw === null || typeof raw !== 'object') return null
  const holder = raw as { getSnapshot?: unknown; subscribe?: unknown }
  if (typeof holder.getSnapshot !== 'function' || typeof holder.subscribe !== 'function') return null
  return {
    getSnapshot: () => mainViewCountOf((holder.getSnapshot as () => unknown)()),
    subscribe: (listener) => (holder.subscribe as (listener: () => void) => () => void)(listener),
  }
}
