/**
 * 「已迁移会话」域的宿主侧纯流程与文件工厂：枚举归档根下的条目、物理删除条目，
 * 以及把条目恢复回 `<home>/sessions` 并重新挂回工作区。
 *
 * 与 {@link ./delete-session.ts} 同层：这一层不认识 cordis，也不 import 任何上游
 * DSH 包或 `node:*` 内建（路径拼接靠注入的 `homePath`，文件系统靠注入的
 * {@link MigratedFileOps}），所以能在纯 node 环境里用内存 fake 完整驱动。把上游服务
 * 接到这些端口上是宿主实载体（`src/index.ts`）的职责。
 *
 * 语义（spec: dsh-web-ux-session-manager）：
 *
 * - **两阶段**：删除与恢复都先在**零写**阶段逐条校验（条目必须存在且是目录；恢复还
 *   要求目标位不存在），任一条目失败即整单拒绝、一条都不动；通过后进入逐条执行阶段，
 *   文件动作失败只进 warnings、不中止、不回滚。
 * - **恢复目标路径取自归档树自身**（`sessions/<projectDir>/<dirName>`，D4）：`projectKey`
 *   只用于「条目 ↔ 工作区」匹配，绝不用于反推目录位置。
 * - **目录名即会话 id**（D12）：两代命名（裸 UUID 与 `session-<uuid>`）都原样保留，
 *   不做前缀归一。
 * - **恢复的执行顺序**：`mkdir -p` → `rename`（跨设备 `EXDEV` 才回退逐文件复制并删源）
 *   → `attachToWorkspace`（匹配不到或无匹配工作区 ⇒ warning，仍计已恢复）→
 *   `readdToArchiveSet`（失败 ⇒ warning）→ 记入 `restored[]`；循环结束只调一次
 *   {@link MigratedPorts.announceRestored}，其异常只告警。
 * - **标题探测是纯增强**：仅当 {@link MigratedPorts.log} 端口在场，枚举阶段才从每条
 *   条目的成员名里挑规范日志，对它的压缩前缀做有界探测（并发 {@link MIGRATED_PROBE_CONCURRENCY}），
 *   把 `title` / `createdAt` 条件并入条目。端口缺省、日志不可读、探测失败都只是这两
 *   个字段缺省——列表不失败、也**不产生任何 warning**（既有迁移告警断言零变化）。
 *
 * @module dsh-plugin-web-ux/migrated
 */

import {
  MAX_LISTED_MIGRATED,
  type DeleteOutcome,
  type FailureCode,
  type MigratedEntry,
  type MigratedListing,
  type MigratedTarget,
  type RestoreOutcome,
  type RestoredEntry,
} from './contract.ts'
import {
  isSafePathSegment,
  type DirectoryEntry,
  type FileSystemOps,
} from './delete-session.ts'
import { workspaceForProjectDir } from './project-key.ts'
import {
  chooseSessionLogName,
  probeSessionLog,
  type SessionLogEntryName,
  type SessionLogReadPorts,
} from './session-log-title.ts'

/**
 * 宿主广播的会话新增事件名；与 `delete-session.ts` 的 `SESSION_REMOVED_EVENT` 同址
 * 风格。恢复后由宿主 {@link MigratedPorts.announceRestored} 读出真实会话头发一条，
 * 浏览器会话列表据此即时补行。
 */
export const SESSION_ADDED_EVENT = 'api-session/added'

/** 工作区注册表里本域需要的最小投影：工作区 id 与项目目录绝对路径。 */
export interface MigratedWorkspace {
  /** 工作区 id（`workspace.json` 的键）。 */
  readonly workspaceId: string
  /** 工作区的项目目录绝对路径（用于 `projectKey` 匹配，不用于拼路径）。 */
  readonly path: string
}

/**
 * 迁移域只用这 6 个文件原语；`nodeFileSystem` 与内存 fake 都同时满足它。
 *
 * `lstat` 需带 `mtimeMs`（可缺省，缺失按 0）：列表的 `updatedAt` 取自它。
 */
export type MigratedFileOps = Pick<
  FileSystemOps,
  'readdir' | 'lstat' | 'rm' | 'mkdir' | 'rename' | 'copyFile'
>

/** 迁移域的日志读取端口（= 读取器端口，命名对齐本域）。 */
export type MigratedLogOps = SessionLogReadPorts

/**
 * 标题探测的并发上限（镜像上游 list 并发默认值 3，不引入 p-limit）。
 */
export const MIGRATED_PROBE_CONCURRENCY = 3

/** 迁移域的全部外部动作：流程只通过这组端口触碰上游与磁盘。 */
export interface MigratedPorts {
  /** 宿主解析后的归档根（绝对路径）。 */
  readonly archiveRoot: string
  /** `<home>/sessions` 等路径拼接（宿主提供 `ctx.dshHomePath`）。 */
  readonly homePath: (...segments: string[]) => string
  /** 文件原语；`lstat` 需带 `mtimeMs`。 */
  readonly fs: MigratedFileOps
  /**
   * 归档日志读取端口。缺省 = 不读标题（字段缺省、列表行为与本次变更前逐字节一致）；
   * 宿主不支持 zstd（Node 特性探测失败）时也走缺省。
   */
  readonly log?: MigratedLogOps
  /** 当前工作区（`workspaceRegistry.list()` 的投影）；抛错时恢复全部按「未分组」处理。 */
  listWorkspaces(): readonly MigratedWorkspace[]
  /** 把恢复的会话挂回工作区（上游会按 header cwd 二次校验）；拒绝时抛错。 */
  attachToWorkspace(workspaceId: string, sessionId: string): Promise<void>
  /** 把恢复的会话放回 registry 归档集合；失败时抛错。 */
  readdToArchiveSet(sessionId: string): Promise<void>
  /** 广播「这些会话已可见」（宿主读一次持久化列表拿真实 header）；异常只告警。 */
  announceRestored(entries: readonly { readonly sessionId: string; readonly updatedAt: number }[]): Promise<void>
  /** 记录一条宿主告警。 */
  warn(message: string, error?: unknown): void
}

/** 列表结论：归档根下的条目，或稳定失败码（归档根不可读）。 */
export type MigratedListingResult =
  | { readonly ok: true; readonly listing: MigratedListing }
  | { readonly ok: false; readonly code: FailureCode; readonly message: string }

/** 物理删除结论。 */
export type MigratedDeleteResult =
  | { readonly ok: true; readonly outcome: DeleteOutcome }
  | { readonly ok: false; readonly code: FailureCode; readonly message: string }

/** 恢复结论。 */
export type RestoreResult =
  | { readonly ok: true; readonly outcome: RestoreOutcome }
  | { readonly ok: false; readonly code: FailureCode; readonly message: string }

/** 文件工厂的宿主上下文：拼接路径的函数与文件系统端口（与 `SessionFileLayout` 同形）。 */
export interface ArchiveFileLayout {
  /** 把片段拼到 harness home 上（宿主提供 `ctx.dshHomePath`）。 */
  readonly homePath: (...segments: string[]) => string
  /** 文件系统端口。 */
  readonly fs: MigratedFileOps
}

/** 归档根枚举结果：条目（最多 {@link MAX_LISTED_MIGRATED} 条）与是否被截断。 */
export interface ArchiveEntries {
  /** 按「项目目录 → 会话目录」的枚举顺序列出的条目。 */
  readonly entries: readonly MigratedEntry[]
  /** 还有未列出的条目时为 true。 */
  readonly truncated: boolean
}

/** 文件工厂恢复结果：成功搬回的条目与逐条文件失败项（形如 `<路径>: <原因>`）。 */
export interface RestoreFilesResult {
  /** 已从归档根搬到 `sessions/` 的条目（输入顺序）。 */
  readonly moved: readonly MigratedTarget[]
  /** 文件动作失败项；不中止后续条目，也不回滚已搬回的条目。 */
  readonly warnings: readonly string[]
}

/**
 * 按归档根下的一级目录名反查所属工作区。
 *
 * 只做匹配，不推导任何路径（D4）：`projectKey` 有损，反推会落错目录。匹配规则与
 * `project-key.ts` 的 {@link workspaceForProjectDir} 完全一致。
 *
 * @param projectDir - 归档根下的一级目录名（`projectKey(workspace.path)` 的形态）。
 * @param workspaces - 当前工作区注册表投影，按注册顺序匹配。
 * @returns 命中工作区的 id；无命中时 `null`（未分组）。
 */
export function ownerOfProjectDir(
  projectDir: string,
  workspaces: readonly MigratedWorkspace[],
): string | null {
  return workspaceForProjectDir(projectDir, workspaces)
}

/**
 * 归档条目的会话 id：**目录名即 id**，不做 `session-` 前缀归一（D12）。
 *
 * 实测部署里裸 UUID 与 `session-<uuid>` 两代目录名并存，且前缀本身就是当前 id 形态；
 * 剥掉前缀会得到上游查不到的 id。
 *
 * @param dirName - 归档根下的会话目录名。
 * @returns 原样返回的会话 id。
 */
export function sessionIdOfEntry(dirName: string): string {
  return dirName
}

/**
 * 把若干路径片段拼到一个基底路径后面。
 *
 * 本模块不 import `node:path`（层契约），归档根来自宿主配置、片段来自请求，因此只需
 * 处理「去掉尾部分隔符再逐段拼接」；分隔符按基底自身判断（含 `\` 且不含 `/` 视为
 * Windows 路径），基底为空时结果保持相对形态，绝不凭空补出根。
 *
 * @param base - 基底路径（通常为归档根的绝对路径）。
 * @param segments - 逐段追加的路径片段（不得含分隔符，调用方已校验）。
 * @returns 拼接后的路径。
 */
function joinUnder(base: string, ...segments: readonly string[]): string {
  const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/'
  let path = base
  while (path.length > 1 && (path.endsWith('/') || path.endsWith('\\'))) path = path.slice(0, -1)
  for (const segment of segments) {
    if (path === '' || path === '/') path = `${path}${segment}`
    else path = `${path}${separator}${segment}`
  }
  return path
}

/**
 * 一条归档条目的绝对路径：`<archiveRoot>/<projectDir>/<dirName>`。
 * @param archiveRoot - 宿主解析后的归档根。
 * @param target - 归档条目身份。
 * @returns 条目目录的绝对路径。
 */
function archivePathOf(archiveRoot: string, target: MigratedTarget): string {
  return joinUnder(archiveRoot, target.projectDir, target.dirName)
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

/**
 * 有界并发的 worker 池（不引入 p-limit）：同一时刻最多 `limit` 个任务在途，任一条的
 * 失败被就地折叠、不阻断其余条目。{@link probeSessionLog} 契约上永不 reject，这层
 * `catch` 只是对池本身的兜底纪律。
 */
async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      if (item === undefined) break
      try {
        await worker(item)
      } catch {
        // 单条探测失败只让该条的字段缺省，绝不让列表失败。
      }
    }
  })
  await Promise.all(runners)
}

/** 标题探测的一条待办：条目在 `entries` 里的下标、日志绝对路径与选中的规范日志名。 */
interface PendingProbe {
  /** 该条目在 `entries` 数组里的下标（阶段 A 枚举顺序）。 */
  readonly index: number
  /** 规范日志文件的绝对路径。 */
  readonly path: string
  /** {@link chooseSessionLogName} 选出的规范日志名（决定压缩形态）。 */
  readonly log: SessionLogEntryName
}

/**
 * 取目录 mtime 作为 `updatedAt`。
 *
 * `FileSystemOps.lstat` 的 `mtimeMs` 是可选宽度信息（内存 fake 可以不给）：缺失、
 * 非有限数或负值一律按 0，保证响应能通过 contract 的「非负有限数」校验。
 *
 * @param stats - `lstat` 的结果（只需 `mtimeMs` 可选字段）。
 * @returns 非负的 epoch 毫秒，无法取得时为 0。
 */
function updatedAtOf(stats: { readonly mtimeMs?: number }): number {
  const value = stats.mtimeMs
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** 单个文件复制失败的警告：点名源与目标，并说明源被保留、目标半成品需手工清理。 */
function copyFailure(src: string, dest: string, error: unknown): string {
  return `copy ${src} -> ${dest}: ${reasonOf(error)} (the source was kept; the partial copy at the destination needs manual cleanup)`
}

/**
 * 逐文件复制一棵目录树（只在 EXDEV 回退里使用，不交给 `fs.cp`，也不导出）。
 *
 * 目的地必须不存在：`mkdir(to, { recursive: false })` 的 EEXIST 就是失败。符号链接
 * 不跟随、不复制（记一条点名该路径的警告）；任一失败都会让调用方保留源目录，绝不在
 * 复制不完整时删除源。返回失败项，不抛错。
 *
 * @param fs - 文件原语。
 * @param from - 源目录。
 * @param to - 目标目录（必须不存在）。
 * @returns 失败项；为空表示整棵树复制完整。
 */
async function copyTree(fs: MigratedFileOps, from: string, to: string): Promise<readonly string[]> {
  const warnings: string[] = []
  try {
    await fs.mkdir(to, { recursive: false })
  } catch (error: unknown) {
    return [`${from} -> ${to}: ${reasonOf(error)}`]
  }
  let entries: readonly DirectoryEntry[]
  try {
    entries = await fs.readdir(from)
  } catch (error: unknown) {
    return [`${from} -> ${to}: ${reasonOf(error)}`]
  }
  for (const entry of entries) {
    const src = joinUnder(from, entry.name)
    const dest = joinUnder(to, entry.name)
    if (entry.isSymbolicLink?.() === true) {
      warnings.push(`${src}: symbolic link was not copied (the source directory was kept)`)
      continue
    }
    if (entry.isDirectory()) {
      warnings.push(...await copyTree(fs, src, dest))
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

/**
 * 阶段 1 的单项校验：条目必须是归档根下一个真实目录。
 *
 * 除存在性外还防御性重验路径片段（contract 已校验过请求，这里是路径逃逸的最后一道
 * 防线）：任何分隔符、控制字符或 `.` / `..` 都按 `bad-request` 拒绝。
 *
 * @param fs - 文件原语。
 * @param archiveRoot - 宿主解析后的归档根。
 * @param target - 归档条目身份。
 * @returns 通过时的绝对路径与 mtime（供广播用），否则稳定失败码。
 */
async function inspectArchiveEntry(
  fs: MigratedFileOps,
  archiveRoot: string,
  target: MigratedTarget,
): Promise<
  | { readonly ok: true; readonly path: string; readonly updatedAt: number }
  | { readonly ok: false; readonly code: FailureCode; readonly message: string }
> {
  if (!isSafePathSegment(target.projectDir)) {
    return { ok: false, code: 'bad-request', message: `project directory ${JSON.stringify(target.projectDir)} is not a safe path segment` }
  }
  if (!isSafePathSegment(target.dirName)) {
    return { ok: false, code: 'bad-request', message: `archive entry name ${JSON.stringify(target.dirName)} is not a safe path segment` }
  }
  const path = archivePathOf(archiveRoot, target)
  let stats: { readonly mtimeMs?: number; isDirectory(): boolean }
  try {
    stats = await fs.lstat(path)
  } catch (error: unknown) {
    if (isMissing(error)) {
      return { ok: false, code: 'not-migrated', message: `archive entry "${path}" does not exist` }
    }
    return { ok: false, code: 'archive-unavailable', message: `archive entry "${path}" is not readable: ${reasonOf(error)}` }
  }
  if (!stats.isDirectory()) {
    return { ok: false, code: 'not-migrated', message: `archive entry "${path}" is not a directory` }
  }
  return { ok: true, path, updatedAt: updatedAtOf(stats) }
}

/**
 * 阶段 1 的恢复目标校验：`<home>/sessions/<projectDir>/<dirName>` 必须不存在。
 *
 * 已存在（任何类型）⇒ `target-exists`；`lstat` 的其它失败（例如父级不可读）无法证明
 * 目标位可用，按 `internal` 拒绝而不是冒险覆盖。
 *
 * @param fs - 文件原语。
 * @param path - 恢复目标路径。
 * @returns 目标位可用，或稳定失败码。
 */
async function inspectRestoreTarget(
  fs: MigratedFileOps,
  path: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly code: FailureCode; readonly message: string }> {
  try {
    await fs.lstat(path)
    return { ok: false, code: 'target-exists', message: `restore target "${path}" already exists` }
  } catch (error: unknown) {
    if (isMissing(error)) return { ok: true }
    return { ok: false, code: 'internal', message: `restore target "${path}" cannot be inspected: ${reasonOf(error)}` }
  }
}

/** 按 `projectDir` + `dirName` 去重，保留首见顺序（同一批里重复勾选不产生二次动作）。 */
function uniqueTargets(targets: readonly MigratedTarget[]): MigratedTarget[] {
  const seen = new Set<string>()
  const unique: MigratedTarget[] = []
  for (const target of targets) {
    const key = `${target.projectDir}\u0000${target.dirName}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(target)
  }
  return unique
}

/**
 * 枚举归档根下的迁移条目。
 *
 * - `readdir(archiveRoot)` 的 ENOENT ⇒ 空列表（未建归档根不是错误）；其它错误直接抛出，
 *   由 {@link listMigrated} 映射为 `archive-unavailable`。
 * - 一级项目目录与二级会话目录里的非目录 / 符号链接跳过并 `warn`（`isDirectory()` 对
 *   符号链接为 false，先判链接是为了给出更准确的原因）。
 * - `bytes` 只统计会话目录内**一层**的普通条目（子目录跳过，符号链接按自身大小计），
 *   单个条目读不到按 0（体积只是参考数字，不该让列表失败）。
 * - `updatedAt` 取会话目录自身的 mtime，缺失按 0。
 * - 一旦已列出 {@link MAX_LISTED_MIGRATED} 条、又遇到新的合法条目，就置
 *   `truncated: true` 并停止枚举。
 * - 仅当 `log` 端口在场（阶段 B）：从每条条目的成员名里 {@link chooseSessionLogName}
 *   挑规范日志，以 {@link MIGRATED_PROBE_CONCURRENCY} 的 worker 池对它们做
 *   {@link probeSessionLog}（永不抛），把结论里的 `title` / `createdAt` 条件并入条目；
 *   全部失败都只是字段缺省，不产生任何 warning。端口缺省时整个阶段不执行，列表行为
 *   与没有这个端口时逐字节一致。
 *
 * @param fs - 文件原语。
 * @param archiveRoot - 宿主解析后的归档根。
 * @param warn - 跳过条目与读取失败的告警出口。
 * @param log - 归档日志读取端口；缺省 = 不做标题探测。
 * @returns 条目（最多 `MAX_LISTED_MIGRATED` 条）与截断标志。
 * @throws 归档根存在但不可读（非 ENOENT）时抛出。
 */
async function listArchiveEntries(
  fs: MigratedFileOps,
  archiveRoot: string,
  warn: (message: string) => void,
  log?: MigratedLogOps,
): Promise<ArchiveEntries> {
  let projects: readonly DirectoryEntry[]
  try {
    projects = await fs.readdir(archiveRoot)
  } catch (error: unknown) {
    if (isMissing(error)) return { entries: [], truncated: false }
    throw error
  }
  const entries: MigratedEntry[] = []
  const pending: PendingProbe[] = []
  let truncated = false
  projectLoop: for (const project of projects) {
    const projectPath = joinUnder(archiveRoot, project.name)
    if (project.isSymbolicLink?.() === true) {
      warn(`${projectPath}: symbolic-linked project directory was not followed`)
      continue
    }
    if (!project.isDirectory()) {
      warn(`${projectPath}: not a directory; skipped`)
      continue
    }
    let sessions: readonly DirectoryEntry[]
    try {
      sessions = await fs.readdir(projectPath)
    } catch (error: unknown) {
      if (!isMissing(error)) warn(`${projectPath}: ${reasonOf(error)}`)
      continue
    }
    for (const session of sessions) {
      const sessionPath = joinUnder(projectPath, session.name)
      if (session.isSymbolicLink?.() === true) {
        warn(`${sessionPath}: symbolic-linked session directory was not followed`)
        continue
      }
      if (!session.isDirectory()) {
        warn(`${sessionPath}: not a directory; skipped`)
        continue
      }
      let stats: { readonly mtimeMs?: number; isDirectory(): boolean }
      try {
        stats = await fs.lstat(sessionPath)
      } catch (error: unknown) {
        if (!isMissing(error)) warn(`${sessionPath}: ${reasonOf(error)}`)
        continue
      }
      if (!stats.isDirectory()) {
        warn(`${sessionPath}: not a directory; skipped`)
        continue
      }
      if (entries.length >= MAX_LISTED_MIGRATED) {
        truncated = true
        break projectLoop
      }
      let bytes = 0
      let members: readonly DirectoryEntry[]
      try {
        members = await fs.readdir(sessionPath)
      } catch (error: unknown) {
        warn(`${sessionPath}: ${reasonOf(error)}`)
        members = []
      }
      for (const member of members) {
        if (member.isDirectory()) continue
        try {
          const fileStats = await fs.lstat(joinUnder(sessionPath, member.name))
          bytes += fileStats.size > 0 ? fileStats.size : 0
        } catch {
          // 一层体积只是给用户的参考数字：单个文件读不到就跳过，不打断整次枚举。
        }
      }
      if (log !== undefined) {
        const picked = chooseSessionLogName(members.map((member) => member.name))
        if (picked !== undefined) {
          pending.push({ index: entries.length, path: joinUnder(sessionPath, picked.name), log: picked })
        }
      }
      entries.push({
        sessionId: sessionIdOfEntry(session.name),
        dirName: session.name,
        projectDir: project.name,
        bytes,
        updatedAt: updatedAtOf(stats),
      })
    }
  }
  if (log !== undefined && pending.length > 0) {
    await mapLimit(pending, MIGRATED_PROBE_CONCURRENCY, async (item) => {
      const probe = await probeSessionLog(item.path, item.log, log) // 契约：永不 reject
      if (probe.title === null && probe.createdAt === null) return
      entries[item.index] = {
        ...entries[item.index],
        ...(probe.title === null ? {} : { title: probe.title }),
        ...(probe.createdAt === null ? {} : { createdAt: probe.createdAt }),
      }
    })
  }
  return { entries, truncated }
}

/**
 * 阶段 2 的物理删除：逐条 `rm -r`，失败只记 `<路径>: <原因>`，不中止后续条目。
 *
 * @param fs - 文件原语。
 * @param archiveRoot - 宿主解析后的归档根。
 * @param targets - 已通过校验的条目。
 * @returns 文件删除失败项。
 */
async function removeEntries(
  fs: MigratedFileOps,
  archiveRoot: string,
  targets: readonly MigratedTarget[],
): Promise<readonly string[]> {
  const warnings: string[] = []
  for (const target of targets) {
    const path = archivePathOf(archiveRoot, target)
    try {
      await fs.rm(path, { recursive: true, force: true })
    } catch (error: unknown) {
      warnings.push(`${path}: ${reasonOf(error)}`)
    }
  }
  return warnings
}

/**
 * 阶段 2 的单条恢复：建父级 → `rename`，`EXDEV` 时回退 {@link copyTree} 后删源。
 *
 * `rename` 是首选：同设备下原子、保留元数据。跨设备才复制，且只有整棵树复制完整才删
 * 源；复制不完整时源保留、目标可能有半成品，警告点名两者。`mkdir -p` 失败与
 * `rename` 的非 `EXDEV` 失败都只让该条目失败（返回 `moved: false`）。
 *
 * @param fs - 文件原语。
 * @param source - 归档条目的绝对路径。
 * @param parent - 目标父目录（`<home>/sessions/<projectDir>`）。
 * @param destination - 目标路径（`<home>/sessions/<projectDir>/<dirName>`）。
 * @returns 是否搬回成功，以及逐条失败项。
 */
async function moveArchiveEntry(
  fs: MigratedFileOps,
  source: string,
  parent: string,
  destination: string,
): Promise<{ readonly moved: boolean; readonly warnings: readonly string[] }> {
  try {
    await fs.mkdir(parent, { recursive: true })
  } catch (error: unknown) {
    return { moved: false, warnings: [`${source} -> ${destination}: ${reasonOf(error)}`] }
  }
  try {
    await fs.rename(source, destination)
    return { moved: true, warnings: [] }
  } catch (error: unknown) {
    if (!isCrossDevice(error)) {
      return { moved: false, warnings: [`${source} -> ${destination}: ${reasonOf(error)}`] }
    }
  }
  const copyWarnings = await copyTree(fs, source, destination)
  if (copyWarnings.length > 0) return { moved: false, warnings: copyWarnings }
  const warnings: string[] = []
  try {
    await fs.rm(source, { recursive: true, force: false })
  } catch (error: unknown) {
    warnings.push(`moved to ${destination} but the source could not be removed: ${source}: ${reasonOf(error)}`)
  }
  return { moved: true, warnings }
}

/**
 * 阶段 2 的批量恢复：按输入顺序逐条 {@link moveArchiveEntry}，收集成功条目与告警。
 *
 * 这里只做文件动作（不碰工作区端口），挂回与广播由 {@link restoreMigrated} 逐条完成，
 * 因此失败条目不会挡住后续条目。
 *
 * @param fs - 文件原语。
 * @param homePath - harness home 路径拼接器。
 * @param archiveRoot - 宿主解析后的归档根。
 * @param targets - 已通过阶段 1 校验的条目。
 * @returns 成功搬回的条目与文件失败项。
 */
async function restoreEntries(
  fs: MigratedFileOps,
  homePath: (...segments: string[]) => string,
  archiveRoot: string,
  targets: readonly MigratedTarget[],
): Promise<RestoreFilesResult> {
  const moved: MigratedTarget[] = []
  const warnings: string[] = []
  for (const target of targets) {
    const result = await moveArchiveEntry(
      fs,
      archivePathOf(archiveRoot, target),
      homePath('sessions', target.projectDir),
      homePath('sessions', target.projectDir, target.dirName),
    )
    warnings.push(...result.warnings)
    if (result.moved) moved.push(target)
  }
  return { moved, warnings }
}

/**
 * 建出归档条目的文件工厂：抽象与 `delete-session.ts` 的 {@link createSessionFiles} 同款，
 * 让流程与测试共享同一份「枚举 / 删除 / 搬回」文件语义。
 *
 * - `list(archiveRoot, warn?)`：一层体积求和与 `MAX_LISTED_MIGRATED` 截断；归档根 ENOENT
 *   返回空列表，其它不可读错误抛出（由 {@link listMigrated} 映射为 `archive-unavailable`）。
 * - `remove(targets, archiveRoot)`：逐条 `rm -r`，返回 `<路径>: <原因>` 警告。
 * - `restore(targets, archiveRoot)`：逐条 `mkdir -p` → `rename` → `EXDEV` 回退复制，返回
 *   已搬回条目与警告（不触碰工作区端口）。
 *
 * @param layout - 宿主路径解析与文件系统端口。
 * @returns 该归档根域的 `list` / `remove` / `restore`。
 */
export function createArchiveFiles(layout: ArchiveFileLayout): {
  list(archiveRoot: string, warn?: (message: string) => void): Promise<ArchiveEntries>
  remove(targets: readonly MigratedTarget[], archiveRoot: string): Promise<readonly string[]>
  restore(targets: readonly MigratedTarget[], archiveRoot: string): Promise<RestoreFilesResult>
} {
  const { fs, homePath } = layout
  return {
    /** 列出归档根下的条目；未建归档根（ENOENT）按空列表处理。 */
    async list(archiveRoot: string, warn: (message: string) => void = () => {}): Promise<ArchiveEntries> {
      return await listArchiveEntries(fs, archiveRoot, warn)
    },
    /** 物理删除条目；逐条失败只进 warnings。 */
    async remove(targets: readonly MigratedTarget[], archiveRoot: string): Promise<readonly string[]> {
      return await removeEntries(fs, archiveRoot, targets)
    },
    /** 把条目搬回 `sessions/`；逐条失败只进 warnings。 */
    async restore(targets: readonly MigratedTarget[], archiveRoot: string): Promise<RestoreFilesResult> {
      return await restoreEntries(fs, homePath, archiveRoot, targets)
    },
  }
}

/**
 * 列出归档根下的已迁移条目。
 *
 * 只读：不创建归档根、不改动任何条目。归档根不存在（ENOENT）返回空列表；存在但不可读
 * 返回 `archive-unavailable`。跳过的非目录 / 符号链接与读取失败都只经 `warn` 记录。
 * `log` 端口在场时还会做有界标题探测（见 {@link listArchiveEntries}）；缺省时列表行为
 * 与本次变更前逐字节一致，探测的任何失败都不进 `warn`。
 *
 * @param ports - 归档根、文件原语、告警出口与可选的日志读取端口。
 * @returns 列表（含归档根回声与截断标志）或稳定失败码。
 */
export async function listMigrated(
  ports: Pick<MigratedPorts, 'archiveRoot' | 'fs' | 'warn' | 'log'>,
): Promise<MigratedListingResult> {
  if (ports.archiveRoot === '') {
    return { ok: false, code: 'archive-unavailable', message: 'the archive root is empty' }
  }
  try {
    const { entries, truncated } = await listArchiveEntries(ports.fs, ports.archiveRoot, ports.warn, ports.log)
    return { ok: true, listing: { archiveRoot: ports.archiveRoot, entries, truncated } }
  } catch (error: unknown) {
    return {
      ok: false,
      code: 'archive-unavailable',
      message: `archive root "${ports.archiveRoot}" is not readable: ${reasonOf(error)}`,
    }
  }
}

/**
 * 物理删除一批迁移条目（两阶段）。
 *
 * **阶段 1（零写）**：逐条确认归档根下该条目存在且是目录；任一条失败即整单拒绝
 * （`not-migrated` / `bad-request` / `archive-unavailable`），一条都不删。
 *
 * **阶段 2（逐条、不中止）**：逐条 `rm -r`，失败只进 warnings。`removed` 为通过校验的
 * 全部会话 id——与既有删除语义一致：registry/目录的失败不回滚、不改变「这些条目已被
 * 处置」的结论，残留由 warnings 逐条点名。
 *
 * @param ports - 全部端口。
 * @param targets - 要删除的归档条目；重复项按首见顺序去重。
 * @returns 执行结果，或整单拒绝码。
 */
export async function deleteMigrated(
  ports: MigratedPorts,
  targets: readonly MigratedTarget[],
): Promise<MigratedDeleteResult> {
  const unique = uniqueTargets(targets)
  if (unique.length === 0) {
    return { ok: false, code: 'bad-request', message: 'no archive entries were selected' }
  }
  if (ports.archiveRoot === '') {
    return { ok: false, code: 'archive-unavailable', message: 'the archive root is empty' }
  }
  for (const target of unique) {
    const checked = await inspectArchiveEntry(ports.fs, ports.archiveRoot, target)
    if (!checked.ok) return checked
  }
  const files = createArchiveFiles({ homePath: ports.homePath, fs: ports.fs })
  const warnings = await files.remove(unique, ports.archiveRoot)
  return {
    ok: true,
    outcome: { removed: unique.map((target) => sessionIdOfEntry(target.dirName)), warnings },
  }
}

/**
 * 把一批迁移条目恢复回 `<home>/sessions` 并重新挂回工作区（两阶段）。
 *
 * **阶段 1（零写）**：逐条确认归档里存在该目录（否则 `not-migrated`），且目标位
 * `sessions/<projectDir>/<dirName>` 不存在（否则 `target-exists`）。任一条失败即整单
 * 拒绝，一条都不搬。
 *
 * **阶段 2（逐条、不中止）**：对每条走文件工厂的恢复（`mkdir -p` → `rename`，
 * `EXDEV` 回退复制），随后按 `projectDir` 匹配工作区并 `attachToWorkspace`、把会话重新
 * 放进归档集合、记入 `restored[]`。挂回 / 归档集合 / 广播的失败都只进 warnings——
 * 文件已经搬回就是既成事实，仍算已恢复（匹配不到工作区时 `workspaceId` 为 `null`，
 * attach 被上游拒绝时同样回落为 `null`）。循环结束只调一次 `announceRestored`。
 *
 * @param ports - 全部端口。
 * @param targets - 要恢复的归档条目；重复项按首见顺序去重。
 * @returns 恢复结果，或整单拒绝码。
 */
export async function restoreMigrated(
  ports: MigratedPorts,
  targets: readonly MigratedTarget[],
): Promise<RestoreResult> {
  const unique = uniqueTargets(targets)
  if (unique.length === 0) {
    return { ok: false, code: 'bad-request', message: 'no archive entries were selected' }
  }
  if (ports.archiveRoot === '') {
    return { ok: false, code: 'archive-unavailable', message: 'the archive root is empty' }
  }
  const checked: { readonly target: MigratedTarget; readonly updatedAt: number }[] = []
  for (const target of unique) {
    const entry = await inspectArchiveEntry(ports.fs, ports.archiveRoot, target)
    if (!entry.ok) return entry
    const destination = ports.homePath('sessions', target.projectDir, target.dirName)
    const targetCheck = await inspectRestoreTarget(ports.fs, destination)
    if (!targetCheck.ok) return targetCheck
    checked.push({ target, updatedAt: entry.updatedAt })
  }
  const warnings: string[] = []
  let workspaces: readonly MigratedWorkspace[] = []
  try {
    workspaces = ports.listWorkspaces()
  } catch (error: unknown) {
    warnings.push(`workspaces: ${reasonOf(error)}`)
    ports.warn('web-ux: listing the workspaces for restoring archived sessions failed', error)
  }
  const files = createArchiveFiles({ homePath: ports.homePath, fs: ports.fs })
  const restored: RestoredEntry[] = []
  const announced: { readonly sessionId: string; readonly updatedAt: number }[] = []
  for (const entry of checked) {
    const sessionId = sessionIdOfEntry(entry.target.dirName)
    const moved = await files.restore([entry.target], ports.archiveRoot)
    warnings.push(...moved.warnings)
    if (moved.moved.length === 0) continue
    let workspaceId: string | null = null
    try {
      const matched = ownerOfProjectDir(entry.target.projectDir, workspaces)
      if (matched === null) {
        warnings.push(`attach: ${sessionId}: no workspace matches project directory "${entry.target.projectDir}"`)
        ports.warn(`web-ux: restored session "${sessionId}" has no matching workspace; it stays ungrouped`)
      } else {
        await ports.attachToWorkspace(matched, sessionId)
        workspaceId = matched
      }
    } catch (error: unknown) {
      warnings.push(`attach: ${sessionId}: ${reasonOf(error)}`)
      ports.warn(`web-ux: attaching the restored session "${sessionId}" to its workspace failed`, error)
    }
    try {
      await ports.readdToArchiveSet(sessionId)
    } catch (error: unknown) {
      warnings.push(`archive-set: ${sessionId}: ${reasonOf(error)}`)
      ports.warn(`web-ux: putting the restored session "${sessionId}" back into the archive set failed`, error)
    }
    restored.push({ sessionId, workspaceId })
    announced.push({ sessionId, updatedAt: entry.updatedAt })
  }
  try {
    await ports.announceRestored(announced)
  } catch (error: unknown) {
    warnings.push(`announce: ${reasonOf(error)}`)
    ports.warn('web-ux: broadcasting the restored sessions failed', error)
  }
  return { ok: true, outcome: { restored, warnings } }
}
