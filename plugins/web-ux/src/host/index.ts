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
 * 2. `agent/created` attaches per-session isolation, and its disposer rides
 *    the agent's own scope;
 * 3. `tools/change` recomputes isolation for every live agent (idempotently);
 * 4. registry and durable-domain changes, filesystem events, and the
 *    `/mcp-reload` command all funnel into ONE serialized rescan, so
 *    overlapping triggers converge instead of interleaving;
 * 5. unloading the fiber releases watchers, restrictions, triggers, and every
 *    MCP child fiber.
 *
 * Rescans are serialized because they are declarative: each one re-reads the
 * registry, re-scans every root, and hands the complete desired set to the
 * manager, which computes the difference. Two scans racing would only waste
 * work — the later one wins either way.
 * @module dsh-plugin-web-ux/host
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import { Attributor } from './attribution.ts'
import { nodeRealpathIo, nodeScanIo, nodeWatchIo, scanLog } from './host-io.ts'
import { IsolationLayer, type ScopedTools } from './isolation.ts'
import { McpManager, type SyncSummary } from './mcp-manager.ts'
import { createServerLoader } from './plugin-loader.ts'
import { workspaceRoots } from './roots.ts'
import { scanServers } from './scan.ts'
import { installTriggers } from './triggers.ts'
import type { ScanLog } from './types.ts'
import { DirectoryWatcher, watchTargets } from './watcher.ts'

/** Cordis plugin name used by loader diagnostics (the bundle's row id). */
export const name = 'web-ux'

/** Required services: the workspace registry to scan and the tool registry to isolate. */
export const inject = ['workspaceRegistry', 'tools']

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
  const attributor = new Attributor(nodeRealpathIo)

  const isolation = new IsolationLayer({
    // The plugin's own context sees the unrestricted registry: deriving a deny
    // list from an agent's restricted view would oscillate (see isolation.ts).
    catalog: () => ctx.tools.schemas().map((schema) => schema.name),
    attribute: async (cwd) => (await attributor.attribute(cwd))?.roots ?? null,
    serverNamesForRoots: (roots) => manager.serverNamesForRoots(roots),
    managedServerNames: () => manager.managedServerNames(),
    log,
  })

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

  // 1. Per-session isolation, owned by the agent's own scope: the restriction
  //    and the guard unwind with the agent, without a second registry to keep.
  //    The attach is RETURNED on purpose: `agent/created` is a serial
  //    announcement whose returned promise the registry awaits before the
  //    session may take its first step, so a session never assembles a first
  //    prompt while an out-of-scope tool is still visible. A failure is
  //    reported rather than rejecting the creation it rides on.
  ctx.on('agent/created', ({ agent }) => {
    const key: object = agent
    const cwd = agent.session.header.cwd
    agent.ctx.effect(() => () => {
      isolation.detach(key)
    }, 'dsh-plugin-web-ux: workspace isolation')
    return isolation.attach(key, cwd, scopedTools(agent.ctx, key)).then(
      () => undefined,
      (error: unknown) => {
        log.error(`cannot apply workspace isolation to a session: ${String(error)}`)
        return undefined
      },
    )
  })

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
    }), 'dsh-plugin-web-ux: /mcp-reload')
  })

  // 5. Unload: every effect this plugin installed goes away with the fiber.
  ctx.effect(() => () => {
    watcher.dispose()
    isolation.dispose()
    for (const dispose of triggers) dispose()
    void manager.dispose()
  }, 'dsh-plugin-web-ux: teardown')

  // 6. Boot pass: a workspace that already configures servers needs no restart.
  background()
}
