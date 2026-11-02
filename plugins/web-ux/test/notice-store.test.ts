/**
 * 命令结果通知 store（`src/client/notice-store.ts`）。
 *
 * 固化 design D1 的过滤规则与 D4 的通知模型：宽松解构不合格丢弃 + warn、
 * 无文本成功不通知（共识⑦）、同会话新替旧（每会话至多一张卡）、手动关闭、
 * 快照 identity 稳定（可喂 `useSyncExternalStore`）。
 *
 * @module dsh-plugin-web-ux/test/notice-store
 */

import { describe, expect, it, vi } from 'vitest'
import { createNoticeStore } from '../src/client/notice-store.ts'

/** 事件桥会送进 store 的原始负载形状。 */
const OK_RESULT = { kind: 'success', text: '清单正文' }

describe('命令通知 store', () => {
  it('初始空闲；合法 offer 后读到通知（字段齐全、序号自增）', () => {
    const warn = vi.fn()
    const store = createNoticeStore(warn)
    expect(store.source.noticeOf('session-1')).toBeNull()

    store.offer('session-1', 'inventory', OK_RESULT)

    const notice = store.source.noticeOf('session-1')
    expect(notice).toMatchObject({ sessionId: 'session-1', commandName: 'inventory', kind: 'success', text: '清单正文' })
    expect(notice?.seq).toBe(1)
    expect(notice?.at).toBeLessThanOrEqual(Date.now())
    expect(warn).not.toHaveBeenCalled()
  })

  it('同会话新替旧：快照换新对象、序号递增，至多一张卡', () => {
    const store = createNoticeStore(vi.fn())
    store.offer('session-1', 'inventory', OK_RESULT)
    const first = store.source.noticeOf('session-1')

    store.offer('session-1', 'tools', { kind: 'error', text: '工具名拼错' })
    const second = store.source.noticeOf('session-1')

    expect(second).not.toBe(first)
    expect(second).toMatchObject({ commandName: 'tools', kind: 'error', seq: 2 })
  })

  it('多会话互不干扰：A 会话的通知不因 B 会话的写入/关闭而变化', () => {
    const store = createNoticeStore(vi.fn())
    store.offer('session-1', 'inventory', OK_RESULT)
    const a = store.source.noticeOf('session-1')

    store.offer('session-2', 'tools', { kind: 'error', text: 'x' })
    store.dismiss('session-2')

    expect(store.source.noticeOf('session-1')).toBe(a)
    expect(store.source.noticeOf('session-2')).toBeNull()
  })

  it('dismiss 移除通知并通知订阅者；对空会话是空操作', () => {
    const store = createNoticeStore(vi.fn())
    const listener = vi.fn()
    store.source.subscribe(listener)

    store.dismiss('session-1')
    expect(listener).not.toHaveBeenCalled()

    store.offer('session-1', 'inventory', OK_RESULT)
    store.dismiss('session-1')

    expect(store.source.noticeOf('session-1')).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('订阅者收到每次发布；退订后不再收到', () => {
    const store = createNoticeStore(vi.fn())
    const listener = vi.fn()
    const unsubscribe = store.source.subscribe(listener)

    store.offer('session-1', 'inventory', OK_RESULT)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.offer('session-1', 'tools', { kind: 'error', text: 'x' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['sessionId 非字符串', 42, 'inventory', OK_RESULT],
    ['sessionId 为空串', '', 'inventory', OK_RESULT],
    ['commandName 非字符串', 'session-1', null, OK_RESULT],
    ['commandName 为空串', 'session-1', '', OK_RESULT],
    ['result 为 null', 'session-1', 'inventory', null],
    ['result 非对象', 'session-1', 'inventory', 'ok'],
    ['kind 缺失', 'session-1', 'inventory', { text: 'ok' }],
    ['kind 不认识', 'session-1', 'inventory', { kind: 'rich', text: 'ok' }],
    ['错误缺 text', 'session-1', 'inventory', { kind: 'error' }],
    ['错误 text 为空', 'session-1', 'inventory', { kind: 'error', text: '' }],
    ['成功无 text（富呈现走 sourceEventSeq）', 'session-1', 'inventory', { kind: 'success', sourceEventSeq: 7 }],
    ['成功 text 为空', 'session-1', 'inventory', { kind: 'success', text: '  ' }],
  ])('丢弃不合格载荷并 warn：%s', (_label, sessionId, commandName, result) => {
    const warn = vi.fn()
    const store = createNoticeStore(warn)

    store.offer(sessionId, commandName, result)

    expect(store.source.noticeOf('session-1')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('丢弃 command/executed 载荷'))
  })

  it('缺省诊断面落到 console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const store = createNoticeStore()
      store.offer('session-1', 'inventory', { kind: 'success' })
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[web-ux]'))
    } finally {
      spy.mockRestore()
    }
  })
})
