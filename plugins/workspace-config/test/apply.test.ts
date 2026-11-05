/**
 * 浏览器半装配（`src/client/index.ts#apply`）的接线契约。
 *
 * 组件自身的行为由 `trigger.test.tsx` / `dialog.test.tsx` 覆盖，真 slots 的 children /
 * only 语义由 `section-seat.poc.test.tsx` 常驻守护；本套件只钉**装配事实**：
 *
 * - 字典**先于**座位注册；两处 `slots.inject` 按 footer → overlay 顺序；
 * - footer 注册面 `{ name, id, order: 50, locale, inject → { open } }`，组件是
 *   `WorkspaceConfigTrigger`；
 * - overlay 注册面 `{ name, id, order: 530, locale, children: {'workspace-config.section':
 *   { kind: 'list', scope: 'root' }}, inject → { open, sections } }`，组件是
 *   `WorkspaceConfigDialog`；`children` 声明是贡献方 inject 回调的授权前提（Declaring is
 *   claiming）；
 * - 入口与弹窗共享**同一个**打开桥实例（入口 open 后弹窗读到的就是它）；
 * - 两处软注册互相独立：任一处 `register` 抛错只 `logger.warn`，`apply` 正常返回，另一处
 *   照常注册；座位未声明时回调不执行、也不抛；
 * - 类型权威的 re-export 面（`#13` 的组 2 交接项）：座位常量与两个 order 能从
 *   `./client` 取到，值与注册面一致。
 *
 * 假 ctx 只实现 `apply` 摸得到的四个面（`effect` / `locale.register` / `slots.inject` /
 * `slots.register` / `logger`），`register` 按 `rejectSeats` 可选抛错——软注册的用例才有
 * 真实语义。不渲染组件，所以默认 node 环境即可。
 *
 * @module dsh-plugin-workspace-config/test/apply
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import {
  DIALOG_ID,
  TRIGGER_ID,
  apply,
  inject,
  WORKSPACE_CONFIG_DIALOG_ORDER,
  WORKSPACE_CONFIG_SECTION,
  WORKSPACE_CONFIG_TRIGGER_ORDER,
} from '../src/client/index.ts'
import { NS, en, zh } from '../src/client/locales.ts'
import { WorkspaceConfigDialog, type WorkspaceConfigDialogProps } from '../src/client/WorkspaceConfigDialog.tsx'
import { WorkspaceConfigTrigger, type WorkspaceConfigTriggerProps } from '../src/client/WorkspaceConfigTrigger.tsx'

/** 一次 `slots.register` 的实参（组件本身也记下，用于钉住座位与组件的对应关系）。 */
interface Registration {
  readonly name: string
  readonly id?: string
  readonly order?: number
  readonly locale?: string
  readonly children?: Readonly<Record<string, { kind: string; scope: string }>>
  readonly inject?: () => unknown
  readonly component?: unknown
}

/**
 * 取一次注册的注入面；注册缺席 / 无 inject 直接在用例里 fail loud（不靠可选链）。
 * @param registration - 记录到的注册面。
 * @returns 注入面（形状由调用方按组件 props 断言）。
 */
function injectedOf(registration: Registration | undefined): unknown {
  if (registration?.inject === undefined) {
    throw new Error('注册面缺少 inject 工厂')
  }
  return registration.inject()
}

/** 假 ctx 的开关。 */
interface FakeOptions {
  /** 已声明的座位名单（缺省为两个座位都已声明）。 */
  readonly declaredSeats?: readonly string[]
  /** 这些座位的 `register` 抛错（模拟座位在但拒绝 entry）。 */
  readonly rejectSeats?: readonly string[]
}

/**
 * 造一个够 `apply` 走完装配的假 ctx。
 * @param options - 座位声明面与注册失败开关。
 * @returns 假 ctx + 调用记录。
 */
function createFakeContext(options: FakeOptions = {}) {
  const declared = new Set(options.declaredSeats ?? ['sidebar.footer.action', 'shell.overlay'])
  const rejectSeats = new Set(options.rejectSeats ?? [])
  const log: string[] = []
  const registrations: Registration[] = []
  const injections: { key: string; callback: () => unknown; executed: boolean }[] = []
  const localeRegistrations: { ns: string; dicts: unknown }[] = []
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
    const record = { key, callback, executed: false }
    injections.push(record)
    if (declared.has(key)) {
      record.executed = true
      return callback()
    }
    // 座位未声明：真实运行时只登记等待（G3 PoC ④ 的补跑语义），这里同样不执行。
    return () => {}
  })

  const slots = {
    inject: injectSeat,
    register,
    // `createSectionsSource` 在 apply 期只构造、不读取；这几个面供类型与潜在订阅。
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
    logger: {
      warn: vi.fn((...args: unknown[]) => {
        warnings.push(args)
      }),
    },
  }

  return {
    ctx: ctx as unknown as ClientContext,
    log,
    registrations,
    injections,
    localeRegistrations,
    warnings,
    effects,
  }
}

describe('浏览器半装配（apply）', () => {
  it('字典先注册；两处 inject 按 footer → overlay 顺序执行', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    // 顺序：字典 → footer inject（回调内同步 register）→ overlay inject（同）。
    expect(fake.log.slice(0, 5)).toEqual([
      `locale:${NS}`,
      'inject:sidebar.footer.action',
      'register:sidebar.footer.action',
      'inject:shell.overlay',
      'register:shell.overlay',
    ])
    expect(fake.localeRegistrations).toEqual([{ ns: NS, dicts: { zh, en } }])
    // 两条 inject 都执行了（两个座位都已声明），且各自恰一次。
    expect(fake.injections.map((record) => record.key)).toEqual([
      'sidebar.footer.action',
      'shell.overlay',
    ])
    expect(fake.injections.every((record) => record.executed)).toBe(true)
    expect(fake.registrations).toHaveLength(2)
  })

  it('footer 注册面：order 50、locale NS、注入打开桥，组件是 WorkspaceConfigTrigger', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    const footer = fake.registrations.find((entry) => entry.name === 'sidebar.footer.action')
    expect(footer).toBeDefined()
    expect(footer?.id).toBe(TRIGGER_ID)
    expect(footer?.order).toBe(WORKSPACE_CONFIG_TRIGGER_ORDER)
    expect(footer?.order).toBe(50)
    expect(footer?.locale).toBe(NS)
    expect(footer?.children).toBeUndefined()
    expect(footer?.component).toBe(WorkspaceConfigTrigger)

    const injected = footer?.inject?.() as WorkspaceConfigTriggerProps
    expect(typeof injected.open.getSnapshot).toBe('function')
    expect(injected.open.getSnapshot()).toBe(false)
  })

  it('overlay 注册面：order 530、children 声明分节座位、注入打开桥与投影源，组件是 WorkspaceConfigDialog', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    const dialog = fake.registrations.find((entry) => entry.name === 'shell.overlay')
    expect(dialog).toBeDefined()
    expect(dialog?.id).toBe(DIALOG_ID)
    expect(dialog?.order).toBe(WORKSPACE_CONFIG_DIALOG_ORDER)
    expect(dialog?.order).toBe(530)
    expect(dialog?.locale).toBe(NS)
    // children 声明：kind/scope 与座位契约逐字一致（声明即认领，也是渲染授权）。
    expect(dialog?.children).toEqual({
      [WORKSPACE_CONFIG_SECTION]: { kind: 'list', scope: 'root' },
    })
    expect(dialog?.component).toBe(WorkspaceConfigDialog)

    const injected = dialog?.inject?.() as WorkspaceConfigDialogProps
    expect(typeof injected.open.getSnapshot).toBe('function')
    expect(typeof injected.sections.getSnapshot).toBe('function')
    expect(injected.sections.getSnapshot()).toEqual([])
  })

  it('入口与弹窗共享同一个打开桥实例', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    const footer = fake.registrations.find((entry) => entry.name === 'sidebar.footer.action')
    const dialog = fake.registrations.find((entry) => entry.name === 'shell.overlay')
    const fromTrigger = (injectedOf(footer) as WorkspaceConfigTriggerProps).open
    const fromDialog = (injectedOf(dialog) as WorkspaceConfigDialogProps).open

    expect(fromDialog).toBe(fromTrigger)
    // 入口写、弹窗读：同一实例的布尔快照立刻可见（D15 的跨 entry 打开桥）。
    fromTrigger.open()
    expect(fromDialog.getSnapshot()).toBe(true)
    fromDialog.close()
    expect(fromTrigger.getSnapshot()).toBe(false)
  })

  it('座位未声明时两处回调都不执行、不注册、不抛错', () => {
    const fake = createFakeContext({ declaredSeats: [] })

    expect(() => {
      apply(fake.ctx)
    }).not.toThrow()

    expect(fake.injections).toHaveLength(2)
    expect(fake.injections.every((record) => record.executed)).toBe(false)
    expect(fake.registrations).toEqual([])
    expect(fake.warnings).toEqual([])
  })

  it('footer 注册抛错只 warn，不连累 overlay 注册', () => {
    const fake = createFakeContext({ rejectSeats: ['sidebar.footer.action'] })

    expect(() => {
      apply(fake.ctx)
    }).not.toThrow()

    expect(fake.registrations.map((entry) => entry.name)).toEqual(['shell.overlay'])
    expect(fake.warnings.length).toBe(2)
    expect(fake.warnings[0]?.[0]).toContain('侧栏底部入口座位注册失败')
  })

  it('overlay 注册抛错只 warn，不连累 footer 注册', () => {
    const fake = createFakeContext({ rejectSeats: ['shell.overlay'] })

    expect(() => {
      apply(fake.ctx)
    }).not.toThrow()

    expect(fake.registrations.map((entry) => entry.name)).toEqual(['sidebar.footer.action'])
    expect(fake.warnings.length).toBe(2)
    expect(fake.warnings[0]?.[0]).toContain('统一弹窗座位注册失败')
  })

  it('两处同时抛错也只留两条警告，apply 正常返回', () => {
    const fake = createFakeContext({ rejectSeats: ['sidebar.footer.action', 'shell.overlay'] })

    expect(() => {
      apply(fake.ctx)
    }).not.toThrow()

    expect(fake.registrations).toEqual([])
    expect(fake.warnings.length).toBe(4)
  })

  it('字典注册挂在 ctx.effect 上（插件卸载即摘）', () => {
    const fake = createFakeContext()
    apply(fake.ctx)

    expect(fake.effects).toHaveLength(1)
    expect(fake.effects[0]?.label).toBe('workspace-config: 双语文案')
    expect(typeof fake.effects[0]?.dispose).toBe('function')
  })

  it('inject 只声明 slots 与 locale（不声明任何贡献方包，D3）', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('类型权威 re-export：座位常量与两个 order 与注册面一致', () => {
    // 运行时常量的值（类型 re-export 见 `index.ts` 的 `export type`，编译期守护）。
    expect(WORKSPACE_CONFIG_SECTION).toBe('workspace-config.section')
    expect(WORKSPACE_CONFIG_TRIGGER_ORDER).toBe(50)
    expect(WORKSPACE_CONFIG_DIALOG_ORDER).toBe(530)
  })
})
