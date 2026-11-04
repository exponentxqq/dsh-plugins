import type { BigmodelClient } from '../src/host/bigmodel/client.ts'
import { KEY_USAGE_SCENE } from '../src/host/bigmodel/endpoints.ts'
import type { SigningStatus } from '../src/host/bigmodel/signer.ts'
import type { LoginGrant } from '../src/host/credential-record.ts'
import { assertNoSecret, BridgeError } from '../src/host/errors.ts'
import { KEY_NAME } from '../src/host/key-manager.ts'
import type { ClockPort } from '../src/host/ports.ts'
import {
  formatClockTime,
  formatFullTime,
  formatRemaining,
  formatWeekTime,
  parseUsageLimits,
  readRouteState,
  readUsage,
  renderRouteLine,
  renderSigningLine,
  renderStatus,
  renderUsageLine,
  type StatusLlmPort,
  type StatusSnapshot,
} from '../src/host/status.ts'
import { describe, expect, it } from 'vitest'

/**
 * status 渲染层专属单测（X8；任务 8.2）：
 * - **五段齐全**：登录 / Key / PAT / 路由 / 用量 + 备注共 7 行，首行带本地读数时刻；
 * - **RE-5**：grant 无 `jwtExpiresAt` 时不出现假造日期（登录段无「JWT 到期」）；
 * - **PAT 四态**（valid / expired / none / halted）/ **Key 三态**（ready / unknown /
 *   creating 归「未知」）/ **路由三态**（已注册 / 已声明未注册 / 未安装）；
 * - **用量两档**（unit===3 → `5h 窗口`、unit===6 → `周`）与失败降级（`读取失败（码）`
 *   一行、其余段照常）；percentage 缺失按 used/total 自算；
 * - **红线反向断言（D-12）**：渲染文本 `not.toContain` JWT / PAT / Key 真值的字面断言；
 * - 格式化纯函数矩阵与 `parseUsageLimits` / `readRouteState` / `readUsage` 的收窄行为。
 *
 * 与 commands.test.ts 的分工：该文件从命令面覆盖 status 的装配链路（handler →
 * renderStatus），本文件只对 status.ts 的纯渲染与只读读取面做矩阵化直测，互不替代。
 */

/** 固定「当前时刻」（本地 2026-03-15 10:00）：展示时刻经 format* 表达式换算、剩余时间是纯差值断言，全文件时区无关。 */
const NOW = new Date(2026, 2, 15, 10, 0).getTime()

/** 续期提前量（Config `refreshLeadMs`，官方贴 120s）。 */
const LEAD_MS = 120_000

/** 红线夹具（D-12）：三个真值形态不得出现在任何渲染文本里。 */
const JWT_FIXTURE = 'eyJhbGciOiJIUzI1NiJ9.FAKE.SIG'
const PAT_FIXTURE = 'pat-FAKE-SECRET-VALUE'
const KEY_SECRET_FIXTURE = 'bm-key-FAKE-SECRET-0000'

/** Key id 夹具（非 secret，E3：允许展示前 8 位；整值只进快照、不进渲染）。 */
const KEY_ID_FIXTURE = 'a1b2c3d4e5f6a7b8c9d0e1f2'

/** grant 夹具（RE-5：恒不带 `jwtExpiresAt`）。 */
function makeGrant(overrides: Partial<LoginGrant> = {}): LoginGrant {
  return { v: 1, jwt: JWT_FIXTURE, organization: 'org-8', project: 'proj-8', loginAt: NOW - 3_600_000, ...overrides }
}

/** PAT 有效租约的到期时刻（效期 4h10m：「剩 4h10m」与「下次续期 ≤ 到期-leadMs」的基准）。 */
const PAT_EXPIRES_AT = NOW + 4 * 3_600_000 + 10 * 60_000

/** status 快照夹具（已登录 + Key ready + PAT 有效带 lead + 路由已注册 + 用量两档齐全）。 */
function makeSnapshot(overrides: Partial<StatusSnapshot> = {}): StatusSnapshot {
  return {
    now: NOW,
    grant: makeGrant(),
    key: { kind: 'ready', keyId: KEY_ID_FIXTURE },
    pat: { kind: 'valid', expiresAt: PAT_EXPIRES_AT },
    patRenewalLeadMs: LEAD_MS,
    route: { registered: true, declared: false },
    usage: {
      kind: 'ok',
      fiveHour: { total: 28_000, used: 3_120, percentage: 11.14, resetAt: NOW + 30 * 60_000 },
      weekly: { total: 140_000, used: 18_200, percentage: 13, resetAt: NOW + 7 * 86_400_000 },
      readAt: NOW,
    },
    ...overrides,
  }
}

/** 假 llm 目录：两读各自可控（registeredIds / declaredIds）。 */
function makeFakeLlm(registeredIds: readonly string[] = [], declaredIds: readonly string[] = []): StatusLlmPort {
  return {
    listProviders: () => registeredIds.map((id) => ({ id })),
    listConfigurableProviders: () => declaredIds.map((id) => ({ id })),
  }
}

/** 假 bigmodel client：只造 readUsage 一面（其余方法零调用，由 `as unknown` 兜形状）。 */
function fakeClient(readUsageFn: () => Promise<{ level?: number; limits: readonly unknown[] }>): BigmodelClient {
  return { readUsage: readUsageFn } as unknown as BigmodelClient
}

/** 注入用假时钟（readUsage 只消费 `now`）。 */
const fakeClock: ClockPort = { now: () => NOW, setTimeout: () => 0, clearTimeout: () => undefined }

describe('renderStatus 五段齐全（X8 主链）', () => {
  it('8 行逐行锁定：首行读数时刻 + 登录/Key/PAT/路由/签名/用量/备注七行；RE-5 不出现「JWT 到期」', () => {
    const text = renderStatus(makeSnapshot())
    const lines = text.split('\n')
    expect(lines).toHaveLength(8)
    expect(lines[0]).toBe(`zcode-plan 状态（读数 ${formatFullTime(NOW)}）`)
    expect(lines[1]).toBe('  登录：已登录')
    expect(lines[2]).toBe(`  Key ：${KEY_NAME} · scene=${KEY_USAGE_SCENE} · id ${KEY_ID_FIXTURE.slice(0, 8)}…`)
    expect(lines[3]).toBe(
      `  PAT ：有效 · 到期 ${formatClockTime(PAT_EXPIRES_AT)}（剩 4h10m） · 下次续期 ≤ ${formatClockTime(PAT_EXPIRES_AT - LEAD_MS)}`,
    )
    expect(lines[4]).toBe('  路由：已注册（glm-5.3, glm-5.3-flash）')
    expect(lines[5]).toBe('  签名：未启用（signing 配置关闭或未装配）')
    expect(lines[6]).toContain(`  用量：5h 窗口 3120 / 28000（11%，重置 ${formatClockTime(NOW + 30 * 60_000)}）`)
    expect(lines[6]).toContain(`· 周 18200 / 140000（13%，重置 ${formatWeekTime(NOW + 7 * 86_400_000)}）`)
    expect(lines[6]).toContain('（读数 刚刚，服务端聚合延迟 1–2 分钟）')
    expect(lines[7]).toBe('  备注：无')
    // RE-5：grant 无 jwtExpiresAt → 不出现假造的 JWT 到期日期。
    expect(text).not.toContain('JWT 到期')
  })

  it('RE-5 对照：旧记录真带 jwtExpiresAt 时如实渲染（不伪造也不隐藏）', () => {
    const text = renderStatus(makeSnapshot({ grant: makeGrant({ jwtExpiresAt: NOW + 27 * 86_400_000 }) }))
    expect(text).toContain('JWT 到期 ')
    expect(text).toContain('（剩 27d）')
  })
})

describe('签名通道行（signed-channel tasks 3.2）', () => {
  /** 正常态夹具（缓存命中、零失败）。 */
  const signingOk: SigningStatus = {
    cached: true,
    degraded: false,
    consecutiveFailures: 0,
    cooldownUntil: 0,
    lastHandshakeAt: NOW - 60_000,
    lastResult: 'signed',
    credentialFingerprint: 'signer-key-id:abcd1234',
    counters: { signedOk: 3, handshakeFailed: 0, resignFailed: 0, degradedUnsigned: 0, degradedRejected: 0 },
  }

  it('正常态：已启用 · 缓存命中 · 上次结果', () => {
    expect(renderSigningLine(signingOk, NOW)).toBe('  签名：已启用 · 私钥缓存命中 · 上次 signed')
  })

  it('冷却中：附自愈倒计时（不到止损不警示）', () => {
    const cooling: SigningStatus = { ...signingOk, cached: false, cooldownUntil: NOW + 30_000 }
    const line = renderSigningLine(cooling, NOW)
    expect(line).toContain(`  签名：已启用 · 私钥未握手 · 上次 signed · 冷却至 ${formatClockTime(NOW + 30_000)}（自动自愈）`)
    expect(line).not.toContain('⚠')
  })

  it('止损态：⚠ 警示 + 连续失败数 + 恢复方法', () => {
    const degraded: SigningStatus = { ...signingOk, degraded: true, consecutiveFailures: 3 }
    const line = renderSigningLine(degraded, NOW)
    expect(line).toContain('  签名：⚠ 止损中（连续失败 3）')
    expect(line).toContain('/zcode-plan refresh')
  })

  it('未装配（undefined）：未启用行', () => {
    expect(renderSigningLine(undefined, NOW)).toBe('  签名：未启用（signing 配置关闭或未装配）')
  })

  it('集成：snapshot 携带 signing 快照时路由段后渲染签名行', () => {
    const text = renderStatus(makeSnapshot({ signing: signingOk }))
    const lines = text.split('\n')
    expect(lines[5]).toBe('  签名：已启用 · 私钥缓存命中 · 上次 signed')
    expect(lines).toHaveLength(8)
  })
})

describe('PAT 四态', () => {
  it('valid 缺 patRenewalLeadMs：保留「到期（剩 …）」、省略「下次续期」', () => {
    const text = renderStatus(makeSnapshot({ patRenewalLeadMs: undefined }))
    expect(text).toContain('  PAT ：有效 · 到期 ')
    expect(text).toContain('（剩 4h10m）')
    expect(text).not.toContain('下次续期')
  })

  it('expired：已过期', () => {
    expect(renderStatus(makeSnapshot({ pat: { kind: 'expired' } }))).toContain('  PAT ：已过期')
  })

  it('valid 但时刻已过：渲染层兜底为已过期', () => {
    expect(renderStatus(makeSnapshot({ pat: { kind: 'valid', expiresAt: NOW - 1_000 } }))).toContain('  PAT ：已过期')
  })

  it('none：无', () => {
    expect(renderStatus(makeSnapshot({ pat: { kind: 'none' } }))).toContain('  PAT ：无')
  })

  it('halted：含码', () => {
    expect(renderStatus(makeSnapshot({ pat: { kind: 'halted', code: 'KEY_LOST' } }))).toContain('  PAT ：已停止（KEY_LOST）')
  })
})

describe('Key 三态', () => {
  it('ready：名字 + scene + keyId 前 8 位（恰 8 位不出现省略号）', () => {
    const text = renderStatus(makeSnapshot({ key: { kind: 'ready', keyId: '12345678' } }))
    expect(text).toContain(`  Key ：${KEY_NAME} · scene=${KEY_USAGE_SCENE} · id 12345678`)
    expect(text).not.toContain('…')
  })

  it('unknown：未知（登录后自动 find-or-create）', () => {
    expect(renderStatus(makeSnapshot({ key: { kind: 'unknown' } }))).toContain('  Key ：未知（登录后自动 find-or-create）')
  })

  it('creating：渲染层无独立形态，归「未知」文案', () => {
    expect(renderStatus(makeSnapshot({ key: { kind: 'creating' } }))).toContain('  Key ：未知（登录后自动 find-or-create）')
  })
})

describe('路由三态', () => {
  it('renderRouteLine：已注册（含模型清单）/ 已声明未注册 / 未安装，单行逐字', () => {
    expect(renderRouteLine({ registered: true, declared: false })).toBe('路由：已注册（glm-5.3, glm-5.3-flash）')
    expect(renderRouteLine({ registered: false, declared: true })).toBe('路由：已声明未注册')
    expect(renderRouteLine({ registered: false, declared: false })).toBe('路由：未安装（运行 /zcode-plan route install）')
  })

  it('renderStatus 内五段缩进由渲染层统一补', () => {
    expect(renderStatus(makeSnapshot({ route: { registered: false, declared: true } }))).toContain('  路由：已声明未注册')
  })
})

describe('用量两档与失败降级（X8）', () => {
  it('两档：unit===3 与 unit===6 经 parseUsageLimits 收紧 → 文本同时含「5h 窗口」与「周 」', () => {
    const parsed = parseUsageLimits([
      { unit: 3, number: 28_000, currentValue: 3_120, percentage: 11.14, nextResetTime: NOW + 30 * 60_000 },
      { unit: 6, number: 140_000, currentValue: 18_200, percentage: 13, nextResetTime: NOW + 7 * 86_400_000 },
    ])
    const usage = {
      kind: 'ok' as const,
      ...(parsed.fiveHour !== undefined && { fiveHour: parsed.fiveHour }),
      ...(parsed.weekly !== undefined && { weekly: parsed.weekly }),
      readAt: NOW,
    }
    const text = renderStatus(makeSnapshot({ usage }))
    expect(text).toContain('5h 窗口')
    expect(text).toContain('周 ')
    expect(text).toContain(`5h 窗口 3120 / 28000（11%，重置 ${formatClockTime(NOW + 30 * 60_000)}）`)
    expect(text).toContain(`周 18200 / 140000（13%，重置 ${formatWeekTime(NOW + 7 * 86_400_000)}）`)
  })

  it('只含 unit===3：周档降级为「无读数」，5h 档照常', () => {
    const parsed = parseUsageLimits([{ unit: 3, number: 28_000, currentValue: 3_120 }])
    const usage = {
      kind: 'ok' as const,
      ...(parsed.fiveHour !== undefined && { fiveHour: parsed.fiveHour }),
      readAt: NOW,
    }
    const text = renderStatus(makeSnapshot({ usage }))
    expect(text).toContain('5h 窗口 3120 / 28000（11%）')
    expect(text).toContain('周 无读数')
  })

  it('percentage 缺失：按 used/total 自算取整', () => {
    const text = renderStatus(makeSnapshot({ usage: { kind: 'ok', fiveHour: { total: 10_000, used: 3_333 }, readAt: NOW } }))
    expect(text).toContain('5h 窗口 3333 / 10000（33%）')
  })

  it('total 为 0 的病态读数：百分比以 — 占位', () => {
    const text = renderStatus(makeSnapshot({ usage: { kind: 'ok', fiveHour: { total: 0, used: 0 }, readAt: NOW } }))
    expect(text).toContain('5h 窗口 0 / 0（—）')
  })

  it('用量失败降级：readUsage 捕获 HTTP:401 → 「读取失败（HTTP:401）」一行，其余段照常', async () => {
    const failing = fakeClient(async () => {
      throw new BridgeError('HTTP:401')
    })
    const snapshot401 = await readUsage(failing, makeGrant(), fakeClock)
    expect(snapshot401).toEqual({ kind: 'error', code: 'HTTP:401' })
    const text = renderStatus(makeSnapshot({ usage: snapshot401 }))
    expect(text).toContain('用量：读取失败（HTTP:401）')
    // 其余段照常：登录 / Key / PAT / 路由 / 备注全部在位。
    expect(text).toContain('  登录：已登录')
    expect(text).toContain('  Key ：')
    expect(text).toContain('  PAT ：有效')
    expect(text).toContain('  路由：已注册')
    expect(text).toContain('  备注：无')
  })

  it('renderUsageLine 降级行逐字（导出面，供 route/refresh 外的单测直断言）', () => {
    expect(renderUsageLine({ kind: 'error', code: 'HTTP:401' }, NOW)).toBe('  用量：读取失败（HTTP:401），需登录态与 org/project')
  })
})

describe('备注段', () => {
  it('haltReason 优先：同时有 REF_CONFLICT 时只出 halt 行', () => {
    const text = renderStatus(
      makeSnapshot({
        pat: { kind: 'halted', code: 'JWT_EXPIRED' },
        haltReason: { code: 'JWT_EXPIRED', message: '登录态已失效，请重新登录' },
        refConflict: { source: 'env' },
      }),
    )
    expect(text).toContain('  备注：JWT_EXPIRED：登录态已失效，请重新登录')
    expect(text).not.toContain('REF_CONFLICT：ZCODE_PLAN_PAT')
  })

  it('REF_CONFLICT：点名外部来源；来源缺省为 unknown', () => {
    expect(renderStatus(makeSnapshot({ refConflict: { source: 'env' } }))).toContain(
      '  备注：REF_CONFLICT：ZCODE_PLAN_PAT 由外部来源（env）供值',
    )
    expect(renderStatus(makeSnapshot({ refConflict: {} }))).toContain(
      '  备注：REF_CONFLICT：ZCODE_PLAN_PAT 由外部来源（unknown）供值',
    )
  })
})

describe('红线反向断言（D-12）', () => {
  it('完整快照的渲染文本不含 JWT / PAT / Key 真值（字面 not.toContain）', () => {
    const text = renderStatus(makeSnapshot())
    expect(text).not.toContain(JWT_FIXTURE)
    expect(text).not.toContain(PAT_FIXTURE)
    expect(text).not.toContain(KEY_SECRET_FIXTURE)
  })

  it('用量失败降级态的渲染文本同样不含真值；assertNoSecret 双保险', () => {
    const text = renderStatus(makeSnapshot({ usage: { kind: 'error', code: 'HTTP:401' } }))
    expect(text).not.toContain(JWT_FIXTURE)
    expect(text).not.toContain(PAT_FIXTURE)
    assertNoSecret(text, [JWT_FIXTURE, PAT_FIXTURE, KEY_SECRET_FIXTURE])
  })
})

describe('格式化纯函数', () => {
  it('formatRemaining：27d / 4h10m / 35m / 已过期', () => {
    expect(formatRemaining(27 * 86_400_000)).toBe('27d')
    expect(formatRemaining(4 * 3_600_000 + 10 * 60_000)).toBe('4h10m')
    expect(formatRemaining(35 * 60_000)).toBe('35m')
    expect(formatRemaining(0)).toBe('已过期')
    expect(formatRemaining(-60_000)).toBe('已过期')
  })

  it('formatFullTime / formatClockTime / formatWeekTime：本地字段拼接（2026-03-15 10:00 → 周日）', () => {
    const ms = new Date(2026, 2, 15, 10, 0).getTime()
    expect(formatFullTime(ms)).toBe('2026-03-15 10:00')
    expect(formatClockTime(ms)).toBe('10:00')
    expect(formatWeekTime(ms)).toBe('周日 10:00')
  })
})

describe('parseUsageLimits 宽容矩阵', () => {
  it('unit===3 / unit===6 各归一档；nextResetTime 宽容（ISO 字符串 / 毫秒 / 秒兜底）', () => {
    const parsed = parseUsageLimits([
      { unit: 3, number: 28_000, currentValue: 3_120, nextResetTime: '2026-03-15T10:30:00+08:00' },
      { unit: 6, number: 140_000, currentValue: 18_200, nextResetTime: NOW + 7 * 86_400_000 },
    ])
    expect(parsed.fiveHour).toEqual({ total: 28_000, used: 3_120, resetAt: new Date('2026-03-15T10:30:00+08:00').getTime() })
    expect(parsed.weekly).toEqual({ total: 140_000, used: 18_200, resetAt: NOW + 7 * 86_400_000 })
    const seconds = parseUsageLimits([{ unit: 3, number: 100, currentValue: 1, nextResetTime: 1_773_600_000 }])
    expect(seconds.fiveHour?.resetAt).toBe(1_773_600_000_000)
  })

  it('缺 number / currentValue / 非有限数字 / 类型漂移：整行丢弃，不产半档读数', () => {
    const parsed = parseUsageLimits([
      { unit: 3, currentValue: 5 },
      { unit: 3, number: 100 },
      { unit: 3, number: '100', currentValue: 5 },
      { unit: 6, number: Number.NaN, currentValue: 0 },
      { unit: 6, number: 100, currentValue: Number.NaN },
    ])
    expect(parsed.fiveHour).toBeUndefined()
    expect(parsed.weekly).toBeUndefined()
  })

  it('percentage 缺失省略字段；null / 非对象 / 数组行与其他 unit 忽略', () => {
    const parsed = parseUsageLimits([
      null,
      'oops',
      42,
      ['array'],
      { unit: 1, number: 9, currentValue: 1 },
      { unit: 4, number: 9, currentValue: 1 },
      { unit: 3, number: 100, currentValue: 25 },
    ])
    expect(parsed.fiveHour).toEqual({ total: 100, used: 25 })
    expect(parsed.weekly).toBeUndefined()
  })
})

describe('readRouteState（llm 两读）', () => {
  it('registered：listProviders 命中 zcode-plan', () => {
    expect(readRouteState(makeFakeLlm(['zai-coding-cn', 'zcode-plan']))).toEqual({ registered: true, declared: false })
  })

  it('declared：仅 listConfigurableProviders 命中（dormant 形态）', () => {
    expect(readRouteState(makeFakeLlm([], ['zcode-plan']))).toEqual({ registered: false, declared: true })
  })

  it('双命中：registered 与 declared 同时为 true', () => {
    expect(readRouteState(makeFakeLlm(['zcode-plan'], ['zcode-plan']))).toEqual({ registered: true, declared: true })
  })

  it('llm 缺席（undefined）：皆 false；两读抛错按未命中处理，不抛', () => {
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

  it('legacy 形状（无 listConfigurableProviders 方法）：declared=false', () => {
    const legacy = { listProviders: () => [{ id: 'zai-coding-cn' }] } as unknown as StatusLlmPort
    expect(readRouteState(legacy)).toEqual({ registered: false, declared: false })
  })
})
