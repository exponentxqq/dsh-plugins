/**
 * 一次性本地回调服务器（H8；loopback redirect 的承接层）。
 *
 * `startCallbackServer` 只服务**一次**授权回调：
 * - **只监听 `127.0.0.1:0`**——回环地址 + 系统分配端口（绝不绑 `0.0.0.0`），
 *   `redirectUri` 形态 `http://127.0.0.1:<port><path>`（RE-1 要求与换证入参逐字一致）；
 * - **state 校验 fail-closed**（RE-4）：回调 query 的 `state` 与本尝试的 state 逐字
 *   比对，不符即回 4xx 失败短页并让 `result` 以 `BridgeError('AUTH_STATE')` 拒绝；
 *   query 字段 `authCode` 优先、兼容 `code`（RE-4，与 `parseCallbackUrl` 同一口径）；
 * - 成功 / 失败各回一个**纯文本短页**（浏览器停在回调页上的可见交代）；
 * - **超时自关**（缺省 {@link CALLBACK_SERVER_TIMEOUT_MS} = 10 分钟，可用 `timeoutMs`
 *   覆盖，计时走注入的 {@link ClockPort}）；
 * - **`close()` 幂等且必须结算仍挂起的 `result`**（以 {@link CallbackClosedError}
 *   拒绝）——否则 flow 的「回调 vs 粘贴」赛跑里，输家分支的 promise 会留下未处理
 *   拒绝（unhandledRejection）。
 *
 * 机密纪律（D-12）：日志与错误文案只出码与步骤，`authCode` 值与 `state` 值一律不落。
 *
 * @module dsh-plugin-zcode-plan/host/loopback
 */

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { BridgeError } from './errors.ts'
import type { CallbackResult, CallbackServer } from './login-flow.ts'
import { nodeClock } from './ports.ts'
import type { ClockPort, LogPort, TimerHandle } from './ports.ts'

/**
 * `close()` / 超时自关时仍挂起的 `result` 的拒绝形态（本文件导出，供 6.2 / 7.2
 * 复用与测试断言）。与「人拒绝」（seam 侧 `AuthorizationDeclinedError`）严格无关：
 * 它只表示「回调通道已关」，不携带任何授权语义。
 */
export class CallbackClosedError extends Error {
  constructor() {
    super('本地回调服务器已关闭（超时或流程结束），回调不再接收')
    this.name = 'CallbackClosedError'
  }
}

/** 服务器等待回调的缺省上限：10 分钟（与 Config `loginAttemptTtlMs` 缺省同量级）。 */
export const CALLBACK_SERVER_TIMEOUT_MS = 600_000

/** {@link startCallbackServer} 的选项面（login-flow 的 `StartCallbackServer` 入参同形）。 */
export interface CallbackServerOptions {
  /** 本尝试的 state（32hex）；回调 query 的 `state` 必须与之逐字一致。 */
  state: string
  /** 服务器挂的路径（生产装配传 login-flow 的 `CALLBACK_PATH`）。 */
  path: string
  /** 诊断出口（只出码与步骤，不含机密值）；省略 = 静默。 */
  log?: LogPort
  /** 计时来源（超时自关走它；测试换手动假时钟）。省略 = 真实现时钟。 */
  clock?: ClockPort
  /** 服务器存活上限（毫秒）；省略 = {@link CALLBACK_SERVER_TIMEOUT_MS}。 */
  timeoutMs?: number
}

/**
 * 起「一次性」回调服务器（H8）。
 *
 * 结算语义（`result` 上每个钩子只发生一次）：
 * - 成功回调（`authCode`/`code` + 逐字一致的 `state`）→ resolve `{code, state}`，
 *   浏览器收 200 成功短页；
 * - state 不符或缺授权码 → reject `BridgeError('AUTH_STATE')`，浏览器收 4xx 失败短页；
 * - `close()` / 超时自关时仍挂起 → reject {@link CallbackClosedError}（幂等：已结算
 *   的 result 不会被二次结算）。
 *
 * @param options - state / path 必填，log / clock / timeoutMs 可选（见
 *   {@link CallbackServerOptions}）。
 * @returns `{ redirectUri, result, close() }`；监听失败（端口分配异常等）直接抛出。
 */
export async function startCallbackServer(options: CallbackServerOptions): Promise<CallbackServer> {
  const { state, path, log } = options
  const clock = options.clock ?? nodeClock
  const timeoutMs = options.timeoutMs ?? CALLBACK_SERVER_TIMEOUT_MS

  // result 的「单次结算」闸门：赛跑输家的 close() 与赢家的 settle 竞态时，
  // 先到者定结果，后到者静默（幂等）。
  let settle!: (result: CallbackResult) => void
  let rejectSettle!: (reason: unknown) => void
  const result = new Promise<CallbackResult>((resolve, reject) => {
    settle = resolve
    rejectSettle = reject
  })
  let settled = false
  const settleOnce = (action: () => void): void => {
    if (settled) return
    settled = true
    action()
  }

  // 请求处理：只认本 path 上的 GET；query `authCode` 优先兼容 `code`（RE-4），
  // `state` 逐字比对（fail-closed）。所有短页都是纯文本，机密值不进任何响应。
  const server = http.createServer((req, res) => {
    /** 写纯文本短页；客户端提前断开等写失败静默（连接已无意义，无值可泄漏）。 */
    const respond = (status: number, body: string): void => {
      try {
        res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(body)
      } catch {
        res.destroy()
      }
    }
    if (req.method !== 'GET') {
      respond(405, '本回调地址只接受 GET\n')
      return
    }
    let url: URL
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1')
    } catch {
      respond(400, '回调 URL 无法解析\n')
      return
    }
    if (url.pathname !== path) {
      respond(404, 'Not Found\n')
      return
    }
    if (settled) {
      // 一次性语义：结果已结算后到达的重复回调不再改变结果。
      respond(410, '本回调地址已失效（一次性使用）\n')
      return
    }
    const authCode = url.searchParams.get('authCode') ?? url.searchParams.get('code')
    if (authCode === null || authCode.length === 0) {
      log?.info('回调命中：缺授权码参数，按 AUTH_STATE 拒绝')
      settleOnce(() => rejectSettle(new BridgeError('AUTH_STATE', '回调缺少授权码参数（authCode），已拒绝本次授权')))
      respond(400, '授权失败：回调缺少授权码参数，请回到终端重新发起登录。\n')
      return
    }
    const returnedState = url.searchParams.get('state') ?? ''
    if (returnedState !== state) {
      log?.info('回调命中：state 校验不通过，按 AUTH_STATE 拒绝')
      settleOnce(() => rejectSettle(new BridgeError('AUTH_STATE')))
      respond(400, '授权失败：state 校验不通过，请回到终端重新发起登录。\n')
      return
    }
    log?.info('回调命中：state 校验通过，授权码已接收（result 已结算）')
    settleOnce(() => settle({ code: authCode, state: returnedState }))
    respond(200, '授权成功，请回到终端继续。\n')
  })

  // 监听阶段：error → 启动失败（向上抛，调用方不会拿到半死的 server）。
  let failListen: ((reason: unknown) => void) | undefined
  const listening = new Promise<void>((resolve, reject) => {
    failListen = reject
    server.once('listening', resolve)
  })
  server.once('error', (error: Error) => failListen?.(error))
  // 只绑回环 + 端口 0（系统分配）：绝不监听 0.0.0.0（H8 红线）。
  server.listen(0, '127.0.0.1')
  try {
    await listening
  } catch (error) {
    server.close()
    throw error
  }
  // 监听期之后的运行期错误（套接字异常等）只记日志，不让进程级 error 事件崩掉宿主。
  server.on('error', (error: Error) => {
    log?.warn(`回调服务器运行期错误：${error.name}`)
  })

  const port = (server.address() as AddressInfo).port
  const redirectUri = `http://127.0.0.1:${port}${path}`

  // 先定义 close 再登记定时器：无 use-before-define；timeoutMs=0 等极端值下回调
  // 最早也在宏任务触发，届时 timer 已赋值。
  let closed = false
  let timer: TimerHandle | undefined

  /**
   * 幂等关闭：停监听 + 清定时器 + 结算仍挂起的 result（CallbackClosedError）。
   * 重复调用 / result 已结算后再调用都不抛、不二次结算。
   */
  const close = (): void => {
    if (closed) return
    closed = true
    if (timer !== undefined) clock.clearTimeout(timer)
    try {
      server.close(() => {})
      // 摘掉 keep-alive 空闲连接，让 close 立即落地（测试进程不被悬挂句柄拖住）。
      server.closeIdleConnections()
    } catch {
      // 关闭竞态（已停止监听等）：幂等语义下静默。
    }
    settleOnce(() => rejectSettle(new CallbackClosedError()))
    log?.info('回调服务器已关闭')
  }

  timer = clock.setTimeout(() => {
    log?.warn('回调服务器等待超时，自动关闭（挂起的回调已作废）')
    close()
  }, timeoutMs)

  log?.info(`回调服务器已启动：${redirectUri}`)
  return { redirectUri, result, close }
}
