/**
 * The Workspace Folders panel body: this session's primary workspace root and
 * the additional roots registered for it, with the actions the milestone
 * requires — Add (through the composed directory picker), Remove, Alias, Copy
 * Path, Reveal, reordering, and the additional-root file tree.
 *
 * Since the unified workspace-config entry landed, the panel is a **section**
 * (`workspace-config.section`) rather than a dialog (ADR-0013): the
 * workspace-config holder owns the modal shell — mask, card, header, Escape,
 * the focus trap and the close action — and declares the seat from its
 * `shell.overlay` registration. This module therefore renders only the body:
 * `WorkspaceFoldersSection` has no overlay, no `role="dialog"`, no Escape/Tab
 * handling and no close button. The seat's owner share (`close`) is accepted
 * for contract symmetry but not used: this section has no whole-window
 * navigation of its own, so closing stays the holder's business.
 *
 * `WorkspaceFoldersLauncher` is the legacy Files-tab entry: on surfaces that
 * still offer `sidebar.right.tab.files.actions` it expands the same body
 * inline, keeping the panel reachable without the holder installed.
 *
 * Styling is the host's, not this file's: the elements carry `mrfw-*` classes
 * resolved by the stylesheet the client entry injects (`styles.ts`), and every
 * color in that sheet is a host `--dsw-*` token, so the panel inherits the
 * native look — capsule buttons, native typography — in both themes without
 * naming a single color here (see ADR-0006).
 *
 * @module dsh-plugin-multi-root-workspace/client/WorkspaceFoldersAction
 */
import { type ReactNode } from 'react';
import { type PanelClient } from './panel-client.ts';
import type { Key } from './locales.ts';
/** Translate one key of this plugin's namespace. */
export type Translate = (key: Key, params?: Record<string, unknown>) => string;
/**
 * The panel body's props: the seat owner share, the framework-synthesized
 * translator, and the business face the registration injects.
 *
 * The owner share is declared structurally (`close`) instead of importing the
 * holder's `WorkspaceConfigSectionOwnerProps`: the holder is a **dev**
 * dependency consumed with `import type` only (D3), so the published `.d.ts`
 * must not reference it. `index.ts` still pins the seat literal to the
 * holder's `WorkspaceConfigSectionSeat`, which is what keeps the two halves
 * from drifting.
 */
export interface WorkspaceFoldersSectionProps {
    /** Seat owner share: close the unified dialog (unused here — the holder owns it). */
    readonly close: () => void;
    /** Bound translator for this plugin's namespace. */
    readonly t: Translate;
    /** The channel client; absent when this composition has no host Connection. */
    readonly panel: PanelClient | undefined;
    /** Opens the composed directory picker, when one is composed. */
    readonly pickDirectory: (() => Promise<string | null>) | undefined;
    /**
     * The current session id, read when a request is built. A function rather
     * than a value because the selection changes while the panel stays mounted.
     */
    readonly sessionId?: () => string | undefined;
}
/** The business face the `workspace-config.section` registration injects. */
export type WorkspaceFoldersSectionInjected = Omit<WorkspaceFoldersSectionProps, 'close' | 't'>;
/** The Files-tab launcher's props (translator and ports arrive from the entry's closure). */
export type WorkspaceFoldersLauncherProps = Omit<WorkspaceFoldersSectionProps, 'close'>;
/**
 * The legacy Files-tab entry: a compact capsule that expands the same panel
 * body in place.
 *
 * The Files tab offers no modal shell of its own, and importing the holder's
 * open bridge is exactly the runtime coupling D3 forbids — so the entry owns a
 * local expansion state and renders the section inline. With the holder
 * installed the dialog is the primary surface; this entry only keeps the
 * older `sidebar.right.tab.files.actions` surface usable on its own.
 */
export declare function WorkspaceFoldersLauncher(props: WorkspaceFoldersLauncherProps): ReactNode;
/**
 * The panel body: reads the view once per mount, then after every mutation.
 *
 * Two shapes travel back over the channel, and they are handled separately on
 * purpose: every mutating endpoint answers with the whole refreshed view, while
 * `reveal` answers with the path it revealed and leaves the list untouched
 * (see `contract.ts`). Treating a reveal answer as a roots view is exactly the
 * contract mismatch this split removes.
 */
export declare function WorkspaceFoldersSection(props: WorkspaceFoldersSectionProps): ReactNode;
