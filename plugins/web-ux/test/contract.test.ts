/**
 * 线上契约的边界校验（`src/contract.ts`）。
 *
 * 七个端点（单会话 / 批量 / 已迁移三域）的请求体都来自浏览器、响应体都来自宿主：
 * 两侧形状都只是承诺，真正兜住版本漂移与恶意/错误输入的是这里的 parser。因此每个
 * parser 都要覆盖「合法」与各类「非法」形状，非法输入必须变成一句可读原因，而不是
 * 抛出或静默通过。
 *
 * @module dsh-plugin-web-ux/test/contract
 */

import { describe, expect, it } from 'vitest'
import {
  CHANNEL,
  DELETE_BATCH_ENDPOINT,
  DELETE_ENDPOINT,
  DELETE_MIGRATED_ENDPOINT,
  DISPOSAL_MODES,
  ENDPOINTS,
  FAILURE_CODES,
  LIST_MIGRATED_ENDPOINT,
  MAX_BATCH_TARGETS,
  MAX_LISTED_MIGRATED,
  PREVIEW_BATCH_ENDPOINT,
  PREVIEW_ENDPOINT,
  RESTORE_MIGRATED_ENDPOINT,
  isDisposalMode,
  isFailureCode,
  parseBatchPreview,
  parseDeleteRequest,
  parseFailure,
  parseMigratedListing,
  parseOutcome,
  parsePreview,
  parseRequest,
  parseRestoreOutcome,
} from '../src/contract.ts'

/** 生成 `count` 个互不相同的合法会话 id（用于 500 条上限两侧的边界用例）。 */
function makeSessionIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `session-${index}`)
}

/** 生成 `count` 个合法归档条目（同上）。 */
function makeMigratedEntries(count: number): { projectDir: string; dirName: string }[] {
  return Array.from({ length: count }, (_, index) => ({ projectDir: '--home-u--', dirName: `session-${index}` }))
}

describe('词汇表', () => {
  it('通道与七个端点名是共享常量', () => {
    expect(CHANNEL).toBe('/web-ux')
    expect(PREVIEW_ENDPOINT).toBe('preview-delete')
    expect(DELETE_ENDPOINT).toBe('delete-session')
    expect(ENDPOINTS).toEqual([
      'preview-delete',
      'delete-session',
      'preview-delete-batch',
      'delete-session-batch',
      'list-migrated',
      'delete-migrated',
      'restore-migrated',
    ])
  })

  it('批量与列表上限常量固定', () => {
    expect(MAX_BATCH_TARGETS).toBe(500)
    expect(MAX_LISTED_MIGRATED).toBe(2000)
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
      'not-migrated',
      'target-exists',
      'session-live',
      'archive-unavailable',
      'internal',
    ])
    expect(isFailureCode('not-archived')).toBe(true)
    expect(isFailureCode('not-migrated')).toBe(true)
    expect(isFailureCode('target-exists')).toBe(true)
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

  it('只认两个单会话端点：批量 / 迁移端点名不被旧分派路径接受', () => {
    expect(parseDeleteRequest(PREVIEW_BATCH_ENDPOINT, { sessionIds: ['session-1'], mode: 'archive' }).ok).toBe(false)
    expect(parseDeleteRequest(DELETE_MIGRATED_ENDPOINT, { entries: [{ projectDir: 'p', dirName: 'd' }] }).ok).toBe(
      false,
    )
  })
})

describe('parseRequest', () => {
  it.each([
    [PREVIEW_ENDPOINT, { sessionId: 'session-1', mode: 'archive' }],
    [DELETE_ENDPOINT, { sessionId: 'session-1', mode: 'delete' }],
    [PREVIEW_BATCH_ENDPOINT, { sessionIds: ['session-1', 'session-2'], mode: 'archive' }],
    [DELETE_BATCH_ENDPOINT, { sessionIds: ['session-1'], mode: 'delete' }],
    [LIST_MIGRATED_ENDPOINT, {}],
    [DELETE_MIGRATED_ENDPOINT, { entries: [{ projectDir: '--home-u--', dirName: 'session-1' }] }],
    [RESTORE_MIGRATED_ENDPOINT, { entries: [{ projectDir: '--home-u--', dirName: 'session-1' }] }],
  ])('把 %s 的合法请求分派成带端点标签的判别联合', (endpoint, payload) => {
    expect(parseRequest(endpoint, payload)).toEqual({ ok: true, value: { endpoint, body: payload } })
  })

  it('拒绝未知端点，并把端点名写进原因', () => {
    const parsed = parseRequest('delete-everything', {})
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain('delete-everything')
  })

  it.each([
    ['单会话请求体发给批量端点', DELETE_BATCH_ENDPOINT, { sessionId: 'session-1', mode: 'archive' }],
    ['批量请求体发给单会话端点', PREVIEW_ENDPOINT, { sessionIds: ['session-1'], mode: 'archive' }],
    ['迁移请求体发给 list-migrated', LIST_MIGRATED_ENDPOINT, { entries: [{ projectDir: 'p', dirName: 'd' }] }],
    ['空请求体发给 delete-migrated', DELETE_MIGRATED_ENDPOINT, {}],
    ['单会话请求体发给迁移端点', RESTORE_MIGRATED_ENDPOINT, { sessionId: 'session-1', mode: 'archive' }],
  ])('拒绝端点与请求体形状不匹配：%s', (_label, endpoint, payload) => {
    expect(parseRequest(endpoint, payload).ok).toBe(false)
  })

  it.each([
    ['请求体为 null', null],
    ['请求体为数组', []],
    ['请求体为标量', 'session-1'],
  ])('每条分派路径都要求请求体是普通对象（%s）', (_label, payload) => {
    for (const endpoint of ENDPOINTS) {
      expect(parseRequest(endpoint, payload).ok).toBe(false)
    }
  })
})

describe('parseRequest：批量请求（sessionIds）', () => {
  const endpoint = DELETE_BATCH_ENDPOINT

  it('接受 1..500 个目标，重复 id 原样保留（去重是宿主的事）', () => {
    expect(parseRequest(endpoint, { sessionIds: ['session-1', 'session-1'], mode: 'archive' })).toEqual({
      ok: true,
      value: { endpoint, body: { sessionIds: ['session-1', 'session-1'], mode: 'archive' } },
    })
  })

  it('255 字符的 id 被接受（与单会话共用路径片段上限）', () => {
    expect(parseRequest(endpoint, { sessionIds: ['x'.repeat(255)], mode: 'delete' }).ok).toBe(true)
  })

  it.each([PREVIEW_BATCH_ENDPOINT, DELETE_BATCH_ENDPOINT])('500 是单批接受上限，501 被拒（%s）', (name) => {
    expect(parseRequest(name, { sessionIds: makeSessionIds(MAX_BATCH_TARGETS), mode: 'archive' }).ok).toBe(true)
    const parsed = parseRequest(name, { sessionIds: makeSessionIds(MAX_BATCH_TARGETS + 1), mode: 'archive' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain(String(MAX_BATCH_TARGETS))
  })

  it.each([
    ['sessionIds 缺失', { mode: 'archive' }],
    ['sessionIds 不是数组', { sessionIds: 'session-1', mode: 'archive' }],
    ['sessionIds 为空数组', { sessionIds: [], mode: 'archive' }],
    ['含未知字段', { sessionIds: ['session-1'], mode: 'archive', force: true }],
    ['含未知字段且缺 mode', { sessionIds: ['session-1'], dryRun: false }],
  ])('拒绝非法批量请求：%s', (_label, payload) => {
    expect(parseRequest(endpoint, payload).ok).toBe(false)
  })

  it.each([
    ['mode 缺失（无隐式默认）', { sessionIds: ['session-1'] }],
    ['mode 是未知取值', { sessionIds: ['session-1'], mode: 'purge' }],
    ['mode 不是字符串', { sessionIds: ['session-1'], mode: 42 }],
  ])('拒绝非法批量处置模式：%s', (_label, payload) => {
    const parsed = parseRequest(endpoint, payload)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain('mode')
  })

  it.each([
    ['某项为空串', ['session-1', '']],
    ['某项不是字符串', ['session-1', 7]],
    ['某项是 null', [null]],
    ['某项超长（256）', ['x'.repeat(256)]],
    ['某项是 .', ['.']],
    ['某项是 ..', ['..']],
    ['某项含 /', ['a/b']],
    ['某项含 \\', ['a\\b']],
    ['某项含 NUL', ['a\u0000b']],
    ['某项含 \\u007f', ['a\u007fb']],
    ['某项含换行', ['a\nb']],
  ])('拒绝非法 sessionIds 项：%s', (_label, sessionIds) => {
    expect(parseRequest(endpoint, { sessionIds, mode: 'archive' }).ok).toBe(false)
  })
})

describe('parseRequest：迁移请求（entries）', () => {
  const endpoint = DELETE_MIGRATED_ENDPOINT
  const target = { projectDir: '--home-u--', dirName: 'session-1' }

  it.each([DELETE_MIGRATED_ENDPOINT, RESTORE_MIGRATED_ENDPOINT])('%s 接受 1..500 个条目，501 被拒', (name) => {
    expect(parseRequest(name, { entries: [target] })).toEqual({
      ok: true,
      value: { endpoint: name, body: { entries: [target] } },
    })
    expect(parseRequest(name, { entries: makeMigratedEntries(MAX_BATCH_TARGETS) }).ok).toBe(true)
    const parsed = parseRequest(name, { entries: makeMigratedEntries(MAX_BATCH_TARGETS + 1) })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain(String(MAX_BATCH_TARGETS))
  })

  it('接受 _no-cwd 与两代目录名（目录名即 id，不做前缀归一）', () => {
    const entries = [
      { projectDir: '_no-cwd', dirName: '05307715-uuid' },
      { projectDir: '--home-u--', dirName: 'session-053fe971-uuid' },
    ]
    expect(parseRequest(RESTORE_MIGRATED_ENDPOINT, { entries })).toEqual({
      ok: true,
      value: { endpoint: RESTORE_MIGRATED_ENDPOINT, body: { entries } },
    })
  })

  it('255 字符的 projectDir / dirName 被接受（同一路径片段上限）', () => {
    const entries = [{ projectDir: 'p'.repeat(255), dirName: 'd'.repeat(255) }]
    expect(parseRequest(endpoint, { entries }).ok).toBe(true)
  })

  it.each([
    ['entries 缺失', {}],
    ['entries 不是数组', { entries: target }],
    ['entries 为空数组', { entries: [] }],
    ['含未知字段', { entries: [target], mode: 'delete' }],
  ])('拒绝非法迁移请求：%s', (_label, payload) => {
    expect(parseRequest(endpoint, payload).ok).toBe(false)
  })

  it.each([
    ['条目是标量', 'session-1'],
    ['条目是数组', [target]],
    ['条目是 null', null],
    ['条目缺 dirName', { projectDir: 'p' }],
    ['条目缺 projectDir', { dirName: 'd' }],
    ['条目多一个键', { projectDir: 'p', dirName: 'd', sessionId: 's' }],
  ])('拒绝非法条目形状：%s', (_label, entry) => {
    expect(parseRequest(endpoint, { entries: [entry] }).ok).toBe(false)
  })

  it.each([
    ['projectDir 为空串', { projectDir: '', dirName: 'd' }],
    ['projectDir 不是字符串', { projectDir: 7, dirName: 'd' }],
    ['projectDir 超长（256）', { projectDir: 'x'.repeat(256), dirName: 'd' }],
    ['projectDir 是 .', { projectDir: '.', dirName: 'd' }],
    ['projectDir 是 ..', { projectDir: '..', dirName: 'd' }],
    ['projectDir 含 /', { projectDir: 'a/b', dirName: 'd' }],
    ['projectDir 含 \\', { projectDir: 'a\\b', dirName: 'd' }],
    ['projectDir 含 NUL', { projectDir: 'a\u0000b', dirName: 'd' }],
    ['dirName 为空串', { projectDir: 'p', dirName: '' }],
    ['dirName 不是字符串', { projectDir: 'p', dirName: 7 }],
    ['dirName 超长（256）', { projectDir: 'p', dirName: 'x'.repeat(256) }],
    ['dirName 是 .', { projectDir: 'p', dirName: '.' }],
    ['dirName 是 ..', { projectDir: 'p', dirName: '..' }],
    ['dirName 含 /', { projectDir: 'p', dirName: 'a/b' }],
    ['dirName 含 \\', { projectDir: 'p', dirName: 'a\\b' }],
    ['dirName 含 \\u007f', { projectDir: 'p', dirName: 'a\u007fb' }],
  ])('拒绝非法路径片段：%s', (_label, entry) => {
    expect(parseRequest(endpoint, { entries: [entry] }).ok).toBe(false)
  })
})

describe('parseRequest：list-migrated 空请求体', () => {
  it('接受空对象', () => {
    expect(parseRequest(LIST_MIGRATED_ENDPOINT, {})).toEqual({
      ok: true,
      value: { endpoint: LIST_MIGRATED_ENDPOINT, body: {} },
    })
  })

  it.each([
    ['带一个字段', { cursor: 'x' }],
    ['带多个字段', { limit: 1, offset: 0 }],
  ])('拒绝任何字段：%s', (_label, payload) => {
    const parsed = parseRequest(LIST_MIGRATED_ENDPOINT, payload)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain('未知字段')
  })

  it.each([
    ['null', null],
    ['数组', []],
    ['标量', 'list-migrated'],
  ])('拒绝非对象请求体：%s', (_label, payload) => {
    expect(parseRequest(LIST_MIGRATED_ENDPOINT, payload).ok).toBe(false)
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

describe('parseBatchPreview', () => {
  const valid = {
    targetCount: 2,
    sessionCount: 3,
    descendantCount: 1,
    logBytes: 2048,
    archiveRoot: '/home/u/.dsh/archive/sessions',
    rejected: [],
  }

  it('接受合法批量预览（rejected 可为空）', () => {
    expect(parseBatchPreview(valid)).toEqual({ ok: true, value: valid })
  })

  it('接受零值计数与软失败项；未知失败码不做白名单', () => {
    const value = {
      targetCount: 0,
      sessionCount: 0,
      descendantCount: 0,
      logBytes: 0,
      archiveRoot: '/archive',
      rejected: [{ sessionId: 'session-1', code: 'workspace/session-active', message: '会话仍在运行' }],
    }
    expect(parseBatchPreview(value)).toEqual({ ok: true, value })
  })

  it('rejected[].message 允许空串（规则只要求字符串）', () => {
    const value = { ...valid, rejected: [{ sessionId: 'session-1', code: 'not-found', message: '' }] }
    expect(parseBatchPreview(value).ok).toBe(true)
  })

  it.each([
    ['空对象（计数与归档根全缺）', {}],
    ['targetCount 为负数', { ...valid, targetCount: -1 }],
    ['targetCount 非整数', { ...valid, targetCount: 1.5 }],
    ['targetCount 超安全整数', { ...valid, targetCount: Number.MAX_SAFE_INTEGER + 1 }],
    ['sessionCount 为 NaN', { ...valid, sessionCount: Number.NaN }],
    ['sessionCount 为 Infinity', { ...valid, sessionCount: Number.POSITIVE_INFINITY }],
    ['sessionCount 是字符串', { ...valid, sessionCount: '3' }],
    ['descendantCount 为负数', { ...valid, descendantCount: -1 }],
    ['descendantCount 不是数字', { ...valid, descendantCount: null }],
    ['logBytes 为负数', { ...valid, logBytes: -1 }],
    ['logBytes 为 NaN', { ...valid, logBytes: Number.NaN }],
    ['logBytes 为 Infinity', { ...valid, logBytes: Number.POSITIVE_INFINITY }],
    ['logBytes 是字符串', { ...valid, logBytes: '2048' }],
    ['缺 logBytes', { targetCount: 2, sessionCount: 3, descendantCount: 1, archiveRoot: '/archive', rejected: [] }],
    ['响应是数组', []],
    ['响应是 null', null],
    ['响应是标量', 'preview'],
  ])('拒绝非法批量预览：%s', (_label, value) => {
    expect(parseBatchPreview(value).ok).toBe(false)
  })

  it.each([
    ['archiveRoot 缺失', { ...valid, archiveRoot: undefined }],
    ['archiveRoot 为空串', { ...valid, archiveRoot: '' }],
    ['archiveRoot 为 null', { ...valid, archiveRoot: null }],
    ['archiveRoot 不是字符串', { ...valid, archiveRoot: 42 }],
  ])('拒绝非法归档根：%s', (_label, value) => {
    const parsed = parseBatchPreview(value)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain('archiveRoot')
  })

  it.each([
    ['rejected 缺失', { ...valid, rejected: undefined }],
    ['rejected 不是数组', { ...valid, rejected: {} }],
    ['rejected 项是 null', { ...valid, rejected: [null] }],
    ['rejected 项是标量', { ...valid, rejected: ['session-1'] }],
    ['sessionId 为空串', { ...valid, rejected: [{ sessionId: '', code: 'not-found', message: 'x' }] }],
    ['sessionId 不是字符串', { ...valid, rejected: [{ sessionId: 7, code: 'not-found', message: 'x' }] }],
    ['code 为空串', { ...valid, rejected: [{ sessionId: 's', code: '', message: 'x' }] }],
    ['code 不是字符串', { ...valid, rejected: [{ sessionId: 's', code: 3, message: 'x' }] }],
    ['message 不是字符串', { ...valid, rejected: [{ sessionId: 's', code: 'not-found', message: 3 }] }],
    ['message 缺失', { ...valid, rejected: [{ sessionId: 's', code: 'not-found' }] }],
  ])('拒绝非法软失败清单：%s', (_label, value) => {
    expect(parseBatchPreview(value).ok).toBe(false)
  })
})

describe('parseMigratedListing', () => {
  const entry = {
    sessionId: 'session-1',
    dirName: 'session-1',
    projectDir: '--home-u--',
    bytes: 1024,
    updatedAt: 1700000000000,
  }
  const valid = { archiveRoot: '/home/u/.dsh/archive/sessions', entries: [entry], truncated: false }

  it('接受合法已迁移列表', () => {
    expect(parseMigratedListing(valid)).toEqual({ ok: true, value: valid })
  })

  it('接受空条目列表与 truncated=true（空归档根是合法状态）', () => {
    const value = { archiveRoot: '/archive', entries: [], truncated: true }
    expect(parseMigratedListing(value)).toEqual({ ok: true, value })
  })

  it('条目不含 title / createdAt 键时，结果条目也不出现这两个键（缺省不占位）', () => {
    const parsed = parseMigratedListing(valid)
    expect(parsed).toEqual({ ok: true, value: valid })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.entries.length).toBe(1)
      expect('title' in parsed.value.entries[0]).toBe(false)
      expect('createdAt' in parsed.value.entries[0]).toBe(false)
    }
  })

  it('接受合法 title：trim 后非空即收下，wire 层原样保留（不 trim）', () => {
    const value = { ...valid, entries: [{ ...entry, title: '  标题  ' }] }
    const parsed = parseMigratedListing(value)
    expect(parsed).toEqual({ ok: true, value })
    expect(parsed.ok && parsed.value.entries[0].title === '  标题  ').toBe(true)
    if (parsed.ok) expect(parsed.value.entries[0].title).toBe('  标题  ')
  })

  it.each([
    ['title 为空串', ''],
    ['title 是纯空白', '   '],
    ['title 不是字符串', 7],
  ])('拒绝非法 title：%s', (_label, title) => {
    const parsed = parseMigratedListing({ ...valid, entries: [{ ...entry, title }] })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain('title')
  })

  it('接受合法 createdAt：正 epoch ms 原样收下', () => {
    const value = { ...valid, entries: [{ ...entry, createdAt: 1700000000000 }] }
    expect(parseMigratedListing(value)).toEqual({ ok: true, value })
  })

  it.each([
    ['createdAt 为 0（0 会渲染成 1970，必须缺键而不是写 0）', 0],
    ['createdAt 为负数', -1],
    ['createdAt 为 NaN', Number.NaN],
    ['createdAt 为 Infinity', Number.POSITIVE_INFINITY],
    ['createdAt 不是数字', '1700'],
  ])('拒绝非法 createdAt：%s', (_label, createdAt) => {
    const parsed = parseMigratedListing({ ...valid, entries: [{ ...entry, createdAt }] })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain('createdAt')
  })

  it.each([
    ['archiveRoot 缺失', { entries: [], truncated: false }],
    ['archiveRoot 为空串', { ...valid, archiveRoot: '' }],
    ['archiveRoot 不是字符串', { ...valid, archiveRoot: 42 }],
  ])('拒绝非法归档根：%s', (_label, value) => {
    const parsed = parseMigratedListing(value)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain('archiveRoot')
  })

  it.each([
    ['entries 缺失', { archiveRoot: '/archive', truncated: false }],
    ['entries 不是数组', { archiveRoot: '/archive', entries: {}, truncated: false }],
    ['entries 项是 null', { ...valid, entries: [null] }],
    ['entries 项是数组', { ...valid, entries: [[]] }],
    ['sessionId 为空串', { ...valid, entries: [{ ...entry, sessionId: '' }] }],
    ['sessionId 不是字符串', { ...valid, entries: [{ ...entry, sessionId: 7 }] }],
    ['dirName 为空串', { ...valid, entries: [{ ...entry, dirName: '' }] }],
    ['projectDir 不是字符串', { ...valid, entries: [{ ...entry, projectDir: 7 }] }],
    ['bytes 为负数', { ...valid, entries: [{ ...entry, bytes: -1 }] }],
    ['bytes 为 NaN', { ...valid, entries: [{ ...entry, bytes: Number.NaN }] }],
    ['bytes 不是数字', { ...valid, entries: [{ ...entry, bytes: '1024' }] }],
    ['bytes 缺失', { ...valid, entries: [{ sessionId: 's', dirName: 's', projectDir: 'p', updatedAt: 0 }] }],
    ['updatedAt 为负数', { ...valid, entries: [{ ...entry, updatedAt: -1 }] }],
    ['updatedAt 为 Infinity', { ...valid, entries: [{ ...entry, updatedAt: Number.POSITIVE_INFINITY }] }],
    ['updatedAt 不是数字', { ...valid, entries: [{ ...entry, updatedAt: null }] }],
    ['updatedAt 缺失', { ...valid, entries: [{ sessionId: 's', dirName: 's', projectDir: 'p', bytes: 0 }] }],
    ['truncated 是字符串', { ...valid, truncated: 'false' }],
    ['truncated 是数字', { ...valid, truncated: 0 }],
    ['truncated 是 null', { ...valid, truncated: null }],
    ['truncated 缺失', { archiveRoot: '/archive', entries: [] }],
    ['响应是数组', []],
    ['响应是 null', null],
  ])('拒绝非法已迁移列表：%s', (_label, value) => {
    expect(parseMigratedListing(value).ok).toBe(false)
  })

  it('truncated 不是布尔值时把字段名写进原因', () => {
    const parsed = parseMigratedListing({ ...valid, truncated: 'false' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toContain('truncated')
  })
})

describe('parseRestoreOutcome', () => {
  it('接受空 restored（全部逐项失败）与空 warnings', () => {
    expect(parseRestoreOutcome({ restored: [], warnings: [] })).toEqual({
      ok: true,
      value: { restored: [], warnings: [] },
    })
  })

  it('接受 workspaceId 为字符串或 null', () => {
    const value = {
      restored: [
        { sessionId: 'session-1', workspaceId: 'workspace-a' },
        { sessionId: 'session-2', workspaceId: null },
      ],
      warnings: ['attach: session-2: cwd 不匹配'],
    }
    expect(parseRestoreOutcome(value)).toEqual({ ok: true, value })
  })

  it.each([
    ['restored 缺失', { warnings: [] }],
    ['restored 不是数组', { restored: {}, warnings: [] }],
    ['restored 项是 null', { restored: [null], warnings: [] }],
    ['restored 项是标量', { restored: ['session-1'], warnings: [] }],
    ['sessionId 为空串', { restored: [{ sessionId: '', workspaceId: null }], warnings: [] }],
    ['sessionId 不是字符串', { restored: [{ sessionId: 7, workspaceId: null }], warnings: [] }],
    ['workspaceId 不是字符串也不是 null', { restored: [{ sessionId: 's', workspaceId: 7 }], warnings: [] }],
    ['workspaceId 缺失', { restored: [{ sessionId: 's' }], warnings: [] }],
    ['warnings 缺失', { restored: [] }],
    ['warnings 不是数组', { restored: [], warnings: 'none' }],
    ['warnings 含非字符串项', { restored: [], warnings: [7] }],
    ['响应是数组', []],
    ['响应是 null', null],
    ['响应是标量', 'restored'],
  ])('拒绝非法恢复结果：%s', (_label, value) => {
    expect(parseRestoreOutcome(value).ok).toBe(false)
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
