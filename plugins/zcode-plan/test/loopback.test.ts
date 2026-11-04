import { describe, expect, it, vi } from 'vitest'
import { BridgeError } from '../src/host/errors.ts'
import { CallbackClosedError, CALLBACK_SERVER_TIMEOUT_MS, startCallbackServer } from '../src/host/loopback.ts'
import { CALLBACK_PATH } from '../src/host/login-flow.ts'
import type { ClockPort, LogPort } from '../src/host/ports.ts'

/**
 * loopback.ts 一次性回调服务器单测（X5；任务 6.1）。
 *
 * 与 login-flow.test.ts（假 startServer）分工：这里起**真实的** localhost HTTP
 * 服务器，用 `fetch` 打真实请求验证——成功 200 / state 不符 4xx / close 幂等结算 /
 * 超时自关。红线：**只访问 `127.0.0.1`（系统分配端口），零外网**；`redirectUri`
 * 的形态断言（`http://127.0.0.1:<port>…`）同时钉死「不监听 0.0.0.0」。
 *
 * 时钟纪律：本文件**不用** vitest fake timers（真 fetch 需要真实定时器）；超时
 * 自关用例改走手动触发的假 ClockPort（登记不启动，测试显式 fire），不等真实时长。
 */

/** 本尝试的 state 夹具（32hex 形态）。 */
const STATE = 'a'.repeat(32)

/** 手动触发的假时钟：setTimeout 只登记句柄不启动，`fire()` 一次性触发全部挂起回调。 */
function makeManualClock(): ClockPort & { fire(): void; size(): number } {
  const pending = new Map<unknown, () => void>()
  let next = 1
  const clock: ClockPort = {
    now: () => Date.now(),
    setTimeout: (handler) => {
      const handle = next
      next += 1
      pending.set(handle, handler)
      return handle
    },
    clearTimeout: (handle) => {
      pending.delete(handle)
    },
  }
  return {
    ...clock,
    fire: () => {
      // 快照后触发：handler 若在触发期间清理句柄（如 close→clearTimeout），不影响本轮遍历。
      const snapshot = Array.from(pending.values())
      for (const handler of snapshot) handler()
    },
    size: () => pending.size,
  }
}

/** GET 一把并收纯文本体（fetch 只访问 127.0.0.1；网络层失败直接向上抛）。 */
async function get(url: string): Promise<{ status: number; headers: Headers; body: string }> {
  const res = await fetch(url)
  return { status: res.status, headers: res.headers, body: await res.text() }
}

/** result 的两形落袋：成功给 {kind:'resolved'}，拒绝给 {kind:'rejected'}——断言期不抛。 */
async function settleOf(promise: Promise<unknown>): Promise<{ kind: 'resolved'; value: unknown } | { kind: 'rejected'; reason: unknown }> {
  return promise.then(
    (value) => ({ kind: 'resolved' as const, value }),
    (reason: unknown) => ({ kind: 'rejected' as const, reason }),
  )
}

/** 全 Mock 的 LogPort（通道保持 Mock 类型，便于逐行断言 `.mock.calls`）。 */
function makeLogPort() {
  return {
    info: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
  } satisfies LogPort
}

describe('startCallbackServer（H8 一次性回调服务器）', () => {
  it('成功回调：authCode+state 命中 → result resolve {code,state}、HTTP 200 成功短页；redirectUri 是 127.0.0.1 随机端口', async () => {
    const log = makeLogPort()
    const server = await startCallbackServer({ state: STATE, path: CALLBACK_PATH, log })
    try {
      // 只绑回环 + 随机端口（系统分配；端口 0 由内核挑，绝不落 0.0.0.0 / localhost）。
      expect(server.redirectUri).toBe(`http://127.0.0.1:${new URL(server.redirectUri).port}${CALLBACK_PATH}`)
      expect(server.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback\/bigmodel$/)
      expect(server.redirectUri).not.toContain('0.0.0.0')
      const port = Number(new URL(server.redirectUri).port)
      expect(port).toBeGreaterThan(0)
      expect(port).toBeLessThanOrEqual(65_535)

      const pending = settleOf(server.result)
      const res = await get(`${server.redirectUri}?authCode=AUTHCODE-1234&state=${STATE}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/plain')
      expect(await pending).toEqual({ kind: 'resolved', value: { code: 'AUTHCODE-1234', state: STATE } })

      // 机密纪律（D-12）：任何日志通道都不出现 authCode 值。
      for (const channel of [log.info, log.warn, log.error]) {
        for (const line of channel.mock.calls) expect(String(line[0])).not.toContain('AUTHCODE-1234')
      }
      // result 已结算后再 close（重复调用）：幂等不抛，结果不被二次结算。
      expect(() => server.close()).not.toThrow()
      expect(() => server.close()).not.toThrow()
      expect(await settleOf(server.result)).toEqual({ kind: 'resolved', value: { code: 'AUTHCODE-1234', state: STATE } })
    } finally {
      server.close()
    }
  })

  it('query 兼容 `code` 字段（无 authCode 时）：同样 resolve {code,state}', async () => {
    const server = await startCallbackServer({ state: STATE, path: CALLBACK_PATH })
    try {
      const pending = settleOf(server.result)
      const res = await get(`${server.redirectUri}?code=CODE-LEGACY&state=${STATE}`)
      expect(res.status).toBe(200)
      expect(await pending).toEqual({ kind: 'resolved', value: { code: 'CODE-LEGACY', state: STATE } })
    } finally {
      server.close()
    }
  })

  it('state 不符：result 以 BridgeError(AUTH_STATE) 拒绝、HTTP 4xx 失败短页，日志不含 authCode 值', async () => {
    const log = makeLogPort()
    const server = await startCallbackServer({ state: STATE, path: CALLBACK_PATH, log })
    try {
      const pending = settleOf(server.result)
      const res = await get(`${server.redirectUri}?authCode=AUTHCODE-1234&state=wrong-state`)
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThanOrEqual(499)
      expect(res.headers.get('content-type')).toContain('text/plain')
      expect(res.body).toContain('授权失败')

      const outcome = await pending
      expect(outcome.kind).toBe('rejected')
      const reason = (outcome as { kind: 'rejected'; reason: unknown }).reason
      expect(reason).toBeInstanceOf(BridgeError)
      expect((reason as BridgeError).code).toBe('AUTH_STATE')
      // 机密纪律（D-12）：失败路径的日志也不出现 authCode 值。
      for (const channel of [log.info, log.warn, log.error]) {
        for (const line of channel.mock.calls) expect(String(line[0])).not.toContain('AUTHCODE-1234')
      }
    } finally {
      server.close()
    }
  })

  it('缺授权码参数：result 以 BridgeError(AUTH_STATE) 拒绝、HTTP 4xx', async () => {
    const server = await startCallbackServer({ state: STATE, path: CALLBACK_PATH })
    try {
      const pending = settleOf(server.result)
      const res = await get(`${server.redirectUri}?state=${STATE}`)
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThanOrEqual(499)
      const outcome = await pending
      expect(outcome.kind).toBe('rejected')
      const reason = (outcome as { kind: 'rejected'; reason: unknown }).reason
      expect(reason).toBeInstanceOf(BridgeError)
      expect((reason as BridgeError).code).toBe('AUTH_STATE')
    } finally {
      server.close()
    }
  })

  it('非本 path 的请求：HTTP 404 且不动 result（保持挂起）', async () => {
    const server = await startCallbackServer({ state: STATE, path: CALLBACK_PATH })
    try {
      const origin = new URL(server.redirectUri).origin
      const res = await get(`${origin}/other/path?authCode=X&state=${STATE}`)
      expect(res.status).toBe(404)
      // 误入请求不结算：result 仍挂起（短轮询确认未落地）。
      const probe = settleOf(server.result)
      const raced = await Promise.race([probe.then(() => 'settled' as const), new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 50))])
      expect(raced).toBe('pending')
    } finally {
      server.close()
    }
  })

  it('close()：幂等不抛；挂起的 result 以 CallbackClosedError 拒绝（name 逐字）', async () => {
    const server = await startCallbackServer({ state: STATE, path: CALLBACK_PATH })
    const pending = settleOf(server.result)
    server.close()
    expect(() => server.close()).not.toThrow()
    const outcome = await pending
    expect(outcome.kind).toBe('rejected')
    const reason = (outcome as { kind: 'rejected'; reason: unknown }).reason
    expect(reason).toBeInstanceOf(CallbackClosedError)
    expect((reason as Error).name).toBe('CallbackClosedError')
  })

  it('超时自关：timeoutMs 到点 close 并以 CallbackClosedError 结算挂起 result；缺省上限常量为 10 分钟', async () => {
    const clock = makeManualClock()
    const log = makeLogPort()
    const server = await startCallbackServer({ state: STATE, path: CALLBACK_PATH, clock, timeoutMs: 1234, log })
    const pending = settleOf(server.result)
    expect(clock.size()).toBe(1)
    clock.fire()
    const outcome = await pending
    expect(outcome.kind).toBe('rejected')
    const reason = (outcome as { kind: 'rejected'; reason: unknown }).reason
    expect(reason).toBeInstanceOf(CallbackClosedError)
    // 超时已自关：显式 close 幂等不抛。
    expect(() => server.close()).not.toThrow()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('超时'))
    // 缺省 timeoutMs = CALLBACK_SERVER_TIMEOUT_MS = 10 分钟（H8 规格）。
    expect(CALLBACK_SERVER_TIMEOUT_MS).toBe(600_000)
  })
})
