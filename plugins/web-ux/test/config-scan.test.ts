/**
 * Scan-layer tests (spec: dsh-web-ux-project-mcp — 扫描范围 / 配置文件格式与
 * serverName / 环境变量展开 / serverName 冲突仲裁).
 *
 * Every case drives the real scan pipeline over a fake directory tree, so the
 * asserted behavior is the shipped behavior: the filesystem, the environment,
 * and the log are the only things substituted.
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { workspaceRoots } from '../src/host/roots.ts'
import { scanServers } from '../src/host/scan.ts'
import type { ScanIo, ScanLog, WorkspaceRoots } from '../src/host/types.ts'

/** One workspace with just its primary root. */
function primary(root: string): WorkspaceRoots {
  return { primaryRoot: root, roots: [root] }
}

/** A filesystem seam over literal directory listings and file bodies. */
function fakeIo(tree: Record<string, readonly string[]>, files: Record<string, string>): ScanIo {
  return {
    readDir: async (dir) => {
      const entries = tree[dir]
      if (entries === undefined) throw new Error(`ENOENT: no such directory ${dir}`)
      return entries
    },
    readFile: async (file) => {
      const text = files[file]
      if (text === undefined) throw new Error(`ENOENT: no such file ${file}`)
      return text
    },
  }
}

/** A log that records what the scan reported. */
function recordingLog(): { log: ScanLog; warnings: string[]; errors: string[] } {
  const warnings: string[] = []
  const errors: string[] = []
  return {
    log: { info: () => {}, warn: (message) => warnings.push(message), error: (message) => errors.push(message) },
    warnings,
    errors,
  }
}

/** A stdio configuration body, with an optional explicit `serverName` and command. */
function stdioBody(serverName?: string, command = 'figma-developer-mcp'): string {
  return `${serverName === undefined ? '' : `serverName: ${serverName}\n`}transport: stdio\ncommand: ${command}\n`
}

describe('workspace root enumeration', () => {
  it('merges each primary root with the additional roots granted to it, in registry order', () => {
    const ctx = {
      get: (name: string) => {
        if (name === 'workspaceRegistry') return { list: () => [{ path: '/work/a' }, { path: '/work/b' }] }
        if (name === 'multiRootRegistry') {
          return {
            granted: (root: string) => (root === '/work/a' ? ['/extra/one', '/extra/two', '/work/a'] : []),
            onChange: () => () => {},
          }
        }
        return undefined
      },
    } as unknown as Context

    expect(workspaceRoots(ctx)).toEqual([
      // The restated primary root is not duplicated, and it stays first.
      { primaryRoot: '/work/a', roots: ['/work/a', '/extra/one', '/extra/two'] },
      { primaryRoot: '/work/b', roots: ['/work/b'] },
    ])
  })

  it('degrades to primary roots alone when the additional-root service is absent', () => {
    const ctx = {
      get: (name: string) => (name === 'workspaceRegistry' ? { list: () => [{ path: '/work/a' }] } : undefined),
    } as unknown as Context

    expect(workspaceRoots(ctx)).toEqual([{ primaryRoot: '/work/a', roots: ['/work/a'] }])
  })
})

describe('project MCP scan', () => {
  it('loads a primary root configuration and defaults serverName to the file name', async () => {
    const io = fakeIo({ '/work/a/.dsh/mcp': ['figma.yaml'] }, { '/work/a/.dsh/mcp/figma.yaml': stdioBody() })
    const { log } = recordingLog()

    const servers = await scanServers([primary('/work/a')], io, {}, log)

    expect(servers.map((server) => server.serverName)).toEqual(['figma'])
    expect(servers[0]?.config.command).toBe('figma-developer-mcp')
    expect(servers[0]?.source).toEqual({
      workspaceRoot: '/work/a',
      root: '/work/a',
      file: '/work/a/.dsh/mcp/figma.yaml',
    })
  })

  it('loads configurations from additional roots too', async () => {
    const workspaces: WorkspaceRoots[] = [{ primaryRoot: '/work/a', roots: ['/work/a', '/extra'] }]
    const io = fakeIo({ '/extra/.dsh/mcp': ['dbx.json'] }, {
      '/extra/.dsh/mcp/dbx.json': JSON.stringify({ transport: 'stdio', command: 'dbx-mcp' }),
    })
    const { log } = recordingLog()

    const servers = await scanServers(workspaces, io, {}, log)

    expect(servers.map((server) => server.serverName)).toEqual(['dbx'])
    expect(servers[0]?.source.root).toBe('/extra')
  })

  it('honours an explicit serverName and ignores non-configuration entries', async () => {
    const io = fakeIo({ '/work/a/.dsh/mcp': ['nested', 'notes.md', 'renamed.yml', 'other.txt'] }, {
      '/work/a/.dsh/mcp/renamed.yml': stdioBody('figma2'),
    })
    const { log } = recordingLog()

    const servers = await scanServers([primary('/work/a')], io, {}, log)

    expect(servers.map((server) => server.serverName)).toEqual(['figma2'])
    expect(log).toBeDefined()
  })

  it('skips an invalid serverName without disturbing its siblings', async () => {
    const io = fakeIo({ '/work/a/.dsh/mcp': ['bad.yaml', 'good.yaml'] }, {
      '/work/a/.dsh/mcp/bad.yaml': stdioBody('"bad name"'),
      '/work/a/.dsh/mcp/good.yaml': stdioBody(),
    })
    const { log, errors } = recordingLog()

    const servers = await scanServers([primary('/work/a')], io, {}, log)

    expect(servers.map((server) => server.serverName)).toEqual(['good'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('invalid serverName')
    expect(errors[0]).toContain('/work/a/.dsh/mcp/bad.yaml')
  })

  it('reports an unparsable file and keeps loading the rest', async () => {
    const io = fakeIo({ '/work/a/.dsh/mcp': ['broken.yaml', 'good.yaml'] }, {
      '/work/a/.dsh/mcp/broken.yaml': 'transport: [stdio\n',
      '/work/a/.dsh/mcp/good.yaml': stdioBody(),
    })
    const { log, errors } = recordingLog()

    const servers = await scanServers([primary('/work/a')], io, {}, log)

    expect(servers.map((server) => server.serverName)).toEqual(['good'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('cannot parse')
  })

  it('ignores a root without a .dsh/mcp directory', async () => {
    const { log, errors } = recordingLog()

    const servers = await scanServers([primary('/work/missing')], fakeIo({}, {}), {}, log)

    expect(servers).toEqual([])
    expect(errors).toEqual([])
  })
})

describe('environment expansion', () => {
  it('expands a set variable', async () => {
    const io = fakeIo({ '/work/a/.dsh/mcp': ['remote.yaml'] }, {
      '/work/a/.dsh/mcp/remote.yaml': 'transport: streamable-http\nurl: ${MCP_URL}\n',
    })
    const { log } = recordingLog()

    const servers = await scanServers([primary('/work/a')], io, { MCP_URL: 'https://mcp.example/rpc' }, log)

    expect(servers[0]?.config.url).toBe('https://mcp.example/rpc')
  })

  it('falls back to the :- default for an unset variable', async () => {
    const io = fakeIo({ '/work/a/.dsh/mcp': ['remote.yaml'] }, {
      '/work/a/.dsh/mcp/remote.yaml': 'transport: streamable-http\nurl: ${TOKEN:-anonymous}\n',
    })
    const { log, warnings } = recordingLog()

    const servers = await scanServers([primary('/work/a')], io, {}, log)

    expect(servers[0]?.config.url).toBe('anonymous')
    expect(warnings).toEqual([])
  })

  it('expands an unset variable without a default to empty and warns', async () => {
    const io = fakeIo({ '/work/a/.dsh/mcp': ['figma.yaml'] }, {
      '/work/a/.dsh/mcp/figma.yaml': `${stdioBody()}env:\n  FIGMA_API_KEY: \${FIGMA_API_KEY}\n`,
    })
    const { log, warnings } = recordingLog()

    const servers = await scanServers([primary('/work/a')], io, {}, log)

    expect(servers[0]?.config.env).toEqual({ FIGMA_API_KEY: '' })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('FIGMA_API_KEY')
  })
})

describe('documented examples', () => {
  it('parses the README\'s stdio example, expansions and all', async () => {
    // Copied verbatim from plugins/web-ux/README.md so the documented shape is
    // exercised by a test instead of drifting away from the parser.
    const body = [
      'transport: stdio',
      'command: /home/docker/.dsh/figma-mcp/node_modules/.bin/figma-developer-mcp',
      'args: [ "--stdio", "--no-telemetry", "--image-dir", "/home/xuqinqin/develop" ]',
      'env:',
      '  FIGMA_API_KEY: ${FIGMA_API_KEY}',
      '',
    ].join('\n')
    const io = fakeIo({ '/work/opc/.dsh/mcp': ['figma.yaml'] }, { '/work/opc/.dsh/mcp/figma.yaml': body })
    const { log, warnings } = recordingLog()

    const servers = await scanServers([primary('/work/opc')], io, { FIGMA_API_KEY: 'figd-secret' }, log)

    expect(servers.map((server) => server.serverName)).toEqual(['figma'])
    expect(servers[0]?.config).toEqual({
      transport: 'stdio',
      command: '/home/docker/.dsh/figma-mcp/node_modules/.bin/figma-developer-mcp',
      args: ['--stdio', '--no-telemetry', '--image-dir', '/home/xuqinqin/develop'],
      env: { FIGMA_API_KEY: 'figd-secret' },
      serverName: 'figma',
    })
    expect(warnings).toEqual([])
  })

  it('parses the README\'s streamable-http example with a :- default', async () => {
    const body = JSON.stringify({
      transport: 'streamable-http',
      url: '${MCP_URL:-http://127.0.0.1:8081/mcp}',
      headers: { authorization: 'Bearer ${MCP_TOKEN}' },
    })
    const io = fakeIo({ '/work/a/.dsh/mcp': ['remote.json'] }, { '/work/a/.dsh/mcp/remote.json': body })
    const { log } = recordingLog()

    const servers = await scanServers([primary('/work/a')], io, { MCP_TOKEN: 'tok' }, log)

    expect(servers[0]?.config).toEqual({
      transport: 'streamable-http',
      url: 'http://127.0.0.1:8081/mcp',
      headers: { authorization: 'Bearer tok' },
      serverName: 'remote',
    })
  })
})

describe('serverName arbitration', () => {
  it('lets the primary root beat an additional root', async () => {
    const workspaces: WorkspaceRoots[] = [{ primaryRoot: '/work/a', roots: ['/work/a', '/extra'] }]
    const io = fakeIo({ '/work/a/.dsh/mcp': ['figma.yaml'], '/extra/.dsh/mcp': ['figma.yaml'] }, {
      '/work/a/.dsh/mcp/figma.yaml': stdioBody(undefined, 'from-primary'),
      '/extra/.dsh/mcp/figma.yaml': stdioBody(undefined, 'from-extra'),
    })
    const { log, errors } = recordingLog()

    const servers = await scanServers(workspaces, io, {}, log)

    expect(servers.map((server) => server.serverName)).toEqual(['figma'])
    expect(servers[0]?.config.command).toBe('from-primary')
    // The log names both sides, so a user can tell which file lost and why.
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('/work/a/.dsh/mcp/figma.yaml')
    expect(errors[0]).toContain('/extra/.dsh/mcp/figma.yaml')
    expect(errors[0]).toContain('/work/a')
  })

  it('lets the earlier-registered workspace beat a later one', async () => {
    const io = fakeIo({ '/work/a/.dsh/mcp': ['figma.yaml'], '/work/b/.dsh/mcp': ['figma.yaml'] }, {
      '/work/a/.dsh/mcp/figma.yaml': stdioBody(undefined, 'workspace-a'),
      '/work/b/.dsh/mcp/figma.yaml': stdioBody(undefined, 'workspace-b'),
    })
    const { log, errors } = recordingLog()

    const servers = await scanServers([primary('/work/a'), primary('/work/b')], io, {}, log)

    expect(servers.map((server) => server.serverName)).toEqual(['figma'])
    expect(servers[0]?.config.command).toBe('workspace-a')
    expect(errors).toHaveLength(1)
    // The log names the skipped workspace's file and the winner that kept the name.
    expect(errors[0]).toContain('/work/b/.dsh/mcp/figma.yaml')
    expect(errors[0]).toContain('/work/a/.dsh/mcp/figma.yaml')
  })

  it('never renames a conflicting server', async () => {
    const io = fakeIo({ '/work/a/.dsh/mcp': ['figma.yaml', 'figma.yml'] }, {
      '/work/a/.dsh/mcp/figma.yaml': stdioBody(undefined, 'first'),
      '/work/a/.dsh/mcp/figma.yml': stdioBody(undefined, 'second'),
    })
    const { log } = recordingLog()

    const servers = await scanServers([primary('/work/a')], io, {}, log)

    expect(servers.map((server) => server.serverName)).toEqual(['figma'])
  })

  it('walks a shared root once and reports no self-conflict', async () => {
    // `/work/b` is workspace B's primary root AND a root granted to workspace
    // A, so the walk reaches its files twice. Reporting the second visit would
    // describe each file as conflicting with itself and inflate the skip count
    // a user reads back from `/mcp-reload`.
    const workspaces: WorkspaceRoots[] = [
      { primaryRoot: '/work/a', roots: ['/work/a', '/work/b'] },
      { primaryRoot: '/work/b', roots: ['/work/b'] },
    ]
    const io = fakeIo({ '/work/b/.dsh/mcp': ['figma.yaml'] }, {
      '/work/b/.dsh/mcp/figma.yaml': stdioBody(undefined, 'shared-root'),
    })
    const { log, errors } = recordingLog()

    const servers = await scanServers(workspaces, io, {}, log)

    expect(servers.map((server) => server.serverName)).toEqual(['figma'])
    expect(errors).toEqual([])
  })
})
