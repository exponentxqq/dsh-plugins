import type { BigmodelClient, PatLease, UsageData } from '../src/host/bigmodel/client.ts'
import type { LoginGrant } from '../src/host/credential-record.ts'
import { LOGIN_RECORD_KEY, PAT_REF } from '../src/host/credential-record.ts'
import { assertNoSecret, BridgeError } from '../src/host/errors.ts'
import type { LoginDriver } from '../src/host/login-flow.ts'
import type { PatIdentity, PatOwner } from '../src/host/pat-owner.ts'
import type { CredentialsPort, LogPort } from '../src/host/ports.ts'
import type { ConfigEditorPort, RouteEntry } from '../src/host/route-config.ts'
import { ROUTE_ENTRY_ID, ZCODE_PLAN_ROUTE } from '../src/host/route-config.ts'
import type { StatusLlmPort, StatusSnapshot } from '../src/host/status.ts'
import {
  formatClockTime,
  formatFullTime,
  formatRemaining,
  formatWeekTime,
  parseUsageLimits,
  readRouteState,
  readUsage,
  renderRouteLine,
  renderStatus,
} from '../src/host/status.ts'
import {
  COMMAND_NAME,
  LOG_EVENT_NAMES,
  USAGE,
  createZcodePlanCommand,
  parseZcodePlanInput,
  type ParsedZcodePlanInput,
  type ZcodePlanCommandDeps,
} from '../src/host/commands.ts'
import { apply, Config, withEventHooks, type ZcodePlanConfig } from '../src/host/index.ts'
import { describe, expect, it, vi } from 'vitest'

/**
 * 命令面与 status 渲染单测（X6 + H13/H14 基础；任务 8.1）：
 * - 文法矩阵（五子命令 + 缺省 status + 前缀斜杠/空白容错 + 未知子命令 bad）；
 * - `/zcode-plan login` 二次调用回显同一授权链接（X6：driver.begin 桩 in-flight + 同 url）；
 * - logout 的调用序（abort → deleteRecord → unset → dispose）与回执文案；
 * - route install/remove 走真 H12 实现（假 config-editor / llm）+ 回执文案；
 * - refresh 的 RE-3 布尔比对（同值「否」）与「不含 PAT 值」红线 + `pat_issued` 事件；
 * - status 五段渲染（RE-5 无 exp 不显示 JWT 到期）与用量两档/降级；
 * - 日志事件锚点翻译（withEventHooks）与 apply 的 commands 注册接线。
 */

/** 固定「当前时刻」（只用于剩余时间/读数时刻的差值断言，与展示时刻解耦）。 */
const FIXED_NOW = 1_773_600_000_000

/** 红线夹具（D-12）：这些真值不得出现在任何回执/渲染文本里。 */
const JWT_FIXTURE = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ6Y29kZS0xIn0.tok-signature-8848'
const PAT_FIXTURE = 'pat-real-secret-0f1e2d3c4b5a6978'

/** Key id 夹具（非 secret，E3：允许展示前 8 位；整值不出现在渲染里）。 */
const KEY_ID_FIXTURE = '3f9a1c2b5678abcdef1234'

/** 假 log：三通道全桩。 */
function makeLog(): LogPort {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

/** grant 夹具（RE-5：不带 jwtExpiresAt）。 */
function makeGrant(overrides: Partial<LoginGrant> = {}): LoginGrant {
  return { v: 1, jwt: JWT_FIXTURE, organization: 'org-1', project: 'proj-1', loginAt: FIXED_NOW - 3_600_000, ...overrides }
}

/** status 快照夹具（已登录 + Key ready + PAT 有效 + 路由已注册 + 用量两档齐全）。 */
function makeSnapshot(overrides: Partial<StatusSnapshot> = {}): StatusSnapshot {
  return {
    now: FIXED_NOW,
    grant: makeGrant(),
    key: { kind: 'ready', keyId: KEY_ID_FIXTURE },
    pat: { kind: 'valid', expiresAt: FIXED_NOW + 4 * 3_600_000 + 10 * 60_000 },
    patRenewalLeadMs: 120_000,
    route: { registered: true, declared: false },
    usage: {
      kind: 'ok',
      fiveHour: { total: 28_000, used: 3_120, percentage: 11.14, resetAt: FIXED_NOW + 30 * 60_000 },
      weekly: { total: 140_000, used: 18_200, percentage: 13, resetAt: FIXED_NOW + 7 * 86_400_000 },
      readAt: FIXED_NOW - 2 * 60_000,
    },
    ...overrides,
  }
}

/** 假 login driver（LoginDriver 四方法全桩，overrides 可逐个替换）。 */
function fakeDriver(overrides: Partial<LoginDriver> = {}): LoginDriver {
  return {
    begin: vi.fn(async () => ({ status: 'started' as const, text: '正在发起 BigModel 授权' })),
    paste: vi.fn(() => ({ ok: true as const })),
    current: vi.fn(() => ({ inFlight: false as const })),
    abort: vi.fn(async () => undefined),
    ...overrides,
  }
}

/** LEASE 夹具（PAT 值不进任何断言文本，只做「同值/不同值」比对）。 */
const LEASE_A: PatLease = { pat: PAT_FIXTURE, expiresAt: FIXED_NOW + 5 * 3_600_000 }

/** 假 PAT owner（PatOwner 五方法全桩）。 */
function fakeOwner(overrides: Partial<PatOwner> = {}): PatOwner {
  return {
    current: vi.fn(() => undefined),
    ensure: vi.fn(async () => LEASE_A),
    state: vi.fn((): StatusSnapshot['pat'] => ({ kind: 'none' })),
    identity: vi.fn((): PatIdentity | undefined => undefined),
    haltReason: vi.fn(() => undefined),
    dispose: vi.fn(),
    ...overrides,
  }
}

/** 假 logout 用 credentials 窄面（Pick<deleteRecord|unset>）。 */
function fakeLogoutCredentials(overrides: Partial<Pick<CredentialsPort, 'deleteRecord' | 'unset'>> = {}) {
  return {
    deleteRecord: vi.fn(async () => undefined),
    unset: vi.fn(async () => undefined),
    ...overrides,
  }
}

/** 假 config-editor：单条 llm-pi-ai 行（或无行），edit 按真实语义回写 override 层。 */
function makeFakeEditor(options: { rows?: RouteEntry[]; override?: Record<string, unknown> } = {}) {
  const entry: RouteEntry = { options: { id: ROUTE_ENTRY_ID } }
  const rows = options.rows ?? [entry]
  let override = options.override ?? {}
  const configEditor: ConfigEditorPort = {
    entries: () => rows,
    configuration: () => [{ entry, inherited: {}, override }],
    edit: vi.fn(async (_entry: RouteEntry, change) => {
      override = change(override, {})
    }),
  }
  return { entry, configEditor, readOverride: (): Record<string, unknown> => override }
}

/** 假 llm 目录：已注册 / 已声明两读各自可控。 */
function makeFakeLlm(registeredIds: readonly string[] = [], declaredIds: readonly string[] = []): StatusLlmPort {
  return {
    listProviders: () => registeredIds.map((id) => ({ id })),
    listConfigurableProviders: () => declaredIds.map((id) => ({ id })),
  }
}

/** 假 bigmodel client（只造 readUsage 一面，够 readUsage 用例）。 */
function fakeClient(readUsage: (input: unknown) => Promise<UsageData>): BigmodelClient {
  return { readUsage } as unknown as BigmodelClient
}

/** 命令 deps 组装器（每个用例用 overrides 注入要断言的桩）。 */
function makeDeps(overrides: Partial<ZcodePlanCommandDeps> = {}): ZcodePlanCommandDeps {
  return {
    driver: () => fakeDriver(),
    owner: () => fakeOwner(),
    credentials: () => fakeLogoutCredentials(),
    configEditor: () => undefined,
    llm: () => undefined,
    status: async () => makeSnapshot(),
    log: makeLog(),
    ...overrides,
  }
}

/** 直接以 rawInput 调 handler 的便利封装。 */
async function runCommand(deps: ZcodePlanCommandDeps, rawInput: string): Promise<{ kind: 'success' | 'error'; text?: string }> {
  const result = await createZcodePlanCommand(deps).handler({ rawInput })
  return result
}

describe('parseZcodePlanInput 文法矩阵（H14）', () => {
  const matrix: ReadonlyArray<readonly [string, ParsedZcodePlanInput]> = [
    ['', { kind: 'status' }],
    ['   ', { kind: 'status' }],
    ['status', { kind: 'status' }],
    ['/status', { kind: 'status' }],
    ['status extra', { kind: 'bad' }],
    ['login', { kind: 'login' }],
    ['login https://bigmodel.cn/login?appId=zcode&state=abc&authCode=xyz', { kind: 'login', callbackUrl: 'https://bigmodel.cn/login?appId=zcode&state=abc&authCode=xyz' }],
    [' login    https://bigmodel.cn/cb?authCode=1  ', { kind: 'login', callbackUrl: 'https://bigmodel.cn/cb?authCode=1' }],
    ['/login /weird?authCode=1', { kind: 'login', callbackUrl: '/weird?authCode=1' }],
    ['login https://a b?authCode=1', { kind: 'login', callbackUrl: 'https://a b?authCode=1' }],
    ['logout', { kind: 'logout' }],
    ['logout x', { kind: 'bad' }],
    ['route', { kind: 'route', action: 'status' }],
    ['route install', { kind: 'route', action: 'install' }],
    ['route /remove', { kind: 'route', action: 'remove' }],
    ['route status', { kind: 'route', action: 'status' }],
    ['route bogus', { kind: 'bad' }],
    ['route install extra', { kind: 'bad' }],
    ['refresh', { kind: 'refresh' }],
    ['refresh now', { kind: 'bad' }],
    ['bogus', { kind: 'bad' }],
    ['/bogus', { kind: 'bad' }],
  ]
  it.each(matrix)('文法 %j', (rawInput, expected) => {
    expect(parseZcodePlanInput(rawInput)).toEqual(expected)
  })

  it('USAGE 覆盖五个子动词与缺省说明（未知子命令回执用）', () => {
    for (const word of ['login', 'logout', 'status', 'route', 'refresh']) {
      expect(USAGE).toContain(word)
    }
    expect(USAGE).toContain(`/zcode-plan`)
  })
})

describe('commands handler：login（§3.7 / X6）', () => {
  it('X6：/zcode-plan login 二次调用回显同一授权链接（begin 桩第二次返回 in-flight + 同 url）', async () => {
    const authorizeUrl = 'https://bigmodel.cn/login?appId=zcode&redirect=http%3A%2F%2F127.0.0.1%3A45821%2Foauth%2Fcallback%2Fbigmodel&state=abc123'
    let calls = 0
    const driver = fakeDriver({
      begin: vi.fn(async () => {
        calls += 1
        return calls === 1
          ? { status: 'started' as const, url: authorizeUrl, text: '在浏览器完成 BigModel 授权' }
          : { status: 'in-flight' as const, url: authorizeUrl, text: '登录尝试已在进行中' }
      }),
    })
    const deps = makeDeps({ driver: () => driver })
    const first = await runCommand(deps, 'login')
    const second = await runCommand(deps, 'login')
    expect(first).toEqual({ kind: 'success', text: expect.stringContaining(`授权链接：${authorizeUrl}`) })
    expect(second).toEqual({ kind: 'success', text: expect.stringContaining(`授权链接：${authorizeUrl}`) })
    // 回执提示把整条 URL 粘贴回 login 子命令（§3.7 文案逐字骨架）。
    expect(second.kind === 'success' && second.text).toContain(`/zcode-plan login ${authorizeUrl}`)
    expect(driver.begin).toHaveBeenCalledTimes(2)
  })

  it('login 无 url 且 driver 未就绪：error 提示通道未就绪', async () => {
    const result = await runCommand(makeDeps({ driver: () => undefined }), 'login')
    expect(result).toEqual({ kind: 'error', text: expect.stringContaining('登录通道未就绪') })
  })

  it('login <url>：原样交给 driver.paste，回执「已收到回调，正在换发登录凭证…」', async () => {
    const driver = fakeDriver()
    const result = await runCommand(makeDeps({ driver: () => driver }), 'login https://bigmodel.cn/cb?authCode=abc&state=s1')
    expect(driver.paste).toHaveBeenCalledWith('https://bigmodel.cn/cb?authCode=abc&state=s1')
    expect(result).toEqual({ kind: 'success', text: '已收到回调，正在换发登录凭证…' })
  })

  it('login <url> 但无在途尝试 / 未在等待：分别报错', async () => {
    const noAttempt = fakeDriver({ paste: vi.fn(() => ({ ok: false as const, reason: 'no-attempt' as const })) })
    expect(await runCommand(makeDeps({ driver: () => noAttempt }), 'login https://a?authCode=1')).toEqual({
      kind: 'error',
      text: expect.stringContaining('没有进行中的登录尝试'),
    })
    const notWaiting = fakeDriver({ paste: vi.fn(() => ({ ok: false as const, reason: 'not-waiting' as const })) })
    expect(await runCommand(makeDeps({ driver: () => notWaiting }), 'login https://a?authCode=1')).toEqual({
      kind: 'error',
      text: expect.stringContaining('未在等待回调'),
    })
  })
})

describe('commands handler：logout（§3.7 顺序）', () => {
  it('调用序 abort → deleteRecord(LOGIN_RECORD_KEY) → unset(PAT_REF) → dispose + afterLogout；回执逐字', async () => {
    const order: string[] = []
    const driver = fakeDriver({
      abort: vi.fn(async () => {
        order.push('abort')
      }),
    })
    const credentials = fakeLogoutCredentials({
      deleteRecord: vi.fn(async () => {
        order.push('deleteRecord')
      }),
      unset: vi.fn(async () => {
        order.push('unset')
      }),
    })
    const owner = fakeOwner({
      dispose: vi.fn(() => {
        order.push('dispose')
      }),
    })
    let afterLogout = false
    const result = await runCommand(
      makeDeps({ driver: () => driver, owner: () => owner, credentials: () => credentials, afterLogout: () => (afterLogout = true) }),
      'logout',
    )
    expect(order).toEqual(['abort', 'deleteRecord', 'unset', 'dispose'])
    expect(credentials.deleteRecord).toHaveBeenCalledWith(LOGIN_RECORD_KEY)
    expect(credentials.unset).toHaveBeenCalledWith(PAT_REF)
    expect(afterLogout).toBe(true)
    expect(result).toEqual({ kind: 'success', text: '已退出登录并清除 ZCODE_PLAN_PAT；服务端 Key 未被删除' })
  })

  it('driver 缺席时 logout 仍清记录与 ref（abort 步骤跳过）', async () => {
    const credentials = fakeLogoutCredentials()
    const result = await runCommand(makeDeps({ driver: () => undefined, credentials: () => credentials }), 'logout')
    expect(credentials.deleteRecord).toHaveBeenCalledTimes(1)
    expect(result.kind).toBe('success')
  })

  it('credentials 缺席：error，不做任何清理', async () => {
    const owner = fakeOwner()
    const result = await runCommand(makeDeps({ credentials: () => undefined, owner: () => owner }), 'logout')
    expect(result.kind).toBe('error')
    expect(owner.dispose).not.toHaveBeenCalled()
  })

  it('deleteRecord 抛桥错误：error 带码，后续步骤不执行', async () => {
    const credentials = fakeLogoutCredentials({
      deleteRecord: vi.fn(async () => {
        throw new BridgeError('AUTH_STATE')
      }),
    })
    const owner = fakeOwner()
    const result = await runCommand(makeDeps({ credentials: () => credentials, owner: () => owner }), 'logout')
    expect(result.kind).toBe('error')
    expect(result.kind === 'error' && result.text).toContain('AUTH_STATE')
    expect(credentials.unset).not.toHaveBeenCalled()
    expect(owner.dispose).not.toHaveBeenCalled()
  })
})

describe('commands handler：route（H12 集成）', () => {
  it('install：写入 profile 层 providers.zcode-plan 且回执逐字（llm 已注册）', async () => {
    const editor = makeFakeEditor()
    const llm = makeFakeLlm(['zai-coding-cn', 'zcode-plan'])
    const result = await runCommand(makeDeps({ configEditor: () => editor.configEditor, llm: () => llm }), 'route install')
    expect(result).toEqual({
      kind: 'success',
      text: '已写入 llm-pi-ai.providers.zcode-plan（profile 层）；当前路由已注册',
    })
    const providers = editor.readOverride().providers as Record<string, unknown> | undefined
    expect(providers?.['zcode-plan']).toEqual(ZCODE_PLAN_ROUTE)
    // 不碰默认路由键（C8/E7）。
    expect(editor.readOverride()['agent-default-model']).toBeUndefined()
  })

  it('install 幂等短路：第二遍不再写盘，回执仍逐字成功（registered 现查 llm）', async () => {
    const editor = makeFakeEditor()
    const llm = makeFakeLlm(['zcode-plan'])
    const deps = makeDeps({ configEditor: () => editor.configEditor, llm: () => llm })
    const cmd = createZcodePlanCommand(deps)
    await cmd.handler({ rawInput: 'route install' })
    const firstOverride = JSON.stringify(editor.readOverride())
    const second = await cmd.handler({ rawInput: 'route install' })
    expect(JSON.stringify(editor.readOverride())).toBe(firstOverride)
    expect(second).toEqual({
      kind: 'success',
      text: '已写入 llm-pi-ai.providers.zcode-plan（profile 层）；当前路由已注册',
    })
  })

  it('install 写盘成功但 llm 未注册：success 文案提示待宿主重载', async () => {
    const editor = makeFakeEditor()
    const result = await runCommand(makeDeps({ configEditor: () => editor.configEditor, llm: () => makeFakeLlm([]) }), 'route install')
    expect(result).toEqual({
      kind: 'success',
      text: expect.stringContaining('llm 目录尚未注册'),
    })
  })

  it('install 无 llm-pi-ai 行：error 且不写盘', async () => {
    const editor = makeFakeEditor({ rows: [] })
    const result = await runCommand(makeDeps({ configEditor: () => editor.configEditor }), 'route install')
    expect(result).toEqual({ kind: 'error', text: expect.stringContaining('llm-pi-ai') })
    expect(editor.readOverride()).toEqual({})
  })

  it('remove：只删本键且回执逐字', async () => {
    const editor = makeFakeEditor({ override: { providers: { 'zcode-plan': ZCODE_PLAN_ROUTE, 'zai-coding-cn': { api: 'x' } } } })
    const result = await runCommand(makeDeps({ configEditor: () => editor.configEditor }), 'route remove')
    expect(result).toEqual({
      kind: 'success',
      text: '已从 profile 层移除 zcode-plan 路由；回退路由 zai-coding-cn 不受影响',
    })
    const providers = editor.readOverride().providers as Record<string, unknown> | undefined
    expect(providers && 'zcode-plan' in providers).toBe(false)
    expect(providers && 'zai-coding-cn' in providers).toBe(true)
  })

  it('remove 无 llm-pi-ai 行：error', async () => {
    const editor = makeFakeEditor({ rows: [] })
    const result = await runCommand(makeDeps({ configEditor: () => editor.configEditor }), 'route remove')
    expect(result).toEqual({ kind: 'error', text: expect.stringContaining('llm-pi-ai') })
  })

  it('route status：已注册 / 未安装两态的单行回执', async () => {
    const registered = await runCommand(makeDeps({ llm: () => makeFakeLlm(['zcode-plan']) }), 'route status')
    expect(registered).toEqual({ kind: 'success', text: '路由：已注册（glm-5.3, glm-5.3-flash）' })
    const absent = await runCommand(makeDeps({ llm: () => makeFakeLlm([]) }), 'route')
    expect(absent).toEqual({ kind: 'success', text: '路由：未安装（运行 /zcode-plan route install）' })
  })

  it('config-editor 缺席：install/remove 都 error', async () => {
    expect((await runCommand(makeDeps({ configEditor: () => undefined }), 'route install')).kind).toBe('error')
    expect((await runCommand(makeDeps({ configEditor: () => undefined }), 'route remove')).kind).toBe('error')
  })
})

describe('commands handler：refresh（RE-3）', () => {
  it('首张换发：「与上一张不同：是」+ 有效期至；回执与日志都不含 PAT 值', async () => {
    const owner = fakeOwner({ current: vi.fn(() => undefined), ensure: vi.fn(async () => LEASE_A) })
    const log = makeLog()
    const result = await runCommand(makeDeps({ owner: () => owner, log }), 'refresh')
    expect(result).toEqual({ kind: 'success', text: expect.stringContaining('与上一张不同：是') })
    expect(result.kind === 'success' && result.text).toContain(`有效期至 ${formatFullTime(LEASE_A.expiresAt)}`)
    const text = result.kind === 'success' ? (result.text ?? '') : ''
    assertNoSecret(text, [PAT_FIXTURE, JWT_FIXTURE])
    // 事件行只带到期时刻，不带值。
    expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/^pat_issued expiresAt=\d{4}-\d{2}-\d{2}T/))
  })

  it('同 Key 连续换发拿到同一张 PAT：RE-3 显示「否」', async () => {
    const owner = fakeOwner({ current: vi.fn(() => LEASE_A), ensure: vi.fn(async () => LEASE_A) })
    const result = await runCommand(makeDeps({ owner: () => owner }), 'refresh')
    expect(result).toEqual({ kind: 'success', text: expect.stringContaining('与上一张不同：否') })
  })

  it('换发拿到不同 PAT：显示「是」', async () => {
    const leaseB: PatLease = { pat: 'pat-different-value-456789', expiresAt: FIXED_NOW + 5 * 3_600_000 }
    const owner = fakeOwner({ current: vi.fn(() => LEASE_A), ensure: vi.fn(async () => leaseB) })
    const result = await runCommand(makeDeps({ owner: () => owner }), 'refresh')
    expect(result).toEqual({ kind: 'success', text: expect.stringContaining('与上一张不同：是') })
  })

  it('signed-channel 联动：换发成功调 afterRefresh（签名计数重置钩子），失败不调', async () => {
    const owner = fakeOwner({ current: vi.fn(() => undefined), ensure: vi.fn(async () => LEASE_A) })
    const afterRefresh = vi.fn()
    await runCommand(makeDeps({ owner: () => owner, afterRefresh }), 'refresh')
    expect(afterRefresh).toHaveBeenCalledOnce()
    const failing = fakeOwner({ ensure: vi.fn(async () => { throw new BridgeError('JWT_EXPIRED') }) })
    const afterRefresh2 = vi.fn()
    await runCommand(makeDeps({ owner: () => failing, afterRefresh: afterRefresh2 }), 'refresh')
    expect(afterRefresh2).not.toHaveBeenCalled()
  })

  it('owner 缺席 / ensure 抛桥错误：分别报错且 error 不含 PAT 值', async () => {
    expect(await runCommand(makeDeps({ owner: () => undefined }), 'refresh')).toEqual({
      kind: 'error',
      text: expect.stringContaining('PAT 续期器未就绪'),
    })
    const failing = fakeOwner({ ensure: vi.fn(async () => { throw new BridgeError('JWT_EXPIRED') }) })
    const result = await runCommand(makeDeps({ owner: () => failing }), 'refresh')
    expect(result).toEqual({ kind: 'error', text: expect.stringContaining('JWT_EXPIRED') })
    expect(result.kind === 'error' && result.text).not.toContain(PAT_FIXTURE)
  })
})

describe('commands handler：status 与 bad（H13/H14）', () => {
  it('bad → error + USAGE（逐字）', async () => {
    const result = await runCommand(makeDeps(), 'bogus')
    expect(result).toEqual({ kind: 'error', text: USAGE })
  })

  it('status → success + renderStatus(快照源) 的文本', async () => {
    const snapshot = makeSnapshot()
    const deps = makeDeps({ status: async () => snapshot })
    const result = await runCommand(deps, 'status')
    expect(result).toEqual({ kind: 'success', text: renderStatus(snapshot) })
    expect(result.kind === 'success' && result.text).toContain('zcode-plan 状态')
  })

  it('缺省（无参数）等价 status', async () => {
    const snapshot = makeSnapshot()
    const result = await runCommand(makeDeps({ status: async () => snapshot }), '')
    expect(result.kind === 'success' && result.text).toBe(renderStatus(snapshot))
  })

  it('取消信号透传给 status 快照源（handler 的 signal 参数）', async () => {
    const status = vi.fn(async () => makeSnapshot())
    const deps = makeDeps({ status })
    const cmd = createZcodePlanCommand(deps)
    const controller = new AbortController()
    await cmd.handler({ rawInput: 'status', signal: controller.signal })
    expect(status).toHaveBeenCalledWith(controller.signal)
  })
})

describe('status 渲染（H13 基础）', () => {
  it('五段齐全：已登录（RE-5 不显示 JWT 到期）· Key ready 前 8 位 · PAT 有效 · 已注册 · 两档用量 · 备注 无', () => {
    const text = renderStatus(makeSnapshot())
    expect(text).toContain('zcode-plan 状态（读数 ')
    expect(text).toContain('  登录：已登录')
    expect(text).not.toContain('JWT 到期')
    expect(text).toContain('  Key ：zcode-plan-bridge · scene=1 · id 3f9a1c2b…')
    expect(text).toContain('  PAT ：有效 · 到期 ')
    expect(text).toContain('（剩 4h10m）')
    expect(text).toContain('· 下次续期 ≤ ')
    expect(text).toContain('  路由：已注册（glm-5.3, glm-5.3-flash）')
    expect(text).toContain('5h 窗口 3120 / 28000（11%，重置 ')
    expect(text).toContain('· 周 18200 / 140000（13%，重置 ')
    expect(text).toContain('（读数 2 分钟前，服务端聚合延迟 1–2 分钟）')
    expect(text).toContain('  备注：无')
    // 红线（D-12）：JWT / PAT 真值不出现。
    assertNoSecret(text, [JWT_FIXTURE, PAT_FIXTURE])
  })

  it('旧记录真带 jwtExpiresAt 时如实渲染（不伪造、不隐藏）', () => {
    const snapshot = makeSnapshot({
      grant: makeGrant({ jwtExpiresAt: FIXED_NOW + 27 * 86_400_000 }),
    })
    const text = renderStatus(snapshot)
    expect(text).toContain('JWT 到期 ')
    expect(text).toContain('（剩 27d）')
  })

  it('未登录：登录段提示 + 用量段降级（AUTH_STATE），其余段照常', () => {
    const text = renderStatus(
      makeSnapshot({
        grant: undefined,
        key: { kind: 'unknown' },
        pat: { kind: 'none' },
        usage: { kind: 'error', code: 'AUTH_STATE' },
        route: { registered: false, declared: false },
      }),
    )
    expect(text).toContain('  登录：未登录（运行 /zcode-plan login）')
    expect(text).toContain('  Key ：未知（登录后自动 find-or-create）')
    expect(text).toContain('  PAT ：无')
    expect(text).toContain('  路由：未安装（运行 /zcode-plan route install）')
    expect(text).toContain('  用量：读取失败（AUTH_STATE），需登录态与 org/project')
    assertNoSecret(text, [JWT_FIXTURE, PAT_FIXTURE])
  })

  it('PAT 三态：已过期 / 已停止（码）/ 缺 patRenewalLeadMs 时省略「下次续期」', () => {
    expect(renderStatus(makeSnapshot({ pat: { kind: 'expired' } }))).toContain('  PAT ：已过期')
    const halted = renderStatus(
      makeSnapshot({
        pat: { kind: 'halted', code: 'JWT_EXPIRED' },
        haltReason: { code: 'JWT_EXPIRED', message: '登录态已失效，请重新登录' },
      }),
    )
    expect(halted).toContain('  PAT ：已停止（JWT_EXPIRED）')
    expect(halted).toContain('  备注：JWT_EXPIRED：')
    const validButStale = renderStatus(makeSnapshot({ pat: { kind: 'valid', expiresAt: FIXED_NOW - 1_000 } }))
    expect(validButStale).toContain('  PAT ：已过期')
    const noLead = renderStatus(makeSnapshot({ patRenewalLeadMs: undefined }))
    expect(noLead).not.toContain('下次续期')
  })

  it('路由三态：已声明未注册（dormant）/ 未安装（无段缩进，供 route status 单行回执）', () => {
    expect(renderRouteLine({ registered: false, declared: true })).toBe('路由：已声明未注册')
    expect(renderRouteLine({ registered: false, declared: false })).toBe('路由：未安装（运行 /zcode-plan route install）')
    // renderStatus 内的五段缩进由渲染层统一补。
    expect(renderStatus(makeSnapshot({ route: { registered: false, declared: true } }))).toContain('  路由：已声明未注册')
  })

  it('备注段：REF_CONFLICT（外部来源点名）', () => {
    const text = renderStatus(makeSnapshot({ refConflict: { source: 'env' } }))
    expect(text).toContain('  备注：REF_CONFLICT：ZCODE_PLAN_PAT 由外部来源（env）供值')
  })

  it('用量：缺一档显示「无读数」；缺重置时刻省略该片段；读数刚刚（<1 分钟）', () => {
    const text = renderStatus(
      makeSnapshot({
        usage: {
          kind: 'ok',
          fiveHour: { total: 28_000, used: 3_120 },
          readAt: FIXED_NOW,
        },
      }),
    )
    expect(text).toContain('5h 窗口 3120 / 28000（11%）')
    expect(text).toContain('周 无读数')
    expect(text).toContain('（读数 刚刚，服务端聚合延迟 1–2 分钟）')
  })

  it('用量：percentage 缺失按 used/total 自算并取整', () => {
    const text = renderStatus(
      makeSnapshot({
        usage: { kind: 'ok', fiveHour: { total: 10_000, used: 3_333 }, readAt: FIXED_NOW },
      }),
    )
    expect(text).toContain('5h 窗口 3333 / 10000（33%')
  })
})

describe('格式化纯函数（时区无关矩阵）', () => {
  it('formatRemaining：27d / 4h10m / 2h5m / 35m / 0 → 已过期', () => {
    expect(formatRemaining(27 * 86_400_000 + 3_600_000)).toBe('27d')
    expect(formatRemaining(4 * 3_600_000 + 10 * 60_000)).toBe('4h10m')
    expect(formatRemaining(2 * 3_600_000 + 5 * 60_000)).toBe('2h5m')
    expect(formatRemaining(35 * 60_000)).toBe('35m')
    expect(formatRemaining(0)).toBe('已过期')
    expect(formatRemaining(-1_000)).toBe('已过期')
  })

  it('formatFullTime / formatClockTime / formatWeekTime：本地字段拼接（2026-01-05 09:07 → 周一）', () => {
    const ms = new Date(2026, 0, 5, 9, 7).getTime()
    expect(formatFullTime(ms)).toBe('2026-01-05 09:07')
    expect(formatClockTime(ms)).toBe('09:07')
    expect(formatWeekTime(ms)).toBe('周一 09:07')
  })
})

describe('parseUsageLimits（两档收紧）', () => {
  it('unit===3 与 unit===6 各归一档；其余 unit 忽略', () => {
    const parsed = parseUsageLimits([
      { unit: 3, number: 28_000, currentValue: 3_120, percentage: 11.14, nextResetTime: '2026-03-15T10:00:00+08:00' },
      { unit: 1, number: 999, currentValue: 1 },
      { unit: 6, number: 140_000, currentValue: 18_200, percentage: 13, nextResetTime: 1_773_600_000 },
    ])
    expect(parsed.fiveHour).toEqual({
      total: 28_000,
      used: 3_120,
      percentage: 11.14,
      resetAt: new Date('2026-03-15T10:00:00+08:00').getTime(),
    })
    expect(parsed.weekly).toEqual({ total: 140_000, used: 18_200, percentage: 13, resetAt: 1_773_600_000_000 })
  })

  it('缺 number / currentValue / 非对象行：整行丢弃，不产半档读数', () => {
    const parsed = parseUsageLimits([
      null,
      'oops',
      { unit: 3, currentValue: 5 },
      { unit: 6, number: 140_000 },
      { unit: 3, number: 28_000, currentValue: 1_000 },
    ])
    expect(parsed.fiveHour).toEqual({ total: 28_000, used: 1_000 })
    expect(parsed.weekly).toBeUndefined()
  })

  it('percentage / nextResetTime 缺失：省略字段（渲染自算百分比）', () => {
    const parsed = parseUsageLimits([{ unit: 3, number: 100, currentValue: 25 }])
    expect(parsed.fiveHour).toEqual({ total: 100, used: 25 })
  })
})

describe('readUsage（只读 + 降级）', () => {
  it('成功：两档解析 + readAt 取注入 clock', async () => {
    let nowCalls = 0
    const clock = { now: () => (nowCalls += 1), setTimeout: () => 0, clearTimeout: () => undefined }
    const data: UsageData = { level: 1, limits: [{ unit: 3, number: 28_000, currentValue: 3_120 }] }
    let calledWith: unknown
    const client = fakeClient(async (input) => {
      calledWith = input
      return data
    })
    const snapshot = await readUsage(client, makeGrant(), clock)
    expect(snapshot.kind).toBe('ok')
    expect(snapshot.kind === 'ok' && snapshot.fiveHour).toEqual({ total: 28_000, used: 3_120 })
    expect(snapshot.kind === 'ok' && snapshot.weekly).toBeUndefined()
    expect((calledWith as { jwt: string }).jwt).toBe(JWT_FIXTURE)
    expect((calledWith as { organization: string; project: string }).organization).toBe('org-1')
  })

  it('grant 缺 organization：AUTH_STATE 且不发请求（RE-2 身份必须齐）', async () => {
    const readUsageFn = vi.fn(async () => ({ level: 1, limits: [] }))
    const client = fakeClient(readUsageFn)
    const grant = makeGrant({ organization: undefined })
    const snapshot = await readUsage(client, grant, { now: () => 0, setTimeout: () => 0, clearTimeout: () => undefined })
    expect(snapshot).toEqual({ kind: 'error', code: 'AUTH_STATE' })
    expect(readUsageFn).not.toHaveBeenCalled()
  })

  it('client 抛桥错误 → 码；抛普通异常 → unknown', async () => {
    const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => undefined }
    const bridgeFail = fakeClient(async () => {
      throw new BridgeError('TIMEOUT')
    })
    expect(await readUsage(bridgeFail, makeGrant(), clock)).toEqual({ kind: 'error', code: 'TIMEOUT' })
    const randomFail = fakeClient(async () => {
      throw new TypeError('boom')
    })
    expect(await readUsage(randomFail, makeGrant(), clock)).toEqual({ kind: 'error', code: 'unknown' })
  })
})

describe('readRouteState（llm 两读）', () => {
  it('已注册（listProviders 命中）/ 已声明未注册（仅 configurable 命中）/ 都无', () => {
    expect(readRouteState(makeFakeLlm(['zcode-plan']))).toEqual({ registered: true, declared: false })
    expect(readRouteState(makeFakeLlm([], ['zcode-plan']))).toEqual({ registered: false, declared: true })
    expect(readRouteState(makeFakeLlm(['zai-coding-cn']))).toEqual({ registered: false, declared: false })
  })

  it('llm 缺席 / 读抛错：按未命中处理，不抛', () => {
    expect(readRouteState(undefined)).toEqual({ registered: false, declared: false })
    const throwing: StatusLlmPort = {
      listProviders: () => {
        throw new Error('llm down')
      },
      listConfigurableProviders: () => {
        throw new Error('llm down')
      },
    }
    expect(readRouteState(throwing)).toEqual({ registered: false, declared: false })
  })

  it('listConfigurableProviders 缺席（旧宿主形状）：declared=false', () => {
    const legacy = { listProviders: () => [{ id: 'zai-coding-cn' }] } as unknown as StatusLlmPort
    expect(readRouteState(legacy)).toEqual({ registered: false, declared: false })
  })
})

describe('日志事件词汇与锚点翻译（H2 部分）', () => {
  it('LOG_EVENT_NAMES：八个固定事件词齐全', () => {
    expect([...LOG_EVENT_NAMES]).toEqual([
      'pat_issued',
      'pat_refresh_deferred',
      'pat_refresh_failed',
      'key_created',
      'key_reused',
      'login_committed',
      'route_registered',
      'halted',
    ])
  })

  /** 裸 inner + 事件翻译层的组合（真实装配里 inner 是 createLogPort 产物）。 */
  function makeHookedLog(): { lines: string[]; log: LogPort } {
    const lines: string[] = []
    const inner: LogPort = {
      info: (message) => lines.push(message),
      warn: (message) => lines.push(message),
      error: (message) => lines.push(message),
    }
    return { lines, log: withEventHooks(inner) }
  }

  it('key-manager 锚点：已新建 / 已复用桥接 Key → key_created / key_reused', () => {
    const { lines, log } = makeHookedLog()
    log.info('已新建桥接 Key（zcode-plan-bridge，usageScene=1）')
    log.info('已复用桥接 Key（zcode-plan-bridge，usageScene=1）')
    expect(lines).toEqual([
      '已新建桥接 Key（zcode-plan-bridge，usageScene=1）',
      'key_created',
      '已复用桥接 Key（zcode-plan-bridge，usageScene=1）',
      'key_reused',
    ])
  })

  it('pat-owner 锚点：halt 带码；续期失败带 code=；无 code 形态只出事件词', () => {
    const { lines, log } = makeHookedLog()
    log.error('PAT 续期已终止（JWT_EXPIRED）：登录态已失效，请重新登录')
    log.warn('PAT 续期失败（可重试，5s 后再试）：code=TIMEOUT')
    log.warn('PAT 续期失败（可重试，5s 后再试）：AbortError')
    expect(lines).toContain('halted code=JWT_EXPIRED')
    expect(lines).toContain('pat_refresh_failed code=TIMEOUT')
    expect(lines).toContain('pat_refresh_failed')
  })

  it('login-flow / route-config 锚点：登录完成 → login_committed；路由注册行 → route_registered', () => {
    const { lines, log } = makeHookedLog()
    log.info('登录完成：已提交 BigModel 登录记录')
    log.info('zcode-plan 路由已写入 profile patch 并在 llm 目录注册')
    expect(lines).toContain('login_committed')
    expect(lines).toContain('route_registered')
  })

  it('无锚点的行只透传一次，不产生事件行', () => {
    const { lines, log } = makeHookedLog()
    log.warn('PAT_REF describe 失败，按无冲突继续：code=TIMEOUT')
    expect(lines).toEqual(['PAT_REF describe 失败，按无冲突继续：code=TIMEOUT'])
  })
})

/** 命令面 apply 接线的假宿主（复刻 host-apply.test 的形状 + commands 服务）。 */
function createFakeHost(options: { services: readonly string[]; credentials?: CredentialsPort; describe?: CredentialsPort['describe'] }) {
  const disposers: Array<() => void> = []
  const effectLabels: string[] = []
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const registerFlow = vi.fn(() => () => undefined)
  const commandsRegister = vi.fn((_definition: unknown) => () => undefined)

  const scope: Record<string, unknown> = {
    authorization: { registerFlow, begin: vi.fn(async () => ({ status: 'cancelled' as const })) },
    commands: { register: commandsRegister },
    effect: (execute: () => unknown, label?: string) => {
      effectLabels.push(label ?? '')
      const result = typeof execute === 'function' ? execute() : undefined
      if (typeof result === 'function') disposers.push(result as () => void)
      return result
    },
    on: (name: string, listener: (...args: unknown[]) => void) => {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return () => undefined
    },
  }
  if (options.credentials !== undefined) scope.credentials = options.credentials

  const ctx = {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    inject: (names: readonly string[], cb: (scope: unknown) => void) => {
      if (names.every((service) => options.services.includes(service))) cb(scope)
    },
    get: (serviceId: string) => (serviceId === 'llm' ? undefined : undefined),
  }
  return { ctx, registerFlow, commandsRegister, disposers, effectLabels, listeners }
}

/** 用必填项校验一份配置（照 host-apply.test 的 makeConfig）。 */
function makeConfig(overrides: Record<string, unknown> = {}): ZcodePlanConfig {
  return Config({ organization: 'org', project: 'proj', ...overrides }) as ZcodePlanConfig
}

describe('apply 的 commands 接线（T7）', () => {
  it('三服务齐备：/zcode-plan 注册一次，definition.name 与 input.hint 正确，disposer 进 scope.effect', async () => {
    const credentials = { describe: async () => ({ configured: false, writable: false }), readRecord: async () => undefined } as unknown as CredentialsPort
    const host = createFakeHost({ services: ['credentials', 'authorization', 'commands'], credentials })
    apply(host.ctx as never, makeConfig())
    await vi.waitFor(() => expect(host.commandsRegister).toHaveBeenCalledTimes(1), { timeout: 1_000, interval: 5 })
    const definition = host.commandsRegister.mock.calls[0]?.[0] as { name: string; input?: { hint: string }; handler: (invocation: { rawInput: string }) => unknown }
    expect(definition.name).toBe(COMMAND_NAME)
    expect(definition.input?.hint).toContain('refresh')
    expect(host.effectLabels).toContain('zcode-plan: command')
    // 拆卸面可执行（命令撤销 + owner/flow 不抛）。
    for (const dispose of host.disposers) expect(() => dispose()).not.toThrow()
  })

  it('commands 缺席：命令不注册，凭证装配不受影响', async () => {
    const credentials = { describe: async () => ({ configured: false, writable: false }), readRecord: async () => undefined } as unknown as CredentialsPort
    const host = createFakeHost({ services: ['credentials', 'authorization'], credentials })
    expect(() => apply(host.ctx as never, makeConfig())).not.toThrow()
    await vi.waitFor(() => expect(host.registerFlow).toHaveBeenCalledTimes(1), { timeout: 1_000, interval: 5 })
    expect(host.commandsRegister).not.toHaveBeenCalled()
  })

  it('端到端：未登录的 status 命令 → 未登录行 + 用量降级（AUTH_STATE），REF_CONFLICT 时备注段点名来源', async () => {
    const credentials = {
      describe: async () => ({ configured: true, source: 'env', writable: false }),
      readRecord: async () => undefined,
      deleteRecord: async () => undefined,
      unset: async () => undefined,
    } as unknown as CredentialsPort
    const host = createFakeHost({ services: ['credentials', 'authorization', 'commands'], credentials })
    apply(host.ctx as never, makeConfig())
    await vi.waitFor(() => expect(host.commandsRegister).toHaveBeenCalledTimes(1), { timeout: 1_000, interval: 5 })
    const definition = host.commandsRegister.mock.calls[0]?.[0] as { handler: (invocation: { rawInput: string }) => Promise<{ kind: string; text?: string }> }
    const result = await definition.handler({ rawInput: 'status' })
    expect(result.kind).toBe('success')
    expect(result.text).toContain('登录：未登录')
    expect(result.text).toContain('用量：读取失败（AUTH_STATE）')
    expect(result.text).toContain('备注：REF_CONFLICT：ZCODE_PLAN_PAT 由外部来源（env）供值')
    assertNoSecret(result.text ?? '', [JWT_FIXTURE, PAT_FIXTURE])
  })
})
