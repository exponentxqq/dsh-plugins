import { createHash } from "node:crypto";
import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
import { fileURLToPath } from "node:url";
//#region src/dialects.ts
/**
* Raised when a confined argv cannot be recognized or widened. The provider
* converts this into the fail-closed `SandboxUnavailableError`: an unrecognized
* dialect must never degrade into "the primary root was granted after all".
*/
var DialectUnrecognizedError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "DialectUnrecognizedError";
	}
};
/** The one SBPL form that carries the writable subpath grants. */
const SBPL_SUBPATH_FORM = /\(allow file-write\*\s*(?:\(subpath\s+"(?:[^"\\]|\\.)*"\)\s*)+\)/;
/** One SBPL `(subpath "…")` token inside that form. */
const SBPL_SUBPATH_TOKEN = /\(subpath\s+("(?:[^"\\]|\\.)*")\)/g;
/**
* Split a `confine()` result at the separator by arithmetic, then VERIFY the
* split: `confine` builds `[...profileArgs, '--', ...argv]`, so the separator
* sits exactly one element before the caller's argv. A mismatch means the
* provider no longer wraps argv the way this module assumes.
* @param confinedArgv - the argv `confine` returned.
* @param commandArgv - the argv the caller passed to `confine`.
* @returns the recognized dialect and the split parts.
*/
function splitConfined(confinedArgv, commandArgv) {
	const separator = confinedArgv.length - commandArgv.length - 1;
	if (separator < 1 || confinedArgv[separator] !== "--") throw new DialectUnrecognizedError(`confined argv is not "[...profile, --, ...argv]" (separator expected at ${separator}, got ${JSON.stringify(confinedArgv[separator])})`);
	const commandArgs = confinedArgv.slice(separator + 1);
	if (commandArgs.length !== commandArgv.length || commandArgs.some((argument, index) => argument !== commandArgv[index])) throw new DialectUnrecognizedError("confined argv does not end with the caller's argv verbatim");
	const profileArgs = confinedArgv.slice(0, separator);
	return {
		dialect: detectDialect(profileArgs),
		profileArgs,
		separator,
		commandArgs
	};
}
/**
* Recognize the runner dialect from the profile arguments alone. Exactly one
* marker must match; zero or several are both unrecognized.
* @param profileArgs - everything before the separator.
* @returns the dialect.
*/
function detectDialect(profileArgs) {
	const matches = [];
	if (profileArgs.length >= 2 && profileArgs[profileArgs.length - 2] === "-p") matches.push("seatbelt");
	if (profileArgs.includes("--mode")) matches.push("windows-acl");
	if (profileArgs.includes("--rw")) matches.push("landlock");
	if (profileArgs.includes("--ro-bind")) matches.push("bwrap");
	const [first, ...rest] = matches;
	if (first === void 0) throw new DialectUnrecognizedError(`unrecognized sandbox profile arguments: ${JSON.stringify(profileArgs)}`);
	if (rest.length > 0) throw new DialectUnrecognizedError(`ambiguous sandbox profile arguments (${matches.join(", ")}): ${JSON.stringify(profileArgs)}`);
	return first;
}
/**
* Widen one dialect's profile arguments with the additional roots.
*
* Only `workspace-write` grants roots, mirroring the upstream mode meaning and
* the filesystem fence: `read-only` grants nothing, and `danger-full-access`
* never confines at all (bash and the PTY backend skip `confine` in that mode).
*
* A root the dialect ALREADY grants is not granted twice — that keeps this
* function aligned with the fence's own deduplication and, on bwrap, avoids
* binding the real `/tmp` over the ephemeral `--tmpfs /tmp` mount.
* @param dialect - the recognized dialect.
* @param profileArgs - the profile arguments to widen.
* @param policy - the per-call policy (its root is the policy root, never a new grant).
* @param additionalRoots - canonical additional roots, in scope order.
* @returns the widened profile arguments.
*/
function widenProfileArgs(dialect, profileArgs, policy, additionalRoots) {
	if (policy.mode !== "workspace-write") throw new DialectUnrecognizedError(`dialect "${dialect}" grants write roots only under workspace-write, got mode "${policy.mode}"`);
	if (additionalRoots.length === 0) return [...profileArgs];
	switch (dialect) {
		case "seatbelt": return widenSeatbelt(profileArgs, additionalRoots);
		case "bwrap": return widenBwrap(profileArgs, policy.workspaceRoot, additionalRoots);
		case "landlock": return widenLandlock(profileArgs, policy.workspaceRoot, additionalRoots);
		case "windows-acl": throw new DialectUnrecognizedError("Windows ACL widening requires widenWindowsProfile");
	}
}
/** Quote one path exactly the way the upstream Seatbelt profile builder does. */
function sbplString(path) {
	return `"${path.replaceAll("\\", String.raw`\\`).replaceAll("\"", String.raw`\"`)}"`;
}
/** Unquote one SBPL string literal (including its surrounding quotes). */
function sbplValue(literal) {
	return literal.slice(1, -1).replaceAll(String.raw`\"`, "\"").replaceAll(String.raw`\\`, "\\");
}
/** Append the additional roots to the SBPL form that carries the subpath grants. */
function widenSeatbelt(profileArgs, additionalRoots) {
	const profile = profileArgs[profileArgs.length - 1];
	if (profile === void 0 || profileArgs[profileArgs.length - 2] !== "-p") throw new DialectUnrecognizedError(`seatbelt profile is not "[<sandbox-exec>, …, -p, <SBPL>]": ${JSON.stringify(profileArgs)}`);
	const form = SBPL_SUBPATH_FORM.exec(profile);
	if (form === null) throw new DialectUnrecognizedError(`seatbelt profile has no "(allow file-write* (subpath …))" form to extend: ${JSON.stringify(profile)}`);
	const matched = form[0];
	const granted = new Set([...matched.matchAll(SBPL_SUBPATH_TOKEN)].map((token) => sbplValue(token[1])));
	const added = additionalRoots.filter((root) => !granted.has(root)).map((root) => `(subpath ${sbplString(root)})`);
	if (added.length === 0) return [...profileArgs];
	const widened = profile.slice(0, form.index) + matched.slice(0, -1) + ` ${added.join(" ")})` + profile.slice(form.index + matched.length);
	return [...profileArgs.slice(0, -1), widened];
}
/**
* The observed bwrap bind flag: the flag of the `[flag, <root>, <root>]` triple
* upstream built for the policy root.
*/
function bwrapBindFlag(profileArgs, workspaceRoot) {
	for (let index = 2; index < profileArgs.length; index += 1) {
		if (profileArgs[index] !== workspaceRoot || profileArgs[index - 1] !== workspaceRoot) continue;
		const flag = profileArgs[index - 2];
		if (flag === void 0 || !flag.startsWith("--") || flag.startsWith("--ro")) continue;
		return flag;
	}
	throw new DialectUnrecognizedError(`bwrap profile has no writable bind of the policy root ${JSON.stringify(workspaceRoot)}: ${JSON.stringify(profileArgs)}`);
}
/** Append the additional roots as binds, after upstream's own root bind. */
function widenBwrap(profileArgs, workspaceRoot, additionalRoots) {
	const flag = bwrapBindFlag(profileArgs, workspaceRoot);
	const granted = /* @__PURE__ */ new Set();
	for (let index = 0; index + 2 < profileArgs.length; index += 1) if (profileArgs[index] === flag && profileArgs[index + 1] === profileArgs[index + 2]) granted.add(profileArgs[index + 2]);
	for (let index = 0; index + 1 < profileArgs.length; index += 1) if (profileArgs[index] === "--tmpfs") granted.add(profileArgs[index + 1]);
	const added = additionalRoots.filter((root) => !granted.has(root)).flatMap((root) => [
		flag,
		root,
		root
	]);
	return [...profileArgs, ...added];
}
/**
* The observed Landlock read-write flag: the flag preceding the policy root in
* the launcher's grant arguments.
*/
function landlockReadWriteFlag(profileArgs, workspaceRoot) {
	for (let index = 1; index < profileArgs.length; index += 1) {
		if (profileArgs[index] !== workspaceRoot) continue;
		const flag = profileArgs[index - 1];
		if (flag === void 0 || !flag.startsWith("--") || flag.startsWith("--ro")) continue;
		return flag;
	}
	throw new DialectUnrecognizedError(`landlock profile has no read-write grant of the policy root ${JSON.stringify(workspaceRoot)}: ${JSON.stringify(profileArgs)}`);
}
/** Append the additional roots as read-write grants, after upstream's own root grant. */
function widenLandlock(profileArgs, workspaceRoot, additionalRoots) {
	const flag = landlockReadWriteFlag(profileArgs, workspaceRoot);
	const granted = /* @__PURE__ */ new Set();
	for (let index = 0; index + 1 < profileArgs.length; index += 1) if (profileArgs[index] === flag) granted.add(profileArgs[index + 1]);
	const added = additionalRoots.filter((root) => !granted.has(root)).flatMap((root) => [flag, root]);
	return [...profileArgs, ...added];
}
//#endregion
//#region src/windows-profile.ts
/** Windows runner argv and capability identity. No Win32 calls at module load. */
/** A root-set capability: removing or adding a root changes the token's identity. */
function workspaceScopeSid(roots) {
	const paths = [...new Set(roots.map((root) => root.toLowerCase()))].sort();
	const hash = createHash("sha256").update("dsh-multi-root-workspace\0").update(JSON.stringify(paths)).digest();
	return `S-1-4-${[
		0,
		4,
		8,
		12
	].map((offset) => hash.readUInt32LE(offset) % (2 ** 30 - 1) + 1).join("-")}-2`;
}
/** Strictly recognize the upstream public runner contract, failing closed on new flags. */
function parseWindowsProfile(args, allowAdditional = false) {
	const fields = /* @__PURE__ */ new Map();
	const additionalRoots = [];
	const known = /* @__PURE__ */ new Set([
		"--workspace",
		"--temp",
		"--mode",
		"--write-sid",
		"--temp-write-sid"
	]);
	for (let index = 0; index < args.length; index += 2) {
		const key = args[index];
		const value = args[index + 1];
		if (key === void 0 || value === void 0 || value === "") throw new DialectUnrecognizedError("Windows ACL profile has a missing value");
		if (allowAdditional && key === "--additional-root") {
			additionalRoots.push(value);
			continue;
		}
		if (!known.has(key) || fields.has(key)) throw new DialectUnrecognizedError(`Windows ACL profile has unknown or duplicate flag ${key}`);
		fields.set(key, value);
	}
	const workspace = fields.get("--workspace");
	const temp = fields.get("--temp");
	if (workspace === void 0 || temp === void 0 || fields.get("--mode") !== "workspace-write") throw new DialectUnrecognizedError("Windows multi-root requires --workspace, --temp and --mode workspace-write");
	const writeSid = fields.get("--write-sid");
	const tempWriteSid = fields.get("--temp-write-sid");
	if (writeSid === void 0 !== (tempWriteSid === void 0)) throw new DialectUnrecognizedError("Windows ACL profile requires both capability SIDs or neither");
	return {
		workspace,
		temp,
		mode: "workspace-write",
		additionalRoots,
		...writeSid === void 0 ? {} : { writeSid },
		...tempWriteSid === void 0 ? {} : { tempWriteSid }
	};
}
function widenWindowsProfile(profile, roots, primaryRoot) {
	if (profile.length < 2 || profile[0] === void 0 || profile[1]?.startsWith("--")) throw new DialectUnrecognizedError("Windows ACL runner invocation is not [node, runner, ...flags]");
	const parsed = parseWindowsProfile(profile.slice(2));
	if (primaryRoot !== void 0 && canonicalPath(parsed.workspace) !== primaryRoot) throw new DialectUnrecognizedError("Windows ACL profile workspace does not match the policy root");
	return [
		profile[0],
		fileURLToPath(new URL("./windows-runner.js", import.meta.url)),
		...profile.slice(2),
		...roots.flatMap((root) => ["--additional-root", root])
	];
}
//#endregion
export { splitConfined as a, DialectUnrecognizedError as i, widenWindowsProfile as n, widenProfileArgs as o, workspaceScopeSid as r, parseWindowsProfile as t };
