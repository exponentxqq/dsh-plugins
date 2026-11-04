import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BigmodelClient, IssuePatInput, PatLease } from '../src/host/bigmodel/client.ts'
import { LOGIN_RECORD_KEY, PAT_REF } from '../src/host/credential-record.ts'
import { BridgeError } from '../src/host/errors.ts'
import type { KeyManager } from '../src/host/key-manager.ts'
import { createPatOwner, MIN_RETRY_MS, RETRY_BACKOFF_MS, type PatOwnerDeps } from '../src/host/pat-owner.ts'
import type { ClockPort, CredentialsPort, LogPort } from '../src/host/ports.ts'

/**
 * PAT owner 状态机单测（X4）：owner 全走注入的 ClockPort（包装到全局定时器上），
 * 由 vitest fake timers 统一驱动——`vi.advanceTimersByTime` / `advanceTimersByTimeAsync`
 * 即「假时钟推进」。所有端口（credentials / client / keyManager / log）皆假实现，
 * 零真实网络；issuePat 的失败注入即 §3.5 失败分类表的逐行复现。
 */

/** 假时钟固定起点（epoch ms）：租约效期换算与续期公式断言的基准。 */
const START_MS = 1_700_000_000_000
/** 提前量（Config `refreshLeadMs` 官方贴 120s）。 */
const LEAD_MS = 120_000
/** 续期用例的租约满值效期（3_600_000）。 */
const EXPIRES_IN_MS = 3_600_000

/** 登录 grant payload 夹具（身份字段齐全，parseGrant 可解析）。 */
const GRANT_PAYLOAD = {
  v: 1,
  jwt: 'jwt-fixture-abcd12345678',
  organization: 'org-1',
  project: 'proj-1',
  loginAt: START_MS - 1_000,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START_MS)
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * ClockPort 的 fake timers 载体：`now` 直读假时钟，setTimeout/clearTimeout 透传到
 * 全局（已被 vi 接管）；`delays` 逐次记录排程时长，供续期公式与退避时长的精确断言。
 */
function makeClockPort() {
  const delays: number[] = []
  const clock: ClockPort = {
    now: () => Date.now(),
    setTimeout: (handler, timeoutMs) => {
      delays.push(timeoutMs)
      return globalThis.setTimeout(handler, timeoutMs)
    },
    clearTimeout: (handle) => globalThis.clearTimeout(handle as NodeJS.Timeout),
  }
  return { clock, delays }
}

/** 内存版假 credentials：记录读-改-写照 seam 语义（mutate 返回 current 原样即不重写）。 */
function makeFakeCredentials(payload: Record<string, unknown> | undefined) {
  let stored: CredentialRecord | undefined = payload === undefined ? undefined : { kind: 'grant', payload }
  const calls = {
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
    readRecord: vi.fn(async (): Promise<CredentialRecord | undefined> => stored),
    modifyRecord: vi.fn(
      async (
        _key: CredentialKey,
        mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
      ) => {
        const next = await mutate(stored)
        if (next !== stored) stored = next
        return stored
      },
    ),
  }
  const credentials: CredentialsPort = {
    resolve: async () => undefined,
    describe: async () => ({ configured: false, writable: true }),
    set: calls.set,
    unset: calls.unset,
    readRecord: calls.readRecord,
    modifyRecord: calls.modifyRecord,
    deleteRecord: async () => {},
  }
  return { credentials, calls, getStored: (): CredentialRecord | undefined => stored }
}

/** 假 keyManager：ensureKey 默认回 'key-1'；作废只记录调用（404 防环断言用）。 */
function makeFakeKeyManager() {
  const ensureKey = vi.fn(async (): Promise<string> => 'key-1')
  const invalidateKey = vi.fn((_keyId: string) => {})
  const keyManager: KeyManager = {
    ensureKey,
    invalidateKey,
    state: () => ({ kind: 'ready', keyId: 'key-1' }),
  }
  return { keyManager, ensureKey, invalidateKey }
}

/** 假 client：仅 issuePat 被桩出默认成功行为（换发时刻的 now + 满值效期），其余零调用。 */
function makeFakeClient() {
  const issuePat = vi.fn(async (_input: IssuePatInput): Promise<PatLease> => ({
    pat: 'pat-ok',
    expiresAt: Date.now() + EXPIRES_IN_MS,
  }))
  const client: BigmodelClient = {
    exchangeAuthCode: async () => 'jwt-unused',
    listKeys: async () => [],
    createKey: async () => 'key-created',
    issuePat,
    readUsage: async () => ({ level: undefined, limits: [] }),
  }
  return { client, issuePat }
}

/** 组装被测 owner 与全部假端口；`payload` 为 null 表示无登录记录。 */
function makeOwner(
  overrides: Partial<PatOwnerDeps> = {},
  jitterMs = 0,
  payload: Record<string, unknown> | null = { ...GRANT_PAYLOAD },
) {
  const creds = makeFakeCredentials(payload === null ? undefined : payload)
  const km = makeFakeKeyManager()
  const cli = makeFakeClient()
  const clockBox = makeClockPort()
  const log: LogPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const deps: PatOwnerDeps = {
    credentials: creds.credentials,
    client: cli.client,
    keyManager: km.keyManager,
    log,
    clock: clockBox.clock,
    leadMs: LEAD_MS,
    jitterMs,
    recordKey: LOGIN_RECORD_KEY,
    patRef: PAT_REF,
    ...overrides,
  }
  return { owner: createPatOwner(deps), deps, creds, km, cli, clockBox, log }
}

/** 纯微任务冲刷：不动假时钟，把 in-flight promise 链推到稳定点。 */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}

describe('成功链与续期调度（X4-1/2）', () => {
  it('identity()：ensure 前 undefined；ensure 后返回身份三要素快照（拷贝语义）', async () => {
    const box = makeOwner()
    // 未跑过 ensure（读不到有效 grant 前）：identity undefined。
    expect(box.owner.identity()).toBeUndefined()
    await box.owner.ensure()
    const id = box.owner.identity()
    expect(id).toEqual({ jwt: GRANT_PAYLOAD.jwt, organization: 'org-1', project: 'proj-1' })
    // 拷贝语义：外部改动返回值不污染内部状态（与 current()/state() 同款纪律）。
    id!.jwt = 'tampered'
    expect(box.owner.identity()?.jwt).toBe(GRANT_PAYLOAD.jwt)
  })

  it('成功链：发布后恰 1 个续期定时器，delay 精确 = expiresAt-now-leadMs（jitter=0）', async () => {
    const box = makeOwner()
    const lease = await box.owner.ensure()
    expect(lease).toEqual({ pat: 'pat-ok', expiresAt: START_MS + EXPIRES_IN_MS })
    expect(box.owner.current()).toEqual(lease)
    expect(box.owner.state()).toEqual({ kind: 'valid', expiresAt: START_MS + EXPIRES_IN_MS })
    expect(box.owner.haltReason()).toBeUndefined()
    // 发布是唯一 set 路径：恰 1 次、写的就是 PAT_REF + PAT 本体
    expect(box.creds.calls.set).toHaveBeenCalledOnce()
    expect(box.creds.calls.set).toHaveBeenCalledWith(PAT_REF, lease.pat)
    expect(box.creds.calls.unset).not.toHaveBeenCalled()
    // 补写 patExpiresAt 落记录：身份字段保留
    expect(box.creds.getStored()).toEqual({
      kind: 'grant',
      payload: { ...GRANT_PAYLOAD, patExpiresAt: START_MS + EXPIRES_IN_MS },
    })
    // 恰 1 个续期定时器：delay = expiresAt - now - leadMs - random*jitter(=0)，无 clamp 触碰
    expect(vi.getTimerCount()).toBe(1)
    expect(box.clockBox.delays).toEqual([EXPIRES_IN_MS - LEAD_MS])
  })

  it('signed-channel 联动：发布成功后 onPatPublished 收到 PAT 本体（同代次）', async () => {
    const onPatPublished = vi.fn()
    const box = makeOwner({ onPatPublished })
    const lease = await box.owner.ensure()
    expect(onPatPublished).toHaveBeenCalledOnce()
    expect(onPatPublished).toHaveBeenCalledWith(lease.pat)
  })

  it('signed-channel 联动：迟到结果（代次已更替）不触发 onPatPublished', async () => {
    const onPatPublished = vi.fn()
    // publish 内 credentials.set 之后才做代次检查——用 dispose 制造代次更替：
    // ensure 进入后立刻 dispose（generation 递增），在途结果到达时 gen !== generation。
    const box = makeOwner({ onPatPublished })
    const pending = box.owner.ensure()
    box.owner.dispose()
    await pending.catch(() => {})
    expect(onPatPublished).not.toHaveBeenCalled()
  })

  it('vi.advanceTimersByTime(leadMs-1) 不触发续期；再推进 1ms 补足 leadMs 触发（jitter=0）', async () => {
    const box = makeOwner()
    // 租约效期取 2×leadMs：续期定时器恰排在 leadMs 位置（delay = expiresAt-now-leadMs）
    box.cli.issuePat.mockResolvedValueOnce({ pat: 'pat-short', expiresAt: START_MS + 2 * LEAD_MS })
    await box.owner.ensure()
    expect(box.clockBox.delays).toEqual([LEAD_MS])
    // 提前量差 1ms：不得触发（issuePat / set 调用次数不变）
    vi.advanceTimersByTime(LEAD_MS - 1)
    expect(box.cli.issuePat).toHaveBeenCalledOnce()
    expect(box.creds.calls.set).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(1)
    // 补足最后 1ms：到点触发新一轮换发并重新发布
    await vi.advanceTimersByTimeAsync(1)
    expect(box.cli.issuePat).toHaveBeenCalledTimes(2)
    expect(box.creds.calls.set).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('jitter>0：delay 落在 (leadMs-jitterMs, leadMs]，推进到下界不触发、补足到上界必触发', async () => {
    const JITTER_MS = 10_000
    const box = makeOwner({}, JITTER_MS)
    box.cli.issuePat.mockResolvedValueOnce({ pat: 'pat-short', expiresAt: START_MS + 2 * LEAD_MS })
    await box.owner.ensure()
    const delay = box.clockBox.delays[0]
    expect(delay).toBeGreaterThan(LEAD_MS - JITTER_MS)
    expect(delay).toBeLessThanOrEqual(LEAD_MS)
    // 抖动下界（开区间）：尚不得触发
    vi.advanceTimersByTime(LEAD_MS - JITTER_MS)
    expect(box.cli.issuePat).toHaveBeenCalledOnce()
    // 补到上界（闭区间）：必触发
    await vi.advanceTimersByTimeAsync(JITTER_MS)
    expect(box.cli.issuePat).toHaveBeenCalledTimes(2)
  })

  it('RE-3：同值不同 expiresAt 也照常 set + 按新 expiresAt 重排（不比较 PAT 值）', async () => {
    const box = makeOwner()
    await box.owner.ensure()
    box.cli.issuePat.mockResolvedValue({ pat: 'pat-ok', expiresAt: START_MS + EXPIRES_IN_MS + 60_000 })
    await vi.advanceTimersByTimeAsync(EXPIRES_IN_MS - LEAD_MS)
    expect(box.cli.issuePat).toHaveBeenCalledTimes(2)
    // PAT 值与上轮相同，仍发布（set 恰 2 次）并按新 expiresAt 结算
    expect(box.creds.calls.set).toHaveBeenCalledTimes(2)
    expect(box.creds.calls.set).toHaveBeenLastCalledWith(PAT_REF, 'pat-ok')
    expect(box.owner.current()).toEqual({ pat: 'pat-ok', expiresAt: START_MS + EXPIRES_IN_MS + 60_000 })
    // 新 delay = 新 expiresAt - 续期时刻 now - leadMs = 60_000
    expect(box.clockBox.delays.at(-1)).toBe(60_000)
  })
})

describe('失败分类表（X4-3/4/5/8）', () => {
  it('429：ensure 原样 reject、旧 PAT 仍在 current()、set 未被再调、排 5s 退避（不放大）', async () => {
    const box = makeOwner()
    const first = await box.owner.ensure()
    const err429 = new BridgeError('HTTP:429')
    box.cli.issuePat.mockRejectedValue(err429)
    // 续期定时器到点：内部 ensure 失败被吞，改排固定 5s 退避
    await vi.advanceTimersByTimeAsync(EXPIRES_IN_MS - LEAD_MS)
    expect(box.owner.current()).toEqual(first) // 旧 PAT 仍在 current()
    expect(box.creds.calls.set).toHaveBeenCalledOnce() // set 未被再调
    expect(box.owner.state()).toEqual({ kind: 'valid', expiresAt: first.expiresAt }) // 旧值未过期 → valid
    expect(box.clockBox.delays.at(-1)).toBe(RETRY_BACKOFF_MS)
    expect(vi.getTimerCount()).toBe(1)
    // 直接 ensure()：原错误实例原样上抛
    await expect(box.owner.ensure()).rejects.toBe(err429)
    expect(box.creds.calls.set).toHaveBeenCalledOnce() // 依旧只发过 1 次
    expect(box.owner.state()).toEqual({ kind: 'valid', expiresAt: first.expiresAt })
  })

  it('429 的状态结算按旧值：已过期 → expired；无旧值 → none（退避同为 5s）', async () => {
    // 场景一：旧租约已过期（发布时 delay 被 clamp 到 5s 下界）
    const box1 = makeOwner()
    box1.cli.issuePat.mockResolvedValueOnce({ pat: 'pat-a', expiresAt: START_MS + 60_000 })
    await box1.owner.ensure()
    box1.cli.issuePat.mockRejectedValue(new BridgeError('HTTP:429'))
    vi.setSystemTime(START_MS + 60_001) // 旧租约此刻刚过期
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS)
    expect(box1.owner.state()).toEqual({ kind: 'expired' })
    expect(box1.owner.current()).toEqual({ pat: 'pat-a', expiresAt: START_MS + 60_000 }) // ref 侧未动
    expect(box1.creds.calls.set).toHaveBeenCalledOnce()
    vi.clearAllTimers() // 清掉场景一遗留的退避定时器，避免污染场景二的计时器计数
    // 场景二：首轮即 429（无旧值）
    const box2 = makeOwner()
    const err429 = new BridgeError('HTTP:429')
    box2.cli.issuePat.mockRejectedValue(err429)
    await expect(box2.owner.ensure()).rejects.toBe(err429)
    expect(box2.owner.state()).toEqual({ kind: 'none' })
    expect(box2.clockBox.delays).toEqual([RETRY_BACKOFF_MS])
    expect(vi.getTimerCount()).toBe(1)
  })

  it('401（JWT_EXPIRED）：halt —— current() 清空、state halted、set/unset 均不调、invalidateKey 不调、不再调度', async () => {
    const box = makeOwner()
    await box.owner.ensure()
    const err401 = new BridgeError('JWT_EXPIRED')
    box.cli.issuePat.mockRejectedValue(err401)
    await vi.advanceTimersByTimeAsync(EXPIRES_IN_MS - LEAD_MS)
    expect(box.owner.current()).toBeUndefined() // 内存租约清空
    expect(box.owner.haltReason()).toEqual({ code: 'JWT_EXPIRED', message: err401.message })
    expect(box.owner.state()).toEqual({ kind: 'halted', code: 'JWT_EXPIRED' })
    expect(box.creds.calls.set).toHaveBeenCalledOnce() // 不再重发
    expect(box.creds.calls.unset).not.toHaveBeenCalled() // ref 保留（unset 不调）
    expect(box.km.invalidateKey).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0) // 停止循环，无新定时器
    expect(box.log.error).toHaveBeenCalledOnce()
  })

  it('404（KEY_LOST）：invalidateKey 恰 1 次 → 重新 find-or-create → 再换成功恢复 valid', async () => {
    const box = makeOwner()
    box.km.ensureKey.mockResolvedValueOnce('key-1').mockResolvedValue('key-2')
    box.cli.issuePat
      .mockRejectedValueOnce(new BridgeError('KEY_LOST'))
      .mockResolvedValue({ pat: 'pat-ok', expiresAt: START_MS + EXPIRES_IN_MS })
    const lease = await box.owner.ensure()
    expect(lease.pat).toBe('pat-ok')
    expect(box.km.invalidateKey).toHaveBeenCalledTimes(1)
    expect(box.km.invalidateKey).toHaveBeenCalledWith('key-1')
    // 两次换发用的 keyId：失效的 key-1 → 重查到的 key-2
    expect(box.cli.issuePat.mock.calls[0]?.[0]?.keyId).toBe('key-1')
    expect(box.cli.issuePat.mock.calls[1]?.[0]?.keyId).toBe('key-2')
    expect(box.owner.state()).toEqual({ kind: 'valid', expiresAt: START_MS + EXPIRES_IN_MS })
    expect(box.creds.calls.set).toHaveBeenCalledOnce()
  })

  it('404 第二次仍失败：halt(KEY_LOST) 且 invalidateKey 总数仍 1（防环，绝无第二次 invalidate）', async () => {
    const box = makeOwner()
    box.km.ensureKey.mockResolvedValueOnce('key-1').mockResolvedValue('key-2')
    const err404 = new BridgeError('KEY_LOST')
    box.cli.issuePat.mockRejectedValue(err404)
    await expect(box.owner.ensure()).rejects.toBe(err404)
    expect(box.km.invalidateKey).toHaveBeenCalledTimes(1) // 只作废过一轮
    expect(box.km.invalidateKey).toHaveBeenCalledWith('key-1')
    expect(box.owner.state()).toEqual({ kind: 'halted', code: 'KEY_LOST' })
    expect(box.owner.current()).toBeUndefined()
    expect(box.owner.haltReason()).toEqual({ code: 'KEY_LOST', message: err404.message })
    expect(box.creds.calls.set).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['BUSINESS:1500', 'RISK_3012', 'PAT_SHAPE'] as const)(
    '%s：直接 halt（无重查无退避），文案原样透传',
    async (code) => {
      const box = makeOwner()
      const err = new BridgeError(code)
      box.cli.issuePat.mockRejectedValue(err)
      await expect(box.owner.ensure()).rejects.toBe(err)
      expect(box.owner.state()).toEqual({ kind: 'halted', code })
      expect(box.owner.haltReason()).toEqual({ code, message: err.message })
      expect(box.km.invalidateKey).not.toHaveBeenCalled()
      expect(box.creds.calls.set).not.toHaveBeenCalled()
      expect(box.creds.calls.unset).not.toHaveBeenCalled()
      // 既无退避也无续期定时器（排程记录为空 + 全局无在册计时器）
      expect(box.clockBox.delays).toEqual([])
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it.each(['TIMEOUT', 'HTTP:0'] as const)('%s 与 429 同类：固定 5s 退避、不做指数放大', async (code) => {
    const box = makeOwner()
    const err = new BridgeError(code)
    box.cli.issuePat.mockRejectedValue(err)
    await expect(box.owner.ensure()).rejects.toBe(err)
    expect(box.clockBox.delays).toEqual([RETRY_BACKOFF_MS])
    expect(vi.getTimerCount()).toBe(1)
    expect(box.owner.state()).toEqual({ kind: 'none' }) // 无旧值
    expect(box.owner.haltReason()).toBeUndefined() // retryable 不 halt
  })

  it('无登录记录或缺身份字段：AUTH_STATE，不发换 PAT 请求、不写 ref', async () => {
    const missingRecord = makeOwner({}, 0, null)
    await expect(missingRecord.owner.ensure()).rejects.toMatchObject({ code: 'AUTH_STATE' })
    expect(missingRecord.owner.state()).toEqual({ kind: 'none' })
    expect(missingRecord.cli.issuePat).not.toHaveBeenCalled()
    expect(missingRecord.creds.calls.set).not.toHaveBeenCalled()
    expect(missingRecord.clockBox.delays).toEqual([])

    const missingProject = makeOwner({}, 0, { ...GRANT_PAYLOAD, project: undefined })
    await expect(missingProject.owner.ensure()).rejects.toMatchObject({ code: 'AUTH_STATE' })
    expect(missingProject.cli.issuePat).not.toHaveBeenCalled()
  })
})

describe('代次隔离与单飞（X4-6/7）', () => {
  it('logout（dispose）后迟到的 issuePat 结果不写 ref：set 调用次数不变', async () => {
    const box = makeOwner()
    let resolveIssue!: (lease: PatLease) => void
    box.cli.issuePat.mockImplementation(
      () =>
        new Promise<PatLease>((resolve) => {
          resolveIssue = resolve
        }),
    )
    const pending = box.owner.ensure()
    void pending.catch(() => {}) // 预挂 handler，避免 unhandled rejection 噪音
    await flush()
    expect(box.cli.issuePat).toHaveBeenCalledOnce() // 换发已挂起
    box.owner.dispose() // logout：递增代次 + 清定时器
    resolveIssue({ pat: 'pat-late', expiresAt: START_MS + EXPIRES_IN_MS }) // 迟到的结果
    // 代次检查点丢弃：不发布、不调度，以 staleError 拒绝（登录中即 logout 的窗口）
    await expect(pending).rejects.toMatchObject({ code: 'REF_CONFLICT' })
    expect(box.creds.calls.set).not.toHaveBeenCalled() // set 调用次数不变（0）
    expect(box.creds.calls.unset).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0) // 迟到结果不再排续期
    expect(box.owner.state()).toEqual({ kind: 'none' })
    expect(box.owner.current()).toBeUndefined()
    // dispose 后不再接受新 ensure
    await expect(box.owner.ensure()).rejects.toMatchObject({ code: 'REF_CONFLICT' })
  })

  it('单飞：并发 ensure() 共享同一 pending promise；完成后自清可再次发起', async () => {
    const box = makeOwner()
    let resolveIssue!: (lease: PatLease) => void
    box.cli.issuePat.mockImplementationOnce(
      () =>
        new Promise<PatLease>((resolve) => {
          resolveIssue = resolve
        }),
    )
    const p1 = box.owner.ensure()
    const p2 = box.owner.ensure()
    expect(p1).toBe(p2) // 第二章调用拿到同一个 promise
    await flush()
    expect(box.cli.issuePat).toHaveBeenCalledOnce() // 只发一次请求
    resolveIssue({ pat: 'pat-single', expiresAt: START_MS + EXPIRES_IN_MS })
    await expect(p1).resolves.toMatchObject({ pat: 'pat-single' })
    // 完成后 pending 自清：再次 ensure 发起新一轮（新 promise、新请求）
    box.cli.issuePat.mockResolvedValueOnce({ pat: 'pat-second', expiresAt: START_MS + 2 * EXPIRES_IN_MS })
    const p3 = box.owner.ensure()
    expect(p3).not.toBe(p1)
    await expect(p3).resolves.toMatchObject({ pat: 'pat-second' })
    expect(box.cli.issuePat).toHaveBeenCalledTimes(2)
  })
})

describe('日志锚点（H2 / 任务 8.2：owner 侧 pat_issued 与 pat_refresh_deferred）', () => {
  it('发布成功打 pat_issued expiresAt=（ISO）；续期定时器排定打 pat_refresh_deferred at=（ISO）；两行均不含 PAT 值', async () => {
    const box = makeOwner()
    await box.owner.ensure()
    expect(box.log.info).toHaveBeenCalledWith(`pat_issued expiresAt=${new Date(START_MS + EXPIRES_IN_MS).toISOString()}`)
    expect(box.log.info).toHaveBeenCalledWith(`pat_refresh_deferred at=${new Date(START_MS + EXPIRES_IN_MS - LEAD_MS).toISOString()}`)
    // D-12：锚点行只带时刻，PAT 值永不进日志。
    for (const call of vi.mocked(box.log.info).mock.calls) {
      expect(String(call[0])).not.toContain('pat-ok')
    }
  })

  it('clamp 生效时 at 取 clamp 后的真实目标时刻（租约效期 < leadMs → 目标 = now + MIN_RETRY_MS）', async () => {
    const box = makeOwner()
    box.cli.issuePat.mockResolvedValueOnce({ pat: 'pat-short', expiresAt: START_MS + 60_000 })
    await box.owner.ensure()
    expect(box.log.info).toHaveBeenCalledWith(`pat_refresh_deferred at=${new Date(START_MS + MIN_RETRY_MS).toISOString()}`)
  })
})
