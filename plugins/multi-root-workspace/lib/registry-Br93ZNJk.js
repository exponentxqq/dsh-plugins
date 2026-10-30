import { a as classifyStoredRoots, d as resolveRootIndex, i as canonicalRoot, m as validateRootCandidate, n as additionalRootId, p as sameCanonicalPath, r as availableRoots, s as expandRootInput, t as RootValidationError, u as removeStatusAt } from "./roots-DejK8QSE.js";
import { Service } from "@deepseek-ai/cordis";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute } from "node:path";
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { z } from "zod";
import { tryLockExclusive } from "@deepseek-ai/node-addon-system/flock";
//#region src/registry-lease.ts
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
var RegistryLeaseContendedError = class extends Error {
	/** Stable code the registry maps onto `registry-contended`. */
	code = "registry-contended";
	/** Absolute lock path that was contended. */
	leasePath;
	/**
	* @param leasePath - the store-wide lock path that was contended.
	*/
	constructor(leasePath) {
		super(`the root registry lease is held by another DSH process (${leasePath})`);
		this.name = "RegistryLeaseContendedError";
		this.leasePath = leasePath;
	}
};
/** Whether a native lock failure means another holder keeps the lock. */
function isLockContention(error) {
	const code = error?.code;
	return code === "EAGAIN" || code === "EWOULDBLOCK" || code === "EBUSY";
}
/**
* One held store-wide registry lock. Constructed only by
* {@link RegistryAuthorityLease.acquire}; `release` closes the descriptor or
* handle, which is what releases the lock.
*/
var RegistryAuthorityLease = class RegistryAuthorityLease {
	held;
	released = false;
	constructor(held) {
		this.held = held;
	}
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
	static async acquire(leasePath) {
		mkdirSync(dirname(leasePath), {
			recursive: true,
			mode: 448
		});
		if (process.platform === "win32") {
			const { acquireLockHandleWin32 } = await import("./registry-lease-win32-By8yoh30.js");
			let handle;
			try {
				handle = await acquireLockHandleWin32(leasePath);
			} catch (error) {
				if (isLockContention(error)) throw new RegistryLeaseContendedError(leasePath);
				throw error;
			}
			return new RegistryAuthorityLease({
				kind: "win32",
				handle
			});
		}
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const fd = openSync(leasePath, "w");
			try {
				try {
					await tryLockExclusive(fd);
				} catch (error) {
					if (isLockContention(error)) throw new RegistryLeaseContendedError(leasePath);
					throw error;
				}
				const held = fstatSync(fd, { bigint: true });
				let current;
				try {
					current = statSync(leasePath, { bigint: true });
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
				}
				if (current !== void 0 && current.ino === held.ino && current.dev === held.dev) return new RegistryAuthorityLease({
					kind: "posix",
					fd
				});
			} catch (error) {
				closeSync(fd);
				throw error;
			}
			closeSync(fd);
		}
		throw new RegistryLeaseContendedError(leasePath);
	}
	/**
	* Release the kernel lock by closing its descriptor or handle. The POSIX
	* lock file is never removed: keeping it preserves the stable inode later
	* lockers verify against. POSIX close is synchronous so a fiber disposer that
	* does not await this promise still drops the flock before returning.
	* Idempotent.
	*/
	async release() {
		if (this.released) return;
		this.released = true;
		if (this.held.kind === "win32") {
			const { releaseLockHandleWin32 } = await import("./registry-lease-win32-By8yoh30.js");
			await releaseLockHandleWin32(this.held.handle);
			return;
		}
		closeSync(this.held.fd);
	}
};
//#endregion
//#region src/registry.ts
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
/** The domain name; also the store file stem (`$DSH_HOME/storages/<name>.json`). */
const DOMAIN_NAME = "multi_root_workspace";
/** The single table name inside the domain. */
const TABLE_NAME = "roots";
/** Longest accepted display alias. */
const MAX_ALIAS_LENGTH = 120;
/**
* The prefix of a synthesized id for a configured common root
* (`common:<canonical path>`). It is stable across restarts because it is
* derived from the path, and it can never collide with a stored uuid.
*/
const COMMON_ROOT_ID_PREFIX = "common:";
/**
* Operator-facing English for a contended lease. Host-side commands have no
* locale; the panel also shows this string verbatim via `RootsView.unavailable`.
*/
const REGISTRY_CONTENDED_MESSAGE = "the root registry is owned by another DSH process; additional roots are not granted here. Close the other process, then retry.";
/** One persisted root record. `zod` validates it at the durable boundary. */
const persistedRoot = z.object({
	id: z.string().min(1),
	path: z.string().min(1),
	recordedPath: z.string().min(1).optional(),
	alias: z.string().optional(),
	addedAt: z.string().min(1)
});
/**
* One primary root's whole registration list. The domain's `single` layout
* stores the entire unit as one document, so keys stay opaque strings — which
* is exactly what lets the canonical primary root itself be the key.
*/
const persistedPrimaryRoot = z.object({ roots: z.array(persistedRoot) });
/**
* The domain declaration: version 1, `single` layout, one `roots` table keyed
* by the canonical primary root. Records that fail validation are backed up and
* skipped rather than blocking the whole harness from starting (see
* docs/decisions/ADR-0004).
*/
const multiRootDomainSpec = defineDomain({
	name: DOMAIN_NAME,
	version: 1,
	invalidRecords: "backup-and-skip",
	tables: { roots: domainTable(persistedPrimaryRoot) }
});
/** The registry service: `ctx.multiRootRegistry`. */
var MultiRootRegistry = class extends Service {
	static inject = [
		"multiRootCompat",
		"storageDomain",
		"multiRootScope"
	];
	/** Absolute lock path; absent means the row was composed without `leasePath`. */
	leasePath;
	/** Whether this process currently owns the store. */
	authorityState = { kind: "contended" };
	/** Held kernel lease; present once acquire succeeded, including after a failed open. */
	lease;
	/** Open domain handle; present only while {@link authority} is `active`. */
	domain;
	/** The open table; present once this process is the authority. */
	table;
	/** Last classified status list per canonical primary root. */
	cache = /* @__PURE__ */ new Map();
	/** Signature of the last published grant per key, so a no-op refresh stays a no-op. */
	published = /* @__PURE__ */ new Map();
	/** One promise chain per canonical primary root: mutations never interleave. */
	chains = /* @__PURE__ */ new Map();
	/** Store-wide queue for lease acquire / open / release. */
	authorityChain = Promise.resolve();
	/** Change listeners, keyed by their own disposer identity. */
	listeners = /* @__PURE__ */ new Set();
	/** True after a contended-lease warning has been emitted, so refresh does not spam. */
	loggedContended = false;
	/** True once the fiber disposer has run: no further acquisition may happen. */
	disposed = false;
	/** Directories seeded on first use of a primary root; empty disables seeding. */
	seedRoots;
	/** Primary roots the seed list applies to; empty disables seeding. */
	seedPrimaryRoots;
	/** Directories granted to every primary root; empty disables common roots. */
	commonRoots;
	/**
	* The common roots as published: resolved once per authority, so the recorded
	* grant is what the path was captured as — a path that later resolves
	* elsewhere is withheld instead of silently granting its new target.
	*/
	commonEntries = [];
	/** The instant the current common entries were captured; their synthesized `addedAt`. */
	commonAddedAt = "";
	/** Common-root spellings already reported as unusable, so a warning is not repeated. */
	warnedCommon = /* @__PURE__ */ new Set();
	/**
	* @param ctx - the host context; `storageDomain` and `multiRootScope` are injected.
	* @param config - the patch row's `leasePath`, plus the optional seed and common lists.
	*/
	constructor(ctx, config = {}) {
		super(ctx, "multiRootRegistry");
		this.leasePath = config.leasePath;
		this.seedRoots = config.seedRoots ?? [];
		this.seedPrimaryRoots = config.seedPrimaryRoots ?? [];
		this.commonRoots = config.commonRoots ?? [];
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
	async [Service.init]() {
		this.ctx.effect(() => () => this.releaseAuthority(), "multi-root-registry: authority release");
		await this.ensureAuthority();
		await this.seedConfiguredRoots();
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
	pushCommonRoots() {
		if (this.commonRoots.length === 0 || this.authorityState.kind !== "active") {
			this.commonEntries = [];
			this.commonAddedAt = "";
			this.ctx.multiRootScope.setCommonRoots([]);
			return;
		}
		const addedAt = (/* @__PURE__ */ new Date()).toISOString();
		const entries = [];
		for (const raw of this.commonRoots) {
			const expanded = expandRootInput(raw);
			if (!isAbsolute(expanded)) {
				this.warnCommonOnce(raw, "is not an absolute path; give an absolute directory or one starting with \"~/\"");
				continue;
			}
			const canonical = canonicalRoot(expanded);
			if (!isDirectory(canonical)) this.warnCommonOnce(raw, `"${expanded}" is not a directory right now; it is granted as soon as it exists`);
			entries.push({
				raw,
				path: canonical,
				id: `${COMMON_ROOT_ID_PREFIX}${canonical}`
			});
		}
		this.commonEntries = entries;
		this.commonAddedAt = addedAt;
		this.ctx.multiRootScope.setCommonRoots(entries.map((entry) => ({
			id: entry.id,
			path: entry.path,
			recordedPath: entry.path
		})));
		if (entries.length > 0) this.ctx.logger.info(`multi-root-registry: ${entries.length} common root(s) granted to every workspace (${entries.map((entry) => entry.path).join(", ")})`);
	}
	/** Warn once per configured spelling, so a bad entry is reported without repeating at every transition. */
	warnCommonOnce(raw, reason) {
		if (this.warnedCommon.has(raw)) return;
		this.warnedCommon.add(raw);
		this.ctx.logger.warn(`multi-root-registry: common root ${raw} ${reason}`);
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
	async seedConfiguredRoots() {
		if (this.seedRoots.length === 0 || this.seedPrimaryRoots.length === 0) return [];
		if (this.authorityState.kind !== "active") {
			this.ctx.logger.warn(`multi-root-registry: seeding skipped (${this.authorityState.kind}); no additional root is granted here`);
			return [];
		}
		const ledgerFile = this.seedLedgerPath();
		if (ledgerFile === void 0) {
			this.ctx.logger.warn("multi-root-registry: seeding skipped (no leasePath, so there is nowhere to record that this store was seeded)");
			return [];
		}
		const ledger = readSeedLedger(ledgerFile);
		const seeded = [];
		for (const configured of this.seedPrimaryRoots) {
			const key = canonicalRoot(configured);
			if (!existsSync(key)) {
				this.ctx.logger.warn(`multi-root-registry: seed primary root ${key} is missing; skipped`);
				continue;
			}
			if (this.lookupRecords(key) !== void 0 || ledger.has(key)) continue;
			const granted = this.commonGrantedFor(key);
			const alreadyGranted = (candidate) => {
				const expanded = expandRootInput(candidate);
				if (!isAbsolute(expanded)) return false;
				const canonical = canonicalRoot(expanded);
				return granted.some((path) => sameCanonicalPath(path, canonical));
			};
			let registered = 0;
			let satisfied = 0;
			let skipped = 0;
			for (const candidate of this.seedRoots) {
				if (alreadyGranted(candidate)) {
					satisfied += 1;
					this.ctx.logger.info(`multi-root-registry: seed ${candidate} for ${key} is already granted by the commonRoots configuration`);
					continue;
				}
				try {
					await this.add(key, { path: candidate });
					registered += 1;
					seeded.push(candidate);
					this.ctx.logger.info(`multi-root-registry: seeded ${candidate} for ${key}`);
				} catch (error) {
					skipped += 1;
					const reason = error instanceof Error ? error.message : String(error);
					this.ctx.logger.warn(`multi-root-registry: seed ${candidate} for ${key} skipped: ${reason}`);
				}
			}
			if (skipped === 0 && registered + satisfied > 0) {
				ledger.add(key);
				writeSeedLedger(ledgerFile, ledger, this.ctx.logger);
			} else if (skipped > 0) this.ctx.logger.warn(`multi-root-registry: ${skipped} of ${this.seedRoots.length} seeds skipped for ${key}; the pass stays unrecorded and is retried at the next start`);
		}
		return seeded;
	}
	/**
	* The store-scoped seed ledger: the lease path with its `.lock` suffix
	* replaced, so the ledger sits beside the domain document it belongs to
	* (`…/multi_root_workspace.seeded.json`).
	* @returns the ledger path, or undefined when no lease path is configured.
	*/
	seedLedgerPath() {
		if (this.leasePath === void 0) return void 0;
		return `${this.leasePath.endsWith(".lock") ? this.leasePath.slice(0, -5) : this.leasePath}.seeded.json`;
	}
	/**
	* Why the registry is not granting, when it is not. Surfaces show this
	* instead of a silently empty list, so an operator can tell "no roots
	* configured" from "another DSH process owns the store" or "the file could
	* not be read".
	* @returns the recorded failure text, or `undefined` while this process is the authority.
	*/
	get unavailable() {
		switch (this.authorityState.kind) {
			case "active": return;
			case "contended": return REGISTRY_CONTENDED_MESSAGE;
			case "storage-failed": return this.authorityState.reason;
		}
	}
	/**
	* Whether this process is the Registry Authority for the store-wide medium.
	* Tests and diagnostics read this; surfaces use {@link unavailable}.
	*/
	get authority() {
		return this.authorityState;
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
	list(primaryRoot) {
		const key = canonicalRoot(primaryRoot);
		return this.withCommon(key, this.statusesOf(key));
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
	async refresh(primaryRoot) {
		await this.ensureAuthority();
		if (this.authorityState.kind !== "active") return [];
		const key = canonicalRoot(primaryRoot);
		const stored = await this.serialize(key, () => this.reclassify(key));
		return this.withCommon(key, stored);
	}
	/**
	* Registers one additional root.
	* @param primaryRoot - the session workspace root the root belongs to.
	* @param input - the directory and optional alias.
	* @returns the updated status list.
	* @throws {RootValidationError} when the candidate violates a root rule.
	*/
	async add(primaryRoot, input) {
		await this.ensureAuthority();
		this.requireActive();
		const key = canonicalRoot(primaryRoot);
		return await this.serialize(key, async () => {
			const statuses = this.statusesOf(key);
			const common = this.commonGrantedFor(key);
			const typed = expandRootInput(input.path);
			if (isAbsolute(typed)) {
				const candidate = canonicalRoot(typed);
				const conflict = common.find((path) => sameCanonicalPath(path, candidate));
				if (conflict !== void 0) throw new RootValidationError("duplicate", `"${conflict}" is already granted by the commonRoots configuration of this plugin, which applies to every workspace and needs no registration`, {
					conflict,
					reference: candidate
				});
			}
			const canonical = validateRootCandidate(input.path, {
				primaryRoot: key,
				existing: [...availableRoots(statuses), ...common]
			});
			const alias = normalizeAlias(input.alias);
			const revived = statuses.findIndex((status) => status.path === canonical || canonicalRoot(status.path) === canonical);
			const next = revived === -1 ? [...statuses, {
				id: additionalRootId(randomUUID()),
				path: canonical,
				recordedPath: canonical,
				state: "available",
				...alias === void 0 ? {} : { alias },
				addedAt: (/* @__PURE__ */ new Date()).toISOString()
			}] : statuses.map((status, index) => index === revived ? {
				...status,
				path: canonical,
				recordedPath: canonical,
				addedAt: (/* @__PURE__ */ new Date()).toISOString(),
				...alias === void 0 ? {} : { alias }
			} : status);
			return await this.persist(key, next);
		});
	}
	/**
	* Remove one registration.
	* @param primaryRoot - the session workspace root the root belongs to.
	* @param ref - which registered root to remove.
	* @returns the updated status list.
	* @throws {RootValidationError} `not-found` when the reference matches nothing.
	*/
	async remove(primaryRoot, ref) {
		return await this.removeAt(primaryRoot, ref);
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
	async removeAt(primaryRoot, ref) {
		await this.ensureAuthority();
		this.requireActive();
		const key = canonicalRoot(primaryRoot);
		return await this.serialize(key, async () => {
			this.rejectCommonRef(key, ref);
			return await this.persist(key, removeStatusAt(this.statusesOf(key), ref));
		});
	}
	/**
	* Set or clear one registration's display alias.
	* @param primaryRoot - the session workspace root the root belongs to.
	* @param ref - which registered root to rename.
	* @param alias - the new alias; empty or absent clears it.
	* @returns the updated status list.
	* @throws {RootValidationError} `not-found`/`invalid-alias`.
	*/
	async setAlias(primaryRoot, ref, alias) {
		await this.ensureAuthority();
		this.requireActive();
		const key = canonicalRoot(primaryRoot);
		return await this.serialize(key, async () => {
			this.rejectCommonRef(key, ref);
			const statuses = this.statusesOf(key);
			const targetIndex = resolveRootIndex(statuses, ref);
			const normalized = normalizeAlias(alias);
			const next = statuses.map((status, index) => {
				if (index !== targetIndex) return status;
				const { alias: _dropped, ...rest } = status;
				return normalized === void 0 ? rest : {
					...rest,
					alias: normalized
				};
			});
			return await this.persist(key, next);
		});
	}
	/**
	* Move one registration within the display order.
	* @param primaryRoot - the session workspace root the root belongs to.
	* @param ref - which registered root to move.
	* @param beforeRef - the anchor to move in front of; absent moves it to the end.
	* @returns the updated status list.
	* @throws {RootValidationError} `not-found` when either reference matches nothing.
	*/
	async move(primaryRoot, ref, beforeRef) {
		await this.ensureAuthority();
		this.requireActive();
		const key = canonicalRoot(primaryRoot);
		return await this.serialize(key, async () => {
			this.rejectCommonRef(key, ref);
			const statuses = this.statusesOf(key);
			const targetIndex = resolveRootIndex(statuses, ref);
			const anchorIndex = beforeRef === void 0 ? void 0 : this.storedAnchorIndex(key, statuses, beforeRef);
			if (anchorIndex === targetIndex) return statuses;
			const target = statuses[targetIndex];
			const without = statuses.filter((_status, index) => index !== targetIndex);
			const adjustedAnchor = anchorIndex === void 0 ? without.length : anchorIndex - (targetIndex < anchorIndex ? 1 : 0);
			const next = [
				...without.slice(0, adjustedAnchor),
				target,
				...without.slice(adjustedAnchor)
			];
			return await this.persist(key, next);
		});
	}
	/**
	* Re-examine every registration of one primary root and persist what the
	* re-examination produced — {@link MultiRootRegistry.refresh} plus one durable
	* write. The recovery path after a directory was restored by hand, and the
	* only read-shaped operation that is allowed to touch the store.
	* @param primaryRoot - the session workspace root to re-check.
	* @returns the refreshed status list.
	*/
	async recheck(primaryRoot) {
		await this.ensureAuthority();
		this.requireActive();
		const key = canonicalRoot(primaryRoot);
		return await this.serialize(key, async () => await this.persist(key, this.reclassify(key)));
	}
	/**
	* Observe registry changes.
	* @param listener - called with the canonical primary root after each durable change.
	* @returns the disposer that stops observing.
	*/
	onChange(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	/**
	* The scope the registry publishes: only usable roots, in registry order.
	* @param primaryRoot - the session workspace root (any spelling).
	* @returns the canonical paths of every `available` root.
	*/
	granted(primaryRoot) {
		return availableRoots(this.statusesOf(canonicalRoot(primaryRoot)));
	}
	/**
	* The scope the registry publishes: only usable roots, in registry order.
	* @param policy - the per-call policy; its workspace root is the primary root.
	* @returns the granted canonical roots.
	*/
	grantedFor(policy) {
		return this.granted(policy.workspaceRoot);
	}
	/** Classify one stored record set and cache it. */
	accept(primaryRoot, record) {
		const key = canonicalRoot(primaryRoot);
		const statuses = classifyStoredRoots(key, record.roots.map(toRegisteredRoot));
		this.cache.set(key, statuses);
		this.publish(key, statuses);
		return statuses;
	}
	/**
	* The statuses of one key, from memory where possible: the cache, else what
	* storage holds, else empty. A cached answer is never re-checked here — that
	* is {@link MultiRootRegistry.reclassify}, which the read surfaces and
	* {@link MultiRootRegistry.refresh} call deliberately.
	*/
	statusesOf(key) {
		const cached = this.cache.get(key);
		if (cached !== void 0) return cached;
		const record = this.lookupRecords(key);
		if (record === void 0) return [];
		return this.accept(key, record);
	}
	/**
	* The stored record set of one key, or `undefined` when there is none (or
	* when the store itself could not be read: an unusable store reads as
	* "nothing registered" so reads stay answerable and the surfaces can explain
	* the situation, while every write fails loudly in `requireTable()`).
	*/
	lookupRecords(key) {
		if (this.authorityState.kind !== "active") return void 0;
		return this.table?.get(key);
	}
	/**
	* Re-classify one key from its stored records: every directory is `stat`ed
	* again and every path is resolved again against its recorded canonical
	* directory. Updates the cache, republishes the scope, and returns the new
	* list — the shared body of the read-path re-checks.
	*/
	reclassify(key) {
		const record = this.lookupRecords(key);
		if (record === void 0) {
			this.cache.set(key, []);
			this.publish(key, []);
			return [];
		}
		return this.accept(key, record);
	}
	/**
	* Persist one status list, then republish it into the scope and to listeners.
	* The durable write happens first: a failed write must not leave the running
	* scope granting something storage does not hold.
	*/
	async persist(key, statuses) {
		const table = this.requireTable();
		if (statuses.length === 0) await table.delete(key);
		else {
			const durable = persistedPrimaryRoot.parse({ roots: statuses.map(toPersistedRoot) });
			await table.put(key, durable);
		}
		const classified = statuses.length === 0 ? [] : classifyStoredRoots(key, statuses.map(toRegisteredRoot));
		this.cache.set(key, classified);
		this.publish(key, classified);
		return classified;
	}
	/**
	* Run one job for one primary root after every job already queued for that
	* root. The whole read → validate → write sequence belongs inside the job:
	* the storage domain serializes individual writes, so without this the loser
	* of a race reads a snapshot that is already stale and writes it back.
	*/
	async serialize(key, job) {
		const run = (this.chains.get(key) ?? Promise.resolve()).then(job);
		const tail = run.then(() => void 0, () => void 0);
		this.chains.set(key, tail);
		try {
			return await run;
		} finally {
			if (this.chains.get(key) === tail) this.chains.delete(key);
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
	publish(key, statuses) {
		const withheld = statuses.filter((status) => status.state !== "available");
		const signature = [...statuses.filter((status) => status.state === "available").map((status) => `available:${status.recordedPath}`), ...withheld.map((status) => `${status.state}:${status.path}`)].join("\n");
		if (this.published.get(key) === signature) return;
		this.published.set(key, signature);
		const effective = statuses.flatMap((status) => {
			if (status.state !== "available" || status.recordedPath === void 0) return [];
			return [{
				id: status.id,
				path: status.path,
				recordedPath: status.recordedPath,
				...status.alias === void 0 ? {} : { alias: status.alias }
			}];
		});
		this.ctx.multiRootScope.setAdditionalRoots(key, effective);
		if (withheld.length > 0) this.ctx.logger.warn(`multi-root-workspace: ${withheld.length} registered root(s) of ${key} are not writable right now (${withheld.map((status) => `${status.path}: ${status.state}`).join(", ")}); they stay registered and are reported by /workspace-folders`);
		for (const listener of this.listeners) listener(key);
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
	commonStatusesFor(key) {
		if (this.commonEntries.length === 0) return [];
		const primary = canonicalRoot(key);
		const statuses = [];
		for (const entry of this.commonEntries) {
			const canonical = canonicalRoot(entry.path);
			const common = {
				id: additionalRootId(entry.id),
				recordedPath: entry.path,
				addedAt: this.commonAddedAt,
				source: "common"
			};
			if (!sameCanonicalPath(canonical, entry.path)) {
				statuses.push({
					...common,
					path: entry.path,
					state: "redirected",
					detail: `the path now resolves to "${canonical}" instead of the configured "${entry.path}"`
				});
				continue;
			}
			if (sameCanonicalPath(canonical, primary)) {
				statuses.push({
					...common,
					path: canonical,
					state: "invalid",
					detail: "this is the workspace root of a session it is granted to, which needs no additional grant"
				});
				continue;
			}
			if (!isDirectory(canonical)) {
				statuses.push({
					...common,
					path: canonical,
					state: "missing",
					detail: "the directory is not present right now; it is granted as soon as it exists"
				});
				continue;
			}
			statuses.push({
				...common,
				path: canonical,
				state: "available"
			});
		}
		return statuses;
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
	withCommon(key, stored) {
		if (this.commonEntries.length === 0 || this.authorityState.kind !== "active") return stored;
		const common = this.commonStatusesFor(key);
		if (common.length === 0) return stored;
		const claimed = availableRoots(stored);
		const distinct = common.filter((status) => status.state !== "available" || !claimed.some((path) => sameCanonicalPath(path, status.path)));
		return [...stored, ...distinct];
	}
	/**
	* The canonical directories the configuration grants to one primary root right
	* now: what `add` must treat as already granted, and what a duplicate has to
	* name as its conflict.
	*/
	commonGrantedFor(key) {
		if (this.authorityState.kind !== "active") return [];
		return this.commonStatusesFor(key).filter((status) => status.state === "available").map((status) => status.path);
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
	rejectCommonRef(key, ref) {
		const stored = this.statusesOf(key);
		if (resolvesWithin(stored, ref)) return;
		const merged = this.withCommon(key, stored);
		const index = resolveRootIndex(merged, ref);
		if (index < stored.length) return;
		const target = merged[index];
		throw new RootValidationError("common-root", `"${target.path}" is granted by the commonRoots configuration of this plugin and applies to every workspace; edit that configuration (cordis.patch.yml) instead of changing it here`, { reference: target.path });
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
	storedAnchorIndex(key, statuses, beforeRef) {
		if (resolvesWithin(statuses, beforeRef)) return resolveRootIndex(statuses, beforeRef);
		resolveRootIndex(this.withCommon(key, statuses), beforeRef);
	}
	/**
	* The open table.
	* @returns the live table.
	* @throws {RootValidationError} `registry-contended` when another DSH process
	*   owns the store, `storage-unavailable` when the store could not be opened,
	*   or an error when the service has not started.
	*/
	requireTable() {
		if (this.authorityState.kind === "contended") throw new RootValidationError("registry-contended", REGISTRY_CONTENDED_MESSAGE);
		if (this.authorityState.kind === "storage-failed") throw new RootValidationError("storage-unavailable", `the root registry store is unavailable (${this.authorityState.reason}); remove or repair \$DSH_HOME/storages/multi_root_workspace.json and restart dsh`);
		if (this.table === void 0) throw new Error("multi-root registry is not started yet");
		return this.table;
	}
	/**
	* Reject mutations unless this process is the Registry Authority.
	* Called before path validation so a contended process never mis-reports
	* `missing` / `not-absolute` for a directory it is not allowed to register.
	*/
	requireActive() {
		this.requireTable();
	}
	/**
	* Acquire the store-wide lease if this process does not already hold it, then
	* open the domain from disk. Idempotent while active. A contended process
	* retries here (the command `list` and the panel Retry button both call
	* {@link MultiRootRegistry.refresh}).
	*/
	async ensureAuthority() {
		await this.serializeAuthority(async () => {
			if (this.disposed) return;
			if (this.authorityState.kind === "active") return;
			if (this.lease !== void 0) {
				await this.openDomain();
				return;
			}
			const leasePath = this.leasePath;
			if (leasePath === void 0 || leasePath === "") {
				this.enterStorageFailed(`${DOMAIN_NAME}: leasePath is not configured; set it next to storage-json.root (default $DSH_HOME/storages/${DOMAIN_NAME}.lock)`);
				return;
			}
			if (!isAbsolute(leasePath)) {
				this.enterStorageFailed(`${DOMAIN_NAME}: leasePath must be an absolute path`);
				return;
			}
			try {
				this.lease = await RegistryAuthorityLease.acquire(leasePath);
			} catch (error) {
				if (error instanceof RegistryLeaseContendedError) {
					this.enterContended();
					return;
				}
				this.enterStorageFailed(`${DOMAIN_NAME}: cannot acquire the registry lease: ${error instanceof Error ? error.message : String(error)}`);
				return;
			}
			await this.openDomain();
		});
	}
	/**
	* Open the domain under an already-held lease and publish every stored root.
	* On failure the lease is kept so a later refresh can retry the open without
	* letting a second process grant from a stale snapshot.
	*/
	async openDomain() {
		let domain;
		try {
			domain = await this.ctx.storageDomain.open(multiRootDomainSpec);
		} catch (error) {
			const reason = `${DOMAIN_NAME}: ${error instanceof Error ? error.message : String(error)}`;
			this.ctx.logger.error(`multi-root-workspace: cannot open the root registry store (${DOMAIN_NAME}); no additional root is granted until it is repaired or removed: ${reason}`);
			this.enterStorageFailed(reason);
			return;
		}
		this.domain = domain;
		this.table = domain.table(TABLE_NAME);
		this.authorityState = { kind: "active" };
		this.loggedContended = false;
		this.cache.clear();
		this.published.clear();
		for (const [primaryRoot, record] of this.table.entries()) this.accept(primaryRoot, record);
		this.pushCommonRoots();
	}
	/** Fail closed: empty scope, no table, contended state. */
	enterContended() {
		this.withdrawPublished();
		this.table = void 0;
		this.authorityState = { kind: "contended" };
		if (!this.loggedContended) {
			this.loggedContended = true;
			this.ctx.logger.warn("multi-root-workspace: registry lease is held by another DSH process; additional roots are not granted here until it exits and this process refreshes");
		}
	}
	/** Fail closed: empty scope, no table, storage-failed state. The lease, if held, stays. */
	enterStorageFailed(reason) {
		this.withdrawPublished();
		this.table = void 0;
		this.authorityState = {
			kind: "storage-failed",
			reason
		};
	}
	/** Drop every grant this process has published. Idempotent. */
	withdrawPublished() {
		for (const key of this.published.keys()) this.ctx.multiRootScope.setAdditionalRoots(key, []);
		this.published.clear();
		this.cache.clear();
		this.commonEntries = [];
		this.commonAddedAt = "";
		this.ctx.multiRootScope.setCommonRoots([]);
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
	async releaseAuthority() {
		this.disposed = true;
		await this.serializeAuthority(async () => {
			this.table = void 0;
			this.authorityState = { kind: "contended" };
			await this.drainMutations();
			this.withdrawPublished();
			const domain = this.domain;
			this.domain = void 0;
			if (domain !== void 0) try {
				await domain.close();
			} catch {}
			const lease = this.lease;
			this.lease = void 0;
			if (lease !== void 0) try {
				await lease.release();
			} catch {}
		});
	}
	/**
	* Wait until no per-primary-root mutation is queued or running.
	*
	* One pass is enough, and only because the authority state has already been
	* flipped: no further mutation can be admitted (it would fail in
	* `requireTable()`), and every mutation admitted earlier put its own tail in
	* `chains` before it ran.
	*/
	async drainMutations() {
		await Promise.allSettled([...this.chains.values()]);
	}
	/**
	* Run one authority-transition job after every job already queued. Acquire,
	* open, and release never interleave with each other.
	*/
	async serializeAuthority(job) {
		const run = this.authorityChain.then(job);
		this.authorityChain = run.then(() => void 0, () => void 0);
		return await run;
	}
};
/** Whether a canonical path is an existing directory right now. */
function isDirectory(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
/**
* Whether a reference resolves within one status list, without reporting why it
* does not: the caller uses it to choose between two lists, not to explain a
* failure (the later {@link resolveRootIndex} call owns that).
*/
function resolvesWithin(statuses, ref) {
	try {
		resolveRootIndex(statuses, ref);
		return true;
	} catch {
		return false;
	}
}
/** Project one status back to the durable record shape. */
function toPersistedRoot(status) {
	return {
		id: status.id,
		path: status.path,
		...status.recordedPath === void 0 || status.recordedPath === "" ? {} : { recordedPath: status.recordedPath },
		...status.alias === void 0 ? {} : { alias: status.alias },
		addedAt: status.addedAt
	};
}
/** Recover the registered-root view of a stored record entry. */
function toRegisteredRoot(entry) {
	return {
		id: additionalRootId(entry.id),
		path: entry.path,
		...entry.recordedPath === void 0 ? {} : { recordedPath: entry.recordedPath },
		...entry.alias === void 0 ? {} : { alias: entry.alias },
		addedAt: entry.addedAt
	};
}
/**
* Validate and normalize an optional display alias.
* @param alias - the operator input; empty means "no alias".
* @returns the trimmed alias, or `undefined`.
* @throws {RootValidationError} `invalid-alias` for control characters or an over-long value.
*/
function normalizeAlias(alias) {
	if (alias === void 0) return void 0;
	const trimmed = alias.trim();
	if (trimmed === "") return void 0;
	if (/[\u0000-\u001f\u007f]/.test(trimmed)) throw new RootValidationError("invalid-alias", "an alias must not contain control characters");
	if (trimmed.length > 120) throw new RootValidationError("invalid-alias", `an alias must be at most 120 characters`);
	return trimmed;
}
/**
* The primary roots one store has already seeded.
*
* A missing or unreadable ledger means "never seeded": the file is a
* convenience record, and treating it as authoritative would silently disable
* seeding on a store whose ledger was deleted.
* @param file - the ledger path.
* @returns the canonical primary roots recorded in it.
*/
function readSeedLedger(file) {
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		return new Set(Array.isArray(parsed.seeded) ? parsed.seeded.filter((value) => typeof value === "string") : []);
	} catch {
		return /* @__PURE__ */ new Set();
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
function writeSeedLedger(file, seeded, logger) {
	const temp = `${file}.${process.pid}.tmp`;
	try {
		writeFileSync(temp, `${JSON.stringify({
			version: 1,
			seeded: [...seeded].sort()
		}, null, 2)}\n`);
		renameSync(temp, file);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		logger.warn(`multi-root-registry: could not write the seed ledger ${file}: ${reason}`);
	}
}
//#endregion
export { REGISTRY_CONTENDED_MESSAGE as a, RegistryAuthorityLease as c, MultiRootRegistry as i, RegistryLeaseContendedError as l, DOMAIN_NAME as n, TABLE_NAME as o, MAX_ALIAS_LENGTH as r, multiRootDomainSpec as s, COMMON_ROOT_ID_PREFIX as t };
