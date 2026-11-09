/**
 * 「已迁移会话」域（`src/migrated.ts`）的单测：归档根两层枚举（`_no-cwd` 归组、
 * `session-` 前缀目录原样、非目录/符号链接跳过、`MAX_LISTED_MIGRATED` 截断）、物理
 * 删除的两阶段语义，以及恢复的 target-exists / EXDEV 回退 / attach·readd 降级 /
 * `announceRestored` 一次性调用与 ports 调用序。
 *
 * 全部通过注入的内存文件系统与 fake 端口驱动：不触碰真实磁盘、不需要 cordis。
 */

import { basename, dirname, join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  MAX_LISTED_MIGRATED,
  type DeleteOutcome,
  type MigratedListing,
  type MigratedTarget,
  type RestoreOutcome,
} from '../src/contract.ts'
import {
  MIGRATED_PROBE_CONCURRENCY,
  SESSION_ADDED_EVENT,
  createArchiveFiles,
  deleteMigrated,
  listMigrated,
  ownerOfProjectDir,
  restoreMigrated,
  sessionIdOfEntry,
  type MigratedFileOps,
  type MigratedLogOps,
  type MigratedPorts,
  type MigratedWorkspace,
} from '../src/migrated.ts'
import { projectKey } from '../src/project-key.ts'
import { INITIAL_LOG_PREFIX_BYTES } from '../src/session-log-title.ts'

/** 测试用的固定 DSH_HOME。 */
const HOME = '/home/tester/.dsh'

/** 宿主解析后的归档根。 */
const ARCHIVE_ROOT = '/data/dsh/archive/sessions'

/** 与工作区注册表匹配的一级目录名（= `projectKey('/home/dev/project')`）。 */
const PROJECT_DIR = '--home-dev-project--'

/** 另一个项目目录，用于跨项目枚举与去重。 */
const OTHER_PROJECT_DIR = '--home-dev-other--'

/** 无 cwd 会话的归档归组目录。 */
const NO_CWD = '_no-cwd'

/** 裸 UUID 形态的会话目录名。 */
const BARE_ID = '0a7083fd-0a7e-4c5f-9d38-6c0f3f7f2a11'

/** `session-<uuid>` 形态的会话目录名（当前部署的主流形态，D12 原样保留）。 */
const PREFIXED_ID = `session-${BARE_ID}`

/** 与 {@link PROJECT_DIR} 对应的工作区注册表投影。 */
const WORKSPACES: readonly MigratedWorkspace[] = [
  { workspaceId: 'ws-main', path: '/home/dev/project' },
]

/**
 * 构造一个归档条目身份。
 * @param projectDir - 归档根下一级目录名。
 * @param dirName - 会话目录名。
 * @returns 归档条目身份。
 */
function target(projectDir: string, dirName: string): MigratedTarget {
  return { projectDir, dirName }
}

/** 恢复目标 `<home>/sessions/<projectDir>/<dirName>` 的绝对路径。 */
function restoredPath(projectDir: string, dirName: string): string {
  return join(HOME, 'sessions', projectDir, dirName)
}

/** 造一个跨设备重命名错误（EXDEV），用于驱动 copyTree 回退。 */
function crossDeviceError(path: string): Error {
  return Object.assign(new Error(`EXDEV: cross-device link not permitted, ${path}`), { code: 'EXDEV' })
}

/** 可注入失败的文件操作。 */
type FakeOp = 'readdir' | 'lstat' | 'rm' | 'mkdir' | 'rename' | 'copyFile'

/** 内存文件系统：目录 / 文件 / 符号链接 / mtime 表 + 可注入的逐操作失败。 */
interface FakeFs {
  /** 交给流程的文件系统端口。 */
  readonly ops: MigratedFileOps
  /** 每次文件系统调用的记录，形如 `rename <from> -> <to>`。 */
  readonly calls: string[]
  /** 建目录（自顶向下调用，已存在则无操作）。 */
  addDir(path: string, mtimeMs?: number): void
  /** 建文件（父目录自动补齐）。 */
  addFile(path: string, size: number, mtimeMs?: number): void
  /** 建符号链接（只登记路径与自身大小，不跟随）。 */
  addSymlink(path: string, size?: number): void
  /** 让某个操作对某个路径抛错。 */
  fail(op: FakeOp, path: string, error: Error): void
  /** 路径是否仍存在。 */
  has(path: string): boolean
  /** 只含写动作（`rm` / `mkdir` / `rename` / `copyFile`）的调用记录。 */
  writes(): readonly string[]
}

/**
 * 建一个内存文件系统。
 * @returns 端口实现、调用记录、夹具构造与失败注入入口。
 */
function createFakeFs(): FakeFs {
  const dirs = new Map<string, Set<string>>()
  const files = new Map<string, number>()
  const symlinks = new Map<string, number>()
  const mtimes = new Map<string, number>()
  const failures = new Map<string, Error>()
  const calls: string[] = []

  const missing = (path: string): Error =>
    Object.assign(new Error(`ENOENT: no such file or directory, ${path}`), { code: 'ENOENT' })
  const notDirectory = (path: string): Error =>
    Object.assign(new Error(`ENOTDIR: not a directory, ${path}`), { code: 'ENOTDIR' })
  const exists = (path: string): Error =>
    Object.assign(new Error(`EEXIST: file already exists, ${path}`), { code: 'EEXIST' })
  const check = (op: string, path: string): void => {
    const failure = failures.get(`${op} ${path}`)
    if (failure !== undefined) throw failure
  }
  const detach = (path: string): void => {
    dirs.get(dirname(path))?.delete(basename(path))
  }
  const ensureDir = (path: string): void => {
    if (dirs.has(path)) return
    if (files.has(path) || symlinks.has(path)) throw exists(path)
    const parent = dirname(path)
    if (parent !== path) ensureDir(parent)
    dirs.set(path, new Set())
    if (parent !== path) dirs.get(parent)?.add(basename(path))
  }
  const dropTree = (path: string): void => {
    detach(path)
    files.delete(path)
    symlinks.delete(path)
    mtimes.delete(path)
    const children = dirs.get(path)
    if (children === undefined) return
    dirs.delete(path)
    for (const name of children) dropTree(join(path, name))
  }
  const moveMtime = (from: string, to: string): void => {
    const mtime = mtimes.get(from)
    if (mtime === undefined) return
    mtimes.delete(from)
    mtimes.set(to, mtime)
  }
  const moveTree = (from: string, to: string): void => {
    const linkSize = symlinks.get(from)
    if (linkSize !== undefined) {
      symlinks.delete(from)
      symlinks.set(to, linkSize)
      detach(from)
      dirs.get(dirname(to))?.add(basename(to))
      moveMtime(from, to)
      return
    }
    const size = files.get(from)
    if (size !== undefined) {
      files.delete(from)
      files.set(to, size)
      detach(from)
      dirs.get(dirname(to))?.add(basename(to))
      moveMtime(from, to)
      return
    }
    const children = dirs.get(from)
    if (children === undefined) throw missing(from)
    const names = [...children]
    dirs.delete(from)
    dirs.set(to, new Set())
    detach(from)
    dirs.get(dirname(to))?.add(basename(to))
    moveMtime(from, to)
    for (const name of names) moveTree(join(from, name), join(to, name))
  }

  const ops: MigratedFileOps = {
    readdir: async (path) => {
      calls.push(`readdir ${path}`)
      check('readdir', path)
      const children = dirs.get(path)
      if (children === undefined) {
        if (files.has(path) || symlinks.has(path)) throw notDirectory(path)
        throw missing(path)
      }
      return [...children].map((name) => ({
        name,
        isDirectory: () => dirs.has(join(path, name)),
        isSymbolicLink: () => symlinks.has(join(path, name)),
      }))
    },
    lstat: async (path) => {
      calls.push(`lstat ${path}`)
      check('lstat', path)
      if (dirs.has(path)) return { size: 0, mtimeMs: mtimes.get(path), isDirectory: () => true }
      const size = files.get(path)
      if (size !== undefined) return { size, mtimeMs: mtimes.get(path), isDirectory: () => false }
      const linkSize = symlinks.get(path)
      if (linkSize !== undefined) return { size: linkSize, mtimeMs: mtimes.get(path), isDirectory: () => false }
      throw missing(path)
    },
    rm: async (path, options) => {
      calls.push(`rm ${path}`)
      check('rm', path)
      if (!dirs.has(path) && !files.has(path) && !symlinks.has(path)) {
        if (!options.force) throw missing(path)
        return
      }
      dropTree(path)
    },
    mkdir: async (path, options) => {
      calls.push(`mkdir ${path}`)
      check('mkdir', path)
      if (dirs.has(path)) {
        if (options.recursive) return
        throw exists(path)
      }
      if (files.has(path) || symlinks.has(path)) throw exists(path)
      if (options.recursive) {
        ensureDir(path)
        return
      }
      if (!dirs.has(dirname(path))) throw missing(path)
      dirs.set(path, new Set())
      dirs.get(dirname(path))?.add(basename(path))
    },
    rename: async (from, to) => {
      calls.push(`rename ${from} -> ${to}`)
      check('rename', from)
      if (!dirs.has(from) && !files.has(from) && !symlinks.has(from)) throw missing(from)
      if (dirs.has(to) || files.has(to) || symlinks.has(to)) throw exists(to)
      moveTree(from, to)
    },
    copyFile: async (from, to) => {
      calls.push(`copyFile ${from} -> ${to}`)
      check('copyFile', from)
      const size = files.get(from)
      if (size === undefined) throw missing(from)
      if (!dirs.has(dirname(to))) throw missing(to)
      files.set(to, size)
      dirs.get(dirname(to))?.add(basename(to))
      moveMtime(from, to)
    },
  }

  return {
    ops,
    calls,
    addDir: (path, mtimeMs) => {
      ensureDir(path)
      if (mtimeMs !== undefined) mtimes.set(path, mtimeMs)
    },
    addFile: (path, size, mtimeMs) => {
      ensureDir(dirname(path))
      files.set(path, size)
      dirs.get(dirname(path))?.add(basename(path))
      if (mtimeMs !== undefined) mtimes.set(path, mtimeMs)
    },
    addSymlink: (path, size = 0) => {
      ensureDir(dirname(path))
      symlinks.set(path, size)
      dirs.get(dirname(path))?.add(basename(path))
    },
    fail: (op, path, error) => { failures.set(`${op} ${path}`, error) },
    has: (path) => dirs.has(path) || files.has(path) || symlinks.has(path),
    writes: () => calls.filter((call) => /^(?:rm|mkdir|rename|copyFile) /.test(call)),
  }
}

/**
 * 在归档根下建一条会话目录。
 * @param fake - 内存文件系统。
 * @param projectDir - 一级项目目录名。
 * @param dirName - 会话目录名。
 * @param mtimeMs - 目录 mtime（省略表示 fake 不提供）。
 * @returns 会话目录的绝对路径。
 */
function addArchived(fake: FakeFs, projectDir: string, dirName: string, mtimeMs?: number): string {
  const path = join(ARCHIVE_ROOT, projectDir, dirName)
  fake.addDir(path, mtimeMs)
  return path
}

/** 一个只收集 warn 文案的告警出口。 */
interface WarningSink {
  /** 收到的文案（按调用顺序）。 */
  readonly messages: string[]
  /** 传给 `listMigrated` 的 warn。 */
  readonly warn: (message: string) => void
}

/**
 * 建一个收集告警文案的 sink。
 * @returns sink 本身。
 */
function warnSink(): WarningSink {
  const messages: string[] = []
  return { messages, warn: (message) => { messages.push(message) } }
}

/**
 * 调 `listMigrated` 并解出 listing；失败用例直接调用原函数断言失败码。
 * @param fake - 内存文件系统。
 * @param warn - 告警出口，默认丢弃。
 * @param archiveRoot - 归档根，默认 {@link ARCHIVE_ROOT}。
 * @param log - 可选的日志读取端口（缺省 = 不做标题探测）。
 * @returns 列表结论。
 */
async function listingOf(
  fake: FakeFs,
  warn: (message: string) => void = () => {},
  archiveRoot: string = ARCHIVE_ROOT,
  log?: MigratedLogOps,
): Promise<MigratedListing> {
  const result = await listMigrated({ archiveRoot, fs: fake.ops, warn, log })
  if (!result.ok) throw new Error(`expected a listing, got ${result.code}: ${result.message}`)
  return result.listing
}

/**
 * 调 `deleteMigrated` 并解出执行结果；失败用例直接调用原函数断言失败码。
 * @param ports - fake 端口。
 * @param targets - 归档条目。
 * @returns 删除结论。
 */
async function deleteOf(ports: MigratedPorts, targets: readonly MigratedTarget[]): Promise<DeleteOutcome> {
  const result = await deleteMigrated(ports, targets)
  if (!result.ok) throw new Error(`expected a delete outcome, got ${result.code}: ${result.message}`)
  return result.outcome
}

/**
 * 调 `restoreMigrated` 并解出恢复结果；失败用例直接调用原函数断言失败码。
 * @param ports - fake 端口。
 * @param targets - 归档条目。
 * @returns 恢复结论。
 */
async function restoreOf(ports: MigratedPorts, targets: readonly MigratedTarget[]): Promise<RestoreOutcome> {
  const result = await restoreMigrated(ports, targets)
  if (!result.ok) throw new Error(`expected a restore outcome, got ${result.code}: ${result.message}`)
  return result.outcome
}

/** 一次 fake 端口组装的产物。 */
interface RecordingPorts {
  /** 交给流程的端口。 */
  readonly ports: MigratedPorts
  /** 端口调用序列，形如 `attach:<workspaceId>:<sessionId>`。 */
  readonly calls: string[]
  /** `warn` 收到的参数。 */
  readonly warnings: unknown[][]
  /** `announceRestored` 每次收到的条目（按调用顺序）。 */
  readonly announced: { readonly sessionId: string; readonly updatedAt: number }[][]
}

/** fake 端口的可调行为。 */
interface PortOptions {
  /** 归档根，默认 {@link ARCHIVE_ROOT}。 */
  readonly archiveRoot?: string
  /** 工作区注册表投影，或每次调用重新求值的函数（用于模拟抛错）。 */
  readonly workspaces?: readonly MigratedWorkspace[] | (() => readonly MigratedWorkspace[])
  /** `attachToWorkspace` 的替身，默认只记录调用。 */
  readonly attach?: (workspaceId: string, sessionId: string) => Promise<void>
  /** `readdToArchiveSet` 的替身，默认只记录调用。 */
  readonly readd?: (sessionId: string) => Promise<void>
  /** `announceRestored` 的替身，默认只记录调用。 */
  readonly announce?: (
    entries: readonly { readonly sessionId: string; readonly updatedAt: number }[],
  ) => Promise<void>
}

/**
 * 组装一组会记录调用序列的 fake 端口。
 * @param fs - 文件系统端口。
 * @param options - 每个端口的行为覆盖。
 * @returns 端口本身与记录下来的调用 / 告警 / 广播载荷。
 */
function createPorts(fs: MigratedFileOps, options: PortOptions = {}): RecordingPorts {
  const calls: string[] = []
  const warnings: unknown[][] = []
  const announced: { readonly sessionId: string; readonly updatedAt: number }[][] = []
  const workspacesOf = (): readonly MigratedWorkspace[] =>
    typeof options.workspaces === 'function' ? options.workspaces() : options.workspaces ?? []
  const ports: MigratedPorts = {
    archiveRoot: options.archiveRoot ?? ARCHIVE_ROOT,
    homePath: (...segments: string[]) => join(HOME, ...segments),
    fs,
    listWorkspaces: () => {
      calls.push('listWorkspaces')
      return workspacesOf()
    },
    attachToWorkspace: async (workspaceId, sessionId) => {
      calls.push(`attach:${workspaceId}:${sessionId}`)
      await options.attach?.(workspaceId, sessionId)
    },
    readdToArchiveSet: async (sessionId) => {
      calls.push(`readd:${sessionId}`)
      await options.readd?.(sessionId)
    },
    announceRestored: async (entries) => {
      announced.push([...entries])
      calls.push(`announce:${entries.map((entry) => entry.sessionId).join(',')}`)
      await options.announce?.(entries)
    },
    warn: (message, error) => { warnings.push([message, error]) },
  }
  return { ports, calls, warnings, announced }
}

describe('SESSION_ADDED_EVENT', () => {
  it('恢复后广播的事件名与线上约定一致', () => {
    expect(SESSION_ADDED_EVENT).toBe('api-session/added')
  })
})

describe('sessionIdOfEntry', () => {
  it('裸 UUID 原样返回', () => {
    expect(sessionIdOfEntry(BARE_ID)).toBe(BARE_ID)
  })

  it('`session-` 前缀是 id 的一部分，不做前缀归一（D12）', () => {
    expect(sessionIdOfEntry(PREFIXED_ID)).toBe(PREFIXED_ID)
  })
})

describe('ownerOfProjectDir', () => {
  it('按 projectKey(workspace.path) 匹配一级目录名', () => {
    expect(projectKey('/home/dev/project')).toBe(PROJECT_DIR)
    expect(ownerOfProjectDir(PROJECT_DIR, WORKSPACES)).toBe('ws-main')
  })

  it('无命中返回 null（`_no-cwd` 归入未分组）', () => {
    expect(ownerOfProjectDir(NO_CWD, WORKSPACES)).toBeNull()
  })

  it('多个工作区同键时按注册顺序取第一个', () => {
    const workspaces: readonly MigratedWorkspace[] = [
      { workspaceId: 'ws-first', path: '/home/dev/project' },
      { workspaceId: 'ws-second', path: '/home/dev/project' },
    ]
    expect(ownerOfProjectDir(PROJECT_DIR, workspaces)).toBe('ws-first')
  })
})

describe('listMigrated', () => {
  it('两层枚举：项目目录 × 会话目录，`session-` 前缀与 mtime 原样透出', async () => {
    const fake = createFakeFs()
    const bare = addArchived(fake, PROJECT_DIR, BARE_ID, 1_700_000_000_000)
    fake.addFile(join(bare, 'session.v4.jsonl.zstd'), 120)
    fake.addFile(join(bare, 'meta.json'), 30)
    const prefixed = addArchived(fake, PROJECT_DIR, PREFIXED_ID)
    fake.addFile(join(prefixed, 'session.v4.jsonl.zstd'), 7)
    addArchived(fake, OTHER_PROJECT_DIR, BARE_ID)

    expect(await listingOf(fake)).toEqual({
      archiveRoot: ARCHIVE_ROOT,
      entries: [
        {
          sessionId: BARE_ID,
          dirName: BARE_ID,
          projectDir: PROJECT_DIR,
          bytes: 150,
          updatedAt: 1_700_000_000_000,
        },
        {
          sessionId: PREFIXED_ID,
          dirName: PREFIXED_ID,
          projectDir: PROJECT_DIR,
          bytes: 7,
          updatedAt: 0,
        },
        {
          sessionId: BARE_ID,
          dirName: BARE_ID,
          projectDir: OTHER_PROJECT_DIR,
          bytes: 0,
          updatedAt: 0,
        },
      ],
      truncated: false,
    })
  })

  it('`_no-cwd` 作为一级目录归组列出', async () => {
    const fake = createFakeFs()
    const path = addArchived(fake, NO_CWD, 'session-orphan')
    fake.addFile(join(path, 'session.v4.jsonl.zstd'), 9)

    const sink = warnSink()
    expect(await listingOf(fake, sink.warn)).toEqual({
      archiveRoot: ARCHIVE_ROOT,
      entries: [
        {
          sessionId: 'session-orphan',
          dirName: 'session-orphan',
          projectDir: NO_CWD,
          bytes: 9,
          updatedAt: 0,
        },
      ],
      truncated: false,
    })
    expect(sink.messages).toEqual([])
  })

  it('bytes 只求和会话目录内一层文件，子目录内容不展开、符号链接按自身大小计', async () => {
    const fake = createFakeFs()
    const session = addArchived(fake, PROJECT_DIR, BARE_ID)
    fake.addFile(join(session, 'session.v4.jsonl.zstd'), 100)
    fake.addFile(join(session, 'meta.json'), 20)
    fake.addDir(join(session, 'parts'))
    fake.addFile(join(session, 'parts', 'part-1'), 1000)
    fake.addSymlink(join(session, 'latest'), 5)

    const listing = await listingOf(fake)
    expect(listing.entries).toHaveLength(1)
    expect(listing.entries[0]?.bytes).toBe(125)
  })

  it('一级非目录与符号链接跳过并逐条 warn，不递归进链接', async () => {
    const fake = createFakeFs()
    addArchived(fake, PROJECT_DIR, BARE_ID)
    const stray = join(ARCHIVE_ROOT, 'stray.txt')
    const linked = join(ARCHIVE_ROOT, 'linked-project')
    fake.addFile(stray, 3)
    fake.addSymlink(linked)

    const sink = warnSink()
    const listing = await listingOf(fake, sink.warn)
    expect(listing.entries.map((entry) => entry.sessionId)).toEqual([BARE_ID])
    expect(sink.messages).toEqual([
      `${stray}: not a directory; skipped`,
      `${linked}: symbolic-linked project directory was not followed`,
    ])
    expect(fake.calls).not.toContain(`readdir ${linked}`)
  })

  it('二级非目录与符号链接跳过并逐条 warn，合法会话目录照常列出', async () => {
    const fake = createFakeFs()
    const session = addArchived(fake, PROJECT_DIR, BARE_ID)
    fake.addFile(join(session, 'session.v4.jsonl.zstd'), 10)
    const projectPath = join(ARCHIVE_ROOT, PROJECT_DIR)
    const stray = join(projectPath, 'notes.txt')
    const linked = join(projectPath, PREFIXED_ID)
    fake.addFile(stray, 1)
    fake.addSymlink(linked)

    const sink = warnSink()
    const listing = await listingOf(fake, sink.warn)
    expect(listing.entries.map((entry) => entry.sessionId)).toEqual([BARE_ID])
    expect(sink.messages).toEqual([
      `${stray}: not a directory; skipped`,
      `${linked}: symbolic-linked session directory was not followed`,
    ])
  })

  it(`恰好 ${MAX_LISTED_MIGRATED} 条不截断；再多一条则 truncated:true 且只列 ${MAX_LISTED_MIGRATED} 条`, async () => {
    const fake = createFakeFs()
    const projectPath = join(ARCHIVE_ROOT, PROJECT_DIR)
    fake.addDir(projectPath)
    for (let index = 0; index < MAX_LISTED_MIGRATED; index += 1) {
      fake.addDir(join(projectPath, `session-${index}`))
    }

    const atLimit = await listingOf(fake)
    expect(atLimit.entries).toHaveLength(MAX_LISTED_MIGRATED)
    expect(atLimit.truncated).toBe(false)

    fake.addDir(join(projectPath, 'session-overflow'))
    const overflow = await listingOf(fake)
    expect(overflow.entries).toHaveLength(MAX_LISTED_MIGRATED)
    expect(overflow.truncated).toBe(true)
    expect(overflow.entries.at(-1)?.sessionId).toBe(`session-${MAX_LISTED_MIGRATED - 1}`)
  })

  it('归档根不存在（ENOENT）⇒ 空列表，不是错误', async () => {
    const fake = createFakeFs()
    expect(await listingOf(fake)).toEqual({ archiveRoot: ARCHIVE_ROOT, entries: [], truncated: false })
  })

  it('归档根是文件 ⇒ archive-unavailable', async () => {
    const fake = createFakeFs()
    fake.addFile(ARCHIVE_ROOT, 4)
    expect(await listMigrated({ archiveRoot: ARCHIVE_ROOT, fs: fake.ops, warn: () => {} })).toEqual({
      ok: false,
      code: 'archive-unavailable',
      message: expect.stringContaining(ARCHIVE_ROOT),
    })
  })

  it('空 archiveRoot ⇒ archive-unavailable，且不触碰文件系统', async () => {
    const fake = createFakeFs()
    const result = await listMigrated({ archiveRoot: '', fs: fake.ops, warn: () => {} })
    expect(result).toMatchObject({ ok: false, code: 'archive-unavailable' })
    expect(fake.calls).toEqual([])
  })

  it('会话目录成员读失败 ⇒ warn 且该条 bytes 按 0，条目仍列出', async () => {
    const fake = createFakeFs()
    const session = addArchived(fake, PROJECT_DIR, BARE_ID)
    fake.fail('readdir', session, new Error('EACCES: permission denied'))

    const sink = warnSink()
    const listing = await listingOf(fake, sink.warn)
    expect(listing.entries).toEqual([
      { sessionId: BARE_ID, dirName: BARE_ID, projectDir: PROJECT_DIR, bytes: 0, updatedAt: 0 },
    ])
    expect(sink.messages).toEqual([`${session}: EACCES: permission denied`])
  })
})

/* ------------------------------------------------------------------ */
/* 标题探测（log 端口）                                                  */
/* ------------------------------------------------------------------ */

/** 纯 JSONL 前缀：header 行（`createdAt`）+ title 行，可直接被探测解码。 */
const JSONL_WITH_TITLE =
  '{"type":"session","createdAt":1700000000000}\n{"type":"session/title","data":{"title":"标题"}}\n'

/** 压缩容器前缀：同一份 JSONL 逐帧 zstd 压缩后拼接（两个完整帧，探测命中第一帧即止）。 */
const ZSTD_FRAMES_WITH_TITLE = Buffer.concat([
  zstdCompressSync(Buffer.from(JSONL_WITH_TITLE)),
  zstdCompressSync(Buffer.from(JSONL_WITH_TITLE)),
])

/** UTF-8 编码助手（JSONL 夹具 → 字节）。 */
function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** fake 日志端口的观察面。 */
interface FakeLog {
  /** 交给 `listMigrated` 的 log 端口。 */
  readonly ops: MigratedLogOps
  /** 每次 `readPrefix` 的记录（路径 + 请求长度）。 */
  readonly reads: { readonly path: string; readonly length: number }[]
  /** 某条路径的 `readPrefix` 调用次数。 */
  countOf(path: string): number
  /** `readPrefix` 的在途峰值（tick 模式下观察 worker 池上限）。 */
  peakCount(): number
}

/** fake 日志端口的可调行为。 */
interface FakeLogOptions {
  /** 给定时 `readPrefix` 一律 reject（探测的读失败降级）。 */
  readonly readError?: string
  /** 给定时 `decompressFrame` 一律抛（解压失败降级）。 */
  readonly decompressError?: string
  /** 覆盖首次前缀长度（驱动两段读取）。 */
  readonly initialPrefixBytes?: number
  /** 覆盖前缀硬上限。 */
  readonly maxPrefixBytes?: number
  /** true = 每次 `readPrefix` 挂一拍 macrotask，让 worker 池的在途交错可观察。 */
  readonly tick?: boolean
}

/**
 * 建一个内存 log 端口：按 `length` 截断返回预设前缀（真 reader 的 EOF 语义），解压
 * 默认委托真实 zlib（纯 JSONL 用例根本不会走到解压）。
 */
function createFakeLog(contents: ReadonlyMap<string, Uint8Array>, options: FakeLogOptions = {}): FakeLog {
  const reads: { path: string; length: number }[] = []
  const counts = new Map<string, number>()
  let inFlight = 0
  let peak = 0
  const ops: MigratedLogOps = {
    readPrefix: async (path, length) => {
      reads.push({ path, length })
      counts.set(path, (counts.get(path) ?? 0) + 1)
      inFlight += 1
      peak = Math.max(peak, inFlight)
      if (options.tick) await new Promise((resolve) => { setTimeout(resolve, 0) })
      inFlight -= 1
      if (options.readError !== undefined) throw new Error(options.readError)
      return (contents.get(path) ?? new Uint8Array(0)).subarray(0, length)
    },
    decompressFrame: (frame) => {
      if (options.decompressError !== undefined) throw new Error(options.decompressError)
      return zstdDecompressSync(frame)
    },
    ...(options.initialPrefixBytes === undefined ? {} : { initialPrefixBytes: options.initialPrefixBytes }),
    ...(options.maxPrefixBytes === undefined ? {} : { maxPrefixBytes: options.maxPrefixBytes }),
  }
  return { ops, reads, countOf: (path) => counts.get(path) ?? 0, peakCount: () => peak }
}

describe('listMigrated:标题探测(log 端口)', () => {
  it('纯 JSONL 命中：条目携带 title 与 createdAt，其余字段逐项不变', async () => {
    const fake = createFakeFs()
    const session = addArchived(fake, PROJECT_DIR, BARE_ID, 1_700_000_123_456)
    const logPath = join(session, 'session.jsonl')
    fake.addFile(logPath, 64)
    const log = createFakeLog(new Map([[logPath, encodeUtf8(JSONL_WITH_TITLE)]]))
    const sink = warnSink()

    expect(await listingOf(fake, sink.warn, ARCHIVE_ROOT, log.ops)).toEqual({
      archiveRoot: ARCHIVE_ROOT,
      entries: [{
        sessionId: BARE_ID,
        dirName: BARE_ID,
        projectDir: PROJECT_DIR,
        bytes: 64,
        updatedAt: 1_700_000_123_456,
        title: '标题',
        createdAt: 1_700_000_000_000,
      }],
      truncated: false,
    })
    expect(log.reads).toEqual([{ path: logPath, length: INITIAL_LOG_PREFIX_BYTES }])
    expect(sink.messages).toEqual([])
  })

  it('压缩日志命中：真实 zstd 帧拼接经端口解出同一字段', async () => {
    const fake = createFakeFs()
    const session = addArchived(fake, PROJECT_DIR, PREFIXED_ID)
    const logPath = join(session, 'session.v4.jsonl.zstd')
    fake.addFile(logPath, ZSTD_FRAMES_WITH_TITLE.byteLength)
    const log = createFakeLog(new Map([[logPath, ZSTD_FRAMES_WITH_TITLE]]))

    const listing = await listingOf(fake, () => {}, ARCHIVE_ROOT, log.ops)
    expect(listing.entries[0]).toMatchObject({
      sessionId: PREFIXED_ID,
      title: '标题',
      createdAt: 1_700_000_000_000,
    })
  })

  it('不注入 log 端口 ⇒ title 与 createdAt 两个键都不存在（列表行为与变更前一致）', async () => {
    const fake = createFakeFs()
    const session = addArchived(fake, PROJECT_DIR, BARE_ID)
    fake.addFile(join(session, 'session.jsonl'), 64)
    const listing = await listingOf(fake)
    const entry = listing.entries[0]
    expect(entry).toBeDefined()
    expect('title' in entry).toBe(false)
    expect('createdAt' in entry).toBe(false)
  })

  it('目录里只有 session.lock（无规范日志名）⇒ 零 readPrefix 调用，条目照常列出', async () => {
    const fake = createFakeFs()
    const session = addArchived(fake, PROJECT_DIR, BARE_ID)
    fake.addFile(join(session, 'session.lock'), 4)
    const log = createFakeLog(new Map())

    const listing = await listingOf(fake, () => {}, ARCHIVE_ROOT, log.ops)
    expect(log.reads).toEqual([])
    expect(listing.entries).toHaveLength(1)
    expect(listing.entries[0]).not.toHaveProperty('title')
    expect(listing.entries[0]).not.toHaveProperty('createdAt')
  })

  it('readPrefix reject ⇒ 列表照常、字段缺省、零 warning', async () => {
    const fake = createFakeFs()
    const session = addArchived(fake, PROJECT_DIR, BARE_ID)
    const logPath = join(session, 'session.jsonl')
    fake.addFile(logPath, 64)
    const log = createFakeLog(new Map([[logPath, encodeUtf8(JSONL_WITH_TITLE)]]), {
      readError: 'EACCES: permission denied',
    })
    const sink = warnSink()

    const listing = await listingOf(fake, sink.warn, ARCHIVE_ROOT, log.ops)
    expect(listing.entries[0]).toMatchObject({ sessionId: BARE_ID, bytes: 64 })
    expect('title' in listing.entries[0]).toBe(false)
    expect('createdAt' in listing.entries[0]).toBe(false)
    expect(sink.messages).toEqual([])
  })

  it('decompressFrame 抛错 ⇒ 停止扫描、列表照常、字段缺省、零 warning', async () => {
    const fake = createFakeFs()
    const session = addArchived(fake, PROJECT_DIR, PREFIXED_ID)
    const logPath = join(session, 'session.v4.jsonl.zstd')
    fake.addFile(logPath, ZSTD_FRAMES_WITH_TITLE.byteLength)
    const log = createFakeLog(new Map([[logPath, ZSTD_FRAMES_WITH_TITLE]]), { decompressError: 'boom' })
    const sink = warnSink()

    const listing = await listingOf(fake, sink.warn, ARCHIVE_ROOT, log.ops)
    expect(listing.entries[0]).toMatchObject({ sessionId: PREFIXED_ID, bytes: ZSTD_FRAMES_WITH_TITLE.byteLength })
    expect('title' in listing.entries[0]).toBe(false)
    expect('createdAt' in listing.entries[0]).toBe(false)
    expect(sink.messages).toEqual([])
  })

  it(`worker 池在途峰值恰为 ${MIGRATED_PROBE_CONCURRENCY}（7 条条目不超上限）`, async () => {
    const fake = createFakeFs()
    for (let index = 0; index < 7; index += 1) {
      const session = addArchived(fake, PROJECT_DIR, `session-concurrent-${index}`)
      fake.addFile(join(session, 'session.jsonl'), 8)
    }
    const log = createFakeLog(new Map(), { tick: true })

    const listing = await listingOf(fake, () => {}, ARCHIVE_ROOT, log.ops)
    expect(listing.entries).toHaveLength(7)
    expect(log.reads).toHaveLength(7)
    expect(log.peakCount()).toBe(MIGRATED_PROBE_CONCURRENCY)
  })

  it('单条目 readPrefix 至多两次：首段读满未命中才补读；只有 header ⇒ 只携带 createdAt', async () => {
    const fake = createFakeFs()
    const session = addArchived(fake, PROJECT_DIR, BARE_ID)
    const logPath = join(session, 'session.jsonl')
    fake.addFile(logPath, 20)
    // 33 字节的纯 header 行：小预算（16 读满 ⇒ 补读 40 容纳全量）驱动两段读取路径。
    const noTitle = '{"type":"session","createdAt":1}\n'
    const log = createFakeLog(new Map([[logPath, encodeUtf8(noTitle)]]), {
      initialPrefixBytes: 16,
      maxPrefixBytes: 40,
    })

    const listing = await listingOf(fake, () => {}, ARCHIVE_ROOT, log.ops)
    expect(log.reads).toEqual([
      { path: logPath, length: 16 },
      { path: logPath, length: 40 },
    ])
    expect(log.countOf(logPath)).toBeLessThanOrEqual(2)
    expect(listing.entries[0]).toMatchObject({ sessionId: BARE_ID, createdAt: 1 })
    expect('title' in listing.entries[0]).toBe(false)
  })
})

describe('createArchiveFiles.list', () => {
  it('warn 可省（默认 no-op），跳过项不抛错', async () => {
    const fake = createFakeFs()
    fake.addDir(ARCHIVE_ROOT)
    fake.addFile(join(ARCHIVE_ROOT, 'stray.txt'), 2)
    const files = createArchiveFiles({ homePath: (...segments: string[]) => join(HOME, ...segments), fs: fake.ops })
    expect(await files.list(ARCHIVE_ROOT)).toEqual({ entries: [], truncated: false })
  })
})

describe('deleteMigrated', () => {
  it('阶段 1 有一条缺失 ⇒ not-migrated 整单拒绝、零写、零端口动作', async () => {
    const fake = createFakeFs()
    const existing = addArchived(fake, PROJECT_DIR, BARE_ID)
    const missingPath = join(ARCHIVE_ROOT, PROJECT_DIR, PREFIXED_ID)
    const { ports, calls } = createPorts(fake.ops)

    expect(await deleteMigrated(ports, [target(PROJECT_DIR, BARE_ID), target(PROJECT_DIR, PREFIXED_ID)])).toEqual({
      ok: false,
      code: 'not-migrated',
      message: expect.stringContaining(missingPath),
    })
    expect(fake.has(existing)).toBe(true)
    expect(fake.writes()).toEqual([])
    expect(calls).toEqual([])
  })

  it('成功：removed 取目录名（两代 id 原样），每条 rm 一次且无 warning', async () => {
    const fake = createFakeFs()
    const bare = addArchived(fake, PROJECT_DIR, BARE_ID)
    const prefixed = addArchived(fake, OTHER_PROJECT_DIR, PREFIXED_ID)
    const { ports, warnings } = createPorts(fake.ops)

    expect(await deleteOf(ports, [target(PROJECT_DIR, BARE_ID), target(OTHER_PROJECT_DIR, PREFIXED_ID)])).toEqual({
      removed: [BARE_ID, PREFIXED_ID],
      warnings: [],
    })
    expect(fake.has(bare)).toBe(false)
    expect(fake.has(prefixed)).toBe(false)
    expect(warnings).toEqual([])
  })

  it('重复目标按首见去重，只删一次', async () => {
    const fake = createFakeFs()
    const bare = addArchived(fake, PROJECT_DIR, BARE_ID)
    const prefixed = addArchived(fake, PROJECT_DIR, PREFIXED_ID)
    const { ports } = createPorts(fake.ops)

    expect(await deleteOf(ports, [
      target(PROJECT_DIR, BARE_ID),
      target(PROJECT_DIR, BARE_ID),
      target(PROJECT_DIR, PREFIXED_ID),
      target(PROJECT_DIR, BARE_ID),
    ])).toEqual({ removed: [BARE_ID, PREFIXED_ID], warnings: [] })
    expect(fake.calls.filter((call) => call.startsWith('rm '))).toEqual([`rm ${bare}`, `rm ${prefixed}`])
  })

  it('rm 失败只进 warnings，不中止后续条目，removed 仍为整单', async () => {
    const fake = createFakeFs()
    const failing = addArchived(fake, PROJECT_DIR, BARE_ID)
    const healthy = addArchived(fake, PROJECT_DIR, PREFIXED_ID)
    fake.fail('rm', failing, new Error('EACCES: permission denied'))
    const { ports } = createPorts(fake.ops)

    expect(await deleteOf(ports, [target(PROJECT_DIR, BARE_ID), target(PROJECT_DIR, PREFIXED_ID)])).toEqual({
      removed: [BARE_ID, PREFIXED_ID],
      warnings: [`${failing}: EACCES: permission denied`],
    })
    expect(fake.has(failing)).toBe(true)
    expect(fake.has(healthy)).toBe(false)
  })

  it('空批次 ⇒ bad-request，不触碰文件系统', async () => {
    const fake = createFakeFs()
    const { ports, calls } = createPorts(fake.ops)
    expect(await deleteMigrated(ports, [])).toMatchObject({ ok: false, code: 'bad-request' })
    expect(fake.calls).toEqual([])
    expect(calls).toEqual([])
  })

  it('非法路径片段 ⇒ bad-request，零文件动作', async () => {
    const fake = createFakeFs()
    const { ports } = createPorts(fake.ops)
    expect(await deleteMigrated(ports, [target('..', BARE_ID)])).toMatchObject({ ok: false, code: 'bad-request' })
    expect(await deleteMigrated(ports, [target(PROJECT_DIR, 'a/b')])).toMatchObject({ ok: false, code: 'bad-request' })
    expect(await deleteMigrated(ports, [target(PROJECT_DIR, '')])).toMatchObject({ ok: false, code: 'bad-request' })
    expect(fake.calls).toEqual([])
  })

  it('空 archiveRoot ⇒ archive-unavailable，不触碰文件系统', async () => {
    const fake = createFakeFs()
    const { ports } = createPorts(fake.ops, { archiveRoot: '' })
    expect(await deleteMigrated(ports, [target(PROJECT_DIR, BARE_ID)])).toMatchObject({
      ok: false,
      code: 'archive-unavailable',
    })
    expect(fake.calls).toEqual([])
  })

  it('条目是文件而非目录 ⇒ not-migrated（零写）', async () => {
    const fake = createFakeFs()
    const projectPath = join(ARCHIVE_ROOT, PROJECT_DIR)
    fake.addDir(projectPath)
    fake.addFile(join(projectPath, BARE_ID), 10)
    const { ports } = createPorts(fake.ops)

    expect(await deleteMigrated(ports, [target(PROJECT_DIR, BARE_ID)])).toEqual({
      ok: false,
      code: 'not-migrated',
      message: expect.stringContaining('is not a directory'),
    })
    expect(fake.writes()).toEqual([])
  })

  it('lstat 非 ENOENT 失败 ⇒ archive-unavailable', async () => {
    const fake = createFakeFs()
    const path = addArchived(fake, PROJECT_DIR, BARE_ID)
    fake.fail('lstat', path, new Error('EACCES: permission denied'))
    const { ports } = createPorts(fake.ops)

    expect(await deleteMigrated(ports, [target(PROJECT_DIR, BARE_ID)])).toEqual({
      ok: false,
      code: 'archive-unavailable',
      message: expect.stringContaining('EACCES: permission denied'),
    })
    expect(fake.writes()).toEqual([])
  })
})

describe('createArchiveFiles.remove', () => {
  it('逐条删除并只报告失败项，不中止后续条目', async () => {
    const fake = createFakeFs()
    const failing = addArchived(fake, PROJECT_DIR, BARE_ID)
    const healthy = addArchived(fake, PROJECT_DIR, PREFIXED_ID)
    fake.fail('rm', failing, new Error('EACCES: permission denied'))
    const files = createArchiveFiles({ homePath: (...segments: string[]) => join(HOME, ...segments), fs: fake.ops })

    expect(await files.remove(
      [target(PROJECT_DIR, BARE_ID), target(PROJECT_DIR, PREFIXED_ID)],
      ARCHIVE_ROOT,
    )).toEqual([`${failing}: EACCES: permission denied`])
    expect(fake.has(failing)).toBe(true)
    expect(fake.has(healthy)).toBe(false)
  })
})

describe('createArchiveFiles.restore', () => {
  it('逐条返回 moved 与 warnings，成功项源消失、失败项源保留', async () => {
    const fake = createFakeFs()
    const moved = addArchived(fake, PROJECT_DIR, BARE_ID)
    const broken = addArchived(fake, PROJECT_DIR, PREFIXED_ID)
    fake.fail('rename', broken, new Error('EACCES: permission denied'))
    const files = createArchiveFiles({ homePath: (...segments: string[]) => join(HOME, ...segments), fs: fake.ops })

    expect(await files.restore(
      [target(PROJECT_DIR, BARE_ID), target(PROJECT_DIR, PREFIXED_ID)],
      ARCHIVE_ROOT,
    )).toEqual({
      moved: [target(PROJECT_DIR, BARE_ID)],
      warnings: [`${broken} -> ${restoredPath(PROJECT_DIR, PREFIXED_ID)}: EACCES: permission denied`],
    })
    expect(fake.has(moved)).toBe(false)
    expect(fake.has(restoredPath(PROJECT_DIR, BARE_ID))).toBe(true)
    expect(fake.has(broken)).toBe(true)
  })
})

describe('restoreMigrated', () => {
  it('恢复成功：mkdir 父级 → rename，按 attach → readd → announce 逐条执行', async () => {
    const fake = createFakeFs()
    const archive = addArchived(fake, PROJECT_DIR, PREFIXED_ID, 1_700_000_123_456)
    fake.addFile(join(archive, 'session.v4.jsonl.zstd'), 42)
    const restored = restoredPath(PROJECT_DIR, PREFIXED_ID)
    const { ports, calls, warnings, announced } = createPorts(fake.ops, { workspaces: WORKSPACES })

    expect(await restoreOf(ports, [target(PROJECT_DIR, PREFIXED_ID)])).toEqual({
      restored: [{ sessionId: PREFIXED_ID, workspaceId: 'ws-main' }],
      warnings: [],
    })
    expect(fake.has(archive)).toBe(false)
    expect(fake.has(join(restored, 'session.v4.jsonl.zstd'))).toBe(true)
    expect(fake.calls).toEqual([
      `lstat ${archive}`,
      `lstat ${restored}`,
      `mkdir ${join(HOME, 'sessions', PROJECT_DIR)}`,
      `rename ${archive} -> ${restored}`,
    ])
    expect(calls).toEqual([
      'listWorkspaces',
      `attach:ws-main:${PREFIXED_ID}`,
      `readd:${PREFIXED_ID}`,
      `announce:${PREFIXED_ID}`,
    ])
    expect(announced).toEqual([[{ sessionId: PREFIXED_ID, updatedAt: 1_700_000_123_456 }]])
    expect(warnings).toEqual([])
  })

  it('目标位已存在 ⇒ target-exists 整单拒绝，源与已存在目录都不动', async () => {
    const fake = createFakeFs()
    const first = addArchived(fake, PROJECT_DIR, BARE_ID)
    const second = addArchived(fake, OTHER_PROJECT_DIR, PREFIXED_ID)
    const occupied = restoredPath(OTHER_PROJECT_DIR, PREFIXED_ID)
    fake.addDir(occupied, 555)
    const { ports, calls, announced } = createPorts(fake.ops, { workspaces: WORKSPACES })

    expect(await restoreMigrated(ports, [
      target(PROJECT_DIR, BARE_ID),
      target(OTHER_PROJECT_DIR, PREFIXED_ID),
    ])).toEqual({
      ok: false,
      code: 'target-exists',
      message: expect.stringContaining(occupied),
    })
    expect(fake.has(first)).toBe(true)
    expect(fake.has(second)).toBe(true)
    expect(fake.writes()).toEqual([])
    expect(calls).toEqual([])
    expect(announced).toEqual([])
  })

  it('归档条目缺失 ⇒ not-migrated 整单拒绝、零写', async () => {
    const fake = createFakeFs()
    const existing = addArchived(fake, PROJECT_DIR, BARE_ID)
    const { ports, calls } = createPorts(fake.ops, { workspaces: WORKSPACES })

    expect(await restoreMigrated(ports, [target(PROJECT_DIR, BARE_ID), target(PROJECT_DIR, PREFIXED_ID)])).toEqual({
      ok: false,
      code: 'not-migrated',
      message: expect.stringContaining(join(ARCHIVE_ROOT, PROJECT_DIR, PREFIXED_ID)),
    })
    expect(fake.has(existing)).toBe(true)
    expect(fake.writes()).toEqual([])
    expect(calls).toEqual([])
  })

  it('目标位 lstat 非 ENOENT 失败 ⇒ internal（不冒险覆盖）', async () => {
    const fake = createFakeFs()
    addArchived(fake, PROJECT_DIR, BARE_ID)
    fake.fail('lstat', restoredPath(PROJECT_DIR, BARE_ID), new Error('EACCES: permission denied'))
    const { ports } = createPorts(fake.ops, { workspaces: WORKSPACES })

    expect(await restoreMigrated(ports, [target(PROJECT_DIR, BARE_ID)])).toEqual({
      ok: false,
      code: 'internal',
      message: expect.stringContaining('EACCES: permission denied'),
    })
    expect(fake.writes()).toEqual([])
  })

  it('rename 抛 EXDEV ⇒ copyTree 回退完成后删源，仍计入 restored', async () => {
    const fake = createFakeFs()
    const archive = addArchived(fake, PROJECT_DIR, BARE_ID)
    fake.addFile(join(archive, 'session.v4.jsonl.zstd'), 100)
    fake.addDir(join(archive, 'parts'))
    fake.addFile(join(archive, 'parts', 'part-1'), 7)
    fake.fail('rename', archive, crossDeviceError(archive))
    const restored = restoredPath(PROJECT_DIR, BARE_ID)
    const { ports, warnings } = createPorts(fake.ops, { workspaces: WORKSPACES })

    expect(await restoreOf(ports, [target(PROJECT_DIR, BARE_ID)])).toEqual({
      restored: [{ sessionId: BARE_ID, workspaceId: 'ws-main' }],
      warnings: [],
    })
    expect(fake.has(archive)).toBe(false)
    expect(fake.has(join(restored, 'session.v4.jsonl.zstd'))).toBe(true)
    expect(fake.has(join(restored, 'parts', 'part-1'))).toBe(true)
    expect(fake.writes()).toEqual([
      `mkdir ${join(HOME, 'sessions', PROJECT_DIR)}`,
      `rename ${archive} -> ${restored}`,
      `mkdir ${restored}`,
      `copyFile ${join(archive, 'session.v4.jsonl.zstd')} -> ${join(restored, 'session.v4.jsonl.zstd')}`,
      `mkdir ${join(restored, 'parts')}`,
      `copyFile ${join(archive, 'parts', 'part-1')} -> ${join(restored, 'parts', 'part-1')}`,
      `rm ${archive}`,
    ])
    expect(warnings).toEqual([])
  })

  it('EXDEV 且复制失败 ⇒ 源保留、该条不计入 restored、warning 点名半成品；announce 仍调一次（空）', async () => {
    const fake = createFakeFs()
    const archive = addArchived(fake, PROJECT_DIR, BARE_ID)
    const source = join(archive, 'session.v4.jsonl.zstd')
    fake.addFile(source, 100)
    const restored = restoredPath(PROJECT_DIR, BARE_ID)
    fake.fail('rename', archive, crossDeviceError(archive))
    fake.fail('copyFile', source, new Error('EACCES: permission denied'))
    const { ports, announced } = createPorts(fake.ops, { workspaces: WORKSPACES })

    const outcome = await restoreOf(ports, [target(PROJECT_DIR, BARE_ID)])
    expect(outcome.restored).toEqual([])
    expect(outcome.warnings).toHaveLength(1)
    expect(outcome.warnings[0]).toContain('the source was kept')
    expect(outcome.warnings[0]).toContain('manual cleanup')
    expect(fake.has(archive)).toBe(true)
    expect(fake.has(join(restored, 'session.v4.jsonl.zstd'))).toBe(false)
    expect(announced).toEqual([[]])
  })

  it('单条 rename 非 EXDEV 失败：只该条进 warnings，后续条目照常恢复', async () => {
    const fake = createFakeFs()
    const broken = addArchived(fake, PROJECT_DIR, BARE_ID)
    const healthy = addArchived(fake, PROJECT_DIR, PREFIXED_ID)
    fake.fail('rename', broken, new Error('EACCES: permission denied'))
    const { ports, announced } = createPorts(fake.ops, { workspaces: WORKSPACES })

    expect(await restoreOf(ports, [
      target(PROJECT_DIR, BARE_ID),
      target(PROJECT_DIR, PREFIXED_ID),
    ])).toEqual({
      restored: [{ sessionId: PREFIXED_ID, workspaceId: 'ws-main' }],
      warnings: [`${broken} -> ${restoredPath(PROJECT_DIR, BARE_ID)}: EACCES: permission denied`],
    })
    expect(fake.has(broken)).toBe(true)
    expect(fake.has(healthy)).toBe(false)
    expect(announced).toEqual([[{ sessionId: PREFIXED_ID, updatedAt: 0 }]])
  })

  it('匹配不到工作区 ⇒ workspaceId:null + warn，仍计已恢复并 readd/announce', async () => {
    const fake = createFakeFs()
    addArchived(fake, NO_CWD, BARE_ID)
    const { ports, calls, warnings } = createPorts(fake.ops, { workspaces: WORKSPACES })

    expect(await restoreOf(ports, [target(NO_CWD, BARE_ID)])).toEqual({
      restored: [{ sessionId: BARE_ID, workspaceId: null }],
      warnings: [`attach: ${BARE_ID}: no workspace matches project directory "${NO_CWD}"`],
    })
    expect(calls).toEqual(['listWorkspaces', `readd:${BARE_ID}`, `announce:${BARE_ID}`])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.[0]).toContain('it stays ungrouped')
  })

  it('attach 被上游拒绝 ⇒ workspaceId:null + warn，仍计入 restored 并 readd', async () => {
    const fake = createFakeFs()
    addArchived(fake, PROJECT_DIR, BARE_ID)
    const { ports, calls, warnings } = createPorts(fake.ops, {
      workspaces: WORKSPACES,
      attach: async () => { throw new Error('cwd does not match the workspace') },
    })

    expect(await restoreOf(ports, [target(PROJECT_DIR, BARE_ID)])).toEqual({
      restored: [{ sessionId: BARE_ID, workspaceId: null }],
      warnings: [`attach: ${BARE_ID}: cwd does not match the workspace`],
    })
    expect(calls).toEqual([
      'listWorkspaces',
      `attach:ws-main:${BARE_ID}`,
      `readd:${BARE_ID}`,
      `announce:${BARE_ID}`,
    ])
    expect(warnings).toHaveLength(1)
  })

  it('readdToArchiveSet 失败 ⇒ warning，但 restored 与 announce 不受影响', async () => {
    const fake = createFakeFs()
    addArchived(fake, PROJECT_DIR, BARE_ID)
    const { ports, announced, warnings } = createPorts(fake.ops, {
      workspaces: WORKSPACES,
      readd: async () => { throw new Error('registry write failed') },
    })

    expect(await restoreOf(ports, [target(PROJECT_DIR, BARE_ID)])).toEqual({
      restored: [{ sessionId: BARE_ID, workspaceId: 'ws-main' }],
      warnings: [`archive-set: ${BARE_ID}: registry write failed`],
    })
    expect(announced).toEqual([[{ sessionId: BARE_ID, updatedAt: 0 }]])
    expect(warnings).toHaveLength(1)
  })

  it('announceRestored 抛错只降级为 warning，恢复结论不变', async () => {
    const fake = createFakeFs()
    addArchived(fake, PROJECT_DIR, BARE_ID)
    const { ports, warnings } = createPorts(fake.ops, {
      workspaces: WORKSPACES,
      announce: async () => { throw new Error('emitter closed') },
    })

    expect(await restoreOf(ports, [target(PROJECT_DIR, BARE_ID)])).toEqual({
      restored: [{ sessionId: BARE_ID, workspaceId: 'ws-main' }],
      warnings: ['announce: emitter closed'],
    })
    expect(warnings).toHaveLength(1)
  })

  it('listWorkspaces 抛错 ⇒ warning 且全部按未分组处理（仍恢复）', async () => {
    const fake = createFakeFs()
    addArchived(fake, PROJECT_DIR, BARE_ID)
    const { ports, calls, warnings } = createPorts(fake.ops, {
      workspaces: () => { throw new Error('registry unavailable') },
    })

    expect(await restoreOf(ports, [target(PROJECT_DIR, BARE_ID)])).toEqual({
      restored: [{ sessionId: BARE_ID, workspaceId: null }],
      warnings: [
        'workspaces: registry unavailable',
        `attach: ${BARE_ID}: no workspace matches project directory "${PROJECT_DIR}"`,
      ],
    })
    expect(calls).toEqual(['listWorkspaces', `readd:${BARE_ID}`, `announce:${BARE_ID}`])
    expect(warnings).toHaveLength(2)
  })

  it('多条恢复：每条 attach → readd 逐条完成，announceRestored 只在循环结束后调一次', async () => {
    const fake = createFakeFs()
    addArchived(fake, PROJECT_DIR, BARE_ID)
    addArchived(fake, PROJECT_DIR, PREFIXED_ID)
    const { ports, calls, announced } = createPorts(fake.ops, { workspaces: WORKSPACES })

    expect(await restoreOf(ports, [
      target(PROJECT_DIR, BARE_ID),
      target(PROJECT_DIR, PREFIXED_ID),
    ])).toEqual({
      restored: [
        { sessionId: BARE_ID, workspaceId: 'ws-main' },
        { sessionId: PREFIXED_ID, workspaceId: 'ws-main' },
      ],
      warnings: [],
    })
    expect(calls).toEqual([
      'listWorkspaces',
      `attach:ws-main:${BARE_ID}`,
      `readd:${BARE_ID}`,
      `attach:ws-main:${PREFIXED_ID}`,
      `readd:${PREFIXED_ID}`,
      `announce:${BARE_ID},${PREFIXED_ID}`,
    ])
    expect(announced).toEqual([[
      { sessionId: BARE_ID, updatedAt: 0 },
      { sessionId: PREFIXED_ID, updatedAt: 0 },
    ]])
  })

  it('重复目标按首见去重，只搬一次', async () => {
    const fake = createFakeFs()
    addArchived(fake, PROJECT_DIR, BARE_ID)
    const { ports, announced } = createPorts(fake.ops, { workspaces: WORKSPACES })

    expect(await restoreOf(ports, [target(PROJECT_DIR, BARE_ID), target(PROJECT_DIR, BARE_ID)])).toEqual({
      restored: [{ sessionId: BARE_ID, workspaceId: 'ws-main' }],
      warnings: [],
    })
    expect(fake.calls.filter((call) => call.startsWith('rename '))).toHaveLength(1)
    expect(announced).toEqual([[{ sessionId: BARE_ID, updatedAt: 0 }]])
  })

  it('空批次 ⇒ bad-request，不触碰文件系统与端口', async () => {
    const fake = createFakeFs()
    const { ports, calls } = createPorts(fake.ops)
    expect(await restoreMigrated(ports, [])).toMatchObject({ ok: false, code: 'bad-request' })
    expect(fake.calls).toEqual([])
    expect(calls).toEqual([])
  })

  it('非法路径片段 ⇒ bad-request，零文件动作', async () => {
    const fake = createFakeFs()
    const { ports } = createPorts(fake.ops)
    expect(await restoreMigrated(ports, [target('..', BARE_ID)])).toMatchObject({ ok: false, code: 'bad-request' })
    expect(await restoreMigrated(ports, [target(PROJECT_DIR, 'a/b')])).toMatchObject({ ok: false, code: 'bad-request' })
    expect(await restoreMigrated(ports, [target(PROJECT_DIR, '')])).toMatchObject({ ok: false, code: 'bad-request' })
    expect(fake.calls).toEqual([])
  })

  it('空 archiveRoot ⇒ archive-unavailable，不触碰文件系统', async () => {
    const fake = createFakeFs()
    const { ports } = createPorts(fake.ops, { archiveRoot: '' })
    expect(await restoreMigrated(ports, [target(PROJECT_DIR, BARE_ID)])).toMatchObject({
      ok: false,
      code: 'archive-unavailable',
    })
    expect(fake.calls).toEqual([])
  })
})
