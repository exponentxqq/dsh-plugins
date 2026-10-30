/**
 * Dialect adaptation: widening a confined argv with additional workspace roots.
 *
 * The upstream kernel-sandbox provider expresses `workspace-write` as a
 * per-dialect profile built from the SINGLE policy root (plus the platform temp
 * areas). Widening that profile is the one thing this plugin must do outside the
 * filesystem fence, and it is deliberately done by OBSERVATION: the upstream
 * dialect profile builders are unreachable in the published package (only
 * `lib/index.js` and `lib/types/**` ship — see ADR-0002), and
 * `@deepseek-ai/dsh-sandbox-local`'s `runnerArgv` / `landlockLauncher` /
 * `seatbeltExec` members are TS-private, so `confine()` and the `internals` test
 * hook are the ONLY public surface.
 *
 * Every dialect is therefore handled by
 * 1. splitting the wrapped argv at the separator `confine` itself inserted,
 * 2. recognizing the dialect from STRUCTURAL markers in the profile arguments,
 * 3. cloning the grant spelling — and the insertion point — from the arguments
 *    the upstream provider actually produced, and
 * 4. failing loudly (never silently confining to the primary root alone) when
 *    the shape is not one this module knows.
 *
 * The per-dialect profile shapes this recognizes (verified against dsh
 * `0.1.5-rc.2`, recorded in `docs/reference/multi-root-workspace-research.md`
 * §10) are:
 *
 * ```text
 * seatbelt     [sandbox-exec, -p, "<SBPL>" ]                 SBPL allow-forms
 * bwrap        [bwrap, --ro-bind / /, …, --bind <root> <root>]
 * landlock     [<launcher>, --ro /, --rw /dev/null, --rw <root>]
 * windows-acl  [node, <runner>, --workspace …, --mode <mode>]
 * runnerCommand is spelled exactly like bwrap (the upstream config contract
 * appends bwrap-compatible profile arguments to the operator's runner).
 * ```
 *
 * @module dsh-plugin-multi-root-workspace/dialects
 */
import type { SandboxPolicy } from '@deepseek-ai/dsh-sandbox';
/** The kernel runner dialects a confined argv can speak. */
export type RunnerDialect = 'seatbelt' | 'bwrap' | 'landlock' | 'windows-acl';
/**
 * Raised when a confined argv cannot be recognized or widened. The provider
 * converts this into the fail-closed `SandboxUnavailableError`: an unrecognized
 * dialect must never degrade into "the primary root was granted after all".
 */
export declare class DialectUnrecognizedError extends Error {
    constructor(message: string);
}
/** One wrapped argv split into its runner/profile part and the caller's argv. */
export interface ConfinedShape {
    /** The recognized dialect. */
    dialect: RunnerDialect;
    /** Everything before the separator: runner program plus profile arguments. */
    profileArgs: string[];
    /** Index of the `--` separator `confine` inserted. */
    separator: number;
    /** The caller's argv, verbatim, after the separator. */
    commandArgs: string[];
}
/**
 * Split a `confine()` result at the separator by arithmetic, then VERIFY the
 * split: `confine` builds `[...profileArgs, '--', ...argv]`, so the separator
 * sits exactly one element before the caller's argv. A mismatch means the
 * provider no longer wraps argv the way this module assumes.
 * @param confinedArgv - the argv `confine` returned.
 * @param commandArgv - the argv the caller passed to `confine`.
 * @returns the recognized dialect and the split parts.
 */
export declare function splitConfined(confinedArgv: readonly string[], commandArgv: readonly string[]): ConfinedShape;
/**
 * Recognize the runner dialect from the profile arguments alone. Exactly one
 * marker must match; zero or several are both unrecognized.
 * @param profileArgs - everything before the separator.
 * @returns the dialect.
 */
export declare function detectDialect(profileArgs: readonly string[]): RunnerDialect;
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
export declare function widenProfileArgs(dialect: RunnerDialect, profileArgs: readonly string[], policy: SandboxPolicy, additionalRoots: readonly string[]): string[];
