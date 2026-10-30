/**
 * 按需加载并适配 `@deepseek-ai/dsh-file-reference-local` 的 `WorkspaceFileSearch`，
 * 为每个附加根缓存一个检索实例。
 *
 * 为什么动态导入：该包是 OPTIONAL peer（见 `peerDependenciesMeta`），最小组合
 * （如 headless profile）合法地不装它；而 carrier 行装载的 barrel
 * （`src/index.ts`）一旦静态值导入该包，就会在那些组合里整体装载失败
 * （先例：`compat/llm-message.ts`）。因此加载发生在真正要检索附加根的那一刻，
 * 本模块也不进 barrel 的导出面。
 *
 * 为什么失败只降级不抛：本行是「可加可减」的发现增强，抛错会把主根候选
 * 一起丢掉（上游 client 把远端整体失败映射成空列表）。缺席
 * （MODULE_NOT_FOUND）静默降级；装坏（加载出错 / 结构探针不过 / 构造抛错）
 * warn 恰一次后降级——绝不打断主根能力（code-design ④ D8）。
 *
 * @module dsh-plugin-multi-root-workspace/compat/file-reference-search
 */

import type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference'

/** 本插件用到的检索实例面（结构子集，不 import 上游值）。 */
export interface AdditionalRootSearch {
  list(rawQuery: string, signal: AbortSignal): Promise<readonly FileReferenceCandidate[]>
  dispose(): void
}

/** 适配后的上游包面；`createSearch` 已绑定合法的 FileSearchConfig。 */
export interface FileReferenceLocalApi {
  createSearch(root: string): AdditionalRootSearch
}

export type FileReferenceSearchLoader = () => Promise<FileReferenceLocalApi | undefined>

export interface AdditionalRootSearchCacheOptions {
  /** 测试注入点；默认 {@link loadFileReferenceLocal}。 */
  readonly load?: FileReferenceSearchLoader
  /** 一次性告警出口；默认静默（测试可断言）。 */
  readonly warn?: (message: string) => void
}

/** 由 upstream 常量构造；不复制排除表内容。 */
interface ResolvedSearchConfig {
  readonly maxResults: number          // DEFAULT_FILE_SEARCH_MAX_RESULTS（0.2.1-rc.2 = 20）
  readonly maxEntries: number          // DEFAULT_FILE_SEARCH_MAX_ENTRIES（= 50000）
  readonly excludedDirectories: readonly string[]  // DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES 的拷贝
}

/** 上游 `WorkspaceFileSearch` 构造函数的结构子集（探针通过后断言使用）。 */
type WorkspaceFileSearchConstructor = new (root: string, config: ResolvedSearchConfig) => AdditionalRootSearch

/** 上游模块命名空间的结构子集（探针目标，全部按 unknown 收窄）。 */
interface FileReferenceLocalModule {
  readonly WorkspaceFileSearch?: unknown
  readonly DEFAULT_FILE_SEARCH_MAX_RESULTS?: unknown
  readonly DEFAULT_FILE_SEARCH_MAX_ENTRIES?: unknown
  readonly DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES?: unknown
}

/** 模块级加载结果的三态：就绪 / 缺席（静默）/ 装坏（warn 一次后降级）。 */
type LoadOutcome =
  | { readonly status: 'ready'; readonly api: FileReferenceLocalApi }
  | { readonly status: 'absent' }
  | { readonly status: 'broken'; readonly reason: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** optional peer 合法缺席的判据（先例：`compat/llm-message.ts`）。 */
function isModuleNotFound(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND'
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/**
 * 结构探针：接受 upstream 模块命名空间，返回适配面或 undefined。
 * 要求 `WorkspaceFileSearch` 是函数，且三个默认常量类型合法；缺一即 undefined。
 * 只探形状，不比对版本号（不变量 7：结构探针而非版本字符串）。
 */
export function adaptFileReferenceLocal(module: unknown): FileReferenceLocalApi | undefined {
  if (typeof module !== 'object' || module === null) return undefined
  const candidate = module as FileReferenceLocalModule
  if (typeof candidate.WorkspaceFileSearch !== 'function') return undefined
  if (!isPositiveSafeInteger(candidate.DEFAULT_FILE_SEARCH_MAX_RESULTS)) return undefined
  if (!isPositiveSafeInteger(candidate.DEFAULT_FILE_SEARCH_MAX_ENTRIES)) return undefined
  const excluded = candidate.DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES
  if (!Array.isArray(excluded)) return undefined
  const names = excluded as unknown[]
  if (names.some(name => typeof name !== 'string' || name === '')) return undefined
  const config: ResolvedSearchConfig = {
    maxResults: candidate.DEFAULT_FILE_SEARCH_MAX_RESULTS,
    maxEntries: candidate.DEFAULT_FILE_SEARCH_MAX_ENTRIES,
    // 拷贝排除目录数组：上游常量与本插件配置互不影响
    excludedDirectories: [...names as string[]],
  }
  const search = candidate.WorkspaceFileSearch as WorkspaceFileSearchConstructor
  return {
    createSearch(root: string): AdditionalRootSearch {
      return new search(root, config)
    },
  }
}

/** 模块级记忆化的加载结果；一次 import，之后缺席/装坏都不重试。 */
let memoizedOutcome: Promise<LoadOutcome> | undefined

/** 执行一次动态导入 + 结构探针并分类；模块级记忆化，永不 reject。 */
function loadOutcome(): Promise<LoadOutcome> {
  memoizedOutcome ??= import('@deepseek-ai/dsh-file-reference-local').then(
    module => {
      const api = adaptFileReferenceLocal(module)
      return api === undefined
        ? { status: 'broken', reason: '结构探针未通过：WorkspaceFileSearch 或默认检索常量的形状与预期不符' }
        : { status: 'ready', api }
    },
    error => isModuleNotFound(error)
      ? { status: 'absent' }
      : { status: 'broken', reason: errorMessage(error) },
  )
  return memoizedOutcome
}

/** 记忆化的动态导入 + 结构探针；缺席/形状不符 → undefined，不抛。 */
export async function loadFileReferenceLocal(): Promise<FileReferenceLocalApi | undefined> {
  const outcome = await loadOutcome()
  return outcome.status === 'ready' ? outcome.api : undefined
}

/** 每个附加根一个检索实例；实例缓存与生命周期。 */
export class AdditionalRootSearchCache {
  private readonly loader: FileReferenceSearchLoader | undefined
  private readonly warn: (message: string) => void
  /** 降级告警只发一次（每实例；行场景仅一个实例）。 */
  private warned = false
  private disposed = false
  /** 根（canonical）→ 该根检索实例的创建 Promise（同一根并发调用去重）。 */
  private readonly searches = new Map<string, Promise<AdditionalRootSearch | undefined>>()

  constructor(options?: AdditionalRootSearchCacheOptions) {
    this.loader = options?.load
    this.warn = options?.warn ?? (() => {})
  }

  /** 取（或创建）一个根的实例；不可用（peer 缺席/形状不符/构造失败）→ undefined。 */
  async acquire(root: string): Promise<AdditionalRootSearch | undefined> {
    if (this.disposed) return undefined
    const existing = this.searches.get(root)
    if (existing !== undefined) return existing
    // 自引用闭包：失败自删与卸载兜底都要拿「本条」Promise 与 Map 比对；
    // then 回调异步执行时 entry 已完成初始化，const 自引用安全
    const entry: Promise<AdditionalRootSearch | undefined> = this.createEntry(root).then(
      search => {
        if (search === undefined) {
          // 失败/不可用：删除 Map 项，下次 acquire 可重试
          if (this.searches.get(root) === entry) this.searches.delete(root)
          return undefined
        }
        if (this.disposed) {
          // 在飞创建完成时行已卸载：立即释放，不留孤儿实例
          search.dispose()
          return undefined
        }
        return search
      },
      // 防御兜底：创建链路理应不抛（内部已全捕获），漏网错误也不上抛打断主根
      () => undefined,
    )
    // 先放进 Map 再返回：同一根的并发 acquire 共享这一次创建
    this.searches.set(root, entry)
    return entry
  }

  /** 保留这些根，dispose 其余实例（根撤销/切换主根时调用）。 */
  retain(roots: readonly string[]): void {
    const keep = new Set(roots)
    for (const [root, entry] of this.searches) {
      if (keep.has(root)) continue
      this.searches.delete(root)
      // 已完成的实例立即释放；在飞的完成时释放（dispose 幂等）
      void entry.then(search => { search?.dispose() })
    }
  }

  /** 行卸载：dispose 全部并拒绝后续 acquire。 */
  disposeAll(): void {
    this.disposed = true
    const entries = [...this.searches.values()]
    this.searches.clear()
    for (const entry of entries) void entry.then(search => { search?.dispose() })
  }

  private async createEntry(root: string): Promise<AdditionalRootSearch | undefined> {
    const api = await this.loadApi()
    if (api === undefined) return undefined
    try {
      return api.createSearch(root)
    } catch (error) {
      // 构造抛错（如 root 不可读导致上游校验失败）→ warn 一次 + 降级
      this.warnOnce(`multi-root workspace: additional-root file search for "${root}" could not be created `
        + `(@ completion stays primary-root only; ${errorMessage(error)})`)
      return undefined
    }
  }

  private async loadApi(): Promise<FileReferenceLocalApi | undefined> {
    if (this.loader !== undefined) {
      try {
        return await this.loader()
      } catch (error) {
        if (!isModuleNotFound(error)) {
          this.warnOnce(`multi-root workspace: @deepseek-ai/dsh-file-reference-local failed to load `
            + `(@ completion stays primary-root only; ${errorMessage(error)})`)
        }
        return undefined
      }
    }
    const outcome = await loadOutcome()
    if (outcome.status === 'ready') return outcome.api
    if (outcome.status === 'broken') {
      this.warnOnce(`multi-root workspace: @deepseek-ai/dsh-file-reference-local is unusable `
        + `(@ completion stays primary-root only; ${outcome.reason})`)
    }
    return undefined
  }

  private warnOnce(message: string): void {
    if (this.warned) return
    this.warned = true
    this.warn(message)
  }
}
