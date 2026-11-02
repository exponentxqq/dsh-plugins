/**
 * 主视图可见性投影（`src/client/notice-visibility.ts`）。
 *
 * 上游 `SessionRetainInfo` 的形状演化不归本插件管：这里固化的是防御解构契约——
 * 任何形状不符一律计数 0（卡片退化为「不做挂载即隐藏」，走自身 TTL/手动关闭），
 * 绝不抛错。`mainView > 0` 即「会话视图正在主视图渲染」的判定与框架自身、
 * multi-root-workspace 的 compat 层一致。
 *
 * @module dsh-plugin-web-ux/test/notice-visibility
 */

import { describe, expect, it, vi } from 'vitest'
import { mainViewCountOf, projectCountSource } from '../src/client/notice-visibility.ts'

describe('mainViewCountOf', () => {
  it('正计数原样透传，0 与负数归 0', () => {
    expect(mainViewCountOf({ retainedBy: { mainView: 2 } })).toBe(2)
    expect(mainViewCountOf({ retainedBy: { mainView: 1 } })).toBe(1)
    expect(mainViewCountOf({ retainedBy: { mainView: 0 } })).toBe(0)
    expect(mainViewCountOf({ retainedBy: { mainView: -1 } })).toBe(0)
  })

  it('非数值 mainView（字符串/NaN/Infinity）一律 0', () => {
    expect(mainViewCountOf({ retainedBy: { mainView: '1' } })).toBe(0)
    expect(mainViewCountOf({ retainedBy: { mainView: Number.NaN } })).toBe(0)
    expect(mainViewCountOf({ retainedBy: { mainView: Number.POSITIVE_INFINITY } })).toBe(0)
  })

  it('缺 retainedBy、非对象、null/undefined 输入一律 0', () => {
    expect(mainViewCountOf({})).toBe(0)
    expect(mainViewCountOf({ retainedBy: null })).toBe(0)
    expect(mainViewCountOf({ retainedBy: 'nope' })).toBe(0)
    expect(mainViewCountOf(null)).toBe(0)
    expect(mainViewCountOf(undefined)).toBe(0)
    expect(mainViewCountOf(42)).toBe(0)
    expect(mainViewCountOf('x')).toBe(0)
  })
})

describe('projectCountSource', () => {
  /** 造一个最小上游快照源（可手动发布）。 */
  function upstream(initial: unknown) {
    let snapshot = initial
    const listeners = new Set<() => void>()
    return {
      getSnapshot: (): unknown => snapshot,
      subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      publish(next: unknown): void {
        snapshot = next
        for (const listener of Array.from(listeners)) listener()
      },
      listenerCount: () => listeners.size,
    }
  }

  it('包装后的源按防御投影读计数', () => {
    const raw = upstream({ retainedBy: { mainView: 1 } })
    const source = projectCountSource(raw)
    expect(source).not.toBeNull()
    expect(source?.getSnapshot()).toBe(1)

    raw.publish({ retainedBy: {} })
    expect(source?.getSnapshot()).toBe(0)
  })

  it('订阅直通上游：通知到达、退订生效', () => {
    const raw = upstream({ retainedBy: { mainView: 0 } })
    const source = projectCountSource(raw)
    const listener = vi.fn()

    const unsubscribe = source?.subscribe(listener)
    raw.publish({ retainedBy: { mainView: 1 } })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe?.()
    raw.publish({ retainedBy: { mainView: 2 } })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(raw.listenerCount()).toBe(0)
  })

  it('形状不符（缺方法/非对象）返回 null，调用方按无信号处理', () => {
    expect(projectCountSource(null)).toBeNull()
    expect(projectCountSource(undefined)).toBeNull()
    expect(projectCountSource(42)).toBeNull()
    expect(projectCountSource({})).toBeNull()
    expect(projectCountSource({ getSnapshot: () => ({}) })).toBeNull()
    expect(projectCountSource({ subscribe: () => () => {} })).toBeNull()
  })
})
