/**
 * 命令结果通知卡（`conversation.input.overlay`，design D3/D5）。
 *
 * 只兜「命令结果在当前视图无处渲染」的场景：事件到达且执行会话的会话视图
 * （transcript）未打开时，composer 上方弹一张卡；会话视图打开（主视图引用
 * 计数变正）即自动隐藏，不分成败——prompt 型命令提交后模型轮次一启动，
 * 卡片就随视图挂载而消失。
 *
 * 消失路径按结果类型分治（共识④⑤）：
 *
 * - 成功卡 10s 自动消失；**展开期间冻结计时，收起后从剩余时间恢复**；
 * - 错误卡不自动消失，仅手动关闭（错误提示常需照着改输入）。
 *
 * 折叠态一行（命令名 + 首行摘要），点击展开为限高滚动全文（`pre-wrap`，
 * 长清单不丢失）；错误卡以错误色边框区分。无通知或无可见性信号不渲染。
 * @module dsh-plugin-web-ux/client/CommandNoticeCard
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only：拉 ui-conversation 的 SlotMap merge（`conversation.input.overlay`
// 这个座位）与 ui-session 的 SessionStandardProps merge（座位带 sessionId）。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { type CountSnapshotSource } from './notice-visibility.ts'
import { type CommandNotice, type NoticeStore } from './notice-store.ts'
import { NS, type Key } from './locales.ts'
import css from './notice.module.css'

/** 成功卡的自动消失时长；错误卡不设 TTL（仅手动关闭）。 */
export const SUCCESS_TTL_MS = 10_000

/** 折叠态摘要的最大字符数（超出截断加 `…`）。 */
export const SUMMARY_MAX_CHARS = 80

/** 本 entry 的注入面：通知 store 读取面 + 可见性源解析（均由 client entry 提供）。 */
export interface CommandNoticeInjected {
  /** 跨面的通知 store（读取面 + 关闭面）。 */
  readonly notices: Pick<NoticeStore, 'source' | 'dismiss'>
  /**
   * 解析一个会话的主视图引用计数源（design D2）。
   * @param sessionId - 要观察的会话。
   * @returns 计数快照源；sessions 服务缺席或形状不符时为 `undefined`
   *   （跳过隐藏检查，卡片按自身 TTL / 手动关闭路径走）。
   */
  readonly visibilityFor: (sessionId: string) => CountSnapshotSource | undefined
}

/** 完整 props：overlay 座位的运行时份额 + 本命名空间的 `t` + 注入面。 */
export type CommandNoticeCardProps = PropsRuntime<'conversation.input.overlay'>
  & PropsLocale<typeof NS>
  & CommandNoticeInjected

/**
 * 折叠态摘要：取首个非空行的前缀，超长截断加 `…`。
 * @param text - 结果全文。
 * @param max - 最大字符数。
 * @returns 单行摘要（永不抛错，空文本返回空串）。
 */
export function noticeSummary(text: string, max: number = SUMMARY_MAX_CHARS): string {
  const firstLine = text.split('\n').find((line) => line.trim() !== '') ?? ''
  const trimmed = firstLine.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

/** 计时器的剩余预算（展开冻结 / 收起恢复的载体）。 */
interface TimerBudget {
  remaining: number
}

/**
 * 通知卡。渲染条件（全部满足才出卡）：本会话有通知，且主视图引用计数为零
 * （会话视图未打开）。内部卡按通知序号做 key——同会话新替旧时重挂、计时重置。
 * @param props - overlay 运行时份额、`t` 与注入面。
 * @returns 通知卡，或无需展示时的 null。
 */
export function CommandNoticeCard({ sessionId, notices, visibilityFor, t }: CommandNoticeCardProps): ReactNode {
  // 通知切片：store 任意变化都会回调读取，identity 未变的会话切片不触发重渲染。
  const notice = useSyncExternalStore(notices.source.subscribe, () => notices.source.noticeOf(sessionId))
  // 可见性源按会话记忆（注入面可能每渲染换新对象，身份以会话为准）。
  const visibility = useMemo(() => visibilityFor(sessionId), [visibilityFor, sessionId])
  const readCount = useMemo(
    () => () => visibility?.getSnapshot() ?? 0,
    [visibility],
  )
  const subscribeCount = useMemo(
    () => (onChange: () => void) => (visibility === undefined ? () => {} : visibility.subscribe(onChange)),
    [visibility],
  )
  const mainViewCount = useSyncExternalStore(subscribeCount, readCount)

  // 会话视图已打开（transcript 可见）→ 结果已是会话流里的持久节点，卡不该在。
  if (mainViewCount > 0) return null
  if (notice === null) return null
  return (
    <CommandNoticeBody
      key={notice.seq}
      notice={notice}
      notices={notices}
      t={t}
    />
  )
}

/** 内部组件的 props：一条确定的通知（key 已保证替换即重挂）。 */
interface CommandNoticeBodyProps {
  readonly notice: CommandNotice
  readonly notices: Pick<NoticeStore, 'source' | 'dismiss'>
  readonly t: CommandNoticeCardProps['t']
}

/**
 * 一张通知卡的完整交互（折叠/展开/关闭 + 成功卡计时）。
 * @param props - 通知、store 关闭面与 `t`。
 * @returns 通知卡。
 */
function CommandNoticeBody({ notice, notices, t }: CommandNoticeBodyProps): ReactNode {
  const [expanded, setExpanded] = useState(false)
  // dismiss / 通知身份走 ref：计时 effect 只依赖成败与展开态，注入面每渲染
  // 换新对象也不会反复重启计时器。
  const dismissRef = useRef(notices.dismiss)
  dismissRef.current = notices.dismiss

  // 成功卡的自动消失：展开即暂停（cleanup 记录剩余），收起从剩余恢复。
  // 错误卡不设计时（共识⑤），effect 直接返回。
  const budget = useRef<TimerBudget>({ remaining: SUCCESS_TTL_MS })
  useEffect(() => {
    if (notice.kind !== 'success' || expanded) return
    const remaining = budget.current.remaining
    if (remaining <= 0) {
      dismissRef.current(notice.sessionId)
      return
    }
    const startedAt = Date.now()
    const timer = setTimeout(() => {
      dismissRef.current(notice.sessionId)
    }, remaining)
    return () => {
      clearTimeout(timer)
      budget.current.remaining = Math.max(0, remaining - (Date.now() - startedAt))
    }
  }, [notice.kind, notice.sessionId, expanded])

  const summary = noticeSummary(notice.text)
  const titleKey: Key = notice.kind === 'error' ? 'notice.error.title' : 'notice.success.title'

  return (
    <div className={`${css.card} ${notice.kind === 'error' ? css.error : ''}`} role="status">
      <div className={css.head}>
        <span className={css.title}>{t(titleKey)}</span>
        {/* 事件负载的命令名不带斜杠（notifyExecuted 契约），展示时补上。 */}
        <span className={css.command}>{`/${notice.commandName}`}</span>
        {!expanded && <span className={css.summary}>{summary}</span>}
        <span className={css.spring} />
        <button
          type="button"
          className={css.action}
          onClick={() => { setExpanded((value) => !value) }}
          aria-expanded={expanded}
          aria-label={expanded ? t('notice.collapse') : t('notice.expand')}
        >
          {expanded ? t('notice.collapse') : t('notice.expand')}
        </button>
        <button
          type="button"
          className={css.action}
          onClick={() => { notices.dismiss(notice.sessionId) }}
          aria-label={t('notice.close')}
        >
          ×
        </button>
      </div>
      {expanded && <pre className={css.full}>{notice.text}</pre>}
    </div>
  )
}
