/**
 * 浏览器半的 Connection RPC 客户端：把 `/session-tool-toggle` 通道上四个端点的线上形状
 * 收成一个可直接调用的接口，并把所有失败归一成携带稳定失败码的 {@link PanelError}。
 *
 * 本层只做三件事，**不缓存任何状态、不订阅任何事件**（快照缓存与刷新归
 * `panel-controller.ts`，`command/executed` 的桥接归 `src/client/index.ts`）：
 *
 * 1. 构造请求 payload → `connection.rpc.call(CHANNEL, endpoint, payload)`；
 * 2. 拆 `ConnectionRpcResult` 信封：`ok:true` 取 `value`，`ok:false` 原样保留宿主的
 *    `code` / `message` / `details`；
 * 3. 成功值过 `contract.ts` 的响应 parser（两端各自内联一份手写实现，D16）。
 *
 * 失败归一（码只在这里产生，文案由 `locales.ts` 的 `t()` 按 `error.<code>` 组合，见
 * `code-design` 附录 §3.5）：
 *
 * | 情形 | `PanelError.code` |
 * |---|---|
 * | `rpc.call` 抛错 / 通道未挂载 / `connection` 缺失 | `unavailable` |
 * | 信封不是对象、缺 `ok`、失败信封缺 `error` / `code` / `message` | `bad-response` |
 * | 信封合法但 `value` 过不了响应 parser | `bad-response` |
 * | 宿主拒绝 | 宿主原码（本版本不认识的码也原样保留，界面按 `error.fallback` 渲染） |
 *
 * 与 web-ux 先例（`plugins/web-ux/src/client/delete-client.ts`）的唯一差别：**失败信封
 * 不可读时给 `bad-response` 而不是 `unavailable`**。`unavailable` 只表示"连不上"，而这里
 * 连接是通的、只是信封坏了，两者排障方向相反。
 *
 * 请求体形状的权威在宿主（strict parser 会拒未知字段），本层只负责拼出契约里的字段：
 * client 能合成的传输码只有 `unavailable` / `bad-response` 两个（`code-design` §2.3），
 * 本地伪造 `bad-request` 会打破这条划分。
 *
 * @module dsh-plugin-session-tool-toggle/client/panel-client
 */

import type { ConnectionHandle, ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client'
import {
  CHANNEL,
  DEFAULTS_ENDPOINT,
  PANEL_ENDPOINT,
  RESET_ENDPOINT,
  TOGGLE_ENDPOINT,
  parseDefaultsValue,
  parseFailureDetails,
  parsePanelSnapshot,
  parseResetValue,
  parseToggleValue,
  type DefaultsAction,
  type DefaultsRequest,
  type DefaultsValue,
  type FailureDetails,
  type PanelSnapshot,
  type Parsed,
  type ResetValue,
  type SessionToolToggleEndpoint,
  type ToggleValue,
} from '../contract.ts'

/** 一次面板调用失败：`code` 是渲染文案的依据，`message` 是宿主的兜底说明。 */
export class PanelError extends Error {
  /**
   * @param code - 稳定失败码（7 个宿主码 + `unavailable` / `bad-response`）；宿主未来新增
   *   的码也原样保留，调用方按 `error.fallback` 渲染。
   * @param message - 人类可读的兜底说明（不参与本地化，只作二级详情）。
   * @param details - 已归一的失败细节（文案占位符 `{address}` / `{names}` 用）；读不出来时缺省。
   */
  constructor(
    readonly code: string,
    message: string,
    readonly details?: FailureDetails,
  ) {
    super(message)
    this.name = 'PanelError'
  }
}

/**
 * 面板与默认档编辑消费的调用面（四个方法 ↔ 四个端点）。
 *
 * 默认档是**用户级**状态、不按会话寻址（`DefaultsRequest` 只有 `action` / `addresses`），
 * 所以 `updateDefaults` 没有 `sessionId`：多带一个字段会被宿主 strict parser 判成
 * `bad-request`。
 */
export interface PanelClient {
  /**
   * 读面板快照。
   * @param sessionId - 目标会话 id。
   * @returns 面板快照（清单 + 关闭集 + 保护名单 + 默认档 + 统计 + 提示）。
   * @throws {PanelError} 宿主拒绝、传输异常或响应不可读。
   */
  panel(sessionId: string): Promise<PanelSnapshot>
  /**
   * 批量开/关（全有或全无，成功值内含变更后的新快照）。
   * @param sessionId - 目标会话 id。
   * @param on - `true` 开启（移出关闭集）、`false` 关闭（加入关闭集）。
   * @param addresses - 目标地址（条数与长度的护栏在契约层，文法由宿主校验）。
   * @returns 新快照 + 变更回执。
   * @throws {PanelError} 宿主拒绝、传输异常或响应不可读。
   */
  toggle(sessionId: string, on: boolean, addresses: readonly string[]): Promise<ToggleValue>
  /**
   * 本会话回到创建时快照。
   * @param sessionId - 目标会话 id。
   * @returns 新快照 + 回执（`applied` 的 `on` 恒为 `true`）。
   * @throws {PanelError} 宿主拒绝、传输异常或响应不可读。
   */
  reset(sessionId: string): Promise<ResetValue>
  /**
   * 写用户级默认档（不追溯已存在的会话）。
   * @param action - `set` / `off` / `on` / `reset`。
   * @param addresses - 目标地址；`reset` 时不传（传了也不上发，契约不允许该组合同现）。
   * @returns 写入后的默认档视图 + 实际写入的地址。
   * @throws {PanelError} 宿主拒绝、传输异常或响应不可读。
   */
  updateDefaults(action: DefaultsAction, addresses?: readonly string[]): Promise<DefaultsValue>
}

/**
 * 把一次调用抛出的任意值转成说明文字。
 * @param error - `rpc.call` 拒绝的原因。
 * @returns `Error` 的 message，或其它值的字符串形。
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 从失败信封的 `error` 字段构造 {@link PanelError}。
 *
 * 宿主码**原样保留**：本版本不认识的码（更新或更旧的宿主）交给界面按 `error.fallback`
 * 兜底，绝不在这里改写成 `internal`——改写会抹掉排障用的原始码。`details` 只作二级灰字，
 * 读不出来时降级为缺省（`parseFailureDetails` 从不抛错）。
 * @param error - 信封里的 `error`。
 * @returns 已带宿主码、说明与归一细节的失败。
 */
function failureOf(error: unknown): PanelError {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return new PanelError('bad-response', '宿主返回的失败信封缺少 error 对象')
  }
  const record = error as Record<string, unknown>
  const code = record['code']
  const message = record['message']
  if (typeof code !== 'string' || code.length === 0) {
    return new PanelError('bad-response', '宿主返回的失败信封缺少 code')
  }
  if (typeof message !== 'string') {
    return new PanelError('bad-response', '宿主返回的失败信封缺少 message')
  }
  return new PanelError(code, message, parseFailureDetails(record['details']))
}

/**
 * 拆 RPC 结果信封，取回**未校验**的成功值。
 *
 * 结果类型是宿主的承诺，运行期照旧逐字段校验：信封不可读说明两端不是同一版协议，
 * 归 `bad-response`（而不是 `unavailable`）。
 * @param result - `connection.rpc.call` 的线上结果。
 * @returns 信封里的 `value`（尚未过端点 parser）。
 * @throws {PanelError} 失败信封（宿主码原样保留）或信封本身不可读（`bad-response`）。
 */
function unwrapEnvelope(result: unknown): unknown {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new PanelError('bad-response', '宿主返回的 RPC 信封不是对象')
  }
  const record = result as Record<string, unknown>
  if (record['ok'] === true) return record['value']
  if (record['ok'] === false) throw failureOf(record['error'])
  throw new PanelError('bad-response', '宿主返回的 RPC 信封缺少 ok 标记')
}

/**
 * 构造 `defaults` 端点的请求体。
 *
 * `reset` 表示整份清空，契约**不允许**同时出现 `addresses`（§2.2 的 `superRefine`）；
 * 非 `reset` 缺省地址时也不补空数组——让宿主按"必需"拒绝，比在 client 造一个
 * `bad-request` 更符合「形状权威在宿主」的划分。
 * @param action - 动作。
 * @param addresses - 目标地址（可缺省）。
 * @returns `defaults` 请求体。
 */
function defaultsPayload(action: DefaultsAction, addresses?: readonly string[]): DefaultsRequest {
  if (action === 'reset' || addresses === undefined) return { action }
  return { action, addresses: [...addresses] }
}

/**
 * 在 Connection handle 上建面板客户端。
 * @param connection - 浏览器半的 Connection 服务（渲染期软读，可能晚到；缺失或没有 `rpc`
 *   时调用会抛 `unavailable`，与通道未挂载走同一条归一路径，不把 `TypeError` 漏给渲染层）。
 * @returns 四个端点的调用面；失败一律是 {@link PanelError}。
 */
export function createPanelClient(connection: ConnectionHandle): PanelClient {
  /**
   * 调一个端点：传输 → 拆信封 → 响应 parser。
   * @param endpoint - 端点名（也是 RPC method）。
   * @param payload - 契约里的请求体。
   * @param parse - 该端点的响应 parser。
   * @returns 强类型成功值。
   * @throws {PanelError} 传输异常（`unavailable`）、宿主拒绝（原码）或响应不可读（`bad-response`）。
   */
  const call = async <T>(
    endpoint: SessionToolToggleEndpoint,
    payload: unknown,
    parse: (raw: unknown) => Parsed<T>,
  ): Promise<T> => {
    let result: ConnectionRpcResult<unknown>
    try {
      result = await connection.rpc.call(CHANNEL, endpoint, payload)
    } catch (error: unknown) {
      // 通道未挂载 / socket 关闭 / connection 尚未就绪都落在这里。
      throw new PanelError('unavailable', messageOf(error))
    }
    // 信封与 parser 的失败都在传输 try 之外抛：它们不能被二次归一成 `unavailable`。
    const parsed = parse(unwrapEnvelope(result))
    if (!parsed.ok) throw new PanelError('bad-response', parsed.message)
    return parsed.value
  }

  return {
    async panel(sessionId) {
      return call(PANEL_ENDPOINT, { sessionId }, parsePanelSnapshot)
    },
    async toggle(sessionId, on, addresses) {
      // 复制地址数组：调用方在 await 期间改动自己的数组不该影响已发出的请求。
      return call(TOGGLE_ENDPOINT, { sessionId, on, addresses: [...addresses] }, parseToggleValue)
    },
    async reset(sessionId) {
      return call(RESET_ENDPOINT, { sessionId }, parseResetValue)
    },
    async updateDefaults(action, addresses) {
      return call(DEFAULTS_ENDPOINT, defaultsPayload(action, addresses), parseDefaultsValue)
    },
  }
}
