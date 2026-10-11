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
//#region src/method-wrapper.ts
/** Wrap a public method on a Cordis service without capturing a caller-context proxy. */
function wrapMethod(target, key, wrap) {
	const own = Object.getOwnPropertyDescriptor(target, key);
	let prototype = target;
	let descriptor;
	while (prototype !== null && descriptor === void 0) {
		descriptor = Object.getOwnPropertyDescriptor(prototype, key);
		prototype = Object.getPrototypeOf(prototype);
	}
	if (typeof descriptor?.value !== "function") throw new Error(`multi-root: ${String(key)} is not a public method`);
	const value = wrap(descriptor.value);
	Object.defineProperty(target, key, {
		configurable: true,
		writable: true,
		enumerable: own?.enumerable ?? false,
		value
	});
	return () => {
		if (Object.getOwnPropertyDescriptor(target, key)?.value !== value) return;
		if (own === void 0) Reflect.deleteProperty(target, key);
		else Object.defineProperty(target, key, own);
	};
}
//#endregion
export { routeWorkspacePath as n, wrapMethod as t };
