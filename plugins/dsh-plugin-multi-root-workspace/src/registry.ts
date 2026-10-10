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

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type {} from './compat.ts'
import { RegistryAuthorityLease, RegistryLeaseContendedError } from './registry-lease.ts'
import {
  additionalRootId,
  availableRoots,
  canonicalRoot,
  classifyStoredRoots,
  expandRootInput,
  removeStatusAt,
  resolveRootIndex,
  RootValidationError,
  sameCanonicalPath,
  validateRootCandidate,
  type AdditionalRootId,
  type RegisteredRoot,
  type RootRef,
  type RootStatus,
} from './roots.ts'
// Type-only: publishes the `ctx.multiRootScope` augmentation. The scope service
// is injected, never constructed here.
import type { AdditionalWorkspaceRoot } from './scope.ts'

/** The domain name; also the store file stem (`$DSH_HOME/storages/<name>.json`). */
export const DOMAIN_NAME = 'multi_root_workspace'
/** The single table name inside the domain. */
export const TABLE_NAME = 'roots'
/** Longest accepted display alias. */
export const MAX_ALIAS_LENGTH = 120
/**
 * The prefix of a synthesized id for a configured common root
 * (`common:<canonical path>`). It is stable across restarts because it is
 * derived from the path, and it can never collide with a stored uuid.
 */
export const COMMON_ROOT_ID_PREFIX = 'common:'
/**
 * Operator-facing English for a contended lease. Host-side commands have no
 * locale; the panel also shows this string verbatim via `RootsView.unavailable`.
 */
export const REGISTRY_CONTENDED_MESSAGE
  = 'the root registry is owned by another DSH process; additional roots are not granted here. Close the other process, then retry.'

/**
 * Whether this process is the Registry Authority for the store-wide domain
 * medium. Contended and storage-failed are both fail-closed: the scope stays
 * empty and mutations reject.
 */
export type RegistryAuthorityState =
  | { readonly kind: 'active' }
  | { readonly kind: 'contended' }
  | { readonly kind: 'storage-failed'; readonly reason: string }

/**
 * Plugin configuration for the registry row. `leasePath` must sit beside the
 * JSON backend's domain document; the patch default is
 * `$DSH_HOME/storages/multi_root_workspace.lock`. A custom `storage-json.root`
 * must override this in lockstep (ADR-0007).
 */
export interface Config {
  /** Absolute path of the store-wide kernel lock file. */
  readonly leasePath?: string
  /**
   * Directories registered as additional roots the first time this store sees
   * one of {@link Config.seedPrimaryRoots}. A leading `~` expands against the
   * host home directory, exactly as it does in `add`.
   */
  readonly seedRoots?: readonly string[]
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
  readonly seedPrimaryRoots?: readonly string[]
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
  readonly commonRoots?: readonly string[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    multiRootRegistry: MultiRootRegistry
  }
}

/** One persisted root record. `zod` validates it at the durable boundary. */
const persistedRoot = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  // Absent only in records written before the field existed (or by hand). Such a
  // record is reported `invalid` rather than granted on a guess — see
  // classifyStoredRoots.
  recordedPath: z.string().min(1).optional(),
  alias: z.string().optional(),
  addedAt: z.string().min(1),
})

/**
 * One primary root's whole registration list. The domain's `single` layout
 * stores the entire unit as one document, so keys stay opaque strings — which
 * is exactly what lets the canonical primary root itself be the key.
 */
const persistedPrimaryRoot = z.object({ roots: z.array(persistedRoot) })

/** Stored shape of one primary root's records. */
export type PersistedPrimaryRoot = z.infer<typeof persistedPrimaryRoot>

/** Stored shape of one root record. */
type PersistedRoot = z.infer<typeof persistedRoot>

/**
 * The domain declaration: version 1, `single` layout, one `roots` table keyed
 * by the canonical primary root. Records that fail validation are backed up and
 * skipped rather than blocking the whole harness from starting (see
 * docs/decisions/ADR-0004).
 */
export const multiRootDomainSpec = defineDomain({
  name: DOMAIN_NAME,
  version: 1,
  invalidRecords: 'backup-and-skip',
  tables: { roots: domainTable<string, PersistedPrimaryRoot>(persistedPrimaryRoot) },
})

/** Registration request for one new additional root. */
export interface AddRootInput {
  /** The directory, as typed by the operator (a leading `~` is expanded). */
  readonly path: string
  /** Optional display alias. */
  readonly alias?: string
}

/** The registry service: `ctx.multiRootRegistry`. */
export class MultiRootRegistry extends Service {
  // `multiRootCompat` is the compatibility gate, not a collaborator: this
  // service is what decides which directories become writable roots, so it must
  // not run on a release the contract has not verified (see src/compat.ts).
  static inject = ['multiRootCompat', 'storageDomain', 'multiRootScope']

  /** Absolute lock path; absent means the row was composed without `leasePath`. */
  private readonly leasePath: string | undefined
  /** Whether this process currently owns the store. */
  private authorityState: RegistryAuthorityState = { kind: 'contended' }
  /** Held kernel lease; present once acquire succeeded, including after a failed open. */
  private lease: RegistryAuthorityLease | undefined
  /** Open domain handle; present only while {@link authority} is `active`. */
  private domain: { close(): Promise<void> } | undefined
  /** The open table; present once this process is the authority. */
  private table: KvTable<string, PersistedPrimaryRoot> | undefined
  /** Last classified status list per canonical primary root. */
  private readonly cache = new Map<string, readonly RootStatus[]>()
  /** Signature of the last published grant per key, so a no-op refresh stays a no-op. */
  private readonly published = new Map<string, string>()
  /** One promise chain per canonical primary root: mutations never interleave. */
  private readonly chains = new Map<string, Promise<unknown>>()
  /** Store-wide queue for lease acquire / open / release. */
  private authorityChain: Promise<unknown> = Promise.resolve()
  /** Change listeners, keyed by their own disposer identity. */
  private readonly listeners = new Set<(primaryRoot: string) => void>()
  /** True after a contended-lease warning has been emitted, so refresh does not spam. */
  private loggedContended = false
  /** True once the fiber disposer has run: no further acquisition may happen. */
  private disposed = false
  /** Directories seeded on first use of a primary root; empty disables seeding. */
  private readonly seedRoots: readonly string[]
  /** Primary roots the seed list applies to; empty disables seeding. */
  private readonly seedPrimaryRoots: readonly string[]
  /** Directories granted to every primary root; empty disables common roots. */
  private readonly commonRoots: readonly string[]
  /**
   * The common roots as published: resolved once per authority, so the recorded
   * grant is what the path was captured as — a path that later resolves
   * elsewhere is withheld instead of silently granting its new target.
   */
  private commonEntries: readonly CommonEntry[] = []
  /** The instant the current common entries were captured; their synthesized `addedAt`. */
  private commonAddedAt = ''
  /** Common-root spellings already reported as unusable, so a warning is not repeated. */
  private readonly warnedCommon = new Set<string>()

  /**
   * @param ctx - the host context; `storageDomain` and `multiRootScope` are injected.
   * @param config - the patch row's `leasePath`, plus the optional seed and common lists.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'multiRootRegistry')
    this.leasePath = config.leasePath
    this.seedRoots = config.seedRoots ?? []
    this.seedPrimaryRoots = config.seedPrimaryRoots ?? []
    this.commonRoots = config.commonRoots ?? []
  }

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
  protected async [Service.init](): Promise<void> {
    this.ctx.effect(() => () => this.releaseAuthority(), 'multi-root-registry: authority release')
    await this.ensureAuthority()
    await this.seedConfiguredRoots()
  }

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
  private pushCommonRoots(): void {
    if (this.commonRoots.length === 0 || this.authorityState.kind !== 'active') {
      // Fail closed, exactly like the registry itself: a process that is not the
      // Registry Authority grants nothing, and that promise covers the roots
      // configuration hands out just as it covers stored ones. An empty
      // configuration also clears the published list, so a restart without the
      // key does not keep granting what a previous run published.
      this.commonEntries = []
      this.commonAddedAt = ''
      this.ctx.multiRootScope.setCommonRoots([])
      return
    }
    const addedAt = new Date().toISOString()
    const entries: CommonEntry[] = []
    for (const raw of this.commonRoots) {
      const expanded = expandRootInput(raw)
      if (!isAbsolute(expanded)) {
        this.warnCommonOnce(raw, 'is not an absolute path; give an absolute directory or one starting with "~/"')
        continue
      }
      const canonical = canonicalRoot(expanded)
      if (!isDirectory(canonical)) {
        this.warnCommonOnce(
          raw,
          `"${expanded}" is not a directory right now; it is granted as soon as it exists`,
        )
      }
      entries.push({ raw, path: canonical, id: `${COMMON_ROOT_ID_PREFIX}${canonical}` })
    }
    this.commonEntries = entries
    this.commonAddedAt = addedAt
    // The scope speaks the same root shape as a registration, minus the
    // registration instant it has no use for (the read surfaces take it from
    // `commonAddedAt`, which the statuses synthesize).
    this.ctx.multiRootScope.setCommonRoots(entries.map((entry): AdditionalWorkspaceRoot => ({
      id: entry.id,
      path: entry.path,
      recordedPath: entry.path,
    })))
    if (entries.length > 0) {
      this.ctx.logger.info(
        `multi-root-registry: ${entries.length} common root(s) granted to every workspace (${entries.map(entry => entry.path).join(', ')})`,
      )
    }
  }

  /** Warn once per configured spelling, so a bad entry is reported without repeating at every transition. */
  private warnCommonOnce(raw: string, reason: string): void {
    if (this.warnedCommon.has(raw)) return
    this.warnedCommon.add(raw)
    this.ctx.logger.warn(`multi-root-registry: common root ${raw} ${reason}`)
  }

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
  async seedConfiguredRoots(): Promise<readonly string[]> {
    if (this.seedRoots.length === 0 || this.seedPrimaryRoots.length === 0) return []
    if (this.authorityState.kind !== 'active') {
      this.ctx.logger.warn(
        `multi-root-registry: seeding skipped (${this.authorityState.kind}); no additional root is granted here`,
      )
      return []
    }
    const ledgerFile = this.seedLedgerPath()
    if (ledgerFile === undefined) {
      this.ctx.logger.warn(
        'multi-root-registry: seeding skipped (no leasePath, so there is nowhere to record that this store was seeded)',
      )
      return []
    }
    const ledger = readSeedLedger(ledgerFile)
    const seeded: string[] = []
    for (const configured of this.seedPrimaryRoots) {
      const key = canonicalRoot(configured)
      if (!existsSync(key)) {
        this.ctx.logger.warn(`multi-root-registry: seed primary root ${key} is missing; skipped`)
        continue
      }
      // Two independent reasons to leave a primary root alone: it was registered
      // by hand before this store ever saw the seed list, or the seed pass
      // already ran for it (recorded in the ledger, so a deliberate removal is
      // not undone).
      if (this.lookupRecords(key) !== undefined || ledger.has(key)) continue
      // A candidate the commonRoots configuration already grants needs no record:
      // the directory is available for this workspace either way, and writing it
      // would only create the duplicate the read surfaces then have to dedup.
      const granted = this.commonGrantedFor(key)
      const alreadyGranted = (candidate: string): boolean => {
        const expanded = expandRootInput(candidate)
        if (!isAbsolute(expanded)) return false
        const canonical = canonicalRoot(expanded)
        return granted.some(path => sameCanonicalPath(path, canonical))
      }
      let registered = 0
      let satisfied = 0
      let skipped = 0
      for (const candidate of this.seedRoots) {
        if (alreadyGranted(candidate)) {
          satisfied += 1
          this.ctx.logger.info(
            `multi-root-registry: seed ${candidate} for ${key} is already granted by the commonRoots configuration`,
          )
          continue
        }
        try {
          await this.add(key, { path: candidate })
          registered += 1
          seeded.push(candidate)
          this.ctx.logger.info(`multi-root-registry: seeded ${candidate} for ${key}`)
        }
        catch (error) {
          skipped += 1
          const reason = error instanceof Error ? error.message : String(error)
          this.ctx.logger.warn(`multi-root-registry: seed ${candidate} for ${key} skipped: ${reason}`)
        }
      }
      // Recorded only by a pass that left no candidate unsatisfied: every
      // directory in the list is either registered now or already granted by the
      // configuration. A clean pass is what settles the primary root for good —
      // which is what makes removing a seeded root permanent. A pass that skipped
      // something stays unrecorded and is retried at the next start, because
      // sealing it would turn one mistyped path into a directory that can never
      // be seeded again; re-adding an already registered root is an idempotent
      // update, not a duplicate.
      if (skipped === 0 && registered + satisfied > 0) {
        ledger.add(key)
        writeSeedLedger(ledgerFile, ledger, this.ctx.logger)
      }
      else if (skipped > 0) {
        this.ctx.logger.warn(
          `multi-root-registry: ${skipped} of ${this.seedRoots.length} seeds skipped for ${key}; the pass stays unrecorded and is retried at the next start`,
        )
      }
    }
    return seeded
  }

  /**
   * The store-scoped seed ledger: the lease path with its `.lock` suffix
   * replaced, so the ledger sits beside the domain document it belongs to
   * (`…/multi_root_workspace.seeded.json`).
   * @returns the ledger path, or undefined when no lease path is configured.
   */
  private seedLedgerPath(): string | undefined {
    if (this.leasePath === undefined) return undefined
    const stem = this.leasePath.endsWith('.lock') ? this.leasePath.slice(0, -'.lock'.length) : this.leasePath
    return `${stem}.seeded.json`
  }

  /**
   * Why the registry is not granting, when it is not. Surfaces show this
   * instead of a silently empty list, so an operator can tell "no roots
   * configured" from "another DSH process owns the store" or "the file could
   * not be read".
   * @returns the recorded failure text, or `undefined` while this process is the authority.
   */
  get unavailable(): string | undefined {
    switch (this.authorityState.kind) {
      case 'active':
        return undefined
      case 'contended':
        return REGISTRY_CONTENDED_MESSAGE
      case 'storage-failed':
        return this.authorityState.reason
    }
  }

  /**
   * Whether this process is the Registry Authority for the store-wide medium.
   * Tests and diagnostics read this; surfaces use {@link unavailable}.
   */
  get authority(): RegistryAuthorityState {
    return this.authorityState
  }

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
  list(primaryRoot: string): readonly RootStatus[] {
    const key = canonicalRoot(primaryRoot)
    return this.withCommon(key, this.statusesOf(key))
  }

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
  async refresh(primaryRoot: string): Promise<readonly RootStatus[]> {
    await this.ensureAuthority()
    if (this.authorityState.kind !== 'active') return []
    const key = canonicalRoot(primaryRoot)
    const stored = await this.serialize(key, () => this.reclassify(key))
    return this.withCommon(key, stored)
  }

  /**
   * Registers one additional root.
   * @param primaryRoot - the session workspace root the root belongs to.
   * @param input - the directory and optional alias.
   * @returns the updated status list.
   * @throws {RootValidationError} when the candidate violates a root rule.
   */
  async add(primaryRoot: string, input: AddRootInput): Promise<readonly RootStatus[]> {
    await this.ensureAuthority()
    this.requireActive()
    const key = canonicalRoot(primaryRoot)
    return await this.serialize(key, async () => {
      const statuses = this.statusesOf(key)
      const common = this.commonGrantedFor(key)
      // A candidate the configuration already grants is refused with the message
      // that says where the fix is (`duplicate` would send the operator looking
      // for a registration that does not exist).
      const typed = expandRootInput(input.path)
      if (isAbsolute(typed)) {
        const candidate = canonicalRoot(typed)
        const conflict = common.find(path => sameCanonicalPath(path, candidate))
        if (conflict !== undefined) {
          throw new RootValidationError(
            'duplicate',
            `"${conflict}" is already granted by the commonRoots configuration of this plugin,`
            + ' which applies to every workspace and needs no registration',
            { conflict, reference: candidate },
          )
        }
      }
      const canonical = validateRootCandidate(input.path, {
        primaryRoot: key,
        // A withheld or unusable registration grants nothing, so it may not block
        // re-registering the very directory the operator is trying to restore.
        // The common roots are the other way round — they DO grant — so they take
        // part in the rules too: a candidate that duplicates or nests inside one
        // is rejected exactly as it would be against a registration.
        existing: [...availableRoots(statuses), ...common],
      })
      const alias = normalizeAlias(input.alias)
      // Reviving looks at BOTH spellings of an existing registration: the
      // canonical path it is stored under, and the path it currently resolves
      // to. Re-adding a directory that was replaced by a symlink therefore
      // updates the existing registration (re-recording what it is granted for)
      // instead of piling a second record for the same operator-given path on
      // top of it.
      const revived = statuses.findIndex(status =>
        status.path === canonical || canonicalRoot(status.path) === canonical)
      const next = revived === -1
        ? [...statuses, {
          id: additionalRootId(randomUUID()),
          path: canonical,
          recordedPath: canonical,
          state: 'available',
          ...(alias === undefined ? {} : { alias }),
          addedAt: new Date().toISOString(),
        } satisfies RootStatus]
        : statuses.map((status, index) => index === revived
          ? {
            ...status,
            path: canonical,
            // Re-registering a withheld root is the operator confirming THIS
            // directory again, which is exactly what re-records the grant.
            recordedPath: canonical,
            addedAt: new Date().toISOString(),
            ...(alias === undefined ? {} : { alias }),
          }
          : status)
      return await this.persist(key, next)
    })
  }

  /**
   * Remove one registration.
   * @param primaryRoot - the session workspace root the root belongs to.
   * @param ref - which registered root to remove.
   * @returns the updated status list.
   * @throws {RootValidationError} `not-found` when the reference matches nothing.
   */
  async remove(primaryRoot: string, ref: RootRef): Promise<readonly RootStatus[]> {
    return await this.removeAt(primaryRoot, ref)
  }

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
  async removeAt(primaryRoot: string, ref: RootRef): Promise<readonly RootStatus[]> {
    await this.ensureAuthority()
    this.requireActive()
    const key = canonicalRoot(primaryRoot)
    return await this.serialize(key, async () => {
      this.rejectCommonRef(key, ref)
      return await this.persist(key, removeStatusAt(this.statusesOf(key), ref))
    })
  }

  /**
   * Set or clear one registration's display alias.
   * @param primaryRoot - the session workspace root the root belongs to.
   * @param ref - which registered root to rename.
   * @param alias - the new alias; empty or absent clears it.
   * @returns the updated status list.
   * @throws {RootValidationError} `not-found`/`invalid-alias`.
   */
  async setAlias(primaryRoot: string, ref: RootRef, alias: string | undefined): Promise<readonly RootStatus[]> {
    await this.ensureAuthority()
    this.requireActive()
    const key = canonicalRoot(primaryRoot)
    return await this.serialize(key, async () => {
      this.rejectCommonRef(key, ref)
      const statuses = this.statusesOf(key)
      const targetIndex = resolveRootIndex(statuses, ref)
      const normalized = normalizeAlias(alias)
      const next = statuses.map((status, index) => {
        if (index !== targetIndex) return status
        const { alias: _dropped, ...rest } = status
        return normalized === undefined ? rest : { ...rest, alias: normalized }
      })
      return await this.persist(key, next)
    })
  }

  /**
   * Move one registration within the display order.
   * @param primaryRoot - the session workspace root the root belongs to.
   * @param ref - which registered root to move.
   * @param beforeRef - the anchor to move in front of; absent moves it to the end.
   * @returns the updated status list.
   * @throws {RootValidationError} `not-found` when either reference matches nothing.
   */
  async move(primaryRoot: string, ref: RootRef, beforeRef?: RootRef): Promise<readonly RootStatus[]> {
    await this.ensureAuthority()
    this.requireActive()
    const key = canonicalRoot(primaryRoot)
    return await this.serialize(key, async () => {
      this.rejectCommonRef(key, ref)
      const statuses = this.statusesOf(key)
      const targetIndex = resolveRootIndex(statuses, ref)
      const anchorIndex = beforeRef === undefined
        ? undefined
        : this.storedAnchorIndex(key, statuses, beforeRef)
      if (anchorIndex === targetIndex) return statuses
      const target = statuses[targetIndex]!
      const without = statuses.filter((_status, index) => index !== targetIndex)
      const adjustedAnchor = anchorIndex === undefined
        ? without.length
        : anchorIndex - (targetIndex < anchorIndex ? 1 : 0)
      const next = [...without.slice(0, adjustedAnchor), target, ...without.slice(adjustedAnchor)]
      return await this.persist(key, next)
    })
  }

  /**
   * Re-examine every registration of one primary root and persist what the
   * re-examination produced — {@link MultiRootRegistry.refresh} plus one durable
   * write. The recovery path after a directory was restored by hand, and the
   * only read-shaped operation that is allowed to touch the store.
   * @param primaryRoot - the session workspace root to re-check.
   * @returns the refreshed status list.
   */
  async recheck(primaryRoot: string): Promise<readonly RootStatus[]> {
    await this.ensureAuthority()
    this.requireActive()
    const key = canonicalRoot(primaryRoot)
    return await this.serialize(key, async () => await this.persist(key, this.reclassify(key)))
  }

  /**
   * Observe registry changes.
   * @param listener - called with the canonical primary root after each durable change.
   * @returns the disposer that stops observing.
   */
  onChange(listener: (primaryRoot: string) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * The scope the registry publishes: only usable roots, in registry order.
   * @param primaryRoot - the session workspace root (any spelling).
   * @returns the canonical paths of every `available` root.
   */
  granted(primaryRoot: string): readonly string[] {
    return availableRoots(this.statusesOf(canonicalRoot(primaryRoot)))
  }

  /**
   * The scope the registry publishes: only usable roots, in registry order.
   * @param policy - the per-call policy; its workspace root is the primary root.
   * @returns the granted canonical roots.
   */
  grantedFor(policy: SandboxExecutionPolicy): readonly string[] {
    return this.granted(policy.workspaceRoot)
  }

  /** Classify one stored record set and cache it. */
  private accept(primaryRoot: string, record: PersistedPrimaryRoot): readonly RootStatus[] {
    const key = canonicalRoot(primaryRoot)
    const statuses = classifyStoredRoots(key, record.roots.map(toRegisteredRoot))
    this.cache.set(key, statuses)
    this.publish(key, statuses)
    return statuses
  }

  /**
   * The statuses of one key, from memory where possible: the cache, else what
   * storage holds, else empty. A cached answer is never re-checked here — that
   * is {@link MultiRootRegistry.reclassify}, which the read surfaces and
   * {@link MultiRootRegistry.refresh} call deliberately.
   */
  private statusesOf(key: string): readonly RootStatus[] {
    const cached = this.cache.get(key)
    if (cached !== undefined) return cached
    const record = this.lookupRecords(key)
    if (record === undefined) return []
    return this.accept(key, record)
  }

  /**
   * The stored record set of one key, or `undefined` when there is none (or
   * when the store itself could not be read: an unusable store reads as
   * "nothing registered" so reads stay answerable and the surfaces can explain
   * the situation, while every write fails loudly in `requireTable()`).
   */
  private lookupRecords(key: string): PersistedPrimaryRoot | undefined {
    if (this.authorityState.kind !== 'active') return undefined
    return this.table?.get(key)
  }

  /**
   * Re-classify one key from its stored records: every directory is `stat`ed
   * again and every path is resolved again against its recorded canonical
   * directory. Updates the cache, republishes the scope, and returns the new
   * list — the shared body of the read-path re-checks.
   */
  private reclassify(key: string): readonly RootStatus[] {
    const record = this.lookupRecords(key)
    if (record === undefined) {
      this.cache.set(key, [])
      this.publish(key, [])
      return []
    }
    return this.accept(key, record)
  }

  /**
   * Persist one status list, then republish it into the scope and to listeners.
   * The durable write happens first: a failed write must not leave the running
   * scope granting something storage does not hold.
   */
  private async persist(key: string, statuses: readonly RootStatus[]): Promise<readonly RootStatus[]> {
    const table = this.requireTable()
    if (statuses.length === 0) await table.delete(key)
    else {
      // Validate the COMPLETE document before crossing the durable boundary.
      // In particular, legacy records keep an absent `recordedPath` absent;
      // they must never be rewritten as the schema-invalid empty string.
      const durable = persistedPrimaryRoot.parse({ roots: statuses.map(toPersistedRoot) })
      await table.put(key, durable)
    }
    const classified = statuses.length === 0 ? [] : classifyStoredRoots(key, statuses.map(toRegisteredRoot))
    this.cache.set(key, classified)
    this.publish(key, classified)
    return classified
  }

  /**
   * Run one job for one primary root after every job already queued for that
   * root. The whole read → validate → write sequence belongs inside the job:
   * the storage domain serializes individual writes, so without this the loser
   * of a race reads a snapshot that is already stale and writes it back.
   */
  private async serialize<T>(key: string, job: () => T | Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve()
    const run = previous.then(job)
    // The tail must never reject: a failed operation must not poison the queue
    // for the operations behind it.
    const tail = run.then(() => undefined, () => undefined)
    this.chains.set(key, tail)
    try {
      return await run
    } finally {
      // Drop the chain once it is idle, so a long-lived process does not keep
      // one entry per workspace it ever touched.
      if (this.chains.get(key) === tail) this.chains.delete(key)
    }
  }

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
  private publish(key: string, statuses: readonly RootStatus[]): void {
    const withheld = statuses.filter(status => status.state !== 'available')
    const signature = [
      ...statuses.filter(status => status.state === 'available').map(status => `available:${status.recordedPath}`),
      ...withheld.map(status => `${status.state}:${status.path}`),
    ].join('\n')
    if (this.published.get(key) === signature) return
    this.published.set(key, signature)
    const effective = statuses.flatMap(status => {
      if (status.state !== 'available' || status.recordedPath === undefined) return []
      return [{
        id: status.id,
        path: status.path,
        recordedPath: status.recordedPath,
        ...(status.alias === undefined ? {} : { alias: status.alias }),
      }]
    })
    this.ctx.multiRootScope.setAdditionalRoots(key, effective)
    if (withheld.length > 0) {
      this.ctx.logger.warn(
        `multi-root-workspace: ${withheld.length} registered root(s) of ${key} are not writable right now`
        + ` (${withheld.map(status => `${status.path}: ${status.state}`).join(', ')});`
        + ' they stay registered and are reported by /workspace-folders',
      )
    }
    for (const listener of this.listeners) listener(key)
  }

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
  private commonStatusesFor(key: string): readonly RootStatus[] {
    if (this.commonEntries.length === 0) return []
    const primary = canonicalRoot(key)
    const statuses: RootStatus[] = []
    for (const entry of this.commonEntries) {
      const canonical = canonicalRoot(entry.path)
      const common = {
        id: additionalRootId(entry.id),
        recordedPath: entry.path,
        addedAt: this.commonAddedAt,
        source: 'common' as const,
      }
      if (!sameCanonicalPath(canonical, entry.path)) {
        // The reported path stays the CONFIGURED spelling: naming the new
        // resolution would show a directory the configuration never mentioned.
        statuses.push({
          ...common,
          path: entry.path,
          state: 'redirected',
          detail: `the path now resolves to "${canonical}" instead of the configured "${entry.path}"`,
        })
        continue
      }
      if (sameCanonicalPath(canonical, primary)) {
        statuses.push({
          ...common,
          path: canonical,
          state: 'invalid',
          detail: 'this is the workspace root of a session it is granted to, which needs no additional grant',
        })
        continue
      }
      if (!isDirectory(canonical)) {
        statuses.push({
          ...common,
          path: canonical,
          state: 'missing',
          detail: 'the directory is not present right now; it is granted as soon as it exists',
        })
        continue
      }
      statuses.push({ ...common, path: canonical, state: 'available' })
    }
    return statuses
  }

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
  private withCommon(key: string, stored: readonly RootStatus[]): readonly RootStatus[] {
    if (this.commonEntries.length === 0 || this.authorityState.kind !== 'active') return stored
    const common = this.commonStatusesFor(key)
    if (common.length === 0) return stored
    const claimed = availableRoots(stored)
    const distinct = common.filter(status =>
      status.state !== 'available' || !claimed.some(path => sameCanonicalPath(path, status.path)))
    return [...stored, ...distinct]
  }

  /**
   * The canonical directories the configuration grants to one primary root right
   * now: what `add` must treat as already granted, and what a duplicate has to
   * name as its conflict.
   */
  private commonGrantedFor(key: string): readonly string[] {
    if (this.authorityState.kind !== 'active') return []
    return this.commonStatusesFor(key)
      .filter(status => status.state === 'available')
      .map(status => status.path)
  }

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
  private rejectCommonRef(key: string, ref: RootRef): void {
    const stored = this.statusesOf(key)
    if (resolvesWithin(stored, ref)) return
    const merged = this.withCommon(key, stored)
    const index = resolveRootIndex(merged, ref)
    if (index < stored.length) return
    const target = merged[index]!
    throw new RootValidationError(
      'common-root',
      `"${target.path}" is granted by the commonRoots configuration of this plugin and applies to every workspace;`
      + ' edit that configuration (cordis.patch.yml) instead of changing it here',
      { reference: target.path },
    )
  }

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
  private storedAnchorIndex(key: string, statuses: readonly RootStatus[], beforeRef: RootRef): number | undefined {
    if (resolvesWithin(statuses, beforeRef)) return resolveRootIndex(statuses, beforeRef)
    // Not a stored row. Consulting the merged list is what keeps the original
    // error for an anchor that names nothing at all; a common root, which the
    // merged list can name, means the end of the stored order.
    resolveRootIndex(this.withCommon(key, statuses), beforeRef)
    return undefined
  }

  /**
   * The open table.
   * @returns the live table.
   * @throws {RootValidationError} `registry-contended` when another DSH process
   *   owns the store, `storage-unavailable` when the store could not be opened,
   *   or an error when the service has not started.
   */
  private requireTable(): KvTable<string, PersistedPrimaryRoot> {
    if (this.authorityState.kind === 'contended') {
      throw new RootValidationError('registry-contended', REGISTRY_CONTENDED_MESSAGE)
    }
    if (this.authorityState.kind === 'storage-failed') {
      throw new RootValidationError(
        'storage-unavailable',
        `the root registry store is unavailable (${this.authorityState.reason}); `
        + 'remove or repair $DSH_HOME/storages/' + DOMAIN_NAME + '.json and restart dsh',
      )
    }
    if (this.table === undefined) throw new Error('multi-root registry is not started yet')
    return this.table
  }

  /**
   * Reject mutations unless this process is the Registry Authority.
   * Called before path validation so a contended process never mis-reports
   * `missing` / `not-absolute` for a directory it is not allowed to register.
   */
  private requireActive(): void {
    this.requireTable()
  }

  /**
   * Acquire the store-wide lease if this process does not already hold it, then
   * open the domain from disk. Idempotent while active. A contended process
   * retries here (the command `list` and the panel Retry button both call
   * {@link MultiRootRegistry.refresh}).
   */
  private async ensureAuthority(): Promise<void> {
    await this.serializeAuthority(async () => {
      // The teardown queues behind any acquisition, so a disposer that ran
      // first must not be followed by a new medium nobody will ever close.
      if (this.disposed) return
      if (this.authorityState.kind === 'active') return
      if (this.lease !== undefined) {
        await this.openDomain()
        return
      }
      const leasePath = this.leasePath
      if (leasePath === undefined || leasePath === '') {
        this.enterStorageFailed(
          `${DOMAIN_NAME}: leasePath is not configured; set it next to storage-json.root `
          + `(default $DSH_HOME/storages/${DOMAIN_NAME}.lock)`,
        )
        return
      }
      if (!isAbsolute(leasePath)) {
        this.enterStorageFailed(`${DOMAIN_NAME}: leasePath must be an absolute path`)
        return
      }
      try {
        this.lease = await RegistryAuthorityLease.acquire(leasePath)
      } catch (error: unknown) {
        if (error instanceof RegistryLeaseContendedError) {
          this.enterContended()
          return
        }
        this.enterStorageFailed(
          `${DOMAIN_NAME}: cannot acquire the registry lease: `
          + `${error instanceof Error ? error.message : String(error)}`,
        )
        return
      }
      await this.openDomain()
    })
  }

  /**
   * Open the domain under an already-held lease and publish every stored root.
   * On failure the lease is kept so a later refresh can retry the open without
   * letting a second process grant from a stale snapshot.
   */
  private async openDomain(): Promise<void> {
    let domain
    try {
      domain = await this.ctx.storageDomain.open(multiRootDomainSpec)
    } catch (error: unknown) {
      const reason = `${DOMAIN_NAME}: ${error instanceof Error ? error.message : String(error)}`
      this.ctx.logger.error(
        `multi-root-workspace: cannot open the root registry store (${DOMAIN_NAME});`
        + ' no additional root is granted until it is repaired or removed:'
        + ` ${reason}`,
      )
      this.enterStorageFailed(reason)
      return
    }
    this.domain = domain
    this.table = domain.table(TABLE_NAME)
    this.authorityState = { kind: 'active' }
    this.loggedContended = false
    this.cache.clear()
    this.published.clear()
    for (const [primaryRoot, record] of this.table.entries()) {
      this.accept(primaryRoot, record)
    }
    // After the store is published, so a common root never appears to outlive an
    // authority that failed to open: this is also the path a contended process
    // takes when it later wins the lease (refresh → ensureAuthority → here).
    this.pushCommonRoots()
  }

  /** Fail closed: empty scope, no table, contended state. */
  private enterContended(): void {
    this.withdrawPublished()
    this.table = undefined
    this.authorityState = { kind: 'contended' }
    if (!this.loggedContended) {
      this.loggedContended = true
      this.ctx.logger.warn(
        'multi-root-workspace: registry lease is held by another DSH process;'
        + ' additional roots are not granted here until it exits and this process refreshes',
      )
    }
  }

  /** Fail closed: empty scope, no table, storage-failed state. The lease, if held, stays. */
  private enterStorageFailed(reason: string): void {
    this.withdrawPublished()
    this.table = undefined
    this.authorityState = { kind: 'storage-failed', reason }
  }

  /** Drop every grant this process has published. Idempotent. */
  private withdrawPublished(): void {
    for (const key of this.published.keys()) {
      this.ctx.multiRootScope.setAdditionalRoots(key, [])
    }
    this.published.clear()
    this.cache.clear()
    // The common roots are a grant too, and they belong to no single key: they
    // are withdrawn here rather than per key, so "no authority ⇒ no grant" holds
    // for a store that failed to open and for a contended process alike.
    this.commonEntries = []
    this.commonAddedAt = ''
    this.ctx.multiRootScope.setCommonRoots([])
  }

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
  private async releaseAuthority(): Promise<void> {
    this.disposed = true
    await this.serializeAuthority(async () => {
      // Fail closed first, so no further mutation is admitted while teardown
      // runs (a mutation admitted later would fail in `requireTable()`, by design).
      this.table = undefined
      this.authorityState = { kind: 'contended' }
      await this.drainMutations()
      // After the drain, so a grant a finishing mutation just published is
      // dropped instead of outliving the teardown.
      this.withdrawPublished()
      const domain = this.domain
      this.domain = undefined
      if (domain !== undefined) {
        try {
          await domain.close()
        } catch {
          // Dispose must not throw through the fiber.
        }
      }
      const lease = this.lease
      this.lease = undefined
      if (lease !== undefined) {
        try {
          await lease.release()
        } catch {
          // Kernel release on process death is the fallback.
        }
      }
    })
  }

  /**
   * Wait until no per-primary-root mutation is queued or running.
   *
   * One pass is enough, and only because the authority state has already been
   * flipped: no further mutation can be admitted (it would fail in
   * `requireTable()`), and every mutation admitted earlier put its own tail in
   * `chains` before it ran.
   */
  private async drainMutations(): Promise<void> {
    await Promise.allSettled([...this.chains.values()])
  }

  /**
   * Run one authority-transition job after every job already queued. Acquire,
   * open, and release never interleave with each other.
   */
  private async serializeAuthority<T>(job: () => T | Promise<T>): Promise<T> {
    const previous = this.authorityChain
    const run = previous.then(job)
    this.authorityChain = run.then(() => undefined, () => undefined)
    return await run
  }
}

/** One configured common root, resolved once per authority transition. */
interface CommonEntry {
  /** The spelling the configuration used, for messages. */
  readonly raw: string
  /**
   * Canonical directory: the `realpath` captured at publish time, or the lexical
   * spelling while the directory is absent (see `canonicalPath`). It doubles as
   * the `recordedPath` of the published root, which is what makes a later
   * symlink swap a withholding rather than a re-grant.
   */
  readonly path: string
  /** Stable synthetic id, derived from the path so it survives a restart. */
  readonly id: string
}

/** Whether a canonical path is an existing directory right now. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  }
  catch {
    return false
  }
}

/**
 * Whether a reference resolves within one status list, without reporting why it
 * does not: the caller uses it to choose between two lists, not to explain a
 * failure (the later {@link resolveRootIndex} call owns that).
 */
function resolvesWithin(statuses: readonly RootStatus[], ref: RootRef): boolean {
  try {
    resolveRootIndex(statuses, ref)
    return true
  }
  catch {
    return false
  }
}

/** Project one status back to the durable record shape. */
function toPersistedRoot(status: RootStatus): PersistedRoot {
  return {
    id: status.id,
    path: status.path,
    ...(status.recordedPath === undefined || status.recordedPath === '' ? {} : { recordedPath: status.recordedPath }),
    ...(status.alias === undefined ? {} : { alias: status.alias }),
    addedAt: status.addedAt,
  }
}

/** Recover the registered-root view of a stored record entry. */
function toRegisteredRoot(entry: PersistedRoot): RegisteredRoot {
  return {
    id: additionalRootId(entry.id),
    path: entry.path,
    // A record written before this field existed (or by hand) keeps whatever it
    // has: classification needs to SEE the absence to report it as invalid,
    // rather than have it papered over here.
    ...(entry.recordedPath === undefined ? {} : { recordedPath: entry.recordedPath }),
    ...(entry.alias === undefined ? {} : { alias: entry.alias }),
    addedAt: entry.addedAt,
  }
}

/**
 * Validate and normalize an optional display alias.
 * @param alias - the operator input; empty means "no alias".
 * @returns the trimmed alias, or `undefined`.
 * @throws {RootValidationError} `invalid-alias` for control characters or an over-long value.
 */
function normalizeAlias(alias: string | undefined): string | undefined {
  if (alias === undefined) return undefined
  const trimmed = alias.trim()
  if (trimmed === '') return undefined
  // eslint-disable-next-line no-control-regex -- control characters must not reach the panel or the prompt.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new RootValidationError('invalid-alias', 'an alias must not contain control characters')
  }
  if (trimmed.length > MAX_ALIAS_LENGTH) {
    throw new RootValidationError('invalid-alias', `an alias must be at most ${MAX_ALIAS_LENGTH} characters`)
  }
  return trimmed
}

export type { AdditionalRootId, RegisteredRoot, RootRef, RootStatus }
export default MultiRootRegistry

/**
 * The primary roots one store has already seeded.
 *
 * A missing or unreadable ledger means "never seeded": the file is a
 * convenience record, and treating it as authoritative would silently disable
 * seeding on a store whose ledger was deleted.
 * @param file - the ledger path.
 * @returns the canonical primary roots recorded in it.
 */
function readSeedLedger(file: string): Set<string> {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { seeded?: unknown }
    return new Set(
      Array.isArray(parsed.seeded) ? parsed.seeded.filter((value): value is string => typeof value === 'string') : [],
    )
  }
  catch {
    return new Set()
  }
}

/**
 * Replace the ledger atomically, so a crash mid-write cannot leave a truncated
 * file that reads back as "no primary root was ever seeded".
 * @param file - the ledger path.
 * @param seeded - the full set to persist.
 * @param logger - where a failure is reported; a failed write costs one re-seed,
 *   never a broken start.
 */
function writeSeedLedger(file: string, seeded: ReadonlySet<string>, logger: { warn(message: string): void }): void {
  const temp = `${file}.${process.pid}.tmp`
  try {
    writeFileSync(temp, `${JSON.stringify({ version: 1, seeded: [...seeded].sort() }, null, 2)}\n`)
    renameSync(temp, file)
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    logger.warn(`multi-root-registry: could not write the seed ledger ${file}: ${reason}`)
  }
}
