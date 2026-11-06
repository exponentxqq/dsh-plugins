/**
 * `@deepseek-ai/dsh-client-ui-primitives` 测试替身的**公共底座**。
 *
 * 真包是宿主自己的 bundle：发布产物里带裸 `.module.css` 导入与只有 web 壳能解析的宿主侧
 * 依赖（anser、shiki 等），jsdom 套件加载不了那个 barrel。本包把三个双端插件
 * （`session-tool-toggle` / `web-ux` / `workspace-config`）原先逐份维护的替身收敛为
 * **并集实现**——props 取三份的并集（全兼容），DOM 形状逐项保留既有可观测标记：
 *
 * - `Switch` 与真组件同形：`role="switch"` + `aria-checked` + `aria-label` + `title` + 原生
 *   `disabled`；`onClick` **无条件**回调 `onChange(!checked)`（真组件就是这样），锁定行不
 *   触发请求靠的是真实浏览器的 `disabled` 语义与被测组件自己的守卫——替身不替被测组件兜底。
 * - `Modal` 取 `workspace-config` 版（`className` 落卡片、`contentClassName` 落内容列）并
 *   保留 `web-ux` / `session-tool-toggle` 版的 `data-modal-body` / `data-modal-footer` 标记；
 *   `headless` 只跳过默认 header。
 * - `Button` / `Input` 透传原生属性（`aria-*`、`title`、`disabled`、`onChange` 等）：测的就是
 *   这些属性有没有被正确地放到按钮/输入框上。
 * - `Menu` / `MenuItemButton` 分别覆盖「锚定菜单 + 数据行」与「单行菜单按钮」两种用法；
 *   行的选中/危险/分隔标记落在 `data-selected` / `data-danger` / `data-separator`。
 * - 图标是带 `data-icon` 的 svg 占位，不画路径；名字与 `data-icon` 取值逐字沿用三份替身。
 *
 * 用法：各包的 `test/stubs/ui-primitives.tsx` 只做
 * `export * from '@dsh-plugins/test-kit/ui-primitives'`，本包独有的组件或行为差异在**该包
 * stub 里本地覆盖**（re-export + 具名覆盖），不往底座里加 per-package 分支。vitest 的
 * `resolve.alias` 仍指向各包 stub 文件，测试文件零改动；运行时类型检查仍然对着真包的
 * `.d.ts`，所以替身不会掩盖 props 形状的漂移。
 *
 * @module @dsh-plugins/test-kit/ui-primitives
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 图标的 props 切片：真包 `IconProps` 只有 `size` / `className`；替身再收一个可选的
 * `onClick`，让按钮里内联的图标也能被点击驱动（`web-ux` 的删除入口依赖这一点）。
 */
export interface IconProps {
  readonly size?: number
  readonly className?: string
  readonly onClick?: () => void
}

/**
 * 造一个带固定 `data-icon` 的占位图标（不画路径）。
 * @param glyph - `data-icon` 的取值（与真包图标的语义名一致）。
 * @returns 图标组件。
 */
function iconComponent(glyph: string): (props: IconProps) => ReactNode {
  return ({ size = 16, className, onClick }: IconProps) => (
    <svg data-icon={glyph} width={size} height={size} className={className} onClick={onClick} />
  )
}

/** 入口按钮的图标：滑杆。 */
export const IconSlidersTwoOutlineRegular = iconComponent('sliders-two')

/** 刷新图标。 */
export const IconRefreshOutlineRegular = iconComponent('refresh')

/** 分组展开（折叠箭头朝下）。 */
export const IconChevronDownOutlineRegular = iconComponent('chevron-down')

/** 分组折叠（折叠箭头朝右）。 */
export const IconChevronRightOutlineRegular = iconComponent('chevron-right')

/** 上箭头（行排序）。 */
export const IconChevronUpOutlineRegular = iconComponent('chevron-up')

/** 垃圾桶图标（删除动作）。 */
export const IconTrashOutlineRegular = iconComponent('trash')

/** 清单图标（管理面入口）。 */
export const IconChecklistOutlineRegular = iconComponent('checklist')

/** 归档图标（归档动作）。 */
export const IconArchiveOutlineRegular = iconComponent('archive')

/** 时钟图标（时间列 / 耗时提示）。 */
export const IconClockOutlineRegular = iconComponent('clock')

/** 工作区树图标（holder 的侧栏入口）。 */
export const IconWorkspaceTreeOutlineRegular = iconComponent('workspace-tree')

/** 关闭图标（弹窗自绘 header）。 */
export const IconCloseOutlineRegular = iconComponent('close')

/** 复制图标（复制路径）。 */
export const IconCopyOutlineRegular = iconComponent('copy')

/** 编辑图标（重命名）。 */
export const IconEditOutlineRegular = iconComponent('edit')

/** 省略号图标（行菜单触发）。 */
export const IconEllipsisOutlineRegular = iconComponent('ellipsis')

/** 关闭的文件夹图标。 */
export const IconFolderCloseRegular = iconComponent('folder-close')

/** 打开的文件夹图标。 */
export const IconFolderOpenOutlineRegular = iconComponent('folder-open')

/** 加号图标（添加根）。 */
export const IconPlusOutlineRegular = iconComponent('plus')

/**
 * 按钮的 props 切片：`variant` / `size` / `icon` + 原生按钮属性透传。
 *
 * `ButtonHTMLAttributes` 已经包含 `className` / `disabled` / `onClick` / `children`，
 * 因此 `web-ux` 以前的窄切片与本切片在运行时等价；三个旧类型名都保留导出。
 */
export type ButtonProps = {
  variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
  size?: 'md' | 'sm'
  icon?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

/** `session-tool-toggle` / `workspace-config` 替身里的旧类型名。 */
export type StubButtonProps = ButtonProps

/** 普通按钮：保留 variant / size 供用例断言视觉家族，其余原生属性原样透传。 */
export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  children,
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button type="button" data-variant={variant} data-size={size} {...rest}>
      {icon}
      {children}
    </button>
  )
}

/** 输入框的 props 切片：真组件把原生属性铺在内部 `<input>` 上。 */
export type StubInputProps = {
  icon?: ReactNode
} & InputHTMLAttributes<HTMLInputElement>

/** 输入框的短名字（新代码用这个名字；旧名保留）。 */
export type InputProps = StubInputProps

/** 文本输入：真组件是「外层 span 包原生 input」，`className` 落在 span 上（照抄）。 */
export function Input({ icon, className, ...rest }: InputProps): ReactNode {
  return (
    <span data-input="true" className={className}>
      {icon}
      <input {...rest} />
    </span>
  )
}

/** 开关的 props 切片（真组件的六个字段）。 */
export interface StubSwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  title?: string | undefined
  className?: string | undefined
}

/** 开关的短名字（旧名保留）。 */
export type SwitchProps = StubSwitchProps

/**
 * 受控开关：`role="switch"` 的原生按钮，禁用靠原生 `disabled`。
 *
 * `onClick` 不判 `disabled`：真组件同样只把 `disabled` 交给浏览器，"锁定行点击不发请求"
 * 必须由被测组件自己守住——替身若替它兜底，用例就测不到组件里的守卫了。
 */
export function Switch({ checked, onChange, label, disabled, title, className }: StubSwitchProps): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      className={className}
      data-switch="true"
      onClick={() => {
        onChange(!checked)
      }}
    >
      <span data-switch-thumb="true" />
    </button>
  )
}

/** 模态框的 props 切片（真组件里 `closeLabel` 非 headless 时必填）。 */
export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  closeLabel?: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
  headless?: boolean
}

/** `session-tool-toggle` 替身里的旧类型名。 */
export type StubModalProps = ModalProps

/**
 * 模态框：`open` 时把卡片 portal 到 body。
 *
 * 与真组件的可观测形状一致：卡片是 `role="dialog"` + `aria-label={title}`，`className` 在
 * 卡片上、`contentClassName` 在内容列上；正文与底栏分别带 `data-modal-body` /
 * `data-modal-footer` 标记（web-ux / stt 的既有断言依赖它们）。`headless` 只跳过默认
 * header/关闭按钮，遮罩与卡片本身仍存在。
 */
export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  description,
  children,
  footer,
  className,
  contentClassName,
  headless,
}: ModalProps): ReactNode {
  if (!open) return null
  return createPortal(
    <div role="dialog" aria-label={title} data-modal="true" className={className}>
      {headless !== true && (
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label={closeLabel ?? 'close'} onClick={onClose}>
            ×
          </button>
        </header>
      )}
      {description !== undefined && <p data-modal-description="true">{description}</p>}
      <div data-modal-body="true" className={contentClassName}>
        {children}
      </div>
      {footer !== undefined && <footer data-modal-footer="true">{footer}</footer>}
    </div>,
    document.body,
  )
}

/** 复选框的 props 切片：真组件是受控的，只回调请求后的布尔值。 */
export interface CheckboxProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  title?: string
  className?: string
}

/** 复选框：`<label>` 包住原生 input，label 文本即其可访问名（点击文字也能勾选）。 */
export function Checkbox({ checked, onChange, label, disabled, title, className }: CheckboxProps): ReactNode {
  return (
    <label className={className} title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

/** 一个 tab 的 props 切片：真组件要求每项带唯一的 value 与两个 DOM id（tab / panel 互指）。 */
export interface SegmentedTab<Value extends string = string> {
  value: Value
  label: ReactNode
  id: string
  panelId: string
}

/** 分段 tab 的 props 切片。 */
export interface SegmentedTabsProps<Value extends string> {
  items: readonly [SegmentedTab<Value>, ...SegmentedTab<Value>[]]
  value: Value
  onChange: (value: Value) => void
  label: string
  className?: string
}

/**
 * 分段 tab：`role="tablist"` 里一排 `role="tab"` 按钮，选中态落在 `aria-selected`。
 *
 * 点击直接回调 `onChange`；方向键 / Home / End 与真组件一致地移焦点并回调（面板由调用方
 * 拥有）。键盘行为取 `web-ux` 版（三份替身里唯一实现了它的），对 `workspace-config` 的
 * 只导入不渲染用法无影响。
 */
export const SegmentedTabs = <Value extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: SegmentedTabsProps<Value>): ReactNode => {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next: number
    switch (event.key) {
      case 'ArrowLeft':
        next = (index + items.length - 1) % items.length
        break
      case 'ArrowRight':
        next = (index + 1) % items.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = items.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(next)
      ?.focus()
    onChange(items[next].value)
  }
  return (
    <div role="tablist" aria-label={label} className={className}>
      {items.map((item, index) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          id={item.id}
          aria-selected={value === item.value}
          aria-controls={item.panelId}
          tabIndex={value === item.value ? 0 : -1}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

/** 菜单数据行：真包 `MenuEntry` 里 `MenuItem` 的切片（取三份替身的并集字段）。 */
export interface MenuItem {
  id: string
  label: ReactNode
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
}

/** 锚定菜单的 props 切片：只声明各包实际用到的字段，其余真包能力不假装支持。 */
export interface MenuProps {
  open: boolean
  anchor?: ReactNode
  items?: readonly MenuItem[]
  selectedId?: string
  onSelect?: (id: string) => void
  onClose: () => void
  portal?: boolean
  className?: string
}

/**
 * 锚定下拉菜单：锚点原样渲染，`open` 时在其后渲染 `role="menu"` 的列表。
 *
 * 与真组件的可观测形状一致：数据行是 `role="menuitem"` 的按钮，选中行走
 * `data-selected`、危险行走 `data-danger`、图标行渲染 `item.icon`；`portal` 时列表进
 * `document.body`（A13 的 jsdom 验证路径——按 role 查询不依赖落点）。点击行回调
 * `onSelect` 并请求收起（`onClose`）。触发按钮的 `aria-expanded` 由锚点主人自己给
 * （真组件同样不代填），替身不越权补写。
 */
export function Menu({
  open,
  anchor,
  items = [],
  selectedId,
  onSelect,
  onClose,
  portal = false,
  className,
}: MenuProps): ReactNode {
  const list = open ? (
    <div role="menu" data-menu="true">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          data-selected={item.id === selectedId ? 'true' : undefined}
          data-danger={item.danger === true ? 'true' : undefined}
          onClick={() => {
            if (item.disabled === true) return
            onSelect?.(item.id)
            onClose()
          }}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  ) : null
  return (
    <span className={className}>
      {anchor}
      {portal && open ? createPortal(list, document.body) : list}
    </span>
  )
}

/** 菜单项按钮的 props 切片（`web-ux` 的删除入口 + `workspace-config` 的组合矩阵并集）。 */
export interface MenuItemButtonProps {
  children?: ReactNode
  icon?: ReactNode
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
  onSelect?: () => void
}

/** 菜单项按钮：`role="menuitem"` 的原生按钮，危险/分隔标记落在 `data-*`。 */
export function MenuItemButton({
  children,
  icon,
  disabled,
  danger,
  separatorBefore,
  onSelect,
}: MenuItemButtonProps): ReactNode {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      data-danger={danger === true ? 'true' : undefined}
      data-separator={separatorBefore === true ? 'true' : undefined}
      onClick={onSelect}
    >
      {icon}
      {children}
    </button>
  )
}
