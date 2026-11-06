/**
 * 面板第三段：用户级默认档编辑区（`code-design.md` ③ 3.19 / W7；D10 / D11 / D13）。
 *
 * 默认档是**用户级**状态（`$DSH_HOME/session-tool-toggle/defaults.json`），只作为新会话创建
 * 时快照的来源：本区保存成功后**不**重拉会话快照、也**不**提供「应用到本会话」——D18 的
 * 「不追溯」在界面上就是这两句事实文案（`defaults.scope` / `defaults.snapshot`）。
 *
 * 形状（D10 的分组开关界面，自上而下）：
 *
 * - 外壳是 `DefaultsSectionFrame`（D13）：**默认收起**，标题行带计数摘要（`defaults.summary`）；
 *   展开后才是路径行 / 损坏告警 / 三计数行 / 分组清单 / 两句不追溯 / 清空与失败行；
 * - 清单是 `DefaultsGroupList`（与工作区级编辑器共用的唯一实现）：**没有自由文本添加**——
 *   新关只来自清单里的开关，跨清单的地址走命令（命令提示文案由清单组件自己渲染）；
 *   残留地址区同样在清单组件内，只能移除；
 * - 三计数（{@link defaultsCountsOf}，D11）与清单读的是同一份 `defaults.disabled`，口径一致；
 *   宇宙（`universe`）由容器从面板快照投影（`universeOfSnapshot`，D-19 零新增 wire 字段）。
 *
 * 三条刻意不做的事（沿重写前的裁定）：
 *
 * 1. **不在客户端校验文法**：开关打的是宿主给的规范形地址（`DefaultsGroupList` 里的
 *    `group.address` / `entry.address`），文法与保护名单的唯一权威在宿主 `address.ts`；
 *    失败由宿主回稳定码（`bad-address` / `defaults-unwritable` …），主文案按 `error.<code>`
 *    渲染、`error.message` 只作二级灰字。失败文案的键映射由容器（`ToolPanelAction`）负责，
 *    本组件只渲染字符串。
 * 2. **不做乐观更新**：清单读 `defaults.disabled`（宿主返回的活视图），保存期间整区禁用
 *    （`saving` → `DefaultsGroupList` 的 `busy`）。
 * 3. **不上 `RiskConfirmation`**：清空默认档不可逆性低（只影响之后新建的会话），二次确认用
 *    按钮文案变化实现（`defaults.clear` → `defaults.clearConfirm`）。
 *
 * `PanelFailure` 仍从本模块导出：`WorkspaceEntry.tsx` / `ToolPanelAction.tsx` 依赖这个导出
 * 路径（重写不改归属）。
 *
 * @module dsh-plugin-session-tool-toggle/client/DefaultsEditor
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DefaultsAction, DefaultsUniverse, DefaultsView } from '../contract.ts'
import { defaultsCountsOf } from './defaults-view.ts'
import { DefaultsGroupList } from './DefaultsGroupList.tsx'
import { DefaultsSectionFrame } from './DefaultsSectionFrame.tsx'
import { NS } from './locales.ts'
import css from './panel.module.css'

/** 本组件消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/**
 * 一段已本地化的失败展示：主文案（`error.<code>`）+ 宿主兜底说明（不参与本地化）。
 *
 * 键 → 文案的映射放在面板容器里：`bad-address` / `protected` / `defaults-unwritable` 这些键带
 * `{address}` / `{names}` / `{path}` 占位符，占位符的取值来自 `PanelError.details`，属于
 * 「失败码 → 文案」的唯一实现点（设计 §3.5 的渲染规则）。
 */
export interface PanelFailure {
  /** 主文案（已插值）。 */
  readonly text: string
  /** 宿主的 `error.message`（二级灰字；空串或缺省时不渲染）。 */
  readonly detail?: string
}

/** 默认档编辑区的 props。 */
export interface DefaultsEditorProps {
  /** 宿主返回的默认档活视图（`panel-controller` 的 `state.defaults`）。 */
  readonly defaults: DefaultsView
  /** 面板快照投影的宇宙（`universeOfSnapshot`；D-19）。 */
  readonly universe: DefaultsUniverse
  /** 本会话创建时间（epoch ms）：讲「本会话的快照来源」。 */
  readonly createdAt: number
  /** 本会话创建时快照的条目数（`state.snapshot.length`）。 */
  readonly snapshotCount: number
  /** 写在途（`savingDefaults`）：整区禁用。 */
  readonly saving: boolean
  /**
   * 上一次写入已被宿主确认（「已保存（本会话不变）」）。
   *
   * 由容器在写入的 promise 落定后判定：React 18 的批处理会把「在途 → 落定」合成一次渲染，
   * 组件内观察 `saving` 的翻转会漏掉成功信号，所以这个事实归持有控制器的容器。
   */
  readonly saved: boolean
  /** 上一次保存失败（已本地化）；成功或无错时为 `undefined`。 */
  readonly failure?: PanelFailure
  /**
   * 提交一次默认档写入。
   *
   * 语义与 `defaults` 端点一致：`off` = 加入默认档、`on` = 移出默认档、`reset` = 整份清空
   * （`reset` 不带地址）。
   * @param action - 动作。
   * @param addresses - 目标地址（`reset` 时缺省）。
   */
  readonly onUpdate: (action: DefaultsAction, addresses?: readonly string[]) => void
  /** 本插件命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 把字节时间渲染成本地时间文案。
 * @param at - epoch ms。
 * @returns 本地化的日期时间串（`0` 也照实显示，不伪造）。
 */
function formatTime(at: number): string {
  return new Date(at).toLocaleString()
}

/**
 * 默认档编辑区：折叠壳 + 路径/告警/三计数 + 分组开关清单 + 不追溯两句 + 清空与失败行。
 * @param props - 见 {@link DefaultsEditorProps}。
 * @returns 面板第三段。
 */
export function DefaultsEditor({
  defaults,
  universe,
  createdAt,
  snapshotCount,
  saving,
  saved,
  failure,
  onUpdate,
  t,
}: DefaultsEditorProps): ReactNode {
  const [armed, setArmed] = useState(false)

  // 三计数与清单共用同一份 (universe, disabled) 读数：摘要 / 计数行 / 清单不会各算一套。
  const counts = useMemo(
    () => defaultsCountsOf(universe, defaults.disabled),
    [universe, defaults.disabled],
  )

  /** 清空默认档：第一次点击只改文案，第二次才真的发请求。 */
  const clear = (): void => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    onUpdate('reset')
  }

  return (
    <DefaultsSectionFrame
      title={t('section.defaults')}
      // 摘要用三计数里的两项（D13：收起时也要看得出「有没有默认关的东西」）。
      summary={t('defaults.summary', { inDefaults: counts.inDefaults, residual: counts.residual })}
    >
      <p className={css.meta}>
        <span>{t('defaults.path')}</span>
        <code className={css.path}>{defaults.path}</code>
      </p>

      {defaults.corrupt && <p className={css.warning}>{t('notice.defaults-corrupt')}</p>}

      <p className={css.meta}>
        {t('defaults.counts', {
          listed: counts.listed,
          inDefaults: counts.inDefaults,
          residual: counts.residual,
        })}
      </p>

      {/* 分组清单 + 残留区 + 命令提示都由清单组件渲染（`copy` 只带键文案）。 */}
      <DefaultsGroupList
        universe={universe}
        disabled={defaults.disabled}
        busy={saving}
        onToggle={(address, on) => {
          // 任何一次开关都撤掉「清空」的待确认态：它描述的上一次意图已经过期。
          setArmed(false)
          onUpdate(on ? 'on' : 'off', [address])
        }}
        copy={{
          residualTitle: t('defaults.residualTitle'),
          removeLabel: t('defaults.remove'),
          removeAria: (a) => `${t('defaults.remove')} ${a}`,
          cliHint: t('defaults.cliHint'),
        }}
        t={t}
      />

      <p className={css.muted}>{t('defaults.scope')}</p>
      <p className={css.meta}>{t('defaults.snapshot', { time: formatTime(createdAt), count: snapshotCount })}</p>

      <div className={css.actions}>
        <Button
          variant="outline"
          size="sm"
          disabled={saving || defaults.disabled.length === 0}
          onClick={clear}
        >
          {armed ? t('defaults.clearConfirm') : t('defaults.clear')}
        </Button>
        {saved && <span className={css.saved}>{t('defaults.saved')}</span>}
      </div>

      {failure !== undefined && (
        <div role="alert">
          <p className={css.error}>{failure.text}</p>
          {failure.detail !== undefined && <p className={css.detail}>{failure.detail}</p>}
        </div>
      )}
    </DefaultsSectionFrame>
  )
}
