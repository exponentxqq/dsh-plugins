/**
 * web-ux「删除已归档会话」能力的线上契约：宿主半与浏览器半共享的唯一事实来源。
 *
 * 这是纯数据模块，两端各自内联一份（客户端 bundle 与宿主产物各打包一次），不共享
 * 任何运行时身份。它拥有两类职责：
 *
 * - **端点与形状**：一个端点一种响应形状（预览返回 {@link DeletePreview}，执行返回
 *   {@link DeleteOutcome}），调用方不可能把 A 端点的答案当 B 端点解码。
 * - **边界校验**：请求来自浏览器、响应来自宿主，两侧类型都只是「承诺」。这里的
 *   `parse*` 函数在边界上逐字段校验，把结构不符变成一句可读的失败信息，而不是崩溃
 *   或静默错渲染。
 *
 * 本模块不得 import `node:*` 或 `@deepseek-ai/*`（会被内联进浏览器 bundle），因此
 * 校验为手写实现，不引入 zod。
 *
 * @module dsh-plugin-web-ux/contract
 */

/** Connection RPC 通道：两端共享的绝对逻辑通道名。 */
export const CHANNEL = '/web-ux'

/** 预览端点：校验 + 统计删除集合，不产生任何写操作。 */
export const PREVIEW_ENDPOINT = 'preview-delete'

/** 执行端点：重新校验后真正删除。 */
export const DELETE_ENDPOINT = 'delete-session'

/** 全部端点名，供测试与两端穷举。 */
export const ENDPOINTS = [PREVIEW_ENDPOINT, DELETE_ENDPOINT] as const

/** 端点名类型。 */
export type WebUxEndpoint = (typeof ENDPOINTS)[number]

/**
 * 稳定失败码。`bad-request` 表示线上形状不合契约；`internal` 表示宿主侧未预期故障。
 * 三者之外的三个是业务拒绝码，界面按码给出对应文案。
 */
export const FAILURE_CODES = ['bad-request', 'not-found', 'not-archived', 'session-live', 'internal'] as const

/** 失败码类型。 */
export type FailureCode = (typeof FAILURE_CODES)[number]

/** 判断一个字符串是否为已知失败码（未知码由调用方按兜底文案渲染）。 */
export function isFailureCode(code: string): code is FailureCode {
  return (FAILURE_CODES as readonly string[]).includes(code)
}

/** 两个端点共用的请求体：只带目标会话 id。 */
export interface DeleteRequest {
  /** 目标已归档会话的 id。 */
  readonly sessionId: string
}

/** 预览结果：删除集合的规模与体积，仅用于展示。 */
export interface DeletePreview {
  /** 删除集合的会话数（目标 + 级联后代）。 */
  readonly sessionCount: number
  /** 其中 subagent 后代的数量。 */
  readonly descendantCount: number
  /** 预计释放的字节数（会话日志目录树 + 投影缓存文件）。 */
  readonly logBytes: number
}

/** 执行结果：被移除的 id 列表与逐条文件删除失败。 */
export interface DeleteOutcome {
  /** 已从工作区记录与磁盘移除的会话 id，含级联后代。 */
  readonly removed: readonly string[]
  /** 文件删除失败项，形如 `<路径>: <原因>`；非空不影响本次删除整体成功。 */
  readonly warnings: readonly string[]
}

/** 失败响应信封：稳定码 + 可读兜底文案。 */
export interface WireFailure {
  /** 稳定失败码；可能是本版本未知的码。 */
  readonly code: string
  /** 人类可读的兜底文案（不参与本地化）。 */
  readonly message: string
}

/** 一次解析的结果：值，或一句说明哪里不合契约的话。 */
export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string }

/**
 * `sessionId` 的长度上限：会话 id 是宿主生成的短标识，超长即视为异常输入。上限取
 * 255（多数文件系统的单段名上限），因为宿主会把它当作单个目录名使用。
 */
const SESSION_ID_MAX = 255

/** 一次请求体允许的字段上限：多余字段视为越界（静默忽略会掩盖版本漂移）。 */
function readRequest(payload: unknown): Parsed<DeleteRequest> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, message: '请求体不是对象' }
  }
  const record = payload as Record<string, unknown>
  const extra = Object.keys(record).filter((key) => key !== 'sessionId')
  if (extra.length > 0) return { ok: false, message: `请求体含未知字段：${extra.join(', ')}` }
  const sessionId = record['sessionId']
  if (typeof sessionId !== 'string' || sessionId === '') return { ok: false, message: 'sessionId 缺失或不是非空字符串' }
  if (sessionId.length > SESSION_ID_MAX) return { ok: false, message: 'sessionId 超长' }
  // 控制字符（含 NUL）不是合法路径片段：宿主会把它当目录名用，node:fs 会直接抛错。
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(sessionId)) return { ok: false, message: 'sessionId 含控制字符' }
  return { ok: true, value: { sessionId } }
}

/**
 * 校验宿主收到的一次调用。
 * @param endpoint - 通道派发的端点名（RPC method）。
 * @param payload - 原始请求体。
 * @returns 可执行的请求，或不合契约的原因。
 */
export function parseDeleteRequest(endpoint: string, payload: unknown): Parsed<DeleteRequest> {
  if (!(ENDPOINTS as readonly string[]).includes(endpoint)) {
    return { ok: false, message: `未知端点 "${endpoint}"` }
  }
  return readRequest(payload)
}

/** 读一个非负安全整数计数。 */
function readCount(record: Record<string, unknown>, key: string, subject: string): Parsed<number> {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return { ok: false, message: `${subject} 的 ${key} 不是非负安全整数` }
  }
  return { ok: true, value }
}

/**
 * 校验预览响应。
 * @param value - 端点返回的原始值。
 * @returns 预览结果，或形状不符的原因。
 */
export function parsePreview(value: unknown): Parsed<DeletePreview> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, message: '预览响应不是对象' }
  }
  const record = value as Record<string, unknown>
  const sessionCount = readCount(record, 'sessionCount', '预览响应')
  if (!sessionCount.ok) return sessionCount
  const descendantCount = readCount(record, 'descendantCount', '预览响应')
  if (!descendantCount.ok) return descendantCount
  const logBytes = record['logBytes']
  if (typeof logBytes !== 'number' || !Number.isFinite(logBytes) || logBytes < 0) {
    return { ok: false, message: '预览响应的 logBytes 不是非负有限数' }
  }
  return {
    ok: true,
    value: { sessionCount: sessionCount.value, descendantCount: descendantCount.value, logBytes },
  }
}

/** 读一个字符串数组字段，并复制成独立数组。 */
function readStringList(record: Record<string, unknown>, key: string, subject: string): Parsed<readonly string[]> {
  const value = record[key]
  if (!Array.isArray(value)) return { ok: false, message: `${subject} 的 ${key} 不是数组` }
  const items: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') return { ok: false, message: `${subject} 的 ${key} 含非字符串项` }
    items.push(item)
  }
  return { ok: true, value: items }
}

/**
 * 校验执行响应。
 * @param value - 端点返回的原始值。
 * @returns 执行结果，或形状不符的原因。
 */
export function parseOutcome(value: unknown): Parsed<DeleteOutcome> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, message: '执行响应不是对象' }
  }
  const record = value as Record<string, unknown>
  const removed = readStringList(record, 'removed', '执行响应')
  if (!removed.ok) return removed
  if (removed.value.length === 0) return { ok: false, message: '执行响应的 removed 为空' }
  const warnings = readStringList(record, 'warnings', '执行响应')
  if (!warnings.ok) return warnings
  return { ok: true, value: { removed: removed.value, warnings: warnings.value } }
}

/**
 * 校验失败信封 `{ code, message }`。
 * @param value - 原始错误值。
 * @returns 失败信封，或 `undefined`（该值不是信封）。
 */
export function parseFailure(value: unknown): WireFailure | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const code = record['code']
  const message = record['message']
  if (typeof code !== 'string' || code === '' || typeof message !== 'string') return undefined
  return { code, message }
}
