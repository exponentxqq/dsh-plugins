/**
 * `delete-client` 的边界行为：两个端点的成功路径、宿主失败信封、传输异常与坏形状。
 *
 * 浏览器半的类型只是「宿主承诺」，所以这里全部用假 Connection 喂原始线值，断言的是
 * 调用参数与归一化后的失败码，而不是类型。
 */
import { describe, expect, it, vi } from 'vitest'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { CHANNEL, DELETE_ENDPOINT, PREVIEW_ENDPOINT } from '../src/contract.ts'
import { DeleteError, createDeleteClient, errorKeyOf } from '../src/client/delete-client.ts'

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
  it('预览成功：走预览端点、带 sessionId、返回校验后的预览', async () => {
    const { call, connection } = connectionReturning({
      ok: true,
      value: { sessionCount: 3, descendantCount: 2, logBytes: 4096 },
    })

    const preview = await createDeleteClient(connection).preview('session-1')

    expect(preview).toEqual({ sessionCount: 3, descendantCount: 2, logBytes: 4096 })
    expect(call).toHaveBeenCalledWith(CHANNEL, PREVIEW_ENDPOINT, { sessionId: 'session-1' })
  })

  it('执行成功：走删除端点并返回 removed 与 warnings', async () => {
    const { call, connection } = connectionReturning({
      ok: true,
      value: { removed: ['session-1', 'session-2'], warnings: ['/home/x/sessions/a/session-1: EACCES'] },
    })

    const outcome = await createDeleteClient(connection).remove('session-1')

    expect(outcome.removed).toEqual(['session-1', 'session-2'])
    expect(outcome.warnings).toEqual(['/home/x/sessions/a/session-1: EACCES'])
    expect(call).toHaveBeenCalledWith(CHANNEL, DELETE_ENDPOINT, { sessionId: 'session-1' })
  })

  it('宿主拒绝：原样保留失败码与说明', async () => {
    const { connection } = connectionReturning({
      ok: false,
      error: { code: 'not-archived', message: 'session "session-1" is not archived' },
    })

    const error = await failureOf(() => createDeleteClient(connection).preview('session-1'))

    expect(error.code).toBe('not-archived')
    expect(error.message).toBe('session "session-1" is not archived')
    expect(errorKeyOf(error.code)).toBe('error.not-archived')
  })

  it('传输异常归一为 unavailable', async () => {
    const { connection } = connectionThrowing(new Error('socket closed'))

    const error = await failureOf(() => createDeleteClient(connection).remove('session-1'))

    expect(error.code).toBe('unavailable')
    expect(error.message).toBe('socket closed')
  })

  it('成功信封里的坏形状归一为 bad-response', async () => {
    const { connection } = connectionReturning({
      ok: true,
      value: { sessionCount: '3', descendantCount: 0, logBytes: 0 },
    })

    const error = await failureOf(() => createDeleteClient(connection).preview('session-1'))

    expect(error.code).toBe('bad-response')
  })

  it('执行响应的 removed 为空串数组时同样按坏形状拒绝', async () => {
    const { connection } = connectionReturning({ ok: true, value: { removed: [], warnings: [] } })

    const error = await failureOf(() => createDeleteClient(connection).remove('session-1'))

    expect(error.code).toBe('bad-response')
  })

  it('不可读的失败信封归一为 unavailable', async () => {
    const { connection } = connectionReturning({ ok: false, error: 'boom' })

    const error = await failureOf(() => createDeleteClient(connection).remove('session-1'))

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
