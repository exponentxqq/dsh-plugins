/**
 * The root vocabulary: identities, the durable record shape, the status a
 * stored record is reported with, and the validation rules every write and
 * every startup re-read passes through.
 *
 * This module is the single home of "what makes a directory a legal additional
 * root" (requirement §15). Both the registry (which persists) and the command
 * and panel surfaces (which report) speak these types, so a rule can never be
 * enforced on one path and forgotten on another.
 *
 * Rules, applied in this order — the first failure names the reason:
 *
 * 1. `not-absolute` — a relative input (after `~` expansion) is a
 *    misconfiguration, not a path to guess at.
 * 2. `missing` — the directory does not exist.
 * 3. `not-a-directory` — it exists but is not a directory.
 * 4. `equals-primary` — the canonical candidate IS the session's workspace
 *    root, which is already granted by the upstream policy.
 * 5. `primary-overlap` — the candidate lies under the workspace root, or
 *    contains it. The union grants nothing new, and the displayed list would
 *    stop matching the enforced root set.
 * 6. `duplicate` — another registered root canonicalizes to the same path.
 * 7. `nested` — the candidate lies under a registered root, or contains one.
 *    Same reasoning as rule 5, applied to the additional roots.
 *
 * The stored side of the same rules lives in {@link classifyStoredRoots}, which
 * must never throw: a registration that stopped being usable is REPORTED, not
 * deleted, so the operator can see it and remove it deliberately.
 *
 * @module dsh-plugin-multi-root-workspace/roots
 */
/**
 * Stable identity of one registered additional root. A generated uuid, never
 * the path: a path is re-canonicalized on every read and a display alias may
 * change, while a reference anchor must stay put. The brand is local to this
 * package — it is a compile-time distinction only and has no runtime form.
 */
export type AdditionalRootId = string & {
    readonly __multiRootAdditionalRootId: 'AdditionalRootId';
};
/**
 * Brand one generated uuid as an {@link AdditionalRootId}.
 * @param value - the raw uuid.
 * @returns the branded id.
 */
export declare function additionalRootId(value: string): AdditionalRootId;
/** One registered additional root exactly as it is persisted. */
export interface RegisteredRoot {
    /** Stable registry identity. */
    readonly id: AdditionalRootId;
    /** Canonical absolute directory (the `realpath` captured at registration). */
    readonly path: string;
    /**
     * The canonical directory this registration was GRANTED for: the `realpath`
     * observed when the operator registered it (or the last time the operator
     * restored it). Authorization is `canonicalPath(path) === recordedPath` — a
     * root whose current resolution moved somewhere else is reported as
     * `redirected` and withheld, never silently granted elsewhere.
     */
    readonly recordedPath?: string;
    /** Optional display alias; absent when the operator cleared it. */
    readonly alias?: string;
    /** ISO-8601 instant of registration. */
    readonly addedAt: string;
}
/**
 * How one stored record currently stands.
 *
 * - `available` — the directory is there, resolves to the recorded canonical
 *   directory, and is granted.
 * - `missing` — the directory is not there right now; kept, withheld.
 * - `redirected` — the path no longer resolves to the directory it was
 *   registered for (it was replaced by a symlink, or a symlink in the chain
 *   changed); kept, withheld, and `recheck` restores it once the original
 *   directory is back.
 * - `invalid` — the record violates a rule and can only be removed.
 */
export type RootState = 'available' | 'missing' | 'redirected' | 'invalid';
/** One registered root as the surfaces report it. */
export interface RootStatus extends RegisteredRoot {
    /** Whether the root is granted right now, withheld, or unusable. */
    readonly state: RootState;
    /** Why the root is not `available`; absent otherwise. */
    readonly detail?: string;
    /**
     * Where the entry comes from: absent for a record the store holds, `'common'`
     * for one synthesized from the plugin's `commonRoots` configuration.
     *
     * A common entry is granted to EVERY primary root (that is what makes a
     * machine-wide directory available without registering it per project), it
     * never appears in the store, and it cannot be mutated: it disappears only
     * when the configuration changes.
     */
    readonly source?: 'common';
}
/** One status together with the 1-based ordinal the surfaces accept for it. */
export interface IndexedRootStatus {
    /** The 1-based position in the registration list. */
    readonly ordinal: number;
    /** The record at that position. */
    readonly status: RootStatus;
}
/** How a caller names one registered root, including a verified surface snapshot. */
export type RootRef = {
    readonly kind: 'id';
    readonly id: string;
} | {
    readonly kind: 'path';
    readonly path: string;
} | {
    readonly kind: 'ordinal';
    readonly ordinal: number;
} | {
    readonly kind: 'entry';
    readonly ordinal: number;
    readonly id: string;
    readonly path: string;
    readonly addedAt: string;
};
/** Every way root handling can fail, as a stable code the surfaces localize. */
export type RootValidationCode = 'not-absolute' | 'missing' | 'not-a-directory' | 'equals-primary' | 'primary-overlap' | 'duplicate' | 'nested' | 'invalid-alias' | 'not-found' | 'invalid-ref' | 'common-root' | 'storage-unavailable' | 'registry-contended' | 'reveal-unavailable' | 'session-not-found';
/** A rejected root operation; `code` is the stable contract, `message` the fallback prose. */
export declare class RootValidationError extends Error {
    readonly code: RootValidationCode;
    readonly detail?: {
        readonly conflict?: string;
        readonly reference?: string;
    } | undefined;
    /**
     * @param code - stable failure code.
     * @param message - human-readable fallback text (English; the panel localizes by code).
     * @param detail - structured context, e.g. the conflicting root.
     */
    constructor(code: RootValidationCode, message: string, detail?: {
        readonly conflict?: string;
        readonly reference?: string;
    } | undefined);
}
/**
 * Expand the one shell shorthand an operator may reasonably type, and nothing
 * else: a leading `~` (alone or as `~/…`). Every other relative spelling is
 * left intact so validation can reject it as `not-absolute` instead of
 * silently resolving it against some unrelated process cwd.
 * @param raw - the raw operator input.
 * @param home - the home directory to expand against; defaults to `os.homedir()`.
 * @returns the expanded path (still unvalidated).
 */
export declare function expandRootInput(raw: string, home?: string): string;
/**
 * Whether two ALREADY canonical paths name the same directory on this platform.
 *
 * Exported for the callers that must dedup one root list against another without
 * re-resolving anything (the registry's configured common roots against the
 * registrations of one workspace): comparing the raw strings would be wrong on a
 * case-insensitive filesystem, and re-canonicalizing there would be work the
 * comparison neither needs nor owns.
 * @param left - one canonical path.
 * @param right - the other canonical path.
 * @returns whether both name the same directory.
 */
export declare function sameCanonicalPath(left: string, right: string): boolean;
/**
 * Whether `candidate` is `root` itself or lies beneath it. Both sides must
 * already be canonical: symlinks are resolved by then, so the lexical test is
 * exact for the alias cases (8.3 names, casing) the fence handles separately.
 * @param candidate - canonical path to test.
 * @param root - canonical root to test against.
 * @returns whether the candidate is contained by the root.
 */
export declare function isCanonicallyUnder(candidate: string, root: string): boolean;
/**
 * Canonicalize a directory path the way the enforcement layers do (`realpath`),
 * leaving an unreachable path untouched so the caller can report it as missing.
 * @param path - the path to canonicalize.
 * @returns the canonical path.
 */
export declare function canonicalRoot(path: string): string;
/** Caller-supplied facts one candidate is judged against. */
export interface RootCandidateContext {
    /** The session's workspace root; the candidate may not equal or overlap it. */
    readonly primaryRoot: string;
    /**
     * The home directory a leading `~` expands against. Defaults to `os.homedir()`;
     * a caller that knows which home it means (a test, a probe) may say so instead
     * of depending on where the host's home directory happens to sit.
     */
    readonly home?: string;
    /**
     * Canonical paths already granted. Missing and invalid registrations are
     * deliberately excluded: a withheld root grants nothing, so a candidate may
     * legitimately sit under it, and an unusable record must not block a store
     * the operator is trying to make work again.
     */
    readonly existing: readonly string[];
}
/**
 * Judge one candidate root and return its canonical spelling.
 * @param raw - the raw operator input (a path, possibly `~`-prefixed).
 * @param context - the primary root and the currently granted roots.
 * @returns the canonical path the caller must store (and record as `recordedPath`).
 * @throws {RootValidationError} with the first rule that failed.
 */
export declare function validateRootCandidate(raw: string, context: RootCandidateContext): string;
/**
 * Re-judge every stored record of one primary root — the startup and refresh
 * path, which must never throw: a registration that stopped being usable is
 * REPORTED, not deleted, so the operator can see it and remove it deliberately.
 *
 * Existence and reachability are the only rules a record may recover from on
 * its own, hence `missing` and `redirected` (kept, withheld) rather than
 * `invalid` (kept, unusable).
 * @param primaryRoot - the session workspace root the records belong to.
 * @param records - the stored records, in registry order.
 * @returns one status per record, in the same order.
 */
export declare function classifyStoredRoots(primaryRoot: string, records: readonly RegisteredRoot[]): RootStatus[];
/**
 * The canonical roots a status list grants, in registry order.
 * @param statuses - the statuses to project.
 * @returns the canonical paths of every `available` root.
 */
export declare function availableRoots(statuses: readonly RootStatus[]): string[];
/**
 * Pair every status with the 1-based ordinal the surfaces accept for it. The
 * ordinal belongs to the POSITION, so it stays correct even for records whose
 * id is duplicated or missing — which is exactly the case where a positional
 * removal is the only unambiguous way to delete one of them.
 * @param statuses - the statuses to index.
 * @returns one entry per status, in the same order.
 */
export declare function indexedStatuses(statuses: readonly RootStatus[]): IndexedRootStatus[];
/**
 * Resolve one operator-supplied reference against a status list.
 * @param statuses - the statuses to search, in registry order.
 * @param ref - the reference to resolve.
 * @returns the matched status.
 * @throws {RootValidationError} `not-found` when nothing matches.
 */
export declare function resolveRootRef(statuses: readonly RootStatus[], ref: RootRef): RootStatus;
/**
 * Resolve one reference to its exact position.
 *
 * Id/path references are accepted only when unique. An `entry` reference also
 * verifies the row identity captured by the surface, so a concurrent reorder
 * cannot turn a click into an operation on a different record.
 */
export declare function resolveRootIndex(statuses: readonly RootStatus[], ref: RootRef): number;
/** Capture a list row as a mutation-safe reference. */
export declare function entryRootRef(status: RootStatus, ordinal: number): RootRef;
/**
 * Remove exactly ONE record — the one the reference names — from a status list.
 *
 * Removing by id is rejected when it is ambiguous. Exact entry or ordinal
 * references address one record, so a duplicate-id pair can be cleaned up one
 * entry at a time without turning one operation into several.
 * @param statuses - the statuses to remove from.
 * @param ref - which record to remove.
 * @returns a new list without that record, order preserved.
 * @throws {RootValidationError} `not-found` when the reference matches nothing.
 */
export declare function removeStatusAt(statuses: readonly RootStatus[], ref: RootRef): RootStatus[];
