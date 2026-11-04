/**
 * dsh-plugin-web-ux —— 宿主半的实载体：浏览器侧「处置已归档会话（删除 / 归档）」入口
 * 背后的 Connection RPC 通道。
 *
 * 浏览器半（`exports "./client"`）负责侧栏菜单项与确认对话框；真正的工作在这里，因为
 * 它需要工作区注册表、会话持久化与磁盘上的 harness home。通道（`CHANNEL`，见
 * `./contract.ts`）服务两个端点：`preview-delete` 校验并统计处置集合（并原样回声宿主
 * 解析后的归档根），`delete-session` 重新校验后按请求体里的 `mode` 二选一执行——
 * `delete` 物理删除、`archive` 把日志目录迁移到归档根——再为每个受影响会话广播移除事件。
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
 * `connection` 解析不到只告警一条，缺 harness-home 解析器时两个端点都退化为 `internal`
 * 而不是猜一个路径。
 *
 * 运行时 import 只有 `node:*`、本包自己的模块，以及配置模块的 `Config`（原生
 * Schemastery 图，由 esbuild 内联进产物，宿主运行时不为它解析任何 `@deepseek-ai/*`）；
 * 其余 dsh import 一律 type-only，因此宿主产物保持自包含。
 * @module dsh-plugin-web-ux
 */

import { copyFile, lstat, mkdir, readdir, rename, rm, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// 类型面：加载 `sessionPersistence` 的上下文服务声明合并。
import type {} from '@deepseek-ai/dsh-session-persistence'
// 类型面：加载 `workspaceRegistry` 的上下文服务声明合并。
import type {} from '@deepseek-ai/dsh-workspace'
import { Config, resolveArchiveRoot, type WebUxConfig } from './config.ts'
import {
  CHANNEL,
  DELETE_ENDPOINT,
  PREVIEW_ENDPOINT,
  parseDeleteRequest,
  type FailureCode,
} from './contract.ts'
import {
  SESSION_REMOVED_EVENT,
  archiveSession,
  createSessionFiles,
  deleteSession,
  previewDelete,
  type DeletePorts,
  type FileSystemOps,
} from './delete-session.ts'

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
 * `webServer` 必须在依赖列表里，回调才会等到路由表就绪后再跑；服务又必须从 `ctx.root`
 * 读：`connection.rpc.handle` 把 `webServer` 解析成「读出该服务的那份上下文」的属性，而
 * cordis 在插件 fiber 上做属性解析时只能看见该 fiber 自己注入的服务——兄弟行的
 * `webServer` 不可见，注册会以 `cannot get property "webServer" without inject` 死掉，
 * 之后每个请求都落到静态 SPA 兜底变成 HTTP 405。从 root 读（上游 connection 测试的
 * 做法）则解析到共享服务表。
 *
 * @param ctx - 本行挂载的宿主上下文。
 * @param config - 插件配置（可省略；缺省归档根见 `./config.ts`）。
 */
export function apply(ctx: Context, config?: WebUxConfig): void {
  ctx.inject(['connection', 'webServer'], (connectionCtx) => {
    const connection = connectionCtx.root.get('connection')
    if (connection === undefined) {
      ctx.logger.warn('web-ux: connection resolved without the service; the session-delete channel is not mounted')
      return
    }
    const dispose = connection.rpc.handle(CHANNEL, createDispatcher(ctx, config))
    return () => { void dispose() }
  })
}

/**
 * 为一份宿主上下文构建通道 handler。
 *
 * handler 承载整条线上边界：请求体先校验（它来自浏览器），端口再从上游公开面装配，所有
 * 结论都映射到 `ConnectionRpcResult` 信封——业务拒绝保留稳定码（含
 * `archive-unavailable`：这是纯流程层的映射结果，本层不得吞掉或改码），未预期抛出变成
 * `internal`。执行端点按 `parsed.value.mode` 分派：`archive` 走
 * {@link archiveSession}（需要归档根），`delete` 走 {@link deleteSession}。模式没有隐式
 * 默认值，缺失在 parser 层已按 `bad-request` 拒绝。
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
    const parsed = parseDeleteRequest(endpoint, payload)
    if (!parsed.ok) return failure('bad-request', parsed.message)
    try {
      const ports = createPorts(ctx, config)
      if (ports === undefined) return failure('internal', NO_HOME_MESSAGE)
      if (endpoint === PREVIEW_ENDPOINT) {
        // 归档根与 mode 无关：两种模式下预览都回声宿主解析后的真实去向。
        const result = await previewDelete(ports, parsed.value.sessionId, ports.archiveRoot)
        return result.ok ? { ok: true, value: result.preview } : failure(result.code, result.message)
      }
      if (endpoint === DELETE_ENDPOINT) {
        const result = parsed.value.mode === 'archive'
          ? await archiveSession(ports, parsed.value.sessionId, ports.archiveRoot)
          : await deleteSession(ports, parsed.value.sessionId)
        return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message)
      }
      // parseDeleteRequest 已把端点限制在上面两个里。
      return failure('bad-request', `unknown endpoint "${endpoint}"`)
    } catch (error: unknown) {
      ctx.logger.warn('web-ux: the session-delete endpoint failed unexpectedly', error)
      return failure('internal', error instanceof Error ? error.message : String(error))
    }
  }
}

/**
 * `node:fs/promises` 绑定到结构化 {@link FileSystemOps} 端口。单一共享适配器：它不持有
 * 状态，永远解析到同一个模块。
 */
const nodeFileSystem: FileSystemOps = {
  readdir: async (path) => await readdir(path, { withFileTypes: true }),
  lstat: async (path) => await lstat(path),
  rm: async (path, options) => { await rm(path, { recursive: options.recursive, force: options.force }) },
  unlink: async (path) => { await unlink(path) },
  mkdir: async (path, options) => { await mkdir(path, { recursive: options.recursive }) },
  rename: async (from, to) => { await rename(from, to) },
  copyFile: async (from, to) => { await copyFile(from, to) },
}

/**
 * 在 {@link DeletePorts} 之上携带本次请求解析后的归档根。
 *
 * 归档根与端口在**同一次装配**里解析并同行返回，调用方因此不必为了拿根再读一次 home
 * 解析器，也不会出现「预览说的是 A 路径、执行写到 B 路径」的漂移。
 */
interface HostPorts extends DeletePorts {
  /** 本次请求解析后的归档根（绝对路径；缺省 `homePath('archive','sessions')`，或配置值）。 */
  readonly archiveRoot: string
}

/**
 * 在上游公开面上装配处置端口。
 *
 * 每个端口都是对上游的一次调用：会话头来自 `ctx.sessionPersistence.list()`
 * （`listStoredHeaders()` 是上游私有方法），存活判定读内存里的 `sessions` store（显式
 * 兄弟查找，因为属性访问会要求本行声明一个它并未注入的 `sessions` 依赖），registry 清理
 * 就是三个幂等的 registry 操作。归档根在这里经 {@link resolveArchiveRoot} 归一：home
 * 解析器跟随 `$DSH_HOME`，`~/` 展开用 `node:os` 的 `homedir()`，坏配置只走宿主日志告警
 * 一条（与既有日志写法一致），绝不抛错。返回对象保持「活」：每次访问都重新读服务，重新
 * 装载的行永远不会被钉在过期实例上。
 *
 * @param ctx - 宿主上下文。
 * @param config - 插件配置（可省略）。
 * @returns 端口，或 `undefined`（缺 harness-home 解析器时；文件操作绝不能跑在猜出来的
 *   路径上）。
 */
function createPorts(ctx: Context, config: WebUxConfig | undefined): HostPorts | undefined {
  const homePath = ctx.dshHomePath
  if (homePath === undefined) {
    ctx.logger.warn('web-ux: dshHomePath is unavailable; the session-delete endpoints answer internal')
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
    warn: (message, error) => { ctx.logger.warn(message, error) },
  }
}

/** 把一个稳定失败码包进通道的结果信封。 */
function failure(code: FailureCode, message: string): ConnectionRpcResult<unknown> {
  return { ok: false, error: { code, message, details: {} } }
}
