/**
 * 「删除已归档会话」的宿主侧纯流程：删除集合收集、前置校验、预览统计、执行，
 * 以及会话文件的操作工厂。
 *
 * 这一层不认识 cordis，也不 import 任何 `@deepseek-ai/*`：它只依赖注入进来的
 * {@link DeletePorts} 与 {@link FileSystemOps}，所以能用 fake 端口在纯 node 环境
 * 里完整驱动。把上游服务接到这些端口上是宿主实载体（`src/index.ts`）的职责。
 *
 * 语义（spec: dsh-web-ux-session-delete）：
 *
 * - 级联只沿 `origin === 'subagent'` 的 `parentSession` 链做闭包；fork（有父会话
 *   引用但来源不是 subagent）永不级联。
 * - 预览与执行各自独立校验（不存在 / 未归档 / 集合内任一成员仍 live），执行端
 *   不信任预览阶段的结论。
 * - 执行顺序固定为「registry 清理（幂等）→ 文件删除（失败只记 warnings）→ 逐 id
 *   广播 {@link SESSION_REMOVED_EVENT}」；文件失败不回滚、不中止，共享附件存储
 *   一律不清理。
 *
 * @module dsh-plugin-web-ux/delete-session
 */

import { join } from 'node:path'
import type { DeleteOutcome, DeletePreview, FailureCode } from './contract.ts'

/** 宿主广播的会话移除事件名；client 的会话列表模型据此即时删行（上游 Remote 事件）。 */
export const SESSION_REMOVED_EVENT = 'api-session/removed'

/** 流程需要的最小会话头：会话 id 与 subagent 级联线索（`SessionHeader` 的投影）。 */
export interface StoredSessionHeader {
  /** 会话 id。 */
  readonly id: string
  /** 该会话是否为某个会话的 subagent 子会话。 */
  readonly origin?: 'subagent'
  /** fork / subagent 引用的父会话 id。 */
  readonly parentSession?: string
  /** 会话创建时的工作目录（本流程不使用，保留给调用方与诊断）。 */
  readonly cwd?: string
}

/** 宿主侧的全部外部动作：流程只通过这组端口触碰上游与磁盘。 */
export interface DeletePorts {
  /** 当前持久化的会话头清单（`ctx.sessionPersistence.list()` 的投影）。 */
  listStoredHeaders(): Promise<readonly StoredSessionHeader[]>
  /** 宿主内存中该会话是否仍存活（live 会话拒绝删除）。 */
  isLive(sessionId: string): boolean
  /** 该会话是否在归档集合里。 */
  isArchived(sessionId: string): boolean
  /** 从工作区记录中移除引用：unarchive + unpin + detach，三者都幂等。 */
  cleanupRegistry(sessionId: string): Promise<void>
  /** 统计该会话待释放的字节数；失败按 0。 */
  measureFiles(sessionId: string): Promise<number>
  /** 删除该会话的磁盘痕迹，返回失败项 `<路径>: <原因>`；不抛错。 */
  removeFiles(sessionId: string): Promise<readonly string[]>
  /** 广播一次会话移除事件。 */
  emitRemoved(sessionId: string): void
  /** 记录一条宿主告警。 */
  warn(message: string, error?: unknown): void
}

/** 一次删除计划的结论：可执行的 id 列表，或稳定拒绝码 + 可读原因。 */
export type DeletePlan = { readonly ok: true; readonly ids: readonly string[] } | { readonly ok: false; readonly code: FailureCode; readonly message: string }

/** 预览结论。 */
export type PreviewResult = { readonly ok: true; readonly preview: DeletePreview } | { readonly ok: false; readonly code: FailureCode; readonly message: string }

/** 执行结论。 */
export type DeleteResult = { readonly ok: true; readonly outcome: DeleteOutcome } | { readonly ok: false; readonly code: FailureCode; readonly message: string }

/**
 * 收集删除集合：目标会话，加上沿 `origin === 'subagent'` 的 `parentSession` 链
 * 反复迭代到不动点的全部后代。
 *
 * fork 的 `parentSession` 即使命中集合内成员也不级联（来源不是 subagent）；不在
 * 集合内的会话（例如另一个 fork 分支）永不被牵入。结果顺序为发现顺序：目标在
 * 首位，后代按 headers 列表顺序逐层加入，因此父会话总在自己的子会话之前。
 *
 * @param target - 用户点选的目标会话 id。
 * @param headers - 当前持久化的会话头清单。
 * @returns 删除集合，目标在首位。
 */
export function collectDeleteSet(target: string, headers: readonly StoredSessionHeader[]): string[] {
  const ids: string[] = [target]
  const included = new Set<string>(ids)
  for (let grew = true; grew;) {
    grew = false
    for (const header of headers) {
      if (header.origin !== 'subagent' || included.has(header.id)) continue
      const parent = header.parentSession
      if (parent === undefined || !included.has(parent)) continue
      included.add(header.id)
      ids.push(header.id)
      grew = true
    }
  }
  return ids
}

/**
 * 校验一次删除请求并算出删除集合：目标必须存在于持久化会话头里、处于归档状态，
 * 且删除集合内没有任何成员仍存活于宿主内存。
 *
 * @param target - 目标会话 id。
 * @param ports - 校验所需的最小端口（读取 / 归档判定 / 存活判定）。
 * @returns 可执行的 id 列表，或稳定拒绝码。
 */
export async function planDelete(
  target: string,
  ports: Pick<DeletePorts, 'listStoredHeaders' | 'isLive' | 'isArchived'>,
): Promise<DeletePlan> {
  const headers = await ports.listStoredHeaders()
  if (!headers.some((header) => header.id === target)) {
    return { ok: false, code: 'not-found', message: `session "${target}" is not in session persistence` }
  }
  if (!ports.isArchived(target)) {
    return { ok: false, code: 'not-archived', message: `session "${target}" is not archived` }
  }
  const ids = collectDeleteSet(target, headers)
  for (const id of ids) {
    if (ports.isLive(id)) {
      return { ok: false, code: 'session-live', message: `session "${id}" is still live on the host` }
    }
  }
  return { ok: true, ids }
}

/**
 * 预览一次删除：执行与 {@link deleteSession} 完全相同的前置校验（预览不是授权，
 * 只是展示），再统计删除集合的规模与待释放体积。
 *
 * `measureFiles` 抛错按 0 计并告警：体积只是给用户的参考数字，不该让预览失败。
 *
 * @param ports - 全部端口。
 * @param sessionId - 目标会话 id。
 * @returns 预览结果，或与执行同款的拒绝码。
 */
export async function previewDelete(ports: DeletePorts, sessionId: string): Promise<PreviewResult> {
  const plan = await planDelete(sessionId, ports)
  if (!plan.ok) return plan
  let logBytes = 0
  for (const id of plan.ids) {
    try {
      logBytes += await ports.measureFiles(id)
    } catch (error: unknown) {
      ports.warn(`web-ux: measuring the stored files of session "${id}" failed`, error)
    }
  }
  return {
    ok: true,
    preview: { sessionCount: plan.ids.length, descendantCount: plan.ids.length - 1, logBytes },
  }
}

/**
 * 执行一次删除。进入执行前**重新**校验（预览结论不携带授权语义），随后对每个
 * id 依次：
 *
 * 1. `cleanupRegistry`——失败只记 warning（`registry: <id>: <原因>`）并继续；
 * 2. `removeFiles`——返回的失败项原样并入 warnings；
 * 3. `emitRemoved`——抛错只告警，不影响结果。
 *
 * 任何文件失败都不回滚：registry 引用已经清掉，重启后侧栏不再出现被删会话，残留
 * 的日志文件由 warnings 逐条点名，可手工清理。
 *
 * @param ports - 全部端口。
 * @param sessionId - 目标会话 id。
 * @returns 执行结果（`removed` 为完整删除集合）或稳定拒绝码。
 */
export async function deleteSession(ports: DeletePorts, sessionId: string): Promise<DeleteResult> {
  const plan = await planDelete(sessionId, ports)
  if (!plan.ok) return plan
  const warnings: string[] = []
  for (const id of plan.ids) {
    try {
      await ports.cleanupRegistry(id)
    } catch (error: unknown) {
      warnings.push(`registry: ${id}: ${reasonOf(error)}`)
      ports.warn(`web-ux: removing session "${id}" from the workspace registry failed`, error)
    }
    try {
      warnings.push(...await ports.removeFiles(id))
    } catch (error: unknown) {
      warnings.push(`files: ${id}: ${reasonOf(error)}`)
      ports.warn(`web-ux: deleting the stored files of session "${id}" failed`, error)
    }
    try {
      ports.emitRemoved(id)
    } catch (error: unknown) {
      ports.warn(`web-ux: broadcasting the removal of session "${id}" failed`, error)
    }
  }
  return { ok: true, outcome: { removed: plan.ids, warnings } }
}

/** 会话目录里的一个条目：名字与「是否目录」判定（`node:fs` Dirent 的最小投影）。 */
export interface DirectoryEntry {
  /** 条目名（不含路径分隔符）。 */
  readonly name: string
  /** 该条目是否为目录。 */
  isDirectory(): boolean
  /**
   * 该条目是否为符号链接；端口可省（`node:fs` Dirent 提供，内存 fake 可省略）。
   * @returns 是符号链接时为 true。
   */
  isSymbolicLink?(): boolean
}

/** 文件操作端口：工厂只用这四个原语，因此测试可注入内存实现。 */
export interface FileSystemOps {
  /** 读目录；路径缺失（ENOENT）由调用方处理。 */
  readdir(path: string): Promise<readonly DirectoryEntry[]>
  /** 取路径自身的元信息；不跟随符号链接。 */
  lstat(path: string): Promise<{ readonly size: number; isDirectory(): boolean }>
  /** 递归删除；`force` 让缺失路径成为无操作。 */
  rm(path: string, options: { readonly recursive: boolean; readonly force: boolean }): Promise<void>
  /** 删除单个文件。 */
  unlink(path: string): Promise<void>
}

/** 文件操作工厂的宿主上下文：拼接路径的函数与文件系统端口。 */
export interface SessionFileLayout {
  /** 把片段拼到 harness home 上（宿主提供 `ctx.dshHomePath`）。 */
  readonly homePath: (...segments: string[]) => string
  /** 文件系统端口。 */
  readonly fs: FileSystemOps
}

/** 会话 id 的长度上限，与 contract 的请求校验保持一致（同时也是多数文件系统的单段上限）。 */
const SESSION_ID_MAX = 255

/** 控制字符（含 NUL）不是合法路径片段。 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/**
 * 判断一个 id 能否安全地当作单个路径片段。`sessionId` 已经过 contract 的边界
 * 校验，这里再防御一次：任何分隔符、控制字符或 `.` / `..` 都意味着请求想逃出会话目录。
 * @param sessionId - 待判定的会话 id。
 * @returns 可作为单一目录名使用时为 true。
 */
function isSafeSessionId(sessionId: string): boolean {
  return sessionId !== ''
    && sessionId.length <= SESSION_ID_MAX
    && sessionId !== '.'
    && sessionId !== '..'
    && !sessionId.includes('/')
    && !sessionId.includes('\\')
    && !CONTROL_CHARACTERS.test(sessionId)
}

/** 路径缺失（ENOENT）是正常状态而不是失败。 */
function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { readonly code?: unknown }).code === 'ENOENT'
}

/** 把任意抛出物压成一句可读原因。 */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 依据磁盘布局定位并操作一个会话的文件：
 *
 * - 会话目录：`<home>/sessions/<cwd 转义>--/<sessionId>/`。会话 id 全局唯一但不知
 *   道它属于哪个项目目录，因此扫描 `sessions/` 的每个子目录；缺失路径静默跳过。
 * - 投影缓存：`<home>/storages/session_projcache/sessions/<sessionId>.json`，纯缓存，
 *   缺失或删除失败都无害。
 *
 * `remove` 不抛错：所有失败都作为 `<路径>: <原因>` 返回，由调用方并入 warnings。
 * `measure` 递归求和（符号链接按自身大小计，不跟随），任何读取失败按 0。
 *
 * @param layout - 宿主路径解析与文件系统端口。
 * @returns 该会话的 `measure` / `remove` 两个动作。
 */
export function createSessionFiles(layout: SessionFileLayout): {
  measure(sessionId: string): Promise<number>
  remove(sessionId: string): Promise<readonly string[]>
} {
  const { fs } = layout

  /** 投影缓存文件的绝对路径。 */
  const projCachePath = (sessionId: string): string =>
    layout.homePath('storages', 'session_projcache', 'sessions', `${sessionId}.json`)

  /**
   * 在 `sessions/` 的每个项目目录下查找该会话的日志目录。
   * @param sessionId - 已校验安全的会话 id。
   * @returns 存在的绝对路径，以及扫描过程中的失败项。
   */
  async function locate(sessionId: string): Promise<{ readonly paths: readonly string[]; readonly warnings: readonly string[] }> {
    const warnings: string[] = []
    const root = layout.homePath('sessions')
    let entries: readonly DirectoryEntry[]
    try {
      entries = await fs.readdir(root)
    } catch (error: unknown) {
      if (!isMissing(error)) warnings.push(`${root}: ${reasonOf(error)}`)
      return { paths: [], warnings }
    }
    const paths: string[] = []
    for (const entry of entries) {
      // 符号链接项目目录不跟随（`isDirectory()` 对链接为 false）：这里显式记一条
      // warning，否则「没找到日志目录」会被误读成「已经删干净」。
      if (entry.isSymbolicLink?.() === true) {
        warnings.push(`${layout.homePath('sessions', entry.name)}: symbolic-linked project directory was not followed`)
        continue
      }
      if (!entry.isDirectory()) continue
      const candidate = layout.homePath('sessions', entry.name, sessionId)
      try {
        await fs.lstat(candidate)
      } catch (error: unknown) {
        if (!isMissing(error)) warnings.push(`${candidate}: ${reasonOf(error)}`)
        continue
      }
      paths.push(candidate)
    }
    return { paths, warnings }
  }

  /** 递归统计一个路径的字节数；读不到按 0，符号链接按自身大小计。 */
  async function sizeOf(path: string): Promise<number> {
    let stats: { readonly size: number; isDirectory(): boolean }
    try {
      stats = await fs.lstat(path)
    } catch {
      return 0
    }
    let total = stats.size
    if (!stats.isDirectory()) return total
    let entries: readonly DirectoryEntry[]
    try {
      entries = await fs.readdir(path)
    } catch {
      return total
    }
    for (const entry of entries) total += await sizeOf(join(path, entry.name))
    return total
  }

  return {
    /** 删除集合里一个会话的磁盘痕迹，返回失败项。 */
    async remove(sessionId: string): Promise<readonly string[]> {
      if (!isSafeSessionId(sessionId)) {
        return [`session id ${JSON.stringify(sessionId)} is not a safe path segment; nothing was deleted`]
      }
      const located = await locate(sessionId)
      const warnings = [...located.warnings]
      for (const path of located.paths) {
        try {
          await fs.rm(path, { recursive: true, force: true })
        } catch (error: unknown) {
          warnings.push(`${path}: ${reasonOf(error)}`)
        }
      }
      const cachePath = projCachePath(sessionId)
      try {
        await fs.unlink(cachePath)
      } catch (error: unknown) {
        if (!isMissing(error)) warnings.push(`${cachePath}: ${reasonOf(error)}`)
      }
      return warnings
    },

    /** 统计一个会话待释放的字节数（日志目录树 + 投影缓存）。 */
    async measure(sessionId: string): Promise<number> {
      if (!isSafeSessionId(sessionId)) return 0
      const located = await locate(sessionId)
      let total = 0
      for (const path of located.paths) total += await sizeOf(path)
      total += await sizeOf(projCachePath(sessionId))
      return total
    },
  }
}
