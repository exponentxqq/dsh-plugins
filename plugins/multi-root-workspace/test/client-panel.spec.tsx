// @vitest-environment jsdom
/**
 * The panel, driven the way the browser drives it: the real client entry is
 * applied to a stub client context, the registered component is rendered, and
 * every action is observed through the stub Connection channel.
 *
 * The stub is deliberate — the panel's contract IS the channel, and asserting
 * the exact (channel, endpoint, payload) triples is what keeps the browser half
 * and the host half from drifting apart. The host side of each endpoint is
 * covered by `test/command.spec.ts` and by the behavior smoke.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceConfigWorkspaceContext } from '@dsh-plugins/contracts'
import { PANEL_CHANNEL, type PanelRequest, type RevealedView, type RootView, type RootsView } from '../src/contract.ts'
// 仅类型：browse 替身返回的宿主 home 层（TG5 要点 1 的 fixture 形状）。
import type { DirectoryListing } from '../src/client/directory-picker.ts'
import * as client from '../src/client/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'

// The jsdom environment has no file-URL `import.meta.url`, so the repository
// root comes from the runner's working directory (vitest runs at the root).
const REPO_ROOT = process.cwd()

/** One captured channel call. */
interface Call {
  readonly channel: string
  readonly endpoint: string
  readonly payload: PanelRequest
}

/** One slot registration the plugin made. */
interface Registration {
  readonly options: {
    name: string
    id?: string
    order?: number
    label?: unknown
    locale?: string
    inject?: () => Record<string, unknown>
  }
  readonly component: () => unknown
}

/** The stub client context, plus what the plugin did with it. */
interface Harness {
  readonly ctx: unknown
  readonly calls: Call[]
  readonly registrations: Registration[]
  readonly dictionaries: { ns: string; dicts: Record<string, unknown> }[]
  setView: (view: RootsView) => void
  setSession: (sessionId: string | undefined) => void
  /**
   * Present the 0.1.6-alpha.2 catalog: no `current` field, and the main view
   * is whichever row carries `mainView`. Passing this switches the stub off
   * the legacy selection snapshot until `setSession` is called again.
   */
  setCatalog: (rows: readonly { id: string; mainView?: number }[]) => void
  setFailure: (failure: { code: string; message: string } | undefined) => void
  /** What the next `reveal` answers (the real host answers a `RevealedView`). */
  setRevealed: (value: unknown) => void
  /**
   * `uiWorkspace` 拾取替身的三态（任务 4.2，TG5 要点 1）。`native`（默认）保持
   * 既有语义：pick 成功返回 `/repos/picked`；`browse` 是 pick 抛错 + 浏览原语
   * 可用的降级面（适配器走 message 兜底判定）；`unavailable` 是服务缺席。
   * 适配器每次拾取都经 `read()` 现读服务，切换即刻生效。
   */
  setPickerMode: (mode: PickerMode) => void
  /** browse 替身收到的 `listDirectory` path 实参记录（`undefined` = 宿主 home）。 */
  readonly browseListCalls: (string | undefined)[]
  /** pick 端口被点击触发的次数（native 与 browse 替身都计数）。 */
  pickAttemptCount: () => number
  /** Make the NEXT channel call hang until `release` is called. */
  holdNextCall: () => void
  /** Release a call held by `holdNextCall`. */
  release: () => void
  /** `apply` 期间收集到的 `logger.warn` 实参（四格矩阵的「不报错」断言）。 */
  readonly warnings: unknown[][]
  /** 分节座位还在等待声明的 `slots.inject` 回调数（「只贡献方」格）。 */
  pendingSectionCount: () => number
  /** 后装 holder：声明 `workspace-config.section`，补跑待命回调（格 4）。 */
  declareSection: () => void
}

const ROOT_A: RootView = { ordinal: 1, id: 'a', path: '/repos/payments', addedAt: '2026-09-12T00:00:00.000Z', state: 'available', alias: 'payments' }
const ROOT_B: RootView = { ordinal: 2, id: 'b', path: '/repos/website', addedAt: '2026-09-12T00:00:00.000Z', state: 'missing', detail: 'gone' }
const ROOT_C: RootView = {
  ordinal: 3,
  id: 'c',
  path: '/repos/swapped',
  addedAt: '2026-09-12T00:00:00.000Z',
  state: 'redirected',
  detail: 'the path now resolves to "/repos/other"',
}

/** 由插件 `commonRoots` 配置授予的通用根（不进 store，面板只读呈现）。 */
const COMMON_ROOT: RootView = {
  ordinal: 3,
  id: 'common:/repos/cache',
  path: '/repos/cache',
  addedAt: '2026-10-10T00:00:00.000Z',
  state: 'available',
  source: 'common',
}

/** 拾取替身的三态（任务 4.2）。 */
type PickerMode = 'native' | 'browse' | 'unavailable'

/**
 * browse 替身的宿主 home 层（TG5 要点 1 的 fixture：home `/home/me`、crumbs、
 * entries、含一个隐藏项；形状是 `directory-picker.ts` 的上游结构镜像）。
 */
const BROWSE_HOME_LISTING: DirectoryListing = {
  path: '/home/me',
  home: '/home/me',
  crumbs: [{ name: 'me', path: '/home/me', hidden: false }],
  entries: [
    { name: 'repos', path: '/home/me/repos', hidden: false },
    { name: '.cache', path: '/home/me/.cache', hidden: true },
  ],
  truncated: false,
}

/**
 * 上游 `pickDirectory` 失败的实测文案（code-design ②：pick 层只抛 message，
 * code/details 被丢弃）。锚定 message 兜底正则的 `serves "browse"` 片段。
 */
const BROWSE_PICK_MESSAGE =
  'directoryPicker.pickDirectory needs the pick capability; the composed picker serves "browse"'

/**
 * The owner share the holder page passes to a section: a real workspace.
 *
 * Since 2026-11-08-workspace-config-page the seat owner share is pure data
 * (`{ workspace }`, three-state) and no longer a `close` callback; the section
 * renders its body only for `{kind:'workspace'}`, and the two other kinds are
 * the empty state `panel.noWorkspace`.
 */
const WORKSPACE_SHARE: WorkspaceConfigWorkspaceContext = {
  kind: 'workspace',
  id: 'ws-primary',
  title: 'Primary workspace',
  path: '/repos/primary',
}

/** The page's 「未分配」 special item: a page-scoped share with no target. */
const UNASSIGNED_SHARE: WorkspaceConfigWorkspaceContext = { kind: 'unassigned' }

/** The page's degraded share: the workspace list service is not ready. */
const NO_WORKSPACE_SHARE: WorkspaceConfigWorkspaceContext = { kind: 'none' }

/**
 * The 0.1.6-alpha.2 list snapshot: catalog rows, no `current`.
 * `retainedBy.mainView` is omitted when the row is not the main view, which
 * is what an unselected catalog entry looks like.
 */
function catalogSnapshot(rows: readonly { id: string; mainView?: number }[]): {
  ids: string[]
  byId: Record<string, { id: string; retainedBy: { mainView?: number } }>
  phase: 'ready'
} {
  const byId: Record<string, { id: string; retainedBy: { mainView?: number } }> = {}
  for (const row of rows) {
    byId[row.id] = {
      id: row.id,
      retainedBy: row.mainView === undefined ? {} : { mainView: row.mainView },
    }
  }
  return { ids: rows.map(row => row.id), byId, phase: 'ready' }
}

/**
 * Apply the real client entry to a recording stub context.
 *
 * @param withFilesActions - whether the shell declares the legacy Files-tab seat.
 * @param deferSection - when true the holder's `workspace-config.section` seat is
 *   NOT declared at apply time: the section `slots.inject` callback is parked
 *   (the "contributor only, holder missing" composition) until `declareSection()`.
 */
function mount(withFilesActions = false, deferSection = false): Harness {
  const calls: Call[] = []
  const registrations: Registration[] = []
  const dictionaries: { ns: string; dicts: Record<string, unknown> }[] = []
  const warnings: unknown[][] = []
  /** `workspace-config.section` 的待命回调（后装 holder 时补跑）。 */
  const pendingSection: Array<() => unknown> = []
  let view: RootsView = { primaryRoot: '/repos/primary', roots: [ROOT_A, ROOT_B] }
  let currentSession: string | undefined = 'session-1'
  // Undefined keeps the 0.1.5 / 0.1.6-alpha.1 selection snapshot (`current`).
  let catalog: readonly { id: string; mainView?: number }[] | undefined
  let failure: { code: string; message: string } | undefined
  let revealed: unknown = { revealed: '/repos/payments' } satisfies RevealedView
  let gate: Promise<void> | undefined
  let releaseGate: (() => void) | undefined
  const picked: string | null = '/repos/picked'
  // 拾取替身三态（默认 native = 既有语义）。适配器每次拾取经 read() 现读
  // ctx.get('uiWorkspace')，切换即刻生效；服务实例更换即失效其能力缓存。
  let pickerMode: PickerMode = 'native'
  let pickAttempts = 0
  /** browse 替身收到的 `listDirectory` path 实参记录（undefined = 宿主 home）。 */
  const browseListCalls: (string | undefined)[] = []

  const connection = {
    rpc: {
      call: async (channel: string, endpoint: string, payload: PanelRequest) => {
        calls.push({ channel, endpoint, payload })
        if (gate !== undefined) {
          const held = gate
          gate = undefined
          await held
        }
        if (failure !== undefined) return { ok: false, error: failure }
        if (endpoint === 'move' && payload.entry !== undefined) {
          const target = view.roots.find(root => root.ordinal === payload.entry!.ordinal)
          const without = view.roots.filter(root => root !== target)
          const before = payload.beforeEntry === undefined
            ? undefined
            : without.find(root => root.ordinal === payload.beforeEntry!.ordinal)
          const at = before === undefined ? without.length : without.indexOf(before)
          const reordered = target === undefined
            ? without
            : [...without.slice(0, at), target, ...without.slice(at)]
          view = { ...view, roots: reordered.map((root, index) => ({ ...root, ordinal: index + 1 })) }
        }
        // One shape per endpoint, exactly as the host sends them: `reveal`
        // answers with the revealed path, everything else with the whole view.
        // Answering a list for every endpoint is what used to hide the mismatch.
        return { ok: true, value: endpoint === 'reveal' ? revealed : view }
      },
    },
  }
  const ctx = {
    effect: (callback: () => unknown) => {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale: {
      register: (ns: string, dicts: Record<string, unknown>) => {
        dictionaries.push({ ns, dicts })
        return () => {}
      },
      // The real service resolves the live locale per call; for the spec the
      // namespace-qualified key is enough to observe which copy is used.
      bind: (ns: string) => (key: string) => `${ns}.${key}`,
    },
    slots: {
      inject: (name: string, callback: () => unknown) => {
        expect(['workspace-config.section', 'sidebar.right.tab.files.actions']).toContain(name)
        if (name === 'sidebar.right.tab.files.actions' && !withFilesActions) return () => {}
        // 后装 holder：座位尚未声明，回调只登记等待（真实 SlotRegistry.inject 语义）。
        if (name === 'workspace-config.section' && deferSection) {
          pendingSection.push(callback)
          return () => {}
        }
        callback()
        return () => {}
      },
      register: (options: Registration['options'], component: () => unknown) => {
        registrations.push({ options, component })
        return () => {}
      },
    },
    logger: {
      warn: (...args: unknown[]) => {
        warnings.push(args)
      },
    },
    get: (name: string) => {
      if (name === 'connection') return connection
      if (name === 'uiWorkspace') {
        // 三态替身（任务 4.2）：unavailable = 服务缺席（read() → undefined，
        // 适配器返回 unavailable 且不缓存）；browse = pick 抛实测文案 + 浏览
        // 原语可用（适配器 message 兜底判定后缓存 browse）；native = 既有语义。
        if (pickerMode === 'unavailable') return undefined
        if (pickerMode === 'browse') {
          return {
            pickDirectory: async () => {
              pickAttempts += 1
              // 上游事实：pick 层只抛 message（Error 实例，无 rpcError 载体）。
              throw new Error(BROWSE_PICK_MESSAGE)
            },
            listDirectory: async (path?: string) => {
              browseListCalls.push(path)
              return { ...BROWSE_HOME_LISTING }
            },
            // panel 面只走「浏览 + 采纳」链路；exists 注入属于对话框契约，由
            // client-directory-dialog.spec.tsx 的替身覆盖。
            createDirectory: async () => '/home/me/created',
          }
        }
        return {
          pickDirectory: async () => {
            pickAttempts += 1
            return picked
          },
        }
      }
      if (name === 'sessions') {
        return {
          list: {
            getSnapshot: () => catalog === undefined
              ? { current: currentSession }
              : catalogSnapshot(catalog),
          },
        }
      }
      return undefined
    },
  }
  client.apply(ctx as never)
  return {
    ctx,
    calls,
    registrations,
    dictionaries,
    setView: next => { view = next },
    setSession: next => {
      currentSession = next
      catalog = undefined
    },
    setCatalog: rows => { catalog = rows },
    setFailure: next => { failure = next },
    setRevealed: next => { revealed = next },
    setPickerMode: mode => { pickerMode = mode },
    browseListCalls,
    pickAttemptCount: () => pickAttempts,
    holdNextCall: () => { gate = new Promise<void>(resolve => { releaseGate = resolve }) },
    release: () => { releaseGate?.(); releaseGate = undefined },
    warnings,
    pendingSectionCount: () => pendingSection.length,
    declareSection: () => {
      for (const callback of pendingSection.splice(0)) callback()
    },
  }
}

/** The translator the framework synthesizes for this namespace's entries. */
const translate = (key: string): string => `${NS}.${key}`

/** Find one registration by seat. */
function registrationOf(harness: Harness, seat: string): Registration {
  const registration = harness.registrations.find(item => item.options.name === seat)
  if (registration === undefined) throw new Error(`the ${seat} seat was not registered`)
  return registration
}

/**
 * 按组标题找 `.mrfw-section` 元素（分组呈现后 body 内三个组：primary /
 * additional / common）。动作行（拾取 + 手输）归入附属组末尾（D-06），
 * `within(section)` 归属断言以本函数为入口。
 */
function sectionByTitle(title: string): HTMLElement {
  const section = Array.from(document.querySelectorAll<HTMLElement>('.mrfw-section'))
    .find(node => node.querySelector('.mrfw-sectionTitle')?.textContent === title)
  if (section === undefined) throw new Error(`the "${title}" section was not rendered`)
  return section
}

/** 主工作目录组（primary 行所在组）。 */
function primarySectionOf(): HTMLElement {
  return sectionByTitle(`${NS}.panel.primary`)
}

/** 附属工作目录组（登记根 + 动作行所在组）。 */
function additionalSectionOf(): HTMLElement {
  return sectionByTitle(`${NS}.panel.additional`)
}

/** 通用工作目录组（commonRoots 授予的根所在组）。 */
function commonSectionOf(): HTMLElement {
  return sectionByTitle(`${NS}.panel.common`)
}

/**
 * Render the section the plugin registered, with the composed props the
 * renderer passes: the seat owner share (`{ workspace }`), the synthesized
 * translator and the registration's inject face. The component function is
 * wrapped in an element because React does not accept a bare function as a
 * child.
 *
 * The share defaults to a real workspace — the kind that renders the body. The
 * other two kinds are the gated empty state, and the Files-tab launcher mounts
 * the same component with no share at all (`undefined`).
 * @param harness - the mounted harness whose registration to render.
 * @param workspace - the owner share to pass; `undefined` is the launcher form.
 */
function renderSection(harness: Harness, workspace: WorkspaceConfigWorkspaceContext | undefined = WORKSPACE_SHARE): void {
  const registration = registrationOf(harness, 'workspace-config.section')
  const injected = registration.options.inject?.() ?? {}
  render(createElement(registration.component as never, {
    workspace,
    t: translate,
    ...injected,
  } as never))
}

/**
 * Render the legacy Files-tab launcher. It closes over its ports, so it takes
 * no props — exactly like the entry's registration factory.
 * @param harness - the mounted harness whose registration to render.
 */
function renderLauncher(harness: Harness): void {
  render(createElement(registrationOf(harness, 'sidebar.right.tab.files.actions').component as never))
}

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => {}) }, configurable: true })
})

afterEach(() => {
  // Vitest runs without globals, so the auto-cleanup hook is never installed.
  cleanup()
  vi.restoreAllMocks()
})

describe('the client entry', () => {
  it('expands the same session-derived panel inline from the optional Files actions slot', async () => {
    const harness = mount(true)
    renderLauncher(harness)
    // An entry reads nothing until the operator asks for it.
    expect(harness.calls).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: `${NS}.action.label` }))

    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })
    expect(harness.calls[0]).toEqual({ channel: PANEL_CHANNEL, endpoint: 'list', payload: { sessionId: 'session-1' } })
    // The Files tab has no modal shell of its own: the body opens in place.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('declares the services it needs', () => {
    expect(client.inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers its dictionaries for both languages under its own namespace', () => {
    const harness = mount()
    expect(NS).toBe('multiRootWorkspace')
    expect(harness.dictionaries[0]?.ns).toBe(NS)
    expect(Object.keys(harness.dictionaries[0]?.dicts ?? {}).sort()).toEqual(['en', 'zh'])
  })

  it('registers one workspace-config section with a localized label thunk', () => {
    const harness = mount()
    const registration = registrationOf(harness, 'workspace-config.section')
    expect(registration.options.id).toBe(client.SLOT_ID)
    // mrfw takes the first nav row: 10 / 20 / 30 across the three contributors.
    expect(registration.options.order).toBe(10)
    expect(registration.options.locale).toBe(NS)
    const label = registration.options.label
    expect(typeof label).toBe('function')
    expect((label as () => string)()).toBe(`${NS}.section.label`)
    // The old footer entry is gone for good (ADR-0013).
    expect(harness.registrations.some(item => item.options.name === 'sidebar.footer.action')).toBe(false)
  })

  it('does not hard-depend on the holder: a refusing seat only loses that entry', () => {
    const warnings: unknown[][] = []
    const ctx = {
      effect: (callback: () => unknown) => { callback(); return () => {} },
      locale: { register: () => () => {}, bind: (ns: string) => (key: string) => `${ns}.${key}` },
      logger: { warn: (...args: unknown[]) => { warnings.push(args) } },
      slots: {
        inject: (_name: string, callback: () => unknown) => { callback(); return () => {} },
        register: (options: Registration['options']) => {
          if (options.name === 'workspace-config.section') throw new Error('seat refused the registration')
          return () => {}
        },
      },
      get: () => undefined,
    }
    // Soft registration: the client half still applies, and the failure is logged.
    expect(() => { client.apply(ctx as never) }).not.toThrow()
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('registers nothing when the composition declares neither seat', () => {
    const ctx = {
      effect: () => () => {},
      locale: { register: () => () => {}, bind: () => (key: string) => key },
      slots: { inject: () => () => {}, register: () => () => {} },
      get: () => undefined,
    }
    expect(() => { client.apply(ctx as never) }).not.toThrow()
  })
})

describe('the panel section', () => {
  it('reads the roots view for the current session and lists both roots', async () => {
    const harness = mount()
    renderSection(harness)

    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })
    expect(harness.calls[0]).toEqual({ channel: PANEL_CHANNEL, endpoint: 'list', payload: { sessionId: 'session-1' } })
    // The primary row is two lines: the workspace's upstream title when the host
    // resolved one, the path basename otherwise, and the path underneath.
    expect(screen.getByText('/repos/primary')).toBeTruthy()
    expect(screen.getByText('primary')).toBeTruthy()
    expect(screen.getByText('payments')).toBeTruthy()
    expect(screen.getByText(`${NS}.state.missing`)).toBeTruthy()
  })

  it('shows No active session and does not call the host when there is no current session', async () => {
    const harness = mount()
    harness.setSession(undefined)
    renderSection(harness)

    await waitFor(() => { expect(screen.getByText(`${NS}.panel.noSession`)).toBeTruthy() })
    expect(harness.calls).toHaveLength(0)
    expect(screen.queryByPlaceholderText(`${NS}.panel.addManual`)).toBeNull()
    expect(screen.getByRole('button', { name: `${NS}.panel.retry` })).toBeTruthy()
  })

  it('calls the host after a session appears', async () => {
    const harness = mount()
    harness.setSession(undefined)
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText(`${NS}.panel.noSession`)).toBeTruthy() })

    harness.setSession('session-1')
    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.retry` }))

    await waitFor(() => { expect(harness.calls).toHaveLength(1) })
    expect(harness.calls[0]?.payload).toEqual({ sessionId: 'session-1' })
  })

  it('reads the main-view session when the catalog has no current field', async () => {
    const harness = mount()
    // The unrelated row is first, so a reader that takes ids[0] names the
    // wrong session. Only retainedBy.mainView marks the one on screen.
    harness.setCatalog([
      { id: 'session-other' },
      { id: 'session-main', mainView: 1 },
    ])
    renderSection(harness)

    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })
    expect(harness.calls[0]).toEqual({ channel: PANEL_CHANNEL, endpoint: 'list', payload: { sessionId: 'session-main' } })
    expect(screen.queryByText(`${NS}.panel.noSession`)).toBeNull()
  })

  it('shows No active session when catalog rows exist but none is the main view', async () => {
    const harness = mount()
    harness.setCatalog([{ id: 'session-other' }])
    renderSection(harness)

    await waitFor(() => { expect(screen.getByText(`${NS}.panel.noSession`)).toBeTruthy() })
    expect(harness.calls).toHaveLength(0)
  })

  it('follows a main-view change on retry', async () => {
    const harness = mount()
    harness.setCatalog([{ id: 'session-main', mainView: 1 }])
    renderSection(harness)
    await waitFor(() => { expect(harness.calls).toHaveLength(1) })

    harness.setCatalog([
      { id: 'session-main' },
      { id: 'session-next', mainView: 1 },
    ])
    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.retry` }))

    await waitFor(() => { expect(harness.calls).toHaveLength(2) })
    expect(harness.calls[1]?.payload).toEqual({ sessionId: 'session-next' })
  })

  it('reads the current session again for each request', async () => {
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(harness.calls).toHaveLength(1) })

    harness.setSession('session-2')
    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.retry` }))

    await waitFor(() => { expect(harness.calls).toHaveLength(2) })
    expect(harness.calls[1]?.payload).toEqual({ sessionId: 'session-2' })
  })

  it('shows the upstream workspace title as the primary row name', async () => {
    const harness = mount()
    harness.setView({ primaryRoot: '/repos/primary', primaryName: 'Payments Platform', roots: [ROOT_A] })
    renderSection(harness)

    await waitFor(() => { expect(screen.getByText('Payments Platform')).toBeTruthy() })
    expect(screen.getByText('/repos/primary')).toBeTruthy()
  })

  it('removes, reorders, and re-aliases a root through the channel', async () => {
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.moveDown` })[0]!)
    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'move')).toBe(true) })
    // Moving down by one means placing A before the item AFTER B. With only two
    // rows there is no anchor, so A moves to the end.
    expect(harness.calls.find(call => call.endpoint === 'move')?.payload).toEqual({
      sessionId: 'session-1',
      entry: { ordinal: 1, id: 'a', path: '/repos/payments', addedAt: '2026-09-12T00:00:00.000Z' },
    })
    await waitFor(() => {
      expect(Array.from(document.querySelectorAll('.mrfw-rootPath')).map(node => node.textContent))
        .toEqual(['/repos/primary', '/repos/website', '/repos/payments'])
    })

    // Rename and remove live in the row's ellipsis menu.
    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.more` })[1]!)
    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.rename` }))
    const input = screen.getByPlaceholderText(`${NS}.panel.aliasPlaceholder`)
    fireEvent.change(input, { target: { value: 'renamed' } })
    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.aliasSave` }))
    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'alias')).toBe(true) })
    expect(harness.calls.find(call => call.endpoint === 'alias')?.payload).toEqual({
      sessionId: 'session-1',
      entry: { ordinal: 2, id: 'a', path: '/repos/payments', addedAt: '2026-09-12T00:00:00.000Z' },
      alias: 'renamed',
    })

    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.more` })[1]!)
    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.remove` })[0]!)
    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'remove')).toBe(true) })
    expect(harness.calls.find(call => call.endpoint === 'remove')?.payload).toEqual({
      sessionId: 'session-1',
      entry: { ordinal: 2, id: 'a', path: '/repos/payments', addedAt: '2026-09-12T00:00:00.000Z' },
    })
  })

  it('adds through the composed picker, then through the manual path field', async () => {
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.add` }))
    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'add')).toBe(true) })
    expect(harness.calls.find(call => call.endpoint === 'add')?.payload).toEqual({
      sessionId: 'session-1',
      path: '/repos/picked',
    })

    const manual = screen.getByPlaceholderText(`${NS}.panel.addManual`)
    fireEvent.change(manual, { target: { value: '/repos/typed' } })
    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.addConfirm` }))
    await waitFor(() => { expect(harness.calls.filter(call => call.endpoint === 'add')).toHaveLength(2) })
    // The confirm button submits the TYPED path. It used to submit whatever the
    // picker had returned, because both entry points shared one function.
    expect(harness.calls.filter(call => call.endpoint === 'add')[1]?.payload).toEqual({
      sessionId: 'session-1',
      path: '/repos/typed',
    })
    expect(screen.getByPlaceholderText(`${NS}.panel.addManual`)).toHaveProperty('value', '')
  })

  it('keeps a rejected manual path in the field', async () => {
    const harness = mount()
    harness.setFailure({ code: 'missing', message: 'host prose' })
    renderSection(harness)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(`${NS}.error.missing`) })

    const manual = screen.getByPlaceholderText(`${NS}.panel.addManual`)
    fireEvent.change(manual, { target: { value: '/repos/typo' } })
    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.addConfirm` }))

    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'add')).toBe(true) })
    expect(screen.getByPlaceholderText(`${NS}.panel.addManual`)).toHaveProperty('value', '/repos/typo')
  })

  it('submits the typed path from the Enter key too', async () => {
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    const manual = screen.getByPlaceholderText(`${NS}.panel.addManual`)
    fireEvent.change(manual, { target: { value: '/repos/entered' } })
    fireEvent.keyDown(manual, { key: 'Enter' })

    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'add')).toBe(true) })
    expect(harness.calls.find(call => call.endpoint === 'add')?.payload).toEqual({
      sessionId: 'session-1',
      path: '/repos/entered',
    })
  })

  it('leaves the manual field alone when the operator opens the picker', async () => {
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    fireEvent.change(screen.getByPlaceholderText(`${NS}.panel.addManual`), { target: { value: '/repos/typed' } })
    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.add` }))

    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'add')).toBe(true) })
    expect(harness.calls.find(call => call.endpoint === 'add')?.payload).toEqual({
      sessionId: 'session-1',
      path: '/repos/picked',
    })
    // The picker path and the typed path are two different actions; the typed
    // text is neither submitted nor cleared by the picker.
    expect(screen.getByPlaceholderText(`${NS}.panel.addManual`)).toHaveProperty('value', '/repos/typed')
  })

  it('reveals and copies a path from the row actions', async () => {
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.reveal` })[0]!)
    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'reveal')).toBe(true) })
    expect(harness.calls.find(call => call.endpoint === 'reveal')?.payload).toEqual({
      sessionId: 'session-1',
      entry: { ordinal: 1, id: 'a', path: '/repos/payments', addedAt: '2026-09-12T00:00:00.000Z' },
    })

    // primary 行自任务 4.1 起也有「复制路径」，行级选择器须圈定附属组（语义不变：
    // 复制的仍是这一登记根）。
    fireEvent.click(within(additionalSectionOf()).getAllByRole('button', { name: `${NS}.panel.copyPath` })[0]!)
    await waitFor(() => { expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/repos/payments') })
    // The action is an icon button: the success swaps the accessible name.
    await waitFor(() => { expect(screen.getAllByRole('button', { name: `${NS}.panel.copied` })[0]).toBeTruthy() })
  })

  it('does not report an error when a reveal succeeds', async () => {
    // The host answers `{ revealed }` for this endpoint. Parsing that as a roots
    // view is what made every successful reveal paint a failure.
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.reveal` })[0]!)

    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'reveal')).toBe(true) })
    // No failure is painted, and the list survives a reveal untouched.
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
    expect(screen.getByText('/repos/payments')).toBeTruthy()
    expect(harness.calls.filter(call => call.endpoint === 'list')).toHaveLength(1)
  })

  it('reports a reveal whose answer is not a reveal result', async () => {
    const harness = mount()
    harness.setRevealed({ primaryRoot: '/repos/primary', roots: [] })
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.reveal` })[0]!)

    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(`${NS}.error.fallback`) })
  })

  it('reports a clipboard that refuses the copy', async () => {
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'))
    // 行操作语义不变：拒绝发生在附属行复制上（primary 行的复制按钮是 4.1 新增面）。
    fireEvent.click(within(additionalSectionOf()).getAllByRole('button', { name: `${NS}.panel.copyPath` })[0]!)

    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(`${NS}.error.copy-failed`) })
  })

  it('disables the row actions while a mutation is in flight', async () => {
    // The hold gate keeps the remove's channel call pending, which is the only
    // way to observe the busy window deterministically.
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    harness.holdNextCall()
    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.more` })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.remove` })[0]!)
    expect(harness.calls.some(call => call.endpoint === 'remove')).toBe(true)
    // The menu closed on selection; the row's icon actions carry the busy state.
    expect(screen.getAllByRole('button', { name: `${NS}.panel.reveal` })[0]).toHaveProperty('disabled', true)

    harness.release()
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: `${NS}.panel.reveal` })[0]).toHaveProperty('disabled', false)
    })
  })

  it('renders the body without a dialog shell of its own', async () => {
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    // The workspace-config holder owns the mask, the card, the header and the
    // close button; the section must not draw a second dialog underneath it.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: `${NS}.panel.close` })).toBeNull()
  })

  it('renders a redirected root as its own state', async () => {
    const harness = mount()
    harness.setView({ primaryRoot: '/repos/primary', roots: [ROOT_C] })
    renderSection(harness)

    await waitFor(() => { expect(screen.getByText(`${NS}.state.redirected`)).toBeTruthy() })
  })

  it('marks a configured common root and disables the actions the configuration owns', async () => {
    const harness = mount()
    harness.setView({
      primaryRoot: '/repos/primary',
      roots: [
        ROOT_A,
        {
          ordinal: 2,
          id: 'common:/repos/cache',
          path: '/repos/cache',
          addedAt: '2026-10-10T00:00:00.000Z',
          state: 'available',
          source: 'common',
        },
      ],
    })
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/cache')).toBeTruthy() })

    // The badge says who owns the grant...
    expect(screen.getByText(`${NS}.root.sourceCommon`)).toBeTruthy()

    // ...the last registration has nothing of its own below it to swap with, and
    // the common row itself can neither move nor be renamed or removed.
    const down = screen.getAllByRole('button', { name: `${NS}.panel.moveDown` })
    const up = screen.getAllByRole('button', { name: `${NS}.panel.moveUp` })
    expect(down[0]).toHaveProperty('disabled', true)
    expect(down[1]).toHaveProperty('disabled', true)
    expect(up[1]).toHaveProperty('disabled', true)

    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.more` })[1]!)
    expect(screen.getAllByRole('button', { name: `${NS}.panel.rename` })[0]).toHaveProperty('disabled', true)
    expect(screen.getAllByRole('button', { name: `${NS}.panel.remove` })[0]).toHaveProperty('disabled', true)
  })

  it('localizes a failure by its code instead of showing host prose', async () => {
    const harness = mount()
    harness.setFailure({ code: 'nested', message: 'host prose the panel must not show' })
    renderSection(harness)

    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(`${NS}.error.nested`) })
    expect(screen.queryByText(/host prose/)).toBeNull()
  })

  it('shows internal host error details for diagnosis', async () => {
    const harness = mount()
    harness.setFailure({ code: 'panel/internal', message: 'cannot get property "sessions" without inject' })
    renderSection(harness)

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('cannot get property "sessions" without inject')
    })
  })

  it('falls back to the generic message for a code this build does not know', async () => {
    const harness = mount()
    harness.setFailure({ code: 'brand/new-code', message: 'unexpected' })
    renderSection(harness)

    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(`${NS}.error.fallback`) })
  })

  it('shows the store failure the host reported', async () => {
    const harness = mount()
    harness.setView({ primaryRoot: '/repos/primary', roots: [], unavailable: 'multi_root_workspace: file is not valid JSON' })
    renderSection(harness)

    await waitFor(() => {
      expect(screen.getByText(/file is not valid JSON/)).toBeTruthy()
    })
  })

  it('renders a working section without any panel client (no Connection in this surface)', async () => {
    const registrations: Registration[] = []
    const ctx = {
      effect: (callback: () => unknown) => { callback(); return () => {} },
      locale: { register: () => () => {}, bind: () => (key: string) => key },
      slots: {
        inject: (_name: string, callback: () => unknown) => { callback(); return () => {} },
        register: (options: Registration['options'], component: () => unknown) => {
          registrations.push({ options, component })
          return () => {}
        },
      },
      get: () => undefined,
    }
    client.apply(ctx as never)
    const registration = registrations.find(item => item.options.name === 'workspace-config.section')!
    const injected = registration.options.inject?.() ?? {}
    render(createElement(registration.component as never, { workspace: WORKSPACE_SHARE, t: translate, ...injected } as never))
    await waitFor(() => { expect(screen.getByRole('alert')).toBeTruthy() })
  })
})

/**
 * 分节份额的三态门（2026-11-08-workspace-config-page §1.5 / 任务 6.3）。
 *
 * holder 页面把 `{ workspace }` 作为 `workspace-config.section` 的 owner 份额下传；
 * 本分节只在 `kind === 'workspace'` 时渲染正文，`unassigned`（选择框的「未分配」项）
 * 与 `none`（工作区清单服务未就绪）都只渲染 `panel.noWorkspace` 空态。Files tab 的
 * launcher 不给份额（它不是页面里的分节），因此必须照常渲染正文——这是同一个组件
 * 两种形态的分界，也是本节数据仍按当前会话寻址（不改业务）的原因。
 */
describe('the section share', () => {
  it('renders the no-workspace empty state for the unassigned share', async () => {
    const harness = mount()
    renderSection(harness, UNASSIGNED_SHARE)

    await waitFor(() => { expect(screen.getByText(`${NS}.panel.noWorkspace`)).toBeTruthy() })
    // 空态就是整节内容：正文的根列表与添加控件一个都不出现。
    expect(screen.queryByText('/repos/payments')).toBeNull()
    expect(screen.queryByPlaceholderText(`${NS}.panel.addManual`)).toBeNull()
  })

  it('renders the no-workspace empty state when the workspace list is not ready', async () => {
    const harness = mount()
    renderSection(harness, NO_WORKSPACE_SHARE)

    await waitFor(() => { expect(screen.getByText(`${NS}.panel.noWorkspace`)).toBeTruthy() })
    expect(screen.queryByText('/repos/payments')).toBeNull()
    expect(screen.queryByPlaceholderText(`${NS}.panel.addManual`)).toBeNull()
  })

  it('passes the gate for a real workspace share and reads the roots view', async () => {
    const harness = mount()
    renderSection(harness, WORKSPACE_SHARE)

    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })
    expect(screen.getByText(`${NS}.panel.primary`)).toBeTruthy()
    expect(screen.queryByText(`${NS}.panel.noWorkspace`)).toBeNull()
    expect(harness.calls).toHaveLength(1)
    expect(harness.calls[0]).toEqual({
      channel: PANEL_CHANNEL,
      endpoint: 'list',
      payload: { sessionId: 'session-1' },
    })
  })

  it('still renders the body from the Files-tab launcher, which passes no share', async () => {
    const harness = mount(true)
    renderLauncher(harness)

    fireEvent.click(screen.getByRole('button', { name: `${NS}.action.label` }))

    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })
    // 份额缺席不是「尚未选择工作区」：launcher 形态必须照常进正文。
    expect(screen.queryByText(`${NS}.panel.noWorkspace`)).toBeNull()
    expect(harness.calls).toHaveLength(1)
  })
})

describe('the panel copy', () => {
  it('keeps the shipped Chinese copy in the source of truth for the bundle', () => {
    // The dictionaries live in the host-visible source tree so both the spec and
    // the bundle read one definition.
    const source = readFileSync(join(REPO_ROOT, 'src/client/locales.ts'), 'utf8')
    expect(source).toContain(zh['panel.title'])
    expect(source).toContain(en['panel.title'])
    expect(Object.keys(zh).length).toBeGreaterThan(20)
  })
})

/**
 * 四格安装组合矩阵（本包视角；code-design ⑤G6 6.2 / tasks 7.1）。
 *
 * 全装格与「后装 holder 补跑」由 holder 的 `test/section-seat.poc.test.tsx` 真 renderer 哨兵
 * 覆盖；这里钉的是本包在组合里的三格：**格 1**（holder 已声明分节座位 → 本节 order 10 进
 * 账本，Files tab 入口原样保留）、**格 3**（只装贡献方、无 holder → `slots.inject` 待命，
 * 不注册、不抛错、不 warn）、**格 4**（holder 后到 → 待命回调补跑，分节立即可用）。
 */
describe('四格安装组合矩阵（multi-root-workspace 侧）', () => {
  it('格 1 全装：holder 声明分节座位时本节 order 10 注册，Files tab 入口（order 50）原样保留', () => {
    const harness = mount(true)

    expect(harness.warnings).toEqual([])
    expect(harness.pendingSectionCount()).toBe(0)
    const section = registrationOf(harness, 'workspace-config.section')
    expect(section.options).toMatchObject({ id: client.SLOT_ID, order: 10, locale: NS })
    expect(typeof section.options.label).toBe('function')
    expect((section.options.label as () => string)()).toBe(`${NS}.section.label`)
    // 同一个 entry id 同时挂在两个座位上：Files tab 入口没有被分节迁移挪走或改序。
    const files = registrationOf(harness, 'sidebar.right.tab.files.actions')
    expect(files.options).toMatchObject({ id: client.SLOT_ID, order: 50 })
    expect(harness.registrations).toHaveLength(2)
  })

  it('格 3 只贡献方（无 holder）：分节 inject 待命不注册、不抛错也不 warn，Files tab 入口不受影响', () => {
    const harness = mount(true, true)

    // 座位未声明 = 只装了本包、没装 holder：回调只登记等待。
    expect(harness.pendingSectionCount()).toBe(1)
    expect(harness.registrations.map(item => item.options.name)).toEqual(['sidebar.right.tab.files.actions'])
    expect(harness.warnings).toEqual([])
  })

  it('格 4 后装 holder：贡献方先 apply，分节座位后声明时待命回调补跑，分节立即可用', async () => {
    const harness = mount(true, true)
    expect(harness.registrations.map(item => item.options.name)).toEqual(['sidebar.right.tab.files.actions'])

    // holder 后到并声明 `workspace-config.section`：待命回调同步补跑。
    harness.declareSection()

    expect(harness.pendingSectionCount()).toBe(0)
    expect(harness.registrations.map(item => item.options.name)).toEqual([
      'sidebar.right.tab.files.actions',
      'workspace-config.section',
    ])
    expect(registrationOf(harness, 'workspace-config.section').options).toMatchObject({
      id: client.SLOT_ID,
      order: 10,
    })
    expect(harness.warnings).toEqual([])

    // 补跑注册的分节能正常渲染正文（inject 面在补跑时构造，仍可现取会话与通道）。
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })
    expect(harness.calls[0]).toEqual({
      channel: PANEL_CHANNEL,
      endpoint: 'list',
      payload: { sessionId: 'session-1' },
    })
  })
})

/**
 * 分组呈现与拾取升级（任务 4.2，code-design TG3 验收）。
 *
 * 组 4 把单列表拆成「附属 / 通用」两组（D-05：纯客户端按 `source === 'common'`
 * 拆分，wire 零改动）、动作行收进附属组末尾（D-06）、拾取升级为带文案主按钮而
 * 手输确认降为次要变体（D-07）、primary 行补「复制路径」且不补 reveal（D-08）、
 * 能力不可用隐藏拾取入口并常驻手输提示（D-09）、browse 结局打开应用内拾取对话
 * （D-03/D-10：自绘 + portal 到 body，`role="dialog"` 可经 screen 查询）。
 *
 * harness 的 `uiWorkspace` 替身扩成三态（native/browse/unavailable，TG5 要点 1）；
 * wire 错误 fixture 按 tasks 附录 R1 的形状纪律构造。
 */
describe('分组呈现与拾取升级（TG3）', () => {
  it('纯附属态：通用组只有标题与「没配置」说明，不出现 hint', async () => {
    const harness = mount()
    harness.setView({ primaryRoot: '/repos/primary', roots: [ROOT_A, ROOT_B] })
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    const common = commonSectionOf()
    expect(within(common).getByText(`${NS}.panel.commonEmpty`)).toBeTruthy()
    expect(within(common).queryByText(`${NS}.panel.commonHint`)).toBeNull()
    expect(within(common).queryByText('/repos/cache')).toBeNull()
  })

  it('纯通用态：附属组空态说明与通用组行并存，通用组说明切到 hint', async () => {
    const harness = mount()
    harness.setView({ primaryRoot: '/repos/primary', roots: [COMMON_ROOT] })
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/cache')).toBeTruthy() })

    const additional = additionalSectionOf()
    // 空态说明是一段拼接文本（empty + emptyHint），按 note 元素整体断言。
    const notes = Array.from(additional.querySelectorAll('.mrfw-note')).map(node => node.textContent ?? '')
    expect(notes.some(text => text.includes(`${NS}.panel.empty`) && text.includes(`${NS}.panel.emptyHint`))).toBe(true)
    expect(within(additional).queryByRole('button', { name: `${NS}.panel.reveal` })).toBeNull()

    const common = commonSectionOf()
    expect(within(common).getByText(`${NS}.panel.commonHint`)).toBeTruthy()
    expect(within(common).queryByText(`${NS}.panel.commonEmpty`)).toBeNull()
    expect(within(common).getByText(`${NS}.root.sourceCommon`)).toBeTruthy()
  })

  it('混合态：附属行 DOM 顺序先于通用行，通用行上移/下移 disabled', async () => {
    const harness = mount()
    harness.setView({ primaryRoot: '/repos/primary', roots: [ROOT_A, ROOT_B, COMMON_ROOT] })
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/cache')).toBeTruthy() })

    // 验收断言一：附属行在前、通用行在后（primary 行的 bare 行不参与比较）。
    const rows = Array.from(document.querySelectorAll('.mrfw-row'))
    const indexOfPath = (path: string): number =>
      rows.findIndex(node => node.querySelector('.mrfw-rootPath')?.textContent === path)
    const firstAdditional = indexOfPath('/repos/payments')
    const secondAdditional = indexOfPath('/repos/website')
    const commonRow = indexOfPath('/repos/cache')
    expect(firstAdditional).toBeGreaterThan(-1)
    expect(secondAdditional).toBeGreaterThan(firstAdditional)
    expect(commonRow).toBeGreaterThan(secondAdditional)

    // 通用行仍在第二组：附属组里没有通用行，通用组里有。
    expect(within(additionalSectionOf()).queryByText('/repos/cache')).toBeNull()
    expect(within(commonSectionOf()).getByText('/repos/cache')).toBeTruthy()

    // 验收断言二：通用行上移/下移 disabled。
    const commonRowNode = rows[commonRow]!
    expect(within(commonRowNode).getByRole('button', { name: `${NS}.panel.moveUp` })).toHaveProperty('disabled', true)
    expect(within(commonRowNode).getByRole('button', { name: `${NS}.panel.moveDown` })).toHaveProperty('disabled', true)

    // 附属组内锚点按组内数组计算：首行不可上移、末行不可下移、中间行双向可移。
    const firstAdditionalNode = rows[firstAdditional]!
    expect(within(firstAdditionalNode).getByRole('button', { name: `${NS}.panel.moveUp` })).toHaveProperty('disabled', true)
    expect(within(firstAdditionalNode).getByRole('button', { name: `${NS}.panel.moveDown` })).toHaveProperty('disabled', false)
    const secondAdditionalNode = rows[secondAdditional]!
    expect(within(secondAdditionalNode).getByRole('button', { name: `${NS}.panel.moveUp` })).toHaveProperty('disabled', false)
    expect(within(secondAdditionalNode).getByRole('button', { name: `${NS}.panel.moveDown` })).toHaveProperty('disabled', true)

    // 徽章与组说明照旧：通用行带 [common] 徽章，说明切到 hint。
    expect(within(commonRowNode).getByText(`${NS}.root.sourceCommon`)).toBeTruthy()
    expect(screen.getByText(`${NS}.panel.commonHint`)).toBeTruthy()
    expect(screen.queryByText(`${NS}.panel.commonEmpty`)).toBeNull()
  })

  it('双空态：两个组标题都在，两组说明各不相同', async () => {
    const harness = mount()
    harness.setView({ primaryRoot: '/repos/primary', roots: [] })
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText(`${NS}.panel.commonEmpty`)).toBeTruthy() })

    expect(screen.getByText(`${NS}.panel.additional`)).toBeTruthy()
    expect(screen.getByText(`${NS}.panel.common`)).toBeTruthy()
    const notes = Array.from(document.querySelectorAll('.mrfw-note')).map(node => node.textContent ?? '')
    const additionalNote = notes.find(text => text.includes(`${NS}.panel.empty`))
    const commonNote = notes.find(text => text.includes(`${NS}.panel.commonEmpty`))
    expect(additionalNote).toBeTruthy()
    expect(commonNote).toBeTruthy()
    expect(additionalNote).not.toBe(commonNote)
  })

  it('加载中不渲染任何组说明（避免把「还没读到」说成「没配置」）', async () => {
    const harness = mount()
    harness.setView({ primaryRoot: '/repos/primary', roots: [ROOT_A] })
    harness.holdNextCall()
    renderSection(harness)

    // 首次 list 挂起：view 未到，附属组显示 loading，两组说明一个都不出现。
    await waitFor(() => { expect(screen.getByText(`${NS}.panel.loading`)).toBeTruthy() })
    expect(screen.queryByText(`${NS}.panel.commonEmpty`)).toBeNull()
    expect(screen.queryByText(`${NS}.panel.commonHint`)).toBeNull()
    const notes = Array.from(document.querySelectorAll('.mrfw-note')).map(node => node.textContent ?? '')
    expect(notes.some(text => text.includes(`${NS}.panel.empty`))).toBe(false)

    harness.release()
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })
  })

  it('动作行归属附属组：拾取按钮与手输控件在附属组 section 内、不在通用组内', async () => {
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    const additional = additionalSectionOf()
    expect(within(additional).getByRole('button', { name: `${NS}.panel.add` })).toBeTruthy()
    expect(within(additional).getByPlaceholderText(`${NS}.panel.addManual`)).toBeTruthy()
    expect(within(additional).getByRole('button', { name: `${NS}.panel.addConfirm` })).toBeTruthy()
    expect(within(additional).getByRole('button', { name: `${NS}.panel.retry` })).toBeTruthy()

    const common = commonSectionOf()
    expect(within(common).queryByRole('button', { name: `${NS}.panel.add` })).toBeNull()
    expect(within(common).queryByPlaceholderText(`${NS}.panel.addManual`)).toBeNull()
    expect(within(common).queryByRole('button', { name: `${NS}.panel.addConfirm` })).toBeNull()
  })

  it('拾取是带文案的主按钮，手输确认降为次要变体且仍提交输入框内容', async () => {
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    const add = within(additionalSectionOf()).getByRole('button', { name: `${NS}.panel.add` })
    expect(add.className).toContain('mrfw-btnPrimary')
    fireEvent.click(add)
    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'add')).toBe(true) })
    expect(harness.calls.find(call => call.endpoint === 'add')?.payload).toEqual({
      sessionId: 'session-1',
      path: '/repos/picked',
    })

    const confirm = within(additionalSectionOf()).getByRole('button', { name: `${NS}.panel.addConfirm` })
    expect(confirm.className).toContain('mrfw-btnOutline')
    fireEvent.change(screen.getByPlaceholderText(`${NS}.panel.addManual`), { target: { value: '/repos/typed' } })
    fireEvent.click(within(additionalSectionOf()).getByRole('button', { name: `${NS}.panel.addConfirm` }))
    await waitFor(() => { expect(harness.calls.filter(call => call.endpoint === 'add')).toHaveLength(2) })
    expect(harness.calls.filter(call => call.endpoint === 'add')[1]?.payload).toEqual({
      sessionId: 'session-1',
      path: '/repos/typed',
    })
  })

  it('browse 结局：拾取降级为应用内对话框，采纳当前层发出 add', async () => {
    const harness = mount()
    harness.setPickerMode('browse')
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })
    // 对话框只在拾取发生时出现（portal 到 body，screen 的 body 查询能覆盖）。
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.add` }))

    const dialog = await screen.findByRole('dialog')
    expect(harness.pickAttemptCount()).toBe(1)
    // 首帧 = 宿主 home：message 兜底分支不带探测 listing，对话框自己零参 list。
    expect(harness.browseListCalls).toEqual([undefined])
    await waitFor(() => { expect(dialog.querySelector('.mrfw-pickerPath')?.textContent).toBe('/home/me') })

    fireEvent.click(within(dialog).getByRole('button', { name: `${NS}.picker.confirm` }))

    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'add')).toBe(true) })
    expect(harness.calls.find(call => call.endpoint === 'add')?.payload).toEqual({
      sessionId: 'session-1',
      path: '/home/me',
    })
  })

  it('browse 结局的采纳失败：失败句在对话框内显示且对话框保持打开', async () => {
    const harness = mount()
    harness.setPickerMode('browse')
    harness.setFailure({ code: 'nested', message: 'host prose the dialog must localize' })
    renderSection(harness)
    // 首次 list 落地（分节 alert 出现 = busy 复位）：在飞行中 + 是禁用的，点了不算数。
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(`${NS}.error.nested`) })

    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.add` }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => { expect(dialog.querySelector('.mrfw-pickerPath')?.textContent).toBe('/home/me') })

    fireEvent.click(within(dialog).getByRole('button', { name: `${NS}.picker.confirm` }))

    // `mutate` 的失败经 sentenceOf 回到对话框原地显示，对话框不关闭、可重试。
    await waitFor(() => { expect(within(dialog).getByRole('alert').textContent).toBe(`${NS}.error.nested`) })
    expect(screen.queryByRole('dialog')).not.toBeNull()
    expect(screen.queryByText('host prose the dialog must localize')).toBeNull()
  })

  it('unavailable 结局：拾取入口隐藏、常驻手输提示接管，同一挂载不再有拾取入口', async () => {
    const harness = mount()
    harness.setPickerMode('unavailable')
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })
    expect(screen.getByRole('button', { name: `${NS}.panel.add` })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: `${NS}.panel.add` }))

    await waitFor(() => { expect(screen.getByText(`${NS}.picker.unavailable`)).toBeTruthy() })
    expect(screen.queryByRole('button', { name: `${NS}.panel.add` })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()

    // 手输兜底仍在：Enter 发 add（payload 是输入框内容）。
    const manual = screen.getByPlaceholderText(`${NS}.panel.addManual`)
    fireEvent.change(manual, { target: { value: '/repos/entered' } })
    fireEvent.keyDown(manual, { key: 'Enter' })
    await waitFor(() => { expect(harness.calls.some(call => call.endpoint === 'add')).toBe(true) })
    expect(harness.calls.find(call => call.endpoint === 'add')?.payload).toEqual({
      sessionId: 'session-1',
      path: '/repos/entered',
    })
  })

  it('primary 行有复制路径（写入 primaryRoot）且没有在文件管理器中显示', async () => {
    const harness = mount()
    renderSection(harness)
    await waitFor(() => { expect(screen.getByText('/repos/payments')).toBeTruthy() })

    const primary = primarySectionOf()
    fireEvent.click(within(primary).getByRole('button', { name: `${NS}.panel.copyPath` }))
    await waitFor(() => { expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/repos/primary') })
    // 「已复制」高亮也落在 primary 行（copiedId === 'primary'）。
    await waitFor(() => { expect(within(primary).getByRole('button', { name: `${NS}.panel.copied` })).toBeTruthy() })
    // D-08：host `requireEntry` 只寻址登记根，primary 行补 reveal 就是必然失败的点击。
    expect(within(primary).queryByRole('button', { name: `${NS}.panel.reveal` })).toBeNull()
  })
})
