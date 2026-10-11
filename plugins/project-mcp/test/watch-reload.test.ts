/**
 * Filesystem-driven reload tests (spec: dsh-project-mcp — 热重载与手动重载;
 * task 6.1).
 *
 * Real temporary directories, the real `fs.watch` seam, the real scanner, and
 * the real reconciler: only the MCP client is faked. The asserted action
 * sequence is therefore the one a user's edit actually produces.
 */
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { nodeScanIo, nodeWatchIo } from '../src/host/host-io.ts'
import { McpManager } from '../src/host/mcp-manager.ts'
import { scanServers } from '../src/host/scan.ts'
import type { ScanLog, WorkspaceRoots } from '../src/host/types.ts'
import { DirectoryWatcher, watchTargets } from '../src/host/watcher.ts'

/** Short debounce keeps the cases quick without racing the filesystem. */
const DEBOUNCE_MS = 20

/** A log that stays quiet: these cases assert actions, not diagnostics. */
const quietLog: ScanLog = { info: () => {}, warn: () => {}, error: () => {} }

/** Temporary roots created by the running case, removed afterwards. */
const created: string[] = []

afterEach(async () => {
  for (const dir of created.splice(0)) await rm(dir, { recursive: true, force: true })
})

/**
 * Wait until a condition holds.
 * @param condition - the predicate to poll.
 * @param describe - what the case was waiting for (used in the failure).
 * @param timeoutMs - how long to wait before failing.
 */
async function waitFor(condition: () => boolean, describe: () => string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${describe()}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/** One fresh temporary workspace root. */
async function makeRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'wux-watch-'))
  created.push(dir)
  return dir
}

/**
 * Write one stdio configuration into a root's `.dsh/mcp/`.
 * @param root - the workspace root.
 * @param file - the file name (the default serverName).
 * @param command - the configured command (changed to force a reload).
 */
async function writeConfig(root: string, file: string, command: string): Promise<void> {
  const dir = path.join(root, '.dsh/mcp')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, file), `transport: stdio\ncommand: ${command}\n`, 'utf8')
}

describe('filesystem-driven reload', () => {
  it('loads, reloads, and unloads as files appear, change, and disappear', async () => {
    const root = await makeRoot()
    const mcpDir = path.join(root, '.dsh/mcp')
    const actions: string[] = []
    const manager = new McpManager({
      load: async (server) => {
        actions.push(`load:${server.serverName}`)
        return () => {
          actions.push(`unload:${server.serverName}`)
        }
      },
    }, quietLog)
    const workspaces: WorkspaceRoots[] = [{ primaryRoot: root, roots: [root] }]

    /** Exactly what one rescan does in the plugin, minus the host context. */
    async function pass(): Promise<void> {
      const servers = await scanServers(workspaces, nodeScanIo, {}, quietLog)
      await manager.sync(servers)
      watcher.arm(await watchTargets(nodeWatchIo, [root]))
    }

    const watcher = new DirectoryWatcher(nodeWatchIo, () => {
      void pass()
    }, quietLog, DEBOUNCE_MS)

    try {
      // A project with no configuration at all is watched at its own root.
      await pass()
      expect(actions).toEqual([])
      expect(watcher.watched()).toEqual([root])

      // Creating `.dsh/mcp` moves the watch down the ladder.
      await mkdir(mcpDir, { recursive: true })
      await waitFor(() => watcher.watched().includes(mcpDir), () => `a watch on ${mcpDir}, got ${watcher.watched().join(',')}`)

      await writeConfig(root, 'figma.yaml', 'figma-mcp')
      await waitFor(() => actions.includes('load:figma'), () => `load:figma, got ${actions.join(',')}`)

      await writeConfig(root, 'dbx.yaml', 'dbx-mcp')
      await waitFor(() => actions.includes('load:dbx'), () => `load:dbx, got ${actions.join(',')}`)

      // Editing a file disposes that server and loads it again; its neighbour
      // is untouched.
      await writeConfig(root, 'figma.yaml', 'figma-mcp@2')
      await waitFor(
        () => actions.filter((action) => action === 'load:figma').length === 2,
        () => `figma to reload, got ${actions.join(',')}`,
      )
      expect(actions.filter((action) => action === 'unload:dbx')).toEqual([])

      await unlink(path.join(mcpDir, 'dbx.yaml'))
      await waitFor(() => actions.includes('unload:dbx'), () => `unload:dbx, got ${actions.join(',')}`)
      expect(actions.filter((action) => action === 'load:dbx')).toEqual(['load:dbx'])

      // The remaining server is still loaded: a deletion is not a teardown.
      expect(actions.filter((action) => action === 'unload:figma')).toEqual(['unload:figma'])
    } finally {
      watcher.dispose()
    }
  })

  it('aims each watch at the deepest existing ladder step', async () => {
    const root = await makeRoot()
    expect(await watchTargets(nodeWatchIo, [root])).toEqual([root])

    await mkdir(path.join(root, '.dsh'), { recursive: true })
    expect(await watchTargets(nodeWatchIo, [root])).toEqual([path.join(root, '.dsh')])

    await mkdir(path.join(root, '.dsh/mcp'), { recursive: true })
    expect(await watchTargets(nodeWatchIo, [root])).toEqual([path.join(root, '.dsh/mcp')])
  })
})
