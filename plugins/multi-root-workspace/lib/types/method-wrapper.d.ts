/** Wrap a public method on a Cordis service without capturing a caller-context proxy. */
export declare function wrapMethod<T extends object, K extends keyof T>(target: T, key: K, wrap: (original: T[K]) => T[K]): () => void;
