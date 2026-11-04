import type { CredentialKey, CredentialRecord, GrantRecord } from '@deepseek-ai/dsh-credentials/types'
import { describe, expect, it, vi } from 'vitest'
import {
  GRANT_VERSION,
  isPatRefConflict,
  LOGIN_RECORD_KEY,
  parseGrant,
  patchGrant,
  patchGrantKeyId,
  PAT_FILE_SOURCE,
  PAT_REF,
  readGrant,
  toLoginState,
  type CredentialsHost,
} from '../src/host/credential-record.ts'
import type { CredentialsPort, LogPort } from '../src/host/ports.ts'

/**
 * 登录 grant 记录单测（X9）：解析收紧链、补写读-改-写、PAT ref 冲突判据与登录态。
 * 全部走假端口（内存版 CredentialsPort / spy LogPort），零网络、零宿主依赖。
 */

/** §3.3 合法 payload v1 夹具（含全部可选字段）。 */
const FULL_PAYLOAD = {
  v: GRANT_VERSION,
  jwt: 'jwt-fixture-abcd12345678',
  organization: 'org-1',
  project: 'proj-1',
  keyId: 'key-1',
  loginAt: 1_700_000_000_000,
  patExpiresAt: 1_700_003_600_000,
}

/** 构造 grant 记录（seam 不解读 payload，只透传）。 */
function grantRecord(payload: Record<string, unknown>): CredentialRecord {
  return { kind: 'grant', payload }
}

/** 三通道假日志（`warn` spy 供「不抛只 warn」断言）。 */
function makeLog(): LogPort {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

/**
 * 内存版假 CredentialsPort：只实现记录读写路径的最小面。
 * `modifyRecord` 照 seam 语义——mutate 返回 `current` 原样（===）即不重写存储。
 */
function makeFakeCredentials(initial?: CredentialRecord) {
  let stored: CredentialRecord | undefined = initial
  const mutateInputs: Array<CredentialRecord | undefined> = []
  const credentials: CredentialsPort = {
    resolve: async () => undefined,
    describe: async () => ({ configured: false, writable: true }),
    set: async () => {},
    unset: async () => {},
    readRecord: async () => stored,
    async modifyRecord(_key: CredentialKey, mutate) {
      mutateInputs.push(stored)
      const next = await mutate(stored)
      if (next !== stored) stored = next
      return stored
    },
    deleteRecord: async () => {},
  }
  return { credentials, readStored: (): CredentialRecord | undefined => stored, mutateInputs }
}

describe('凭据地址常量（§3.3 编址）', () => {
  it('LOGIN_RECORD_KEY / PAT_REF / GRANT_VERSION / PAT_FILE_SOURCE 与设计钉死值一致', () => {
    expect(String(LOGIN_RECORD_KEY)).toBe('zcode-plan/bigmodel-login')
    expect(String(PAT_REF)).toBe('ZCODE_PLAN_PAT')
    expect(GRANT_VERSION).toBe(1)
    expect(PAT_FILE_SOURCE).toBe('file')
  })
})

describe('parseGrant 解析收紧链（X9-1）', () => {
  it('合法 v1 payload（含全部可选字段）→ 收紧后的原样对象', () => {
    const log = makeLog()
    const grant = parseGrant(grantRecord(FULL_PAYLOAD), log)
    if (grant === undefined) throw new Error('合法 payload 不应解析失败')
    expect(grant).toEqual(FULL_PAYLOAD)
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('最小 payload（仅 v/jwt/loginAt）→ 精确键集，多余键被剥掉', () => {
    const grant = parseGrant(grantRecord({ v: GRANT_VERSION, jwt: 'jwt-min', loginAt: 1, extra: '多余键' }))
    if (grant === undefined) throw new Error('最小 payload 不应解析失败')
    expect(grant).toEqual({ v: GRANT_VERSION, jwt: 'jwt-min', loginAt: 1 })
    expect(Object.keys(grant)).toEqual(['v', 'jwt', 'loginAt'])
  })

  it('记录缺失（undefined）→ undefined 且静默：正常态不算非法、不 warn', () => {
    const log = makeLog()
    expect(parseGrant(undefined, log)).toBeUndefined()
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('非 grant 记录（kind=api-key）→ undefined + warn 一行', () => {
    const log = makeLog()
    const record: CredentialRecord = { kind: 'api-key', key: 'sk-fixture' }
    expect(parseGrant(record, log)).toBeUndefined()
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('不是 grant 记录'))
  })

  it('payload 不是对象（数组 / null / 字符串）→ undefined + warn', () => {
    for (const payload of [['不是对象'], null, '字符串']) {
      const log = makeLog()
      expect(parseGrant(grantRecord(payload as unknown as Record<string, unknown>), log)).toBeUndefined()
      expect(log.warn).toHaveBeenCalledTimes(1)
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('payload 不是对象'))
    }
  })

  it.each([
    ['v=2', { ...FULL_PAYLOAD, v: 2 }],
    ["v='1'（字符串）", { ...FULL_PAYLOAD, v: '1' }],
    ['v 缺失', { jwt: 'jwt-x', loginAt: 1 }],
  ] as Array<[string, Record<string, unknown>]>)('v 不是 1（%s）→ undefined + warn', (_name, payload) => {
    const log = makeLog()
    expect(parseGrant(grantRecord(payload), log)).toBeUndefined()
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('不合法'))
  })

  it.each([
    ['jwt 缺失', { ...FULL_PAYLOAD, jwt: undefined }],
    ['jwt 空串', { ...FULL_PAYLOAD, jwt: '' }],
    ['jwt 非字符串', { ...FULL_PAYLOAD, jwt: 123 }],
  ] as Array<[string, Record<string, unknown>]>)('%s → undefined + warn', (_name, payload) => {
    const log = makeLog()
    expect(parseGrant(grantRecord(payload), log)).toBeUndefined()
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('jwt'))
  })

  it.each([
    ['loginAt 缺失', { ...FULL_PAYLOAD, loginAt: undefined }],
    ['loginAt=NaN', { ...FULL_PAYLOAD, loginAt: Number.NaN }],
    ['loginAt 非数字', { ...FULL_PAYLOAD, loginAt: '1700000000000' }],
  ] as Array<[string, Record<string, unknown>]>)('%s → undefined + warn', (_name, payload) => {
    const log = makeLog()
    expect(parseGrant(grantRecord(payload), log)).toBeUndefined()
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('loginAt'))
  })

  it.each([
    ['organization', 123],
    ['project', null],
    ['keyId', 42],
    ['patExpiresAt', Number.NaN],
  ] as Array<[string, unknown]>)('可选字段 %s 类型漂移 → undefined + warn', (field, value) => {
    const log = makeLog()
    const payload = { ...FULL_PAYLOAD, [field]: value } as Record<string, unknown>
    expect(parseGrant(grantRecord(payload), log)).toBeUndefined()
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('类型漂移'))
  })

  it('RE-5：payload 即使带 jwtExpiresAt 也不透传（恒省略，不进解析结果）', () => {
    const grant = parseGrant(grantRecord({ ...FULL_PAYLOAD, jwtExpiresAt: 999 }))
    if (grant === undefined) throw new Error('payload 除多出 jwtExpiresAt 外合法，不应解析失败')
    expect(grant).toEqual(FULL_PAYLOAD)
    expect('jwtExpiresAt' in grant).toBe(false)
  })
})

describe('readGrant（readRecord + parseGrant 组合）', () => {
  it('有记录 → 解析出的 grant；记录缺失 → undefined', async () => {
    const withRecord = makeFakeCredentials(grantRecord(FULL_PAYLOAD))
    await expect(readGrant(withRecord.credentials, LOGIN_RECORD_KEY)).resolves.toEqual(FULL_PAYLOAD)
    const withoutRecord = makeFakeCredentials()
    await expect(readGrant(withoutRecord.credentials, LOGIN_RECORD_KEY)).resolves.toBeUndefined()
  })
})

describe('patchGrant / patchGrantKeyId 补写路径（X9-2）', () => {
  it('patchGrantKeyId：mutate 收到当前记录，写回保留 jwt/organization/project/loginAt、只改 keyId', async () => {
    const original = grantRecord(FULL_PAYLOAD)
    const fake = makeFakeCredentials(original)
    const ctx: CredentialsHost = { credentials: fake.credentials }
    const result = await patchGrantKeyId(ctx, LOGIN_RECORD_KEY, 'key-new')
    expect(result).toEqual({ ...FULL_PAYLOAD, keyId: 'key-new' })
    expect(fake.readStored()).toEqual({ kind: 'grant', payload: { ...FULL_PAYLOAD, keyId: 'key-new' } })
    // mutate 的入参恰为读独占时的最新记录（seam 读-改-写语义）
    expect(fake.mutateInputs).toEqual([original])
  })

  it('patchGrant(patExpiresAt)：同样保留其余字段，只改目标键', async () => {
    const fake = makeFakeCredentials(grantRecord(FULL_PAYLOAD))
    const ctx: CredentialsHost = { credentials: fake.credentials }
    const nextPatExpiresAt = 1_700_009_999_000
    const result = await patchGrant(ctx, LOGIN_RECORD_KEY, { patExpiresAt: nextPatExpiresAt })
    expect(result).toEqual({ ...FULL_PAYLOAD, patExpiresAt: nextPatExpiresAt })
    expect(fake.readStored()).toEqual({ kind: 'grant', payload: { ...FULL_PAYLOAD, patExpiresAt: nextPatExpiresAt } })
  })

  it('RE-5 写路径：存量 payload 带 jwtExpiresAt + 补写 → 写回记录也不含该字段', async () => {
    const fake = makeFakeCredentials(grantRecord({ ...FULL_PAYLOAD, jwtExpiresAt: 999 }))
    const ctx: CredentialsHost = { credentials: fake.credentials }
    await patchGrantKeyId(ctx, LOGIN_RECORD_KEY, 'key-new')
    const stored = fake.readStored()
    if (stored === undefined || stored.kind !== 'grant') throw new Error('应写回一份 grant 记录')
    const payload = (stored as GrantRecord).payload as Record<string, unknown>
    expect(payload).toEqual({ ...FULL_PAYLOAD, keyId: 'key-new' })
    expect('jwtExpiresAt' in payload).toBe(false)
  })

  it('记录缺失：返回 undefined 且不写（mutate 原样返回 current，seam 不重写）', async () => {
    const fake = makeFakeCredentials()
    const ctx: CredentialsHost = { credentials: fake.credentials }
    await expect(patchGrantKeyId(ctx, LOGIN_RECORD_KEY, 'key-new')).resolves.toBeUndefined()
    expect(fake.readStored()).toBeUndefined()
    expect(fake.mutateInputs).toEqual([undefined])
  })

  it('非法记录（kind=api-key）：返回 undefined 且存储引用原样（未重写）', async () => {
    const initial: CredentialRecord = { kind: 'api-key', key: 'sk-fixture' }
    const fake = makeFakeCredentials(initial)
    const ctx: CredentialsHost = { credentials: fake.credentials }
    await expect(patchGrantKeyId(ctx, LOGIN_RECORD_KEY, 'key-new')).resolves.toBeUndefined()
    expect(fake.readStored()).toBe(initial)
  })
})

describe('isPatRefConflict 冲突判据（X9-3）', () => {
  it.each([
    ['env 供值 → 冲突', { configured: true, source: 'env' }, true],
    ['user-env 供值 → 冲突', { configured: true, source: 'user-env' }, true],
    ['file 供值（本地存储层）→ 不冲突', { configured: true, source: PAT_FILE_SOURCE }, false],
    ['未配置 → 不冲突', { configured: false }, false],
  ] as Array<[string, { configured: boolean; source?: string }, boolean]>)('%s', (_name, info, expected) => {
    expect(isPatRefConflict(info)).toBe(expected)
  })
})

describe('toLoginState 登录态（X9-4）', () => {
  it('无 grant → absent', () => {
    expect(toLoginState(undefined)).toEqual({ kind: 'absent' })
  })

  it('有 grant → present，jwtExpiresAt 恒 undefined（RE-5）', () => {
    const grant = parseGrant(grantRecord(FULL_PAYLOAD))
    if (grant === undefined) throw new Error('合法夹具不应解析失败')
    const state = toLoginState(grant)
    expect(state).toEqual({ kind: 'present', grant: FULL_PAYLOAD })
    expect(state.kind === 'present' && state.jwtExpiresAt).toBeUndefined()
  })
})
