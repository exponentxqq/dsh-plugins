/**
 * Browser half of the multi-root workspace plugin.
 *
 * Two soft seats, one panel body:
 *
 * - `workspace-config.section` — the Workspace Folders section inside the
 *   unified workspace-config dialog. This is the panel's mount point since the
 *   footer action was removed (ADR-0013): the holder declares the seat from its
 *   `shell.overlay` registration, registers its own footer entry, and owns the
 *   modal shell, so this registration exists exactly when the holder is
 *   installed.
 * - `sidebar.right.tab.files.actions` — the legacy Files-tab compact entry. On
 *   surfaces that still declare it, the same panel body expands inline in the
 *   tab, which keeps the panel reachable without the holder.
 *
 * Everything the body needs arrives through services the composition already
 * provides — `slots` to contribute, `locale` for its copy, `connection` for the
 * channel to the host half, and (optionally) `uiWorkspace` for the composed
 * directory picker and the client Session Controller for the current session.
 *
 * `slots.inject` is the soft seam: a registration happens when the composition
 * declares the seat and never otherwise, so a runtime whose surfaces differ
 * simply shows no panel instead of failing the client graph. A seat that is
 * declared but refuses the registration is caught per seat: the worst case is
 * "this entry does not show", not a broken client half.
 *
 * The workspace-config holder is a **dev** dependency consumed with `import
 * type` only (D3): no runtime import, and no row in `dsh.client.inject`. The
 * seat literal is held locally and pinned to the holder's
 * `WorkspaceConfigSectionSeat`, so a typo is a type error while the holder's
 * components never reach this bundle.
 *
 * @module dsh-plugin-multi-root-workspace/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { WorkspaceConfigSectionSlot } from '@dsh-plugins/contracts';
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
        'workspace-config.section': WorkspaceConfigSectionSlot;
    }
}
/** The cell this plugin owns (an id is unique per seat, so both seats reuse it). */
export declare const SLOT_ID = "multi-root-folders";
/** Services the client half needs before it may activate. */
export declare const inject: string[];
/**
 * Register the panel.
 * @param ctx - the client root context.
 */
export declare function apply(ctx: ClientContext): void;
export type { PanelClient, Translate };
