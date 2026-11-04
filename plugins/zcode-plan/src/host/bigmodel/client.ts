/**
 * bigmodel / zcode API 客户端（H6）：四组 API + 统一 15s 超时 + PAT 效期三级兜底。
 *
 * 本模块是**无状态**的：`createBigmodelClient` 造出的对象不缓存、不持有可变字段，
 * `fetch` / `clock` / `log` 全部注入（§3.4）——测试换假 fetch / 假时钟即可逐行复现
 * §3.4 表格与超时（X2 的 `expect(cap.code).toBe('TIMEOUT')` 用假时钟推进 15s 触发）。
 *
 * 契约出处（§3.4 + T0 决议，逐行）：
 * - 换证：`TOKEN_BY_AUTH_CODE_URL`（RE-1 现行 zcode 路由），体四字段、免 appSecret，
 *   管理面 JWT = `data.bigmodel.access_token`（`data.token` 是 zcode 侧 JWT，不使用）；
 * - Key 管理：管理面 biz API，头 `Authorization: Bearer <JWT>`（`test-pat.sh:15-17`）；
 * - 换 PAT：`data.accessToken`（实测名）+ `expiresIn`(秒) / `expiresAt`(epoch 秒)；
 * - 用量：**`authorization: <JWT>` 裸头（无 `Bearer`）+ `bigmodel-organization` +
 *   `bigmodel-project`**（`test-pat.sh:28-30` / `test-b.sh:9-11`）——头形态的不对称是
 *   实测事实，**不得统一成 Bearer**。
 *
 * 所有响应走 `envelope.ts` 解壳；所有失败映射 `errors.ts` 的 §3.10 码表。错误文案
 * 只含码、字段名与 `maskSecret` 后的服务端文案，**绝不包含 token 或响应体值**。
 *
 * @module dsh-plugin-zcode-plan/host/bigmodel/client
 */

import { BridgeError, maskSecret } from '../errors.ts'
import { createTimeoutSignal, type ClockPort, type FetchPort, type LogPort } from '../ports.ts'
import {
  CLIENT_TYPE,
  DEFAULT_CLIENT_VERSION,
  KEY_USAGE_SCENE,
  PROVIDER,
  TOKEN_BY_AUTH_CODE_URL,
  USAGE_LIMIT_URL,
  keyCreatePath,
  keyListPath,
  patIssuePath,
} from './endpoints.ts'
import { asObject, readEnvelopeDiagnostics, unwrap } from './envelope.ts'

/** 单请求超时上限（§3.4「统一 15s AbortSignal」；与 Config 的 `requestTimeoutMs` 缺省一致）。 */
const REQUEST_TIMEOUT_MS = 15_000

/** PAT 官方满值效期（秒；T0 实测 `expiresIn` 满值 18000）。 */
const PAT_MAX_TTL_SECONDS = 18_000

/** PAT 满值效期（毫秒）：三级兜底第 3 级的加数。 */
const PAT_MAX_TTL_MS = PAT_MAX_TTL_SECONDS * 1_000

/** PAT 绝对效期防呆夹取上限（毫秒）：`expiresAt` 只接受 [now, now + 6h]（满值 5h + 余量）。 */
const PAT_LEASE_CLAMP_MS = 6 * 60 * 60 * 1_000

/** 换 PAT 响应的 token 字段兜底顺序：实测名优先，兼容 snake_case 与 zcode 侧旧名。 */
const PAT_TOKEN_FIELDS = ['accessToken', 'access_token', 'token'] as const

/** 各操作的诊断名（只进日志与错误文案，不含任何值）。 */
const OP_EXCHANGE = '换登录 JWT'
const OP_LIST_KEYS = '列 Key'
const OP_CREATE_KEY = '建 Key'
const OP_ISSUE_PAT = '换 PAT'
const OP_READ_USAGE = '读用量'

/** `createBigmodelClient` 的依赖注入面（§3.4：`fetch` / `clock` 注入、无状态）。 */
export interface BigmodelClientDeps {
  /** HTTP 通道（测试换假 fetch；生产用 `ports.nodeFetch`）。 */
  fetch: FetchPort
  /** 计时来源（测试换假时钟；生产用 `ports.nodeClock`）。 */
  clock: ClockPort
  /** 诊断出口（失败路径 `warn`，一行、只含码；生产用 `ports.createLogPort(ctx)`）。 */
  log: LogPort
  /** 换 PAT 上报的客户端版本；省略取 `DEFAULT_CLIENT_VERSION`。 */
  clientVersion?: string
}

/** 换登录 JWT 的入参。`redirectUri` 必须与 authorize 时的 redirect **逐字一致**（RE-1）。 */
export interface ExchangeAuthCodeInput {
  /** 一次性授权码（回调 query 实测字段名 `authCode`，兼容 `code` 读取——由 T5 归一后传入）。 */
  authCode: string
  /** 与 authorize 逐字一致的 redirect（loopback 或粘贴分支解析出的同一串）。 */
  redirectUri: string
  /** 发起授权时的 state（原样回传，服务端校验一致性）。 */
  state: string
  /** 外部取消信号（如登录尝试 TTL 到点 abort）；与本模块 15s 超时信号合并。 */
  signal?: AbortSignal
}

/** 列 Key 的入参。 */
export interface ListKeysInput {
  /** 管理面登录 JWT（`data.bigmodel.access_token`；绝不进日志/错误文案）。 */
  jwt: string
  /** 组织 id（Config 必填项，RE-2）。 */
  organization: string
  /** 项目 id（Config 必填项，RE-2）。 */
  project: string
  /** 外部取消信号。 */
  signal?: AbortSignal
}

/** 建 Key 的入参。 */
export interface CreateKeyInput {
  /** 管理面登录 JWT。 */
  jwt: string
  /** 组织 id。 */
  organization: string
  /** 项目 id。 */
  project: string
  /** 新 Key 的 `name`（H10 传 `KEY_NAME = 'zcode-plan-bridge'`；本模块不做常量收口）。 */
  name: string
  /** 外部取消信号。 */
  signal?: AbortSignal
}

/** 换 PAT 的入参。 */
export interface IssuePatInput {
  /** 管理面登录 JWT。 */
  jwt: string
  /** 组织 id。 */
  organization: string
  /** 项目 id。 */
  project: string
  /** 桥接 Key 的 id（列 Key 响应的 `apiKey` 字段，或建 Key 的返回值）。 */
  keyId: string
  /** 外部取消信号。 */
  signal?: AbortSignal
}

/** 读用量的入参。 */
export interface ReadUsageInput {
  /** 管理面登录 JWT（裸头直传，见 `readUsage` 的头注释）。 */
  jwt: string
  /** 组织 id（进 `bigmodel-organization` 头）。 */
  organization: string
  /** 项目 id（进 `bigmodel-project` 头）。 */
  project: string
  /** 外部取消信号。 */
  signal?: AbortSignal
}

/** 列 Key 响应的一行（T0 实测字段名；`apiKey` 即路径语义里的 keyId）。 */
export interface ApiKeyRow {
  /** Key id（实测字段名 `apiKey`；find-or-create 与换 PAT 都用它）。 */
  keyId: string
  /** Key 显示名（H10 按 `name === 'zcode-plan-bridge'` 识别桥接 Key）。 */
  name: string
  /** 使用场景（实测数值：-1 默认 / 1 桥接可换 PAT / 3 直连；C5 双条件之一）。 */
  usageScene: number
}

/** PAT 租约：token 本体 + 绝对本地到期时刻（epoch ms）。 */
export interface PatLease {
  /** PAT 本体（只进 `PAT_REF`，永不进记录/日志）。 */
  pat: string
  /** 绝对到期时刻（epoch ms；由三级兜底解析，见 `resolvePatLease`）。 */
  expiresAt: number
}

/** 用量读数（§3.4：`limits` 原样透出，两档解析留给 T7 status）。 */
export interface UsageData {
  /** 套餐档位（原样透出）。 */
  level: unknown
  /** 额度行数组（原样透出；`unit===3` 5h 窗口、`unit===6` 周额度）。 */
  limits: readonly unknown[]
}

/** 四组 API 的对外面（H6）。全部方法返回 Promise、失败抛 `BridgeError`。 */
export interface BigmodelClient {
  /**
   * 换登录 JWT：`POST` 换证端点，返回管理面 JWT（`data.bigmodel.access_token`）。
   * 成功判定 `code===0`；缺 JWT 字段抛 `PAT_SHAPE`（§3.10 形状码）。
   */
  exchangeAuthCode(input: ExchangeAuthCodeInput): Promise<string>
  /** 列 Key：`GET` biz 路径，返回解析后的 Key 行（按 `apiKey`/`name`/`usageScene` 收紧）。 */
  listKeys(input: ListKeysInput): Promise<readonly ApiKeyRow[]>
  /** 建 Key：`POST` 同路径（体 `{ name, usageScene: 1 }`），返回新 keyId（`data.apiKey`）。 */
  createKey(input: CreateKeyInput): Promise<string>
  /**
   * 换 PAT：`POST` `…/api_keys/{keyId}/access_tokens`，返回租约。token 字段兜底
   * `accessToken → access_token → token`；效期三级兜底（`expiresIn` 优先）。
   */
  issuePat(input: IssuePatInput): Promise<PatLease>
  /** 读用量：`GET` quota/limit（裸 JWT 头），`limits` 原样透出（解析归 T7）。 */
  readUsage(input: ReadUsageInput): Promise<UsageData>
}

/**
 * PAT 效期三级兜底（§3.4 末，T0 钉死：两字段同发、满值 18000s）。
 *
 * 1) `data.expiresIn`（秒，实测必在）→ `requestStartedAt + s*1000`——时长口径，
 *    免疫时钟漂移，实测首选；
 * 2) 否则 `data.expiresAt`（epoch 秒）→ 直接用服务端绝对值，夹到 `[now, now+6h]`
 *    防呆，越界退 3；
 * 3) 都不存在（或 2 越界）→ `requestStartedAt + 18000_000`（官方效期常量兜底）。
 *
 * 实测：两字段同发且 `expiresAt ≈ requestStartedAt + expiresIn*1000`（差 1s 内），
 * 优先 1 即无时钟漂移风险。
 */
function resolvePatLease(data: Record<string, unknown>, requestStartedAt: number, nowMs: number): number {
  const expiresIn = data.expiresIn
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0) {
    return requestStartedAt + expiresIn * 1_000
  }
  const expiresAtSeconds = data.expiresAt
  if (typeof expiresAtSeconds === 'number' && Number.isFinite(expiresAtSeconds) && expiresAtSeconds > 0) {
    const absoluteMs = expiresAtSeconds * 1_000
    if (absoluteMs >= nowMs && absoluteMs <= nowMs + PAT_LEASE_CLAMP_MS) return absoluteMs
  }
  return requestStartedAt + PAT_MAX_TTL_MS
}

/** PAT token 字段兜底：按 {@link PAT_TOKEN_FIELDS} 顺序取首个非空字符串。 */
function firstStringField(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/** 形状失败的统一文案（码固定 `PAT_SHAPE`——§3.10 唯一形状码，语义覆盖各端点契约变更）。 */
function shapeFailure(op: string): BridgeError {
  return new BridgeError('PAT_SHAPE', `${op} 响应形状不符合契约（上游可能已变更）`)
}

/** 业务失败的文案：只带码与 `maskSecret` 后的 msg（§3.10「只带码与 maskSecret(msg)」）。 */
function businessMessage(op: string, code: string, msg?: string): string {
  return `${op} 业务失败：code=${code}${msg === undefined ? '' : ` msg=${maskSecret(msg)}`}`
}

/** 读响应体文本（体流异常时返回空串；文本本身绝不进任何错误文案）。 */
async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

/** 解析响应体 JSON（解析失败返回 `undefined`，由 unwrap 按 shape 归因）。 */
async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

/**
 * 把非 2xx 响应映射成 §3.10 码表的 `BridgeError`（优先级即码表「触发」列）：
 * 401/403 → `JWT_EXPIRED`；404 → `KEY_LOST`（「重查一轮」是 T4 keyManager 的行为，
 * 分类见 `classifyHttp(404) = 'terminal'`）；405 且体含 3012 → `RISK_3012`；
 * 体可解出业务码 → `BUSINESS:<code>`；其余 → `HTTP:<status>`（诊断标识，行为按
 * `classifyHttp` 归类：429/5xx retryable，其余 terminal）。
 *
 * 响应体只用于判定与诊断码提取，**任何原文都不进错误文案**。
 */
async function httpFailure(response: Response, op: string): Promise<BridgeError> {
  const status = response.status
  const body = await safeText(response)
  const diagnostics = readEnvelopeDiagnostics(safeJsonParse(body))
  if (status === 401 || status === 403) return new BridgeError('JWT_EXPIRED')
  if (status === 404) return new BridgeError('KEY_LOST')
  if (status === 405 && body.includes('3012')) return new BridgeError('RISK_3012')
  if (diagnostics.code !== undefined) {
    return new BridgeError(`BUSINESS:${diagnostics.code}`, businessMessage(op, diagnostics.code, diagnostics.msg))
  }
  return new BridgeError(`HTTP:${status}`, `${op} HTTP ${status}`)
}

/** 宽松 JSON 解析（供非 2xx 体的诊断码提取；失败返回 `undefined`）。 */
function safeJsonParse(text: string): unknown {
  if (text === '') return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * 发一次请求并解壳（client 的私有主通道）：
 * 1. 统一 15s 超时（`createTimeoutSignal` + `Promise.race`，计时走注入的 clock），
 *    外部 `signal` 经 `AbortSignal.any` 合并（调用方取消按原样上抛，不算超时）；
 * 2. 非 2xx → `httpFailure` 码表映射；2xx → `unwrap` 解壳 + `parse` 收紧；
 * 3. 业务失败 → `BUSINESS:<code>`；形状失败 → `PAT_SHAPE`。
 */
async function requestEnvelope<T>(
  deps: { fetch: FetchPort; clock: ClockPort },
  url: string,
  init: RequestInit,
  op: string,
  parse: (data: unknown) => T,
  external?: AbortSignal,
): Promise<T> {
  const guard = createTimeoutSignal({ clock: deps.clock, timeoutMs: REQUEST_TIMEOUT_MS })
  const signal = external === undefined ? guard.signal : AbortSignal.any([guard.signal, external])
  let response: Response
  try {
    response = await Promise.race([deps.fetch(url, { ...init, signal }), guard.timedOut])
  } catch (error) {
    // 超时（guard.timedOut 抛的 BridgeError('TIMEOUT')）按原码直通；
    // 调用方自行取消（外部 signal 已 abort）也原样上抛，让 flow 的赛跑语义 intact。
    if (error instanceof BridgeError) throw error
    if (external !== undefined && external.aborted) throw error
    // 其余 reject 即传输层失败（网络不可达、连接重置等）：无 HTTP 状态可映射。
    throw new BridgeError('HTTP:0', `${op} 在传输层失败（未收到 HTTP 响应）`)
  } finally {
    guard.dispose()
  }
  if (!response.ok) throw await httpFailure(response, op)
  const result = unwrap(await readJsonBody(response), parse)
  if (result.ok) return result.value
  throw result.reason === 'business'
    ? new BridgeError(`BUSINESS:${result.code ?? 'unknown'}`, businessMessage(op, result.code ?? 'unknown', result.msg))
    : shapeFailure(op)
}

/** 失败的日志摘要：`BridgeError` 只出码，其他异常只出名——值永远不进日志。 */
function describeFailure(error: unknown): string {
  if (error instanceof BridgeError) return `code=${error.code}`
  return error instanceof Error ? error.name : 'unknown'
}

/**
 * 造 bigmodel 客户端（H6）。
 *
 * 返回的对象无状态：不发请求之外无副作用、不缓存任何响应；每次调用独立构造
 * 超时与信号。所有失败抛 `BridgeError`（§3.10 码表），并在 `log.warn` 留一行
 * 只含码的诊断。
 *
 * @param deps - 注入的 `fetch` / `clock` / `log` 与可选 `clientVersion`。
 * @returns 四组 API 的客户端面。
 */
export function createBigmodelClient(deps: BigmodelClientDeps): BigmodelClient {
  const effectiveClientVersion = deps.clientVersion ?? DEFAULT_CLIENT_VERSION
  const transport = { fetch: deps.fetch, clock: deps.clock }

  /** 统一包装：失败先留一行码级诊断，再原样上抛（文案本身已脱敏）。 */
  async function guarded<T>(op: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      deps.log.warn(`${op} 失败：${describeFailure(error)}`)
      throw error
    }
  }

  return {
    async exchangeAuthCode(input: ExchangeAuthCodeInput): Promise<string> {
      return await guarded(OP_EXCHANGE, async () => {
        // RE-1：现行 zcode 换证路由，体四字段、免 appSecret；content-type 是实测形态。
        const jwt = await requestEnvelope<string | undefined>(
          transport,
          TOKEN_BY_AUTH_CODE_URL,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              provider: PROVIDER,
              code: input.authCode,
              redirect_uri: input.redirectUri,
              state: input.state,
            }),
          },
          OP_EXCHANGE,
          (data) => {
            // 管理面 JWT = data.bigmodel.access_token（实测名）；data.token 是 zcode
            // 侧 JWT，不使用（RE-1）。实测名钉死，不做同义兜底。
            const envelopeData = asObject(data)
            const bigmodel = envelopeData === undefined ? undefined : asObject(envelopeData.bigmodel)
            const token = bigmodel === undefined ? undefined : bigmodel.access_token
            return typeof token === 'string' && token.length > 0 ? token : undefined
          },
          input.signal,
        )
        // 缺 JWT 字段 → PAT_SHAPE（§3.10 形状码；场景化文案点名实测字段路径）。
        if (jwt === undefined || jwt.length === 0) {
          throw new BridgeError('PAT_SHAPE', '换登录 JWT 响应缺 data.bigmodel.access_token（上游契约可能变更）')
        }
        return jwt
      })
    },

    async listKeys(input: ListKeysInput): Promise<readonly ApiKeyRow[]> {
      return await guarded(OP_LIST_KEYS, async () => {
        return await requestEnvelope(
          transport,
          keyListPath(input.organization, input.project),
          {
            method: 'GET',
            // 管理面头形态（test-pat.sh:15-17）：`Authorization: Bearer <JWT>`。
            headers: { authorization: `Bearer ${input.jwt}` },
          },
          OP_LIST_KEYS,
          (data) => {
            if (!Array.isArray(data)) throw new Error('data 不是数组')
            return data.map((row) => {
              const obj = asObject(row)
              if (obj === undefined) throw new Error('key 行不是对象')
              const keyId = obj.apiKey
              const name = obj.name
              const usageScene = obj.usageScene
              // 三字段全部收紧：任何一行缺字段/类型漂移都按形状失败处理（fail-closed，
              // 防止坏行静默漏掉真正的桥接 Key——C5 的反面教材）。
              if (typeof keyId !== 'string' || keyId.length === 0) throw new Error('key 行缺 apiKey')
              if (typeof name !== 'string') throw new Error('key 行缺 name')
              if (typeof usageScene !== 'number') throw new Error('key 行缺 usageScene')
              return { keyId, name, usageScene }
            })
          },
          input.signal,
        )
      })
    },

    async createKey(input: CreateKeyInput): Promise<string> {
      return await guarded(OP_CREATE_KEY, async () => {
        return await requestEnvelope(
          transport,
          keyCreatePath(input.organization, input.project),
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${input.jwt}`,
              'content-type': 'application/json',
            },
            // §3.4 表「建 Key」行：usageScene 固定 1（scene=1 才能换 PAT，C5）。
            body: JSON.stringify({ name: input.name, usageScene: KEY_USAGE_SCENE }),
          },
          OP_CREATE_KEY,
          (data) => {
            const obj = asObject(data)
            const apiKey = obj === undefined ? undefined : obj.apiKey
            if (typeof apiKey !== 'string' || apiKey.length === 0) throw new Error('data.apiKey 缺失')
            return apiKey
          },
          input.signal,
        )
      })
    },

    async issuePat(input: IssuePatInput): Promise<PatLease> {
      return await guarded(OP_ISSUE_PAT, async () => {
        // 三级兜底的起点在发请求**前**取（时长口径：expiresIn 从发出时刻起算）。
        const requestStartedAt = deps.clock.now()
        const lease = await requestEnvelope<{ pat?: string; expiresAt: number }>(
          transport,
          patIssuePath(input.organization, input.project, input.keyId),
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${input.jwt}`,
              'content-type': 'application/json',
            },
            // §3.4 表「换 PAT」行：{ clientType, clientVersion }（test-pat.sh:14-18）。
            body: JSON.stringify({ clientType: CLIENT_TYPE, clientVersion: effectiveClientVersion }),
          },
          OP_ISSUE_PAT,
          (data): { pat?: string; expiresAt: number } => {
            const obj = asObject(data)
            if (obj === undefined) throw new Error('data 不是对象')
            // token 字段兜底：data.accessToken（实测名）→ access_token / token 首个字符串。
            const pat = firstStringField(obj, PAT_TOKEN_FIELDS)
            // 效期三级兜底在此（§3.4 末）；expiresAt 防呆夹取的 now 用当下时刻。
            const expiresAt = resolvePatLease(obj, requestStartedAt, deps.clock.now())
            return { ...(pat === undefined ? {} : { pat }), expiresAt }
          },
          input.signal,
        )
        // 无 token 字段 → PAT_SHAPE（码表原文场景；文案用缺省版「换发响应不含 token」）。
        if (lease.pat === undefined) throw new BridgeError('PAT_SHAPE')
        return { pat: lease.pat, expiresAt: lease.expiresAt }
      })
    },

    async readUsage(input: ReadUsageInput): Promise<UsageData> {
      return await guarded(OP_READ_USAGE, async () => {
        return await requestEnvelope(
          transport,
          USAGE_LIMIT_URL,
          {
            method: 'GET',
            headers: {
              // 头形态不对称是实测事实（test-pat.sh:28-30 / test-b.sh:9-11）：
              // 用量接口用**裸 JWT**（无 Bearer 前缀）+ 两个组织头——不得统一成 Bearer。
              authorization: input.jwt,
              'bigmodel-organization': input.organization,
              'bigmodel-project': input.project,
            },
          },
          OP_READ_USAGE,
          (data) => {
            const obj = asObject(data)
            if (obj === undefined) throw new Error('data 不是对象')
            const limits = obj.limits
            if (!Array.isArray(limits)) throw new Error('data.limits 不是数组')
            // 原样透出（§3.4：两档解析留给 T7 status；本任务只做 HTTP + envelope）。
            return { level: obj.level, limits }
          },
          input.signal,
        )
      })
    },
  }
}
