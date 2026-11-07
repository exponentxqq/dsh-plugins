/**
 * 适配层单测：结构探针 + 每根检索实例缓存（`src/compat/file-reference-search.ts`）。
 *
 * 分层纪律（design.md D13）：本文件是纯适配层测试——不挂 cordis、不 import
 * 真上游包做行为断言（上游模块用桩对象注入：探针只看形状，缓存只走
 * `options.load` / `options.warn` 两个注入点）。行行为在
 * `file-references.spec.ts` 用真 scope + 桩 provider 覆盖，二者不混 mock。
 */

import { describe, expect, it, vi } from 'vitest'
import { adaptFileReferenceLocal, AdditionalRootSearchCache } from '../src/compat/file-reference-search.ts'
import type { FileReferenceLocalApi } from '../src/compat/file-reference-search.ts'

/** 桩检索实例：记录构造参数与 dispose 次数（探针视角的 WorkspaceFileSearch）。 */
class StubWorkspaceFileSearch {
  public disposed = 0
  constructor(public readonly root: string, public readonly config: unknown) {}
  async list(): Promise<readonly []> { return [] }
  dispose(): void { this.disposed += 1 }
}

/** 造一个探针可通过的模块形状，外加构造记录（adapt 层只以 `new Ctor(root, config)` 两参实例化）。 */
function makeValidModule(excluded: string[] = ['node_modules', 'dist']): {
  readonly module: Record<string, unknown>
  readonly instances: StubWorkspaceFileSearch[]
} {
  const instances: StubWorkspaceFileSearch[] = []
  class WorkspaceFileSearch extends StubWorkspaceFileSearch {
    constructor(root: string, config: unknown) {
      super(root, config)
      instances.push(this)
    }
  }
  return {
    module: {
      WorkspaceFileSearch,
      DEFAULT_FILE_SEARCH_MAX_RESULTS: 20,
      DEFAULT_FILE_SEARCH_MAX_ENTRIES: 50000,
      DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES: excluded,
    },
    instances,
  }
}

/** 三个默认常量的合法取值（探针拒绝用例复用）。 */
function makeValidConstants(): Record<string, unknown> {
  return {
    DEFAULT_FILE_SEARCH_MAX_RESULTS: 20,
    DEFAULT_FILE_SEARCH_MAX_ENTRIES: 50000,
    DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES: ['node_modules'],
  }
}

/** 桩模块经探针得到的标准 api（load 注入点用）。 */
function adaptValid(module: Record<string, unknown>): FileReferenceLocalApi {
  const api = adaptFileReferenceLocal(module)
  expect(api).toBeDefined()
  return api as FileReferenceLocalApi
}

describe('adaptFileReferenceLocal 结构探针', () => {
  it('拒绝空对象与缺导出（C7-B1）', () => {
    expect(adaptFileReferenceLocal({})).toBeUndefined()
    // 有构造器但缺任一默认常量
    const { module } = makeValidModule()
    const { WorkspaceFileSearch } = module as { WorkspaceFileSearch: unknown }
    expect(adaptFileReferenceLocal({ WorkspaceFileSearch })).toBeUndefined()
    expect(adaptFileReferenceLocal({ ...module, DEFAULT_FILE_SEARCH_MAX_RESULTS: undefined })).toBeUndefined()
  })

  it('拒绝类型非法的常量（C7-B1）', () => {
    const constants = makeValidConstants()
    const constructor = makeValidModule().module.WorkspaceFileSearch
    // WorkspaceFileSearch 非函数
    expect(adaptFileReferenceLocal({ ...constants, WorkspaceFileSearch: 'nope' })).toBeUndefined()
    // 非正安全整数（0 / 非整数 / 非数值）
    expect(adaptFileReferenceLocal({ ...constants, WorkspaceFileSearch: constructor, DEFAULT_FILE_SEARCH_MAX_RESULTS: 0 })).toBeUndefined()
    expect(adaptFileReferenceLocal({ ...constants, WorkspaceFileSearch: constructor, DEFAULT_FILE_SEARCH_MAX_RESULTS: 1.5 })).toBeUndefined()
    expect(adaptFileReferenceLocal({ ...constants, WorkspaceFileSearch: constructor, DEFAULT_FILE_SEARCH_MAX_ENTRIES: '50000' })).toBeUndefined()
    // 排除目录非数组 / 含非字符串 / 含空串
    expect(adaptFileReferenceLocal({ ...constants, WorkspaceFileSearch: constructor, DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES: 'node_modules' })).toBeUndefined()
    expect(adaptFileReferenceLocal({ ...constants, WorkspaceFileSearch: constructor, DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES: [42] })).toBeUndefined()
    expect(adaptFileReferenceLocal({ ...constants, WorkspaceFileSearch: constructor, DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES: ['ok', ''] })).toBeUndefined()
  })

  it('合法模块返回 createSearch，config 三字段等于注入常量且排除目录是拷贝（C7-B1/B2）', () => {
    const { module, instances } = makeValidModule(['node_modules', 'dist'])
    const api = adaptValid(module)
    expect(typeof api.createSearch).toBe('function')

    const search = api.createSearch('/workspace') as StubWorkspaceFileSearch
    expect(search).toBeInstanceOf(StubWorkspaceFileSearch)
    expect(instances.length).toBe(1)
    expect(instances[0]?.root).toBe('/workspace')
    const config = instances[0]?.config as { maxResults: unknown; maxEntries: unknown; excludedDirectories: unknown }
    expect(config.maxResults).toBe(module.DEFAULT_FILE_SEARCH_MAX_RESULTS)
    expect(config.maxEntries).toBe(module.DEFAULT_FILE_SEARCH_MAX_ENTRIES)
    expect(config.excludedDirectories).toEqual(['node_modules', 'dist'])
    // 拷贝而非同一数组引用
    expect(config.excludedDirectories !== module.DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES).toBe(true)
    // 之后改动上游常量数组，不影响已解析配置（也不影响后续创建）
    // （行首分号防 ASI 陷阱：上一行 expect(...).toBe(true) 已闭合，会被拼成调用）
    ;(module.DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES as string[]).push('sneaky')
    expect(config.excludedDirectories).toEqual(['node_modules', 'dist'])
    api.createSearch('/other')
    // 上一步刚创建第二个实例，instances[1] 必然存在：先取出再断言，避免可选链结果继续取属性的不安全用法
    const second = instances[1]!
    expect((second.config as typeof config).excludedDirectories).toEqual(['node_modules', 'dist'])
  })
})

describe('AdditionalRootSearchCache 实例缓存', () => {
  it('同一根连续与并发 acquire 只创建一次实例，不同根各建一次（C7-B3）', async () => {
    const { module, instances } = makeValidModule()
    const load = vi.fn(async (): Promise<FileReferenceLocalApi | undefined> => adaptFileReferenceLocal(module))
    const cache = new AdditionalRootSearchCache({ load })
    // 连续两次：同一实例
    const first = await cache.acquire('/same')
    const second = await cache.acquire('/same')
    expect(second).toBe(first)
    // 并发两次：共享同一次在飞创建
    const [a, b] = await Promise.all([cache.acquire('/parallel'), cache.acquire('/parallel')])
    expect(b).toBe(a)
    // 不同根：另建一次
    const other = await cache.acquire('/other-root')
    expect(other).not.toBe(first)
    expect(instances.length).toBe(3)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('retain 剪枝：未列根实例被 dispose，保留根复用实例（C7-B4）', async () => {
    const { module, instances } = makeValidModule()
    const cache = new AdditionalRootSearchCache({ load: async () => adaptFileReferenceLocal(module) })
    const kept = await cache.acquire('/keep')
    const dropped = await cache.acquire('/drop')
    expect(kept).toBeDefined()
    expect(dropped).toBeDefined()
    cache.retain(['/keep'])
    // 释放走 `void entry.then(...)`（不阻塞调用方），刷一次微任务再断言
    await Promise.resolve()
    expect(instances.find(i => i.root === '/drop')?.disposed).toBe(1)
    expect(instances.find(i => i.root === '/keep')?.disposed).toBe(0)
    // 保留根再次 acquire：缓存命中，不重建
    const again = await cache.acquire('/keep')
    expect(again).toBe(kept)
    expect(instances.length).toBe(2)
  })

  it('disposeAll 幂等，之后 acquire 返回 undefined（C7-B4）', async () => {
    const { module, instances } = makeValidModule()
    const cache = new AdditionalRootSearchCache({ load: async () => adaptFileReferenceLocal(module) })
    await cache.acquire('/a')
    cache.disposeAll()
    // 释放同样在微任务里完成
    await Promise.resolve()
    expect(instances[0]?.disposed).toBe(1)
    // 幂等：重复 disposeAll 不再次释放
    cache.disposeAll()
    expect(instances[0]?.disposed).toBe(1)
    // 卸载后拒绝后续创建
    await expect(cache.acquire('/a')).resolves.toBeUndefined()
  })

  it('在飞创建完成时已 disposeAll：实例立即释放且 acquire 返回 undefined（C7-B4）', async () => {
    const { module, instances } = makeValidModule()
    let release: (api: FileReferenceLocalApi | undefined) => void = () => {}
    const load = (): Promise<FileReferenceLocalApi | undefined> =>
      new Promise(resolve => { release = resolve })
    const cache = new AdditionalRootSearchCache({ load })
    const pending = cache.acquire('/in-flight')
    // 创建仍在飞时行卸载：完成后不留孤儿实例
    cache.disposeAll()
    release(adaptFileReferenceLocal(module))
    await expect(pending).resolves.toBeUndefined()
    expect(instances[0]?.disposed).toBe(1)
    await expect(cache.acquire('/in-flight')).resolves.toBeUndefined()
  })

  it('loader 抛非 MODULE_NOT_FOUND：acquire 返回 undefined 且 warn 恰一次（C7-B5）', async () => {
    const boom = Object.assign(new Error('boom'), { code: 'ERR_INTERNAL' })
    const load = vi.fn(async (): Promise<FileReferenceLocalApi> => { throw boom })
    const warn = vi.fn()
    const cache = new AdditionalRootSearchCache({ load, warn })
    await expect(cache.acquire('/a')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    // 失败自删条目后第二次会重试加载，但告警只发一次
    await expect(cache.acquire('/a')).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('loader 抛 MODULE_NOT_FOUND：合法缺席静默降级，不告警（C7-B5 对照）', async () => {
    const absence = Object.assign(new Error('not installed'), { code: 'MODULE_NOT_FOUND' })
    const warn = vi.fn()
    const cache = new AdditionalRootSearchCache({ load: async () => { throw absence }, warn })
    await expect(cache.acquire('/a')).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })

  it('createSearch 构造抛错：返回 undefined 且 warn 恰一次（C7-B6）', async () => {
    const warn = vi.fn()
    // 探针只看形状：构造器是函数即可通过，实例化时才抛
    const module = {
      ...makeValidConstants(),
      WorkspaceFileSearch: class {
        constructor(_root: string, _config: unknown) { throw new Error('root unreadable') }
      },
    }
    const cache = new AdditionalRootSearchCache({ load: async () => adaptFileReferenceLocal(module), warn })
    expect(adaptFileReferenceLocal(module)).toBeDefined()
    await expect(cache.acquire('/a')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
