/**
 * 浏览器半的接线（`src/client/index.ts#apply`）。
 *
 * 组件自身的行为由 `delete-menu-item` / `delete-dialog` 两个套件覆盖；这里覆盖的是
 * **注册契约**，也就是 spec「入口仅出现在已归档行（order 500）」「上游接触点全部软
 * 降级」两条要求真正落在哪几个座位上：
 *
 * - 字典注册先于任何带 `locale` 的 entry；
 * - `connection` / `workspaces` 就绪时注册徽章 + 菜单项（order 500）+ 覆盖层对话框；
 * - 二者缺一（软读，不在 cordis `inject` 名单里）时只注册徽章、告警一次、不抛错。
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
  apply,
  inject,
} from '../src/client/index.ts'

/** 一次 `slots.register` 调用。 */
interface Registration {
  readonly name: string
  readonly id: string
  readonly order: number
  readonly locale?: string
}

/** 客户端半会去找的座位：未声明的座位不会被 `slots.inject` 回调访问。 */
const DECLARED_SLOTS = [
  'conversation.composer.dock',
  'sidebar.workspaces.session.menu.item',
  'shell.overlay',
] as const

/**
 * 造一个最小的 client context：够 `apply` 走完注册路径，并把动作记进调用日志。
 * @param services - `connection` / `workspaces` 两个软读服务是否就位。
 * @returns fake context 与观测到的注册、日志与调用顺序。
 */
function fakeClient(services: { readonly connection?: unknown; readonly workspaces?: unknown }) {
  const log: string[] = []
  const registrations: Registration[] = []
  const registrants: string[] = []
  const warnings: unknown[][] = []
  const slotInjections: string[] = []

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
      register: (options: Registration & { readonly name: string }, component: unknown) => {
        log.push(`register:${options.name}`)
        registrations.push(options)
        registrants.push(typeof component)
        return () => {}
      },
    },
    modelDirectories: {
      directoryFor: () => ({
        store: { getSnapshot: () => ({}), subscribe: () => () => {} },
      }),
    },
    get: (name: string) => (name === 'connection' ? services.connection : name === 'workspaces' ? services.workspaces : undefined),
    logger: { warn: (...args: unknown[]) => { warnings.push(args) } },
  }

  return { ctx: ctx as never, log, registrations, registrants, warnings, slotInjections }
}

/** 一个够用的 connection / workspaces 假实现（`apply` 只持有引用）。 */
const READY_SERVICES = {
  connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
  workspaces: { list: { getSnapshot: () => ({ archivedSessionIds: [] }), subscribe: () => () => {} } },
}

describe('客户端半的注册契约', () => {
  it('硬依赖只有座位、字典与模型目录，connection / workspaces 是软读', () => {
    expect(inject).toEqual(['slots', 'locale', 'modelDirectories'])
  })

  it('两个服务就绪时：字典先注册，随后是徽章、菜单项（order 500）与覆盖层对话框', () => {
    const fake = fakeClient(READY_SERVICES)
    apply(fake.ctx)

    expect(fake.log).toEqual([
      'effect',
      'locale:webUx',
      'register:conversation.composer.dock',
      'register:sidebar.workspaces.session.menu.item',
      'register:shell.overlay',
    ])
    expect(fake.warnings).toEqual([])

    const byName = new Map(fake.registrations.map((registration) => [registration.name, registration]))
    expect(byName.get('conversation.composer.dock')).toMatchObject({ id: 'web-ux-provider', order: BADGE_ORDER })
    expect(byName.get('sidebar.workspaces.session.menu.item')).toMatchObject({
      id: DELETE_MENU_ID,
      order: DELETE_MENU_ORDER,
      locale: 'webUx',
    })
    expect(byName.get('shell.overlay')).toMatchObject({ id: DELETE_DIALOG_ID, order: DELETE_DIALOG_ORDER, locale: 'webUx' })
    expect(DELETE_MENU_ORDER).toBeGreaterThan(400)
  })

  it('只在声明了的座位上注册（未声明的座位不会凭空出现 entry）', () => {
    const fake = fakeClient(READY_SERVICES)
    apply(fake.ctx)

    expect([...fake.slotInjections].sort()).toEqual([...DECLARED_SLOTS].sort())
  })

  it.each([
    ['缺少 connection', { workspaces: READY_SERVICES.workspaces }],
    ['缺少 workspaces', { connection: READY_SERVICES.connection }],
    ['两者都缺', {}],
  ])('%s 时只注册徽章、告警一次、不抛错', (_label, services) => {
    const fake = fakeClient(services)
    expect(() => { apply(fake.ctx) }).not.toThrow()

    expect(fake.log).toEqual(['effect', 'locale:webUx', 'register:conversation.composer.dock'])
    expect(fake.warnings).toHaveLength(1)
    expect(fake.slotInjections).toEqual(['conversation.composer.dock'])
  })
})
