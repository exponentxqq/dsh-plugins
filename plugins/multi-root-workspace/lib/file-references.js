import { t as wrapMethod } from "./method-wrapper-CFY3p3j2.js";
import { isAbsolute } from "node:path";
import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
//#region src/compat/file-reference-search.ts
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
/** optional peer 合法缺席的判据（先例：`compat/llm-message.ts`）。 */
function isModuleNotFound(error) {
	const code = error?.code;
	return code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND";
}
function isPositiveSafeInteger(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
/**
* 结构探针：接受 upstream 模块命名空间，返回适配面或 undefined。
* 要求 `WorkspaceFileSearch` 是函数，且三个默认常量类型合法；缺一即 undefined。
* 只探形状，不比对版本号（不变量 7：结构探针而非版本字符串）。
*/
function adaptFileReferenceLocal(module) {
	if (typeof module !== "object" || module === null) return void 0;
	const candidate = module;
	if (typeof candidate.WorkspaceFileSearch !== "function") return void 0;
	if (!isPositiveSafeInteger(candidate.DEFAULT_FILE_SEARCH_MAX_RESULTS)) return void 0;
	if (!isPositiveSafeInteger(candidate.DEFAULT_FILE_SEARCH_MAX_ENTRIES)) return void 0;
	const excluded = candidate.DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES;
	if (!Array.isArray(excluded)) return void 0;
	const names = excluded;
	if (names.some((name) => typeof name !== "string" || name === "")) return void 0;
	const config = {
		maxResults: candidate.DEFAULT_FILE_SEARCH_MAX_RESULTS,
		maxEntries: candidate.DEFAULT_FILE_SEARCH_MAX_ENTRIES,
		excludedDirectories: [...names]
	};
	const search = candidate.WorkspaceFileSearch;
	return { createSearch(root) {
		return new search(root, config);
	} };
}
/** 模块级记忆化的加载结果；一次 import，之后缺席/装坏都不重试。 */
let memoizedOutcome;
/** 执行一次动态导入 + 结构探针并分类；模块级记忆化，永不 reject。 */
function loadOutcome() {
	memoizedOutcome ??= import("@deepseek-ai/dsh-file-reference-local").then((module) => {
		const api = adaptFileReferenceLocal(module);
		return api === void 0 ? {
			status: "broken",
			reason: "结构探针未通过：WorkspaceFileSearch 或默认检索常量的形状与预期不符"
		} : {
			status: "ready",
			api
		};
	}, (error) => isModuleNotFound(error) ? { status: "absent" } : {
		status: "broken",
		reason: errorMessage(error)
	});
	return memoizedOutcome;
}
/** 每个附加根一个检索实例；实例缓存与生命周期。 */
var AdditionalRootSearchCache = class {
	loader;
	warn;
	/** 降级告警只发一次（每实例；行场景仅一个实例）。 */
	warned = false;
	disposed = false;
	/** 根（canonical）→ 该根检索实例的创建 Promise（同一根并发调用去重）。 */
	searches = /* @__PURE__ */ new Map();
	constructor(options) {
		this.loader = options?.load;
		this.warn = options?.warn ?? (() => {});
	}
	/** 取（或创建）一个根的实例；不可用（peer 缺席/形状不符/构造失败）→ undefined。 */
	async acquire(root) {
		if (this.disposed) return void 0;
		const existing = this.searches.get(root);
		if (existing !== void 0) return existing;
		const entry = this.createEntry(root).then((search) => {
			if (search === void 0) {
				if (this.searches.get(root) === entry) this.searches.delete(root);
				return;
			}
			if (this.disposed) {
				search.dispose();
				return;
			}
			return search;
		}, () => void 0);
		this.searches.set(root, entry);
		return entry;
	}
	/** 保留这些根，dispose 其余实例（根撤销/切换主根时调用）。 */
	retain(roots) {
		const keep = new Set(roots);
		for (const [root, entry] of this.searches) {
			if (keep.has(root)) continue;
			this.searches.delete(root);
			entry.then((search) => {
				search?.dispose();
			});
		}
	}
	/** 行卸载：dispose 全部并拒绝后续 acquire。 */
	disposeAll() {
		this.disposed = true;
		const entries = [...this.searches.values()];
		this.searches.clear();
		for (const entry of entries) entry.then((search) => {
			search?.dispose();
		});
	}
	async createEntry(root) {
		const api = await this.loadApi();
		if (api === void 0) return void 0;
		try {
			return api.createSearch(root);
		} catch (error) {
			this.warnOnce(`multi-root workspace: additional-root file search for "${root}" could not be created (@ completion stays primary-root only; ${errorMessage(error)})`);
			return;
		}
	}
	async loadApi() {
		if (this.loader !== void 0) try {
			return await this.loader();
		} catch (error) {
			if (!isModuleNotFound(error)) this.warnOnce(`multi-root workspace: @deepseek-ai/dsh-file-reference-local failed to load (@ completion stays primary-root only; ${errorMessage(error)})`);
			return;
		}
		const outcome = await loadOutcome();
		if (outcome.status === "ready") return outcome.api;
		if (outcome.status === "broken") this.warnOnce(`multi-root workspace: @deepseek-ai/dsh-file-reference-local is unusable (@ completion stays primary-root only; ${outcome.reason})`);
	}
	warnOnce(message) {
		if (this.warned) return;
		this.warned = true;
		this.warn(message);
	}
};
//#endregion
//#region src/file-references.ts
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
/** 与 lsp/workspace-files 一致：门禁前置 + 唯一根数据源。 */
const inject = ["multiRootCompat", "multiRootScope"];
/** 原生路径 → 候选显示路径（win32 把 `\` 换成 `/`；POSIX 原样）。 */
function toDisplayPath(canonical) {
	return canonical.replaceAll("\\", "/");
}
/** win32 路径比较大小写不敏感（对齐 `containment.ts` 的 caseSensitive 约定）。 */
const PATH_CASE_SENSITIVE = process.platform !== "win32";
function comparable(path) {
	return PATH_CASE_SENSITIVE ? path : path.toLowerCase();
}
/** `path` 是否以 `prefix` 开头（win32 大小写不敏感）。 */
function pathStartsWith(path, prefix) {
	return comparable(path).startsWith(comparable(prefix));
}
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
function planAdditionalCandidates(query, roots) {
	const normalized = query.replaceAll("\\", "/");
	if (normalized === "") return { roots };
	if (!isAbsolute(normalized)) return void 0;
	let drillRoot;
	for (const root of roots) {
		if (!pathStartsWith(normalized, root.display + "/")) continue;
		if (drillRoot === void 0 || root.display.length > drillRoot.display.length) drillRoot = root;
	}
	const prefixRoots = roots.filter((root) => root !== drillRoot && pathStartsWith(root.display, normalized));
	if (drillRoot === void 0 && prefixRoots.length === 0) return void 0;
	return {
		roots: prefixRoots,
		...drillRoot === void 0 ? {} : { drill: {
			root: drillRoot,
			query
		} }
	};
}
/** 主根：agent 的不可变 session cwd → canonical；缺失/非绝对 → undefined。 */
function primaryRootOf(agent) {
	const cwd = agent.session.header.cwd;
	return cwd !== void 0 && isAbsolute(cwd) ? canonicalPath(cwd) : void 0;
}
/** 把 plan 落成候选，并在 I/O 后复验 scope（根撤销即丢弃其候选）。 */
async function materialize(scope, cache, primaryRoot, plan, signal) {
	const granted = () => scope.multiRootScope.scopeOf(primaryRoot);
	const extra = [];
	const seen = /* @__PURE__ */ new Set();
	if (plan.drill !== void 0) {
		const { root, query } = plan.drill;
		if (granted().includes(root.canonical)) {
			const search = await cache.acquire(root.canonical);
			if (search !== void 0) {
				const items = await search.list(query, signal);
				if (granted().includes(root.canonical)) for (const item of items) {
					if (seen.has(item.path)) continue;
					seen.add(item.path);
					extra.push(item);
				}
			}
		}
	}
	const current = new Set(granted());
	for (const root of plan.roots) {
		if (!current.has(root.canonical)) continue;
		if (seen.has(root.display)) continue;
		seen.add(root.display);
		extra.push({
			path: root.display,
			kind: "directory"
		});
	}
	return extra;
}
function apply(ctx) {
	ctx.inject(["fileReferences"], (scope) => {
		const service = scope.get("fileReferences");
		scope.effect(() => {
			const cache = new AdditionalRootSearchCache({ warn: (message) => {
				scope.logger.warn(message);
			} });
			const restore = wrapMethod(service, "list", (original) => async function(agent, query, signal) {
				const primaryRoot = primaryRootOf(agent);
				const roots = primaryRoot === void 0 ? [] : scope.multiRootScope.scopeOf(primaryRoot);
				cache.retain(roots);
				if (primaryRoot === void 0 || roots.length === 0) return original.call(this, agent, query, signal);
				const plan = planAdditionalCandidates(query, roots.map((root) => ({
					canonical: root,
					display: toDisplayPath(root)
				})));
				if (plan === void 0) return original.call(this, agent, query, signal);
				const base = await original.call(this, agent, query, signal);
				const extra = await materialize(scope, cache, primaryRoot, plan, signal);
				if (extra.length === 0) return base;
				const seen = new Set(base.map((candidate) => candidate.path));
				return [...base, ...extra.filter((candidate) => !seen.has(candidate.path))];
			});
			return () => {
				restore();
				cache.disposeAll();
			};
		}, "multi-root:file-references discovery");
	});
}
//#endregion
export { apply, inject, planAdditionalCandidates, toDisplayPath };
