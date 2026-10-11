/**
 * The panel's own client for the Connection RPC channel.
 *
 * The browser half cannot use a Typert Remote namespace: contract generation
 * is workspace-shaped and the client assembly's contribution list belongs to
 * the shipped composition, so an out-of-tree plugin has no supported way to
 * mount one (see docs/decisions/ADR-0005 and the M3 plan). What IS public and
 * present in both supported runtimes is the generic Connection channel the
 * shipped sibling plugin already uses: the host registers
 * `connection.rpc.handle(PANEL_CHANNEL, …)` and this module calls it.
 *
 * The call is typed by {@link PanelResponseMap}: the endpoint decides the
 * request shape AND the response type, so a caller cannot decode one endpoint's
 * answer as another's. The response is additionally parsed at the boundary,
 * because the type is a promise about the host while the value on the wire is
 * whatever the host actually sent.
 *
 * @module dsh-plugin-multi-root-workspace/client/panel-client
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import { type PanelEndpoint, type PanelRequest, type PanelResponseMap } from '../contract.ts';
import { type Key } from './locales.ts';
/** A failure the panel renders from its `code`. */
export declare class PanelError extends Error {
    readonly code: string;
    /**
     * @param code - stable code from the root vocabulary, or a transport code.
     * @param message - the host's fallback text.
     */
    constructor(code: string, message: string);
}
/**
 * The copy key for one failure code, with a safe fallback for codes this build
 * does not know (a newer host, or a transport failure).
 * @param code - the failure code.
 * @returns the locale key to render.
 */
export declare function errorKeyOf(code: string): Key;
/** The panel's callable face, injected into its component. */
export interface PanelClient {
    /**
     * Call one endpoint.
     * @param endpoint - the endpoint name; it also selects the response type.
     * @param payload - the request fields for that endpoint (the endpoint name
     *   travels as the RPC method, so it is not repeated in the payload).
     * @returns the host's value, in the shape the endpoint promises.
     * @throws {PanelError} when the host answered with a failure, or with a value
     *   that is not what this endpoint promises.
     */
    call<E extends PanelEndpoint>(endpoint: E, payload: PanelRequest): Promise<PanelResponseMap[E]>;
}
/**
 * Build the panel client over a Connection handle.
 * @param connection - the client Connection service.
 * @returns the client, with every transport failure normalized to a `PanelError`.
 */
export declare function createPanelClient(connection: ConnectionHandle): PanelClient;
