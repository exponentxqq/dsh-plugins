import { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization'
import type {
  AuthorizationNotice,
  AuthorizationOutcome,
  AuthorizationPrompt,
  AuthorizationRequest,
  AuthorizationSession,
} from '@deepseek-ai/dsh-authorization'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BigmodelClient, ExchangeAuthCodeInput } from '../src/host/bigmodel/client.ts'
import { BridgeError } from '../src/host/errors.ts'
import {
  AUTHORIZE_APP_ID,
  AUTHORIZE_URL,
  BEGIN_TEXT_TIMEOUT_MS,
  CALLBACK_PATH,
  LOGIN_NOTICE_MESSAGE,
  LOGIN_PASTE_PROMPT,
  PasteWithdrawnError,
  buildAuthorizeUrl,
  createLoginDriver,
  createLoginFlow,
  parseCallbackUrl,
  randomState,
  type CallbackResult,
  type LoginFlowConfig,
  type LoginFlowDeps,
  type StartCallbackServer,
} from '../src/host/login-flow.ts'
import type { ClockPort, LogPort } from '../src/host/ports.ts'

/**
 * 登录 flow ↔ driver 集成单测（X5 集成部分；任务 5.2）。
 *
 * 与 test/host-apply.test.ts（装配层 T4）分工：record-updated 重建与 REF_CONFLICT
 * 冲突两条断言**已由 host-apply.test.ts 覆盖**（apply 装配路径），本文件不再重复；
 * 这里聚焦 `createLoginFlow` / `createLoginDriver` 的行为集成——粘贴主路径端到端、
 * state 校验、回调 vs 粘贴的赛跑撤问、driver 的 begin/paste/current/TTL 语义。
 *
 * 任务 6.2（X5 全量补齐）：追加 A 组 `parseCallbackUrl` 容错矩阵、B 组
 * `buildAuthorizeUrl` / `randomState` 纯函数面、C 组 flow 分支（callbackServer 关、
 * 换证失败、人拒绝 Declined、回调赢 grant 来源）、D 组 driver 边界（结算后 paste、
 * not-waiting 时间窗、abort 幂等）。
 *
 * 全部依赖皆假实现（client / session / server / clock / log），零真实网络：
 * clock 用 vitest fake timers 载体（照 pat-owner.test.ts 的 makeClockPort 写法），
 * `vi.advanceTimersByTimeAsync` 即「假时钟推进」。
 */

/** 假时钟固定起点（epoch ms）：`loginAt` 与 TTL 推进的基准。 */
const START_MS = 1_700_000_000_000
/** 换证返回的假 JWT 夹具（≥8 位，符合机密判定阈值约定）。 */
const TEST_JWT = 'jwt-fixture-abcdef123456'
/** 假 loopback 服务器 origin（端口号任意，测试内自洽即可）。 */
const LOOPBACK_ORIGIN = 'http://127.0.0.1:47777'
/** 假 loopback 的 redirect 全串（回调分支 `server.redirectUri`）。 */
const LOOPBACK_REDIRECT = `${LOOPBACK_ORIGIN}${CALLBACK_PATH}`

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START_MS)
})

afterEach(() => {
  vi.useRealTimers()
})

/** ClockPort 的 fake timers 载体：`now` 直读假时钟，setTimeout/clearTimeout 透传全局。 */
function makeClockPort(): ClockPort {
  return {
    now: () => Date.now(),
    setTimeout: (handler, timeoutMs) => globalThis.setTimeout(handler, timeoutMs),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as NodeJS.Timeout),
  }
}

/**
 * 假 BigmodelClient：只有 `exchangeAuthCode` 被桩出行为（缺省立即返回假 JWT），
 * 其余方法被调即抛——登录 flow 只该触达换证这一个端点。
 */
function makeFakeClient(exchangeAuthCode?: (input: ExchangeAuthCodeInput) => Promise<string>) {
  const exchange = vi.fn(exchangeAuthCode ?? (async (): Promise<string> => TEST_JWT))
  const client: BigmodelClient = {
    exchangeAuthCode: exchange,
    listKeys: async () => {
      throw new Error('本用例不应调用 listKeys')
    },
    createKey: async () => {
      throw new Error('本用例不应调用 createKey')
    },
    issuePat: async () => {
      throw new Error('本用例不应调用 issuePat')
    },
    readUsage: async () => {
      throw new Error('本用例不应调用 readUsage')
    },
  }
  return { client, exchange }
}

/**
 * 假 AuthorizationSession：notify 逐条入 `notices`，prompt 逐个入 `prompts` 并
 * 交给测试注入的 handler（缺省挂起不回应——模拟人还没粘贴）；commit 是 spy。
 */
function makeFakeSession(handlers: { prompt?: (prompt: AuthorizationPrompt) => Promise<string> } = {}) {
  const notices: AuthorizationNotice[] = []
  const prompts: AuthorizationPrompt[] = []
  const commit = vi.fn(async (_record: CredentialRecord): Promise<void> => {})
  const session: AuthorizationSession = {
    method: 'browser',
    signal: new AbortController().signal,
    notify: (notice) => {
      notices.push(notice)
    },
    prompt: (prompt) => {
      prompts.push(prompt)
      return handlers.prompt?.(prompt) ?? new Promise<string>(() => {})
    },
    commit,
  }
  return { session, notices, prompts, commit }
}

/**
 * 假 startServer：记录每次启动的 `{state, path}`，回固定 redirectUri 的一次性
 * 服务器；`result` 的结算句柄交给测试（`resolveServer`）。
 *
 * `closed` 是 spy 包装的关闭标志（close 被调即置真）——任务 6.1 的验证句
 * 「两个分支各一次 `expect(server.closed).toBe(true)`」读的就是它；所有启动过的
 * 服务器实例按序存进 `servers`。
 */
function makeStartServer() {
  const starts: Array<{ state: string; path: string }> = []
  const close = vi.fn()
  const servers: Array<{ closed: boolean }> = []
  let resolveResult: ((result: CallbackResult) => void) | undefined
  const startServer = vi.fn(async (options: { state: string; path: string }) => {
    starts.push(options)
    let closed = false
    const server = {
      /** 关闭标志：`close()` 调用即置真（对应真实现 close 的幂等关闭）。 */
      get closed(): boolean {
        return closed
      },
      redirectUri: LOOPBACK_REDIRECT,
      result: new Promise<CallbackResult>((resolve) => {
        resolveResult = resolve
      }),
      close: (): void => {
        closed = true
        close()
      },
    }
    servers.push(server)
    return server
  })
  const startServerTyped: StartCallbackServer = startServer
  return {
    startServer: startServerTyped,
    starts,
    close,
    servers,
    resolveServer: (result: CallbackResult) => resolveResult?.(result),
  }
}

/** 组装被测 flow 与全部假依赖；`overrides` 直改 deps（换 config / 注 startServer）。 */
function makeFlow(overrides: Partial<LoginFlowDeps> = {}) {
  const cli = makeFakeClient()
  const log: LogPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const clock = makeClockPort()
  const config: LoginFlowConfig = { callbackServer: false, organization: 'org-test', project: 'proj-test' }
  const deps: LoginFlowDeps = { client: cli.client, config, log, clock, ...overrides }
  return { flow: createLoginFlow(deps), deps, cli, log, clock }
}

/** 纯微任务冲刷：不动假时钟，把 in-flight promise 链推到稳定点。 */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}

/**
 * 组装 driver 与真 flow 的桥：beginAttempt 桩把 seam 词汇（interaction/signal）
 * 原样接到 flow.run 上——interaction.notify/prompt 直通，commit 用 spy。
 *
 * 模块级 helper（任务 6.2 提升）：既有「driver × flow 集成」与新增 D 组边界
 * 用例共用；提升仅为复用，桩接法与返回面逐字不变。
 */
function makeDriverWithFlow(options: { ttlMs?: number } = {}) {
  const flowBox = makeFlow()
  const log: LogPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const clock = makeClockPort()
  const ttlMs = options.ttlMs ?? 5_000
  const requests: AuthorizationRequest[] = []
  const sessionCommit = vi.fn(async (_record: CredentialRecord): Promise<void> => {})
  const beginAttempt = vi.fn(async (request: AuthorizationRequest): Promise<AuthorizationOutcome> => {
    requests.push(request)
    return flowBox.flow
      .run({
        method: 'browser',
        signal: request.signal ?? new AbortController().signal,
        notify: request.interaction.notify,
        prompt: request.interaction.prompt,
        commit: sessionCommit,
      })
      .then((): AuthorizationOutcome => ({ status: 'authorized' }))
  })
  const driver = createLoginDriver({ beginAttempt, log, clock, ttlMs })
  return { driver, beginAttempt, requests, sessionCommit, cli: flowBox.cli, log, ttlMs }
}

describe('login flow：粘贴主路径端到端（X5）', () => {
  it('notify 出 authorize URL → 粘贴回调 URL → 换证入参逐字一致 → commit grant（不含 jwtExpiresAt）', async () => {
    const box = makeFlow()
    let resolveExchange!: (jwt: string) => void
    box.cli.exchange.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveExchange = resolve
        }),
    )
    let resolvePaste!: (text: string) => void
    const fake = makeFakeSession({
      prompt: () =>
        new Promise<string>((resolve) => {
          resolvePaste = resolve
        }),
    })

    const runPromise = box.flow.run(fake.session)
    await flush()
    // 换证未完成前绝不提交（NOT_COMMITTED 红线的前置时序）。
    expect(fake.commit).not.toHaveBeenCalled()

    // notify 恰 1 条：message §3.6 逐字；URL 形态 RE-4（appId=zcode、32hex state、粘贴分支无 redirect）。
    expect(fake.notices).toHaveLength(1)
    expect(fake.notices[0]?.message).toBe(LOGIN_NOTICE_MESSAGE)
    const noticeUrl = fake.notices[0]?.url
    expect(noticeUrl).toBeDefined()
    const authorizeUrl = new URL(noticeUrl as string)
    expect(`${authorizeUrl.origin}${authorizeUrl.pathname}`).toBe('https://bigmodel.cn/login')
    expect(authorizeUrl.searchParams.get('appId')).toBe('zcode')
    expect(authorizeUrl.searchParams.has('redirect')).toBe(false)
    const state = authorizeUrl.searchParams.get('state')
    expect(state).toMatch(/^[0-9a-f]{32}$/)

    // prompt 文案 §3.6 逐字，且是 text 型提问。
    expect(fake.prompts).toHaveLength(1)
    expect(fake.prompts[0]?.kind).toBe('text')
    expect(fake.prompts[0]?.message).toBe(LOGIN_PASTE_PROMPT)

    // 测试端以回调 URL 应答（state 取自 notify.url）→ 换证被发起。
    resolvePaste(`${LOOPBACK_REDIRECT}?authCode=CODE&state=${state}`)
    await flush()
    expect(box.cli.exchange).toHaveBeenCalledOnce()
    const arg = box.cli.exchange.mock.calls[0]?.[0] as ExchangeAuthCodeInput
    // 三个业务字段逐字一致（RE-1：redirectUri 与粘贴 URL 的 origin+path 逐字相同）。
    expect(arg.authCode).toBe('CODE')
    expect(arg.redirectUri).toBe(LOOPBACK_REDIRECT)
    expect(arg.state).toBe(state)
    // commit 仍未被调（换证 promise 未结算）。
    expect(fake.commit).not.toHaveBeenCalled()

    // 换证返回 → flow 在 run() resolve 前完成 commit。
    resolveExchange(TEST_JWT)
    await expect(runPromise).resolves.toBeUndefined()
    expect(fake.commit).toHaveBeenCalledOnce()
    const record = fake.commit.mock.calls[0]?.[0] as CredentialRecord
    expect(record.kind).toBe('grant')
    const payload = record.kind === 'grant' ? (record.payload as Record<string, unknown>) : undefined
    // payload 逐字形状：RE-2 身份恒用 Config、loginAt 取 clock.now()。
    expect(payload).toEqual({ v: 1, jwt: TEST_JWT, organization: 'org-test', project: 'proj-test', loginAt: START_MS })
    // RE-5 红线：JWT 无 exp → jwtExpiresAt 恒省略；toEqual 穷尽键集合 → 亦不含任何 PAT 值。
    expect(payload).not.toHaveProperty('jwtExpiresAt')
  })

  it('粘贴 state 不符：run 以 AUTH_STATE 拒绝，commit 与换证均未发生', async () => {
    const box = makeFlow()
    let resolvePaste!: (text: string) => void
    const fake = makeFakeSession({
      prompt: () =>
        new Promise<string>((resolve) => {
          resolvePaste = resolve
        }),
    })

    const runPromise = box.flow.run(fake.session)
    await flush()
    const state = new URL(fake.notices[0]?.url as string).searchParams.get('state')
    expect(state).toMatch(/^[0-9a-f]{32}$/)
    resolvePaste(`${LOOPBACK_REDIRECT}?authCode=X&state=wrong`)

    const err = await runPromise.then(
      () => {
        throw new Error('run 不应在 state 不符时成功')
      },
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(BridgeError)
    expect((err as BridgeError).code).toBe('AUTH_STATE')
    // 换证不该发起、记录不该提交。
    expect(box.cli.exchange).not.toHaveBeenCalled()
    expect(fake.commit).not.toHaveBeenCalled()
  })
})

describe('login flow：回调分支赢（赛跑撤问）', () => {
  it('回调先到：prompt 的 signal 被 abort（粘贴侧以 PasteWithdrawnError 拒绝不误伤 flow），换证走 server.redirectUri 且 commit 成功', async () => {
    const serverBox = makeStartServer()
    const box = makeFlow({ config: { callbackServer: true, organization: 'org-test', project: 'proj-test' }, startServer: serverBox.startServer })
    // 粘贴侧语义：prompt 自带 signal 被 abort 时以 PasteWithdrawnError 拒绝
    // （绝不冒充 Declined——否则 flow 会被误判成「人拒绝」而失败）。
    // promise 的拒绝原因单独落袋，供「赛跑输家拒绝错误 ≠ AuthorizationDeclinedError」的验证断言读取。
    let capturePasteReject!: (reason: unknown) => void
    const pasteSettled = new Promise<unknown>((resolve) => {
      capturePasteReject = resolve
    })
    const fake = makeFakeSession({
      prompt: (prompt) =>
        new Promise<string>((_resolve, reject) => {
          prompt.signal?.addEventListener(
            'abort',
            () => {
              const error = new PasteWithdrawnError()
              capturePasteReject(error)
              reject(error)
            },
            { once: true },
          )
        }),
    })

    const runPromise = box.flow.run(fake.session)
    await flush()
    // 回调分支已启动：path 是 CALLBACK_PATH，state 与 authorize URL 的一致。
    expect(serverBox.startServer).toHaveBeenCalledOnce()
    expect(serverBox.starts[0]?.path).toBe(CALLBACK_PATH)
    const serverState = serverBox.starts[0]?.state
    expect(serverState).toMatch(/^[0-9a-f]{32}$/)
    const authorizeUrl = new URL(fake.notices[0]?.url as string)
    expect(authorizeUrl.searchParams.get('redirect')).toBe(LOOPBACK_REDIRECT)
    expect(authorizeUrl.searchParams.get('state')).toBe(serverState)

    // 回调先赢：resolve {code:'C1', state: 同 state}。
    serverBox.resolveServer({ code: 'C1', state: serverState as string })
    await flush()
    // 输家（粘贴提问）被单独撤回：prompt 自带 signal 已 aborted。
    expect(fake.prompts[0]?.signal?.aborted).toBe(true)

    // PasteWithdrawnError 不影响 flow：run 成功、换证走 server.redirectUri。
    await expect(runPromise).resolves.toBeUndefined()
    expect(box.cli.exchange).toHaveBeenCalledOnce()
    const arg = box.cli.exchange.mock.calls[0]?.[0] as ExchangeAuthCodeInput
    expect(arg.authCode).toBe('C1')
    expect(arg.redirectUri).toBe(LOOPBACK_REDIRECT)
    expect(arg.state).toBe(serverState)
    expect(fake.commit).toHaveBeenCalledOnce()
    const record = fake.commit.mock.calls[0]?.[0] as CredentialRecord
    expect(record.kind).toBe('grant')
    // 验证句 ①（两分支各一次 server.closed===true）之「回调分支成功」：
    // run resolve 前 finally 已关服务器（closed 标志由 spy 包装的 close 置真）。
    expect(serverBox.servers[0]?.closed).toBe(true)
    // 验证句 ③：赛跑输家（粘贴侧）的拒绝错误是 PasteWithdrawnError，绝不是
    // AuthorizationDeclinedError（seam 只把 Declined 归为「人拒绝 → cancelled」，
    // 撤问一旦冒充 Declined 整次尝试会跟着 cancelled）。
    const pasteReject = await pasteSettled
    expect(pasteReject).toBeInstanceOf(PasteWithdrawnError)
    expect(pasteReject).not.toBeInstanceOf(AuthorizationDeclinedError)
  })

  it('粘贴赢（回调分支挂着）：run resolve 后 finally 仍关服务器（server.closed === true），挂起的回调 result 已被吞掉不炸', async () => {
    const serverBox = makeStartServer()
    const box = makeFlow({ config: { callbackServer: true, organization: 'org-test', project: 'proj-test' }, startServer: serverBox.startServer })
    let resolvePaste!: (text: string) => void
    const fake = makeFakeSession({
      prompt: () =>
        new Promise<string>((resolve) => {
          resolvePaste = resolve
        }),
    })

    const runPromise = box.flow.run(fake.session)
    await flush()
    // 回调分支已启动（config.callbackServer 且注入了 startServer）。
    expect(serverBox.startServer).toHaveBeenCalledOnce()
    const serverState = serverBox.starts[0]?.state
    expect(serverState).toMatch(/^[0-9a-f]{32}$/)

    // 粘贴先赢：state 取自本尝试（与 authorize URL 一致）。
    resolvePaste(`${LOOPBACK_REDIRECT}?authCode=CODE-P&state=${serverState}`)
    await expect(runPromise).resolves.toBeUndefined()
    expect(box.cli.exchange).toHaveBeenCalledOnce()
    const arg = box.cli.exchange.mock.calls[0]?.[0] as ExchangeAuthCodeInput
    expect(arg.redirectUri).toBe(LOOPBACK_REDIRECT)
    // 验证句 ①（两分支各一次 server.closed===true）之「粘贴分支成功」：
    // 输家回调分支的 server 由 finally 关闭；其挂起 result 的 CallbackClosedError
    // 拒绝已在 flow 内被吞掉的 catch 消费，不会成为 unhandledRejection。
    expect(serverBox.servers[0]?.closed).toBe(true)
    expect(serverBox.close).toHaveBeenCalledOnce()
  })

  it('时序红线：session.commit 在 run() resolve 之前完成（vitest 无 toHaveBeenCalledBefore，以事件顺序数组等价断言）', async () => {
    const box = makeFlow()
    let resolveExchange!: (jwt: string) => void
    box.cli.exchange.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveExchange = resolve
        }),
    )
    let resolvePaste!: (text: string) => void
    // commit spy 推事件；run() 的 then 也推事件——两事件的真实先后进数组。
    const events: string[] = []
    const commit = vi.fn(async (_record: CredentialRecord): Promise<void> => {
      events.push('commit')
    })
    const notices: AuthorizationNotice[] = []
    const session: AuthorizationSession = {
      method: 'browser',
      signal: new AbortController().signal,
      notify: (notice) => {
        notices.push(notice)
      },
      prompt: () =>
        new Promise<string>((resolve) => {
          resolvePaste = resolve
        }),
      commit,
    }

    const runResolved = box.flow.run(session).then(() => {
      events.push('runResolved')
    })
    await flush()
    expect(events).toEqual([])
    // 从 notify 的 authorize URL 取本尝试 state，以合法回调 URL 应答。
    const state = new URL(notices[0]?.url as string).searchParams.get('state')
    resolvePaste(`${LOOPBACK_REDIRECT}?authCode=CODE&state=${state}`)
    await flush()
    // 换证挂起：此时 commit 也尚未发生。
    expect(events).toEqual([])

    resolveExchange(TEST_JWT)
    await runResolved
    // 规格验证句 expect(commitSpy).toHaveBeenCalledBefore(runResolved) 的等价实现：
    // vitest 3.2.7 无该 matcher，改断言事件顺序数组恰为 ['commit', 'runResolved']——
    // 若实现把 commit 挪到 run resolve 之后（NOT_COMMITTED 红线破坏），顺序即翻转红。
    expect(events).toEqual(['commit', 'runResolved'])
    expect(commit).toHaveBeenCalledOnce()
  })
})

describe('login driver × flow 集成（X5）', () => {
  it('begin：首个 notice 放行并缓存 URL；current 回显；二次 begin 返回 in-flight 且不重复发起', async () => {
    const box = makeDriverWithFlow()
    const first = await box.driver.begin('test')
    expect(first.status).toBe('started')
    // URL 来自 flow 的 notify（缓存进 driver）：RE-4 形态。
    expect(first.url).toBeDefined()
    const authorizeUrl = new URL(first.url as string)
    expect(authorizeUrl.searchParams.get('appId')).toBe('zcode')
    expect(first.text).toBe(LOGIN_NOTICE_MESSAGE)
    expect(box.driver.current()).toEqual({ inFlight: true, url: first.url })

    // 第二次 begin：in-flight 回显同一 URL，不重复发起尝试。
    const second = await box.driver.begin('test')
    expect(second.status).toBe('in-flight')
    expect(second.url).toBe(first.url)
    expect(box.beginAttempt).toHaveBeenCalledOnce()
  })

  it('paste：原样字符串直达 flow（driver 不解析）→ 换证/commit 逐字一致 → attempt 结算 current 归零', async () => {
    const box = makeDriverWithFlow()
    const first = await box.driver.begin('test')
    const state = new URL(first.url as string).searchParams.get('state')
    expect(state).toMatch(/^[0-9a-f]{32}$/)

    const pasted = `${LOOPBACK_REDIRECT}?authCode=CODE-2&state=${state}`
    expect(box.driver.paste(pasted)).toEqual({ ok: true })
    await flush()
    // 原样传递的下游证据：driver 未做任何解析/改写，flow 收到的文本换证出逐字入参。
    expect(box.cli.exchange).toHaveBeenCalledOnce()
    const arg = box.cli.exchange.mock.calls[0]?.[0] as ExchangeAuthCodeInput
    expect(arg.authCode).toBe('CODE-2')
    expect(arg.redirectUri).toBe(LOOPBACK_REDIRECT)
    expect(arg.state).toBe(state)
    // flow commit → attempt promise 结算 → driver 槽位清空。
    expect(box.sessionCommit).toHaveBeenCalledOnce()
    const record = box.sessionCommit.mock.calls[0]?.[0] as CredentialRecord
    expect(record.kind).toBe('grant')
    const payload = record.kind === 'grant' ? (record.payload as Record<string, unknown>) : undefined
    expect(payload).toEqual({
      v: 1,
      jwt: TEST_JWT,
      organization: 'org-test',
      project: 'proj-test',
      loginAt: START_MS,
    })
    expect(box.driver.current()).toEqual({ inFlight: false })
    // 成功路径：driver 侧只记 info，无失败告警。
    expect(box.log.warn).not.toHaveBeenCalled()
  })

  it('无尝试时 paste 报 no-attempt', () => {
    const box = makeDriverWithFlow()
    expect(box.driver.paste(`${LOOPBACK_REDIRECT}?authCode=X&state=y`)).toEqual({ ok: false, reason: 'no-attempt' })
  })

  it('ttlMs 到点 abort 整个尝试：request.signal.aborted 为 true', async () => {
    const box = makeDriverWithFlow({ ttlMs: 500 })
    await box.driver.begin('test')
    expect(box.requests).toHaveLength(1)
    expect(box.requests[0]?.signal?.aborted).toBe(false)
    // 假时钟推进到 TTL：driver 的 controller 被 abort。
    await vi.advanceTimersByTimeAsync(500)
    expect(box.requests[0]?.signal?.aborted).toBe(true)
  })

  it('begin 首文本 2s 超时：无 notice 也不卡死，返回兜底文本', async () => {
    // 桩既不 notify 也不 prompt：模拟 seam 迟迟不发首个 notice 的最坏情况。
    const beginAttempt = vi.fn(async (): Promise<AuthorizationOutcome> => new Promise(() => {}))
    const log: LogPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const driver = createLoginDriver({ beginAttempt, log, clock: makeClockPort(), ttlMs: 10_000 })

    let settled = false
    const pending = driver.begin('test').then((result) => {
      settled = true
      return result
    })
    await flush()
    expect(settled).toBe(false)
    // 差 1ms 到点：仍不放行。
    await vi.advanceTimersByTimeAsync(BEGIN_TEXT_TIMEOUT_MS - 1)
    await flush()
    expect(settled).toBe(false)
    // 补足 2s：begin 返回兜底文本（status 仍是 started，命令不卡死）。
    await vi.advanceTimersByTimeAsync(1)
    const result = await pending
    expect(result.status).toBe('started')
    // 兜底文案逐字（实现里 notice 缺席时的固定提示）。
    expect(result.text).toBe('正在发起 BigModel 授权，请稍候（完成后把回调 URL 粘贴回来）')
    expect(result.url).toBeUndefined()
  })
})

describe('parseCallbackUrl 容错矩阵（X5 全量·A 组）', () => {
  it.each([
    { label: '带 scheme 的完整 URL', text: `${LOOPBACK_REDIRECT}?authCode=X&state=Y` },
    { label: '不带 scheme（补 http:// 归一）', text: `127.0.0.1:47777${CALLBACK_PATH}?authCode=X&state=Y` },
  ])('A1 $label：解析成功且 redirectUri 归一为 origin+path', ({ text }) => {
    expect(parseCallbackUrl(text)).toEqual({ authCode: 'X', redirectUri: LOOPBACK_REDIRECT, state: 'Y' })
  })

  it('A2 authCode 与 code 并存：优先 authCode', () => {
    expect(parseCallbackUrl(`${LOOPBACK_REDIRECT}?authCode=PRIMARY&code=FALLBACK&state=Y`)?.authCode).toBe('PRIMARY')
  })

  it('A3 仅 code：兼容取用', () => {
    const parsed = parseCallbackUrl(`${LOOPBACK_REDIRECT}?code=FALLBACK&state=Y`)
    expect(parsed?.authCode).toBe('FALLBACK')
    expect(parsed?.state).toBe('Y')
    expect(parsed?.redirectUri).toBe(LOOPBACK_REDIRECT)
  })

  it('A4 URL 编码差异：state 百分号编码解码一致；query 顺序颠倒不影响解析', () => {
    // %2D 与字面 - 解码后同一值（searchParams 的标准解码行为）。
    expect(parseCallbackUrl(`${LOOPBACK_REDIRECT}?authCode=X&state=abc%2Ddef`)?.state).toBe('abc-def')
    // 顺序颠倒（state 在前）：三字段照常取全。
    expect(parseCallbackUrl(`${LOOPBACK_REDIRECT}?state=Y&authCode=X`)).toEqual({
      authCode: 'X',
      redirectUri: LOOPBACK_REDIRECT,
      state: 'Y',
    })
  })

  it.each([
    { label: '缺 authCode/code（仅 state）', text: `${LOOPBACK_REDIRECT}?state=Y` },
    { label: '非 URL 文本（语法错）', text: 'abc def' },
    { label: '仅 scheme 无 host', text: 'http://' },
    { label: '语法错乱', text: '::::' },
    { label: '空串', text: '' },
    { label: '全空白', text: '   ' },
  ])('A5 $label → undefined', ({ text }) => {
    expect(parseCallbackUrl(text)).toBeUndefined()
  })

  it('A5 前后空白：trim 后照常解析', () => {
    expect(parseCallbackUrl(`  ${LOOPBACK_REDIRECT}?authCode=X  `)).toEqual({ authCode: 'X', redirectUri: LOOPBACK_REDIRECT })
  })

  it('A6 state 缺失：返回对象但 state === undefined（fail-closed 交由 flow 判 AUTH_STATE，flow 侧已另有用例）', () => {
    const parsed = parseCallbackUrl(`${LOOPBACK_REDIRECT}?authCode=X`)
    expect(parsed).toEqual({ authCode: 'X', redirectUri: LOOPBACK_REDIRECT })
    expect(parsed?.state).toBeUndefined()
  })
})

describe('buildAuthorizeUrl / randomState（X5 全量·B 组）', () => {
  it('B7 redirect 存在：逐字 urlencoded 出现，参数顺序 appId → redirect → state', () => {
    const url = buildAuthorizeUrl({ state: 'S1', redirect: LOOPBACK_REDIRECT })
    expect(url.startsWith(`${AUTHORIZE_URL}?appId=zcode&`)).toBe(true)
    // URLSearchParams.toString() 的逐字编码形态（: → %3A、/ → %2F）。
    expect(url).toContain(`redirect=${encodeURIComponent(LOOPBACK_REDIRECT)}`)
    expect(url.indexOf('appId=')).toBeLessThan(url.indexOf('redirect='))
    expect(url.indexOf('redirect=')).toBeLessThan(url.indexOf('&state='))
    // 解码回读与注入值逐字一致。
    expect(new URL(url).searchParams.get('redirect')).toBe(LOOPBACK_REDIRECT)
  })

  it('B7 redirect 缺省：不含 redirect= 参数（全串逐字形态，登录页走官方默认回跳）', () => {
    expect(buildAuthorizeUrl({ state: 'S1' })).toBe(`${AUTHORIZE_URL}?appId=zcode&state=S1`)
  })

  it('B8 appId 可覆盖；缺省即 AUTHORIZE_APP_ID（zcode）', () => {
    expect(buildAuthorizeUrl({ appId: 'other-app', state: 'S1' })).toContain('appId=other-app')
    expect(buildAuthorizeUrl({ state: 'S1' })).toContain(`appId=${AUTHORIZE_APP_ID}`)
  })

  it('B9 randomState：32 位小写 hex，两次调用互不相同', () => {
    const first = randomState()
    const second = randomState()
    expect(first).toMatch(/^[0-9a-f]{32}$/)
    expect(second).toMatch(/^[0-9a-f]{32}$/)
    expect(first).not.toBe(second)
  })
})

describe('flow 分支补充（X5 全量·C 组）', () => {
  it('C10 callbackServer:false：注入的 startServer 不被调用，仅粘贴分支成功（RE-4 容器主路径）', async () => {
    const serverBox = makeStartServer()
    const box = makeFlow({ config: { callbackServer: false, organization: 'org-test', project: 'proj-test' }, startServer: serverBox.startServer })
    let resolvePaste!: (text: string) => void
    const fake = makeFakeSession({
      prompt: () =>
        new Promise<string>((resolve) => {
          resolvePaste = resolve
        }),
    })

    const runPromise = box.flow.run(fake.session)
    await flush()
    // 开关关闭：即便注入了 startServer 也不启动回调分支。
    expect(serverBox.startServer).not.toHaveBeenCalled()
    expect(fake.notices).toHaveLength(1)
    const state = new URL(fake.notices[0]?.url as string).searchParams.get('state')
    resolvePaste(`${LOOPBACK_REDIRECT}?authCode=CODE&state=${state}`)

    await expect(runPromise).resolves.toBeUndefined()
    expect(fake.commit).toHaveBeenCalledOnce()
    // 全程无服务器实例：finally 无 server 可关（servers 空、close 未被调）。
    expect(serverBox.servers).toHaveLength(0)
    expect(serverBox.close).not.toHaveBeenCalled()
  })

  it('C11 换证失败（JWT_EXPIRED）：run 原错误实例上抛、commit 未调、finally 仍关服务器（closed === true）', async () => {
    const serverBox = makeStartServer()
    const box = makeFlow({ config: { callbackServer: true, organization: 'org-test', project: 'proj-test' }, startServer: serverBox.startServer })
    const exchangeFailure = new BridgeError('JWT_EXPIRED')
    box.cli.exchange.mockRejectedValueOnce(exchangeFailure)
    let resolvePaste!: (text: string) => void
    const fake = makeFakeSession({
      prompt: () =>
        new Promise<string>((resolve) => {
          resolvePaste = resolve
        }),
    })

    const runPromise = box.flow.run(fake.session)
    await flush()
    expect(serverBox.startServer).toHaveBeenCalledOnce()
    const state = serverBox.starts[0]?.state as string
    resolvePaste(`${LOOPBACK_REDIRECT}?authCode=CODE&state=${state}`)

    const err = await runPromise.then(
      () => {
        throw new Error('run 不应在换证失败时成功')
      },
      (e: unknown) => e,
    )
    // 原错误实例上抛（不吞不包装），commit 绝不发生。
    expect(err).toBe(exchangeFailure)
    expect(fake.commit).not.toHaveBeenCalled()
    // 失败路径同样走 finally 关闭（验证句①的换证失败变体）。
    expect(serverBox.servers[0]?.closed).toBe(true)
    expect(serverBox.close).toHaveBeenCalledOnce()
  })

  it('C12 prompt 以 AuthorizationDeclinedError 拒绝（人拒绝）：run 上抛同一实例——区别于赛跑撤问的 PasteWithdrawnError', async () => {
    const box = makeFlow()
    const declined = new AuthorizationDeclinedError('人拒绝粘贴')
    const fake = makeFakeSession({
      prompt: async () => {
        throw declined
      },
    })

    const runPromise = box.flow.run(fake.session)
    await flush()
    await expect(runPromise).rejects.toBe(declined)
    // 人拒绝：无换证、无提交（flow 不吞不转换，seam 侧据此归 cancelled）。
    expect(box.cli.exchange).not.toHaveBeenCalled()
    expect(fake.commit).not.toHaveBeenCalled()
  })

  it('C13 回调赢：grant 的 jwt 来自 exchange 返回值、organization/project 恒来自 Config（RE-2）', async () => {
    const serverBox = makeStartServer()
    const box = makeFlow({ config: { callbackServer: true, organization: 'org-callback', project: 'proj-callback' }, startServer: serverBox.startServer })
    const jwtFromExchange = 'jwt-from-exchange-90abcdef'
    box.cli.exchange.mockResolvedValueOnce(jwtFromExchange)
    const fake = makeFakeSession()

    const runPromise = box.flow.run(fake.session)
    await flush()
    serverBox.resolveServer({ code: 'C13', state: serverBox.starts[0]?.state as string })
    await expect(runPromise).resolves.toBeUndefined()

    expect(fake.commit).toHaveBeenCalledOnce()
    const record = fake.commit.mock.calls[0]?.[0] as CredentialRecord
    const payload = record.kind === 'grant' ? (record.payload as Record<string, unknown>) : undefined
    expect(payload?.jwt).toBe(jwtFromExchange)
    expect(payload?.organization).toBe('org-callback')
    expect(payload?.project).toBe('proj-callback')
  })
})

describe('driver 补充（X5 全量·D 组）', () => {
  it('D14 尝试结算后 paste → no-attempt（settle 清槽；与「从未 begin」同语义）', async () => {
    const box = makeDriverWithFlow()
    const first = await box.driver.begin('test')
    const state = new URL(first.url as string).searchParams.get('state')
    expect(box.driver.paste(`${LOOPBACK_REDIRECT}?authCode=CODE-14&state=${state}`)).toEqual({ ok: true })
    await flush()
    // flow 换证 + commit 完成 → attempt promise 结算 → driver 槽位清空。
    expect(box.driver.current()).toEqual({ inFlight: false })
    // 结算后的同一 attempt 再 paste：no-attempt（不是 not-waiting）。
    expect(box.driver.paste(`${LOOPBACK_REDIRECT}?authCode=X&state=${state}`)).toEqual({ ok: false, reason: 'no-attempt' })
  })

  it('D15 在飞但 prompt 尚未挂起（notify 之后、prompt 之前的时间窗）→ not-waiting；prompt 挂起后恢复 ok', async () => {
    // prompt 的挂起时机交给测试：notify 先行（放行 begin），promptGate 解开后才挂 prompt。
    let mountPrompt!: () => void
    const promptGate = new Promise<void>((resolve) => {
      mountPrompt = resolve
    })
    const beginAttempt = vi.fn(async (request: AuthorizationRequest): Promise<AuthorizationOutcome> => {
      request.interaction.notify({ message: LOGIN_NOTICE_MESSAGE, url: `${AUTHORIZE_URL}?state=${randomState()}` })
      await promptGate
      return request.interaction.prompt({ kind: 'text', message: LOGIN_PASTE_PROMPT }).then(
        (): AuthorizationOutcome => ({ status: 'authorized' }),
      )
    })
    const log: LogPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const driver = createLoginDriver({ beginAttempt, log, clock: makeClockPort(), ttlMs: 10_000 })

    const beginResult = await driver.begin('test')
    expect(beginResult.status).toBe('started')
    // 尝试在飞但无等待者：not-waiting（区别于无尝试的 no-attempt）。
    expect(driver.current().inFlight).toBe(true)
    expect(driver.paste(`${LOOPBACK_REDIRECT}?authCode=X&state=y`)).toEqual({ ok: false, reason: 'not-waiting' })

    // prompt 挂起后：同一尝试恢复可粘贴。
    mountPrompt()
    await flush()
    expect(driver.paste(`${LOOPBACK_REDIRECT}?authCode=CODE-15&state=y`)).toEqual({ ok: true })
    await flush()
    expect(driver.current()).toEqual({ inFlight: false })
  })

  it('D16 abort：current 归零（inFlight === false），重复 abort 幂等不抛', async () => {
    // 桩接法贴近生产 seam（T7 将接 `ctx.authorization.begin`）：request.signal 被
    // abort 时以取消结算 attempt promise（seam 对撤回以 cancelled settle）。
    // 真 flow 的 prompt 只有粘贴槽能解——不能要求 flow 自身因信号退出。
    const beginAttempt = vi.fn(async (request: AuthorizationRequest): Promise<AuthorizationOutcome> =>
      new Promise<AuthorizationOutcome>((_resolve, reject) => {
        request.interaction.notify({ message: LOGIN_NOTICE_MESSAGE })
        request.signal?.addEventListener('abort', () => reject(new BridgeError('TIMEOUT')), { once: true })
      }),
    )
    const log: LogPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const driver = createLoginDriver({ beginAttempt, log, clock: makeClockPort(), ttlMs: 10_000 })

    await driver.begin('test')
    expect(driver.current().inFlight).toBe(true)

    // abort：撤回信号 → 尝试 promise 以取消拒绝 → settle 清槽（abort 等落地才返回）。
    await driver.abort()
    expect(driver.current()).toEqual({ inFlight: false })

    // 重复 abort：槽位已空，直接返回（幂等），不抛。
    await expect(driver.abort()).resolves.toBeUndefined()
    expect(driver.current()).toEqual({ inFlight: false })
    // 取消结算走失败日志：BridgeError 只记码，值不进日志（D-12）。
    expect(log.warn).toHaveBeenCalledWith('登录尝试失败：code=TIMEOUT')
  })
})
