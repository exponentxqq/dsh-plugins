import { l as isCanonicallyUnder } from "./roots-DejK8QSE.js";
import { createRequire } from "node:module";
import "@deepseek-ai/cordis";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
//#region src/compat/agent-instructions.ts
/**
* Compatibility adapter for upstream's instruction discovery and rendering.
*
* `@deepseek-ai/dsh-agent-instructions` renamed its renderer between two
* releases this plugin supports, without changing its signature:
*
* ```text
* 0.1.5-rc.2     renderWorkspaceContext(files, options)   RenderedWorkspaceContext
* 0.1.6-alpha.1  renderAgentInstructions(files, options)  RenderedAgentInstructions
* ```
*
* `discoverBaselineInstructionFiles` kept both its name and its signature.
*
* All coupling to that package is concentrated here so the business layer
* (`src/instructions.ts`) only ever calls {@link renderInstructions} and
* {@link InstructionsApi.discover}. A future rename is one edit in this file,
* not a version check sprinkled through the provider.
*
* The export is picked by NAME rather than by comparing the release string:
* a structural probe also copes with upstream keeping both names for a release,
* or reshaping within one, which a version comparison does not.
*
* The package is loaded LAZILY, and its genuine ABSENCE is reported as absence
* rather than thrown. It is an optional peer: the default DSH bundle mounts it,
* but a minimal composition legitimately has neither it nor an agent, and in
* that case this plugin's instruction row must simply contribute nothing. A
* package that is present but cannot be evaluated is a different answer, and
* one this adapter reports instead of caching as absence.
*
* @module dsh-plugin-multi-root-workspace/compat/agent-instructions
*/
/** Raised when the package is present but carries neither renderer name. */
var DshInstructionApiError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "DshInstructionApiError";
	}
};
/** Resolution is attempted once per process; `null` records a confirmed absence. */
let resolution;
/**
* Pick the renderer this release exports.
* @param module - the loaded upstream module.
* @returns the renderer.
* @throws {DshInstructionApiError} when neither name is present.
*/
function selectRenderer(module) {
	const render = module.renderAgentInstructions ?? module.renderWorkspaceContext;
	if (render === void 0) throw new DshInstructionApiError("multi-root workspace: @deepseek-ai/dsh-agent-instructions exports neither renderAgentInstructions (0.1.6 and later) nor renderWorkspaceContext (0.1.5); the additional roots' instruction files cannot be rendered. Adapt src/compat/agent-instructions.ts to the installed release.");
	return render;
}
/**
* Adapt one loaded upstream module to {@link InstructionsApi}.
* @param module - the loaded upstream module.
* @returns the adapted surface.
* @throws {DshInstructionApiError} when a function this plugin needs is absent.
*/
function adaptInstructionsModule(module) {
	const discover = module.discoverBaselineInstructionFiles;
	if (discover === void 0) throw new DshInstructionApiError("multi-root workspace: @deepseek-ai/dsh-agent-instructions does not export discoverBaselineInstructionFiles; adapt src/compat/agent-instructions.ts to the installed release.");
	return {
		discover: (options) => discover(options),
		render: selectRenderer(module)
	};
}
/**
* Whether one package is installed at all, judged WITHOUT evaluating it.
*
* This is what separates "the optional peer is absent" from "the optional peer
* is installed but its evaluation fails" (a missing transitive dependency, a
* broken build). Only a genuine resolvability failure counts as absence: a
* resolution that fails for another reason (an `exports` map with no `require`
* condition, say) leaves the verdict to the `import()` below, which is the
* authority on whether the module can actually be loaded.
* @param specifier - the bare package specifier to probe.
* @returns whether the package resolves from this module.
*/
function isPackageInstalled(specifier) {
	try {
		createRequire(import.meta.url).resolve(specifier);
		return true;
	} catch (error) {
		const code = error?.code;
		return code !== "MODULE_NOT_FOUND" && code !== "ERR_MODULE_NOT_FOUND";
	}
}
/**
* Load and adapt the upstream instruction surface, once.
*
* @returns the adapted surface, or `undefined` when the package is not
*   installed. A package that IS installed but exports neither renderer throws
*   instead: that is a compatibility break to fix, not an optional seam. So
*   does one that is installed but cannot be evaluated at all — a missing
*   transitive dependency, a broken build — because reporting that as absence
*   would drop every additional root's instructions for the rest of the
*   process. See {@link isPackageInstalled} for how the two are told apart.
*/
async function instructionsApi() {
	resolution ??= (async () => {
		if (!isPackageInstalled("@deepseek-ai/dsh-agent-instructions")) return null;
		return adaptInstructionsModule(await import("@deepseek-ai/dsh-agent-instructions"));
	})();
	return await resolution ?? void 0;
}
/**
* Render loaded instruction files within a byte budget, through whichever
* renderer the installed release exports.
*
* This is the only rendering entry point the business layer uses.
* @param files - loaded files, ordered broadest to most specific.
* @param options - the byte budget.
* @returns the rendered text and its budget diagnostics.
* @throws {DshInstructionApiError} when no usable renderer is installed.
*/
async function renderInstructions(files, options) {
	const api = await instructionsApi();
	if (api === void 0) throw new DshInstructionApiError("multi-root workspace: @deepseek-ai/dsh-agent-instructions is not installed, so instruction files cannot be rendered. Check for its presence with instructionsApi() before calling renderInstructions().");
	return api.render(files, options);
}
//#endregion
//#region src/compat/llm-message.ts
/**
* This plugin's own producer kind.
*
* Session format 4 rejects the shared `kind: 'plugin'` (`format v4 message
* requires a producer-owned source kind`). The kind is ours, not
* `agent-instructions`: upstream treats that kind's `changes` array as its
* own reconciliation authority.
*/
const PRODUCER_SOURCE_KIND = "multi-root-workspace";
/**
* The first session format whose encoder refuses `kind: 'plugin'`.
* Earlier formats declare that kind on `MessageSourceMap` and require it.
*/
const PRODUCER_OWNED_FORMAT = 4;
/**
* Which source kind the installed session format will persist.
* @param formatVersion - `SESSION_FORMAT_VERSION`, when the session package is installed.
* @returns `plugin` through format 3, and this plugin's own kind from format 4 on.
*/
function instructionSourceKind(formatVersion) {
	return formatVersion !== void 0 && formatVersion >= PRODUCER_OWNED_FORMAT ? PRODUCER_SOURCE_KIND : "plugin";
}
/**
* The installed session format, when that package is present.
*
* A composition that never persists a session can omit the package; format 3
* is then the spelling that still declares `kind: 'plugin'`. Any other failure
* is a broken install and must surface.
* @returns the format version, or `undefined` when the package is not installed.
*/
async function installedFormatVersion() {
	try {
		const session = await import("@deepseek-ai/dsh-session");
		return typeof session.SESSION_FORMAT_VERSION === "number" ? session.SESSION_FORMAT_VERSION : void 0;
	} catch (error) {
		const code = error.code;
		if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return void 0;
		throw error;
	}
}
/**
* Build one user-role instruction message.
*
* Format 3 and earlier: `{ kind: 'plugin', plugin, form: 'instructions' }`.
* Format 4 and later: `{ kind: 'multi-root-workspace', plugin, form: 'instructions' }`.
* @param input - the body and the plugin attribution.
* @returns the frozen message upstream's helper produced.
* @throws {Error} when the optional peer is absent: a step that has instruction
*   text to deliver cannot be served without it, and staying silent would drop
*   user-visible context instead of reporting a misconfigured composition.
*/
async function createInstructionMessage(input) {
	let module;
	try {
		module = await import("@deepseek-ai/dsh-llm");
	} catch (error) {
		throw new Error(`multi-root workspace: @deepseek-ai/dsh-llm is not installed, so additional roots' instruction files cannot be delivered as messages (${error instanceof Error ? error.message : String(error)}).`);
	}
	const create = module.createUserMessage;
	return create({
		content: [{
			type: "text",
			text: input.text
		}],
		source: instructionSource(input.plugin, await installedFormatVersion())
	});
}
/** The source object the installed format will persist. */
function instructionSource(plugin, formatVersion) {
	const kind = instructionSourceKind(formatVersion);
	if (kind === "plugin") return {
		kind,
		plugin,
		form: "instructions"
	};
	return {
		kind,
		plugin,
		form: "instructions"
	};
}
//#endregion
//#region src/compat/tool-result.ts
/**
* Whether a tool-result message reports failure, on every supported release.
* @param message - the `tool/result` message from the session log.
* @returns `true` when either spelling says the call failed.
*/
function toolResultFailed(message) {
	if (message.isError === true) return true;
	const block = message.content?.[0];
	if (typeof block !== "object" || block === null || !("isError" in block)) return false;
	return block.isError === true;
}
//#endregion
//#region src/instructions.ts
/**
* `multi-root-instructions`: the additional roots' own instruction files, made
* visible to the model.
*
* Upstream `agent-instructions` discovers instruction files by walking UP from
* the session cwd (plus the one user-global file). In a multi-root workspace
* that walk never reaches an additional root, so `repo-b/AGENTS.md` is
* invisible to a model that is nevertheless allowed to write `repo-b`. This row
* closes exactly that gap, and nothing else: the primary root's chain — nested
* files included — and the user-global file stay upstream's business.
*
* Four deliberate choices:
*
* 1. **Not a system-prompt contribution.** Instruction text is
*    producer-supplied context, not system authority, so it enters as a
*    user-role message tagged `form: 'instructions'`. Through session format 3
*    the source kind is `plugin`; format 4 retired that shared kind, so the
*    adapter persists this plugin's own (`multi-root-workspace`). It is also
*    the only channel that is logged, and model-visible content must be logged.
* 2. **Injected from `agent/pre-step`, not a session lifecycle event.**
*    `pre-step` is an awaited waterfall, so discovery, reading and rendering all
*    complete BEFORE the step it feeds — deterministically, on the first step.
*    A synchronous prompt callback could not await them, and an emit-mode
*    lifecycle listener would race the first step. It is also the one hook whose
*    shape is identical across every supported release, which keeps the
*    instruction feature out of the compatibility matrix (ADR-0009).
* 3. **Discovery is pinned to the root.** `projectRoot` is the additional root,
*    so the walk can never leave it, and every candidate is then required to be
*    canonically INSIDE that root. That is what keeps `$DSH_HOME/AGENTS.md`, the
*    primary root's `AGENTS.md`, and any ancestor's file from being injected a
*    second time by this plugin.
* 4. **Nested files are driven by the session's own tool activity.** A
*    subdirectory's `AGENTS.md` only matters once the session has worked in that
*    subdirectory, so the directories worth examining are derived from the
*    session's persisted events: `tool/call` and `tool/result` are paired, and a
*    successful `read`/`write`/`edit` makes the path from the root down to the
*    touched file's directory relevant (ADR-0010). A file that disappears is
*    retracted explicitly, because the text it contributed earlier is still in
*    the conversation and silence does not withdraw it.
*
* The byte budget is shared: `maxBytes` bounds the WHOLE additional-root
* snapshot, not each root, because ten roots must not quietly cost ten budgets
* of context. Roots consume it in scope order. Retractions are exempt, because a
* truncated withdrawal is worse than a slightly over-budget message.
*
* @module dsh-plugin-multi-root-workspace/instructions
*/
/** The `plugin` attribution every message this row produces carries. */
const PLUGIN_SOURCE = "dsh-plugin-multi-root-workspace";
/**
* Total UTF-8 byte budget for the additional-root snapshot, matching the
* default the upstream `agent-instructions` row is composed with so that one
* extra workspace root costs at most as much as the primary one does.
*/
const DEFAULT_MAX_BYTES = 65536;
/** Largest instruction file this row will read; larger files are ignored. */
const DEFAULT_MAX_SOURCE_BYTES = 32768;
/** Tools whose SUCCESS makes the directories on the path to the file relevant. */
const FILE_TOUCH_TOOL_NAMES = {
	read: true,
	write: true,
	edit: true
};
/** Cap on unanswered `tool/call` records remembered per session. */
const MAX_PENDING_CALLS = 128;
/** Cap on touched paths remembered per session; beyond it, touches are dropped. */
const MAX_TOUCHED_PATHS = 64;
/** Cap on delivered scopes remembered per session; beyond it, nested scopes stop. */
const MAX_DELIVERED_SCOPES = 512;
/** Digest one file's content. Content-addressed, so identical content never re-sends. */
function digestOf(text) {
	return createHash("sha256").update(text).digest("hex");
}
/**
* The scope identity of one candidate instruction file.
*
* NUL-joined, so two additional roots carrying the same relative
* `AGENTS.md` can never collide on one key.
* @param root - the canonical additional root.
* @param relativeDirectory - the file's directory, relative to the root, `.` for the root itself.
* @param fileName - the instruction file's name.
* @returns the scope key.
*/
function scopeKey(root, relativeDirectory, fileName) {
	return `${root}\0${relativeDirectory}\0${fileName}`;
}
/** A directory's location within its root, spelled `.` for the root itself. */
function relativeDirectoryOf(root, directory) {
	const suffix = relative(root, directory);
	return suffix.length === 0 ? "." : suffix;
}
/**
* The path one RAW tool call touched.
*
* `arguments` is the model-produced JSON string, so the path is only known after
* parsing it; a call that names no `file_path`, or is not one of the tools whose
* success makes a directory relevant, touched nothing this row cares about.
* @param name - the tool name the model called.
* @param argumentsJson - the tool call's raw arguments, exactly as produced.
* @returns the trimmed absolute-or-relative path, or `undefined`.
*/
function touchedPathOfToolCall(name, argumentsJson) {
	if (FILE_TOUCH_TOOL_NAMES[name] !== true) return void 0;
	let parsed;
	try {
		parsed = JSON.parse(argumentsJson);
	} catch {
		return;
	}
	if (typeof parsed !== "object" || parsed === null) return void 0;
	if (!("file_path" in parsed)) return void 0;
	const path = parsed.file_path;
	if (typeof path !== "string") return void 0;
	const trimmed = path.trim();
	return trimmed.length > 0 ? trimmed : void 0;
}
/**
* The directory a touched path's instructions would live in.
*
* Tool arguments are the model's raw input, so a relative `file_path` is
* resolved against the session cwd — the base the tool layer itself uses —
* rather than against this process's cwd. Mac's `realpath` spelling is applied
* here so the result compares against the canonical roots.
* @param path - a touched path, absolute or relative to the session cwd.
* @param session - the session the touch belongs to.
* @returns the canonical parent directory, or `undefined` when it cannot be named.
*/
function parentDirectoryOf(path, session) {
	const cwd = session.header.cwd;
	const absolute = isAbsolute(path) ? path : cwd === void 0 ? void 0 : resolve(cwd, path);
	if (absolute === void 0) return void 0;
	try {
		return canonicalPath(dirname(absolute));
	} catch {
		return;
	}
}
/** Cap warnings are emitted once per process; the cap itself is not user-facing. */
let scopeCapWarned = false;
/**
* Compose the model-facing message body for one batch of changes.
*
* All three halves matter. A newly visible root — or a newly touched
* subdirectory — needs its rules; a root that left needs an explicit
* revocation; and a file that disappeared needs an explicit withdrawal, because
* the instructions it contributed are still sitting in the conversation history
* and would otherwise keep applying forever. Silence is not a retraction.
* @param rendered - roots whose instruction text is new or changed.
* @param revoked - canonical roots that left the workspace scope.
* @param removed - instruction files that are no longer present.
* @returns the message text, or `undefined` when there is nothing to say.
*/
function composeInstructionMessage(rendered, revoked, removed) {
	if (rendered.length === 0 && revoked.length === 0 && removed.length === 0) return void 0;
	const sections = ["Additional workspace root instructions. The directories below are additional roots of this session's workspace; the instruction files found at their top level, and in the subdirectories this session has worked in, follow, and they apply to work in those directories exactly as this workspace's own instructions apply to the session root."];
	for (const entry of rendered) sections.push(`Instructions for additional workspace root ${entry.root}:\n\n${entry.text}`);
	for (const root of revoked) sections.push(`The directory ${root} is no longer an additional root of this session's workspace. Any instructions previously supplied for it in this conversation no longer apply, and it is no longer writable here.`);
	for (const scope of [...removed].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)) sections.push(`The instruction file ${scope.path} is no longer present in the additional workspace root ${scope.root}, so the instructions it supplied earlier no longer apply.`);
	return sections.join("\n\n");
}
/** This row is gated on the compatibility contract like every other provider. */
const inject = [
	"multiRootCompat",
	"multiRootScope",
	"sandboxPolicy"
];
/**
* Mount the additional-root instruction provider.
*
* `fs` is a SOFT dependency, like the scope service's prompt contribution: a
* composition with no filesystem seam (headless probes, bare test contexts)
* contributes nothing instead of failing to load. The same is true of the
* upstream instruction package, which is an optional peer.
*
* Touch recording is registered OUTSIDE the `fs` injection, so a composition
* without a filesystem seam still learns which directories the session worked
* in; delivery is what needs the seam.
* @param ctx - the row's context.
* @param config - the row's configuration.
*/
function apply(ctx, config = {}) {
	const maxBytes = config.maxBytes ?? 65536;
	if (maxBytes <= 0 || !Number.isFinite(maxBytes)) return;
	const states = /* @__PURE__ */ new WeakMap();
	const callsBySession = /* @__PURE__ */ new WeakMap();
	const stateOf = (session) => {
		const existing = states.get(session);
		if (existing !== void 0) return existing;
		const created = {
			scopes: /* @__PURE__ */ new Map(),
			touched: /* @__PURE__ */ new Set()
		};
		states.set(session, created);
		return created;
	};
	ctx.on("session/event", (session, event) => {
		const pendingCalls = callsBySession.get(session) ?? /* @__PURE__ */ new Map();
		callsBySession.set(session, pendingCalls);
		if (event.type === "tool/call") {
			if (pendingCalls.size >= MAX_PENDING_CALLS) {
				const oldest = pendingCalls.keys().next();
				if (!oldest.done) pendingCalls.delete(oldest.value);
			}
			pendingCalls.set(event.data.callId, {
				name: event.data.name,
				arguments: event.data.arguments
			});
			return;
		}
		if (event.type !== "tool/result") return;
		const callId = event.data.message.source.callId;
		const call = pendingCalls.get(callId);
		pendingCalls.delete(callId);
		if (call === void 0) return;
		if (event.data.error !== void 0 || toolResultFailed(event.data.message)) return;
		const path = touchedPathOfToolCall(call.name, call.arguments);
		if (path === void 0) return;
		const state = stateOf(session);
		if (state.touched.size >= MAX_TOUCHED_PATHS) return;
		state.touched.add(path);
	});
	ctx.inject(["fs"], (scope) => {
		scope.on("agent/pre-step", async ({ agent, messages, signal }, next) => {
			const decision = await next();
			if (decision.kind !== "enter") return decision;
			const seeded = await pending(scope, states, agent, config, maxBytes, signal);
			if (seeded === void 0) return decision;
			signal.throwIfAborted();
			const lastClaimed = decision.messages.findLastIndex((message) => messages.includes(message));
			return {
				...decision,
				messages: decision.messages.toSpliced(lastClaimed + 1, 0, seeded)
			};
		});
	});
}
/**
* Compute the message this step should carry, if any.
*
* Returns `undefined` — the steady state — whenever every delivered file is
* still current, so a long session does not re-send the same text on every step.
* @param ctx - the injected scope, which owns `fs` and the services.
* @param states - per-session delivery state.
* @param agent - the agent whose step this is.
* @param config - the row's configuration.
* @param maxBytes - the total budget for all additional roots.
* @param signal - the turn's cancellation signal.
* @returns the message to inject, or `undefined`.
*/
async function pending(ctx, states, agent, config, maxBytes, signal) {
	const session = agent.session;
	const state = states.get(session) ?? {
		scopes: /* @__PURE__ */ new Map(),
		touched: /* @__PURE__ */ new Set()
	};
	states.set(session, state);
	const evaluatedTouches = new Set(state.touched);
	let retryTouches = false;
	const scope = ctx.multiRootScope.resolve(ctx.sandboxPolicy.resolve({ session }));
	const granted = new Set(scope.additionalRoots);
	const revoked = [...new Set([...state.scopes.values()].map((entry) => entry.root))].filter((root) => !granted.has(root));
	const rendered = [];
	const gone = [];
	const updates = [];
	if (scope.additionalRoots.length > 0) {
		const api = await instructionsApi();
		if (api !== void 0) {
			let remaining = maxBytes;
			for (const root of scope.additionalRoots) {
				signal.throwIfAborted();
				const plan = await planRoot(ctx, api, root, config, state, session, signal);
				gone.push(...plan.gone);
				if (plan.deliveries.length === 0) continue;
				if (remaining <= 0) {
					retryTouches = true;
					continue;
				}
				const { text, omitted, truncated } = api.render(plan.deliveries.map((entry) => entry.file), { maxBytes: remaining });
				const omittedPaths = new Set(omitted.map((file) => file.absolutePath));
				const truncatedPaths = new Set(truncated.map((file) => file.displayPath));
				if (omitted.length > 0 || truncated.length > 0 || text === "") retryTouches = true;
				if (text === "") continue;
				remaining -= Buffer.byteLength(text, "utf8");
				rendered.push({
					root,
					text
				});
				for (const entry of plan.deliveries) {
					if (omittedPaths.has(entry.file.absolutePath)) continue;
					updates.push({
						key: entry.key,
						scope: {
							root,
							path: entry.file.absolutePath,
							digest: truncatedPaths.has(entry.file.displayPath) ? void 0 : digestOf(entry.file.content)
						}
					});
				}
			}
		}
	}
	const text = composeInstructionMessage(rendered, revoked, gone.map((entry) => entry.scope));
	const message = text === void 0 ? void 0 : await createInstructionMessage({
		text,
		plugin: PLUGIN_SOURCE
	});
	signal.throwIfAborted();
	if (!retryTouches) for (const touch of evaluatedTouches) state.touched.delete(touch);
	if (text !== void 0) {
		for (const root of revoked) for (const [key, entry] of state.scopes) if (entry.root === root) state.scopes.delete(key);
		for (const entry of gone) state.scopes.delete(entry.key);
		for (const entry of updates) state.scopes.set(entry.key, entry.scope);
	}
	return message;
}
/**
* Plan one additional root's delivery for this step.
*
* Which directories are worth walking is the whole design of phase 2, and the
* set is exactly three things: the root itself (top-level files, as in phase 1,
* so a change or a removal there is noticed every step), every directory a
* nested file was already delivered from (so a change or a removal is noticed
* without a new touch, like upstream's own reconcile), and the parent directory
* of every path the session has touched since the last evaluation — plus each
* of that directory's ancestors up to the root, because discovery reports an
* intermediate directory's file but only the exact directory's candidates
* survive the filter below.
* @param ctx - the row's context, for `fs` and the logger.
* @param api - the adapted upstream instruction surface.
* @param root - the canonical additional root.
* @param config - the row's configuration.
* @param state - the session's delivery state.
* @param session - the session, for the cwd a relative touch resolves against.
* @param signal - the turn's cancellation signal.
* @returns the files to send and the deliveries to withdraw.
*/
async function planRoot(ctx, api, root, config, state, session, signal) {
	const delivered = /* @__PURE__ */ new Map();
	for (const [key, entry] of state.scopes) if (entry.root === root) delivered.set(key, entry);
	const dirs = /* @__PURE__ */ new Set([root]);
	for (const entry of delivered.values()) {
		const dir = dirname(entry.path);
		if (dir !== root) dirs.add(dir);
	}
	for (const touched of state.touched) {
		const parent = parentDirectoryOf(touched, session);
		if (parent === void 0 || !isCanonicallyUnder(parent, root)) continue;
		let dir = parent;
		for (;;) {
			dirs.add(dir);
			if (dir === root) break;
			const up = dirname(dir);
			if (up === dir) break;
			dir = up;
		}
	}
	const walks = [];
	for (const dir of dirs) {
		signal.throwIfAborted();
		walks.push({
			relativeDirectory: relativeDirectoryOf(root, dir),
			read: await loadDirectory(ctx.fs, api, root, config, signal, dir)
		});
	}
	walks.sort((left, right) => left.relativeDirectory.split(sep).length - right.relativeDirectory.split(sep).length || (left.relativeDirectory < right.relativeDirectory ? -1 : left.relativeDirectory > right.relativeDirectory ? 1 : 0));
	const deliveries = [];
	const gone = [];
	for (const walk of walks) {
		if (!walk.read.probed) continue;
		const present = /* @__PURE__ */ new Set();
		for (const candidate of walk.read.candidates) {
			if (relativeDirectoryOf(root, dirname(candidate.absolutePath)) !== walk.relativeDirectory) continue;
			present.add(basename(candidate.absolutePath));
		}
		for (const file of walk.read.files) {
			if (relativeDirectoryOf(root, dirname(file.absolutePath)) !== walk.relativeDirectory) continue;
			const key = scopeKey(root, walk.relativeDirectory, basename(file.absolutePath));
			const previous = delivered.get(key);
			if (previous !== void 0 && previous.digest === digestOf(file.content)) continue;
			if (previous === void 0 && walk.relativeDirectory !== ".") {
				if (state.scopes.size >= MAX_DELIVERED_SCOPES) {
					if (!scopeCapWarned) {
						scopeCapWarned = true;
						ctx.logger.warn("multi-root workspace: additional-root instruction scopes capped at %d", MAX_DELIVERED_SCOPES);
					}
					continue;
				}
			}
			deliveries.push({
				key,
				file
			});
		}
		for (const [key, entry] of delivered) {
			if (relativeDirectoryOf(root, dirname(entry.path)) !== walk.relativeDirectory) continue;
			if (present.has(basename(entry.path))) continue;
			gone.push({
				key,
				scope: {
					root,
					path: entry.path
				}
			});
		}
	}
	return {
		deliveries,
		gone
	};
}
/**
* Walk from `cwd` up to `root` and read the instruction candidates it reports.
*
* Two filters are applied to what the walk reports, and both are load-bearing:
*
* - **canonical containment** drops every candidate that is not inside the root
*   itself, which is what excludes the user-global file and any ancestor's;
* - **the source cap** skips a file too large to be instructions, using `stat`
*   so an oversized file is never read at all.
*
* The pre-filter candidates are returned alongside the loaded ones: they are how
* a caller tells "this file is gone" from "this file could not be read".
*
* `displayPath` is rewritten to the absolute path on purpose: discovery
* displays candidates relative to `projectRoot`, so every root's file would
* otherwise render as the same ambiguous `AGENTS.md`, and the absolute spelling
* is also the one the model must use in a tool call against a directory outside
* the session root.
* @param fs - the filesystem provider to read through.
* @param api - the adapted upstream instruction surface.
* @param root - the canonical additional root the walk stops at.
* @param config - the row's configuration.
* @param signal - the turn's cancellation signal.
* @param cwd - the directory the walk starts from; always inside `root`.
* @returns the directory read.
*/
async function loadDirectory(fs, api, root, config, signal, cwd) {
	const maxSourceBytes = config.maxSourceBytes ?? 32768;
	let candidates;
	try {
		candidates = await api.discover({
			cwd,
			projectRoot: root,
			signal,
			...config.instructionFileCandidates === void 0 ? {} : { instructionFileCandidates: config.instructionFileCandidates },
			...config.localInstructionFileCandidates === void 0 ? {} : { localInstructionFileCandidates: config.localInstructionFileCandidates }
		});
	} catch {
		return {
			candidates: [],
			files: [],
			probed: false
		};
	}
	const files = [];
	for (const candidate of candidates) {
		if (!isCanonicallyUnder(canonicalPath(candidate.absolutePath), root)) continue;
		try {
			const target = await fs.resolve(candidate.absolutePath);
			const info = await fs.stat(target, signal);
			if (info === void 0 || info.type !== "file") continue;
			if (info.size !== void 0 && info.size > maxSourceBytes) continue;
			files.push({
				...candidate,
				displayPath: candidate.absolutePath,
				content: await fs.readText(target, signal)
			});
		} catch {
			continue;
		}
	}
	return {
		candidates,
		files,
		probed: true
	};
}
//#endregion
export { composeInstructionMessage as a, createInstructionMessage as c, apply as i, instructionsApi as l, DEFAULT_MAX_SOURCE_BYTES as n, inject as o, PLUGIN_SOURCE as r, touchedPathOfToolCall as s, DEFAULT_MAX_BYTES as t, renderInstructions as u };
