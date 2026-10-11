/**
 * Isolation tests (spec: dsh-project-mcp — 工作区可见性隔离 and
 * 隔离的动态刷新).
 *
 * The tool surface is faked, so each case asserts the two decisions that
 * matter: which names end up denied, and which calls the guard refuses. The
 * fakes also let a case make `restrict` throw, which is the failure mode the
 * design has to survive without losing the isolation.
 */
import { describe, expect, it } from 'vitest'
import {
  deriveDeny,
  guardReason,
  IsolationLayer,
  toolServerOf,
  type IsolationPorts,
  type ScopedTools,
} from '../src/host/isolation.ts'
import type { ScanLog } from '../src/host/types.ts'

/** A log that records what the layer reported. */
function recordingLog(): { log: ScanLog; infos: string[]; errors: string[] } {
  const infos: string[] = []
  const errors: string[] = []
  return { log: { info: (message) => infos.push(message), warn: () => {}, error: (message) => errors.push(message) }, infos, errors }
}

/**
 * A tool surface that records restrictions and keeps the installed guard.
 *
 * `scopeNames` is the agent's own view, i.e. what the registry resolves for
 * the agent's scope: a name listed there but not in the host catalog models
 * this deployment, where the model-facing rows sit on the agent plane. A name
 * the installed restriction masks disappears from the view, exactly as the
 * real `tools.schemas(scope)` drops it.
 */
function fakeTools(options: {
  scopeNames?: readonly string[]
  refuse?: (deny: readonly string[]) => string | undefined
} = {}) {
  const restrictions: (readonly string[])[] = []
  const guards: ((execution: { readonly name: string }) => string | undefined)[] = []
  const lifted: number[] = []
  let scopeNames = options.scopeNames ?? []
  let refuse = options.refuse
  let applied: readonly string[] = []
  return {
    restrictions,
    guards,
    lifted,
    setScopeNames: (names: readonly string[]) => {
      scopeNames = names
    },
    setRefuse: (next: ((deny: readonly string[]) => string | undefined) | undefined) => {
      refuse = next
    },
    tools: {
      restrict: (filter: { readonly deny: readonly string[] }) => {
        const reason = refuse?.(filter.deny)
        if (reason !== undefined) throw new Error(reason)
        restrictions.push(filter.deny)
        applied = filter.deny
        return () => {
          lifted.push(restrictions.length)
          applied = []
        }
      },
      guard: (fn: (execution: { readonly name: string }) => string | undefined) => {
        guards.push(fn)
        return () => {}
      },
      visibleNames: () => scopeNames.filter((name) => !applied.includes(name)),
    } satisfies ScopedTools,
  }
}

/** Ports with explicit defaults, so each case names only what it changes. */
function ports(overrides: Partial<IsolationPorts> = {}): IsolationPorts {
  const log = overrides.log ?? recordingLog().log
  return {
    catalog: () => [],
    attribute: async () => null,
    serverNamesForRoots: () => new Set(),
    managedServerNames: () => new Set(),
    log,
    ...overrides,
  }
}

describe('deny derivation', () => {
  it('reads the server name out of an MCP tool name only', () => {
    expect(toolServerOf('mcp__figma__get_figma_data')).toBe('figma')
    expect(toolServerOf('mcp__my-server__tool')).toBe('my-server')
    expect(toolServerOf('read_file')).toBeUndefined()
    expect(toolServerOf('mcp__figma')).toBeUndefined()
  })

  it('denies only registered names of managed servers that the workspace does not define', () => {
    const registered = [
      'mcp__figma__get_figma_data',
      'mcp__figma__download_figma_images',
      'mcp__dbx__execute_query',
      'read_file',
    ]
    const deny = deriveDeny(registered, new Set(['figma']), new Set())

    // The profile-level dbx server and the built-in tool are never touched.
    expect(deny).toEqual(['mcp__figma__download_figma_images', 'mcp__figma__get_figma_data'])
  })

  it('denies nothing for the workspace that defines the server', () => {
    const deny = deriveDeny(['mcp__figma__get_figma_data'], new Set(['figma']), new Set(['figma']))

    expect(deny).toEqual([])
  })

  it('fails closed for a directory no workspace claims', () => {
    const deny = deriveDeny(['mcp__figma__x', 'mcp__other__y'], new Set(['figma', 'other']), new Set())

    expect(deny).toEqual(['mcp__figma__x', 'mcp__other__y'])
  })
})

describe('dispatch guard', () => {
  it('refuses an out-of-scope managed call and allows everything else', () => {
    const managed = new Set(['figma'])
    const visible = new Set<string>()

    expect(guardReason('mcp__figma__get_figma_data', managed, visible)).toContain('figma')
    expect(guardReason('mcp__figma__get_figma_data', managed, new Set(['figma']))).toBeUndefined()
    expect(guardReason('read_file', managed, visible)).toBeUndefined()
    expect(guardReason('mcp__dbx__execute_query', managed, visible)).toBeUndefined()
  })
})

describe('isolation layer', () => {
  it('restricts an agent to the servers of its workspace', async () => {
    const io = fakeTools()
    const { log } = recordingLog()
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data', 'mcp__dbx__execute_query', 'read_file'],
      managedServerNames: () => new Set(['figma']),
      attribute: async () => ['/work/b'],
      serverNamesForRoots: () => new Set(),
      log,
    }))

    await layer.attach({}, '/work/b', io.tools)

    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])
  })

  it('installs exactly one guard per agent and keeps it across refreshes', async () => {
    const io = fakeTools()
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data'],
      managedServerNames: () => new Set(['figma']),
    }))

    await layer.attach({}, '/work/b', io.tools)
    await layer.refresh()
    await layer.refresh()

    expect(io.guards).toHaveLength(1)
  })

  it('leaves an unchanged deny set alone (no repeated registration)', async () => {
    const io = fakeTools()
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data'],
      managedServerNames: () => new Set(['figma']),
    }))

    await layer.attach({}, '/work/b', io.tools)
    await layer.refresh()

    expect(io.restrictions).toHaveLength(1)
  })

  it('picks up a tool registered after the agent was created', async () => {
    const io = fakeTools()
    let catalog: string[] = []
    const layer = new IsolationLayer(ports({
      catalog: () => catalog,
      managedServerNames: () => new Set(['figma']),
    }))

    await layer.attach({}, '/work/b', io.tools)
    expect(io.restrictions).toEqual([])

    // The server connects and publishes its tools, which fires tools/change.
    catalog = ['mcp__figma__get_figma_data']
    await layer.refresh()

    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])
  })

  it('lifts the restriction when the agent moves into the owning workspace', async () => {
    const io = fakeTools()
    let roots: readonly string[] | null = null
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data'],
      managedServerNames: () => new Set(['figma']),
      attribute: async () => roots,
      serverNamesForRoots: (set) => (set.has('/work/a') ? new Set(['figma']) : new Set()),
    }))

    await layer.attach({}, '/work/b', io.tools)
    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])

    roots = ['/work/a']
    await layer.refresh()

    // Lifting is enough to restore the full view; no empty restriction is
    // registered for a workspace that now owns every server.
    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])
    expect(io.lifted).toHaveLength(1)
  })

  it('denies a managed name only the agent scope reports (the agent-plane case)', async () => {
    // The host's global layer never carried this name: the model-facing rows
    // live on the agent plane, so a global-only catalog computes an empty deny
    // set and the tool stays visible to the model.
    const io = fakeTools({
      scopeNames: ['mcp__figma__get_figma_data', 'read_file'],
    })
    const layer = new IsolationLayer(ports({
      catalog: () => ['read_file'],
      managedServerNames: () => new Set(['figma']),
    }))

    await layer.attach({}, '/work/b', io.tools)

    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])
    expect(io.tools.visibleNames()).toEqual(['read_file'])
  })

  it('keeps a masked name denied once the agent view stops reporting it', async () => {
    const io = fakeTools({ scopeNames: ['mcp__figma__get_figma_data'] })
    const layer = new IsolationLayer(ports({
      catalog: () => [],
      managedServerNames: () => new Set(['figma']),
    }))

    await layer.attach({}, '/work/b', io.tools)
    await layer.refresh()
    await layer.refresh()

    // Without carrying the masked names forward, the second pass would read an
    // empty view, lift the restriction, and expose the tool again.
    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])
    expect(io.lifted).toEqual([])
  })

  it('drops a carried name whose registration is gone and retries once', async () => {
    const io = fakeTools({ scopeNames: ['mcp__figma__get_figma_data'] })
    const { log, errors } = recordingLog()
    const layer = new IsolationLayer(ports({
      catalog: () => [],
      managedServerNames: () => new Set(['figma']),
      log,
    }))

    await layer.attach({}, '/work/b', io.tools)
    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])

    // The server reloaded with a different tool list: the old name is still
    // carried, the new one is live, and the registry now rejects the old name.
    io.setScopeNames(['mcp__figma__other_tool'])
    io.setRefuse((deny) => (deny.includes('mcp__figma__get_figma_data') ? 'unknown global tool' : undefined))
    await layer.refresh()

    expect(errors.some((message) => message.includes('unknown global tool'))).toBe(true)
    expect(io.restrictions.at(-1)).toEqual(['mcp__figma__other_tool'])
    expect(io.tools.visibleNames()).toEqual([])
  })

  it('survives a rejecting restriction and retries on the next refresh', async () => {
    const io = fakeTools({ refuse: () => 'unknown tool name' })
    const { log, errors } = recordingLog()
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data'],
      managedServerNames: () => new Set(['figma']),
      log,
    }))

    await layer.attach({}, '/work/b', io.tools)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('unknown tool name')

    // The deny set was not recorded as applied, so the next recompute retries.
    await layer.refresh()
    expect(errors).toHaveLength(2)
  })

  it('fails closed when the attribution of a session throws', async () => {
    const io = fakeTools({ scopeNames: ['mcp__figma__get_figma_data'] })
    const { log, errors } = recordingLog()
    const layer = new IsolationLayer(ports({
      catalog: () => [],
      managedServerNames: () => new Set(['figma']),
      attribute: async () => {
        throw new Error('realpath exploded')
      },
      log,
    }))

    await layer.attach({}, '/work/b', io.tools)

    // Unknown attribution denies every project MCP tool name, as the spec asks.
    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])
    expect(errors.some((message) => message.includes('realpath exploded'))).toBe(true)
  })

  it('still isolates when the host catalog read throws', async () => {
    const io = fakeTools({ scopeNames: ['mcp__figma__get_figma_data'] })
    const { log, errors } = recordingLog()
    const layer = new IsolationLayer(ports({
      catalog: () => {
        throw new Error('unsupported schema')
      },
      managedServerNames: () => new Set(['figma']),
      log,
    }))

    await layer.attach({}, '/work/b', io.tools)

    // The agent's own view supplies the names the unreadable catalog lost.
    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])
    expect(errors.some((message) => message.includes('unsupported schema'))).toBe(true)
  })

  it('reports the first recompute of an agent and the mask it applied', async () => {
    const io = fakeTools()
    const { log, infos } = recordingLog()
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data', 'read_file'],
      managedServerNames: () => new Set(['figma']),
      attribute: async () => ['/work/b'],
      serverNamesForRoots: () => new Set(),
      log,
    }))

    await layer.attach({}, '/work/b', io.tools)
    await layer.refresh()

    // One report for the first reading, one line for the mask that took effect.
    expect(infos).toHaveLength(2)
    expect(infos[0]).toContain('global=2')
    expect(infos[0]).toContain('deny=1')
    expect(infos[1]).toContain('masked 1 tool(s)')
    expect(infos[1]).toContain('mcp__figma__get_figma_data')
  })

  it('lifts everything when an agent scope goes away', async () => {
    const io = fakeTools()
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data'],
      managedServerNames: () => new Set(['figma']),
    }))

    const key = {}
    await layer.attach(key, '/work/b', io.tools)
    layer.detach(key)

    expect(io.lifted).toHaveLength(1)
    await layer.refresh()
    expect(io.restrictions).toHaveLength(1)
  })

  it('guards the agent it was attached for', async () => {
    const io = fakeTools()
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data'],
      managedServerNames: () => new Set(['figma']),
    }))

    await layer.attach({}, '/work/b', io.tools)
    const guard = io.guards[0]

    expect(guard?.({ name: 'mcp__figma__get_figma_data' })).toContain('figma')
    expect(guard?.({ name: 'read_file' })).toBeUndefined()
  })
})
