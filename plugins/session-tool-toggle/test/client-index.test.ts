// @vitest-environment jsdom
/**
 * 浏览器半的接线（`src/client/index.ts#apply`，任务 7.6 / code-design 触达面 C9；
 * footer → `workspace-config.section` 的迁移见 #36 / #42）。
 *
 * 组件自身的行为由 `tool-panel` / `workspace-editor` 等套件覆盖；这里只钉**装配契约**：
 *
 * - `inject` 只有座位与字典两项，`connection` 不在名单里（渲染期软读）；
 * - 字典**先于**座位注册；两个座位按 `seats.ts` 的顺序 inject（先 header 后 section）；
 * - header 座位恰好一次，参数 `{ id: PANEL_ID, order: PANEL_ORDER, locale: NS }`（既有行为零回归）；
 * - **分节座位**（holder 的 `workspace-config.section`）恰好一次，参数
 *   `{ id: SECTION_ID, order: SECTION_ORDER, locale: NS, label: () => t('section.label') }`，
 *   组件是 `WorkspaceDefaultsSection`；注入面只剩 `resolveClient`（每次现取 `connection`，与
 *   头部同一份）。「当前会话」探测已随页面化迁往 holder（本包不再有该消费者），owner 份额
 *   `{ workspace }` 由 holder 页面在 `renderSlot` 时传入，**不在**注入面；
 * - **旧 footer 座位不再出现**：`slots.inject` 名单只有两个座位，footer 的字面量在 `src/`
 *   与产物里都必须为零（迁移红线，`bundle.test.ts` 与任务验证句各钉一侧）；
 * - **DQ1=C**：对 `sidebar.workspaces.workspace.menu.item` **不** inject、不注册（上游工作区行
 *   菜单座位本期不实现，见 `seats.ts` 的 D-12 注释）；
 * - 座位未声明时回调不执行且不抛；`register` 抛错时只 `logger.warn`、`apply` 正常返回；
 *   两个座位的软注册互相独立——一个失败不连累另一个；
 * - `ctx.effect` 的两条 dispose 链路：命令事件桥（卸载后不再派发）与 `window` focus
 *   监听的挂/摘。
 *
 * 假 ctx 只实现 `apply` 摸得到的六个面（`effect` / `locale` / `slots` / `on` / `get` /
 * `logger`），`register` 按 cordis 的 shadowing 规则对「同 id 同优先级」抛错——软注册的
 * 用例才有真实语义。不渲染组件，所以不需要 React 测试库；用 jsdom 只为 `window` 存在。
 *
 * @module dsh-plugin-session-tool-toggle/test/client-index
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { NS, en, zh } from '../src/client/locales.ts'
import { SEAT, apply, inject, name } from '../src/client/index.ts'
import {
  HEADER_SEAT,
  PANEL_ID,
  PANEL_ORDER,
  SECTION_ID,
  SECTION_ORDER,
  SECTION_SEAT,
} from '../src/client/seats.ts'
import { WorkspaceDefaultsSection } from '../src/client/WorkspaceEntry.tsx'
import type { WorkspaceDefaultsSectionProps } from '../src/client/WorkspaceEntry.tsx'
import { ToolPanelAction } from '../src/client/ToolPanelAction.tsx'
import type { ToolPanelActionInjected } from '../src/client/ToolPanelAction.tsx'

/**
 * DQ1=C 的红线座位：上游工作区行菜单座位本期不实现。
 *
 * 只作为**否定断言**的字面量（`!injectCalls.includes(...)`），本套件与实现都不注册它。
 */
const MENU_SEAT = 'sidebar.workspaces.workspace.menu.item'

/** 一次 `slots.register` 的实参（组件本身也记下，用来钉住座位与组件的对应关系）。 */
interface Registration {
  readonly name: string
  readonly id?: string
  readonly order?: number
  readonly label?: unknown
  readonly locale?: string
  readonly inject?: () => unknown
  readonly component?: unknown
}

/** 分节注册面交给组件的业务份额（`t` 由 locale 合成、`workspace` 由 holder 页面给）。 */
type WorkspaceDefaultsSectionInjected = Pick<WorkspaceDefaultsSectionProps, 'resolveClient'>

/** 假 ctx 的开关。 */
interface FakeOptions {
  /**
   * 座位是否已被声明（两个座位一起）。未声明时 `slots.inject` 只登记等待、不执行回调——
   * 真实 `SlotRegistry.inject` 的语义（`registry.d.ts:111` 的注释：声明出现时才跑回调）。
   */
  readonly declared?: boolean
  /** 更精细的声明控制：只声明名单里的座位（覆盖 `declared`）。 */
  readonly declaredSeats?: readonly string[]
  /** 所有 `register` 一律抛错（模拟座位在但拒绝 entry）。 */
  readonly rejectRegister?: boolean
  /** 只有这个座位的 `register` 抛错（用来验证两个座位互相独立）。 */
  readonly rejectSeat?: string
}

/**
 * 造一个最小的 client context：够 `apply` 走完装配，并记下每一次可观测的调用。
 * @param options - 座位声明面与注册失败开关。
 * @returns 假 ctx 与全部观测面。
 */
function fakeClient(options: FakeOptions = {}) {
  const declaredSeats = new Set<string>(
    options.declaredSeats ?? ((options.declared ?? true) ? [HEADER_SEAT, SECTION_SEAT] : []),
  )
  const log: string[] = []
  /** 每次 `slots.inject` 的座位键（按调用顺序；分节恰好一次、顺序在 header 之后靠它钉）。 */
  const injectCalls: string[] = []
  const registrations: Registration[] = []
  const localeCalls: Array<{ ns: string; dicts: Record<string, unknown> }> = []
  /** 每次 `locale.bind` 的命名空间（分节 label thunk 的来源）。 */
  const bindCalls: string[] = []
  /** 座位未声明时登记等待的 `slots.inject` 回调（真实 SlotRegistry 的补跑语义）。 */
  const pending = new Map<string, Array<() => unknown>>()
  const warnings: unknown[][] = []
  const errors: unknown[][] = []
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
      // 只是把命中的中文键返回：本套件只钉「label thunk 解析到哪条文案」，不重测 locale 服务。
      bind: (ns: string) => {
        log.push(`locale.bind:${ns}`)
        bindCalls.push(ns)
        return (key: string) => (zh as Record<string, string>)[key] ?? key
      },
    },
    slots: {
      inject: (key: string, callback: () => unknown) => {
        log.push(`slots.inject:${key}`)
        injectCalls.push(key)
        if (declaredSeats.has(key)) {
          callback()
        } else {
          // 座位未声明：只登记等待（holder 缺席时的「只贡献方」形态）。
          const waiting = pending.get(key) ?? []
          waiting.push(callback)
          pending.set(key, waiting)
        }
        return () => {}
      },
      register: (rawOptions: Registration, component?: unknown) => {
        log.push(`register:${rawOptions.name}`)
        if (options.rejectRegister === true || rawOptions.name === options.rejectSeat) {
          throw new Error(`座位拒绝了这个 entry: ${rawOptions.name}`)
        }
        // 照 cordis 的 shadowing 规则：list 座位同 id 同优先级（缺省 0）重复注册抛错。
        if (registrations.some((entry) => entry.name === rawOptions.name && entry.id === rawOptions.id)) {
          throw new Error(`slot cell already occupied: ${rawOptions.id}`)
        }
        registrations.push({ ...rawOptions, component })
        return () => {}
      },
    },
    logger: {
      warn: (...args: unknown[]) => warnings.push(args),
      error: (...args: unknown[]) => errors.push(args),
    },
    get: (serviceName: string) => services[serviceName],
  }

  /** 按座位名取注册项（缺席即失败：调用点说明测试假设这个座位应当注册成功）。 */
  const registrationOf = (seatName: string): Registration => {
    const found = registrations.find((entry) => entry.name === seatName)
    if (found === undefined) throw new Error(`missing registration: ${seatName}`)
    return found
  }

  return {
    ctx: ctx as never,
    log,
    injectCalls,
    registrations,
    localeCalls,
    bindCalls,
    warnings,
    errors,
    disposers,
    emit,
    /** header 座位的注册项（旧套件沿用 `seat()` 这个名字）。 */
    seat(): Registration {
      return registrationOf(HEADER_SEAT)
    },
    /** 工作区默认档分节的注册项。 */
    section(): Registration {
      return registrationOf(SECTION_SEAT)
    },
    /** header 注入面（每次调用都重新执行注册时给的 inject 工厂，与真实渲染一致）。 */
    headerPorts(): ToolPanelActionInjected {
      return registrationOf(HEADER_SEAT).inject?.() as ToolPanelActionInjected
    },
    /** 分节注入面。 */
    sectionPorts(): WorkspaceDefaultsSectionInjected {
      return registrationOf(SECTION_SEAT).inject?.() as WorkspaceDefaultsSectionInjected
    },
    /** 模拟服务在 `apply` 之后才 provide（真实 web 壳的 connection / sessions 就属于这类）。 */
    provide(next: Record<string, unknown>): void {
      Object.assign(services, next)
    },
    /** 该座位还在等待声明的回调数（「只贡献方」格与「后装 holder」格的观测面）。 */
    pendingCount(seatName: string): number {
      return pending.get(seatName)?.length ?? 0
    },
    /** 后装 holder：声明座位并同步补跑待命回调（真实 `SlotRegistry.inject` 的语义）。 */
    declareSeat(seatName: string): void {
      declaredSeats.add(seatName)
      const waiting = pending.get(seatName) ?? []
      pending.delete(seatName)
      for (const callback of waiting) callback()
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

  it('座位常量从 seats.ts 取，旧导出名仍是同一份值', () => {
    expect(SEAT).toBe(HEADER_SEAT)
    expect(SECTION_SEAT).toBe('workspace-config.section')
    expect(SECTION_ID).not.toBe(PANEL_ID)
    expect(PANEL_ORDER).toBe(20)
    expect(SECTION_ORDER).toBe(20)
  })
})

describe('apply 的装配顺序', () => {
  it('字典先注册，随后按 seats.ts 的顺序 inject 并注册两个座位的 entry', () => {
    const fake = fakeClient()
    fake.provide({ connection: CONNECTION })
    apply(fake.ctx)

    expect(fake.log).toEqual([
      // ctx.effect 立即执行体：字典注册发生在「命令桥的 effect」之前。
      'effect:session-tool-toggle: 双语文案',
      `locale:${NS}`,
      'effect:session-tool-toggle: command/executed 桥',
      // 分节 label thunk 的翻译函数在座位注册之前绑定。
      `locale.bind:${NS}`,
      `slots.inject:${HEADER_SEAT}`,
      `register:${HEADER_SEAT}`,
      `slots.inject:${SECTION_SEAT}`,
      `register:${SECTION_SEAT}`,
    ])
    expect(fake.injectCalls).toEqual([HEADER_SEAT, SECTION_SEAT])
  })

  it('locale.register 收到 NS 与 zh/en 字典，且早于两个座位的注册', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    expect(fake.localeCalls).toEqual([{ ns: NS, dicts: { zh, en } }])
    expect(NS).toBe('sessionToolToggle')
    expect(fake.log.indexOf(`locale:${NS}`)).toBeLessThan(fake.log.indexOf(`register:${HEADER_SEAT}`))
    expect(fake.log.indexOf(`locale:${NS}`)).toBeLessThan(fake.log.indexOf(`register:${SECTION_SEAT}`))
  })

  it('locale.bind 绑定本命名空间且只绑一次，分节 label thunk 解析到 section.label', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    expect(fake.bindCalls).toEqual([NS])
    const label = fake.section().label
    expect(typeof label).toBe('function')
    // thunk 每次读取都重新求值（上游 SlotLabel 语义）：locale 切换无需重注册。
    expect((label as () => string)()).toBe(zh['section.label'])
  })
})

describe('header 座位（既有行为零回归）', () => {
  it('header 只注册一次，参数是 utilities + order 20 + locale NS，组件是 ToolPanelAction', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    expect(fake.registrations).toHaveLength(2)
    expect(fake.seat()).toMatchObject({
      name: HEADER_SEAT,
      id: PANEL_ID,
      order: PANEL_ORDER,
      locale: NS,
      component: ToolPanelAction,
    })
    // 同一份注入面（三个端口）由注册级 inject 交给组件。
    const ports = fake.headerPorts()
    expect(ports).toMatchObject({
      resolveClient: expect.any(Function),
      subscribeCommandExecuted: expect.any(Function),
      attachFocusListener: expect.any(Function),
    })
  })

  it('座位尚未声明时 apply 不抛，也不凭空注册 entry', () => {
    const fake = fakeClient({ declared: false })
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.registrations).toEqual([])
    // 两个座位都只登记等待：回调不执行、也没有 register 调用。
    expect(fake.injectCalls).toEqual([HEADER_SEAT, SECTION_SEAT])
    expect(fake.log.some((entry) => entry.startsWith('register:'))).toBe(false)
  })
})

describe('工作区默认档分节座位（holder workspace-config.section）', () => {
  it('对 workspace-config.section 的 slots.inject 恰好一次，顺序在 header 之后', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    expect(fake.injectCalls.filter((seat) => seat === SECTION_SEAT)).toHaveLength(1)
    expect(fake.injectCalls).toEqual([HEADER_SEAT, SECTION_SEAT])
  })

  it('分节只注册一次，参数是 section id + order 20 + locale NS + label thunk，组件是 WorkspaceDefaultsSection', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    expect(fake.section()).toMatchObject({
      name: SECTION_SEAT,
      id: SECTION_ID,
      order: SECTION_ORDER,
      locale: NS,
      component: WorkspaceDefaultsSection,
    })
    expect(fake.section().label).toBeTypeOf('function')
  })

  it('注入面的 resolveClient 每次现取 connection（缺席 → undefined，就绪 → 完整客户端）', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    expect(fake.sectionPorts().resolveClient()).toBeUndefined()

    fake.provide({ connection: CONNECTION })
    expect(fake.sectionPorts().resolveClient()).toMatchObject({
      panel: expect.any(Function),
      toggle: expect.any(Function),
      reset: expect.any(Function),
      workspace: expect.any(Function),
    })
  })

  it('分节与头部共用同一个现取客户端（同一 connection → 同一条 /session-tool-toggle 通道）', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    // 两侧在 connection 就绪前都返回空，就绪后都能取到同一通道的客户端能力面。
    expect(fake.sectionPorts().resolveClient()).toBeUndefined()
    expect(fake.headerPorts().resolveClient()).toBeUndefined()

    fake.provide({ connection: CONNECTION })
    expect(fake.sectionPorts().resolveClient()).toMatchObject({ workspace: expect.any(Function) })
    expect(fake.headerPorts().resolveClient()).toMatchObject({ panel: expect.any(Function) })
  })

  it('只有分节声明时 header 不注册、分节照常注册（两个座位互相独立）', () => {
    const fake = fakeClient({ declaredSeats: [SECTION_SEAT] })
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.registrations).toHaveLength(1)
    expect(fake.section()).toMatchObject({ name: SECTION_SEAT, id: SECTION_ID })
    expect(fake.warnings).toEqual([])
    expect(fake.errors).toEqual([])
  })

  it('DQ1=C：对 sidebar.workspaces.workspace.menu.item 不 inject、不注册', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    expect(fake.injectCalls).not.toContain(MENU_SEAT)
    expect(fake.injectCalls).toHaveLength(2)
    expect(fake.log.some((entry) => entry.includes(MENU_SEAT))).toBe(false)
    expect(fake.registrations.map((entry) => entry.name)).toEqual([HEADER_SEAT, SECTION_SEAT])
  })
})

describe('软注册失败只 warn，apply 正常返回', () => {
  it('header 注册抛错：只 warn、返回不抛，分节照常注册', () => {
    const fake = fakeClient({ rejectSeat: HEADER_SEAT })
    // 返回 undefined 本身就证明没有异常逃出 apply。
    expect(apply(fake.ctx)).toBeUndefined()

    expect(fake.warnings).toHaveLength(2)
    expect(fake.warnings[0]?.[0]).toContain('会话头部工具区座位注册失败')
    expect(fake.warnings[1]?.[0]).toBeInstanceOf(Error)
    expect(fake.errors).toEqual([])
    expect(fake.registrations.map((entry) => entry.name)).toEqual([SECTION_SEAT])
  })

  it('分节注册抛错：只 warn、返回不抛，header 照常注册', () => {
    const fake = fakeClient({ rejectSeat: SECTION_SEAT })
    expect(apply(fake.ctx)).toBeUndefined()

    expect(fake.warnings).toHaveLength(2)
    expect(fake.warnings[0]?.[0]).toContain('工作区配置分节座位注册失败')
    expect(fake.warnings[1]?.[0]).toBeInstanceOf(Error)
    expect(fake.errors).toEqual([])
    expect(fake.registrations.map((entry) => entry.name)).toEqual([HEADER_SEAT])
  })

  it('两个座位都拒绝注册：apply 不抛、不注册任何 entry、只走 warn', () => {
    const fake = fakeClient({ rejectRegister: true })
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.registrations).toEqual([])
    // 每个座位两条 warn：一条本地化说明 + 一条原始错误。
    expect(fake.warnings).toHaveLength(4)
    expect(fake.warnings[0]?.[0]).toContain('会话头部工具区座位注册失败')
    expect(fake.warnings[2]?.[0]).toContain('工作区配置分节座位注册失败')
    expect(fake.errors).toEqual([])
  })

  it('同一个 ctx 上第二次 apply 撞上已占用的两个 cell 时同样软失败（只留两份 entry）', () => {
    const fake = fakeClient()
    apply(fake.ctx)
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.registrations).toHaveLength(2)
    expect(fake.warnings).toHaveLength(4)
    expect(fake.errors).toEqual([])
  })
})

describe('注入面的三个端口（header）', () => {
  it('connection 缺席时入口仍注册，resolveClient() 返回 undefined（控制器据此降级）', () => {
    const fake = fakeClient()
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.headerPorts().resolveClient()).toBeUndefined()
  })

  it('connection 就绪时 resolveClient() 现取到完整客户端', () => {
    const fake = fakeClient()
    fake.provide({ connection: CONNECTION })
    apply(fake.ctx)

    expect(fake.headerPorts().resolveClient()).toMatchObject({
      panel: expect.any(Function),
      toggle: expect.any(Function),
      reset: expect.any(Function),
      workspace: expect.any(Function),
    })
  })

  it('connection 在 apply 之后才 provide 时同一注入面立刻能取到（每次都现取，不缓存 undefined）', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    const ports = fake.headerPorts()
    expect(ports.resolveClient()).toBeUndefined()

    fake.provide({ connection: CONNECTION })
    expect(ports.resolveClient()).toMatchObject({ panel: expect.any(Function) })
  })

  it('subscribeCommandExecuted 派发本窗口的命令事件，退订后不再收到', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    const ports = fake.headerPorts()
    const handler = vi.fn()
    const off = ports.subscribeCommandExecuted?.(handler)

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

    const ports = fake.headerPorts()
    const handler = vi.fn()
    ports.subscribeCommandExecuted?.(handler)

    // disposers[1] 是 ② 号 effect（命令桥）盘给 fiber 的清理回调。
    expect(fake.disposers).toHaveLength(2)
    fake.disposers[1]?.()

    fake.emit('command/executed', 'session-1', 'tools', { ok: true })
    expect(handler).not.toHaveBeenCalled()
  })

  it('attachFocusListener 在 window 上挂一次、摘一次', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    const ports = fake.headerPorts()
    const handler = vi.fn()
    const off = ports.attachFocusListener?.(handler)

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

    const ports = fake.headerPorts()
    const off = ports.attachFocusListener?.(vi.fn())
    expect(typeof off).toBe('function')
    expect(() => { off?.() }).not.toThrow()
  })
})

/**
 * 四格安装组合矩阵（本包视角；code-design ⑤G6 6.2 / tasks 7.1）。
 *
 * 全装格与「后装 holder 补跑」由 holder 的 `test/section-seat.poc.test.tsx` 真 renderer 哨兵
 * 覆盖；这里钉本包的三格：**格 1**（holder 已声明分节座位 → 本节 order 20 注册，会话头部
 * 入口 order 20 原样保留）、**格 3**（只装贡献方、无 holder → 分节 inject 待命，不注册、
 * 不抛错、不 warn，头部入口不受影响）、**格 4**（holder 后到 → 待命回调补跑，分节立即可用）。
 */
describe('四格安装组合矩阵（session-tool-toggle 侧）', () => {
  it('格 1 全装：holder 声明分节座位时本节 order 20 注册，会话头部入口（order 20）原样保留', () => {
    const fake = fakeClient()
    apply(fake.ctx)

    expect(fake.warnings).toEqual([])
    expect(fake.errors).toEqual([])
    expect(fake.pendingCount(SECTION_SEAT)).toBe(0)
    expect(fake.registrations).toHaveLength(2)
    expect(fake.section()).toMatchObject({
      name: SECTION_SEAT,
      id: SECTION_ID,
      order: SECTION_ORDER,
      locale: NS,
    })
    expect(fake.section().label).toBeTypeOf('function')
    expect((fake.section().label as () => string)()).toBe(zh['section.label'])
    // 头部入口没有被分节迁移挪走或改序（与 /tools 共用状态的入口面）。
    expect(fake.seat()).toMatchObject({ id: PANEL_ID, order: PANEL_ORDER })
  })

  it('格 3 只贡献方（无 holder）：分节 inject 待命不注册、不抛错也不 warn，头部入口不受影响', () => {
    const fake = fakeClient({ declaredSeats: [HEADER_SEAT] })
    expect(() => { apply(fake.ctx) }).not.toThrow()

    // 头部座位照常注册；分节座位（holder 声明）缺席 → 回调只登记等待。
    expect(fake.registrations.map((entry) => entry.name)).toEqual([HEADER_SEAT])
    expect(fake.pendingCount(SECTION_SEAT)).toBe(1)
    expect(fake.warnings).toEqual([])
    expect(fake.errors).toEqual([])
  })

  it('格 4 后装 holder：贡献方先 apply，分节座位后声明时待命回调补跑，分节立即可用', () => {
    const fake = fakeClient({ declaredSeats: [] })
    apply(fake.ctx)

    // 两个座位都未声明：都不注册，回调全部待命。
    expect(fake.registrations).toEqual([])
    expect(fake.pendingCount(SECTION_SEAT)).toBe(1)
    expect(fake.pendingCount(HEADER_SEAT)).toBe(1)
    expect(fake.warnings).toEqual([])

    // holder 后到：只声明分节座位 → 仅分节补跑，头部入口仍待命（两个座位互相独立）。
    fake.declareSeat(SECTION_SEAT)
    expect(fake.pendingCount(SECTION_SEAT)).toBe(0)
    expect(fake.registrations.map((entry) => entry.name)).toEqual([SECTION_SEAT])
    expect(fake.section()).toMatchObject({ id: SECTION_ID, order: SECTION_ORDER })
    expect((fake.section().label as () => string)()).toBe(zh['section.label'])
    expect(fake.pendingCount(HEADER_SEAT)).toBe(1)

    // 头部座位随后声明也能补跑，两处软注册互不连累。
    fake.declareSeat(HEADER_SEAT)
    expect(fake.registrations.map((entry) => entry.name)).toEqual([SECTION_SEAT, HEADER_SEAT])
    expect(fake.warnings).toEqual([])
    expect(fake.errors).toEqual([])
  })
})
