/**
 * 「工作区文件夹」分节的应用内单栏目录拾取对话框（client 半）。
 *
 * D-03：模态自绘（遮罩 / 卡片 / Escape / Tab 焦点环 / 焦点归还），不用
 * ui-primitives 的 `Modal`——测试替身不承载其焦点语义，且分节内的拾取浮层
 * 与 holder 的对话框壳不重叠（ADR-0013 删掉的是分节壳，不是任何浮层）；视觉
 * 逐值复刻宿主 Modal.module.css 配方，token 全部来自 `styles.ts` 的
 * `.mrfw-picker*` 族（ADR-0006：无字面色）。D-10：portal 到 `document.body`，
 * 避开宿主侧栏抽屉的 transform 动画对 fixed 定位的退化。
 *
 * 行为契约（code-design §3.3）：
 *
 * 1. `open` 翻 true：重置全部瞬态；有 `initialListing` 直接 ready，否则零参
 *    `list()`（Host home）；记录 opener 并把焦点移到卡片根。`browser` /
 *    `initialListing` 在打开瞬间快照，打开后属性变化不重扫、不换端口。
 * 2. 导航（点行 / 点面包屑）：`scanEpoch` 递增并 abort 上一次请求；过期响应
 *    与 abort 响应都丢弃。
 * 3. 隐藏项默认过滤（`entry.hidden`），开关（`aria-pressed`）只改渲染。
 * 4. `truncated` 时显示 `picker.truncated`。
 * 5. 新建对当前层 `listing.path` 发起；成功收起新建行并导航进入创建出的目录
 *    （D-04：导航进入是防误采纳父目录的最小代价）；失败原地显示码对应文案。
 * 6. 采纳：`await onConfirm(listing.path)`；返回字符串 = 本地化失败句，原地
 *    显示、保持打开；返回 `undefined` = 成功，关闭。
 * 7. 关闭路径（Esc / 取消 / 遮罩）一律不采纳，且归还 opener 焦点后再通知父
 *    组件（焦点归还发生在父组件可能触发的卸载之前）。
 * 8. Tab / Shift+Tab 在卡片内可聚焦元素间环绕；`role="dialog"` +
 *    `aria-modal="true"` + `aria-labelledby` 指向标题。
 * 9. 父组件卸载即 abort 当前扫描。
 *
 * 对话框不负责：`add` 请求、错误码 → 文案（浏览错误除外）、能力判定、记住
 * 上次目录（每次打开都从 Host home 开始）。
 *
 * @module dsh-plugin-multi-root-workspace/client/DirectoryPickerDialog
 */

import { Fragment, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronRight, IconClose, IconFolderClose } from '../compat/client-icons.ts'
import {
  DirectoryBrowseError,
  type DirectoryBrowser,
  type DirectoryBrowseCode,
  type DirectoryListing,
} from './directory-picker.ts'
import type { Key, Translate } from './locales.ts'

/** 对话框 props（§3.3 契约形状）。 */
export interface DirectoryPickerDialogProps {
  /** 是否显示（父组件只在需要时挂载，但仍保留该开关便于动画/清理语义）。 */
  readonly open: boolean
  readonly t: Translate
  /** 浏览端口；理论上打开时必有，防御性允许缺席（退化为失败提示）。 */
  readonly browser: DirectoryBrowser | undefined
  /** 能力探测已取得的 home 层，复用为对话框首帧，避免重复请求。 */
  readonly initialListing?: DirectoryListing
  /**
   * 采纳一个绝对路径。
   * @returns undefined = 已成功（对话框自行关闭）；字符串 = 已本地化的失败句（原地显示并保持打开）。
   */
  readonly onConfirm: (path: string) => Promise<string | undefined>
  /** 取消（取消按钮 / Esc / 遮罩点击）。 */
  readonly onClose: () => void
}

/** 一次目录扫描的三态（§3.3 状态机）。 */
type ScanState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly listing: DirectoryListing }
  | { readonly kind: 'failed'; readonly code: DirectoryBrowseCode; readonly message: string }

/** 新建文件夹行的瞬态（§3.3 的 CreateState）。 */
interface CreateState {
  readonly open: boolean
  readonly name: string
  readonly busy: boolean
  readonly error: string | undefined
}

/** 新建行的收起态（导航/重置共用同一常量，保持引用稳定）。 */
const CREATE_CLOSED: CreateState = { open: false, name: '', busy: false, error: undefined }

/** 标题元素 id：同一时刻至多一个对话框实例（portal 到 body），常量即可。 */
const TITLE_ID = 'mrfw-directory-picker-title'

/** 卡片内可聚焦元素的查询选择器（Tab 焦点环用）。 */
const FOCUSABLE_SELECTOR = 'button, input, select, textarea, a[href], [tabindex]'

/** 浏览失败码 → 文案键：对话框唯一承担的错误映射（§3.7 的 `picker.error.*`）。 */
function browseErrorKey(code: DirectoryBrowseCode): Key {
  switch (code) {
    case 'picker-unreadable': return 'picker.error.unreadable'
    case 'picker-exists': return 'picker.error.exists'
    case 'picker-create-failed': return 'picker.error.create-failed'
    case 'picker-failed': return 'picker.error.failed'
  }
}

/** 任意失败上的本地码：适配器契约承诺 `DirectoryBrowseError`，其余归 `picker-failed`。 */
function browseCodeOf(error: unknown): DirectoryBrowseCode {
  return error instanceof DirectoryBrowseError ? error.code : 'picker-failed'
}

/** 任意失败上的 message 原文（进 `ScanState.failed.message` 供诊断，不直接渲染）。 */
function diagnosticMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 目录拾取对话框。挂载与否由父组件决定；本组件只按 `open` 决定渲染浮层，
 * 全部 hooks 无条件调用以满足 hooks 规则。
 */
export function DirectoryPickerDialog(props: DirectoryPickerDialogProps): ReactNode {
  const [scan, setScan] = useState<ScanState>({ kind: 'loading' })
  const [showHidden, setShowHidden] = useState(false)
  const [create, setCreate] = useState<CreateState>(CREATE_CLOSED)
  const [commitError, setCommitError] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const scanAbortRef = useRef<AbortController | null>(null)
  /** 扫描序号：只有最新一次导航的响应才允许写 `scan`（行为契约 2）。 */
  const scanEpochRef = useRef(0)
  /** 采纳序号：close 使在途 `onConfirm` 的续体失效，防关闭后写状态（行为契约 6/7）。 */
  const confirmEpochRef = useRef(0)
  /** 打开瞬间快照的浏览端口（TG2 要点 1：不随属性变化换端口）。 */
  const browserRef = useRef<DirectoryBrowser | undefined>(undefined)

  /**
   * 导航到一层：`scanEpoch` 递增、abort 上一次、`list(path)`；`path` 缺席 =
   * 宿主 home（首帧）。过期响应（序号落后）与 abort 响应（`signal.aborted`）
   * 都丢弃——前者防旧覆盖新，后者防「已取消的扫描报错误」。
   *
   * 导航**不清空旧层**（stale-while-revalidate）：`loading` 只属于首帧占位，
   * 旧层渲染保留到新响应或失败覆盖为止。这让「快速连点」真实可用——挂起期间
   * 上一层的行仍可点（React 18 的 discrete 事件在两次点击之间同步 flush，
   * 清空会让第二次点击落空）；旧内容短暂滞留是单栏拾取可接受的代价。
   */
  const navigate = (path: string | undefined): void => {
    const epoch = ++scanEpochRef.current
    scanAbortRef.current?.abort()
    const controller = new AbortController()
    scanAbortRef.current = controller
    const browser = browserRef.current
    if (browser === undefined) {
      // 防御分支（§3.3 props 注释）：端口缺席退化为失败提示，不发请求。
      setScan({ kind: 'failed', code: 'picker-failed', message: '' })
      return
    }
    void browser.list(path, controller.signal).then(
      listing => {
        if (epoch === scanEpochRef.current) setScan({ kind: 'ready', listing })
      },
      (error: unknown) => {
        if (epoch !== scanEpochRef.current || controller.signal.aborted) return
        setScan({ kind: 'failed', code: browseCodeOf(error), message: diagnosticMessageOf(error) })
      },
    )
  }

  /**
   * 关闭：使在途采纳失效、归还 opener 焦点（同步，发生在父组件可能触发的
   * 卸载之前——行为契约 7），再通知父组件。
   */
  const close = (): void => {
    confirmEpochRef.current += 1
    const opener = openerRef.current
    openerRef.current = null
    opener?.focus()
    props.onClose()
  }

  /** 采纳当前层（行为契约 6）。失败句原地显示并恢复按钮；成功即关闭。 */
  const confirm = async (): Promise<void> => {
    if (confirming || scan.kind !== 'ready') return
    const path = scan.listing.path
    setCommitError(undefined)
    setConfirming(true)
    const epoch = confirmEpochRef.current
    try {
      const failure = await props.onConfirm(path)
      if (epoch !== confirmEpochRef.current) return // 采纳期间对话框已被关闭：丢弃续体
      if (failure === undefined) {
        close()
        return
      }
      setCommitError(failure)
      setConfirming(false)
    } catch {
      // 契约承诺失败走返回值（不抛）；走到这里的 reject 是契约外异常，兜成通用
      // 失败句而不是把确认按钮永远悬挂在 confirming 态。原文不进 UI（无码可映射）。
      if (epoch !== confirmEpochRef.current) return
      setCommitError(props.t('error.fallback'))
      setConfirming(false)
    }
  }

  /** 新建对当前层发起（行为契约 5）：成功导航进入创建出的目录，失败原地显示。 */
  const submitCreate = async (): Promise<void> => {
    const browser = browserRef.current
    if (create.busy || scan.kind !== 'ready' || browser === undefined) return
    const name = create.name
    if (name.trim() === '') return
    setCreate({ open: true, name, busy: true, error: undefined })
    try {
      const created = await browser.create(scan.listing.path, name)
      // 成功：收起新建行并导航进入创建出的目录（D-04），让用户直接确认它。
      setCreate(CREATE_CLOSED)
      navigate(created)
    } catch (error: unknown) {
      // 失败：新建行原地保留（名字留着便于修改），显示码对应文案；不导航、不关闭。
      setCreate({ open: true, name, busy: false, error: props.t(browseErrorKey(browseCodeOf(error))) })
    }
  }

  /**
   * `open` 的翻转副作用（TG2 要点 1）：只依赖 `open`，`browser` /
   * `initialListing` 在打开瞬间快照，打开后的属性变化不触发重扫。
   */
  useEffect(() => {
    if (!props.open) return
    browserRef.current = props.browser
    setShowHidden(false)
    setCreate(CREATE_CLOSED)
    setCommitError(undefined)
    setConfirming(false)
    confirmEpochRef.current += 1
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const initial = props.initialListing
    if (initial !== undefined) {
      // 能力探测已取得的 home 层直接复用为首帧，零次 `list` 请求。
      setScan({ kind: 'ready', listing: initial })
    } else {
      navigate(undefined)
    }
    // 焦点移到卡片根（tabIndex=-1），让 Tab 从头部开始环绕（行为契约 1/8）。
    dialogRef.current?.focus()
    // 依赖数组刻意只有 `open`（TG2 要点 1）；navigate 只读写 ref 与 state。
  }, [props.open])

  /** 父组件卸载即 abort 当前扫描（行为契约 9）。 */
  useEffect(() => () => { scanAbortRef.current?.abort() }, [])

  /** Esc 只关本浮层（阻断冒泡，防宿主把同一按键解释成「关闭整页」）；Tab 环绕。 */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const card = dialogRef.current
    if (card === null) return
    const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(element => !element.hasAttribute('disabled') && element.tabIndex >= 0)
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (first === undefined || last === undefined) return
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === card)) {
      event.preventDefault()
      last.focus()
      return
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!props.open) return null
  const listing = scan.kind === 'ready' ? scan.listing : undefined
  const visibleEntries = listing === undefined
    ? []
    : listing.entries.filter(entry => showHidden || !entry.hidden)
  const lastCrumbIndex = listing === undefined ? -1 : listing.crumbs.length - 1
  return createPortal(
    <div className="mrfw-pickerOverlay">
      <div className="mrfw-pickerMask" aria-hidden="true" onClick={close} />
      <div
        ref={dialogRef}
        className="mrfw-pickerCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="mrfw-pickerHeader">
          <h2 id={TITLE_ID} className="mrfw-pickerTitle">{props.t('picker.title')}</h2>
          {/* 自绘关闭钮（D-03）：capsule 家族的 icon 方块；confirming 期间禁用防重复提交。 */}
          <button
            type="button"
            className="mrfw-btn mrfw-iconBtn"
            title={props.t('picker.close')}
            aria-label={props.t('picker.close')}
            disabled={confirming}
            onClick={close}
          >
            <IconClose />
          </button>
        </header>
        {listing === undefined ? null : (
          <nav className="mrfw-pickerCrumbs" aria-label={props.t('picker.crumbs')}>
            <button
              type="button"
              className="mrfw-btn mrfw-btnGhost mrfw-pickerCrumb"
              onClick={() => { navigate(listing.home) }}
            >
              {props.t('picker.home')}
            </button>
            {listing.crumbs.map((crumb, index) => (
              <Fragment key={crumb.path}>
                <span className="mrfw-pickerCrumbSeparator" aria-hidden="true"><IconChevronRight /></span>
                {index === lastCrumbIndex ? (
                  <button
                    type="button"
                    className="mrfw-btn mrfw-btnGhost mrfw-pickerCrumb"
                    aria-current="page"
                    onClick={() => { navigate(crumb.path) }}
                  >
                    {crumb.name}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="mrfw-btn mrfw-btnGhost mrfw-pickerCrumb"
                    onClick={() => { navigate(crumb.path) }}
                  >
                    {crumb.name}
                  </button>
                )}
              </Fragment>
            ))}
            {/* 隐藏项开关（行为契约 3）：aria-pressed 跟随状态，只改渲染、不重扫。 */}
            <button
              type="button"
              className="mrfw-btn mrfw-btnGhost mrfw-pickerCrumb"
              aria-pressed={showHidden}
              onClick={() => { setShowHidden(value => !value) }}
            >
              {props.t('picker.showHidden')}
            </button>
          </nav>
        )}
        <ul className="mrfw-pickerList">
          {scan.kind === 'loading' ? <li className="mrfw-note">{props.t('panel.loading')}</li> : null}
          {scan.kind === 'failed' ? (
            <li role="alert" className="mrfw-alert">{props.t(browseErrorKey(scan.code))}</li>
          ) : null}
          {scan.kind === 'ready' && visibleEntries.length === 0 ? (
            <li className="mrfw-note">{props.t('picker.empty')}</li>
          ) : null}
          {scan.kind === 'ready' ? visibleEntries.map(entry => (
            <li key={entry.path}>
              <button type="button" className="mrfw-pickerRow" onClick={() => { navigate(entry.path) }}>
                <span aria-hidden="true"><IconFolderClose /></span>
                <span>{entry.name}</span>
              </button>
            </li>
          )) : null}
          {scan.kind === 'ready' && listing?.truncated === true ? (
            <li className="mrfw-note">{props.t('picker.truncated')}</li>
          ) : null}
        </ul>
        {scan.kind === 'ready' && create.open ? (
          <div className="mrfw-pickerCreate">
            <input
              autoFocus
              className="mrfw-input mrfw-inputInline"
              value={create.name}
              placeholder={props.t('picker.createName')}
              onChange={event => { setCreate(current => ({ ...current, name: event.target.value })) }}
              onKeyDown={event => { if (event.key === 'Enter') void submitCreate() }}
            />
            <button
              type="button"
              className="mrfw-btn mrfw-btnPrimary"
              disabled={create.busy || create.name.trim() === ''}
              onClick={() => { void submitCreate() }}
            >
              {props.t('picker.createConfirm')}
            </button>
            <button type="button" className="mrfw-btn mrfw-btnGhost" disabled={create.busy} onClick={() => { setCreate(CREATE_CLOSED) }}>
              {props.t('picker.cancel')}
            </button>
          </div>
        ) : null}
        {scan.kind === 'ready' && !create.open ? (
          <div className="mrfw-pickerCreate">
            <button type="button" className="mrfw-btn mrfw-btnGhost" onClick={() => { setCreate({ open: true, name: '', busy: false, error: undefined }) }}>
              {props.t('picker.create')}
            </button>
          </div>
        ) : null}
        {create.error === undefined ? null : <p role="alert" className="mrfw-alert">{create.error}</p>}
        {commitError === undefined ? null : <p role="alert" className="mrfw-alert">{commitError}</p>}
        <footer className="mrfw-pickerFooter">
          <span className="mrfw-pickerPath" aria-label={props.t('picker.current')}>{listing?.path ?? ''}</span>
          <button type="button" className="mrfw-btn mrfw-btnGhost" onClick={close}>
            {props.t('picker.cancel')}
          </button>
          <button
            type="button"
            className="mrfw-btn mrfw-btnPrimary"
            disabled={confirming || scan.kind !== 'ready'}
            onClick={() => { void confirm() }}
          >
            {props.t('picker.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
