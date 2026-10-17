/**
 * dsh-plugin-web-ux — host half: the Connection RPC channel behind the
 * browser's "delete archived session" entry.
 *
 * The browser half (exports "./client") owns the sidebar menu item and its
 * confirmation dialog; the work itself lives here, because it needs the
 * workspace registry, session persistence, and the harness home on disk. The
 * channel (`CHANNEL`, see ./contract.ts) serves two endpoints: `preview-delete`
 * validates and measures the delete set, `delete-session` revalidates, cleans
 * the workspace records, removes the stored files, and broadcasts the removal
 * for every affected session.
 *
 * The row is STILL mounted by bare package name, and that shape stays
 * REQUIRED: the web client-module scan reads the `dsh.client` declaration in
 * package.json from exactly that row, so dropping the bare-name insert would
 * silently remove the browser half from the boot graph. This entry is no
 * longer a no-op carrier — it is the carrier AND the RPC service.
 *
 * Every upstream touch point is soft: the channel is mounted only where a host
 * Connection and web server exist, a `connection` that resolves to nothing
 * only warns, and a missing harness-home resolver degrades both endpoints to
 * `internal` instead of guessing a path.
 *
 * Runtime imports are `node:*` plus this package's own modules only: every dsh
 * import is type-only, so the built host artifact stays self-contained.
 * @module dsh-plugin-web-ux
 */

import { lstat, readdir, rm, unlink } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: loads the `sessionPersistence` context service augmentation.
import type {} from '@deepseek-ai/dsh-session-persistence'
// Type-only: loads the `workspaceRegistry` context service augmentation.
import type {} from '@deepseek-ai/dsh-workspace'
import {
  CHANNEL,
  DELETE_ENDPOINT,
  PREVIEW_ENDPOINT,
  parseDeleteRequest,
  type FailureCode,
} from './contract.ts'
import {
  SESSION_REMOVED_EVENT,
  createSessionFiles,
  deleteSession,
  previewDelete,
  type DeletePorts,
  type FileSystemOps,
} from './delete-session.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Harness-home path resolver, provided by the app-boot row. Declared
     * locally because this package does not depend on `@deepseek-ai/dsh-app-boot`
     * (a type-only import of it would not resolve here); the shape is identical
     * to that declaration, so the two merge when both are in one program.
     */
    dshHomePath?: (...segments: string[]) => string
  }
}

/** Cordis plugin name used by loader diagnostics (the bundle's row id). */
export const name = 'web-ux'

/** Services this row needs before it may activate. */
export const inject = ['workspaceRegistry', 'sessionPersistence', 'dshHomePath']

/** The failure text used when the host cannot resolve the harness home. */
const NO_HOME_MESSAGE = 'the host exposes no harness-home path resolver, so stored session files cannot be located'

/**
 * Register the channel where a host Connection exists. Soft: a headless or
 * non-web profile simply never runs the callback, and the registry is
 * unaffected.
 *
 * `webServer` MUST be in the dependency list so this callback only runs once
 * the route table exists, and the service MUST be read off `ctx.root`:
 * `connection.rpc.handle` resolves `webServer` as a property of the context the
 * service was READ from, and cordis property resolution from a plugin fiber can
 * only see that fiber's own injected services — a sibling row's `webServer` is
 * invisible, the registration dies with `cannot get property "webServer"
 * without inject`, and every request then falls through to the static SPA
 * fallback as HTTP 405. Reading at the root (what the upstream connection tests
 * do) resolves against the shared service store instead.
 * @param ctx - the host context the row is mounted on.
 */
export function apply(ctx: Context): void {
  ctx.inject(['connection', 'webServer'], (connectionCtx) => {
    const connection = connectionCtx.root.get('connection')
    if (connection === undefined) {
      ctx.logger.warn('web-ux: connection resolved without the service; the session-delete channel is not mounted')
      return
    }
    const dispose = connection.rpc.handle(CHANNEL, createDispatcher(ctx))
    return () => { void dispose() }
  })
}

/**
 * Build the channel handler for one host context.
 *
 * The handler carries the whole wire boundary: the payload is validated before
 * anything acts on it (it arrived from a browser), the ports are assembled from
 * the upstream public surface, and every outcome is mapped onto the
 * `ConnectionRpcResult` envelope — a business refusal keeps its stable code, an
 * unexpected throw becomes `internal`.
 *
 * Exported for tests: the dispatcher needs no live Connection to be driven.
 * @param ctx - the host context carrying the services the ports read.
 * @returns the handler `connection.rpc.handle` registers for `CHANNEL`.
 */
export function createDispatcher(
  ctx: Context,
): (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<ConnectionRpcResult<unknown>> {
  return async (endpoint, payload) => {
    const parsed = parseDeleteRequest(endpoint, payload)
    if (!parsed.ok) return failure('bad-request', parsed.message)
    try {
      const ports = createPorts(ctx)
      if (ports === undefined) return failure('internal', NO_HOME_MESSAGE)
      if (endpoint === PREVIEW_ENDPOINT) {
        const result = await previewDelete(ports, parsed.value.sessionId)
        return result.ok ? { ok: true, value: result.preview } : failure(result.code, result.message)
      }
      if (endpoint === DELETE_ENDPOINT) {
        const result = await deleteSession(ports, parsed.value.sessionId)
        return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message)
      }
      // parseDeleteRequest already restricts the endpoint to the two above.
      return failure('bad-request', `unknown endpoint "${endpoint}"`)
    } catch (error: unknown) {
      ctx.logger.warn('web-ux: the session-delete endpoint failed unexpectedly', error)
      return failure('internal', error instanceof Error ? error.message : String(error))
    }
  }
}

/**
 * `node:fs/promises` bound to the structural {@link FileSystemOps} port. One
 * shared adapter: it holds no state and always resolves against the same
 * module.
 */
const nodeFileSystem: FileSystemOps = {
  readdir: async (path) => await readdir(path, { withFileTypes: true }),
  lstat: async (path) => await lstat(path),
  rm: async (path, options) => { await rm(path, { recursive: options.recursive, force: options.force }) },
  unlink: async (path) => { await unlink(path) },
}

/**
 * Assemble the delete ports over the upstream public surface.
 *
 * Every port is one upstream call: session headers come from
 * `ctx.sessionPersistence.list()` (`listStoredHeaders()` is private upstream),
 * liveness from the in-memory `sessions` store (an explicit sibling lookup,
 * because property access would demand an injected `sessions` dependency this
 * row does not name), and registry cleanup is the three idempotent registry
 * operations. The returned object stays live: each access reads the service
 * again, so a re-composed row is never pinned to a stale instance.
 *
 * @param ctx - the host context.
 * @returns the ports, or `undefined` when the harness-home resolver is missing
 *   (file work must never run against a guessed path).
 */
function createPorts(ctx: Context): DeletePorts | undefined {
  const homePath = ctx.dshHomePath
  if (homePath === undefined) {
    ctx.logger.warn('web-ux: dshHomePath is unavailable; the session-delete endpoints answer internal')
    return undefined
  }
  const files = createSessionFiles({ homePath, fs: nodeFileSystem })
  // The event name belongs to the upstream Remote event selection, not to the
  // `dsh-session` / `dsh-workspace` augmentations, so the emit stays a local
  // structural call: a host that no longer forwards it only costs the browser a
  // manual refresh.
  const emitter = ctx as unknown as { emit(event: string, ...args: unknown[]): void }
  return {
    listStoredHeaders: async () => (await ctx.sessionPersistence.list()).map((snapshot) => snapshot.header),
    isLive: (sessionId) => ctx.get('sessions')?.get(sessionId as SessionId) !== undefined,
    isArchived: (sessionId) => ctx.workspaceRegistry.archivedSessionIds.includes(sessionId as SessionId),
    cleanupRegistry: async (sessionId) => {
      const registry = ctx.workspaceRegistry
      await registry.unarchiveSession(sessionId as SessionId)
      await registry.unpinSession(sessionId as SessionId)
      for (const workspace of registry.list()) {
        if (workspace.sessionIds.includes(sessionId as SessionId)) {
          await workspace.detachSession(sessionId as SessionId)
        }
      }
    },
    measureFiles: async (sessionId) => await files.measure(sessionId),
    removeFiles: async (sessionId) => await files.remove(sessionId),
    emitRemoved: (sessionId) => {
      try {
        emitter.emit(SESSION_REMOVED_EVENT, sessionId)
      } catch (error: unknown) {
        ctx.logger.warn('web-ux: broadcasting the session-removed event failed', error)
      }
    },
    warn: (message, error) => { ctx.logger.warn(message, error) },
  }
}

/** Wrap one stable failure code into the channel's result envelope. */
function failure(code: FailureCode, message: string): ConnectionRpcResult<unknown> {
  return { ok: false, error: { code, message, details: {} } }
}
