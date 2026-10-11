import { isAbsolute, join, sep } from "node:path";
import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
import { statSync } from "node:fs";
import { homedir } from "node:os";
//#region src/roots.ts
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
* Brand one generated uuid as an {@link AdditionalRootId}.
* @param value - the raw uuid.
* @returns the branded id.
*/
function additionalRootId(value) {
	return value;
}
/** A rejected root operation; `code` is the stable contract, `message` the fallback prose. */
var RootValidationError = class extends Error {
	code;
	detail;
	/**
	* @param code - stable failure code.
	* @param message - human-readable fallback text (English; the panel localizes by code).
	* @param detail - structured context, e.g. the conflicting root.
	*/
	constructor(code, message, detail) {
		super(message);
		this.code = code;
		this.detail = detail;
		this.name = "RootValidationError";
	}
};
/**
* Expand the one shell shorthand an operator may reasonably type, and nothing
* else: a leading `~` (alone or as `~/…`). Every other relative spelling is
* left intact so validation can reject it as `not-absolute` instead of
* silently resolving it against some unrelated process cwd.
* @param raw - the raw operator input.
* @param home - the home directory to expand against; defaults to `os.homedir()`.
* @returns the expanded path (still unvalidated).
*/
function expandRootInput(raw, home = homedir()) {
	const trimmed = raw.trim();
	if (trimmed === "~") return home;
	if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) return join(home, trimmed.slice(2));
	return trimmed;
}
/** Whether lexical comparison preserves case on this platform. */
const CASE_SENSITIVE = process.platform !== "win32";
/** Compare two canonical path spellings under the platform's case convention. */
function comparable(path) {
	return CASE_SENSITIVE ? path : path.toLowerCase();
}
/** Whether two canonical paths name the same directory on this platform. */
function samePath(left, right) {
	return comparable(left) === comparable(right);
}
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
function sameCanonicalPath(left, right) {
	return samePath(left, right);
}
/**
* Whether `candidate` is `root` itself or lies beneath it. Both sides must
* already be canonical: symlinks are resolved by then, so the lexical test is
* exact for the alias cases (8.3 names, casing) the fence handles separately.
* @param candidate - canonical path to test.
* @param root - canonical root to test against.
* @returns whether the candidate is contained by the root.
*/
function isCanonicallyUnder(candidate, root) {
	const target = comparable(candidate);
	const base = comparable(root);
	if (target === base) return true;
	return target.startsWith(base.endsWith(sep) ? base : base + sep);
}
/**
* Canonicalize a directory path the way the enforcement layers do (`realpath`),
* leaving an unreachable path untouched so the caller can report it as missing.
* @param path - the path to canonicalize.
* @returns the canonical path.
*/
function canonicalRoot(path) {
	return canonicalPath(path);
}
/**
* Judge one candidate root and return its canonical spelling.
* @param raw - the raw operator input (a path, possibly `~`-prefixed).
* @param context - the primary root and the currently granted roots.
* @returns the canonical path the caller must store (and record as `recordedPath`).
* @throws {RootValidationError} with the first rule that failed.
*/
function validateRootCandidate(raw, context) {
	const expanded = expandRootInput(raw, context.home);
	if (expanded === "") throw new RootValidationError("not-absolute", "a root path is required");
	if (!isAbsolute(expanded)) throw new RootValidationError("not-absolute", `"${expanded}" is not an absolute path; give an absolute directory or one starting with "~/"`, { reference: expanded });
	const canonical = canonicalRoot(expanded);
	assertDirectory(canonical, expanded);
	const primaryRoot = canonicalRoot(context.primaryRoot);
	if (samePath(canonical, primaryRoot)) throw new RootValidationError("equals-primary", `"${canonical}" is this session's workspace root and is already writable`, {
		conflict: primaryRoot,
		reference: canonical
	});
	if (isCanonicallyUnder(canonical, primaryRoot) || isCanonicallyUnder(primaryRoot, canonical)) throw new RootValidationError("primary-overlap", `"${canonical}" overlaps this session's workspace root "${primaryRoot}"`, {
		conflict: primaryRoot,
		reference: canonical
	});
	for (const existing of context.existing) if (samePath(canonical, existing)) throw new RootValidationError("duplicate", `"${canonical}" is already registered`, {
		conflict: existing,
		reference: canonical
	});
	for (const existing of context.existing) {
		if (isCanonicallyUnder(canonical, existing)) throw new RootValidationError("nested", `"${canonical}" is already covered by the registered root "${existing}"`, {
			conflict: existing,
			reference: canonical
		});
		if (isCanonicallyUnder(existing, canonical)) throw new RootValidationError("nested", `"${canonical}" contains the registered root "${existing}"; remove that root first`, {
			conflict: existing,
			reference: canonical
		});
	}
	return canonical;
}
/** Assert that a canonical path is an existing directory. */
function assertDirectory(canonical, asTyped) {
	let stats;
	try {
		stats = statSync(canonical);
	} catch {
		throw new RootValidationError("missing", `"${asTyped}" does not exist`, { reference: asTyped });
	}
	if (!stats.isDirectory()) throw new RootValidationError("not-a-directory", `"${asTyped}" is not a directory`, { reference: asTyped });
}
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
function classifyStoredRoots(primaryRoot, records) {
	const primary = canonicalRoot(primaryRoot);
	const claimed = [];
	const duplicated = duplicatedIds(records);
	const statuses = [];
	for (const [index, record] of records.entries()) {
		const status = classifyStoredRoot(record, primary, claimed, duplicated.has(record.id), index);
		statuses.push(status);
		if (status.state === "available") claimed.push(status.path);
	}
	return statuses;
}
/**
* The ids that more than one record claims. Computed for the whole list up
* front, because "this id is duplicated" is a property of the SET: deciding it
* while walking would make the first occurrence look fine and only the later
* ones broken, and the first match is precisely the ambiguity being reported.
*/
function duplicatedIds(records) {
	const seen = /* @__PURE__ */ new Set();
	const duplicated = /* @__PURE__ */ new Set();
	for (const record of records) if (seen.has(record.id)) duplicated.add(record.id);
	else seen.add(record.id);
	return duplicated;
}
/**
* Judge one stored record against the primary root and the roots claimed before
* it.
*
* Identity and the recorded directory are checked BEFORE the current
* resolution is used for anything: a record whose path now resolves elsewhere
* must not have its new (attacker-influenced) target participate in the
* overlap rules.
*/
function classifyStoredRoot(record, primary, claimed, duplicatedId, position) {
	const invalid = (detail) => ({
		...record,
		state: "invalid",
		detail
	});
	if (typeof record.path !== "string" || record.path === "") return invalid("the record has no path");
	if (typeof record.id !== "string" || record.id === "") return invalid("the record has no id");
	if (duplicatedId) return invalid(`the id "${record.id}" is used by more than one record (entry ${position + 1})`);
	if (!isAbsolute(record.path)) return invalid(`"${record.path}" is not an absolute path`);
	const recorded = record.recordedPath;
	if (typeof recorded !== "string" || recorded === "") return invalid("the record does not say which directory it was granted for");
	const canonical = canonicalRoot(record.path);
	if (!samePath(canonical, recorded)) return {
		...record,
		state: "redirected",
		detail: `the path now resolves to "${canonical}" instead of the registered "${recorded}"`
	};
	if (samePath(canonical, primary)) return invalid(`"${canonical}" is this session's workspace root`);
	if (isCanonicallyUnder(canonical, primary) || isCanonicallyUnder(primary, canonical)) return invalid(`"${canonical}" overlaps this session's workspace root`);
	if (claimed.some((existing) => samePath(existing, canonical))) return invalid(`"${canonical}" is registered twice`);
	for (const existing of claimed) if (isCanonicallyUnder(canonical, existing) || isCanonicallyUnder(existing, canonical)) return invalid(`"${canonical}" overlaps the registered root "${existing}"`);
	let isDirectory = false;
	try {
		isDirectory = statSync(canonical).isDirectory();
	} catch {
		isDirectory = false;
	}
	if (!isDirectory) return {
		...record,
		path: canonical,
		state: "missing",
		detail: "the directory is not present right now"
	};
	return {
		...record,
		path: canonical,
		state: "available"
	};
}
/**
* The canonical roots a status list grants, in registry order.
* @param statuses - the statuses to project.
* @returns the canonical paths of every `available` root.
*/
function availableRoots(statuses) {
	return statuses.filter((status) => status.state === "available").map((status) => status.path);
}
/**
* Pair every status with the 1-based ordinal the surfaces accept for it. The
* ordinal belongs to the POSITION, so it stays correct even for records whose
* id is duplicated or missing — which is exactly the case where a positional
* removal is the only unambiguous way to delete one of them.
* @param statuses - the statuses to index.
* @returns one entry per status, in the same order.
*/
function indexedStatuses(statuses) {
	return statuses.map((status, index) => ({
		ordinal: index + 1,
		status
	}));
}
/**
* Resolve one operator-supplied reference against a status list.
* @param statuses - the statuses to search, in registry order.
* @param ref - the reference to resolve.
* @returns the matched status.
* @throws {RootValidationError} `not-found` when nothing matches.
*/
function resolveRootRef(statuses, ref) {
	return statuses[resolveRootIndex(statuses, ref)];
}
/**
* Resolve one reference to its exact position.
*
* Id/path references are accepted only when unique. An `entry` reference also
* verifies the row identity captured by the surface, so a concurrent reorder
* cannot turn a click into an operation on a different record.
*/
function resolveRootIndex(statuses, ref) {
	const reference = describeRef(ref);
	const matches = (predicate) => {
		const result = [];
		for (const [index, status] of statuses.entries()) if (predicate(status)) result.push(index);
		return result;
	};
	const indices = (() => {
		switch (ref.kind) {
			case "id": return matches((status) => status.id === ref.id);
			case "ordinal": return ref.ordinal >= 1 && ref.ordinal <= statuses.length ? [ref.ordinal - 1] : [];
			case "path": {
				const canonical = canonicalRoot(expandRootInput(ref.path));
				return matches((status) => samePath(status.path, canonical));
			}
			case "entry": {
				const sameEntry = (status) => status.id === ref.id && samePath(status.path, ref.path) && status.addedAt === ref.addedAt;
				const found = matches(sameEntry);
				if (found.length !== 1) return found;
				const expected = ref.ordinal - 1;
				return expected === found[0] ? [expected] : found;
			}
		}
	})();
	if (indices.length === 0) throw new RootValidationError("not-found", `no registered root matches ${reference}`, { reference });
	if (indices.length > 1) throw new RootValidationError("invalid-ref", `${reference} matches more than one registered root; use its displayed number`, { reference });
	return indices[0];
}
/** Capture a list row as a mutation-safe reference. */
function entryRootRef(status, ordinal) {
	return {
		kind: "entry",
		ordinal,
		id: status.id,
		path: status.path,
		addedAt: status.addedAt
	};
}
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
function removeStatusAt(statuses, ref) {
	const index = resolveRootIndex(statuses, ref);
	return statuses.filter((_status, position) => position !== index);
}
/** Render one reference for messages. */
function describeRef(ref) {
	switch (ref.kind) {
		case "id": return `id "${ref.id}"`;
		case "ordinal": return `#${ref.ordinal}`;
		case "path": return `"${ref.path}"`;
		case "entry": return `entry #${ref.ordinal} (${ref.path})`;
	}
}
//#endregion
export { classifyStoredRoots as a, indexedStatuses as c, resolveRootIndex as d, resolveRootRef as f, canonicalRoot as i, isCanonicallyUnder as l, validateRootCandidate as m, additionalRootId as n, entryRootRef as o, sameCanonicalPath as p, availableRoots as r, expandRootInput as s, RootValidationError as t, removeStatusAt as u };
