/**
 * Workspace visibility isolation: one agent sees only the project MCP servers
 * of the workspace its session belongs to.
 *
 * Two mechanisms carry that per agent, deliberately layered:
 *
 * - **A restriction** masks the out-of-scope `mcp__…` names in the global
 *   layer, which is what makes them invisible to the model in the first place.
 *   The deny list is derived from the names the registry actually holds — the
 *   restriction API rejects unknown names, so no name is ever guessed from the
 *   configuration alone.
 * - **A dispatch guard** refuses a call to an out-of-scope blocked name. It
 *   closes the window between a tool registering and the restriction being
 *   recomputed, and it survives any drift between the two lists.
 *
 * Neither mechanism touches a tool this plugin does not own: profile-level MCP
 * servers (the user's own rows) and the built-in tools are never in a deny
 * list, because only names under a blocked server prefix can enter one. The
 * blocked set is the claim set minus the claims whose load threw, so a project
 * claim that never loaded cannot shadow a profile-level server of the same
 * name.
 *
 * Isolation covers four surfaces over the same live reading:
 *
 * - the **tool face** — `mcp__<server>__*` calls, gated by
 *   {@link guardReason};
 * - the **name face** — the prompt's resource-server names and `mcp:<server>`
 *   sections (`prompt-isolation.ts`), gated by
 *   {@link IsolationLayer.visibleFor};
 * - the **resource face** — the three resource tools, whose `arguments.server`
 *   must belong to the agent's scope ({@link resourceGuardReason});
 * - the **global face** — the plugin context's own dispatch guard, which has no
 *   agent scope and therefore sits in the global layer ahead of every
 *   per-agent guard ({@link globalGuardDecision}).
 *
 * The resource face refuses in the very words the upstream MCP resource
 * runtime uses for an unavailable server, so a model cannot tell an
 * out-of-scope server from a missing one (no existence probe).
 *
 * The global face is the backstop for the calls no per-agent guard ever saw: a
 * session that predates this plugin's load, or a call the host did not
 * attribute to an agent at all. It must fail closed there, because a call this
 * plugin cannot tie to a workspace must never reach a project server: an
 * unattributed call is denied the whole `mcp__` family (and a resource call
 * once its `arguments.server` is determinable), and a session this layer does
 * not track is judged against no visible set at all. The blocked reading is
 * deliberately not consulted on the unattributed path — the claim set is
 * cleared first when the manager is disposed, so trusting it would open
 * exactly the window that matters. It does not replace the per-agent guard:
 * being process-wide and scope-less, it can neither mask a name from the model
 * nor read an agent's live scope, so the restriction and the per-agent guard
 * remain the mechanism that isolates one session from another. The denial text
 * is the same either way, so a model cannot tell which face refused it.
 *
 * Recomputation is idempotent by construction. `restrict` itself fires
 * `tools/change`, so a recompute that re-registered an unchanged deny set
 * would feed itself forever; the diff guard below makes an unchanged set a
 * no-op.
 * @module dsh-plugin-project-mcp/host/isolation
 */

import type { ScanLog } from './types.ts'

/** The reserved prefix the MCP client publishes its tools under. */
const MCP_TOOL_PREFIX = 'mcp__'

/** The three resource tools the MCP resource runtime registers. */
export const RESOURCE_TOOLS: ReadonlySet<string> = new Set([
  'list_mcp_resources',
  'list_mcp_resource_templates',
  'read_mcp_resource',
])

/**
 * The refusal reason for one out-of-scope MCP resource call.
 *
 * Deliberately WORD-FOR-WORD the message the upstream MCP resource runtime
 * throws for a server it cannot resolve (`dsh-mcp-resources`:
 * `MCP resource server "<server>" is unavailable in this agent's scope`):
 * a model must not be able to probe for the existence of a server that is
 * merely out of scope, and the diagnostic value lives in the log, not in the
 * model-facing text.
 * @param server - the serverName the call named.
 * @returns the denial reason.
 */
export function resourceDenyReason(server: string): string {
  return `MCP resource server "${server}" is unavailable in this agent's scope`
}

/**
 * The refusal reason for one out-of-scope MCP tool call.
 *
 * The single source of the tool-face text, shared by {@link guardReason} and
 * the global face so a call cannot be told apart by the words it was refused
 * with.
 * @param toolName - the called tool's name.
 * @param server - the serverName the name belongs to.
 * @returns the denial reason.
 */
export function toolDenyReason(toolName: string, server: string): string {
  return `tool ${toolName} belongs to MCP server ${server}, which is not configured for this session's workspace`
}

/**
 * The slice of a tool call a guard reads (a subset of the upstream
 * `ToolExecution`).
 */
export interface GuardedExecution {
  /** The called tool's name. */
  readonly name: string
  /**
   * The parsed, deeply frozen JSON snapshot of the call arguments; absent when
   * upstream omits them. NEVER assumed to be an object with a `server` field:
   * a guard runs before the tool validates its own schema.
   */
  readonly arguments?: unknown
  /**
   * The calling agent's scope key, when the host attributed the call. The layer
   * only needs the identity: `IsolationLayer` keys its tracked agents by it.
   */
  readonly agent?: object
}

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
  guard(guard: (execution: GuardedExecution) => string | undefined): () => void
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
   * The claimed server names visible to one root set: what this workspace's
   * configuration defines, whether or not the server is loaded yet.
   *
   * Deliberately the CLAIM reading, not the blocked one: a workspace must keep
   * seeing its own server while it loads or retries.
   * @param roots - the workspace's roots.
   * @returns the visible server names.
   */
  serverNamesForRoots(roots: ReadonlySet<string>): ReadonlySet<string>
  /**
   * The server names this plugin claims and has not proven dead: the claim set
   * minus the claims whose most recent load threw.
   *
   * Deliberately narrower than the claim set. A claim that failed to load never
   * registered a provider, so denying a profile-level server that happens to
   * share its name would punish the wrong server; a claim that is merely still
   * loading must stay denied until it resolves (its provider may already be
   * registered). Both gates read this set rather than the claim set.
   * @returns the blocked names, recomputed on every call.
   */
  blockedServerNames(): ReadonlySet<string>
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
 * The registered names this plugin must hide from one agent: MCP tools of
 * blocked servers that are not part of the agent's root set.
 * @param registered - every tool name in the global layer.
 * @param blocked - the server names this plugin claims and has not proven dead.
 * @param visible - the server names the agent's workspace defines.
 * @returns the names to deny, sorted (a stable order keeps the diff guard honest).
 */
export function deriveDeny(
  registered: readonly string[],
  blocked: ReadonlySet<string>,
  visible: ReadonlySet<string>,
): readonly string[] {
  const deny: string[] = []
  for (const toolName of registered) {
    const server = toolServerOf(toolName)
    if (server === undefined || !blocked.has(server) || visible.has(server)) continue
    deny.push(toolName)
  }
  return deny.sort()
}

/**
 * The refusal reason for one tool call, or undefined to allow it.
 * @param toolName - the called tool's name.
 * @param blocked - the server names this plugin claims and has not proven dead.
 * @param visible - the server names the calling agent's workspace defines.
 * @returns the denial reason, or undefined.
 */
export function guardReason(
  toolName: string,
  blocked: ReadonlySet<string>,
  visible: ReadonlySet<string>,
): string | undefined {
  const server = toolServerOf(toolName)
  if (server === undefined || !blocked.has(server) || visible.has(server)) return undefined
  return toolDenyReason(toolName, server)
}

/**
 * The `server` argument of one resource-tool call.
 *
 * The argument snapshot is untrusted: a guard runs before the tool validates
 * its own schema, and a PTC inner call may carry any JSON. Anything that is not
 * a non-empty string is reported as absent, which hands the call back to the
 * tool's own validation instead of denying it here.
 * @param args - the execution's argument snapshot.
 * @returns the server name, or undefined when the shape is not usable.
 */
function resourceServerOf(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined
  const server = (args as { readonly server?: unknown }).server
  return typeof server === 'string' && server !== '' ? server : undefined
}

/**
 * The refusal reason for one MCP resource call, or undefined to allow it.
 *
 * The chain is the contract, in this order:
 *
 * 1. not one of {@link RESOURCE_TOOLS} → allow (not this module's concern);
 * 2. `arguments.server` not a non-empty string → allow and let the tool's own
 *    validation answer (a malformed call must never look like isolation);
 * 3. the server is not blocked → allow (profile-level, unknown, or a project
 *    claim whose load failed — none of them are ours to deny);
 * 4. the server is visible to this agent → allow (its own workspace's server);
 * 5. otherwise → {@link resourceDenyReason}, worded exactly like an unavailable
 *    upstream server.
 *
 * The caller must pass the LIVE sets: a blocked-profile change has to take
 * effect on the next call, not on the next refresh.
 * @param toolName - the called tool's name.
 * @param args - the execution's argument snapshot (untrusted shape).
 * @param blocked - the server names this plugin claims and has not proven dead.
 * @param visible - the server names the calling agent's workspace defines.
 * @returns the denial reason, or undefined.
 */
export function resourceGuardReason(
  toolName: string,
  args: unknown,
  blocked: ReadonlySet<string>,
  visible: ReadonlySet<string>,
): string | undefined {
  if (!RESOURCE_TOOLS.has(toolName)) return undefined
  const server = resourceServerOf(args)
  if (server === undefined || !blocked.has(server) || visible.has(server)) return undefined
  return resourceDenyReason(server)
}

/** Which reading produced a global-guard denial (diagnostics only; never the text). */
export type GlobalGuardReading = 'agentless' | 'untracked' | 'tracked'

/** What the global guard decided. */
export type GlobalGuardDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly reason: string; readonly reading: GlobalGuardReading }

/** No project server is visible: the fail-closed reading of an untracked agent. */
const NO_SERVERS: ReadonlySet<string> = new Set()

/**
 * The decision of the global (plugin-context) guard.
 *
 * This runs for EVERY tool call in the process, so the order is part of the
 * contract: the name family is judged first, then whether the host attributed
 * a calling agent, and only a call that survives both reads a port at all. The
 * rows, in order:
 *
 * 1. neither an `mcp__<server>__*` name nor a resource tool → allow;
 * 2. no calling agent, MCP tool → {@link toolDenyReason} (`agentless`); the
 *    whole family is closed because there is no workspace to attribute the
 *    call to, and the blocked set is not read (it is cleared first when the
 *    manager is disposed, so it cannot be the fail-closed reading);
 * 3. no calling agent, resource tool, `arguments.server` a non-empty string →
 *    {@link resourceDenyReason} (`agentless`);
 * 4. no calling agent, resource tool, `arguments.server` unusable → allow, so
 *    the tool's own required validation answers (a malformed call must never
 *    look like isolation);
 * 5. tracked agent, MCP tool → {@link guardReason};
 * 6. tracked agent, resource tool → {@link resourceGuardReason};
 * 7. untracked agent, MCP tool → {@link guardReason} against
 *    {@link NO_SERVERS};
 * 8. untracked agent, resource tool → {@link resourceGuardReason} against
 *    {@link NO_SERVERS}.
 *
 * The `reading` is diagnostics only and never reaches the reason: rows 5–8
 * share the per-agent functions word for word, so a model cannot tell which
 * guard refused the call.
 * @param execution - the call, including the calling agent when attributed.
 * @param blocked - live reader; called ONLY for a call that carries an agent
 *   (a thunk, because this runs for every tool call in the process).
 * @param visibleFor - live per-agent visible set; `undefined` means untracked.
 * @returns the decision.
 */
export function globalGuardDecision(
  execution: GuardedExecution,
  blocked: () => ReadonlySet<string>,
  visibleFor: (key: object) => ReadonlySet<string> | undefined,
): GlobalGuardDecision {
  const server = toolServerOf(execution.name)
  if (server === undefined && !RESOURCE_TOOLS.has(execution.name)) return { kind: 'allow' }

  const agent = execution.agent
  if (agent === undefined) {
    if (server !== undefined) {
      return { kind: 'deny', reason: toolDenyReason(execution.name, server), reading: 'agentless' }
    }
    const named = resourceServerOf(execution.arguments)
    if (named === undefined) return { kind: 'allow' }
    return { kind: 'deny', reason: resourceDenyReason(named), reading: 'agentless' }
  }

  // One live read per call, and only now: a call outside the MCP namespace (or
  // one no agent made) never pays for the claim-set reading.
  const live = blocked()
  const visible = visibleFor(agent)
  const reason = server === undefined
    ? resourceGuardReason(execution.name, execution.arguments, live, visible ?? NO_SERVERS)
    : guardReason(execution.name, live, visible ?? NO_SERVERS)
  return reason === undefined
    ? { kind: 'allow' }
    : { kind: 'deny', reason, reading: visible === undefined ? 'untracked' : 'tracked' }
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
 * Whether one error is cordis refusing a service access from an inactive
 * context — the plugin fiber (or one agent scope) is already unloaded.
 *
 * At host teardown the tools registry unregisters one tool at a time and every
 * unregistration fires `tools/change`, which reaches this layer as a refresh
 * long after the fiber's service snapshot was cleared: each such reading once
 * cost an error line, and a real restart burst hundreds of them. Those
 * readings ARE the shutdown, not failures worth reporting, so both readers
 * below treat this marker as "going away" (see `@deepseek-ai/cordis`
 * `src/reflect.ts`: `cannot get required service "…" in inactive context`).
 * @param error - the thrown value.
 * @returns whether cordis threw it from an inactive context.
 */
function isInactiveContextError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('in inactive context')
}

/**
 * The workspace isolation layer. One instance watches every live agent scope;
 * the host wiring owns the event subscriptions and calls {@link attach} /
 * {@link detach} / {@link refresh}.
 */
export class IsolationLayer {
  /** Tracked agents, keyed by their scope object. */
  private readonly agents = new Map<object, Tracked>()

  /** Attaches in flight, so a second call joins instead of duplicating effects. */
  private readonly attaching = new Map<object, Promise<void>>()

  /**
   * Whether the plugin's own context went away (cordis inactive context).
   *
   * Set by the first catalog read that fails because the fiber is unloading;
   * every later recompute is then skipped, so a teardown that fires
   * `tools/change` per unregistered tool costs one reading instead of one
   * reading per tool. Only the plugin-scope read may set this: an agent scope
   * dying alone is transient and must not retire the layer.
   */
  private teardown = false

  /**
   * @param ports - the facts and effects this layer uses.
   */
  constructor(private readonly ports: IsolationPorts) {}

  /**
   * Whether this layer already tracks one agent.
   *
   * The boot sweep reads this to skip a session the `agent/created` path
   * already attached. It answers from the claim, so an attach still in flight
   * already reads as tracked.
   * @param key - the agent's identity object (its scope).
   * @returns whether the key has a tracked agent in this layer.
   */
  isTracked(key: object): boolean {
    return this.agents.has(key)
  }

  /**
   * Start tracking one agent: install its dispatch guard and apply its initial
   * restriction.
   *
   * Idempotent per key. The first call claims the {@link Tracked} record
   * synchronously and starts the agent's life ({@link start}); a second call
   * for the same key joins that start while it is in flight, or returns once
   * it settled, so one agent life never carries two guards or two
   * restrictions. A key this layer no longer tracks is claimed again by the
   * next call — a new life.
   * @param key - the agent's identity object (its scope).
   * @param cwd - the session's creation directory, when known.
   * @param tools - the agent scope's tool surface.
   * @returns after the initial restriction settled.
   */
  async attach(key: object, cwd: string | undefined, tools: ScopedTools): Promise<void> {
    const inFlight = this.attaching.get(key)
    if (inFlight !== undefined) return inFlight
    if (this.agents.has(key)) return

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

    const started = this.start(tracked)
    this.attaching.set(key, started)
    try {
      await started
    } finally {
      // Clear by identity: a detach followed by a new attach may already own
      // this slot, and that life must keep its own in-flight entry.
      if (this.attaching.get(key) === started) this.attaching.delete(key)
    }
  }

  /**
   * Install one agent's dispatch guard and apply its first restriction.
   *
   * Split out of {@link attach} so a concurrent second attach can join this
   * very start instead of installing a second guard. Neither step rejects: a
   * guard that cannot be installed is reported and the recompute still runs,
   * and the recompute carries its own backstop.
   * @param tracked - the agent's state, already claimed in `agents`.
   * @returns after the initial restriction settled.
   */
  private async start(tracked: Tracked): Promise<void> {
    try {
      // Installed once and kept for the agent's lifetime: it reads the live
      // blocked and visible sets, so a restriction refresh never needs to
      // re-register it (and a registration failure is reported, not fatal).
      // The tool face answers first; the resource face only sees calls the
      // tool face left alone, so a name-prefixed call is never judged twice.
      tracked.guard = tracked.tools.guard((execution) => {
        // One live read per call: both faces gate on the same snapshot, and a
        // blocked/visible change takes effect on the very next call (D-12).
        const blocked = this.ports.blockedServerNames()
        const toolReason = guardReason(execution.name, blocked, tracked.visible)
        if (toolReason !== undefined) return toolReason
        return resourceGuardReason(execution.name, execution.arguments, blocked, tracked.visible)
      })
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
   * The server names one tracked agent may see.
   *
   * Read live, never cached: the name face (`prompt-isolation.ts`) calls this
   * on every prompt assembly. An unknown key means the agent predates this
   * plugin's load (or is not an agent scope at all) — the caller treats that as
   * "hide every project server" (fail closed), which is why this returns
   * undefined instead of an empty set.
   * @param key - the agent's identity object (its own scope).
   * @returns the agent's current visible set, or undefined when untracked.
   */
  visibleFor(key: object): ReadonlySet<string> | undefined {
    return this.agents.get(key)?.visible
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
    if (this.teardown) return
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
   *   blocked set, and the retry below drops one whose registration is gone.
   * @param tracked - the agent's state.
   */
  private async recompute(tracked: Tracked): Promise<void> {
    if (this.teardown) return
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
    const blocked = this.ports.blockedServerNames()
    const roots = await this.attribute(tracked)
    tracked.visible = roots === null
      ? new Set()
      : this.ports.serverNamesForRoots(new Set(roots))

    const global = this.readGlobalNames()
    const scoped = this.readScopedNames(tracked)
    const carried = tracked.deny.filter((name) => {
      const server = toolServerOf(name)
      return server !== undefined && blocked.has(server)
    })
    const candidates = Array.from(new Set([...global, ...scoped, ...carried]))
    const deny = deriveDeny(candidates, blocked, tracked.visible)

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
      blocked,
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
      // The plugin's own context is gone: this is teardown, not a failed
      // reading, and nothing will ever read the catalog again.
      if (isInactiveContextError(error)) {
        this.teardown = true
        return []
      }
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
      // One agent scope may already be disposed while the plugin lives on (the
      // session ended mid-refresh). Transient: the scope's own disposer
      // removes the agent from this layer, so this stays a quiet empty
      // reading rather than an error line.
      if (isInactiveContextError(error)) return []
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
