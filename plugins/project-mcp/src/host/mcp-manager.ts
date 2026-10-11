/**
 * Loaded-server lifecycle: exactly one child fiber per configured server.
 *
 * Reconciliation is declarative. Every scan produces the complete desired set,
 * and this manager converges on it: a server that appeared is loaded, one that
 * disappeared is disposed, one whose file content or source changed is
 * disposed and loaded again, and an unchanged one is left alone. A rename is
 * simply the disappearance of the old name plus the appearance of the new one.
 *
 * One server's failure is contained: the load is attempted inside a try/catch
 * and the error is reported against the file that caused it. That covers both
 * a bad configuration and the one conflict the scan cannot arbitrate on its
 * own — a `serverName` the profile's own layer already reserved, which the MCP
 * client rejects when the second instance loads.
 *
 * The manager deliberately knows nothing about the host context: it loads
 * through a {@link ServerLoader} seam, so every rule above is unit-testable.
 * @module dsh-plugin-project-mcp/host/mcp-manager
 */

import type { ScanLog, ScannedServer } from './types.ts'

/** The seam through which one server enters and leaves the host process. */
export interface ServerLoader {
  /**
   * Load one server into the host process.
   * @param server - the arbitrated configuration to load.
   * @returns the disposer that unloads this exact server.
   * @throws when the configuration is invalid or the MCP client refuses it.
   */
  load(server: ScannedServer): Promise<() => Promise<void> | void>
}

/** What one reconciliation did, by serverName. */
export interface SyncSummary {
  /** Servers loaded for the first time. */
  readonly loaded: readonly string[]
  /** Servers torn down and loaded again because their configuration changed. */
  readonly reloaded: readonly string[]
  /** Servers torn down because their configuration disappeared. */
  readonly unloaded: readonly string[]
  /** Servers left untouched because nothing about them changed. */
  readonly unchanged: readonly string[]
  /** Servers that could not be loaded. */
  readonly failed: readonly string[]
}

/** One loaded server. */
interface ActiveServer {
  /** Identity of the configuration this fiber was loaded from. */
  readonly signature: string
  /** The disposer that unloads the fiber. */
  readonly dispose: () => Promise<void> | void
}

/**
 * The configuration identity that decides "unchanged" versus "reload": the
 * expanded configuration plus the file it came from. Two scans of an untouched
 * file produce the same signature.
 * @param server - the scanned server.
 * @returns a stable identity string.
 */
function signatureOf(server: ScannedServer): string {
  return JSON.stringify({ file: server.source.file, config: server.config })
}

/** The manager of the plugin's loaded MCP servers. */
export class McpManager {
  /** Loaded servers, keyed by their reserved name. */
  private readonly active = new Map<string, ActiveServer>()
  /** The latest scanned set — the plugin's claim, loaded or not (see {@link managedServerNames}). */
  private scanned: readonly ScannedServer[] = []
  /** Serializes reconciliations so overlapping triggers cannot interleave. */
  private chain: Promise<unknown> = Promise.resolve()

  /**
   * @param loader - the seam that loads and unloads one server.
   * @param log - sink for load and unload diagnostics.
   */
  constructor(
    private readonly loader: ServerLoader,
    private readonly log: ScanLog,
  ) {}

  /**
   * Converge the loaded set on one scan result.
   *
   * The scanned set is recorded immediately (before any await), because the
   * isolation layer reads it to decide which tool names this plugin owns —
   * reading a stale set there would briefly expose another workspace's tools.
   * @param servers - the complete desired set, in load order.
   * @returns what this reconciliation did.
   */
  async sync(servers: readonly ScannedServer[]): Promise<SyncSummary> {
    this.scanned = servers
    const run = this.chain.then(
      () => this.reconcile(servers),
      () => this.reconcile(servers),
    )
    this.chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /**
   * Dispose every loaded server. The manager stays usable afterwards: a later
   * {@link sync} loads the current scan result again.
   * @returns after every child fiber settled.
   */
  async dispose(): Promise<void> {
    this.scanned = []
    for (const serverName of Array.from(this.active.keys())) await this.unload(serverName)
  }

  /**
   * The server names this plugin has claimed, whether or not they loaded.
   *
   * A claim that failed to connect still reserves its namespace: its tools are
   * this plugin's to hide from the workspaces that did not configure it, and a
   * model-visible name needs no live server to be wrong for a session.
   * @returns the claimed names.
   */
  managedServerNames(): ReadonlySet<string> {
    return new Set(this.scanned.map((server) => server.serverName))
  }

  /**
   * The claimed names whose configuration lives under one of the given roots.
   * @param roots - the canonical roots of one workspace's root set.
   * @returns the names a session attributed to those roots may see.
   */
  serverNamesForRoots(roots: ReadonlySet<string>): ReadonlySet<string> {
    const visible = new Set<string>()
    for (const server of this.scanned) if (roots.has(server.source.root)) visible.add(server.serverName)
    return visible
  }

  /** Converge one reconciliation; serialized by {@link sync}. */
  private async reconcile(servers: readonly ScannedServer[]): Promise<SyncSummary> {
    const desired = new Map(servers.map((server) => [server.serverName, server]))
    const loaded: string[] = []
    const reloaded: string[] = []
    const unloaded: string[] = []
    const unchanged: string[] = []
    const failed: string[] = []

    // Materialized because unloading below mutates `active` while iterating.
    for (const [serverName, active] of Array.from(this.active)) {
      const next = desired.get(serverName)
      if (next !== undefined && signatureOf(next) === active.signature) {
        unchanged.push(serverName)
        continue
      }
      await this.unload(serverName)
      unloaded.push(serverName)
    }

    for (const server of servers) {
      if (this.active.has(server.serverName)) continue
      try {
        const dispose = await this.loader.load(server)
        this.active.set(server.serverName, { signature: signatureOf(server), dispose })
        if (unloaded.includes(server.serverName)) reloaded.push(server.serverName)
        else loaded.push(server.serverName)
      } catch (error) {
        this.log.error(
          `cannot load MCP server ${JSON.stringify(server.serverName)} from ${server.source.file}: ${String(error)}`,
        )
        failed.push(server.serverName)
      }
    }

    return { loaded, reloaded, unloaded, unchanged, failed }
  }

  /**
   * Tear one server down and reclaim its name.
   * @param serverName - the server to unload; unknown names are a no-op.
   */
  private async unload(serverName: string): Promise<void> {
    const active = this.active.get(serverName)
    if (active === undefined) return
    // Delete first: the name is free the moment teardown starts, and a
    // concurrent read must not see a fiber that is already going away.
    this.active.delete(serverName)
    try {
      await active.dispose()
    } catch (error) {
      this.log.error(`cannot unload MCP server ${JSON.stringify(serverName)}: ${String(error)}`)
    }
  }
}
