/**
 * Signer 状态机与签名 fetch 包装（zcode-plan-signed-channel 组 2）。
 *
 * 职责（D1/D3/D5/D8）：持有签名凭证与私钥单槽（内存快路径 + dsh-credentials record
 * 持久化）、单飞握手（epoch 防竞态）、每请求签名 + PoW 注入、**两级降级**：
 *
 * - **请求级 fail-open**：握手失败 / 签名被拒重握手一次仍失败 → 该请求无签名发出
 *   （200 仍可得），60s 冷却窗内不再握手，冷却结束自动重试（全程无感自愈）；
 * - **状态级 degraded**：连续 {@link SIGNING_DEGRADED_THRESHOLD} 次握手失败 → 停止
 *   自动重试 + 路由对目标请求**显式报错**（无签名直发按 ~1.5 刻度扣池，比直连更贵，
 *   止损优先）。恢复 = `resetFailures()`（`/zcode-plan refresh` 或 PAT 轮换触发）。
 *
 * 接入方式（D1，唯一可行路径——dsh-llm-pi-ai adapter 无每请求钩子）：
 * {@link installSigningFetch} 把 globalThis.fetch 包一层，Symbol 守卫防热重载叠层；
 * 只拦 `CODING_BASE_URL` 前缀的 POST（其余透传）；签名材料全部客户端自持，
 * **不读改请求体**；Signer 内部握手走安装前捕获的原始 fetch（防递归）。
 *
 * 机密纪律（同 D-12）：私钥 PKCS#8 只进 credential record（与 PAT 同层机密保护）与
 * 内存；日志与错误文案只含原因分类，不回显凭证 / 私钥材料。
 *
 * @module dsh-plugin-zcode-plan/host/bigmodel/signer
 */

import { createHash, createPrivateKey, type KeyObject } from 'node:crypto'
import { credentialKey, type CredentialKey } from '@deepseek-ai/dsh-credentials'
import type { ClockPort, FetchPort, LogPort } from '../ports.ts'
import { CODING_BASE_URL } from './endpoints.ts'
import {
  SIGNING_APP_ID,
  SIGNING_CLIENT_VERSION,
  SIGNING_RANDOM_BYTES,
  SigningError,
  buildHandshakeBody,
  decryptPrivateCipher,
  handshakeUrl,
  parseCredential,
  randomHex,
  requestSignature,
  solvePow,
  type ParsedCredential,
} from './signing.ts'

// ---------------------------------------------------------------------------
// 常量与凭据地址
// ---------------------------------------------------------------------------

/** 冷却窗：握手失败后多久内不再自动握手（请求级 fail-open）。 */
export const SIGNING_COOLDOWN_MS = 60_000

/** degraded 阈值：连续握手失败多少次进入止损态（D5）。 */
export const SIGNING_DEGRADED_THRESHOLD = 3

/** 私钥 record 的凭据地址（D3：scope=插件注册名，id=签名密钥编址单元）。 */
export const SIGNING_RECORD_KEY: CredentialKey = credentialKey('zcode-plan', 'bigmodel-signing-key')

// ---------------------------------------------------------------------------
// record 形状与持久化窄口
// ---------------------------------------------------------------------------

/**
 * record 绑定指纹：`<apiKeyId>:<SHA-256(apiKeyId\nikm) hex 前 16>`——含 apiKeyId 前缀，
 * 换键必失效；hash 部分不可逆，record 不落任何明文机密。
 */
export function boundFingerprint(cred: ParsedCredential): string {
  const hash = createHash('sha256').update(`${cred.apiKeyId}\n${cred.ikm}`, 'utf8').digest('hex').slice(0, 16)
  return `${cred.apiKeyId}:${hash}`
}

/** 私钥 record payload v1：指纹绑定凭证（更换凭证即失效），私钥只存 PKCS#8 base64。 */
export interface SigningKeyRecord {
  readonly v: 1
  /** 绑定指纹（{@link boundFingerprint}）。 */
  readonly fingerprint: string
  /** Ed25519 私钥 PKCS#8 DER 的 base64。 */
  readonly pkcs8B64: string
  /** 写入时刻（epoch ms）。 */
  readonly createdAt: number
}

/** 私钥 record 读写窄口（装配层用 `CredentialsPort.modifyRecord` 适配；测试用内存 fake）。 */
export interface SigningRecordPort {
  read(): Promise<SigningKeyRecord | undefined>
  write(record: SigningKeyRecord): Promise<void>
  clear(): Promise<void>
}

// ---------------------------------------------------------------------------
// 事件计数与状态面（tasks 2.3；status.ts 消费）
// ---------------------------------------------------------------------------

/** 签名通道事件计数（只增不减；status 渲染读数来源）。 */
export interface SigningCounters {
  /** 签名请求成功发出且 2xx。 */
  signedOk: number
  /** 握手失败次数（含预握手）。 */
  handshakeFailed: number
  /** 签名被拒后重握手重发仍失败次数。 */
  resignFailed: number
  /** 冷却窗内 fail-open 无签名透传次数。 */
  degradedUnsigned: number
  /** degraded 态拒绝的请求次数。 */
  degradedRejected: number
}

/** 签名通道只读状态（`/zcode-plan status` 渲染的读数来源）。 */
export interface SigningStatus {
  /** 内存私钥缓存命中。 */
  readonly cached: boolean
  /** 是否处于 degraded 止损态。 */
  readonly degraded: boolean
  /** 当前连续握手失败次数。 */
  readonly consecutiveFailures: number
  /** 冷却窗截止时刻（epoch ms；0 = 不在冷却中）。 */
  readonly cooldownUntil: number
  /** 上次握手成功时刻（epoch ms；undefined = 从未成功）。 */
  readonly lastHandshakeAt?: number
  /** 上次结果摘要（诊断字符串；不含机密）。 */
  readonly lastResult?: string
  /** 当前凭证绑定指纹（undefined = 未设凭证）。 */
  readonly credentialFingerprint?: string
  readonly counters: SigningCounters
}

// ---------------------------------------------------------------------------
// Signer
// ---------------------------------------------------------------------------

/** Signer 依赖面（全部注入；测试换 fake）。 */
export interface SignerDeps {
  /** 原始 fetch（握手专用——包装层拦的是 globalThis，这里持有安装前的通道，防递归）。 */
  fetch: FetchPort
  clock: ClockPort
  log: LogPort
  /** 私钥 record 读写口。 */
  record: SigningRecordPort
}

/** 签名被拒类响应码（D3 失效源；`readRejection` 的匹配集）。 */
const REJECTION_CODES: ReadonlySet<string> = new Set(['VERIFY_SIGNATURE_INVALID', 'VERIFY_APIKEY_EXPIRED', '3007'])

/** 签名会话 id：进程级固定一次（对齐官方 CLI 一个会话一个 id 的语义）。 */
const SESSION_ID = randomHex(SIGNING_RANDOM_BYTES)

/**
 * 官方客户端观察头组（RE-8 A 臂复刻配置**逐字保留**）：UA 与 X-Zcode-* 是复刻
 * 实验已验证生效配置的一部分（验收复现性要求）。pi-ai 的 attribution 归因会覆盖
 * profile.headers 的 UA，故 UA 必须在 fetch 包装层（最外层）注入才能生效。值全部
 * 是官方客户端公开常量——不实现任何 TLS/指纹层伪装（design D7）。
 */
const ZCODE_USER_AGENT = 'ZCode/3.17.2 ai-sdk/provider-utils/4.0.39 runtime/node.js/24'

/** 包装 fetch 的重入守卫键（D1：热重载 / 重复安装不叠层）。 */
const SIGNING_FETCH_GUARD = Symbol.for('zcode-plan.signing-fetch')

/** 拦截层的下发通道：与原始 fetch 同形但 input 面收窄为本插件使用的三形。 */
export type SendPort = (input: string | Request | URL, init: RequestInit) => Promise<Response>

/** Signer 管理面（`createSigner` 的产物）。 */
export interface Signer {
  /**
   * 设置 / 更换路由凭证（PAT 发布或清除时由装配层调用；D3/D8）。
   *
   * - `undefined`：清空凭证与私钥（内存 + record）；
   * - 形态不可解析（SigningError）：**明确报不静默**（D2）——通道不启用，路由按基线直连；
   * - 指纹变化：失效旧私钥 + **立即后台预握手**（fire-and-forget；失败静默计计数，
   *   下次请求懒重握手兜底）；
   * - 指纹不变：no-op。
   */
  setCredential(raw: string | undefined): void
  /** 失效私钥缓存（签名被拒时内部调用）。 */
  invalidate(reason: string): void
  /** 重置降级计数并恢复通道（`/zcode-plan refresh` / PAT 轮换；D5）。 */
  resetFailures(): void
  /** 只读状态快照（status 渲染）。 */
  status(): SigningStatus
  /** 包装层入口：拦截判定 + 签名注入 + 两级降级。`send` 为下层通道。 */
  intercept(input: string | Request | URL, init: RequestInit, send: SendPort): Promise<Response>
}

/**
 * 创建 Signer（组 2 状态机主体；单凭证单 origin 场景单实例足够——D3）。
 *
 * @param deps - 原始 fetch / 时钟 / 日志 / record 读写口。
 * @returns Signer 实例。
 */
export function createSigner(deps: SignerDeps): Signer {
  let credential: ParsedCredential | undefined
  let fingerprint: string | undefined
  let privateKey: KeyObject | undefined
  let epoch = 0
  let handshakePromise: Promise<KeyObject | undefined> | undefined
  let consecutiveFailures = 0
  let cooldownUntil = 0
  let lastHandshakeAt: number | undefined
  let lastResult: string | undefined
  const counters: SigningCounters = {
    signedOk: 0,
    handshakeFailed: 0,
    resignFailed: 0,
    degradedUnsigned: 0,
    degradedRejected: 0,
  }

  function isDegraded(): boolean {
    return consecutiveFailures >= SIGNING_DEGRADED_THRESHOLD
  }

  function noteFailure(kind: 'handshake' | 'resign', reason: string): void {
    if (kind === 'handshake') counters.handshakeFailed += 1
    else counters.resignFailed += 1
    consecutiveFailures += 1
    cooldownUntil = deps.clock.now() + SIGNING_COOLDOWN_MS
    lastResult = `${kind}_failed:${reason}`
    if (consecutiveFailures === SIGNING_DEGRADED_THRESHOLD) {
      deps.log.warn(
        `签名通道连续失败 ${consecutiveFailures} 次，进入止损态：路由暂停，请执行 /zcode-plan refresh 或重新登录恢复`,
      )
    }
  }

  function adoptPrivateKey(key: KeyObject, cred: ParsedCredential): void {
    privateKey = key
    fingerprint = boundFingerprint(cred)
  }

  /**
   * 取私钥（内存命中 → record 快路径 → 握手）；单飞 + epoch 竞态丢弃；
   * 冷却窗 / 止损态直接返回 `undefined`（调用方走 fail-open）。失败返回 `undefined`。
   */
  function ensurePrivateKey(force: boolean): Promise<KeyObject | undefined> {
    if (credential === undefined) return Promise.resolve(undefined)
    if (!force && privateKey !== undefined && fingerprint === boundFingerprint(credential)) {
      return Promise.resolve(privateKey)
    }
    if (!force && deps.clock.now() < cooldownUntil) return Promise.resolve(undefined)
    if (!force && isDegraded()) return Promise.resolve(undefined)
    handshakePromise ??= doHandshake(force)
    return handshakePromise
  }

  async function doHandshake(force: boolean): Promise<KeyObject | undefined> {
    const cred = credential
    const startedEpoch = epoch
    try {
      if (cred === undefined) return undefined
      // record 快路径：指纹匹配的落盘私钥直接用（重启 profile 免重握手——D3）；force 跳过。
      if (!force) {
        const stored = await deps.record.read().catch(() => undefined)
        if (stored !== undefined && stored.fingerprint === boundFingerprint(cred)) {
          const restored = createPrivateKey({
            key: Buffer.from(stored.pkcs8B64, 'base64'),
            format: 'der',
            type: 'pkcs8',
          })
          if (startedEpoch === epoch) adoptPrivateKey(restored, cred)
          deps.log.info('签名私钥已从 credential record 恢复（免重握手）')
          return restored
        }
      }
      // 握手（走原始 fetch，防递归）。
      const ts = String(deps.clock.now())
      const nonce = randomHex(SIGNING_RANDOM_BYTES)
      const response = await deps.fetch(handshakeUrl(), {
        method: 'POST',
        headers: {
          Authorization: cred.field === 'accessToken' ? `Bearer ${cred.raw}` : cred.raw,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildHandshakeBody(cred, ts, nonce)),
      })
      const envelope = asRecord(await response.json().catch(() => undefined))
      const code = envelope?.['code']
      const data = asRecord(envelope?.['data'])
      const cipherB64 = typeof data?.['privateCipher'] === 'string' ? (data['privateCipher'] as string) : undefined
      if (code !== 200 && code !== '200') {
        const bizCode = code === undefined ? String(response.status) : String(code)
        const msg = typeof envelope?.['msg'] === 'string' ? (envelope['msg'] as string) : ''
        throw new Error(`handshake code=${bizCode} msg=${msg}`)
      }
      if (cipherB64 === undefined) throw new Error('handshake 响应缺 privateCipher')
      const key = decryptPrivateCipher(cred.ikm, cred.apiKeyId, cipherB64)
      if (startedEpoch !== epoch) return undefined // 竞态：凭证已更换，丢弃旧握手结果
      const derB64 = key.export({ format: 'der', type: 'pkcs8' }).toString('base64')
      await deps.record
        .write({
          v: 1,
          fingerprint: boundFingerprint(cred),
          pkcs8B64: derB64,
          createdAt: deps.clock.now(),
        })
        .catch(() => {}) // 持久化失败不阻塞签名（内存快路径仍在）
      adoptPrivateKey(key, cred)
      lastHandshakeAt = deps.clock.now()
      consecutiveFailures = 0
      cooldownUntil = 0
      lastResult = 'handshake_ok'
      deps.log.info('签名握手成功（私钥已缓存）')
      return key
    } catch (error) {
      if (startedEpoch !== epoch) return undefined
      noteFailure('handshake', error instanceof Error ? error.message.slice(0, 80) : 'unknown')
      return undefined
    } finally {
      handshakePromise = undefined
    }
  }

  return {
    setCredential(raw) {
      if (raw === undefined || raw.length === 0) {
        if (credential !== undefined) deps.log.info('签名凭证已清除，私钥缓存一并失效')
        credential = undefined
        fingerprint = undefined
        privateKey = undefined
        epoch += 1
        consecutiveFailures = 0
        cooldownUntil = 0
        lastResult = 'credential_cleared'
        void deps.record.clear().catch(() => {})
        return
      }
      let parsed: ParsedCredential
      try {
        parsed = parseCredential(raw)
      } catch (error) {
        // D2：凭证形态不可签名明确报（不静默）——路由仍可用，只是无折扣。
        const reason = error instanceof SigningError ? error.reason : 'unknown'
        deps.log.warn(`签名凭证解析失败（${reason}）：签名通道不启用，路由按基线直连`)
        lastResult = `credential_shape:${reason}`
        return
      }
      const nextFingerprint = boundFingerprint(parsed)
      if (credential !== undefined && fingerprint === nextFingerprint) return // no-op
      credential = parsed
      fingerprint = nextFingerprint
      privateKey = undefined
      epoch += 1
      consecutiveFailures = 0
      cooldownUntil = 0
      lastResult = 'credential_set'
      // D8 预握手：fire-and-forget；**非 force**——record 快路径优先（重启 profile 免
      // 重握手，D3），record 缺失才真握手；失败静默（计数已记），下次请求懒重握手兜底。
      void ensurePrivateKey(false)
    },
    invalidate(reason) {
      privateKey = undefined
      epoch += 1
      lastResult = `invalidated:${reason}`
    },
    resetFailures() {
      consecutiveFailures = 0
      cooldownUntil = 0
      lastResult = 'reset'
      deps.log.info('签名通道计数已重置（恢复自动握手）')
    },
    status() {
      return {
        cached: privateKey !== undefined,
        degraded: isDegraded(),
        consecutiveFailures,
        cooldownUntil,
        lastHandshakeAt,
        lastResult,
        credentialFingerprint: fingerprint,
        counters: { ...counters },
      }
    },
    async intercept(input, init, send) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const fromRequest = typeof input === 'object' && !(input instanceof URL) ? input.method : undefined
      const method = (init.method ?? fromRequest ?? 'GET').toUpperCase()
      if (method !== 'POST' || !url.startsWith(CODING_BASE_URL)) return send(input, init)
      if (credential === undefined) return send(input, init) // 无凭证：基线直连
      if (isDegraded()) {
        counters.degradedRejected += 1
        throw new Error(
          `签名通道连续失败 ${consecutiveFailures} 次已止损（无签名直发会按 ~1.5 刻度多扣 50% 额度）；` +
            '请执行 /zcode-plan refresh 或 /zcode-plan login 重新登录后重试',
        )
      }
      const key = await ensurePrivateKey(false)
      if (key === undefined || credential === undefined) {
        counters.degradedUnsigned += 1 // 冷却窗 / 未就绪：请求级 fail-open
        return send(input, init)
      }
      const signed = injectSignatureHeaders(init, credential, key, deps.clock.now())
      const response = await send(input, signed)
      if (response.ok) {
        counters.signedOk += 1
        lastResult = 'signed'
        return response
      }
      // 非 2xx：clone 读体查签名拒绝码（错误响应都是小 JSON；2xx 流式体不读）。
      const rejection = await readRejection(response)
      if (rejection === undefined) return response // 非签名原因的失败原样透传
      // 签名被拒：失效 → 重握手一次 → 重签重发（D3/D5，官方同型）。
      deps.log.warn(`签名被服务端拒绝（${rejection}），重握手后重发一次`)
      this.invalidate(rejection)
      const refreshed = await ensurePrivateKey(true)
      if (refreshed !== undefined) {
        const retry = await send(input, injectSignatureHeaders(init, credential, refreshed, deps.clock.now()))
        if (retry.ok) {
          counters.signedOk += 1
          lastResult = 'signed_after_resign'
          return retry
        }
        const retryRejection = await readRejection(retry)
        if (retryRejection !== undefined) {
          counters.resignFailed += 1
          this.invalidate(retryRejection)
          lastResult = `resign_rejected:${retryRejection}` // 置于 invalidate 后（invalidate 不覆盖失败摘要）
          return send(input, init) // 二次失败：请求级 fail-open（无签名版）
        }
        return retry
      }
      counters.resignFailed += 1
      return send(input, init) // 重握手失败：fail-open
    },
  }
}

/** 签名头注入：合并原 headers + 动态七头；ts 由注入的 clock 提供（不直读 Date）。 */
function injectSignatureHeaders(init: RequestInit, cred: ParsedCredential, key: KeyObject, now: number): RequestInit {
  const ts = String(now)
  const nonce = randomHex(SIGNING_RANDOM_BYTES)
  const headers = new Headers(init.headers)
  headers.set('User-Agent', ZCODE_USER_AGENT)
  headers.set('X-App-Id', SIGNING_APP_ID)
  headers.set('X-Client-Version', SIGNING_CLIENT_VERSION)
  headers.set('X-Client-Ts', ts)
  headers.set('X-Client-Nonce', nonce)
  headers.set('X-Client-Sig', requestSignature(key, cred.apiKeyId, ts, SESSION_ID, nonce))
  headers.set('X-Client-Pow', solvePow(cred.apiKeyId, SESSION_ID, ts))
  headers.set('X-Session-Id', SESSION_ID)
  headers.set('X-Zcode-Agent', 'glm')
  headers.set('X-Zcode-App-Version', SIGNING_CLIENT_VERSION)
  headers.set('X-Zcode-Query-Source', 'main_turn')
  headers.set('X-Zcode-Session-Type', 'main')
  return { ...init, headers }
}

/** 读响应体提取签名拒绝码；非拒绝（含解析失败）返回 `undefined`。流式 2xx 不走这里。 */
async function readRejection(response: Response): Promise<string | undefined> {
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => undefined)
  const record = asRecord(body)
  const error = asRecord(record?.['error'])
  const candidates = [record?.['code'], error?.['code'], record?.['msg'], error?.['message']]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && REJECTION_CODES.has(candidate)) return candidate
    if (typeof candidate === 'number' && REJECTION_CODES.has(String(candidate))) return String(candidate)
  }
  return undefined
}

/** 未知值收窄成键值记录；非对象返回 `undefined`。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

// ---------------------------------------------------------------------------
// globalThis.fetch 包装安装（D1：唯一可行接入路径）
// ---------------------------------------------------------------------------

/**
 * 把 globalThis.fetch 包一层签名拦截（装配层在 apply 时调用一次）。
 *
 * Symbol 守卫：重复调用（热重载 / 双次 apply）直接跳过，不叠层。Signer 内部握手
 * 用 `deps.fetch`（安装前捕获的原始通道），包装链上不会递归自拦。
 *
 * @param signer - 签名状态机。
 * @param log - 诊断出口（重复安装时提示跳过）。
 */
export function installSigningFetch(signer: Signer, log: LogPort): void {
  const host = globalThis as typeof globalThis & { fetch: typeof fetch } & Record<symbol, unknown>
  if (host[SIGNING_FETCH_GUARD] === true) {
    log.info('签名 fetch 包装已存在：跳过重复安装（重入守卫）')
    return
  }
  const original = host.fetch.bind(globalThis)
  const wrapped: typeof fetch = (input, init) =>
    signer
      .intercept(
        input as string | Request | URL,
        (init ?? {}) as RequestInit,
        (i, ini) => original(i as Parameters<typeof original>[0], ini),
      )
      .then((response) => response as Response)
  host.fetch = wrapped
  host[SIGNING_FETCH_GUARD] = true
  log.info('签名 fetch 包装已安装（仅拦 coding 端点 POST，其余透传）')
}
