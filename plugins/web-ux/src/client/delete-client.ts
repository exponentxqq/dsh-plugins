/**
 * 浏览器半的 Connection RPC 客户端：把 `/web-ux` 通道上两个端点的线上形状收成
 * 一个可直接调用的接口，并把所有失败归一成携带稳定失败码的 {@link DeleteError}。
 *
 * 类型只是「宿主承诺」，线上真正到的值不一定是那个形状，所以每个响应都过一遍
 * `contract.ts` 的 parser：形状不符 → `bad-response`，传输抛错 → `unavailable`，
 * 宿主信封 → 原样保留它的 code（可能是本版本不认识的码，界面按 `error.fallback` 渲染）。
 *
 * @module dsh-plugin-web-ux/client/delete-client
 */

import type {
  ConnectionHandle,
  ConnectionRpcResult,
} from '@deepseek-ai/dsh-client-connection/client'
import {
  CHANNEL,
  DELETE_ENDPOINT,
  PREVIEW_ENDPOINT,
  parseFailure,
  parseOutcome,
  parsePreview,
  type DeleteOutcome,
  type DeletePreview,
} from '../contract.ts'
import { zh, type Key } from './locales.ts'

/** 一次删除调用失败：`code` 是渲染文案的依据，`message` 是宿主的兜底说明。 */
export class DeleteError extends Error {
  /**
   * @param code - 稳定失败码（业务拒绝码、`bad-request` / `internal`，或传输侧的 `unavailable` / `bad-response`）。
   * @param message - 人类可读的兜底说明（不参与本地化，仅作详情展示）。
   */
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'DeleteError'
  }
}

/** 对话框消费的调用面。 */
export interface DeleteClient {
  /**
   * 请求删除预览（不产生任何写操作）。
   * @param sessionId - 目标已归档会话。
   * @returns 删除集合的规模与体积。
   * @throws {DeleteError} 宿主拒绝或响应不可读。
   */
  preview(sessionId: string): Promise<DeletePreview>
  /**
   * 执行删除（宿主会当次重新校验，不信任预览结论）。
   * @param sessionId - 目标已归档会话。
   * @returns 已移除的 id 与逐条文件失败。
   * @throws {DeleteError} 宿主拒绝或响应不可读。
   */
  remove(sessionId: string): Promise<DeleteOutcome>
}

/**
 * 失败码对应的文案键，未知码回退到 `error.fallback`（更新的宿主可能引入新码）。
 * @param code - 失败码。
 * @returns 本 locale 命名空间下的文案键。
 */
export function errorKeyOf(code: string): Key {
  const candidate = `error.${code}`
  return (candidate in zh ? candidate : 'error.fallback') as Key
}

/**
 * 在 Connection handle 上建删除客户端。
 * @param connection - 浏览器半的 Connection 服务。
 * @returns 两个端点的调用面；失败一律是 {@link DeleteError}。
 */
export function createDeleteClient(connection: ConnectionHandle): DeleteClient {
  /**
   * 调一个端点并拆掉结果信封。
   * @param endpoint - 端点名（也是 RPC method）。
   * @param sessionId - 请求体里的唯一字段。
   * @returns 未校验的成功值。
   * @throws {DeleteError} 传输异常、失败信封或信封本身不可读。
   */
  const call = async (endpoint: string, sessionId: string): Promise<unknown> => {
    let result: ConnectionRpcResult<unknown>
    try {
      result = await connection.rpc.call(CHANNEL, endpoint, { sessionId })
    } catch (error: unknown) {
      throw new DeleteError('unavailable', error instanceof Error ? error.message : String(error))
    }
    if (!result.ok) {
      const failure = parseFailure(result.error)
      if (failure === undefined) throw new DeleteError('unavailable', '宿主返回了无法识别的失败信封')
      throw new DeleteError(failure.code, failure.message)
    }
    return result.value
  }

  return {
    async preview(sessionId) {
      const parsed = parsePreview(await call(PREVIEW_ENDPOINT, sessionId))
      if (!parsed.ok) throw new DeleteError('bad-response', parsed.message)
      return parsed.value
    },
    async remove(sessionId) {
      const parsed = parseOutcome(await call(DELETE_ENDPOINT, sessionId))
      if (!parsed.ok) throw new DeleteError('bad-response', parsed.message)
      return parsed.value
    },
  }
}
