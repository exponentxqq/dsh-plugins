// @vitest-environment jsdom
/**
 * 统一弹窗壳（`src/client/WorkspaceConfigDialog.tsx`）的交互契约。
 *
 * 用例逐条对齐 code-design ①#9 / ③3.3 / D1 / D7 / D8：
 *
 * - **关闭态整颗不渲染**（不是 `Modal open={false}`）：`shell.overlay` 的直系子元素会吃
 *   页面点击，关闭时必须一个 DOM 都不留。
 * - **空态**：零分节时仍然渲染弹窗与解释（D5：入口恒在，空态在弹窗内），并有 `role="status"`。
 * - **nav 顺序 = order**（投影源已排序，壳不再二次重排）；`aria-current` 与
 *   `data-modal-autofocus` 落在当前选中节上，nav 本身是 `nav[aria-label]` 而非 tablist（D7）。
 * - **only 只渲染选中**：`renderSlot('workspace-config.section', { close }, { only })` 的
 *   三个实参都被断言（座位名、owner.close、过滤键）；切换分节只换 `only`。
 * - **关闭 → `close()`**：自绘关闭按钮写回打开桥；入口的 `aria-expanded` 因此复位。
 * - **选中节跨开合记忆**（D8）：关掉再打开仍停在原节；原节从账本消失才回落到首个。
 * - 分节晚到：空态弹窗在贡献方注册后自动长出 nav 与内容（投影源通知驱动）。
 * - 文末另有**四格安装组合矩阵（holder 侧）**：全装 / 只 holder / 后装 holder 三格用四个
 *   真 `apply` 同 ctx 组合（格 3「只贡献方」落在各贡献方自己的套件里）。
 *
 * `renderSlot` 用替身（真 renderer 的 children/only 语义由 `section-seat.poc.test.tsx`
 * 常驻守护）；primitives 由 `test/stubs/ui-primitives.tsx` 提供（Modal headless 分支）。
 *
 * @module dsh-plugin-workspace-config/test/dialog
 */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WorkspaceConfigDialog,
  type WorkspaceConfigDialogProps,
} from '../src/client/WorkspaceConfigDialog.tsx'
import { WorkspaceConfigTrigger } from '../src/client/WorkspaceConfigTrigger.tsx'
import { createOpenStore } from '../src/client/open-store.ts'
import type { WorkspaceConfigSectionRow, WorkspaceConfigSectionsSource } from '../src/client/sections.ts'
import { WORKSPACE_CONFIG_SECTION } from '../src/client/contract.ts'
import { zh, type Key } from '../src/client/locales.ts'
import { DIALOG_ID, TRIGGER_ID, apply as applyWorkspaceConfig } from '../src/client/index.ts'
// 四格安装组合矩阵要真的把「四包同装」装进同一个 ctx：holder 侧导入三个贡献方的浏览器半
// 装配入口（源码相对路径，测试侧专用；三包对 holder 仍只有 `import type`，运行时零耦合）。
// 贡献方组件只被导入、不被渲染，primitives 由 `test/stubs/ui-primitives.tsx` 承接。
import { apply as applyMultiRoot } from '../../multi-root-workspace/src/client/index.ts'
import { apply as applySessionToolToggle } from '../../session-tool-toggle/src/client/index.ts'
import { apply as applyWebUx } from '../../web-ux/src/client/index.ts'

afterEach(cleanup)

/** 造一行 nav 投影（用例只关心 id/order/label）。 */
function row(id: string, order: number, label: string): WorkspaceConfigSectionRow {
  return { id, order, label }
}

/** 可手动推进的 nav 投影源替身（identity 稳定，push 式通知）。 */
interface SectionsHarness {
  readonly source: WorkspaceConfigSectionsSource
  setRows(rows: readonly WorkspaceConfigSectionRow[]): void
}

/**
 * 造一个 nav 投影源替身。
 * @param initial - 初始行（已按 order 排好，壳不重排）。
 * @returns 投影源 + 手动换行并通知。
 */
function createSections(initial: readonly WorkspaceConfigSectionRow[] = []): SectionsHarness {
  let rows = initial
  const listeners = new Set<() => void>()
  return {
    source: {
      getSnapshot: () => rows,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    setRows: (next) => {
      rows = next
      for (const listener of Array.from(listeners)) listener()
    },
  }
}

/** `renderSlot` 替身的调用记录 + 渲染出的可见标记。 */
type RenderSlotMock = ReturnType<typeof vi.fn>

/** 渲染弹窗与它的依赖。 */
interface RenderDialogOptions {
  /** 初始是否打开（默认关闭）。 */
  readonly open?: boolean
  /** 初始 nav 行（默认空 = 空态）。 */
  readonly rows?: readonly WorkspaceConfigSectionRow[]
}

/**
 * 渲染统一弹窗。
 * @param options - 初始开合与 nav 行。
 * @returns render 结果 + 打开桥 + 投影源 + 断言用的 `renderSlot` / `t` 替身。
 */
function renderDialog({ open: initiallyOpen = false, rows = [] }: RenderDialogOptions = {}) {
  const open = createOpenStore()
  if (initiallyOpen) open.open()
  const sections = createSections(rows)
  const t = vi.fn((key: Key) => zh[key as Key])
  const renderSlot = vi.fn(
    (
      key: string,
      owner: { close: () => void },
      opts?: { only?: string },
    ) => (
      <div
        data-testid="section-panel"
        data-key={key}
        data-only={opts?.only}
        data-close-type={typeof owner.close}
      >
        {`分节：${opts?.only ?? '未过滤'}`}
      </div>
    ),
  )
  const props = {
    open,
    sections: sections.source,
    t,
    renderSlot,
  } as unknown as WorkspaceConfigDialogProps

  return { ...render(<WorkspaceConfigDialog {...props} />), open, sections, t, renderSlot: renderSlot as RenderSlotMock }
}

/** 取 nav 内的按钮（避免与 header 的关闭按钮混淆）。 */
function navButtons(): HTMLElement[] {
  const nav = screen.getByRole('navigation', { name: zh['nav.label'] })
  return within(nav).getAllByRole('button')
}

/** 取 nav 内的按钮，但允许 nav 为空（空态用例）。 */
function queryNavButtons(): HTMLElement[] {
  const nav = screen.getByRole('navigation', { name: zh['nav.label'] })
  return within(nav).queryAllByRole('button') as HTMLElement[]
}

/** 当前带 `aria-current="true"` 的 nav 按钮文案。 */
function currentNavLabel(): string | null {
  const current = navButtons().find((button) => button.getAttribute('aria-current') === 'true')
  return current?.textContent ?? null
}

describe('统一弹窗壳（WorkspaceConfigDialog）', () => {
  it('关闭态整颗返回 null：没有任何 DOM、不调用 renderSlot', () => {
    const view = renderDialog({ open: false, rows: [row('a', 10, 'A')] })

    expect(view.container.innerHTML).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(view.renderSlot).not.toHaveBeenCalled()
  })

  it('零分节时渲染空态：标题、解释文案与 role="status"，nav 为空、不调用 renderSlot', () => {
    const view = renderDialog({ open: true, rows: [] })

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe(zh['dialog.title'])
    expect(screen.getByRole('heading', { name: zh['dialog.title'] })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain(zh['dialog.empty.title'])
    expect(screen.getByText(zh['dialog.empty.hint'])).toBeTruthy()
    expect(queryNavButtons()).toEqual([])
    expect(view.renderSlot).not.toHaveBeenCalled()
  })

  it('nav 顺序 = 投影源顺序；aria-current 与 data-modal-autofocus 落在当前选中节', () => {
    renderDialog({
      open: true,
      rows: [row('folders', 10, '工作区文件夹'), row('defaults', 20, '工作区默认档'), row('sessions', 30, '会话管理')],
    })

    const buttons = navButtons()
    expect(buttons.map((button) => button.textContent)).toEqual([
      '工作区文件夹',
      '工作区默认档',
      '会话管理',
    ])
    expect(currentNavLabel()).toBe('工作区文件夹')
    expect(buttons[0]?.getAttribute('data-modal-autofocus')).toBe('')
    expect(buttons[1]?.hasAttribute('data-modal-autofocus')).toBe(false)
  })

  it('renderSlot 只渲染当前选中节：座位名、owner.close 与 only 三个实参都正确', () => {
    const view = renderDialog({ open: true, rows: [row('a', 10, 'A'), row('b', 20, 'B')] })

    expect(view.renderSlot).toHaveBeenCalledTimes(1)
    const [key, owner, opts] = view.renderSlot.mock.calls[0] as [
      string,
      { close: () => void },
      { only?: string },
    ]
    expect(key).toBe(WORKSPACE_CONFIG_SECTION)
    expect(typeof owner.close).toBe('function')
    expect(opts).toEqual({ only: 'a' })
    expect(screen.getByTestId('section-panel').getAttribute('data-only')).toBe('a')

    // 点第二个分节：只换 only，不额外渲染非选中节（D8：only 重渲染、不 keep-mounted）。
    fireEvent.click(navButtons()[1] as HTMLElement)
    expect(view.renderSlot).toHaveBeenCalledTimes(2)
    expect(view.renderSlot.mock.calls[1]?.[2]).toEqual({ only: 'b' })
    expect(screen.getByTestId('section-panel').getAttribute('data-only')).toBe('b')
    expect(currentNavLabel()).toBe('B')
    expect(navButtons()[1]?.getAttribute('data-modal-autofocus')).toBe('')
  })

  it('owner.close 就是打开桥的 close：分节可经它关闭弹窗', () => {
    const view = renderDialog({ open: true, rows: [row('a', 10, 'A')] })
    const owner = view.renderSlot.mock.calls[0]?.[1] as { close: () => void }

    act(() => {
      owner.close()
    })

    expect(view.open.getSnapshot()).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('自绘关闭按钮写回 close()，弹窗卸载', () => {
    const view = renderDialog({ open: true, rows: [row('a', 10, 'A')] })

    fireEvent.click(screen.getByRole('button', { name: zh['dialog.close'] }))

    expect(view.open.getSnapshot()).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('选中节跨开合记忆：关闭再打开仍停在原节（D8）', () => {
    const view = renderDialog({ open: true, rows: [row('a', 10, 'A'), row('b', 20, 'B'), row('c', 30, 'C')] })

    fireEvent.click(navButtons()[2] as HTMLElement)
    expect(currentNavLabel()).toBe('C')

    act(() => {
      view.open.close()
    })
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => {
      view.open.open()
    })
    expect(currentNavLabel()).toBe('C')
    expect(screen.getByTestId('section-panel').getAttribute('data-only')).toBe('c')
  })

  it('选中节从账本消失时回落到 order 最小者（首个）', () => {
    const view = renderDialog({ open: true, rows: [row('a', 10, 'A'), row('b', 20, 'B')] })
    fireEvent.click(navButtons()[1] as HTMLElement)
    expect(currentNavLabel()).toBe('B')

    act(() => {
      view.sections.setRows([row('a', 10, 'A')])
    })

    expect(currentNavLabel()).toBe('A')
    expect(screen.getByTestId('section-panel').getAttribute('data-only')).toBe('a')
  })

  it('分节晚到：空态弹窗在路由源通知后自动长出 nav 与内容（无需重开弹窗）', () => {
    const view = renderDialog({ open: true, rows: [] })
    expect(screen.getByRole('status')).toBeTruthy()
    expect(view.renderSlot).not.toHaveBeenCalled()

    act(() => {
      view.sections.setRows([row('late', 10, '晚到分节')])
    })

    expect(screen.queryByRole('status')).toBeNull()
    expect(navButtons().map((button) => button.textContent)).toEqual(['晚到分节'])
    expect(view.renderSlot).toHaveBeenCalledWith(
      WORKSPACE_CONFIG_SECTION,
      expect.objectContaining({ close: expect.any(Function) }),
      { only: 'late' },
    )
  })
})

/* ================================================================================================
 * 四格安装组合矩阵（holder 侧；code-design ⑤G6 6.2 / tasks 7.1）
 *
 * 前三格在这里：**格 1 全装**（holder + 三个贡献方同 ctx，三分节按 order 10/20/30 出现在
 * nav，入口开合与弹窗共用打开桥）、**格 2 只 holder**（零分节仍渲染入口，弹窗空态不点名
 * 插件）、**格 4 后装 holder**（贡献方先 apply，holder 后到声明座位时待命回调同步补跑）。
 * **格 3 只贡献方×3** 落在各贡献方自己的套件里（它们才是「无 holder 时不触发、不报错」的
 * 主体）。
 *
 * 假 ctx 按 G3 PoC 钉住的运行时语义复刻座位账本（`test/section-seat.poc.test.tsx` 用真
 * `SlotRegistry` 守护语义本身）：`children` 写声明账本并同步补跑待命回调、`inject` 在座位
 * 未声明时只登记等待、`entries` 读各自账本、`getVersion` 随账本变化递增。与 PoC 的分工是
 * 「语义由真实现守护、组合由本套件回归」，所以这里不重复装载真 renderer。
 * ============================================================================================== */

/** 组合矩阵里宿主壳自己声明的座位（holder 与三个贡献方都往这些座位注册）。 */
const HOST_SEATS = [
  'sidebar.footer.action',
  'shell.overlay',
  'sidebar.right.tab.files.actions',
  'conversation.session.header.utilities',
  'conversation.composer.dock',
  'conversation.input.overlay',
  'sidebar.workspaces.session.menu.item',
] as const

/** 座位形状（children 声明里的 kind/scope）。 */
interface FakeSeatSpec {
  readonly kind: 'list'
  readonly scope: 'root'
}

/** 一次 `slots.register` 的实参（`entries()` 按真实形状包在 `options` 里）。 */
interface FakeRegistration {
  readonly name: string
  readonly id?: string
  readonly order?: number
  readonly label?: unknown
  readonly locale?: string
  readonly children?: Readonly<Record<string, FakeSeatSpec>>
  readonly inject?: () => Record<string, unknown>
}

/** 注册账本里的一条（真实 `StoredEntry` 的读取面：`entry.options.*`）。 */
interface FakeStoredEntry {
  readonly options: FakeRegistration
  readonly component?: unknown
}

/** 组合矩阵的假 ctx + 观测面。 */
interface Composition {
  readonly ctx: never
  /** 该座位当前注册账本。 */
  entries(seat: string): readonly FakeStoredEntry[]
  /** 按 id 取注册项（`shell.overlay` 上同时有 web-ux 删除弹窗与 holder 统一弹窗）。 */
  registrationById(id: string): FakeRegistration
  /** 按座位 + id 取注册项（同一 id 可同时挂在两个座位上，如 mrfw 的 `multi-root-folders`）。 */
  registrationOf(seat: string, id: string): FakeRegistration
  /** 该座位还在等待声明（尚未执行）的 `slots.inject` 回调数。 */
  pendingCount(seat: string): number
  /** `apply` 期间收集到的 `logger.warn` 实参。 */
  readonly warnings: readonly unknown[][]
}

/**
 * 造一个够四包 `apply` 走完装配的假 ctx。
 * @param declaredSeats - 初始已声明的座位（缺省 = 宿主壳自己的七个座位；分节座位只能由
 *   holder 的 `children` 声明）。
 * @returns 假 ctx 与账本观测面。
 */
function createComposition(declaredSeats: readonly string[] = HOST_SEATS): Composition {
  const specs = new Map<string, FakeSeatSpec>(
    declaredSeats.map((seat) => [seat, { kind: 'list', scope: 'root' }]),
  )
  const ledger = new Map<string, FakeStoredEntry[]>()
  const pending = new Map<string, Array<() => unknown>>()
  const versions = new Map<string, number>()
  const seatListeners = new Map<string, Set<() => void>>()
  const localeDictionaries = new Map<string, { zh: Record<string, string>; en: Record<string, string> }>()
  const localeListeners = new Set<() => void>()
  const warnings: unknown[][] = []
  const activeLocale = 'zh'
  let localeRevision = 0

  /** 账本版本 + 订阅通知（真实 `getVersion` / `subscribe` 的语义）。 */
  const notifySeat = (seat: string): void => {
    versions.set(seat, (versions.get(seat) ?? 0) + 1)
    for (const listener of Array.from(seatListeners.get(seat) ?? [])) listener()
  }

  /** 提交一次座位声明；若有待命回调则同步补跑（G3 PoC ④）。 */
  const declare = (seat: string, spec: FakeSeatSpec): void => {
    if (!specs.has(seat)) {
      specs.set(seat, spec)
      notifySeat(seat)
    }
    const waiting = pending.get(seat)
    if (waiting === undefined) return
    pending.delete(seat)
    for (const callback of waiting) callback()
  }

  const slots = {
    inject: (seat: string, callback: () => unknown): (() => void) => {
      if (specs.has(seat)) {
        const dispose = callback()
        return typeof dispose === 'function' ? (dispose as () => void) : () => {}
      }
      // 座位未声明：只登记等待，不执行、不抛（真实 SlotRegistry.inject 语义）。
      const waiting = pending.get(seat) ?? []
      waiting.push(callback)
      pending.set(seat, waiting)
      return () => {
        const list = pending.get(seat)
        const index = list?.indexOf(callback) ?? -1
        if (index >= 0) list?.splice(index, 1)
      }
    },
    register: (options: FakeRegistration, component?: unknown): (() => void) => {
      // 注册进未声明的座位在真实运行时 fail loud（不是软降级路径）。
      if (!specs.has(options.name)) throw new Error(`座位未声明：${options.name}`)
      const stored: FakeStoredEntry = { options, component }
      const entries = ledger.get(options.name) ?? []
      entries.push(stored)
      ledger.set(options.name, entries)
      // 声明即认领：children 写进声明账本后，贡献方的待命回调同步补跑。
      for (const [seat, spec] of Object.entries(options.children ?? {})) declare(seat, spec)
      notifySeat(options.name)
      return () => {
        const list = ledger.get(options.name)
        const index = list?.indexOf(stored) ?? -1
        if (index >= 0) list?.splice(index, 1)
        notifySeat(options.name)
      }
    },
    entries: (seat: string): readonly FakeStoredEntry[] => ledger.get(seat) ?? [],
    getVersion: (seat: string): number => versions.get(seat) ?? 0,
    subscribe: (seat: string, listener: () => void): (() => void) => {
      const listeners = seatListeners.get(seat) ?? new Set<() => void>()
      listeners.add(listener)
      seatListeners.set(seat, listeners)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  const locale = {
    register: (ns: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }) => {
      localeDictionaries.set(ns, dictionaries)
      localeRevision += 1
      for (const listener of Array.from(localeListeners)) listener()
      return () => {}
    },
    // 贡献方的分节 label thunk 经它求值：zh 字典里的 `section.label`。
    bind: (ns: string) => (key: string) => localeDictionaries.get(ns)?.[activeLocale]?.[key] ?? key,
    getSnapshot: () => ({ active: activeLocale, locales: ['zh', 'en'], revision: localeRevision }),
    subscribe: (listener: () => void) => {
      localeListeners.add(listener)
      return () => {
        localeListeners.delete(listener)
      }
    },
  }

  const ctx = {
    effect: (callback: () => unknown) => {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale,
    slots,
    logger: {
      warn: (...args: unknown[]) => {
        warnings.push(args)
      },
    },
    on: () => () => {},
    // 组合矩阵不触达业务通道：四包的浏览器半在渲染期软读这些服务（缺席是受支持状态）。
    get: () => undefined,
    modelDirectories: {
      directoryFor: () => ({ store: { getSnapshot: () => ({}), subscribe: () => () => {} } }),
    },
  }

  return {
    ctx: ctx as never,
    entries: (seat) => ledger.get(seat) ?? [],
    registrationById: (id) => {
      for (const entries of ledger.values()) {
        const found = entries.find((entry) => entry.options.id === id)
        if (found !== undefined) return found.options
      }
      throw new Error(`missing registration: ${id}`)
    },
    registrationOf: (seat, id) => {
      const found = (ledger.get(seat) ?? []).find((entry) => entry.options.id === id)
      if (found === undefined) throw new Error(`missing registration on ${seat}: ${id}`)
      return found.options
    },
    pendingCount: (seat) => pending.get(seat)?.length ?? 0,
    warnings,
  }
}

/** holder 命名空间的翻译（真实运行时由 locale 服务合成）。 */
const holderT = (key: Key): string => zh[key]

/** 统一弹窗 `renderSlot` 的替身：只把 `only` 渲染成一个标记节点（真语义由 PoC 守护）。 */
function sectionPanelMock() {
  return vi.fn(
    (key: string, owner: { close: () => void }, opts?: { only?: string }) => (
      <div
        data-testid="section-panel"
        data-key={key}
        data-only={opts?.only}
        data-close-type={typeof owner.close}
      >
        {`分节：${opts?.only ?? '未过滤'}`}
      </div>
    ),
  )
}

/** 渲染统一入口 + 弹窗（共享同一个打开桥，与真实 `shell.overlay` 组合一致）。 */
function renderComposed(world: Composition) {
  const footer = world.registrationById(TRIGGER_ID)
  const dialog = world.registrationById(DIALOG_ID)
  const footerInjected = footer.inject?.() as { open: ReturnType<typeof createOpenStore> } | undefined
  const dialogInjected = dialog.inject?.() as
    | { open: ReturnType<typeof createOpenStore>; sections: WorkspaceConfigSectionsSource }
    | undefined
  if (footerInjected === undefined || dialogInjected === undefined) {
    throw new Error('组合矩阵：入口或弹窗的注入面缺席')
  }
  const renderSlot = sectionPanelMock()
  const view = render(
    <>
      <WorkspaceConfigTrigger wide open={footerInjected.open} t={holderT} />
      <WorkspaceConfigDialog
        open={dialogInjected.open}
        sections={dialogInjected.sections}
        t={holderT}
        renderSlot={renderSlot}
      />
    </>,
  )
  return { ...view, open: footerInjected.open, sections: dialogInjected.sections, renderSlot }
}

/** 取 nav 内的按钮（空态时为空数组）。 */
function navButtonsOf(): HTMLElement[] {
  const nav = screen.getByRole('navigation', { name: zh['nav.label'] })
  return within(nav).queryAllByRole('button') as HTMLElement[]
}

describe('四格安装组合矩阵（holder 侧）', () => {
  it('格 1 全装：holder + 三贡献方同 ctx，三分节按 order 10/20/30 进 nav，入口与弹窗共用打开桥', () => {
    const world = createComposition()
    // 注册顺序刻意打乱：holder 先声明座位，三个贡献方按 web-ux → mrfw → stt 入场。
    // nav 的顺序必须来自 order 排序，而不是注册顺序。
    applyWorkspaceConfig(world.ctx)
    applyWebUx(world.ctx)
    applyMultiRoot(world.ctx)
    applySessionToolToggle(world.ctx)

    expect(world.warnings).toEqual([])
    // 三个分节都进了 holder 声明的座位；账本顺序是入场顺序（30/10/20）。
    expect(world.entries(WORKSPACE_CONFIG_SECTION).map((entry) => entry.options.id)).toEqual([
      'web-ux-session-manager',
      'multi-root-folders',
      'session-tool-toggle-workspace-defaults',
    ])
    // 三个 order 常量逐字钉住 10 / 20 / 30（D11）。
    const sectionOrders = new Map(
      world.entries(WORKSPACE_CONFIG_SECTION).map((entry) => [entry.options.id, entry.options.order]),
    )
    expect(sectionOrders.get('multi-root-folders')).toBe(10)
    expect(sectionOrders.get('session-tool-toggle-workspace-defaults')).toBe(20)
    expect(sectionOrders.get('web-ux-session-manager')).toBe(30)

    // holder 的两处注册面：入口 50、弹窗 530 + children 声明。
    expect(world.registrationById(TRIGGER_ID)).toMatchObject({
      name: 'sidebar.footer.action',
      order: 50,
      locale: 'workspaceConfig',
    })
    expect(world.registrationById(DIALOG_ID)).toMatchObject({
      name: 'shell.overlay',
      order: 530,
      children: { [WORKSPACE_CONFIG_SECTION]: { kind: 'list', scope: 'root' } },
    })

    // 迁移回归：其它三个座位上的既有 entry 没有被本次变更挪走或重复注册。
    expect(world.registrationOf('sidebar.right.tab.files.actions', 'multi-root-folders')).toMatchObject({
      order: 50,
    })
    expect(world.registrationOf('conversation.session.header.utilities', 'session-tool-toggle-panel')).toMatchObject({
      order: 20,
    })
    expect(world.registrationOf('sidebar.workspaces.session.menu.item', 'web-ux-delete-session')).toMatchObject({
      order: 500,
    })
    expect(world.registrationOf('shell.overlay', 'web-ux-delete-session-dialog')).toMatchObject({
      order: 500,
    })

    // 入口 + 弹窗：关闭态只有入口；点击后弹窗出现，nav 三行按 order 排列。
    const view = renderComposed(world)
    expect(screen.queryByRole('dialog')).toBeNull()
    const trigger = screen.getByRole('button', { name: zh['entry.label'] })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(navButtonsOf().map((button) => button.textContent)).toEqual([
      '工作区文件夹',
      '工作区默认档',
      '会话管理',
    ])
    // 内容列一次只渲染选中节：首节 = order 最小者（D8 的 only 过滤）。
    expect(view.renderSlot).toHaveBeenCalledTimes(1)
    expect(view.renderSlot).toHaveBeenLastCalledWith(
      WORKSPACE_CONFIG_SECTION,
      expect.objectContaining({ close: expect.any(Function) }),
      { only: 'multi-root-folders' },
    )
    expect(screen.getByTestId('section-panel').getAttribute('data-only')).toBe('multi-root-folders')
    // 点第三节：只换 only，不额外渲染其它分节。
    fireEvent.click(navButtonsOf()[2] as HTMLElement)
    expect(view.renderSlot).toHaveBeenCalledTimes(2)
    expect(view.renderSlot).toHaveBeenLastCalledWith(
      WORKSPACE_CONFIG_SECTION,
      expect.objectContaining({ close: expect.any(Function) }),
      { only: 'web-ux-session-manager' },
    )
    // 弹窗内关闭 → 入口的 aria-expanded 同步复位（同一打开桥）。
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.close'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('格 2 只 holder：零分节仍注册并渲染入口（D5），弹窗空态文案不点名任何插件（D14）', () => {
    const world = createComposition()
    applyWorkspaceConfig(world.ctx)

    // 只 holder：分节账本为空，入口与弹窗仍注册（D5 恒在，不引入「按节数隐藏」的第二规则）。
    expect(world.entries(WORKSPACE_CONFIG_SECTION)).toEqual([])
    expect(world.registrationById(TRIGGER_ID).order).toBe(50)
    expect(world.registrationById(DIALOG_ID).order).toBe(530)
    expect(world.warnings).toEqual([])

    const view = renderComposed(world)
    const trigger = screen.getByRole('button', { name: zh['entry.label'] })
    expect(trigger).toBeTruthy()
    fireEvent.click(trigger)

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(navButtonsOf()).toEqual([])
    const status = screen.getByRole('status')
    expect(status.textContent).toContain(zh['dialog.empty.title'])
    expect(screen.getByText(zh['dialog.empty.hint'])).toBeTruthy()
    // D14：空态只作泛化说明，不点名具体插件（否则新增第四节时文案立刻过期）。
    for (const pluginName of ['multi-root', 'session-tool-toggle', 'web-ux', 'workspace-config']) {
      expect(status.textContent ?? '').not.toContain(pluginName)
    }
    // 零分节时没有可渲染的分节，`renderSlot` 一次都不该被调用。
    expect(view.renderSlot).not.toHaveBeenCalled()
    // 入口可正常关闭（弹窗不因空态卡死）。
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.close'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('格 4 后装 holder：三贡献方先 apply 待命不报错，holder 后到声明座位时三分节同步补跑', () => {
    const world = createComposition()
    // 贡献方先入场：分节座位尚未声明（只装贡献方、未装 holder 的安装形态）。
    applyWebUx(world.ctx)
    applyMultiRoot(world.ctx)
    applySessionToolToggle(world.ctx)

    // 三条 `slots.inject` 全部待命：回调未执行、账本为空、不抛错、不 warn。
    expect(world.pendingCount(WORKSPACE_CONFIG_SECTION)).toBe(3)
    expect(world.entries(WORKSPACE_CONFIG_SECTION)).toEqual([])
    expect(world.warnings).toEqual([])
    // 缺 holder 不连累各包自己的其它 entry。
    expect(world.entries('conversation.session.header.utilities')).toHaveLength(1)
    expect(world.entries('sidebar.right.tab.files.actions')).toHaveLength(1)
    expect(world.entries('sidebar.workspaces.session.menu.item')).toHaveLength(1)
    expect(world.entries('shell.overlay')).toHaveLength(1) // 仅 web-ux 删除弹窗

    // holder 后到：注册 `shell.overlay` 时提交 children 声明 → 待命回调同步补跑。
    applyWorkspaceConfig(world.ctx)

    expect(world.pendingCount(WORKSPACE_CONFIG_SECTION)).toBe(0)
    expect(world.entries(WORKSPACE_CONFIG_SECTION).map((entry) => entry.options.id)).toEqual([
      'web-ux-session-manager',
      'multi-root-folders',
      'session-tool-toggle-workspace-defaults',
    ])
    // 补跑后 nav 投影立即可见（无需重开弹窗/重启）：注册顺序经 order 排序成 10/20/30。
    const dialogInjected = world.registrationById(DIALOG_ID).inject?.()
    if (dialogInjected === undefined) throw new Error('组合矩阵：弹窗注入面缺席')
    const sections = (dialogInjected as { sections: WorkspaceConfigSectionsSource }).sections
    expect(sections.getSnapshot()).toEqual([
      { id: 'multi-root-folders', order: 10, label: '工作区文件夹' },
      { id: 'session-tool-toggle-workspace-defaults', order: 20, label: '工作区默认档' },
      { id: 'web-ux-session-manager', order: 30, label: '会话管理' },
    ])
    // 补跑后入口 + 弹窗照常工作。
    renderComposed(world)
    fireEvent.click(screen.getByRole('button', { name: zh['entry.label'] }))
    expect(navButtonsOf().map((button) => button.textContent)).toEqual([
      '工作区文件夹',
      '工作区默认档',
      '会话管理',
    ])
  })
})
