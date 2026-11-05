/**
 * 浏览器半的接线（`src/client/index.ts#apply`）。
 *
 * 组件自身的行为由 `delete-menu-item` / `delete-dialog` / `session-manager-dialog` 三个
 * 套件覆盖；这里覆盖的是**注册契约**，也就是 spec「入口仅出现在已归档行（order 500）」
 * 「会话管理作为统一工作区配置弹窗的分节（order 30）」与「上游接触点全部软降级」几条
 * 要求真正落在哪几个座位上：
 *
 * - 字典注册先于任何带 `locale` 的 entry；
 * - 徽章、删除菜单项（order 500）、删除对话框（`shell.overlay`，order 500）与会话管理
 *   分节（`workspace-config.section`，order 30，label 为 thunk）都注册——**不依赖服务是否
 *   已就绪**：真实 web 壳的 `workspaces` 由 api-workspace-controller 在 remote 网关就绪后
 *   才 provide，晚于本插件 `apply`，所以这些 entry 在注入面里**渲染期**才 `ctx.get` 服务；
 * - 服务缺席时对应能力静默降级（删除面 `archived` / `client` 为 `undefined`；分节的
 *   `client` / `workspaces` / `sessions` 为 `undefined`，由分节渲染「服务未就绪」空态），
 *   徽章不受影响；服务随后就绪后同一注入面能立即解析到它们；
 * - 座位缺失（壳未声明行菜单 / 覆盖层 / 分节座位）或座位拒绝注册时，`apply` 一律不抛，
 *   只丢对应的 entry，其余既有能力不受影响。
 *
 * 不渲染任何组件，因此是普通 node 环境。
 *
 * @module dsh-plugin-web-ux/test/client-apply
 */

import { describe, expect, it } from 'vitest'
import {
  BADGE_ORDER,
  DELETE_DIALOG_ID,
  DELETE_DIALOG_ORDER,
  DELETE_MENU_ID,
  DELETE_MENU_ORDER,
  NOTICE_ID,
  NOTICE_ORDER,
  SECTION_ID,
  SECTION_ORDER,
  SECTION_SEAT,
  apply,
  inject,
} from '../src/client/index.ts'
import type { CommandNoticeCardProps } from '../src/client/CommandNoticeCard.tsx'
import type { SessionManagerSectionInjected } from '../src/client/SessionManagerDialog.tsx'

/** 一次 `slots.register` 调用（注入面也一并记下，供渲染期解析断言）。 */
interface Registration {
  readonly name: string
  readonly id: string
  readonly order: number
  readonly locale?: string
  readonly label?: string | (() => string)
  readonly inject?: () => Record<string, unknown>
}

/** 客户端半会去找的座位：未声明的座位不会被 `slots.inject` 回调访问。 */
const DECLARED_SLOTS = [
  'conversation.composer.dock',
  'conversation.input.overlay',
  'sidebar.workspaces.session.menu.item',
  'shell.overlay',
  'workspace-config.section',
] as const

/** 软读服务的一个最小替身。 */
interface Services {
  connection?: unknown
  workspaces?: unknown
  sessions?: unknown
}

/** 假 ctx 的座位/注册行为开关（默认：全部座位已声明、注册一律成功）。 */
interface FakeOptions {
  /**
   * 本次壳里未声明的座位：`slots.inject` 只登记等待、不执行回调——真实
   * `SlotRegistry.inject` 的语义（座位声明出现时才跑回调，见 registry.d.ts 的
   * `inject` 注释），也是 spec「上游座位缺失软降级」的触发条件。
   */
  readonly missingSeats?: readonly string[]
  /** 座位声明在但拒绝这个 entry：`slots.register` 一律抛错，走 `apply` 里的 try/catch。 */
  readonly rejectRegister?: boolean
}

/**
 * 造一个最小的 client context：够 `apply` 走完注册路径，并把动作记进调用日志。
 * @param initial - `connection` / `workspaces` / `sessions` 三个软读服务的初始就位状态。
 * @param behavior - 座位缺失 / 注册被拒的降级开关；缺省即全部座位已声明、注册成功。
 * @returns fake context 与观测到的注册、日志、事件监听、以及「服务随后就绪」的入口。
 */
function fakeClient(initial: Services, behavior: FakeOptions = {}) {
  // 可变副本：`declareSeat` 会把「后装 holder」的座位从缺席名单里移出。
  const missingSeats = [...(behavior.missingSeats ?? [])]
  const log: string[] = []
  const registrations: Registration[] = []
  const slotInjections: string[] = []
  /** 座位未声明时登记等待的 `slots.inject` 回调（真实 SlotRegistry 的补跑语义）。 */
  const pending = new Map<string, Array<() => unknown>>()
  const eventListeners = new Map<string, Array<(...args: never[]) => void>>()
  const services: Services = { ...initial }

  const ctx = {
    effect: (fn: () => unknown) => {
      log.push('effect')
      fn()
      return () => {}
    },
    locale: {
      register: (namespace: string) => {
        log.push(`locale:${namespace}`)
        return () => {}
      },
      // 分节 label 是 thunk：`apply` 期 bind 一次，读取期由 thunk 求值。替身直接回键名，
      // 用例据此断言「label 是函数且取到 section.label」。
      bind: (_namespace: string) => (key: string) => key,
    },
    slots: {
      inject: (name: string, callback: () => unknown) => {
        slotInjections.push(name)
        const declared = (DECLARED_SLOTS as readonly string[]).includes(name)
        if (declared && !missingSeats.includes(name)) {
          callback()
        } else if (declared) {
          // 座位在壳里但本次组合未声明（只贡献方 / holder 缺席）：只登记等待。
          const waiting = pending.get(name) ?? []
          waiting.push(callback)
          pending.set(name, waiting)
        }
      },
      register: (options: Registration, _component: unknown) => {
        log.push(`register:${options.name}`)
        if (behavior.rejectRegister === true) throw new Error(`座位拒绝了这个 entry：${options.id}`)
        registrations.push(options)
        return () => {}
      },
    },
    on: (name: string, listener: (...args: never[]) => void) => {
      log.push(`on:${name}`)
      const bucket = eventListeners.get(name) ?? []
      bucket.push(listener)
      eventListeners.set(name, bucket)
      return () => {}
    },
    modelDirectories: {
      directoryFor: () => ({
        store: { getSnapshot: () => ({}), subscribe: () => () => {} },
      }),
    },
    get: (name: string) =>
      name === 'connection'
        ? services.connection
        : name === 'workspaces'
          ? services.workspaces
          : name === 'sessions'
            ? services.sessions
            : undefined,
  }

  /** 模拟服务在 `apply` 之后才 provide。 */
  const provideLater = (next: Required<Services>): void => {
    services.connection = next.connection
    services.workspaces = next.workspaces
    services.sessions = next.sessions
  }

  return {
    ctx: ctx as never,
    log,
    registrations,
    slotInjections,
    eventListeners,
    provideLater,
    /** 该座位还在等待声明的回调数（「只贡献方」格与「后装 holder」格的观测面）。 */
    pendingCount: (name: string): number => pending.get(name)?.length ?? 0,
    /** 后装 holder：声明座位并同步补跑待命回调（真实 `SlotRegistry.inject` 的语义）。 */
    declareSeat: (name: string): void => {
      const index = missingSeats.indexOf(name)
      if (index >= 0) missingSeats.splice(index, 1)
      const waiting = pending.get(name) ?? []
      pending.delete(name)
      for (const callback of waiting) callback()
    },
  }
}

/** 一次 `command/executed` 派发（走 apply 注册的监听器）。 */
function emitExecuted(fake: ReturnType<typeof fakeClient>, sessionId: unknown, commandName: unknown, result: unknown): void {
  for (const listener of fake.eventListeners.get('command/executed') ?? []) {
    ;(listener as (s: unknown, c: unknown, r: unknown) => void)(sessionId, commandName, result)
  }
}

/** 一次够用的 connection / workspaces / sessions 假实现（注入面只持有引用）。 */
const READY_SERVICES = {
  connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
  workspaces: { list: { getSnapshot: () => ({ archivedSessionIds: [] }), subscribe: () => () => {} } },
  sessions: {
    retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 1, retainedBy: { mainView: 1 } }), subscribe: () => () => {} }),
  },
}

/** 按座位名取注册项。 */
function bySlot(registrations: readonly Registration[], name: string): Registration {
  const found = registrations.find((registration) => registration.name === name)
  if (found === undefined) throw new Error(`missing registration: ${name}`)
  return found
}

/** 按 entry id 取注册项（`shell.overlay` 座位上的删除、分节座位上的管理面各有一个 id）。 */
function byId(registrations: readonly Registration[], id: string): Registration {
  const found = registrations.find((registration) => registration.id === id)
  if (found === undefined) throw new Error(`missing registration: ${id}`)
  return found
}

describe('客户端半的注册契约', () => {
  it('硬依赖只有座位、字典与模型目录，connection / workspaces / sessions 是渲染期软读', () => {
    expect(inject).toEqual(['slots', 'locale', 'modelDirectories'])
  })

  it('全部服务就绪时：字典先注册，随后是徽章、通知卡（order 10）、菜单项（order 500）、删除对话框与会话管理分节（order 30），并挂上事件监听', () => {
    const fake = fakeClient(READY_SERVICES)
    apply(fake.ctx)

    expect(fake.log).toEqual([
      'effect',
      'locale:webUx',
      'register:conversation.composer.dock',
      'on:command/executed',
      'register:conversation.input.overlay',
      'register:sidebar.workspaces.session.menu.item',
      'register:shell.overlay',
      'register:workspace-config.section',
    ])
    // 五条 entry：徽章 / 通知卡 / 删除菜单项 / 删除对话框 / 会话管理分节。
    expect(fake.registrations).toHaveLength(5)

    const badge = bySlot(fake.registrations, 'conversation.composer.dock')
    expect(badge).toMatchObject({ id: 'web-ux-provider', order: BADGE_ORDER })
    const notice = bySlot(fake.registrations, 'conversation.input.overlay')
    expect(notice).toMatchObject({ id: NOTICE_ID, order: NOTICE_ORDER, locale: 'webUx' })
    const menu = bySlot(fake.registrations, 'sidebar.workspaces.session.menu.item')
    expect(menu).toMatchObject({ id: DELETE_MENU_ID, order: DELETE_MENU_ORDER, locale: 'webUx' })
    const dialog = bySlot(fake.registrations, 'shell.overlay')
    expect(dialog).toMatchObject({ id: DELETE_DIALOG_ID, order: DELETE_DIALOG_ORDER, locale: 'webUx' })
    expect(NOTICE_ORDER).toBeGreaterThan(1)
    expect(DELETE_MENU_ORDER).toBeGreaterThan(400)

    // 会话管理分节：注册进 holder 声明的座位，id 沿用旧浮层 id、label 是 locale thunk。
    expect(SECTION_SEAT).toBe('workspace-config.section')
    const section = bySlot(fake.registrations, SECTION_SEAT)
    expect(section).toMatchObject({ id: SECTION_ID, order: SECTION_ORDER, locale: 'webUx' })
    expect(SECTION_ORDER).toBe(30)
    expect(typeof section.label).toBe('function')
    expect((section.label as () => string)()).toBe('section.label')

    // 删除面注入面在渲染期解析到真实服务。
    expect(menu.inject?.()).toMatchObject({ archived: READY_SERVICES.workspaces.list })
    expect(dialog.inject?.()).toMatchObject({ client: expect.objectContaining({ preview: expect.any(Function) }) })

    // 分节注入面：三项软读都在渲染期解析；打开桥归 holder，本节不再持有请求 store。
    const sectionInjected = section.inject?.() as unknown as SessionManagerSectionInjected
    expect(sectionInjected.client).toEqual(
      expect.objectContaining({
        preview: expect.any(Function),
        previewBatch: expect.any(Function),
        disposeBatch: expect.any(Function),
      }),
    )
    expect(sectionInjected.workspaces).toBe(READY_SERVICES.workspaces)
    expect(sectionInjected.sessions).toBe(READY_SERVICES.sessions)
    expect(Object.keys(sectionInjected).sort()).toEqual(['client', 'sessions', 'workspaces'])

    // 通知卡注入面：store 读取/关闭面（运行时传全 store，类型收敛为读取面）
    // + 可见性源解析到计数 1。
    const noticeInjected = notice.inject?.() as unknown as CommandNoticeCardProps
    expect(Object.keys(noticeInjected.notices).sort()).toEqual(['dismiss', 'offer', 'source'])
    const visibility = noticeInjected.visibilityFor?.('session-1')
    expect(visibility?.getSnapshot()).toBe(1)
  })

  it('事件监听把命令结果送进通知 store；不合格载荷被丢弃', () => {
    const fake = fakeClient(READY_SERVICES)
    apply(fake.ctx)

    const notice = bySlot(fake.registrations, 'conversation.input.overlay')
    const { notices } = notice.inject?.() as unknown as CommandNoticeCardProps

    emitExecuted(fake, 'session-1', 'inventory', { kind: 'success', text: '清单' })
    expect(notices.source.noticeOf('session-1')).toMatchObject({ commandName: 'inventory', kind: 'success' })

    emitExecuted(fake, 'session-1', 'inventory', { kind: 'success' })
    expect(notices.source.noticeOf('session-1')).toMatchObject({ text: '清单' })

    // dismiss 共用同一 store 面（卡片关闭按钮的路径）。
    notices.dismiss('session-1')
    expect(notices.source.noticeOf('session-1')).toBeNull()
  })

  it('sessions 服务缺席时通知卡注入面软降级：可见性源为 undefined', () => {
    const fake = fakeClient({})
    apply(fake.ctx)

    const notice = bySlot(fake.registrations, 'conversation.input.overlay')
    const injected = notice.inject?.() as unknown as CommandNoticeCardProps
    expect(injected.visibilityFor?.('session-1')).toBeUndefined()
  })

  it('服务尚未就绪时五条 entry 仍全部注册；注入面解析为 undefined（静默降级）', () => {
    const fake = fakeClient({})
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.log).toEqual([
      'effect',
      'locale:webUx',
      'register:conversation.composer.dock',
      'on:command/executed',
      'register:conversation.input.overlay',
      'register:sidebar.workspaces.session.menu.item',
      'register:shell.overlay',
      'register:workspace-config.section',
    ])
    expect(fake.registrations).toHaveLength(5)
    // 五个座位各注入一次（shell.overlay 现在只承载删除对话框，管理面已迁到分节座位）。
    expect([...new Set(fake.slotInjections)].sort()).toEqual([...DECLARED_SLOTS].sort())
    expect(fake.slotInjections.filter((name) => name === 'shell.overlay')).toHaveLength(1)

    const menu = bySlot(fake.registrations, 'sidebar.workspaces.session.menu.item')
    const dialog = bySlot(fake.registrations, 'shell.overlay')
    expect(menu.inject?.()).toMatchObject({ archived: undefined })
    expect(dialog.inject?.()).toMatchObject({ client: undefined })

    // 分节：没有连接通道 → client undefined；两个快照同样 undefined（分节渲染空态）。
    const sectionInjected = bySlot(fake.registrations, SECTION_SEAT).inject?.() as unknown as SessionManagerSectionInjected
    expect(sectionInjected.client).toBeUndefined()
    expect(sectionInjected.workspaces).toBeUndefined()
    expect(sectionInjected.sessions).toBeUndefined()
  })

  it('服务在 apply 之后才 provide 时，同一注入面立刻能解析到它们', () => {
    const fake = fakeClient({})
    apply(fake.ctx)

    const menu = bySlot(fake.registrations, 'sidebar.workspaces.session.menu.item')
    const dialog = bySlot(fake.registrations, 'shell.overlay')
    const section = bySlot(fake.registrations, SECTION_SEAT)
    expect(menu.inject?.()).toMatchObject({ archived: undefined })
    const sectionBefore = section.inject?.() as unknown as SessionManagerSectionInjected
    expect(sectionBefore.workspaces).toBeUndefined()

    fake.provideLater(READY_SERVICES)

    expect(menu.inject?.()).toMatchObject({ archived: READY_SERVICES.workspaces.list })
    expect(dialog.inject?.()).toMatchObject({ client: expect.objectContaining({ preview: expect.any(Function) }) })
    // 分节的三个注入面同样在渲染期解析。
    const sectionInjected = section.inject?.() as unknown as SessionManagerSectionInjected
    expect(sectionInjected.client).toEqual(expect.objectContaining({ previewBatch: expect.any(Function) }))
    expect(sectionInjected.workspaces).toBe(READY_SERVICES.workspaces)
    expect(sectionInjected.sessions).toBe(READY_SERVICES.sessions)

    const notice = bySlot(fake.registrations, 'conversation.input.overlay')
    const injected = notice.inject?.() as unknown as CommandNoticeCardProps
    expect(injected.visibilityFor?.('session-1')?.getSnapshot()).toBe(1)
  })

  it('只在声明了的座位上注册（未声明的座位不会凭空出现 entry）', () => {
    const fake = fakeClient(READY_SERVICES)
    apply(fake.ctx)

    // 五个座位各注入一次；shell.overlay 上现在只有删除对话框一个 entry。
    expect([...new Set(fake.slotInjections)].sort()).toEqual([...DECLARED_SLOTS].sort())
    expect(fake.slotInjections.filter((name) => name === 'shell.overlay')).toHaveLength(1)
  })

  it('通道就绪但工作区/会话快照缺席时：分节仍注册，客户端在、两个快照为 undefined（渲染不可用空态）', () => {
    const fake = fakeClient({ connection: READY_SERVICES.connection })
    expect(() => { apply(fake.ctx) }).not.toThrow()

    // 分节不 return null（否则用户什么解释都看不到），而是带着客户端与两个 undefined
    // 快照挂载，由组件渲染 `manager.unavailable` 空态（D9）。
    const sectionInjected = bySlot(fake.registrations, SECTION_SEAT).inject?.() as unknown as SessionManagerSectionInjected
    expect(sectionInjected.client).toEqual(expect.objectContaining({ previewBatch: expect.any(Function) }))
    expect(sectionInjected.workspaces).toBeUndefined()
    expect(sectionInjected.sessions).toBeUndefined()
  })

  it('分节座位缺失时静默：apply 不抛，分节不注册、其余 entry 不受影响', () => {
    const noSection = fakeClient(READY_SERVICES, { missingSeats: [SECTION_SEAT] })
    expect(() => { apply(noSection.ctx) }).not.toThrow()
    expect(noSection.registrations.map((registration) => registration.id)).not.toContain(SECTION_ID)
    expect(noSection.registrations).toHaveLength(4)
    expect(byId(noSection.registrations, DELETE_DIALOG_ID)).toMatchObject({ name: 'shell.overlay' })
  })

  it('覆盖层座位缺失时：删除对话框不出现，分节与其余 entry 照常注册', () => {
    const noOverlay = fakeClient(READY_SERVICES, { missingSeats: ['shell.overlay'] })
    expect(() => { apply(noOverlay.ctx) }).not.toThrow()
    expect(noOverlay.registrations.map((registration) => registration.id)).not.toContain(DELETE_DIALOG_ID)
    expect(noOverlay.registrations).toHaveLength(4)
    expect(bySlot(noOverlay.registrations, SECTION_SEAT)).toMatchObject({ id: SECTION_ID })
  })

  it('座位拒绝注册时 try/catch 静默：apply 不抛，五条 entry 全部缺席（client 半不崩）', () => {
    const fake = fakeClient(READY_SERVICES, { rejectRegister: true })
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.registrations).toEqual([])
    // 五次注册都尝试过，只是每次都被 try/catch 吞掉；其余能力（字典/事件桥）不受影响。
    expect(fake.log.filter((line) => line.startsWith('register:'))).toHaveLength(5)
    expect(fake.eventListeners.get('command/executed')).toHaveLength(1)
  })
})

/**
 * 四格安装组合矩阵（本包视角；code-design ⑤G6 6.2 / tasks 7.1）。
 *
 * 全装格与「后装 holder 补跑」由 holder 的 `test/dialog.test.tsx` 用四个真 `apply` 同 ctx
 * 覆盖；这里钉本包的三格：**格 1**（holder 已声明分节座位 → 本节 order 30 注册，其余四条
 * entry 原样保留）、**格 3**（只装贡献方、无 holder → 分节 inject 待命，不注册、不抛错，
 * 其余四条 entry 不受影响）、**格 4**（holder 后到 → 待命回调补跑，分节立即可用）。
 */
describe('四格安装组合矩阵（web-ux 侧）', () => {
  it('格 1 全装：holder 声明分节座位时本节 order 30 注册，其余四条 entry 原样保留', () => {
    const fake = fakeClient(READY_SERVICES)
    apply(fake.ctx)

    expect(fake.pendingCount(SECTION_SEAT)).toBe(0)
    expect(fake.registrations).toHaveLength(5)
    expect(bySlot(fake.registrations, SECTION_SEAT)).toMatchObject({
      id: SECTION_ID,
      order: SECTION_ORDER,
      locale: 'webUx',
    })
    expect(SECTION_ORDER).toBe(30)
    // 徽章 / 通知卡 / 删除行菜单 / 删除弹窗四条既有 entry 的 id 与 order 原样保留。
    expect(byId(fake.registrations, 'web-ux-provider')).toMatchObject({ name: 'conversation.composer.dock' })
    expect(byId(fake.registrations, NOTICE_ID)).toMatchObject({ name: 'conversation.input.overlay', order: NOTICE_ORDER })
    expect(byId(fake.registrations, DELETE_MENU_ID)).toMatchObject({ name: 'sidebar.workspaces.session.menu.item', order: DELETE_MENU_ORDER })
    expect(byId(fake.registrations, DELETE_DIALOG_ID)).toMatchObject({ name: 'shell.overlay', order: DELETE_DIALOG_ORDER })
  })

  it('格 3 只贡献方（无 holder）：分节 inject 待命不注册、不抛错，其余四条 entry 不受影响', () => {
    const fake = fakeClient(READY_SERVICES, { missingSeats: [SECTION_SEAT] })
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.pendingCount(SECTION_SEAT)).toBe(1)
    expect(fake.registrations).toHaveLength(4)
    expect(fake.registrations.map((registration) => registration.id)).not.toContain(SECTION_ID)
    // 徽章、通知卡、删除行菜单与删除弹窗照常注册（缺 holder 不连累其它面）。
    expect(byId(fake.registrations, DELETE_MENU_ID)).toMatchObject({ order: DELETE_MENU_ORDER })
    expect(byId(fake.registrations, DELETE_DIALOG_ID)).toMatchObject({ order: DELETE_DIALOG_ORDER })
    expect(fake.eventListeners.get('command/executed')).toHaveLength(1)
  })

  it('格 4 后装 holder：贡献方先 apply，分节座位后声明时待命回调补跑，分节立即可用', () => {
    const fake = fakeClient(READY_SERVICES, { missingSeats: [SECTION_SEAT] })
    apply(fake.ctx)
    expect(fake.registrations).toHaveLength(4)
    expect(fake.pendingCount(SECTION_SEAT)).toBe(1)

    // holder 后到并声明 `workspace-config.section`：待命回调同步补跑。
    fake.declareSeat(SECTION_SEAT)

    expect(fake.pendingCount(SECTION_SEAT)).toBe(0)
    expect(fake.registrations).toHaveLength(5)
    const section = bySlot(fake.registrations, SECTION_SEAT)
    expect(section).toMatchObject({ id: SECTION_ID, order: SECTION_ORDER })
    expect(typeof section.label).toBe('function')
    expect((section.label as () => string)()).toBe('section.label')
    // 补跑注册的注入面照常解析到已就绪的通道与两个快照。
    const injected = section.inject?.() as unknown as SessionManagerSectionInjected
    expect(injected.client).toEqual(expect.objectContaining({ previewBatch: expect.any(Function) }))
    expect(injected.workspaces).toBe(READY_SERVICES.workspaces)
    expect(injected.sessions).toBe(READY_SERVICES.sessions)
    // 其余四条 entry 与事件桥不受补跑影响。
    expect(fake.eventListeners.get('command/executed')).toHaveLength(1)
    expect(fake.registrations.map((registration) => registration.id).sort()).toEqual(
      [DELETE_DIALOG_ID, DELETE_MENU_ID, NOTICE_ID, SECTION_ID, 'web-ux-provider'].sort(),
    )
  })
})
