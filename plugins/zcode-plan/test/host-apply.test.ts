import type { AuthorizationFlow } from '@deepseek-ai/dsh-authorization'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials/types'
import { describe, expect, it, vi } from 'vitest'
import { apply, Config, type ZcodePlanConfig } from '../src/host/index.ts'
import { LOGIN_RECORD_KEY, PAT_FILE_SOURCE, PAT_REF } from '../src/host/credential-record.ts'
import { LOG_PREFIX, type CredentialsPort } from '../src/host/ports.ts'

/**
 * 假 credentials 服务（CredentialsPort 七方法结构窄面；不 import 上游 Service 类）。
 * 缺省：describe 报本地 file 源、无任何记录——「无冲突 + 未登录」的装配起点。
 * 断言 mock 时用 `vi.mocked(...)` 取 Mock 面。
 */
function fakeCredentials(overrides: Partial<CredentialsPort> = {}): CredentialsPort {
  return {
    resolve: vi.fn(async () => undefined),
    describe: vi.fn(async () => ({ configured: false, source: PAT_FILE_SOURCE, writable: true })),
    set: vi.fn(async () => undefined),
    unset: vi.fn(async () => undefined),
    readRecord: vi.fn(async () => undefined),
    modifyRecord: vi.fn(
      async (
        _key: CredentialKey,
        mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
      ) => mutate(undefined),
    ),
    deleteRecord: vi.fn(async () => undefined),
    ...overrides,
  }
}

/**
 * 假 authorization 服务：只暴露装配层消费的 `registerFlow` 窄面（返回 disposer）。
 */
function fakeAuthorization() {
  const registerFlow = vi.fn((_flow: AuthorizationFlow) => () => undefined)
  return { registerFlow, authorization: { registerFlow } }
}

/**
 * 假宿主上下文：实现 `logger` / `inject` / scope 的 `effect` / `on` 最小形状。
 *
 * `inject(names, cb)` 按注入服务集合决定是否执行 cb（软依赖语义：集合不齐 cb
 * 不跑且不抛）；scope 的 `effect` 收集 disposer（`disposers` 数组模拟拆卸）、
 * `on` 收集事件监听（`listeners` 供测试手动触发 `credentials/record-updated`）。
 */
function createFakeHost(options: { services: readonly string[]; credentials?: CredentialsPort }) {
  const auth = fakeAuthorization()
  const disposers: Array<() => void> = []
  const effectLabels: string[] = []
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  const scope: Record<string, unknown> = {
    authorization: auth.authorization,
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
      if (names.every((n) => options.services.includes(n))) cb(scope)
    },
  }
  return { ctx, ...auth, disposers, effectLabels, listeners }
}

/** 用必填项校验一份配置，返回带默认值的运行时形状。 */
function makeConfig(overrides: Record<string, unknown> = {}): ZcodePlanConfig {
  return Config({ organization: 'org', project: 'proj', ...overrides }) as ZcodePlanConfig
}

/** 推进装配层异步分支（describe → bootstrap）到稳定：轮询直至条件成立或超时。 */
async function settle(probe: () => void): Promise<void> {
  await vi.waitFor(probe, { timeout: 1_000, interval: 5 })
}

describe('host apply 装配（T4 任务 5.1）', () => {
  it('无 credentials/authorization 服务时：apply 不抛且 registerFlow 未被调用（软依赖零注册零报错）', async () => {
    const host = createFakeHost({ services: [] })
    expect(() => apply(host.ctx as never, makeConfig())).not.toThrow()
    // 推进事件循环后仍然零注册（inject callback 根本没跑）。
    await settle(() => {
      expect(host.registerFlow).not.toHaveBeenCalled()
    })
    expect(host.ctx.logger.info).toHaveBeenCalledWith('zcode-plan: loaded')
  })

  it('有 credentials/authorization 服务时：registerFlow 被调用 1 次且 flow.key 为 LOGIN_RECORD_KEY', async () => {
    const host = createFakeHost({ services: ['credentials', 'authorization'], credentials: fakeCredentials() })
    expect(() => apply(host.ctx as never, makeConfig())).not.toThrow()
    await settle(() => {
      expect(host.registerFlow).toHaveBeenCalledTimes(1)
    })
    const flow = host.registerFlow.mock.calls[0]?.[0] as AuthorizationFlow
    expect(flow.key).toBe(LOGIN_RECORD_KEY)
    expect(flow.label).toBe('BigModel / GLM Coding Plan（ZCode 身份）')
    expect(flow.methods).toEqual([{ id: 'browser', label: '用浏览器登录 bigmodel.cn' }])
    // 无登录记录：启动拉起静默跳过（readRecord 被读过一次，set 未被调）。
    expect(host.ctx.logger.warn).not.toHaveBeenCalled()
  })

  it('describe(PAT_REF) 返回外部来源（env）时：REF_CONFLICT 路径——不注册 flow 且 set 未被调用', async () => {
    const credentials = fakeCredentials({
      describe: vi.fn(async () => ({ configured: true, source: 'env', writable: false })),
    })
    const host = createFakeHost({ services: ['credentials', 'authorization'], credentials })
    apply(host.ctx as never, makeConfig())
    await settle(() => {
      expect(vi.mocked(credentials.describe)).toHaveBeenCalledWith(PAT_REF)
    })
    await settle(() => {
      expect(host.registerFlow).not.toHaveBeenCalled()
    })
    expect(vi.mocked(credentials.set)).not.toHaveBeenCalled()
    // 点名冲突来源层（日志只报名字与来源，不读值）。
    expect(host.ctx.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('REF_CONFLICT'),
    )
    expect(host.ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('env'))
  })

  it('credentials/record-updated 监听已挂载：本 key 触发重建（留一行日志）、他 key 忽略', async () => {
    const host = createFakeHost({ services: ['credentials', 'authorization'], credentials: fakeCredentials() })
    apply(host.ctx as never, makeConfig())
    await settle(() => {
      expect(host.registerFlow).toHaveBeenCalledTimes(1)
    })
    const onRecordUpdated = host.listeners.get('credentials/record-updated')
    expect(onRecordUpdated).toHaveLength(1)
    const listener = onRecordUpdated?.[0] as (key: CredentialKey) => void
    // 他 key：静默忽略（不重建、不留日志）。监听回调为 async IIFE（readGrant IO 在
    // 微任务），断言一律走 settle 轮询。
    expect(() => listener('other-plugin/other-id' as CredentialKey)).not.toThrow()
    await settle(() => {
      expect(host.ctx.logger.info).not.toHaveBeenCalledWith(`${LOG_PREFIX}登录记录已更新：PAT owner 已重建`)
    })
    // 本 key：无记录（身份无从比对，不满足「身份未变跳过」）→ 重建 owner + 日志
    // （无记录重建只建对象，零网络零抛；身份比对语义见 pat-owner identity 单测）。
    expect(() => listener(LOGIN_RECORD_KEY)).not.toThrow()
    await settle(() => {
      expect(host.ctx.logger.info).toHaveBeenCalledWith(`${LOG_PREFIX}登录记录已更新：PAT owner 已重建`)
    })
  })

  it('拆卸面存在且可执行：pat owner 与 flow 两个 effect 的 disposer 执行不抛', async () => {
    const host = createFakeHost({ services: ['credentials', 'authorization'], credentials: fakeCredentials() })
    apply(host.ctx as never, makeConfig())
    await settle(() => {
      expect(host.registerFlow).toHaveBeenCalledTimes(1)
    })
    expect(host.effectLabels).toContain('zcode-plan: pat owner')
    expect(host.effectLabels).toContain('zcode-plan: authorization flow')
    // scope 卸载时逐个执行 disposer（owner.dispose 清定时器、flow 撤注册），全部不抛。
    for (const dispose of host.disposers) {
      expect(() => dispose()).not.toThrow()
    }
  })
})
