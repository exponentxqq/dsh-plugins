/**
 * 浏览器半装配（`src/client/index.ts#apply`）的接线契约。
 *
 * 页面壳自身的派生由 `page.test.tsx` 覆盖，真 slots 的 keyed / children / only 语义由
 * `section-seat.poc.test.tsx` 常驻守护；本套件只钉**装配事实**（code-design ① 1.1 的
 * `apply.test.ts` 行）：
 *
 * - 字典**先于**座位注册；两处 `slots.inject` 按 `main` → `sidebar.panellist` 顺序；
 * - `main` 注册面 `{ name, key: PANEL_ID, locale, children: {section: {kind:'list',
 *   scope:'root'}}, inject → 四个端口 }`，组件是 `WorkspaceConfigPage`；
 * - `sidebar.panellist` 注册面 `{ name, id: PANEL_ID, order: PANEL_ORDER(20), locale,
 *   label thunk }`，组件是 `WorkspaceConfigPanelIcon`；
 * - `PANEL_ID` 同时是 `main` 的 `key` 与 panellist 的 `id`（宿主 `selectPanel(id)` 直接用它）；
 * - 配对协调的三条断言：页面装失败 → 行不注册；行座位先到 → 页面到后补行；页面退场 →
 *   行一并退场（先摘行、再摘页）；
 * - 注入端口是「每次现取」的函数，`apply` 期不读 `sessions`；工作区清单源经
 *   `ctx.inject(['workspaces'], …)` 建立（不是 `ctx.get` 硬读）；
 * - 类型权威的 re-export 面：座位名与面板 id / 位次的运行时常量从 `./client` 可取。
 *
 * 假 ctx 只实现 `apply` 摸得到的六个面（`effect` / `locale` / `slots` / `inject` /
 * `get` / `logger`）。座位声明按 `declaredSeats` 可选延迟，用来模拟「行座位先到」的真实
 * cordis 时序；`register` 按 `rejectSeats` 可选抛错——配对协调的用例才有真实语义。
 * 不渲染组件，所以默认 node 环境即可。
 *
 * @module dsh-plugin-workspace-config/test/apply
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import {
  PANEL_ID,
  PANEL_ORDER,
  WORKSPACE_CONFIG_SECTION,
  apply,
  inject,
} from '../src/client/index.ts'
import { NS, en, zh } from '../src/client/locales.ts'
import {
  WorkspaceConfigPage,
  type WorkspaceConfigPageInjected,
} from '../src/client/WorkspaceConfigPage.tsx'
import { WorkspaceConfigPanelIcon } from '../src/client/WorkspaceConfigPanelIcon.tsx'

/** 一次 `slots.register` 的实参（组件本身也记下，用于钉住座位与组件的对应关系）。 */
interface Registration {
  readonly name: string
  readonly key?: string
  readonly id?: string
  readonly order?: number
  readonly locale?: string
  readonly children?: Readonly<Record<string, { kind: string; scope: string }>>
  readonly label?: string | (() => string)
  readonly inject?: () => unknown
  readonly component?: unknown
}

/** 一次 `slots.inject` 的记录：座位名、回调与执行状态（含回调返回的 disposer）。 */
interface InjectionRecord {
  readonly key: string
  readonly callback: () => unknown
  executed: boolean
  disposer: (() => void) | undefined
}

/** 一次 `ctx.inject` 的记录（工作区清单源用它绑定 `workspaces` 服务）。 */
interface ServiceInjection {
  readonly deps: readonly string[]
  readonly callback: (scope: { readonly workspaces?: unknown }) => (() => void) | undefined
}

/** 假 ctx 的开关。 */
interface FakeOptions {
  /** `apply` 期已声明的座位（缺省为两个座位都已声明）。 */
  readonly declaredSeats?: readonly string[]
  /** 这些座位的 `register` 抛错（模拟座位在但拒绝 entry）。 */
  readonly rejectSeats?: readonly string[]
}

/**
 * 造一个够 `apply` 走完装配的假 ctx。
 * @param options - 座位声明面与注册失败开关。
 * @returns 假 ctx + 调用记录 + 后置声明 / 退场驱动。
 */
function createFakeContext(options: FakeOptions = {}) {
  const declared = new Set(options.declaredSeats ?? ['main', 'sidebar.panellist'])
  const rejectSeats = new Set(options.rejectSeats ?? [])
  const log: string[] = []
  const registrations: Registration[] = []
  const injections: InjectionRecord[] = []
  const serviceInjections: ServiceInjection[] = []
  const localeRegistrations: { ns: string; dicts: unknown }[] = []
  const localeBinds: string[] = []
  const warnings: unknown[][] = []
  const effects: { label: unknown; dispose: unknown }[] = []

  const register = vi.fn((registration: Registration, component: unknown) => {
    log.push(`register:${registration.name}`)
    if (rejectSeats.has(registration.name)) {
      throw new Error(`座位拒绝注册：${registration.name}`)
    }
    registrations.push({ ...registration, component })
    return () => {
      log.push(`dispose:${registration.name}`)
    }
  })

  const injectSeat = vi.fn((key: string, callback: () => unknown) => {
    log.push(`inject:${key}`)
    const record: InjectionRecord = { key, callback, executed: false, disposer: undefined }
    injections.push(record)
    if (!declared.has(key)) {
      // 座位未声明：真实 cordis 只挂待命订阅，座位声明提交后才补跑回调。
      return () => {}
    }
    record.executed = true
    record.disposer = callback() as (() => void) | undefined
    return record.disposer ?? (() => {})
  })

  const injectService = vi.fn((deps: readonly string[], callback: ServiceInjection['callback']) => {
    serviceInjections.push({ deps, callback })
    // 服务未到达：真实 `ctx.inject` 也不执行回调。本套件只钉绑定已建立这件事。
    return () => {}
  })

  const get = vi.fn((_name: string): unknown => undefined)

  const slots = {
    inject: injectSeat,
    register,
    // `createSectionsSource` 在 apply 期只构造、不读取；这几个面供类型与页面注入面。
    getVersion: vi.fn(() => 0),
    entries: vi.fn(() => []),
    subscribe: vi.fn(() => () => {}),
  }
  const locale = {
    register: vi.fn((ns: string, dicts: unknown) => {
      log.push(`locale:${ns}`)
      localeRegistrations.push({ ns, dicts })
      return () => {}
    }),
    bind: vi.fn((ns: string) => {
      localeBinds.push(ns)
      return (key: string): string => (zh as Readonly<Record<string, string>>)[key] ?? key
    }),
    getSnapshot: vi.fn(() => ({ active: 'zh', locales: [], revision: 1 })),
    subscribe: vi.fn(() => () => {}),
  }
  const ctx = {
    effect: vi.fn((callback: () => unknown, label: unknown) => {
      const dispose = callback()
      effects.push({ label, dispose })
      return () => {}
    }),
    locale,
    slots,
    inject: injectService,
    get,
    logger: {
      warn: vi.fn((...args: unknown[]) => {
        warnings.push(args)
      }),
    },
  }

  /**
   * 模拟座位在后来的时刻被声明：执行待命回调并记下 disposer。
   * @param seat - 座位名。
   */
  const declare = (seat: string): void => {
    const record = injections.find((entry) => entry.key === seat)
    if (record === undefined) throw new Error(`没有该座位的注入记录：${seat}`)
    if (record.executed) throw new Error(`座位已执行过：${seat}`)
    record.executed = true
    record.disposer = record.callback() as (() => void) | undefined
  }

  /**
   * 模拟座位退场（cordis 调效应 disposer）：只调该座位回调返回的 disposer。
   * @param seat - 座位名。
   */
  const disposeSeat = (seat: string): void => {
    const record = injections.find((entry) => entry.key === seat)
    if (record?.executed !== true) throw new Error(`座位尚未执行，无法退场：${seat}`)
    record.disposer?.()
  }

  return {
    ctx: ctx as unknown as ClientContext,
    log,
    registrations,
    injections,
    serviceInjections,
    localeRegistrations,
    localeBinds,
    warnings,
    effects,
    get,
    declare,
    disposeSeat,
  }
}

/** 取指定座位的注册面；缺席直接 fail loud（不靠可选链把缺失写成通过）。 */
function registrationOf(
  registrations: readonly Registration[],
  seat: string,
): Registration {
  const registration = registrations.find((entry) => entry.name === seat)
  if (registration === undefined) throw new Error(`没有该座位的注册：${seat}`)
  return registration
}

describe('装配顺序', () => {
  it('字典先注册；两处 inject 按 main → sidebar.panellist 顺序执行', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    expect(fake.log.slice(0, 5)).toEqual([
      `locale:${NS}`,
      'inject:main',
      'register:main',
      'inject:sidebar.panellist',
      'register:sidebar.panellist',
    ])
    expect(fake.localeRegistrations).toEqual([{ ns: NS, dicts: { zh, en } }])
    expect(fake.injections.map((record) => record.key)).toEqual(['main', 'sidebar.panellist'])
    expect(fake.injections.every((record) => record.executed)).toBe(true)
    expect(fake.registrations).toHaveLength(2)
    // 旧形态的两个座位名不得再出现（footer 入口 / 统一弹窗已下线）。
    expect(fake.log.join('\n')).not.toContain('sidebar.footer.action')
    expect(fake.log.join('\n')).not.toContain('shell.overlay')
  })

  it('行 label 绑定本命名空间：bind(NS) 的 thunk 求值为 entry.label', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    expect(fake.localeBinds).toEqual([NS])
    const row = registrationOf(fake.registrations, 'sidebar.panellist')
    expect(typeof row.label).toBe('function')
    expect((row.label as () => string)()).toBe(zh['entry.label'])
  })

  it('字典注册挂在 ctx.effect 上（插件卸载即摘）', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    expect(fake.effects).toHaveLength(1)
    expect(fake.effects[0]?.label).toBe('workspace-config: 双语文案')
    expect(typeof fake.effects[0]?.dispose).toBe('function')
  })
})

describe('main 注册面（独立页面）', () => {
  it('name/key/locale/children 声明与组件逐字对齐；不带 id / order', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    const page = registrationOf(fake.registrations, 'main')
    expect(page.key).toBe(PANEL_ID)
    expect(page.key).toBe('workspace-config')
    expect(page.locale).toBe(NS)
    expect(page.children).toEqual({
      [WORKSPACE_CONFIG_SECTION]: { kind: 'list', scope: 'root' },
    })
    expect(page.component).toBe(WorkspaceConfigPage)
    // `main` 是 keyed 座位：身份是 key，没有 list 的 id/order 语义。
    expect(page.id).toBeUndefined()
    expect(page.order).toBeUndefined()
  })

  it('注入面是四个端口：两个快照源 + 两个每次现取的会话读数函数', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    const page = registrationOf(fake.registrations, 'main')
    const injected = page.inject?.() as WorkspaceConfigPageInjected

    expect(injected.sections.getSnapshot()).toEqual([])
    expect(injected.workspaces.getSnapshot()).toEqual({ phase: 'pending', items: [] })
    expect(typeof injected.currentSessionId).toBe('function')
    expect(typeof injected.sessionUsage).toBe('function')
  })

  it('端口函数每次现取：apply 期不读 sessions，调用时才读', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    // apply 期只建立绑定，不把「未就绪」固化成永久缺失。
    expect(fake.get).not.toHaveBeenCalled()

    const injected = registrationOf(fake.registrations, 'main').inject?.() as WorkspaceConfigPageInjected
    expect(injected.currentSessionId()).toBeUndefined()
    expect(injected.sessionUsage()).toBeUndefined()
    // 两次调用各自现取一次（不缓存服务值 / 快照）。
    expect(fake.get.mock.calls.map(([name]) => name)).toEqual(['sessions', 'sessions'])
  })

  it('工作区清单源经 ctx.inject(["workspaces"]) 建立，而不是 apply 期硬读', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    expect(fake.serviceInjections).toHaveLength(1)
    expect(fake.serviceInjections[0]?.deps).toEqual(['workspaces'])
    // 服务未到达：清单源停在 pending，页面照常可用（降级是设计的一部分）。
    expect(fake.get).not.toHaveBeenCalled()
  })
})

describe('sidebar.panellist 注册面（侧栏行）', () => {
  it('name/id/order/locale/label thunk 与组件逐字对齐；不带 key / children / inject', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    const row = registrationOf(fake.registrations, 'sidebar.panellist')
    expect(row.id).toBe(PANEL_ID)
    expect(row.order).toBe(PANEL_ORDER)
    expect(row.order).toBe(20)
    expect(row.locale).toBe(NS)
    expect(row.component).toBe(WorkspaceConfigPanelIcon)
    expect(row.label).toBeTypeOf('function')
    expect(row.key).toBeUndefined()
    expect(row.children).toBeUndefined()
    expect(row.inject).toBeUndefined()
  })

  it('PANEL_ID 同时是 main 的 key 与 panellist 的 id（宿主 selectPanel 直接用它）', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    const page = registrationOf(fake.registrations, 'main')
    const row = registrationOf(fake.registrations, 'sidebar.panellist')
    expect(page.key).toBe(row.id)
    expect(page.key).toBe(PANEL_ID)
  })
})

describe('配对协调（同生共死）', () => {
  it('页面装失败 → 行绝不注册，apply 正常返回且只留两条警告', () => {
    const fake = createFakeContext({ rejectSeats: ['main'] })

    expect(() => {
      apply(fake.ctx)
    }).not.toThrow()

    expect(fake.registrations).toEqual([])
    expect(fake.warnings).toHaveLength(2)
    expect(fake.warnings[0]?.[0]).toContain('workspace-config: 页面座位注册失败，本页面不显示')
    // 失败消息 + 原始异常各一条。
    expect(fake.warnings[1]?.[0]).toBeInstanceOf(Error)
  })

  it('行座位先到 → 只登记装法；页面到后行补装（顺序先页后行）', () => {
    const fake = createFakeContext({ declaredSeats: ['sidebar.panellist'] })
    apply(fake.ctx)

    // 行座位先到、页面座位尚未声明：行不单独注册（否则宿主点击会抛错）。
    expect(fake.injections.find((record) => record.key === 'main')?.executed).toBe(false)
    expect(fake.registrations).toEqual([])

    fake.declare('main')

    expect(fake.registrations.map((entry) => entry.name)).toEqual(['main', 'sidebar.panellist'])
    expect(fake.log.indexOf('register:main')).toBeLessThan(fake.log.indexOf('register:sidebar.panellist'))
    expect(fake.warnings).toEqual([])
  })

  it('页面退场 → 行一并退场，顺序是先摘行、再摘页面；幂等', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    fake.disposeSeat('main')

    expect(fake.log.slice(-2)).toEqual(['dispose:sidebar.panellist', 'dispose:main'])
    const before = fake.log.length
    fake.disposeSeat('main')
    expect(fake.log).toHaveLength(before)
  })

  it('行座位先退场 → 只摘行，页面留着', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    fake.disposeSeat('sidebar.panellist')

    expect(fake.log.slice(-1)).toEqual(['dispose:sidebar.panellist'])
    expect(fake.log).not.toContain('dispose:main')
  })

  it('行注册抛错只 warn，页面不受连累', () => {
    const fake = createFakeContext({ rejectSeats: ['sidebar.panellist'] })

    expect(() => {
      apply(fake.ctx)
    }).not.toThrow()

    expect(fake.registrations.map((entry) => entry.name)).toEqual(['main'])
    expect(fake.warnings).toHaveLength(2)
    expect(fake.warnings[0]?.[0]).toContain('workspace-config: 侧栏面板行注册失败，本入口不显示')
  })

  it('两个座位都未声明：回调不执行、不注册、不警告', () => {
    const fake = createFakeContext({ declaredSeats: [] })

    expect(() => {
      apply(fake.ctx)
    }).not.toThrow()

    expect(fake.injections.map((record) => record.key)).toEqual(['main', 'sidebar.panellist'])
    expect(fake.injections.every((record) => record.executed)).toBe(false)
    expect(fake.registrations).toEqual([])
    expect(fake.warnings).toEqual([])
  })
})

describe('依赖面与常量', () => {
  it('inject 只声明 slots 与 locale（不声明贡献方包，D3）', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('类型权威 re-export：座位名与面板常量与注册面一致', () => {
    // 运行时常量的值（类型 re-export 见 `index.ts` 的 `export type`，编译期守护）。
    expect(WORKSPACE_CONFIG_SECTION).toBe('workspace-config.section')
    expect(PANEL_ID).toBe('workspace-config')
    expect(PANEL_ORDER).toBe(20)
  })
})
