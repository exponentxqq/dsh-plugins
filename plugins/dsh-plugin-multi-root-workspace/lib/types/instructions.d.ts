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
import { Context } from '@deepseek-ai/cordis';
/** The `plugin` attribution every message this row produces carries. */
export declare const PLUGIN_SOURCE = "dsh-plugin-multi-root-workspace";
/**
 * Total UTF-8 byte budget for the additional-root snapshot, matching the
 * default the upstream `agent-instructions` row is composed with so that one
 * extra workspace root costs at most as much as the primary one does.
 */
export declare const DEFAULT_MAX_BYTES = 65536;
/** Largest instruction file this row will read; larger files are ignored. */
export declare const DEFAULT_MAX_SOURCE_BYTES = 32768;
/** Plugin configuration for the `multi-root-instructions` row. */
export interface Config {
    /** Total budget for ALL additional roots (default {@link DEFAULT_MAX_BYTES}); non-positive disables the row. */
    readonly maxBytes?: number;
    /** Per-file source cap (default {@link DEFAULT_MAX_SOURCE_BYTES}). */
    readonly maxSourceBytes?: number;
    /** Ordered same-directory instruction candidates; upstream's defaults when omitted. */
    readonly instructionFileCandidates?: readonly string[];
    /** Ordered same-directory local-overlay candidates; upstream's defaults when omitted. */
    readonly localInstructionFileCandidates?: readonly string[];
}
/** One root's freshly rendered instruction text. */
export interface RenderedRoot {
    /** The canonical additional root. */
    readonly root: string;
    /** The rendered instruction text. */
    readonly text: string;
}
/** One instruction file that is no longer present. */
export interface RemovedScope {
    /** The additional root it belonged to. */
    readonly root: string;
    /** The instruction file's absolute path. */
    readonly path: string;
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
export declare function touchedPathOfToolCall(name: string, argumentsJson: string): string | undefined;
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
export declare function composeInstructionMessage(rendered: readonly RenderedRoot[], revoked: readonly string[], removed: readonly RemovedScope[]): string | undefined;
/** This row is gated on the compatibility contract like every other provider. */
export declare const inject: string[];
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
export declare function apply(ctx: Context, config?: Config): void;
