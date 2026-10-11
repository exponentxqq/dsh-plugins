/**
 * Compatibility adapter for "which session is the client looking at".
 *
 * The browser panel has to name that session before it may call the host
 * (ADR-0008). Upstream moved the fact between two releases this plugin
 * supports, without renaming the `sessions` service:
 *
 * ```text
 * 0.1.5-rc.2, 0.1.6-alpha.1
 *   sessions.list.getSnapshot().current          SessionId | undefined
 * 0.1.6-alpha.2, 0.1.7-alpha.1, 0.1.7-alpha.2, 0.1.7-rc.1, 0.1.7-rc.2
 *   the catalog has no `current`. The main view retains its session with
 *   source `mainView`, and that count is projected onto the list row:
 *   sessions.list.getSnapshot().byId[id].retainedBy.mainView > 0
 * ```
 *
 * Reading only `current` makes 0.1.6-alpha.2 report "no active session"
 * while a conversation is on screen. Reading the first catalog id would
 * name a session the operator is not looking at. This probe prefers the
 * explicit selection when that field is a non-empty string, and otherwise
 * the first row the main view actually retains — the same predicate
 * `ui-session` uses to publish the main binding.
 *
 * @module dsh-plugin-multi-root-workspace/compat/client-session
 */
/**
 * The session the composed client is showing, when it can name one.
 * @param sessions - the client `sessions` service, or whatever this
 *   composition provided under that name. Absence is a supported state.
 * @returns the session id, or `undefined` when no main view holds one.
 */
export declare function currentSessionIdOf(sessions: unknown): string | undefined;
