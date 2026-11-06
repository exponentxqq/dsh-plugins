/**
 * 触发器的规范级用例（H11）：两条信号都装上、任一装不上就软降级（不抛错）、
 * 事件载荷不参与重扫决策。
 */
import { describe, expect, it, vi } from 'vitest'
import type { MultiRootGrant, TriggerContext } from '../src/triggers.ts'
import { installTriggers } from '../src/triggers.ts'

/** 一条可手动触发的假信号线。 */
interface Line {
  /** 已登记的监听器。 */
  readonly listeners: ((...args: never[]) => void)[]
  /** 触发全部监听器（带一个任意载荷）。 */
  emit(payload?: unknown): void
}

/**
 * 造一条假信号线：登记监听器、返回 disposer（可从外部制造订阅失败）。
 * @param throwOnSubscribe - 订阅时抛错（模拟服务存在但不可订阅）。
 * @returns 假信号线。
 */
function line(throwOnSubscribe = false): Line & { subscribe: (listener: (...args: never[]) => void) => () => void } {
  const listeners: ((...args: never[]) => void)[] = []
  return {
    listeners,
    subscribe: (listener) => {
      if (throwOnSubscribe) throw new Error('not subscribable')
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    emit: (payload) => {
      for (const listener of [...listeners]) (listener as (value?: unknown) => void)(payload)
    },
  }
}

/**
 * 造一个结构端口上下文。
 * @param grant - 附加根枚举服务（缺席即没有该服务）。
 * @param domain - `domain/changed` 信号线。
 * @param grantLine - 附加根变更信号线（默认新建一条）。
 * @returns 上下文与两条信号线。
 */
function contextWith(
  grant: MultiRootGrant | undefined,
  domain: ReturnType<typeof line>,
  grantLine = line(),
): TriggerContext & { readonly grantLine: ReturnType<typeof line> } {
  const ctx: TriggerContext = {
    get: (name) => (name === 'multiRootRegistry' ? grant : undefined),
    on: (_event, listener) => domain.subscribe(listener as (...args: never[]) => void),
  }
  return Object.assign(ctx, { grantLine })
}

describe('installTriggers：两条信号与软降级', () => {
  it('两条信号都装上：任一触发都重扫，载荷被忽略', () => {
    const rescans = vi.fn()
    const domain = line()
    const grantLine = line()
    const grant: MultiRootGrant = {
      granted: () => [],
      onChange: (listener) => grantLine.subscribe(listener as (...args: never[]) => void),
    }
    const ctx = contextWith(grant, domain, grantLine)

    const disposers = installTriggers(ctx, rescans)
    expect(disposers).toHaveLength(2)

    // 附加根变更带着 primaryRoot 载荷；驱动器只认「发生了」，不读载荷。
    grantLine.emit('/work/a')
    expect(rescans).toHaveBeenCalledTimes(1)
    domain.emit()
    expect(rescans).toHaveBeenCalledTimes(2)
  })

  it('附加根服务缺席时只装 domain 触发器', () => {
    const rescans = vi.fn()
    const ctx = contextWith(undefined, line())

    const disposers = installTriggers(ctx, rescans)

    expect(disposers).toHaveLength(1)
  })

  it('附加根服务存在但不可订阅：跳过它，domain 触发器仍装上', () => {
    const rescans = vi.fn()
    const domain = line()
    const grant: MultiRootGrant = {
      granted: () => [],
      onChange: () => {
        throw new Error('not subscribable')
      },
    }

    const disposers = installTriggers(contextWith(grant, domain), rescans)

    expect(disposers).toHaveLength(1)
    domain.emit()
    expect(rescans).toHaveBeenCalledTimes(1)
  })

  it('事件总线不可用：跳过 domain 触发器，附加根触发器仍装上', () => {
    const rescans = vi.fn()
    const grantLine = line()
    const grant: MultiRootGrant = {
      granted: () => [],
      onChange: (listener) => grantLine.subscribe(listener as (...args: never[]) => void),
    }
    const ctx: TriggerContext = {
      get: () => grant,
      on: () => {
        throw new Error('no event bus')
      },
    }

    const disposers = installTriggers(ctx, rescans)

    expect(disposers).toHaveLength(1)
    grantLine.emit('/work/a')
    expect(rescans).toHaveBeenCalledTimes(1)
  })

  it('两条都装不上时返回空表且不抛错', () => {
    const ctx: TriggerContext = {
      get: () => ({
        granted: () => [],
        onChange: () => {
          throw new Error('nope')
        },
      }),
      on: () => {
        throw new Error('nope')
      },
    }

    expect(() => installTriggers(ctx, () => {})).not.toThrow()
    expect(installTriggers(ctx, () => {})).toEqual([])
  })

  it('disposer 逐个转发到底层订阅', () => {
    const domain = line()
    const grantLine = line()
    const grant: MultiRootGrant = {
      granted: () => [],
      onChange: (listener) => grantLine.subscribe(listener as (...args: never[]) => void),
    }
    const disposers = installTriggers(contextWith(grant, domain, grantLine), () => {})

    for (const dispose of disposers) dispose()

    expect(grantLine.listeners).toHaveLength(0)
    expect(domain.listeners).toHaveLength(0)
  })
})
