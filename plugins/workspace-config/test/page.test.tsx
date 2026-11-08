// @vitest-environment jsdom
/**
 * 独立页面壳（`src/client/WorkspaceConfigPage.tsx`）的行为契约。
 *
 * 用例逐条对齐 code-design ① 1.1 的「页面壳行为」一行与 ③ 3.5 / 3.11：
 *
 * - **页头**：`<h1>` 是 `page.title`、简介是 `page.intro`，tablist 有可访问名；
 * - **tab 行**：行数与顺序 = `sections` 投影（壳不重排），`SegmentedTabs` 产出真
 *   `role="tablist"` / `role="tab"`；
 * - **a11y 互指**：选中 tab 的 `id` / `aria-controls` 与 `tabpanel` 的
 *   `aria-labelledby` / `id` 逐字对齐（切 tab 后重新对齐）；
 * - **切 tab 只换 `only`**：`renderSlot('workspace-config.section', { workspace }, { only })`
 *   的座位名与 owner 份额不变，只换过滤键；一次只渲染选中分节；
 * - **选择框**：候选 = 工作区 Host 顺序 + 末项「未分配」；选择变化把新份额下传
 *   `renderSlot`，且跨 tab 保留；手选值失效（工作区被删）回落到 Q10 默认；
 * - **空态**：零分节时 `pageBody` 里只有 `.empty[role=status]`，没有 tablist / tabpanel /
 *   选择框，也不调用 `renderSlot`；分节晚到后页面自动长出 tab 行；
 * - **pending 降级**：清单源未就绪时 toolbar 只渲染占位文案（不渲染假选择框按钮），
 *   份额降到 `{kind:'none'}`；清单转 `ready` 后同一挂载内自动长出选择框。
 *
 * 两个快照源用本地替身（identity 稳定的 push 式实现），`renderSlot` 也用替身——真
 * renderer 的 children / only / keyed 语义由 `section-seat.poc.test.tsx` 常驻守护，
 * 本套件只钉页面壳自己的派生与接线。primitives 走 `test/stubs/ui-primitives.tsx`。
 *
 * @module dsh-plugin-workspace-config/test/page
 */

import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  WorkspaceConfigSectionOwnerProps,
  WorkspaceConfigWorkspaceContext,
} from '@dsh-plugins/contracts'
import {
  WorkspaceConfigPage,
  type WorkspaceConfigPageInjected,
  type WorkspaceConfigPageProps,
} from '../src/client/WorkspaceConfigPage.tsx'
import type {
  WorkspaceConfigSectionRow,
  WorkspaceConfigSectionsSource,
} from '../src/client/sections.ts'
import type {
  WorkspaceChoiceItem,
  WorkspaceListSnapshot,
  WorkspaceListSource,
} from '../src/client/workspace-source.ts'
import { selectionOfItem } from '../src/client/workspace-choice.ts'
import { WORKSPACE_CONFIG_SECTION } from '../src/client/contract.ts'
import { zh, type Key } from '../src/client/locales.ts'

afterEach(cleanup)

/** 造一行 tab 投影（用例只关心 id/order/label）。 */
function row(id: string, order: number, label: string): WorkspaceConfigSectionRow {
  return { id, order, label }
}

/** 可手动推进的 tab 投影源替身（identity 稳定，push 式通知）。 */
interface SectionsHarness {
  readonly source: WorkspaceConfigSectionsSource
  setRows(rows: readonly WorkspaceConfigSectionRow[]): void
}

/**
 * 造一个 tab 投影源替身。
 * @param initial - 初始行（已按 order 排好；壳不重排，见「tab 行顺序」用例）。
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

/** 可手动推进的清单源替身（identity 稳定，push 式通知）。 */
interface ListHarness {
  readonly source: WorkspaceListSource
  setSnapshot(snapshot: WorkspaceListSnapshot): void
}

/**
 * 造一个清单源替身。
 * @param initial - 初始快照。
 * @returns 清单源 + 手动换快照并通知。
 */
function createList(initial: WorkspaceListSnapshot): ListHarness {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    setSnapshot: (next) => {
      snapshot = next
      for (const listener of Array.from(listeners)) listener()
    },
  }
}

/** 两个工作区行（Host 顺序：先 W1 后 W2；标题与 path 都不同以便区分）。 */
const W1: WorkspaceChoiceItem = {
  id: 'w-1',
  title: '工作区一',
  path: '/repos/one',
  sessionIds: ['s-1'],
}
const W2: WorkspaceChoiceItem = {
  id: 'w-2',
  title: '工作区二',
  path: '/repos/two',
  sessionIds: ['s-2'],
}

/** `ready` 且给定工作区行的清单快照。 */
function ready(...items: WorkspaceChoiceItem[]): WorkspaceListSnapshot {
  return { phase: 'ready', items }
}

/** 服务未就绪的清单快照。 */
const PENDING: WorkspaceListSnapshot = { phase: 'pending', items: [] }

/** 页面 `renderSlot` 在本套件里的窄签名（真签名由真 renderer 的座位声明收窄）。 */
type SectionRender = (
  key: 'workspace-config.section',
  owner: WorkspaceConfigSectionOwnerProps,
  opts?: { only?: string },
) => ReactNode

/** 把 owner 份额写进 DOM 的稳定文本（断言「份额到达」用）。 */
function workspaceText(workspace: WorkspaceConfigWorkspaceContext): string {
  return workspace.kind === 'workspace'
    ? `workspace:${workspace.id}:${workspace.path}`
    : workspace.kind
}

/** 一次 `renderSlot` 调用的可读投影（断言「只换 only」用）。 */
interface RenderSlotCall {
  readonly key: string
  readonly owner: WorkspaceConfigSectionOwnerProps
  readonly opts: { only?: string } | undefined
}

/** 页面渲染 + 断言用的夹具。 */
interface PageView {
  readonly unmount: () => void
  readonly sections: SectionsHarness
  readonly workspaces: ListHarness
  readonly renderSlot: ReturnType<typeof vi.fn<SectionRender>>
  /** `renderSlot` 的全部调用（按发生顺序）。 */
  calls(): readonly RenderSlotCall[]
  /** 最后一次 `renderSlot` 调用；从未调用时 fail loud。 */
  lastCall(): RenderSlotCall
}

/** `renderPage` 的可调份额。 */
interface RenderPageOptions {
  /** 初始 tab 行（默认一行 section A）。 */
  readonly rows?: readonly WorkspaceConfigSectionRow[]
  /** 初始清单快照（默认 ready + W1）。 */
  readonly list?: WorkspaceListSnapshot
  /** 会话 `updatedAt` 读数（Q10 第一档）。 */
  readonly sessionUsage?: WorkspaceConfigPageInjected['sessionUsage']
  /** 当前会话 id（Q10 第二档）。 */
  readonly currentSessionId?: WorkspaceConfigPageInjected['currentSessionId']
}

/**
 * 渲染页面壳。
 *
 * 组件的 props 还含框架运行时注入的全局标准面（`PropsRuntime<'main'>` 的 `use*` Hook），
 * 本套件不装 renderer，因此只造组件真正消费的六个 share，再由 `pageProps` 用一次
 * `as unknown as` 补齐注入面——这是运行时装配缺口，不是对 props 形状的抑制：六个 share
 * 的入参类型仍取自 `WorkspaceConfigPageProps`，传错形状会在调用点报错。
 * @param options - tab 行、清单快照与会话读数。
 * @returns render 结果 + 两个快照源替身 + `renderSlot` 调用面。
 */
function renderPage(options: RenderPageOptions = {}): PageView {
  const sections = createSections(options.rows ?? [row('a', 10, '分节 A')])
  const workspaces = createList(options.list ?? ready(W1))
  const renderSlot = vi.fn<SectionRender>((key, owner, opts) => (
    <div
      data-testid="section-slot"
      data-slot-key={key}
      data-only={opts?.only}
      data-workspace={workspaceText(owner.workspace)}
    />
  ))
  const props = {
    sections: sections.source,
    workspaces: workspaces.source,
    renderSlot,
    t: (key: Key) => zh[key],
    currentSessionId: options.currentSessionId ?? (() => undefined),
    sessionUsage: options.sessionUsage ?? (() => undefined),
  } as unknown as WorkspaceConfigPageProps

  const view = render(<WorkspaceConfigPage {...props} />)
  return {
    unmount: view.unmount,
    sections,
    workspaces,
    renderSlot,
    calls: () =>
      renderSlot.mock.calls.map(([key, owner, opts]) => ({ key, owner, opts })),
    lastCall: () => {
      const call = renderSlot.mock.calls.at(-1)
      if (call === undefined) throw new Error('页面没有调用 renderSlot')
      return { key: call[0], owner: call[1], opts: call[2] }
    },
  }
}

/** 取页面 tablist 里的 tab 按钮（按 DOM 顺序）。 */
function tabs(): HTMLElement[] {
  return screen.getAllByRole('tab') as HTMLElement[]
}

/** 打开工作区选择框并返回菜单行。 */
function openPicker(): HTMLElement[] {
  fireEvent.click(screen.getByRole('button', { name: zh['page.workspace.label'] }))
  return screen.getAllByRole('menuitem') as HTMLElement[]
}

describe('页头与 tab 行', () => {
  it('标题、简介与 tablist 可访问名取自本命名空间文案', () => {
    renderPage({ rows: [row('a', 10, '分节 A')] })

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe(zh['page.title'])
    expect(screen.getByText(zh['page.intro'])).toBeTruthy()
    expect(screen.getByRole('tablist').getAttribute('aria-label')).toBe(zh['page.tabs.label'])
  })

  it('tab 行数与顺序 = 分节投影顺序（壳不重排、不补行）', () => {
    renderPage({
      rows: [row('folders', 10, '工作区文件夹'), row('defaults', 20, '工作区默认档'), row('sessions', 30, '会话管理')],
    })

    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(tabs().map((tab) => tab.textContent)).toEqual([
      '工作区文件夹',
      '工作区默认档',
      '会话管理',
    ])
    // 默认选中 order 最小者（也就是第一个 tab）。
    expect(tabs()[0]?.getAttribute('aria-selected')).toBe('true')
    expect(tabs()[2]?.getAttribute('aria-selected')).toBe('false')
  })

  it('tab 与 tabpanel 的 id / aria-controls / aria-labelledby 逐字互指（切 tab 后重新对齐）', () => {
    renderPage({ rows: [row('a', 10, '分节 A'), row('b', 20, '分节 B')] })

    const assertPairwise = (): void => {
      const selected = tabs().find((tab) => tab.getAttribute('aria-selected') === 'true')
      const panel = screen.getByRole('tabpanel')
      expect(selected).toBeDefined()
      expect(selected?.id).not.toBe('')
      expect(panel.id).not.toBe('')
      // 选中 tab 指向 panel，panel 反过来指向同一个 tab。
      expect(selected?.getAttribute('aria-controls')).toBe(panel.id)
      expect(panel.getAttribute('aria-labelledby')).toBe(selected?.id)
    }

    assertPairwise()
    const initialTabId = tabs()[0]?.id

    fireEvent.click(tabs()[1] as HTMLElement)
    assertPairwise()
    // 切 tab 换的是选中身份：panel 的 id 与 labelledby 都跟着换。
    expect(tabs()[1]?.id).not.toBe(initialTabId)
  })
})

describe('切 tab：只换 only', () => {
  it('座位名与 owner 份额不变，只换过滤键；一次只渲染选中分节', () => {
    const view = renderPage({ rows: [row('a', 10, '分节 A'), row('b', 20, '分节 B')] })

    const initial = view.lastCall()
    expect(initial.key).toBe(WORKSPACE_CONFIG_SECTION)
    expect(initial.opts).toEqual({ only: 'a' })
    expect(initial.owner).toEqual({ workspace: selectionOfItem(W1) })
    // 替身一次只渲染一个分节标记（真 renderer 的 only 语义另由 PoC 守护）。
    expect(screen.getAllByTestId('section-slot')).toHaveLength(1)

    fireEvent.click(tabs()[1] as HTMLElement)

    const after = view.lastCall()
    expect(after.key).toBe(initial.key)
    expect(after.owner).toEqual(initial.owner)
    expect(after.opts).not.toEqual(initial.opts)
    expect(after.opts).toEqual({ only: 'b' })
    expect(screen.getAllByTestId('section-slot')).toHaveLength(1)
    // tab 行本身还在（切 tab 不删注册，只换渲染过滤）。
    expect(tabs()).toHaveLength(2)
  })
})

describe('工作区选择框', () => {
  it('候选 = 工作区 Host 顺序 + 末项「未分配」；当前值带 data-selected', () => {
    // 故意按「非字典序」给 Host 顺序：W2 在前即默认选中 W2。
    const view = renderPage({ rows: [row('a', 10, '分节 A')], list: ready(W2, W1) })

    expect(view.lastCall().owner).toEqual({ workspace: selectionOfItem(W2) })
    const anchor = screen.getByRole('button', { name: zh['page.workspace.label'] })
    expect(anchor.textContent).toContain(W2.title)

    const items = openPicker()
    expect(items.map((item) => item.textContent)).toEqual([
      W2.title,
      W1.title,
      zh['page.workspace.unassigned'],
    ])
    // 选中在首项（Host 顺序第一）；「未分配」不是选中态。
    expect(items[0]?.getAttribute('data-selected')).toBe('true')
    expect(items[2]?.getAttribute('data-selected')).toBeNull()
  })

  it('选择变化把新份额下传 renderSlot，且跨 tab 保留；「未分配」也照原样下传', () => {
    const view = renderPage({ rows: [row('a', 10, '分节 A'), row('b', 20, '分节 B')], list: ready(W1, W2) })
    expect(view.lastCall().owner).toEqual({ workspace: selectionOfItem(W1) })

    // 手选 W2：菜单收起、份额立刻换、锚点文案跟着换。
    fireEvent.click(openPicker()[1] as HTMLElement)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(view.lastCall().owner).toEqual({ workspace: selectionOfItem(W2) })
    expect(screen.getByRole('button', { name: zh['page.workspace.label'] }).textContent).toContain(W2.title)

    // 切 tab：选择值跨 tab 保留（选择是页面级状态，不是分节级状态）。
    fireEvent.click(tabs()[1] as HTMLElement)
    expect(view.lastCall().opts).toEqual({ only: 'b' })
    expect(view.lastCall().owner).toEqual({ workspace: selectionOfItem(W2) })

    // 手选「未分配」：owner 份额是纯数据三态，不做二次解释。
    fireEvent.click(openPicker()[2] as HTMLElement)
    expect(view.lastCall().owner).toEqual({ workspace: { kind: 'unassigned' } })
    expect(screen.getByRole('button', { name: zh['page.workspace.label'] }).textContent).toContain(
      zh['page.workspace.unassigned'],
    )
  })

  it('手选值失效（工作区被删）时回退 Q10 默认档', () => {
    const view = renderPage({ rows: [row('a', 10, '分节 A')], list: ready(W1, W2) })
    fireEvent.click(openPicker()[1] as HTMLElement)
    expect(view.lastCall().owner).toEqual({ workspace: selectionOfItem(W2) })

    // W2 被删：手选值不再有效 → 按清单重解析默认（唯一剩下的 W1）。
    act(() => {
      view.workspaces.setSnapshot(ready(W1))
    })

    expect(view.lastCall().owner).toEqual({ workspace: selectionOfItem(W1) })
    expect(screen.getByRole('button', { name: zh['page.workspace.label'] }).textContent).toContain(
      W1.title,
    )
  })

  it('默认选择按 Q10：最近使用压过当前会话与第一项', () => {
    const view = renderPage({
      rows: [row('a', 10, '分节 A')],
      list: ready(W1, W2),
      // W2 的成员会话最近使用；当前会话属于 W1——第一档先命中 W2。
      sessionUsage: () => ({ updatedAtById: { 's-2': { updatedAt: 900 } } }),
      currentSessionId: () => 's-1',
    })

    expect(view.lastCall().owner).toEqual({ workspace: selectionOfItem(W2) })
  })
})

describe('空态与晚到分节', () => {
  it('零分节：只有 role="status" 空态，没有 tablist / tabpanel / 选择框，也不调用 renderSlot', () => {
    const view = renderPage({ rows: [] })

    const status = screen.getByRole('status')
    expect(status.textContent).toContain(zh['page.empty.title'])
    expect(status.textContent).toContain(zh['page.empty.hint'])
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tabpanel')).toBeNull()
    // 空态是整页唯一内容：工具栏与 tab 行都不渲染。
    expect(screen.queryByRole('button', { name: zh['page.workspace.label'] })).toBeNull()
    expect(view.renderSlot).not.toHaveBeenCalled()
  })

  it('分节晚到：空态页面在贡献方注册后自动长出 tab 行并渲染选中分节', () => {
    const view = renderPage({ rows: [] })
    expect(screen.queryByRole('tablist')).toBeNull()

    act(() => {
      view.sections.setRows([row('a', 10, '分节 A'), row('b', 20, '分节 B')])
    })

    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(tabs().map((tab) => tab.textContent)).toEqual(['分节 A', '分节 B'])
    expect(view.lastCall().opts).toEqual({ only: 'a' })
    expect(screen.getByRole('tabpanel')).toBeTruthy()
  })

  it('选中分节退场：回落到 order 最小者（不是空态、也不是残留在不存在的 id）', () => {
    const view = renderPage({ rows: [row('a', 10, '分节 A'), row('b', 20, '分节 B'), row('c', 30, '分节 C')] })
    fireEvent.click(tabs()[2] as HTMLElement)
    expect(view.lastCall().opts).toEqual({ only: 'c' })

    act(() => {
      view.sections.setRows([row('a', 10, '分节 A')])
    })

    expect(tabs()).toHaveLength(1)
    expect(view.lastCall().opts).toEqual({ only: 'a' })
    expect(tabs()[0]?.getAttribute('aria-selected')).toBe('true')
  })
})

describe('清单源 pending 的降级', () => {
  it('未就绪时渲染占位文案（不渲染禁用选择框按钮），份额降到 {kind:"none"}', () => {
    const view = renderPage({ rows: [row('a', 10, '分节 A')], list: PENDING })

    // 占位是纯 span 文案：没有可点的选择框（也不给一个假禁用按钮）。
    const placeholder = screen.getByText(zh['page.workspace.unavailable'])
    expect(placeholder.tagName).toBe('SPAN')
    expect(screen.queryByRole('button', { name: zh['page.workspace.label'] })).toBeNull()
    expect(document.querySelector('[aria-haspopup="menu"]')).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()

    // 页面照常渲染 tab 行；份额降级为「拿不到上下文」。
    expect(tabs()).toHaveLength(1)
    expect(view.lastCall().owner).toEqual({ workspace: { kind: 'none' } })
  })

  it('清单转 ready 后同一挂载内长出选择框，份额换成默认选择', () => {
    const view = renderPage({ rows: [row('a', 10, '分节 A')], list: PENDING })
    expect(view.lastCall().owner).toEqual({ workspace: { kind: 'none' } })

    act(() => {
      view.workspaces.setSnapshot(ready(W1, W2))
    })

    expect(screen.queryByText(zh['page.workspace.unavailable'])).toBeNull()
    const anchor = screen.getByRole('button', { name: zh['page.workspace.label'] })
    expect(anchor.textContent).toContain(W1.title)
    expect(view.lastCall().owner).toEqual({ workspace: selectionOfItem(W1) })

    // 选择框在 ready 之后才可用：菜单候选就是 Host 顺序 + 未分配。
    const items = openPicker()
    expect(items.map((item) => item.textContent)).toEqual([
      W1.title,
      W2.title,
      zh['page.workspace.unassigned'],
    ])
  })
})
