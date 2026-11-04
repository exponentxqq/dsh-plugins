/**
 * 登录 grant 记录：常量、形状、解析与补写（H9；§3.3）。
 *
 * 本模块是凭据记录的**唯一读写封装**：`LOGIN_RECORD_KEY` / `PAT_REF` 两个凭据
 * 地址常量、grant payload v1 的类型与解析（{@link parseGrant}）、以及登录后的
 * 两条补写路径（{@link patchGrant} / {@link patchGrantKeyId}——经
 * `credentials.modifyRecord` 读-改-写）。
 *
 * 结构性红线（T3 出口验证句）：**本文件不出现任何网络通道调用**——记录模块只
 * 读写凭据，不碰网络（D-6：换 PAT 的 HTTP 全程在 `modifyRecord` 之外，mutate
 * 内零 await 网络，避免并发 `session.commit()` 撞 2s 写锁）。
 *
 * 机密纪律（D-12）：grant 的 `jwt` 绝不进日志/错误文案；PAT 永不进记录（只进
 * {@link PAT_REF}）。解析失败一律返回 `undefined` 并 `log.warn`（文案只含键名
 * 与原因），**不抛**——坏记录不能把 status 渲染或装配流程打挂。
 *
 * @module dsh-plugin-zcode-plan/host/credential-record
 */

import { credentialKey, credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey, CredentialRecord, CredentialRef, GrantRecord } from '@deepseek-ai/dsh-credentials/types'
import type { CredentialsPort, LogPort } from './ports.ts'

/**
 * grant 记录的凭据地址（§3.3）：scope = 插件注册名 `zcode-plan`（记录的 owner
 * 语法要求），id = 本插件自己的编址单元 `bigmodel-login`。模块加载即用上游
 * `credentialKey` 校验并品牌化——两个段都不合语法会在加载期直接抛（fail-fast）。
 */
export const LOGIN_RECORD_KEY: CredentialKey = credentialKey('zcode-plan', 'bigmodel-login')

/**
 * PAT 引用名（§3.3 / D-4）：PAT 只进这个 ref（`set`/`unset`），**永不进记录/
 * 日志**。PAT owner 的发布动作是唯一 `set` 路径（H11）。
 */
export const PAT_REF: CredentialRef = credentialRef('ZCODE_PLAN_PAT')

/** grant payload 版本（§3.3：v1）。 */
export const GRANT_VERSION = 1

/**
 * 本地存储层的 source 标识（§3.3：dsh-credentials-local 存储层报 `file`）。
 * `describe(PAT_REF)` 见到 `configured && source !== 'file'` 即外部来源
 * （env / project-env / user-env）供值 → 冲突。
 */
export const PAT_FILE_SOURCE = 'file'

/**
 * grant payload v1（§3.3 逐字形状）：机密只有 `jwt` 一项，其余是定位元数据。
 *
 * RE-5 修正：JWT 实测**无 exp**（三段式但 payload 不含 exp），`jwtExpiresAt`
 * **恒省略、不写入**——{@link parseGrant} 不产出该字段，补写路径合并时也会
 * 剔除它；其他模块不得依赖本字段。
 */
export interface LoginGrant {
  readonly v: 1
  /** 登录 JWT（管理面唯一凭据）；绝不进日志/错误/ref。 */
  readonly jwt: string
  /** 组织 id（Config 填入，RE-2：平台无自动发现）。 */
  readonly organization?: string
  /** 项目 id（同上）。 */
  readonly project?: string
  /** 桥接 Key 的 id（非 secret；client 列 Key 的 `apiKey` 字段）。 */
  readonly keyId?: string
  /** 登录成功时刻（epoch ms）。 */
  readonly loginAt: number
  /** 【RE-5：JWT 实测无 exp，本字段恒省略，不写入；仅为形状完整保留】 */
  readonly jwtExpiresAt?: number
  /** 最近一次 PAT 的绝对到期时刻（epoch ms；仅状态显示用）。 */
  readonly patExpiresAt?: number
}

/** 登录态（§3.5 状态机第一级；status 渲染的读数来源）。 */
export type LoginState = { kind: 'absent' } | { kind: 'present'; grant: LoginGrant; jwtExpiresAt?: number }

/**
 * 允许补写的字段（§3.3 写入路径：保留 `jwt` 与身份字段，只改目标键）。
 * `keyId` 由 {@link patchGrantKeyId} 补；`patExpiresAt` 由 PAT owner 发布成功后补。
 */
export type GrantPatch = Partial<Pick<LoginGrant, 'keyId' | 'patExpiresAt'>>

/**
 * {@link patchGrant} / {@link patchGrantKeyId} 的第一参（H9 记名 `ctx`）：
 * 宿主上下文的窄面——真 Context 与测试的 `{ credentials: fakePort }` 包装都
 * 满足；本模块只摸 `ctx.credentials`，不依赖 cordis 的其余成员。
 */
export interface CredentialsHost {
  credentials: CredentialsPort
}

/** 对象判定（payload 收紧用）：排除 null 与数组。 */
function isPayloadObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 有限数字判定：NaN / Infinity 一律当字段缺失处理。 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 非空字符串判定。 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * 从存储的凭据记录解析 grant payload（H9）。
 *
 * 校验链：记录存在且 `kind === 'grant'` → payload 是对象 → `v === GRANT_VERSION`
 * → `jwt` 非空字符串 → `loginAt` 有限数字 → 其余字段（存在时）类型收紧。任何
 * 一条不过：`log.warn` 一行（只含键名与原因，**绝不回显 jwt 值**）并返回
 * `undefined`，**不抛**。记录缺失（尚未登录）是正常态：静默返回 `undefined`，
 * 不算「非法」、不 warn。
 *
 * 返回值是**收紧后的新对象**（只拷贝已知字段，丢弃 payload 里的多余键）；
 * RE-5：`jwtExpiresAt` 即使在旧记录里也不拷贝（恒省略，不透传）。
 *
 * @param record - `credentials.readRecord(key)` 的读数；`undefined` = 尚无记录。
 * @param log - 可选诊断出口；省略时校验失败同样返回 `undefined`（只少一行 warn）。
 */
export function parseGrant(record: CredentialRecord | undefined, log?: LogPort): LoginGrant | undefined {
  if (record === undefined) return undefined
  if (record.kind !== 'grant') {
    log?.warn(`登录记录（zcode-plan/bigmodel-login）不是 grant 记录（kind=${record.kind}），已忽略`)
    return undefined
  }
  const payload = record.payload
  if (!isPayloadObject(payload)) {
    log?.warn('登录记录 payload 不是对象，已忽略')
    return undefined
  }
  const warnInvalid = (reason: string): undefined => {
    log?.warn(`登录记录 payload 不合法（${reason}），已忽略`)
    return undefined
  }
  if (payload.v !== GRANT_VERSION) return warnInvalid(`v=${String(payload.v)} 不是 ${GRANT_VERSION}`)
  const jwt = payload.jwt
  if (!isNonEmptyString(jwt)) return warnInvalid('jwt 不是非空字符串')
  const loginAt = payload.loginAt
  if (!isFiniteNumber(loginAt)) return warnInvalid('loginAt 不是有限数字')
  // 可选字段逐个收紧（存在时必须类型正确）；RE-5：jwtExpiresAt 不读不透传。
  const organization = payload.organization
  if (organization !== undefined && !isNonEmptyString(organization)) return warnInvalid('organization 类型漂移')
  const project = payload.project
  if (project !== undefined && !isNonEmptyString(project)) return warnInvalid('project 类型漂移')
  const keyId = payload.keyId
  if (keyId !== undefined && !isNonEmptyString(keyId)) return warnInvalid('keyId 类型漂移')
  const patExpiresAt = payload.patExpiresAt
  if (patExpiresAt !== undefined && !isFiniteNumber(patExpiresAt)) return warnInvalid('patExpiresAt 类型漂移')
  return {
    v: GRANT_VERSION,
    jwt,
    loginAt,
    ...(organization !== undefined && { organization }),
    ...(project !== undefined && { project }),
    ...(keyId !== undefined && { keyId }),
    ...(patExpiresAt !== undefined && { patExpiresAt }),
  }
}

/**
 * 把补写字段合并进 grant，产出要写回的记录（mutate 内的纯合并，无任何 I/O）。
 *
 * 以 `parseGrant` 收紧过的对象为底（多余键已剥掉），展开 patch 后**剔除值为
 * `undefined` 的键**再落盘——RE-5 的兜底：`jwtExpiresAt` 永远不会被写进记录。
 */
function mergeGrant(grant: LoginGrant, patch: GrantPatch): GrantRecord {
  const draft: Record<string, unknown> = { ...grant, ...patch }
  for (const key of Object.keys(draft)) {
    if (draft[key] === undefined) delete draft[key]
  }
  return { kind: 'grant', payload: draft }
}

/**
 * 读登录记录并解析（读 = `readRecord` + {@link parseGrant} 的组合便利）。
 *
 * @param credentials - credentials 窄面。
 * @param key - 记录地址（装配传 {@link LOGIN_RECORD_KEY}，owner 传 deps.recordKey）。
 * @param log - 可选诊断出口（透传给 {@link parseGrant}）。
 */
export async function readGrant(
  credentials: CredentialsPort,
  key: CredentialKey,
  log?: LogPort,
): Promise<LoginGrant | undefined> {
  return parseGrant(await credentials.readRecord(key), log)
}

/**
 * grant 补写（通用形态）：`modifyRecord` 读-改-写（§3.3 写入路径）。
 *
 * mutate 闭包是**同步纯函数**：读独占锁下的最新 `current` → 解析 → 合并 → 返回
 * 下一份记录；**内中零 await、零网络**（D-6）。记录缺失或解析失败时 mutate 原
 * 样返回 `current`（seam 不会重写未变化的记录）——补写路径不负责首次提交
 * （登录成功由 flow 的 `session.commit` 落首份记录）。
 *
 * @param ctx - 宿主上下文窄面（只摸 `ctx.credentials`）。
 * @param key - 记录地址。
 * @param patch - 目标键与新值（仅 `keyId` / `patExpiresAt`）。
 * @returns 写回后的 grant；记录缺失/解析失败/写后仍解析不出时为 `undefined`。
 */
export async function patchGrant(
  ctx: CredentialsHost,
  key: CredentialKey,
  patch: GrantPatch,
): Promise<LoginGrant | undefined> {
  const updated = await ctx.credentials.modifyRecord(key, (current) => {
    const grant = parseGrant(current)
    const next = grant === undefined ? current : mergeGrant(grant, patch)
    return Promise.resolve(next)
  })
  return updated === undefined ? undefined : parseGrant(updated)
}

/**
 * 补写 `keyId`（H9 的具名形态；owner 在 find-or-create 桥接 Key 后调用）。
 * `keyId` 非 secret（E3：Key Secret 创建后即丢弃），可落记录。
 */
export function patchGrantKeyId(
  ctx: CredentialsHost,
  key: CredentialKey,
  keyId: string,
): Promise<LoginGrant | undefined> {
  return patchGrant(ctx, key, { keyId })
}

/**
 * PAT ref 冲突判据（§3.3 / R10）：`configured && source !== 'file'` 说明
 * `ZCODE_PLAN_PAT` 被环境/项目层供值 → 拒绝发布（`BridgeError('REF_CONFLICT')`）。
 * 本任务只导出工具；启动检测（读 `describe` 并点名）归 T4。
 */
export function isPatRefConflict(info: { configured: boolean; source?: string }): boolean {
  return info.configured && info.source !== PAT_FILE_SOURCE
}

/**
 * 构造登录态（§3.5 第一级）：无记录 → `absent`；有 grant → `present`。
 * RE-5：`jwtExpiresAt` 恒 `undefined`（grant 本身不含该字段）。
 */
export function toLoginState(grant: LoginGrant | undefined): LoginState {
  return grant === undefined ? { kind: 'absent' } : { kind: 'present', grant, jwtExpiresAt: grant.jwtExpiresAt }
}
