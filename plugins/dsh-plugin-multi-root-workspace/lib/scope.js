import { Service } from "@deepseek-ai/cordis";
import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
import { statSync } from "node:fs";
//#region src/scope.ts
/**
* The multi-root workspace scope: the plugin's single home for the question
* "which directories belong to this workspace".
*
* The primary root is never stored here — it is the session's immutable cwd as
* resolved by the upstream `ctx.sandboxPolicy` service. This service owns the
* additional roots, the canonical key that indexes them, and the one model-facing
* statement of that topology, so every enforcing provider (fs fence,
* kernel-sandbox dialects) and the prompt snapshot all resolve the same scope.
*
* Two populations make up the additional roots, and they are merged HERE because
* this is the one place every provider asks:
*
* - **Registered roots**, keyed by canonical primary root, published by the
*   registry from its store. They belong to one workspace.
* - **Common roots** (`setCommonRoots`), configuration-supplied and granted to
*   every primary root — the machine-wide directories nearly every project
*   needs, which would otherwise have to be registered per project. They are
*   merged after the registered ones, so a registration keeps its position and
*   its ordinal while a duplicate is granted exactly once.
*
* The root table is still filled by the registry's own API (tests and smoke
* scripts today; plugin storage in M3). Keeping the empty case on the same code
* path as the populated one is deliberate — the pass-through safety net must
* exercise the real provider wiring, not a stub that later gets replaced.
*
* @module dsh-plugin-multi-root-workspace/scope
*/
/**
* Canonicalize and sanitize one root list against a primary root: drop the
* primary itself, duplicates, missing/non-directory paths, and any root whose
* current resolution no longer matches the directory it was registered for;
* preserve registry order.
*
* The last rule is the security-relevant one. `canonicalPath` is `realpath`, so
* a registered directory that has since been replaced by a symlink resolves to
* a different directory — granting that would hand out a directory nobody
* registered, on nothing more than a local replace. A registration whose
* resolution moved is therefore withheld here (the registry reports it as
* `redirected`), and it comes back only when the path resolves to the recorded
* directory again.
*
* @param primaryRoot - the canonical primary root to exclude.
* @param roots - candidate roots, in registry order.
* @returns the sanitized additional roots.
*/
function sanitizeAdditionalRoots(primaryRoot, roots) {
	const seen = /* @__PURE__ */ new Set([primaryRoot]);
	const result = [];
	for (const root of roots) {
		const recorded = root.recordedPath;
		if (typeof recorded !== "string" || recorded === "") continue;
		const canonical = canonicalPath(root.path);
		if (canonical !== recorded) continue;
		try {
			if (!statSync(canonical).isDirectory()) continue;
		} catch {
			continue;
		}
		if (seen.has(canonical)) continue;
		seen.add(canonical);
		result.push(canonical);
	}
	return result;
}
/**
* The name of the runtime-context contribution that tells the model which extra
* roots belong to this session's workspace.
*/
const MULTI_ROOT_CONTEXT_NAME = "multi-root:scope";
/**
* Render the workspace topology the model is told about. Only roots are listed
* (never files), and the sentence states the two facts a denied write would
* otherwise have to teach: that the additional roots are part of the SAME
* workspace, and that the session cwd is unchanged (requirement §5, §8).
* @param primaryRoot - the canonical session workspace root.
* @param additionalRoots - canonical additional roots, in scope order.
* @returns the stable topology sentence.
*/
function renderWorkspaceRootsContext(primaryRoot, additionalRoots) {
	return `Current DSH workspace roots: ${JSON.stringify(additionalRoots)} are additional roots of this session's workspace. Under workspace-write they may be modified like the session workspace; the session cwd remains the primary root (${JSON.stringify(primaryRoot)}).`;
}
/**
* The `ctx.multiRootScope` service. Providers ask it — never the filesystem —
* what the current scope is, which is what keeps the fs fence and every kernel
* dialect on one permission world (requirement §13).
*/
var MultiRootScopeService = class extends Service {
	/** Additional roots keyed by canonical primary root; empty until roots are registered. */
	rootsByPrimary = /* @__PURE__ */ new Map();
	/**
	* Roots granted to every primary root, whatever its registrations hold.
	* Configuration-derived: this list is never persisted anywhere, so changing
	* the configuration is the only way to change what it grants.
	*/
	commonRoots = [];
	listeners = /* @__PURE__ */ new Set();
	/** Observe registry publications; consumers still resolve authority from scopeOf(). */
	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	constructor(ctx) {
		super(ctx, "multiRootScope");
		ctx.inject(["systemPrompt", "sandboxPolicy"], (scope) => {
			scope.systemPrompt.context({
				name: MULTI_ROOT_CONTEXT_NAME,
				order: scope.systemPrompt.getContextOrder("SANDBOX_POLICY") + 1,
				text: (assembly) => {
					const session = assembly.agent?.session;
					if (session === void 0) return "";
					const policy = scope.sandboxPolicy.resolve({ session });
					if (policy.mode !== "workspace-write") return "";
					const resolved = this.resolve(policy);
					if (resolved.additionalRoots.length === 0) return "";
					return renderWorkspaceRootsContext(resolved.primaryRoot, resolved.additionalRoots);
				}
			});
		});
	}
	/**
	* Resolve the scope of one confined call.
	* @param policy - the upstream policy whose workspace root is the primary root.
	* @returns the canonical scope; `additionalRoots` is empty when none are registered.
	*/
	resolve(policy) {
		const primaryRoot = canonicalPath(policy.workspaceRoot);
		return {
			primaryRoot,
			additionalRoots: this.scopeOf(primaryRoot)
		};
	}
	/**
	* The additional roots of one canonical primary root: its registrations
	* followed by the configured common roots, in that order.
	*
	* Order is what keeps the two surfaces stable — a registration never loses its
	* position (or its displayed number) because a common root was added — and the
	* sanitizer drops a common root a registration already grants, so a directory
	* that is both registered and configured is still granted exactly once.
	* @param primaryRoot - canonical primary root (or any spelling thereof).
	* @returns the canonical additional roots; empty when none are registered.
	*/
	scopeOf(primaryRoot) {
		const key = canonicalPath(primaryRoot);
		const registered = this.rootsByPrimary.get(key);
		if (registered === void 0 && this.commonRoots.length === 0) return [];
		return sanitizeAdditionalRoots(key, [...registered ?? [], ...this.commonRoots]);
	}
	/**
	* Replace the roots granted to EVERY primary root.
	*
	* The registry publishes this list from its `commonRoots` configuration once
	* it is the Registry Authority, and withdraws it (empty) whenever it is not:
	* a process that grants no registrations must not hand out configured roots
	* either. A common root passes the same sanitizer as a registration, so a
	* directory that is absent, that was replaced by a symlink, or that IS the
	* session's own workspace root is withheld rather than granted.
	* @param roots - the common roots, in configuration order.
	*/
	setCommonRoots(roots) {
		if (!(roots.length !== this.commonRoots.length || roots.some((root, index) => {
			const current = this.commonRoots[index];
			return current === void 0 || current.recordedPath !== root.recordedPath || current.path !== root.path;
		}))) return;
		this.commonRoots = [...roots];
		for (const listener of this.listeners) listener();
	}
	/**
	* Replace the roots registered for one primary root.
	*
	* M1 uses this from tests and smoke scripts only; M3 feeds it from plugin
	* storage. It is a plain setter so the transition swaps the data source
	* without touching any provider.
	* @param primaryRoot - canonical primary root to register roots under.
	* @param roots - the additional roots, in display order.
	*/
	setAdditionalRoots(primaryRoot, roots) {
		const key = canonicalPath(primaryRoot);
		if (roots.length === 0) this.rootsByPrimary.delete(key);
		else this.rootsByPrimary.set(key, [...roots]);
		for (const listener of this.listeners) listener();
	}
};
//#endregion
export { MULTI_ROOT_CONTEXT_NAME, MultiRootScopeService, MultiRootScopeService as default, renderWorkspaceRootsContext, sanitizeAdditionalRoots };
