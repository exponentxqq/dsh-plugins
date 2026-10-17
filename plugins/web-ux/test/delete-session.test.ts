/**
 * 「删除已归档会话」宿主侧流程的单测：级联收集、三种拒绝码、预览统计、执行顺序
 * 与半失败 warnings，以及文件操作工厂的目录定位与安全防线。
 *
 * 全部通过注入的 fake 端口与内存文件系统驱动：不触碰真实磁盘、不需要 cordis。
 */

import { basename, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  collectDeleteSet,
  createSessionFiles,
  deleteSession,
  planDelete,
  previewDelete,
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

/** 一次 fake 端口组装的产物。 */
interface RecordingPorts {
  /** 交给流程的端口。 */
  readonly ports: DeletePorts
  /** 端口调用序列，形如 `cleanup:<id>`。 */
  readonly calls: string[]
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
    emitRemoved: (sessionId) => {
      calls.push(`emit:${sessionId}`)
      options.emit?.(sessionId)
    },
    warn: (message, error) => { warnings.push([message, error]) },
  }
  return { ports, calls, warnings }
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
    expect(await previewDelete(ports, 'session-target')).toEqual({
      ok: true,
      preview: { sessionCount: 3, descendantCount: 2, logBytes: 60 },
    })
    expect(calls).toEqual([
      'measure:session-target',
      'measure:session-child',
      'measure:session-grandchild',
    ])
  })

  it('未归档时与执行同款拒绝，且不做任何测量', async () => {
    const { ports, calls } = createPorts({ headers: CASCADE, archived: [] })
    expect(await previewDelete(ports, 'session-target')).toEqual({
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
    expect(await previewDelete(ports, 'session-target')).toEqual({
      ok: true,
      preview: { sessionCount: 3, descendantCount: 2, logBytes: 10 },
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

/** 内存文件系统：目录集合 + 文件大小表 + 可注入的逐操作失败。 */
interface FakeFs {
  /** 交给工厂的文件系统端口。 */
  readonly ops: FileSystemOps
  /** 每次文件系统调用的记录，形如 `rm <path>`。 */
  readonly calls: string[]
  /** 建目录（自顶向下调用，已存在则无操作）。 */
  addDir(path: string): void
  /** 建文件。 */
  addFile(path: string, size: number): void
  /** 让某个操作对某个路径抛错。 */
  fail(op: 'readdir' | 'lstat' | 'rm' | 'unlink', path: string, error: Error): void
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
  const failures = new Map<string, Error>()
  const calls: string[] = []

  const missing = (path: string): Error =>
    Object.assign(new Error(`ENOENT: no such file or directory, ${path}`), { code: 'ENOENT' })
  const check = (op: string, path: string): void => {
    const failure = failures.get(`${op} ${path}`)
    if (failure !== undefined) throw failure
  }
  const removeTree = (path: string): void => {
    files.delete(path)
    const children = dirs.get(path)
    if (children === undefined) return
    dirs.delete(path)
    for (const name of children) removeTree(join(path, name))
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
      }))
    },
    lstat: async (path) => {
      calls.push(`lstat ${path}`)
      check('lstat', path)
      if (dirs.has(path)) return { size: 0, isDirectory: () => true }
      const size = files.get(path)
      if (size === undefined) throw missing(path)
      return { size, isDirectory: () => false }
    },
    rm: async (path, options) => {
      calls.push(`rm ${path}`)
      check('rm', path)
      if (!dirs.has(path) && !files.has(path)) {
        if (!options.force) throw missing(path)
        return
      }
      removeTree(path)
    },
    unlink: async (path) => {
      calls.push(`unlink ${path}`)
      check('unlink', path)
      if (!files.delete(path)) throw missing(path)
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
    fail: (op, path, error) => { failures.set(`${op} ${path}`, error) },
    has: (path) => dirs.has(path) || files.has(path),
  }
}

/** 测试用的固定 DSH_HOME。 */
const HOME = '/home/tester/.dsh'

/**
 * 把文件操作工厂挂到 {@link HOME} 上。
 * @param fs - 文件系统端口。
 * @returns 工厂产出的 `measure` / `remove`。
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
    }
    expect(await mountFiles(ops).remove('session-a')).toEqual([
      `${join(HOME, 'sessions', 'proj-link')}: symbolic-linked project directory was not followed`,
    ])
    // 只尝试了投影缓存的 unlink：符号链接项目目录下的会话树一次都没有被 rm。
    expect(calls).toEqual(['unlink'])
  })
})
