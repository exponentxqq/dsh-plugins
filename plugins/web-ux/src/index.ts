/**
 * dsh-plugin-web-ux —— 宿主半的实载体：浏览器侧「会话管理」（单会话 / 批量处置与
 * 归档目录管理）入口背后的 Connection RPC 通道。
 *
 * 浏览器半（`exports "./client"`）负责侧栏入口、管理浮层与确认对话框；真正的工作在这里，
 * 因为它需要工作区注册表、会话持久化与磁盘上的 harness home。通道（`CHANNEL`，见
 * `./contract.ts`）服务七个端点，按三个域分组：
 *
 * - **单会话**：`preview-delete` 校验并统计处置集合（并原样回声宿主解析后的归档根），
 *   `delete-session` 重新校验后按请求体里的 `mode` 二选一执行——`delete` 物理删除、
 *   `archive` 把日志目录迁移到归档根——再为每个受影响会话广播移除事件。
 * - **批量**：`preview-delete-batch` / `delete-session-batch`，与单会话共用同一套校验与
 *   执行循环，只是目标从 1 个扩成一批（并集统计、整单拒绝、逐项 warnings）。
 * - **已迁移**：`list-migrated` 枚举归档根下的条目，`delete-migrated` 物理删除条目，
 *   `restore-migrated` 把条目搬回 `<home>/sessions` 并挂回工作区；恢复成功后再按
 *   **真实会话头**广播 `api-session/added`，浏览器会话列表因此即时补行。
 *
 * 归档根由 `./config.ts` 的 {@link resolveArchiveRoot} 从插件配置解析：缺省跟随
 * `$DSH_HOME`（`archive/sessions`），支持绝对路径与 `~/`；相对路径告警后回落缺省。
 * 解析与端口装配在同一处完成（{@link createPorts}），因此一次请求只读一次 home 解析器，
 * 预览回声的路径与执行落盘的路径必然一致。
 *
 * 本行**仍以裸包名挂载**，且这个形态是**必需**的：Web 客户端模块扫描正是从这一行读
 * package.json 的 `dsh.client` 声明，去掉裸包名 insert 会让浏览器半从启动图里静默消失。
 * 本入口也不再是空壳：它既是载体，也是 RPC 服务。
 *
 * 每个上游触点都是软的：通道只在存在宿主 Connection 与 web server 时挂载，
 * `connection` 解析不到只告警一条，缺 harness-home 解析器时所有端点都退化为 `internal`
 * 而不是猜一个路径；迁移域的挂回 / 归档集合 / 广播失败只让流程记一条 warning，会话仍算
 * 已恢复。
 *
 * 运行时 import 只有 `node:*`、本包自己的模块、配置模块的 `Config`（原生
 * Schemastery 图，由 esbuild 内联进产物，宿主运行时不为它解析任何 `@deepseek-ai/*`），
 * 以及 cordis 的 `symbols`（通道挂载的解包 helper 用，见 {@link callerConnectionOf}；
 * 同样由 esbuild 内联，`@deepseek-ai/cosmokit` 随之进产物）；其余 dsh import 一律
 * type-only，因此宿主产物保持自包含。
 * @module dsh-plugin-web-ux
 */

import { copyFile, lstat, mkdir, readdir, rename, rm, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
// `symbols` 是本文件唯一的 cordis 值 import（`callerConnectionOf` 解包原始服务实例用）；
// 构建时 esbuild 会把它连同 `@deepseek-ai/cosmokit` 一并内联进产物，产物仍自包含。
// cordis 的 `symbols` 全部经 `Symbol.for` 全局注册表定义，内联副本与宿主那份 cordis
// 共享同一 symbol，因此解包在宿主实例上必然命中。
import { symbols, type Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcResult, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// 类型面：加载 `sessionPersistence` 的上下文服务声明合并。
import type {} from '@deepseek-ai/dsh-session-persistence'
// 类型面：加载 `workspaceRegistry` 的上下文服务声明合并，并借用它的 `WorkspaceId` 品牌。
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { Config, resolveArchiveRoot, type WebUxConfig } from './config.ts'
import {
  CHANNEL,
  DELETE_BATCH_ENDPOINT,
  DELETE_ENDPOINT,
  DELETE_MIGRATED_ENDPOINT,
  LIST_MIGRATED_ENDPOINT,
  PREVIEW_BATCH_ENDPOINT,
  PREVIEW_ENDPOINT,
  RESTORE_MIGRATED_ENDPOINT,
  parseRequest,
  type FailureCode,
} from './contract.ts'
import {
  SESSION_REMOVED_EVENT,
  archiveSession,
  archiveSessionBatch,
  createSessionFiles,
  deleteSession,
  deleteSessionBatch,
  previewDelete,
  previewDeleteBatch,
  type DeletePorts,
  type FileSystemOps,
} from './delete-session.ts'
import {
  SESSION_ADDED_EVENT,
  deleteMigrated,
  listMigrated,
  restoreMigrated,
  type MigratedPorts,
} from './migrated.ts'

/**
 * 插件配置 schema 的转出口：loader 只从包入口读 `plugin.Config`。
 *
 * Schemastery 是本包唯一的运行时 `@deepseek-ai/*` 依赖，由构建内联（见
 * `build.mjs` 的 external 只有 `node:*`），因此产物在 profile 侧仍是自包含的。
 */
export { Config }

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Harness-home 路径解析器，由 app-boot 行提供。声明在本地是因为本包不依赖
     * `@deepseek-ai/dsh-app-boot`（对它的 type-only import 在这里解析不到）；形状与上游
     * 声明一致，因此两者并入同一 program 时会自动合并。
     */
    dshHomePath?: (...segments: string[]) => string
  }
}

/** loader 诊断与 bundle 行 id 使用的 Cordis 插件名。 */
export const name = 'web-ux'

/** 本行激活所需的服务。 */
export const inject = ['workspaceRegistry', 'sessionPersistence', 'dshHomePath']

/** 宿主解析不出 harness home 时的失败文案。 */
const NO_HOME_MESSAGE = 'the host exposes no harness-home path resolver, so stored session files cannot be located'

/**
 * 在存在宿主 Connection 的地方注册通道。软挂载：headless / 非 web profile 根本不会执行
 * 回调，工作区注册表不受影响。
 *
 * `webServer` 必须在依赖列表里，回调才会等到路由表就绪后再跑——这条不变。
 *
 * 挂载必须经 {@link callerConnectionOf} 而不能直接在 `ctx.root.get('connection')` 的
 * 读数上 `.rpc.handle`：cordis 4.1.0 起，服务读数是一层 traceable 视图，其 `rpc` getter
 * 把注册 effect 绑到 `this.ctx`——而 `this` 是**定义点切片**的 shadow ctx（connection
 * 服务创建时的 fiber），它从不注入 `webServer`，注册当场以
 * `cannot get property "webServer" without inject` 死掉，路由进不了路由表，之后每个请求
 * 都落到静态 SPA 兜底变成 HTTP 405。（0.2.1-rc.5 及更早的 cordis 4.0.5 下 `this.ctx`
 * 返回读取处的 ctx，旧写法只是恰好正确。）helper 解包原始服务实例并把 `ctx` 重定向到
 * 本行 fiber，注册因此落在注入了 `webServer` 的本行 fiber 上——完整的推理链见
 * {@link callerConnectionOf}。
 *
 * @param ctx - 本行挂载的宿主上下文。
 * @param config - 插件配置（可省略；缺省归档根见 `./config.ts`）。
 */
export function apply(ctx: Context, config?: WebUxConfig): void {
  ctx.inject(['connection', 'webServer'], (connectionCtx) => {
    const connection = connectionCtx.root.get('connection')
    if (connection === undefined) {
      ctx.logger.warn('web-ux: connection resolved without the service; the session-management channel is not mounted')
      return
    }
    const dispose = callerConnectionOf(connectionCtx, connection).rpc.handle(CHANNEL, createDispatcher(ctx, config))
    return () => { void dispose() }
  })
}

/**
 * 把宿主 Connection 包成「通道注册归属于调用方 fiber」的只读视图再挂载，正如
 * `dsh-client-connection` 自己声明的契约（channel registrations belong to the caller
 * fiber）。
 *
 * 为什么需要这层视图：cordis 4 的每个属性访问与 `get()` 都返回服务的 traceable 视图，
 * 而该视图上的 `rpc` getter 把注册绑到 `this.ctx`——cordis 4.1.0 起 `this.ctx` 携带的
 * 是**定义点切片**（connection 服务创建时的 fiber，经 `createShadow` 传入），那个 fiber
 * 从不注入 `webServer`。直接 `connection.rpc.handle(...)` 时，`get rpc()` 里的
 * `const owner = this.ctx` 解析 `webServer` 同步抛 `cannot get property "webServer"
 * without inject`，通道未挂载，之后每个浏览器请求都落到静态 SPA 兜底（HTTP 405）。
 * 0.2.1-rc.5 及更早（cordis 4.0.5）下 `this.ctx` 返回读取处的 ctx，旧写法只是恰好
 * 正确——所以修复是结构性的，不做版本号分支。
 *
 * 做法：经 cordis 的 `symbols.original`（`Symbol.for('cordis.original')`，4.0.5 与
 * 4.1.0 都有；`Symbol.for` 全局注册表保证本包内联副本与宿主那份 cordis 共享同一
 * symbol）解包原始服务实例，再包一层只读 Proxy：仅把 `ctx` 属性重定向为**本行注入
 * 回调的 fiber ctx**，其余属性全部原样转发。`get rpc()` 以 receiver 为 `this` 执行，
 * 于是注册 effect 落在注入了 `webServer` 的本行 fiber 上；路由运行期的 `this.admit`
 * 闭包仍解析到原始实例，Proxy 从不改动它。
 * @param ctx - 挂载所在 fiber 的上下文（本行注入回调的 ctx）。
 * @param connection - 从任意上下文读出的 Connection 服务。
 * @returns 只用于挂载通道的只读视图；不要长期持有。
 */
function callerConnectionOf(ctx: Context, connection: HostConnectionHandle): HostConnectionHandle {
  const unwrapped = (connection as unknown as { readonly [symbols.original]?: HostConnectionHandle })[symbols.original]
  const raw = unwrapped ?? connection
  return new Proxy(raw, {
    get(target, property, receiver) {
      if (property === 'ctx') return ctx
      return Reflect.get(target, property, receiver)
    },
  })
}

/**
 * 为一份宿主上下文构建通道 handler。
 *
 * handler 承载整条线上边界：请求先由 {@link parseRequest} 把端点名与请求体一起校验成
 * `WebUxRequest` 判别联合（请求来自浏览器），端口再从上游公开面装配，所有结论都映射到
 * `ConnectionRpcResult` 信封——业务拒绝保留稳定码（含 `archive-unavailable`：这是纯流程层
 * 的映射结果，本层不得吞掉或改码），未预期抛出变成 `internal`。
 *
 * 七个端点各占 `switch` 的一个分支：单会话两个与批量两个按 `body.mode` 分派到删除或迁移
 * （`archive` 需要归档根），已迁移三个直接交给 `./migrated.ts` 的流程。模式没有隐式默认
 * 值，缺失在 parser 层已按 `bad-request` 拒绝；端点与请求体在类型上绑定，分支内不需要
 * 再断言。
 *
 * 导出供测试：dispatcher 不需要活的 Connection 就能驱动。
 * @param ctx - 端口所需服务所在的宿主上下文。
 * @param config - 插件配置（可省略）。
 * @returns `connection.rpc.handle` 为 `CHANNEL` 注册的 handler。
 */
export function createDispatcher(
  ctx: Context,
  config?: WebUxConfig,
): (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<ConnectionRpcResult<unknown>> {
  return async (endpoint, payload) => {
    const parsed = parseRequest(endpoint, payload)
    if (!parsed.ok) return failure('bad-request', parsed.message)
    const request = parsed.value
    try {
      const ports = createPorts(ctx, config)
      if (ports === undefined) return failure('internal', NO_HOME_MESSAGE)
      switch (request.endpoint) {
        case PREVIEW_ENDPOINT: {
          // 归档根与 mode 无关：两种模式下预览都回声宿主解析后的真实去向。
          const result = await previewDelete(ports, request.body.sessionId, ports.archiveRoot)
          return result.ok ? { ok: true, value: result.preview } : failure(result.code, result.message)
        }
        case DELETE_ENDPOINT: {
          const result = request.body.mode === 'archive'
            ? await archiveSession(ports, request.body.sessionId, ports.archiveRoot)
            : await deleteSession(ports, request.body.sessionId)
          return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message)
        }
        case PREVIEW_BATCH_ENDPOINT:
          // 批量预览永不因个别目标失效而整单失败：软失败清单随结果返回。
          return { ok: true, value: await previewDeleteBatch(ports, request.body.sessionIds, ports.archiveRoot) }
        case DELETE_BATCH_ENDPOINT: {
          const result = request.body.mode === 'archive'
            ? await archiveSessionBatch(ports, request.body.sessionIds, ports.archiveRoot)
            : await deleteSessionBatch(ports, request.body.sessionIds)
          return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message)
        }
        case LIST_MIGRATED_ENDPOINT: {
          const result = await listMigrated(ports)
          return result.ok ? { ok: true, value: result.listing } : failure(result.code, result.message)
        }
        case DELETE_MIGRATED_ENDPOINT: {
          const result = await deleteMigrated(ports, request.body.entries)
          return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message)
        }
        case RESTORE_MIGRATED_ENDPOINT: {
          const result = await restoreMigrated(ports, request.body.entries)
          return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message)
        }
        default:
          // parseRequest 已把端点限制在上面七个里；这里只是运行期兜底。
          return failure('bad-request', `unknown endpoint "${endpoint}"`)
      }
    } catch (error: unknown) {
      ctx.logger.warn('web-ux: a session-management endpoint failed unexpectedly', error)
      return failure('internal', error instanceof Error ? error.message : String(error))
    }
  }
}

/**
 * `node:fs/promises` 绑定到结构化 {@link FileSystemOps} 端口。单一共享适配器：它不持有
 * 状态，永远解析到同一个模块。
 *
 * `lstat` 显式投影 `mtimeMs`：删除域只用 `size`，迁移域的列表把目录 mtime 当作条目的
 * `updatedAt`（可选宽度信息，缺了按 0）。
 */
const nodeFileSystem: FileSystemOps = {
  readdir: async (path) => await readdir(path, { withFileTypes: true }),
  lstat: async (path) => {
    const stats = await lstat(path)
    return { size: stats.size, mtimeMs: stats.mtimeMs, isDirectory: () => stats.isDirectory() }
  },
  rm: async (path, options) => { await rm(path, { recursive: options.recursive, force: options.force }) },
  unlink: async (path) => { await unlink(path) },
  mkdir: async (path, options) => { await mkdir(path, { recursive: options.recursive }) },
  rename: async (from, to) => { await rename(from, to) },
  copyFile: async (from, to) => { await copyFile(from, to) },
}

/**
 * 单对象同时满足两个域（{@link DeletePorts} 与 {@link MigratedPorts}），端点各自取切片。
 *
 * 归档根与端口在**同一次装配**里解析并同行返回，调用方因此不必为了拿根再读一次 home
 * 解析器，也不会出现「预览说的是 A 路径、执行写到 B 路径」的漂移。
 */
interface HostPorts extends DeletePorts, MigratedPorts {
  /** 本次请求解析后的归档根（绝对路径；缺省 `homePath('archive','sessions')`，或配置值）。 */
  readonly archiveRoot: string
}

/**
 * 在上游公开面上装配处置端口（两个域共用一份装配）。
 *
 * 每个端口都是对上游的一次调用：会话头来自 `ctx.sessionPersistence.list()`
 * （`listStoredHeaders()` 是上游私有方法），存活判定读内存里的 `sessions` store（显式
 * 兄弟查找，因为属性访问会要求本行声明一个它并未注入的 `sessions` 依赖），registry 清理
 * 就是三个幂等的 registry 操作。归档根在这里经 {@link resolveArchiveRoot} 归一：home
 * 解析器跟随 `$DSH_HOME`，`~/` 展开用 `node:os` 的 `homedir()`，坏配置只走宿主日志告警
 * 一条（与既有日志写法一致），绝不抛错。
 *
 * 迁移域新增的四个端口全部软失败：工作区列表抛错由流程捕获（恢复时全部按「未分组」），
 * 挂回 / 归档集合的拒绝原样抛出（流程记 warning，会话仍已搬回），广播读一次真实 header
 * 列表、只对命中的 id 发事件（未命中只告警，绝不伪造一个持久化里不存在的 id）。
 *
 * 返回对象保持「活」：每次访问都重新读服务，重新装载的行永远不会被钉在过期实例上。
 *
 * @param ctx - 宿主上下文。
 * @param config - 插件配置（可省略）。
 * @returns 端口，或 `undefined`（缺 harness-home 解析器时；文件操作绝不能跑在猜出来的
 *   路径上）。
 */
function createPorts(ctx: Context, config: WebUxConfig | undefined): HostPorts | undefined {
  const homePath = ctx.dshHomePath
  if (homePath === undefined) {
    ctx.logger.warn('web-ux: dshHomePath is unavailable; the session-management endpoints answer internal')
    return undefined
  }
  const archiveRoot = resolveArchiveRoot(config?.archiveRoot, {
    homePath,
    homedir: homedir(),
    warn: (message) => { ctx.logger.warn(message) },
  })
  const files = createSessionFiles({ homePath, fs: nodeFileSystem })
  // 事件名属于上游 Remote 事件选型，不属于 `dsh-session` / `dsh-workspace` 的声明合并，
  // 所以广播保持本地结构化调用：宿主不再转发时，代价只是浏览器需要手动刷新。
  const emitter = ctx as unknown as { emit(event: string, ...args: unknown[]): void }
  return {
    archiveRoot,
    homePath,
    fs: nodeFileSystem,
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
    // 归档根可用性由流程层在写动作之前判定：这里让 `prepareArchive` 的失败原样抛出，
    // `archiveSession` 才会把它映射成 `archive-unavailable`。
    prepareArchive: async (root) => { await files.prepareArchive(root) },
    archiveFiles: async (sessionId, root) => await files.archive(sessionId, root),
    emitRemoved: (sessionId) => {
      try {
        emitter.emit(SESSION_REMOVED_EVENT, sessionId)
      } catch (error: unknown) {
        ctx.logger.warn('web-ux: broadcasting the session-removed event failed', error)
      }
    },
    listWorkspaces: () => ctx.workspaceRegistry.list().map((workspace) => ({
      workspaceId: workspace.id,
      path: workspace.path,
    })),
    attachToWorkspace: async (workspaceId, sessionId) => {
      // 匹配不到工作区是流程层的事（那里会记「未分组」）；走到这里说明匹配到的工作区
      // 已在两步之间消失或拒绝挂回——直接抛，由流程降级成一条 warning。
      const workspace = ctx.workspaceRegistry.get(workspaceId as WorkspaceId)
      if (workspace === undefined) throw new Error(`workspace "${workspaceId}" is not registered`)
      await workspace.attachSession(sessionId as SessionId)
    },
    readdToArchiveSet: async (sessionId) => {
      await ctx.workspaceRegistry.archiveSession(sessionId as SessionId)
    },
    announceRestored: async (entries) => {
      // 一次读全量 header：只广播持久化里真实存在的 id（D6 真实 header 优先），字段取自
      // header，`updatedAt` 取自归档目录的 mtime。
      const headers = new Map(
        (await ctx.sessionPersistence.list()).map((snapshot) => [snapshot.header.id, snapshot.header]),
      )
      for (const entry of entries) {
        const header = headers.get(entry.sessionId as SessionId)
        if (header === undefined) {
          ctx.logger.warn(`web-ux: the restored session "${entry.sessionId}" is missing from session persistence; the session-added event was skipped`)
          continue
        }
        try {
          emitter.emit(SESSION_ADDED_EVENT, {
            sessionId: entry.sessionId,
            updatedAt: entry.updatedAt,
            running: false,
            blank: false,
            agentAvailable: false,
            cwd: header.cwd,
            parentSessionId: header.parentSession,
            origin: header.origin,
          })
        } catch (error: unknown) {
          ctx.logger.warn('web-ux: broadcasting the session-added event failed', error)
        }
      }
    },
    warn: (message, error) => { ctx.logger.warn(message, error) },
  }
}

/** 把一个稳定失败码包进通道的结果信封。 */
function failure(code: FailureCode, message: string): ConnectionRpcResult<unknown> {
  return { ok: false, error: { code, message, details: {} } }
}
