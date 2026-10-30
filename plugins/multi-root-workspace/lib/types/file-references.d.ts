/**
 * `multi-root-file-references` 行：additive 包装 `ctx.fileReferences.list`，
 * 让附加根出现在 `@` 文件提及补全候选里（不替换上游 provider、不 disable
 * 任何上游行——先例：`lsp.ts` / `workspace-files.ts` 的 wrapMethod 形态）。
 *
 * 查询三分支（在 `await original` 之前同步判定，透传不干扰时序）：
 * - 空 query → 每个附加根一条绝对目录候选（path 无尾斜杠）；
 * - 绝对 query → 最长匹配的包含根钻入（该根的 WorkspaceFileSearch 以 `R/`
 *   为 displayDirectory 列目录，上游直接产出绝对候选）+ 其余以 query 为
 *   前缀的根各一条候选；
 * - 裸模糊 / 相对 query → 附加根完全不参与（连 WorkspaceFileSearch.acquire
 *   都不触发），字节级透传。
 *
 * 主根取 `agent.session.header.cwd` 的 canonical（不可变 session cwd，不受
 * 会话内 `cd` 影响，code-design ④ D5）；附加根清单唯一来源是
 * `ctx.multiRootScope`，每次调用按当前授予根 retain 剪枝缓存，根撤销即失效。
 *
 * @module dsh-plugin-multi-root-workspace/file-references
 */
import type { Context } from '@deepseek-ai/cordis';
/** 与 lsp/workspace-files 一致：门禁前置 + 唯一根数据源。 */
export declare const inject: string[];
/** 一个被授予的附加根：canonical 用于检索/复验，display 用于候选路径。 */
export interface GrantedRoot {
    /** scope 返回的 canonical 原生路径（检索实例的 root，也是复验键）。 */
    readonly canonical: string;
    /** 对用户展示/插入的路径：`/` 分隔、无尾斜杠（Windows 也转 `/`）。 */
    readonly display: string;
}
/** 一次查询要追加的内容；`undefined` 表示完全不干预（字节级透传）。 */
export interface AdditionalCandidatesPlan {
    /** 追加为绝对目录候选的根，按 scope 顺序。 */
    readonly roots: readonly GrantedRoot[];
    /** 需要以该根为范围列目录时的钻入目标。 */
    readonly drill?: {
        readonly root: GrantedRoot;
        readonly query: string;
    };
}
/** 原生路径 → 候选显示路径（win32 把 `\` 换成 `/`；POSIX 原样）。 */
export declare function toDisplayPath(canonical: string): string;
/**
 * 纯函数：按 query 形态决定追加什么。
 * - 空 query → { roots: 全部 }
 * - 绝对 query → drill = 最长匹配的包含根（要求 `R/` 前缀，即
 *   `normalized === R + '/'` 或以 `R + '/'` 开头）；roots = 其余「以 query
 *   为前缀」的根（`pathStartsWith(R, normalized)`；win32 大小写不敏感）。
 *   两者都落空 → undefined（不干预）。
 * - 裸模糊 / 相对 query → undefined
 * query 先按上游同样的规则归一化（`replaceAll('\\','/')`）再判形态。
 * 不把 `R` 本身（无尾斜杠）当钻入：上游 listDirectory 会把它切成父目录
 * 片段并因逃逸检查返回空（④ D6）。
 */
export declare function planAdditionalCandidates(query: string, roots: readonly GrantedRoot[]): AdditionalCandidatesPlan | undefined;
export declare function apply(ctx: Context): void;
