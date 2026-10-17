/**
 * The DSH compatibility contract: which upstream releases this plugin is
 * actually verified against, and how an installation is judged against that
 * list.
 *
 * This module is the ONE place the support matrix is spelled out. It is
 * deliberately pure — no cordis, no logging, no process exit — so that the
 * runtime gate (`src/compat.ts`), the static gate (`scripts/check-dsh-compat.mjs`)
 * and the tests all judge an installation by the same code instead of three
 * drifting copies of the same list.
 *
 * Why a contract exists at all: this plugin replaces `ctx.fs` and `ctx.sandbox`
 * with subclasses of the upstream providers, and `src/dialects.ts` recognizes
 * the kernel-sandbox profile by OBSERVING the argv shape `super.confine`
 * produced (ADR-0003). Both couplings are to pre-stable upstream internals that
 * carry no semver promise. An npm range like `>=0.1.2-alpha.4 <0.2.0` therefore
 * promises far more than the code was ever verified against; the allowlist
 * below promises exactly what CI has run.
 *
 * @module dsh-plugin-multi-root-workspace/compat/dsh-version
 */
/**
 * The releases this plugin is verified against, as EXACT version strings.
 *
 * Not a semver range, on purpose: a range is a prediction about releases that
 * do not exist yet, and this plugin's coupling to upstream argv shapes makes
 * that prediction unsafe. Adding an entry is always a human act performed after
 * the upgrade smoke passed on that exact version — a green CI run on an
 * unlisted release is evidence, not authorization (ADR-0009).
 */
export declare const SUPPORTED_DSH_RELEASES: readonly ["0.1.5-rc.2", "0.1.6-alpha.1", "0.1.6-alpha.2", "0.1.7-alpha.1", "0.1.7-alpha.2", "0.1.7-rc.1", "0.1.7-rc.2", "0.2.0-rc.1", "0.2.0-rc.2", "0.2.1-rc.2"];
/** One release this plugin claims to support. */
export type SupportedDshRelease = typeof SUPPORTED_DSH_RELEASES[number];
/**
 * Packages whose absence means this plugin cannot function at all: every one of
 * them is either subclassed, imported for a value, or the owner of a service
 * key the providers inject.
 */
export declare const REQUIRED_CORE_PACKAGES: readonly ["@deepseek-ai/dsh-fs", "@deepseek-ai/dsh-fs-local", "@deepseek-ai/dsh-sandbox", "@deepseek-ai/dsh-sandbox-local", "@deepseek-ai/dsh-sandbox-policy", "@deepseek-ai/dsh-storage-domain"];
/**
 * Packages a full composition provides and a minimal one legitimately omits.
 * Absence is fine; a version that DISAGREES with the required packages is not —
 * that is the mixed-installation failure this contract exists to catch.
 */
export declare const OPTIONAL_CORE_PACKAGES: readonly ["@deepseek-ai/dsh-lsp", "@deepseek-ai/dsh-lsp-stdio", "@deepseek-ai/dsh-api-workspace-files", "@deepseek-ai/dsh-typert-protocol", "@deepseek-ai/dsh-sandbox-windows-acl", "@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-agent-instructions", "@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-commands", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-subprocess", "@deepseek-ai/dsh-system-prompt"];
/** Every package the contract inspects, required first. */
export declare const CORE_PACKAGES: readonly ["@deepseek-ai/dsh-fs", "@deepseek-ai/dsh-fs-local", "@deepseek-ai/dsh-sandbox", "@deepseek-ai/dsh-sandbox-local", "@deepseek-ai/dsh-sandbox-policy", "@deepseek-ai/dsh-storage-domain", "@deepseek-ai/dsh-lsp", "@deepseek-ai/dsh-lsp-stdio", "@deepseek-ai/dsh-api-workspace-files", "@deepseek-ai/dsh-typert-protocol", "@deepseek-ai/dsh-sandbox-windows-acl", "@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-agent-instructions", "@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-commands", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-subprocess", "@deepseek-ai/dsh-system-prompt"];
/** How this plugin reacts to an installation it does not support. */
export type CompatEnforcement = 'enforce' | 'warn';
/** The environment variable that relaxes the gate. */
export declare const COMPAT_ENFORCEMENT_ENV = "DSH_MULTI_ROOT_COMPAT";
/** One inspected package and the version actually resolved for it. */
export interface InspectedPackage {
    /** The package specifier. */
    readonly name: string;
    /** The resolved `version`, or `undefined` when the package is not installed. */
    readonly version: string | undefined;
    /** Whether absence alone is a failure. */
    readonly required: boolean;
}
/**
 * Why an installation was accepted or rejected.
 *
 * - `supported` — one release, and it is on the allowlist.
 * - `incomplete` — a required package could not be resolved.
 * - `mixed` — the installed core packages do not agree on one release.
 * - `unsupported` — one release, but not on the allowlist.
 */
export type CompatVerdict = 'supported' | 'incomplete' | 'mixed' | 'unsupported';
/** The judgement passed on one installation. */
export interface CompatReport {
    /** The verdict. */
    readonly verdict: CompatVerdict;
    /** The single release every inspected package agreed on; absent unless they did. */
    readonly release: string | undefined;
    /** Every inspected package, in {@link CORE_PACKAGES} order. */
    readonly packages: readonly InspectedPackage[];
    /** Operator-facing explanation, ready to log or print verbatim. */
    readonly message: string;
}
/** Reads the installed version of one package, or `undefined` when absent. */
export type VersionReader = (packageName: string) => string | undefined;
/**
 * Read one package's declared version through Node resolution.
 *
 * Resolution runs from THIS module, which is what makes the answer meaningful:
 * the upstream packages are peer dependencies, so they resolve to the single
 * copy the host provides — the same copy the providers will subclass at
 * runtime. A package that cannot be resolved is reported absent rather than
 * throwing, because "not installed" is a legitimate answer for every optional
 * package.
 * @param packageName - the package to inspect.
 * @returns the declared version, or `undefined` when the package or its
 *   manifest cannot be resolved.
 */
export declare function readInstalledVersion(packageName: string): string | undefined;
/**
 * Judge one installation against the contract.
 *
 * The three checks run in this order, and the first failure wins, because each
 * later check would report nonsense about an installation that failed an
 * earlier one: a missing required package has no version to compare, and a
 * mixed installation has no single version to look up in the allowlist.
 * @param readVersion - version reader; defaults to Node resolution. Tests and
 *   the static checker pass their own.
 * @returns the report; never throws.
 */
export declare function classifyInstallation(readVersion?: VersionReader): CompatReport;
/**
 * Read the enforcement mode.
 *
 * `warn` exists for exactly one caller: the upgrade smoke, which must run the
 * whole behavior matrix against a release that is deliberately NOT on the
 * allowlist yet — that run is how a release earns its place on the list. It is
 * not a production escape hatch, and the warning says so.
 * @param env - the environment to read; defaults to this process's.
 * @returns `warn` only when explicitly requested, `enforce` otherwise.
 */
export declare function compatEnforcement(env?: Record<string, string | undefined>): CompatEnforcement;
