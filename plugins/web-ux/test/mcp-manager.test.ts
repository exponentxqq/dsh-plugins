/**
 * Loaded-server lifecycle tests (spec: dsh-web-ux-project-mcp — 动态加载与失败
 * 隔离; task 4.1/4.2 and the diff rules task 6.1 drives).
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
