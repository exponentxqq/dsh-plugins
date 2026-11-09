/**
 * 宿主实载体的单测：channel 的软挂载（connection 缺失只告警）、CHANNEL 注册与
 * disposer 释放，以及 dispatcher 在真实临时目录上的预览 / 删除 / 归档迁移 / 拒绝 /
 * 失败映射；迁移域的 7 端点分派、归档根枚举、物理删除与恢复（含 `api-session/added`
 * 广播载荷）同样跑在真实临时 `$DSH_HOME` 上。
 *
 * cordis Context 用一个最小 fake 代替：注入回调、服务查找、logger 与 emit 全部
 * 可控，断言的是本插件的行为而不是 cordis 的调度。文件操作则跑在真实临时目录上，
 * 以覆盖 `node:fs/promises` 适配层；归档根走真实的 `resolveArchiveRoot`（缺省
 * `$DSH_HOME/archive/sessions` 与显式配置两条路径）。
 */

import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CHANNEL,
  DELETE_BATCH_ENDPOINT,
  DELETE_ENDPOINT,
  DELETE_MIGRATED_ENDPOINT,
  LIST_MIGRATED_ENDPOINT,
  MAX_LISTED_MIGRATED,
  PREVIEW_BATCH_ENDPOINT,
  PREVIEW_ENDPOINT,
  RESTORE_MIGRATED_ENDPOINT,
  parseBatchPreview,
  parseMigratedListing,
  parseOutcome,
  parsePreview,
  parseRestoreOutcome,
  type Parsed,
} from '../src/contract.ts'
import { SESSION_REMOVED_EVENT, type StoredSessionHeader } from '../src/delete-session.ts'
import { apply, Config, createDispatcher, inject, name } from '../src/index.ts'
import { SESSION_ADDED_EVENT } from '../src/migrated.ts'

/** 请求用的一次性 abort signal（本流程不消费取消，仅满足 channel 形状）。 */
const SIGNAL = new AbortController().signal

/** 测试用目标会话 id。 */
const TARGET = 'session-a'

/** 目标会话在 `sessions/` 下的项目目录名（`createHome` 的布局与归档目标共用）。 */
const PROJECT_DIR = '--home-docker--'

/** channel handler 的形状。 */
type Dispatcher = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<ConnectionRpcResult<unknown>>

/** fake 宿主上下文与它记录下来的交互。 */
interface FakeHost {
  /** 传给 `apply` / `createDispatcher` 的上下文。 */
  readonly ctx: Context
  /** `ctx.logger.warn` 的每次调用参数。 */
  readonly warnings: unknown[][]
  /** `ctx.emit` 的每次调用参数。 */
  readonly emitted: unknown[][]
  /** 注册到 `connection.rpc` 的 channel → handler。 */
  readonly channels: Map<string, Dispatcher>
  /** `apply` 交给 cordis 的清理回调（注入回调的返回值）与 disposer 释放次数。 */
  readonly status: { cleanup?: () => unknown; disposals: number }
}

/** fake 宿主的可调服务集。 */
interface FakeHostOptions {
  /** `provided` 正常提供 connection；`missing` 服务存在但解析为 undefined；`absent` 完全不提供。 */
  readonly connection?: 'provided' | 'missing' | 'absent'
  /** 是否提供 webServer 服务，默认 true。 */
  readonly webServer?: boolean
  /** 临时 DSH_HOME；给出时才提供 dshHomePath 服务。 */
  readonly homePath?: string
  /** `ctx.sessionPersistence.list()` 的替身。 */
  readonly persistence?: { list(): Promise<readonly { header: StoredSessionHeader }[]> }
  /** `ctx.workspaceRegistry` 的替身。 */
  readonly registry?: unknown
  /** `ctx.get('sessions')` 的替身。 */
  readonly sessions?: unknown
}

/**
 * 组装一个最小 cordis 上下文替身。
 * @param options - 提供哪些服务。
 * @returns 上下文与交互记录。
 */
function createFakeHost(options: FakeHostOptions = {}): FakeHost {
  const services = new Map<string, unknown>()
  const warnings: unknown[][] = []
  const emitted: unknown[][] = []
  const channels = new Map<string, Dispatcher>()
  const status: { cleanup?: () => unknown; disposals: number } = { disposals: 0 }
  const get = (serviceName: string): unknown => services.get(serviceName)
  const base = {
    inject: (names: readonly string[], callback: (child: unknown) => unknown): void => {
      // 仿 cordis：依赖不齐时回调不运行（本插件的软挂载就建立在这个语义上）。
      if (!names.every((serviceName) => services.has(serviceName))) return
      status.cleanup = callback({ root: { get } }) as (() => unknown) | undefined
    },
    get,
    logger: { warn: (...args: unknown[]): void => { warnings.push(args) } },
    emit: (event: string, ...args: unknown[]): void => { emitted.push([event, ...args]) },
  }
  // 仿 cordis 的 context 代理：`ctx.dshHomePath` 这类服务属性读取落到服务表上。
  const ctx = new Proxy(base, {
    get: (target, property, receiver) =>
      Reflect.has(target, property) ? Reflect.get(target, property, receiver) : services.get(String(property)),
  }) as unknown as Context

  if (options.webServer !== false) services.set('webServer', {})
  if (options.connection !== 'absent') {
    services.set('connection', options.connection === 'missing' ? undefined : {
      rpc: {
        handle: (channel: string, handler: Dispatcher): (() => Promise<void>) => {
          channels.set(channel, handler)
          return async (): Promise<void> => { status.disposals += 1 }
        },
      },
    })
  }
  if (options.homePath !== undefined) {
    const home = options.homePath
    services.set('dshHomePath', (...segments: string[]) => join(home, ...segments))
  }
  if (options.persistence !== undefined) services.set('sessionPersistence', options.persistence)
  if (options.registry !== undefined) services.set('workspaceRegistry', options.registry)
  if (options.sessions !== undefined) services.set('sessions', options.sessions)
  return { ctx, warnings, emitted, channels, status }
}

/**
 * 最小 workspaceRegistry 替身：记录 unarchive / unpin / detach 的调用顺序。
 * @param archived - 初始归档集合。
 * @param members - 工作区 id → 会话 id 列表。
 * @returns 注册表替身与调用记录。
 */
function createFakeRegistry(archived: readonly string[], members: Record<string, readonly string[]> = {}): {
  readonly registry: unknown
  readonly calls: string[]
} {
  const calls: string[] = []
  const archivedIds = new Set(archived)
  const registry = {
    get archivedSessionIds(): readonly string[] { return [...archivedIds] },
    unarchiveSession: async (sessionId: string): Promise<void> => {
      calls.push(`unarchive:${sessionId}`)
      archivedIds.delete(sessionId)
    },
    unpinSession: async (sessionId: string): Promise<void> => {
      calls.push(`unpin:${sessionId}`)
    },
    list: (): readonly {
      readonly id: string
      readonly sessionIds: readonly string[]
      detachSession(id: string): Promise<void>
    }[] => Object.entries(members).map(([id, sessionIds]) => ({
      id,
      sessionIds,
      detachSession: async (sessionId: string): Promise<void> => { calls.push(`detach:${id}:${sessionId}`) },
    })),
  }
  return { registry, calls }
}

/** 本次测试建出来的临时 home，逐个清理。 */
const homes: string[] = []

afterEach(async () => {
  await Promise.all(homes.splice(0).map(async (home) => { await rm(home, { recursive: true, force: true }) }))
})

/**
 * 建一个临时 DSH_HOME：目标会话的日志目录与投影缓存各一份。
 * @param sessionId - 目标会话 id。
 * @returns 临时 home 的绝对路径。
 */
async function createHome(sessionId: string): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'web-ux-host-'))
  homes.push(home)
  const sessionDir = join(home, 'sessions', PROJECT_DIR, sessionId)
  await mkdir(sessionDir, { recursive: true })
  await writeFile(join(sessionDir, 'session.v4.jsonl.zstd'), 'x'.repeat(10))
  const cacheDir = join(home, 'storages', 'session_projcache', 'sessions')
  await mkdir(cacheDir, { recursive: true })
  await writeFile(join(cacheDir, `${sessionId}.json`), 'cache')
  return home
}

/** 目标会话的投影缓存文件路径（删除与迁移都必须把它一并清掉）。 */
function cachePathOf(home: string, sessionId: string): string {
  return join(home, 'storages', 'session_projcache', 'sessions', `${sessionId}.json`)
}

/** 目标会话的日志目录路径。 */
function sessionDirOf(home: string, sessionId: string): string {
  return join(home, 'sessions', PROJECT_DIR, sessionId)
}

describe('web-ux 宿主声明', () => {
  it('插件名与三个硬依赖与契约一致', () => {
    expect(name).toBe('web-ux')
    expect(inject).toEqual(['workspaceRegistry', 'sessionPersistence', 'dshHomePath'])
  })

  it('从包入口导出原生 Schemastery Config（loader 的唯一读取点，构建时内联）', () => {
    expect(Config).toBeTypeOf('function')
    expect(Config({ archiveRoot: '/tmp/archive' })).toEqual({ archiveRoot: '/tmp/archive' })
  })
})

describe('apply', () => {
  it('connection 缺失时只告警，不注册 channel、不抛错', () => {
    const host = createFakeHost({ connection: 'missing' })
    expect(() => { apply(host.ctx) }).not.toThrow()
    expect(host.channels.size).toBe(0)
    expect(host.warnings).toHaveLength(1)
    expect(String(host.warnings[0][0])).toContain('connection')
  })

  it('依赖服务不齐时 cordis 不会调用回调（软挂载）', () => {
    const host = createFakeHost({ connection: 'absent' })
    expect(() => { apply(host.ctx) }).not.toThrow()
    expect(host.channels.size).toBe(0)
    expect(host.warnings).toEqual([])
  })

  it('注册 CHANNEL，并在 fiber 卸载时释放 disposer', () => {
    const host = createFakeHost()
    apply(host.ctx)
    expect([...host.channels.keys()]).toEqual([CHANNEL])
    expect(host.status.cleanup).toBeTypeOf('function')
    host.status.cleanup?.()
    expect(host.status.disposals).toBe(1)
  })

  it('注册的 handler 走向真实流程', async () => {
    const home = await createHome(TARGET)
    const host = createFakeHost({
      homePath: home,
      persistence: { list: async () => [{ header: { id: TARGET } }] },
      registry: createFakeRegistry([TARGET]).registry,
    })
    apply(host.ctx)
    const handler = host.channels.get(CHANNEL)
    expect(handler).toBeTypeOf('function')
    if (handler === undefined) throw new Error('channel not mounted')
    const result = await handler(PREVIEW_ENDPOINT, { sessionId: TARGET, mode: 'archive' }, SIGNAL)
    if (!result.ok) throw new Error(result.error.message)
    const parsed = parsePreview(result.value)
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value).toMatchObject({ sessionCount: 1, descendantCount: 0 })
  })
})

describe('createDispatcher', () => {
  it('预览回声缺省归档根（$DSH_HOME/archive/sessions）', async () => {
    const home = await createHome(TARGET)
    const host = createFakeHost({
      homePath: home,
      persistence: { list: async () => [{ header: { id: TARGET } }] },
      registry: createFakeRegistry([TARGET]).registry,
    })
    const preview = await createDispatcher(host.ctx)(PREVIEW_ENDPOINT, { sessionId: TARGET, mode: 'archive' }, SIGNAL)
    if (!preview.ok) throw new Error(preview.error.message)
    const parsed = parsePreview(preview.value)
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value.archiveRoot).toBe(join(home, 'archive', 'sessions'))
  })

  it('preview 与 delete 走通真实文件系统，并广播移除事件（删除模式不建归档目录）', async () => {
    const home = await createHome(TARGET)
    const fakeRegistry = createFakeRegistry([TARGET], { 'ws-1': [TARGET] })
    const host = createFakeHost({
      homePath: home,
      persistence: { list: async () => [{ header: { id: TARGET } }] },
      registry: fakeRegistry.registry,
    })
    const dispatch = createDispatcher(host.ctx)

    const preview = await dispatch(PREVIEW_ENDPOINT, { sessionId: TARGET, mode: 'delete' }, SIGNAL)
    if (!preview.ok) throw new Error(preview.error.message)
    const parsedPreview = parsePreview(preview.value)
    if (!parsedPreview.ok) throw new Error(parsedPreview.message)
    expect(parsedPreview.value).toMatchObject({ sessionCount: 1, descendantCount: 0 })
    expect(parsedPreview.value.logBytes).toBeGreaterThanOrEqual(15)

    const outcome = await dispatch(DELETE_ENDPOINT, { sessionId: TARGET, mode: 'delete' }, SIGNAL)
    if (!outcome.ok) throw new Error(outcome.error.message)
    const parsedOutcome = parseOutcome(outcome.value)
    if (!parsedOutcome.ok) throw new Error(parsedOutcome.message)
    expect(parsedOutcome.value).toEqual({ removed: [TARGET], warnings: [] })

    expect(fakeRegistry.calls).toEqual([`unarchive:${TARGET}`, `unpin:${TARGET}`, `detach:ws-1:${TARGET}`])
    expect(host.emitted).toEqual([[SESSION_REMOVED_EVENT, TARGET]])
    expect(existsSync(sessionDirOf(home, TARGET))).toBe(false)
    expect(existsSync(cachePathOf(home, TARGET))).toBe(false)
    // 删除模式绝不创建归档目录：缺省根 `<home>/archive/sessions` 的父级都必须不存在。
    expect(existsSync(join(home, 'archive'))).toBe(false)
  })

  it('归档：预览回声自定义根，执行后日志目录迁到该根、缓存删除、registry 按序清理', async () => {
    const home = await createHome(TARGET)
    const archiveRoot = join(home, 'custom-archive')
    const fakeRegistry = createFakeRegistry([TARGET], { 'ws-1': [TARGET] })
    const host = createFakeHost({
      homePath: home,
      persistence: { list: async () => [{ header: { id: TARGET } }] },
      registry: fakeRegistry.registry,
    })
    const dispatch = createDispatcher(host.ctx, { archiveRoot })

    const preview = await dispatch(PREVIEW_ENDPOINT, { sessionId: TARGET, mode: 'archive' }, SIGNAL)
    if (!preview.ok) throw new Error(preview.error.message)
    const parsedPreview = parsePreview(preview.value)
    if (!parsedPreview.ok) throw new Error(parsedPreview.message)
    expect(parsedPreview.value.archiveRoot).toBe(archiveRoot)

    const outcome = await dispatch(DELETE_ENDPOINT, { sessionId: TARGET, mode: 'archive' }, SIGNAL)
    if (!outcome.ok) throw new Error(outcome.error.message)
    const parsedOutcome = parseOutcome(outcome.value)
    if (!parsedOutcome.ok) throw new Error(parsedOutcome.message)
    expect(parsedOutcome.value).toEqual({ removed: [TARGET], warnings: [] })

    // 目标结构：<archiveRoot>/<项目目录>/<会话id>/，日志文件原样在场；源目录消失。
    expect(existsSync(join(archiveRoot, PROJECT_DIR, TARGET, 'session.v4.jsonl.zstd'))).toBe(true)
    expect(existsSync(sessionDirOf(home, TARGET))).toBe(false)
    // 投影缓存是纯缓存，迁移时直接删除（不搬去归档根）。
    expect(existsSync(cachePathOf(home, TARGET))).toBe(false)
    // 执行序列与删除同构：cleanup（unarchive → unpin → detach）→ 文件动作 → emit。
    expect(fakeRegistry.calls).toEqual([`unarchive:${TARGET}`, `unpin:${TARGET}`, `detach:ws-1:${TARGET}`])
    expect(host.emitted).toEqual([[SESSION_REMOVED_EVENT, TARGET]])
  })

  it('归档根不可用（父路径是普通文件）映射为 archive-unavailable，且 registry 零调用', async () => {
    const home = await createHome(TARGET)
    await writeFile(join(home, 'blocked'), 'not a directory')
    const fakeRegistry = createFakeRegistry([TARGET], { 'ws-1': [TARGET] })
    const host = createFakeHost({
      homePath: home,
      persistence: { list: async () => [{ header: { id: TARGET } }] },
      registry: fakeRegistry.registry,
    })
    const dispatch = createDispatcher(host.ctx, { archiveRoot: join(home, 'blocked', 'sessions') })

    expect(await dispatch(DELETE_ENDPOINT, { sessionId: TARGET, mode: 'archive' }, SIGNAL)).toEqual({
      ok: false,
      error: { code: 'archive-unavailable', message: expect.any(String), details: {} },
    })
    // 任何写动作之前就失败：registry 与广播零调用，源目录与缓存原样保留。
    expect(fakeRegistry.calls).toEqual([])
    expect(host.emitted).toEqual([])
    expect(existsSync(join(sessionDirOf(home, TARGET), 'session.v4.jsonl.zstd'))).toBe(true)
    expect(existsSync(cachePathOf(home, TARGET))).toBe(true)
  })

  it('非法请求体、缺 mode 与未知端点都映射为 bad-request', async () => {
    const host = createFakeHost()
    const dispatch = createDispatcher(host.ctx)
    for (const payload of [
      {},
      { sessionId: '' },
      { sessionId: 42 },
      { sessionId: TARGET },
      { sessionId: TARGET, mode: 'purge' },
      { sessionId: TARGET, mode: 42 },
      { sessionId: TARGET, mode: 'archive', extra: true },
    ]) {
      expect(await dispatch(PREVIEW_ENDPOINT, payload, SIGNAL)).toEqual({
        ok: false,
        error: { code: 'bad-request', message: expect.any(String), details: {} },
      })
    }
    expect(await dispatch('not-an-endpoint', { sessionId: TARGET, mode: 'delete' }, SIGNAL)).toEqual({
      ok: false,
      error: { code: 'bad-request', message: expect.any(String), details: {} },
    })
  })

  it('dshHomePath 缺失时返回 internal 并告警', async () => {
    const host = createFakeHost({ persistence: { list: async () => [{ header: { id: TARGET } }] } })
    expect(await createDispatcher(host.ctx)(PREVIEW_ENDPOINT, { sessionId: TARGET, mode: 'archive' }, SIGNAL)).toEqual({
      ok: false,
      error: { code: 'internal', message: expect.any(String), details: {} },
    })
    expect(host.warnings).toHaveLength(1)
  })

  it('未归档目标映射为 not-archived', async () => {
    const home = await createHome(TARGET)
    const host = createFakeHost({
      homePath: home,
      persistence: { list: async () => [{ header: { id: TARGET } }] },
      registry: createFakeRegistry([]).registry,
    })
    expect(await createDispatcher(host.ctx)(DELETE_ENDPOINT, { sessionId: TARGET, mode: 'delete' }, SIGNAL)).toEqual({
      ok: false,
      error: { code: 'not-archived', message: expect.any(String), details: {} },
    })
  })

  it('宿主内存中仍存活的会话映射为 session-live', async () => {
    const home = await createHome(TARGET)
    const host = createFakeHost({
      homePath: home,
      persistence: { list: async () => [{ header: { id: TARGET } }] },
      registry: createFakeRegistry([TARGET]).registry,
      sessions: { get: (sessionId: string) => (sessionId === TARGET ? { id: TARGET } : undefined) },
    })
    expect(await createDispatcher(host.ctx)(PREVIEW_ENDPOINT, { sessionId: TARGET, mode: 'archive' }, SIGNAL)).toEqual({
      ok: false,
      error: { code: 'session-live', message: expect.any(String), details: {} },
    })
  })

  it('持久化里查不到的会话映射为 not-found', async () => {
    const home = await createHome(TARGET)
    const host = createFakeHost({
      homePath: home,
      persistence: { list: async () => [] },
      registry: createFakeRegistry([TARGET]).registry,
    })
    expect(await createDispatcher(host.ctx)(DELETE_ENDPOINT, { sessionId: TARGET, mode: 'delete' }, SIGNAL)).toEqual({
      ok: false,
      error: { code: 'not-found', message: expect.any(String), details: {} },
    })
  })

  it('未预期异常映射为 internal 并保留原因', async () => {
    const home = await createHome(TARGET)
    const host = createFakeHost({
      homePath: home,
      persistence: {
        list: async () => { throw new Error('storage exploded') },
      },
      registry: createFakeRegistry([TARGET]).registry,
    })
    expect(await createDispatcher(host.ctx)(PREVIEW_ENDPOINT, { sessionId: TARGET, mode: 'archive' }, SIGNAL)).toEqual({
      ok: false,
      error: { code: 'internal', message: 'storage exploded', details: {} },
    })
    expect(host.warnings).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 迁移域接线：7 端点分派、真实归档根上的枚举 / 删除 / 恢复，以及
// `api-session/added` 的广播载荷。文件系统与归档根解析走真实实现，只有 cordis
// 上下文与工作区注册表是 fake。
// ---------------------------------------------------------------------------

/** `session-<uuid>` 形态的会话目录名（当前部署主流形态，D12 要求原样保留）。 */
const PREFIXED_ID = 'session-0a7083fd-0a7e-4c5f-9d38-6c0f3f7f2a11'

/** 裸 UUID 形态的会话目录名。 */
const BARE_ID = '0a7083fd-0a7e-4c5f-9d38-6c0f3f7f2a11'

/** 无 cwd 归档条目的归组目录名。 */
const NO_CWD = '_no-cwd'

/** 缺省归档根的绝对路径（`$DSH_HOME/archive/sessions`）。 */
function archiveRootOf(home: string): string {
  return join(home, 'archive', 'sessions')
}

/** 归档条目的绝对路径：`<archiveRoot>/<projectDir>/<dirName>`。 */
function archivedPathOf(home: string, projectDir: string, dirName: string): string {
  return join(archiveRootOf(home), projectDir, dirName)
}

/**
 * 建一个空的临时 DSH_HOME（不预置任何会话），用于不需要 `sessions/` 的迁移域用例。
 * @returns 临时 home 的绝对路径（已登记进 afterEach 清理表）。
 */
async function createEmptyHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'web-ux-host-'))
  homes.push(home)
  return home
}

/**
 * 在 `sessions/` 下建一个会话目录与投影缓存（布局与 {@link createHome} 一致）。
 * @param home - 临时 DSH_HOME。
 * @param sessionId - 会话 id（同时作为目录名）。
 * @param bytes - 日志文件体积。
 * @returns 会话目录的绝对路径。
 */
async function createStoredSession(home: string, sessionId: string, bytes = 10): Promise<string> {
  const sessionDir = sessionDirOf(home, sessionId)
  await mkdir(sessionDir, { recursive: true })
  await writeFile(join(sessionDir, 'session.v4.jsonl.zstd'), 'x'.repeat(bytes))
  await mkdir(join(home, 'storages', 'session_projcache', 'sessions'), { recursive: true })
  await writeFile(cachePathOf(home, sessionId), 'cache')
  return sessionDir
}

/**
 * 在缺省归档根下建一条已迁移会话（含一个日志文件）。
 * @param home - 临时 DSH_HOME。
 * @param projectDir - 归档根下的一级项目目录名。
 * @param dirName - 会话目录名。
 * @param bytes - 日志文件体积。
 * @returns 归档条目目录的绝对路径。
 */
async function createArchived(home: string, projectDir: string, dirName: string, bytes = 10): Promise<string> {
  const dir = archivedPathOf(home, projectDir, dirName)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'session.v4.jsonl.zstd'), 'x'.repeat(bytes))
  return dir
}

/**
 * `ctx.sessionPersistence.list()` 的替身：把会话头列表包成上游的 snapshot 形状。
 * @param headers - 持久化里的会话头。
 * @returns 只有 `list()` 的 persistence 替身。
 */
function storedHeaders(...headers: readonly StoredSessionHeader[]): {
  list(): Promise<readonly { readonly header: StoredSessionHeader }[]>
} {
  return { list: async () => headers.map((header) => ({ header })) }
}

/** 工作区注册表替身里一个工作区的形状。 */
interface RegistryWorkspace {
  /** 工作区 id。 */
  readonly id: string
  /** 工作区项目目录（`projectKey` 匹配用）。 */
  readonly path: string
  /** 初始会话成员。 */
  readonly sessionIds?: readonly string[]
}

/** 工作区注册表替身的可调行为。 */
interface RegistryOptions {
  /** 初始归档集合。 */
  readonly archived?: readonly string[]
  /** 工作区列表（`list()` 与 `get()` 的数据源）。 */
  readonly workspaces?: readonly RegistryWorkspace[]
  /** 给定时 `attachSession` 抛错，用于覆盖上游拒绝挂回的降级路径。 */
  readonly attachFailure?: string
  /** 给定时 `archiveSession` 抛错，用于覆盖归档集合写失败的降级路径。 */
  readonly archiveFailure?: string
}

/** 工作区注册表与它记录下来的调用序列。 */
interface FakeWorkspaceRegistry {
  /** 交给 `createFakeHost` 的注册表替身。 */
  readonly registry: unknown
  /** 每次操作的记录，形如 `attach:<workspaceId>:<sessionId>`。 */
  readonly calls: string[]
}

/**
 * 组装一个覆盖迁移域端口的工作区注册表替身：归档集合读写、工作区列表、`get(id)`
 * 与 `attachSession` / `archiveSession` 全部可观察；attach / archive 可注入失败。
 * @param options - 初始状态与失败注入。
 * @returns 注册表替身与调用记录。
 */
function createWorkspaceRegistry(options: RegistryOptions = {}): FakeWorkspaceRegistry {
  const archived = new Set(options.archived ?? [])
  const workspaces = (options.workspaces ?? []).map((workspace) => ({
    id: workspace.id,
    path: workspace.path,
    sessionIds: [...(workspace.sessionIds ?? [])],
  }))
  const calls: string[] = []
  const registry = {
    get archivedSessionIds(): readonly string[] { return [...archived] },
    unarchiveSession: async (sessionId: string): Promise<void> => {
      calls.push(`unarchive:${sessionId}`)
      archived.delete(sessionId)
    },
    unpinSession: async (sessionId: string): Promise<void> => {
      calls.push(`unpin:${sessionId}`)
    },
    archiveSession: async (sessionId: string): Promise<void> => {
      calls.push(`archive:${sessionId}`)
      if (options.archiveFailure !== undefined) throw new Error(options.archiveFailure)
      archived.add(sessionId)
    },
    list: (): readonly {
      readonly id: string
      readonly path: string
      readonly sessionIds: readonly string[]
      detachSession(id: string): Promise<void>
    }[] => workspaces.map((workspace) => ({
      id: workspace.id,
      path: workspace.path,
      sessionIds: workspace.sessionIds,
      detachSession: async (sessionId: string): Promise<void> => {
        calls.push(`detach:${workspace.id}:${sessionId}`)
      },
    })),
    get: (workspaceId: string): {
      readonly id: string
      readonly path: string
      readonly sessionIds: readonly string[]
      attachSession(id: string): Promise<void>
    } | undefined => {
      const workspace = workspaces.find((candidate) => candidate.id === workspaceId)
      if (workspace === undefined) return undefined
      return {
        id: workspace.id,
        path: workspace.path,
        sessionIds: workspace.sessionIds,
        attachSession: async (sessionId: string): Promise<void> => {
          calls.push(`attach:${workspace.id}:${sessionId}`)
          if (options.attachFailure !== undefined) throw new Error(options.attachFailure)
          workspace.sessionIds.push(sessionId)
        },
      }
    },
  }
  return { registry, calls }
}

/**
 * 解出成功信封里的值；失败时抛出带稳定码与文案的错误，让测试在误报处直接报因。
 * @param result - dispatcher 的结果信封。
 * @returns 成功值（unknown，交给 contract 的 parser 收窄）。
 */
function valueOf(result: ConnectionRpcResult<unknown>): unknown {
  if (!result.ok) throw new Error(`expected a success envelope, got ${result.error.code}: ${result.error.message}`)
  return result.value
}

/**
 * 用 contract 的 parser 校验并解出响应值；形状不符同样直接抛错。
 * @param result - dispatcher 的结果信封。
 * @param parse - 该端点对应的响应校验函数。
 * @returns 解析后的响应。
 */
function parsedOf<T>(result: ConnectionRpcResult<unknown>, parse: (value: unknown) => Parsed<T>): T {
  const parsed = parse(valueOf(result))
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.value
}

/**
 * 迁移域失败响应信封（`details` 恒为空对象，与既有业务码一致）。
 * @param code - 期望的稳定失败码。
 * @param message - 期望的文案，或 vitest 的 asymmetric matcher（如 `expect.stringContaining`）。
 * @returns 与 dispatcher 失败信封同形的对象。
 */
function failureOf(code: string, message: unknown): {
  readonly ok: false
  readonly error: { readonly code: string; readonly message: unknown; readonly details: object }
} {
  return { ok: false, error: { code, message, details: {} } }
}

describe('createDispatcher：7 端点分派', () => {
  it('七个端点各走一次分派，批量端点按 mode 分流到删除与归档', async () => {
    const home = await createHome(TARGET)
    await createStoredSession(home, 'session-b')
    await createStoredSession(home, 'session-c')
    await createStoredSession(home, 'session-d')
    const ids = [TARGET, 'session-b', 'session-c', 'session-d']
    const headers: StoredSessionHeader[] = ids.map((id) => ({ id, cwd: '/home/docker' }))
    const fakeRegistry = createWorkspaceRegistry({
      archived: ids,
      workspaces: [{ id: 'ws-1', path: '/home/docker', sessionIds: ids }],
    })
    const host = createFakeHost({
      homePath: home,
      persistence: storedHeaders(...headers),
      registry: fakeRegistry.registry,
    })
    const dispatch = createDispatcher(host.ctx)
    const archiveRoot = archiveRootOf(home)

    // 1) preview-delete：单会话预览回声真实归档根。
    const preview = parsedOf(
      await dispatch(PREVIEW_ENDPOINT, { sessionId: TARGET, mode: 'archive' }, SIGNAL),
      parsePreview,
    )
    expect(preview).toMatchObject({ sessionCount: 1, descendantCount: 0, archiveRoot })
    expect(preview.logBytes).toBeGreaterThan(0)

    // 2) delete-session（mode=archive）：真实日志目录搬进归档根。
    const single = parsedOf(
      await dispatch(DELETE_ENDPOINT, { sessionId: TARGET, mode: 'archive' }, SIGNAL),
      parseOutcome,
    )
    expect(single).toEqual({ removed: [TARGET], warnings: [] })
    expect(existsSync(join(archiveRoot, PROJECT_DIR, TARGET, 'session.v4.jsonl.zstd'))).toBe(true)
    expect(existsSync(sessionDirOf(home, TARGET))).toBe(false)

    // 3) preview-delete-batch：批量预览按并集统计、软失败清单为空。
    const batchPreview = parsedOf(
      await dispatch(PREVIEW_BATCH_ENDPOINT, { sessionIds: ['session-b', 'session-c'], mode: 'delete' }, SIGNAL),
      parseBatchPreview,
    )
    expect(batchPreview).toMatchObject({ targetCount: 2, sessionCount: 2, descendantCount: 0, archiveRoot, rejected: [] })

    // 4) delete-session-batch（mode=delete）：批量物理删除。
    const batchDelete = parsedOf(
      await dispatch(DELETE_BATCH_ENDPOINT, { sessionIds: ['session-b', 'session-c'], mode: 'delete' }, SIGNAL),
      parseOutcome,
    )
    expect(batchDelete).toEqual({ removed: ['session-b', 'session-c'], warnings: [] })
    expect(existsSync(sessionDirOf(home, 'session-b'))).toBe(false)
    expect(existsSync(sessionDirOf(home, 'session-c'))).toBe(false)

    // 5) delete-session-batch（mode=archive）：同一端点的另一分支。
    const batchArchive = parsedOf(
      await dispatch(DELETE_BATCH_ENDPOINT, { sessionIds: ['session-d'], mode: 'archive' }, SIGNAL),
      parseOutcome,
    )
    expect(batchArchive).toEqual({ removed: ['session-d'], warnings: [] })
    expect(existsSync(join(archiveRoot, PROJECT_DIR, 'session-d', 'session.v4.jsonl.zstd'))).toBe(true)

    // 6) list-migrated：枚举归档根下的两条条目。
    const listing = parsedOf(await dispatch(LIST_MIGRATED_ENDPOINT, {}, SIGNAL), parseMigratedListing)
    expect(listing.archiveRoot).toBe(archiveRoot)
    expect(listing.truncated).toBe(false)
    expect(listing.entries.map((entry) => entry.sessionId).sort()).toEqual([TARGET, 'session-d'].sort())

    // 7) restore-migrated：搬回 sessions/、挂回工作区并广播 added。
    const restore = parsedOf(
      await dispatch(RESTORE_MIGRATED_ENDPOINT, {
        entries: [{ projectDir: PROJECT_DIR, dirName: TARGET }],
      }, SIGNAL),
      parseRestoreOutcome,
    )
    expect(restore).toEqual({ restored: [{ sessionId: TARGET, workspaceId: 'ws-1' }], warnings: [] })
    expect(existsSync(join(sessionDirOf(home, TARGET), 'session.v4.jsonl.zstd'))).toBe(true)
    expect(existsSync(join(archiveRoot, PROJECT_DIR, TARGET))).toBe(false)

    // 8) delete-migrated：物理删除归档根里剩下的另一条条目。
    const migratedDelete = parsedOf(
      await dispatch(DELETE_MIGRATED_ENDPOINT, {
        entries: [{ projectDir: PROJECT_DIR, dirName: 'session-d' }],
      }, SIGNAL),
      parseOutcome,
    )
    expect(migratedDelete).toEqual({ removed: ['session-d'], warnings: [] })
    expect(existsSync(join(archiveRoot, PROJECT_DIR, 'session-d'))).toBe(false)

    // 广播顺序：归档 a、删 b/c、归档 d 各一条 removed，恢复 a 一条 added。
    expect(host.emitted.map(([event]) => event)).toEqual([
      SESSION_REMOVED_EVENT,
      SESSION_REMOVED_EVENT,
      SESSION_REMOVED_EVENT,
      SESSION_REMOVED_EVENT,
      SESSION_ADDED_EVENT,
    ])
    expect(host.emitted.at(-1)?.[1]).toMatchObject({ sessionId: TARGET, cwd: '/home/docker' })
  })
})

describe('createDispatcher：list-migrated', () => {
  it('真实归档根两层枚举：`session-` 前缀原样、非目录跳过并逐条告警', async () => {
    const home = await createEmptyHome()
    const archiveRoot = archiveRootOf(home)
    await createArchived(home, PROJECT_DIR, PREFIXED_ID, 37)
    await createArchived(home, PROJECT_DIR, BARE_ID, 4)
    await createArchived(home, NO_CWD, 'session-orphan', 9)
    await writeFile(join(archiveRoot, 'README.txt'), 'not a project directory')
    await writeFile(join(archiveRoot, PROJECT_DIR, 'notes.txt'), 'not a session directory')

    const host = createFakeHost({ homePath: home })
    const listing = parsedOf(await createDispatcher(host.ctx)(LIST_MIGRATED_ENDPOINT, {}, SIGNAL), parseMigratedListing)

    expect(listing.archiveRoot).toBe(archiveRoot)
    expect(listing.truncated).toBe(false)
    const byId = new Map(listing.entries.map((entry) => [entry.sessionId, entry]))
    expect([...byId.keys()].sort()).toEqual([BARE_ID, PREFIXED_ID, 'session-orphan'].sort())
    // 两代目录名都原样当身份：`session-` 前缀绝不剥掉（D12）。
    expect(byId.get(PREFIXED_ID)).toMatchObject({
      sessionId: PREFIXED_ID,
      dirName: PREFIXED_ID,
      projectDir: PROJECT_DIR,
      bytes: 37,
    })
    expect(byId.get(BARE_ID)).toMatchObject({ dirName: BARE_ID, projectDir: PROJECT_DIR, bytes: 4 })
    expect(byId.get('session-orphan')).toMatchObject({ projectDir: NO_CWD, bytes: 9 })
    for (const entry of listing.entries) expect(entry.updatedAt).toBeGreaterThan(0)

    const messages = host.warnings.map((args) => String(args[0]))
    expect([...messages].sort()).toEqual([
      `${join(archiveRoot, 'README.txt')}: not a directory; skipped`,
      `${join(archiveRoot, PROJECT_DIR, 'notes.txt')}: not a directory; skipped`,
    ].sort())
  })

  it(`超过 ${MAX_LISTED_MIGRATED} 条时 truncated=true 且只列出上限条数`, async () => {
    const home = await createEmptyHome()
    const projectDir = join(archiveRootOf(home), PROJECT_DIR)
    await mkdir(projectDir, { recursive: true })
    const total = MAX_LISTED_MIGRATED + 1
    for (let index = 0; index < total; index += 1) await mkdir(join(projectDir, `session-${index}`))

    const host = createFakeHost({ homePath: home })
    const listing = parsedOf(await createDispatcher(host.ctx)(LIST_MIGRATED_ENDPOINT, {}, SIGNAL), parseMigratedListing)

    expect(listing.entries).toHaveLength(MAX_LISTED_MIGRATED)
    expect(listing.truncated).toBe(true)
    expect(new Set(listing.entries.map((entry) => entry.sessionId)).size).toBe(MAX_LISTED_MIGRATED)
    expect(listing.entries.every((entry) => entry.projectDir === PROJECT_DIR)).toBe(true)
    expect(host.warnings).toEqual([])
  })

  it('真链路：真实 zstd 帧拼接的日志解出 title/createdAt；坏字节日志降级缺省且零 warning', async () => {
    const home = await createEmptyHome()
    const archiveRoot = archiveRootOf(home)
    // 规范日志文件名 + 真实 zstd 容器：header 行与 title 行各自压缩成一帧后拼接（JSONL
    // 逐帧压缩的真实部署形态——每行以 \n 结尾；Single_Segment 缺省帧探测同样能解）。
    const goodDir = join(archiveRoot, PROJECT_DIR, PREFIXED_ID)
    await mkdir(goodDir, { recursive: true })
    await writeFile(join(goodDir, 'session.jsonl.zstd'), Buffer.concat([
      zstdCompressSync(Buffer.from('{"type":"session","createdAt":1700000000000}\n')),
      zstdCompressSync(Buffer.from('{"type":"session/title","data":{"title":"真链路标题"}}\n')),
    ]))
    // 坏字节（非 zstd 魔数）日志：条目照常返回，两字段缺省。
    const badDir = join(archiveRoot, PROJECT_DIR, BARE_ID)
    await mkdir(badDir, { recursive: true })
    await writeFile(join(badDir, 'session.jsonl.zstd'), Buffer.from('corrupted-bytes'))

    const host = createFakeHost({ homePath: home })
    const listing = parsedOf(await createDispatcher(host.ctx)(LIST_MIGRATED_ENDPOINT, {}, SIGNAL), parseMigratedListing)

    expect(listing.archiveRoot).toBe(archiveRoot)
    expect(listing.truncated).toBe(false)
    const byId = new Map(listing.entries.map((entry) => [entry.sessionId, entry]))
    expect(byId.get(PREFIXED_ID)).toMatchObject({
      sessionId: PREFIXED_ID,
      projectDir: PROJECT_DIR,
      title: '真链路标题',
      createdAt: 1700000000000,
    })
    const bareEntry = byId.get(BARE_ID)
    if (bareEntry === undefined) throw new Error('the bare-id entry is missing from the listing')
    expect('title' in bareEntry).toBe(false)
    expect('createdAt' in bareEntry).toBe(false)
    // 探测的任何失败都不产生 warning：既有迁移告警语义零变化。
    expect(host.warnings).toEqual([])
  })
})

describe('createDispatcher：批量删除', () => {
  it('delete-session-batch 真实删除文件、清理 registry 并逐条广播移除', async () => {
    const home = await createHome(TARGET)
    await createStoredSession(home, 'session-b')
    const fakeRegistry = createWorkspaceRegistry({
      archived: [TARGET, 'session-b'],
      workspaces: [{ id: 'ws-1', path: '/home/docker', sessionIds: [TARGET, 'session-b'] }],
    })
    const host = createFakeHost({
      homePath: home,
      persistence: storedHeaders({ id: TARGET, cwd: '/home/docker' }, { id: 'session-b', cwd: '/home/docker' }),
      registry: fakeRegistry.registry,
    })
    const dispatch = createDispatcher(host.ctx)

    const preview = parsedOf(
      await dispatch(PREVIEW_BATCH_ENDPOINT, { sessionIds: [TARGET, 'session-b'], mode: 'delete' }, SIGNAL),
      parseBatchPreview,
    )
    expect(preview).toMatchObject({ targetCount: 2, sessionCount: 2, descendantCount: 0, rejected: [] })

    const outcome = parsedOf(
      await dispatch(DELETE_BATCH_ENDPOINT, { sessionIds: [TARGET, 'session-b'], mode: 'delete' }, SIGNAL),
      parseOutcome,
    )
    expect(outcome).toEqual({ removed: [TARGET, 'session-b'], warnings: [] })
    for (const id of [TARGET, 'session-b']) {
      expect(existsSync(sessionDirOf(home, id))).toBe(false)
      expect(existsSync(cachePathOf(home, id))).toBe(false)
    }
    expect(fakeRegistry.calls).toEqual([
      `unarchive:${TARGET}`, `unpin:${TARGET}`, `detach:ws-1:${TARGET}`,
      'unarchive:session-b', 'unpin:session-b', 'detach:ws-1:session-b',
    ])
    expect(host.emitted).toEqual([
      [SESSION_REMOVED_EVENT, TARGET],
      [SESSION_REMOVED_EVENT, 'session-b'],
    ])
  })
})

describe('createDispatcher：restore-migrated', () => {
  it('目标位已存在 ⇒ target-exists 整单拒绝，归档条目、目标位与 registry 都不动', async () => {
    const home = await createEmptyHome()
    await createStoredSession(home, TARGET, 5)
    const archived = await createArchived(home, PROJECT_DIR, TARGET, 12)
    const fakeRegistry = createWorkspaceRegistry({
      archived: [TARGET],
      workspaces: [{ id: 'ws-1', path: '/home/docker' }],
    })
    const host = createFakeHost({
      homePath: home,
      persistence: storedHeaders({ id: TARGET, cwd: '/home/docker' }),
      registry: fakeRegistry.registry,
    })

    expect(await createDispatcher(host.ctx)(
      RESTORE_MIGRATED_ENDPOINT,
      { entries: [{ projectDir: PROJECT_DIR, dirName: TARGET }] },
      SIGNAL,
    )).toEqual(failureOf('target-exists', expect.stringContaining(sessionDirOf(home, TARGET))))

    expect(existsSync(join(archived, 'session.v4.jsonl.zstd'))).toBe(true)
    expect(existsSync(join(sessionDirOf(home, TARGET), 'session.v4.jsonl.zstd'))).toBe(true)
    expect(fakeRegistry.calls).toEqual([])
    expect(host.emitted).toEqual([])
    expect(host.warnings).toEqual([])
  })

  it('attach 被上游拒绝 ⇒ warning 且 workspaceId:null，文件仍已搬回并广播 added', async () => {
    const home = await createEmptyHome()
    const archived = await createArchived(home, PROJECT_DIR, TARGET, 12)
    const fakeRegistry = createWorkspaceRegistry({
      archived: [TARGET],
      workspaces: [{ id: 'ws-1', path: '/home/docker' }],
      attachFailure: 'cwd does not match the workspace',
    })
    const host = createFakeHost({
      homePath: home,
      persistence: storedHeaders({ id: TARGET, cwd: '/home/docker' }),
      registry: fakeRegistry.registry,
    })

    const outcome = parsedOf(await createDispatcher(host.ctx)(
      RESTORE_MIGRATED_ENDPOINT,
      { entries: [{ projectDir: PROJECT_DIR, dirName: TARGET }] },
      SIGNAL,
    ), parseRestoreOutcome)

    expect(outcome).toEqual({
      restored: [{ sessionId: TARGET, workspaceId: null }],
      warnings: [`attach: ${TARGET}: cwd does not match the workspace`],
    })
    // 文件动作先于挂回：拒绝挂回不影响「已搬回」的既成事实。
    expect(existsSync(join(sessionDirOf(home, TARGET), 'session.v4.jsonl.zstd'))).toBe(true)
    expect(existsSync(join(archived, 'session.v4.jsonl.zstd'))).toBe(false)
    expect(fakeRegistry.calls).toEqual([`attach:ws-1:${TARGET}`, `archive:${TARGET}`])
    expect(host.emitted.at(-1)?.[0]).toBe(SESSION_ADDED_EVENT)
    expect(host.emitted.at(-1)?.[1]).toMatchObject({ sessionId: TARGET })
    expect(host.warnings.map((args) => String(args[0]))).toContain(
      `web-ux: attaching the restored session "${TARGET}" to its workspace failed`,
    )
  })

  it('成功后广播 api-session/added，载荷字段取自真实 header 与归档目录 mtime；未命中只 warn', async () => {
    const home = await createEmptyHome()
    const ghost = 'session-ghost'
    const archived = await createArchived(home, PROJECT_DIR, PREFIXED_ID, 20)
    await createArchived(home, NO_CWD, ghost, 3)
    const updatedAt = (await lstat(archived)).mtimeMs
    const fakeRegistry = createWorkspaceRegistry({
      archived: [PREFIXED_ID, ghost],
      workspaces: [{ id: 'ws-1', path: '/home/docker' }],
    })
    const host = createFakeHost({
      homePath: home,
      persistence: storedHeaders({
        id: PREFIXED_ID,
        cwd: '/home/docker',
        parentSession: 'session-parent',
        origin: 'subagent',
      }),
      registry: fakeRegistry.registry,
    })

    const outcome = parsedOf(await createDispatcher(host.ctx)(
      RESTORE_MIGRATED_ENDPOINT,
      { entries: [
        { projectDir: PROJECT_DIR, dirName: PREFIXED_ID },
        { projectDir: NO_CWD, dirName: ghost },
      ] },
      SIGNAL,
    ), parseRestoreOutcome)

    expect(outcome).toEqual({
      restored: [
        { sessionId: PREFIXED_ID, workspaceId: 'ws-1' },
        { sessionId: ghost, workspaceId: null },
      ],
      warnings: [`attach: ${ghost}: no workspace matches project directory "${NO_CWD}"`],
    })
    // 只广播持久化里真实存在的 id；载荷字段全部取自 header 与归档目录。
    expect(host.emitted).toEqual([[
      SESSION_ADDED_EVENT,
      {
        sessionId: PREFIXED_ID,
        updatedAt,
        running: false,
        blank: false,
        agentAvailable: false,
        cwd: '/home/docker',
        parentSessionId: 'session-parent',
        origin: 'subagent',
      },
    ]])
    const messages = host.warnings.map((args) => String(args[0]))
    expect(messages.some((message) => message.includes('missing from session persistence'))).toBe(true)
    expect(messages.some((message) => message.includes('stays ungrouped'))).toBe(true)
    expect(existsSync(join(sessionDirOf(home, PREFIXED_ID), 'session.v4.jsonl.zstd'))).toBe(true)
    expect(existsSync(join(home, 'sessions', NO_CWD, ghost, 'session.v4.jsonl.zstd'))).toBe(true)
  })
})

describe('createDispatcher：线上边界（迁移域）', () => {
  it('缺 dshHomePath 时七个端点都返回 internal 并逐次告警', async () => {
    const host = createFakeHost()
    const dispatch = createDispatcher(host.ctx)
    const requests: [string, unknown][] = [
      [PREVIEW_ENDPOINT, { sessionId: TARGET, mode: 'archive' }],
      [DELETE_ENDPOINT, { sessionId: TARGET, mode: 'delete' }],
      [PREVIEW_BATCH_ENDPOINT, { sessionIds: [TARGET], mode: 'delete' }],
      [DELETE_BATCH_ENDPOINT, { sessionIds: [TARGET], mode: 'archive' }],
      [LIST_MIGRATED_ENDPOINT, {}],
      [DELETE_MIGRATED_ENDPOINT, { entries: [{ projectDir: PROJECT_DIR, dirName: TARGET }] }],
      [RESTORE_MIGRATED_ENDPOINT, { entries: [{ projectDir: PROJECT_DIR, dirName: TARGET }] }],
    ]

    for (const [endpoint, payload] of requests) {
      expect(await dispatch(endpoint, payload, SIGNAL)).toEqual({
        ok: false,
        error: { code: 'internal', message: expect.stringContaining('harness-home'), details: {} },
      })
    }
    expect(host.warnings).toHaveLength(requests.length)
    for (const args of host.warnings) expect(String(args[0])).toContain('dshHomePath')
  })

  it('未知端点与 7 个端点上的未知字段都映射为 bad-request（含迁移条目内部字段）', async () => {
    const host = createFakeHost()
    const dispatch = createDispatcher(host.ctx)
    const badRequest = failureOf('bad-request', expect.stringContaining('未知'))

    expect(await dispatch('not-an-endpoint', {}, SIGNAL)).toEqual(badRequest)
    const requests: [string, unknown][] = [
      [PREVIEW_ENDPOINT, { sessionId: TARGET, mode: 'delete', extra: true }],
      [DELETE_ENDPOINT, { sessionId: TARGET, mode: 'delete', extra: true }],
      [PREVIEW_BATCH_ENDPOINT, { sessionIds: [TARGET], mode: 'delete', extra: true }],
      [DELETE_BATCH_ENDPOINT, { sessionIds: [TARGET], mode: 'delete', extra: true }],
      [LIST_MIGRATED_ENDPOINT, { extra: true }],
      [DELETE_MIGRATED_ENDPOINT, { entries: [{ projectDir: PROJECT_DIR, dirName: TARGET }], extra: true }],
      [RESTORE_MIGRATED_ENDPOINT, { entries: [{ projectDir: PROJECT_DIR, dirName: TARGET }], extra: true }],
    ]
    for (const [endpoint, payload] of requests) {
      expect(await dispatch(endpoint, payload, SIGNAL)).toEqual(badRequest)
    }
    expect(await dispatch(DELETE_MIGRATED_ENDPOINT, {
      entries: [{ projectDir: PROJECT_DIR, dirName: TARGET, extra: true }],
    }, SIGNAL)).toEqual(badRequest)
  })
})
