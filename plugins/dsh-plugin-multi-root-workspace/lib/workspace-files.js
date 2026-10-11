import { n as routeWorkspacePath, t as wrapMethod } from "./method-wrapper-C1349v3W.js";
//#region src/compat/workspace-files.ts
function adaptPathWatch(service, wrap) {
	return wrapMethod(service, "changes", (original) => original.length < 3 ? original : wrap(original));
}
//#endregion
//#region src/workspace-files.ts
const inject = ["multiRootCompat", "multiRootScope"];
function apply(ctx) {
	ctx.inject(["workspaceFiles", "fs"], (scope) => {
		const service = scope.get("workspaceFiles");
		scope.effect(() => {
			const rowLifetime = new AbortController();
			const restoreList = wrapMethod(service, "list", (original) => async function(request, path, signal) {
				if (scope.multiRootScope.scopeOf(request.workspaceRoot).length === 0) return original.call(this, request, path, signal);
				const route = await routeWorkspacePath(scope, request.workspaceRoot, path, signal);
				if (route === void 0 || route.workspaceRoot === route.primaryRoot) return original.call(this, request, path, signal);
				const result = await original.call(this, {
					...request,
					workspaceRoot: route.workspaceRoot
				}, route.absolutePath, signal);
				if (!scope.multiRootScope.scopeOf(route.primaryRoot).includes(route.workspaceRoot)) throw await outside(path);
				return result;
			});
			const restoreWatch = adaptPathWatch(service, (originalChanges) => async function* (request, path, signal) {
				if (scope.multiRootScope.scopeOf(request.workspaceRoot).length === 0) {
					yield* originalChanges.call(this, request, path, signal);
					return;
				}
				const route = await routeWorkspacePath(scope, request.workspaceRoot, path, signal);
				if (route === void 0 || route.workspaceRoot === route.primaryRoot) {
					yield* originalChanges.call(this, request, path, signal);
					return;
				}
				const lifetime = new AbortController();
				const unsubscribe = scope.multiRootScope.subscribe(() => {
					if (!scope.multiRootScope.scopeOf(route.primaryRoot).includes(route.workspaceRoot)) lifetime.abort(/* @__PURE__ */ new Error("the additional root was revoked"));
				});
				try {
					for await (const frame of originalChanges.call(this, {
						...request,
						workspaceRoot: route.workspaceRoot
					}, route.absolutePath, AbortSignal.any([
						signal,
						lifetime.signal,
						rowLifetime.signal
					]))) {
						if (!scope.multiRootScope.scopeOf(route.primaryRoot).includes(route.workspaceRoot)) throw await outside(path);
						yield frame;
					}
				} finally {
					unsubscribe();
				}
			});
			return () => {
				rowLifetime.abort(/* @__PURE__ */ new Error("multi-root workspace-files routing unloaded"));
				restoreList();
				restoreWatch();
			};
		}, "multi-root:workspace-files routing");
	});
}
async function outside(path) {
	const { RemoteError } = await import("@deepseek-ai/dsh-typert-protocol");
	return new RemoteError("workspace-file/outside-workspace", `"${path}" is no longer in this workspace`, { path });
}
//#endregion
export { apply, inject };
