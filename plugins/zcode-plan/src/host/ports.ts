/**
 * 本插件的窄端口（H3）：只声明插件消费的最小成员面，不 import 上游抽象类
 * （照 `user-commands` 的「窄面 + 类型只读」纪律，见 code-design §3.1）。
 *
 * - {@link FetchPort}：`(input, init) => Promise<Response>` 形状的最小 HTTP 通道，
 *   `client.ts` 全部请求经它发出（测试换假 fetch，不碰真网络）；
 * - {@link ClockPort}：`now()` + `setTimeout` 句柄包装，超时与 PAT 续期计时都走它
 *   （测试换假时钟，能推进到 15s 断言 `TIMEOUT`）；
 * - {@link LogPort}：`info/warn/error` 三通道诊断出口，前缀 {@link LOG_PREFIX}
 *   （照 `session-tool-toggle/src/host/index.ts` 的 `LOG_PREFIX` 写法）；
 * - {@link CredentialsPort}：credentials seam 的七方法窄面（§3.1）——引用（PAT）走
 *   `resolve/describe/set/unset`，记录（登录 grant）走 `readRecord/modifyRecord/deleteRecord`。
 *
 * 文件同时提供三个真实现适配器（`nodeFetch` / `nodeClock` / `createLogPort`）：
 * 装配层（T4）直接取用，测试用自写 fake——两侧都依赖同一个类型面。
 *
 * @module dsh-plugin-zcode-plan/host/ports
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CredentialKey, CredentialRecord, CredentialRef } from '@deepseek-ai/dsh-credentials/types'
import { BridgeError } from './errors.ts'

/** 最小 HTTP 通道面：`init` 必传（`client.ts` 每次调用都构造完整 `RequestInit`）。 */
export interface FetchPort {
  (input: string, init: RequestInit): Promise<Response>
}

/** `ClockPort.setTimeout` 的句柄。刻意 `unknown`：真实现是 Node 句柄，假实现可以是任意值。 */
export type TimerHandle = unknown

/** 最小时钟面：PAT 效期换算、15s 超时与续期定时全部经它（§3.1）。 */
export interface ClockPort {
  /** 当前时刻（epoch ms）。 */
  now(): number
  /** 定时器句柄包装：`timeoutMs` 后触发一次 `handler`。 */
  setTimeout(handler: () => void, timeoutMs: number): TimerHandle
  /** 取消尚未触发的定时器（幂等：对已触发/未知句柄安全）。 */
  clearTimeout(handle: TimerHandle): void
}

/** 最小诊断面：三个通道各收一行文本。 */
export interface LogPort {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

/**
 * credentials seam 的窄面（§3.1；本任务 4.1 追加）。
 *
 * 与既有端口同一纪律：**只声明本插件消费的最小成员面，不 import 上游抽象类**
 * （`CredentialProvider` 等）。三个 branded 类型（`CredentialKey` /
 * `CredentialRef` / `CredentialRecord`）经 `@deepseek-ai/dsh-credentials/types`
 * 做 type-only 导入——该子路径是纯类型面，不产生任何运行时依赖。
 *
 * 七个方法覆盖两类凭据地址（§3.3 / D-4）：
 * - **引用**（PAT，`credentialRef` 名空间）：`resolve`（每次操作解析、不缓存）、
 *   `describe`（只报 configured/source/writable，不含值）、`set` / `unset`；
 * - **记录**（登录 grant，`<scope>/<id>` 键空间）：`readRecord`、`modifyRecord`
 *   （**唯一写路径**，mutate 拿到写入独占时的最新值）、`deleteRecord`。
 */
export interface CredentialsPort {
  resolve(ref: CredentialRef): Promise<{ value: string; source: string } | undefined>
  describe(ref: CredentialRef): Promise<{ configured: boolean; source?: string; writable: boolean }>
  set(ref: CredentialRef, value: string): Promise<void>
  unset(ref: CredentialRef): Promise<void>
  readRecord(key: CredentialKey): Promise<CredentialRecord | undefined>
  modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined>
  deleteRecord(key: CredentialKey): Promise<void>
}

/**
 * 进程日志里一眼分辨本插件的诊断前缀（照 `session-tool-toggle` 的 `LOG_PREFIX`）。
 * 由 {@link createLogPort} 统一拼接；`LogPort` 的消费方不再自行加前缀。
 */
export const LOG_PREFIX = 'zcode-plan：'

/** 真实现时钟：`Date.now()` + 全局定时器。 */
export const nodeClock: ClockPort = {
  now: () => Date.now(),
  setTimeout: (handler, timeoutMs) => globalThis.setTimeout(handler, timeoutMs),
  clearTimeout: (handle) => {
    // 句柄类型在 ClockPort 面上是 unknown；真实现只会收到自己 setTimeout 的返回值。
    globalThis.clearTimeout(handle as NodeJS.Timeout)
  },
}

/** 真实现 HTTP 通道：绑定宿主全局 `fetch`（解构直传，避免 `this` 丢失）。 */
export const nodeFetch: FetchPort = (input, init) => globalThis.fetch(input, init)

/**
 * 从宿主上下文造出本插件的诊断出口（照 `user-commands` 的 `commandLog` 写法）。
 *
 * 与 `commandLog` 同一观察口径：宿主 logger 与 console 各打一份——进程日志在容器
 * 部署里往往不是人类在看的那份。装配层（T4）创建一次后向下传 {@link LogPort} 面。
 *
 * @param ctx - 宿主上下文。
 * @returns 统一带 {@link LOG_PREFIX} 前缀的三通道日志出口。
 */
export function createLogPort(ctx: Context): LogPort {
  const line = (message: string): string => `${LOG_PREFIX}${message}`
  return {
    info: (message) => {
      ctx.logger.info(line(message))
      console.info(line(message))
    },
    warn: (message) => {
      ctx.logger.warn(line(message))
      console.warn(line(message))
    },
    error: (message) => {
      ctx.logger.error(line(message))
      console.error(line(message))
    },
  }
}

/**
 * 超时护栏：统一 15s `AbortSignal` 的计时载体（§3.4「统一 15s AbortSignal」）。
 *
 * `signal` 交给 fetch（真 fetch 收到 abort 即中止在途请求）；`timedOut` 是给调用方的
 * 第二条腿——假 fetch 若不感知 `signal`，调用方 `Promise.race([fetchP, guard.timedOut])`
 * 仍能以 `BridgeError('TIMEOUT')` 按时失败（X2 的假时钟用例依赖这条腿）。
 */
export interface TimeoutGuard {
  /** 到点即 abort 的信号（与外部取消信号合并后传给 fetch）。 */
  readonly signal: AbortSignal
  /** 到点即以 `BridgeError('TIMEOUT')` 拒绝；`dispose()` 后永不结算。调用方必须 race / await 挂上它。 */
  readonly timedOut: Promise<never>
  /** 取消计时（finally 里调用；幂等）。 */
  dispose(): void
}

/**
 * 造一个到点 abort 的超时护栏（§3.4；计时走注入的 {@link ClockPort}，测试换假时钟）。
 *
 * 到点动作有两步：abort `signal`（中止真请求）+ 以 `BridgeError('TIMEOUT')` 拒绝
 * `timedOut`（把 abort 归类为超时，§3.10 码表「TIMEOUT | 15s」）。
 *
 * @param options.clock - 计时来源（注入，不直读 `Date`）。
 * @param options.timeoutMs - 超时上限（毫秒）。
 * @returns 护栏；调用方在 `finally` 里 `dispose()`。
 */
export function createTimeoutSignal(options: { clock: ClockPort; timeoutMs: number }): TimeoutGuard {
  const controller = new AbortController()
  let settled = false
  let rejectTimedOut!: (reason: unknown) => void
  const timedOut = new Promise<never>((_, reject) => {
    rejectTimedOut = reject
  })
  const handle = options.clock.setTimeout(() => {
    if (settled) return
    settled = true
    controller.abort()
    rejectTimedOut(new BridgeError('TIMEOUT'))
  }, options.timeoutMs)
  return {
    signal: controller.signal,
    timedOut,
    dispose: () => {
      if (settled) return
      settled = true
      options.clock.clearTimeout(handle)
    },
  }
}
