import { describe, expect, it, vi } from 'vitest'
import type { ApiKeyRow, BigmodelClient } from '../src/host/bigmodel/client.ts'
import type { LoginGrant } from '../src/host/credential-record.ts'
import { BridgeError } from '../src/host/errors.ts'
import { createKeyManager, KEY_NAME } from '../src/host/key-manager.ts'
import type { LogPort } from '../src/host/ports.ts'

/**
 * 桥接 Key find-or-create 单测（X3）：双条件命中复用、缓存零网络、作废重查。
 * 假 client 五方法全桩——除 listKeys/createKey 外零调用即 D-14「永不删改存量 Key」
 * 的调用面证据（BigmodelClient 面结构上也无任何删除/改名接口）。
 */

/** 登录 grant 夹具（key-manager 只取 jwt + 身份字段）。 */
const GRANT: LoginGrant = {
  v: 1,
  jwt: 'jwt-fixture-abcd12345678',
  organization: 'org-1',
  project: 'proj-1',
  loginAt: 1_700_000_000_000,
}

/** 假 log（复用/新建/作废各留一行，断言文案时可用）。 */
function makeLog(): LogPort {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

/** 全五方法皆桩的假 client；`setRows` 供作废重查用例中途更换列表内容。 */
function makeFakeClient(initialRows: readonly ApiKeyRow[] = [], newKeyId = 'key-new') {
  let rows = initialRows
  const exchangeAuthCode = vi.fn(async () => 'jwt-unused')
  const listKeys = vi.fn(async (): Promise<readonly ApiKeyRow[]> => rows)
  const createKey = vi.fn(async (): Promise<string> => newKeyId)
  const issuePat = vi.fn(async () => ({ pat: 'pat-unused', expiresAt: 0 }))
  const readUsage = vi.fn(async () => ({ level: undefined, limits: [] }))
  const client: BigmodelClient = { exchangeAuthCode, listKeys, createKey, issuePat, readUsage }
  return {
    client,
    exchangeAuthCode,
    listKeys,
    createKey,
    issuePat,
    readUsage,
    setRows: (next: readonly ApiKeyRow[]): void => {
      rows = next
    },
  }
}

describe('find-or-create 双条件命中（X3-1）', () => {
  it('「同名 scene=3 存量」夹具：scene=3 同名 Key 被忽略，双条件命中 scene=1 行即复用，不建新 Key', async () => {
    const fake = makeFakeClient([
      { name: KEY_NAME, usageScene: 3, keyId: 'old' },
      { name: KEY_NAME, usageScene: 1, keyId: 'bridge' },
    ])
    const manager = createKeyManager({ log: makeLog() })
    const keyId = await manager.ensureKey({ client: fake.client, grant: GRANT })
    expect(keyId).toBe('bridge')
    expect(fake.listKeys).toHaveBeenCalledTimes(1)
    expect(fake.createKey).not.toHaveBeenCalled()
    expect(manager.state()).toEqual({ kind: 'ready', keyId: 'bridge' })
  })

  it('无 scene=1 同名（仅 scene=3 存量 / 他名 Key）→ 走 createKey 并返回新 keyId', async () => {
    const fake = makeFakeClient(
      [
        { name: 'other-key', usageScene: 1, keyId: 'other-1' },
        { name: KEY_NAME, usageScene: 3, keyId: 'old' },
      ],
      'key-new',
    )
    const manager = createKeyManager({ log: makeLog() })
    const keyId = await manager.ensureKey({ client: fake.client, grant: GRANT })
    expect(keyId).toBe('key-new')
    expect(fake.createKey).toHaveBeenCalledTimes(1)
    // key-manager 只构造 client 的 CreateKeyInput 四字段；usageScene: 1 由 client 层
    // 统一写进 HTTP 体（client.test.ts X2 已断言），本面只见 name/jwt/organization/project。
    expect(fake.createKey).toHaveBeenCalledWith({
      jwt: GRANT.jwt,
      organization: 'org-1',
      project: 'proj-1',
      name: KEY_NAME,
    })
    expect(manager.state()).toEqual({ kind: 'ready', keyId: 'key-new' })
  })
})

describe('缓存与作废（X3-2）', () => {
  it('缓存命中：连续两次 ensureKey 只 listKeys 一次（零网络复用）', async () => {
    const fake = makeFakeClient([{ name: KEY_NAME, usageScene: 1, keyId: 'bridge' }])
    const manager = createKeyManager({ log: makeLog() })
    expect(await manager.ensureKey({ client: fake.client, grant: GRANT })).toBe('bridge')
    expect(await manager.ensureKey({ client: fake.client, grant: GRANT })).toBe('bridge')
    expect(fake.listKeys).toHaveBeenCalledTimes(1)
    expect(fake.createKey).not.toHaveBeenCalled()
  })

  it('invalidateKey：只清缓存不碰服务端；下次 ensureKey 重新 listKeys 并采用新行', async () => {
    const fake = makeFakeClient([{ name: KEY_NAME, usageScene: 1, keyId: 'bridge' }])
    const manager = createKeyManager({ log: makeLog() })
    expect(await manager.ensureKey({ client: fake.client, grant: GRANT })).toBe('bridge')
    // 作废「其他 keyId」：与缓存不一致，缓存原样保留（零网络）
    manager.invalidateKey('someone-else')
    expect(await manager.ensureKey({ client: fake.client, grant: GRANT })).toBe('bridge')
    expect(fake.listKeys).toHaveBeenCalledTimes(1)
    expect(manager.state()).toEqual({ kind: 'ready', keyId: 'bridge' })
    // 作废命中的 keyId：状态回 unknown；列表已变（旧行被换掉）后重查取新行
    manager.invalidateKey('bridge')
    expect(manager.state()).toEqual({ kind: 'unknown' })
    fake.setRows([{ name: KEY_NAME, usageScene: 1, keyId: 'bridge-2' }])
    expect(await manager.ensureKey({ client: fake.client, grant: GRANT })).toBe('bridge-2')
    expect(fake.listKeys).toHaveBeenCalledTimes(2)
    // 全程只有 listKeys 被调：D-14「永不删改存量 Key」——面里无删除接口 + 调用面双证
    expect(fake.createKey).not.toHaveBeenCalled()
    expect(fake.issuePat).not.toHaveBeenCalled()
    expect(fake.readUsage).not.toHaveBeenCalled()
    expect(fake.exchangeAuthCode).not.toHaveBeenCalled()
  })
})

describe('失败与入参守门', () => {
  it('grant 缺 organization/project：AUTH_STATE，不触网', async () => {
    const fake = makeFakeClient()
    const manager = createKeyManager({ log: makeLog() })
    const bareGrant: LoginGrant = { v: 1, jwt: GRANT.jwt, loginAt: GRANT.loginAt }
    await expect(manager.ensureKey({ client: fake.client, grant: bareGrant })).rejects.toMatchObject({
      code: 'AUTH_STATE',
    })
    expect(fake.listKeys).not.toHaveBeenCalled()
    expect(manager.state()).toEqual({ kind: 'unknown' })
  })

  it('listKeys 失败：BridgeError 原样上抛、状态回 unknown；随后可重查成功', async () => {
    const fake = makeFakeClient([{ name: KEY_NAME, usageScene: 1, keyId: 'bridge' }])
    const failure = new BridgeError('HTTP:500')
    fake.listKeys.mockRejectedValueOnce(failure)
    const manager = createKeyManager({ log: makeLog() })
    await expect(manager.ensureKey({ client: fake.client, grant: GRANT })).rejects.toBe(failure)
    expect(manager.state()).toEqual({ kind: 'unknown' })
    // 失败不建缓存：重试重新 listKeys 并命中复用（createKey 仍零调用）
    expect(await manager.ensureKey({ client: fake.client, grant: GRANT })).toBe('bridge')
    expect(fake.listKeys).toHaveBeenCalledTimes(2)
    expect(fake.createKey).not.toHaveBeenCalled()
  })
})
