// @vitest-environment jsdom
/**
 * 命令结果通知卡（`src/client/CommandNoticeCard.tsx`，spec: dsh-web-ux-command-feedback）。
 *
 * 用例通过真实组件 + 真实 store 驱动，覆盖五条要求：无处渲染才弹（可见性计数为
 * 零）、视图挂载即隐藏（计数变正）、全文可读且区分成败（展开/错误样式）、临时可关
 * （成功 10s 自动消失、展开冻结/收起恢复、错误仅手动关闭）与摘要截断（2.3 纯函数）。
 *
 * @module dsh-plugin-web-ux/test/notice-card
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CommandNoticeCard,
  type CommandNoticeCardProps,
  SUCCESS_TTL_MS,
  noticeSummary,
} from '../src/client/CommandNoticeCard.tsx'
import { createNoticeStore, type NoticeStore } from '../src/client/notice-store.ts'
import { zh, type Key } from '../src/client/locales.ts'

afterEach(cleanup)

/** 用 canonical 中文词典模拟框架注入的 `t`（通知词条无模板参数）。 */
function translate(key: Key): string {
  return zh[key]
}

/** 可手动发布计数的可见性源（包装形状同 notice-visibility 的产品）。 */
function countSource() {
  let snapshot = 0
  const listeners = new Set<() => void>()
  return {
    getSnapshot: (): number => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next: number): void {
      snapshot = next
      for (const listener of Array.from(listeners)) listener()
    },
  }
}

/** 渲染通知卡的入参。 */
interface RenderOptions {
  /** 事件到达前预置的可见性源；缺省 = 无信号（软降级路径）。 */
  readonly visibility?: ReturnType<typeof countSource> | undefined
}

/** 渲染通知卡并返回 store 与可见性源（无信号时为 undefined）。 */
function renderCard({ visibility }: RenderOptions = {}) {
  const store = createNoticeStore(vi.fn())
  const props = {
    sessionId: 'session-1',
    notices: store,
    visibilityFor: (sessionId: string) => (visibility === undefined || sessionId !== 'session-1' ? undefined : visibility),
    t: translate,
  } as unknown as CommandNoticeCardProps
  return { ...render(<CommandNoticeCard {...props} />), store }
}

/** 从事件桥路径塞一条成功通知。 */
async function offerSuccess(store: NoticeStore, text = '25 个 skill，2 个 MCP 服务器\n第二行'): Promise<void> {
  await act(async () => {
    store.offer('session-1', 'inventory', { kind: 'success', text })
  })
}

async function offerError(store: NoticeStore, text = '未知命令: foo'): Promise<void> {
  await act(async () => {
    store.offer('session-1', 'foo', { kind: 'error', text })
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('通知卡渲染条件', () => {
  it('无通知时不渲染任何 DOM', () => {
    const { container } = renderCard()
    expect(container.innerHTML).toBe('')
  })

  it('可见性计数为正（会话视图已打开）时，即使有通知也不渲染', async () => {
    const visibility = countSource()
    visibility.set(1)
    const { container, store } = renderCard({ visibility })
    await offerSuccess(store)

    expect(container.innerHTML).toBe('')
  })

  it('无可见性信号（sessions 服务缺席）时软降级：通知照常展示', async () => {
    const { store } = renderCard()
    await offerSuccess(store)

    expect(screen.getByText('命令执行成功')).toBeDefined()
  })

  it('展示期间计数 0→1（视图挂载）即自动隐藏，不分成败', async () => {
    const visibility = countSource()
    const { container, store } = renderCard({ visibility })
    await offerSuccess(store)
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    await offerError(store)
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    await act(async () => {
      visibility.set(1)
    })
    expect(container.innerHTML).toBe('')
  })
})

describe('通知卡形态', () => {
  it('折叠态：标题 + 命令名（补斜杠）+ 首行摘要，全文不可见', async () => {
    const { store } = renderCard()
    await offerSuccess(store, '25 个 skill，2 个 MCP 服务器\n第二行\n第三行')

    expect(screen.getByText('命令执行成功')).toBeDefined()
    expect(screen.getByText('/inventory')).toBeDefined()
    expect(screen.getByText('25 个 skill，2 个 MCP 服务器')).toBeDefined()
    expect(screen.queryByText(/第二行/)).toBeNull()
  })

  it('点击展开滚动全文（pre-wrap 区），再点收起', async () => {
    const { store } = renderCard()
    await offerSuccess(store, '第一行\n第二行')

    fireEvent.click(screen.getByRole('button', { name: zh['notice.expand'] }))
    expect(screen.getByText(/第二行/)).toBeDefined()
    expect(screen.getByRole('button', { name: zh['notice.collapse'] })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: zh['notice.collapse'] }))
    expect(screen.queryByText(/第二行/)).toBeNull()
  })

  it('错误卡带错误样式类，标题区分成败', async () => {
    const { container, store } = renderCard()
    await offerError(store)

    expect(screen.getByText('命令执行失败')).toBeDefined()
    const card = container.querySelector('[role="status"]')
    expect(card?.className).toMatch(/error/)
  })

  it('同会话新命令替换旧卡内容', async () => {
    const { store } = renderCard()
    await offerSuccess(store)
    await offerError(store, '工具不存在')

    expect(screen.queryByText('命令执行成功')).toBeNull()
    expect(screen.getByText('命令执行失败')).toBeDefined()
    expect(screen.getByText('/foo')).toBeDefined()
  })

  it('手动关闭（关闭按钮）对成功/错误卡都生效', async () => {
    const { container, store } = renderCard()
    await offerSuccess(store)

    fireEvent.click(screen.getByRole('button', { name: zh['notice.close'] }))
    expect(container.innerHTML).toBe('')
  })
})

describe('成功卡计时（共识④⑤）', () => {
  it(`成功卡 ${SUCCESS_TTL_MS / 1000}s 后自动消失`, async () => {
    vi.useFakeTimers()
    const { container, store } = renderCard()
    await offerSuccess(store)
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(SUCCESS_TTL_MS - 1)
    })
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(container.innerHTML).toBe('')
  })

  it('展开冻结计时，收起后从剩余时间恢复', async () => {
    vi.useFakeTimers()
    const { container, store } = renderCard()
    await offerSuccess(store)

    // 6s 后展开：剩余 4s 被冻结。
    await act(async () => {
      vi.advanceTimersByTime(6_000)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: zh['notice.expand'] }))
    })

    // 再过 10s（远超剩余）卡片仍在。
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    // 收起：恢复剩余 4s；3.9s 仍在，0.1s 后消失。
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: zh['notice.collapse'] }))
    })
    await act(async () => {
      vi.advanceTimersByTime(3_900)
    })
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(container.innerHTML).toBe('')
  })

  it('错误卡永不自动消失，仅手动关闭', async () => {
    vi.useFakeTimers()
    const { container, store } = renderCard()
    await offerError(store)

    await act(async () => {
      vi.advanceTimersByTime(SUCCESS_TTL_MS * 10)
    })
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: zh['notice.close'] }))
    expect(container.innerHTML).toBe('')
  })
})

describe('摘要截断（noticeSummary）', () => {
  it('多行文本取首个非空行', () => {
    expect(noticeSummary('\n  \n第二行才是正文\n第三行')).toBe('第二行才是正文')
  })

  it('超长单行截断加省略号', () => {
    const long = '长'.repeat(120)
    const summary = noticeSummary(long)
    expect(summary).toBe(`${'长'.repeat(80)}…`)
    expect(summary).toHaveLength(81)
  })

  it('空文本返回空串，行内首尾空白被修剪', () => {
    expect(noticeSummary('')).toBe('')
    expect(noticeSummary('\n\n')).toBe('')
    expect(noticeSummary('  hello  ')).toBe('hello')
  })

  it('helper 从不抛错（undefined 之类由 store 过滤，这里只对字符串负责）', () => {
    expect(noticeSummary('a'.repeat(10), 5)).toBe('aaaaa…')
  })
})
