import { t as routeWorkspacePath } from "./workspace-routing-BUqxqErh.js";
import { t as wrapMethod } from "./method-wrapper-CFY3p3j2.js";
//#region src/lsp.ts
const inject = ["multiRootCompat", "multiRootScope"];
function apply(ctx) {
	ctx.inject(["lsp", "fs"], (scope) => {
		const service = scope.get("lsp");
		scope.effect(() => wrapMethod(service, "query", (original) => async function(request, signal) {
			if (scope.multiRootScope.scopeOf(request.workspaceRoot).length === 0) return original.call(this, request, signal);
			const route = await routeWorkspacePath(scope, request.workspaceRoot, request.filePath, signal);
			if (route === void 0 || route.workspaceRoot === route.primaryRoot) return original.call(this, request, signal);
			return original.call(this, {
				...request,
				workspaceRoot: route.workspaceRoot,
				filePath: route.absolutePath
			}, signal);
		}), "multi-root:lsp routing");
	});
}
//#endregion
export { apply, inject };
