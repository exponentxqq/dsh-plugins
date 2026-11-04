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
  RESOURCE_TOOLS,
  resourceDenyReason,
  resourceGuardReason,
  toolServerOf,
  type GuardedExecution,
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
  const guards: ((execution: GuardedExecution) => string | undefined)[] = []
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
      guard: (fn: (execution: GuardedExecution) => string | undefined) => {
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
    blockedServerNames: () => new Set(),
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

  it('denies only registered names of blocked servers that the workspace does not define', () => {
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

  it('denies nothing for a claim that failed to load (blocked, not claimed)', () => {
    // probe-shared is claimed but its load threw, so the manager reports
    // blocked = {probe-b} only: the profile row of that name must stay visible.
    const deny = deriveDeny(['mcp__probe-shared__ping', 'mcp__probe-b__ping'], new Set(['probe-b']), new Set())

    expect(deny).toEqual(['mcp__probe-b__ping'])
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
  it('refuses an out-of-scope blocked call and allows everything else', () => {
    const blocked = new Set(['figma'])
    const visible = new Set<string>()

    expect(guardReason('mcp__figma__get_figma_data', blocked, visible)).toContain('figma')
    expect(guardReason('mcp__figma__get_figma_data', blocked, new Set(['figma']))).toBeUndefined()
    expect(guardReason('read_file', blocked, visible)).toBeUndefined()
    expect(guardReason('mcp__dbx__execute_query', blocked, visible)).toBeUndefined()
  })

  it('leaves a claim that failed to load out of the deny set (blocked, not claimed)', () => {
    const blocked = new Set(['probe-a'])
    const visible = new Set<string>()

    // Loaded or still loading: ours to deny.
    expect(guardReason('mcp__probe-a__ping', blocked, visible)).toContain('probe-a')
    // Claimed but its load threw: the manager keeps it out of the blocked set,
    // so a profile-level server of the same name is not denied by a failure
    // that never produced a tool.
    expect(guardReason('mcp__probe-shared__ping', blocked, visible)).toBeUndefined()
    // Never claimed at all (a profile row): outside this gate.
    expect(guardReason('mcp__codebase-memory__search', blocked, visible)).toBeUndefined()
  })
})

describe('resource gate', () => {
  const blocked = new Set(['probe-b'])
  const visible = new Set(['probe-a'])

  it('names exactly the three resource tools', () => {
    expect(Array.from(RESOURCE_TOOLS).sort()).toEqual([
      'list_mcp_resource_templates',
      'list_mcp_resources',
      'read_mcp_resource',
    ])
    expect(RESOURCE_TOOLS.has('mcp__probe-b__ping')).toBe(false)
  })

  it('refuses every resource tool for a blocked server outside the scope, in the upstream wording', () => {
    // The phrase the upstream resource runtime throws for a server it cannot
    // resolve. An out-of-scope server must be indistinguishable from a missing
    // one, and both come out of the very same function, so equality is exact.
    const absentServer = resourceDenyReason('probe-b')
    expect(absentServer).toBe('MCP resource server "probe-b" is unavailable in this agent\'s scope')

    for (const toolName of RESOURCE_TOOLS) {
      expect(resourceGuardReason(toolName, { server: 'probe-b' }, blocked, visible)).toBe(absentServer)
    }
  })

  it('allows the three tools for a server of the agent\'s own workspace', () => {
    const scoped = new Set(['probe-a', 'probe-b'])
    for (const toolName of RESOURCE_TOOLS) {
      expect(resourceGuardReason(toolName, { server: 'probe-a' }, blocked, scoped)).toBeUndefined()
    }
  })

  it('allows a profile-level or unknown server (not blocked)', () => {
    for (const server of ['codebase-memory', 'probe-unknown', 'probe-shared']) {
      for (const toolName of RESOURCE_TOOLS) {
        // probe-shared is the failed claim: it never entered blocked, so the
        // profile server of that name keeps its resources too.
        expect(resourceGuardReason(toolName, { server }, blocked, visible)).toBeUndefined()
      }
    }
  })

  it('hands malformed arguments back to the tool instead of denying them', () => {
    // A guard runs before the tool validates its schema: every shape that is
    // not a non-empty string server must be left to that validation.
    const malformed: unknown[] = [
      undefined,
      null,
      'x',
      [],
      {},
      { server: 1 },
      { server: '' },
      { server: null },
    ]
    for (const args of malformed) {
      expect(resourceGuardReason('read_mcp_resource', args, blocked, visible)).toBeUndefined()
    }
  })

  it('leaves non-resource tools to the tool face', () => {
    expect(resourceGuardReason('mcp__probe-b__ping', { server: 'probe-b' }, blocked, visible)).toBeUndefined()
    expect(resourceGuardReason('read_file', { server: 'probe-b' }, blocked, visible)).toBeUndefined()
  })
})

describe('isolation layer', () => {
  it('restricts an agent to the servers of its workspace', async () => {
    const io = fakeTools()
    const { log } = recordingLog()
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data', 'mcp__dbx__execute_query', 'read_file'],
      blockedServerNames: () => new Set(['figma']),
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
      blockedServerNames: () => new Set(['figma']),
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
      blockedServerNames: () => new Set(['figma']),
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
      blockedServerNames: () => new Set(['figma']),
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
      blockedServerNames: () => new Set(['figma']),
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

  it('denies a blocked name only the agent scope reports (the agent-plane case)', async () => {
    // The host's global layer never carried this name: the model-facing rows
    // live on the agent plane, so a global-only catalog computes an empty deny
    // set and the tool stays visible to the model.
    const io = fakeTools({
      scopeNames: ['mcp__figma__get_figma_data', 'read_file'],
    })
    const layer = new IsolationLayer(ports({
      catalog: () => ['read_file'],
      blockedServerNames: () => new Set(['figma']),
    }))

    await layer.attach({}, '/work/b', io.tools)

    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])
    expect(io.tools.visibleNames()).toEqual(['read_file'])
  })

  it('keeps a masked name denied once the agent view stops reporting it', async () => {
    const io = fakeTools({ scopeNames: ['mcp__figma__get_figma_data'] })
    const layer = new IsolationLayer(ports({
      catalog: () => [],
      blockedServerNames: () => new Set(['figma']),
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
      blockedServerNames: () => new Set(['figma']),
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
      blockedServerNames: () => new Set(['figma']),
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
      blockedServerNames: () => new Set(['figma']),
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
      blockedServerNames: () => new Set(['figma']),
      log,
    }))

    await layer.attach({}, '/work/b', io.tools)

    // The agent's own view supplies the names the unreadable catalog lost.
    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])
    expect(errors.some((message) => message.includes('unsupported schema'))).toBe(true)
  })

  it('goes quiet once its own context turns inactive (host teardown)', async () => {
    const io = fakeTools({ scopeNames: ['mcp__figma__get_figma_data'] })
    const { log, errors } = recordingLog()
    let catalogCalls = 0
    const layer = new IsolationLayer(ports({
      catalog: () => {
        catalogCalls += 1
        throw new Error('cannot get required service "tools" in inactive context')
      },
      blockedServerNames: () => new Set(['figma']),
      log,
    }))

    await layer.attach({}, '/work/b', io.tools)
    // Teardown is the shutdown itself, not a failure worth an error line.
    expect(errors).toEqual([])
    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])

    // At host teardown every tool unregistration fires tools/change; after the
    // first inactive reading none of them reaches the ports again.
    await layer.refresh()
    await layer.refresh()
    expect(catalogCalls).toBe(1)
  })

  it('reads an inactive agent view as empty, without an error line', async () => {
    const io = fakeTools({ scopeNames: ['mcp__figma__get_figma_data'] })
    const { log, errors } = recordingLog()
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data'],
      blockedServerNames: () => new Set(['figma']),
      log,
    }))

    await layer.attach({}, '/work/b', io.tools)
    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])

    // The agent scope is disposed between refreshes: its view becomes an
    // inactive-context throw, which counts as an empty reading, not a failure,
    // and must not retire the layer the way the plugin-scope read does.
    io.tools.visibleNames = () => {
      throw new Error('cannot get required service "tools" in inactive context')
    }
    await layer.refresh()

    expect(errors).toEqual([])
    expect(io.restrictions).toEqual([['mcp__figma__get_figma_data']])
  })

  it('still reports an agent view that fails for a real reason', async () => {
    const io = fakeTools({ scopeNames: ['mcp__figma__get_figma_data'] })
    const { log, errors } = recordingLog()
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data'],
      blockedServerNames: () => new Set(['figma']),
      log,
    }))

    await layer.attach({}, '/work/b', io.tools)
    io.tools.visibleNames = () => {
      throw new Error('view exploded')
    }
    await layer.refresh()

    expect(errors.some((message) => message.includes('view exploded'))).toBe(true)
  })

  it('reports the first recompute of an agent and the mask it applied', async () => {
    const io = fakeTools()
    const { log, infos } = recordingLog()
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__figma__get_figma_data', 'read_file'],
      blockedServerNames: () => new Set(['figma']),
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
      blockedServerNames: () => new Set(['figma']),
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
      blockedServerNames: () => new Set(['figma']),
    }))

    await layer.attach({}, '/work/b', io.tools)
    const guard = io.guards[0]

    expect(guard?.({ name: 'mcp__figma__get_figma_data' })).toContain('figma')
    expect(guard?.({ name: 'read_file' })).toBeUndefined()
  })
})

describe('isolation layer visibility read', () => {
  it('reports a tracked agent\'s current visible servers and nothing for an unknown key', async () => {
    const io = fakeTools()
    let servers = new Set(['probe-a'])
    const layer = new IsolationLayer(ports({
      attribute: async () => ['/work/a'],
      serverNamesForRoots: () => servers,
    }))

    const key = {}
    await layer.attach(key, '/work/a', io.tools)

    expect(layer.visibleFor(key)).toEqual(new Set(['probe-a']))
    // An untracked key is how the name face learns "hide every project server":
    // undefined, never an empty set (which would mean "nothing hidden").
    expect(layer.visibleFor({})).toBeUndefined()

    // Live reference: a refresh replaces the set, and the read sees the new one.
    servers = new Set(['probe-b'])
    await layer.refresh()
    expect(layer.visibleFor(key)).toEqual(new Set(['probe-b']))

    layer.detach(key)
    expect(layer.visibleFor(key)).toBeUndefined()
  })
})

describe('isolation layer resource face', () => {
  it('refuses a resource call to a blocked server outside the scope, in the upstream wording', async () => {
    const io = fakeTools()
    const layer = new IsolationLayer(ports({
      blockedServerNames: () => new Set(['probe-b']),
      attribute: async () => ['/work/a'],
      serverNamesForRoots: () => new Set(['probe-a']),
    }))

    await layer.attach({}, '/work/a', io.tools)
    const guard = io.guards[0]

    for (const toolName of RESOURCE_TOOLS) {
      expect(guard?.({ name: toolName, arguments: { server: 'probe-b' } }))
        .toBe(resourceDenyReason('probe-b'))
    }
    // Own workspace and profile rows pass; malformed arguments reach the tool.
    expect(guard?.({ name: 'read_mcp_resource', arguments: { server: 'probe-a' } })).toBeUndefined()
    expect(guard?.({ name: 'list_mcp_resources', arguments: { server: 'codebase-memory' } })).toBeUndefined()
    expect(guard?.({ name: 'read_mcp_resource', arguments: {} })).toBeUndefined()
  })

  it('runs the tool face first, then the resource face, reading the live blocked set', async () => {
    let blocked = new Set<string>()
    const io = fakeTools({ scopeNames: ['mcp__probe-b__ping'] })
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__probe-b__ping'],
      blockedServerNames: () => blocked,
      attribute: async () => ['/work/a'],
      serverNamesForRoots: () => new Set(['probe-a']),
    }))

    await layer.attach({}, '/work/a', io.tools)
    const guard = io.guards[0]

    // The same installed guard changes its answer with no refresh: every call
    // re-reads the live sets (D-12).
    blocked = new Set(['probe-b'])
    expect(guard?.({ name: 'mcp__probe-b__ping' })).toContain('belongs to MCP server probe-b')
    expect(guard?.({ name: 'list_mcp_resources', arguments: { server: 'probe-b' } }))
      .toBe(resourceDenyReason('probe-b'))
    expect(guard?.({ name: 'read_file' })).toBeUndefined()
  })

  it('does not deny a profile server whose name a failed claim shadowed', async () => {
    // The project claim `probe-shared` collides with a profile row and its load
    // throws: the manager keeps it out of blocked, so neither of its names is
    // ours to mask or refuse.
    const io = fakeTools({ scopeNames: ['mcp__probe-shared__ping', 'mcp__probe-a__ping'] })
    const layer = new IsolationLayer(ports({
      catalog: () => ['mcp__probe-shared__ping', 'mcp__probe-a__ping'],
      blockedServerNames: () => new Set(['probe-a']),
      attribute: async () => ['/work/b'],
      serverNamesForRoots: () => new Set(),
    }))

    await layer.attach({}, '/work/b', io.tools)

    expect(io.restrictions).toEqual([['mcp__probe-a__ping']])
    const guard = io.guards[0]
    expect(guard?.({ name: 'mcp__probe-shared__ping' })).toBeUndefined()
    expect(guard?.({ name: 'list_mcp_resources', arguments: { server: 'probe-shared' } })).toBeUndefined()
  })
})
