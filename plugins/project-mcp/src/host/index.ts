/**
 * The plugin body: project-level MCP configuration for the dsh host.
 *
 * The pieces are deliberately separate and each is unit-tested on its own —
 * `scan` discovers and arbitrates, `mcp-manager` owns the loaded set,
 * `attribution` decides which workspace a session belongs to, `isolation`
 * applies that decision, `watcher` and `triggers` invalidate it. This module
 * only wires them to the host context and owns the ordering:
 *
 * 1. an initial scan loads whatever the workspaces already configure;
 * 2. `agent/created` attaches per-session isolation through ONE attach path,
 *    and its disposer rides the agent's own scope; the same path catches up
 *    the sessions the host already held when this fiber loaded, so a plugin
 *    installed into a running process isolates the sessions it meets;
 * 3. `tools/change` recomputes isolation for every live agent (idempotently);
 * 4. registry and durable-domain changes, filesystem events, and the
 *    `/mcp-reload` command all funnel into ONE serialized rescan, so
 *    overlapping triggers converge instead of interleaving;
 * 5. unloading the fiber releases watchers, restrictions, the global guard,
 *    triggers, and every MCP child fiber;
 * 6. the prompt-assembly waterfall filters the project server names and the
 *    `mcp:<server>` instruction sections out of every prompt whose session may
 *    not see them;
 * 7. a process-wide dispatch guard, installed before the first await, is the
 *    fourth face (see `isolation.ts`): it fails closed for an MCP call the host
 *    attributed to no session, or to a session this layer does not track.
 *
 * Rescans are serialized because they are declarative: each one re-reads the
 * registry, re-scans every root, and hands the complete desired set to the
 * manager, which computes the difference. Two scans racing would only waste
 * work — the later one wins either way.
 * @module dsh-plugin-project-mcp/host
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import { RootAttributor } from './attribution.ts'
import { sweepLiveSessions } from './boot-sweep.ts'
import { nodeRealpathIo, nodeScanIo, nodeWatchIo, scanLog } from './host-io.ts'
import { globalGuardDecision, IsolationLayer, type ScopedTools } from './isolation.ts'
import { McpManager, type SyncSummary } from './mcp-manager.ts'
import { createServerLoader } from './plugin-loader.ts'
import { createAssembleListener } from './prompt-isolation.ts'
import { workspaceRoots } from './roots.ts'
import { scanServers } from './scan.ts'
import { installTriggers } from './triggers.ts'
import type { ScanLog } from './types.ts'
import { DirectoryWatcher, watchTargets } from './watcher.ts'

/** Cordis plugin name used by loader diagnostics (the bundle's row id). */
export const name = 'project-mcp'

/**
 * Required services: the workspace registry to scan, the tool registry to
 * isolate, and the live sessions to catch up.
 */
export const inject = ['workspaceRegistry', 'tools', 'agents']

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Any durable domain change. Declared locally because this package does not
     * depend on the package that owns the declaration; the running host emits
     * it either way. The plugin uses it purely as a trigger and never reads the
     * payload (see `triggers.ts`).
     */
    'domain/changed'(change: unknown): void
  }
}

/** What a reconciliation with nothing to do reports. */
const EMPTY_SUMMARY: SyncSummary = { loaded: [], reloaded: [], unloaded: [], unchanged: [], failed: [] }

/**
 * The agent-scoped tool surface, as the isolation layer drives it.
 * @param scope - the agent's own context.
 * @param key - the agent's scope key (the agent object itself); the registry
 *   resolves that scope's view through it, which is where the model-facing
 *   rows sit in this deployment.
 * @returns the effects isolation installs and the view it reads.
 */
function scopedTools(scope: Context, key: object): ScopedTools {
  return {
    restrict: (filter) => scope.tools.restrict(filter),
    guard: (guard) => scope.tools.guard(guard),
    visibleNames: () => scope.tools.schemas(key).map((schema) => schema.name),
  }
}

/**
 * Mount the project-MCP manager on the host context.
 * @param ctx - context carrying the workspace registry and the tool registry.
 */
export function apply(ctx: Context): void {
  const log = scanLog(ctx)
  const manager = new McpManager(createServerLoader(ctx), log)
  // Registry anomalies (#3: `roots[0] !== primaryRoot`, duplicate primary
  // roots) are reported instead of silently absorbed; attribution itself stays
  // fail-closed (see `attribution.ts`).
  const attributor = new RootAttributor(nodeRealpathIo, { onAnomaly: log.warn })

  const isolation = new IsolationLayer({
    // The plugin's own context sees the unrestricted registry: deriving a deny
    // list from an agent's restricted view would oscillate (see isolation.ts).
    catalog: () => ctx.tools.schemas().map((schema) => schema.name),
    attribute: async (cwd) => (await attributor.attribute(cwd))?.roots ?? null,
    serverNamesForRoots: (roots) => manager.serverNamesForRoots(roots),
    blockedServerNames: () => manager.blockedServerNames(),
    log,
  })

  // 0. The global gate: installed before the first await, and released by the
  //    teardown effect below, so it can never outlive the fiber that owns it.
  //    It runs for EVERY tool call in the process, which is why it reads no
  //    port until the call is in the MCP family (`globalGuardDecision` decides
  //    that first): a non-MCP call is allowed with zero port reads and zero
  //    log lines. Only a fail-closed denial — no calling agent, or a session
  //    this layer does not track — is reported, and the count is throttled to
  //    the first three plus every hundredth: a busy session can produce one
  //    such denial per call.
  let failClosedDenials = 0
  let globalGuard: (() => void) | undefined
  try {
    globalGuard = ctx.tools.guard((execution) => {
      const decision = globalGuardDecision(
        execution,
        () => manager.blockedServerNames(),
        (key) => isolation.visibleFor(key),
      )
      if (decision.kind === 'allow') return undefined
      if (decision.reading !== 'tracked') {
        failClosedDenials += 1
        if (failClosedDenials <= 3 || failClosedDenials % 100 === 0) {
          log.warn(
            `isolation: global guard denied ${execution.name}`
              + ` (${decision.reading === 'agentless' ? 'no calling agent' : 'untracked session'})`
              + `; ${failClosedDenials} such denial(s)`,
          )
        }
      }
      return decision.reason
    })
  } catch (error) {
    log.error(`cannot install the workspace isolation global guard: ${String(error)}`)
  }

  /** The serialized rescan queue. */
  let queue: Promise<SyncSummary> = Promise.resolve(EMPTY_SUMMARY)

  const watcher = new DirectoryWatcher(nodeWatchIo, () => {
    background()
  }, log)

  /**
   * Report a failure that no caller is waiting on.
   * @param error - the failure.
   */
  function reportFailure(error: unknown): void {
    log.error(`rescan failed: ${String(error)}`)
  }

  /** Rescan in the background, reporting rather than throwing. */
  function background(): void {
    void rescan().catch(reportFailure)
  }

  /**
   * One full pass: registry → roots → scan → load → isolation → watch targets.
   * @param runLog - the log for this pass (the command counts what it skipped).
   * @returns what the load reconciliation did.
   */
  async function performRescan(runLog: ScanLog): Promise<SyncSummary> {
    const workspaces = workspaceRoots(ctx)
    // Roots first: attribution must answer with the same root set the scan used.
    await attributor.update(workspaces)
    const servers = await scanServers(workspaces, nodeScanIo, process.env, runLog)
    const summary = await manager.sync(servers)
    await isolation.refresh()
    watcher.arm(await watchTargets(nodeWatchIo, workspaces.flatMap((workspace) => workspace.roots)))
    return summary
  }

  /**
   * Enqueue one full pass.
   * @param runLog - the log for this pass.
   * @returns after that pass settled.
   */
  function rescan(runLog: ScanLog = log): Promise<SyncSummary> {
    const run = queue.then(
      () => performRescan(runLog),
      () => performRescan(runLog),
    )
    queue = run.then(
      () => EMPTY_SUMMARY,
      () => EMPTY_SUMMARY,
    )
    return run
  }

  /**
   * Attach one session's workspace isolation: the only attach path.
   *
   * `agent/created` and the boot sweep both go through here, so a session is
   * tracked exactly once — never with two guards or two restrictions. The
   * detach is registered only for a key this layer does not track yet, so one
   * agent scope never carries two disposers for the same effect; the
   * restriction and the guard then unwind with that scope, without a second
   * registry to keep.
   * @param agent - the live agent to isolate.
   * @returns after the initial restriction settled.
   */
  async function attachAgent(agent: Agent): Promise<void> {
    const key: object = agent
    if (!isolation.isTracked(key)) {
      agent.ctx.effect(() => () => {
        isolation.detach(key)
      }, 'dsh-plugin-project-mcp: workspace isolation')
    }
    await isolation.attach(key, agent.session.header.cwd, scopedTools(agent.ctx, key))
  }

  // 1. Per-session isolation. The attach is RETURNED on purpose:
  //    `agent/created` is a serial announcement whose returned promise the
  //    registry awaits before the session may take its first step, so a
  //    session never assembles a first prompt while an out-of-scope tool is
  //    still visible. A failure is reported rather than rejecting the creation
  //    it rides on.
  ctx.on('agent/created', ({ agent }) => attachAgent(agent).then(
    () => undefined,
    (error: unknown) => {
      log.error(`cannot apply workspace isolation to a session: ${String(error)}`)
      return undefined
    },
  ))

  // 2. Any tool registering or leaving (an MCP server connecting, a config
  //    change, another plugin adding a tool) re-derives every agent's deny set.
  //    The first receipts are reported: with no logger exporter after boot a
  //    silent listener is indistinguishable from a listener that never ran.
  let toolChanges = 0
  ctx.on('tools/change', () => {
    toolChanges += 1
    if (toolChanges <= 3) log.info(`tools/change received (#${toolChanges})`)
    void isolation.refresh().catch((error: unknown) => {
      log.error(`cannot recompute workspace isolation: ${String(error)}`)
    })
  })

  // 3. A workspace registration or an additional-root grant changes which roots
  //    exist at all, so it needs a full rescan rather than a re-derivation.
  const triggers = installTriggers(ctx, () => {
    background()
  })

  // 4. The human fallback for the cases a watcher cannot see (an unwatchable
  //    mount, a root whose `.dsh/mcp` was created while nothing watched it).
  ctx.inject(['commands'], (scope) => {
    scope.effect(() => scope.commands.register({
      name: 'mcp-reload',
      description: '重新扫描各工作区 .dsh/mcp 目录，并按最新配置加载或卸载项目级 MCP 服务器',
      handler: async () => {
        let skipped = 0
        const countingLog: ScanLog = {
          info: (message) => log.info(message),
          warn: (message) => log.warn(message),
          error: (message) => {
            skipped += 1
            log.error(message)
          },
        }
        try {
          const summary = await rescan(countingLog)
          return {
            kind: 'success',
            text: `已重扫：加载 ${summary.loaded.length}、重载 ${summary.reloaded.length}、`
              + `卸载 ${summary.unloaded.length}、保持不变 ${summary.unchanged.length}、`
              + `跳过 ${skipped}、失败 ${summary.failed.length}`,
          }
        } catch (error) {
          return { kind: 'error', text: `重扫失败：${String(error)}` }
        }
      },
    }), 'dsh-plugin-project-mcp: /mcp-reload')
  })

  // 5. Unload: every effect this plugin installed goes away with the fiber.
  ctx.effect(() => () => {
    watcher.dispose()
    isolation.dispose()
    globalGuard?.()
    for (const dispose of triggers) dispose()
    void manager.dispose()
  }, 'dsh-plugin-project-mcp: teardown')

  // 6. The name face: the prompt-assembly waterfall filters the project server
  //    names and the `mcp:<server>` instruction sections out of every assembly
  //    whose session may not see them. The listener awaits the rest of the
  //    chain first and reads the live per-agent view, so a rescan lands in the
  //    next assembly; without a system-prompt service the event never fires
  //    and this registration is a no-op.
  ctx.on('system-prompt/assemble', createAssembleListener({
    visibleFor: (agent) => isolation.visibleFor(agent),
    blockedServerNames: () => manager.blockedServerNames(),
    log,
  }))

  // 7. Boot pass: a session the host held before this fiber loaded never
  //    receives `agent/created` from us, so it is attached here through the
  //    same path. The order is the semantics (`boot-sweep.ts`): attribution
  //    first, because each attach reads it; then the sweep; then the first full
  //    scan, so the deny sets it just computed are recomputed against the
  //    freshly loaded server set. The failure is reported rather than thrown:
  //    `apply` returns synchronously and nothing awaits this pass.
  async function boot(): Promise<void> {
    await attributor.update(workspaceRoots(ctx))
    let live: Agent[] = []
    try {
      live = ctx.agents.list()
    } catch (error) {
      log.error(`cannot read the live sessions for the boot sweep: ${String(error)}`)
    }
    await sweepLiveSessions(
      live.map((agent) => ({ key: agent, id: agent.session.header.id, attach: () => attachAgent(agent) })),
      { isTracked: (key) => isolation.isTracked(key), log },
    )
    await rescan()
  }
  void boot().catch(reportFailure)
}
