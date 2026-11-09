/**
 * The Workspace Folders panel body: this session's primary workspace root and
 * the additional roots registered for it, with the actions the milestone
 * requires — Add (through the composed directory picker), Remove, Alias, Copy
 * Path, Reveal, reordering, and the additional-root file tree.
 *
 * Since the unified workspace-config entry landed, the panel is a **section**
 * (`workspace-config.section`) rather than a dialog (ADR-0013): the
 * workspace-config holder owns the modal shell — mask, card, header, Escape,
 * the focus trap and the dismissal action — and declares the seat from its
 * `shell.overlay` registration. This module therefore renders only the body:
 * `WorkspaceFoldersSection` has no overlay, no `role="dialog"`, no Escape/Tab
 * handling and no dismissal button. The one modal it does own is the
 * application-side directory picker (`DirectoryPickerDialog`): a browse-capable
 * deployment opens it through the pick state machine below, and it portals
 * itself to `document.body`, so the "no dialog shell" statement is about this
 * section's own chrome, not about overlays it raises on demand.
 *
 * The root list renders in two groups split client-side by
 * `root.source === 'common'` (D-05): registrations first (`panel.additional`),
 * configured common roots after (`panel.common`, a read-only surface whose
 * rows keep their disabled action set and badge). The add actions render at
 * the end of the additional group (D-06) — they can only add registrations,
 * so they must not read as actions on the common group that follows.
 *
 * The seat's owner share is the page-level workspace context (three states,
 * {@link WorkspaceConfigWorkspaceContext}) and the page re-mounts the section
 * whenever the selection changes, so this module never subscribes to it.
 * `{kind:'workspace'}` passes the gate and the original body renders;
 * `unassigned` / `none` render the `panel.noWorkspace` empty state and mount
 * no request-issuing body at all (the page has no valid target). An absent
 * share is the Files-tab form below and renders the original body unchanged —
 * addressing stays session-derived either way, which is out of scope here.
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
import type { WorkspaceConfigWorkspaceContext } from '@dsh-plugins/contracts';
import { type PanelClient } from './panel-client.ts';
import type { PickDirectory } from './directory-picker.ts';
import type { Translate } from './locales.ts';
export type { Translate } from './locales.ts';
/**
 * The panel body's props: the seat owner share, the framework-synthesized
 * translator, and the business face the registration injects.
 *
 * The owner share is declared as the contracts package's
 * `WorkspaceConfigWorkspaceContext` rather than the holder's
 * `WorkspaceConfigSectionOwnerProps`: the holder is a **dev** dependency
 * consumed with `import type` only (D3), so the published `.d.ts` must not
 * reference it, while `@dsh-plugins/contracts` is the shared type authority
 * (D-15) both halves already depend on. `index.ts` still pins the seat literal
 * to the holder's `WorkspaceConfigSectionSeat`, which is what keeps the two
 * halves from drifting.
 *
 * `workspace` is optional because two forms share this body: the in-page
 * section (the holder passes the page's selection) and the Files-tab launcher
 * (no page, no selection — an absent share means "render the original body").
 */
export interface WorkspaceFoldersSectionProps {
    /**
     * Page-level workspace context (three states, see
     * {@link WorkspaceConfigWorkspaceContext}). Absent in the Files-tab launcher
     * form, where the body behaves exactly as it did before the page landed.
     */
    readonly workspace?: WorkspaceConfigWorkspaceContext;
    /** Bound translator for this plugin's namespace. */
    readonly t: Translate;
    /** The channel client; absent when this composition has no host Connection. */
    readonly panel: PanelClient | undefined;
    /**
     * 拾取端口：永远存在（装配面经 `createDirectoryPicker` 注入，无 `uiWorkspace`
     * 服务时调用返回 `{ kind: 'unavailable' }`）。五态结局由下方拾取状态机分派：
     * `browse` 打开自建目录对话框、`unavailable` 隐藏拾取入口（D-09）。
     */
    readonly pickDirectory: PickDirectory;
    /**
     * The current session id, read when a request is built. A function rather
     * than a value because the selection changes while the panel stays mounted.
     */
    readonly sessionId?: () => string | undefined;
}
/** The business face the `workspace-config.section` registration injects (the page supplies the owner share). */
export type WorkspaceFoldersSectionInjected = Omit<WorkspaceFoldersSectionProps, 'workspace' | 't'>;
/** The Files-tab launcher's props: the business face plus the translator, and no owner share at all. */
export type WorkspaceFoldersLauncherProps = Omit<WorkspaceFoldersSectionProps, 'workspace'>;
/**
 * The legacy Files-tab entry: a compact capsule that expands the same panel
 * body in place.
 *
 * The Files tab offers no modal shell of its own, and importing the holder's
 * open bridge is exactly the runtime coupling D3 forbids — so the entry owns a
 * local expansion state and renders the section inline. With the holder
 * installed the page is the primary surface; this entry only keeps the
 * older `sidebar.right.tab.files.actions` surface usable on its own.
 *
 * It deliberately passes no owner share: there is no page and no selection in
 * the tab, which is exactly the "absent share" form of the body (the original
 * body, unchanged).
 */
export declare function WorkspaceFoldersLauncher(props: WorkspaceFoldersLauncherProps): ReactNode;
/**
 * The section entry: the page's selection decides whether a body is mounted
 * at all.
 *
 * `{kind:'workspace'}` — and an absent share, which is the Files-tab launcher
 * form — fall through to `WorkspaceFoldersBody`. `unassigned` / `none` render
 * the `panel.noWorkspace` empty state instead: the page has no valid target,
 * so the body and every request it would issue stay unmounted. This gate holds
 * no state of its own, which is what lets the body below call hooks
 * unconditionally — the body is a separate component, mounted only when the
 * gate passes (the same split the other contributors use).
 */
export declare function WorkspaceFoldersSection(props: WorkspaceFoldersSectionProps): ReactNode;
