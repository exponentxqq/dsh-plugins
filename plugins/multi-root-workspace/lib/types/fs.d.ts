/**
 * `MultiRootFileSystem`: the multi-root filesystem provider mounted as `ctx.fs`.
 *
 * It extends the local backend so every text-storage mechanic — resolve, stat,
 * read/stream, listing, the atomic write and the read-match-write edit critical
 * section — stays the upstream implementation's, verbatim; this class adds only
 * the per-call POLICY fence on the two mutations, exactly as the upstream
 * `SandboxedFileSystem` does, widened from one workspace root to the scope's
 * root set.
 *
 * Why not `extends SandboxedFileSystem`: its `checkedTarget` is TS-private, so a
 * cross-package subclass can neither reuse nor override it in a type-safe way.
 * Why the fence is implemented here rather than delegated: with zero additional
 * roots this class must behave exactly like the upstream provider, and the
 * differential suite in `tests/fs-parity.spec.ts` pins that equality against the
 * real upstream class for every mode and path class.
 *
 * Reads are untouched: no mode confines reading, upstream or here.
 *
 * @module dsh-plugin-multi-root-workspace/fs
 */
import type { Context } from '@deepseek-ai/cordis';
import type { FsEditOutcome, FsEditRequest, FsTarget, FsVersion, FsWriteIntent, FsWriteOutcome } from '@deepseek-ai/dsh-fs';
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local';
import type { Config as LocalConfig } from '@deepseek-ai/dsh-fs-local';
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox';
/** Plugin config: the local backend's knobs verbatim (see `dsh-fs-local`). */
export type Config = LocalConfig;
/**
 * Sandbox-enforcing filesystem backend over the multi-root scope. Registers as
 * `ctx.fs`; `ctx.sandboxPolicy` still owns the mode and the primary root, and
 * this class only widens the writable root set with the scope's additional
 * roots.
 */
export declare class MultiRootFileSystem extends LocalFileSystem {
    static inject: string[];
    private readonly defaultMode;
    constructor(ctx: Context, config: Config);
    /** The deployment default mode — the capability fact the tool layer reads to advertise escalation. */
    get sandboxMode(): SandboxMode;
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
    writeText(target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsWriteOutcome>;
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
    editText(target: FsTarget, edit: FsEditRequest, expected?: {
        version: FsVersion;
    }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsEditOutcome>;
    /**
     * The writable roots of one workspace-write call: the upstream derivation
     * (primary root plus the platform temp areas, canonical and deduplicated)
     * widened by the scope's additional roots, in scope order.
     * @param policy - the per-call policy.
     * @param scope - the scope resolved once for this call; both the fence and
     *   the denial message below share it instead of re-resolving.
     * @returns the canonical writable roots; empty under `read-only`.
     */
    private rootsFor;
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
    private checkedTarget;
}
export default MultiRootFileSystem;
