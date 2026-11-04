/**
 * Loaded-server lifecycle tests (spec: dsh-project-mcp — 动态加载与失败
 * 隔离; task 4.1/4.2, the diff rules task 6.1 drives, and the retry-window
 * rule task 6.4 adds).
 *
 * The loader seam is faked, so these cases assert the manager's decisions —
 * what it loads, what it tears down, and what it reports — without a host
 * process, a child fiber, or an MCP server.
 */
import { describe, expect, it } from 'vitest'
import { McpManager, type ServerLoader, type SyncSummary } from '../src/host/mcp-manager.ts'
import type { ScanLog, ScannedServer } from '../src/host/types.ts'

/** A stdio server whose configuration lives under one root. */
function server(serverName: string, overrides: { command?: string; root?: string } = {}): ScannedServer {
  const root = overrides.root ?? `/work/${serverName}`
  return {
    serverName,
    config: { transport: 'stdio', command: overrides.command ?? 'example-mcp', serverName },
    source: { workspaceRoot: root, root, file: `${root}/.dsh/mcp/${serverName}.yaml` },
  }
}

/** A log that records what the manager reported. */
function recordingLog(): { log: ScanLog; warnings: string[]; errors: string[] } {
  const warnings: string[] = []
  const errors: string[] = []
  return {
    log: { info: () => {}, warn: (message) => warnings.push(message), error: (message) => errors.push(message) },
    warnings,
    errors,
  }
}

/** A loader that records its calls and can refuse selected servers. */
function fakeLoader(refuse?: (server: ScannedServer) => string | undefined): {
  loader: ServerLoader
  loaded: string[]
  disposed: string[]
} {
  const loaded: string[] = []
  const disposed: string[] = []
  return {
    loaded,
    disposed,
    loader: {
      load: async (candidate) => {
        const reason = refuse?.(candidate)
        if (reason !== undefined) throw new Error(reason)
        loaded.push(candidate.serverName)
        return () => {
          disposed.push(candidate.serverName)
        }
      },
    },
  }
}

/** One load a case settles by hand, as the manager waits on it. */
interface ManualLoad {
  /** The name the manager is trying to load. */
  readonly serverName: string
  /** Resolve the attempt, as a load that connected would. */
  succeed: () => void
  /** Reject the attempt, as a load that failed would. */
  fail: (reason: string) => void
}

/**
 * A loader whose every attempt stays pending until the case settles it.
 *
 * `started()` hands back the next attempt as soon as the manager begins it, so
 * a case can read the name sets while a load (or a retry) is in flight — the
 * exact window a fail-open gate would expose — without counting microtasks.
 */
function manualLoader(): {
  loader: ServerLoader
  /** Resolve with the next attempt once the manager starts it. */
  started: () => Promise<ManualLoad>
} {
  const queued: ManualLoad[] = []
  const waiting: Array<(load: ManualLoad) => void> = []
  const loader: ServerLoader = {
    load: (candidate) =>
      new Promise((resolve, reject) => {
        const attempt: ManualLoad = {
          serverName: candidate.serverName,
          succeed: () => resolve(() => {}),
          fail: (reason) => reject(new Error(reason)),
        }
        const waiter = waiting.shift()
        if (waiter === undefined) queued.push(attempt)
        else waiter(attempt)
      }),
  }
  return {
    loader,
    started: async () => {
      const ready = queued.shift()
      if (ready !== undefined) return ready
      return await new Promise<ManualLoad>((resolve) => waiting.push(resolve))
    },
  }
}

/** Render a summary for compact assertions. */
function summaryOf(summary: SyncSummary): Record<string, readonly string[]> {
  return {
    loaded: summary.loaded,
    reloaded: summary.reloaded,
    unloaded: summary.unloaded,
    unchanged: summary.unchanged,
    failed: summary.failed,
  }
}

/** Snapshot a name set as a sorted array for stable assertions. */
function names(set: ReadonlySet<string>): string[] {
  return [...set].sort()
}

describe('dynamic loading', () => {
  it('loads every configured server once and leaves it alone afterwards', async () => {
    const io = fakeLoader()
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    const first = await manager.sync([server('figma'), server('dbx')])
    expect(summaryOf(first)).toEqual({
      loaded: ['figma', 'dbx'], reloaded: [], unloaded: [], unchanged: [], failed: [],
    })

    const second = await manager.sync([server('figma'), server('dbx')])
    expect(summaryOf(second)).toEqual({
      loaded: [], reloaded: [], unloaded: [], unchanged: ['figma', 'dbx'], failed: [],
    })
    expect(io.loaded).toEqual(['figma', 'dbx'])
  })

  it('contains one server\'s failure and loads the rest', async () => {
    const io = fakeLoader((candidate) => (candidate.serverName === 'broken' ? 'boom' : undefined))
    const { log, errors } = recordingLog()
    const manager = new McpManager(io.loader, log)

    const summary = await manager.sync([server('broken'), server('figma')])

    expect(summaryOf(summary)).toEqual({
      loaded: ['figma'], reloaded: [], unloaded: [], unchanged: [], failed: ['broken'],
    })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('broken')
    expect(errors[0]).toContain('/work/broken/.dsh/mcp/broken.yaml')
  })

  it('isolates a profile-level serverName collision', async () => {
    const io = fakeLoader((candidate) =>
      candidate.serverName === 'figma' ? 'serverName "figma" is already reserved' : undefined)
    const { log, errors } = recordingLog()
    const manager = new McpManager(io.loader, log)

    const summary = await manager.sync([server('figma'), server('dbx')])

    expect(summary.failed).toEqual(['figma'])
    expect(summary.loaded).toEqual(['dbx'])
    expect(errors[0]).toContain('already reserved')
  })
})

describe('unloading and reloading', () => {
  it('disposes a server whose configuration disappeared, then loads that name again', async () => {
    const io = fakeLoader()
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    await manager.sync([server('figma')])
    const removed = await manager.sync([])
    expect(summaryOf(removed)).toEqual({
      loaded: [], reloaded: [], unloaded: ['figma'], unchanged: [], failed: [],
    })
    expect(io.disposed).toEqual(['figma'])

    const restored = await manager.sync([server('figma')])
    expect(restored.loaded).toEqual(['figma'])
    expect(restored.failed).toEqual([])
  })

  it('reloads a server whose configuration changed and keeps the unchanged ones', async () => {
    const io = fakeLoader()
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    await manager.sync([server('figma'), server('dbx')])
    const summary = await manager.sync([server('figma', { command: 'figma-mcp@2' }), server('dbx')])

    expect(summaryOf(summary)).toEqual({
      loaded: [], reloaded: ['figma'], unloaded: ['figma'], unchanged: ['dbx'], failed: [],
    })
    expect(io.disposed).toEqual(['figma'])
    expect(io.loaded).toEqual(['figma', 'dbx', 'figma'])
  })

  it('treats a rename as a removal plus an addition', async () => {
    const io = fakeLoader()
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    await manager.sync([server('figma')])
    const summary = await manager.sync([server('figma2')])

    expect(summaryOf(summary)).toEqual({
      loaded: ['figma2'], reloaded: [], unloaded: ['figma'], unchanged: [], failed: [],
    })
  })

  it('unloads every server on dispose', async () => {
    const io = fakeLoader()
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    await manager.sync([server('figma'), server('dbx')])
    await manager.dispose()

    expect(io.disposed).toEqual(['figma', 'dbx'])
    expect(manager.managedServerNames().size).toBe(0)
  })
})

describe('isolation facts', () => {
  it('keeps a failed claim in the managed set', async () => {
    const io = fakeLoader(() => 'unreachable')
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    await manager.sync([server('figma', { root: '/work/a' })])

    expect([...manager.managedServerNames()]).toEqual(['figma'])
  })

  it('resolves the servers visible to one root set', async () => {
    const io = fakeLoader()
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    await manager.sync([
      server('figma', { root: '/work/a' }),
      server('dbx', { root: '/work/a/extra' }),
      server('other', { root: '/work/b' }),
    ])

    expect([...manager.serverNamesForRoots(new Set(['/work/a', '/work/a/extra']))].sort()).toEqual(['dbx', 'figma'])
    expect([...manager.serverNamesForRoots(new Set(['/work/b']))]).toEqual(['other'])
    expect([...manager.serverNamesForRoots(new Set(['/work/nowhere']))]).toEqual([])
  })
})

describe('failure readings', () => {
  it('reports a failed load as failed, blocked out, and still claimed', async () => {
    const io = fakeLoader((candidate) => (candidate.serverName === 'broken' ? 'boom' : undefined))
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    await manager.sync([server('broken'), server('figma')])

    expect(names(manager.failedServerNames())).toEqual(['broken'])
    expect(names(manager.blockedServerNames())).toEqual(['figma'])
    expect(names(manager.managedServerNames())).toEqual(['broken', 'figma'])
  })

  it('clears the failure mark once the server loads on a later reconciliation', async () => {
    let refuseBroken = true
    const io = fakeLoader((candidate) =>
      candidate.serverName === 'broken' && refuseBroken ? 'boom' : undefined)
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    await manager.sync([server('broken'), server('figma')])
    expect(names(manager.failedServerNames())).toEqual(['broken'])

    refuseBroken = false
    const retried = await manager.sync([server('broken'), server('figma')])
    expect(retried.loaded).toEqual(['broken'])
    expect(retried.failed).toEqual([])
    expect(names(manager.failedServerNames())).toEqual([])
    expect(names(manager.blockedServerNames())).toEqual(['broken', 'figma'])
    expect(names(manager.managedServerNames())).toEqual(['broken', 'figma'])
  })

  it('drops a failed claim from every reading when it leaves the scan', async () => {
    const io = fakeLoader((candidate) => (candidate.serverName === 'broken' ? 'boom' : undefined))
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    await manager.sync([server('broken'), server('figma')])
    await manager.sync([server('figma')])

    expect(names(manager.failedServerNames())).toEqual([])
    expect(names(manager.blockedServerNames())).toEqual(['figma'])
    expect(names(manager.managedServerNames())).toEqual(['figma'])
  })

  it('drops a loaded server from every reading when its configuration disappears', async () => {
    const io = fakeLoader()
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    await manager.sync([server('figma')])
    expect(names(manager.blockedServerNames())).toEqual(['figma'])

    const removed = await manager.sync([])
    expect(removed.unloaded).toEqual(['figma'])
    expect(names(manager.failedServerNames())).toEqual([])
    expect(names(manager.blockedServerNames())).toEqual([])
    expect(names(manager.managedServerNames())).toEqual([])
    expect(io.disposed).toEqual(['figma'])
  })

  it('clears the failure marks on dispose so the next scan starts clean', async () => {
    const io = fakeLoader((candidate) => (candidate.serverName === 'broken' ? 'boom' : undefined))
    const { log } = recordingLog()
    const manager = new McpManager(io.loader, log)

    await manager.sync([server('broken')])
    expect(names(manager.failedServerNames())).toEqual(['broken'])

    await manager.dispose()

    expect(names(manager.failedServerNames())).toEqual([])
    expect(names(manager.blockedServerNames())).toEqual([])
    expect(names(manager.managedServerNames())).toEqual([])

    await manager.sync([server('figma')])
    expect(names(manager.failedServerNames())).toEqual([])
    expect(names(manager.blockedServerNames())).toEqual(['figma'])
    expect(names(manager.managedServerNames())).toEqual(['figma'])
  })

  it('keeps blocked equal to the claim set minus the failed set after every reconciliation', async () => {
    const down = new Set(['broken', 'flaky'])
    const io = fakeLoader((candidate) => (down.has(candidate.serverName) ? 'boom' : undefined))
    const manager = new McpManager(io.loader, recordingLog().log)

    const check = (failed: readonly string[]): void => {
      const claimed = manager.managedServerNames()
      const failedSet = manager.failedServerNames()
      expect(names(failedSet)).toEqual([...failed].sort())
      for (const serverName of failedSet) expect(claimed.has(serverName)).toBe(true)
      for (const serverName of failedSet) expect(manager.blockedServerNames().has(serverName)).toBe(false)
      const claimMinusFailure = new Set([...claimed].filter((serverName) => !failedSet.has(serverName)))
      expect(names(manager.blockedServerNames())).toEqual(names(claimMinusFailure))
    }

    await manager.sync([server('figma'), server('broken')])
    check(['broken'])

    await manager.sync([server('figma'), server('broken'), server('flaky')])
    check(['broken', 'flaky'])

    down.delete('broken')
    await manager.sync([server('figma'), server('broken'), server('flaky')])
    check(['flaky'])

    await manager.sync([server('figma')])
    check([])
  })
})

describe('retry window isolation', () => {
  it('blocks a retried claim while its retry is connecting, then fails it again', async () => {
    const io = manualLoader()
    const manager = new McpManager(io.loader, recordingLog().log)

    const first = manager.sync([server('figma')])
    const firstAttempt = await io.started()
    firstAttempt.fail('boom')
    await first
    expect(names(manager.failedServerNames())).toEqual(['figma'])
    expect(names(manager.blockedServerNames())).toEqual([])

    // The retry starts by re-including the name in blocked: while the
    // connection is being attempted the claim is neither active nor known bad,
    // so the isolation gates must deny it (fail-closed).
    const retry = manager.sync([server('figma')])
    const retryAttempt = await io.started()
    expect(names(manager.blockedServerNames())).toEqual(['figma'])
    expect(names(manager.failedServerNames())).toEqual([])
    expect(names(manager.managedServerNames())).toEqual(['figma'])

    retryAttempt.fail('still down')
    const summary = await retry
    expect(summary.failed).toEqual(['figma'])
    expect(summary.loaded).toEqual([])
    expect(names(manager.failedServerNames())).toEqual(['figma'])
    expect(names(manager.blockedServerNames())).toEqual([])
    expect(names(manager.managedServerNames())).toEqual(['figma'])
  })

  it('keeps a retried claim blocked once the retry succeeds', async () => {
    const io = manualLoader()
    const manager = new McpManager(io.loader, recordingLog().log)

    const first = manager.sync([server('figma')])
    const firstAttempt = await io.started()
    firstAttempt.fail('boom')
    await first
    expect(names(manager.blockedServerNames())).toEqual([])

    const retry = manager.sync([server('figma')])
    const retryAttempt = await io.started()
    expect(names(manager.blockedServerNames())).toEqual(['figma'])
    expect(names(manager.failedServerNames())).toEqual([])

    retryAttempt.succeed()
    const summary = await retry
    expect(summary.loaded).toEqual(['figma'])
    expect(summary.failed).toEqual([])
    expect(names(manager.blockedServerNames())).toEqual(['figma'])
    expect(names(manager.failedServerNames())).toEqual([])
    expect(names(manager.managedServerNames())).toEqual(['figma'])
  })

  it('blocks a claimed name while its very first load is connecting', async () => {
    const io = manualLoader()
    const manager = new McpManager(io.loader, recordingLog().log)

    const load = manager.sync([server('figma')])
    const attempt = await io.started()
    expect(names(manager.blockedServerNames())).toEqual(['figma'])
    expect(names(manager.failedServerNames())).toEqual([])

    attempt.succeed()
    await load
    expect(names(manager.blockedServerNames())).toEqual(['figma'])
    expect(names(manager.failedServerNames())).toEqual([])
  })
})
