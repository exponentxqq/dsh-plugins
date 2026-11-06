/**
 * 面板里两个默认档分区的可折叠壳（`code-design.md` ③ 3.19 / W6；D13 / D-24）。
 *
 * 面板里的「用户级默认档」与「工作区默认档」两段默认**收起**：会话工具面是高频操作、默认档是
 * 低频操作，两套完整清单会把会话开关推到屏外（D-24 的反例）。标题行同时显示标题与计数摘要
 * （`defaults.summary`），收起时摘要仍在——否则收起的默认档是纯黑盒，用户不知道有没有默认关
 * 的东西。
 *
 * 只用于**面板形态**（两个编辑器在 `ToolPanelAction` 里的挂载点）：统一「工作区配置」弹窗的
 * 分节由 holder 的导航承担，那里不折叠（D13）。折叠态是组件本地状态，面板关闭再打开会复位为
 * 收起（U7，即 D13 的默认值）。
 *
 * 样式复用 `ToolPanelGroups` 的标题行三件套：`.groupHeader`（行高与对齐）、`.groupToggle`
 * （铺满剩余宽度的命中区）、`.groupTitle` / `.groupCounts`（标题与摘要），chevron 图标同源。
 *
 * @module dsh-plugin-session-tool-toggle/client/DefaultsSectionFrame
 */

import { useState, type ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './panel.module.css'

/** 默认档分区折叠壳的 props。 */
export interface DefaultsSectionFrameProps {
  /** 分区标题（`section.defaults` / `workspace.title`）。 */
  readonly title: string
  /** 标题行的计数摘要（`defaults.summary`：默认关 M · 残留 K）。 */
  readonly summary: string
  /** 收起时不渲染。 */
  readonly children: ReactNode
}

/**
 * 可折叠分区壳：标题行（chevron + 标题 + 摘要）+ 展开后的正文。
 * @param props - 见 {@link DefaultsSectionFrameProps}。
 * @returns 一个 `<section>`；`aria-expanded` 由标题行的按钮承载。
 */
export function DefaultsSectionFrame({ title, summary, children }: DefaultsSectionFrameProps): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    // 3.19 的壳写 `.section`（分区正文的纵向排布），W12 又为本组件新增了 `.sectionFrame`
    // （面板两分区的折叠外壳：顶部留白 + 无背景/无边框重置）；两者声明不冲突，并挂同时满足
    // 这两处口径。
    <section className={`${css.section} ${css.sectionFrame}`}>
      <div className={css.groupHeader}>
        <button
          type="button"
          className={css.groupToggle}
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value)
          }}
        >
          {open ? <IconChevronDownOutlineRegular /> : <IconChevronRightOutlineRegular />}
          <span className={css.groupTitle}>{title}</span>
          <span className={css.groupCounts}>{summary}</span>
        </button>
      </div>
      {open && children}
    </section>
  )
}
