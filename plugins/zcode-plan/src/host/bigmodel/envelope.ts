/**
 * bigmodel 响应壳（envelope）归一（H5，纯函数）。
 *
 * 上游各端点的响应壳是 `{ code, msg, data }`（换证端点另有 `success` 字段的可能），
 * 且成功码不统一：换证 `code===0`、biz 管理 `code===200`（数字或字符串都有实测）。
 * {@link successCode} 把四种等价形态归一（Q1 兼容条款），{@link unwrap} 在其上做
 * 「解壳 + 委托解析」，把失败归因成 `business`（业务拒绝）或 `shape`（契约形状变更）。
 *
 * 脱敏纪律（D-12）：诊断只保留 `code` / `msg` 与字段名，**绝不回显值**——本模块不
 * 对外产出任何响应体值；`msg` 是否进入错误文案由调用方决定，且必须先过
 * `errors.ts` 的 `maskSecret`。
 *
 * @module dsh-plugin-zcode-plan/host/bigmodel/envelope
 */

/** envelope 失败归因（`errors.ts` 的 `classifyEnvelope` 按它归类，两者都 terminal）。 */
export type EnvelopeFailReason = 'business' | 'shape'

/** envelope 诊断字段：只有码与文案，没有值。 */
export interface EnvelopeDiagnostics {
  /** 业务码的字符串形态（数字/字符串码都归一成 `string`；缺省或非标量时省略）。 */
  code?: string
  /** 服务端文案（仅当确实是 `string`；**未脱敏**，调用方进文案前必须先 `maskSecret`）。 */
  msg?: string
}

/** envelope 成功判定（H5 / Q1 兼容条款，逐字）：`0` / `200` 的数字或字符串，或 `success === true`。 */
export function successCode(code: unknown, success?: unknown): boolean {
  return code === 0 || code === 200 || code === '0' || code === '200' || success === true
}

/**
 * 把任意值收窄成普通对象（数组与原始值都不算）。
 *
 * `unwrap` 解壳与 `client.ts` 读 `data.bigmodel` / PAT token 字段共用这一个判定，
 * 保证「什么算对象」全插件只有一个口径。
 */
export function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * 提取 envelope 诊断字段（`code` / `msg`；字段名-only，绝不取 `data` 及其内部值）。
 *
 * `code` 为 `string` 或 `number` 时归一成字符串；`msg` 只有确实是字符串才保留。
 * `client.ts` 对非 2xx 响应体也用它取诊断（与解壳同一条提取路径）。
 */
export function readEnvelopeDiagnostics(json: unknown): EnvelopeDiagnostics {
  const envelope = asObject(json)
  if (envelope === undefined) return {}
  const rawCode = envelope.code
  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode) : undefined
  const msg = typeof envelope.msg === 'string' ? envelope.msg : undefined
  return {
    ...(code === undefined ? {} : { code }),
    ...(msg === undefined ? {} : { msg }),
  }
}

/** 解壳成功：`value` 是 `parse` 对 `data` 的解析产物。 */
export interface UnwrapOk<T> {
  readonly ok: true
  value: T
}

/** 解壳失败：归因 + 诊断（诊断只含 `code` / `msg` 字段名，不含任何值）。 */
export interface UnwrapFail extends EnvelopeDiagnostics {
  /** 判别字段：`ok === false` 收窄出 `reason` / `code` / `msg`。 */
  readonly ok: false
  /** `business` = 成功码之外的业务拒绝；`shape` = 壳形状或 `data` 解析不符合契约。 */
  reason: EnvelopeFailReason
}

/** {@link unwrap} 的结果判别联合。 */
export type UnwrapResult<T> = UnwrapOk<T> | UnwrapFail

/**
 * 解响应壳并委托解析 `data`（H5）。
 *
 * 流程：壳必须是普通对象 → 成功判定（{@link successCode}）→ `data` 必须在且非
 * null → `parse(data)` 委托解析（抛错按 `shape` 归因，由调用方映射码表）。
 * `parse` 收到的是原始 `data`（类型 `unknown`）：各端点的形状契约由 `client.ts`
 * 的各方法自己收紧，本模块不认识任何具体端点。
 *
 * @param json - 已反序列化的响应体（调用方负责 JSON 解析，失败时传文本/`undefined` 亦可）。
 * @param parse - 对 `data` 的形状收紧与业务归一；抛错一律按 `shape` 归因。
 */
export function unwrap<T>(json: unknown, parse: (data: unknown) => T): UnwrapResult<T> {
  const diagnostics = readEnvelopeDiagnostics(json)
  const envelope = asObject(json)
  // 壳本身不是对象（HTML 错误页、字符串体、数组……）→ 形状失败。
  if (envelope === undefined) return { ok: false, reason: 'shape' }
  if (!successCode(envelope.code, envelope.success)) {
    return { ok: false, reason: 'business', ...diagnostics }
  }
  // 成功码但缺 `data`（实测 404 响应即 `data: null`）→ 数据不在，按形状失败。
  if (envelope.data === undefined || envelope.data === null) {
    return { ok: false, reason: 'shape', ...diagnostics }
  }
  try {
    return { ok: true, value: parse(envelope.data) }
  } catch {
    // 形状收紧抛错 → 契约可能变更；只归因，不透传异常对象（防值泄漏）。
    return { ok: false, reason: 'shape', ...diagnostics }
  }
}
