/**
 * Path-containment mechanics for the multi-root filesystem fence.
 *
 * This is a local implementation of the upstream helper
 * `isPathUnder` from `@deepseek-ai/dsh-fs-sandbox` (source path
 * `packages/fs/fs-sandbox/src/containment.ts`, verified byte-identical between
 * dsh `0.1.2-rc.1` and `0.1.5-rc.2` at master `c291e7961a`).
 *
 * Why a copy instead of an import: the published package ships only
 * `lib/index.js` and `lib/types/**\/*.d.ts`, so `exports["./src/*"]` resolves to
 * files that do not exist in an installed tree (deep imports succeed only where
 * the package directory happens to be a symlink into a source checkout). The
 * coupling policy — entry-point imports only — is recorded in
 * `docs/decisions/ADR-0002-upstream-coupling-policy.md`; behavioral equality
 * with the upstream fence is pinned by the differential suite in
 * `tests/fs-parity.spec.ts`.
 *
 * Canonical spellings take the fast lexical path; filesystem identity supplies
 * the conservative fallback for alias-equivalent roots such as Windows 8.3
 * names and casing.
 *
 * @module dsh-plugin-multi-root-workspace/containment
 */
/**
 * Determine whether a canonical target is a writable root or lies beneath it.
 * The lexical fast path handles normal canonical spellings. When spellings
 * differ, walk the target's existing ancestors and compare filesystem identity
 * with the root; this recognizes Windows long-name/8.3 aliases and casing
 * without weakening containment to a textual approximation.
 * @param path - canonical target key, which may end in a missing suffix.
 * @param root - canonical writable root.
 * @param caseSensitive - whether lexical comparison preserves case; defaults
 *   to the host filesystem convention used by supported platforms.
 * @returns whether the target is the root or a descendant of it.
 */
export declare function isPathUnder(path: string, root: string, caseSensitive?: boolean): Promise<boolean>;
