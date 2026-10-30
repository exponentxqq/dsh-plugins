/**
 * `multi-root-file-references` 行为测试（真 scope + 桩 provider）。
 *
 * 分层纪律（design.md D13）：本文件只测「行」的行为——真 `ctx.multiRootScope`
 * 按既有 e2e 先例（`lsp-workspaces.e2e.ts`）构建，附加根经
 * `setAdditionalRoots` 授予；`ctx.fileReferences` 上游服务换成可观测桩（记录
 * 调用参数、可配置返回值、resolve 前钩子）。适配层/缓存的结构探针与注入点
 * 在 `file-reference-search.spec.ts` 单独覆盖，此处唯一触碰它的地方是
 * `AdditionalRootSearchCache.prototype.acquire` 的 spy（清单 C7-5/C7-8）。
 *
 * 钻入用例刻意走真上游检索载体（devDep 已装）：mock 掉
 * `dsh-file-reference-local` 后绝对钻入只能断言桩返回值，真实的
 * `resolveDisplayDirectory` 逃逸检查就没被验证——那正是 D13 反例点名的陷阱。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference'
import { canonicalPath } from '@deepseek-ai/dsh-sandbox'
import { AdditionalRootSearchCache } from '../src/compat/file-reference-search.ts'
import * as FileReferences from '../src/file-references.ts'
import { toDisplayPath } from '../src/file-references.ts'
import { MultiRootScopeService } from '../src/scope.ts'
import { mountCompat } from './support/compat.ts'
import { createFixtureWorkspace } from './support/temp-workspace.ts'
import type { FixtureWorkspace } from './support/temp-workspace.ts'

/** 一次 `list` 调用的参数快照（透传断言的数据源）。 */
interface RecordedCall {
  readonly agent: Agent
  readonly query: string
  readonly signal: AbortSignal
}

/**
 * 桩 provider：替代上游 `ctx.fileReferences`。
 *
 * `list` 定义在原型上：`wrapMethod` 会先沿原型链取描述符、再在实例上定义
 * own 属性，卸载恢复时删除 own 属性——`Object.hasOwn(stub, 'list') === false`
 * 与 `stub.list === StubFileReferences.prototype.list`（C7-7）因此可断言。
 */
class StubFileReferences extends Service {
  /** 每次 `list` 调用的参数记录。 */
  public readonly calls: RecordedCall[] = []
  /** `list` 的固定返回值（透传断言依赖同一数组引用，勿整体替换语义）。 */
  public result: FileReferenceCandidate[] = []
  /**
   * 返回值 settle 之前同步执行的钩子：撤销用例（C7-6）在这里撤根——
   * 行在 `await original` 之后才复验 scope，钩子时机正好落在复验之前。
   */
  public onList?: () => void

  constructor(ctx: Context) {
    super(ctx, 'fileReferences')
  }

  async list(agent: Agent, query: string, signal: AbortSignal): Promise<FileReferenceCandidate[]> {
    this.calls.push({ agent, query, signal })
    this.onList?.()
    return this.result
  }
}

/** 一次挂载好的组合与驱动句柄。 */
interface World {
  readonly ctx: Context
  readonly stub: StubFileReferences
  /** 最小 agent 桩：行只读 `agent.session.header.cwd`（不可变 session cwd）。 */
  readonly agent: Agent
  /** 替换当前授予的附加根（scope 顺序即传入顺序）。 */
  readonly setRoots: (paths: readonly string[]) => void
  /** 经被包装的桩服务入口发起一次查询（默认自建活 signal）。 */
  readonly list: (query: string, signal?: AbortSignal) => Promise<FileReferenceCandidate[]>
  /** 卸载整棵组合（幂等；C7-7 在用例内显式调用）。 */
  readonly teardown: () => Promise<void>
}

let fixture: FixtureWorkspace
let repoA: string
let repoB: string
/** 同级干扰根：目录存在但不授予（C7-4 的「唯一前缀」告诫所指的 repo-c）。 */
let repoC: string
let world: World | undefined

beforeEach(() => {
  fixture = createFixtureWorkspace('file-refs')
  repoA = join(fixture.base, 'repo-a')
  repoB = join(fixture.base, 'repo-b')
  repoC = join(fixture.base, 'repo-c')
  for (const directory of [repoA, repoB, repoC]) mkdirSync(directory)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await world?.teardown()
  world = undefined
  fixture.dispose()
})

/**
 * 挂载真实行组合：真 scope + 真门禁 + 桩 provider + 被测行。
 * @param roots - 初始授予的附加根（顺序即 scope 顺序）。
 * @returns 组合句柄。
 */
async function mountRow(roots: readonly string[] = []): Promise<World> {
  const ctx = new Context()
  await ctx.plugin(MultiRootScopeService)
  await mountCompat(ctx)
  // 桩 provider 直接 new：Service 构造即注册（随所属 fiber 卸载自动移除）。
  // 刻意不用 ctx.get('fileReferences')——它返回 cordis 的 traceable 代理，
  // 方法属性会被再包一层 shadow 函数，`Object.is` 级断言（C7-7）必须落在
  // 原始实例上；wrap/restore 经代理的描述符转发，最终也落在原始实例上。
  const stub = new StubFileReferences(ctx)
  await ctx.plugin(FileReferences)
  // 行的 apply 内部用 ctx.inject(['fileReferences'], …) 异步挂 wrap；
  // 等 wrap 真正落到实例上，后续 list 才走被测路径而非原始桩方法。
  await vi.waitFor(() => { expect(Object.hasOwn(stub, 'list')).toBe(true) })

  const agent = { session: { header: { cwd: fixture.workspace } } } as unknown as Agent
  const setRoots = (paths: readonly string[]): void => {
    ctx.multiRootScope.setAdditionalRoots(
      fixture.workspace,
      paths.map((path, index) => ({ id: `root-${index}`, path, recordedPath: canonicalPath(path) })),
    )
  }
  setRoots(roots)

  let torn = false
  const teardown = async (): Promise<void> => {
    if (torn) return
    torn = true
    await ctx.fiber.dispose()
  }
  const list = (query: string, signal = new AbortController().signal): Promise<FileReferenceCandidate[]> =>
    stub.list(agent, query, signal)

  world = { ctx, stub, agent, setRoots, list, teardown }
  return world
}

describe('multi-root-file-references 行为（真 scope + 桩 provider）', () => {
  it('透传：无附加根时同参调用且返回同一数组引用（C7-1）', async () => {
    const w = await mountRow()
    w.stub.result = [{ path: 'src/main.ts', kind: 'file' }]
    const signal = new AbortController().signal
    const result = await w.list('pkg', signal)
    // 同参调用：agent/query/signal 逐字段原样到达上游，且只调一次
    expect(w.stub.calls).toEqual([{ agent: w.agent, query: 'pkg', signal }])
    expect(w.stub.calls[0]?.agent).toBe(w.agent)
    expect(w.stub.calls.length).toBe(1)
    // 字节级透传：返回值就是上游返回的同一数组（未复制、未拼接）
    expect(result).toBe(w.stub.result)
  })

  it('空 query：base 候选在前，随后每根一条目录候选，顺序与 scope 一致且无尾斜杠（C7-2）', async () => {
    // 故意倒序授予：候选顺序必须跟随 scope，而非字母序
    const w = await mountRow([repoB, repoA])
    const base: FileReferenceCandidate[] = [{ path: 'src/main.ts', kind: 'file' }]
    w.stub.result = base
    const result = await w.list('')
    // base 原样在前（slice 全等于 base）
    expect(result.slice(0, base.length)).toEqual(base)
    // 随后每根一条目录候选，顺序 = scope 顺序（repo-b、repo-a）
    expect(result.slice(base.length)).toEqual([
      { path: toDisplayPath(repoB), kind: 'directory' },
      { path: toDisplayPath(repoA), kind: 'directory' },
    ])
    expect(result.length).toBe(base.length + 2)
    for (const candidate of result.slice(base.length)) {
      expect(candidate.path.endsWith('/')).toBe(false)
    }
  })

  it('绝对钻入：以根为 displayDirectory 列目录，候选全部位于该根之下（C7-3）', async () => {
    const w = await mountRow([repoA, repoB])
    mkdirSync(join(repoB, 'pkg'))
    writeFileSync(join(repoB, 'pkg', 'a.txt'), 'a')
    // base 留空：让「全部以根为前缀」的断言只覆盖钻入产物
    w.stub.result = []
    // 根层钻入：repo-b 的直接子项，pkg 目录以绝对形式出现
    const top = await w.list(repoB + '/')
    expect(top.every(candidate => candidate.path.startsWith(toDisplayPath(repoB) + '/'))).toBe(true)
    expect(top).toContainEqual({ path: toDisplayPath(join(repoB, 'pkg')), kind: 'directory' })
    // 深层钻入：pkg/a.txt 的绝对形式（真 WorkspaceFileSearch 列目录 + 逃逸检查）
    const deep = await w.list(join(repoB, 'pkg') + '/')
    expect(deep.every(candidate => candidate.path.startsWith(toDisplayPath(repoB) + '/'))).toBe(true)
    expect(deep).toContainEqual({ path: toDisplayPath(join(repoB, 'pkg', 'a.txt')), kind: 'file' })
  })

  it('前缀匹配：根的唯一前缀只返回该根一条目录候选（C7-4）', async () => {
    // 只授予 repo-b：同级 repo-c 目录存在但不授予——query 削尾后仍以
    // repo-b 为唯一前缀命中（授予 repo-c 则会双命中，这正是清单的告诫）
    const w = await mountRow([repoB])
    const result = await w.list(toDisplayPath(repoB).slice(0, -1))
    expect(result).toEqual([{ path: toDisplayPath(repoB), kind: 'directory' }])
  })

  it('裸模糊与相对 query：字节级透传且不触发 acquire（C7-5）', async () => {
    const w = await mountRow([repoA, repoB])
    w.stub.result = [{ path: 'src/main.ts', kind: 'file' }]
    const spy = vi.spyOn(AdditionalRootSearchCache.prototype, 'acquire')
    try {
      // 裸模糊（非空、无分隔符）
      expect(await w.list('pkg')).toBe(w.stub.result)
      // 相对钻入（含 / 但不绝对）
      expect(await w.list('pkg/')).toBe(w.stub.result)
      // 连 WorkspaceFileSearch.acquire 都不该触发
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('撤销：list resolve 前撤根，空 query 与钻入都只返回 base（C7-6）', async () => {
    const w = await mountRow([repoA, repoB])
    const spy = vi.spyOn(AdditionalRootSearchCache.prototype, 'acquire')
    try {
      // 桩在返回值 settle 之前撤根：行的复验发生在 await original 之后，必然观察到空 scope
      w.stub.onList = () => { w.ctx.multiRootScope.setAdditionalRoots(fixture.workspace, []) }
      const base: FileReferenceCandidate[] = [{ path: 'src/main.ts', kind: 'file' }]
      w.stub.result = base
      // 空 query：前缀根候选全部丢弃
      expect(await w.list('')).toBe(base)
      // 绝对钻入：包含根已不在 scope，不 acquire、不追加
      expect(await w.list(repoB + '/')).toBe(base)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('卸载：恢复原型方法且实例上的 own 属性描述符消失（C7-7）', async () => {
    const w = await mountRow([repoA])
    // mountRow 已断言 wrap 生效（own 'list' 存在）；此处卸载整棵组合
    await w.teardown()
    expect(Object.hasOwn(w.stub, 'list')).toBe(false)
    expect(w.stub.list).toBe(StubFileReferences.prototype.list)
  })

  it('acquire 降级：钻入查询静默返回 base 不抛（C7-8）', async () => {
    const w = await mountRow([repoA, repoB])
    const spy = vi.spyOn(AdditionalRootSearchCache.prototype, 'acquire').mockResolvedValue(undefined)
    try {
      const base: FileReferenceCandidate[] = [{ path: 'src/main.ts', kind: 'file' }]
      w.stub.result = base
      // peer 缺席/构造失败等降级路径：钻入无附加产物，返回 base 本体、不抛
      await expect(w.list(repoB + '/')).resolves.toBe(base)
      expect(spy).toHaveBeenCalledOnce()
    } finally {
      spy.mockRestore()
    }
  })
})
