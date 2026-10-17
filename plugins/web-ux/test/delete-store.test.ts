/**
 * 跨 entry 的删除请求 store（`src/client/delete-store.ts`）。
 *
 * 它同时喂给 React 的 `useSyncExternalStore`（要求快照 identity 稳定）和对话框的
 * React `key`（要求同一行重复点击也能重启预览），这两条约束在这里被固化：空闲为
 * `null`、每次 `request` 换新对象并自增序号、无请求时 `settle` 是空操作。
 *
 * @module dsh-plugin-web-ux/test/delete-store
 */

import { describe, expect, it, vi } from 'vitest'
import { createDeleteRequestStore } from '../src/client/delete-store.ts'

describe('删除请求 store', () => {
  it('初始空闲，request 后给出会话、标题与序号', () => {
    const store = createDeleteRequestStore()
    expect(store.source.getSnapshot()).toBeNull()

    store.request({ sessionId: 'session-1', displayTitle: '归档会话' })

    expect(store.source.getSnapshot()).toEqual({
      sessionId: 'session-1',
      displayTitle: '归档会话',
      seq: 1,
    })
  })

  it('重复请求同一行：快照换新对象且序号自增（不会被 identity 比较或 key 复用吃掉）', () => {
    const store = createDeleteRequestStore()
    store.request({ sessionId: 'session-1', displayTitle: '归档会话' })
    const first = store.source.getSnapshot()

    store.request({ sessionId: 'session-1', displayTitle: '归档会话' })
    const second = store.source.getSnapshot()

    expect(second).not.toBe(first)
    expect(second?.seq).toBe(2)
  })

  it('settle 只在有请求时发布一次 null，空闲时是空操作', () => {
    const store = createDeleteRequestStore()
    const listener = vi.fn()
    store.source.subscribe(listener)

    store.settle()
    expect(listener).not.toHaveBeenCalled()

    store.request({ sessionId: 'session-1', displayTitle: '' })
    store.settle()
    store.settle()

    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.source.getSnapshot()).toBeNull()
  })

  it('订阅者在每次发布时收到通知，退订后不再收到', () => {
    const store = createDeleteRequestStore()
    const listener = vi.fn()
    const unsubscribe = store.source.subscribe(listener)

    store.request({ sessionId: 'session-1', displayTitle: 'x' })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.settle()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
