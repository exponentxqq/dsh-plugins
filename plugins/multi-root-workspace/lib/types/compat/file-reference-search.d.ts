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
import type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference';
/** 本插件用到的检索实例面（结构子集，不 import 上游值）。 */
export interface AdditionalRootSearch {
    list(rawQuery: string, signal: AbortSignal): Promise<readonly FileReferenceCandidate[]>;
    dispose(): void;
}
/** 适配后的上游包面；`createSearch` 已绑定合法的 FileSearchConfig。 */
export interface FileReferenceLocalApi {
    createSearch(root: string): AdditionalRootSearch;
}
export type FileReferenceSearchLoader = () => Promise<FileReferenceLocalApi | undefined>;
export interface AdditionalRootSearchCacheOptions {
    /** 测试注入点；默认 {@link loadFileReferenceLocal}。 */
    readonly load?: FileReferenceSearchLoader;
    /** 一次性告警出口；默认静默（测试可断言）。 */
    readonly warn?: (message: string) => void;
}
/**
 * 结构探针：接受 upstream 模块命名空间，返回适配面或 undefined。
 * 要求 `WorkspaceFileSearch` 是函数，且三个默认常量类型合法；缺一即 undefined。
 * 只探形状，不比对版本号（不变量 7：结构探针而非版本字符串）。
 */
export declare function adaptFileReferenceLocal(module: unknown): FileReferenceLocalApi | undefined;
/** 记忆化的动态导入 + 结构探针；缺席/形状不符 → undefined，不抛。 */
export declare function loadFileReferenceLocal(): Promise<FileReferenceLocalApi | undefined>;
/** 每个附加根一个检索实例；实例缓存与生命周期。 */
export declare class AdditionalRootSearchCache {
    private readonly loader;
    private readonly warn;
    /** 降级告警只发一次（每实例；行场景仅一个实例）。 */
    private warned;
    private disposed;
    /** 根（canonical）→ 该根检索实例的创建 Promise（同一根并发调用去重）。 */
    private readonly searches;
    constructor(options?: AdditionalRootSearchCacheOptions);
    /** 取（或创建）一个根的实例；不可用（peer 缺席/形状不符/构造失败）→ undefined。 */
    acquire(root: string): Promise<AdditionalRootSearch | undefined>;
    /** 保留这些根，dispose 其余实例（根撤销/切换主根时调用）。 */
    retain(roots: readonly string[]): void;
    /** 行卸载：dispose 全部并拒绝后续 acquire。 */
    disposeAll(): void;
    private createEntry;
    private loadApi;
    private warnOnce;
}
