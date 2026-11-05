/**
 * 浏览器半的接线（`src/client/index.ts#apply`）。
 *
 * 组件自身的行为由 `delete-menu-item` / `delete-dialog` / `session-manager-trigger` /
 * `session-manager-dialog` 四个套件覆盖；这里覆盖的是
 * **注册契约**，也就是 spec「入口仅出现在已归档行（order 500）」「侧栏底部提供全局
 * 会话管理入口」「上游接触点全部软降级」几条要求真正落在哪几个座位上：
 *
 * - 字典注册先于任何带 `locale` 的 entry；
 * - 徽章、删除菜单项（order 500）、删除对话框、会话管理入口（`sidebar.footer.action`，
 *   order 100）与管理浮层（`shell.overlay`，order 520）都注册——**不依赖服务是否已就绪**：
 *   真实 web 壳的 `workspaces` 由 api-workspace-controller 在 remote 网关就绪后才 provide，
 *   晚于本插件 `apply`，所以这些 entry 在注入面里**渲染期**才 `ctx.get` 服务；
 * - 服务缺席时对应能力静默不渲染（删除面 `archived` / `client` 为 `undefined`；管理入口
 *   `ready=false`、浮层的 `client` / `workspaces` / `sessions` 为 `undefined`），徽章不受
 *   影响；服务随后就绪后同一注入面能立即解析到它们；
 * - 座位缺失（壳未声明底部动作 / 覆盖层座位）或座位拒绝注册时，`apply` 一律不抛，
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
  MANAGER_OVERLAY_ID,
  MANAGER_OVERLAY_ORDER,
  MANAGER_TRIGGER_ID,
  MANAGER_TRIGGER_ORDER,
  NOTICE_ID,
  NOTICE_ORDER,
  apply,
  inject,
} from '../src/client/index.ts'
import type { CommandNoticeCardProps } from '../src/client/CommandNoticeCard.tsx'
import type { SessionManagerDialogInjected } from '../src/client/SessionManagerDialog.tsx'
import type { SessionManagerTriggerInjected } from '../src/client/SessionManagerTrigger.tsx'

/** 一次 `slots.register` 调用（注入面也一并记下，供渲染期解析断言）。 */
interface Registration {
  readonly name: string
  readonly id: string
  readonly order: number
  readonly locale?: string
  readonly inject?: () => Record<string, unknown>
}

/** 客户端半会去找的座位：未声明的座位不会被 `slots.inject` 回调访问。 */
const DECLARED_SLOTS = [
  'conversation.composer.dock',
  'conversation.input.overlay',
  'sidebar.footer.action',
  'sidebar.workspaces.session.menu.item',
  'shell.overlay',
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
  const missingSeats = behavior.missingSeats ?? []
  const log: string[] = []
  const registrations: Registration[] = []
  const slotInjections: string[] = []
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
    },
    slots: {
      inject: (name: string, callback: () => unknown) => {
        slotInjections.push(name)
        if ((DECLARED_SLOTS as readonly string[]).includes(name) && !missingSeats.includes(name)) callback()
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

  return { ctx: ctx as never, log, registrations, slotInjections, eventListeners, provideLater }
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

/** 按 entry id 取注册项（`shell.overlay` 座位上有两个 entry，座位名不再唯一）。 */
function byId(registrations: readonly Registration[], id: string): Registration {
  const found = registrations.find((registration) => registration.id === id)
  if (found === undefined) throw new Error(`missing registration: ${id}`)
  return found
}

describe('客户端半的注册契约', () => {
  it('硬依赖只有座位、字典与模型目录，connection / workspaces / sessions 是渲染期软读', () => {
    expect(inject).toEqual(['slots', 'locale', 'modelDirectories'])
  })

  it('全部服务就绪时：字典先注册，随后是徽章、通知卡（order 10）、菜单项（order 500）、删除对话框、会话管理入口（order 100）与浮层（order 520），并挂上事件监听', () => {
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
      'register:sidebar.footer.action',
      'register:shell.overlay',
    ])
    // 六条 entry：徽章 / 通知卡 / 删除菜单项 / 删除对话框 / 管理入口 / 管理浮层。
    expect(fake.registrations).toHaveLength(6)

    const badge = bySlot(fake.registrations, 'conversation.composer.dock')
    expect(badge).toMatchObject({ id: 'web-ux-provider', order: BADGE_ORDER })
    const notice = bySlot(fake.registrations, 'conversation.input.overlay')
    expect(notice).toMatchObject({ id: NOTICE_ID, order: NOTICE_ORDER, locale: 'webUx' })
    const menu = bySlot(fake.registrations, 'sidebar.workspaces.session.menu.item')
    expect(menu).toMatchObject({ id: DELETE_MENU_ID, order: DELETE_MENU_ORDER, locale: 'webUx' })
    const dialog = bySlot(fake.registrations, 'shell.overlay')
    expect(dialog).toMatchObject({ id: DELETE_DIALOG_ID, order: DELETE_DIALOG_ORDER, locale: 'webUx' })
    const trigger = bySlot(fake.registrations, 'sidebar.footer.action')
    expect(trigger).toMatchObject({ id: MANAGER_TRIGGER_ID, order: MANAGER_TRIGGER_ORDER, locale: 'webUx' })
    const manager = byId(fake.registrations, MANAGER_OVERLAY_ID)
    expect(manager).toMatchObject({ name: 'shell.overlay', order: MANAGER_OVERLAY_ORDER, locale: 'webUx' })
    expect(NOTICE_ORDER).toBeGreaterThan(1)
    expect(DELETE_MENU_ORDER).toBeGreaterThan(400)
    expect(MANAGER_TRIGGER_ORDER).toBe(100)
    expect(MANAGER_OVERLAY_ORDER).toBe(520)
    // 两个浮层同座位：管理浮层必须晚于删除对话框，二者永不叠在一起。
    expect(MANAGER_OVERLAY_ORDER).toBeGreaterThan(DELETE_DIALOG_ORDER)

    // 删除面注入面在渲染期解析到真实服务。
    expect(menu.inject?.()).toMatchObject({ archived: READY_SERVICES.workspaces.list })
    expect(dialog.inject?.()).toMatchObject({ client: expect.objectContaining({ preview: expect.any(Function) }) })

    // 管理面注入面：入口的 ready 口径 + 浮层的四项软读；两个 entry 共用一个请求 store
    // （入口写入、浮层订阅）——这是跨 entry 通信的唯一通道（inject.hooks 不能第三方新增）。
    const triggerInjected = trigger.inject?.() as unknown as SessionManagerTriggerInjected
    const managerInjected = manager.inject?.() as unknown as SessionManagerDialogInjected
    expect(triggerInjected.ready).toBe(true)
    expect(triggerInjected.requests).toBe(managerInjected.requests)
    triggerInjected.requests.request()
    expect(managerInjected.requests.source.getSnapshot()).toMatchObject({ seq: 1 })
    expect(managerInjected.client).toEqual(
      expect.objectContaining({
        preview: expect.any(Function),
        previewBatch: expect.any(Function),
        disposeBatch: expect.any(Function),
      }),
    )
    expect(managerInjected.workspaces).toBe(READY_SERVICES.workspaces)
    expect(managerInjected.sessions).toBe(READY_SERVICES.sessions)

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

  it('服务尚未就绪时六个 entry 仍全部注册；注入面解析为 undefined（静默降级）', () => {
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
      'register:sidebar.footer.action',
      'register:shell.overlay',
    ])
    expect(fake.registrations).toHaveLength(6)
    // 五个座位各注入一次；shell.overlay 承载两个 entry，因此注入两次。
    expect([...new Set(fake.slotInjections)].sort()).toEqual([...DECLARED_SLOTS].sort())
    expect(fake.slotInjections.filter((name) => name === 'shell.overlay')).toHaveLength(2)

    const menu = bySlot(fake.registrations, 'sidebar.workspaces.session.menu.item')
    const dialog = bySlot(fake.registrations, 'shell.overlay')
    expect(menu.inject?.()).toMatchObject({ archived: undefined })
    expect(dialog.inject?.()).toMatchObject({ client: undefined })

    // 管理面：没有连接通道 → 入口 ready=false（整颗不渲染）；浮层的三项服务全部
    // undefined（客户端缺席 → 浮层静默不挂载），但请求 store 仍在——它决定浮层是否挂载。
    const trigger = bySlot(fake.registrations, 'sidebar.footer.action')
    expect(trigger.inject?.()).toMatchObject({ ready: false })
    const managerInjected = byId(fake.registrations, MANAGER_OVERLAY_ID).inject?.() as unknown as SessionManagerDialogInjected
    expect(managerInjected.client).toBeUndefined()
    expect(managerInjected.workspaces).toBeUndefined()
    expect(managerInjected.sessions).toBeUndefined()
    expect(managerInjected.requests.source.getSnapshot()).toBeNull()
  })

  it('服务在 apply 之后才 provide 时，同一注入面立刻能解析到它们', () => {
    const fake = fakeClient({})
    apply(fake.ctx)

    const menu = bySlot(fake.registrations, 'sidebar.workspaces.session.menu.item')
    const dialog = bySlot(fake.registrations, 'shell.overlay')
    const trigger = bySlot(fake.registrations, 'sidebar.footer.action')
    const manager = byId(fake.registrations, MANAGER_OVERLAY_ID)
    expect(menu.inject?.()).toMatchObject({ archived: undefined })
    expect(trigger.inject?.()).toMatchObject({ ready: false })
    const managerBefore = manager.inject?.() as unknown as SessionManagerDialogInjected
    expect(managerBefore.workspaces).toBeUndefined()

    fake.provideLater(READY_SERVICES)

    expect(menu.inject?.()).toMatchObject({ archived: READY_SERVICES.workspaces.list })
    expect(dialog.inject?.()).toMatchObject({ client: expect.objectContaining({ preview: expect.any(Function) }) })
    // 入口的就绪标记与浮层的两个快照同样在注入面（渲染期）解析。
    expect(trigger.inject?.()).toMatchObject({ ready: true })
    const managerInjected = manager.inject?.() as unknown as SessionManagerDialogInjected
    expect(managerInjected.client).toEqual(expect.objectContaining({ previewBatch: expect.any(Function) }))
    expect(managerInjected.workspaces).toBe(READY_SERVICES.workspaces)
    expect(managerInjected.sessions).toBe(READY_SERVICES.sessions)

    const notice = bySlot(fake.registrations, 'conversation.input.overlay')
    const injected = notice.inject?.() as unknown as CommandNoticeCardProps
    expect(injected.visibilityFor?.('session-1')?.getSnapshot()).toBe(1)
  })

  it('只在声明了的座位上注册（未声明的座位不会凭空出现 entry）', () => {
    const fake = fakeClient(READY_SERVICES)
    apply(fake.ctx)

    // 五个座位各注入一次；shell.overlay 上并列两个 entry，因此注入两次。
    expect([...new Set(fake.slotInjections)].sort()).toEqual([...DECLARED_SLOTS].sort())
    expect(fake.slotInjections.filter((name) => name === 'shell.overlay')).toHaveLength(2)
  })

  it('通道就绪但工作区/会话快照缺席时：入口仍可用，浮层保留客户端、两个快照为 undefined（渲染不可用空态）', () => {
    const fake = fakeClient({ connection: READY_SERVICES.connection })
    expect(() => { apply(fake.ctx) }).not.toThrow()

    // connection 在 → 入口可点；工作区 / 会话快照缺席不再是入口的就绪条件。
    expect(bySlot(fake.registrations, 'sidebar.footer.action').inject?.()).toMatchObject({ ready: true })

    // 浮层不 return null（否则用户什么解释都看不到），而是带着客户端与两个 undefined
    // 快照挂载，由组件渲染 `manager.unavailable` 空态。
    const managerInjected = byId(fake.registrations, MANAGER_OVERLAY_ID).inject?.() as unknown as SessionManagerDialogInjected
    expect(managerInjected.client).toEqual(expect.objectContaining({ previewBatch: expect.any(Function) }))
    expect(managerInjected.workspaces).toBeUndefined()
    expect(managerInjected.sessions).toBeUndefined()
  })

  it('两个新 entry 的座位缺失时静默：apply 不抛，缺座位的 entry 不注册、其余 entry 不受影响', () => {
    // 底部动作座位未声明：管理入口不出现，管理浮层与既有四条 entry 照常注册。
    const noFooter = fakeClient(READY_SERVICES, { missingSeats: ['sidebar.footer.action'] })
    expect(() => { apply(noFooter.ctx) }).not.toThrow()
    expect(noFooter.registrations.map((registration) => registration.id)).not.toContain(MANAGER_TRIGGER_ID)
    expect(noFooter.registrations).toHaveLength(5)
    expect(byId(noFooter.registrations, MANAGER_OVERLAY_ID)).toMatchObject({ name: 'shell.overlay' })

    // 覆盖层座位未声明：同座位上的删除对话框与管理浮层都不出现，入口与其余 entry 照常。
    const noOverlay = fakeClient(READY_SERVICES, { missingSeats: ['shell.overlay'] })
    expect(() => { apply(noOverlay.ctx) }).not.toThrow()
    expect(noOverlay.registrations.map((registration) => registration.id)).not.toContain(MANAGER_OVERLAY_ID)
    expect(noOverlay.registrations.map((registration) => registration.id)).not.toContain(DELETE_DIALOG_ID)
    expect(noOverlay.registrations).toHaveLength(4)
    expect(bySlot(noOverlay.registrations, 'sidebar.footer.action')).toMatchObject({ id: MANAGER_TRIGGER_ID })
  })

  it('座位拒绝注册时 try/catch 静默：apply 不抛，六条 entry 全部缺席（client 半不崩）', () => {
    const fake = fakeClient(READY_SERVICES, { rejectRegister: true })
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.registrations).toEqual([])
    // 六次注册都尝试过，只是每次都被 try/catch 吞掉；其余能力（字典/事件桥）不受影响。
    expect(fake.log.filter((line) => line.startsWith('register:'))).toHaveLength(6)
    expect(fake.eventListeners.get('command/executed')).toHaveLength(1)
  })
})
