import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
//#region src/workspace-routing.ts
/** Resolve relative paths against the primary cwd; never search other roots by basename. */
async function routeWorkspacePath(ctx, primaryRoot, path, signal) {
	signal?.throwIfAborted();
	const primary = canonicalPath(primaryRoot);
	const roots = [primary, ...ctx.multiRootScope.scopeOf(primary)];
	const target = await ctx.fs.resolve(path, {
		cwd: primary,
		...signal === void 0 ? {} : { signal }
	});
	for (const root of roots) {
		const rootTarget = await ctx.fs.resolve(root, signal === void 0 ? {} : { signal });
		if (!ctx.fs.contains(rootTarget, target)) continue;
		if (root !== primary && !ctx.multiRootScope.scopeOf(primary).includes(root)) return void 0;
		signal?.throwIfAborted();
		return {
			primaryRoot: primary,
			workspaceRoot: root,
			target,
			absolutePath: ctx.fs.processPath(target)
		};
	}
}
//#endregion
export { routeWorkspacePath as t };
