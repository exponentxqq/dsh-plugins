/**
 * Workspace visibility isolation: one agent sees only the project MCP servers
 * of the workspace its session belongs to.
 *
 * Two mechanisms carry that, deliberately layered:
 *
 * - **A restriction** masks the out-of-scope `mcp__…` names in the global
 *   layer, which is what makes them invisible to the model in the first place.
 *   The deny list is derived from the names the registry actually holds — the
 *   restriction API rejects unknown names, so no name is ever guessed from the
 *   configuration alone.
 * - **A dispatch guard** refuses a call to an out-of-scope managed name. It
 *   closes the window between a tool registering and the restriction being
 *   recomputed, and it survives any drift between the two lists.
 *
 * Neither mechanism touches a tool this plugin does not own: profile-level MCP
 * servers (the user's own rows) and the built-in tools are never in a deny
 * list, because only names under a managed server prefix can enter one.
 *
 * Recomputation is idempotent by construction. `restrict` itself fires
 * `tools/change`, so a recompute that re-registered an unchanged deny set
 * would feed itself forever; the diff guard below makes an unchanged set a
 * no-op.
 * @module dsh-plugin-web-ux/host/isolation
 */

import type { ScanLog } from './types.ts'

/** The reserved prefix the MCP client publishes its tools under. */
const MCP_TOOL_PREFIX = 'mcp__'

/** The tool surface of one agent scope, as this layer drives it. */
export interface ScopedTools {
  /**
   * Mask global tools for this agent.
   * @param filter - the global-layer mask.
   * @returns the exact disposer that lifts it.
   */
  restrict(filter: { readonly deny: readonly string[] }): () => void
  /**
   * Install a monotonic per-agent dispatch guard.
   * @param guard - a returned string denies the call.
   * @returns the exact disposer that removes it.
   */
  guard(guard: (execution: { readonly name: string }) => string | undefined): () => void
  /**
   * The names this agent can see, as its own scope resolves them.
   *
   * This is the agent's VIEW, not the host's global registration set: in this
   * deployment the model-facing rows sit on the agent plane, so a scope's view
   * holds contributions that the global layer never carries. Names our own
   * restriction already masks are absent from it — {@link IsolationLayer}
   * carries those forward separately.
   * @returns the visible tool names.
   */
  visibleNames(): readonly string[]
}

/** The facts the isolation layer reads. */
export interface IsolationPorts {
  /**
   * Tool names registered in the host's global layer.
   *
   * This MUST be the unrestricted registration set, not the agent's visible
   * one: deriving a deny list from an already-restricted view would compute an
   * ever-smaller set and oscillate between masking and lifting. It is only one
   * of the two sources the deny list is built from — see
   * {@link ScopedTools.visibleNames}.
   * @returns every name registered in the global layer.
   */
  catalog(): readonly string[]
  /**
   * Attribute one session directory to a workspace's root set.
   * @param cwd - the session's creation directory.
   * @returns the roots, or null when nothing claims the directory (fail closed).
   */
  attribute(cwd: string): Promise<readonly string[] | null>
  /**
   * The managed server names visible to one root set.
   * @param roots - the workspace's roots.
   * @returns the visible server names.
   */
  serverNamesForRoots(roots: ReadonlySet<string>): ReadonlySet<string>
  /**
   * The server names this plugin claims.
   * @returns every claimed name, loaded or not.
   */
  managedServerNames(): ReadonlySet<string>
  /** Sink for diagnostics. */
  readonly log: ScanLog
}

/** One tracked agent scope. */
interface Tracked {
  readonly tools: ScopedTools
  readonly cwd: string | undefined
  /** Server names the agent may see; read by the guard on every call. */
  visible: ReadonlySet<string>
  /** The deny set currently applied to this agent. */
  deny: readonly string[]
  restriction: (() => void) | undefined
  guard: (() => void) | undefined
  /** Whether the first recompute of this agent was already reported. */
  reported: boolean
}

/**
 * The `serverName` an MCP tool name belongs to.
 * @param toolName - any registered tool name.
 * @returns the serverName, or undefined for a name outside the MCP namespace.
 */
export function toolServerOf(toolName: string): string | undefined {
  if (!toolName.startsWith(MCP_TOOL_PREFIX)) return undefined
  const rest = toolName.slice(MCP_TOOL_PREFIX.length)
  const separator = rest.indexOf('__')
  return separator <= 0 ? undefined : rest.slice(0, separator)
}

/**
 * The registered names this plugin must hide from one agent: managed MCP tools
 * whose server is not part of the agent's root set.
 * @param registered - every tool name in the global layer.
 * @param managed - the server names this plugin claims.
 * @param visible - the server names the agent's workspace defines.
 * @returns the names to deny, sorted (a stable order keeps the diff guard honest).
 */
export function deriveDeny(
  registered: readonly string[],
  managed: ReadonlySet<string>,
  visible: ReadonlySet<string>,
): readonly string[] {
  const deny: string[] = []
  for (const toolName of registered) {
    const server = toolServerOf(toolName)
    if (server === undefined || !managed.has(server) || visible.has(server)) continue
    deny.push(toolName)
  }
  return deny.sort()
}

/**
 * The refusal reason for one tool call, or undefined to allow it.
 * @param toolName - the called tool's name.
 * @param managed - the server names this plugin claims.
 * @param visible - the server names the calling agent's workspace defines.
 * @returns the denial reason, or undefined.
 */
export function guardReason(
  toolName: string,
  managed: ReadonlySet<string>,
  visible: ReadonlySet<string>,
): string | undefined {
  const server = toolServerOf(toolName)
  if (server === undefined || !managed.has(server) || visible.has(server)) return undefined
  return `tool ${toolName} belongs to MCP server ${server}, which is not configured for this session's workspace`
}

/**
 * Compare two deny sets for equality.
 * @param left - one sorted deny set.
 * @param right - the other sorted deny set.
 * @returns whether both hold the same names.
 */
function sameDeny(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index])
}

/** How many names one diagnostic line spells out before it counts the rest. */
const REPORTED_NAMES = 6

/**
 * Count the MCP-namespaced names in one reading.
 *
 * Reported beside each total because the two readings differ in this
 * deployment, and "which of them carries the MCP tools at all" is the one fact
 * a failed isolation turns on.
 * @param names - one reading's names.
 * @returns how many start with the MCP prefix.
 */
function mcpCount(names: readonly string[]): number {
  let count = 0
  for (const name of names) if (name.startsWith(MCP_TOOL_PREFIX)) count += 1
  return count
}

/**
 * Spell out a few names and count the remainder, so one log line stays
 * readable whatever the size of the registry.
 * @param names - the names to render.
 * @returns the rendered sample.
 */
function sample(names: readonly string[]): string {
  const head = names.slice(0, REPORTED_NAMES).join(',')
  return names.length > REPORTED_NAMES ? `${head},+${names.length - REPORTED_NAMES}` : head
}

/**
 * The workspace isolation layer. One instance watches every live agent scope;
 * the host wiring owns the event subscriptions and calls {@link attach} /
 * {@link detach} / {@link refresh}.
 */
export class IsolationLayer {
  /** Tracked agents, keyed by their scope object. */
  private readonly agents = new Map<object, Tracked>()

  /**
   * @param ports - the facts and effects this layer uses.
   */
  constructor(private readonly ports: IsolationPorts) {}

  /**
   * Start tracking one agent: install its dispatch guard and apply its initial
   * restriction.
   * @param key - the agent's identity object (its scope).
   * @param cwd - the session's creation directory, when known.
   * @param tools - the agent scope's tool surface.
   * @returns after the initial restriction settled.
   */
  async attach(key: object, cwd: string | undefined, tools: ScopedTools): Promise<void> {
    const tracked: Tracked = {
      tools,
      cwd,
      visible: new Set(),
      deny: [],
      restriction: undefined,
      guard: undefined,
      reported: false,
    }
    this.agents.set(key, tracked)

    try {
      // Installed once and kept for the agent's lifetime: it reads the live
      // managed and visible sets, so a restriction refresh never needs to
      // re-register it (and a registration failure is reported, not fatal).
      tracked.guard = tools.guard((execution) =>
        guardReason(execution.name, this.ports.managedServerNames(), tracked.visible))
    } catch (error) {
      this.ports.log.error(`cannot install the workspace isolation guard: ${String(error)}`)
    }

    await this.recompute(tracked)
  }

  /**
   * Stop tracking one agent and lift everything this layer installed.
   * @param key - the agent's identity object.
   */
  detach(key: object): void {
    const tracked = this.agents.get(key)
    if (tracked === undefined) return
    this.agents.delete(key)
    this.lift(tracked)
  }

  /**
   * Recompute every tracked agent against the current tool catalog and scan.
   *
   * An agent whose deny set does not change is left alone, which is both the
   * idempotence the spec asks for and the guard against the self-oscillation
   * `restrict` would otherwise cause.
   * @returns after every tracked agent settled.
   */
  async refresh(): Promise<void> {
    // Materialized: recompute may re-enter this layer through tools/change.
    for (const tracked of Array.from(this.agents.values())) await this.recompute(tracked)
  }

  /**
   * Drop every tracked agent (the plugin fiber is unloading; the agents'
   * own scopes are being disposed with it).
   */
  dispose(): void {
    for (const key of Array.from(this.agents.keys())) this.detach(key)
  }

  /**
   * Recompute one agent's visibility and apply the difference.
   *
   * The candidate set is the union of three readings, because no single one is
   * complete here:
   *
   * - the host's global layer (`catalog`), where a plugin's own rows register;
   * - this agent's own view (`visibleNames`), where the model-facing rows sit
   *   in this deployment, so a global-only reading misses every one of them;
   * - the names this agent's current restriction already masks, otherwise the
   *   second reading would shrink to nothing on the next pass and the
   *   restriction would be lifted (the oscillation the diff guard exists to
   *   prevent). A carried name is dropped as soon as its server leaves the
   *   managed set, and the retry below drops one whose registration is gone.
   * @param tracked - the agent's state.
   */
  private async recompute(tracked: Tracked): Promise<void> {
    try {
      await this.reconcile(tracked)
    } catch (error) {
      // Every step below is individually defended; this is the backstop for
      // the ones that are not (a registry read that throws for one agent must
      // not abort the refresh of the others, and the guard stays installed).
      this.ports.log.error(`cannot recompute the workspace isolation of one session: ${String(error)}`)
    }
  }

  /**
   * One recompute, with the per-step failures of its callers' ports already
   * turned into their fail-safe readings.
   * @param tracked - the agent's state.
   */
  private async reconcile(tracked: Tracked): Promise<void> {
    const managed = this.ports.managedServerNames()
    const roots = await this.attribute(tracked)
    tracked.visible = roots === null
      ? new Set()
      : this.ports.serverNamesForRoots(new Set(roots))

    const global = this.readGlobalNames()
    const scoped = this.readScopedNames(tracked)
    const carried = tracked.deny.filter((name) => {
      const server = toolServerOf(name)
      return server !== undefined && managed.has(server)
    })
    const candidates = Array.from(new Set([...global, ...scoped, ...carried]))
    const deny = deriveDeny(candidates, managed, tracked.visible)

    if (sameDeny(deny, tracked.deny)) {
      // Nothing changed. The first reading of an agent is still reported once,
      // so a deployment that isolates nothing shows up in the process log.
      if (tracked.reported) return
      tracked.reported = true
      this.report(tracked, roots, global, scoped, carried, deny)
      return
    }

    tracked.reported = true
    this.report(tracked, roots, global, scoped, carried, deny)
    this.lift(tracked)
    if (deny.length === 0) {
      // Nothing to mask: the lifted state is already the wanted one.
      tracked.deny = []
      return
    }
    if (this.apply(tracked, deny)) return

    // A carried name can outlive its registration (a server reloaded with a
    // different tool list). Re-derive from the live readings alone — the lift
    // above just made them unrestricted — and retry once.
    const fresh = deriveDeny(
      Array.from(new Set([...this.readGlobalNames(), ...this.readScopedNames(tracked)])),
      managed,
      tracked.visible,
    )
    if (fresh.length === 0 || sameDeny(fresh, deny)) return
    this.apply(tracked, fresh)
  }

  /**
   * Attribute one agent's session directory, failing closed on an error.
   * @param tracked - the agent's state.
   * @returns the workspace's roots, or null when unknown or unreadable.
   */
  private async attribute(tracked: Tracked): Promise<readonly string[] | null> {
    if (tracked.cwd === undefined) return null
    try {
      return await this.ports.attribute(tracked.cwd)
    } catch (error) {
      this.ports.log.error(`cannot attribute the session directory ${tracked.cwd}: ${String(error)}`)
      return null
    }
  }

  /**
   * Read the host's global-layer names, treating a failure as "nothing to add".
   *
   * This reading is the one the model-facing rows may be absent from, and a
   * schema it cannot render must not cost the agent its isolation: the agent's
   * own view below still supplies the names.
   * @returns the global names, or an empty list when the read failed.
   */
  private readGlobalNames(): readonly string[] {
    try {
      return this.ports.catalog()
    } catch (error) {
      this.ports.log.error(`cannot read the host tool catalog: ${String(error)}`)
      return []
    }
  }

  /**
   * Read this agent's visible names, treating a failure as "nothing to add".
   * @param tracked - the agent's state.
   * @returns the names the agent sees, or an empty list when the read failed.
   */
  private readScopedNames(tracked: Tracked): readonly string[] {
    try {
      return tracked.tools.visibleNames()
    } catch (error) {
      this.ports.log.error(`cannot read the tool view of one session: ${String(error)}`)
      return []
    }
  }

  /**
   * Apply one deny set, recording it only when it took effect.
   * @param tracked - the agent's state.
   * @param deny - the names to mask.
   * @returns whether the restriction is now applied.
   */
  private apply(tracked: Tracked, deny: readonly string[]): boolean {
    try {
      tracked.restriction = tracked.tools.restrict({ deny })
      tracked.deny = deny
      this.ports.log.info(`isolation: masked ${deny.length} tool(s) in one session: [${sample(deny)}]`)
      return true
    } catch (error) {
      // A name can leave the registry between the catalog read and this call.
      // The restriction is left unapplied on purpose: the caller retries from
      // the live readings, and the dispatch guard already refuses the calls.
      this.ports.log.error(`cannot restrict ${deny.length} MCP tool(s) for one session: ${String(error)}`)
      return false
    }
  }

  /**
   * Report one recompute's inputs and outcome.
   *
   * The web profile registers no logger exporter after boot, so these lines
   * reach a human through the console channel `scanLog` also writes (see
   * `host-io.ts`): without them an isolation that silently computes an empty
   * deny list is indistinguishable from one that works.
   * @param tracked - the agent's state.
   * @param roots - the attributed roots, or null when nothing claimed the cwd.
   * @param global - the host's global-layer names.
   * @param scoped - the agent's own view.
   * @param carried - the names the current restriction masks.
   * @param deny - the computed deny set.
   */
  private report(
    tracked: Tracked,
    roots: readonly string[] | null,
    global: readonly string[],
    scoped: readonly string[],
    carried: readonly string[],
    deny: readonly string[],
  ): void {
    this.ports.log.info(
      `isolation: cwd=${tracked.cwd ?? '(none)'} roots=${roots === null ? 'none' : roots.length}`
      + ` visible=[${sample(Array.from(tracked.visible).sort())}]`
      + ` global=${global.length}(mcp=${mcpCount(global)}) scoped=${scoped.length}(mcp=${mcpCount(scoped)})`
      + ` carried=${carried.length} deny=${deny.length} [${sample(deny)}]`,
    )
  }

  /**
   * Lift one agent's applied restriction, if any.
   * @param tracked - the agent's state.
   */
  private lift(tracked: Tracked): void {
    const restriction = tracked.restriction
    if (restriction === undefined) return
    tracked.restriction = undefined
    try {
      restriction()
    } catch (error) {
      this.ports.log.error(`cannot lift a workspace isolation restriction: ${String(error)}`)
    }
  }
}
