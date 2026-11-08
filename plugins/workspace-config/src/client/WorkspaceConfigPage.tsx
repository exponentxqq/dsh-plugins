/**
 * 统一「工作区配置」的独立页面壳（`main` 座位上唯一的页面消费者）。
 *
 * ## 形态：与官方插件页同构，只保留骨架（D8）
 *
 * `page > pageBody > pageBar(pageHead[h1 + intro] + toolbar + pageTabs) + tabpanel`。
 * toolbar 是页面级唯一的工作区选择框，pageTabs 是分节 tab 行，tabpanel 里只渲染当前
 * 选中的那一节。**不复制**插件页的吸顶 / 紧凑测量（`--plugin-header-*` /
 * `data-natural` / `data-compact` 与容器查询）：那是插件页私有的、由 `ResizeObserver`
 * 与滚动位置写回内联变量驱动的布局机制，需求只要求「样式和布局参照」，复制它会引入
 * 一段本仓测试覆盖不到的浏览器测量代码。
 *
 * ## a11y：真 tablist / tabpanel（D6）
 *
 * tab 行由 primitives 的 `SegmentedTabs` 渲染——它自己产出 `role="tablist"` 与
 * `role="tab"`（含 `aria-selected` / `aria-controls` / 方向键漫游）。holder 负责补齐
 * 另一半配对：`role="tabpanel"` 的 `id` / `aria-labelledby` 与选中 tab 的
 * `id` / `aria-controls` 逐字互指（同一个 `tabsId` 基 + 同一个分节 id）。
 *
 * 旧弹窗刻意避开 tablist（改 `nav` + `aria-current`）的理由是「分节组件由第三方注册，
 * holder 无法强制它的根节点带 `role=tabpanel`」；页面化后 tabpanel 由 holder 自己渲染，
 * 该理由消失（D6）。分节内部若还有自己的 tabpanel（web-ux 会话管理），嵌套是合法的。
 *
 * ## 状态全在本地（Q3 / Q9）
 *
 * `selected`（tab）与 `chosen`（选择框手选值）都是本组件的本地 state，页面切走即卸载、
 * 重进即回到默认——这是 D1「`main` 注册不带 store」的直接代价与承诺，不要改成
 * store 或 useEffect 持久化。
 *
 * `sections` / `workspaces` 两个快照源用 `useSyncExternalStore` 消费；两者都保证
 * 「内容没变时返回同一引用」，所以不会自激重渲染。
 *
 * `activeId` 的失效回退：选中的分节在账本里消失（贡献方退场 / 被禁用）时回落到
 * `rows[0]`（order 最小者）。没有任何分节时 `pageBody` 里只有 `.empty[role=status]`。
 *
 * ## 选择值（Q10）
 *
 * 手选优先；手选值失效（工作区被删）或还没手选过时，按 `defaultSelection`
 * （最近使用 > 当前会话所属 > 第一项 > 未分配）重新解析。清单源未就绪
 * （`phase === 'pending'`）时给分节下传 `{kind:'none'}`，toolbar 换成未就绪文案，
 * 不发任何寻址请求。
 *
 * ## 换工作区 = 分节重挂（D14）
 *
 * holder 每次渲染都按当前选择传 owner 份额 `{ workspace }`；**重挂语义由分节自己用
 * `key` 落地**（stt 用 `workspace.path`、web-ux 用选择键）。holder 不替它们挑 key，
 * 也不用 effect 对齐 props——后者会让分节状态残留。
 *
 * @module dsh-plugin-workspace-config/client/WorkspaceConfigPage
 */

import { useId, useState, useSyncExternalStore, type ReactNode } from 'react'
import { SegmentedTabs, type SegmentedTab } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// 类型专用：`main` 座位的 SlotMap 声明（keyed / root，无 owner 份额；全局标准座里含
// `usePanelInfo`）。本页不吸顶，因此不消费 `usePanelInfo`。
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkspaceConfigWorkspaceContext } from '@dsh-plugins/contracts'
// 类型专用：把座位契约的 SlotMap 增补并进本文件程序（`workspace-config.section` 的
// 条目形状与 owner 份额权威都在契约包，这里只借 contract.ts 的模块增补）。
import type {} from './contract.ts'
import { NS } from './locales.ts'
import type { WorkspaceConfigSectionRow, WorkspaceConfigSectionsSource } from './sections.ts'
import { NO_CONTEXT, defaultSelection, pickerItems } from './workspace-choice.ts'
import { WorkspacePicker } from './WorkspacePicker.tsx'
import type { WorkspaceListSource } from './workspace-source.ts'
import type { SessionUsageSnapshot } from './session-context.ts'
import css from './page.module.css'

/** apply 期单例/端口的注入面。 */
export interface WorkspaceConfigPageInjected {
  /** nav 行投影源（分节账本 + locale 双版本记忆）。 */
  readonly sections: WorkspaceConfigSectionsSource
  /** 工作区清单源（`pending | ready`，服务晚到自动转 ready）。 */
  readonly workspaces: WorkspaceListSource
  /** 当前会话 id（每次现取，服务缺席返回 undefined）。 */
  readonly currentSessionId: () => string | undefined
  /** 会话 `updatedAt` 读数（每次现取，服务缺席返回 undefined）。 */
  readonly sessionUsage: () => SessionUsageSnapshot | undefined
}

/**
 * 完整 props：`main` 的运行时份额 + 已声明子座位的 `renderSlot` 能力 + 本命名空间
 * 翻译 + 注入面。
 */
export type WorkspaceConfigPageProps = PropsRuntime<'main'>
  & PropsRenderSlots<'workspace-config.section'>
  & PropsLocale<typeof NS>
  & WorkspaceConfigPageInjected

/**
 * 把 nav 行投影成 `SegmentedTabs` 的行（tab 与 panel 的 DOM id 在这里唯一派生）。
 *
 * `SegmentedTabs` 的 `items` 要求非空元组（至少一行），所以用「首个 + 其余」把空数组
 * 显式折成 `undefined`：页面据此走空态，而不是给 tablist 传一个空数组（那会让它渲染
 * 一条没有 tab 的空控件）。
 * @param rows - 分节投影行（order 稳定升序）。
 * @param tabsId - 本次挂载的 id 基（`useId()`），tab 与 tabpanel 共用同一个基。
 * @returns 至少一行的 tab 数组；没有分节时为 `undefined`。
 */
function buildTabItems(
  rows: readonly WorkspaceConfigSectionRow[],
  tabsId: string,
): readonly [SegmentedTab, ...SegmentedTab[]] | undefined {
  const items = rows.map((row) => ({
    value: row.id,
    label: row.label,
    id: `${tabsId}-${row.id}`,
    panelId: `${tabsId}-${row.id}-panel`,
  }))
  const [first, ...rest] = items
  return first === undefined ? undefined : [first, ...rest]
}

/**
 * 页面壳。
 *
 * hooks 全部无条件调用（空态分支也必须排在任何 hook 之后），派生值每次渲染重算
 * ——`rows` / `list` 都是 identity 稳定的快照，重算本身不触发额外渲染。
 * @param props - 两个快照源、两个会话读数端口、`renderSlot` 与 `t`。
 * @returns 有分节时是「页头 + tabpanel」；没有分节时是整页空态。
 */
export function WorkspaceConfigPage(props: WorkspaceConfigPageProps): ReactNode {
  const { sections, workspaces, currentSessionId, sessionUsage, t, renderSlot } = props

  // 两个快照源（投影源保证内容未变时返回同一数组/对象引用）。
  const rows = useSyncExternalStore(sections.subscribe, sections.getSnapshot)
  const list = useSyncExternalStore(workspaces.subscribe, workspaces.getSnapshot)
  // tab 选中值与选择框手选值都是本组件本地 state（见模块头「状态全在本地」）。
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [chosen, setChosen] = useState<WorkspaceConfigWorkspaceContext | undefined>(undefined)
  // tab 与 tabpanel 的 DOM id 基：一次挂载内稳定；重挂页面自然换新，不与别的实例撞 id。
  const tabsId = useId()

  // 选中分节失效（贡献方退场 / 被禁用）时回落到 order 最小者；没有分节时为 undefined。
  const activeId = rows.some((row) => row.id === selected) ? selected : rows[0]?.id

  // 选择值：手选优先；手选值失效（工作区被删）或未手选时按 Q10 重解析。
  // `chosen` 只由选择框写入，候选里没有 `none`；这里仍把「选中态是 workspace」显式判出来
  // ——`none` 分支没有 `id`，且真出现时按「手选值失效」重解析比信任它更保守（Q10 兜底）。
  const chosenValid = chosen !== undefined
    && (chosen.kind === 'unassigned'
      || (chosen.kind === 'workspace' && list.items.some((item) => item.id === chosen.id)))
  const workspace: WorkspaceConfigWorkspaceContext = chosenValid
    ? chosen
    : list.phase === 'ready'
      ? defaultSelection(list.items, sessionUsage()?.updatedAtById, currentSessionId())
      : NO_CONTEXT

  // 空态：没有任何贡献方注册分节（或全部退场）。此时 pageBody 里只有空态一处内容。
  const tabItems = buildTabItems(rows, tabsId)
  if (tabItems === undefined || activeId === undefined) {
    return (
      <div className={css.page} data-wc-page="">
        <div className={css.pageBody}>
          <div className={css.empty} role="status">
            <p className={css.emptyTitle}>{t('page.empty.title')}</p>
            <p className={css.emptyHint}>{t('page.empty.hint')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={css.page} data-wc-page="">
      <div className={css.pageBody}>
        <div className={css.pageBar}>
          <header className={css.pageHead}>
            <div className={css.pageHeading}>
              <h1 className={css.pageTitle}>{t('page.title')}</h1>
              <p className={css.pageIntro}>{t('page.intro')}</p>
            </div>

            {/* 工具栏：清单就绪时是选择框，未就绪时降级成一句文案（不渲染假按钮）。 */}
            <div className={css.toolbar}>
              {list.phase === 'ready' ? (
                <>
                  <span className={css.toolbarLabel}>{t('page.workspace.label')}</span>
                  <WorkspacePicker
                    items={pickerItems(list.items)}
                    value={workspace}
                    t={t}
                    onSelect={setChosen}
                  />
                </>
              ) : (
                <span className={css.pickerUnavailable}>{t('page.workspace.unavailable')}</span>
              )}
            </div>

            {/* tab 行：真 tablist（`role="tablist"` / `role="tab"` 由 SegmentedTabs 渲染）。 */}
            <div className={css.pageTabs}>
              <SegmentedTabs
                size="sm"
                className={css.pageTabList}
                label={t('page.tabs.label')}
                items={tabItems}
                value={activeId}
                onChange={setSelected}
              />
            </div>
          </header>
        </div>

        {/* 真 tabpanel：`id` / `aria-labelledby` 与选中 tab 的 `id` / `aria-controls` 互指。 */}
        <div
          role="tabpanel"
          id={`${tabsId}-${activeId}-panel`}
          aria-labelledby={`${tabsId}-${activeId}`}
          className={css.tabPanel}
        >
          {/*
            * 一次只渲染选中分节（`only` 过滤；未选中的注册仍留在账本里）。
            * 座位名字面量直写：本行是渲染侧锚点（产物断言要求字面量出现 ≥2 次），
            * 同时由 `PropsRenderSlots<'workspace-config.section'>` 在调用点逐字校验。
            */}
          {renderSlot('workspace-config.section', { workspace }, { only: activeId })}
        </div>
      </div>
    </div>
  )
}
