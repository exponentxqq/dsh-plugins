// @vitest-environment jsdom
/**
 * 浏览器半的接线（`src/client/index.ts#apply`，任务 10.5 / 设计附录 §1.1 的该行）。
 *
 * 组件自身的行为由 `tool-panel` 套件覆盖；这里只钉**装配契约**——也就是 spec 里
 * 「会话头部工具区出现入口」「上游接触点全部软降级」两条要求真正落在哪几个调用上：
 *
 * - `inject` 只有座位与字典两项，`connection` 不在名单里（渲染期软读）；
 * - 字典**先于**座位注册（entry 声明 `locale: NS`，缺字典会 fail loud）；
 * - 座位恰好注册一次，参数是 `{ id: 'session-tool-toggle-panel', order: 20, locale: NS }`；
 * - `connection` 缺席时 `apply` 不抛、入口仍注册，注入面的 `resolveClient()` 返回
 *   `undefined`（控制器据此降级）；服务**随后**就绪时同一个注入面立刻能取到客户端；
 * - 座位拒绝注册（含同 id 同优先级的第二次 `apply`）被 `try/catch` 吞掉并 `warn`，
 *   client 半整体不崩；
 * - `ctx.effect` 的两条 dispose 链路：命令事件桥（卸载后不再派发）与 `window` focus
 *   监听的挂/摘。
 *
 * 假 ctx 只实现 `apply` 摸得到的五个面（`effect` / `locale` / `slots` / `on` / `get` /
 * `logger`），`register` 按 cordis 的 shadowing 规则对「同 id 同优先级」抛错——软注册的
 * 用例才有真实语义。不渲染组件，所以不需要 React 测试库；用 jsdom 只为 `window` 存在。
 *
 * @module dsh-plugin-session-tool-toggle/test/client-index
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { NS, en, zh } from '../src/client/locales.ts'
import { PANEL_ID, PANEL_ORDER, SEAT, apply, inject, name } from '../src/client/index.ts'
import type { ToolPanelActionInjected } from '../src/client/ToolPanelAction.tsx'

/** 一次 `slots.register` 的实参（组件本身也记下，但用例只关心 options）。 */
interface Registration {
  readonly name: string
  readonly id?: string
  readonly order?: number
  readonly locale?: string
  readonly inject?: () => ToolPanelActionInjected
}

/** 假 ctx 的开关。 */
interface FakeOptions {
  /**
   * 座位是否已被声明。未声明时 `slots.inject` 只登记等待、不执行回调——真实
   * `SlotRegistry.inject` 的语义（`registry.d.ts:111` 的注释：声明出现时才跑回调）。
   */
  readonly declared?: boolean
  /** 座位注册一律抛错（模拟座位在但拒绝这个 entry）。 */
  readonly rejectRegister?: boolean
}

/**
 * 造一个最小的 client context：够 `apply` 走完装配，并记下每一次可观测的调用。
 * @param options - 座位是否已声明、注册是否一律抛错。
 * @returns 假 ctx 与全部观测面。
 */
function fakeClient(options: FakeOptions = {}) {
  const declared = options.declared ?? true
  const log: string[] = []
  const registrations: Registration[] = []
  const localeCalls: Array<{ ns: string; dicts: Record<string, unknown> }> = []
  const warnings: unknown[][] = []
  /** `ctx.effect` 收集到的 dispose 回调（下标即注册顺序：0 字典、1 命令桥）。 */
  const disposers: Array<() => unknown> = []
  /** 事件名 → 监听器集合。 */
  const listeners = new Map<string, Set<(...args: never[]) => void>>()
  /** `ctx.get` 能读到的服务（初始为空，用例可随后 provide）。 */
  const services: Record<string, unknown> = {}

  /** 派发一次事件（模拟本窗口的 `command/executed`）。 */
  const emit = (event: string, ...args: unknown[]): void => {
    for (const listener of Array.from(listeners.get(event) ?? [])) {
      ;(listener as (...inner: unknown[]) => void)(...args)
    }
  }

  const ctx = {
    effect: (callback: () => unknown, label?: string) => {
      log.push(`effect:${label ?? ''}`)
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose as () => unknown)
      return () => {}
    },
    on: (event: string, listener: (...args: never[]) => void) => {
      const set = listeners.get(event) ?? new Set()
      set.add(listener)
      listeners.set(event, set)
      return () => set.delete(listener)
    },
    locale: {
      register: (ns: string, dicts: Record<string, unknown>) => {
        log.push(`locale:${ns}`)
        localeCalls.push({ ns, dicts })
        return () => {}
      },
    },
    slots: {
      inject: (key: string, callback: () => unknown) => {
        log.push(`slots.inject:${key}`)
        if (declared) callback()
        return () => {}
      },
      register: (rawOptions: Registration) => {
        log.push(`register:${rawOptions.name}`)
        if (options.rejectRegister) throw new Error('座位拒绝了这个 entry')
        // 照 cordis 的 shadowing 规则：list 座位同 id 同优先级（缺省 0）重复注册抛错。
        if (registrations.some((entry) => entry.name === rawOptions.name && entry.id === rawOptions.id)) {
          throw new Error(`slot cell already occupied: ${rawOptions.id}`)
        }
        registrations.push(rawOptions)
        return () => {}
      },
    },
    logger: {
      warn: (...args: unknown[]) => warnings.push(args),
    },
    get: (serviceName: string) => services[serviceName],
  }

  return {
    ctx: ctx as never,
    log,
    registrations,
    localeCalls,
    warnings,
    disposers,
    emit,
    /** 按座位名取注册项。 */
    seat(): Registration {
      const found = registrations.find((entry) => entry.name === SEAT)
      if (found === undefined) throw new Error(`missing registration: ${SEAT}`)
      return found
    },
    /** 模拟服务在 `apply` 之后才 provide（真实 web 壳的 connection 就属于这类）。 */
    provide(next: Record<string, unknown>): void {
      Object.assign(services, next)
    },
  }
}

/** 一个够用的 connection 假实现：`resolveClient` 只把它交给 `createPanelClient`。 */
const CONNECTION = { rpc: { call: async () => ({ ok: true, value: {} }) } }

afterEach(vi.unstubAllGlobals)

describe('浏览器半的依赖与身份', () => {
  it('插件名与宿主半同名；inject 只有座位与字典，connection 不在名单里', () => {
    expect(name).toBe('session-tool-toggle')
    expect(inject).toEqual(['slots', 'locale'])
    // 写进 inject 就会让整行插件等到 connection 就绪才 apply（web-ux v1.2.0 的踩坑）。
    expect(inject).not.toContain('connection')
  })
})

describe('apply 的装配顺序', () => {
  it('字典先注册，随后是这个座位的唯一一个 entry', () => {
    const fake = fakeClient()
    fake.provide({ connection: CONNECTION })
    apply(fake.ctx)

    expect(fake.log).toEqual([
      // ctx.effect 立即执行体：字典注册发生在「命令桥的 effect」之前。
      'effect:session-tool-toggle: 双语文案',
      `locale:${NS}`,
      'effect:session-tool-toggle: command/executed 桥',
      `slots.inject:${SEAT}`,
      `register:${SEAT}`,
    ])
  })

  it('locale.register 收到 NS 与 zh/en 字典，且早于座位注册', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    expect(fake.localeCalls).toEqual([{ ns: NS, dicts: { zh, en } }])
    expect(NS).toBe('sessionToolToggle')
    expect(fake.log.indexOf(`locale:${NS}`)).toBeLessThan(fake.log.indexOf(`register:${SEAT}`))
  })
})

describe('座位注册', () => {
  it('座位只注册一次，参数是 utilities + order 20 + locale NS', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    expect(fake.registrations).toHaveLength(1)
    expect(fake.seat()).toMatchObject({ name: SEAT, id: PANEL_ID, order: PANEL_ORDER, locale: NS })
    expect(PANEL_ORDER).toBe(20)
  })

  it('座位尚未声明时 apply 不抛，也不凭空注册 entry', () => {
    const fake = fakeClient({ declared: false })
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.registrations).toEqual([])
    expect(fake.log).toContain(`slots.inject:${SEAT}`)
  })

  it('座位拒绝注册时被 try/catch 吞掉并 warn，client 半不崩', () => {
    const fake = fakeClient({ rejectRegister: true })
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.registrations).toEqual([])
    expect(fake.warnings).toHaveLength(2)
    expect(fake.warnings[0]?.[0]).toContain('会话头部工具区座位注册失败')
    expect(fake.warnings[1]?.[0]).toBeInstanceOf(Error)
  })

  it('同一个 ctx 上第二次 apply 撞上已占用的 cell 时同样软失败（只留一份 entry）', () => {
    const fake = fakeClient()
    apply(fake.ctx)
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.registrations).toHaveLength(1)
    expect(fake.warnings.length).toBeGreaterThan(0)
  })
})

describe('注入面的三个端口', () => {
  it('connection 缺席时入口仍注册，resolveClient() 返回 undefined（控制器据此降级）', () => {
    const fake = fakeClient()
    expect(() => { apply(fake.ctx) }).not.toThrow()

    const ports = fake.seat().inject?.()
    expect(ports?.resolveClient()).toBeUndefined()
  })

  it('connection 就绪时 resolveClient() 现取到完整客户端', () => {
    const fake = fakeClient()
    fake.provide({ connection: CONNECTION })
    apply(fake.ctx)

    const client = fake.seat().inject?.().resolveClient()
    expect(client).toMatchObject({
      panel: expect.any(Function),
      toggle: expect.any(Function),
      reset: expect.any(Function),
      updateDefaults: expect.any(Function),
    })
  })

  it('connection 在 apply 之后才 provide 时同一注入面立刻能取到（每次都现取，不缓存 undefined）', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    const ports = fake.seat().inject?.()
    expect(ports?.resolveClient()).toBeUndefined()

    fake.provide({ connection: CONNECTION })
    expect(ports?.resolveClient()).toMatchObject({ panel: expect.any(Function) })
  })

  it('subscribeCommandExecuted 派发本窗口的命令事件，退订后不再收到', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    const ports = fake.seat().inject?.()
    const handler = vi.fn()
    const off = ports?.subscribeCommandExecuted?.(handler)

    fake.emit('command/executed', 'session-1', 'tools', { ok: true })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('session-1', 'tools')

    off?.()
    fake.emit('command/executed', 'session-1', 'tools', { ok: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('命令事件桥的 dispose 链路：插件卸载后监听摘除、处理函数清空', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    const ports = fake.seat().inject?.()
    const handler = vi.fn()
    ports?.subscribeCommandExecuted?.(handler)

    // disposers[1] 是 ② 号 effect（命令桥）盘给 fiber 的清理回调。
    expect(fake.disposers).toHaveLength(2)
    fake.disposers[1]?.()

    fake.emit('command/executed', 'session-1', 'tools', { ok: true })
    expect(handler).not.toHaveBeenCalled()
  })

  it('attachFocusListener 在 window 上挂一次、摘一次', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    const ports = fake.seat().inject?.()
    const handler = vi.fn()
    const off = ports?.attachFocusListener?.(handler)

    window.dispatchEvent(new Event('focus'))
    expect(handler).toHaveBeenCalledTimes(1)

    off?.()
    window.dispatchEvent(new Event('focus'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('非浏览器组合（没有 window）时 attachFocusListener 软降级成空订阅', () => {
    vi.stubGlobal('window', undefined)
    const fake = fakeClient()
    apply(fake.ctx)

    const ports = fake.seat().inject?.()
    const off = ports?.attachFocusListener?.(vi.fn())
    expect(typeof off).toBe('function')
    expect(() => { off?.() }).not.toThrow()
  })
})
