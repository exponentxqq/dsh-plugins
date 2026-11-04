/**
 * status 渲染层（H13；code-design §3.9 五段文本 + §3.4 用量两档只读解析）。
 *
 * 本模块把「/zcode-plan status」的文本渲染收口为三件事：
 * - {@link renderStatus}：**纯同步**的五段渲染（登录 / Key / PAT / 路由 / 用量 /
 *   备注），输入是 {@link StatusSnapshot} 快照——快照由装配层（host/index.ts 的
 *   `collectStatus`）采集，本模块不做任何 IO；
 * - {@link readUsage}：quota/limit 的**只读**读取（经注入的 client + clock），
 *   `limits[]` 原样透出的两档在此解析收紧：`unit===3`（5h 窗口）与 `unit===6`
 *   （周额度）**都展示**（缺一周额度读数会漏报「窗口有余、周额度已尽」的限流
 *   形态）；任何失败降级成 `{kind:'error', code}` 一行说明，**不抛**；
 * - {@link readRouteState}：llm 目录的**两读**状态（`listProviders()` → 已注册；
 *   `listConfigurableProviders()` → 已声明未注册的 dormant 形态）。
 *
 * 时间与用量的格式化全部是小纯函数（{@link formatFullTime} / {@link formatClockTime} /
 * {@link formatWeekTime} / {@link formatRemaining} / {@link parseUsageLimits}），测试
 * 直接喂定值断言。
 *
 * RE 修正落点：
 * - RE-5：登录 JWT 实测无 exp（grant 恒不含 `jwtExpiresAt`）→ 登录段**不显示
 *   JWT 到期**，也不伪造日期；仅当旧记录真的带了该字段时才如实渲染；
 * - RE-2：org / proj 来自 Config（读数入参的 grant 已由装配层按 Config 填好）；
 * - 红线（D-12）：本模块产出的任何一行都不含 JWT / PAT / Key 明文——Key 段只出
 *   keyId 的前 8 位（keyId 非 secret，E3），PAT 段只出时刻与状态。
 *
 * @module dsh-plugin-zcode-plan/host/status
 */

import { KEY_USAGE_SCENE } from './bigmodel/endpoints.ts'
import type { BigmodelClient } from './bigmodel/client.ts'
import type { SigningStatus } from './bigmodel/signer.ts'
import type { LoginGrant } from './credential-record.ts'
import { BridgeError } from './errors.ts'
import { KEY_NAME, type KeyState } from './key-manager.ts'
import type { PatState } from './pat-owner.ts'
import { ROUTE_ID, ZCODE_PLAN_ROUTE } from './route-config.ts'
import type { ClockPort } from './ports.ts'

/** 路由段展示的模型清单（单一真源的 models id 列，`已注册（…）` 的括号内容）。 */
const ROUTE_MODEL_LIST = ZCODE_PLAN_ROUTE.models.map((model) => model.id).join(', ')

/** `HH:mm` 的两位补齐。 */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 本地完整时刻（`YYYY-MM-DD HH:mm`；模板「JWT 到期 2026-12-01 09:00」与首行
 * 「读数 <本地时刻>」的口径）。
 */
export function formatFullTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 本地钟点（`HH:mm`；PAT 到期与窗口重置时刻的口径）。 */
export function formatClockTime(ms: number): string {
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 本地星期 + 钟点（`周X HH:mm`；周额度重置时刻的口径）。 */
export function formatWeekTime(ms: number): string {
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(ms).getDay()] ?? '日'
  return `周${weekday} ${formatClockTime(ms)}`
}

/**
 * 剩余时间的紧凑口径（模板「剩 27d」「剩 4h10m」）：
 * `≥1d → "Nd"`；`≥1h → "Nh Nm"`（紧凑 `4h10m`）；`<1h → "Nm"`；`≤0 → 已过期`。
 */
export function formatRemaining(deltaMs: number): string {
  if (deltaMs <= 0) return '已过期'
  const totalSeconds = Math.floor(deltaMs / 1_000)
  const days = Math.floor(totalSeconds / 86_400)
  if (days >= 1) return `${days}d`
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  if (hours >= 1) return `${hours}h${minutes}m`
  return `${minutes}m`
}

/** 宽容解析一个「epoch 时刻」字段：数字按 秒/毫秒 兜底（>1e12 视为已是毫秒），字符串按 `Date.parse`。 */
function parseEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? value : value * 1_000
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** 一档用量的收紧读数（§3.4 行字段：`{unit, number, currentValue, remaining, percentage, nextResetTime}`）。 */
export interface UsageWindow {
  /** 额度总量（响应 `number` 字段）。 */
  readonly total: number
  /** 已用量（响应 `currentValue` 字段）。 */
  readonly used: number
  /** 百分数（响应 `percentage`；缺失时渲染按 used/total 自算）。 */
  readonly percentage?: number
  /** 重置时刻（epoch ms；`nextResetTime` 宽容解析，解析不出则省略）。 */
  readonly resetAt?: number
}

/** {@link parseUsageLimits} 的产物：两档各自可选（服务端可能只回一档）。 */
export interface ParsedUsageLimits {
  readonly fiveHour?: UsageWindow
  readonly weekly?: UsageWindow
}

/**
 * 把 quota/limit 的 `limits[]` 原样行收紧成两档（H13 逐字：`unit===3` → 5h 窗口、
 * `unit===6` → 周额度，**两档都收**；其余 unit 忽略）。行缺 `number` /
 * `currentValue`（类型漂移或非有限数字）即整行丢弃，不产半档读数。
 */
export function parseUsageLimits(limits: readonly unknown[]): ParsedUsageLimits {
  const result: { fiveHour?: UsageWindow; weekly?: UsageWindow } = {}
  for (const row of limits) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
    const record = row as Record<string, unknown>
    const slot = record.unit === 3 ? 'fiveHour' : record.unit === 6 ? 'weekly' : undefined
    if (slot === undefined) continue
    const total = record.number
    const used = record.currentValue
    if (typeof total !== 'number' || !Number.isFinite(total)) continue
    if (typeof used !== 'number' || !Number.isFinite(used)) continue
    const percentage = typeof record.percentage === 'number' && Number.isFinite(record.percentage) ? record.percentage : undefined
    const resetAt = parseEpochMs(record.nextResetTime)
    result[slot] = {
      total,
      used,
      ...(percentage !== undefined && { percentage }),
      ...(resetAt !== undefined && { resetAt }),
    }
  }
  return result
}

/** 用量快照（status 用量段的读数来源）：ok 携带两档（各自可选）+ 读数时刻；error 携带码。 */
export type UsageSnapshot =
  | { readonly kind: 'ok'; readonly fiveHour?: UsageWindow; readonly weekly?: UsageWindow; readonly readAt: number }
  | { readonly kind: 'error'; readonly code: string }

/**
 * 只读一次用量（H13 `readUsage(client, grant)`；失败降级、不抛）：
 * - grant 缺 `organization` / `project`（RE-2 身份不齐）或 jwt 为空 → 降级
 *   `{kind:'error', code:'AUTH_STATE'}`，**不发请求**；
 * - 成功 → 解析两档 + 记下读数时刻（`readAt`，注入 clock 取值）；
 * - 失败 → `BridgeError` 取码表码，其余异常归 `unknown`——渲染层降级成一行说明，
 *   其余段照常。
 *
 * 本函数只读（GET quota/limit），零写路径、零状态缓存。
 */
export async function readUsage(
  client: BigmodelClient,
  grant: LoginGrant,
  clock: ClockPort,
  signal?: AbortSignal,
): Promise<UsageSnapshot> {
  const { jwt, organization, project } = grant
  if (jwt.length === 0 || organization === undefined || project === undefined) {
    return { kind: 'error', code: 'AUTH_STATE' }
  }
  try {
    const data = await client.readUsage({ jwt, organization, project, ...(signal !== undefined && { signal }) })
    const parsed = parseUsageLimits(data.limits)
    return {
      kind: 'ok',
      ...(parsed.fiveHour !== undefined && { fiveHour: parsed.fiveHour }),
      ...(parsed.weekly !== undefined && { weekly: parsed.weekly }),
      readAt: clock.now(),
    }
  } catch (error) {
    return { kind: 'error', code: error instanceof BridgeError ? error.code : 'unknown' }
  }
}

/**
 * status 侧 llm 目录窄面（H13 两读）：真实现是 `ctx.get('llm')` 的
 * `LlmRuntime`（两方法同为同步面，见 dsh-llm `types/index.d.ts:281,295`）；
 * 测试用自写 fake。结构类型，零上游 import。
 */
export interface StatusLlmPort {
  /** 已注册路由（adapter 已挂载）的元数据行。 */
  listProviders(): Array<{ id: string }>
  /** 已声明未注册（dormant）的可配置 provider 行。 */
  listConfigurableProviders(): Array<{ id: string }>
}

/** 路由显示态（路由段的读数）：`registered` = listProviders 命中；`declared` = listConfigurableProviders 命中。 */
export interface RouteDisplayState {
  readonly registered: boolean
  readonly declared: boolean
}

/**
 * 读路由状态（H13 `readRouteState(llm)` 两读、纯只读）：
 * - `listProviders()` 有 `zcode-plan` → 已注册；
 * - 否则 `listConfigurableProviders()` 有 → 已声明未注册（dormant 语义）；
 * - 两读都无 → 未安装。llm 缺席（宿主无 llm 服务）按未安装处理；
 * 任一读抛错按该读未命中处理（status 不因目录异常而整体失败）。
 */
export function readRouteState(llm: StatusLlmPort | undefined): RouteDisplayState {
  if (llm === undefined) return { registered: false, declared: false }
  let registered = false
  let declared = false
  try {
    registered = llm.listProviders().some((provider) => provider.id === ROUTE_ID)
  } catch {
    registered = false
  }
  if (typeof llm.listConfigurableProviders === 'function') {
    try {
      declared = llm.listConfigurableProviders().some((provider) => provider.id === ROUTE_ID)
    } catch {
      declared = false
    }
  }
  return { registered, declared }
}

/** status 快照（{@link renderStatus} 的输入；由装配层的采集器拼装，本模块不采集）。 */
export interface StatusSnapshot {
  /** 渲染时刻（epoch ms；首行「读数」与剩余时间/「刚刚」的基准）。 */
  readonly now: number
  /** 登录 grant（缺省 = 未登录；RE-5：grant 恒无 `jwtExpiresAt`）。 */
  readonly grant?: LoginGrant | undefined
  /** 桥接 Key 状态（key-manager 的 KeyState）。 */
  readonly key: KeyState
  /** PAT 状态（pat-owner 的 PatState）。 */
  readonly pat: PatState
  /** 续期提前量（毫秒；「下次续期 ≤」的估算基准，省略则不显示该片段）。 */
  readonly patRenewalLeadMs?: number
  /** PAT terminal 终止原因（halt 时备注段展示）。 */
  readonly haltReason?: { readonly code: string; readonly message: string } | undefined
  /** PAT_REF 外部冲突（装配层 R10 检测；备注段展示）。 */
  readonly refConflict?: { readonly source?: string } | undefined
  /** 路由两读结果（{@link readRouteState} 产物）。 */
  readonly route: RouteDisplayState
  /** 签名通道快照（signed-channel；`undefined` = 未装配——配置关闭或宿主缺通道）。 */
  readonly signing?: SigningStatus | undefined
  /** 用量快照（{@link readUsage} 产物；未登录时装配层给 `{kind:'error', code:'AUTH_STATE'}`）。 */
  readonly usage: UsageSnapshot
}

/** 登录段：未登录给提示；已登录按 RE-5 不显示 JWT 到期（旧记录真带 exp 时才如实渲染）。 */
function renderLoginLine(grant: LoginGrant | undefined, now: number): string {
  if (grant === undefined) return '  登录：未登录（运行 /zcode-plan login）'
  const expiresAt = grant.jwtExpiresAt
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > 0) {
    return `  登录：已登录 · JWT 到期 ${formatFullTime(expiresAt)}（剩 ${formatRemaining(expiresAt - now)}）`
  }
  return '  登录：已登录'
}

/** Key 段：ready 出名字 + scene + keyId 前 8 位（keyId 非 secret，E3）；其余形态一律「未知」。 */
function renderKeyLine(key: KeyState): string {
  if (key.kind === 'ready') {
    const id = key.keyId.length > 8 ? `${key.keyId.slice(0, 8)}…` : key.keyId
    return `  Key ：${KEY_NAME} · scene=${KEY_USAGE_SCENE} · id ${id}`
  }
  return '  Key ：未知（登录后自动 find-or-create）'
}

/** PAT 段四态（§3.9 模板）；「下次续期 ≤」取 `expiresAt - leadMs` 的上界（jitter 使实际时刻不晚于它）。 */
function renderPatLine(pat: PatState, now: number, leadMs: number | undefined): string {
  if (pat.kind === 'halted') return `  PAT ：已停止（${pat.code}）`
  if (pat.kind === 'none') return '  PAT ：无'
  if (pat.kind === 'expired' || pat.expiresAt <= now) return '  PAT ：已过期'
  const base = `  PAT ：有效 · 到期 ${formatClockTime(pat.expiresAt)}（剩 ${formatRemaining(pat.expiresAt - now)}）`
  if (typeof leadMs !== 'number' || !Number.isFinite(leadMs) || leadMs <= 0) return base
  const renewalAt = Math.max(pat.expiresAt - leadMs, now)
  return `${base} · 下次续期 ≤ ${formatClockTime(renewalAt)}`
}

/**
 * 路由段三态文本（导出给 `route status` 子命令复用，**无段缩进**）：已注册
 * （附模型清单）/ 已声明未注册 / 未安装（给行动提示）。
 */
export function renderRouteLine(route: RouteDisplayState): string {
  if (route.registered) return `路由：已注册（${ROUTE_MODEL_LIST}）`
  if (route.declared) return '路由：已声明未注册'
  return '路由：未安装（运行 /zcode-plan route install）'
}

/**
 * 签名通道行（signed-channel tasks 3.2）：四态单行——止损（警示 + 恢复方法）、
 * 未启用（配置关闭/未装配）、冷却中（自愈倒计时）、正常（缓存命中 + 上次结果）。
 * `lastResult` 是内部诊断串（不含机密），直接展示。
 */
export function renderSigningLine(signing: SigningStatus | undefined, now: number): string {
  if (signing === undefined) return '  签名：未启用（signing 配置关闭或未装配）'
  if (signing.degraded) {
    return `  签名：⚠ 止损中（连续失败 ${signing.consecutiveFailures}）· 运行 /zcode-plan refresh 恢复`
  }
  const cache = signing.cached ? '私钥缓存命中' : '私钥未握手'
  const cooldown =
    signing.cooldownUntil > now ? ` · 冷却至 ${formatClockTime(signing.cooldownUntil)}（自动自愈）` : ''
  return `  签名：已启用 · ${cache} · 上次 ${signing.lastResult ?? '无请求'}${cooldown}`
}

/** 一档读数的展示行；缺档显示「无读数」，缺重置时刻则只展示用量与百分比。 */
function formatUsageWindow(label: string, win: UsageWindow | undefined, reset: (ms: number) => string): string {
  if (win === undefined) return `${label} 无读数`
  const raw = win.percentage ?? (win.total > 0 ? (win.used / win.total) * 100 : Number.NaN)
  const percentage = Number.isFinite(raw) ? `${Math.round(raw)}%` : '—'
  const base = `${label} ${Math.round(win.used)} / ${Math.round(win.total)}（${percentage}`
  return win.resetAt !== undefined ? `${base}，重置 ${reset(win.resetAt)}）` : `${base}）`
}

/** 用量段（导出供单测直接断言）：error 一行降级；ok 两档 + 读数时刻尾注。 */
export function renderUsageLine(usage: UsageSnapshot, now: number): string {
  if (usage.kind === 'error') {
    return `  用量：读取失败（${usage.code}），需登录态与 org/project`
  }
  const parts = [
    formatUsageWindow('5h 窗口', usage.fiveHour, formatClockTime),
    formatUsageWindow('周', usage.weekly, formatWeekTime),
  ]
  const diffMinutes = Math.floor((now - usage.readAt) / 60_000)
  const ago = diffMinutes < 1 ? '刚刚' : `${diffMinutes} 分钟前`
  return `  用量：${parts.join(' · ')}（读数 ${ago}，服务端聚合延迟 1–2 分钟）`
}

/** 备注段：halt 原因（码 + 已脱敏文案）优先，其次 REF_CONFLICT，都无则「无」。 */
function renderNoteLine(
  haltReason: { readonly code: string; readonly message: string } | undefined,
  refConflict: { readonly source?: string } | undefined,
): string {
  if (haltReason !== undefined) return `  备注：${haltReason.code}：${haltReason.message}`
  if (refConflict !== undefined) {
    return `  备注：REF_CONFLICT：ZCODE_PLAN_PAT 由外部来源（${refConflict.source ?? 'unknown'}）供值`
  }
  return '  备注：无'
}

/**
 * 渲染 §3.9 五段文本（H13 `renderStatus(snapshot)`；纯同步、零 IO、零状态）。
 *
 * 红线（D-12）：产出的每一行都不含 JWT / PAT / Key 明文——单测用真值夹具 +
 * `assertNoSecret` 断言。
 *
 * @param snapshot - 装配层采集的状态快照。
 * @returns 首行标题 + 五段（登录 / Key / PAT / 路由 / 用量 / 备注）的多行文本。
 */
export function renderStatus(snapshot: StatusSnapshot): string {
  const lines = [
    `zcode-plan 状态（读数 ${formatFullTime(snapshot.now)}）`,
    renderLoginLine(snapshot.grant, snapshot.now),
    renderKeyLine(snapshot.key),
    renderPatLine(snapshot.pat, snapshot.now, snapshot.patRenewalLeadMs),
    `  ${renderRouteLine(snapshot.route)}`,
    renderSigningLine(snapshot.signing, snapshot.now),
    renderUsageLine(snapshot.usage, snapshot.now),
    renderNoteLine(snapshot.haltReason, snapshot.refConflict),
  ]
  return lines.join('\n')
}
