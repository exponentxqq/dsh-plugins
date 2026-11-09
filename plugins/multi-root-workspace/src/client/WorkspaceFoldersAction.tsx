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
// 仅类型：拾取端口的形状与五态结局由能力降级模块定义（组 1 任务 1.1），
// 类型擦除后本模块对它零运行时依赖；对话框是唯一新引入的运行时依赖。
import type {
  DirectoryBrowser,
  DirectoryListing,
  DirectoryPickOutcome,
  PickDirectory,
} from './directory-picker.ts'
import type { Key, Translate } from './locales.ts'
import type { RootEntryView, RootState, RootView, RootsView } from '../contract.ts'
import { RootFileTree } from './RootFileTree.tsx'
import { DirectoryPickerDialog } from './DirectoryPickerDialog.tsx'

// §3.4：`Translate` 的类型权威已迁 `locales.ts`，这里只保留 type-only
// re-export（零运行时环）——`RootFileTree.tsx` / `index.ts` 的既有 import
// 路径因此不变。
export type { Translate } from './locales.ts'

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
  /**
   * 拾取端口：永远存在（装配面经 `createDirectoryPicker` 注入，无 `uiWorkspace`
   * 服务时调用返回 `{ kind: 'unavailable' }`）。五态结局由下方拾取状态机分派：
   * `browse` 打开自建目录对话框、`unavailable` 隐藏拾取入口（D-09）。
   */
  readonly pickDirectory: PickDirectory
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
 * One failure rendered as a full sentence (§3.5): the localized copy for the
 * code, plus the raw host prose only for the two diagnostic codes — the
 * transport failure and the host's own internal error are the only places
 * where the message carries facts the copy cannot name. The section alert and
 * the picker dialog's `onConfirm` failure share this one renderer, so a
 * failure reads identically no matter which surface reported it.
 */
function sentenceOf(error: PanelError, t: Translate): string {
  const base = t(errorKeyOf(error.code))
  return error.code === 'unavailable' || error.code === 'panel/internal'
    ? `${base} (${error.message})`
    : base
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

/**
 * The pick state machine (§3.5): `closed` is the resting state, `open` holds
 * the browsing port — plus the home listing the capability probe may already
 * have produced, reused as the dialog's first frame — while
 * `DirectoryPickerDialog` is mounted, and `unavailable` records that this
 * deployment has no picker at all so the entry stays hidden (D-09) until the
 * section remounts.
 */
type PickerState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'open'; readonly browsing: DirectoryBrowser; readonly listing?: DirectoryListing }
  | { readonly kind: 'unavailable' }

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
  const [picker, setPicker] = useState<PickerState>({ kind: 'closed' })
  const [picking, setPicking] = useState(false)
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
   * @returns `undefined` on success; the renderable failure otherwise (the
   *   caller decides whether to clear the input it came from, and the picker
   *   dialog turns it into a sentence shown in place).
   */
  const mutate = useCallback(async (endpoint: 'add' | 'remove' | 'alias' | 'move', payload: Record<string, unknown>): Promise<PanelError | undefined> => {
    if (panel === undefined) {
      const failure = new PanelError('unavailable', 'no connection')
      setState(previous => ({ ...previous, error: failure, busy: false, noSession: false }))
      return failure
    }
    const base = requestBase()
    if (base === undefined) {
      setState({ view: undefined, error: undefined, busy: false, noSession: true })
      return undefined
    }
    const epoch = ++requestEpoch.current
    setState(previous => ({ ...previous, busy: true, noSession: false }))
    try {
      const view = await panel.call(endpoint, { ...base, ...payload })
      if (!mounted.current || epoch !== requestEpoch.current) return undefined
      setState({ view, error: undefined, busy: false, noSession: false })
      return undefined
    } catch (error: unknown) {
      const failure = asPanelError(error)
      if (!mounted.current || epoch !== requestEpoch.current) return undefined
      setState(previous => ({ ...previous, error: failure, busy: false }))
      return failure
    }
  }, [panel, requestBase])

  /**
   * 拾取入口（五态分派 + `picking` 防双击）：点「添加目录」后调拾取端口，按
   * 结局分派——`picked` 走既有 `add`；`browse` 打开自建目录对话框（探测已
   * 取得的 home 层复用为首帧，零次重复 `list`）；`cancelled` 无动作；
   * `unavailable` 记入状态机（`+` 消失、显示手输提示，D-09）；`failed` 把
   * 失败句送进分节 alert。拾取从不回落到手输框：点「添加目录」的操作员要的
   * 是拾取器，不是他可能早已输入的文本。
   */
  const openPicker = useCallback(async () => {
    if (picking) return
    setPicking(true)
    let outcome: DirectoryPickOutcome
    try {
      outcome = await props.pickDirectory()
    } catch (error: unknown) {
      // 适配器契约承诺失败走 `failed` 态；这里的 reject 防御只兜契约外异常。
      setState(previous => ({ ...previous, error: asPanelError(error) }))
      return
    } finally {
      // `picking` 的清理放 `finally`：异常路径也要复位，按钮不能永久悬挂。
      setPicking(false)
    }
    switch (outcome.kind) {
      case 'picked': {
        const path = outcome.path
        // 适配器保证非空；空白防御维持旧闭包「空串即取消」的行为等价。
        if (path.trim() === '') return
        await mutate('add', { path })
        return
      }
      case 'browse':
        // `exactOptionalPropertyTypes` 下必须条件展开，不能写 `listing: undefined`。
        setPicker({ kind: 'open', browsing: outcome.browsing, ...(outcome.listing ? { listing: outcome.listing } : {}) })
        return
      case 'cancelled':
        return
      case 'unavailable':
        setPicker({ kind: 'unavailable' })
        return
      case 'failed':
        setState(previous => ({ ...previous, error: asPanelError(outcome.error) }))
        return
    }
  }, [picking, props.pickDirectory, mutate])

  /**
   * The picker dialog's adopt handler: submit the path as an `add` and let the
   * dialog render the failure in place — a string return keeps the dialog open
   * (the operator may want to pick a different directory), `undefined` closes.
   */
  const confirmPickedPath = useCallback(async (path: string): Promise<string | undefined> => {
    const failure = await mutate('add', { path })
    return failure === undefined ? undefined : sentenceOf(failure, t)
  }, [mutate, t])

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
    const failure = await mutate('add', { path })
    if (failure === undefined) setManualPath('')
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

  /**
   * Copy one absolute path to the clipboard. `key` is the highlight identity
   * of the button that asked — a row's `rowKey`, or `'primary'` for the
   * primary row (D-08) — so the 「已复制」 swap lands on the right button even
   * though two rows could otherwise share a path.
   */
  const copyPath = useCallback(async (path: string, key: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(path)
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

  // 分组（D-05）：只按 source 拆分，wire 顺序不变；通用行恒排在附属行之后，
  // 附属行序数因此不受分组影响。
  const view = state.view
  const roots = view?.roots ?? []
  const registered = roots.filter(root => root.source !== 'common')
  const commons = roots.filter(root => root.source === 'common')

  /**
   * Render one group's rows: one closure consumes one array, and the move
   * anchors are taken from that array's own neighbours (§3.5 — the one real
   * behavior fix of the group split). A common row keeps its full but disabled
   * action set: the group split is presentational, so its rows still cannot
   * move, rename or remove, and the badge still says why.
   */
  const renderRows = (rows: readonly RootView[]): ReactNode[] => rows.map((root, index) => {
    const key = rowKey(root)
    const isCommon = root.source === 'common'
    const canMoveUp = !isCommon && index > 0
    const canMoveDown = !isCommon && index < rows.length - 1
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
        onClick={() => { void copyPath(root.path, key) }}
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
        onClick={() => { void move(root, rows[index - 1]) }}
        icon={<IconChevronUp />}
        label={t('panel.moveUp')}
      />
      <IconButton
        disabled={state.busy || !canMoveDown}
        onClick={() => { void move(root, rows[index + 2]) }}
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
  })

  /** 动作行（D-06）：拾取按钮、手输、重试与能力提示，归入附属组末尾。 */
  const renderActions = (): ReactNode => (
    <div className="mrfw-actions">
      {picker.kind !== 'unavailable' ? (
        <Action
          variant="primary"
          disabled={state.busy || picking}
          onClick={() => { void openPicker() }}
        >
          <span aria-hidden="true"><IconPlus /></span>
          {t('panel.add')}
        </Action>
      ) : null}
      {picker.kind === 'unavailable' ? (
        <p className="mrfw-note">{t('picker.unavailable')}</p>
      ) : null}
      <input
        className="mrfw-input"
        value={manualPath}
        placeholder={t('panel.addManual')}
        onChange={event => { setManualPath(event.target.value) }}
        onKeyDown={event => { if (event.key === 'Enter') void addManualPath() }}
      />
      <Action onClick={() => { void addManualPath() }} disabled={state.busy || manualPath.trim() === ''} variant="outline">
        {t('panel.addConfirm')}
      </Action>
      <Action onClick={() => { void refresh() }} disabled={state.busy} variant="outline">{t('panel.retry')}</Action>
    </div>
  )

  return (
    <section className="mrfw-body mrfw-sectionBody" aria-label={t('panel.title')}>
      {state.noSession ? (
        <>
          <p className="mrfw-note">{t('panel.noSession')}</p>
          {/* 动作行随附属组（D-06）；noSession 时没有组可挂，retry 退化为
              body 层的一行——没有会话就没有列表，动作行只剩「重试」。 */}
          <div className="mrfw-actions">
            <Action onClick={() => { void refresh() }} disabled={state.busy} variant="outline">{t('panel.retry')}</Action>
          </div>
        </>
      ) : (
        <>
      <p className="mrfw-description">{t('panel.subtitle')}</p>

      {state.error === undefined ? null : (
        <p role="alert" className="mrfw-alert">{sentenceOf(state.error, t)}</p>
      )}
      {view?.unavailable === undefined ? null : (
        <p role="alert" className="mrfw-alert">{view.unavailable}</p>
      )}

      <section className="mrfw-section">
        <div className="mrfw-sectionTitleRow">
          <span className="mrfw-sectionTitle">{t('panel.primary')}</span>
          <span className="mrfw-sectionNote">{t('panel.primaryNote')}</span>
        </div>
        <div className="mrfw-row mrfw-rowBare">
          <div className="mrfw-rootText">
            <span className="mrfw-rootName">
              {view === undefined ? '…' : (view.primaryName ?? basename(view.primaryRoot))}
            </span>
            <span className="mrfw-rootPath">{view?.primaryRoot ?? '…'}</span>
          </div>
          {view === undefined ? null : (
            <IconButton
              onClick={() => { void copyPath(view.primaryRoot, 'primary') }}
              icon={<IconCopy />}
              label={copiedId === 'primary' ? t('panel.copied') : t('panel.copyPath')}
            />
          )}
        </div>
      </section>

      <section className="mrfw-section">
        <div className="mrfw-sectionTitleRow">
          <span className="mrfw-sectionTitle">{t('panel.additional')}</span>
        </div>
        {view === undefined ? <p className="mrfw-note">{t('panel.loading')}</p> : null}
        {view !== undefined && registered.length === 0 ? (
          <p className="mrfw-note">
            {t('panel.empty')} {t('panel.emptyHint')}
          </p>
        ) : null}
        {renderRows(registered)}
        {renderActions()}
      </section>

      <section className="mrfw-section">
        <div className="mrfw-sectionTitleRow">
          <span className="mrfw-sectionTitle" title={t('root.sourceCommonTitle')}>{t('panel.common')}</span>
        </div>
        {/* 组说明与标题一起常驻（§3.7），但加载中不渲染：还没读到的列表不能
            被说成「没配置」。 */}
        {view === undefined ? null : (
          <p className="mrfw-note">{commons.length === 0 ? t('panel.commonEmpty') : t('panel.commonHint')}</p>
        )}
        {renderRows(commons)}
      </section>
        </>
      )}

      {picker.kind === 'open' ? (
        <DirectoryPickerDialog
          open
          t={t}
          browser={picker.browsing}
          {...(picker.listing ? { initialListing: picker.listing } : {})}
          onConfirm={confirmPickedPath}
          onClose={() => { setPicker({ kind: 'closed' }) }}
        />
      ) : null}
    </section>
  )
}

/** Normalize any thrown value into a `PanelError` the panel can render. */
function asPanelError(error: unknown): PanelError {
  if (error instanceof PanelError) return error
  return new PanelError('fallback', error instanceof Error ? error.message : String(error))
}
