/**
 * 显示格式纯函数（`src/client/display-format.ts`）的单测。
 *
 * 纯 node 环境：短码与路径尾段是纯字符串运算；紧凑时间用注入的 `now` 固定「今年」
 * 参照，期望值用同一组本地 getter 独立重算——不依赖 CI 时区，`toLocaleString()` 全串
 * 与实现同源同参直接比对。
 *
 * @module dsh-plugin-web-ux/test/display-format
 */

import { describe, expect, it } from 'vitest'
import {
  SHORT_CODE_LENGTH,
  formatCompactTimestamp,
  shortCodeOf,
  tailSegmentOf,
} from '../src/client/display-format.ts'

/** 两位补零（测试独立重算用，与实现不共享代码）。 */
function pad(value: number): string {
  return String(value).padStart(2, '0')
}

describe('shortCodeOf', () => {
  it('超过 16 字符截断并补省略号，短值原样返回', () => {
    expect(SHORT_CODE_LENGTH).toBe(16)
    expect(shortCodeOf('session-0123456789ab')).toBe('session-01234567…')
    expect(shortCodeOf('session-0123')).toBe('session-0123')
    expect(shortCodeOf('')).toBe('')
  })

  it('边界：恰 16 保留、17 截断', () => {
    const exactly = 'a'.repeat(SHORT_CODE_LENGTH)
    expect(shortCodeOf(exactly)).toBe(exactly)
    expect(shortCodeOf(`${exactly}b`)).toBe(`${exactly}…`)
  })
})

describe('tailSegmentOf', () => {
  it('四分：POSIX 尾段 / Win32 尾段 / 根 / 缺失', () => {
    expect(tailSegmentOf('/home/dev/alpha/')).toBe('alpha')
    expect(tailSegmentOf('C:\\dev\\alpha')).toBe('alpha')
    expect(tailSegmentOf('/')).toBe(null)
    expect(tailSegmentOf(undefined)).toBe(null)
  })

  it('无尾分隔符取最后一段；空串与纯分隔符为 null', () => {
    expect(tailSegmentOf('/home/dev/alpha')).toBe('alpha')
    expect(tailSegmentOf('')).toBe(null)
    expect(tailSegmentOf('\\')).toBe(null)
  })
})

describe('formatCompactTimestamp', () => {
  /** 「今年」参照：2026-06-01 本地时间。 */
  const now = new Date(2026, 5, 1)

  it('同年输入：MM-DD HH:mm，与本地 getter 独立重算一致', () => {
    const date = new Date(2026, 5, 1, 9, 5)
    const result = formatCompactTimestamp(date.getTime(), now)
    expect(result.text).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(result.text).toBe('06-01 09:05')
    expect(result.text).toBe(
      `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`,
    )
    expect(result.full).toBe(date.toLocaleString())
  })

  it('跨年输入：YYYY-MM-DD HH:mm，与本地 getter 独立重算一致', () => {
    const date = new Date(2025, 11, 31, 23, 59)
    const result = formatCompactTimestamp(date.getTime(), now)
    expect(result.text).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(result.text).toBe('2025-12-31 23:59')
    expect(result.text).toBe(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`,
    )
    expect(result.full).toBe(date.toLocaleString())
  })

  it('缺省 now：以真实当前年判定同年 / 跨年两分支', () => {
    const thisYear = new Date().getFullYear()
    expect(formatCompactTimestamp(new Date(thisYear, 0, 2, 3, 4).getTime()).text).toMatch(
      /^\d{2}-\d{2} \d{2}:\d{2}$/,
    )
    expect(
      formatCompactTimestamp(new Date(thisYear - 1, 0, 2, 3, 4).getTime()).text,
    ).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('不可解释的值按「未知」处理：text 破折号、full 空串', () => {
    expect(formatCompactTimestamp(0, now)).toEqual({ text: '—', full: '' })
    expect(formatCompactTimestamp(-5, now)).toEqual({ text: '—', full: '' })
    expect(formatCompactTimestamp(Number.NaN, now)).toEqual({ text: '—', full: '' })
  })
})
