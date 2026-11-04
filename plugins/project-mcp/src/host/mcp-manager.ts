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
 * Isolation reads three different name sets from here, and they differ on
 * purpose. The claim set is every name the latest scan produced, loaded or
 * not; the failed set is the claimed names whose last settled load attempt
 * threw; the blocked set is the claim minus the failed one — loaded or still
 * loading, including a retry that is connecting right now. The isolation
 * gates deny on the blocked set rather than on a purely active set, because a
 * server's provider is registered before its connection is ready while the
 * active map is only written once the load resolves, so an active-only gate
 * would briefly fail open. For the same reason a retry drops its failure mark
 * before the attempt starts: the failure mark only describes a finished
 * attempt, and a connecting retry must be blocked again.
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
  /** Claimed names whose most recent load threw (see {@link failedServerNames}). */
  private readonly failedClaims = new Set<string>()
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
   * The failure marks, by contrast, are only touched inside the serialized
   * reconciliation, so a reader never observes a half-updated failure set.
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
   *
   * The claim and the failure marks are dropped together: both describe the
   * scan being torn down, so nothing survives to shadow a profile-level server
   * before the next scan decides what this plugin claims.
   * @returns after every child fiber settled.
   */
  async dispose(): Promise<void> {
    this.scanned = []
    this.failedClaims.clear()
    for (const serverName of Array.from(this.active.keys())) await this.unload(serverName)
  }

  /**
   * The server names this plugin has claimed, whether or not they loaded.
   *
   * This is the *claim* reading: everything the latest scan produced. A claim
   * keeps its identity across a failed load or a reload until the next scan
   * drops it, which is what makes a name stable for callers. It is not the set
   * the isolation gates deny — see {@link blockedServerNames} for that: a claim
   * whose load threw must not shadow a profile-level server of the same name.
   * @returns the claimed names, recomputed on every call.
   */
  managedServerNames(): ReadonlySet<string> {
    return new Set(this.scanned.map((server) => server.serverName))
  }

  /**
   * The claimed names whose configuration lives under one of the given roots.
   *
   * Same claim reading as {@link managedServerNames}, narrowed to one root set:
   * it answers "what did this workspace configure", not "what may be denied"
   * (see {@link blockedServerNames}). It deliberately stays on claims, so a
   * workspace keeps seeing a server it configured while that server is still
   * loading or awaiting its next retry; a blocked reading here would make the
   * workspace's own configuration look unauthorized.
   * @param roots - the canonical roots of one workspace's root set.
   * @returns the names a session attributed to those roots may see.
   */
  serverNamesForRoots(roots: ReadonlySet<string>): ReadonlySet<string> {
    const visible = new Set<string>()
    for (const server of this.scanned) if (roots.has(server.source.root)) visible.add(server.serverName)
    return visible
  }

  /**
   * The claimed names whose most recent settled load attempt threw.
   *
   * Maintained by {@link sync}: a load that succeeds, a server left unchanged,
   * a name that leaves the scan, and an unload all clear the mark; only the
   * `catch` in the load loop sets it. A retry clears its mark when the attempt
   * starts (see {@link blockedServerNames}) and the `catch` re-adds it if the
   * attempt fails, so the set never describes an attempt that is in flight.
   * {@link dispose} empties the set. This is the diagnostic reading — the gates
   * use {@link blockedServerNames} — and it is recomputed per call, so a
   * finished reconciliation is visible at once.
   * @returns the failed claims, recomputed on every call.
   */
  failedServerNames(): ReadonlySet<string> {
    return new Set(this.failedClaims)
  }

  /**
   * The claimed names that are loaded or may still load: the claim set minus
   * {@link failedServerNames}.
   *
   * This is the set the isolation gates deny, in place of either extreme. A
   * purely active set fails open: a server's provider is registered before its
   * connection is ready, while the active map is only written once the load
   * resolves. A purely claimed set fails closed on a claim that cannot load at
   * all, so it shadows a profile-level server of the same name. Claim minus
   * failure keeps the pre-resolve window closed and drops only the claims known
   * to be dead. A retry is a new attempt, so {@link sync} clears its failure
   * mark when the attempt starts: the connecting window is blocked again, and
   * a failure re-adds the name as soon as the attempt settles.
   * @returns the blocked names, recomputed on every call.
   */
  blockedServerNames(): ReadonlySet<string> {
    const blocked = new Set(this.managedServerNames())
    for (const serverName of this.failedClaims) blocked.delete(serverName)
    return blocked
  }

  /** Converge one reconciliation; serialized by {@link sync}. */
  private async reconcile(servers: readonly ScannedServer[]): Promise<SyncSummary> {
    const desired = new Map(servers.map((server) => [server.serverName, server]))
    const loaded: string[] = []
    const reloaded: string[] = []
    const unloaded: string[] = []
    const unchanged: string[] = []
    const failed: string[] = []

    // A claim that left the scan no longer exists, so its failure mark goes
    // with it. Names that only changed are cleared at unload below, and any
    // load attempt below clears its mark before it starts.
    for (const serverName of Array.from(this.failedClaims)) {
      if (!desired.has(serverName)) this.failedClaims.delete(serverName)
    }

    // Materialized because unloading below mutates `active` while iterating.
    for (const [serverName, active] of Array.from(this.active)) {
      const next = desired.get(serverName)
      if (next !== undefined && signatureOf(next) === active.signature) {
        this.failedClaims.delete(serverName)
        unchanged.push(serverName)
        continue
      }
      await this.unload(serverName)
      this.failedClaims.delete(serverName)
      unloaded.push(serverName)
    }

    for (const server of servers) {
      if (this.active.has(server.serverName)) continue
      // The failure mark describes a finished attempt, never the one about to
      // start: clearing it here re-includes a retried name in
      // `blockedServerNames()`, so the connecting window — provider registered,
      // connection not ready — stays isolated (fail-closed). The catch below
      // re-adds the mark immediately if this attempt fails; a success keeps it
      // cleared.
      this.failedClaims.delete(server.serverName)
      try {
        const dispose = await this.loader.load(server)
        this.active.set(server.serverName, { signature: signatureOf(server), dispose })
        this.failedClaims.delete(server.serverName)
        if (unloaded.includes(server.serverName)) reloaded.push(server.serverName)
        else loaded.push(server.serverName)
      } catch (error) {
        this.log.error(
          `cannot load MCP server ${JSON.stringify(server.serverName)} from ${server.source.file}: ${String(error)}`,
        )
        this.failedClaims.add(server.serverName)
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
