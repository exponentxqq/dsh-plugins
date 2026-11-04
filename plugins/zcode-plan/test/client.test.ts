import { describe, expect, it, vi } from 'vitest'
import { createBigmodelClient } from '../src/host/bigmodel/client.ts'
import {
  DEFAULT_CLIENT_VERSION,
  KEY_USAGE_SCENE,
  TOKEN_BY_AUTH_CODE_URL,
  USAGE_LIMIT_URL,
  keyCreatePath,
  keyListPath,
  patIssuePath,
} from '../src/host/bigmodel/endpoints.ts'
import { BridgeError, classifyHttp } from '../src/host/errors.ts'
import type { ClockPort, FetchPort, LogPort } from '../src/host/ports.ts'

/**
 * 敏感夹具（X2 红线）：作为「真值」塞进请求头 / 响应体，断言错误文案与日志绝不外泄。
 * 长度刻意 ≥ 8（与 errors.ts 的机密判定阈值一致）。
 */
const jwtFixture = 'jwt-fixture-abcd1234EFgh5678'
const patFixture = 'pat-fixture-9999xyZk0099LLmq'

const ORG = 'org-x1'
const PROJ = 'proj-y2'
/** 假时钟固定时刻（epoch ms）：issuePat 三级兜底的换算基准。 */
const START_MS = 1_700_000_000_000

/** JSON 响应桩（默认 2xx；传 status 即得失败响应）。 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** 假时钟：now 恒定；setTimeout 在册记录、advance 手动到点；clearTimeout 只记录调用。 */
function makeFakeClock(nowMs = START_MS) {
  const timers: Array<{ timeoutMs: number; handler: () => void }> = []
  const clearedHandles: unknown[] = []
  const clock: ClockPort = {
    now: () => nowMs,
    setTimeout(handler, timeoutMs) {
      timers.push({ timeoutMs, handler })
      return timers.length
    },
    clearTimeout: (handle) => {
      clearedHandles.push(handle)
    },
  }
  return {
    clock,
    timers,
    clearedHandles,
    /** 手动推进：触发当前全部在册计时器（假时钟的「到点」）。 */
    advance(): void {
      for (const timer of timers) timer.handler()
    },
  }
}

/** 假 fetch：按序弹出响应工厂并记录每次 (url, init)。 */
function makeFakeFetch(responses: Array<() => Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetch: FetchPort = (input, init) => {
    calls.push({ url: input, init })
    const make = responses.shift()
    if (make === undefined) throw new Error('fake fetch 响应队列已空')
    return Promise.resolve(make())
  }
  return { calls, fetch }
}

/** 永不决的假 fetch（超时用例专用）：不感知 signal，靠 guard.timedOut 那条腿按时失败。 */
const neverFetch: FetchPort = () => new Promise<Response>(() => {})

/** 组装被测客户端；假 log 顺带导出，供「失败日志只含码」的断言使用。 */
function makeClient(fetch: FetchPort, clock: ClockPort = makeFakeClock().clock) {
  const log: LogPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { client: createBigmodelClient({ fetch, clock, log }), log }
}

/** 捕获 rejection 并收窄成 BridgeError（本客户端的全部失败都应是 BridgeError）。 */
async function rejectionOf(promise: Promise<unknown>): Promise<BridgeError> {
  try {
    await promise
  } catch (error) {
    return error as BridgeError
  }
  throw new Error('预期以 BridgeError 失败，但请求成功了')
}

describe('请求形状（X2-1）', () => {
  it('exchangeAuthCode：POST 换证端点，体恰四字段、免 appSecret，取 data.bigmodel.access_token', async () => {
    const { calls, fetch } = makeFakeFetch([
      () => jsonResponse({ code: 0, msg: 'ok', data: { bigmodel: { access_token: jwtFixture }, token: 'zcode 侧 JWT 不使用' } }),
    ])
    const { client } = makeClient(fetch)
    const jwt = await client.exchangeAuthCode({
      authCode: 'ac-1',
      redirectUri: 'http://127.0.0.1:8377/callback',
      state: 'st-9f',
    })
    expect(jwt).toBe(jwtFixture)
    expect(calls).toHaveLength(1)
    const first = calls[0]
    if (first === undefined) throw new Error('应恰好发出一次请求')
    expect(first.url).toBe(TOKEN_BY_AUTH_CODE_URL)
    expect(first.init.method).toBe('POST')
    // toEqual 精确匹配即证明体恰为四字段；全文不含 appSecret（RE-1 免密钥形态）。
    expect(JSON.parse(String(first.init.body))).toEqual({
      provider: 'bigmodel',
      code: 'ac-1',
      redirect_uri: 'http://127.0.0.1:8377/callback',
      state: 'st-9f',
    })
    expect(String(first.init.body)).not.toContain('appSecret')
  })

  it('listKeys：GET keyListPath，头恰为 Authorization: Bearer <jwt>，按 apiKey/name/usageScene 收紧', async () => {
    const { calls, fetch } = makeFakeFetch([
      () => jsonResponse({ code: 200, data: [{ apiKey: 'key-1', name: 'zcode-plan-bridge', usageScene: 1 }] }),
    ])
    const { client } = makeClient(fetch)
    const rows = await client.listKeys({ jwt: jwtFixture, organization: ORG, project: PROJ })
    expect(rows).toEqual([{ keyId: 'key-1', name: 'zcode-plan-bridge', usageScene: 1 }])
    const first = calls[0]
    if (first === undefined) throw new Error('应恰好发出一次请求')
    expect(first.url).toBe(keyListPath(ORG, PROJ))
    expect(first.init.method).toBe('GET')
    expect(first.init.headers).toEqual({ authorization: `Bearer ${jwtFixture}` })
  })

  it('createKey：POST keyCreatePath，体 { name, usageScene: 1 }，返回 data.apiKey', async () => {
    const { calls, fetch } = makeFakeFetch([() => jsonResponse({ code: 200, data: { apiKey: 'key-new' } })])
    const { client } = makeClient(fetch)
    const keyId = await client.createKey({ jwt: jwtFixture, organization: ORG, project: PROJ, name: 'zcode-plan-bridge' })
    expect(keyId).toBe('key-new')
    const first = calls[0]
    if (first === undefined) throw new Error('应恰好发出一次请求')
    expect(first.url).toBe(keyCreatePath(ORG, PROJ))
    expect(first.init.method).toBe('POST')
    expect(JSON.parse(String(first.init.body))).toEqual({ name: 'zcode-plan-bridge', usageScene: KEY_USAGE_SCENE })
    expect(first.init.headers).toEqual({ authorization: `Bearer ${jwtFixture}`, 'content-type': 'application/json' })
  })

  it('issuePat：POST patIssuePath(keyId)，体 { clientType, clientVersion }，头 Bearer', async () => {
    const { calls, fetch } = makeFakeFetch([
      () => jsonResponse({ code: 200, data: { accessToken: patFixture, expiresIn: 7200 } }),
    ])
    const { client } = makeClient(fetch)
    const lease = await client.issuePat({ jwt: jwtFixture, organization: ORG, project: PROJ, keyId: 'key-1' })
    expect(lease.pat).toBe(patFixture)
    const first = calls[0]
    if (first === undefined) throw new Error('应恰好发出一次请求')
    expect(first.url).toBe(patIssuePath(ORG, PROJ, 'key-1'))
    expect(first.init.method).toBe('POST')
    expect(JSON.parse(String(first.init.body))).toEqual({ clientType: 'zcode', clientVersion: DEFAULT_CLIENT_VERSION })
    expect(first.init.headers).toEqual({ authorization: `Bearer ${jwtFixture}`, 'content-type': 'application/json' })
  })

  it('readUsage：GET USAGE_LIMIT_URL，头为裸 JWT（无 Bearer 前缀）+ 组织 / 项目两个头，limits 原样透出', async () => {
    const { calls, fetch } = makeFakeFetch([
      () => jsonResponse({ code: 200, data: { level: 'glm-coding-pro', limits: [{ unit: 3, usage: 42 }] } }),
    ])
    const { client } = makeClient(fetch)
    const usage = await client.readUsage({ jwt: jwtFixture, organization: ORG, project: PROJ })
    expect(usage).toEqual({ level: 'glm-coding-pro', limits: [{ unit: 3, usage: 42 }] })
    const first = calls[0]
    if (first === undefined) throw new Error('应恰好发出一次请求')
    expect(first.url).toBe(USAGE_LIMIT_URL)
    expect(first.init.method).toBe('GET')
    // 头形态不对称是实测事实：authorization 恰为裸 JWT（toEqual 精确匹配即排除 Bearer）。
    expect(first.init.headers).toEqual({
      authorization: jwtFixture,
      'bigmodel-organization': ORG,
      'bigmodel-project': PROJ,
    })
    expect(String((first.init.headers as Record<string, string>).authorization)).not.toContain('Bearer')
  })

  it('成功请求后计时器清理：guard.dispose 在 finally 里调用 clock.clearTimeout（未触发路径）', async () => {
    const fakeClock = makeFakeClock()
    const { calls, fetch } = makeFakeFetch([() => jsonResponse({ code: 200, data: [] })])
    const { client } = makeClient(fetch, fakeClock.clock)
    await client.listKeys({ jwt: jwtFixture, organization: ORG, project: PROJ })
    expect(calls).toHaveLength(1)
    expect(fakeClock.clearedHandles).toHaveLength(1)
  })
})

describe('统一 15s 超时（X2-2）', () => {
  it('假 clock 推进 15s 触发 TIMEOUT：计时上限恰 15s，到点后无遗留未触发计时器', async () => {
    const fakeClock = makeFakeClock()
    const { client, log } = makeClient(neverFetch, fakeClock.clock)
    const pending = client.listKeys({ jwt: jwtFixture, organization: ORG, project: PROJ })
    // 发起请求即注册唯一计时器，上限恰为 15s（§3.4 统一 15s）。
    expect(fakeClock.timers).toHaveLength(1)
    expect(fakeClock.timers[0]?.timeoutMs).toBe(15_000)
    fakeClock.advance()
    const cap = await rejectionOf(pending)
    expect(cap.code).toBe('TIMEOUT')
    // 已到点触发的计时器由 dispose 语义免清理（settled 早退）；未触发路径的
    // clearTimeout 断言见上一组「成功请求后计时器清理」用例。
    expect(fakeClock.clearedHandles).toHaveLength(0)
    // 失败诊断日志只含码（guard 的 describeFailure），不含任何响应值。
    expect(log.warn).toHaveBeenCalledOnce()
    const warnLine = vi.mocked(log.warn).mock.calls[0]?.[0] ?? ''
    expect(warnLine).toContain('code=TIMEOUT')
    expect(warnLine).not.toContain(jwtFixture)
  })
})

describe('issuePat 效期三级兜底（X2-3）', () => {
  /** 三分支共用：固定假时钟 + 指定 data，返回解析出的租约。 */
  async function issueLease(data: Record<string, unknown>): Promise<{ pat: string; expiresAt: number }> {
    const fakeClock = makeFakeClock()
    const { fetch } = makeFakeFetch([() => jsonResponse({ code: 200, data })])
    const { client } = makeClient(fetch, fakeClock.clock)
    return await client.issuePat({ jwt: jwtFixture, organization: ORG, project: PROJ, keyId: 'key-1' })
  }

  it('分支 1：expiresIn 7200s（时长口径，优先）→ requestStartedAt + 7_200_000ms', async () => {
    const lease = await issueLease({ accessToken: patFixture, expiresIn: 7200 })
    expect(lease.pat).toBe(patFixture)
    expect(lease.expiresAt).toBe(START_MS + 7_200_000)
  })

  it('分支 2：expiresAt（epoch 秒）→ 绝对值换算 ms（落在夹取窗 [now, now+6h] 内）', async () => {
    const lease = await issueLease({ accessToken: patFixture, expiresAt: (START_MS + 3_600_000) / 1_000 })
    expect(lease.pat).toBe(patFixture)
    expect(lease.expiresAt).toBe(START_MS + 3_600_000)
  })

  it('分支 3：expiresIn / expiresAt 都不给 → requestStartedAt + 18_000_000ms（满值兜底）', async () => {
    const lease = await issueLease({ accessToken: patFixture })
    expect(lease.pat).toBe(patFixture)
    expect(lease.expiresAt).toBe(START_MS + 18_000_000)
  })
})

describe('错误文案脱敏（X2-4）', () => {
  it('401 且响应体含 jwt 真值 → JWT_EXPIRED，err.message 不含 jwt 夹具', async () => {
    const { calls, fetch } = makeFakeFetch([
      () => jsonResponse({ code: 401, msg: jwtFixture, data: { token: jwtFixture } }, 401),
    ])
    const { client } = makeClient(fetch)
    const err = await rejectionOf(client.listKeys({ jwt: jwtFixture, organization: ORG, project: PROJ }))
    expect(err).toBeInstanceOf(BridgeError)
    expect(err.code).toBe('JWT_EXPIRED')
    expect(err.message).not.toContain(jwtFixture)
    expect(calls).toHaveLength(1)
  })
})

describe('错误分类抽查（X2-5）', () => {
  it('405 且体含 3012 → RISK_3012', async () => {
    const { fetch } = makeFakeFetch([() => jsonResponse({ code: 3012, msg: '触发风控' }, 405)])
    const { client } = makeClient(fetch)
    const err = await rejectionOf(client.listKeys({ jwt: jwtFixture, organization: ORG, project: PROJ }))
    expect(err).toBeInstanceOf(BridgeError)
    expect(err.code).toBe('RISK_3012')
  })

  it('2xx + envelope code:1500 → BUSINESS:1500，服务端 msg 经 maskSecret 后原文不外泄', async () => {
    const { fetch } = makeFakeFetch([() => jsonResponse({ code: 1500, msg: '应用密钥不能为空' })])
    const { client } = makeClient(fetch)
    const err = await rejectionOf(client.createKey({ jwt: jwtFixture, organization: ORG, project: PROJ, name: 'n' }))
    expect(err).toBeInstanceOf(BridgeError)
    expect(err.code).toBe('BUSINESS:1500')
    // '应用密钥不能为空' 长度 8 → maskSecret 打成 '***'，原文不进文案。
    expect(err.message).not.toContain('应用密钥不能为空')
    expect(err.message).toContain('msg=***')
  })

  it('429 → HTTP:429，classifyHttp(429) 归 retryable', async () => {
    const { fetch } = makeFakeFetch([() => jsonResponse({ msg: 'too many requests' }, 429)])
    const { client } = makeClient(fetch)
    const err = await rejectionOf(client.readUsage({ jwt: jwtFixture, organization: ORG, project: PROJ }))
    expect(err).toBeInstanceOf(BridgeError)
    expect(err.code).toBe('HTTP:429')
    expect(classifyHttp(429)).toBe('retryable')
  })
})
