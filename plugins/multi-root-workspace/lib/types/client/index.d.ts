/**
 * Browser half of the multi-root workspace plugin.
 *
 * Sidebar footer and optional Files actions open the Workspace Folders dialog.
 * Everything it needs arrives through services the composition already
 * provides — `slots` to contribute, `locale` for its copy, `connection` for the
 * channel to the host half, and (optionally) `uiWorkspace` for the composed
 * directory picker and the client Session Controller for the current session.
 *
 * `slots.inject` is the soft seam: the footer action is registered when a
 * sidebar declares that slot and never otherwise, so a runtime whose sidebar
 * surface differs simply shows no panel instead of failing the client graph.
 *
 * @module dsh-plugin-multi-root-workspace/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type PanelClient } from './panel-client.ts';
import { type Translate } from './WorkspaceFoldersAction.tsx';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'sidebar.right.tab.files.actions': {
            kind: 'list';
            scope: 'session';
            owner: {
                readonly absolutePath: string;
            };
        };
    }
}
/** The footer-action cell this plugin owns. */
export declare const SLOT_ID = "multi-root-folders";
/** Services the client half needs before it may activate. */
export declare const inject: string[];
/**
 * Register the panel.
 * @param ctx - the client root context.
 */
export declare function apply(ctx: ClientContext): void;
export type { PanelClient, Translate };
