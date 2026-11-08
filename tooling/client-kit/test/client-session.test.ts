/**
 * 当前会话探测与会话用量投影的纯度用例（`code-design.md` ③ §3.10）。
 *
 * 两条事实共用同一个列表快照：`current` 显式选择 / `byId[*].retainedBy.mainView > 0`
 * 回退，以及 `{ updatedAtById }` 投影。快照形状以 `unknown` 逐层收窄，因此这里既钉住
 * 本基线（0.2.2-rc.1：`ids` / `byId` / `phase` / `projectionsBySession`，无 `current`）
 * 的回退路径，也钉住「服务缺席 / 形状不符 / store 抛错」全部降级为 `undefined`。
 */

import { describe, expect, it } from 'vitest'
import type { SessionUsageSnapshot } from '../src/client-session.ts'
import { currentSessionIdOf, sessionUsageOf } from '../src/client-session.ts'

/** 一条按 0.2.2-rc.1 形状投影的目录行（`mainView` 省略 = 没有该来源）。 */
function row(
  id: string | undefined,
  mainView?: number,
  extra: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const retainedBy = mainView === undefined ? {} : { mainView }
  return { ...(id === undefined ? {} : { id }), retainedBy, ...extra }
}

/** 一个列表快照就是 `snapshot` 的假 `sessions` 服务。 */
function sessionsOf(snapshot: unknown): { list: { getSnapshot: () => unknown } } {
  return { list: { getSnapshot: () => snapshot } }
}

/** 本基线（0.2.2-rc.1）列表快照的四栏；`byId` 单独给。 */
function baselineSnapshot(
  byId: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ids: Object.keys(byId), byId, phase: 'ready', projectionsBySession: {} }
}

describe('currentSessionIdOf：两步结构探测', () => {
  it('读显式选择（local 字段在 shared 快照里时直接返回）', () => {
    expect(currentSessionIdOf(sessionsOf({ current: 'session-1' }))).toBe('session-1')
  })

  it('显式选择优先于另一条主视图持有的行', () => {
    expect(currentSessionIdOf(sessionsOf({
      current: 'session-selected',
      byId: { 'session-main': row('session-main', 1) },
    }))).toBe('session-selected')
  })

  it('没有 current 字段时回退到主视图持有的行（本基线路径）', () => {
    expect(currentSessionIdOf(sessionsOf(baselineSnapshot({
      'session-other': row('session-other'),
      'session-main': row('session-main', 1),
    })))).toBe('session-main')
  })

  it('行 id 与目录键不同时用行 id', () => {
    expect(currentSessionIdOf(sessionsOf({
      byId: { 'catalog-key': row('session-real', 1) },
    }))).toBe('session-real')
  })

  it('行没有 id 时回退目录键', () => {
    expect(currentSessionIdOf(sessionsOf({
      byId: { 'session-key': row(undefined, 2) },
    }))).toBe('session-key')
  })

  it('目录有行但没有任何主视图持有的行时返回 undefined', () => {
    expect(currentSessionIdOf(sessionsOf(baselineSnapshot({
      'session-other': row('session-other'),
      'session-zero': row('session-zero', 0),
    })))).toBeUndefined()
  })

  it('mainView 计数非正数或非数值都不算持有', () => {
    expect(currentSessionIdOf(sessionsOf({ byId: { a: row('a', 0) } }))).toBeUndefined()
    expect(currentSessionIdOf(sessionsOf({ byId: { a: row('a', -1) } }))).toBeUndefined()
    expect(currentSessionIdOf(sessionsOf({
      byId: { 'session-1': { id: 'session-1', retainedBy: { mainView: '1' } } },
    }))).toBeUndefined()
  })

  it('跳过不是行的目录值并继续扫描', () => {
    expect(currentSessionIdOf(sessionsOf({
      byId: { broken: null, 'session-main': row('session-main', 1) },
    }))).toBe('session-main')
  })

  it('getSnapshot 按方法调用，store 的 this 不丢', () => {
    const store = {
      current: 'session-this',
      getSnapshot(): { current: string } {
        return { current: this.current }
      },
    }
    expect(currentSessionIdOf({ list: store })).toBe('session-this')
  })

  it('空 session：空目录、空快照、空 current 都返回 undefined', () => {
    expect(currentSessionIdOf(sessionsOf(baselineSnapshot({})))).toBeUndefined()
    expect(currentSessionIdOf(sessionsOf({}))).toBeUndefined()
    expect(currentSessionIdOf(sessionsOf({ current: '' }))).toBeUndefined()
    expect(currentSessionIdOf(sessionsOf({ current: undefined }))).toBeUndefined()
  })

  it('服务缺席或形状不符时返回 undefined（降级而非抛错）', () => {
    expect(currentSessionIdOf(undefined)).toBeUndefined()
    expect(currentSessionIdOf(null)).toBeUndefined()
    expect(currentSessionIdOf({})).toBeUndefined()
    expect(currentSessionIdOf('sessions')).toBeUndefined()
    expect(currentSessionIdOf({ list: {} })).toBeUndefined()
    expect(currentSessionIdOf({ list: null })).toBeUndefined()
    expect(currentSessionIdOf(sessionsOf(null))).toBeUndefined()
    expect(currentSessionIdOf(sessionsOf('session-1'))).toBeUndefined()
    expect(currentSessionIdOf(sessionsOf({ byId: null }))).toBeUndefined()
    expect(currentSessionIdOf(sessionsOf({ byId: 'session-1' }))).toBeUndefined()
  })

  it('getSnapshot 抛错时返回 undefined', () => {
    expect(currentSessionIdOf({
      list: {
        getSnapshot(): unknown {
          throw new Error('store closed')
        },
      },
    })).toBeUndefined()
  })
})

describe('sessionUsageOf：updatedAt 投影', () => {
  it('投影每个目录行的 updatedAt，键取会话 id', () => {
    const usage: SessionUsageSnapshot | undefined = sessionUsageOf(sessionsOf(baselineSnapshot({
      'session-a': row('session-a', 1, { updatedAt: 10, title: 'A' }),
      'session-b': row('session-b', undefined, { updatedAt: 20, displayTitle: 'B' }),
    })))
    expect(usage).toEqual({
      updatedAtById: {
        'session-a': { updatedAt: 10 },
        'session-b': { updatedAt: 20 },
      },
    })
  })

  it('只投影 updatedAt 一栏，行上的展示字段不进读数', () => {
    const usage = sessionUsageOf(sessionsOf(baselineSnapshot({
      'session-a': {
        id: 'session-a',
        updatedAt: 7,
        title: '标题',
        displayTitle: '标题',
        projectionValues: { tokens: 1 },
        retainedBy: { mainView: 1 },
      },
    })))
    expect(usage).toEqual({ updatedAtById: { 'session-a': { updatedAt: 7 } } })
    expect(Object.keys(usage?.updatedAtById['session-a'] ?? {})).toEqual(['updatedAt'])
  })

  it('行 id 与目录键不同时键取行 id', () => {
    expect(sessionUsageOf(sessionsOf({
      byId: { 'catalog-key': { id: 'session-real', updatedAt: 3 } },
    }))).toEqual({ updatedAtById: { 'session-real': { updatedAt: 3 } } })
  })

  it('行没有 id 时键回退目录键', () => {
    expect(sessionUsageOf(sessionsOf({
      byId: { 'session-key': { updatedAt: 4 } },
    }))).toEqual({ updatedAtById: { 'session-key': { updatedAt: 4 } } })
  })

  it('跳过 updatedAt 非有限数的行', () => {
    expect(sessionUsageOf(sessionsOf({
      byId: {
        'session-string': { id: 'session-string', updatedAt: '10' },
        'session-nan': { id: 'session-nan', updatedAt: Number.NaN },
        'session-infinity': { id: 'session-infinity', updatedAt: Number.POSITIVE_INFINITY },
        'session-missing': { id: 'session-missing' },
        'session-ok': { id: 'session-ok', updatedAt: 0 },
      },
    }))).toEqual({ updatedAtById: { 'session-ok': { updatedAt: 0 } } })
  })

  it('跳过不是行的目录值', () => {
    expect(sessionUsageOf(sessionsOf({
      byId: { broken: null, 'session-ok': { id: 'session-ok', updatedAt: 1 } },
    }))).toEqual({ updatedAtById: { 'session-ok': { updatedAt: 1 } } })
  })

  it('重复 id 先到先得，后到的行不改写已投影的读数', () => {
    expect(sessionUsageOf(sessionsOf({
      byId: {
        first: { id: 'session-dup', updatedAt: 1 },
        second: { id: 'session-dup', updatedAt: 2 },
      },
    }))).toEqual({ updatedAtById: { 'session-dup': { updatedAt: 1 } } })
  })

  it('空 session：服务在场但目录为空时返回空投影（不是 undefined）', () => {
    expect(sessionUsageOf(sessionsOf(baselineSnapshot({})))).toEqual({ updatedAtById: {} })
    expect(sessionUsageOf(sessionsOf({}))).toEqual({ updatedAtById: {} })
    expect(sessionUsageOf(sessionsOf({ byId: null }))).toEqual({ updatedAtById: {} })
  })

  it('服务缺席或不可读时返回 undefined', () => {
    expect(sessionUsageOf(undefined)).toBeUndefined()
    expect(sessionUsageOf(null)).toBeUndefined()
    expect(sessionUsageOf({})).toBeUndefined()
    expect(sessionUsageOf({ list: {} })).toBeUndefined()
    expect(sessionUsageOf(sessionsOf(null))).toBeUndefined()
    expect(sessionUsageOf(sessionsOf('snapshot'))).toBeUndefined()
  })

  it('getSnapshot 抛错时返回 undefined', () => {
    expect(sessionUsageOf({
      list: {
        getSnapshot(): unknown {
          throw new Error('store closed')
        },
      },
    })).toBeUndefined()
  })
})
