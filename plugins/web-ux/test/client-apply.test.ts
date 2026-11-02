/**
 * 浏览器半的接线（`src/client/index.ts#apply`）。
 *
 * 组件自身的行为由 `delete-menu-item` / `delete-dialog` 两个套件覆盖；这里覆盖的是
 * **注册契约**，也就是 spec「入口仅出现在已归档行（order 500）」「上游接触点全部软
 * 降级」两条要求真正落在哪几个座位上：
 *
 * - 字典注册先于任何带 `locale` 的 entry；
 * - 徽章、菜单项（order 500）与覆盖层对话框都注册——**不依赖服务是否已就绪**：真实
 *   web 壳的 `workspaces` 由 api-workspace-controller 在 remote 网关就绪后才 provide，
 *   晚于本插件 `apply`，所以两个删除 entry 在注入面里**渲染期**才 `ctx.get` 服务；
 * - 服务缺席时删除 entry 静默不渲染（`archived` / `client` 为 `undefined`），徽章不受
 *   影响；服务随后就绪后同一注入面能立即解析到它们。
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
  apply,
  inject,
} from '../src/client/index.ts'
import type { CommandNoticeCardProps } from '../src/client/CommandNoticeCard.tsx'

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
  'sidebar.workspaces.session.menu.item',
  'shell.overlay',
] as const

/** 软读服务的一个最小替身。 */
interface Services {
  connection?: unknown
  workspaces?: unknown
  sessions?: unknown
}

/**
 * 造一个最小的 client context：够 `apply` 走完注册路径，并把动作记进调用日志。
 * @param initial - `connection` / `workspaces` / `sessions` 三个软读服务的初始就位状态。
 * @returns fake context 与观测到的注册、日志、事件监听、以及「服务随后就绪」的入口。
 */
function fakeClient(initial: Services) {
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
        if ((DECLARED_SLOTS as readonly string[]).includes(name)) callback()
      },
      register: (options: Registration, _component: unknown) => {
        log.push(`register:${options.name}`)
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

describe('客户端半的注册契约', () => {
  it('硬依赖只有座位、字典与模型目录，connection / workspaces / sessions 是渲染期软读', () => {
    expect(inject).toEqual(['slots', 'locale', 'modelDirectories'])
  })

  it('全部服务就绪时：字典先注册，随后是徽章、通知卡（order 10）、菜单项（order 500）与覆盖层对话框，并挂上事件监听', () => {
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
    ])

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

    // 注入面在渲染期解析到真实服务。
    expect(menu.inject?.()).toMatchObject({ archived: READY_SERVICES.workspaces.list })
    expect(dialog.inject?.()).toMatchObject({ client: expect.objectContaining({ preview: expect.any(Function) }) })

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

  it('服务尚未就绪时四个 entry 仍全部注册；注入面解析为 undefined（静默降级）', () => {
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
    ])
    expect([...fake.slotInjections].sort()).toEqual([...DECLARED_SLOTS].sort())

    const menu = bySlot(fake.registrations, 'sidebar.workspaces.session.menu.item')
    const dialog = bySlot(fake.registrations, 'shell.overlay')
    expect(menu.inject?.()).toMatchObject({ archived: undefined })
    expect(dialog.inject?.()).toMatchObject({ client: undefined })
  })

  it('服务在 apply 之后才 provide 时，同一注入面立刻能解析到它们', () => {
    const fake = fakeClient({})
    apply(fake.ctx)

    const menu = bySlot(fake.registrations, 'sidebar.workspaces.session.menu.item')
    const dialog = bySlot(fake.registrations, 'shell.overlay')
    expect(menu.inject?.()).toMatchObject({ archived: undefined })

    fake.provideLater(READY_SERVICES)

    expect(menu.inject?.()).toMatchObject({ archived: READY_SERVICES.workspaces.list })
    expect(dialog.inject?.()).toMatchObject({ client: expect.objectContaining({ preview: expect.any(Function) }) })

    const notice = bySlot(fake.registrations, 'conversation.input.overlay')
    const injected = notice.inject?.() as unknown as CommandNoticeCardProps
    expect(injected.visibilityFor?.('session-1')?.getSnapshot()).toBe(1)
  })

  it('只在声明了的座位上注册（未声明的座位不会凭空出现 entry）', () => {
    const fake = fakeClient(READY_SERVICES)
    apply(fake.ctx)

    expect([...fake.slotInjections].sort()).toEqual([...DECLARED_SLOTS].sort())
  })
})
