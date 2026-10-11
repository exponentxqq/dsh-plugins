/**
 * `MultiRootSandboxProvider`: the kernel-sandbox dialect provider mounted as
 * `ctx.sandbox`.
 *
 * Every confined execution in this composition funnels through `confine()` —
 * the bash executor wraps `['bash','-c',command]`, and the terminal backend
 * wraps its PTY spawn argv — so widening the grant here is what gives bash, PTY,
 * and the fs fence one and the same root set (requirement §13). The bash
 * executor itself is therefore left upstream: it never computes roots.
 *
 * POSIX widening lives in `./dialects.ts`, Windows capabilities in
 * `./windows-profile.ts` and `./windows-runner.ts`: the upstream profile builders
 * are unreachable in the published package, so the additional roots are grafted
 * onto the profile `super.confine` actually produced (recognize the dialect
 * structurally, clone its grant spelling, fail loudly when the shape is not
 * known). This class owns only the policy that decides WHEN to graft:
 *
 * 1. with no additional roots, or under any mode other than `workspace-write`,
 *    the upstream result is returned ELEMENT FOR ELEMENT — same argv, same
 *    `enforcement`, same `denialSignatures`, same `runnerFailureRules`;
 * 2. `enforcement`, `denialSignatures`, and `runnerFailureRules` are NEVER
 *    recomputed here, even when the argv is widened — the bash executor derives
 *    its denial and enforcement reporting from them;
 * 3. only `argv` may differ, and a dialect whose shape cannot be extended fails
 *    loudly (`SandboxUnavailableError`) instead of silently confining to the
 *    primary root alone.
 *
 * @module dsh-plugin-multi-root-workspace/sandbox
 */
import type { SandboxPolicy } from '@deepseek-ai/dsh-sandbox';
import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local';
import type { Config } from '@deepseek-ai/dsh-sandbox-local';
import type { UpstreamConfined } from './compat/sandbox-confine.ts';
export type { Config };
/**
 * Local process-sandbox provider over the multi-root scope. Registers as
 * `ctx.sandbox`; the runner chain, probing, denial dialects, and Windows ACL
 * grant mechanics stay the upstream implementation's.
 */
export declare class MultiRootSandboxProvider extends LocalSandboxProvider {
    static inject: string[];
    /**
     * Wrap `argv` so it executes confined under `policy` on this host, granting
     * the scope's additional roots inside the SAME dialect profile.
     *
     * Under `read-only` nothing is added (the mode denies every write, additional
     * roots included), and `danger-full-access` never reaches here at all: the
     * bash executor and the PTY backend both hand their argv straight to the local
     * runtime in that mode. Widening therefore only ever ADDS the scope's
     * additional roots to an upstream `workspace-write` profile.
     *
     * The return shape is the INSTALLED upstream provider's: synchronous on a
     * release with a synchronous `confine`, a promise on a release with an
     * asynchronous one. `widenConfined` preserves whichever it is — see
     * `./compat/sandbox-confine.ts`.
     * @param argv - the exact argv the caller is about to spawn.
     * @param policy - the file-effect policy this execution runs under.
     * @param signal - cancellation, forwarded to releases that accept it.
     * @returns the argv to spawn instead, plus the selected backend's facts.
     */
    confine(argv: readonly string[], policy: SandboxPolicy, signal?: AbortSignal): UpstreamConfined;
    /**
     * Graft the scope's additional roots onto one upstream `confine` result.
     *
     * Pure with respect to the upstream call: it only ever reads the scope and
     * rewrites `argv`. `enforcement`, `denialSignatures` and `runnerFailureRules`
     * are passed through untouched, because the bash executor derives its denial
     * and enforcement reporting from them.
     * @param confined - the upstream result for this call.
     * @param argv - the caller's argv, needed to re-split the wrapped form.
     * @param policy - the per-call policy.
     * @returns the upstream result element for element, or one with a widened argv.
     */
    private widenForScope;
}
export default MultiRootSandboxProvider;
