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
export { wrapMethod as t };
