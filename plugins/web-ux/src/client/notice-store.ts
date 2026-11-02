/**
 * 命令结果通知 store（design D4）。
 *
 * 事件桥（`ctx.on("command/executed")`）与通知卡是两个独立的挂载面，跨面通信
 * 走插件内一个极小的可订阅快照——与 delete-store 同构：快照 identity 稳定
 * （只在显式动作时换新对象），可以直接喂给 `useSyncExternalStore`。
 *
 * 载荷规则（design D1 的事实结论 + 过滤规则）：
 *
 * - `sessionId` / `commandName` 必须是非空字符串，`result` 必须是带 `kind`
 *   （`success` | `error`）的对象，否则整体丢弃并记 warn；
 * - 错误结果 `text` 必须是非空字符串（宿主契约保证，防御再验一次）；
 * - 成功结果 `text` 缺省或为空 → 丢弃并记 warn（共识⑦：无文本的成功不通知，
 *   富呈现结果走 `sourceEventSeq` 的专用渲染，与本能力无关）。
 *
 * @module dsh-plugin-web-ux/client/notice-store
 */

/** 通知的结果类别（与宿主 `CommandResult` 的两种 kind 一一对应）。 */
export type CommandNoticeKind = 'success' | 'error'

/** 一条待展示的命令结果通知（identity 稳定，同会话被新通知替换前不变）。 */
export interface CommandNotice {
  /** 产生结果的会话（事件的第一个负载）。 */
  readonly sessionId: string
  /** 命令名（如 `/inventory`）。 */
  readonly commandName: string
  /** 结果类别：成功卡有 TTL，错误卡仅手动关闭。 */
  readonly kind: CommandNoticeKind
  /** 结果全文（折叠态只展示摘要，展开看全文）。 */
  readonly text: string
  /** 事件到达时刻（`Date.now()`），供诊断与排序。 */
  readonly at: number
  /** store 自增序号：同会话新替旧时换新，卡片按它重挂（重启计时器）。 */
  readonly seq: number
}

/** 只读订阅面：通知卡消费的最小接口。 */
export interface NoticeSource {
  /**
   * 读取一个会话的当前通知（identity 稳定）。
   * @param sessionId - 卡片所在座位绑定的会话。
   * @returns 当前通知，或空闲时的 null。
   */
  noticeOf(sessionId: string): CommandNotice | null
  /**
   * 订阅通知变化（任意会话的写入/关闭都会通知，读取方按会话切片比较）。
   * @param listener - 失效回调。
   * @returns 退订函数。
   */
  subscribe(listener: () => void): () => void
}

/** 通知 store 的完整面（事件桥写、卡片读）。 */
export interface NoticeStore {
  /** 供卡片 `useSyncExternalStore` 使用的只读面。 */
  readonly source: NoticeSource
  /**
   * 登记一次命令执行结果（宽松解构，不合格载荷静默丢弃 + warn）。
   * @param sessionId - 事件负载的会话 id（未验证）。
   * @param commandName - 事件负载的命令名（未验证）。
   * @param result - 事件负载的命令结果（未验证）。
   */
  offer(sessionId: unknown, commandName: unknown, result: unknown): void
  /**
   * 关闭一个会话的通知（手动关闭与成功卡 TTL 到期共用同一入口）。
   * @param sessionId - 要关闭的会话；无通知时是空操作。
   */
  dismiss(sessionId: string): void
}

/** store 的可注入诊断面：丢弃载荷时调用（测试注入 spy，运行时接 ctx.logger）。 */
export type NoticeWarn = (message: string) => void

/**
 * 建一个通知 store。
 * @param warn - 诊断回调，缺省落到 `console.warn`（仅浏览器控制台，不影响界面）。
 * @returns 新的 store；初始为空 Map。
 */
export function createNoticeStore(warn: NoticeWarn = (message) => { console.warn(`[web-ux] ${message}`) }): NoticeStore {
  const notices = new Map<string, CommandNotice>()
  const listeners = new Set<() => void>()
  let seq = 0

  const publish = (): void => {
    for (const listener of Array.from(listeners)) listener()
  }

  /** 宽松解构一条事件负载；不合格返回 null 并给出原因。 */
  const parse = (sessionId: unknown, commandName: unknown, result: unknown): CommandNotice | string => {
    if (typeof sessionId !== 'string' || sessionId === '') return 'sessionId 非非空字符串'
    if (typeof commandName !== 'string' || commandName === '') return 'commandName 非非空字符串'
    if (result === null || typeof result !== 'object') return 'result 不是对象'
    const kind = (result as { kind?: unknown }).kind
    if (kind !== 'success' && kind !== 'error') return 'result.kind 不是 success/error'
    const text = (result as { text?: unknown }).text
    if (typeof text !== 'string' || text.trim() === '') {
      return kind === 'error' ? '错误结果缺 text' : '成功结果无文本（富呈现走 sourceEventSeq，不通知）'
    }
    seq += 1
    return { sessionId, commandName, kind, text, at: Date.now(), seq }
  }

  return {
    source: {
      noticeOf: (sessionId) => notices.get(sessionId) ?? null,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    offer: (sessionId, commandName, result) => {
      const parsed = parse(sessionId, commandName, result)
      if (typeof parsed === 'string') {
        warn(`丢弃 command/executed 载荷：${parsed}`)
        return
      }
      // 每会话至多一张卡：新替旧，不排队（旧结果已在会话流落盘）。
      notices.set(parsed.sessionId, parsed)
      publish()
    },
    dismiss: (sessionId) => {
      if (!notices.delete(sessionId)) return
      publish()
    },
  }
}
