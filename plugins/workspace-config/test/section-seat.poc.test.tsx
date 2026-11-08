// @vitest-environment jsdom
/**
 * 分节座位运行时 PoC（真 renderer 哨兵，改挂 `main`）。
 *
 * 目的：用**真** `@deepseek-ai/dsh-client-ui-renderer` 的浏览器产物 + 真 cordis
 * `Context`，在 jsdom 里钉住「独立页面」形态下只有类型级证据、没有运行时自证的语义。
 * 场景与生产装配同构（code-design ① 1.1 的 PoC 一行）：
 *
 * ```
 * root（= AppFrame 位）声明 main(keyed, root)
 *   └─ 页面注册进 main（key = PANEL_ID）并 children 声明 workspace-config.section
 *        └─ 贡献方 slots.inject 软注册进分包座位
 * ```
 *
 * 五条断言：
 *
 * 1. **children 声明 + keyed 分发**：页面的 `children` 表把分节座位写进声明账本
 *    （`spec` 可读）；`main` 是 keyed 座位，root 用 `renderSlot('main', {}, { entryKey })`
 *    按 key 分发——只有 `key` 匹配的页面条目被渲染。
 * 2. **only 过滤 + 切 tab 卸载**：`renderSlot(SECTION, owner, { only })` 只渲染
 *    `options.id` 匹配的分节；切 tab 后上一节**从 DOM 卸载**（不是 display:none），
 *    未选中的 entry 仍留在注册账本。
 * 3. **`{workspace}` 份额到达**：页面每次渲染按当前选择传 owner 份额 `{ workspace }`；
 *    份额是纯数据（没有 `close` 回调），选中分节拿到当下值，换工作区后立刻更新。
 * 4. **后装补跑**：贡献方先 `slots.inject`（子座位尚未声明 → 回调延迟），页面后到并
 *    声明子座位时，待命回调在声明提交后同步补跑，先到的贡献不丢。
 * 5. **崩溃隔离**：某分节渲染期抛错由框架 `SlotErrorBoundary` 按 entry 隔离，并经
 *    `onEntryError` 上报（list 种类 `abdicate: true` 退场、账本保留）；页面壳与 root
 *    存活，切回兄弟分节仍可交互。holder 因此不自行 try/catch `renderSlot`。
 *
 * 为什么不是普通 `import`：上游包把浏览器半发成 `lib/client.js` 的
 * `window.__ModuleLoader__.load({ id, factory })` 壳，外部依赖（react / react-dom /
 * slots / cordis）由 dsh 的 loader 模块表注入，没有可直接 `import` 的 ESM 入口。
 * 本文件在测试侧最小复刻 loader：读入**真产物源码**，给出与宿主一致的模块表，
 * 捕获 factory 后调用。被测对象仍是真 renderer 实现，不 stub 任何
 * `SlotRegistry` / `register` / `inject` / `renderSlot` / `only` 语义。
 *
 * 常驻且不 skip：本文件是「main keyed / children / only / owner 份额 / inject / 崩溃边界
 * 语义漂移」的长期哨兵。测试内注释与断言话术均为 zh-CN；上游标识符保留原名。
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { useState, type ReactNode } from 'react'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Cordis from '@deepseek-ai/cordis'
import * as Slots from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceConfigWorkspaceContext } from '@dsh-plugins/contracts'
// 类型专用：加载两个模块增强声明——renderer 的 'root' / ctx.slots，layout 的 'main'。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// holder 的座位契约唯一权威（运行时只用座位名 / 面板 id 常量）。
import { PANEL_ID, WORKSPACE_CONFIG_SECTION } from '../src/client/contract.ts'

/** 座位名（与 contract.ts 的常量逐字一致；用例里显式断言这一点）。 */
const SECTION = WORKSPACE_CONFIG_SECTION

/** 面板 id（`main` 的 key，也是 sidebar.panellist 的 id）。 */
const PANEL = PANEL_ID

/** 真 renderer 浏览器产物被 loader 捕获后的 apply 面。 */
interface RealRendererClient {
  apply(ctx: Cordis.Context): void
}

/** loader 壳的登记记录（id 只用于诊断，PoC 不依赖）。 */
interface ModuleLoaderRecord {
  id: string
  factory: (requireModule: (name: string) => unknown) => RealRendererClient
}

/** 宿主 loader 注入给 renderer 外部依赖的模块表（与 dsh loader 同名同包）。 */
const EXTERNAL_MODULES: Readonly<Record<string, unknown>> = {
  react: React,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOMClient,
  'react/jsx-runtime': ReactJsxRuntime,
  '@deepseek-ai/dsh-client-ui-slots': Slots,
  '@deepseek-ai/cordis': Cordis,
}

/** 按宿主的模块表词解析外部依赖；表外模块立刻失败（不静默降级）。 */
function requireExternal(name: string): unknown {
  if (!Object.hasOwn(EXTERNAL_MODULES, name)) {
    throw new Error(`PoC 的 loader 模块表缺少外部模块：${name}`)
  }
  return EXTERNAL_MODULES[name]
}

let cachedRenderer: RealRendererClient | undefined

/**
 * 加载真 `@deepseek-ai/dsh-client-ui-renderer/client` 产物。
 *
 * 复刻 dsh loader 的两步：① 在 `window.__ModuleLoader__` 上承接
 * `{ id, factory }` 登记；② 用宿主模块表调用 factory，得到 `apply`。加载完成后
 * 还原 `__ModuleLoader__`，不污染其它用例。
 */
function loadRealRendererClient(): RealRendererClient {
  if (cachedRenderer !== undefined) return cachedRenderer

  const packageDir = dirname(
    createRequire(import.meta.url).resolve('@deepseek-ai/dsh-client-ui-renderer/package.json'),
  )
  const bundlePath = resolve(packageDir, 'lib/client.js')
  const source = readFileSync(bundlePath, 'utf8')

  // 真产物第 1 行的要求就是 window.__ModuleLoader__.load(...)；这里给它一个宿主同形面。
  const loaderWindow = globalThis.window as Window & {
    __ModuleLoader__?: { load(record: ModuleLoaderRecord): void }
  }
  const previousLoader = loaderWindow.__ModuleLoader__

  let loaded: RealRendererClient | undefined
  loaderWindow.__ModuleLoader__ = {
    load(record) {
      // factory 内会按 requires 取 react / slots / cordis；模块表由本测试提供。
      loaded = record.factory(requireExternal)
    },
  }

  try {
    // 用 Function 构造器执行 loader 壳（不是 import：该文件没有 ESM 导出）。
    // window 以宿主真实 jsdom window 传入，renderer 内部的 uSES shim 探测依赖 document。
    new Function('window', source)(loaderWindow)
  } finally {
    if (previousLoader === undefined) delete loaderWindow.__ModuleLoader__
    else loaderWindow.__ModuleLoader__ = previousLoader
  }

  if (loaded === undefined) {
    throw new Error('真 renderer 产物没有通过 window.__ModuleLoader__.load 完成登记')
  }
  cachedRenderer = loaded
  return loaded
}

/**
 * 安装一个「无会话」的 session 作用域适配器。
 *
 * 真 renderer 的 root 出口固定包一层 `ScopeProvider scope="session-maybe"`，它把
 * session-maybe 解析到已安装的 `session` 适配器；生产里由 dsh-client-ui-session 安装。
 * PoC 只关心 root / main 作用域的 children / only / keyed 语义，不需要会话数据，因此装
 * 一个空绑定（稳定快照、无订阅）即可——这不是 stub renderer，而是补上 renderer 正常
 * 装配所需的、与被测语义无关的会话作用域依赖。
 */
function installEmptySessionScope(ctx: Cordis.Context): void {
  const binding: Slots.StandardSourceBinding = {
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  }
  const current: Slots.HostObservable<Slots.StandardSourceBinding> = {
    getSnapshot: () => binding,
    subscribe: () => () => {},
  }
  ctx.slots.installScope('session', {
    current,
    bindingSource: () => current,
  })
}

/** 每个用例独立的真 cordis 根 Context + 已安装的真 renderer。 */
const liveContexts: Cordis.Context[] = []

function createRuntime(): Cordis.Context {
  const ctx = new Cordis.Context()
  loadRealRendererClient().apply(ctx)
  installEmptySessionScope(ctx)
  liveContexts.push(ctx)
  return ctx
}

// ---------------------------------------------------------------------------
// PoC 组件：模拟真实装配里的三层 —— root（AppFrame 位）/ 页面（main）/ 分节贡献方。
// ---------------------------------------------------------------------------

/** 「已登记工作区」那一支（PoC 只用这一支，便于读 `id` / `title` / `path`）。 */
type WorkspaceChoice = Extract<WorkspaceConfigWorkspaceContext, { kind: 'workspace' }>

/** 页面级工作区上下文（owner 份额的载荷，纯数据三态）。 */
const W_ONE: WorkspaceChoice = {
  kind: 'workspace',
  id: 'w-one',
  title: '工作区一',
  path: '/repos/one',
}
const W_TWO: WorkspaceChoice = {
  kind: 'workspace',
  id: 'w-two',
  title: '工作区二',
  path: '/repos/two',
}

/** 份额显示文案（断言「份额到达」用；三态都覆盖）。 */
function workspaceText(workspace: WorkspaceConfigWorkspaceContext): string {
  return workspace.kind === 'workspace' ? `${workspace.title}@${workspace.path}` : workspace.kind
}

/** 切换工作区的纯函数（PoC 页面里只有两态，够区分「份额真的更新了」）。 */
function nextWorkspaceOf(workspace: WorkspaceConfigWorkspaceContext): WorkspaceConfigWorkspaceContext {
  return workspace.kind === 'workspace' && workspace.id === W_ONE.id ? W_TWO : W_ONE
}

/** root 位（对应生产里的 ui-layout AppFrame）：声明 main(keyed) 并按面板 key 分发。 */
interface RootFrameProps {
  readonly renderSlot: (
    key: 'main',
    owner: object,
    opts: { entryKey?: string },
  ) => ReactNode
}

function RootFrame({ renderSlot }: RootFrameProps): ReactNode {
  return (
    <div data-testid="poc-root">
      {renderSlot('main', {}, { entryKey: PANEL })}
    </div>
  )
}

/** 分节座位的 owner 份额（与 `@dsh-plugins/contracts` 逐字同形：只有 `workspace`）。 */
interface SectionOwnerShare {
  readonly workspace: WorkspaceConfigWorkspaceContext
}

/** 分节 A：字符串 label 的贡献方（把份额写进 DOM 便于断言）。 */
function SectionA({ workspace }: SectionOwnerShare): ReactNode {
  return (
    <div data-testid="poc-section-a" data-workspace={workspaceText(workspace)}>
      分节 A：{workspaceText(workspace)}
    </div>
  )
}

/** 分节 B：thunk label 的贡献方。 */
function SectionB({ workspace }: SectionOwnerShare): ReactNode {
  return (
    <div data-testid="poc-section-b" data-workspace={workspaceText(workspace)}>
      分节 B：{workspaceText(workspace)}
    </div>
  )
}

/** 页面注入面：初始 tab 列表与初始工作区份额（只在注册时求值一次）。 */
interface PageInjected {
  readonly tabIds: readonly string[]
  readonly initialWorkspace: WorkspaceConfigWorkspaceContext
}

/** 页面组件的完整 props：注入面 + `children` 声明带来的 `renderSlot` 能力。 */
type PageProps = PageInjected & {
  readonly renderSlot: (
    key: 'workspace-config.section',
    owner: SectionOwnerShare,
    opts: { only?: string },
  ) => ReactNode
}

/**
 * 页面位：按生产同形调用 `renderSlot(SECTION, { workspace }, { only })`。
 *
 * kind 与 `tabIds` 都是页面本地 state（真实 holder 同样不把选中 tab / 选择值放进 store）；
 * 这里故意写座位字面量（而不是常量）：它是 `renderSlot('workspace-config.section'…)` 的
 * 直接调用点，与 `section-seat.poc.test.tsx` 的座位声明侧锚点成对出现。
 */
function PagePoC({ tabIds, initialWorkspace, renderSlot }: PageProps): ReactNode {
  const [active, setActive] = useState<string>(tabIds[0] ?? '')
  const [workspace, setWorkspace] = useState<WorkspaceConfigWorkspaceContext>(initialWorkspace)
  return (
    <div data-testid="poc-page">
      <div role="tablist" aria-label="配置分类">
        {tabIds.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            data-testid={`poc-tab-${id}`}
            onClick={() => {
              setActive(id)
            }}
          >
            {id}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="poc-switch-workspace"
        onClick={() => {
          setWorkspace(nextWorkspaceOf(workspace))
        }}
      >
        切换工作区
      </button>
      <div role="tabpanel" data-testid="poc-panel">
        {renderSlot('workspace-config.section', { workspace }, { only: active })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 场景装配
// ---------------------------------------------------------------------------

/** 一个分节贡献方的注册面（字段即真实贡献方 register 的 `id` / `order` / `label`）。 */
interface SectionSpec {
  readonly id: string
  readonly order: number
  readonly label: string
  readonly Component: (props: SectionOwnerShare) => ReactNode
}

/** 默认两个分节：order 与 tab 顺序故意相反，用来区分「按 id 过滤」与「截断首项」。 */
const DEFAULT_SECTIONS: readonly SectionSpec[] = [
  { id: 'a', order: 20, label: '分节 A', Component: SectionA },
  { id: 'b', order: 10, label: '分节 B', Component: SectionB },
]

/** 场景装配选项。 */
interface SceneOptions {
  /** 页面 tab 列表（缺省为分节 id 顺序）。 */
  readonly tabIds?: readonly string[]
  /** 初始工作区份额（缺省 W_ONE）。 */
  readonly initialWorkspace?: WorkspaceConfigWorkspaceContext
  /** 分节贡献清单（缺省 A/B 两节）。 */
  readonly sections?: readonly SectionSpec[]
  /** 页面注册用的 main key（缺省 PANEL；keyed 分发用例用它造「不匹配」的页面）。 */
  readonly pageKey?: string
  /** 是否立刻注册页面（缺省 true；后装补跑用例传 false，稍后手动 `registerPage()`）。 */
  readonly withPage?: boolean
}

/** 场景句柄：真 ctx + 延迟注册页面的装配动作。 */
interface Scene {
  readonly ctx: Cordis.Context
  /** 装配页面：`slots.inject('main', () => register({ children }, PagePoC))`（生产同形）。 */
  registerPage(): void
}

/**
 * 装配一个与生产同构的场景：
 * root 声明 `main`(keyed) → 页面注册进 `main` 并 `children` 声明分节座位 → 贡献方软注册。
 * @param options - tab 列表、初始份额、分节清单与注册时机。
 * @returns 场景句柄。
 */
function createScene(options: SceneOptions = {}): Scene {
  const ctx = createRuntime()
  const sections = options.sections ?? DEFAULT_SECTIONS
  const tabIds = options.tabIds ?? sections.map((section) => section.id)
  const initialWorkspace = options.initialWorkspace ?? W_ONE

  // ① root（AppFrame 位）：声明 main 为 keyed 座位。
  ctx.slots.register(
    {
      name: 'root',
      children: { main: { kind: 'keyed', scope: 'root' } },
    },
    RootFrame,
  )

  // ② 页面：注册进 main（key = 面板 id），同一个 register 里 children 声明分节座位。
  const registerPage = (): void => {
    ctx.slots.inject('main', () =>
      ctx.slots.register(
        {
          name: 'main',
          key: options.pageKey ?? PANEL,
          children: { [SECTION]: { kind: 'list', scope: 'root' } },
          inject: () => ({ tabIds, initialWorkspace }),
        },
        PagePoC,
      ),
    )
  }
  if (options.withPage !== false) registerPage()

  // ③ 贡献方软注册（分节座位可能尚未声明 → 回调延迟，声明提交后补跑）。
  for (const section of sections) {
    ctx.slots.inject(SECTION, () =>
      ctx.slots.register(
        {
          name: SECTION,
          id: section.id,
          order: section.order,
          label: section.label,
        },
        section.Component,
      ),
    )
  }

  return { ctx, registerPage }
}

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  // 真 cordis 根 Context 卸载：renderer / slots 的服务与 effect 一并释放，避免跨用例串扰。
  await Promise.all(liveContexts.splice(0).map((ctx) => ctx.fiber.dispose()))
})

describe('分节座位运行时 PoC（main keyed / §1.1 哨兵）', () => {
  it('① children 声明 + keyed 分发：只有 key 匹配的页面被渲染，贡献方在声明后同步补跑', () => {
    const scene = createScene()
    const ctx = scene.ctx

    // 页面进 main 账本：key 是面板 id，children 表把分节座位写进声明账本。
    const pageEntry = ctx.slots.entries('main')[0]!
    expect(pageEntry.options.key).toBe(PANEL)
    expect(pageEntry.children?.[SECTION]).toEqual({ kind: 'list', scope: 'root' })
    expect(ctx.slots.spec(SECTION)).toMatchObject({ kind: 'list', scope: 'root' })

    // 贡献方在声明之后 inject：回调立即执行，entry 已在分节账本里（按 order 升序投影）。
    expect(ctx.slots.entries(SECTION).map((entry) => entry.options.id)).toEqual(['b', 'a'])
    expect(SECTION).toBe('workspace-config.section')

    render(ctx.slots.renderSlot('root', {}))
    expect(screen.getByTestId('poc-page')).toBeTruthy()
    expect(screen.getByTestId('poc-section-a')).toBeTruthy()

    // keyed 分发：换一个 key 注册的页面注册成功，但 root 按 PANEL 分发 → 不渲染。
    cleanup()
    const mismatched = createScene({ pageKey: 'conversation' })
    expect(mismatched.ctx.slots.entries('main')[0]?.options.key).toBe('conversation')
    render(mismatched.ctx.slots.renderSlot('root', {}))
    expect(screen.getByTestId('poc-root')).toBeTruthy()
    expect(screen.queryByTestId('poc-page')).toBeNull()
  })

  it('② only 过滤 + 切 tab 卸载：上一节从 DOM 移除（不是 display:none），注册账本不删', () => {
    const { ctx } = createScene()
    render(ctx.slots.renderSlot('root', {}))

    // 默认选中 tabIds[0] = 'a'（order 20 的那个）：若按 order 截断会错误渲染 B。
    expect(screen.getByTestId('poc-section-a')).toBeTruthy()
    expect(screen.queryByTestId('poc-section-b')).toBeNull()
    expect(screen.getByTestId('poc-section-a').getAttribute('data-workspace')).toBe(
      '工作区一@/repos/one',
    )

    // 切到 B：only 换成 'b'，A 整颗卸载（DOM 里彻底不在）。
    fireEvent.click(screen.getByTestId('poc-tab-b'))
    expect(screen.getByTestId('poc-section-b')).toBeTruthy()
    expect(screen.queryByTestId('poc-section-a')).toBeNull()
    expect(screen.queryByText(/分节 A/)).toBeNull()

    // only 只影响渲染投影：两条注册都还在账本里。
    expect(ctx.slots.entries(SECTION)).toHaveLength(2)

    // 切回 A：重新挂载，内容照常。
    fireEvent.click(screen.getByTestId('poc-tab-a'))
    expect(screen.getByTestId('poc-section-a')).toBeTruthy()
    expect(screen.queryByTestId('poc-section-b')).toBeNull()
  })

  it('③ {workspace} 份额到达：选中分节拿到当下份额，换工作区后立刻更新并跨 tab 一致', () => {
    const { ctx } = createScene()
    render(ctx.slots.renderSlot('root', {}))

    expect(screen.getByTestId('poc-section-a').getAttribute('data-workspace')).toBe(
      '工作区一@/repos/one',
    )

    // 页面换选择 → 同一挂载内的分节收到新份额（纯数据，不靠分节订阅）。
    fireEvent.click(screen.getByTestId('poc-switch-workspace'))
    expect(screen.getByTestId('poc-section-a').getAttribute('data-workspace')).toBe(
      '工作区二@/repos/two',
    )

    // 切到 B：新分节拿到的也是当下份额（不是页面初始值）。
    fireEvent.click(screen.getByTestId('poc-tab-b'))
    expect(screen.getByTestId('poc-section-b').getAttribute('data-workspace')).toBe(
      '工作区二@/repos/two',
    )
  })

  it('④ 后装补跑：贡献方先 inject（座位未声明），页面后到声明 children 后待命回调同步补跑', () => {
    const scene = createScene({ withPage: false })
    const ctx = scene.ctx

    // root 已声明 main，但页面还没注册；分节座位尚未声明。
    expect(ctx.slots.entries('main')).toHaveLength(0)
    expect(ctx.slots.spec(SECTION)).toBeUndefined()
    expect(ctx.slots.entries(SECTION)).toHaveLength(0)

    // 页面后到：注册并提交 children 声明，动作本身不抛错。
    expect(() => {
      scene.registerPage()
    }).not.toThrow()

    // 声明提交后待命回调同步补跑，先到的贡献不丢。
    expect(ctx.slots.entries(SECTION)).toHaveLength(2)
    expect(ctx.slots.entries(SECTION).map((entry) => entry.options.id)).toEqual(['b', 'a'])

    render(ctx.slots.renderSlot('root', {}))
    expect(screen.getByTestId('poc-page')).toBeTruthy()
    expect(screen.getByTestId('poc-section-a')).toBeTruthy()
  })

  it('⑤ 崩溃隔离：崩溃分节被框架边界接管（abdicate 只改渲染投影），页面壳与兄弟分节存活', async () => {
    const crashError = new Error('分节渲染期崩溃（PoC 注入）')
    const { ctx } = createScene({
      sections: [
        { id: 'healthy', order: 10, label: '正常分节', Component: SectionA },
        {
          id: 'crash',
          order: 20,
          label: '崩溃分节',
          Component: () => {
            throw crashError
          },
        },
      ],
      tabIds: ['healthy', 'crash'],
    })

    // 框架的错误监督面上报（真 `onEntryError`，不 stub）。
    const reports: Array<{
      key: string
      registration: Slots.StoredEntry | Slots.StoredFactory
      error: unknown
      abdicated: boolean
    }> = []
    const disposeReports = ctx.slots.onEntryError((key, registration, error, info) => {
      reports.push({ key, registration, error, abdicated: info.abdicated })
    })

    // React 必然把边界捕获的异常打到 console.error；这是被测的预期路径，不污染输出。
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(ctx.slots.renderSlot('root', {}))
    // 初始在健康分节：页面、root 与分节内容都在。
    expect(screen.getByTestId('poc-root')).toBeTruthy()
    expect(screen.getByTestId('poc-page')).toBeTruthy()
    expect(screen.getByTestId('poc-section-a')).toBeTruthy()

    // 切到崩溃分节：渲染期抛错不得向上冒泡（真 renderSlot 不抛）。
    fireEvent.click(screen.getByTestId('poc-tab-crash'))

    // rc.5 语义：list 种类的崩溃上报带 `abdicate: true`，崩溃 entry 从 `entriesOfSlot`
    // 投影里退场（注册账本保留），outlet 在同一微任务批里把该格重投影成框架崩溃占位。
    await waitFor(() => {
      expect(ctx.slots.entriesOfSlot(SECTION).map((entry) => entry.options.id)).toEqual([
        'healthy',
      ])
    })

    // ① 页面壳未崩、root 仍在：崩溃隔离在分节层，没有上浮到页面 / root。
    expect(screen.getByTestId('poc-root')).toBeTruthy()
    expect(screen.getByTestId('poc-page')).toBeTruthy()
    expect(screen.getByRole('tablist', { name: '配置分类' })).toBeTruthy()

    // ② 崩溃分节内容不可见；其格子被框架崩溃占位接管，且占位仍在页面内部。
    expect(screen.queryByText(/工作区一@\/repos\/one/)).toBeNull()
    const crashFace = document.querySelector(`[data-slot-error="${SECTION}"]`)
    expect(crashFace).not.toBeNull()
    expect(crashFace?.closest('[data-testid="poc-page"]')).not.toBeNull()
    expect(document.querySelectorAll(`[data-slot-error="${SECTION}"]`)).toHaveLength(1)

    // ③ 监督面上报一次：座位 key、崩溃 registration、原始 Error 与退场标志都属实。
    expect(reports).toHaveLength(1)
    expect(reports[0]!.key).toBe(SECTION)
    expect(reports[0]!.error).toBe(crashError)
    expect(reports[0]!.abdicated).toBe(true)
    const crashed = reports[0]!.registration
    expect('options' in crashed && crashed.options.id).toBe('crash')

    // ④ 注册账本未丢：abdication 只改渲染投影，entry 仍在 `entries`，disposer 归贡献方。
    expect(ctx.slots.entries(SECTION)).toHaveLength(2)
    expect(ctx.slots.entriesOfSlot(SECTION)).toHaveLength(1)

    // ⑤ 切回健康分节：页面壳仍可交互，崩溃占位随重新渲染消失。
    fireEvent.click(screen.getByTestId('poc-tab-healthy'))
    expect(screen.getByTestId('poc-section-a')).toBeTruthy()
    expect(document.querySelector(`[data-slot-error="${SECTION}"]`)).toBeNull()

    disposeReports()
  })
})
