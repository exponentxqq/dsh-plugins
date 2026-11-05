// @vitest-environment jsdom
/**
 * The panel, driven the way the browser drives it: the real client entry is
 * applied to a stub client context, the registered component is rendered, and
 * every action is observed through the stub Connection channel.
 *
 * The stub is deliberate — the panel's contract IS the channel, and asserting
 * the exact (channel, endpoint, payload) triples is what keeps the browser half
 * and the host half from drifting apart. The host side of each endpoint is
 * covered by `tests/command.spec.ts` and by the behavior smoke.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PANEL_CHANNEL, type PanelRequest, type RevealedView, type RootView, type RootsView } from '../src/contract.ts'
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
      if (name === 'uiWorkspace') return { pickDirectory: async () => picked }
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
 * Render the section the plugin registered, with the composed props the
 * renderer passes: the seat owner share (`close`), the synthesized translator
 * and the registration's inject face. The component function is wrapped in an
 * element because React does not accept a bare function as a child.
 * @param harness - the mounted harness whose registration to render.
 */
function renderSection(harness: Harness): void {
  const registration = registrationOf(harness, 'workspace-config.section')
  const injected = registration.options.inject?.() ?? {}
  render(createElement(registration.component as never, {
    close: () => {},
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

    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.copyPath` })[0]!)
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
    fireEvent.click(screen.getAllByRole('button', { name: `${NS}.panel.copyPath` })[0]!)

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
    render(createElement(registration.component as never, { close: () => {}, t: translate, ...injected } as never))
    await waitFor(() => { expect(screen.getByRole('alert')).toBeTruthy() })
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
 * 全装格与「后装 holder 补跑」由 holder 的 `test/dialog.test.tsx` 用四个真 `apply` 同 ctx
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
