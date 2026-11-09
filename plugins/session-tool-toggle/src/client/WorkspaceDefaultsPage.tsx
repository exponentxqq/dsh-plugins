/**
 * 工作区默认档页面正文（`code-design.md` ③ 3.4 / ③ 3.6 / G5.1；D8 / D10 / D11 / D12 / D14）。
 *
 * `WorkspaceDefaultsEditor` 的 `dialog` 形态委托到本组件：统一「工作区配置」页里本分节的
 * 正文从「六段平铺」重排为 **B1 三卡 + 脚注 + 页脚动作区**。组件是纯展示层——两段式清空
 * 确认（`armed`）、写入状态（`saving` / `saved`）与失败文案（`failure`）全部由父级持有，
 * 本组件只把它们摆到卡面上去；本地状态只有一样：全局过滤词 `query`（复制反馈状态机由
 * 共用 {@link CommandCard} 持有，本页不再自管）。
 *
 * 三卡分工（③ 3.6）：
 *
 * 1. **概要卡**：工作区名（`title ?? key`）+ 登记徽章 + 右推的刷新按钮（D12，页面形态的
 *    C3 入口；`section` 形态的刷新仍在它的 actions 行）+ key/档文件事实行 + 三计数 +
 *    corrupt 警告。`workspace === null`（宿主无法归属目标）时整卡退化为 `workspace.unresolved`
 *    一句 + 刷新按钮：没有目标档就没有可数的 key/文件/计数，但重读入口仍然在。
 * 2. **清单卡**：标题 + 全局过滤框（仅 `universeReady && counts.listed > 0` 时渲染——宇宙
 *    不可用或没有候选时过滤无处下手）+ 开关语义一句（`workspace.listHint`）+ 空档块 +
 *    {@link DefaultsGroupList}（`query` / `showDetails` 两个页面能力全开）+ 空宇宙块 +
 *    三条条件注记（全局并集近似 / 未归组 MCP 计数 / 技能目录观测不完整）。清单本体、残留
 *    chip 与过滤无结果文案都在共用组件内部渲染（G8 handoff，D6：页面不过滤宇宙再传）。
 * 3. **命令卡**：跨清单地址的命令模板（D8）。页面没有自由文本添加（红线），清单外的地址
 *    只能走 `/tools workspace off` 命令；整卡由共用 {@link CommandCard} 渲染（代码块文本 =
 *    复制文本：首行目标键注释 + 次行命令模板，复制与反馈状态机在组件内部）。命令只写
 *    「本会话所属工作区」的档——份额里没有 sessionId（A7），无法判断目标是否就是它，所以
 *    边界说明恒定显示。`workspace` 为 `null` 时整卡不渲染（没有目标键可注释）。
 *
 * 文案与样式归属：
 *
 * - 三计数、残留区、组清单的既有键全部复用（`defaults.counts` / `defaults.residualTitle` /
 *   `workspace.remove*` / `workspace.scope` / `workspace.union`）；页面新增键按 ③ 3.5 引用
 *   （`workspace.listTitle` 等 29 键，由 G6.2 落 `locales.ts`）。
 * - 技能来源标签（`skill.source.*` 映射、未知值原样）已在 `DefaultsGroupList` 的
 *   `DefaultsRow` 行级渲染（映射表就近放在该文件），本组件不重复持有。
 * - 样式类全部来自 `panel.module.css`（③ 3.7 清单，由 G6.1 落地）；脚注段用 `.note`——
 *   ③ 3.7 只定义了 `.footnotes` 容器，段级样式与注记共用 `.note`（演示稿同款）。
 *
 * @module dsh-plugin-session-tool-toggle/client/WorkspaceDefaultsPage
 */

import { useState, type ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DefaultsUniverse, WorkspaceView } from '../contract.ts'
import { COMMAND_PLACEHOLDER, CommandCard } from './CommandCard.tsx'
import type { DefaultsCounts } from './defaults-view.ts'
import type { PanelFailure } from './panel-failure.tsx'
import { DefaultsGroupList } from './DefaultsGroupList.tsx'
import { NS } from './locales.ts'
import css from './panel.module.css'

/** 本组件消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/**
 * 目标档缺席（`workspace === null`）时的空关闭集。
 *
 * 用模块级常量而不是行内 `?? []`：行内字面量每次渲染都是新数组，会让清单组件内部的
 * `useMemo`（过滤视图 / 关闭集）依赖恒变（与 `WorkspaceDefaultsEditor` 同一条纪律）。
 */
const EMPTY_DISABLED: readonly string[] = []

/** 工作区默认档页面正文的 props（code-design ③ 3.4 冻结形状；仅 dialog 形态使用）。 */
export interface WorkspaceDefaultsPageProps {
  /**
   * 当前编辑目标的工作区视图（宿主返回的活视图）。
   *
   * `null` = 宿主无法归属本分节的目标：概要卡退化为 `workspace.unresolved`、命令卡不渲染
   * （没有目标键可注释），清单卡仍按空档展示。
   */
  readonly workspace: WorkspaceView | null
  /**
   * 目标无关的工具宇宙（页面形态 = 宿主按 `{workspacePath}` 现算的工作区宇宙）。
   *
   * `null` / `layerReady:false` 时清单组件只留降级说明与残留区；全局过滤框也不渲染
   * （没有可过滤的候选）。
   */
  readonly universe: DefaultsUniverse | null
  /** 由父级算好的三计数（与清单同一份 `(universe, disabled)` 读数，D11：页面不自算）。 */
  readonly counts: DefaultsCounts
  /** 写在途（父级 hook 的 `saving`）：整区动作禁用。 */
  readonly saving: boolean
  /** 上一次写入已被宿主确认（「已保存（本会话不变）」）。 */
  readonly saved: boolean
  /** 上一次写入的失败（已本地化，由父级按 `error.<code>` 映射）；无错时为 `undefined`。 */
  readonly failure?: PanelFailure
  /** 清空的两段式确认态（状态机在 `WorkspaceDefaultsEditor`，页面只展示文案）。 */
  readonly armed: boolean
  /**
   * 开关意图：父级包装过（先撤清空确认态再发写入）。
   * @param address - 规范形地址（组地址或行地址）。
   * @param on - 期望的新状态（`true` = 移出目标档）。
   */
  readonly onToggle: (address: string, on: boolean) => void
  /** 提交一次清空（父级负责「第一次点击只武装、第二次才发请求」的状态机）。 */
  readonly onClear: () => void
  /** 重新读取当前目标工作区（父级 hook 的 `read`；D12 的页面刷新入口）。 */
  readonly onRefresh: () => void
  /** 本插件命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 工作区默认档页面正文（B1 三卡 + 脚注 + 页脚动作区 + 失败 alert）。
 * @param props - 见 {@link WorkspaceDefaultsPageProps}。
 * @returns 页面正文（无 heading：可访问名由 holder 的 tab `aria-labelledby` 提供，D10）。
 */
export function WorkspaceDefaultsPage({
  workspace,
  universe,
  counts,
  saving,
  saved,
  failure,
  armed,
  onToggle,
  onClear,
  onRefresh,
  t,
}: WorkspaceDefaultsPageProps): ReactNode {
  /** 全局过滤词：页面形态恒启用（`''` 也传给清单组件，让它隐藏内置组的本地过滤框）。 */
  const [query, setQuery] = useState('')

  /** 宇宙就绪（层可读）才有「过滤框 / 空档块 / 注记」；`null` 时按空档降级。 */
  const liveUniverse = universe !== null && universe.layerReady ? universe : null
  const universeReady = liveUniverse !== null
  const disabled = workspace?.disabled ?? EMPTY_DISABLED

  /**
   * 命令模板（= 复制文本，D8「代码块同文本」）：首行目标键注释（`workspace.commandComment`
   * 插值，`# ` 是注释语法的组成部分）+ 次行命令 + 占位符。
   */
  const commandText = workspace === null
    ? ''
    : `# ${t('workspace.commandComment', { key: workspace.key })}\n/tools workspace off ${COMMAND_PLACEHOLDER}`

  return (
    <div className={css.cardStack}>
      {/* ── 概要卡：工作区名 + 徽章 + 刷新 + key/文件 + 三计数 + corrupt ── */}
      <div className={css.card}>
        {workspace === null
          ? (
            <>
              <p className={css.note}>{t('workspace.unresolved')}</p>
              <div className={css.cardHeader}>
                <span className={css.push} />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={onRefresh}
                >
                  {t('workspace.refresh')}
                </Button>
              </div>
            </>
          )
          : (
            <>
              <div className={css.cardHeader}>
                <p className={css.cardTitle}>{workspace.title ?? workspace.key}</p>
                <span className={css.badge}>
                  {workspace.registered ? t('workspace.registered') : t('workspace.unregistered')}
                </span>
                <span className={css.push} />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={onRefresh}
                >
                  {t('workspace.refresh')}
                </Button>
              </div>
              <dl className={css.facts}>
                <div className={css.fact}>
                  <dt className={css.factTerm}>{t('workspace.key')}</dt>
                  <dd className={css.factValue}>{workspace.key}</dd>
                </div>
                <div className={css.fact}>
                  <dt className={css.factTerm}>{t('workspace.path')}</dt>
                  <dd className={css.factValue}>{workspace.path}</dd>
                </div>
              </dl>
              <p className={css.counts}>
                {t('defaults.counts', {
                  listed: counts.listed,
                  inDefaults: counts.inDefaults,
                  residual: counts.residual,
                })}
              </p>
              {workspace.corrupt && <p className={css.warning}>{t('workspace.corrupt')}</p>}
            </>
          )}
      </div>

      {/* ── 清单卡：过滤 + 语义句 + 空档块 + 共用清单 + 空宇宙块 + 条件注记 ── */}
      <div className={css.card}>
        <div className={css.cardHeader}>
          <p className={css.cardTitle}>{t('workspace.listTitle')}</p>
          {/* 过滤框只在有候选时渲染：宇宙不可用或清单为空时过滤无处下手。 */}
          {universeReady && counts.listed > 0 && (
            <Input
              className={css.pageFilter}
              value={query}
              placeholder={t('workspace.filter')}
              aria-label={t('workspace.filter')}
              onChange={(event) => {
                setQuery(event.target.value)
              }}
            />
          )}
        </div>
        <p className={css.note}>{t('workspace.listHint')}</p>

        {/* 空档块（C6）：宇宙就绪且档里还没有任何关闭项——引导用户去清单里关第一个。 */}
        {workspace !== null && universeReady && disabled.length === 0 && (
          <div className={css.emptyBlock}>
            <p className={css.emptyTitle}>{t('workspace.emptyDefaults')}</p>
            <p className={css.emptyHint}>{t('workspace.emptyDefaultsHint')}</p>
          </div>
        )}

        {/*
          共用清单（D6）：`query` 恒传（`''` 也是页面形态——隐藏内置组本地过滤框）；
          `showDetails` 开行下描述与技能标签（来源映射在 `DefaultsRow` 行级）；残留区与
          过滤无结果文案都在组件内部。宇宙降级文案覆盖为 `workspace.universeUnavailable`
          （③ 3.5 键表的使用面）；`cliHint` 不传——命令已进命令卡，不再要那句灰字。
        */}
        <DefaultsGroupList
          universe={universe}
          disabled={disabled}
          busy={saving}
          onToggle={onToggle}
          copy={{
            residualTitle: t('defaults.residualTitle'),
            removeLabel: t('workspace.remove'),
            removeAria: (address) => t('workspace.removeAria', { address }),
            universeUnavailable: t('workspace.universeUnavailable'),
          }}
          t={t}
          query={query}
          showDetails
        />

        {/*
          空宇宙块（C6）：清单与残留都为空时接管空态——层不可用讲「注册表暂不可用」，
          层就绪但没有候选讲「宿主没有提供可列出的工具清单」。有残留时不渲染（残留区
          已经是「能看能移除」的降级展示，两处空态会打架）。
        */}
        {counts.listed === 0 && counts.residual === 0 && (
          <div className={css.emptyBlock}>
            <p className={css.emptyTitle}>
              {universeReady ? t('workspace.emptyUniverse') : t('workspace.universeUnavailable')}
            </p>
          </div>
        )}

        {/*
          条件注记三连：全局并集近似（宇宙就绪即恒显——它解释整份清单的口径）；未归组
          MCP 计数（工作区宇宙字段，> 0 才显）；技能目录观测不完整（`skillsComplete`
          显式为 `false` 才显，缺省 = 未观测 / 旧响应，不谎报）。
        */}
        {liveUniverse !== null && (
          <>
            <p className={css.note}>{t('workspace.globalUnion')}</p>
            {liveUniverse.ungroupedMcp !== undefined && liveUniverse.ungroupedMcp > 0 && (
              <p className={css.note}>
                {t('workspace.ungrouped', { count: liveUniverse.ungroupedMcp })}
              </p>
            )}
            {/* R15：其他工作区的项目级 MCP 被整组剔除的计数注记（宿主过滤，页面只交代）。 */}
            {liveUniverse.foreignProjectMcp !== undefined && liveUniverse.foreignProjectMcp > 0 && (
              <p className={css.note}>
                {t('workspace.foreignProjectMcp', { count: liveUniverse.foreignProjectMcp })}
              </p>
            )}
            {liveUniverse.skillsComplete === false && (
              <p className={css.note}>{t('workspace.skillsIncomplete')}</p>
            )}
          </>
        )}
      </div>

      {/* ── 命令卡：共用组件整卡接管（复制反馈状态机在组件内部；workspace 为 null 时不渲染）── */}
      {workspace !== null && (
        <CommandCard
          title={t('workspace.commandTitle')}
          note={t('workspace.commandNote')}
          commandText={commandText}
          copyLabel={t('command.copy')}
          copiedLabel={t('command.copied')}
          copyFailedLabel={t('command.copyFailed')}
        />
      )}

      {/* ── 脚注：影响范围 + 并集语义（段级样式与注记共用 `.note`，见文件头）── */}
      <div className={css.footnotes}>
        <p className={css.note}>{t('workspace.scope')}</p>
        <p className={css.note}>{t('workspace.union')}</p>
      </div>

      {/* ── 页脚动作区：两段式清空（状态机在父级）+ 保存确认 ── */}
      <div className={css.actions}>
        <Button
          variant="outline"
          size="sm"
          disabled={workspace === null || saving || disabled.length === 0}
          onClick={onClear}
        >
          {armed ? t('workspace.clearConfirm') : t('workspace.clear')}
        </Button>
        {saved && <span className={css.saved}>{t('workspace.saved')}</span>}
      </div>

      {/* ── 失败 alert：主文案（父级已按 `error.<code>` 插值）+ 宿主兜底灰字 ── */}
      {failure !== undefined && (
        <div role="alert">
          <p className={css.error}>{failure.text}</p>
          {failure.detail !== undefined && <p className={css.detail}>{failure.detail}</p>}
        </div>
      )}
    </div>
  )
}
