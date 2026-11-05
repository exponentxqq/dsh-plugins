/**
 * 浏览器半的 Connection RPC 客户端：把 `/web-ux` 通道上的七个端点收成一个可直接
 * 调用的接口，并把所有失败归一成携带稳定失败码的 {@link DeleteError}。
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
  DELETE_BATCH_ENDPOINT,
  DELETE_ENDPOINT,
  DELETE_MIGRATED_ENDPOINT,
  LIST_MIGRATED_ENDPOINT,
  PREVIEW_BATCH_ENDPOINT,
  PREVIEW_ENDPOINT,
  RESTORE_MIGRATED_ENDPOINT,
  parseBatchPreview,
  parseFailure,
  parseMigratedListing,
  parseOutcome,
  parsePreview,
  parseRestoreOutcome,
  type DeleteBatchPreview,
  type DeleteOutcome,
  type DeletePreview,
  type DisposalMode,
  type MigratedListing,
  type MigratedTarget,
  type RestoreOutcome,
  type WebUxEndpoint,
  type WebUxRequest,
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
   * @param mode - 处置模式。调用方必填：本层不做默认值、也不做取值校验（宿主 parser 负责白名单）。
   * @returns 处置集合的规模与体积，外加宿主解析后的归档根。
   * @throws {DeleteError} 宿主拒绝或响应不可读。
   */
  preview(sessionId: string, mode: DisposalMode): Promise<DeletePreview>
  /**
   * 执行处置（宿主会当次重新校验，不信任预览结论）。
   * @param sessionId - 目标已归档会话。
   * @param mode - 处置模式，决定宿主走物理删除还是迁移。
   * @returns 已移除的 id 与逐条文件失败。
   * @throws {DeleteError} 宿主拒绝或响应不可读。
   */
  remove(sessionId: string, mode: DisposalMode): Promise<DeleteOutcome>
}

/**
 * 会话管理浮层消费的调用面：在单会话两方法之上补批量处置与「已迁移」域。
 *
 * 全部端点共享同一套失败归一（见 {@link DeleteError}），界面只按 `errorKeyOf(code)`
 * 取文案，不需要认识每个端点各自的错误形状。
 */
export interface SessionManagerClient extends DeleteClient {
  /**
   * 请求批量预览（不产生任何写操作，个别目标软失败不拖垮整单）。
   * @param sessionIds - 目标已归档会话 id 列表；允许重复，宿主按首见顺序去重。
   * @param mode - 处置模式；本层不设默认值。
   * @returns 并集统计、归档根与逐目标软失败清单。
   * @throws {DeleteError} 宿主拒绝或响应不可读。
   */
  previewBatch(sessionIds: readonly string[], mode: DisposalMode): Promise<DeleteBatchPreview>
  /**
   * 执行批量处置（宿主当次重新校验，整单拒绝时一条都不动）。
   * @param sessionIds - 目标已归档会话 id 列表。
   * @param mode - 处置模式，决定宿主走物理删除还是迁移。
   * @returns 已移除的 id 与逐条文件失败。
   * @throws {DeleteError} 宿主拒绝或响应不可读。
   */
  disposeBatch(sessionIds: readonly string[], mode: DisposalMode): Promise<DeleteOutcome>
  /**
   * 列出归档根下的已迁移会话（首次切到「已迁移」tab 时按需拉取）。
   * @returns 归档根、条目列表与是否被上限截断。
   * @throws {DeleteError} 宿主拒绝或响应不可读。
   */
  listMigrated(): Promise<MigratedListing>
  /**
   * 物理删除归档根下的若干条目。
   * @param entries - 要删除的归档条目（宿主用 archiveRoot + projectDir + dirName 拼路径）。
   * @returns 已移除的 id 与逐条文件失败。
   * @throws {DeleteError} 宿主拒绝或响应不可读。
   */
  deleteMigrated(entries: readonly MigratedTarget[]): Promise<DeleteOutcome>
  /**
   * 把归档根下的若干条目搬回会话目录并重新挂回工作区。
   * @param entries - 要恢复的归档条目。
   * @returns 成功搬回的条目与逐条降级告警。
   * @throws {DeleteError} 宿主拒绝或响应不可读。
   */
  restoreMigrated(entries: readonly MigratedTarget[]): Promise<RestoreOutcome>
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
 * 调一个端点并拆掉结果信封；所有客户端方法都只经由它发请求。
 *
 * 失败码三态：传输抛错 → `unavailable`；失败信封不可读 → `unavailable`；
 * 宿主信封可读 → 原样透传它的 code（不做白名单，界面按查表兜底）。
 * @param connection - 浏览器半的 Connection 服务。
 * @param endpoint - 端点名（也是 RPC method）。
 * @param body - 该端点的请求体（各端点的线上形状由 `contract.ts` 的 parser 定义）。
 * @returns 未校验的成功值。
 * @throws {DeleteError} 传输异常、失败信封或信封本身不可读。
 */
async function callEndpoint(
  connection: ConnectionHandle,
  endpoint: WebUxEndpoint,
  body: WebUxRequest['body'],
): Promise<unknown> {
  let result: ConnectionRpcResult<unknown>
  try {
    result = await connection.rpc.call(CHANNEL, endpoint, body)
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

/**
 * 在 Connection handle 上建单会话删除客户端。
 * @param connection - 浏览器半的 Connection 服务。
 * @returns 两个单会话端点的调用面；失败一律是 {@link DeleteError}。
 */
export function createDeleteClient(connection: ConnectionHandle): DeleteClient {
  return {
    async preview(sessionId, mode) {
      const parsed = parsePreview(await callEndpoint(connection, PREVIEW_ENDPOINT, { sessionId, mode }))
      if (!parsed.ok) throw new DeleteError('bad-response', parsed.message)
      return parsed.value
    },
    async remove(sessionId, mode) {
      const parsed = parseOutcome(await callEndpoint(connection, DELETE_ENDPOINT, { sessionId, mode }))
      if (!parsed.ok) throw new DeleteError('bad-response', parsed.message)
      return parsed.value
    },
  }
}

/**
 * 在 Connection handle 上建会话管理客户端（单会话两方法 + 批量处置 + 已迁移域）。
 *
 * `listMigrated()` 刻意发 `{}` 而不是 `undefined`：线上形状稳定，宿主 parser 与
 * 调用断言都不必为「空载荷」开特例。
 * @param connection - 浏览器半的 Connection 服务。
 * @returns 七个端点的调用面；失败一律是 {@link DeleteError}。
 */
export function createSessionManagerClient(connection: ConnectionHandle): SessionManagerClient {
  return {
    ...createDeleteClient(connection),
    async previewBatch(sessionIds, mode) {
      const parsed = parseBatchPreview(
        await callEndpoint(connection, PREVIEW_BATCH_ENDPOINT, { sessionIds, mode }),
      )
      if (!parsed.ok) throw new DeleteError('bad-response', parsed.message)
      return parsed.value
    },
    async disposeBatch(sessionIds, mode) {
      const parsed = parseOutcome(
        await callEndpoint(connection, DELETE_BATCH_ENDPOINT, { sessionIds, mode }),
      )
      if (!parsed.ok) throw new DeleteError('bad-response', parsed.message)
      return parsed.value
    },
    async listMigrated() {
      const parsed = parseMigratedListing(await callEndpoint(connection, LIST_MIGRATED_ENDPOINT, {}))
      if (!parsed.ok) throw new DeleteError('bad-response', parsed.message)
      return parsed.value
    },
    async deleteMigrated(entries) {
      const parsed = parseOutcome(
        await callEndpoint(connection, DELETE_MIGRATED_ENDPOINT, { entries }),
      )
      if (!parsed.ok) throw new DeleteError('bad-response', parsed.message)
      return parsed.value
    },
    async restoreMigrated(entries) {
      const parsed = parseRestoreOutcome(
        await callEndpoint(connection, RESTORE_MIGRATED_ENDPOINT, { entries }),
      )
      if (!parsed.ok) throw new DeleteError('bad-response', parsed.message)
      return parsed.value
    },
  }
}
