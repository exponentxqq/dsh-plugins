/**
 * `MultiRootRegistry`: the durable answer to "which directories are extra
 * writable roots of this workspace".
 *
 * It is the M3 data source the M2 providers were already written against: the
 * registry owns the records, validates every mutation, re-validates everything
 * it reads back, and feeds the ONE place enforcement resolves from
 * (`ctx.multiRootScope`). Neither provider learns that a registry exists —
 * `setAdditionalRoots()` stays the scope's only write port.
 *
 * Five deliberate properties:
 *
 * - **Only usable roots are granted.** A registered directory that is absent
 *   right now stays registered and is reported as `missing`, but is withheld
 *   from the scope: handing a nonexistent root to bwrap or Landlock would fail
 *   the confined command instead of merely not granting it. A registration
 *   whose path now resolves to a DIFFERENT directory is `redirected` and is
 *   withheld for the same reason it was never granted: re-resolving a path is
 *   not re-authorizing it (see `src/scope.ts`).
 * - **Nothing is deleted on the operator's behalf.** A record that violates a
 *   rule is reported as `invalid` and excluded from the scope; it disappears
 *   only when the operator removes it (or when the store is repaired). Storage
 *   that cannot be parsed at all is backed up and skipped by the domain layer,
 *   with a warning.
 * - **Mutations are serialized per primary root.** Every mutation runs its
 *   whole read → validate → persist sequence inside one queue per key. The
 *   storage domain serializes individual `put()`/`delete()` calls, which is not
 *   enough: two concurrent `add()` calls would both read the same snapshot and
 *   the later write would drop the earlier one, and a removal racing an add
 *   could write a deleted record back.
 * - **Reads re-check, but never write.** {@link MultiRootRegistry.refresh} is
 *   the one revalidation entry point the command and the panel both call: it
 *   re-stats and re-canonicalizes every record, republishes the scope, and
 *   leaves storage untouched — a read must not rewrite the store, and a
 *   read-only refresh must not resurrect anything.
 * - **One process is the Registry Authority.** The JSON backend is
 *   memory-authoritative after open, so two DSH processes sharing a storage
 *   root cannot each keep a live domain snapshot. A store-wide kernel lease
 *   (ADR-0007) elects one authority; a contended process publishes an empty
 *   scope, rejects mutations, and retries the lease from {@link MultiRootRegistry.refresh}.
 * - **Configured common roots are granted, not stored.** {@link Config.commonRoots}
 *   names directories every workspace gets (a machine-wide cache, say). While this
 *   process is the authority they are published into the scope as its common roots
 *   (`setCommonRoots` in `src/scope.ts`) and withdrawn when it is not; they never
 *   appear in the store, and no surface can mutate one — the grant lives and dies
 *   with the configuration. They are appended to the READ surfaces' lists after
 *   the registrations, so an existing ordinal never moves.
 *
 * @module dsh-plugin-multi-root-workspace/registry
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox';
import { z } from 'zod';
import { type AdditionalRootId, type RegisteredRoot, type RootRef, type RootStatus } from './roots.ts';
/** The domain name; also the store file stem (`$DSH_HOME/storages/<name>.json`). */
export declare const DOMAIN_NAME = "multi_root_workspace";
/** The single table name inside the domain. */
export declare const TABLE_NAME = "roots";
/** Longest accepted display alias. */
export declare const MAX_ALIAS_LENGTH = 120;
/**
 * The prefix of a synthesized id for a configured common root
 * (`common:<canonical path>`). It is stable across restarts because it is
 * derived from the path, and it can never collide with a stored uuid.
 */
export declare const COMMON_ROOT_ID_PREFIX = "common:";
/**
 * Operator-facing English for a contended lease. Host-side commands have no
 * locale; the panel also shows this string verbatim via `RootsView.unavailable`.
 */
export declare const REGISTRY_CONTENDED_MESSAGE = "the root registry is owned by another DSH process; additional roots are not granted here. Close the other process, then retry.";
/**
 * Whether this process is the Registry Authority for the store-wide domain
 * medium. Contended and storage-failed are both fail-closed: the scope stays
 * empty and mutations reject.
 */
export type RegistryAuthorityState = {
    readonly kind: 'active';
} | {
    readonly kind: 'contended';
} | {
    readonly kind: 'storage-failed';
    readonly reason: string;
};
/**
 * Plugin configuration for the registry row. `leasePath` must sit beside the
 * JSON backend's domain document; the patch default is
 * `$DSH_HOME/storages/multi_root_workspace.lock`. A custom `storage-json.root`
 * must override this in lockstep (ADR-0007).
 */
export interface Config {
    /** Absolute path of the store-wide kernel lock file. */
    readonly leasePath?: string;
    /**
     * Directories registered as additional roots the first time this store sees
     * one of {@link Config.seedPrimaryRoots}. A leading `~` expands against the
     * host home directory, exactly as it does in `add`.
     */
    readonly seedRoots?: readonly string[];
    /**
     * The primary roots the seed list applies to (any spelling; canonicalized on
     * use). Empty — the default — disables seeding, so an install that does not
     * configure it behaves exactly as before.
     *
     * A pass that leaves no candidate unsatisfied — every directory registered, or
     * already granted by {@link Config.commonRoots} — is recorded in the
     * store-scoped ledger beside the domain document (see
     * docs/reference/additional-root-seeding.md); removing a seeded root is then
     * permanent, and deleting the ledger entry is what asks for a re-seed. A pass
     * that skipped a candidate is not recorded and is retried at the next start.
     */
    readonly seedPrimaryRoots?: readonly string[];
    /**
     * Directories granted as additional roots to EVERY primary root, not only to
     * the ones named in {@link Config.seedPrimaryRoots}. A leading `~` expands
     * against the host home directory, exactly as it does in `add`.
     *
     * This is the configuration-shaped half of the feature, and it differs from
     * seeding in every property that matters operationally:
     *
     * - It applies to a primary root the store has NEVER seen: no ledger, no
     *   first-use pass, no restart — a new project gets these roots because they
     *   are configured, not because something registered them.
     * - It is never written to the store. The list IS the grant: deleting an entry
     *   revokes the root at the next start, and no panel action can remove one
     *   (they answer `common-root` instead).
     * - A directory that is absent right now is kept and reported `missing`
     *   rather than dropped, and it is granted again as soon as it exists — the
     *   scope re-checks the filesystem on every resolution.
     *
     * Empty — the default — grants nothing extra and changes no existing
     * behaviour. See docs/reference/common-additional-roots.md.
     */
    readonly commonRoots?: readonly string[];
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        multiRootRegistry: MultiRootRegistry;
    }
}
/**
 * One primary root's whole registration list. The domain's `single` layout
 * stores the entire unit as one document, so keys stay opaque strings — which
 * is exactly what lets the canonical primary root itself be the key.
 */
declare const persistedPrimaryRoot: z.ZodObject<{
    roots: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        path: z.ZodString;
        recordedPath: z.ZodOptional<z.ZodString>;
        alias: z.ZodOptional<z.ZodString>;
        addedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** Stored shape of one primary root's records. */
export type PersistedPrimaryRoot = z.infer<typeof persistedPrimaryRoot>;
/**
 * The domain declaration: version 1, `single` layout, one `roots` table keyed
 * by the canonical primary root. Records that fail validation are backed up and
 * skipped rather than blocking the whole harness from starting (see
 * docs/decisions/ADR-0004).
 */
export declare const multiRootDomainSpec: {
    name: string;
    version: number;
    invalidRecords: "backup-and-skip";
    tables: {
        roots: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, {
            roots: {
                id: string;
                path: string;
                addedAt: string;
                recordedPath?: string | undefined;
                alias?: string | undefined;
            }[];
        }>;
    };
};
/** Registration request for one new additional root. */
export interface AddRootInput {
    /** The directory, as typed by the operator (a leading `~` is expanded). */
    readonly path: string;
    /** Optional display alias. */
    readonly alias?: string;
}
/** The registry service: `ctx.multiRootRegistry`. */
export declare class MultiRootRegistry extends Service {
    static inject: string[];
    /** Absolute lock path; absent means the row was composed without `leasePath`. */
    private readonly leasePath;
    /** Whether this process currently owns the store. */
    private authorityState;
    /** Held kernel lease; present once acquire succeeded, including after a failed open. */
    private lease;
    /** Open domain handle; present only while {@link authority} is `active`. */
    private domain;
    /** The open table; present once this process is the authority. */
    private table;
    /** Last classified status list per canonical primary root. */
    private readonly cache;
    /** Signature of the last published grant per key, so a no-op refresh stays a no-op. */
    private readonly published;
    /** One promise chain per canonical primary root: mutations never interleave. */
    private readonly chains;
    /** Store-wide queue for lease acquire / open / release. */
    private authorityChain;
    /** Change listeners, keyed by their own disposer identity. */
    private readonly listeners;
    /** True after a contended-lease warning has been emitted, so refresh does not spam. */
    private loggedContended;
    /** True once the fiber disposer has run: no further acquisition may happen. */
    private disposed;
    /** Directories seeded on first use of a primary root; empty disables seeding. */
    private readonly seedRoots;
    /** Primary roots the seed list applies to; empty disables seeding. */
    private readonly seedPrimaryRoots;
    /** Directories granted to every primary root; empty disables common roots. */
    private readonly commonRoots;
    /**
     * The common roots as published: resolved once per authority, so the recorded
     * grant is what the path was captured as — a path that later resolves
     * elsewhere is withheld instead of silently granting its new target.
     */
    private commonEntries;
    /** The instant the current common entries were captured; their synthesized `addedAt`. */
    private commonAddedAt;
    /** Common-root spellings already reported as unusable, so a warning is not repeated. */
    private readonly warnedCommon;
    /**
     * @param ctx - the host context; `storageDomain` and `multiRootScope` are injected.
     * @param config - the patch row's `leasePath`, plus the optional seed and common lists.
     */
    constructor(ctx: Context, config?: Config);
    /**
     * Become the Registry Authority if possible: acquire the store-wide lease,
     * then open the domain and publish every stored root into the scope.
     *
     * A contended lease is fail-closed rather than a stale open: this process
     * grants nothing and every mutation reports `registry-contended`. A store
     * this build cannot read is reported loudly and also grants nothing. Neither
     * case fails activation — a broken or contended side store must not keep the
     * whole harness from starting. {@link MultiRootRegistry.refresh} retries.
     */
    protected [Service.init](): Promise<void>;
    /**
     * Resolve {@link Config.commonRoots} and publish them as the scope's common
     * roots: the directories every primary root gets, whether or not the store has
     * ever seen that primary root.
     *
     * It runs at every authority transition — acquisition (from `openDomain`) and
     * teardown (from `withdrawPublished`) — and each capture re-reads the
     * configured spellings, because a directory that was absent at one transition
     * may exist at the next. What is deliberately NOT re-read on every scope
     * resolution is the grant itself: `recordedPath` is fixed here, so a path
     * replaced by a symlink afterwards is withheld by the sanitizer (re-resolving
     * a path is not re-authorizing it), while a directory that merely appears or
     * disappears is picked up without a restart.
     *
     * A missing directory is KEPT, not dropped: dropping it would silently forget
     * the configuration, and the sanitizer already reports and withholds it.
     */
    private pushCommonRoots;
    /** Warn once per configured spelling, so a bad entry is reported without repeating at every transition. */
    private warnCommonOnce;
    /**
     * Register {@link Config.seedRoots} for every {@link Config.seedPrimaryRoots}
     * entry that has no registration stored yet.
     *
     * This is a convenience for a fresh store (or a primary root used for the
     * first time): each configured directory goes through
     * {@link MultiRootRegistry.add}, so every rule still applies and a seed that
     * is missing, overlapping, or already registered is reported and skipped
     * instead of being smuggled past validation.
     *
     * It runs once, at activation, and is deliberately NOT part of
     * {@link MultiRootRegistry.refresh}: refresh is the read-only revalidation
     * path that `list` and the panel share, and it must never write storage.
     *
     * Seeding is per primary root, and a pass that left no candidate unsatisfied
     * is one-shot: that state lives in a store-scoped ledger BESIDE the domain
     * document — not in the domain itself.
     * The domain cannot carry it: removing the last root deletes the record
     * outright, so "already seeded" and "seeded, then emptied on purpose" would be
     * indistinguishable and a removed root would come back at the next start.
     * @returns the configured spellings that were registered.
     */
    seedConfiguredRoots(): Promise<readonly string[]>;
    /**
     * The store-scoped seed ledger: the lease path with its `.lock` suffix
     * replaced, so the ledger sits beside the domain document it belongs to
     * (`…/multi_root_workspace.seeded.json`).
     * @returns the ledger path, or undefined when no lease path is configured.
     */
    private seedLedgerPath;
    /**
     * Why the registry is not granting, when it is not. Surfaces show this
     * instead of a silently empty list, so an operator can tell "no roots
     * configured" from "another DSH process owns the store" or "the file could
     * not be read".
     * @returns the recorded failure text, or `undefined` while this process is the authority.
     */
    get unavailable(): string | undefined;
    /**
     * Whether this process is the Registry Authority for the store-wide medium.
     * Tests and diagnostics read this; surfaces use {@link unavailable}.
     */
    get authority(): RegistryAuthorityState;
    /**
     * Every registration of one primary root, in registry order, as last
     * classified, followed by the configured common roots (see
     * {@link MultiRootRegistry.withCommon}). A READ: it re-`stat`s the common
     * roots (their state is not cached anywhere) and never writes. Surfaces
     * that must re-check the directories first call
     * {@link MultiRootRegistry.refresh}.
     * @param primaryRoot - the session workspace root (any spelling).
     * @returns the statuses; empty when nothing is registered and nothing is configured.
     */
    list(primaryRoot: string): readonly RootStatus[];
    /**
     * Re-examine every registration of one primary root WITHOUT writing storage:
     * re-`stat` every directory, re-resolve every path against its recorded
     * directory, re-judge every rule, then republish the scope and notify
     * listeners.
     *
     * This is the one revalidation entry point the command (`/workspace-folders
     * list`) and the panel (`list` endpoint) both call, so "what the list shows"
     * and "what is granted" cannot drift: a directory deleted after registration
     * becomes `missing` and loses its grant, and a directory that came back is
     * granted again — without either surface asking for a restart.
     *
     * The serialized queue is shared with the mutations, so a refresh never
     * interleaves with a write that is mid-flight.
     *
     * Refresh is also the takeover path: it calls {@link MultiRootRegistry.ensureAuthority}
     * first, so a process that started contended can become the authority after
     * the previous holder exits, re-open the domain from disk, and publish the
     * last durable state — without a restart.
     * @param primaryRoot - the session workspace root to re-check.
     * @returns the refreshed status list, common roots included.
     */
    refresh(primaryRoot: string): Promise<readonly RootStatus[]>;
    /**
     * Registers one additional root.
     * @param primaryRoot - the session workspace root the root belongs to.
     * @param input - the directory and optional alias.
     * @returns the updated status list.
     * @throws {RootValidationError} when the candidate violates a root rule.
     */
    add(primaryRoot: string, input: AddRootInput): Promise<readonly RootStatus[]>;
    /**
     * Remove one registration.
     * @param primaryRoot - the session workspace root the root belongs to.
     * @param ref - which registered root to remove.
     * @returns the updated status list.
     * @throws {RootValidationError} `not-found` when the reference matches nothing.
     */
    remove(primaryRoot: string, ref: RootRef): Promise<readonly RootStatus[]>;
    /**
     * Remove exactly one registration — the one the reference names.
     *
     * Unlike a filter by id, this removes a single record, so a store holding two
     * records that share an id can be cleaned up one entry at a time instead of
     * losing both to one click.
     * @param primaryRoot - the session workspace root the root belongs to.
     * @param ref - which registered root to remove.
     * @returns the updated status list.
     * @throws {RootValidationError} `not-found` when the reference matches nothing.
     */
    removeAt(primaryRoot: string, ref: RootRef): Promise<readonly RootStatus[]>;
    /**
     * Set or clear one registration's display alias.
     * @param primaryRoot - the session workspace root the root belongs to.
     * @param ref - which registered root to rename.
     * @param alias - the new alias; empty or absent clears it.
     * @returns the updated status list.
     * @throws {RootValidationError} `not-found`/`invalid-alias`.
     */
    setAlias(primaryRoot: string, ref: RootRef, alias: string | undefined): Promise<readonly RootStatus[]>;
    /**
     * Move one registration within the display order.
     * @param primaryRoot - the session workspace root the root belongs to.
     * @param ref - which registered root to move.
     * @param beforeRef - the anchor to move in front of; absent moves it to the end.
     * @returns the updated status list.
     * @throws {RootValidationError} `not-found` when either reference matches nothing.
     */
    move(primaryRoot: string, ref: RootRef, beforeRef?: RootRef): Promise<readonly RootStatus[]>;
    /**
     * Re-examine every registration of one primary root and persist what the
     * re-examination produced — {@link MultiRootRegistry.refresh} plus one durable
     * write. The recovery path after a directory was restored by hand, and the
     * only read-shaped operation that is allowed to touch the store.
     * @param primaryRoot - the session workspace root to re-check.
     * @returns the refreshed status list.
     */
    recheck(primaryRoot: string): Promise<readonly RootStatus[]>;
    /**
     * Observe registry changes.
     * @param listener - called with the canonical primary root after each durable change.
     * @returns the disposer that stops observing.
     */
    onChange(listener: (primaryRoot: string) => void): () => void;
    /**
     * The scope the registry publishes: only usable roots, in registry order.
     * @param primaryRoot - the session workspace root (any spelling).
     * @returns the canonical paths of every `available` root.
     */
    granted(primaryRoot: string): readonly string[];
    /**
     * The scope the registry publishes: only usable roots, in registry order.
     * @param policy - the per-call policy; its workspace root is the primary root.
     * @returns the granted canonical roots.
     */
    grantedFor(policy: SandboxExecutionPolicy): readonly string[];
    /** Classify one stored record set and cache it. */
    private accept;
    /**
     * The statuses of one key, from memory where possible: the cache, else what
     * storage holds, else empty. A cached answer is never re-checked here — that
     * is {@link MultiRootRegistry.reclassify}, which the read surfaces and
     * {@link MultiRootRegistry.refresh} call deliberately.
     */
    private statusesOf;
    /**
     * The stored record set of one key, or `undefined` when there is none (or
     * when the store itself could not be read: an unusable store reads as
     * "nothing registered" so reads stay answerable and the surfaces can explain
     * the situation, while every write fails loudly in `requireTable()`).
     */
    private lookupRecords;
    /**
     * Re-classify one key from its stored records: every directory is `stat`ed
     * again and every path is resolved again against its recorded canonical
     * directory. Updates the cache, republishes the scope, and returns the new
     * list — the shared body of the read-path re-checks.
     */
    private reclassify;
    /**
     * Persist one status list, then republish it into the scope and to listeners.
     * The durable write happens first: a failed write must not leave the running
     * scope granting something storage does not hold.
     */
    private persist;
    /**
     * Run one job for one primary root after every job already queued for that
     * root. The whole read → validate → write sequence belongs inside the job:
     * the storage domain serializes individual writes, so without this the loser
     * of a race reads a snapshot that is already stale and writes it back.
     */
    private serialize;
    /**
     * Push one status list into the scope and notify listeners.
     *
     * What is published is the effective GRANT — only `available` roots, so a
     * withheld registration can never reach a provider. When the grant and the
     * withheld set are unchanged (the common case for a read-path refresh on a
     * healthy workspace) the scope is left alone and no listener fires: a refresh
     * exists to keep the two in sync, not to churn on every listing — and, since
     * the scope rebuilds its root table on each call, skipping the no-op write is
     * also what keeps the read path cheap.
     */
    private publish;
    /**
     * The configured common roots as statuses for one primary root, in
     * configuration order — the read-side projection of the list the scope grants.
     *
     * It is not a second source of truth: every directory is `stat`ed again and
     * every path is resolved again against the directory captured at publish time,
     * which are exactly the checks {@link sanitizeAdditionalRoots} applies, so what
     * the surfaces show and what the providers enforce cannot drift.
     * @param key - the canonical primary root the statuses are projected for.
     * @returns one status per configured entry, never reordered.
     */
    private commonStatusesFor;
    /**
     * A stored status list followed by the common roots this process is granting.
     *
     * Registrations come first and unchanged, so every ordinal a surface already
     * handed out keeps naming the same registration. A common root whose canonical
     * directory an AVAILABLE registration already grants is dropped rather than
     * repeated: the scope's sanitizer dedups in this same order, so the list still
     * shows exactly the enforced set. A common root the store holds a WITHHELD
     * registration for is kept — the configuration is what grants it then.
     */
    private withCommon;
    /**
     * The canonical directories the configuration grants to one primary root right
     * now: what `add` must treat as already granted, and what a duplicate has to
     * name as its conflict.
     */
    private commonGrantedFor;
    /**
     * Reject a mutation that only a configured common root can satisfy.
     *
     * The stored registrations are tried FIRST, so a reference naming a real
     * registration keeps working even while a common root happens to duplicate it:
     * a rename or a removal of a stored root is never mistaken for a configuration
     * edit. Only when nothing stored matches is the merged list consulted, to
     * answer with the code that says where the fix actually is — the plugin
     * configuration, not this panel.
     * @param key - the canonical primary root.
     * @param ref - the reference the operator sent.
     * @throws {RootValidationError} `common-root` when the reference names a configured root;
     *   `not-found`/`invalid-ref` when it names nothing, or several rows.
     */
    private rejectCommonRef;
    /**
     * Resolve a `move` anchor within the stored rows, mapping an anchor that names
     * a COMMON root onto "the end" (`undefined`).
     *
     * The panel derives a move anchor from the row it renders below the target, and
     * the common roots are part of that list: an anchor pointing at one asks for
     * the target to go after every registration — which is what no anchor means.
     * Reporting `not-found` there would make the last registration impossible to
     * move down while a common root exists.
     * @param key - the canonical primary root.
     * @param statuses - the stored statuses of that key.
     * @param beforeRef - the anchor the caller sent.
     * @returns the stored position to move in front of, or `undefined` for the end.
     * @throws {RootValidationError} `not-found`/`invalid-ref` when the anchor names nothing, or several rows.
     */
    private storedAnchorIndex;
    /**
     * The open table.
     * @returns the live table.
     * @throws {RootValidationError} `registry-contended` when another DSH process
     *   owns the store, `storage-unavailable` when the store could not be opened,
     *   or an error when the service has not started.
     */
    private requireTable;
    /**
     * Reject mutations unless this process is the Registry Authority.
     * Called before path validation so a contended process never mis-reports
     * `missing` / `not-absolute` for a directory it is not allowed to register.
     */
    private requireActive;
    /**
     * Acquire the store-wide lease if this process does not already hold it, then
     * open the domain from disk. Idempotent while active. A contended process
     * retries here (the command `list` and the panel Retry button both call
     * {@link MultiRootRegistry.refresh}).
     */
    private ensureAuthority;
    /**
     * Open the domain under an already-held lease and publish every stored root.
     * On failure the lease is kept so a later refresh can retry the open without
     * letting a second process grant from a stale snapshot.
     */
    private openDomain;
    /** Fail closed: empty scope, no table, contended state. */
    private enterContended;
    /** Fail closed: empty scope, no table, storage-failed state. The lease, if held, stays. */
    private enterStorageFailed;
    /** Drop every grant this process has published. Idempotent. */
    private withdrawPublished;
    /**
     * Drain every queued mutation, close the domain, then release the kernel
     * lease — in that order, and inside the authority-transition queue.
     *
     * The order is the invariant, not a detail. The lease is what makes "the
     * store is mine" true, so it must outlive every write this process will ever
     * make, including the queued writes `close()` itself drains: a successor that
     * acquired the lease and opened the medium in the window between a release
     * and a `put()` would read a snapshot missing that mutation. Running the
     * whole teardown through {@link MultiRootRegistry.serializeAuthority} is the
     * other half: a `refresh()` that is mid-flight when the fiber disposes must
     * not finish by opening a domain and a lease that nothing will ever close.
     */
    private releaseAuthority;
    /**
     * Wait until no per-primary-root mutation is queued or running.
     *
     * One pass is enough, and only because the authority state has already been
     * flipped: no further mutation can be admitted (it would fail in
     * `requireTable()`), and every mutation admitted earlier put its own tail in
     * `chains` before it ran.
     */
    private drainMutations;
    /**
     * Run one authority-transition job after every job already queued. Acquire,
     * open, and release never interleave with each other.
     */
    private serializeAuthority;
}
export type { AdditionalRootId, RegisteredRoot, RootRef, RootStatus };
export default MultiRootRegistry;
