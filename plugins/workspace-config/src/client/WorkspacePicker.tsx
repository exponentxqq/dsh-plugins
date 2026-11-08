/**
 * 页面级唯一的统一工作区选择框（code-design ③ 3.8、Q8 / Q10、D7）。
 *
 * 形态是 primitives 的 `Menu` + 自绘锚点按钮：
 *
 * 1. **`portal` 必开**（D7）：页面正文是滚动容器（与插件页同款 `overflow:hidden auto`），
 *    原地渲染的列表会被祖先的裁剪框切掉；`portal` 把列表挂到 `document.body` 并按锚点
 *    矩形定位。本组件只有这一处渲染决策，真机若与页面层级冲突也只改这一行。
 * 2. **受控 `value` / `onSelect`**：组件不拥有选择状态，只把 `Menu` 的行 id 经
 *    `workspace-choice` 的唯一编解码点换回选择值再上调（受控面是「值而非 key」）。
 *    开合状态是纯 UI 局部量，留在组件内。
 * 3. **禁用态**：`disabled`（清单未就绪）与 `value.kind === 'none'`（页面拿不到上下文）
 *    都让按钮不可点；后者按未就绪文案显示——候选里没有 `none`，`selectedId` 自然不命中。
 * 4. **行文案**：`selectionKeyOf` 定 id、`selectionLabelOf` 定 label，未分配行用本命名
 *    空间的「未分配」文案兜底（标题与路径皆空的工作区也落到同一句，绝不留空行）。
 *
 * 样式键 `picker` / `pickerName` 属 `page.module.css` 的类名契约（③ 3.12）；该样式表是
 * 本页唯一的样式注入器（由页面壳持有，本文件只消费，不新建 CSS 文件）。
 *
 * @module dsh-plugin-workspace-config/client/WorkspacePicker
 */

import { useState, type ReactNode } from 'react'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceConfigWorkspaceContext } from '@dsh-plugins/contracts'
import { NS } from './locales.ts'
import { selectionFromKey, selectionKeyOf, selectionLabelOf } from './workspace-choice.ts'
import css from './page.module.css'

/** 统一工作区选择框的 props（code-design ③ 3.8 冻结形状）。 */
export interface WorkspacePickerProps {
  /** 候选（末项恒为 `{kind:'unassigned'}`；空清单时只有它）。 */
  readonly items: readonly WorkspaceConfigWorkspaceContext[]
  /** 当前值。 */
  readonly value: WorkspaceConfigWorkspaceContext
  /** 未就绪/禁用。 */
  readonly disabled?: boolean
  /** 本命名空间翻译。 */
  readonly t: TranslateNS<typeof NS>
  /** 选择变化（值而非 key；key 编解码留在组件内）。 */
  readonly onSelect: (next: WorkspaceConfigWorkspaceContext) => void
}

/**
 * 统一工作区选择框。
 *
 * @param props - 候选、当前值、禁用开关、翻译与选择回调（见 {@link WorkspacePickerProps}）。
 * @returns `Menu` 包装的锚点按钮（列表经 portal 渲染到 `document.body`）。
 */
export function WorkspacePicker({ items, value, disabled, t, onSelect }: WorkspacePickerProps): ReactNode {
  const [open, setOpen] = useState(false)
  const unavailable = value.kind === 'none'
  // 禁用优先于开合：清单在菜单打开期间转为未就绪时，列表立即收起。
  const locked = disabled === true || unavailable
  const menuOpen = open && !locked
  const label = unavailable
    ? t('page.workspace.unavailable')
    : selectionLabelOf(value, t('page.workspace.unassigned'))

  return (
    <Menu
      open={menuOpen}
      anchor={(
        <button
          type="button"
          className={css.picker}
          aria-label={t('page.workspace.label')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={locked}
          onClick={() => {
            setOpen((previous) => !previous)
          }}
        >
          <span className={css.pickerName}>{label}</span>
          <IconChevronDownOutlineRegular />
        </button>
      )}
      items={items.map((item) => ({
        id: selectionKeyOf(item),
        label: selectionLabelOf(item, t('page.workspace.unassigned')),
      }))}
      selectedId={selectionKeyOf(value)}
      onSelect={(key) => {
        const next = selectionFromKey(key, items)
        setOpen(false)
        if (next !== undefined) onSelect(next)
      }}
      onClose={() => {
        setOpen(false)
      }}
      // D7：页面正文是滚动容器，原地列表会被裁切——这一行是本组件唯一的 portal 开关。
      portal
    />
  )
}
