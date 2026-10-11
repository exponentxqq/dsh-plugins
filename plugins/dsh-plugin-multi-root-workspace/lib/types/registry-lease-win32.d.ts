/**
 * Windows named-kernel-semaphore adapter for the registry authority lease.
 *
 * This follows the same kernel-object contract as upstream
 * `SessionWriteLease` (published `@deepseek-ai/dsh-session-persistence-jsonl`
 * 0.1.5-rc.2): a count-1 named semaphore, a zero-timeout wait, and release by
 * restoring the count then closing the handle — the object dies with its last
 * handle, including on process death. It is a local reimplementation; it does
 * not deep-import `session-persistence-jsonl/src/win32.ts` (ADR-0002).
 *
 * Koffi is loaded lazily so POSIX processes never load it.
 *
 * @module dsh-plugin-multi-root-workspace/registry-lease-win32
 */
/**
 * Derive the semaphore name from the physical parent directory, resolving
 * junctions, symlinks and short path aliases before case folding and hashing.
 * @param path - the lock path; its parent exists, but the file need not.
 * @returns the store's kernel-object name.
 */
export declare function leaseNameWin32(path: string): string;
/** Acquire the semaphore for the physical store directory. */
export declare function acquireLockHandleWin32(path: string): Promise<number>;
/**
 * Restore the semaphore count and close the handle (the object dies with its
 * last handle, including on process death).
 * @param handle - the open semaphore handle.
 */
export declare function releaseLockHandleWin32(handle: number): Promise<void>;
