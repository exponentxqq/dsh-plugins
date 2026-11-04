/**
 * PAT owner：单飞续期状态机（H11；§3.5 / C6 / D-5 / D-6）。
 *
 * 本模块是 PAT 的**唯一发布者**：换发成功后的发布动作只有一个——
 * `credentials.set(patRef, pat)`（D-4：PAT 只进 ref，永不进记录/日志）。
 * 全部外部能力经注入端口（credentials / client / keyManager / log / clock），
 * **不直接碰全局定时器、时钟或网络**——X4 的 fake timers 正是靠这一点驱动。
 *
 * 职责：
 * - **单飞**：并发 `ensure()` 共享同一个 pending（第二章调用拿到同一个 promise）；
 * - **续期调度**：成功后按官方契约 C6 的提前量公式排下一轮（`leadMs` 提前 +
 *   `[0, jitterMs)` 抖动，clamp 到 `[MIN_RETRY_MS, expiresAt-now-1s]`）；
 * - **失败分类**（§3.5 表，逐行）：retryable → 固定 5s 退避（不做指数放大）；
 *   terminal → `halt`（清内存缓存、停止循环、**保留 ref**）；
 * - **404 重查一轮**：`KEY_LOST` → `keyManager.invalidateKey()` → 重新
 *   find-or-create → 再换一次；再失败 `halt('KEY_LOST')`。最多一轮，防环；
 * - **代次隔离**：`ensure()` 进入时记下 `generation`；每个 `await` 之后若代次
 *   已更替（logout / 重登录 / `dispose()` / owner 重建）立即丢弃——迟到结果
 *   既不写 ref、不改状态、也不再调度。
 *
 * RE-3：同 Key 连续换发返回**同一张** PAT（服务端 find-or-return），因此本模
 * 块不断言换新值，一律按新 `expiresAt` 结算状态与调度（值相同也照常更新）。
 *
 * @module dsh-plugin-zcode-plan/host/pat-owner
 */

import type { CredentialKey, CredentialRef } from '@deepseek-ai/dsh-credentials/types'
import type { BigmodelClient, PatLease } from './bigmodel/client.ts'
import { parseGrant, patchGrant, type LoginGrant } from './credential-record.ts'
import { BridgeError } from './errors.ts'
import type { KeyManager } from './key-manager.ts'
import type { ClockPort, CredentialsPort, LogPort, TimerHandle } from './ports.ts'

/** 失败重试的固定退避（§3.5 retryable 行为列：5s，**不做指数放大**，避免风控）。 */
export const RETRY_BACKOFF_MS = 5_000

/** 续期调度公式 clamp 的下界（§3.5：`MIN_RETRY_MS = 5_000`）。 */
export const MIN_RETRY_MS = 5_000

/** 续期调度公式 clamp 上界的下限（`max(1_000, expiresAt - now - 1_000)` 的常量项）。 */
const MIN_SCHEDULE_MS = 1_000

/** PAT 状态（§3.5 状态机第三级；status 渲染的读数来源）。 */
export type PatState =
  | { kind: 'none' }
  | { kind: 'valid'; expiresAt: number }
  | { kind: 'expired' }
  | { kind: 'halted'; code: string }

/** PAT owner 对外面（§3.5 逐字）。 */
export interface PatOwner {
  /** 当前内存租约（快照拷贝）；halt/未获取过为 `undefined`（ref 不受影响）。 */
  current(): PatLease | undefined
  /** 确保有一张可用 PAT 并排好续期；单飞：并发调用共享同一个 pending。 */
  ensure(): Promise<PatLease>
  /** 当前 PAT 状态（§3.5 PatState 快照）。 */
  state(): PatState
  /** 当前登录身份（快照拷贝）；从未跑过 ensure（读不到有效 grant）为 `undefined`。 */
  identity(): PatIdentity | undefined
  /** terminal 终止的原因（码 + 已脱敏文案）；未 halt 过为 `undefined`。 */
  haltReason(): { code: string; message: string } | undefined
  /** 清定时器 + 递增代次：所有在途结果在其后的代次检查点被丢弃。 */
  dispose(): void
}

/** `createPatOwner` 的依赖注入面（§3.5 逐字字段序）。 */
export interface PatOwnerDeps {
  credentials: CredentialsPort
  client: BigmodelClient
  keyManager: KeyManager
  log: LogPort
  clock: ClockPort
  /** 提前量（毫秒；Config `refreshLeadMs`，官方贴 120s）。 */
  leadMs: number
  /** 抖动上限（毫秒；`[0, jitterMs)` 均匀分布，官方同款）。 */
  jitterMs: number
  /** 登录 grant 记录地址（装配传 `LOGIN_RECORD_KEY`）。 */
  recordKey: CredentialKey
  /** PAT 引用（装配传 `PAT_REF`）。 */
  patRef: CredentialRef
  /** 发布成功回调（可选；signed-channel 装配侧接 `signer.setCredential` 驱动预握手）。 */
  onPatPublished?: (pat: string) => void
}

/** 窄化后的身份三元组（`organization` / `project` 已确认存在；`jwt` 永不外泄）。 */
export interface PatIdentity {
  jwt: string
  organization: string
  project: string
}

/**
 * 造 PAT owner（H11）。
 *
 * @param deps - 注入端口与调度参数（见 {@link PatOwnerDeps}）。
 */
export function createPatOwner(deps: PatOwnerDeps): PatOwner {
  /** 当前租约（仅发布成功后更新；halt 清空；ref 是另一回事，不在这里）。 */
  let lease: PatLease | undefined
  /** PAT 状态快照（§3.5 PatState）。 */
  let patState: PatState = { kind: 'none' }
  /** terminal 终止原因（halt 时置；ensure 成功后清除）。 */
  let halted: { code: string; message: string } | undefined
  /** 代次：dispose 递增；所有在途结果在 await 之后的检查点与之比对。 */
  let generation = 0
  /** 当前登录身份（runEnsure 读到有效 grant 时更新；装配层比对是否换登录用）。 */
  let currentIdentity: PatIdentity | undefined
  /** 单飞的在途 promise（完成后自清）。 */
  let pending: Promise<PatLease> | undefined
  /** 续期/退避定时器句柄（clock 域；dispose / 重新调度前清）。 */
  let timer: TimerHandle | undefined
  /** 生命周期开关：dispose 后不再接受新的 ensure。 */
  let disposed = false

  const now = (): number => deps.clock.now()

  /** 失败的日志摘要：桥错误只出码，其他异常只出名——值永远不进日志。 */
  function describe(error: unknown): string {
    return error instanceof BridgeError ? `code=${error.code}` : error instanceof Error ? error.name : 'unknown'
  }

  function clearTimer(): void {
    if (timer !== undefined) {
      deps.clock.clearTimeout(timer)
      timer = undefined
    }
  }

  /**
   * 代次/生命周期拒绝的统一错误。§3.10 码表没有专门的「迟到结果」码，借用
   * `REF_CONFLICT` 并覆盖文案（语义同为「拒绝写入凭据」）。
   */
  function staleError(): BridgeError {
    return new BridgeError('REF_CONFLICT', '续期代次已更替（logout / 重登录 / owner 重建），本次结果已丢弃')
  }

  /**
   * 代次隔离的迟到出口（§3.5：「返回旧 lease」）。旧 lease 存在则原样返回
   * （不给调用方凭空造一个失败）；连旧 lease 都没有（登录中即 logout 的窗口）
   * 才以 {@link staleError} 拒绝。
   */
  function staleLease(): PatLease {
    const stale = lease
    if (stale !== undefined) return stale
    throw staleError()
  }

  /** 排一个 clock 定时器；到点后先查代次，更替即静默丢弃（迟到定时器不触发续期）。 */
  function schedule(ms: number, gen: number): void {
    clearTimer()
    timer = deps.clock.setTimeout(() => {
      timer = undefined
      if (gen !== generation) return
      void ensure().catch(() => {
        // 失败已在 runEnsure 内分类并落日志；这里只吞 reject 防 unhandled。
      })
    }, ms)
  }

  /** 成功后的续期调度（§3.5 续期公式，逐字）：RE-3——按新 expiresAt 结算，哪怕 PAT 值没变。 */
  function scheduleRenewal(currentLease: PatLease, gen: number): void {
    const t = now()
    const delay = currentLease.expiresAt - t - deps.leadMs - Math.random() * deps.jitterMs
    const upper = Math.max(MIN_SCHEDULE_MS, currentLease.expiresAt - t - 1_000)
    // 排定值提出为局部变量：调度公式与 clamp 边界不变，仅承接结果用于日志锚点的目标时刻换算。
    const scheduledMs = Math.min(Math.max(delay, MIN_RETRY_MS), upper)
    schedule(scheduledMs, gen)
    // 日志锚点（H2 / 任务 8.2）：续期定时器排定成功行。实现无独立 targetAt 变量，
    // 目标时刻按 now + 排定 delay（t + scheduledMs，clamp 后值）换算；只带时刻不带值。
    deps.log.info(`pat_refresh_deferred at=${new Date(t + scheduledMs).toISOString()}`)
  }

  /** retryable 失败后的固定退避调度（5s，无指数放大）。 */
  function scheduleRetry(gen: number): void {
    schedule(RETRY_BACKOFF_MS, gen)
  }

  /** terminal 终止：清内存缓存、停循环、保留 ref；状态进 `halted`；原错误上抛。 */
  function halt(error: BridgeError): never {
    clearTimer()
    lease = undefined
    halted = { code: error.code, message: error.message }
    patState = { kind: 'halted', code: error.code }
    deps.log.error(`PAT 续期已终止（${error.code}）：${error.message}`)
    throw error
  }

  /** retryable 失败：旧 PAT 未过期则继续用旧值（ref 不动），固定 5s 后重试。 */
  function retryLater(error: unknown, gen: number): never {
    clearTimer()
    const t = now()
    patState =
      lease === undefined
        ? { kind: 'none' }
        : lease.expiresAt > t
          ? { kind: 'valid', expiresAt: lease.expiresAt }
          : { kind: 'expired' }
    deps.log.warn(`PAT 续期失败（可重试，${RETRY_BACKOFF_MS / 1_000}s 后再试）：${describe(error)}`)
    scheduleRetry(gen)
    throw error
  }

  /** 失败分类的收口：retryable → 退避；terminal 桥错误 → halt；其余原样上抛。 */
  function classifyAndThrow(error: unknown, gen: number): never {
    if (isRetryable(error)) retryLater(error, gen)
    if (error instanceof BridgeError) halt(error)
    throw error
  }

  /**
   * §3.5 失败分类表的「归类」判定：
   * - `TIMEOUT` 与传输层/HTTP 429/5xx（client 映射为 `HTTP:0` / `HTTP:429` /
   *   `HTTP:5xx`）→ retryable；
   * - `AbortError`（外部取消的原始形态）按网络失败 → retryable；
   * - 其余桥错误（JWT_EXPIRED / KEY_LOST / BUSINESS:* / RISK_3012 / PAT_SHAPE /
   *   其余 HTTP:* 状态）→ terminal，交 halt / 404 重查。
   */
  function isRetryable(error: unknown): boolean {
    if (error instanceof BridgeError) {
      const code = error.code
      if (code === 'TIMEOUT') return true
      const match = /^HTTP:(\d+)$/.exec(code)
      if (match !== null) {
        const status = Number(match[1])
        return status === 0 || status === 429 || status >= 500
      }
      return false
    }
    return error instanceof Error && error.name === 'AbortError'
  }

  /** find-or-create 的分类包装：ensureKey 自身的失败同样走失败分类表。 */
  async function ensureKeyClassified(grant: LoginGrant, gen: number): Promise<string> {
    try {
      return await deps.keyManager.ensureKey({ client: deps.client, grant })
    } catch (error) {
      // keyId 无「旧值可返回」的语义：代次已更替时直接以代次错误拒绝。
      if (gen !== generation) throw staleError()
      classifyAndThrow(error, gen)
    }
  }

  /**
   * 换 PAT（含 404 重查一轮）：`issuePat` 失败且码为 `KEY_LOST`（HTTP 404，keyId
   * 失效）时——invalidate 缓存 → 重新 find-or-create → 再换一次；`attempt >= 1`
   * 或非 `KEY_LOST` 一律交失败分类（再失败的 404 → `halt('KEY_LOST')`）。
   */
  async function issuePatWithRetry(
    grant: LoginGrant,
    identity: PatIdentity,
    gen: number,
    attempt: number,
    keyId: string,
  ): Promise<PatLease> {
    try {
      return await deps.client.issuePat({ jwt: identity.jwt, organization: identity.organization, project: identity.project, keyId })
    } catch (error) {
      if (gen !== generation) return staleLease()
      const keyLost = error instanceof BridgeError && error.code === 'KEY_LOST'
      if (!keyLost || attempt >= 1) classifyAndThrow(error, gen)
      deps.log.warn('桥接 Key 换 PAT 失败（KEY_LOST）：作废缓存并重查一轮')
      deps.keyManager.invalidateKey(keyId)
      const nextKeyId = await ensureKeyClassified(grant, gen)
      if (gen !== generation) return staleLease()
      return await issuePatWithRetry(grant, identity, gen, attempt + 1, nextKeyId)
    }
  }

  /**
   * 发布（H11）：`credentials.set(patRef, pat)` 是**唯一写路径**。发布后才更新
   * 内存租约与状态、排续期、补记录 `patExpiresAt`（仅状态显示用；补写失败只
   * warn，不影响续期）。RE-3：按新 `expiresAt` 结算，不比较 PAT 值是否变化。
   */
  async function publish(result: PatLease, gen: number): Promise<void> {
    await deps.credentials.set(deps.patRef, result.pat)
    // 签名通道联动（signed-channel D8）：发布即通知装配侧 setCredential（指纹变化
    // 触发后台预握手）。迟到结果（代次已更替）不通知——旧 PAT 的签名通道已随
    // owner 重建失效，不该被复活。
    if (gen === generation) deps.onPatPublished?.(result.pat)
    if (gen !== generation) return
    // 日志锚点（H2 / 任务 8.2）：自动续期路径的发布成功行，与 index.ts 装配侧
    // pat_issued 同款格式（只带到期时刻、不带值）；置于代次检查之后——迟到结果零副作用。
    deps.log.info(`pat_issued expiresAt=${new Date(result.expiresAt).toISOString()}`)
    lease = result
    patState = { kind: 'valid', expiresAt: result.expiresAt }
    halted = undefined
    scheduleRenewal(result, gen)
    try {
      await patchGrant(deps, deps.recordKey, { patExpiresAt: result.expiresAt })
    } catch (error) {
      deps.log.warn(`补写 patExpiresAt 失败（不影响续期）：${describe(error)}`)
    }
  }

  /** 单轮续期主流程：读记录 → find-or-create → 换 PAT（404 重查）→ 发布。 */
  async function runEnsure(): Promise<PatLease> {
    const gen = generation

    // 读登录记录（本地存储 IO，非网络；换发 HTTP 从这之后才开始）。
    const grant = parseGrant(await deps.credentials.readRecord(deps.recordKey), deps.log)
    if (gen !== generation) return staleLease()
    if (grant === undefined) {
      patState = { kind: 'none' }
      throw new BridgeError('AUTH_STATE', '未找到有效登录记录，请先执行 /zcode-plan login')
    }
    const { jwt, organization, project } = grant
    if (organization === undefined || project === undefined) {
      patState = { kind: 'none' }
      throw new BridgeError('AUTH_STATE', '登录记录缺少 organization/project，请重新登录')
    }
    const identity: PatIdentity = { jwt, organization, project }
    currentIdentity = identity

    const keyId = await ensureKeyClassified(grant, gen)
    if (gen !== generation) return staleLease()

    const result = await issuePatWithRetry(grant, identity, gen, 0, keyId)
    if (gen !== generation) return staleLease()

    await publish(result, gen)
    if (gen !== generation) return staleLease()
    return result
  }

  function ensure(): Promise<PatLease> {
    if (disposed) return Promise.reject(staleError())
    if (pending !== undefined) return pending
    const promise = runEnsure().finally(() => {
      if (pending === promise) pending = undefined
    })
    pending = promise
    return promise
  }

  return {
    current: () => (lease === undefined ? undefined : { ...lease }),
    ensure,
    state: () => ({ ...patState }),
    identity: () => (currentIdentity === undefined ? undefined : { ...currentIdentity }),
    haltReason: () => (halted === undefined ? undefined : { ...halted }),
    dispose: () => {
      disposed = true
      clearTimer()
      generation += 1
      pending = undefined
    },
  }
}
