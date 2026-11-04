import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { ZcodePlanConfig } from '../src/host/index.ts'
import { apply, Config, inject, name } from '../src/index.ts'

/** 构造最小宿主上下文桩（只覆盖骨架阶段 `apply` 用到的 logger 面）。 */
function stubContext() {
  return { logger: { info: vi.fn() } }
}

/** 用必填项校验一份配置，返回带默认值的运行时形状。 */
function makeConfig(overrides: Record<string, unknown> = {}): ZcodePlanConfig {
  return Config({ organization: 'org', project: 'proj', ...overrides }) as ZcodePlanConfig
}

describe('dsh-plugin-zcode-plan 包形状（T1 冒烟）', () => {
  it('导出 cordis 插件四件套', () => {
    expect(name).toBe('zcode-plan')
    expect(inject).toEqual([])
    expect(Config).toBeDefined()
    expect(typeof apply).toBe('function')
  })

  it('Config：organization / project 必填，缺失即校验报错', () => {
    expect(() => Config({ project: 'proj' } as Record<string, unknown>)).toThrow()
    expect(() => Config({ organization: 'org' } as Record<string, unknown>)).toThrow()
  })

  it('Config：organization / project 之外全部有默认值（§3.2）', () => {
    const config = makeConfig()
    expect(config.organization).toBe('org')
    expect(config.project).toBe('proj')
    expect(config.clientVersion).toBe('0.17.0')
    expect(config.refreshLeadMs).toBe(120_000)
    expect(config.refreshJitterMs).toBe(60_000)
    expect(config.requestTimeoutMs).toBe(15_000)
    expect(config.callbackServer).toBe(true)
    expect(config.loginAttemptTtlMs).toBe(600_000)
  })

  it('apply：空装配只打一条加载日志', () => {
    const ctx = stubContext()
    apply(ctx as unknown as Context, makeConfig())
    expect(ctx.logger.info).toHaveBeenCalledOnce()
    expect(ctx.logger.info).toHaveBeenCalledWith('zcode-plan: loaded')
  })
})
