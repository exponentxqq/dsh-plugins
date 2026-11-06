/**
 * 工作区默认档编辑器（`code-design.md` ③ 3.19 / W8；D10 / D11 / D13 / D-20）。
 *
 * 字段面与用户级 `DefaultsEditor` 同构（同一个 `DefaultsGroupList`、同一套三计数口径），但有三处
 * 差异，全部来自「目标是一份工作区档」这个事实：
 *
 * 1. **两形态**：
 *    - `variant='dialog'` 是统一「工作区配置」弹窗的分节正文（`workspace-config.section` 座位）：
 *      组件自己渲染 `<h3>` 标题 + 工作区下拉（`workspace.select`）+ 该行的刷新——holder 的
 *      `Modal` 提供 `role="dialog"` 根，本组件只交付正文壳（再包一层会成嵌套 dialog）；
 *    - `variant='section'` 是会话工具面板里的一个分区：外壳交给 `DefaultsSectionFrame`（D13，
 *      **默认收起**、标题行带计数摘要），**没有下拉**——分区的作用域恒为「本会话所属工作区」，
 *      在分区里换工作区会与「面板只改本会话工作区」的预期冲突（unify 裁定）。
 *    `section` 形态**不再**自己包 `<section>`：折叠壳自带壳与间距。
 * 2. **并集一句说明**（DQ2=A，沿用）：界面**不**标注每一项来自用户档还是工作区档，只给一句
 *    「新会话初始关闭 = 用户级默认档 ∪ 本工作区默认档」（`workspace.union`），把合并语义先说清、
 *    再让用户看到本工作区的增量。
 * 3. **工作区无法归属**（`workspace === null`）：只读降级——显示 `workspace.unresolved`，不渲染
 *    分组清单与三计数（没有目标档就没有可数的关闭集），清空按钮禁用；`dialog` 形态仍可下拉
 *    切换到已登记工作区（写入目标随之改变）。
 *
 * 与用户级编辑器的同一条纪律：**没有自由文本添加**（D8）。开关打的是宿主给的规范形地址
 * （`group.address` / `entry.address`），文法、保护名单与上限的唯一权威在宿主；跨清单的新关
 * 一律走命令（`/tools workspace off <地址>`，命令兜底说明由清单组件渲染）。
 *
 * 失败文案的唯一形状是 {@link PanelFailure}（从 `DefaultsEditor.tsx` 导入，重写不改归属）：宿主回
 * 稳定码（`workspace-unresolved` / `workspace-unwritable` / …），主文案按 `error.<code>` 由持有
 * 控制器的容器插值后传进来，本组件只渲染字符串。
 *
 * 每个动作都是一次**立即写入**（宿主 `workspaces.json`），没有独立的「保存」按钮：
 * `off` = 加入本工作区档、`on` = 移出、`reset` = 清空本工作区条目。写入成功的确认走 `saved`
 * （「已保存（本会话不变）」）——工作区档与默认档一样不追溯（D18）。
 *
 * 渲染归属（G8 handoff）：残留区与命令兜底说明都在 `DefaultsGroupList` 内部渲染，本组件
 * **不**再单独渲染，否则同一句会出现两次。
 *
 * @module dsh-plugin-session-tool-toggle/client/WorkspaceDefaultsEditor
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  DefaultsUniverse,
  WorkspaceAction,
  WorkspaceChoice,
  WorkspaceView,
} from '../contract.ts'
import type { PanelFailure } from './DefaultsEditor.tsx'
import { defaultsCountsOf } from './defaults-view.ts'
import { DefaultsGroupList } from './DefaultsGroupList.tsx'
import { DefaultsSectionFrame } from './DefaultsSectionFrame.tsx'
import { NS } from './locales.ts'
import css from './panel.module.css'

/** 本组件消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/** 渲染形态：面板分区，或统一工作区配置弹窗的分节正文。 */
export type WorkspaceDefaultsVariant = 'section' | 'dialog'

/**
 * 目标档缺席（`workspace === null`）时的空关闭集。
 *
 * 用模块级常量而不是行内 `?? []`：行内字面量每次渲染都是新数组，会让 `useMemo` 的依赖恒变
 * （三计数本来很便宜，但「同一份读数」的语义比省这点计算重要）。
 */
const EMPTY_DISABLED: readonly string[] = []

/** 工作区默认档编辑器的 props（code-design ③ 3.19 冻结形状）。 */
export interface WorkspaceDefaultsEditorProps {
  /**
   * 当前编辑目标的工作区视图（宿主返回的活视图）。
   *
   * `null` = 当前会话 cwd 无法归属 / 目标未登记：界面按只读降级，不渲染分组清单与写入入口。
   */
  readonly workspace: WorkspaceView | null
  /**
   * 目标无关的工具宇宙。
   *
   * `dialog` 形态来自 `WorkspaceValue.universe`（容器负责跨目标缓存，切到 `{workspacePath}`
   * 寻址后响应里的 `universe` 为 `null`），`section` 形态来自面板快照的投影
   * （`universeOfSnapshot`）。`null` / `layerReady:false` 时清单组件只留残留区。
   */
  readonly universe: DefaultsUniverse | null
  /** 下拉可选项（`WorkspaceValue.choices`，已登记工作区，按标题+路径排序）。 */
  readonly choices: readonly WorkspaceChoice[]
  /** 渲染形态（见文件头注释）。 */
  readonly variant: WorkspaceDefaultsVariant
  /** 写在途（父级 hook 的 `saving`）：整区禁用。 */
  readonly saving: boolean
  /** 上一次写入已被宿主确认（「已保存（本会话不变）」）。 */
  readonly saved: boolean
  /** 上一次写入的失败（已本地化，由父级按 `error.<code>` 映射）；无错时为 `undefined`。 */
  readonly failure?: PanelFailure
  /**
   * 切换目标工作区（只有 `dialog` 形态渲染下拉）。
   * @param key - 工作区规范路径（`WorkspaceChoice.key`）。
   */
  readonly onSelect: (key: string) => void
  /**
   * 提交一次工作区档写入。
   *
   * 语义与 `workspace` 端点一致：`off` = 加入本工作区档、`on` = 移出、`reset` = 清空本工作区
   * 条目（不带地址）。每个动作都是一次立即写入，没有「暂存后统一保存」的中间态。
   * @param action - 动作。
   * @param addresses - 目标地址（`reset` 时缺省）。
   */
  readonly onUpdate: (action: WorkspaceAction, addresses?: readonly string[]) => void
  /** 重新读取当前目标工作区（父级 hook 的 `read`）。 */
  readonly onRefresh: () => void
  /** 本插件命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 工作区默认档编辑器。
 * @param props - 见 {@link WorkspaceDefaultsEditorProps}。
 * @returns 面板分区（折叠壳）或弹窗分节正文。
 */
export function WorkspaceDefaultsEditor({
  workspace,
  universe,
  choices,
  variant,
  saving,
  saved,
  failure,
  onSelect,
  onUpdate,
  onRefresh,
  t,
}: WorkspaceDefaultsEditorProps): ReactNode {
  /** 清空按钮的两段式确认（不可逆性低，用文案变化代替 `RiskConfirmation`）。 */
  const [armed, setArmed] = useState(false)

  const dialog = variant === 'dialog'
  /** 写入目标存在才允许写（`null` = 工作区无法归属 / 未登记）。 */
  const writable = workspace !== null
  const disabled = workspace?.disabled ?? EMPTY_DISABLED
  const selectable = workspace?.key ?? ''

  // 三计数与清单共用同一份 (universe, disabled) 读数：摘要 / 计数行 / 清单不会各算一套。
  // 目标档缺席时按空档求值（listed 仍取宇宙、inDefaults 与 residual 都是 0）：标题行的摘要
  // 需要一个字符串，折叠态也要能看出「没有默认关的东西」。
  const counts = useMemo(() => defaultsCountsOf(universe, disabled), [universe, disabled])

  // 当前工作区可能不在 choices 里（未登记工作区 / 列表过期）：补一项，避免 select 显示空白。
  const missingChoice =
    workspace !== null && !choices.some((choice) => choice.key === workspace.key)
  const options: readonly WorkspaceChoice[] = missingChoice
    ? [...choices, { key: workspace.key, title: workspace.title ?? workspace.key }]
    : choices

  /** 清空本工作区条目：第一次点击只改文案，第二次才真的发请求。 */
  const clear = (): void => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    onUpdate('reset')
  }

  const body = (
    <>
      {workspace === null
        ? <p className={css.muted}>{t('workspace.unresolved')}</p>
        : (
          <>
            <p className={css.meta}>
              <span>{t('workspace.key')}</span>
              <code className={css.path}>{workspace.key}</code>
              <span>{workspace.registered ? t('workspace.registered') : t('workspace.unregistered')}</span>
            </p>

            <p className={css.meta}>
              <span>{t('workspace.path')}</span>
              <code className={css.path}>{workspace.path}</code>
            </p>

            {workspace.corrupt && <p className={css.warning}>{t('workspace.corrupt')}</p>}

            {/* 三计数是「这份工作区档」的读数：目标档缺席时不渲染（见文件头的降级口径）。 */}
            <p className={css.meta}>
              {t('defaults.counts', {
                listed: counts.listed,
                inDefaults: counts.inDefaults,
                residual: counts.residual,
              })}
            </p>

            {/* 分组清单 + 残留区 + 命令兜底说明都由清单组件渲染（G8 handoff）。 */}
            <DefaultsGroupList
              universe={universe}
              disabled={workspace.disabled}
              busy={saving}
              onToggle={(address, on) => {
                // 任何一次开关都撤掉「清空」的待确认态：它描述的上一次意图已经过期。
                setArmed(false)
                onUpdate(on ? 'on' : 'off', [address])
              }}
              copy={{
                residualTitle: t('defaults.residualTitle'),
                removeLabel: t('workspace.remove'),
                removeAria: (a) => t('workspace.removeAria', { address: a }),
                cliHint: t('workspace.cliHint'),
              }}
              t={t}
            />
          </>
        )}

      <p className={css.muted}>{t('workspace.scope')}</p>
      <p className={css.muted}>{t('workspace.union')}</p>

      <div className={css.actions}>
        {!dialog && (
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              onRefresh()
            }}
          >
            {t('workspace.refresh')}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={!writable || saving || disabled.length === 0}
          onClick={clear}
        >
          {armed ? t('workspace.clearConfirm') : t('workspace.clear')}
        </Button>
        {saved && <span className={css.saved}>{t('workspace.saved')}</span>}
      </div>

      {failure !== undefined && (
        <div role="alert">
          <p className={css.error}>{failure.text}</p>
          {failure.detail !== undefined && <p className={css.detail}>{failure.detail}</p>}
        </div>
      )}
    </>
  )

  // 分节正文形态只交付正文壳：`role="dialog"` 由 holder（`dsh-plugin-workspace-config`）的
  // 统一弹窗壳 `Modal` 提供，本组件再带一层会构成嵌套 dialog（A11y 双根）。
  // 正文壳**不**复用 `.dialog`（760px 卡片宽度）：右栏内容列的宽度由 holder 约束，
  // 嵌套固定宽度会溢出，宽度约束归持有 `Modal` 的 holder。
  return dialog
    ? (
      <div className={css.workspaceBody}>
        <h3 className={css.sectionTitle}>{t('workspace.title')}</h3>

        <div className={css.addRow}>
          <span className={css.meta}>{t('workspace.select')}</span>
          <select
            className={css.select}
            value={selectable}
            aria-label={t('workspace.select')}
            disabled={saving}
            onChange={(event) => {
              onSelect(event.target.value)
            }}
          >
            {selectable === '' && (
              <option value="" disabled>
                {t('workspace.select')}
              </option>
            )}
            {options.map((choice) => (
              <option key={choice.key} value={choice.key}>{choice.title}</option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              onRefresh()
            }}
          >
            {t('workspace.refresh')}
          </Button>
        </div>

        {body}
      </div>
    )
    // 分区形态：折叠壳（标题 + 计数摘要 + `aria-expanded`）自带 `<section>` 与间距，
    // 这里**不**再包一层——否则网格/外边距会叠两次（G8 handoff）。
    : (
      <DefaultsSectionFrame
        title={t('workspace.title')}
        summary={t('defaults.summary', { inDefaults: counts.inDefaults, residual: counts.residual })}
      >
        {body}
      </DefaultsSectionFrame>
    )
}
