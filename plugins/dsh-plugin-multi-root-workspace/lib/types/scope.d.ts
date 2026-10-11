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
import { Context, Service } from '@deepseek-ai/cordis';
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox';
declare module '@deepseek-ai/cordis' {
    interface Context {
        multiRootScope: MultiRootScopeService;
    }
}
/**
 * One additional root as the scope receives it: a registration the registry read
 * back from its store, or a common root it resolved from configuration. The two
 * are deliberately the same shape, so one sanitizer and one provider path handle
 * both and no provider can tell (or need to tell) which is which.
 */
export interface AdditionalWorkspaceRoot {
    /** Stable identity: the registry's uuid, or a synthetic `common:` id. */
    id: string;
    /** Canonical absolute directory, as spelled in the registration. */
    path: string;
    /**
     * The canonical directory this registration was granted for (the `realpath`
     * captured when the operator registered it). The root is granted only while
     * `canonicalPath(path)` still equals this value: re-resolving a path is NOT
     * re-authorizing it, because whoever can replace the directory (or a symlink
     * in its chain) could otherwise move the grant to a directory no operator
     * ever registered.
     */
    recordedPath: string;
    /** Optional display alias. */
    alias?: string;
}
/**
 * The resolved scope of one confined call. `primaryRoot` equals the policy's
 * workspace root; `additionalRoots` are canonical, deduplicated, never equal to
 * the primary root, and empty in M1.
 */
export interface FilesystemScope {
    /** The session's workspace root (`session.header.cwd`, canonical). */
    primaryRoot: string;
    /** Extra writable roots granted inside the same sandbox mechanism. */
    additionalRoots: readonly string[];
}
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
export declare function sanitizeAdditionalRoots(primaryRoot: string, roots: readonly AdditionalWorkspaceRoot[]): string[];
/**
 * The name of the runtime-context contribution that tells the model which extra
 * roots belong to this session's workspace.
 */
export declare const MULTI_ROOT_CONTEXT_NAME = "multi-root:scope";
/**
 * Render the workspace topology the model is told about. Only roots are listed
 * (never files), and the sentence states the two facts a denied write would
 * otherwise have to teach: that the additional roots are part of the SAME
 * workspace, and that the session cwd is unchanged (requirement §5, §8).
 * @param primaryRoot - the canonical session workspace root.
 * @param additionalRoots - canonical additional roots, in scope order.
 * @returns the stable topology sentence.
 */
export declare function renderWorkspaceRootsContext(primaryRoot: string, additionalRoots: readonly string[]): string;
/**
 * The `ctx.multiRootScope` service. Providers ask it — never the filesystem —
 * what the current scope is, which is what keeps the fs fence and every kernel
 * dialect on one permission world (requirement §13).
 */
export declare class MultiRootScopeService extends Service {
    /** Additional roots keyed by canonical primary root; empty until roots are registered. */
    private readonly rootsByPrimary;
    /**
     * Roots granted to every primary root, whatever its registrations hold.
     * Configuration-derived: this list is never persisted anywhere, so changing
     * the configuration is the only way to change what it grants.
     */
    private commonRoots;
    private readonly listeners;
    /** Observe registry publications; consumers still resolve authority from scopeOf(). */
    subscribe(listener: () => void): () => void;
    constructor(ctx: Context);
    /**
     * Resolve the scope of one confined call.
     * @param policy - the upstream policy whose workspace root is the primary root.
     * @returns the canonical scope; `additionalRoots` is empty when none are registered.
     */
    resolve(policy: SandboxExecutionPolicy): FilesystemScope;
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
    scopeOf(primaryRoot: string): readonly string[];
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
    setCommonRoots(roots: readonly AdditionalWorkspaceRoot[]): void;
    /**
     * Replace the roots registered for one primary root.
     *
     * M1 uses this from tests and smoke scripts only; M3 feeds it from plugin
     * storage. It is a plain setter so the transition swaps the data source
     * without touching any provider.
     * @param primaryRoot - canonical primary root to register roots under.
     * @param roots - the additional roots, in display order.
     */
    setAdditionalRoots(primaryRoot: string, roots: readonly AdditionalWorkspaceRoot[]): void;
}
export default MultiRootScopeService;
