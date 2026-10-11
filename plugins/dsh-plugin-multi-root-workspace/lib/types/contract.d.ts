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
export declare const PANEL_CHANNEL = "/multi-root-workspace";
/** Endpoint names, relative to {@link PANEL_CHANNEL}. */
export type PanelEndpoint = 'list' | 'add' | 'remove' | 'alias' | 'move' | 'reveal' | 'files' | 'readFile';
/** Every endpoint name, for exhaustive iteration in tests and callers. */
export declare const PANEL_ENDPOINTS: readonly PanelEndpoint[];
export interface FilesView {
    readonly path: string;
    readonly entries: readonly {
        readonly name: string;
        readonly type: 'file' | 'directory' | 'other';
    }[];
    readonly truncated: boolean;
}
export interface FilePreview {
    readonly text: string;
    readonly eof: boolean;
}
/**
 * How one registered root currently stands, as the panel renders it. Kept in
 * step with the root vocabulary in `src/roots.ts` deliberately: this module is
 * inlined into the browser bundle and must not pull in `node:*`, so the one
 * value the two sides share is spelled out rather than imported.
 */
export type RootState = 'available' | 'missing' | 'redirected' | 'invalid';
/** One root as the panel renders it. */
export interface RootView {
    /** 1-based position in the returned snapshot. */
    readonly ordinal: number;
    /** Stable identity, used by every mutating endpoint. */
    readonly id: string;
    /** Canonical absolute directory. */
    readonly path: string;
    /** Display alias as stored; absent when cleared. */
    readonly alias?: string;
    /** ISO-8601 registration instant. */
    readonly addedAt: string;
    /** Whether the directory is writable right now, withheld, or unusable. */
    readonly state: RootState;
    /** Why the root is not `available`; a code the panel localizes. */
    readonly detail?: string;
    /**
     * `'common'` for a root the plugin's `commonRoots` configuration grants to
     * every workspace; absent for a root this workspace registered. A common root
     * is listed and revealed like any other, but no endpoint can change it: the
     * panel disables its actions and the host answers `common-root`.
     */
    readonly source?: 'common';
}
/** Exact identity of one row in a returned list snapshot. */
export interface RootEntryView {
    readonly ordinal: number;
    readonly id: string;
    readonly path: string;
    readonly addedAt: string;
}
/** The panel's whole view, returned by root-management endpoints. */
export interface RootsView {
    /** The canonical workspace root these registrations belong to. */
    readonly primaryRoot: string;
    /**
     * Display name of the primary root: the workspace's upstream title when the
     * host could resolve one; absent means the panel falls back to the path's
     * basename.
     */
    readonly primaryName?: string;
    /** The additional roots, in registry order. */
    readonly roots: readonly RootView[];
    /** Set when the store itself could not be read; the panel shows this verbatim. */
    readonly unavailable?: string;
}
/** What `reveal` answers with: the directory the host asked the file manager to show. */
export interface RevealedView {
    /** Canonical path of the revealed root. */
    readonly revealed: string;
}
/** The response type of every endpoint — the mapping the panel is typed against. */
export interface PanelResponseMap {
    readonly list: RootsView;
    readonly add: RootsView;
    readonly remove: RootsView;
    readonly alias: RootsView;
    readonly move: RootsView;
    readonly reveal: RevealedView;
    readonly files: FilesView;
    readonly readFile: FilePreview;
}
/**
 * The fields a request may carry. `sessionId` is required on every endpoint:
 * the host derives the primary root from that session's immutable cwd and
 * never accepts a client-named path. The remaining fields are used per
 * endpoint and the host asserts which ones that endpoint requires.
 */
export interface PanelRequest {
    /** The live host session whose cwd is the primary root this call acts on. */
    readonly sessionId: string;
    /** Exact target row from the most recent list snapshot. */
    readonly entry?: RootEntryView;
    /** Compatibility reference; accepted only when the id is unique. */
    readonly id?: string;
    /** Candidate directory (add), or root-relative browsing path (files/readFile). */
    readonly path?: string;
    /** Display alias (add/alias); empty clears it. */
    readonly alias?: string;
    /** Exact anchor row (move): the target is placed in front of it; absent moves it last. */
    readonly beforeEntry?: RootEntryView;
    /** Compatibility anchor; accepted only when the id is unique. */
    readonly beforeId?: string;
}
/** One validated call: the endpoint plus the request fields it may use. */
export interface PanelCall extends PanelRequest {
    /** The endpoint to call. */
    readonly endpoint: PanelEndpoint;
}
/** A failure the panel renders by `code`. */
export interface PanelFailure {
    /** Stable code from the root vocabulary, or `panel/bad-request`. */
    readonly code: string;
    /** Human-readable fallback text. */
    readonly message: string;
}
/** One parse result: the value, or one sentence naming what was wrong. */
export type Parsed<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly message: string;
};
export declare function parseFilesView(value: unknown): Parsed<FilesView>;
export declare function parseFilePreview(value: unknown): Parsed<FilePreview>;
/**
 * Validate the payload the host received for one endpoint.
 * @param endpoint - the endpoint the channel dispatched (the RPC method).
 * @param payload - the raw channel payload (the request body).
 * @returns the call the host may act on, or the reason it is not one.
 */
export declare function parsePanelCall(endpoint: string, payload: unknown): Parsed<PanelCall>;
/**
 * Validate a `RootsView` when it arrives.
 * @param value - the raw endpoint value.
 * @returns the view, or the reason it is not one.
 */
export declare function parseRootsView(value: unknown): Parsed<RootsView>;
/**
 * Validate a `RevealedView` when it arrives.
 * @param value - the raw endpoint value.
 * @returns the view, or the reason it is not one.
 */
export declare function parseRevealedView(value: unknown): Parsed<RevealedView>;
/**
 * Validate the `{ code, message }` envelope of a failed call.
 * @param value - the raw error value.
 * @returns the failure, or `undefined` when the value is not one.
 */
export declare function parseErrorView(value: unknown): PanelFailure | undefined;
