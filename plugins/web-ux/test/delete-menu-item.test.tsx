// @vitest-environment jsdom
/**
 * 「删除会话」菜单入口的行为（spec: dsh-web-ux-session-delete「删除入口仅出现在已归档会话行」）。
 *
 * 入口是纯投影：归档集合来自 client 工作区快照，组件自己不请求任何数据。所以用例只驱动
 * 一份假快照 —— 未归档 → 不渲染 DOM，归档 → 出现，取消归档 → 立刻消失；点击只登记请求
 * 并关菜单，绝不在这里发删除调用。
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { DeleteSessionMenuItem, type DeleteSessionMenuItemProps } from '../src/client/DeleteSessionMenuItem.tsx'
import { zh, type Key } from '../src/client/locales.ts'

afterEach(cleanup)

/** 一份可发布的假工作区归档集合（形状与 `ctx.workspaces.list` 的消费切片一致）。 */
function archivedStore(initial: readonly SessionId[]) {
  let snapshot: { archivedSessionIds: readonly SessionId[] } = { archivedSessionIds: initial }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** 发布一份新快照：归档/取消归档在 client 侧就是这一步。 */
    publish(next: readonly SessionId[]): void {
      snapshot = { archivedSessionIds: next }
      for (const listener of Array.from(listeners)) listener()
    },
  }
}

/**
 * 渲染入口。
 * @param archived - 当前归档集合。
 * @returns render 结果 + 可直接断言的假依赖。
 */
function renderItem(archived: readonly SessionId[]) {
  const store = archivedStore(archived)
  const request = vi.fn()
  const setMenuOpen = vi.fn()
  const props = {
    sessionId: 'session-1' as SessionId,
    displayTitle: '被归档的会话',
    useMenuOpenState: () => [true, setMenuOpen] as const,
    requests: { request },
    archived: store,
    t: (key: Key) => zh[key],
  } as unknown as DeleteSessionMenuItemProps
  return { ...render(<DeleteSessionMenuItem {...props} />), store, request, setMenuOpen }
}

describe('删除会话菜单入口', () => {
  it('已归档行渲染带垃圾桶图标的危险菜单项', () => {
    const { container } = renderItem(['session-1' as SessionId])

    const item = screen.getByRole('menuitem')
    expect(item.textContent).toBe('删除会话')
    expect(item.getAttribute('data-danger')).toBe('true')
    expect(container.querySelector('svg[data-icon="trash"]')).not.toBeNull()
  })

  it('未归档行不渲染任何 DOM', () => {
    const { container } = renderItem([])

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('点击先关菜单再登记删除请求', () => {
    const { request, setMenuOpen } = renderItem(['session-1' as SessionId])

    fireEvent.click(screen.getByRole('menuitem'))

    expect(setMenuOpen).toHaveBeenCalledWith(false)
    expect(request).toHaveBeenCalledWith({ sessionId: 'session-1', displayTitle: '被归档的会话' })
    expect(setMenuOpen.mock.invocationCallOrder[0]).toBeLessThan(request.mock.invocationCallOrder[0] as number)
  })

  it('归档状态变更后入口即时出现与消失，无需刷新', () => {
    const { store } = renderItem([])
    const sessionId = 'session-1' as SessionId
    expect(screen.queryByRole('menuitem')).toBeNull()

    act(() => {
      store.publish([sessionId])
    })
    expect(screen.getByRole('menuitem')).toBeDefined()

    act(() => {
      store.publish([])
    })
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('上游快照每次返回新数组时也不陷入无限重渲染（内容级缓存把版本漂移降级为普通渲染）', () => {
    // 上游若不再保证 identity 稳定，直接把它的数组交给 useSyncExternalStore 会让
    // React 抛 Maximum update depth（整棵侧栏子树崩）；本用例钉住内容级缓存这一层。
    const unstable = {
      getSnapshot: () => ({ archivedSessionIds: ['session-1' as SessionId] }),
      subscribe: () => (): void => {},
    }
    const props = {
      sessionId: 'session-1' as SessionId,
      displayTitle: '被归档的会话',
      useMenuOpenState: () => [true, vi.fn()] as const,
      requests: { request: vi.fn() },
      archived: unstable,
      t: (key: Key) => zh[key],
    } as unknown as DeleteSessionMenuItemProps

    expect(() => { render(<DeleteSessionMenuItem {...props} />) }).not.toThrow()
    expect(screen.getByRole('menuitem')).toBeDefined()
  })
})
