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
 * handling and no dismissal button.
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

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: the page-level workspace context (D-15 — the type authority lives
// in `@dsh-plugins/contracts`). The import is erased at build time, so neither
// this bundle nor a runtime load depends on the contracts package.
import type { WorkspaceConfigWorkspaceContext } from '@dsh-plugins/contracts'
import {
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconEdit,
  IconEllipsis,
  IconFolderClose,
  IconFolderOpen,
  IconPlus,
  IconTrash,
} from '../compat/client-icons.ts'
import { errorKeyOf, PanelError, type PanelClient } from './panel-client.ts'
import type { Key } from './locales.ts'
import type { RootEntryView, RootState, RootView, RootsView } from '../contract.ts'
import { RootFileTree } from './RootFileTree.tsx'

/** Translate one key of this plugin's namespace. */
export type Translate = (key: Key, params?: Record<string, unknown>) => string

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
  readonly workspace?: WorkspaceConfigWorkspaceContext
  /** Bound translator for this plugin's namespace. */
  readonly t: Translate
  /** The channel client; absent when this composition has no host Connection. */
  readonly panel: PanelClient | undefined
  /** Opens the composed directory picker, when one is composed. */
  readonly pickDirectory: (() => Promise<string | null>) | undefined
  /**
   * The current session id, read when a request is built. A function rather
   * than a value because the selection changes while the panel stays mounted.
   */
  readonly sessionId?: () => string | undefined
}

/** The business face the `workspace-config.section` registration injects (the page supplies the owner share). */
export type WorkspaceFoldersSectionInjected = Omit<WorkspaceFoldersSectionProps, 'workspace' | 't'>

/** The Files-tab launcher's props: the business face plus the translator, and no owner share at all. */
export type WorkspaceFoldersLauncherProps = Omit<WorkspaceFoldersSectionProps, 'workspace'>

/** The visual family of one capsule button, mirroring the host Button kit. */
type ActionVariant = 'ghost' | 'outline' | 'primary' | 'danger'

const VARIANT_CLASS: Record<ActionVariant, string> = {
  ghost: 'mrfw-btnGhost',
  outline: 'mrfw-btnOutline',
  primary: 'mrfw-btnPrimary',
  danger: 'mrfw-btnDanger',
}

/** One small capsule button matching the panel's own styling. */
function Action(props: {
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  variant?: ActionVariant
}): ReactNode {
  const variant = props.variant ?? 'ghost'
  return (
    <button
      type="button"
      className={`mrfw-btn ${VARIANT_CLASS[variant]}`}
      onClick={props.onClick}
      disabled={props.disabled === true}
    >
      {props.children}
    </button>
  )
}

/**
 * One icon-only button (a host "iconButton"): a fixed square of the capsule
 * family whose meaning travels in `title`/`aria-label` instead of text.
 */
function IconButton(props: {
  onClick: () => void
  icon: ReactNode
  label: string
  disabled?: boolean
  variant?: ActionVariant
}): ReactNode {
  const variant = props.variant ?? 'ghost'
  return (
    <button
      type="button"
      className={`mrfw-btn mrfw-iconBtn ${VARIANT_CLASS[variant]}`}
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      disabled={props.disabled === true}
    >
      {props.icon}
    </button>
  )
}

/** The locale key for one reported root state. */
function stateKey(state: RootState): Key {
  switch (state) {
    case 'available': return 'state.available'
    case 'missing': return 'state.missing'
    case 'redirected': return 'state.redirected'
    case 'invalid': return 'state.invalid'
  }
}

/** The final segment of an absolute path, on either platform separator. */
function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(segment => segment !== '')
  return segments[segments.length - 1] ?? path
}

/**
 * The primary text of one row: the stored alias when set, otherwise the
 * directory's own name — the display the registration was added with.
 */
function displayNameOf(root: RootView): string {
  return root.alias ?? basename(root.path)
}

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
export function WorkspaceFoldersLauncher(props: WorkspaceFoldersLauncherProps): ReactNode {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mrfw-fileLauncher">
      <button
        type="button"
        className="mrfw-btn mrfw-btnGhost"
        title={props.t('action.title')}
        aria-label={props.t('action.label')}
        aria-expanded={expanded}
        onClick={() => { setExpanded(value => !value) }}
      >
        <span aria-hidden="true"><IconFolderClose size={16} /></span>
      </button>
      {expanded
        ? <WorkspaceFoldersSection {...props} />
        : null}
    </div>
  )
}

/** State of one section instance. */
interface SectionState {
  readonly view: RootsView | undefined
  readonly error: PanelError | undefined
  readonly busy: boolean
  /** True when the client has no current session and must not call the host. */
  readonly noSession: boolean
}

function entryOf(root: RootView): RootEntryView {
  return { ordinal: root.ordinal, id: root.id, path: root.path, addedAt: root.addedAt }
}

function rowKey(root: RootView): string {
  return `${root.ordinal}\u0000${root.id}\u0000${root.path}\u0000${root.addedAt}`
}

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
export function WorkspaceFoldersSection(props: WorkspaceFoldersSectionProps): ReactNode {
  const { workspace, t } = props
  if (workspace !== undefined && workspace.kind !== 'workspace') {
    return (
      <section className="mrfw-body mrfw-sectionBody" aria-label={t('panel.title')}>
        <p className="mrfw-note">{t('panel.noWorkspace')}</p>
      </section>
    )
  }
  return <WorkspaceFoldersBody {...props} />
}

/**
 * The panel body: reads the view once per mount, then after every mutation.
 * Mounted only through `WorkspaceFoldersSection`, so it always has a target.
 *
 * Two shapes travel back over the channel, and they are handled separately on
 * purpose: every mutating endpoint answers with the whole refreshed view, while
 * `reveal` answers with the path it revealed and leaves the list untouched
 * (see `contract.ts`). Treating a reveal answer as a roots view is exactly the
 * contract mismatch this split removes.
 *
 * The body's addressing is the current session, not the page's selection: the
 * share only gates rendering here, and re-addressing the endpoints by workspace
 * is a business change outside this one's scope.
 */
function WorkspaceFoldersBody(props: WorkspaceFoldersSectionProps): ReactNode {
  const { panel, t } = props
  const [state, setState] = useState<SectionState>({
    view: undefined,
    error: undefined,
    busy: false,
    noSession: false,
  })
  const [manualPath, setManualPath] = useState('')
  const [aliasFor, setAliasFor] = useState<string | undefined>(undefined)
  const [aliasDraft, setAliasDraft] = useState('')
  const [copiedId, setCopiedId] = useState<string | undefined>(undefined)
  const [menuFor, setMenuFor] = useState<string | undefined>(undefined)
  const requestEpoch = useRef(0)
  const mounted = useRef(true)

  useEffect(() => () => {
    mounted.current = false
    requestEpoch.current += 1
  }, [])

  const requestBase = useCallback((): { sessionId: string } | undefined => {
    const current = props.sessionId?.()
    return current === undefined || current === '' ? undefined : { sessionId: current }
  }, [props.sessionId])

  const refresh = useCallback(async () => {
    if (panel === undefined) {
      setState({
        view: undefined,
        error: new PanelError('unavailable', 'no connection'),
        busy: false,
        noSession: false,
      })
      return
    }
    const base = requestBase()
    if (base === undefined) {
      setState({ view: undefined, error: undefined, busy: false, noSession: true })
      return
    }
    const epoch = ++requestEpoch.current
    setState(previous => ({ ...previous, busy: true, noSession: false }))
    try {
      const view = await panel.call('list', base)
      if (!mounted.current || epoch !== requestEpoch.current) return
      setState({ view, error: undefined, busy: false, noSession: false })
    } catch (error: unknown) {
      if (!mounted.current || epoch !== requestEpoch.current) return
      setState({ view: undefined, error: asPanelError(error), busy: false, noSession: false })
    }
  }, [panel, requestBase])

  useEffect(() => { void refresh() }, [refresh])

  /**
   * Submit one change to the host and adopt the view it answers with.
   * @returns whether the host accepted it (the caller decides whether to clear
   *   the input it came from).
   */
  const mutate = useCallback(async (endpoint: 'add' | 'remove' | 'alias' | 'move', payload: Record<string, unknown>): Promise<boolean> => {
    if (panel === undefined) return false
    const base = requestBase()
    if (base === undefined) {
      setState({ view: undefined, error: undefined, busy: false, noSession: true })
      return false
    }
    const epoch = ++requestEpoch.current
    setState(previous => ({ ...previous, busy: true, noSession: false }))
    try {
      const view = await panel.call(endpoint, { ...base, ...payload })
      if (!mounted.current || epoch !== requestEpoch.current) return false
      setState({ view, error: undefined, busy: false, noSession: false })
      return true
    } catch (error: unknown) {
      if (!mounted.current || epoch !== requestEpoch.current) return false
      setState(previous => ({ ...previous, error: asPanelError(error), busy: false }))
      return false
    }
  }, [panel, requestBase])

  /**
   * Open the composed picker and add whatever it returns. A picker that is not
   * composed, or a dialog the operator dismissed, adds nothing — it never falls
   * back to the manual field, because the operator who clicked "Add folder…"
   * asked for the picker, not for the text they may have typed earlier.
   */
  const addViaPicker = useCallback(async () => {
    if (props.pickDirectory === undefined) return
    let picked: string | null = null
    try {
      picked = await props.pickDirectory()
    } catch (error: unknown) {
      setState(previous => ({ ...previous, error: asPanelError(error) }))
      return
    }
    if (picked === null || picked.trim() === '') return
    await mutate('add', { path: picked })
  }, [mutate, props])

  /**
   * Add the path in the manual field — the one the operator typed. The picker
   * plays no part here: this is the entry point the confirm button and the
   * Enter key use.
   */
  const addManualPath = useCallback(async () => {
    const path = manualPath.trim()
    if (path === '') return
    // Cleared only on success: a rejected path stays in the field so the operator
    // can fix it instead of retyping it.
    if (await mutate('add', { path })) setManualPath('')
  }, [manualPath, mutate])

  /** Reveal one root: the answer is the revealed path, not a new view. */
  const reveal = useCallback(async (root: RootView) => {
    if (panel === undefined) return
    const base = requestBase()
    if (base === undefined) {
      setState({ view: undefined, error: undefined, busy: false, noSession: true })
      return
    }
    const epoch = ++requestEpoch.current
    setState(previous => ({ ...previous, busy: true, noSession: false }))
    try {
      await panel.call('reveal', { ...base, entry: entryOf(root) })
      if (!mounted.current || epoch !== requestEpoch.current) return
      setState(previous => ({ ...previous, error: undefined, busy: false }))
    } catch (error: unknown) {
      if (!mounted.current || epoch !== requestEpoch.current) return
      setState(previous => ({ ...previous, error: asPanelError(error), busy: false }))
    }
  }, [panel, requestBase])

  const copyPath = useCallback(async (root: RootView) => {
    try {
      await navigator.clipboard.writeText(root.path)
      const key = rowKey(root)
      setCopiedId(key)
      setState(previous => ({ ...previous, error: undefined }))
      window.setTimeout(() => { setCopiedId(current => (current === key ? undefined : current)) }, 1500)
    } catch (error: unknown) {
      // A clipboard refusal is the browser environment's, not the host's, so it
      // is reported here with its own code rather than left silent.
      setCopiedId(undefined)
      setState(previous => ({
        ...previous,
        error: new PanelError('copy-failed', error instanceof Error ? error.message : String(error)),
      }))
    }
  }, [])

  const move = useCallback(async (root: RootView, before: RootView | undefined) => {
    await mutate('move', before === undefined
      ? { entry: entryOf(root) }
      : { entry: entryOf(root), beforeEntry: entryOf(before) })
  }, [mutate])

  const roots = state.view?.roots ?? []
  return (
    <section className="mrfw-body mrfw-sectionBody" aria-label={t('panel.title')}>
      {state.noSession ? (
        <p className="mrfw-note">{t('panel.noSession')}</p>
      ) : (
        <>
      <p className="mrfw-description">{t('panel.subtitle')}</p>

      {state.error === undefined ? null : (
        <p role="alert" className="mrfw-alert">
          {t(errorKeyOf(state.error.code))}
          {(state.error.code === 'unavailable' || state.error.code === 'panel/internal') ? ` (${state.error.message})` : ''}
        </p>
      )}
      {state.view?.unavailable === undefined ? null : (
        <p role="alert" className="mrfw-alert">{state.view.unavailable}</p>
      )}

      <section className="mrfw-section">
        <div className="mrfw-sectionTitleRow">
          <span className="mrfw-sectionTitle">{t('panel.primary')}</span>
          <span className="mrfw-sectionNote">{t('panel.primaryNote')}</span>
        </div>
        <div className="mrfw-row mrfw-rowBare">
          <div className="mrfw-rootText">
            <span className="mrfw-rootName">
              {state.view === undefined ? '…' : (state.view.primaryName ?? basename(state.view.primaryRoot))}
            </span>
            <span className="mrfw-rootPath">{state.view?.primaryRoot ?? '…'}</span>
          </div>
        </div>
      </section>

      <section className="mrfw-section">
        <div className="mrfw-sectionTitleRow">
          <span className="mrfw-sectionTitle">{t('panel.additional')}</span>
        </div>
        {state.view === undefined ? <p className="mrfw-note">{t('panel.loading')}</p> : null}
        {state.view !== undefined && roots.length === 0 ? (
          <p className="mrfw-note">
            {t('panel.empty')} {t('panel.emptyHint')}
          </p>
        ) : null}
        {roots.map((root, index) => {
          const key = rowKey(root)
          // A `common` row is granted by the plugin configuration to every
          // workspace: it is listed (and browsable) like any other root, but
          // this panel cannot rename, remove or reorder it — the host answers
          // `common-root` if it tries. The move anchors are computed from the
          // rendered neighbours and the common rows always sit after every
          // registration, so the last registration has nothing to swap with
          // below it and a common row can never move at all.
          const isCommon = root.source === 'common'
          const canMoveUp = !isCommon && index > 0
          const canMoveDown = !isCommon && index < roots.length - 1 && roots[index + 1]?.source !== 'common'
          return <div key={key} className="mrfw-row">
            <div className="mrfw-rootText">
              <span className="mrfw-rootName">{displayNameOf(root)}</span>
              <span className="mrfw-rootPath">{root.path}</span>
            </div>
            {isCommon ? (
              <span title={t('root.sourceCommonTitle')} className="mrfw-sourceBadge">
                {t('root.sourceCommon')}
              </span>
            ) : null}
            {root.state === 'available' ? null : (
              <span title={root.detail} className="mrfw-stateWarn">
                {t(stateKey(root.state))}
              </span>
            )}
            <IconButton
              onClick={() => { void copyPath(root) }}
              icon={<IconCopy />}
              label={copiedId === key ? t('panel.copied') : t('panel.copyPath')}
            />
            <IconButton
              disabled={state.busy}
              onClick={() => { void reveal(root) }}
              icon={<IconFolderOpen />}
              label={t('panel.reveal')}
            />
            <IconButton
              disabled={state.busy || !canMoveUp}
              onClick={() => { void move(root, roots[index - 1]) }}
              icon={<IconChevronUp />}
              label={t('panel.moveUp')}
            />
            <IconButton
              disabled={state.busy || !canMoveDown}
              onClick={() => { void move(root, roots[index + 2]) }}
              icon={<IconChevronDown />}
              label={t('panel.moveDown')}
            />
            <Menu
              open={menuFor === key}
              onClose={() => { setMenuFor(undefined) }}
              closeOnPointerLeave
              items={[
                { id: 'rename', label: t('panel.rename'), icon: <IconEdit />, disabled: state.busy || isCommon },
                { id: 'remove', label: t('panel.remove'), icon: <IconTrash />, danger: true, disabled: state.busy || isCommon },
              ]}
              onSelect={(id) => {
                setMenuFor(undefined)
                if (id === 'rename') {
                  setAliasFor(key)
                  setAliasDraft(root.alias ?? '')
                }
                if (id === 'remove') void mutate('remove', { entry: entryOf(root) })
              }}
              portal
              align="end"
              anchor={(
                <IconButton
                  disabled={state.busy}
                  onClick={() => { setMenuFor(current => (current === key ? undefined : key)) }}
                  icon={<IconEllipsis />}
                  label={t('panel.more')}
                />
              )}
            />
            {aliasFor === key ? (
              <span className="mrfw-aliasEditor">
                <input
                  autoFocus
                  className="mrfw-input mrfw-inputInline"
                  value={aliasDraft}
                  placeholder={t('panel.aliasPlaceholder')}
                  onChange={event => { setAliasDraft(event.target.value) }}
                />
                <Action disabled={state.busy} onClick={() => { void mutate('alias', { entry: entryOf(root), alias: aliasDraft }); setAliasFor(undefined) }}>
                  {t('panel.aliasSave')}
                </Action>
                <Action onClick={() => { setAliasFor(undefined) }}>{t('panel.aliasCancel')}</Action>
              </span>
            ) : null}
            {root.state === 'available' && panel !== undefined && props.sessionId !== undefined && <RootFileTree panel={panel} entry={entryOf(root)} sessionId={props.sessionId} t={t} />}
          </div>
        })}
      </section>
        </>
      )}

      <div className="mrfw-actions">
        {state.noSession || props.pickDirectory === undefined ? null : (
          <IconButton
            variant="outline"
            disabled={state.busy}
            onClick={() => { void addViaPicker() }}
            icon={<IconPlus />}
            label={t('panel.add')}
          />
        )}
        {state.noSession ? null : (
          <>
        <input
          className="mrfw-input"
          value={manualPath}
          placeholder={t('panel.addManual')}
          onChange={event => { setManualPath(event.target.value) }}
          onKeyDown={event => { if (event.key === 'Enter') void addManualPath() }}
        />
        <Action onClick={() => { void addManualPath() }} disabled={state.busy || manualPath.trim() === ''} variant="primary">
          {t('panel.addConfirm')}
        </Action>
          </>
        )}
        <Action onClick={() => { void refresh() }} disabled={state.busy} variant="outline">{t('panel.retry')}</Action>
      </div>
    </section>
  )
}

/** Normalize any thrown value into a `PanelError` the panel can render. */
function asPanelError(error: unknown): PanelError {
  if (error instanceof PanelError) return error
  return new PanelError('fallback', error instanceof Error ? error.message : String(error))
}
