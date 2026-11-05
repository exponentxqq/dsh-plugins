/**
 * 「处置已归档会话」的宿主侧纯流程：删除集合收集、前置校验、预览统计，以及
 * 物理删除与迁移归档两条执行路径，和会话文件的操作工厂。
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
 * - 批量是单会话语义的并集：逐目标独立校验、首错即止，任一目标被拒则整单拒绝且
 *   零副作用；预览永不因个别目标失效而失败（软失败清单），统计按并集口径。
 * - 删除与迁移共用同一条执行循环（{@link disposeAll}）：逐 id「registry 清理
 *   （幂等）→ 文件动作（失败只记 warnings）→ 广播 {@link SESSION_REMOVED_EVENT}」；
 *   文件失败不回滚、不中止，共享附件存储一律不清理。
 * - 迁移在**任何写动作之前**先准备归档根；根不可用返回 `archive-unavailable`，
 *   逐项迁移失败只进 warnings（数据留在源目录，警告点名源与目标）。
 *
 * @module dsh-plugin-web-ux/delete-session
 */

import { basename, dirname, isAbsolute, join } from 'node:path'
import { isFailureCode } from './contract.ts'
import type { DeleteBatchPreview, DeleteOutcome, DeletePreview, FailureCode, RejectedTarget } from './contract.ts'

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
  /** 建出归档根（递归）；失败抛错，由 {@link archiveSession} 映射为 `archive-unavailable`。 */
  prepareArchive(archiveRoot: string): Promise<void>
  /** 把该会话的日志目录移动到归档根下并删除投影缓存；返回失败项，不抛错。 */
  archiveFiles(sessionId: string, archiveRoot: string): Promise<readonly string[]>
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
 * 预览一次处置：执行与 {@link deleteSession} / {@link archiveSession} 完全相同的
 * 前置校验（预览不是授权，只是展示），再统计处置集合的规模与待释放体积，并把宿主
 * 解析后的归档根原样回声进结果。
 *
 * `measureFiles` 抛错按 0 计并告警：体积只是给用户的参考数字，不该让预览失败。
 *
 * @param ports - 全部端口。
 * @param sessionId - 目标会话 id。
 * @param archiveRoot - 宿主解析后的归档根；本流程不解析、不做 I/O，只回声给界面。
 * @returns 预览结果，或与执行同款的拒绝码。
 */
export async function previewDelete(ports: DeletePorts, sessionId: string, archiveRoot: string): Promise<PreviewResult> {
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
    preview: { sessionCount: plan.ids.length, descendantCount: plan.ids.length - 1, logBytes, archiveRoot },
  }
}

/**
 * 执行一次删除。进入执行前**重新**校验（预览结论不携带授权语义），随后交给
 * {@link disposeAll} 逐条「registry 清理 → 删除文件 → 广播移除」。
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
  return { ok: true, outcome: await disposeAll(ports, plan.ids, (id) => ports.removeFiles(id)) }
}

/**
 * 执行一次迁移归档。与删除同源的前置校验（同一套 not-found / not-archived /
 * session-live），随后在**任何写动作之前**确认归档根可用，最后交给
 * {@link disposeAll} 逐条「registry 清理 → 移动文件 → 广播移除」。
 *
 * 归档根不可用（非绝对路径，或递归建目录失败）返回 `archive-unavailable`：此时
 * registry 与磁盘都没有被改动过，界面可以引导用户修好配置后重试。逐项迁移失败
 * 不回滚（与删除同构），数据留在会话目录，warnings 点名源与目标。
 *
 * @param ports - 全部端口。
 * @param sessionId - 目标会话 id。
 * @param archiveRoot - 宿主解析后的归档根绝对路径。
 * @returns 执行结果（`removed` 为完整迁移集合）或稳定拒绝码。
 */
export async function archiveSession(ports: DeletePorts, sessionId: string, archiveRoot: string): Promise<DeleteResult> {
  const plan = await planDelete(sessionId, ports)
  if (!plan.ok) return plan
  if (!isAbsolute(archiveRoot)) {
    return { ok: false, code: 'archive-unavailable', message: `archive root "${archiveRoot}" is not an absolute path` }
  }
  try {
    await ports.prepareArchive(archiveRoot)
  } catch (error: unknown) {
    return { ok: false, code: 'archive-unavailable', message: `archive root "${archiveRoot}" is not usable: ${reasonOf(error)}` }
  }
  return { ok: true, outcome: await disposeAll(ports, plan.ids, (id) => ports.archiveFiles(id, archiveRoot)) }
}

/**
 * 收集多目标的处置并集：按输入顺序逐目标展开级联闭包，再按首见顺序合并去重。
 *
 * 重复目标只展开一次；同一条会话即使被两个目标的闭包同时命中，在并集里也只出现
 * 一次。目标自身总在自己的闭包首位，因此并集长度不小于去重后的目标数。
 *
 * @param targets - 用户勾选的目标会话 id，允许重复。
 * @param headers - 当前持久化的会话头清单（闭包是纯计算，一次读取即可）。
 * @returns 并集处置集合，首见顺序。
 */
export function collectDeleteSetMany(targets: readonly string[], headers: readonly StoredSessionHeader[]): string[] {
  const ids: string[] = []
  const included = new Set<string>()
  for (const target of targets) {
    for (const id of collectDeleteSet(target, headers)) {
      if (included.has(id)) continue
      included.add(id)
      ids.push(id)
    }
  }
  return ids
}

/** 一次批量处置计划的结论：通过校验的目标、并集处置集合与逐目标软失败清单。 */
export interface DeleteBatchPlan {
  /** 通过校验的目标（输入顺序、去重后）。 */
  readonly accepted: readonly string[]
  /** 并集处置集合（目标 + 级联后代，首见顺序）。 */
  readonly union: readonly string[]
  /** 软失败清单（预览用；执行端据此整单拒绝）。 */
  readonly rejected: readonly RejectedTarget[]
}

/**
 * 校验一批目标并算出并集处置集合：只读**一次** `listStoredHeaders`，随后逐目标独立
 * 判定「不存在 → 未归档 → 集合内任一成员仍 live」，首错即止（每个目标至多一条拒绝）。
 *
 * 被拒绝的目标**不做**级联展开，也不进入并集；通过校验的目标按输入顺序去重后进入
 * `accepted`，其闭包按首见顺序并入 `union`（见 {@link collectDeleteSetMany}）。
 * 所有判定都是纯计算与端口查询，不产生任何写操作——执行端的「整单拒绝」与预览
 * 统计因此共用同一份结论。
 *
 * @param targets - 用户勾选的目标会话 id，允许重复。
 * @param ports - 校验所需的最小端口（读取 / 归档判定 / 存活判定）。
 * @returns 计划结论；`rejected` 非空表示整单不可执行。
 */
export async function planDeleteBatch(
  targets: readonly string[],
  ports: Pick<DeletePorts, 'listStoredHeaders' | 'isLive' | 'isArchived'>,
): Promise<DeleteBatchPlan> {
  const headers = await ports.listStoredHeaders()
  const stored = new Set(headers.map((header) => header.id))
  const accepted: string[] = []
  const rejected: RejectedTarget[] = []
  for (const target of uniqueTargets(targets)) {
    if (!stored.has(target)) {
      rejected.push({ sessionId: target, code: 'not-found', message: `session "${target}" is not in session persistence` })
      continue
    }
    if (!ports.isArchived(target)) {
      rejected.push({ sessionId: target, code: 'not-archived', message: `session "${target}" is not archived` })
      continue
    }
    const live = collectDeleteSet(target, headers).find((id) => ports.isLive(id))
    if (live !== undefined) {
      rejected.push({ sessionId: target, code: 'session-live', message: `session "${live}" is still live on the host` })
      continue
    }
    accepted.push(target)
  }
  return { accepted, union: collectDeleteSetMany(accepted, headers), rejected }
}

/**
 * 预览一次批量处置：与执行端同源的校验，但**永不**因个别目标失效而整单失败（软失败
 * 清单随结果返回，界面照常展示其余目标的统计）。
 *
 * 统计口径：`targetCount` 为去重后的勾选数，`sessionCount` 为并集大小，
 * `descendantCount` 为并集与通过校验目标数之差，`logBytes` 对并集逐 id 累加（异常按
 * 0 计并告警，与单会话预览同款），`archiveRoot` 原样回声给界面。
 *
 * @param ports - 全部端口。
 * @param targets - 用户勾选的目标会话 id，允许重复。
 * @param archiveRoot - 宿主解析后的归档根；本流程不校验、不做 I/O，只回声给界面。
 * @returns 批量预览（`rejected` 可能非空）。
 */
export async function previewDeleteBatch(ports: DeletePorts, targets: readonly string[], archiveRoot: string): Promise<DeleteBatchPreview> {
  const plan = await planDeleteBatch(targets, ports)
  let logBytes = 0
  for (const id of plan.union) {
    try {
      logBytes += await ports.measureFiles(id)
    } catch (error: unknown) {
      ports.warn(`web-ux: measuring the stored files of session "${id}" failed`, error)
    }
  }
  return {
    targetCount: uniqueTargets(targets).length,
    sessionCount: plan.union.length,
    descendantCount: plan.union.length - plan.accepted.length,
    logBytes,
    archiveRoot,
    rejected: plan.rejected,
  }
}

/**
 * 批量执行（物理删除）：与 {@link deleteSession} 同一套校验与执行循环。
 *
 * 任一目标校验失败即整单拒绝——返回首个拒绝的稳定码与原因，**不写任何东西**；全部
 * 通过则按并集逐 id「registry 清理 → 删除文件 → 广播移除」，文件失败只进 warnings，
 * 不回滚、不中止。`removed` 是并集全量，而不是勾选目标本身。
 *
 * @param ports - 全部端口。
 * @param targets - 用户勾选的目标会话 id，允许重复。
 * @returns 执行结果或稳定拒绝码。
 */
export async function deleteSessionBatch(ports: DeletePorts, targets: readonly string[]): Promise<DeleteResult> {
  return disposeBatch(ports, targets, { mode: 'delete' })
}

/**
 * 批量执行（迁移归档）：与 {@link deleteSessionBatch} 同构，但在**任何写动作之前**
 * 先确认归档根可用（绝对路径 + `prepareArchive`）；不可用返回 `archive-unavailable`
 * 且零副作用。逐项迁移失败同样只进 warnings（数据留在源目录）。
 *
 * @param ports - 全部端口。
 * @param targets - 用户勾选的目标会话 id，允许重复。
 * @param archiveRoot - 宿主解析后的归档根绝对路径。
 * @returns 执行结果或稳定拒绝码。
 */
export async function archiveSessionBatch(ports: DeletePorts, targets: readonly string[], archiveRoot: string): Promise<DeleteResult> {
  return disposeBatch(ports, targets, { mode: 'archive', archiveRoot })
}

/** 批量执行的两个档位：物理删除，或迁移到归档根。 */
type BatchDisposal = { readonly mode: 'delete' } | { readonly mode: 'archive'; readonly archiveRoot: string }

/**
 * 批量执行的公共骨架（删除与迁移逐字同构）：
 *
 * 1. {@link planDeleteBatch}——`rejected` 非空即整单拒绝（返回首个拒绝的码与原因；
 *    此前的 `listStoredHeaders` 是唯一一次 I/O，registry 与磁盘都没有被改动）；
 * 2. `archive` 档在任何写动作之前先 `isAbsolute` + `prepareArchive`，失败返回
 *    `archive-unavailable`（同样零副作用）；
 * 3. 交给既有的 {@link disposeAll} 串行处置并集，`removed` 为并集全量。
 *
 * @param ports - 全部端口。
 * @param targets - 用户勾选的目标会话 id，允许重复。
 * @param disposal - 执行档位；`archive` 档携带归档根。
 * @returns 执行结果或稳定拒绝码。
 */
async function disposeBatch(ports: DeletePorts, targets: readonly string[], disposal: BatchDisposal): Promise<DeleteResult> {
  const plan = await planDeleteBatch(targets, ports)
  if (plan.rejected.length > 0) {
    const [first] = plan.rejected
    return { ok: false, code: isFailureCode(first.code) ? first.code : 'internal', message: first.message }
  }
  const archiveRoot = disposal.mode === 'archive' ? disposal.archiveRoot : undefined
  if (archiveRoot !== undefined) {
    if (!isAbsolute(archiveRoot)) {
      return { ok: false, code: 'archive-unavailable', message: `archive root "${archiveRoot}" is not an absolute path` }
    }
    try {
      await ports.prepareArchive(archiveRoot)
    } catch (error: unknown) {
      return { ok: false, code: 'archive-unavailable', message: `archive root "${archiveRoot}" is not usable: ${reasonOf(error)}` }
    }
  }
  const outcome = archiveRoot === undefined
    ? await disposeAll(ports, plan.union, (id) => ports.removeFiles(id))
    : await disposeAll(ports, plan.union, (id) => ports.archiveFiles(id, archiveRoot))
  return { ok: true, outcome }
}

/** 目标去重（首见顺序）：契约允许 `sessionIds` 重复，统计与校验都按去重后的目标计。 */
function uniqueTargets(targets: readonly string[]): string[] {
  return [...new Set(targets)]
}

/**
 * 删除与迁移共用的执行循环：逐 id 依次
 *
 * 1. `cleanupRegistry`——失败只记 warning（`registry: <id>: <原因>`）并继续；
 * 2. 传入的文件动作——返回的失败项原样并入 warnings，抛错记 `files: <id>: <原因>` 并继续；
 * 3. `emitRemoved`——抛错只告警，不影响结果。
 *
 * 文件失败**不回滚、不中止**：这是删除与迁移逐字同构的保证（同一段循环，而不是
 * 两份复制代码），因此两条路径的 warnings 顺序与文案也一致。
 *
 * @param ports - 执行循环所需的三个端口。
 * @param ids - 已通过前置校验的处置集合（目标在首位）。
 * @param disposeFiles - 单个 id 的文件动作；返回失败项，不抛错。
 * @returns 处置结论：removed 为完整集合，warnings 为逐条失败。
 */
async function disposeAll(
  ports: Pick<DeletePorts, 'cleanupRegistry' | 'emitRemoved' | 'warn'>,
  ids: readonly string[],
  disposeFiles: (id: string) => Promise<readonly string[]>,
): Promise<DeleteOutcome> {
  const warnings: string[] = []
  for (const id of ids) {
    try {
      await ports.cleanupRegistry(id)
    } catch (error: unknown) {
      warnings.push(`registry: ${id}: ${reasonOf(error)}`)
      ports.warn(`web-ux: removing session "${id}" from the workspace registry failed`, error)
    }
    try {
      warnings.push(...await disposeFiles(id))
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
  return { removed: ids, warnings }
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

/** 文件操作端口：工厂只用这七个原语，因此测试可注入内存实现。 */
export interface FileSystemOps {
  /** 读目录；路径缺失（ENOENT）由调用方处理。 */
  readdir(path: string): Promise<readonly DirectoryEntry[]>
  /**
   * 取路径自身的元信息；不跟随符号链接。`mtimeMs` 只是可选的宽度信息（迁移域按
   * 更新时间排序时使用），内存 fake 与既有调用点都不必提供。
   */
  lstat(path: string): Promise<{ readonly size: number; readonly mtimeMs?: number; isDirectory(): boolean }>
  /** 递归删除；`force` 让缺失路径成为无操作。 */
  rm(path: string, options: { readonly recursive: boolean; readonly force: boolean }): Promise<void>
  /** 删除单个文件。 */
  unlink(path: string): Promise<void>
  /** 新建目录；`recursive` 允许缺父级、允许已存在。 */
  mkdir(path: string, options: { readonly recursive: boolean }): Promise<void>
  /** 同设备原子重命名；跨设备抛 `code === 'EXDEV'`。 */
  rename(from: string, to: string): Promise<void>
  /** 复制单个文件（不含目录）。 */
  copyFile(from: string, to: string): Promise<void>
}

/** 文件操作工厂的宿主上下文：拼接路径的函数与文件系统端口。 */
export interface SessionFileLayout {
  /** 把片段拼到 harness home 上（宿主提供 `ctx.dshHomePath`）。 */
  readonly homePath: (...segments: string[]) => string
  /** 文件系统端口。 */
  readonly fs: FileSystemOps
}

/** 路径片段的长度上限（会话 id / 归档目录名），与 contract 的请求校验保持一致（同时也是多数文件系统的单段上限）。 */
const SESSION_ID_MAX = 255

/** 控制字符（含 NUL）不是合法路径片段。 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/**
 * 判断一个值能否安全地当作单个路径片段。会话 id、项目目录名与归档目录名都已过
 * contract 的边界校验，这里再防御一次：任何分隔符、控制字符或 `.` / `..` 都意味着
 * 请求想逃出目标目录。
 *
 * 删除域的会话 id 与迁移域的归档目录名共用这一套判定：路径逃逸的防线只写一次。
 *
 * @param value - 待判定的路径片段。
 * @returns 可作为单一目录名使用时为 true。
 */
export function isSafePathSegment(value: string): boolean {
  return value !== ''
    && value.length <= SESSION_ID_MAX
    && value !== '.'
    && value !== '..'
    && !value.includes('/')
    && !value.includes('\\')
    && !CONTROL_CHARACTERS.test(value)
}

/**
 * 内部旧名别名：会话文件工厂的既有调用点按旧名理解，保留它可让本文件的既有代码与
 * 那一整套回归测试一字不改。
 * @param sessionId - 待判定的会话 id。
 * @returns 可作为单个会话目录名时为 true。
 */
function isSafeSessionId(sessionId: string): boolean {
  return isSafePathSegment(sessionId)
}

/** 路径缺失（ENOENT）是正常状态而不是失败。 */
function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { readonly code?: unknown }).code === 'ENOENT'
}

/** 跨设备重命名（EXDEV）需要回退到逐文件复制。 */
function isCrossDevice(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { readonly code?: unknown }).code === 'EXDEV'
}

/** 把任意抛出物压成一句可读原因。 */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 单个文件复制失败的警告：点名源与目标，并说明源被保留、目标半成品需手工清理。 */
function copyFailure(src: string, dest: string, error: unknown): string {
  return `copy ${src} -> ${dest}: ${reasonOf(error)} (the source was kept; the partial copy at the destination needs manual cleanup)`
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
 * `archive(sessionId, archiveRoot)` 把每个命中的会话目录移动到
 * `<archiveRoot>/<项目目录>/<sessionId>`（项目层级取自源路径的父目录名），绝不覆盖
 * 已存在的目标：先 `lstat(dest)`，再 `mkdir` 父级、`rename`；仅在跨设备（EXDEV）时
 * 回退到内部 `copyTree`（符号链接不复制、任一失败不删源、全部成功后才删源）。
 * 投影缓存的 `unlink` 与 `remove` 相同；所有失败都返回而不抛出。
 * `measure` 递归求和（符号链接按自身大小计，不跟随），任何读取失败按 0。
 * `prepareArchive` 递归建出归档根，失败直接抛给 {@link archiveSession} 映射。
 *
 * @param layout - 宿主路径解析与文件系统端口。
 * @returns 该会话的 `measure` / `remove` 与归档迁移的 `prepareArchive` / `archive`。
 */
export function createSessionFiles(layout: SessionFileLayout): {
  measure(sessionId: string): Promise<number>
  remove(sessionId: string): Promise<readonly string[]>
  prepareArchive(archiveRoot: string): Promise<void>
  archive(sessionId: string, archiveRoot: string): Promise<readonly string[]>
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

  /**
   * 逐文件复制一棵目录树（只在 EXDEV 回退里使用，不交给 `fs.cp`）。
   *
   * 目的地必须不存在：`mkdir(to, { recursive: false })` 的 EEXIST 就是失败。符号链接
   * 不跟随、不复制（记一条点名该路径的警告）；任一失败都会让调用方保留源目录，绝不
   * 在复制不完整时删除源。返回失败项，不抛错。
   *
   * @param from - 源目录。
   * @param to - 目标目录（必须不存在）。
   * @returns 失败项；为空表示整棵树复制完整。
   */
  async function copyTree(from: string, to: string): Promise<readonly string[]> {
    const warnings: string[] = []
    try {
      await fs.mkdir(to, { recursive: false })
    } catch (error: unknown) {
      warnings.push(`${from} -> ${to}: ${reasonOf(error)}`)
      return warnings
    }
    let entries: readonly DirectoryEntry[]
    try {
      entries = await fs.readdir(from)
    } catch (error: unknown) {
      warnings.push(`${from} -> ${to}: ${reasonOf(error)}`)
      return warnings
    }
    for (const entry of entries) {
      const src = join(from, entry.name)
      const dest = join(to, entry.name)
      if (entry.isSymbolicLink?.() === true) {
        warnings.push(`${src}: symbolic link was not copied (the source directory was kept)`)
        continue
      }
      if (entry.isDirectory()) {
        warnings.push(...await copyTree(src, dest))
        continue
      }
      try {
        await fs.copyFile(src, dest)
      } catch (error: unknown) {
        warnings.push(copyFailure(src, dest, error))
      }
    }
    return warnings
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

    /** 递归建出归档根；失败直接抛出，由 {@link archiveSession} 映射为 `archive-unavailable`。 */
    async prepareArchive(archiveRoot: string): Promise<void> {
      await fs.mkdir(archiveRoot, { recursive: true })
    },

    /**
     * 迁移集合里一个会话的磁盘痕迹：每个命中的日志目录移动到
     * `<archiveRoot>/<项目目录>/<sessionId>`，随后删除投影缓存；返回失败项。
     */
    async archive(sessionId: string, archiveRoot: string): Promise<readonly string[]> {
      if (!isSafeSessionId(sessionId)) {
        return [`session id ${JSON.stringify(sessionId)} is not a safe path segment; nothing was moved`]
      }
      const located = await locate(sessionId)
      const warnings = [...located.warnings]
      for (const src of located.paths) {
        const dest = join(archiveRoot, basename(dirname(src)), sessionId)
        // POSIX rename 会静默顶替空目录：先显式判定目标存在，把同名冲突变成失败项。
        try {
          await fs.lstat(dest)
          warnings.push(`${dest} already exists; the session directory was not moved (source kept at ${src})`)
          continue
        } catch (error: unknown) {
          if (!isMissing(error)) {
            warnings.push(`${src} -> ${dest}: ${reasonOf(error)}`)
            continue
          }
        }
        try {
          await fs.mkdir(dirname(dest), { recursive: true })
        } catch (error: unknown) {
          warnings.push(`${src} -> ${dest}: ${reasonOf(error)}`)
          continue
        }
        try {
          await fs.rename(src, dest)
          continue
        } catch (error: unknown) {
          if (!isCrossDevice(error)) {
            warnings.push(`${src} -> ${dest}: ${reasonOf(error)}`)
            continue
          }
        }
        const copyWarnings = await copyTree(src, dest)
        if (copyWarnings.length > 0) {
          warnings.push(...copyWarnings)
          continue
        }
        try {
          await fs.rm(src, { recursive: true, force: false })
        } catch (error: unknown) {
          warnings.push(`moved to ${dest} but the source could not be removed: ${src}: ${reasonOf(error)}`)
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
