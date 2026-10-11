import { f as resolveRootRef, i as canonicalRoot, l as isCanonicallyUnder, o as entryRootRef, r as availableRoots, t as RootValidationError } from "./roots-DejK8QSE.js";
import "@deepseek-ai/cordis";
import { isAbsolute, resolve } from "node:path";
import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
import { z } from "zod";
//#region src/contract.ts
/**
* The wire contract between the browser panel and this plugin's host half.
*
* It is deliberately transport-agnostic plain data: the host registers one
* Connection RPC channel (see `command.ts`) and the client bundle inlines this
* module, so both sides agree on endpoint names and payload shapes without
* sharing any runtime identity. Error codes are the stable half of the
* contract; `message` is only a fallback the panel does not have to show.
*
* Two properties this module owns:
*
* - **One shape per endpoint.** {@link PanelResponseMap} is the single mapping
*   from endpoint to response type, so the panel cannot silently decode one
*   endpoint's answer as another's. `reveal` answers with
*   {@link RevealedView}; root-management endpoints answer with
*   {@link RootsView}, and browsing returns {@link FilesView} or {@link FilePreview}.
*   The host builds those answers in `command.ts` and the
*   panel parses them here — one definition, two consumers.
* - **Runtime validation at the boundary.** The payload arrives from a browser
*   and the answer arrives from the host; neither is trusted to match the
*   TypeScript types. {@link parsePanelCall} and the `parse*View` functions
*   check the shapes and report structural failures as a message, so a
*   mismatch becomes a visible, localized error instead of a crash or a
*   silently wrong render.
*
* Nothing here may import `node:*` or `@deepseek-ai/*`: this module is inlined
* into the browser bundle.
*
* @module dsh-plugin-multi-root-workspace/contract
*/
/** The absolute logical channel both halves speak over. */
const PANEL_CHANNEL = "/multi-root-workspace";
/** Every endpoint name, for exhaustive iteration in tests and callers. */
const PANEL_ENDPOINTS = [
	"list",
	"add",
	"remove",
	"alias",
	"move",
	"reveal",
	"files",
	"readFile"
];
/**
* The request body on the wire. The endpoint travels as the RPC method, not as
* a field, so this schema covers the fields only; the host pairs it with the
* method the channel dispatched (and rejects the pair if the body contradicts
* it). Unknown keys are rejected rather than ignored: a client sending a field
* this host does not understand is out of contract, and silently dropping it
* would hide the drift.
*/
const panelRequestSchema = z.object({
	sessionId: z.string().min(1),
	entry: z.object({
		ordinal: z.number().int().positive(),
		id: z.string(),
		path: z.string(),
		addedAt: z.string()
	}).strict().optional(),
	id: z.string().optional(),
	path: z.string().optional(),
	alias: z.string().optional(),
	beforeEntry: z.object({
		ordinal: z.number().int().positive(),
		id: z.string(),
		path: z.string(),
		addedAt: z.string()
	}).strict().optional(),
	beforeId: z.string().optional()
}).strict();
/**
* One root as it travels over the channel. Deliberately NOT strict, in both
* directions: a newer host that adds a field must not brick an older panel, and
* the field that matters is the state it reports.
*/
const rootViewSchema = z.object({
	ordinal: z.number().int().positive(),
	id: z.string(),
	path: z.string(),
	alias: z.string().optional(),
	addedAt: z.string(),
	state: z.enum([
		"available",
		"missing",
		"redirected",
		"invalid"
	]),
	detail: z.string().optional(),
	source: z.literal("common").optional()
});
const rootsViewSchema = z.object({
	primaryRoot: z.string(),
	primaryName: z.string().optional(),
	roots: z.array(rootViewSchema),
	unavailable: z.string().optional()
});
const revealedViewSchema = z.object({ revealed: z.string() });
const filesViewSchema = z.object({
	path: z.string(),
	entries: z.array(z.object({
		name: z.string().min(1).refine((name) => name !== "." && name !== ".." && !/[\\/]/.test(name) && !name.includes(String.fromCharCode(0))),
		type: z.enum([
			"file",
			"directory",
			"other"
		])
	})),
	truncated: z.boolean()
});
const filePreviewSchema = z.object({
	text: z.string(),
	eof: z.boolean()
});
function parseFilesView(value) {
	const parsed = filesViewSchema.safeParse(value);
	return parsed.success ? {
		ok: true,
		value: parsed.data
	} : {
		ok: false,
		message: firstIssue(parsed.error)
	};
}
function parseFilePreview(value) {
	const parsed = filePreviewSchema.safeParse(value);
	return parsed.success ? {
		ok: true,
		value: parsed.data
	} : {
		ok: false,
		message: firstIssue(parsed.error)
	};
}
z.object({
	code: z.string(),
	message: z.string(),
	details: z.unknown().optional()
});
/**
* Validate the payload the host received for one endpoint.
* @param endpoint - the endpoint the channel dispatched (the RPC method).
* @param payload - the raw channel payload (the request body).
* @returns the call the host may act on, or the reason it is not one.
*/
function parsePanelCall(endpoint, payload) {
	if (!PANEL_ENDPOINTS.includes(endpoint)) return {
		ok: false,
		message: `unknown endpoint "${endpoint}"`
	};
	const parsed = panelRequestSchema.safeParse(payload ?? {});
	if (!parsed.success) return {
		ok: false,
		message: `the request body is invalid: ${firstIssue(parsed.error)}`
	};
	return {
		ok: true,
		value: narrowCall(endpoint, parsed.data)
	};
}
/**
* Validate a `RootsView` when it arrives.
* @param value - the raw endpoint value.
* @returns the view, or the reason it is not one.
*/
function parseRootsView(value) {
	const parsed = rootsViewSchema.safeParse(value);
	if (!parsed.success) return {
		ok: false,
		message: `the answer is not a roots view: ${firstIssue(parsed.error)}`
	};
	const view = parsed.data;
	return {
		ok: true,
		value: {
			primaryRoot: view.primaryRoot,
			...view.primaryName === void 0 ? {} : { primaryName: view.primaryName },
			roots: view.roots.map(narrowRootView),
			...view.unavailable === void 0 ? {} : { unavailable: view.unavailable }
		}
	};
}
/**
* Validate a `RevealedView` when it arrives.
* @param value - the raw endpoint value.
* @returns the view, or the reason it is not one.
*/
function parseRevealedView(value) {
	const parsed = revealedViewSchema.safeParse(value);
	if (!parsed.success) return {
		ok: false,
		message: `the answer is not a reveal result: ${firstIssue(parsed.error)}`
	};
	return {
		ok: true,
		value: parsed.data
	};
}
/**
* Rebuild a parsed call as the declared type, keeping absent optional fields
* ABSENT (`exactOptionalPropertyTypes` distinguishes "absent" from "undefined",
* and the host's own code reads the two the same way the panel sent them).
*/
function narrowCall(endpoint, value) {
	return {
		endpoint,
		sessionId: value.sessionId,
		...value.entry === void 0 ? {} : { entry: value.entry },
		...value.id === void 0 ? {} : { id: value.id },
		...value.path === void 0 ? {} : { path: value.path },
		...value.alias === void 0 ? {} : { alias: value.alias },
		...value.beforeEntry === void 0 ? {} : { beforeEntry: value.beforeEntry },
		...value.beforeId === void 0 ? {} : { beforeId: value.beforeId }
	};
}
/** Rebuild one parsed root as the declared `RootView`. */
function narrowRootView(value) {
	return {
		ordinal: value.ordinal,
		id: value.id,
		path: value.path,
		addedAt: value.addedAt,
		state: value.state,
		...value.alias === void 0 ? {} : { alias: value.alias },
		...value.detail === void 0 ? {} : { detail: value.detail },
		...value.source === void 0 ? {} : { source: value.source }
	};
}
/** Render the first zod issue as one short sentence. */
function firstIssue(error) {
	const issue = error.issues[0];
	if (issue === void 0) return "invalid";
	return `${issue.path.length === 0 ? "" : `${issue.path.join(".")}: `}${issue.message}`;
}
//#endregion
//#region src/panel-files.ts
/** Additional-root file browsing through the plugin's existing Connection channel. */
async function browseRoot(ctx, primaryRoot, request, signal) {
	const roots = await ctx.multiRootRegistry.refresh(primaryRoot);
	const ref = request.entry === void 0 ? request.id === void 0 ? void 0 : {
		kind: "id",
		id: request.id
	} : {
		kind: "entry",
		...request.entry
	};
	if (ref === void 0) throw new RootValidationError("invalid-ref", "an exact root entry is required");
	const root = resolveRootRef(roots, ref);
	if (root.state !== "available") throw new RootValidationError("missing", "the additional root is not available");
	const path = request.path ?? ".";
	if (isAbsolute(path) || /^[a-z][a-z\d+.-]*:/iu.test(path) || path.includes("\0")) throw new RootValidationError("invalid-ref", "a root-relative path is required");
	const absolute = canonicalPath(resolve(root.path, path));
	if (!isCanonicallyUnder(absolute, root.path)) throw new RootValidationError("invalid-ref", "the path is outside the selected root");
	const files = ctx.root.get("workspaceFiles");
	if (files === void 0) throw new Error("workspace-files is not composed");
	const scope = {
		sessionId: request.sessionId,
		workspaceRoot: root.path
	};
	let result;
	if (request.endpoint === "files") {
		const listing = await files.list(scope, absolute, signal);
		result = {
			path,
			entries: listing.entries.map((entry) => ({
				name: entry.name,
				type: entry.type
			})),
			truncated: listing.truncated
		};
	} else {
		const preview = await files.read(scope, absolute, {
			offset: 1,
			limit: 200
		}, signal);
		result = {
			text: preview.text,
			eof: preview.eof
		};
	}
	const latest = resolveRootRef(await ctx.multiRootRegistry.refresh(primaryRoot), ref);
	if (latest.state !== "available" || latest.path !== root.path || canonicalPath(resolve(root.path, path)) !== absolute) throw new RootValidationError("missing", "the additional root changed while reading");
	return result;
}
//#endregion
//#region src/command.ts
/** Services this row needs before it may activate. */
const inject = [
	"commands",
	"sandboxPolicy",
	"multiRootRegistry"
];
/** The command name, without the leading slash. */
const COMMAND_NAME = "workspace-folders";
/**
* How the report marks a root the plugin configuration grants to every
* workspace (not an alias a localization layer may rename: the report is
* English-only, like every host-side command result).
*/
const COMMON_MARKER = "common";
/**
* Parse the text that follows `/workspace-folders`.
* @param rawInput - the verbatim `rawInput` of the command invocation.
* @returns the subcommand and its remaining text.
* @throws {RootValidationError} `invalid-ref` for an unknown subcommand.
*/
function parseFoldersCommand(rawInput) {
	const trimmed = rawInput.trim();
	if (trimmed === "") return {
		verb: "list",
		rest: ""
	};
	const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
	const verb = match?.[1] ?? "";
	const rest = (match?.[2] ?? "").trim();
	switch (verb) {
		case "list":
		case "add":
		case "remove":
		case "alias":
		case "reveal":
		case "help": return {
			verb,
			rest
		};
		default: throw new RootValidationError("invalid-ref", `unknown subcommand "${verb}"; try /${COMMAND_NAME} help`);
	}
}
/** Strip one layer of matching quotes from an operator-supplied path. */
function unquote(text) {
	if (text.length >= 2) {
		const first = text[0];
		const last = text[text.length - 1];
		if (first === "\"" && last === "\"" || first === "'" && last === "'") return text.slice(1, -1);
	}
	return text;
}
/**
* Render the roots report the command returns. Additional roots are numbered
* from 1, which is the numbering every other subcommand accepts; the workspace
* root is never numbered because it cannot be removed.
*
* A root the plugin configuration grants to every workspace is marked `[common]`
* and counted separately: it is listed because it is part of the scope, and
* marked because no subcommand can change it (`remove`/`alias` answer
* `common-root`).
* @param primaryRoot - the canonical workspace root.
* @param statuses - the registry's status list, common roots included.
* @param unavailable - the store failure, when the registry could not read it.
* @returns the report text.
*/
function renderRootsReport(primaryRoot, statuses, unavailable) {
	const lines = [`Workspace root (primary; access follows the current sandbox mode): ${primaryRoot}`];
	if (unavailable !== void 0) {
		lines.push(`Root registry unavailable: ${unavailable}`);
		return lines.join("\n");
	}
	if (statuses.length === 0) {
		lines.push(`No additional roots. Add one with /${COMMAND_NAME} add <absolute path>.`);
		return lines.join("\n");
	}
	for (const [index, status] of statuses.entries()) {
		const alias = status.alias === void 0 ? "" : ` [${status.alias}]`;
		const state = status.state === "available" ? "" : ` (${status.state}: ${status.detail ?? "unavailable"})`;
		const common = status.source === "common" ? ` [${COMMON_MARKER}]` : "";
		lines.push(`  ${index + 1} ${status.path}${alias}${common}${state}`);
	}
	const registered = statuses.filter((status) => status.source !== "common");
	const withheld = registered.length - availableRoots(registered).length;
	if (withheld > 0) lines.push(`${withheld} root(s) are registered but not writable right now; restore the directory and run /${COMMAND_NAME} list, or remove the entry.`);
	lines.push(`Writable additional roots: ${availableRoots(statuses).length} of ${statuses.length}.`);
	const common = statuses.length - registered.length;
	if (common > 0) lines.push(`${common} of them are ${COMMON_MARKER} roots: this plugin's commonRoots configuration grants them to every workspace, so they are changed in that configuration (cordis.patch.yml), not here.`);
	return lines.join("\n");
}
/**
* Register the command and, where a host Connection exists, the panel channel.
* @param ctx - the host context carrying `commands`, `sandboxPolicy`, and the registry.
*/
function apply(ctx) {
	ctx.commands.register({
		name: COMMAND_NAME,
		description: "List, add, remove, alias, or reveal the additional workspace roots of this session",
		input: { hint: "[list|add [path]|remove <n|path>|alias <n|path> [name]|reveal <n|path>|help]" },
		handler: async (invocation) => await runCommand(ctx, invocation)
	});
	ctx.inject(["connection", "webServer"], (connectionCtx) => {
		const connection = connectionCtx.root.get("connection");
		if (connection === void 0) {
			ctx.logger.warn("multi-root: connection resolved without the service; the panel channel is not mounted");
			return;
		}
		const dispose = connection.rpc.handle(PANEL_CHANNEL, async (endpoint, payload, signal) => await dispatchPanelRequest(ctx, endpoint, payload, signal));
		return () => {
			dispose();
		};
	});
}
/** Execute one `/workspace-folders` invocation. */
async function runCommand(ctx, invocation) {
	let parsed;
	try {
		parsed = parseFoldersCommand(invocation.rawInput);
	} catch (error) {
		return {
			kind: "error",
			text: failureText(error)
		};
	}
	const primaryRoot = ctx.sandboxPolicy.resolve({ session: invocation.agent.session }).workspaceRoot;
	const registry = ctx.multiRootRegistry;
	try {
		switch (parsed.verb) {
			case "help": return {
				kind: "success",
				text: helpText()
			};
			case "list": return {
				kind: "success",
				text: await report(registry, primaryRoot)
			};
			case "add": {
				const typed = unquote(parsed.rest);
				const path = typed === "" ? await pickRootPath(ctx, invocation.signal) : typed;
				if (path === void 0) return {
					kind: "error",
					text: `/${COMMAND_NAME}: no directory was selected; pass an absolute path or use the Workspace Folders panel`
				};
				await registry.add(primaryRoot, { path });
				return {
					kind: "success",
					text: await report(registry, primaryRoot)
				};
			}
			case "remove": {
				const { ref } = await targetOf(registry, primaryRoot, parsed.rest);
				await registry.removeAt(primaryRoot, ref);
				return {
					kind: "success",
					text: await report(registry, primaryRoot)
				};
			}
			case "alias": {
				const { text: reference, rest: alias } = splitReference(parsed.rest);
				const { ref } = await targetOf(registry, primaryRoot, reference);
				await registry.setAlias(primaryRoot, ref, alias === "" ? void 0 : unquote(alias));
				return {
					kind: "success",
					text: await report(registry, primaryRoot)
				};
			}
			case "reveal": {
				const { status: target } = await targetOf(registry, primaryRoot, parsed.rest);
				await revealRoot(ctx, target.path);
				return {
					kind: "success",
					text: `revealed ${target.path}`
				};
			}
		}
	} catch (error) {
		return {
			kind: "error",
			text: failureText(error)
		};
	}
}
/**
* The current report for one primary root, after re-checking every registered
* directory. The refresh is what makes the report describe the present rather
* than the moment the process started.
*/
async function report(registry, primaryRoot) {
	const statuses = await registry.refresh(primaryRoot);
	return renderRootsReport(canonicalRoot(primaryRoot), statuses, registry.unavailable);
}
/** Render a failure the way the composer displays it. */
function failureText(error) {
	if (error instanceof RootValidationError) return `/${COMMAND_NAME}: ${error.code}: ${error.message}`;
	return `/${COMMAND_NAME}: ${error instanceof Error ? error.message : String(error)}`;
}
/** The command's own help text. */
function helpText() {
	return [
		`/${COMMAND_NAME} — additional workspace roots of this session`,
		`  /${COMMAND_NAME} list`,
		`  /${COMMAND_NAME} add [absolute path]   (no path opens the directory picker when one is composed)`,
		`  /${COMMAND_NAME} remove <n|path>`,
		`  /${COMMAND_NAME} alias <n|path> [name]  (no name clears the alias)`,
		`  /${COMMAND_NAME} reveal <n|path>`,
		"Roots are canonicalized before they are stored: `~` expands, and a duplicate, a nested directory,",
		"or this session's own workspace root is rejected.",
		`A root marked [${COMMON_MARKER}] comes from the plugin configuration and is granted to every`,
		"workspace; change it in cordis.patch.yml rather than with remove/alias."
	].join("\n");
}
/**
* Split `alias`'s argument into a reference and the alias text.
*
* The reference is the first whitespace-delimited token, except when it opens
* with a quote: a quoted path may contain spaces, so the whole quoted span is
* the reference and the remainder is the alias.
*/
function splitReference(text) {
	const trimmed = text.trim();
	if (trimmed === "") throw new RootValidationError("invalid-ref", "a root reference is required");
	if (trimmed.startsWith("\"") || trimmed.startsWith("'")) {
		const quote = trimmed[0] ?? "";
		const end = trimmed.indexOf(quote, 1);
		if (end > 0) return {
			text: trimmed.slice(0, end + 1),
			rest: trimmed.slice(end + 1).trim()
		};
	}
	const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
	return {
		text: match?.[1] ?? "",
		rest: (match?.[2] ?? "").trim()
	};
}
/**
* Resolve an operator reference — a 1-based number, a path, or an id — to the
* registered root it names.
* @param registry - the registry to read.
* @param primaryRoot - the workspace root the registrations belong to.
* @param text - the operator's text.
* @returns the matched status, after re-checking the registered directories.
* @throws {RootValidationError} `invalid-ref` for empty text, `not-found` when nothing matches.
*/
async function targetOf(registry, primaryRoot, text) {
	const trimmed = text.trim();
	if (trimmed === "") throw new RootValidationError("invalid-ref", "a root reference is required");
	const statuses = await registry.refresh(primaryRoot);
	let status;
	if (/^\d+$/.test(trimmed)) {
		const ordinal = Number(trimmed);
		status = resolveRootRef(statuses, {
			kind: "ordinal",
			ordinal
		});
		return {
			status,
			ref: entryRootRef(status, ordinal)
		};
	}
	const asPath = unquote(trimmed);
	if (asPath === "~" || asPath.startsWith("~") || asPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(asPath)) status = resolveRootRef(statuses, {
		kind: "path",
		path: asPath
	});
	else status = resolveRootRef(statuses, {
		kind: "id",
		id: trimmed
	});
	const ordinal = statuses.indexOf(status) + 1;
	return {
		status,
		ref: entryRootRef(status, ordinal)
	};
}
/**
* Derive the primary root a panel request may act on.
*
* The browser names a live session; the host looks that session up and uses
* its immutable cwd. There is no client-supplied path and no deployment-default
* fallback: a panel call without a real host session has no workspace to
* manage. Property access would demand an injected `sessions` dependency this
* row does not name, so the lookup stays an explicit sibling `get` (the same
* pattern as `directoryPicker` / `subprocess`).
*
* @param ctx - the host context that may carry `sessions`.
* @param sessionId - the id the panel sent; already required by the wire schema.
* @returns the canonical cwd of that session.
* @throws {RootValidationError} `session-not-found` when the service is absent,
*   the id does not name a live session, or that session has no cwd.
*/
function resolvePanelPrimaryRoot(ctx, sessionId) {
	const session = ctx.get("sessions")?.get(sessionId);
	const cwd = session?.header.cwd;
	if (session === void 0 || cwd === void 0 || cwd === "") throw new RootValidationError("session-not-found", `session "${sessionId}" is not an active host session`, { reference: sessionId });
	return canonicalPath(cwd);
}
/** Project one status into the panel's view. */
function toRootView(status, index) {
	return {
		ordinal: index + 1,
		id: status.id,
		path: status.path,
		...status.alias === void 0 ? {} : { alias: status.alias },
		addedAt: status.addedAt,
		state: status.state,
		...status.detail === void 0 ? {} : { detail: status.detail },
		...status.source === void 0 ? {} : { source: status.source }
	};
}
/**
* Resolve the display name of the primary root from the host's workspace
* registry — the title the operator set in the workspace browser, falling back
* to nothing (the panel then shows the path's basename).
*
* The registry is an optional sibling service, read through the explicit
* lookup like `sessions`/`subprocess`: property access would demand an
* injected dependency this row does not name. Membership wins over cwd, which
* mirrors the host's own session→workspace resolution.
*/
async function primaryNameOf(ctx, primaryRoot, request) {
	const registry = ctx.get("workspaceRegistry");
	if (registry === void 0) return void 0;
	try {
		const sessionId = request.sessionId;
		if (sessionId !== void 0 && sessionId !== "") {
			const member = registry.list().find((workspace) => workspace.sessionIds.includes(sessionId));
			if (member !== void 0) return member.title;
		}
		return (await registry.resolveByPath(primaryRoot))?.title;
	} catch (error) {
		ctx.logger.warn("multi-root: workspace title lookup failed; the panel falls back to the path basename", error);
		return;
	}
}
/**
* Build the panel's view of one primary root, after re-checking every
* registered directory — the panel's read path is the same revalidation the
* command uses, so "the list the operator sees" is always the list the scope
* currently enforces.
*/
async function rootsViewOf(ctx, registry, primaryRoot, request) {
	const statuses = await registry.refresh(primaryRoot);
	const unavailable = registry.unavailable;
	const primaryName = await primaryNameOf(ctx, primaryRoot, request);
	return {
		primaryRoot: canonicalRoot(primaryRoot),
		...primaryName === void 0 ? {} : { primaryName },
		roots: statuses.map(toRootView),
		...unavailable === void 0 ? {} : { unavailable }
	};
}
/**
* Serve one panel endpoint.
*
* The payload is validated before anything acts on it: it arrived from a
* browser, and the host is the side that must not be surprised by a shape it
* did not expect (see `contract.ts`, which owns the schema both halves share).
* A malformed request is reported as `panel/bad-request` rather than throwing
* through the channel.
*/
async function dispatchPanelRequest(ctx, endpoint, payload, signal) {
	try {
		const parsed = parsePanelCall(endpoint, payload);
		if (!parsed.ok) return {
			ok: false,
			error: {
				code: "panel/bad-request",
				message: parsed.message,
				details: {}
			}
		};
		const request = parsed.value;
		const registry = ctx.multiRootRegistry;
		const primaryRoot = resolvePanelPrimaryRoot(ctx, request.sessionId);
		switch (request.endpoint) {
			case "files":
			case "readFile": return {
				ok: true,
				value: await browseRoot(ctx, primaryRoot, request, signal)
			};
			case "list": return {
				ok: true,
				value: await rootsViewOf(ctx, registry, primaryRoot, request)
			};
			case "add":
				if (request.path === void 0 || request.path === "") throw new RootValidationError("missing", "a directory path is required");
				await registry.add(primaryRoot, {
					path: request.path,
					...request.alias === void 0 ? {} : { alias: request.alias }
				});
				return {
					ok: true,
					value: await rootsViewOf(ctx, registry, primaryRoot, request)
				};
			case "remove":
				await registry.removeAt(primaryRoot, requireEntry(request));
				return {
					ok: true,
					value: await rootsViewOf(ctx, registry, primaryRoot, request)
				};
			case "alias":
				await registry.setAlias(primaryRoot, requireEntry(request), request.alias);
				return {
					ok: true,
					value: await rootsViewOf(ctx, registry, primaryRoot, request)
				};
			case "move":
				await registry.move(primaryRoot, requireEntry(request), request.beforeEntry !== void 0 ? entryRefOf(request.beforeEntry) : request.beforeId === void 0 ? void 0 : {
					kind: "id",
					id: request.beforeId
				});
				return {
					ok: true,
					value: await rootsViewOf(ctx, registry, primaryRoot, request)
				};
			case "reveal": {
				const ref = requireEntry(request);
				const target = resolveRootRef(await registry.refresh(primaryRoot), ref);
				await revealRoot(ctx, target.path);
				return {
					ok: true,
					value: { revealed: target.path }
				};
			}
		}
	} catch (error) {
		if (error instanceof RootValidationError) return {
			ok: false,
			error: {
				code: error.code,
				message: error.message,
				details: {}
			}
		};
		return {
			ok: false,
			error: {
				code: "panel/internal",
				message: error instanceof Error ? error.message : String(error),
				details: {}
			}
		};
	}
}
/** Convert a validated wire snapshot to the registry's exact-entry reference. */
function entryRefOf(entry) {
	return {
		kind: "entry",
		...entry
	};
}
/** Require the exact list row a mutating panel request must carry. */
function requireEntry(request) {
	if (request.entry !== void 0) return entryRefOf(request.entry);
	if (request.id !== void 0 && request.id !== "") return {
		kind: "id",
		id: request.id
	};
	throw new RootValidationError("invalid-ref", "an exact root entry is required");
}
/**
* Open the composed directory picker when one exists, and answer `undefined`
* otherwise (the command then reports the missing affordance).
*
* Only the `native` capability can answer a host-side command: the `browse`
* capability is an in-app dialog that only the browser panel can render.
*/
async function pickRootPath(ctx, signal) {
	const picker = ctx.get("directoryPicker");
	if (picker === void 0) return void 0;
	const capability = picker.capability();
	if (capability.kind !== "native") return void 0;
	return await capability.pick(signal) ?? void 0;
}
/** The per-platform argv that reveals one directory in the OS file manager. */
function revealArgv(platform, path) {
	switch (platform) {
		case "darwin": return [
			"open",
			"-R",
			path
		];
		case "win32": return ["explorer", `/select,${path}`];
		default: return ["xdg-open", path];
	}
}
/**
* Reveal one directory in the OS file manager through `ctx.subprocess`.
*
* This runs no confined command and grants the agent nothing: it is an
* operator action taken from the panel or the command line, and the process is
* the platform's own file manager. Failures are reported to the caller.
*/
async function revealRoot(ctx, path) {
	const subprocess = ctx.get("subprocess");
	if (subprocess === void 0) throw new RootValidationError("reveal-unavailable", "revealing a root needs a process runtime, which this composition does not mount");
	const [program = "", ...args] = revealArgv(process.platform, path);
	const executable = await subprocess.resolveExecutable(program);
	const handle = subprocess.spawn({
		argv: [executable, ...args],
		cwd: path,
		stdio: {
			stdin: "ignore",
			stdout: { maxBytes: 4096 },
			stderr: { maxBytes: 4096 }
		},
		graceMs: 3e3
	});
	const outcome = await handle.done;
	await handle.waitForExit();
	if (outcome.exitCode !== 0) throw new RootValidationError("reveal-unavailable", `the file manager exited with ${String(outcome.exitCode)}`);
}
//#endregion
export { parseFoldersCommand as a, revealArgv as c, parseFilePreview as d, parseFilesView as f, parseRootsView as h, inject as i, PANEL_CHANNEL as l, parseRevealedView as m, COMMON_MARKER as n, renderRootsReport as o, parsePanelCall as p, apply as r, resolvePanelPrimaryRoot as s, COMMAND_NAME as t, PANEL_ENDPOINTS as u };
