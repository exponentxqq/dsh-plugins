/**
 * `delete-client` 的边界行为：七个端点的成功路径（含请求体携带的处置模式，以及批量 /
 * 已迁移两域各自的载荷形状）、宿主失败信封、传输异常与坏形状。
 *
 * 浏览器半的类型只是「宿主承诺」，所以这里全部用假 Connection 喂原始线值，断言的是
 * 调用参数与归一化后的失败码，而不是类型。
 */
import { describe, expect, it, vi } from 'vitest'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import {
  CHANNEL,
  DELETE_BATCH_ENDPOINT,
  DELETE_ENDPOINT,
  DELETE_MIGRATED_ENDPOINT,
  LIST_MIGRATED_ENDPOINT,
  PREVIEW_BATCH_ENDPOINT,
  PREVIEW_ENDPOINT,
  RESTORE_MIGRATED_ENDPOINT,
  type MigratedTarget,
} from '../src/contract.ts'
import {
  DeleteError,
  createDeleteClient,
  createSessionManagerClient,
  errorKeyOf,
  type SessionManagerClient,
} from '../src/client/delete-client.ts'

/** 一个总是返回同一线值的假 Connection。 */
function connectionReturning(result: unknown) {
  const call = vi.fn(async () => result)
  return { call, connection: { rpc: { call } } as unknown as ConnectionHandle }
}

/** 一个总是抛出的假 Connection（传输层故障）。 */
function connectionThrowing(error: unknown) {
  const call = vi.fn(async () => {
    throw error
  })
  return { call, connection: { rpc: { call } } as unknown as ConnectionHandle }
}

/** 跑一次调用并抓住它抛出的值。 */
async function failureOf(run: () => Promise<unknown>): Promise<DeleteError> {
  const error = await run().then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(DeleteError)
  return error as DeleteError
}

describe('delete client', () => {
  it('预览成功：走预览端点、带 sessionId 与 mode、返回校验后的预览', async () => {
    const { call, connection } = connectionReturning({
      ok: true,
      value: {
        sessionCount: 3,
        descendantCount: 2,
        logBytes: 4096,
        archiveRoot: '/home/x/archive/sessions',
      },
    })

    const preview = await createDeleteClient(connection).preview('session-1', 'archive')

    expect(preview).toEqual({
      sessionCount: 3,
      descendantCount: 2,
      logBytes: 4096,
      archiveRoot: '/home/x/archive/sessions',
    })
    expect(call).toHaveBeenCalledWith(CHANNEL, PREVIEW_ENDPOINT, {
      sessionId: 'session-1',
      mode: 'archive',
    })
  })

  it('执行成功：走删除端点、带 sessionId 与 mode，并返回 removed 与 warnings', async () => {
    const { call, connection } = connectionReturning({
      ok: true,
      value: { removed: ['session-1', 'session-2'], warnings: ['/home/x/sessions/a/session-1: EACCES'] },
    })

    const outcome = await createDeleteClient(connection).remove('session-1', 'delete')

    expect(outcome.removed).toEqual(['session-1', 'session-2'])
    expect(outcome.warnings).toEqual(['/home/x/sessions/a/session-1: EACCES'])
    expect(call).toHaveBeenCalledWith(CHANNEL, DELETE_ENDPOINT, {
      sessionId: 'session-1',
      mode: 'delete',
    })
  })

  it('宿主拒绝：原样保留失败码与说明', async () => {
    const { connection } = connectionReturning({
      ok: false,
      error: { code: 'not-archived', message: 'session "session-1" is not archived' },
    })

    const error = await failureOf(() => createDeleteClient(connection).preview('session-1', 'archive'))

    expect(error.code).toBe('not-archived')
    expect(error.message).toBe('session "session-1" is not archived')
    expect(errorKeyOf(error.code)).toBe('error.not-archived')
  })

  it('传输异常归一为 unavailable', async () => {
    const { connection } = connectionThrowing(new Error('socket closed'))

    const error = await failureOf(() => createDeleteClient(connection).remove('session-1', 'delete'))

    expect(error.code).toBe('unavailable')
    expect(error.message).toBe('socket closed')
  })

  it('成功信封里的坏形状归一为 bad-response', async () => {
    const { connection } = connectionReturning({
      ok: true,
      value: { sessionCount: '3', descendantCount: 0, logBytes: 0 },
    })

    const error = await failureOf(() => createDeleteClient(connection).preview('session-1', 'archive'))

    expect(error.code).toBe('bad-response')
  })

  it('执行响应的 removed 为空串数组时同样按坏形状拒绝', async () => {
    const { connection } = connectionReturning({ ok: true, value: { removed: [], warnings: [] } })

    const error = await failureOf(() => createDeleteClient(connection).remove('session-1', 'delete'))

    expect(error.code).toBe('bad-response')
  })

  it('不可读的失败信封归一为 unavailable', async () => {
    const { connection } = connectionReturning({ ok: false, error: 'boom' })

    const error = await failureOf(() => createDeleteClient(connection).remove('session-1', 'delete'))

    expect(error.code).toBe('unavailable')
  })

  it('未知失败码回退到 error.fallback，已知码映射到同名键', () => {
    expect(errorKeyOf('session-live')).toBe('error.session-live')
    expect(errorKeyOf('bad-request')).toBe('error.bad-request')
    expect(errorKeyOf('internal')).toBe('error.internal')
    expect(errorKeyOf('unavailable')).toBe('error.unavailable')
    expect(errorKeyOf('bad-response')).toBe('error.bad-response')
    expect(errorKeyOf('brand-new-code')).toBe('error.fallback')
  })
})

/** 迁移域请求里的条目（宿主用 archiveRoot + projectDir + dirName 拼绝对路径）。 */
const MIGRATED_ENTRIES: readonly MigratedTarget[] = [
  { projectDir: '--home-u--', dirName: 'session-1' },
  { projectDir: '--home-u--', dirName: 'session-2' },
]

/** 一次管理客户端调用；表驱动用例共用，`unknown` 让各端点的返回形状可以并存。 */
type ClientRun = (client: SessionManagerClient) => Promise<unknown>

describe('session manager client', () => {
  it('批量预览：走批量预览端点、带 sessionIds 与 mode，并返回校验后的并集统计', async () => {
    const { call, connection } = connectionReturning({
      ok: true,
      value: {
        targetCount: 2,
        sessionCount: 3,
        descendantCount: 1,
        logBytes: 2048,
        archiveRoot: '/home/x/archive/sessions',
        rejected: [{ sessionId: 'session-9', code: 'not-archived', message: '不在归档集合' }],
      },
    })

    const preview = await createSessionManagerClient(connection).previewBatch(
      ['session-1', 'session-2'],
      'archive',
    )

    expect(preview.targetCount).toBe(2)
    expect(preview.rejected).toEqual([
      { sessionId: 'session-9', code: 'not-archived', message: '不在归档集合' },
    ])
    expect(call).toHaveBeenCalledWith(CHANNEL, PREVIEW_BATCH_ENDPOINT, {
      sessionIds: ['session-1', 'session-2'],
      mode: 'archive',
    })
  })

  it('批量执行：走批量删除端点、带 sessionIds 与 mode，并返回 removed 与 warnings', async () => {
    const { call, connection } = connectionReturning({
      ok: true,
      value: { removed: ['session-1', 'session-2'], warnings: ['/home/x/sessions/p/session-2: EACCES'] },
    })

    const outcome = await createSessionManagerClient(connection).disposeBatch(
      ['session-1', 'session-2'],
      'delete',
    )

    expect(outcome.removed).toEqual(['session-1', 'session-2'])
    expect(call).toHaveBeenCalledWith(CHANNEL, DELETE_BATCH_ENDPOINT, {
      sessionIds: ['session-1', 'session-2'],
      mode: 'delete',
    })
  })

  it('已迁移列表：请求体是空对象 {}，返回归档根、条目与截断标志', async () => {
    const { call, connection } = connectionReturning({
      ok: true,
      value: {
        archiveRoot: '/home/x/archive/sessions',
        entries: [
          {
            sessionId: 'session-1',
            dirName: 'session-1',
            projectDir: '--home-u--',
            bytes: 1024,
            updatedAt: 1700000000000,
          },
        ],
        truncated: false,
      },
    })

    const listing = await createSessionManagerClient(connection).listMigrated()

    expect(listing.entries).toHaveLength(1)
    expect(call).toHaveBeenCalledWith(CHANNEL, LIST_MIGRATED_ENDPOINT, {})
  })

  it('已迁移删除：走迁移删除端点、带 entries，并返回 removed 与 warnings', async () => {
    const { call, connection } = connectionReturning({
      ok: true,
      value: { removed: ['session-1'], warnings: [] },
    })

    const outcome = await createSessionManagerClient(connection).deleteMigrated(MIGRATED_ENTRIES)

    expect(outcome.removed).toEqual(['session-1'])
    expect(call).toHaveBeenCalledWith(CHANNEL, DELETE_MIGRATED_ENDPOINT, { entries: MIGRATED_ENTRIES })
  })

  it('已迁移恢复：走迁移恢复端点、带 entries，并返回 restored 与 warnings', async () => {
    const { call, connection } = connectionReturning({
      ok: true,
      value: {
        restored: [
          { sessionId: 'session-1', workspaceId: 'workspace-a' },
          { sessionId: 'session-2', workspaceId: null },
        ],
        warnings: ['attach: session-1: workspace not found'],
      },
    })

    const outcome = await createSessionManagerClient(connection).restoreMigrated(MIGRATED_ENTRIES)

    expect(outcome.restored).toEqual([
      { sessionId: 'session-1', workspaceId: 'workspace-a' },
      { sessionId: 'session-2', workspaceId: null },
    ])
    expect(call).toHaveBeenCalledWith(CHANNEL, RESTORE_MIGRATED_ENDPOINT, { entries: MIGRATED_ENTRIES })
  })

  it('管理客户端继承单会话两端点：预览与执行仍走各自端点', async () => {
    const preview = connectionReturning({
      ok: true,
      value: { sessionCount: 1, descendantCount: 0, logBytes: 0, archiveRoot: '/archive' },
    })
    await createSessionManagerClient(preview.connection).preview('session-1', 'archive')
    expect(preview.call).toHaveBeenCalledWith(CHANNEL, PREVIEW_ENDPOINT, {
      sessionId: 'session-1',
      mode: 'archive',
    })

    const remove = connectionReturning({ ok: true, value: { removed: ['session-1'], warnings: [] } })
    await createSessionManagerClient(remove.connection).remove('session-1', 'delete')
    expect(remove.call).toHaveBeenCalledWith(CHANNEL, DELETE_ENDPOINT, {
      sessionId: 'session-1',
      mode: 'delete',
    })
  })

  /** 每个新码都在自己的端点上被透传（含本版本 locale 可能尚未收录的 not-migrated / target-exists）。 */
  const NEW_CODE_CASES: Array<[string, string, ClientRun]> = [
    ['delete-migrated', 'not-migrated', (client) => client.deleteMigrated(MIGRATED_ENTRIES)],
    ['restore-migrated', 'target-exists', (client) => client.restoreMigrated(MIGRATED_ENTRIES)],
    ['list-migrated', 'archive-unavailable', (client) => client.listMigrated()],
    ['preview-batch', 'workspace/session-active', (client) => client.previewBatch(['session-1'], 'archive')],
  ]

  it.each(NEW_CODE_CASES)(
    '宿主失败码透传（%s，含新码）：%s 原样成为 DeleteError.code',
    async (_endpoint, code, run) => {
      const { connection } = connectionReturning({ ok: false, error: { code, message: `拒绝：${code}` } })

      const error = await failureOf(() => run(createSessionManagerClient(connection)))

      expect(error.code).toBe(code)
      expect(error.message).toBe(`拒绝：${code}`)
    },
  )

  /** 四种坏形状各打一个 parser：非对象 / 缺必填 / 类型错 / null。 */
  const BAD_RESPONSES: Array<[string, unknown, ClientRun]> = [
    ['成功值不是对象（标量）', 'preview', (client) => client.previewBatch(['session-1'], 'archive')],
    ['对象缺必填字段（truncated）', { archiveRoot: '/archive', entries: [] }, (client) => client.listMigrated()],
    [
      '字段类型错误（warnings 不是数组）',
      { removed: ['session-1'], warnings: 'none' },
      (client) => client.deleteMigrated(MIGRATED_ENTRIES),
    ],
    ['成功值是 null', null, (client) => client.restoreMigrated(MIGRATED_ENTRIES)],
  ]

  it.each(BAD_RESPONSES)('坏形状归一为 bad-response：%s', async (_label, value, run) => {
    const { connection } = connectionReturning({ ok: true, value })

    const error = await failureOf(() => run(createSessionManagerClient(connection)))

    expect(error.code).toBe('bad-response')
    expect(error.message).not.toBe('')
  })

  it('传输异常归一为 unavailable（管理客户端）', async () => {
    const { connection } = connectionThrowing(new Error('socket closed'))

    const error = await failureOf(() =>
      createSessionManagerClient(connection).deleteMigrated(MIGRATED_ENTRIES),
    )

    expect(error.code).toBe('unavailable')
    expect(error.message).toBe('socket closed')
  })
})
