/**
 * /git/* route layer: JSON envelope (ok/error with stable codes) for the
 * query/mutation operations and a multi-repository SSE stream for external
 * branch changes. The service itself owns workspace gating and the git guards;
 * this layer owns HTTP shape and the SSE subscriber bookkeeping. Routes are
 * loopback-only by default; a live paired-device cookie is an extra allow path
 * when remote-web-ui is loaded.
 * @module dsh-git-graph-multi/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  isBranchesView, isGitError, isGitFeatureConfig, isGraphView, isGroupBase,
  isGroupResultView, isRepoStatus, isReposView, isWorktreeListView,
  type GitError, type GitFeatureConfig, type GroupDeps,
} from '../core/types.ts'
import { collectChanges, parseEventPaths, pollDigestKey } from './events.ts'
import { PollGuard } from './poll-guard.ts'
import { isGitAllowed } from './access.ts'
import { readJsonBody, writeJson } from './http.ts'
import type { GitService } from './git-service.ts'
import { groupCreate, groupSwitch } from './group-ops.ts'
import { worktreesHome } from './worktree-home.ts'

/** Envelope every /git JSON response carries. */
export type GitEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: GitError }

/** Test-friendly default: every gateable feature off, the real managed home. */
const defaultFeatureConfig = (): GitFeatureConfig => ({
  autoIsolate: false,
  autoBaseline: 'current',
  worktreesHome: worktreesHome(),
})

const OK = (value: unknown): GitEnvelope<unknown> => ({ ok: true, value })
const FAIL = (error: GitError): GitEnvelope<never> => ({ ok: false, error })

/** Git operation error for structurally invalid requests (never a workspace fault). */
const BAD_REQUEST: GitError = { code: 'internal', message: 'malformed request' }

/**
 * One SSE subscriber: the repository paths it watches and the digest last
 * pushed for each. One stream covers every repository of a workspace, so the
 * browser spends a single connection instead of one per repository (the
 * per-origin connection pool is only six wide).
 */
interface Subscriber {
  /** Watched repository paths (one entry per enumerated repository). */
  paths: readonly string[]
  /** Last pushed digest per path. */
  digests: Map<string, string>
  /** Last successfully listed worktree digest per path (kept across failed probes). */
  worktreeDigests: Map<string, string>
  res: ServerResponse
  statusAbort?: AbortController
}

/**
 * Poll interval for external git-state changes while subscribers are
 * connected. Kept deliberately long (30s): each tick spawns several git
 * processes per subscriber, and on Windows a cold git.exe costs ~0.7s per
 * spawn — a short interval turns the poll itself into a self-exciting
 * storm. Window focus and the client's own refresh calls cover the
 * interactive freshness path.
 */
const POLL_INTERVAL_MS = 30_000
/** SSE keep-alive comment interval (proxies drop idle connections). */
const HEARTBEAT_INTERVAL_MS = 15_000

/**
 * Route-layer deadline for one git status request. On expiry the controller
 * aborts the read path so the subprocess can terminate; the JSON handler keeps
 * the stable envelope and the SSE poll loop can clear its overlap guard.
 */
const STATUS_TIMEOUT_MS = 15_000
const STATUS_TIMEOUT_MESSAGE = 'git status timed out'

/**
 * PollGuard lifetime bound. The SSE loop must live exactly as long as the
 * subscriber set (start on first join, stop on empty), so there is no natural
 * server-side expiry: the deadline is set to a sentinel that never fires and
 * the loop is terminated by {@link PollGuard.stop} when the last subscriber
 * closes. The per-subscriber 15s {@link STATUS_TIMEOUT_MS} deadline is a run
 * bound, unrelated to this loop-lifetime value.
 */
const POLL_LIFETIME_MS = Number.MAX_SAFE_INTEGER

/** Git operation error for a structurally invalid service view (never a workspace fault). */
const MALFORMED_VIEW: GitError = { code: 'internal', message: 'malformed git response' }

/** Extract the required string field from a JSON object payload. */
function pathOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const path = (payload as Record<string, unknown>).path
  return typeof path === 'string' && path !== '' ? path : null
}

/**
 * Send a service view under the ok envelope, rejecting structurally invalid
 * values (a malformed RepoStatus / BranchesView / GraphView would otherwise
 * leak to the browser as a typed-but-wrong payload).
 * @param res - the server response.
 * @param value - the view the service produced.
 * @param guard - the runtime narrowing for the view.
 */
function okView(res: ServerResponse, value: unknown, guard: (view: unknown) => boolean): void {
  if (value !== null && !guard(value)) {
    writeJson(res, 200, FAIL(MALFORMED_VIEW))
    return
  }
  writeJson(res, 200, OK(value))
}

/**
 * Adapt the workspace-gated service onto the group-operation port. The
 * candidate set comes from the same scan the overview uses, so a group
 * operation can never reach a repository the enumeration would not show.
 * @param service - the workspace-gated git service.
 * @returns the port the group operations run against.
 */
function serviceGroupDeps(service: GitService): GroupDeps {
  return {
    repos: async (workspacePath) => {
      const view = await service.repos(workspacePath)
      return view === null ? null : view.repos.map(row => row.repo)
    },
    branchesOf: (repoPath) => service.branches(repoPath),
    preflight: (repoPath, target) => service.preflight(repoPath, target),
    switchBranch: (repoPath, branch) => service.switchBranch(repoPath, branch),
    createBranchAt: (repoPath, name, base) => service.createBranchAt(repoPath, name, base),
    defaultBase: (repoPath) => service.defaultBase(repoPath),
  }
}

/**
 * Register the /git routes (prefix for the JSON operations, exact for the
 * SSE stream — longest-prefix-wins keeps them disjoint).
 * @param ctx - context carrying the webServer service.
 * @param service - the workspace-gated git service.
 * @param config - live feature-config thunk (the /git/config view; settings-driven). Optional for tests: the default disables every gateable feature.
 * @returns the route disposers.
 */
export function registerGitRoutes(ctx: Context, service: GitService, config: () => GitFeatureConfig = defaultFeatureConfig): () => void {
  const subscribers = new Set<Subscriber>()
  // The poll loop's lifetime is bound to the subscriber set: created/started
  // when the first subscriber joins, stopped when the last one closes.
  let guard: PollGuard | undefined
  let heartbeatTimer: NodeJS.Timeout | undefined
  /** The group-operation port over the same service the single-repo routes use. */
  const groupPort = serviceGroupDeps(service)

  const removeSubscriber = (subscriber: Subscriber): void => {
    subscriber.statusAbort?.abort(new Error('git status subscriber closed'))
    subscriber.statusAbort = undefined
    subscribers.delete(subscriber)
    if (subscribers.size === 0) {
      guard?.stop()
      guard = undefined
      if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer)
      heartbeatTimer = undefined
    }
  }

  const push = (subscriber: Subscriber, payload: unknown): void => {
    subscriber.res.write(`event: change\ndata: ${JSON.stringify(payload)}\n\n`)
  }

  // One PollGuard owns the whole poll lifecycle: at most one status round
  // runs at a time (a tick arriving mid-run is dropped), consecutive failures
  // back off up to the base interval (cadence stays exactly 30s), and the
  // loop stops when the last subscriber closes. The per-subscriber 15s
  // STATUS_TIMEOUT_MS controller aborts hung status work so a round settles.
  //
  // The same deadline guards the request/response reads that fan out over
  // every repository of a workspace (the /git/status single-repo read and the
  // /git/repos aggregate): on expiry the controller aborts the read path so
  // the git subprocesses can terminate and the JSON handler keeps its stable
  // envelope instead of hanging the connection.
  const withDeadline = async <T>(work: (signal: AbortSignal) => Promise<T>, controller: AbortController): Promise<T> => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        const error = new Error(STATUS_TIMEOUT_MESSAGE)
        controller.abort(error)
        reject(error)
      }, STATUS_TIMEOUT_MS)
    })
    try {
      return await Promise.race([work(controller.signal), deadline])
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }

  const statusWithDeadline = async (path: string, controller: AbortController = new AbortController()): Promise<Awaited<ReturnType<GitService['status']>>> =>
    await withDeadline(signal => service.status(path, signal), controller)

  const reposWithDeadline = async (path: string): Promise<Awaited<ReturnType<GitService['repos']>>> =>
    await withDeadline(signal => service.repos(path, signal), new AbortController())

  const runPoll = async (): Promise<void> => {
    await Promise.all([...subscribers].map(async (subscriber) => {
      // One controller and one 15s deadline per subscriber round, shared by
      // every watched path: a hung git read settles the round instead of
      // leaking one subprocess per path.
      const controller = new AbortController()
      subscriber.statusAbort = controller
      try {
        const next = new Map<string, string>()
        await Promise.all(subscriber.paths.map(async (path) => {
          const status = await statusWithDeadline(path, controller)
          // Worktree membership rides the same change key: `git worktree
          // add/remove` elsewhere never moves the checkout's branch/head, but
          // the worktree manager must still refresh. A failed list keeps the
          // previous digest so a transient error never flaps the stream.
          let worktreeDigest = subscriber.worktreeDigests.get(path) ?? ''
          try {
            const view = await service.worktrees(path, controller.signal)
            if (view !== null) {
              worktreeDigest = view.worktrees.map(item => `${item.path}:${item.branch}:${item.head}`).join(',')
              subscriber.worktreeDigests.set(path, worktreeDigest)
            }
          } catch {
            // tolerate: the status half still covers branch changes
          }
          next.set(path, pollDigestKey(status, worktreeDigest))
        }))
        const changed = collectChanges(subscriber.digests, next)
        subscriber.digests = next
        // A fresh subscriber starts with no digests, so its first round
        // reports every path; a round where nothing moved pushes nothing.
        if (changed.length > 0) push(subscriber, { paths: changed })
      } catch (error: unknown) {
        if (subscribers.has(subscriber)) {
          ctx.logger.warn(`dsh-git-graph-multi: status poll failed for ${subscriber.paths.join(', ')}: ${String(error)}`)
        }
      } finally {
        if (subscriber.statusAbort === controller) subscriber.statusAbort = undefined
      }
    }))
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Trust fence first: never let an unpaired LAN client reach any /git
    // operation, regardless of method or content-type.
    if (!isGitAllowed(ctx, req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    // CSRF hardening: the /git mutations (switch/create-branch) act on the
    // real repository with no origin/referer check, so require a JSON
    // content-type — cross-site forms cannot set application/json without a
    // CORS preflight, which the same-origin client always sends.
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      res.writeHead(415)
      res.end()
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    const payload = await readJsonBody(req, { maxBytes: 1024 * 1024 })
    // The feature config is pathless: the browser reads it before any
    // workspace resolution (the auto-isolation wrapper consults it on every
    // New Session action, so a settings toggle applies without a reload).
    if (pathname === '/git/config') {
      const view = config()
      writeJson(res, 200, isGitFeatureConfig(view) ? OK(view) : FAIL(MALFORMED_VIEW))
      return
    }
    const path = pathOf(payload)
    if (path === null) {
      writeJson(res, 200, FAIL(BAD_REQUEST))
      return
    }
    switch (pathname) {
      case '/git/status':
        try {
          okView(res, await statusWithDeadline(path), isRepoStatus)
        } catch (error: unknown) {
          ctx.logger.warn(`dsh-git-graph-multi: status request failed for ${path}: ${String(error)}`)
          writeJson(res, 200, FAIL({ code: 'internal', message: STATUS_TIMEOUT_MESSAGE }))
        }
        return
      case '/git/branches':
        okView(res, await service.branches(path), isBranchesView)
        return
      case '/git/repos':
        // One aggregate read for the whole workspace: the scan and every
        // per-repo status ride a single request so the overview never has to
        // poll repository by repository.
        try {
          okView(res, await reposWithDeadline(path), isReposView)
        } catch (error: unknown) {
          ctx.logger.warn(`dsh-git-graph-multi: repos request failed for ${path}: ${String(error)}`)
          writeJson(res, 200, FAIL({ code: 'internal', message: STATUS_TIMEOUT_MESSAGE }))
        }
        return
      case '/git/graph': {
        const rawLimit = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).limit
          : undefined
        // Clamp rather than reset: a limit above 1000 must not silently fall
        // back to the 200 default (the client's load-more grows past 1000).
        const limit = typeof rawLimit === 'number' && rawLimit > 0 ? Math.min(rawLimit, 1000) : undefined
        okView(res, await service.graph(path, limit), isGraphView)
        return
      }
      case '/git/switch': {
        const branch = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).branch
          : undefined
        if (typeof branch !== 'string' || branch === '') {
          writeJson(res, 200, FAIL(BAD_REQUEST))
          return
        }
        const result = await service.switchBranch(path, branch)
        writeJson(res, 200, result.ok ? OK({ branch: result.branch }) : FAIL(isGitError(result.error) ? result.error : MALFORMED_VIEW))
        return
      }
      case '/git/create-branch': {
        const name = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).name
          : undefined
        if (typeof name !== 'string' || name === '') {
          writeJson(res, 200, FAIL(BAD_REQUEST))
          return
        }
        const result = await service.createBranch(path, name)
        writeJson(res, 200, result.ok ? OK({ branch: result.branch }) : FAIL(isGitError(result.error) ? result.error : MALFORMED_VIEW))
        return
      }
      case '/git/group-switch': {
        const branch = typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>).branch
          : undefined
        if (typeof branch !== 'string' || branch === '') {
          writeJson(res, 200, FAIL(BAD_REQUEST))
          return
        }
        // Group switch: branch existence across the workspace defines the
        // participating set; every participant is preflighted before any
        // checkout moves (the atomicity the group semantics promise).
        okView(res, await groupSwitch(groupPort, path, branch), isGroupResultView)
        return
      }
      case '/git/group-create': {
        const record = typeof payload === 'object' && payload !== null
          ? payload as Record<string, unknown>
          : {}
        const repos = record.repos
        const name = record.name
        const base = record.base
        if (!Array.isArray(repos) || !repos.every(item => typeof item === 'string' && item !== '')
          || typeof name !== 'string' || name === ''
          || !isGroupBase(base)) {
          writeJson(res, 200, FAIL(BAD_REQUEST))
          return
        }
        // Group create: the selected set is authoritative, a per-repo failure
        // never stops the others, and no partial result is rolled back.
        okView(res, await groupCreate(groupPort, path, repos, name, base), isGroupResultView)
        return
      }
      case '/git/worktrees':
        okView(res, await service.worktrees(path), isWorktreeListView)
        return
      case '/git/worktree-add': {
        const record = typeof payload === 'object' && payload !== null
          ? payload as Record<string, unknown>
          : {}
        const name = record.name
        const baseRef = record.baseRef
        if (typeof name !== 'string' || name === ''
          || (baseRef !== undefined && typeof baseRef !== 'string')) {
          writeJson(res, 200, FAIL(BAD_REQUEST))
          return
        }
        // The client names the worktree but never supplies its path: the
        // service constructs the target under the managed home itself.
        const result = await service.addWorktree(path, name, baseRef)
        writeJson(res, 200, result.ok ? OK({ path: result.path, branch: result.branch, name: result.name }) : FAIL(isGitError(result.error) ? result.error : MALFORMED_VIEW))
        return
      }
      case '/git/worktree-remove': {
        const record = typeof payload === 'object' && payload !== null
          ? payload as Record<string, unknown>
          : {}
        const worktreePath = record.worktreePath
        if (typeof worktreePath !== 'string' || worktreePath === '') {
          writeJson(res, 200, FAIL(BAD_REQUEST))
          return
        }
        const result = await service.removeWorktree(path, worktreePath, {
          force: record.force === true,
          deleteBranch: record.deleteBranch === true,
        })
        writeJson(res, 200, result.ok ? OK({ removed: true }) : FAIL(isGitError(result.error) ? result.error : MALFORMED_VIEW))
        return
      }
      default:
        res.writeHead(404)
        res.end()
    }
  }

  const sse = (req: IncomingMessage, res: ServerResponse): void => {
    // Reject unpaired non-loopback clients before the stream opens.
    if (!isGitAllowed(ctx, req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return
    }
    const url = new URL(req.url ?? '/', 'http://x')
    // The client repeats `path` once per enumerated repository, so one stream
    // covers the whole workspace (and its branch chips) without spending one
    // EventSource per repository. No usable path is a malformed subscription.
    const paths = parseEventPaths(url.searchParams)
    if (paths.length === 0) {
      res.writeHead(400)
      res.end()
      return
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    res.write('retry: 2000\n\n')
    const subscriber: Subscriber = { paths, digests: new Map(), worktreeDigests: new Map(), res }
    subscribers.add(subscriber)
    // A push/heartbeat write racing socket teardown emits 'error' on the
    // response stream; unhandled, that can crash the host. Dropping the
    // subscriber degrades the race to a lost write; req 'close' finishes
    // the remaining cleanup.
    res.on('error', () => { removeSubscriber(subscriber) })
    if (guard === undefined) {
      guard = new PollGuard({
        intervalMs: POLL_INTERVAL_MS,
        deadlineMs: POLL_LIFETIME_MS,
        maxBackoffMs: POLL_INTERVAL_MS,
        onRun: runPoll,
      })
    }
    guard.start()
    if (heartbeatTimer === undefined) {
      heartbeatTimer = setInterval(() => {
        for (const current of subscribers) current.res.write(': ping\n\n')
      }, HEARTBEAT_INTERVAL_MS)
    }
    req.on('close', () => { removeSubscriber(subscriber) })
  }

  const disposers = [
    ctx.webServer.register({ kind: 'prefix', path: '/git', handler }),
    ctx.webServer.register({ kind: 'exact', path: '/git/events', handler: sse }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
    guard?.stop()
    if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer)
    for (const subscriber of subscribers) {
      subscriber.statusAbort?.abort(new Error('git status routes disposed'))
      subscriber.res.end()
    }
    subscribers.clear()
  }
}
