/**
 * Compatibility adapter for "which session is the client looking at".
 *
 * The browser panel has to name that session before it may call the host
 * (ADR-0008). Upstream moved the fact between two releases this plugin
 * supports, without renaming the `sessions` service: the explicit
 * `list.getSnapshot().current` became the main-view retention count
 * `byId[id].retainedBy.mainView > 0`. The probe prefers the explicit selection
 * when it is a non-empty string and otherwise the first row the main view
 * actually retains — the same predicate `ui-session` uses to publish the main
 * binding — and never falls back to `ids[0]`, which would name a session the
 * operator is not looking at. `getSnapshot` must be invoked as a method. Both
 * the two-step shape and the per-release history are documented once, in
 * `@dsh-plugins/client-kit/client-session` and `.agent/note/dsh-compat-contract.md`
 * (section 4); this adapter does not duplicate them.
 *
 * **Why this module still exists although the implementation moved.** The
 * single probe implementation (P3) now lives in
 * `@dsh-plugins/client-kit/client-session`, so this file is a re-export and
 * holds no implementation of its own. This package cannot reach the
 * workspace-config holder's runtime module: the relationship between the two
 * bundles is a compile-time contract only (the seat types live in
 * `@dsh-plugins/contracts`), and the holder is installed independently of this
 * plugin. `client-kit` is the neutral landing both halves consume, inlined at
 * build time (AR1: internal packages live in `devDependencies` only, never in
 * `dependencies` or `dsh.client.inject`). Keeping the re-export under
 * `src/compat/` also preserves the invariant that version-dependent code is
 * reached only from here: business code keeps calling
 * `currentSessionIdOf(sessions)` with the import path it already had, and never
 * learns where the probe is.
 *
 * @module dsh-plugin-multi-root-workspace/compat/client-session
 */
export { currentSessionIdOf } from '@dsh-plugins/client-kit/client-session';
