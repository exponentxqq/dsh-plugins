/**
 * 会话头部工具区的入口按钮 + 面板容器（本变更 `code-design.md` ③3.6 三卡形状；D-01/D-06/D-07）。
 *
 * 座位是 `conversation.session.header.utilities`（list / scope `session`，无专属 owner props），
 * 由 `src/client/index.ts` 以 `order: 20` 软注册；本文件只提供组件与它的注入面。
 *
 * 形态要点：
 *
 * - **入口**：28px 圆形图标按钮（头部横向空间是稀缺资源，与官方同座位入口同形），
 *   `aria-label` / `title` / `aria-expanded` / `aria-haspopup="dialog"` 齐备。按钮**恒渲染**，
 *   不因 `connection` 缺席而隐藏：入口是唯一发现面，隐藏比「点开看到不可用」更糟（D13）。
 * - **模态挂在组件内**：`Modal` 是 body portal（primitives 的 `Modal`），所以不需要
 *   `shell.overlay` 座位、也不需要跨 entry 的请求 store。
 * - **唯一状态源**：`useSyncExternalStore(controller.subscribe, controller.getSnapshot)`。控制器
 *   每会话一个（`useMemo` 按 `sessionId` 建），`useEffect` 的清理函数负责 `dispose()` 摘订阅。
 *   注入面可能每次渲染都是新对象（座位重新给 inject face），所以用 ref 骑住，避免控制器重建。
 * - **三卡 + 页脚动作区**（③3.6，D-01）：cardStack 自上而下是「错误行（可选）→ 概要卡 →
 *   清单卡 → 命令卡」。概要卡把旧状态段收进卡内联（facts 四行 + 三计数 + 提示行，D-06：
 *   无徽章、无独立脚注块，`panel.description` 兼任脚注）；清单卡是共用
 *   {@link DefaultsGroupList} 的**会话形态**（语义槽 + 全局过滤 + 行详情，关闭集段与技能段
 *   并入清单，`shadowed`/`blocked`/`intentOnly` 三语义由槽承接）；命令卡共用
 *   {@link CommandCard}（跨清单地址与用户级默认档的命令面）。「恢复创建时快照」两段式确认
 *   与「关闭」都在 Modal 的 footer 槽（D-07）；刷新按钮移到概要卡头。
 * - **派生全在容器内**（D-19 零新增 wire 字段，无 controller 扩展）：`universeOfSnapshot`
 *   从面板快照投影清单宇宙（与统一弹窗同构）；`defaultsCountsOf` 算三计数（过滤框显隐与
 *   空态判定）；`effectiveClosedOf` / `shadowedSkillAddressesOf` 与 `pending`/`intentOnly`
 *   合成会话清单的四个语义槽。
 * - **stale-while-revalidate**：`failed` 可与 `snapshot` 并存——有旧快照时渲染旧内容加一条
 *   错误行；只有连旧快照都没有时才走不可用降级，且那时**不渲染任何开关**（spec
 *   「RPC 不可用时的降级表现」）。
 * - **失败文案**（§3.5）：五件已迁 `panel-failure.tsx`，本文件只 import 使用。工作区默认档 /
 *   用户级默认档两个分区连同 `DefaultsEditor` / `WorkspaceDefaultsEditor` 的挂载一并退出
 *   面板（工作区档改走统一弹窗，用户级默认档只剩命令面）。
 *
 * @module dsh-plugin-session-tool-toggle/client/ToolPanelAction
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  Button,
  IconRefreshOutlineRegular,
  IconSlidersTwoOutlineRegular,
  Input,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// 类型专用：本座位（list / session / 无专属 owner props）与 SessionStandardProps（sessionId）
// 的声明方。注册本身由 10.5 完成。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { DefaultsUniverse, NoticeView, PanelSnapshot } from '../contract.ts'
import type { PanelClient } from './panel-client.ts'
import { PanelController, type CommandExecutedHandler } from './panel-controller.ts'
import {
  defaultsCountsOf,
  effectiveClosedOf,
  shadowedSkillAddressesOf,
  universeOfSnapshot,
} from './defaults-view.ts'
import { COMMAND_PLACEHOLDER, CommandCard } from './CommandCard.tsx'
import { DefaultsGroupList, type SessionListState } from './DefaultsGroupList.tsx'
import { FailureRow, failureOf } from './panel-failure.tsx'
import { NS } from './locales.ts'
import css from './panel.module.css'

/** 本组件消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/**
 * 快照未到达时的空宇宙（`layerReady:false`：没有可列、可切的地址）。
 *
 * 清单卡只在快照分支里渲染，所以这个值实际不会进到界面——它只解决类型面的事实：
 * `state.snapshot` 是可选的，而 `universeOfSnapshot` 需要一份完整快照。用模块级常量而不是
 * 行内字面量：同一快照下 `universe` 的 identity 要稳定，否则两个派生 `useMemo` 每次渲染
 * 都会重算。
 */
const EMPTY_UNIVERSE: DefaultsUniverse = { layerReady: false, skillsAvailable: false, groups: [] }

/**
 * 快照未到达时的空关闭集。
 *
 * 与 {@link EMPTY_UNIVERSE} 同一动机：`counts` / `session` 两个 `useMemo` 都拿 `disabled`
 * 当依赖，行内字面量会在无快照期间每次渲染都换新引用、让 memo 反复重算。
 */
const EMPTY_DISABLED: readonly string[] = []

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

  // D-19：清单宇宙从**同一份**面板快照投影（`groups` → 组/行开关、`skills` → 技能行），
  // wire 形状零新增。快照还没到时给空宇宙（清单卡走空态块），保证 identity 稳定。
  const universe = useMemo(
    () => (snapshot === undefined ? EMPTY_UNIVERSE : universeOfSnapshot(snapshot)),
    [snapshot],
  )
  // 关闭集是快照内的数组引用，随快照换新即可；无快照时给模块级空集。
  const disabled = snapshot?.state.disabled ?? EMPTY_DISABLED
  // 三计数（③3.4）：`listed` 决定过滤框显隐，`listed === 0 ∧ residual === 0` 是清单卡空态。
  const counts = useMemo(() => defaultsCountsOf(universe, disabled), [universe, disabled])
  // 会话清单的四个语义槽（③3.3）：`pending` 是控制器的在途集；有效关闭集做整组传导；
  // 影子已生效集区分「模型不可见」与「已记录未生效」；`intentOnly` 按快照原样进 Set。
  const session = useMemo<SessionListState | undefined>(() => snapshot === undefined ? undefined : ({
    pending: state.pending,
    effectiveDisabled: effectiveClosedOf(universe, disabled),
    shadowedSkills: shadowedSkillAddressesOf(snapshot.skills),
    intentOnly: new Set(snapshot.intentOnly),
  }), [snapshot, universe, disabled, state.pending])
  // 面板失败只此一处（stale-while-revalidate 的错误行）；`failureOf` 每次调用都造新对象，
  // memo 稳住 identity 才不让子组件无谓重渲染。
  const panelFailure = useMemo(() => failureOf(state.error, t), [state.error, t])
  // 命令卡的代码块文本（③3.6）：首行注释交代生效面，命令模板留 `<address>` 占位（CommandCard
  // 内复制的就是这段文本）。
  const commandText = `# ${t('session.commandComment')}\n/tools off ${COMMAND_PLACEHOLDER}`

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

  // 清单卡的全局过滤词（③3.4 页面能力）：`''` 也算启用——内置组的本地过滤框让位给全局过滤。
  const [query, setQuery] = useState('')

  // 「恢复创建时快照」的两段式确认（D-07：动作区在 footer，不再占清单内动作区）。
  const [resetArmed, setResetArmed] = useState(false)

  const footer = (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={state.resetting || disabled.length === 0}
        onClick={() => {
          if (resetArmed) {
            setResetArmed(false)
            void controller.reset()
          } else {
            setResetArmed(true)
          }
        }}
      >
        {resetArmed ? t('disabled.resetConfirm') : t('disabled.reset')}
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
          ? (panelFailure === undefined
            ? <p className={css.loading}>{t('panel.loading')}</p>
            : <FailureRow failure={panelFailure} className={css.failureBlock} />)
          : (
            <div className={css.cardStack}>
              {/* stale-while-revalidate：旧快照可用但最近一次操作失败 → 旧内容之上加错误行。 */}
              {panelFailure !== undefined && <FailureRow failure={panelFailure} />}

              {/* 卡 1 概要：facts 四行 + 三计数 + kv 增量提示 + 降级/子代理提示行（D-06）。 */}
              <div className={css.card}>
                <div className={css.cardHeader}>
                  <p className={css.cardTitle}>{t('session.title')}</p>
                  <span className={css.push} />
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
                </div>
                <dl className={css.facts}>
                  <div className={css.fact}>
                    <dt className={css.factTerm}>{t('session.id')}</dt>
                    <dd className={css.factValue}>{snapshot.sessionId}</dd>
                  </div>
                  <div className={css.fact}>
                    <dt className={css.factTerm}>{t('session.createdAt')}</dt>
                    <dd className={css.factValue}>{formatTime(snapshot.createdAt)}</dd>
                  </div>
                  <div className={css.fact}>
                    <dt className={css.factTerm}>{t('session.snapshotCount')}</dt>
                    <dd className={css.factValue}>{t('session.count', { count: snapshot.state.snapshot.length })}</dd>
                  </div>
                  <div className={css.fact}>
                    <dt className={css.factTerm}>{t('session.store')}</dt>
                    <dd className={css.factValue}>
                      {snapshot.state.storeKind === 'record'
                        ? t('session.store.record')
                        : t('session.store.memory')}
                    </dd>
                  </div>
                </dl>
                <ul className={css.counters}>
                  <li>{t('state.visible', { visible: snapshot.stats.visible })}</li>
                  <li>{t('state.denied', { denied: snapshot.stats.denied })}</li>
                  <li>{t('state.closedCount', { count: disabled.length })}</li>
                </ul>
                {kvDelta !== undefined && <p className={css.notice}>{t('mutation.kv', { hidden: kvDelta })}</p>}
                {snapshot.notices.map((code) => (
                  <p
                    key={code}
                    className={code === 'persistence-degraded' ? css.warning : css.notice}
                  >
                    {noticeText(code, t)}
                  </p>
                ))}
              </div>

              {/* 卡 2 清单：共用清单的会话形态（语义槽 + 全局过滤 + 行详情）+ 空态块。 */}
              <div className={css.card}>
                <div className={css.cardHeader}>
                  <p className={css.cardTitle}>{t('section.groups')}</p>
                  {/* 过滤框只在有候选时渲染：清单与残留都空时过滤无处下手。 */}
                  {counts.listed > 0 && (
                    <Input
                      className={css.pageFilter}
                      value={query}
                      placeholder={t('session.filter')}
                      aria-label={t('session.filter')}
                      onChange={(event) => {
                        setQuery(event.target.value)
                      }}
                    />
                  )}
                </div>
                <p className={css.note}>{t('session.listHint')}</p>
                <DefaultsGroupList
                  universe={universe}
                  disabled={disabled}
                  busy={state.resetting}
                  session={session}
                  t={t}
                  query={query}
                  showDetails
                  onToggle={(address, on) => {
                    void controller.toggle(address, on)
                  }}
                />
                {/* 空态块：清单与残留都空时接管空态（宇宙本来就没有条目的面板空态）。 */}
                {counts.listed === 0 && counts.residual === 0 && (
                  <div className={css.emptyBlock}>
                    <p className={css.emptyTitle}>{t('panel.empty')}</p>
                  </div>
                )}
              </div>

              {/* 卡 3 命令：跨清单地址与用户级默认档只剩命令面（CommandCard 共用复制状态机）。 */}
              <CommandCard
                title={t('session.commandTitle')}
                note={t('session.commandNote')}
                commandText={commandText}
                copyLabel={t('command.copy')}
                copiedLabel={t('command.copied')}
                copyFailedLabel={t('command.copyFailed')}
              />
            </div>
          )}
      </Modal>
    </>
  )
}
