/**
 * 错误码表、失败分类与脱敏（H15；码表见 code-design §3.10）。
 *
 * 本模块是纯函数 + 一个 Error 子类，无任何 I/O 与宿主依赖：`client.ts`（H6）用
 * `BridgeError` 承载每一次失败，`pat-owner` / `key-manager`（T3/T4）按
 * `classifyHttp` / `classifyEnvelope` 的归类决定「退避重试」还是「halt 终止」；
 * `assertNoSecret` 只在单测红线上使用（生产日志路径不得调用）。
 *
 * 脱敏纪律（D-12 / §3.10）：诊断只允许出现码与字段名，任何机密值都不进
 * `BridgeError.message`——需要带服务端 `msg` 时一律先过 {@link maskSecret}。
 *
 * @module dsh-plugin-zcode-plan/host/errors
 */

/** 失败归类（§3.5 失败分类表的「归类」列）。 */
export type ErrorClass = 'retryable' | 'terminal'

/**
 * `BridgeError` 码表（§3.10 全集）。
 *
 * 前八个是字面量码；后两个是码表自带的动态形态（`BUSINESS:<code>` 由 envelope
 * 业务码拼出）。`HTTP:<status>` 是同一模式的延伸：HTTP 层瞬态失败（429 / 5xx /
 * 其余未列状态）码表未给专码，用状态码本身作诊断标识——owner 的行为由
 * {@link classifyHttp} 的归类决定，不依赖这个码的字面。
 */
export type BridgeErrorCode =
  | 'JWT_EXPIRED'
  | 'KEY_LOST'
  | 'PAT_SHAPE'
  | 'RISK_3012'
  | 'REF_CONFLICT'
  | 'NO_LLM_PI_AI_ROW'
  | 'AUTH_STATE'
  | 'TIMEOUT'
  | `BUSINESS:${string}`
  | `HTTP:${number}`

/** 各码的缺省对外文案（§3.10「对外文案要点」列，逐字采用）。 */
const DEFAULT_MESSAGES: Readonly<Record<string, string>> = {
  JWT_EXPIRED: '登录态已失效，请重新登录',
  KEY_LOST: '桥接 Key 已不存在，请重新登录后重试',
  PAT_SHAPE: '换发响应不含 token（上游契约可能变更）',
  RISK_3012: '触发风控，已停止自动续期，请稍后再试',
  REF_CONFLICT: 'ZCODE_PLAN_PAT 已由外部来源提供，拒绝覆盖',
  NO_LLM_PI_AI_ROW: '当前 profile 没有 llm-pi-ai 行，路由无法自动注册',
  AUTH_STATE: '回调 state 不匹配，已拒绝本次授权',
  TIMEOUT: '请求超时',
}

/**
 * 本插件全部业务失败的统一载体：`code` 是 §3.10 码表的成员，`message` 是可对人
 * 展示的文案（缺省取码表文案，动态码缺省取码本身）。
 *
 * 约定：构造方保证 `message` 不含任何机密值（服务端 `msg` 必须先过
 * {@link maskSecret}）——单测 X2/X8 用真值夹具断言这一点。
 */
export class BridgeError extends Error {
  /** §3.10 码表成员；owner 的 halt / 退避决策与 status 渲染都以它为键。 */
  readonly code: BridgeErrorCode

  /**
   * @param code - 码表成员。
   * @param message - 对人文案；省略时取码表缺省文案（动态码取码本身）。
   */
  constructor(code: BridgeErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code] ?? code)
    this.name = 'BridgeError'
    this.code = code
  }
}

/**
 * HTTP 失败归类（§3.5 失败分类表「HTTP 429 / 5xx → retryable；401/403/404/405 → terminal」）。
 *
 * 只对**失败状态**调用（2xx 不会走到这里）；传入 `0` 表示传输层失败（未收到 HTTP
 * 响应，`client.ts` 的约定值），对应分类表「网络」行，归 retryable。
 *
 * @param status - HTTP 状态码；`0` = 传输层失败。
 * @returns `'retryable'` 时 owner 退避重试；`'terminal'` 时按码 halt。
 */
export function classifyHttp(status: number): ErrorClass {
  return status === 0 || status === 429 || status >= 500 ? 'retryable' : 'terminal'
}

/**
 * envelope 失败归类（reason 见 `bigmodel/envelope.ts`）。
 *
 * §3.5：业务拒绝（`business`）与响应形状失败（`shape`）都 terminal——前者
 * `halt('BUSINESS:<code>')`，后者 `halt('PAT_SHAPE')`；没有任何 envelope 层失败
 * 值得退避重试（同一请求重发只会得到同一结果）。
 */
export function classifyEnvelope(reason: 'business' | 'shape'): ErrorClass {
  void reason
  return 'terminal'
}

/**
 * 机密脱敏（§3.10）：只留前 4 位与长度，短值整体打码。
 *
 * 只有诊断路径允许调用（错误文案带服务端 `msg` 时）；正常路径根本不该拿到值。
 *
 * @param v - 疑似机密的字符串（token / apiKey / 服务端 msg 等）。
 * @returns 长度 ≤ 8 时 `'*'`×3；否则前 4 位 + `…` + 原长。
 */
export function maskSecret(v: string): string {
  return v.length <= 8 ? '***' : `${v.slice(0, 4)}…${v.length}`
}

/** {@link assertNoSecret} 与 {@link maskSecret} 共用的最小判定长度：更短的串不做红线判定（防误报）。 */
const SECRET_MIN_LENGTH = 8

/**
 * 红线断言（单测 X2/X8 专用；**生产日志路径不得调用**）。
 *
 * 检查待发布文本里是否出现了任何一个机密真值（如 JWT / PAT 夹具），出现即抛出。
 * 与 {@link maskSecret} 同一最小长度阈值：短串既不打码也不参与判定，避免把普通
 * 字段名误报成机密。
 *
 * @param text - 待发布的文本（错误文案 / status 渲染 / 日志行）。
 * @param secrets - 机密真值清单（`undefined` 项跳过）。
 * @throws 任一机密（长度 ≥ {@link SECRET_MIN_LENGTH}）出现在 `text` 中时抛 `Error`。
 */
export function assertNoSecret(text: string, secrets: readonly (string | undefined)[]): void {
  for (const secret of secrets) {
    if (secret === undefined || secret.length < SECRET_MIN_LENGTH) continue
    if (text.includes(secret)) {
      // 抛错文案只报长度，不回显机密本身。
      throw new Error(`红线断言失败：文本疑似包含机密真值（长度 ${secret.length}）`)
    }
  }
}
