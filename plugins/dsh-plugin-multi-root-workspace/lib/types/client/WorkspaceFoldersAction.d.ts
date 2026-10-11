/**
 * The Workspace Folders panel: one sidebar footer action that opens a dialog
 * listing this session's workspace root and the additional roots registered for
 * it, with the actions the milestone requires — Add (through the composed
 * directory picker), Remove, Alias, Copy Path, Reveal, and reordering.
 *
 * Why a footer action and its own dialog, instead of a first-class panel: the
 * slots that can host a full panel (`sidebar.panellist` + the keyed `main`
 * panel) exist only in the pinned 0.1.5 surface, while `sidebar.footer.action`
 * exists in both supported runtimes — and `sidebar.workspaces` is a single slot
 * already owned by the workspace browser, so it cannot be extended in place.
 *
 * Styling is the host's, not this file's: the elements carry `mrfw-*` classes
 * resolved by the stylesheet the client entry injects (`styles.ts`), and every
 * color in that sheet is a host `--dsw-*` token, so the panel inherits the
 * native look — sidebar trigger, modal card, capsule buttons — in both themes
 * without naming a single color here (see ADR-0006).
 *
 * @module dsh-plugin-multi-root-workspace/client/WorkspaceFoldersAction
 */
import { type ReactNode } from 'react';
import { type PanelClient } from './panel-client.ts';
import type { Key } from './locales.ts';
/** Translate one key of this plugin's namespace. */
export type Translate = (key: Key, params?: Record<string, unknown>) => string;
/** What the registered action receives from the plugin body. */
export interface WorkspaceFoldersActionProps {
    /** The channel client; absent when this composition has no host Connection. */
    readonly panel: PanelClient | undefined;
    /** Opens the composed directory picker, when one is composed. */
    readonly pickDirectory: (() => Promise<string | null>) | undefined;
    /** Bound translator for this plugin's namespace. */
    readonly t: Translate;
    /**
     * The current session id, read when a request is built. A function rather
     * than a value because the selection changes while the panel stays mounted.
     */
    readonly sessionId?: () => string | undefined;
    /** Whether the sidebar renders wide content (`false` in the icon rail). */
    readonly wide?: boolean;
    /** Compact launcher in the upstream Files tab's public actions slot. */
    readonly compact?: boolean;
}
/** The sidebar footer action plus the dialog it opens. */
export declare function WorkspaceFoldersAction(props: WorkspaceFoldersActionProps): ReactNode;
