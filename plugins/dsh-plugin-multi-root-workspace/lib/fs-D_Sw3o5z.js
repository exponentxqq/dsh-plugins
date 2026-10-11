import { dirname, sep } from "node:path";
import { writableRoots } from "@deepseek-ai/dsh-sandbox";
import { FsError } from "@deepseek-ai/dsh-fs";
import { LocalFileSystem } from "@deepseek-ai/dsh-fs-local";
import { stat } from "node:fs/promises";
//#region src/containment.ts
const MISSING_CODES = /* @__PURE__ */ new Set(["ENOENT", "ENOTDIR"]);
function isMissing(error) {
	const code = error.code;
	return MISSING_CODES.has(code);
}
function comparablePath(path, caseSensitive) {
	return caseSensitive ? path : path.toLowerCase();
}
function isLexicallyUnder(path, root, caseSensitive) {
	const comparableTarget = comparablePath(path, caseSensitive);
	const comparableRoot = comparablePath(root, caseSensitive);
	if (comparableTarget === comparableRoot) return true;
	const prefix = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep;
	return comparableTarget.startsWith(prefix);
}
async function statIfPresent(path) {
	try {
		return await stat(path, { bigint: true });
	} catch (error) {
		if (isMissing(error)) return void 0;
		throw error;
	}
}
function sameIdentity(left, right) {
	return left.dev === right.dev && left.ino === right.ino;
}
/**
* Determine whether a canonical target is a writable root or lies beneath it.
* The lexical fast path handles normal canonical spellings. When spellings
* differ, walk the target's existing ancestors and compare filesystem identity
* with the root; this recognizes Windows long-name/8.3 aliases and casing
* without weakening containment to a textual approximation.
* @param path - canonical target key, which may end in a missing suffix.
* @param root - canonical writable root.
* @param caseSensitive - whether lexical comparison preserves case; defaults
*   to the host filesystem convention used by supported platforms.
* @returns whether the target is the root or a descendant of it.
*/
async function isPathUnder(path, root, caseSensitive = process.platform !== "win32") {
	if (isLexicallyUnder(path, root, caseSensitive)) return true;
	const rootInfo = await statIfPresent(root);
	if (!rootInfo) return false;
	let ancestor = path;
	while (true) {
		const ancestorInfo = await statIfPresent(ancestor);
		if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo)) return true;
		const parent = dirname(ancestor);
		if (parent === ancestor) return false;
		ancestor = parent;
	}
}
//#endregion
//#region src/fs.ts
/**
* Sandbox-enforcing filesystem backend over the multi-root scope. Registers as
* `ctx.fs`; `ctx.sandboxPolicy` still owns the mode and the primary root, and
* this class only widens the writable root set with the scope's additional
* roots.
*/
var MultiRootFileSystem = class extends LocalFileSystem {
	static inject = [
		"multiRootCompat",
		"sandboxPolicy",
		"multiRootScope"
	];
	defaultMode;
	constructor(ctx, config) {
		super(ctx, config);
		this.defaultMode = ctx.sandboxPolicy.defaultMode;
	}
	/** The deployment default mode — the capability fact the tool layer reads to advertise escalation. */
	get sandboxMode() {
		return this.defaultMode;
	}
	/**
	* Fence the write by the per-call policy, then delegate to the inherited
	* atomic write.
	* @param target - the resolved target to write.
	* @param content - the full new file content.
	* @param expected - the write intent guarding the write; omit for unconditional.
	* @param signal - aborts before atomic publication takes effect.
	* @param sandboxPolicy - the per-call mode and workspace root; omit to use
	*   the deployment fallback.
	* @returns the write outcome from the inherited backend.
	*/
	async writeText(target, content, expected, signal, sandboxPolicy) {
		return super.writeText(await this.checkedTarget(target, sandboxPolicy), content, expected, signal);
	}
	/**
	* Fence the edit by the per-call policy, then delegate to the inherited
	* atomic edit.
	* @param target - the resolved target to edit.
	* @param edit - the literal search/replace request.
	* @param expected - the version guard; omit for an unconditional edit.
	* @param signal - aborts before atomic publication takes effect.
	* @param sandboxPolicy - the per-call mode and workspace root; omit to use
	*   the deployment fallback.
	* @returns the edit outcome from the inherited backend.
	*/
	async editText(target, edit, expected, signal, sandboxPolicy) {
		return super.editText(await this.checkedTarget(target, sandboxPolicy), edit, expected, signal);
	}
	/**
	* The writable roots of one workspace-write call: the upstream derivation
	* (primary root plus the platform temp areas, canonical and deduplicated)
	* widened by the scope's additional roots, in scope order.
	* @param policy - the per-call policy.
	* @param scope - the scope resolved once for this call; both the fence and
	*   the denial message below share it instead of re-resolving.
	* @returns the canonical writable roots; empty under `read-only`.
	*/
	rootsFor(policy, scope) {
		const roots = writableRoots(policy);
		if (roots.length === 0) return roots;
		for (const root of scope.additionalRoots) if (!roots.includes(root)) roots.push(root);
		return roots;
	}
	/**
	* Enforce the per-call policy against `target` and return the EXACT target the
	* mutation must use, so the checked identity is the mutated one (no
	* check-here-write-there TOCTOU). `read-only` denies; `workspace-write`
	* re-canonicalizes NOW (reflecting a concurrently swapped symlink ancestor),
	* requires containment under one of the scope's writable roots, and returns
	* THAT fresh target; `danger-full-access` returns the caller's target unfenced.
	* @param target - the resolved target about to be mutated.
	* @param sandboxPolicy - the per-call policy; omit for the deployment fallback.
	* @returns the fresh canonical target the mutation must use.
	*/
	async checkedTarget(target, sandboxPolicy) {
		const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
		const { mode } = policy;
		if (mode === "danger-full-access") return target;
		if (mode === "read-only") throw new FsError(`cannot write "${target.displayPath}": file access denied under read-only mode`, "FS_SANDBOX_DENIED");
		const fresh = await this.resolve(target.displayPath);
		const scope = this.ctx.multiRootScope.resolve(policy);
		const roots = this.rootsFor(policy, scope);
		let contained = false;
		for (const root of roots) if (await isPathUnder(fresh.targetKey, root)) {
			contained = true;
			break;
		}
		if (!contained) {
			const denial = `cannot write "${target.displayPath}": file access denied under workspace-write mode`;
			throw new FsError(scope.additionalRoots.length === 0 ? denial : `${denial}; allowed roots: ${roots.join(", ")}`, "FS_SANDBOX_DENIED");
		}
		return fresh;
	}
};
//#endregion
export { MultiRootFileSystem as t };
