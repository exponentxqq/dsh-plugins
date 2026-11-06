/**
 * 目录监听的规范级用例（H11）：阶梯取最深已存在层、保序去重、防抖合并、
 * 释放离场目录、不可监听目录只降级不失败。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogSink } from '../src/log.ts'
import {
  DEFAULT_DEBOUNCE_MS,
  DirectoryWatcher,
  deepestExisting,
  ladderTargets,
  type WatchIo,
} from '../src/watcher.ts'

/** 只按「存在的目录集合」回答的检查 seam。 */
function existence(existing: readonly string[]) {
  const present = new Set(existing)
  return { isDirectory: async (candidate: string) => present.has(candidate) }
}

/** 收集全部警告的假日志出口。 */
function collectingLog(): LogSink & { readonly warnings: readonly string[] } {
  const warnings: string[] = []
  const sink: LogSink = {
    info: () => {},
    warn: (message) => {
      warnings.push(message)
    },
    error: () => {},
  }
  return Object.assign(sink, { warnings })
}

describe('deepestExisting：阶梯里最深的已存在层', () => {
  it('由深到浅取第一个存在的层级', async () => {
    const io = existence(['/root/.dsh', '/root'])
    expect(await deepestExisting(io, ['/root/.dsh/mcp', '/root/.dsh', '/root'])).toBe('/root/.dsh')
  })

  it('一层都不存在且未开 fallback 时返回 undefined', async () => {
    expect(await deepestExisting(existence([]), ['/root/.dsh/mcp', '/root/.dsh', '/root'])).toBeUndefined()
  })

  it('fallbackToLast 打开时退到最浅一层（工作区根一定存在）', async () => {
    expect(
      await deepestExisting(existence([]), ['/root/.dsh/mcp', '/root/.dsh', '/root'], {
        fallbackToLast: true,
      }),
    ).toBe('/root')
  })

  it('空阶梯不产生目标（即使开了 fallback）', async () => {
    expect(await deepestExisting(existence([]), [], { fallbackToLast: true })).toBeUndefined()
  })
})

describe('ladderTargets：多条阶梯 → 保序去重', () => {
  it('按阶梯顺序输出，重复目标只监听一次', async () => {
    const io = existence(['/ua/.dsh/commands', '/ua/.dsh', '/ub', '/ua'])
    const targets = await ladderTargets(io, [
      ['/ua/.dsh/commands', '/ua/.dsh', '/ua'],
      ['/ub/.dsh/commands', '/ub'],
      // 第三条阶梯的最深存在层与第一条相同：必须去重。
      ['/ua/.dsh/commands', '/ua'],
    ])

    expect(targets).toEqual(['/ua/.dsh/commands', '/ub'])
  })

  it('未开 fallback 时缺席的阶梯被跳过', async () => {
    const targets = await ladderTargets(existence(['/a']), [['/b/deep', '/b'], ['/a/deep', '/a']])

    expect(targets).toEqual(['/a'])
  })
})

describe('DirectoryWatcher：装配、释放、防抖', () => {
  /** 事件监听器按目录登记，测试里手动触发。 */
  let listeners: Map<string, () => void>
  /** 被 close 的目录。 */
  let closed: string[]
  /** 无法监听的目录。 */
  let failing: Set<string>
  /** 监听过一次的目录数（含重复 arm 的幂等性检查）。 */
  let watchCalls: string[]

  beforeEach(() => {
    listeners = new Map()
    closed = []
    failing = new Set()
    watchCalls = []
  })

  /** 假监听 seam。 */
  function watchIo(): WatchIo {
    return {
      isDirectory: async () => true,
      watch: (dir, listener) => {
        watchCalls.push(dir)
        if (failing.has(dir)) throw new Error('EPERM')
        listeners.set(dir, listener)
        return {
          close: () => {
            listeners.delete(dir)
            closed.push(dir)
          },
        }
      },
    }
  }

  it('arm 幂等：已在监听的目录不重复 watch，离场目录被 close', () => {
    const log = collectingLog()
    const watcher = new DirectoryWatcher(watchIo(), () => {}, log)

    watcher.arm(['/a', '/b'])
    expect(watcher.watched()).toEqual(['/a', '/b'])
    expect(watchCalls).toEqual(['/a', '/b'])

    watcher.arm(['/b', '/c'])
    expect(watcher.watched()).toEqual(['/b', '/c'])
    expect(watchCalls).toEqual(['/a', '/b', '/c'])
    expect(closed).toEqual(['/a'])
  })

  it('某个目录监不起来只 warn，其余目录照常监听', () => {
    const log = collectingLog()
    failing.add('/bad')
    const watcher = new DirectoryWatcher(watchIo(), () => {}, log)

    expect(() => watcher.arm(['/ok', '/bad'])).not.toThrow()
    expect(watcher.watched()).toEqual(['/ok'])
    expect(log.warnings).toHaveLength(1)
    expect(log.warnings[0]).toContain('cannot watch /bad')
  })

  it('dispose 关闭全部监听并清空 watched', () => {
    const watcher = new DirectoryWatcher(watchIo(), () => {}, collectingLog())
    watcher.arm(['/a', '/b'])

    watcher.dispose()

    expect(watcher.watched()).toEqual([])
    expect(closed.sort()).toEqual(['/a', '/b'])
  })

  describe('防抖（假定时器）', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it(`一次保存的多个事件合并成一次重扫（窗口 ${DEFAULT_DEBOUNCE_MS}ms）`, () => {
      const onChange = vi.fn()
      const watcher = new DirectoryWatcher(watchIo(), onChange, collectingLog(), DEFAULT_DEBOUNCE_MS)
      watcher.arm(['/a'])

      listeners.get('/a')?.()
      vi.advanceTimersByTime(100)
      expect(onChange).not.toHaveBeenCalled()
      // 第二次事件重置窗口。
      listeners.get('/a')?.()
      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 1)
      expect(onChange).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('不同目录的事件也合并进同一个窗口', () => {
      const onChange = vi.fn()
      const watcher = new DirectoryWatcher(watchIo(), onChange, collectingLog())
      watcher.arm(['/a', '/b'])

      listeners.get('/a')?.()
      listeners.get('/b')?.()
      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)

      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('dispose 丢弃挂起的重扫', () => {
      const onChange = vi.fn()
      const watcher = new DirectoryWatcher(watchIo(), onChange, collectingLog())
      watcher.arm(['/a'])
      listeners.get('/a')?.()

      watcher.dispose()
      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS * 4)

      expect(onChange).not.toHaveBeenCalled()
    })
  })
})
