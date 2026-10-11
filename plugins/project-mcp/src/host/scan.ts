/**
 * The `.dsh/mcp/` scan: discovery, parsing, environment expansion, and
 * serverName arbitration.
 *
 * The scan is a pure traversal of an ordered root list. Its order is the
 * arbitration order, and it is a deliberate fact rather than an accident of
 * scheduling: workspaces in registry order, each workspace's primary root
 * before the roots granted to it, files sorted by name inside one directory.
 * The first configuration to claim a `serverName` wins; a later claimant is
 * reported with both sources and skipped. A name is never rewritten — it is
 * the `mcp__<serverName>__*` tool-name contract that session history and
 * permission rules already reference. One file is read once even when its root
 * belongs to two workspaces (a root granted to another workspace is walked in
 * both root sets): the second walk is the same file, not a second claimant.
 *
 * Nothing here touches `node:fs`, the clock, or the console directly: the
 * filesystem, the environment, and the log arrive as arguments, which is what
 * makes every rule above unit-testable.
 * @module dsh-plugin-project-mcp/host/scan
 */

import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { expandDeep } from './env-expand.ts'
import type { ScanIo, ScanLog, ScannedServer, ServerSource, WorkspaceRoots } from './types.ts'

/** The directory (relative to one root) holding that root's server files. */
export const MCP_DIR = '.dsh/mcp'

/** The configuration file suffixes that define a server; every other entry is ignored. */
export const CONFIG_EXTENSIONS = ['.yaml', '.yml', '.json'] as const

/** The mcp-client `serverName` contract, enforced before any load is attempted. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** The two transports the format admits. */
const TRANSPORTS = new Set(['stdio', 'streamable-http'])

/**
 * The configuration suffix of one directory entry.
 * @param entry - a directory entry name.
 * @returns the matching suffix, or undefined for anything not a server file.
 */
function configExtension(entry: string): (typeof CONFIG_EXTENSIONS)[number] | undefined {
  return CONFIG_EXTENSIONS.find((extension) => entry.endsWith(extension))
}

/**
 * Render one source for a log line.
 * @param source - the source to describe.
 * @returns `file (root in workspace)`.
 */
function describe(source: ServerSource): string {
  return `${source.file} (root ${source.root} of workspace ${source.workspaceRoot})`
}

/**
 * Parse one configuration file into a loadable server, or report why not.
 * @param file - absolute configuration file path.
 * @param entry - the file's directory entry name (the default serverName).
 * @param extension - the configuration suffix.
 * @param io - filesystem seam.
 * @param env - expansion scope for `${VAR}` / `${VAR:-default}`.
 * @param log - sink for diagnostics.
 * @returns the parsed server, or undefined when the file is skipped.
 */
async function readServer(
  file: string,
  entry: string,
  extension: string,
  io: ScanIo,
  env: Record<string, string | undefined>,
  log: ScanLog,
): Promise<{ readonly serverName: string; readonly config: Readonly<Record<string, unknown>> } | undefined> {
  let text: string
  try {
    text = await io.readFile(file)
  } catch (error) {
    log.error(`cannot read ${file}: ${String(error)}`)
    return undefined
  }

  let parsed: unknown
  try {
    parsed = extension === '.json' ? JSON.parse(text) : parseYaml(text)
  } catch (error) {
    log.error(`cannot parse ${file}: ${String(error)}`)
    return undefined
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    log.error(`${file} must contain a single server configuration mapping`)
    return undefined
  }

  const expanded = expandDeep(parsed, env, log) as Record<string, unknown>
  const declared = expanded.serverName
  const serverName = typeof declared === 'string' && declared !== '' ? declared : entry.slice(0, -extension.length)
  if (!SERVER_NAME_PATTERN.test(serverName)) {
    log.error(`${file} names an invalid serverName ${JSON.stringify(serverName)}; expected ${String(SERVER_NAME_PATTERN)}`)
    return undefined
  }

  const transport = expanded.transport
  if (typeof transport !== 'string' || !TRANSPORTS.has(transport)) {
    log.error(`${file} must declare transport 'stdio' or 'streamable-http'`)
    return undefined
  }

  return { serverName, config: { ...expanded, serverName } }
}

/**
 * Scan every workspace's `.dsh/mcp/` directories and arbitrate `serverName`
 * conflicts.
 * @param workspaces - the ordered workspace root sets to walk.
 * @param io - filesystem seam.
 * @param env - expansion scope for `${VAR}` / `${VAR:-default}`.
 * @param log - sink for diagnostics.
 * @returns the winning configurations, in load order; a missing or unreadable
 * `.dsh/mcp/` directory is not an error.
 */
export async function scanServers(
  workspaces: readonly WorkspaceRoots[],
  io: ScanIo,
  env: Record<string, string | undefined>,
  log: ScanLog,
): Promise<readonly ScannedServer[]> {
  const claimed = new Map<string, ServerSource>()
  const visited = new Set<string>()
  const servers: ScannedServer[] = []

  for (const workspace of workspaces) {
    for (const root of workspace.roots) {
      const dir = path.join(root, MCP_DIR)
      let entries: readonly string[]
      try {
        entries = await io.readDir(dir)
      } catch {
        // A root without a `.dsh/mcp/` directory contributes nothing; that is
        // the normal case for most workspaces, not a degraded one.
        continue
      }

      for (const entry of [...entries].sort()) {
        const extension = configExtension(entry)
        if (extension === undefined) continue

        const file = path.join(dir, entry)
        // One physical root can be reached through more than one workspace: a
        // root granted to another workspace is walked in BOTH root sets. That
        // second walk sees the very same files, and re-reporting them would
        // describe each of them as conflicting with itself. The first
        // attribution already decided everything those files define.
        if (visited.has(file)) continue
        visited.add(file)

        const source: ServerSource = { workspaceRoot: workspace.primaryRoot, root, file }
        const read = await readServer(file, entry, extension, io, env, log)
        if (read === undefined) continue

        const winner = claimed.get(read.serverName)
        if (winner !== undefined) {
          log.error(
            `serverName conflict: ${JSON.stringify(read.serverName)} from ${describe(source)} is skipped; `
            + `already provided by ${describe(winner)}`,
          )
          continue
        }

        claimed.set(read.serverName, source)
        servers.push({ serverName: read.serverName, config: read.config, source })
      }
    }
  }

  return servers
}
