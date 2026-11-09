/**
 * 「工作区文件夹」分节的能力自适应目录拾取（client 半）。
 *
 * 上游 `uiWorkspace` 的目录能力是互斥的判别联合：native 表面只有
 * `pickDirectory`（OS 选择框），browse 表面只有 `listDirectory` /
 * `createDirectory`（可编程浏览原语）；client 侧没有官方能力探测 API，而
 * `pickDirectory` 失败时只抛 `new Error(message)`——结构化的 `code` /
 * `details` 在该层被丢弃（`@deepseek-ai/dsh-client-ui-workspace` 的
 * `pickDirectory` 实现事实，ADR-0015 的 Context 留痕）。本模块把「pick 失败」
 * 翻译成结构化的拾取结局（`DirectoryPickOutcome` 五态），把 browse 原语包成
 * 可注入对话框的浏览端口（`DirectoryBrowser`，失败已归一化），并按三级信号
 * 判定能力（顺序固定）：
 *
 * 1. 结构化 `details.capability`——`list` / `create` 的 rpcError 可靠携带；
 *    pick 层通常取不到，上游一旦修复本支自动接管；
 * 2. message 正则兜底——上游文案不是契约，改形即失配（后果只是多一次探测）；
 * 3. `listDirectory` 零参结构探测——home 层同时充当对话框首帧。
 *
 * 判定结论按**服务实例身份**缓存（D-12）：`read()` 返回同一实例时直接复用，
 * 宿主热替换或 HMR 重建产生新实例即失效重判。
 *
 * 零 React、零上游运行时 import：node 环境可直接单测；装配在 `index.ts`，
 * 通过 `read()` thunk 现取服务——服务晚到仍可用。
 *
 * @module dsh-plugin-multi-root-workspace/client/directory-picker
 */
/** 上游 DirectoryEntry 的结构镜像（`@deepseek-ai/dsh-host-directory-picker` 的 `DirectoryEntry`）。 */
export interface DirectoryEntry {
    readonly name: string;
    /** 绝对宿主路径；客户端永不自行拼接路径段。 */
    readonly path: string;
    /** 宿主平台约定的隐藏项（POSIX 点开头）；是否展示由客户端决定。 */
    readonly hidden: boolean;
}
/** 上游 DirectoryListing 的结构镜像。 */
export interface DirectoryListing {
    readonly path: string;
    /** 宿主账户 home，面包屑「主目录」的锚点。 */
    readonly home: string;
    /** 文件系统根 → 当前层的祖先链（含当前层，每段都可跳转）。 */
    readonly crumbs: readonly DirectoryEntry[];
    /** 直接子目录（按名排序，含指向目录的符号链接）。 */
    readonly entries: readonly DirectoryEntry[];
    /** 后端在完整结果上界处截断 entries 时为 true。 */
    readonly truncated: boolean;
}
/** `ctx.uiWorkspace` 中本插件用到的方法；三项都可缺席（组合由表面决定）。 */
export interface DirectoryPickerService {
    readonly pickDirectory?: () => Promise<string | null>;
    readonly listDirectory?: (path?: string, signal?: AbortSignal) => Promise<DirectoryListing>;
    readonly createDirectory?: (path: string, name: string) => Promise<string>;
}
/** 浏览端口：只暴露对话框需要的两个原语，且失败已归一化。 */
export interface DirectoryBrowser {
    /** 列一层；`path` 缺席 = 宿主 home；`signal` 中止底层扫描。 */
    readonly list: (path?: string, signal?: AbortSignal) => Promise<DirectoryListing>;
    /** 在已存在的父目录下新建一个子目录，返回创建出的绝对路径。 */
    readonly create: (path: string, name: string) => Promise<string>;
}
/** 一次「选择目录」的结局。 */
export type DirectoryPickOutcome = {
    readonly kind: 'picked';
    readonly path: string;
} | {
    readonly kind: 'cancelled';
} | {
    readonly kind: 'browse';
    readonly browsing: DirectoryBrowser;
    readonly listing?: DirectoryListing;
} | {
    readonly kind: 'unavailable';
} | {
    readonly kind: 'failed';
    readonly error: unknown;
};
export type PickDirectory = () => Promise<DirectoryPickOutcome>;
/** 浏览失败：`code` 是本地稳定码（不是 wire 码），`message` 保留上游原文供诊断。 */
export declare class DirectoryBrowseError extends Error {
    readonly name = "DirectoryBrowseError";
    readonly code: DirectoryBrowseCode;
    constructor(code: DirectoryBrowseCode, message: string);
}
export type DirectoryBrowseCode = 'picker-unreadable' | 'picker-exists' | 'picker-create-failed' | 'picker-failed';
/**
 * 构造拾取端口。
 * @param read - 每次调用现取 `ctx.uiWorkspace`（服务可能晚于 apply 就绪，也可能被替换）。
 * @returns 可直接注入分节的 `pickDirectory`（永远存在；无服务时调用返回 unavailable）。
 */
export declare function createDirectoryPicker(read: () => DirectoryPickerService | undefined): PickDirectory;
