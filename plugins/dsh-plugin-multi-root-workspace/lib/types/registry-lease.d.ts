/**
 * Store-wide kernel lease for the multi-root registry.
 *
 * The JSON storage backend is memory-authoritative after `open`: it reads the
 * domain document once, then every write is an atomic rewrite of that in-memory
 * snapshot. Two DSH processes sharing one storage root can therefore each grant
 * a stale set, and a later rewrite silently drops the other process's mutation.
 * The in-process `chains` queue in `registry.ts` cannot see that race.
 *
 * This lease makes one process the Registry Authority for the whole
 * `multi_root_workspace` medium. The arbiter is the kernel, matching upstream
 * session JSONL persistence: POSIX non-blocking `flock(2)` via
 * `@deepseek-ai/node-addon-system/flock`, Windows a named kernel semaphore.
 * There is no TTL and no stale-PID algorithm — the kernel releases the lock
 * when the holder's descriptor (or last object handle) closes, including on
 * crash. See ADR-0007.
 *
 * @module dsh-plugin-multi-root-workspace/registry-lease
 */
/** Thrown when another live process already holds the registry lease. */
export declare class RegistryLeaseContendedError extends Error {
    /** Stable code the registry maps onto `registry-contended`. */
    readonly code: "registry-contended";
    /** Absolute lock path that was contended. */
    readonly leasePath: string;
    /**
     * @param leasePath - the store-wide lock path that was contended.
     */
    constructor(leasePath: string);
}
/**
 * One held store-wide registry lock. Constructed only by
 * {@link RegistryAuthorityLease.acquire}; `release` closes the descriptor or
 * handle, which is what releases the lock.
 */
export declare class RegistryAuthorityLease {
    private readonly held;
    private released;
    private constructor();
    /**
     * Acquire the exclusive kernel lock for one registry store.
     *
     * POSIX opens `leasePath` (creating it and its parent) and takes a
     * non-blocking exclusive flock. Because flock names an inode, the holder then
     * verifies the locked inode is still the file at `leasePath` and retries
     * otherwise — an unlinked-and-recreated lock file carries a fresh inode.
     * Windows never flocks the file: it holds a named kernel semaphore derived
     * from the canonical path so readers and directory removal stay free.
     * @param leasePath - absolute path of the lock file (store-wide, beside the domain JSON).
     * @returns the held lease.
     * @throws {RegistryLeaseContendedError} while another holder keeps the lock.
     */
    static acquire(leasePath: string): Promise<RegistryAuthorityLease>;
    /**
     * Release the kernel lock by closing its descriptor or handle. The POSIX
     * lock file is never removed: keeping it preserves the stable inode later
     * lockers verify against. POSIX close is synchronous so a fiber disposer that
     * does not await this promise still drops the flock before returning.
     * Idempotent.
     */
    release(): Promise<void>;
}
