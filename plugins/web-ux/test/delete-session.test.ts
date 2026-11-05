/**
 * 「删除已归档会话」宿主侧流程的单测：级联收集、三种拒绝码、预览统计、删除与
 * 迁移共用的执行顺序、半失败 warnings，以及文件操作工厂的目录定位、安全防线与
 * 迁移（rename / EXDEV 回退 copyTree / 同名冲突 / 符号链接）语义。
 *
 * 全部通过注入的 fake 端口与内存文件系统驱动：不触碰真实磁盘、不需要 cordis。
 */

import { basename, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  archiveSession,
  archiveSessionBatch,
  collectDeleteSet,
  collectDeleteSetMany,
  createSessionFiles,
  deleteSession,
  deleteSessionBatch,
  planDelete,
  planDeleteBatch,
  previewDelete,
  previewDeleteBatch,
  type DeletePorts,
  type DirectoryEntry,
  type FileSystemOps,
  type StoredSessionHeader,
} from '../src/delete-session.ts'

/** 一条「目标 + 子 + 孙 + fork + 无关会话」的会话头清单。 */
const CASCADE: readonly StoredSessionHeader[] = [
  { id: 'session-target' },
  { id: 'session-child', origin: 'subagent', parentSession: 'session-target' },
  { id: 'session-grandchild', origin: 'subagent', parentSession: 'session-child' },
  { id: 'session-fork', parentSession: 'session-target' },
  { id: 'session-other' },
]

/** 上述清单的删除集合。 */
const REMOVED = ['session-target', 'session-child', 'session-grandchild']

/** 迁移用例共用的归档根。 */
const ARCHIVE_ROOT = '/archive/sessions'

/** 一次 fake 端口组装的产物。 */
interface RecordingPorts {
  /** 交给流程的端口。 */
  readonly ports: DeletePorts
  /** 端口调用序列，形如 `cleanup:<id>`。 */
  readonly calls: string[]
  /** `prepareArchive` 收到的归档根；单独记录，让 `calls` 只保留会话级动作。 */
  readonly prepared: string[]
  /** `warn` 收到的参数。 */
  readonly warnings: unknown[][]
}

/** fake 端口的可调行为。 */
interface PortOptions {
  /** 会话头清单，或每次调用重新求值的函数（用于模拟两次请求之间的漂移）。 */
  readonly headers?: readonly StoredSessionHeader[] | (() => readonly StoredSessionHeader[])
  /** 归档集合。 */
  readonly archived?: readonly string[]
  /** 存活集合。 */
  readonly live?: readonly string[]
  /** `measureFiles` 的替身，默认 0。 */
  readonly measure?: (sessionId: string) => Promise<number>
  /** `removeFiles` 的替身，默认空 warnings。 */
  readonly remove?: (sessionId: string) => Promise<readonly string[]>
  /** `cleanupRegistry` 的替身，默认只记录调用。 */
  readonly cleanup?: (sessionId: string) => Promise<void>
  /** `prepareArchive` 的替身，默认只记录调用。 */
  readonly prepare?: (archiveRoot: string) => Promise<void>
  /** `archiveFiles` 的替身，默认空 warnings。 */
  readonly archive?: (sessionId: string, archiveRoot: string) => Promise<readonly string[]>
  /** `emitRemoved` 的替身，默认只记录调用。 */
  readonly emit?: (sessionId: string) => void
}

/**
 * 组装一组会记录调用序列的 fake 端口。
 * @param options - 每个端口的行为覆盖。
 * @returns 端口本身与记录下来的调用 / 告警。
 */
function createPorts(options: PortOptions = {}): RecordingPorts {
  const calls: string[] = []
  const prepared: string[] = []
  const warnings: unknown[][] = []
  const headersOf = (): readonly StoredSessionHeader[] =>
    typeof options.headers === 'function' ? options.headers() : options.headers ?? []
  const ports: DeletePorts = {
    listStoredHeaders: async () => headersOf(),
    isLive: (sessionId) => (options.live ?? []).includes(sessionId),
    isArchived: (sessionId) => (options.archived ?? []).includes(sessionId),
    cleanupRegistry: async (sessionId) => {
      calls.push(`cleanup:${sessionId}`)
      await options.cleanup?.(sessionId)
    },
    measureFiles: async (sessionId) => {
      calls.push(`measure:${sessionId}`)
      return options.measure === undefined ? 0 : await options.measure(sessionId)
    },
    removeFiles: async (sessionId) => {
      calls.push(`remove:${sessionId}`)
      return options.remove === undefined ? [] : await options.remove(sessionId)
    },
    prepareArchive: async (archiveRoot) => {
      prepared.push(archiveRoot)
      await options.prepare?.(archiveRoot)
    },
    archiveFiles: async (sessionId, archiveRoot) => {
      calls.push(`archive:${sessionId}:${archiveRoot}`)
      return options.archive === undefined ? [] : await options.archive(sessionId, archiveRoot)
    },
    emitRemoved: (sessionId) => {
      calls.push(`emit:${sessionId}`)
      options.emit?.(sessionId)
    },
    warn: (message, error) => { warnings.push([message, error]) },
  }
  return { ports, calls, prepared, warnings }
}

describe('collectDeleteSet', () => {
  it('收集目标与 subagent 后代闭包，排除 fork 与无关会话', () => {
    expect(collectDeleteSet('session-target', CASCADE)).toEqual(REMOVED)
  })

  it('headers 乱序（孙在子之前）也迭代到不动点，父始终在子之前', () => {
    const shuffled: StoredSessionHeader[] = [
      { id: 'session-grandchild', origin: 'subagent', parentSession: 'session-child' },
      { id: 'session-child', origin: 'subagent', parentSession: 'session-target' },
      { id: 'session-target' },
    ]
    expect(collectDeleteSet('session-target', shuffled)).toEqual(REMOVED)
  })

  it('父引用命中但来源不是 subagent 的会话永不级联', () => {
    const headers: StoredSessionHeader[] = [
      { id: 'session-target' },
      { id: 'session-fork', parentSession: 'session-target' },
      { id: 'session-orphan', parentSession: 'session-unknown' },
    ]
    expect(collectDeleteSet('session-target', headers)).toEqual(['session-target'])
  })
})

describe('planDelete', () => {
  it('headers 里没有目标 → not-found', async () => {
    const { ports } = createPorts({ headers: [{ id: 'session-other' }], archived: ['session-target'] })
    expect(await planDelete('session-target', ports)).toEqual({
      ok: false,
      code: 'not-found',
      message: expect.stringContaining('session-target'),
    })
  })

  it('目标未归档 → not-archived', async () => {
    const { ports } = createPorts({ headers: CASCADE, archived: [] })
    expect(await planDelete('session-target', ports)).toEqual({
      ok: false,
      code: 'not-archived',
      message: expect.stringContaining('session-target'),
    })
  })

  it('目标仍 live → session-live 且消息点名该 id', async () => {
    const { ports } = createPorts({ headers: CASCADE, archived: ['session-target'], live: ['session-target'] })
    expect(await planDelete('session-target', ports)).toEqual({
      ok: false,
      code: 'session-live',
      message: expect.stringContaining('"session-target"'),
    })
  })

  it('后代 live 同样拒绝并点名后代 id', async () => {
    const { ports } = createPorts({ headers: CASCADE, archived: ['session-target'], live: ['session-grandchild'] })
    expect(await planDelete('session-target', ports)).toEqual({
      ok: false,
      code: 'session-live',
      message: expect.stringContaining('"session-grandchild"'),
    })
  })

  it('通过校验时返回完整删除集合', async () => {
    const { ports } = createPorts({ headers: CASCADE, archived: ['session-target'] })
    expect(await planDelete('session-target', ports)).toEqual({ ok: true, ids: REMOVED })
  })
})

describe('previewDelete', () => {
  it('逐 id 求和 measureFiles 并给出会话数与后代数', async () => {
    const sizes = new Map([['session-target', 10], ['session-child', 20], ['session-grandchild', 30]])
    const { ports, calls } = createPorts({
      headers: CASCADE,
      archived: ['session-target'],
      measure: async (sessionId) => sizes.get(sessionId) ?? 0,
    })
    expect(await previewDelete(ports, 'session-target', '/archive/sessions')).toEqual({
      ok: true,
      preview: { sessionCount: 3, descendantCount: 2, logBytes: 60, archiveRoot: '/archive/sessions' },
    })
    expect(calls).toEqual([
      'measure:session-target',
      'measure:session-child',
      'measure:session-grandchild',
    ])
  })

  it('未归档时与执行同款拒绝，且不做任何测量', async () => {
    const { ports, calls } = createPorts({ headers: CASCADE, archived: [] })
    expect(await previewDelete(ports, 'session-target', '/archive/sessions')).toEqual({
      ok: false,
      code: 'not-archived',
      message: expect.any(String),
    })
    expect(calls).toEqual([])
  })

  it('measureFiles 抛错按 0 计并告警', async () => {
    const { ports, warnings } = createPorts({
      headers: CASCADE,
      archived: ['session-target'],
      measure: async (sessionId) => {
        if (sessionId === 'session-child') throw new Error('EACCES: permission denied')
        return 5
      },
    })
    expect(await previewDelete(ports, 'session-target', '/archive/sessions')).toEqual({
      ok: true,
      preview: { sessionCount: 3, descendantCount: 2, logBytes: 10, archiveRoot: '/archive/sessions' },
    })
    expect(warnings).toHaveLength(1)
  })
})

describe('deleteSession', () => {
  it('逐 id 以 cleanup → remove → emit 顺序执行并返回完整集合', async () => {
    const { ports, calls } = createPorts({ headers: CASCADE, archived: ['session-target'] })
    expect(await deleteSession(ports, 'session-target')).toEqual({
      ok: true,
      outcome: { removed: REMOVED, warnings: [] },
    })
    expect(calls).toEqual([
      'cleanup:session-target', 'remove:session-target', 'emit:session-target',
      'cleanup:session-child', 'remove:session-child', 'emit:session-child',
      'cleanup:session-grandchild', 'remove:session-grandchild', 'emit:session-grandchild',
    ])
  })

  it('removeFiles 返回的失败项并入 warnings，整体仍成功', async () => {
    const { ports } = createPorts({
      headers: CASCADE,
      archived: ['session-target'],
      remove: async (sessionId) =>
        sessionId === 'session-child' ? ['/home/tester/.dsh/sessions/proj/session-child: EACCES'] : [],
    })
    expect(await deleteSession(ports, 'session-target')).toEqual({
      ok: true,
      outcome: {
        removed: REMOVED,
        warnings: ['/home/tester/.dsh/sessions/proj/session-child: EACCES'],
      },
    })
  })

  it('registry 清理失败只记 warning，文件删除照常继续', async () => {
    const { ports, calls, warnings } = createPorts({
      headers: CASCADE,
      archived: ['session-target'],
      cleanup: async (sessionId) => {
        if (sessionId === 'session-target') throw new Error('workspace.json is read-only')
      },
    })
    expect(await deleteSession(ports, 'session-target')).toEqual({
      ok: true,
      outcome: { removed: REMOVED, warnings: ['registry: session-target: workspace.json is read-only'] },
    })
    expect(calls).toContain('remove:session-target')
    expect(warnings).toHaveLength(1)
  })

  it('removeFiles 意外抛错也只记 warning 并继续', async () => {
    const { ports } = createPorts({
      headers: CASCADE,
      archived: ['session-target'],
      remove: async (sessionId) => {
        if (sessionId === 'session-target') throw new Error('driver exploded')
        return []
      },
    })
    expect(await deleteSession(ports, 'session-target')).toEqual({
      ok: true,
      outcome: { removed: REMOVED, warnings: ['files: session-target: driver exploded'] },
    })
  })

  it('emit 抛错不影响结果', async () => {
    const { ports } = createPorts({
      headers: CASCADE,
      archived: ['session-target'],
      emit: () => { throw new Error('no listeners') },
    })
    expect(await deleteSession(ports, 'session-target')).toEqual({
      ok: true,
      outcome: { removed: REMOVED, warnings: [] },
    })
  })

  it('拒绝时不做任何写操作', async () => {
    const { ports, calls } = createPorts({ headers: CASCADE, archived: [] })
    expect(await deleteSession(ports, 'session-target')).toEqual({
      ok: false,
      code: 'not-archived',
      message: expect.any(String),
    })
    expect(calls).toEqual([])
  })

  it('幂等重跑：已删 id 再次删除得到 not-found', async () => {
    const headers: StoredSessionHeader[] = [{ id: 'session-target' }]
    const { ports } = createPorts({ headers: () => [...headers], archived: ['session-target'] })
    expect((await deleteSession(ports, 'session-target')).ok).toBe(true)
    headers.length = 0
    expect(await deleteSession(ports, 'session-target')).toEqual({
      ok: false,
      code: 'not-found',
      message: expect.any(String),
    })
  })
})

describe('archiveSession', () => {
  it('级联迁移：逐 id 以 cleanup → archive → emit 顺序执行并返回完整集合', async () => {
    const { ports, calls } = createPorts({ headers: CASCADE, archived: ['session-target'] })
    expect(await archiveSession(ports, 'session-target', ARCHIVE_ROOT)).toEqual({
      ok: true,
      outcome: { removed: REMOVED, warnings: [] },
    })
    expect(calls).toEqual([
      'cleanup:session-target', `archive:session-target:${ARCHIVE_ROOT}`, 'emit:session-target',
      'cleanup:session-child', `archive:session-child:${ARCHIVE_ROOT}`, 'emit:session-child',
      'cleanup:session-grandchild', `archive:session-grandchild:${ARCHIVE_ROOT}`, 'emit:session-grandchild',
    ])
  })

  it('归档根准备失败 → archive-unavailable，且不做任何会话动作', async () => {
    const { ports, calls, prepared } = createPorts({
      headers: CASCADE,
      archived: ['session-target'],
      prepare: async () => { throw new Error('EACCES: permission denied') },
    })
    expect(await archiveSession(ports, 'session-target', ARCHIVE_ROOT)).toEqual({
      ok: false,
      code: 'archive-unavailable',
      message: `archive root "${ARCHIVE_ROOT}" is not usable: EACCES: permission denied`,
    })
    expect(calls).toEqual([])
    expect(prepared).toEqual([ARCHIVE_ROOT])
  })

  it('相对归档根 → archive-unavailable，且不准备归档根', async () => {
    const { ports, calls, prepared } = createPorts({ headers: CASCADE, archived: ['session-target'] })
    expect(await archiveSession(ports, 'session-target', 'archive/sessions')).toEqual({
      ok: false,
      code: 'archive-unavailable',
      message: 'archive root "archive/sessions" is not an absolute path',
    })
    expect(calls).toEqual([])
    expect(prepared).toEqual([])
  })

  it('拒绝码与删除同源：未归档时不做准备也不做动作', async () => {
    const { ports, calls, prepared } = createPorts({ headers: CASCADE, archived: [] })
    expect(await archiveSession(ports, 'session-target', ARCHIVE_ROOT)).toEqual({
      ok: false,
      code: 'not-archived',
      message: expect.any(String),
    })
    expect(calls).toEqual([])
    expect(prepared).toEqual([])
  })

  it('archiveFiles 返回的失败项并入 warnings，整体仍成功', async () => {
    const { ports } = createPorts({
      headers: CASCADE,
      archived: ['session-target'],
      archive: async (sessionId) => (sessionId === 'session-child' ? ['/home/tester/.dsh/sessions/proj/session-child: EACCES'] : []),
    })
    expect(await archiveSession(ports, 'session-target', ARCHIVE_ROOT)).toEqual({
      ok: true,
      outcome: {
        removed: REMOVED,
        warnings: ['/home/tester/.dsh/sessions/proj/session-child: EACCES'],
      },
    })
  })

  it('archiveFiles 意外抛错也只记 warning 并继续', async () => {
    const { ports, calls } = createPorts({
      headers: CASCADE,
      archived: ['session-target'],
      archive: async (sessionId) => {
        if (sessionId === 'session-target') throw new Error('driver exploded')
        return []
      },
    })
    expect(await archiveSession(ports, 'session-target', ARCHIVE_ROOT)).toEqual({
      ok: true,
      outcome: { removed: REMOVED, warnings: ['files: session-target: driver exploded'] },
    })
    expect(calls).toContain(`archive:session-grandchild:${ARCHIVE_ROOT}`)
  })
})

/** 造一个跨设备重命名错误（EXDEV），用于驱动 copyTree 回退。 */
function crossDeviceError(path: string): Error {
  return Object.assign(new Error(`EXDEV: cross-device link not permitted, ${path}`), { code: 'EXDEV' })
}

/** 内存文件系统：目录集合 + 文件大小表 + 符号链接集合 + 可注入的逐操作失败。 */
interface FakeFs {
  /** 交给工厂的文件系统端口。 */
  readonly ops: FileSystemOps
  /** 每次文件系统调用的记录，形如 `rm <path>`。 */
  readonly calls: string[]
  /** 建目录（自顶向下调用，已存在则无操作）。 */
  addDir(path: string): void
  /** 建文件。 */
  addFile(path: string, size: number): void
  /** 建符号链接（只登记路径，不跟随）。 */
  addSymlink(path: string): void
  /** 让某个操作对某个路径抛错。 */
  fail(
    op: 'readdir' | 'lstat' | 'rm' | 'unlink' | 'mkdir' | 'rename' | 'copyFile',
    path: string,
    error: Error,
  ): void
  /** 路径是否仍存在。 */
  has(path: string): boolean
}

/**
 * 建一个内存文件系统。
 * @returns 端口实现、调用记录、夹具构造与失败注入入口。
 */
function createFakeFs(): FakeFs {
  const dirs = new Map<string, Set<string>>()
  const files = new Map<string, number>()
  const symlinks = new Set<string>()
  const failures = new Map<string, Error>()
  const calls: string[] = []

  const missing = (path: string): Error =>
    Object.assign(new Error(`ENOENT: no such file or directory, ${path}`), { code: 'ENOENT' })
  const exists = (path: string): Error =>
    Object.assign(new Error(`EEXIST: file already exists, ${path}`), { code: 'EEXIST' })
  const check = (op: string, path: string): void => {
    const failure = failures.get(`${op} ${path}`)
    if (failure !== undefined) throw failure
  }
  const detach = (path: string): void => {
    dirs.get(dirname(path))?.delete(basename(path))
  }
  const removeTree = (path: string): void => {
    detach(path)
    files.delete(path)
    symlinks.delete(path)
    const children = dirs.get(path)
    if (children === undefined) return
    dirs.delete(path)
    for (const name of children) removeTree(join(path, name))
  }
  const ensureDir = (path: string): void => {
    if (dirs.has(path)) return
    if (files.has(path) || symlinks.has(path)) throw exists(path)
    const parent = dirname(path)
    if (parent !== path) ensureDir(parent)
    dirs.set(path, new Set())
    if (parent !== path) dirs.get(parent)?.add(basename(path))
  }
  const moveTree = (from: string, to: string): void => {
    if (symlinks.delete(from)) {
      symlinks.add(to)
      detach(from)
      dirs.get(dirname(to))?.add(basename(to))
      return
    }
    const size = files.get(from)
    if (size !== undefined) {
      files.delete(from)
      files.set(to, size)
      detach(from)
      dirs.get(dirname(to))?.add(basename(to))
      return
    }
    const children = dirs.get(from)
    if (children === undefined) throw missing(from)
    const names = [...children]
    dirs.delete(from)
    dirs.set(to, new Set(names))
    detach(from)
    dirs.get(dirname(to))?.add(basename(to))
    for (const name of names) moveTree(join(from, name), join(to, name))
  }

  const ops: FileSystemOps = {
    readdir: async (path) => {
      calls.push(`readdir ${path}`)
      check('readdir', path)
      const children = dirs.get(path)
      if (children === undefined) throw missing(path)
      return [...children].map((name): DirectoryEntry => ({
        name,
        isDirectory: () => dirs.has(join(path, name)),
        isSymbolicLink: () => symlinks.has(join(path, name)),
      }))
    },
    lstat: async (path) => {
      calls.push(`lstat ${path}`)
      check('lstat', path)
      if (dirs.has(path)) return { size: 0, isDirectory: () => true }
      const size = files.get(path)
      if (size !== undefined) return { size, isDirectory: () => false }
      if (symlinks.has(path)) return { size: 0, isDirectory: () => false }
      throw missing(path)
    },
    rm: async (path, options) => {
      calls.push(`rm ${path}`)
      check('rm', path)
      if (!dirs.has(path) && !files.has(path) && !symlinks.has(path)) {
        if (!options.force) throw missing(path)
        return
      }
      removeTree(path)
    },
    unlink: async (path) => {
      calls.push(`unlink ${path}`)
      check('unlink', path)
      if (!files.delete(path) && !symlinks.delete(path)) throw missing(path)
      detach(path)
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
    },
  }

  return {
    ops,
    calls,
    addDir: (path) => {
      if (dirs.has(path)) return
      dirs.set(path, new Set())
      dirs.get(dirname(path))?.add(basename(path))
    },
    addFile: (path, size) => {
      files.set(path, size)
      dirs.get(dirname(path))?.add(basename(path))
    },
    addSymlink: (path) => {
      symlinks.add(path)
      dirs.get(dirname(path))?.add(basename(path))
    },
    fail: (op, path, error) => { failures.set(`${op} ${path}`, error) },
    has: (path) => dirs.has(path) || files.has(path) || symlinks.has(path),
  }
}

/** 测试用的固定 DSH_HOME。 */
const HOME = '/home/tester/.dsh'

/**
 * 把文件操作工厂挂到 {@link HOME} 上。
 * @param fs - 文件系统端口。
 * @returns 工厂产出的 `measure` / `remove` / `prepareArchive` / `archive`。
 */
function mountFiles(fs: FileSystemOps): ReturnType<typeof createSessionFiles> {
  return createSessionFiles({ homePath: (...segments: string[]) => join(HOME, ...segments), fs })
}

/**
 * 建出 `sessions/<project>/<sessionId>/` 与其中的日志文件。
 * @param fake - 内存文件系统。
 * @param project - 项目目录名（cwd 转义）。
 * @param sessionId - 会话 id。
 * @param logBytes - 日志文件字节数；`0` 表示不写文件。
 * @returns 会话目录的绝对路径。
 */
function addSession(fake: FakeFs, project: string, sessionId: string, logBytes = 10): string {
  const root = join(HOME, 'sessions')
  const projectDir = join(root, project)
  const sessionDir = join(projectDir, sessionId)
  fake.addDir(HOME)
  fake.addDir(root)
  fake.addDir(projectDir)
  fake.addDir(sessionDir)
  if (logBytes > 0) fake.addFile(join(sessionDir, 'session.v4.jsonl.zstd'), logBytes)
  return sessionDir
}

/**
 * 建出 `storages/session_projcache/sessions/<sessionId>.json`。
 * @param fake - 内存文件系统。
 * @param sessionId - 会话 id。
 * @param size - 文件字节数。
 * @returns 投影缓存文件的绝对路径。
 */
function addProjCache(fake: FakeFs, sessionId: string, size = 3): string {
  const dir = join(HOME, 'storages', 'session_projcache', 'sessions')
  fake.addDir(HOME)
  fake.addDir(join(HOME, 'storages'))
  fake.addDir(join(HOME, 'storages', 'session_projcache'))
  fake.addDir(dir)
  const path = join(dir, `${sessionId}.json`)
  fake.addFile(path, size)
  return path
}

describe('createSessionFiles', () => {
  it('在多个项目目录中定位会话，删除日志目录与投影缓存', async () => {
    const fake = createFakeFs()
    const first = addSession(fake, 'proj-a', 'session-a')
    const second = addSession(fake, 'proj-b', 'session-a')
    const cache = addProjCache(fake, 'session-a')
    const neighbour = addSession(fake, 'proj-a', 'session-b')

    expect(await mountFiles(fake.ops).remove('session-a')).toEqual([])
    expect(fake.has(first)).toBe(false)
    expect(fake.has(second)).toBe(false)
    expect(fake.has(cache)).toBe(false)
    expect(fake.has(neighbour)).toBe(true)
  })

  it('sessions 根缺失时静默返回（ENOENT 不是失败）', async () => {
    const fake = createFakeFs()
    expect(await mountFiles(fake.ops).remove('session-a')).toEqual([])
  })

  it('rm 失败逐条报告路径，并继续处理其它候选目录', async () => {
    const fake = createFakeFs()
    const failing = addSession(fake, 'proj-a', 'session-a')
    const healthy = addSession(fake, 'proj-b', 'session-a')
    fake.fail('rm', failing, new Error('EACCES: permission denied'))

    expect(await mountFiles(fake.ops).remove('session-a')).toEqual([
      `${failing}: EACCES: permission denied`,
    ])
    expect(fake.has(failing)).toBe(true)
    expect(fake.has(healthy)).toBe(false)
  })

  it('sessions 根读失败记一条 warning 而不是抛错', async () => {
    const fake = createFakeFs()
    addSession(fake, 'proj-a', 'session-a')
    fake.fail('readdir', join(HOME, 'sessions'), new Error('EACCES: permission denied'))
    expect(await mountFiles(fake.ops).remove('session-a')).toEqual([
      `${join(HOME, 'sessions')}: EACCES: permission denied`,
    ])
  })

  it('投影缓存 unlink 失败（非 ENOENT）也记 warning', async () => {
    const fake = createFakeFs()
    const cache = addProjCache(fake, 'session-a')
    fake.fail('unlink', cache, new Error('EPERM: operation not permitted'))
    expect(await mountFiles(fake.ops).remove('session-a')).toEqual([`${cache}: EPERM: operation not permitted`])
  })

  it('只有投影缓存存在时也能删掉且无 warning', async () => {
    const fake = createFakeFs()
    const cache = addProjCache(fake, 'session-a')
    expect(await mountFiles(fake.ops).remove('session-a')).toEqual([])
    expect(fake.has(cache)).toBe(false)
  })

  it('measure 递归求和日志目录树与投影缓存', async () => {
    const fake = createFakeFs()
    const sessionDir = addSession(fake, 'proj-a', 'session-a', 100)
    fake.addDir(join(sessionDir, 'parts'))
    fake.addFile(join(sessionDir, 'parts', 'part-1'), 7)
    addProjCache(fake, 'session-a', 3)
    expect(await mountFiles(fake.ops).measure('session-a')).toBe(110)
  })

  it('measure 对不存在的会话按 0 计', async () => {
    const fake = createFakeFs()
    addSession(fake, 'proj-a', 'session-other')
    expect(await mountFiles(fake.ops).measure('session-a')).toBe(0)
  })

  it.each(['', '.', '..', '../session-a', 'a/b', 'a\\b', 'a\u0000b', 'x'.repeat(256)])(
    '非法 id %j 不触碰文件系统',
    async (sessionId) => {
      const fake = createFakeFs()
      const files = mountFiles(fake.ops)
      expect(await files.remove(sessionId)).toHaveLength(1)
      expect(await files.measure(sessionId)).toBe(0)
      expect(fake.calls).toEqual([])
    },
  )

  it('255 字符的 id 仍是安全路径片段（与文件系统单段上限一致）', async () => {
    const fake = createFakeFs()
    addSession(fake, 'proj-a', 'x'.repeat(255))
    expect(await mountFiles(fake.ops).remove('x'.repeat(255))).toEqual([])
    expect(fake.calls.some((call) => call.startsWith('rm '))).toBe(true)
  })

  it('项目目录是符号链接时记 warning，而不是静默当成「已删干净」', async () => {
    const calls: string[] = []
    const ops: FileSystemOps = {
      readdir: async () => [{ name: 'proj-link', isDirectory: () => false, isSymbolicLink: () => true }],
      lstat: async () => {
        throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
      },
      rm: async () => { calls.push('rm') },
      unlink: async () => { calls.push('unlink') },
      mkdir: async () => { calls.push('mkdir') },
      rename: async () => { calls.push('rename') },
      copyFile: async () => { calls.push('copyFile') },
    }
    expect(await mountFiles(ops).remove('session-a')).toEqual([
      `${join(HOME, 'sessions', 'proj-link')}: symbolic-linked project directory was not followed`,
    ])
    // 只尝试了投影缓存的 unlink：符号链接项目目录下的会话树一次都没有被 rm。
    expect(calls).toEqual(['unlink'])
  })
})

describe('createSessionFiles.archive', () => {
  it('prepareArchive 递归建出归档根（含父级）', async () => {
    const fake = createFakeFs()
    await mountFiles(fake.ops).prepareArchive('/data/dsh/archive/sessions')
    expect(fake.has('/data')).toBe(true)
    expect(fake.has('/data/dsh/archive')).toBe(true)
    expect(fake.has('/data/dsh/archive/sessions')).toBe(true)
    expect(fake.calls).toEqual(['mkdir /data/dsh/archive/sessions'])
  })

  it('迁移成功：rename 恰一次，源目录消失，目标保留日志，投影缓存被删', async () => {
    const fake = createFakeFs()
    const src = addSession(fake, 'proj-a', 'session-a', 100)
    const cache = addProjCache(fake, 'session-a')
    const dest = join(ARCHIVE_ROOT, 'proj-a', 'session-a')
    const files = mountFiles(fake.ops)
    await files.prepareArchive(ARCHIVE_ROOT)

    expect(await files.archive('session-a', ARCHIVE_ROOT)).toEqual([])
    expect(fake.has(src)).toBe(false)
    expect(fake.has(join(dest, 'session.v4.jsonl.zstd'))).toBe(true)
    expect(fake.has(cache)).toBe(false)
    expect(fake.calls.filter((call) => call.startsWith('rename '))).toEqual([`rename ${src} -> ${dest}`])
  })

  it('多个项目目录各自迁移，目标保留项目层级', async () => {
    const fake = createFakeFs()
    addSession(fake, 'proj-a', 'session-a')
    addSession(fake, 'proj-b', 'session-a')
    expect(await mountFiles(fake.ops).archive('session-a', ARCHIVE_ROOT)).toEqual([])
    expect(fake.has(join(ARCHIVE_ROOT, 'proj-a', 'session-a', 'session.v4.jsonl.zstd'))).toBe(true)
    expect(fake.has(join(ARCHIVE_ROOT, 'proj-b', 'session-a', 'session.v4.jsonl.zstd'))).toBe(true)
  })

  it('EXDEV 回退：mkdir + copyFile + rm(源)，源消失且目标内容完整', async () => {
    const fake = createFakeFs()
    const src = addSession(fake, 'proj-a', 'session-a', 100)
    const cache = addProjCache(fake, 'session-a')
    const dest = join(ARCHIVE_ROOT, 'proj-a', 'session-a')
    fake.fail('rename', src, crossDeviceError(src))

    expect(await mountFiles(fake.ops).archive('session-a', ARCHIVE_ROOT)).toEqual([])
    expect(fake.has(src)).toBe(false)
    expect(fake.has(join(dest, 'session.v4.jsonl.zstd'))).toBe(true)
    expect(fake.has(cache)).toBe(false)
    expect(fake.calls).toEqual([
      `readdir ${join(HOME, 'sessions')}`,
      `lstat ${src}`,
      `lstat ${dest}`,
      `mkdir ${join(ARCHIVE_ROOT, 'proj-a')}`,
      `rename ${src} -> ${dest}`,
      `mkdir ${dest}`,
      `readdir ${src}`,
      `copyFile ${join(src, 'session.v4.jsonl.zstd')} -> ${join(dest, 'session.v4.jsonl.zstd')}`,
      `rm ${src}`,
      `unlink ${cache}`,
    ])
  })

  it('目标已存在：返回 already exists 警告，源完整保留且未调用 rename', async () => {
    const fake = createFakeFs()
    const src = addSession(fake, 'proj-a', 'session-a', 100)
    const cache = addProjCache(fake, 'session-a')
    const dest = join(ARCHIVE_ROOT, 'proj-a', 'session-a')
    fake.addDir(ARCHIVE_ROOT)
    fake.addDir(join(ARCHIVE_ROOT, 'proj-a'))
    fake.addDir(dest)

    expect(await mountFiles(fake.ops).archive('session-a', ARCHIVE_ROOT)).toEqual([
      `${dest} already exists; the session directory was not moved (source kept at ${src})`,
    ])
    expect(fake.has(join(src, 'session.v4.jsonl.zstd'))).toBe(true)
    expect(fake.calls.some((call) => call.startsWith('rename '))).toBe(false)
    expect(fake.has(cache)).toBe(false)
  })

  it('copy 中途失败：源保留，警告点名源与目标，且未删除源', async () => {
    const fake = createFakeFs()
    const src = addSession(fake, 'proj-a', 'session-a', 100)
    fake.addDir(join(src, 'parts'))
    const part = join(src, 'parts', 'part-1')
    fake.addFile(part, 7)
    const cache = addProjCache(fake, 'session-a')
    fake.fail('rename', src, crossDeviceError(src))
    fake.fail('copyFile', part, new Error('EIO: i/o error'))
    const dest = join(ARCHIVE_ROOT, 'proj-a', 'session-a')

    const warnings = await mountFiles(fake.ops).archive('session-a', ARCHIVE_ROOT)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(`copy ${part} -> ${join(dest, 'parts', 'part-1')}`)
    expect(warnings[0]).toContain(src)
    expect(warnings[0]).toContain(dest)
    expect(warnings[0]).toContain('the source was kept')
    expect(fake.calls).not.toContain(`rm ${src}`)
    expect(fake.has(part)).toBe(true)
    expect(fake.has(cache)).toBe(false)
  })

  it('源内含符号链接：不复制、源目录保留，并点名该链接', async () => {
    const fake = createFakeFs()
    const src = addSession(fake, 'proj-a', 'session-a', 100)
    const link = join(src, 'linked-log')
    fake.addSymlink(link)
    fake.fail('rename', src, crossDeviceError(src))
    const dest = join(ARCHIVE_ROOT, 'proj-a', 'session-a')

    expect(await mountFiles(fake.ops).archive('session-a', ARCHIVE_ROOT)).toEqual([
      `${link}: symbolic link was not copied (the source directory was kept)`,
    ])
    expect(fake.has(src)).toBe(true)
    expect(fake.has(link)).toBe(true)
    expect(fake.has(join(dest, 'linked-log'))).toBe(false)
    expect(fake.calls).not.toContain(`rm ${src}`)
  })

  it('copy 全部成功后 rm 源失败：记「已移动但源未删」，目标数据完整', async () => {
    const fake = createFakeFs()
    const src = addSession(fake, 'proj-a', 'session-a', 100)
    fake.fail('rename', src, crossDeviceError(src))
    fake.fail('rm', src, new Error('EACCES: permission denied'))
    const dest = join(ARCHIVE_ROOT, 'proj-a', 'session-a')

    expect(await mountFiles(fake.ops).archive('session-a', ARCHIVE_ROOT)).toEqual([
      `moved to ${dest} but the source could not be removed: ${src}: EACCES: permission denied`,
    ])
    expect(fake.has(join(dest, 'session.v4.jsonl.zstd'))).toBe(true)
    expect(fake.has(join(src, 'session.v4.jsonl.zstd'))).toBe(true)
  })

  it('rename 非 EXDEV 失败：记源 → 目标与原因，源保留且不回退复制', async () => {
    const fake = createFakeFs()
    const src = addSession(fake, 'proj-a', 'session-a', 100)
    const dest = join(ARCHIVE_ROOT, 'proj-a', 'session-a')
    fake.fail('rename', src, new Error('EPERM: operation not permitted'))

    expect(await mountFiles(fake.ops).archive('session-a', ARCHIVE_ROOT)).toEqual([
      `${src} -> ${dest}: EPERM: operation not permitted`,
    ])
    expect(fake.has(src)).toBe(true)
    expect(fake.calls.some((call) => call.startsWith('copyFile '))).toBe(false)
  })

  it.each(['', '.', '..', '../session-a', 'a/b', 'a\\b', 'a\u0000b', 'x'.repeat(256)])(
    'archive 非法 id %j 不触碰文件系统',
    async (sessionId) => {
      const fake = createFakeFs()
      expect(await mountFiles(fake.ops).archive(sessionId, ARCHIVE_ROOT)).toEqual([
        `session id ${JSON.stringify(sessionId)} is not a safe path segment; nothing was moved`,
      ])
      expect(fake.calls).toEqual([])
    },
  )

  it('源目录缺失：无警告，投影缓存照删', async () => {
    const fake = createFakeFs()
    const cache = addProjCache(fake, 'session-a')
    expect(await mountFiles(fake.ops).archive('session-a', ARCHIVE_ROOT)).toEqual([])
    expect(fake.has(cache)).toBe(false)
    expect(fake.calls.some((call) => call.startsWith('mkdir '))).toBe(false)
  })

  it('投影缓存 unlink 非 ENOENT 失败也记 warning', async () => {
    const fake = createFakeFs()
    const src = addSession(fake, 'proj-a', 'session-a', 100)
    const cache = addProjCache(fake, 'session-a')
    fake.fail('unlink', cache, new Error('EPERM: operation not permitted'))
    expect(await mountFiles(fake.ops).archive('session-a', ARCHIVE_ROOT)).toEqual([
      `${cache}: EPERM: operation not permitted`,
    ])
    expect(fake.has(src)).toBe(false)
  })
})

/** 批量用例共用的会话头清单：两个目标各带一条子代理链，外加一条无关会话。 */
const BATCH: readonly StoredSessionHeader[] = [
  { id: 'session-a' },
  { id: 'session-a-child', origin: 'subagent', parentSession: 'session-a' },
  { id: 'session-b' },
  { id: 'session-b-child', origin: 'subagent', parentSession: 'session-b' },
  { id: 'session-b-grandchild', origin: 'subagent', parentSession: 'session-b-child' },
  { id: 'session-other' },
]

/** 目标 b 在前、a 在后时的并集处置集合（首见顺序）。 */
const UNION_BA = ['session-b', 'session-b-child', 'session-b-grandchild', 'session-a', 'session-a-child']

/**
 * 在既有记录端口之外再包一层全局调用轨迹：`createPorts` 只为会话级动作记 `calls`，
 * 这里把 `listStoredHeaders` 与 `prepareArchive` 也按发生顺序记进来，于是「单次读取」
 * 与「归档根先于任何写动作」都能直接断言。
 * @param recording - {@link createPorts} 的产物。
 * @returns 包好的端口与调用轨迹（按发生顺序）。
 */
function tracePorts(recording: RecordingPorts): { readonly ports: DeletePorts; readonly trace: string[] } {
  const trace: string[] = []
  const ports: DeletePorts = {
    listStoredHeaders: async () => {
      trace.push('listStoredHeaders')
      return recording.ports.listStoredHeaders()
    },
    isLive: (sessionId) => recording.ports.isLive(sessionId),
    isArchived: (sessionId) => recording.ports.isArchived(sessionId),
    cleanupRegistry: async (sessionId) => {
      trace.push(`cleanup:${sessionId}`)
      await recording.ports.cleanupRegistry(sessionId)
    },
    measureFiles: async (sessionId) => {
      trace.push(`measure:${sessionId}`)
      return recording.ports.measureFiles(sessionId)
    },
    removeFiles: async (sessionId) => {
      trace.push(`remove:${sessionId}`)
      return recording.ports.removeFiles(sessionId)
    },
    prepareArchive: async (archiveRoot) => {
      trace.push(`prepare:${archiveRoot}`)
      await recording.ports.prepareArchive(archiveRoot)
    },
    archiveFiles: async (sessionId, archiveRoot) => {
      trace.push(`archive:${sessionId}`)
      return recording.ports.archiveFiles(sessionId, archiveRoot)
    },
    emitRemoved: (sessionId) => {
      trace.push(`emit:${sessionId}`)
      recording.ports.emitRemoved(sessionId)
    },
    warn: (message, error) => {
      trace.push('warn')
      recording.ports.warn(message, error)
    },
  }
  return { ports, trace }
}

describe('collectDeleteSetMany', () => {
  it('按输入顺序展开并集、合并去重并保持首见顺序', () => {
    expect(collectDeleteSetMany(['session-a', 'session-b', 'session-a'], BATCH)).toEqual([
      'session-a',
      'session-a-child',
      'session-b',
      'session-b-child',
      'session-b-grandchild',
    ])
  })

  it('跨目标级联重叠按首见位置合并：子会话既当目标又是后代', () => {
    expect(collectDeleteSetMany(['session-a-child', 'session-a'], BATCH)).toEqual(['session-a-child', 'session-a'])
    expect(collectDeleteSetMany(['session-a', 'session-a-child'], BATCH)).toEqual(['session-a', 'session-a-child'])
  })

  it('空目标返回空并集', () => {
    expect(collectDeleteSetMany([], BATCH)).toEqual([])
  })
})

describe('planDeleteBatch', () => {
  it('逐目标独立校验：not-found / session-live / not-archived 混合，软失败带码与消息', async () => {
    const { ports } = createPorts({
      headers: BATCH,
      archived: ['session-a', 'session-b'],
      live: ['session-b-grandchild'],
    })
    expect(await planDeleteBatch(['session-a', 'session-ghost', 'session-b', 'session-other'], ports)).toEqual({
      accepted: ['session-a'],
      union: ['session-a', 'session-a-child'],
      rejected: [
        { sessionId: 'session-ghost', code: 'not-found', message: expect.stringContaining('"session-ghost"') },
        { sessionId: 'session-b', code: 'session-live', message: expect.stringContaining('"session-b-grandchild"') },
        { sessionId: 'session-other', code: 'not-archived', message: expect.stringContaining('"session-other"') },
      ],
    })
  })

  it('被拒目标不做级联展开，也不进入并集', async () => {
    const { ports } = createPorts({ headers: BATCH, archived: [] })
    expect(await planDeleteBatch(['session-b'], ports)).toEqual({
      accepted: [],
      union: [],
      rejected: [{ sessionId: 'session-b', code: 'not-archived', message: expect.any(String) }],
    })
  })

  it('每个目标至多一条拒绝，按 not-found → not-archived → session-live 首错即止', async () => {
    const { ports } = createPorts({ headers: BATCH, archived: [], live: ['session-ghost', 'session-other'] })
    expect(await planDeleteBatch(['session-ghost', 'session-other', 'session-b'], ports)).toEqual({
      accepted: [],
      union: [],
      rejected: [
        { sessionId: 'session-ghost', code: 'not-found', message: expect.any(String) },
        { sessionId: 'session-other', code: 'not-archived', message: expect.any(String) },
        { sessionId: 'session-b', code: 'not-archived', message: expect.any(String) },
      ],
    })
  })

  it('目标按首见顺序去重，只校验一次', async () => {
    const { ports } = createPorts({ headers: BATCH, archived: ['session-a'] })
    expect(await planDeleteBatch(['session-a', 'session-a'], ports)).toEqual({
      accepted: ['session-a'],
      union: ['session-a', 'session-a-child'],
      rejected: [],
    })
  })

  it('多个目标只读一次 listStoredHeaders，且计划阶段不产生任何写动作', async () => {
    const recording = createPorts({ headers: BATCH, archived: ['session-a', 'session-b'] })
    const { ports, trace } = tracePorts(recording)
    await planDeleteBatch(['session-a', 'session-b', 'session-ghost'], ports)
    expect(trace.filter((call) => call === 'listStoredHeaders')).toHaveLength(1)
    expect(trace).toEqual(['listStoredHeaders'])
    expect(recording.calls).toEqual([])
  })

  it('空目标：结论为空但仍只读一次', async () => {
    const recording = createPorts({ headers: BATCH })
    const { ports, trace } = tracePorts(recording)
    expect(await planDeleteBatch([], ports)).toEqual({ accepted: [], union: [], rejected: [] })
    expect(trace).toEqual(['listStoredHeaders'])
  })
})

describe('previewDeleteBatch', () => {
  it('软失败不整单失败：统计按并集口径，rejected 带码与消息', async () => {
    const sizes = new Map([['session-a', 10], ['session-a-child', 20]])
    const { ports, calls } = createPorts({
      headers: BATCH,
      archived: ['session-a', 'session-b'],
      live: ['session-b-grandchild'],
      measure: async (sessionId) => sizes.get(sessionId) ?? 0,
    })
    expect(await previewDeleteBatch(ports, ['session-a', 'session-ghost', 'session-b', 'session-other', 'session-a'], ARCHIVE_ROOT)).toEqual({
      targetCount: 4,
      sessionCount: 2,
      descendantCount: 1,
      logBytes: 30,
      archiveRoot: ARCHIVE_ROOT,
      rejected: [
        { sessionId: 'session-ghost', code: 'not-found', message: expect.stringContaining('"session-ghost"') },
        { sessionId: 'session-b', code: 'session-live', message: expect.stringContaining('"session-b-grandchild"') },
        { sessionId: 'session-other', code: 'not-archived', message: expect.stringContaining('"session-other"') },
      ],
    })
    // 只测量并集成员：被拒目标一次都不测量。
    expect(calls).toEqual(['measure:session-a', 'measure:session-a-child'])
  })

  it('measureFiles 抛错按 0 计并告警，预览仍成功', async () => {
    const { ports, warnings } = createPorts({
      headers: BATCH,
      archived: ['session-a'],
      measure: async (sessionId) => {
        if (sessionId === 'session-a-child') throw new Error('EACCES: permission denied')
        return 5
      },
    })
    expect(await previewDeleteBatch(ports, ['session-a'], ARCHIVE_ROOT)).toEqual({
      targetCount: 1,
      sessionCount: 2,
      descendantCount: 1,
      logBytes: 5,
      archiveRoot: ARCHIVE_ROOT,
      rejected: [],
    })
    expect(warnings).toHaveLength(1)
  })

  it('全部目标被拒时仍返回预览（不整单失败）', async () => {
    const { ports, calls } = createPorts({ headers: BATCH, archived: [] })
    expect(await previewDeleteBatch(ports, ['session-a', 'session-ghost'], ARCHIVE_ROOT)).toEqual({
      targetCount: 2,
      sessionCount: 0,
      descendantCount: 0,
      logBytes: 0,
      archiveRoot: ARCHIVE_ROOT,
      rejected: [
        { sessionId: 'session-a', code: 'not-archived', message: expect.any(String) },
        { sessionId: 'session-ghost', code: 'not-found', message: expect.any(String) },
      ],
    })
    expect(calls).toEqual([])
  })

  it('空目标：零统计、零测量、无软失败', async () => {
    const { ports, calls } = createPorts({ headers: BATCH })
    expect(await previewDeleteBatch(ports, [], ARCHIVE_ROOT)).toEqual({
      targetCount: 0,
      sessionCount: 0,
      descendantCount: 0,
      logBytes: 0,
      archiveRoot: ARCHIVE_ROOT,
      rejected: [],
    })
    expect(calls).toEqual([])
  })
})

describe('deleteSessionBatch', () => {
  it('按并集全量逐 id 执行 cleanup → remove → emit，removed 是并集而不是勾选目标', async () => {
    const recording = createPorts({ headers: BATCH, archived: ['session-a', 'session-b'] })
    const { ports, trace } = tracePorts(recording)
    expect(await deleteSessionBatch(ports, ['session-b', 'session-a'])).toEqual({
      ok: true,
      outcome: { removed: UNION_BA, warnings: [] },
    })
    expect(recording.calls).toEqual(UNION_BA.flatMap((id) => [`cleanup:${id}`, `remove:${id}`, `emit:${id}`]))
    expect(trace.filter((call) => call === 'listStoredHeaders')).toHaveLength(1)
  })

  it('重复目标只处置一次', async () => {
    const { ports, calls } = createPorts({ headers: BATCH, archived: ['session-a'] })
    expect(await deleteSessionBatch(ports, ['session-a', 'session-a'])).toEqual({
      ok: true,
      outcome: { removed: ['session-a', 'session-a-child'], warnings: [] },
    })
    expect(calls.filter((call) => call === 'cleanup:session-a')).toHaveLength(1)
  })

  it('任一目标被拒即整单拒绝（首个拒绝码），零副作用', async () => {
    const recording = createPorts({ headers: BATCH, archived: ['session-a'] })
    const { ports, trace } = tracePorts(recording)
    expect(await deleteSessionBatch(ports, ['session-a', 'session-ghost'])).toEqual({
      ok: false,
      code: 'not-found',
      message: expect.stringContaining('"session-ghost"'),
    })
    // 唯一的 I/O 是只读的 listStoredHeaders：cleanup / remove / emit 一次都没有发生。
    expect(trace).toEqual(['listStoredHeaders'])
    expect(recording.calls.filter((call) => /^(cleanup|remove|emit):/.test(call))).toEqual([])
    expect(recording.prepared).toEqual([])
  })

  it('「首个」按输入顺序取：not-archived 在前时返回 not-archived', async () => {
    const { ports } = createPorts({ headers: BATCH, archived: ['session-a'] })
    expect(await deleteSessionBatch(ports, ['session-other', 'session-ghost'])).toEqual({
      ok: false,
      code: 'not-archived',
      message: expect.stringContaining('"session-other"'),
    })
  })

  it('文件失败不中止不回滚：warnings 按并集顺序收集，removed 仍是并集全量', async () => {
    const { ports, calls } = createPorts({
      headers: BATCH,
      archived: ['session-a', 'session-b'],
      remove: async (sessionId) => {
        if (sessionId === 'session-b') return ['/home/tester/.dsh/sessions/proj/session-b: EACCES']
        if (sessionId === 'session-b-child') throw new Error('driver exploded')
        return []
      },
    })
    expect(await deleteSessionBatch(ports, ['session-b', 'session-a'])).toEqual({
      ok: true,
      outcome: {
        removed: UNION_BA,
        warnings: [
          '/home/tester/.dsh/sessions/proj/session-b: EACCES',
          'files: session-b-child: driver exploded',
        ],
      },
    })
    // 失败之后的后代与第二个目标照常处置，registry 清理与广播也都发生。
    for (const id of UNION_BA) {
      expect(calls).toContain(`cleanup:${id}`)
      expect(calls).toContain(`emit:${id}`)
      expect(calls).toContain(`remove:${id}`)
    }
  })

  it('空目标：成功且无任何会话动作', async () => {
    const { ports, calls } = createPorts({ headers: BATCH })
    expect(await deleteSessionBatch(ports, [])).toEqual({ ok: true, outcome: { removed: [], warnings: [] } })
    expect(calls).toEqual([])
  })
})

describe('archiveSessionBatch', () => {
  it('prepareArchive 在任何写动作之前，随后按并集 cleanup → archive → emit', async () => {
    const recording = createPorts({ headers: BATCH, archived: ['session-a'] })
    const { ports, trace } = tracePorts(recording)
    expect(await archiveSessionBatch(ports, ['session-a'], ARCHIVE_ROOT)).toEqual({
      ok: true,
      outcome: { removed: ['session-a', 'session-a-child'], warnings: [] },
    })
    expect(trace).toEqual([
      'listStoredHeaders',
      `prepare:${ARCHIVE_ROOT}`,
      'cleanup:session-a', 'archive:session-a', 'emit:session-a',
      'cleanup:session-a-child', 'archive:session-a-child', 'emit:session-a-child',
    ])
    expect(recording.prepared).toEqual([ARCHIVE_ROOT])
  })

  it('prepareArchive 失败 → archive-unavailable，零写动作', async () => {
    const recording = createPorts({
      headers: BATCH,
      archived: ['session-a'],
      prepare: async () => { throw new Error('EACCES: permission denied') },
    })
    const { ports, trace } = tracePorts(recording)
    expect(await archiveSessionBatch(ports, ['session-a'], ARCHIVE_ROOT)).toEqual({
      ok: false,
      code: 'archive-unavailable',
      message: `archive root "${ARCHIVE_ROOT}" is not usable: EACCES: permission denied`,
    })
    expect(recording.calls).toEqual([])
    expect(trace).toEqual(['listStoredHeaders', `prepare:${ARCHIVE_ROOT}`])
  })

  it('相对 archiveRoot → archive-unavailable，且根本不准备归档根', async () => {
    const recording = createPorts({ headers: BATCH, archived: ['session-a'] })
    const { ports, trace } = tracePorts(recording)
    expect(await archiveSessionBatch(ports, ['session-a'], 'archive/sessions')).toEqual({
      ok: false,
      code: 'archive-unavailable',
      message: 'archive root "archive/sessions" is not an absolute path',
    })
    expect(recording.prepared).toEqual([])
    expect(trace).toEqual(['listStoredHeaders'])
  })

  it('校验先于归档根准备：目标被拒时返回业务码而不是 archive-unavailable', async () => {
    const recording = createPorts({
      headers: BATCH,
      archived: ['session-a'],
      prepare: async () => { throw new Error('EACCES: permission denied') },
    })
    const { ports, trace } = tracePorts(recording)
    expect(await archiveSessionBatch(ports, ['session-ghost'], ARCHIVE_ROOT)).toEqual({
      ok: false,
      code: 'not-found',
      message: expect.stringContaining('"session-ghost"'),
    })
    expect(recording.prepared).toEqual([])
    expect(trace).toEqual(['listStoredHeaders'])
  })

  it('逐项迁移失败只进 warnings，不中止不回滚，removed 仍是并集全量', async () => {
    const { ports, calls } = createPorts({
      headers: BATCH,
      archived: ['session-a', 'session-b'],
      archive: async (sessionId) => {
        if (sessionId === 'session-b-child') return [`${ARCHIVE_ROOT}/proj/session-b-child: EACCES`]
        if (sessionId === 'session-a') throw new Error('driver exploded')
        return []
      },
    })
    expect(await archiveSessionBatch(ports, ['session-b', 'session-a'], ARCHIVE_ROOT)).toEqual({
      ok: true,
      outcome: {
        removed: UNION_BA,
        warnings: [
          `${ARCHIVE_ROOT}/proj/session-b-child: EACCES`,
          'files: session-a: driver exploded',
        ],
      },
    })
    expect(calls.filter((call) => call === 'cleanup:session-a')).toHaveLength(1)
    expect(calls.filter((call) => call === `archive:session-a-child:${ARCHIVE_ROOT}`)).toHaveLength(1)
  })

  it('空目标：成功且无任何会话动作', async () => {
    const { ports, calls } = createPorts({ headers: BATCH })
    expect(await archiveSessionBatch(ports, [], ARCHIVE_ROOT)).toEqual({
      ok: true,
      outcome: { removed: [], warnings: [] },
    })
    expect(calls).toEqual([])
  })
})
