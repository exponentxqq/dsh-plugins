/**
 * 会话头部工具区的入口按钮 + 面板容器（设计附录 §3.1 / §3.2，任务 10.4）。
 *
 * 座位是 `conversation.session.header.utilities`（list / scope `session`，无专属 owner props），
 * 由任务 10.5 的 `src/client/index.ts` 以 `order: 20` 软注册；本文件只提供组件与它的注入面。
 *
 * 形态要点：
 *
 * - **入口**：28px 圆形图标按钮（官方同座位三个入口都是纯图标，头部横向空间是稀缺资源），
 *   `aria-label` / `title` / `aria-expanded` / `aria-haspopup="dialog"` 齐备。按钮**恒渲染**，
 *   不因 `connection` 缺席而隐藏：入口是唯一发现面，隐藏比「点开看到不可用」更糟（D13）。
 * - **模态挂在组件内**：`Modal` 是 body portal（primitives 的 `Modal`），所以不需要
 *   `shell.overlay` 座位、也不需要跨 entry 的请求 store（web-ux 需要是因为菜单项会随菜单卸载）。
 * - **唯一状态源**：`useSyncExternalStore(controller.subscribe, controller.getSnapshot)`。控制器
 *   每会话一个（`useMemo` 按 `sessionId` 建），`useEffect` 的清理函数负责 `dispose()` 摘订阅。
 *   注入面可能每次渲染都是新对象（座位重新给 inject face），所以用 ref 骑住，避免控制器重建。
 * - **六段布局**（自上而下）：状态摘要 → 本会话开关（`ToolPanelGroups`）→ 技能
 *   （`SkillPanel`，标题 `section.skills`）→ 工作区默认档（`WorkspaceDefaultsEditor`
 *   `variant='section'`，标题 `workspace.title`）→ 用户级默认档（`DefaultsEditor`，标题
 *   `section.defaults`）→ 关闭集；footer 左「刷新」右「关闭」。
 * - **两个默认档分区默认收起**：它们各自用 `DefaultsSectionFrame` 渲染自己的 `<section>`
 *   （折叠壳，点开才是分组开关清单；收起时标题行仍给「默认关 M · 残留 K」摘要），所以本容器
 *   **不**再为它们包 `<section>`——包了会叠一层壳与间距。两个编辑器共用同一份宇宙：从面板快照
 *   投影得到（`universeOfSnapshot`，D-19 零新增 wire 字段）；快照未到达时的空宇宙见
 *   {@link EMPTY_UNIVERSE}。
 * - **stale-while-revalidate**（§3.6）：`failed` 可与 `snapshot` 并存——有旧快照时渲染旧内容
 *   加一条错误行；只有连旧快照都没有时才走不可用降级，且那时**不渲染任何开关**（spec
 *   「RPC 不可用时的降级表现」）。
 * - **失败文案**（§3.5）：主文案按 `error.<code>` 取键（未知码回退 `error.fallback`），占位符从
 *   `PanelError.details` 取结构化事实；宿主的 `error.message` 只作二级灰字，不参与本地化。
 *
 * @module dsh-plugin-session-tool-toggle/client/ToolPanelAction
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  Button,
  IconRefreshOutlineRegular,
  IconSlidersTwoOutlineRegular,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// 类型专用：本座位（list / session / 无专属 owner props）与 SessionStandardProps（sessionId）
// 的声明方。注册本身由 10.5 完成。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { DefaultsAction, DefaultsUniverse, NoticeView, PanelSnapshot } from '../contract.ts'
import type { PanelClient, PanelError } from './panel-client.ts'
import { PanelController, type CommandExecutedHandler } from './panel-controller.ts'
import { universeOfSnapshot } from './defaults-view.ts'
import { DefaultsEditor, type PanelFailure } from './DefaultsEditor.tsx'
import { SkillPanel } from './SkillPanel.tsx'
import { ToolPanelGroups } from './ToolPanelGroups.tsx'
import { WorkspaceDefaultsEditor } from './WorkspaceDefaultsEditor.tsx'
import { NS, zh, type Key } from './locales.ts'
import css from './panel.module.css'

/** 本组件消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/**
 * 快照未到达时的空宇宙（`layerReady:false`：没有可列、可切的地址）。
 *
 * 两个默认档编辑器只在快照分支里渲染，所以这个值实际不会进到界面——它只解决类型面的事实：
 * `state.snapshot` 是可选的，而 `DefaultsEditor` 的 `universe` 必填非空，`universeOfSnapshot`
 * 又需要一份完整快照。用模块级常量而不是行内字面量：同一快照下 `universe` 的 identity 要稳定，
 * 否则编辑器的三计数 `useMemo` 每次渲染都会重算。
 */
const EMPTY_UNIVERSE: DefaultsUniverse = { layerReady: false, skillsAvailable: false, groups: [] }

/**
 * 本 entry 的注入面。
 *
 * 三个端口都由 10.5 在注册期给：`resolveClient` 必须在**动作发生时**才读 `connection`（它可能
 * 晚于插件 `apply` 就绪，web-ux v1.2.0 的踩坑）；另外两个是可选的刷新触发源（`command/executed`
 * 与 `window` focus），迟到或缺席都不影响面板可用，只是少一个自动重拉的机会。
 */
export interface ToolPanelActionInjected {
  /**
   * 现取面板客户端。
   * @returns 面板客户端；`connection` 未就绪时返回 `undefined`（控制器据此进 `failed('unavailable')`
   *   且不发请求）。
   */
  readonly resolveClient: () => PanelClient | undefined
  /**
   * 订阅本窗口的 `command/executed`（10.5 用 `ctx.on` 实现）。
   * @param handler - 回调（控制器只关心「本会话 + `tools`」）。
   * @returns 退订函数。
   */
  readonly subscribeCommandExecuted?: (handler: CommandExecutedHandler) => () => void
  /**
   * 订阅 `window` 的 `focus`（面板打开时挂一次，关闭即摘）。
   * @param handler - 回调。
   * @returns 摘除函数。
   */
  readonly attachFocusListener?: (handler: () => void) => () => void
}

/** 完整 props：座位运行时份额 + 本命名空间的 `t` + 注入面。 */
export type ToolPanelActionProps = PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & ToolPanelActionInjected

/**
 * 失败码 → 文案键（未知码回退 `error.fallback`）。
 *
 * 与 web-ux 的同名助手同一条规则：**不**在这里把不认识的码改写成 `internal`——保留原始码，
 * 界面按兜底文案渲染，排障时仍能看到宿主真正回了什么。
 * @param code - 稳定失败码（宿主 7 个 + 传输 2 个；未来新增的码也原样进来）。
 * @returns 本命名空间里的文案键。
 */
export function errorKeyOf(code: string): Key {
  const candidate = `error.${code}`
  return (candidate in zh ? candidate : 'error.fallback') as Key
}

/**
 * 从失败细节里取文案占位符的值。
 *
 * 只认 §2.3 表里带占位符的五类细节：`bad-address`（`{address}`）、`protected` / `reserved`
 * （`{names}`）、`defaults-unwritable` / `workspace-unwritable`（`{path}`）、
 * `workspace-unresolved`（`{subject}`）；其余码没有占位符，多传参数不会出现在文案里。
 * @param error - 一次面板调用失败。
 * @returns 插值参数；无结构化细节时是 `undefined`。
 */
export function failureParams(error: PanelError): Record<string, string> | undefined {
  const details = error.details
  if (details === undefined) return undefined
  if ('names' in details) return { names: details.names.join(', ') }
  if ('address' in details) return { address: details.address }
  if ('path' in details) return { path: details.path }
  if ('subject' in details) return { subject: details.subject }
  return undefined
}

/**
 * 把一次失败翻成可渲染的两行文案。
 * @param error - 失败（无错时 `undefined`）。
 * @param t - 翻译函数。
 * @returns 主文案 + 宿主兜底说明；无错时是 `undefined`。
 */
export function failureOf(error: PanelError | undefined, t: Translate): PanelFailure | undefined {
  if (error === undefined) return undefined
  const text = t(errorKeyOf(error.code), failureParams(error))
  return error.message === '' ? { text } : { text, detail: error.message }
}

/**
 * 渲染时间戳（本地时间）。
 * @param at - epoch ms。
 * @returns 本地化的日期时间串。
 */
function formatTime(at: number): string {
  return new Date(at).toLocaleString()
}

/**
 * 提示码 → 文案（`notice.<code>`；五个码是宿主契约里的闭集，穷尽 switch 保证漏一个就是编译错误）。
 * @param code - 提示码。
 * @param t - 翻译函数。
 * @returns 提示文案。
 */
function noticeText(code: NoticeView, t: Translate): string {
  switch (code) {
    case 'persistence-degraded':
      return t('notice.persistence-degraded')
    case 'defaults-corrupt':
      return t('notice.defaults-corrupt')
    case 'session-subagent':
      return t('notice.session-subagent')
    case 'skills-unavailable':
      return t('notice.skills-unavailable')
    case 'skill-shadow-failed':
      return t('notice.skill-shadow-failed')
  }
}

/** 错误行的 props。 */
interface FailureRowProps {
  readonly failure: PanelFailure
  /** 额外的定位 class（不可用降级时用一块独立占位）。 */
  readonly className?: string | undefined
}

/**
 * 一条错误行：主文案（本地化）+ 宿主的兜底说明（灰字，不本地化）。
 * @param props - 已本地化的失败。
 * @returns 错误块。
 */
function FailureRow({ failure, className }: FailureRowProps): ReactNode {
  return (
    <div className={className} role="alert">
      <p className={css.error}>{failure.text}</p>
      {failure.detail !== undefined && <p className={css.detail}>{failure.detail}</p>}
    </div>
  )
}

/** 状态摘要分区的 props。 */
interface StateSectionProps {
  readonly snapshot: PanelSnapshot
  /** 上一次快照以来新增的关闭数（`stats.denied` 的正增量）；无增量时 `undefined`。 */
  readonly kvDelta: number | undefined
  readonly t: Translate
}

/**
 * 第一段：两计数 + 创建时快照/持久化通道 + 变更代价形状 + 提示行（设计 §3.2）。
 * @param props - 快照与增量。
 * @returns 状态摘要分区。
 */
function StateSection({ snapshot, kvDelta, t }: StateSectionProps): ReactNode {
  const { stats, state } = snapshot
  return (
    <section className={css.section}>
      <h3 className={css.sectionTitle}>{t('section.state')}</h3>
      <ul className={css.counters}>
        <li>{t('state.visible', { visible: stats.visible })}</li>
        <li>{t('state.denied', { denied: stats.denied })}</li>
      </ul>
      <p className={css.meta}>
        <span>{t('state.createdAt', { time: formatTime(snapshot.createdAt) })}</span>
        <span>{t('state.snapshot', { count: state.snapshot.length })}</span>
        <span>{state.storeKind === 'record' ? t('state.storeKind.record') : t('state.storeKind.memory')}</span>
      </p>
      {kvDelta !== undefined && <p className={css.notice}>{t('mutation.kv', { hidden: kvDelta })}</p>}
      {snapshot.notices.map((code) => (
        <p
          key={code}
          className={code === 'persistence-degraded' ? css.warning : css.notice}
        >
          {noticeText(code, t)}
        </p>
      ))}
    </section>
  )
}

/** 关闭集分区的 props。 */
interface DisabledSectionProps {
  readonly snapshot: PanelSnapshot
  readonly pending: ReadonlySet<string>
  readonly resetting: boolean
  /** 已二次确认的「恢复创建时快照」。 */
  readonly armed: boolean
  readonly onArm: () => void
  readonly onReset: () => void
  readonly onEnable: (address: string) => void
  readonly t: Translate
}

/**
 * 第四段：关闭集 chip 列表（关闭集状态展示的唯一集中落点，设计 §3.2）。
 *
 * 每枚 chip：地址（等宽）+ `intent` 徽标（`intentOnly` 的地址）+ 「开启」按钮。区尾给「恢复
 * 创建时快照」——它打的是 `reset` 端点（会话级），与默认档的「清空默认档」是两件事。
 * @param props - 快照与四个动作。
 * @returns 关闭集分区。
 */
function DisabledSection({
  snapshot,
  pending,
  resetting,
  armed,
  onArm,
  onReset,
  onEnable,
  t,
}: DisabledSectionProps): ReactNode {
  const intentOnly = useMemo(() => new Set(snapshot.intentOnly), [snapshot.intentOnly])
  const addresses = snapshot.state.disabled
  return (
    <section className={css.section}>
      <h3 className={css.sectionTitle}>{t('section.disabled')}</h3>
      {addresses.length === 0
        ? <p className={css.muted}>{t('disabled.empty')}</p>
        : (
          <ul className={css.chips} aria-label={t('disabled.listTitle')}>
            {addresses.map((address) => {
              const pendingRow = pending.has(address)
              return (
                <li key={address} className={css.chip}>
                  <code className={css.address} title={address}>{address}</code>
                  {intentOnly.has(address) && (
                    <span className={css.badge} title={t('entry.intentOnly')}>{t('badge.intent')}</span>
                  )}
                  {pendingRow && <span className={css.pending}>{t('toggle.pending')}</span>}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('disabled.enableAria', { address })}
                    disabled={resetting || pendingRow}
                    onClick={() => {
                      onEnable(address)
                    }}
                  >
                    {t('disabled.enable')}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      {snapshot.intentOnly.length > 0 && <p className={css.muted}>{t('disabled.intentOnly')}</p>}
      <div className={css.actions}>
        <Button
          variant="outline"
          size="sm"
          disabled={resetting || addresses.length === 0}
          onClick={() => {
            if (armed) onReset()
            else onArm()
          }}
        >
          {armed ? t('disabled.resetConfirm') : t('disabled.reset')}
        </Button>
      </div>
    </section>
  )
}

/**
 * 入口按钮 + 面板容器。
 * @param props - 座位运行时份额、注入面与 `t`。
 * @returns 图标按钮与（打开时的）模态面板。
 */
export function ToolPanelAction({
  sessionId,
  resolveClient,
  subscribeCommandExecuted,
  attachFocusListener,
  t,
}: ToolPanelActionProps): ReactNode {
  // 注入面可能每次渲染都是新对象：骑 ref，控制器只按 sessionId 建一次（重建会丢掉在途请求
  // 与展开态之外的一切，也会重新订阅命令事件）。
  const resolve = useRef(resolveClient)
  resolve.current = resolveClient
  const subscribeCommands = useRef(subscribeCommandExecuted)
  subscribeCommands.current = subscribeCommandExecuted
  const attachFocus = useRef(attachFocusListener)
  attachFocus.current = attachFocusListener

  const controller = useMemo(
    () => new PanelController({
      sessionId,
      resolveClient: () => resolve.current(),
      subscribeCommandExecuted: (handler) => subscribeCommands.current?.(handler) ?? (() => {}),
      attachFocusListener: (handler) => attachFocus.current?.(handler) ?? (() => {}),
    }),
    [sessionId],
  )

  // 卸载时摘掉命令/focus 订阅；不做「卸载时关面板」——Modal 随组件树一起消失即可。
  useEffect(() => () => controller.dispose(), [controller])

  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const opened = state.phase !== 'idle'
  const snapshot = state.snapshot
  // D-19：两个默认档编辑器的宇宙从**同一份**面板快照投影（`groups` → 组/行开关、`skills` →
  // 技能行），wire 形状零新增。快照还没到时给空宇宙（编辑器此时不渲染），保证 identity 稳定。
  const universe = useMemo(
    () => (snapshot === undefined ? EMPTY_UNIVERSE : universeOfSnapshot(snapshot)),
    [snapshot],
  )
  // 三份失败展示各自 memo：`failureOf` 每次调用都造新对象，稳定住 identity 才不让子组件无谓重渲染。
  const failure = useMemo(() => failureOf(state.error, t), [state.error, t])
  const defaultsFailure = useMemo(() => failureOf(state.defaultsError, t), [state.defaultsError, t])
  const workspaceFailure = useMemo(() => failureOf(state.workspaceError, t), [state.workspaceError, t])

  // 「本次关闭 N 个工具」= 相邻两份快照的 `stats.denied` 正增量。控制器不存回执（D17：面板
  // 不自建状态），这条提示只是把两次读数相比的可观测副产物；开工具（负增量）不提示 KV 重建。
  const [kvDelta, setKvDelta] = useState<number | undefined>(undefined)
  const previous = useRef<PanelSnapshot | undefined>(undefined)
  useEffect(() => {
    if (snapshot === undefined) return
    const before = previous.current
    previous.current = snapshot
    if (before === undefined || before === snapshot) return
    const hidden = snapshot.stats.denied - before.stats.denied
    setKvDelta(hidden > 0 ? hidden : undefined)
  }, [snapshot])

  const [resetArmed, setResetArmed] = useState(false)
  // 「已保存（本会话不变）」只能由**写入的落定**决定，不能靠观察 `savingDefaults` 的翻转：
  // React 18 的自动批处理会把「在途 → 落定」两次 patch 合成一次渲染，中间态根本不可见。
  // 控制器在 promise 落定时已把结果写进状态，所以这里等 promise 再读一次快照即可。
  const [defaultsSaved, setDefaultsSaved] = useState(false)
  const writeDefaults = (action: DefaultsAction, addresses?: readonly string[]): void => {
    setDefaultsSaved(false)
    void controller.updateDefaults(action, addresses).then(() => {
      const next = controller.getSnapshot()
      setDefaultsSaved(!next.savingDefaults && next.defaultsError === undefined)
    })
  }

  const footer = (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<IconRefreshOutlineRegular />}
        aria-label={t('panel.refresh')}
        disabled={state.phase === 'loading'}
        onClick={() => {
          void controller.refresh()
        }}
      >
        {t('panel.refresh')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          controller.close()
        }}
      >
        {t('panel.close')}
      </Button>
    </>
  )

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={css.trigger}
        icon={<IconSlidersTwoOutlineRegular />}
        aria-label={t('action.label')}
        aria-description={t('action.aria')}
        aria-haspopup="dialog"
        aria-expanded={opened}
        title={t('action.tooltip')}
        onClick={() => {
          if (opened) controller.close()
          else void controller.open()
        }}
      />
      <Modal
        open={opened}
        onClose={() => {
          controller.close()
        }}
        title={t('panel.title')}
        closeLabel={t('panel.close')}
        description={t('panel.description')}
        className={css.dialog}
        contentClassName={css.content}
        footer={footer}
      >
        {snapshot === undefined
          ? (failure === undefined
            ? <p className={css.loading}>{t('panel.loading')}</p>
            : <FailureRow failure={failure} className={css.failureBlock} />)
          : (
            <>
              {failure !== undefined && <FailureRow failure={failure} />}
              <StateSection snapshot={snapshot} kvDelta={kvDelta} t={t} />
              <section className={css.section}>
                <h3 className={css.sectionTitle}>{t('section.groups')}</h3>
                <ToolPanelGroups
                  groups={snapshot.groups}
                  pending={state.pending}
                  busy={state.resetting}
                  onToggle={(address, on) => {
                    void controller.toggle(address, on)
                  }}
                  t={t}
                />
              </section>
              <section className={css.section} aria-label={t('section.skills')}>
                <h3 className={css.sectionTitle}>{t('section.skills')}</h3>
                <SkillPanel
                  skills={snapshot.skills}
                  // 宿主没有 `skills` 服务时快照里必带这条提示码（rpc 的 `snapshotOf` 组装），
                  // 面板据此整块降级——技能地址此时只记意图，开关点不出真实效果。
                  unavailable={snapshot.notices.includes('skills-unavailable')}
                  // 整档 `tool:skill` 关闭 = 影子 stub 不再注册：逐技能开关保留意图、暂不生效
                  // （DQ3=A）。关闭集是全地址归一的，整组地址 `tool:skill` 也在其中。
                  blocked={snapshot.state.disabled.includes('tool:skill')}
                  pending={state.pending}
                  busy={state.resetting}
                  onToggle={(address, on) => {
                    void controller.toggle(address, on)
                  }}
                  t={t}
                />
              </section>
              <WorkspaceDefaultsEditor
                workspace={state.workspace ?? null}
                universe={universe}
                choices={state.workspaceChoices}
                variant="section"
                saving={state.savingWorkspace}
                saved={state.workspaceSaved}
                failure={workspaceFailure}
                // 分区形态不渲染下拉（作用域恒为本会话的工作区）；接上控制器让未来复用
                // dialog 形态时不必改这一处。
                onSelect={(key) => {
                  void controller.updateWorkspace('read', undefined, key)
                }}
                onUpdate={(action, addresses) => {
                  void controller.updateWorkspace(action, addresses)
                }}
                onRefresh={() => {
                  void controller.refreshWorkspace()
                }}
                t={t}
              />
              <DefaultsEditor
                defaults={state.defaults ?? snapshot.defaults}
                universe={universe}
                createdAt={snapshot.createdAt}
                snapshotCount={snapshot.state.snapshot.length}
                saving={state.savingDefaults}
                saved={defaultsSaved}
                failure={defaultsFailure}
                onUpdate={writeDefaults}
                t={t}
              />
              <DisabledSection
                snapshot={snapshot}
                pending={state.pending}
                resetting={state.resetting}
                armed={resetArmed}
                onArm={() => {
                  setResetArmed(true)
                }}
                onReset={() => {
                  setResetArmed(false)
                  void controller.reset()
                }}
                onEnable={(address) => {
                  void controller.toggle(address, true)
                }}
                t={t}
              />
            </>
          )}
      </Modal>
    </>
  )
}
