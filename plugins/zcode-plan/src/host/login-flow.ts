/**
 * 登录 flow 与命令侧尝试 driver（H7；§3.6）。
 *
 * 本文件是 authorization flow 的定义层 + 命令与 seam 之间的「粘贴」桥：
 * - {@link createLoginFlow}：产出 `AuthorizationFlow`（key = {@link LOGIN_RECORD_KEY}），
 *   `run()` 落 §3.6 全时序——state 生成 → 起 loopback（可关）→ `notify({url})` →
 *   「回调 vs 粘贴」赛跑 → 换 JWT → 恒用 Config 的身份 → `session.commit(grant)`
 *   → `finally` 关服务器；
 * - {@link createLoginDriver}：命令侧 `LoginDriver`（`begin`/`paste`/`current`/`abort`），
 *   把 seam 的 interaction 词汇翻译成「通知缓存 + 粘贴槽」两个命令可触碰的口子。
 *
 * 回调服务器的实现在 {@link ./loopback.ts}（H8 `startCallbackServer`）：以
 * {@link StartCallbackServer} 依赖注入（测试换假实现）；缺省接线是「Config
 * `callbackServer` 为真即用真实现、否则不启用回调分支只走粘贴」——容器部署
 * （浏览器在宿主、loopback 在容器回环）回调分支收不到宿主浏览器的跳转，
 * 粘贴为主路径（RE-4），但 Config 开关缺省仍为 `true`（同机部署可用）。
 *
 * RE 修正落点：
 * - RE-1 换证走 `client.exchangeAuthCode({authCode, redirectUri, state})`（免 appSecret）；
 *   `redirectUri` 与 authorize 的 redirect 逐字一致（回调分支即 `server.redirectUri`，
 *   粘贴分支从粘贴 URL 的 origin+path 提取——同一授权浏览器 302 的就是这条地址）；
 * - RE-2 org/proj 恒用 Config（自动发现已证伪，**不实现** `discoverIdentity`）；
 * - RE-4 authorize URL = `https://bigmodel.cn/login?appId=zcode&redirect=<urlencoded>&state=<32hex>`；
 *   回调 query 字段 `authCode`（兼容 `code`）；state 必须校验；
 * - RE-5 JWT 无 exp → `jwtExpiresAt` 恒省略（**不写该键**，不实现 `decodeJwtExp`）。
 *
 * 机密纪律（D-12）：`jwt` / `authCode` 不进任何日志与错误文案；错误一律
 * `BridgeError`（§3.10 码表），driver 侧 catch 只记码。
 *
 * @module dsh-plugin-zcode-plan/host/login-flow
 */

import { randomUUID } from 'node:crypto'
import type {
  AuthorizationFlow,
  AuthorizationInteraction,
  AuthorizationNotice,
  AuthorizationOutcome,
  AuthorizationRequest,
  AuthorizationSession,
} from '@deepseek-ai/dsh-authorization'
import type { CredentialRecord, CredentialKey } from '@deepseek-ai/dsh-credentials/types'
import type { BigmodelClient } from './bigmodel/client.ts'
import { GRANT_VERSION, LOGIN_RECORD_KEY, type LoginGrant } from './credential-record.ts'
import { BridgeError } from './errors.ts'
import { startCallbackServer, type CallbackServerOptions } from './loopback.ts'
import type { ClockPort, LogPort, TimerHandle } from './ports.ts'

/** 装配层（host/index.ts）需要的 flow 类型面：type-only 转出口（零运行时依赖）。 */
export type { AuthorizationFlow, AuthorizationRequest } from '@deepseek-ai/dsh-authorization'

/** authorize 端点本体（RE-4：SPA 路由；`/api/auth/authorize` 已证伪）。 */
export const AUTHORIZE_URL = 'https://bigmodel.cn/login'

/** authorize 的应用 id（官方 CLI 下发形态固定 `zcode`）。 */
export const AUTHORIZE_APP_ID = 'zcode'

/** 本地回调服务器挂的路径（loopback redirect 的 path 段；§3.6）。 */
export const CALLBACK_PATH = '/oauth/callback/bigmodel'

/** flow 的对外 label（§3.6 逐字）。 */
export const LOGIN_FLOW_LABEL = 'BigModel / GLM Coding Plan（ZCode 身份）'

/** notify 文案（§3.6 逐字）。 */
export const LOGIN_NOTICE_MESSAGE = '在浏览器完成 BigModel 授权（回调地址会自动带 code；容器内请复制回调 URL）'

/** 粘贴提问文案（§3.6 逐字）。 */
export const LOGIN_PASTE_PROMPT = '粘贴浏览器地址栏的完整回调 URL'

/** driver `begin()` 等「首个 notice」的上限（§3.6：2s），超时即返回兜底文本，命令不卡死。 */
export const BEGIN_TEXT_TIMEOUT_MS = 2_000

/** 回调错误参数进错误文案的长度上限（防御异常长值；错误码本身非机密）。 */
const CALLBACK_ERROR_MAX = 80

/**
 * 登录 flow 消费的 Config 窄面（结构兼容 {@link ZcodePlanConfig}，测试可给最小对象）。
 */
export interface LoginFlowConfig {
  /** 是否启用本地回调分支（真实现为 `127.0.0.1` 一次性回调服务器；缺省 `true`）。 */
  callbackServer: boolean
  /** 组织 id（RE-2：恒用 Config）。 */
  organization: string
  /** 项目 id（同上）。 */
  project: string
}

/**
 * 一次性回调服务器的最小面（H8 的 loopback.ts 实现并返回该形状）。
 */
export interface CallbackServer {
  /** redirect 全串（`http://127.0.0.1:<port>/oauth/callback/bigmodel`；RE-1 要求与换证逐字一致）。 */
  readonly redirectUri: string
  /**
   * 下一笔回调的结算：`{code, state}` 成功 / `{error}` 服务端拒绝。
   * `close()` 必须结算仍挂起的 promise（以错误拒绝），避免 flow 侧留下未处理拒绝。
   */
  readonly result: Promise<CallbackResult>
  /** 幂等关闭。 */
  close(): void
}

/** 回调结算的两形（成功带 code+state；失败带服务端 error 参数）。 */
export type CallbackResult = { code: string; state: string } | { error: string }

/** 回调服务器的启动器形状（H8 `startCallbackServer`；可注入假实现覆盖缺省接线）。 */
export type StartCallbackServer = (options: CallbackServerOptions) => Promise<CallbackServer>

/** {@link createLoginFlow} 的依赖注入面。 */
export interface LoginFlowDeps {
  /** bigmodel 客户端（换证走 `exchangeAuthCode`）。 */
  client: BigmodelClient
  /** Config 窄面（callbackServer 开关 + RE-2 身份）。 */
  config: LoginFlowConfig
  /** 诊断出口（只出码与步骤，不含机密）。 */
  log: LogPort
  /** 计时来源（`loginAt` 取时；测试换假时钟）。 */
  clock: ClockPort
  /**
   * 回调服务器启动器；省略 = 缺省接线：Config `callbackServer` 为真时用真实现
   * `startCallbackServer`（H8），为假时不启用回调分支、只走粘贴（容器主路径，RE-4）。
   */
  startServer?: StartCallbackServer
}

/** 粘贴/回调解析的产物：授权码 + 换证用的 redirect（origin+path）+ 回传 state（可能缺）。 */
export interface ParsedCallback {
  /** 一次性授权码（query `authCode` 优先，兼容 `code`；RE-4）。 */
  authCode: string
  /** 换证 `redirect_uri`：粘贴 URL 的 `origin + pathname`（与 authorize 的 redirect 逐字一致）。 */
  redirectUri: string
  /** 回传的 state（缺失时 flow 按不匹配拒绝）。 */
  state?: string
}

/**
 * 构造 authorize URL（RE-4 逐字形态）：
 * `https://bigmodel.cn/login?appId=zcode&redirect=<urlencoded>&state=<32hex>`；
 * `redirect` 省略（无回调分支）时**不带该参数**——登录页走官方默认回跳，
 * 粘贴分支再从回跳 URL 提取 redirect_uri。
 */
export function buildAuthorizeUrl(options: { appId?: string; state: string; redirect?: string }): string {
  const params = new URLSearchParams()
  params.set('appId', options.appId ?? AUTHORIZE_APP_ID)
  if (options.redirect !== undefined) params.set('redirect', options.redirect)
  params.set('state', options.state)
  return `${AUTHORIZE_URL}?${params.toString()}`
}

/** 32hex 的 state（randomUUID 去 `-`，§3.6 `state = randomUUID()` 的实测形态）。 */
export function randomState(): string {
  return randomUUID().replace(/-/g, '')
}

/** URL 是否带 scheme（`scheme://`；容错粘贴不带 scheme 的形态用）。 */
function hasScheme(text: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
}

/**
 * 解析粘贴的回调 URL（flow 内做；driver `paste()` 原样传字符串——state 校验只有
 * flow 有）。容错：首尾空白、不带 scheme（补 `http://`）；query 字段 `authCode`
 * 优先、兼容 `code`；`state` 原样带出。不可解析（空串、无 authCode、URL 语法错）
 * 返回 `undefined`，由 flow 以 `AUTH_STATE` 拒绝。
 */
export function parseCallbackUrl(text: string): ParsedCallback | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  let url: URL
  try {
    url = new URL(hasScheme(trimmed) ? trimmed : `http://${trimmed}`)
  } catch {
    return undefined
  }
  const authCode = url.searchParams.get('authCode') ?? url.searchParams.get('code')
  if (authCode === null || authCode.length === 0) return undefined
  const state = url.searchParams.get('state') ?? undefined
  const redirectUri = `${url.protocol}//${url.host}${url.pathname}`
  return { authCode, redirectUri, ...(state !== undefined && state.length > 0 && { state }) }
}

/**
 * 造登录 flow（H7 flow 定义部分）。
 *
 * 返回的 `AuthorizationFlow.run` 每次调用独立：state 独立、AbortController 独立、
 * 回调服务器独立（`session.signal` 接到本尝试的 controller；driver 侧的 TTL 超时
 * 经 `request.signal` → seam → `session.signal` 同样汇进来）。
 *
 * @param deps - 注入面（client / config / log / clock / 可选 startServer）。
 */
export function createLoginFlow(deps: LoginFlowDeps): AuthorizationFlow {
  return {
    key: LOGIN_RECORD_KEY,
    label: LOGIN_FLOW_LABEL,
    methods: [{ id: 'browser', label: '用浏览器登录 bigmodel.cn' }],
    run: (session) => runLoginAttempt(session, deps),
  }
}

/** 赛跑赢家的三形：回调成功 / 回调失败参数 / 粘贴文本。 */
type RaceWinner =
  | { kind: 'callback'; code: string; state: string }
  | { kind: 'callback-error'; error: string }
  | { kind: 'paste'; text: string }

/**
 * 一次登录尝试的完整时序（§3.6）。
 *
 * 失败路径全部抛 `BridgeError`（driver/seam 侧只记码）；`session.commit` 在
 * `run()` 返回前完成（NOT_COMMITTED 红线）；`finally` 关服务器并摘转发监听。
 */
async function runLoginAttempt(session: AuthorizationSession, deps: LoginFlowDeps): Promise<void> {
  const state = randomState()

  // 每次尝试一个 AbortController：session.signal（调用方撤回 / driver TTL）转发到它，
  // 换证请求以它为取消信号；转发只撤尝试、不撤提问。
  const controller = new AbortController()
  const forwardAbort = (): void => {
    controller.abort()
  }
  if (session.signal.aborted) controller.abort()
  else session.signal.addEventListener('abort', forwardAbort, { once: true })

  // 起 loopback（可关）：Config 开关决定是否启用回调分支；注入的 startServer 优先
  // （测试换假实现），缺省用真实现 startCallbackServer（H8：只听 127.0.0.1:0）；
  // 开关关闭 = 只走粘贴（容器主路径，RE-4）。
  const startServer = deps.startServer ?? (deps.config.callbackServer ? startCallbackServer : undefined)
  let server: CallbackServer | undefined
  if (deps.config.callbackServer && startServer !== undefined) {
    server = await startServer({ state, path: CALLBACK_PATH, log: deps.log, clock: deps.clock })
  }

  try {
    const authorizeUrl = buildAuthorizeUrl({ state, redirect: server?.redirectUri })
    deps.log.info('已发起 BigModel 授权（等待回调或粘贴）')
    session.notify({ message: LOGIN_NOTICE_MESSAGE, url: authorizeUrl })

    // 「回调 vs 粘贴」赛跑：粘贴提问只挂 pasteAbort——输者出局时只撤提问、不撤 flow。
    const pasteAbort = new AbortController()
    const branches: Promise<RaceWinner>[] = []
    if (server !== undefined) {
      branches.push(
        server.result.then(
          (result): RaceWinner =>
            'code' in result ? { kind: 'callback', code: result.code, state: result.state } : { kind: 'callback-error', error: result.error },
        ),
      )
    }
    branches.push(
      session
        .prompt({ kind: 'text', message: LOGIN_PASTE_PROMPT, signal: pasteAbort.signal })
        .then((text): RaceWinner => ({ kind: 'paste', text })),
    )
    let winner: RaceWinner
    try {
      winner = await Promise.race(branches)
    } finally {
      // 输者出局（§3.6：只撤提问、不撤 flow）；若回调分支仍在挂起，close() 会以
      // 错误结算它——该拒绝已无人消费，补一个吞掉的 catch 防 unhandledRejection。
      pasteAbort.abort()
      if (server !== undefined) server.result.catch(() => {})
    }

    // 归一：授权码 + 换证 redirect（RE-1 逐字一致）+ state 校验（RE-4 必须校验）。
    let authCode: string
    let redirectUri: string
    if (winner.kind === 'callback') {
      if (winner.state !== state) throw new BridgeError('AUTH_STATE')
      authCode = winner.code
      redirectUri = server?.redirectUri ?? ''
    } else if (winner.kind === 'callback-error') {
      const detail = winner.error.slice(0, CALLBACK_ERROR_MAX)
      throw new BridgeError('AUTH_STATE', `回调返回错误（${detail}），已拒绝本次授权`)
    } else {
      const parsed = parseCallbackUrl(winner.text)
      if (parsed === undefined) {
        throw new BridgeError('AUTH_STATE', '粘贴内容不是可解析的回调 URL（需含 authCode 参数）')
      }
      if (parsed.state !== state) throw new BridgeError('AUTH_STATE')
      authCode = parsed.authCode
      redirectUri = parsed.redirectUri
    }

    // 换 JWT（RE-1：免 appSecret 四字段体；15s 超时在 client 内，取消信号汇入本尝试）。
    const jwt = await deps.client.exchangeAuthCode({ authCode, redirectUri, state, signal: controller.signal })

    // 身份恒用 Config（RE-2：自动发现已证伪，无 discoverIdentity 分支）；
    // RE-5：JWT 无 exp → grant 不写 jwtExpiresAt 键。
    const grant: LoginGrant = {
      v: GRANT_VERSION,
      jwt,
      organization: deps.config.organization,
      project: deps.config.project,
      loginAt: deps.clock.now(),
    }
    const record: CredentialRecord = { kind: 'grant', payload: grant }

    // 返回前必须完成提交（NOT_COMMITTED 红线）。
    await session.commit(record)
    deps.log.info('登录完成：已提交 BigModel 登录记录')
  } finally {
    server?.close()
    session.signal.removeEventListener('abort', forwardAbort)
  }
}

/**
 * driver `paste()` 解析到的粘贴提问被 prompt 自带 signal 撤回时的拒绝形态。
 *
 * **不得**换成 `AuthorizationDeclinedError`：seam 只把 Declined 归为「人拒绝 →
 * cancelled」（`lib/index.js` 的 `interaction.prompt(...).catch` 分支只认该类），
 * 赛跑输家的撤问一旦被误判，整次尝试会跟着 cancelled。
 */
export class PasteWithdrawnError extends Error {
  constructor() {
    super('粘贴提问已被撤回（另一分支先行完成）')
    this.name = 'PasteWithdrawnError'
  }
}

/** driver 在途尝试的内部槽（§3.6 实现要点逐字字段）。 */
interface DriverAttempt {
  /** 本尝试的取消开关（TTL 到点 / `abort()` / 插件 dispose 都 abort 它）。 */
  controller: AbortController
  /** seam 通知的缓存（命令层回显与 T7 status 消费）。 */
  notices: AuthorizationNotice[]
  /** 粘贴槽：flow 的 text prompt 到达时挂上 resolve/reject，`paste()` 解它。 */
  pendingPaste?: { resolve: (text: string) => void; reject: (reason: unknown) => void }
  /** 尝试本体（不 await；`.catch` 只记日志）。 */
  promise: Promise<AuthorizationOutcome>
  /** 首个带 url 的 notice 的 url（`current()` / `begin()` 回显）。 */
  url?: string
  /** TTL 定时句柄（clock 域；settle 前清）。 */
  timer: TimerHandle
}

/** {@link createLoginDriver} 的依赖注入面。 */
export interface LoginDriverDeps {
  /**
   * 发起尝试的通道：生产装配传 `ctx.authorization.begin`（T7 接命令）；
   * 测试传桩。入参即 seam 的 `AuthorizationRequest`（key / interaction / signal）。
   */
  beginAttempt: (request: AuthorizationRequest) => Promise<AuthorizationOutcome>
  /** 诊断出口（只出码与步骤）。 */
  log: LogPort
  /** 计时来源（TTL 与「首个 notice 2s」都走它；测试换假时钟）。 */
  clock: ClockPort
  /** 尝试存活上限（Config `loginAttemptTtlMs`），到点 abort 整个尝试。 */
  ttlMs: number
}

/** 命令侧登录 driver（§3.6 逐字接口）。 */
export interface LoginDriver {
  /** 开始一次尝试；已在进行则只回显现有 URL。返回给命令的文本携带 URL。 */
  begin(origin: string): Promise<{ status: 'started' | 'in-flight'; url?: string; text: string }>
  /** 把用户粘贴的回调 URL 喂给正在等待的 prompt；无等待者则报错。 */
  paste(text: string): { ok: true } | { ok: false; reason: 'no-attempt' | 'not-waiting' }
  current(): { inFlight: boolean; url?: string }
  abort(): Promise<void>
}

/** 失败的日志摘要：桥错误只出码，其他异常出 name + message 首行 + 栈首帧（截断）。 */
function describeFailure(error: unknown): string {
  if (error instanceof BridgeError) return `code=${error.code}`
  if (error instanceof Error) {
    const frame = error.stack?.split('\n')[1]?.trim() ?? ''
    return `${error.name}: ${error.message.slice(0, 200)}${frame === '' ? '' : ` @ ${frame.slice(0, 160)}`}`
  }
  return 'unknown'
}

/**
 * 造命令侧登录 driver（§3.6）。
 *
 * 语义要点：
 * - `interaction.notify` 只把 notice 塞进 `notices`（首个到达即放行 `begin()` 的返回）；
 * - `interaction.prompt` 把 resolve/reject 存进 `pendingPaste`，并**监听 prompt 自带
 *   `signal`**——被撤时以 {@link PasteWithdrawnError} 拒绝（见该类说明）；
 * - `paste()` 解的是 `pendingPaste`，**原样传 URL 字符串**（解析与 state 校验在 flow 内）；
 * - `begin()` **不 await 整个尝试**：等「首个 notice 或 2s 超时」即返回；尝试本体继续
 *   跑，`promise` 上挂 `.catch` 只记日志；
 * - 生命周期：`ttlMs` 到点 `controller.abort()`；`abort()` 供插件 dispose 复用。
 *
 * @param deps - 注入面（beginAttempt / log / clock / ttlMs）。
 */
export function createLoginDriver(deps: LoginDriverDeps): LoginDriver {
  let attempt: DriverAttempt | undefined

  /** 通知进入：缓存 + 记录 url + 放行 `begin()` 的首 notice 等待。 */
  const handleNotice = (a: DriverAttempt, notice: AuthorizationNotice, releaseWait: (() => void) | undefined): void => {
    a.notices.push(notice)
    if (a.url === undefined && notice.url !== undefined) a.url = notice.url
    releaseWait?.()
  }

  /** 尝试结算：清 TTL 定时器；若当前槽位仍是本次尝试则清空（`current()` 回 false）。 */
  const settle = (a: DriverAttempt): void => {
    deps.clock.clearTimeout(a.timer)
    if (attempt === a) attempt = undefined
  }

  return {
    async begin(origin: string) {
      if (attempt !== undefined) {
        const existing = attempt
        deps.log.info('登录尝试已在进行中（回显现有授权链接）')
        return {
          status: 'in-flight' as const,
          ...(existing.url !== undefined && { url: existing.url }),
          text: '登录尝试已在进行中，请继续完成浏览器授权并粘贴回调 URL',
        }
      }

      const controller = new AbortController()
      const a: DriverAttempt = {
        controller,
        notices: [],
        promise: undefined as unknown as Promise<AuthorizationOutcome>,
        timer: undefined as unknown as TimerHandle,
      }

      // 「首个 notice 或 2s 超时」：两腿都指向 releaseWait，谁先到都放行 begin()。
      let releaseWait: (() => void) | undefined
      const firstNotice = new Promise<void>((resolve) => {
        releaseWait = resolve
      })
      const waitHandle = deps.clock.setTimeout(() => releaseWait?.(), BEGIN_TEXT_TIMEOUT_MS)

      const interaction: AuthorizationInteraction = {
        notify: (notice) => handleNotice(a, notice, releaseWait),
        prompt: (prompt) =>
          new Promise<string>((resolve, reject) => {
            const slot = { resolve, reject }
            a.pendingPaste = slot
            // prompt 自带 signal = 只撤这一个提问（flow 赛跑的输家撤问）：
            // 以 PasteWithdrawnError 拒绝，绝不冒充 AuthorizationDeclinedError。
            const withdraw = (): void => {
              if (a.pendingPaste !== slot) return
              a.pendingPaste = undefined
              reject(new PasteWithdrawnError())
            }
            if (prompt.signal !== undefined) {
              prompt.signal.addEventListener('abort', withdraw, { once: true })
              if (prompt.signal.aborted) withdraw()
            }
          }),
      }

      // 先发起尝试（通道同步抛则直接向上传播，不进槽位、不建定时器），
      // 再设 TTL 到点 abort 整个尝试（§3.6 生命周期），最后挂结算清理。
      a.promise = deps.beginAttempt({ key: LOGIN_RECORD_KEY, interaction, signal: controller.signal })
      a.timer = deps.clock.setTimeout(() => controller.abort(), deps.ttlMs)
      a.promise.then(
        () => settle(a),
        (error: unknown) => {
          deps.log.warn(`登录尝试失败：${describeFailure(error)}`)
          settle(a)
        },
      )
      attempt = a

      deps.log.info(`已为 ${origin} 发起 BigModel 登录尝试`)
      // 「首个 notice 或 2s 超时」：waitHandle 到点同样 resolve releaseWait，
      // 两腿都汇入 firstNotice——await 它即拿回 begin() 的返回时机。
      await firstNotice
      deps.clock.clearTimeout(waitHandle)

      const first = a.notices[0]
      return {
        status: 'started' as const,
        ...(a.url !== undefined && { url: a.url }),
        text: first?.message ?? '正在发起 BigModel 授权，请稍候（完成后把回调 URL 粘贴回来）',
      }
    },

    paste(text: string) {
      const current = attempt
      if (current === undefined) return { ok: false as const, reason: 'no-attempt' as const }
      const slot = current.pendingPaste
      if (slot === undefined) return { ok: false as const, reason: 'not-waiting' as const }
      current.pendingPaste = undefined
      slot.resolve(text) // 原样传 URL 字符串；解析与 state 校验都在 flow 内做
      return { ok: true as const }
    },

    current() {
      return attempt === undefined
        ? { inFlight: false }
        : { inFlight: true, ...(attempt.url !== undefined && { url: attempt.url }) }
    },

    async abort() {
      const current = attempt
      if (current === undefined) return
      current.controller.abort()
      await current.promise.catch(() => {
        // 结算失败已在 promise 的 catch 里记日志；abort 侧只等落地。
      })
    },
  }
}

/** flow 的 key（转出口：T7 命令侧 `authorization.begin({key})` 与 logout 都用它）。 */
export const loginRecordKey: CredentialKey = LOGIN_RECORD_KEY
