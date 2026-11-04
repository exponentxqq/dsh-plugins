/**
 * 线上契约的边界校验（`src/contract.ts`）。
 *
 * 两个端点的请求体都来自浏览器、响应体都来自宿主：两侧形状都只是承诺，真正兜住
 * 版本漂移与恶意/错误输入的是这里的 parser。因此每个 parser 都要覆盖「合法」与
 * 各类「非法」形状，非法输入必须变成一句可读原因，而不是抛出或静默通过。
 *
 * @module dsh-plugin-web-ux/test/contract
 */

import { describe, expect, it } from 'vitest'
import {
  CHANNEL,
  DELETE_ENDPOINT,
  DISPOSAL_MODES,
  ENDPOINTS,
  FAILURE_CODES,
  PREVIEW_ENDPOINT,
  isDisposalMode,
  isFailureCode,
  parseDeleteRequest,
  parseFailure,
  parseOutcome,
  parsePreview,
} from '../src/contract.ts'

describe('词汇表', () => {
  it('通道与两个端点名是共享常量', () => {
    expect(CHANNEL).toBe('/web-ux')
    expect(PREVIEW_ENDPOINT).toBe('preview-delete')
    expect(DELETE_ENDPOINT).toBe('delete-session')
    expect(ENDPOINTS).toEqual(['preview-delete', 'delete-session'])
  })

  it('处置模式集合稳定，未知取值不被当成已知模式', () => {
    expect(DISPOSAL_MODES).toEqual(['delete', 'archive'])
    expect(isDisposalMode('delete')).toBe(true)
    expect(isDisposalMode('archive')).toBe(true)
    expect(isDisposalMode('purge')).toBe(false)
    expect(isDisposalMode(42)).toBe(false)
    expect(isDisposalMode(undefined)).toBe(false)
  })

  it('失败码集合稳定，未知码不被当成已知码', () => {
    expect(FAILURE_CODES).toEqual([
      'bad-request',
      'not-found',
      'not-archived',
      'session-live',
      'archive-unavailable',
      'internal',
    ])
    expect(isFailureCode('not-archived')).toBe(true)
    expect(isFailureCode('archive-unavailable')).toBe(true)
    expect(isFailureCode('workspace/session-active')).toBe(false)
  })
})

describe('parseDeleteRequest', () => {
  it('接受合法请求体（两种处置模式）', () => {
    expect(parseDeleteRequest(PREVIEW_ENDPOINT, { sessionId: 'session-1', mode: 'archive' })).toEqual({
      ok: true,
      value: { sessionId: 'session-1', mode: 'archive' },
    })
    expect(parseDeleteRequest(DELETE_ENDPOINT, { sessionId: 'session-1', mode: 'delete' })).toEqual({
      ok: true,
      value: { sessionId: 'session-1', mode: 'delete' },
    })
  })

  it('拒绝未知端点', () => {
    const parsed = parseDeleteRequest('delete-everything', { sessionId: 'session-1', mode: 'archive' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain('delete-everything')
  })

  it.each([
    ['缺少 sessionId', { mode: 'archive' }],
    ['sessionId 为空串', { sessionId: '', mode: 'archive' }],
    ['sessionId 不是字符串', { sessionId: 7, mode: 'archive' }],
    ['请求体是数组', []],
    ['请求体是 null', null],
    ['请求体是标量', 'session-1'],
    ['含未知字段', { sessionId: 'session-1', mode: 'archive', force: true }],
  ])('拒绝非法请求体：%s', (_label, payload) => {
    expect(parseDeleteRequest(DELETE_ENDPOINT, payload).ok).toBe(false)
  })

  it.each([
    ['缺少 mode（无隐式默认）', { sessionId: 'session-1' }],
    ['mode 是未知取值', { sessionId: 'session-1', mode: 'purge' }],
    ['mode 不是字符串', { sessionId: 'session-1', mode: 42 }],
  ])('拒绝非法处置模式：%s', (_label, payload) => {
    const parsed = parseDeleteRequest(DELETE_ENDPOINT, payload)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain('mode')
  })

  it('拒绝超长 sessionId', () => {
    expect(parseDeleteRequest(DELETE_ENDPOINT, { sessionId: 'x'.repeat(257), mode: 'archive' }).ok).toBe(false)
  })

  it('255 字符是接受边界，256 字符被拒（与文件系统单段上限一致）', () => {
    expect(parseDeleteRequest(DELETE_ENDPOINT, { sessionId: 'x'.repeat(255), mode: 'archive' }).ok).toBe(true)
    expect(parseDeleteRequest(DELETE_ENDPOINT, { sessionId: 'x'.repeat(256), mode: 'archive' }).ok).toBe(false)
  })

  it('拒绝含控制字符（含 NUL）的 sessionId', () => {
    expect(parseDeleteRequest(DELETE_ENDPOINT, { sessionId: 'a\u0000b', mode: 'archive' }).ok).toBe(false)
    expect(parseDeleteRequest(DELETE_ENDPOINT, { sessionId: 'a\nb', mode: 'archive' }).ok).toBe(false)
    expect(parseDeleteRequest(DELETE_ENDPOINT, { sessionId: 'a\u007fb', mode: 'archive' }).ok).toBe(false)
  })
})

describe('parsePreview', () => {
  const valid = { sessionCount: 3, descendantCount: 2, logBytes: 1024, archiveRoot: '/home/u/.dsh/archive/sessions' }

  it('接受合法预览', () => {
    expect(parsePreview(valid)).toEqual({ ok: true, value: valid })
  })

  it('接受零值（空级联与空目录都是合法状态）', () => {
    expect(parsePreview({ sessionCount: 1, descendantCount: 0, logBytes: 0, archiveRoot: '/archive' }).ok).toBe(true)
  })

  it.each([
    ['缺字段', { sessionCount: 1, descendantCount: 0, archiveRoot: '/archive' }],
    ['计数为负数', { sessionCount: -1, descendantCount: 0, logBytes: 0, archiveRoot: '/archive' }],
    ['计数非整数', { sessionCount: 1.5, descendantCount: 0, logBytes: 0, archiveRoot: '/archive' }],
    [
      '计数超出安全整数',
      { sessionCount: Number.MAX_SAFE_INTEGER + 1, descendantCount: 0, logBytes: 0, archiveRoot: '/archive' },
    ],
    ['logBytes 为 NaN', { sessionCount: 1, descendantCount: 0, logBytes: Number.NaN, archiveRoot: '/archive' }],
    [
      'logBytes 为 Infinity',
      { sessionCount: 1, descendantCount: 0, logBytes: Number.POSITIVE_INFINITY, archiveRoot: '/archive' },
    ],
    ['logBytes 为字符串', { sessionCount: 1, descendantCount: 0, logBytes: '1024', archiveRoot: '/archive' }],
    ['响应是数组', []],
    ['响应是 null', null],
  ])('拒绝非法预览：%s', (_label, value) => {
    expect(parsePreview(value).ok).toBe(false)
  })

  it.each([
    ['archiveRoot 缺失', { sessionCount: 1, descendantCount: 0, logBytes: 0 }],
    ['archiveRoot 为空串', { sessionCount: 1, descendantCount: 0, logBytes: 0, archiveRoot: '' }],
    ['archiveRoot 不是字符串', { sessionCount: 1, descendantCount: 0, logBytes: 0, archiveRoot: 42 }],
    ['archiveRoot 为 null', { sessionCount: 1, descendantCount: 0, logBytes: 0, archiveRoot: null }],
  ])('拒绝非法归档根：%s', (_label, value) => {
    const parsed = parsePreview(value)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain('archiveRoot')
  })
})

describe('parseOutcome', () => {
  it('接受合法执行结果（warnings 可为空）', () => {
    const value = { removed: ['session-1', 'session-2'], warnings: [] }
    expect(parseOutcome(value)).toEqual({ ok: true, value })
  })

  it('接受带 warnings 的结果', () => {
    const value = { removed: ['session-1'], warnings: ['/home/u/.dsh/sessions/p/session-1: EACCES'] }
    expect(parseOutcome(value)).toEqual({ ok: true, value })
  })

  it.each([
    ['removed 为空数组（一次成功删除不可能移除零个会话）', { removed: [], warnings: [] }],
    ['removed 缺字段', { warnings: [] }],
    ['removed 含非字符串项', { removed: ['session-1', 2], warnings: [] }],
    ['warnings 不是数组', { removed: ['session-1'], warnings: 'none' }],
    ['warnings 含非字符串项', { removed: ['session-1'], warnings: [{}] }],
    ['响应是数组', []],
  ])('拒绝非法执行结果：%s', (_label, value) => {
    expect(parseOutcome(value).ok).toBe(false)
  })
})

describe('parseFailure', () => {
  it('接受失败信封', () => {
    expect(parseFailure({ code: 'not-archived', message: 'not archived' })).toEqual({
      code: 'not-archived',
      message: 'not archived',
    })
  })

  it('未知码仍按信封解析（由调用方兜底渲染）', () => {
    expect(parseFailure({ code: 'workspace/session-active', message: 'x' })).toEqual({
      code: 'workspace/session-active',
      message: 'x',
    })
  })

  it.each([
    ['缺 message', { code: 'internal' }],
    ['空 code', { code: '', message: 'x' }],
    ['非字符串 code', { code: 3, message: 'x' }],
    ['不是对象', 'internal'],
    ['是数组', []],
    ['是 null', null],
  ])('拒绝非法信封：%s', (_label, value) => {
    expect(parseFailure(value)).toBeUndefined()
  })
})
