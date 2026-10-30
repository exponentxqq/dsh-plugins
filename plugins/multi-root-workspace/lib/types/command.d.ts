/**
 * The user-facing surface: the `/workspace-folders` command and the panel's
 * RPC channel.
 *
 * They share one module because they are one thing — the operator-facing edge
 * over `ctx.multiRootRegistry`. The command serves the text surfaces (the
 * composer, headless diagnostics) and the channel serves the browser panel;
 * both resolve the same canonical workspace root, call the same registry, and
 * report the same `RootValidationCode` values.
 *
 * Both are also the two places a READ happens, so both go through the same
 * revalidation entry point: `registry.refresh()` re-stats every registered
 * directory, re-resolves it against the directory it was granted for, and
 * republishes the scope BEFORE the list is rendered. Listing is therefore
 * enough to notice that a directory disappeared (and enough to bring a
 * restored one back) — which is what the panel's "Retry" button and the
 * command's `list` both promise.
 *
 * Both halves are SOFT: the command registers only where a command registry is
 * composed, and the channel only where a host Connection and web server exist
 * (web), so a headless profile mounts this row with zero effect on the
 * providers.
 *
 * The command's own text is English: a host-side command handler has no active
 * locale to consult (the browser owns locale state). The panel is bilingual.
 * That split is recorded in the M3 plan and the requirements as a known limit.
 *
 * @module dsh-plugin-multi-root-workspace/command
 */
import { Context } from '@deepseek-ai/cordis';
import { type RootStatus } from './roots.ts';
/** Services this row needs before it may activate. */
export declare const inject: string[];
/** The command name, without the leading slash. */
export declare const COMMAND_NAME = "workspace-folders";
/**
 * How the report marks a root the plugin configuration grants to every
 * workspace (not an alias a localization layer may rename: the report is
 * English-only, like every host-side command result).
 */
export declare const COMMON_MARKER = "common";
/** One parsed command line. */
export interface FoldersCommand {
    /** The subcommand; `list` when the line named none. */
    readonly verb: 'list' | 'add' | 'remove' | 'alias' | 'reveal' | 'help';
    /** Everything after the verb, verbatim (paths may contain spaces). */
    readonly rest: string;
}
/**
 * Parse the text that follows `/workspace-folders`.
 * @param rawInput - the verbatim `rawInput` of the command invocation.
 * @returns the subcommand and its remaining text.
 * @throws {RootValidationError} `invalid-ref` for an unknown subcommand.
 */
export declare function parseFoldersCommand(rawInput: string): FoldersCommand;
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
export declare function renderRootsReport(primaryRoot: string, statuses: readonly RootStatus[], unavailable?: string): string;
/**
 * Register the command and, where a host Connection exists, the panel channel.
 * @param ctx - the host context carrying `commands`, `sandboxPolicy`, and the registry.
 */
export declare function apply(ctx: Context): void;
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
export declare function resolvePanelPrimaryRoot(ctx: Context, sessionId: string): string;
/** The per-platform argv that reveals one directory in the OS file manager. */
export declare function revealArgv(platform: NodeJS.Platform, path: string): readonly string[];
