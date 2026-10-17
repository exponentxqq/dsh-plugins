/**
 * 宿主实载体的单测：channel 的软挂载（connection 缺失只告警）、CHANNEL 注册与
 * disposer 释放，以及 dispatcher 在真实临时目录上的预览 / 删除 / 拒绝 / 失败映射。
 *
 * cordis Context 用一个最小 fake 代替：注入回调、服务查找、logger 与 emit 全部
 * 可控，断言的是本插件的行为而不是 cordis 的调度。文件操作则跑在真实临时目录上，
 * 以覆盖 `node:fs/promises` 适配层。
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import { afterEach, describe, expect, it } from 'vitest'
import { CHANNEL, DELETE_ENDPOINT, PREVIEW_ENDPOINT, parseOutcome, parsePreview } from '../src/contract.ts'
import { SESSION_REMOVED_EVENT, type StoredSessionHeader } from '../src/delete-session.ts'
import { apply, createDispatcher, inject, name } from '../src/index.ts'

/** 请求用的一次性 abort signal（本流程不消费取消，仅满足 channel 形状）。 */
const SIGNAL = new AbortController().signal

/** 测试用目标会话 id。 */
const TARGET = 'session-a'

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
  const sessionDir = join(home, 'sessions', '--home-docker--', sessionId)
  await mkdir(sessionDir, { recursive: true })
  await writeFile(join(sessionDir, 'session.v4.jsonl.zstd'), 'x'.repeat(10))
  const cacheDir = join(home, 'storages', 'session_projcache', 'sessions')
  await mkdir(cacheDir, { recursive: true })
  await writeFile(join(cacheDir, `${sessionId}.json`), 'cache')
  return home
}

describe('web-ux 宿主声明', () => {
  it('插件名与三个硬依赖与契约一致', () => {
    expect(name).toBe('web-ux')
    expect(inject).toEqual(['workspaceRegistry', 'sessionPersistence', 'dshHomePath'])
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
    const result = await handler(PREVIEW_ENDPOINT, { sessionId: TARGET }, SIGNAL)
    if (!result.ok) throw new Error(result.error.message)
    const parsed = parsePreview(result.value)
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value).toMatchObject({ sessionCount: 1, descendantCount: 0 })
  })
})

describe('createDispatcher', () => {
  it('preview 与 delete 走通真实文件系统，并广播移除事件', async () => {
    const home = await createHome(TARGET)
    const fakeRegistry = createFakeRegistry([TARGET], { 'ws-1': [TARGET] })
    const host = createFakeHost({
      homePath: home,
      persistence: { list: async () => [{ header: { id: TARGET } }] },
      registry: fakeRegistry.registry,
    })
    const dispatch = createDispatcher(host.ctx)

    const preview = await dispatch(PREVIEW_ENDPOINT, { sessionId: TARGET }, SIGNAL)
    if (!preview.ok) throw new Error(preview.error.message)
    const parsedPreview = parsePreview(preview.value)
    if (!parsedPreview.ok) throw new Error(parsedPreview.message)
    expect(parsedPreview.value).toMatchObject({ sessionCount: 1, descendantCount: 0 })
    expect(parsedPreview.value.logBytes).toBeGreaterThanOrEqual(15)

    const outcome = await dispatch(DELETE_ENDPOINT, { sessionId: TARGET }, SIGNAL)
    if (!outcome.ok) throw new Error(outcome.error.message)
    const parsedOutcome = parseOutcome(outcome.value)
    if (!parsedOutcome.ok) throw new Error(parsedOutcome.message)
    expect(parsedOutcome.value).toEqual({ removed: [TARGET], warnings: [] })

    expect(fakeRegistry.calls).toEqual([`unarchive:${TARGET}`, `unpin:${TARGET}`, `detach:ws-1:${TARGET}`])
    expect(host.emitted).toEqual([[SESSION_REMOVED_EVENT, TARGET]])
    expect(existsSync(join(home, 'sessions', '--home-docker--', TARGET))).toBe(false)
    expect(existsSync(join(home, 'storages', 'session_projcache', 'sessions', `${TARGET}.json`))).toBe(false)
  })

  it('非法请求体与未知端点都映射为 bad-request', async () => {
    const host = createFakeHost()
    const dispatch = createDispatcher(host.ctx)
    for (const payload of [{}, { sessionId: '' }, { sessionId: 42 }, { sessionId: TARGET, extra: true }]) {
      expect(await dispatch(PREVIEW_ENDPOINT, payload, SIGNAL)).toEqual({
        ok: false,
        error: { code: 'bad-request', message: expect.any(String), details: {} },
      })
    }
    expect(await dispatch('not-an-endpoint', { sessionId: TARGET }, SIGNAL)).toEqual({
      ok: false,
      error: { code: 'bad-request', message: expect.any(String), details: {} },
    })
  })

  it('dshHomePath 缺失时返回 internal 并告警', async () => {
    const host = createFakeHost({ persistence: { list: async () => [{ header: { id: TARGET } }] } })
    expect(await createDispatcher(host.ctx)(PREVIEW_ENDPOINT, { sessionId: TARGET }, SIGNAL)).toEqual({
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
    expect(await createDispatcher(host.ctx)(DELETE_ENDPOINT, { sessionId: TARGET }, SIGNAL)).toEqual({
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
    expect(await createDispatcher(host.ctx)(PREVIEW_ENDPOINT, { sessionId: TARGET }, SIGNAL)).toEqual({
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
    expect(await createDispatcher(host.ctx)(DELETE_ENDPOINT, { sessionId: TARGET }, SIGNAL)).toEqual({
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
    expect(await createDispatcher(host.ctx)(PREVIEW_ENDPOINT, { sessionId: TARGET }, SIGNAL)).toEqual({
      ok: false,
      error: { code: 'internal', message: 'storage exploded', details: {} },
    })
    expect(host.warnings).toHaveLength(1)
  })
})
