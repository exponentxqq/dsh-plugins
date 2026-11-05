/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的测试替身。
 *
 * 真包是宿主自己的 bundle：发布产物里带裸 `.module.css` 导入与只有 web 壳能解析的宿主侧
 * 依赖（anser、shiki 等），jsdom 套件加载不了那个 barrel。spy 只保留本插件用到的 DOM
 * 形状——菜单行是一个 `role="menuitem"` 的按钮（danger 落成 `data-danger`）、Modal 在
 * open 时把标题/正文/底栏 portal 到 body、图标是带 `data-icon` 的 svg 占位——于是用例
 * 断言的是「本插件把哪个图标放进哪个按钮、菜单里有哪些行」，视觉由浏览器里的真组件负责。
 *
 * 经 `vitest.config.ts` 的 resolve.alias 生效（与 multi-root 的 tests/stubs 同一模式）；
 * 运行时类型检查仍然对着真包的 `.d.ts`，所以替身不会掩盖 props 形状的漂移。
 *
 * @module stubs/ui-primitives
 */

import type { KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** 最小 `IconProps` 镜像。 */
interface IconProps {
  readonly size?: number
  readonly className?: string
}

/** 垃圾桶图标：同元素形状的 svg 占位，不画路径。 */
export function IconTrashOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="trash" width={size} height={size} className={className} />
}

/** 菜单行的 props 切片。 */
export interface MenuItemButtonProps {
  children: ReactNode
  icon?: ReactNode
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
  onSelect: () => void
}

/** 一行 `role="menuitem"` 按钮：真组件的可观测形状。 */
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

/** 按钮的 props 切片。 */
export interface ButtonProps {
  variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
  size?: 'md' | 'sm'
  icon?: ReactNode
  className?: string
  children?: ReactNode
  disabled?: boolean
  onClick?: () => void
}

/** 普通按钮：保留 variant 与 className 供用例断言危险色 class 落位。 */
export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  className,
  children,
  disabled,
  onClick,
}: ButtonProps): ReactNode {
  return (
    <button
      type="button"
      data-variant={variant}
      data-size={size}
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  )
}

/** 模态框的 props 切片。 */
export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  closeLabel?: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  headless?: boolean
}

/** 居中模态框：open 时把标题/正文/底栏 portal 到 body。 */
export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  description,
  children,
  footer,
  headless,
}: ModalProps): ReactNode {
  if (!open) return null
  return createPortal(
    <div role="dialog" aria-label={title} data-modal="true">
      {headless !== true && (
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label={closeLabel ?? 'close'} onClick={onClose}>×</button>
        </header>
      )}
      {description !== undefined && <p data-modal-description="true">{description}</p>}
      <div data-modal-body="true">{children}</div>
      {footer !== undefined && <footer data-modal-footer="true">{footer}</footer>}
    </div>,
    document.body,
  )
}

/**
 * 图标的 props 切片：在 `IconProps` 之外再接受 `onClick`，让按钮里内联的图标也能被点击驱动。
 * （真组件的 `IconProps` 只有 `size` / `className`；替身多收一个可选回调，运行时才有得点。）
 */
interface GlyphProps extends IconProps {
  readonly onClick?: () => void
}

/** 清单图标：管理面入口按钮的标识。 */
export const IconChecklistOutlineRegular = ({ size = 16, className, onClick }: GlyphProps): ReactNode => (
  <svg data-icon="checklist" width={size} height={size} className={className} onClick={onClick} />
)

/** 下拉箭头图标：工作区选择触发按钮的标识。 */
export const IconChevronDownOutlineRegular = ({ size = 16, className, onClick }: GlyphProps): ReactNode => (
  <svg data-icon="chevron-down" width={size} height={size} className={className} onClick={onClick} />
)

/** 归档图标：归档动作的标识。 */
export const IconArchiveOutlineRegular = ({ size = 16, className, onClick }: GlyphProps): ReactNode => (
  <svg data-icon="archive" width={size} height={size} className={className} onClick={onClick} />
)

/** 刷新图标：迁移列表重载按钮的标识。 */
export const IconRefreshOutlineRegular = ({ size = 16, className, onClick }: GlyphProps): ReactNode => (
  <svg data-icon="refresh" width={size} height={size} className={className} onClick={onClick} />
)

/** 时钟图标：时间列 / 耗时提示的标识。 */
export const IconClockOutlineRegular = ({ size = 16, className, onClick }: GlyphProps): ReactNode => (
  <svg data-icon="clock" width={size} height={size} className={className} onClick={onClick} />
)

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
export const Checkbox = ({ checked, onChange, label, disabled, title, className }: CheckboxProps): ReactNode => (
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
 * 点击直接回调 `onChange`；方向键 / Home / End 与真组件一致地移焦点并回调（面板由调用方拥有）。
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

/** 菜单数据行：真包 `MenuEntry` 里 `MenuItem` 的切片（分隔线与分组标题本插件不用）。 */
export interface MenuItem {
  id: string
  label: ReactNode
  disabled?: boolean
}

/** 锚定菜单的 props 切片：只声明本插件实际用到的字段，其余真包能力不假装支持。 */
export interface MenuProps {
  open: boolean
  anchor: ReactNode
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
 * `data-selected`；`portal` 时列表进 `document.body`（A13 的 jsdom 验证路径——
 * 按 role 查询不依赖落点）。点击行回调 `onSelect` 并请求收起（`onClose`）。触发按钮
 * 的 `aria-expanded` 由锚点主人自己给（真组件同样不代填），替身不越权补写。
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
          onClick={() => {
            if (item.disabled === true) return
            onSelect?.(item.id)
            onClose()
          }}
        >
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
