/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的测试替身（骨架，照
 * `plugins/web-ux/test/stubs/ui-primitives.tsx` 扩展）。
 *
 * 真包是宿主自己的 bundle：发布产物里带裸 `.module.css` 导入与只有 web 壳能解析的宿主侧
 * 依赖（anser、shiki 等），jsdom 套件加载不了那个 barrel。替身只保留本插件用到的 DOM 形状，
 * 于是用例断言的是「holder 把哪个图标放进哪个按钮、弹窗壳渲染了哪些节点」，视觉由浏览器里
 * 的真组件负责：
 *
 * - `Modal` 在 `open` 时把卡片 portal 到 body；`headless` 为真时**不渲染默认 header**
 *   （只保留 `role="dialog"`、`aria-label` 与卡片/内容列），与本包弹窗自绘 header 的用法
 *   一致；`className` / `contentClassName` 分别落到卡片与内容列，供用例断言宽度与滚动归属。
 * - `Button` 透传原生属性，`variant` / `size` 落到 `data-*` 供用例断言视觉家族。
 * - 图标是带 `data-icon` 的 svg 占位，不画路径。
 * - `Input` / `Switch` / `Checkbox` / `SegmentedTabs` / `Menu` / `MenuItemButton` 与
 *   `IconChevron*` / `IconRefresh` / `IconSlidersTwo` / `IconTrash` 是**四格安装组合矩阵**
 *   需要的补充面：holder 的组合用例会 `apply` 三个贡献方的浏览器半（见
 *   `test/dialog.test.tsx` 的「四格安装组合矩阵」），导入它们的组件模块时这些具名导出必须
 *   存在。组合矩阵只断言注册面与 holder 弹窗的渲染，**不渲染**贡献方组件，因此这里只保留
 *   与真包一致的 DOM 形状（形状抄自 stt / web-ux 的同名替身），不假装覆盖它们的交互。
 *
 * 经 `vitest.config.ts` 的 `resolve.alias` 生效（与 web-ux / session-tool-toggle 同一模式）；
 * 运行时类型检查仍对着真包 `.d.ts`，所以替身不会掩盖 props 形状的漂移。
 *
 * @module stubs/ui-primitives
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** 最小 `IconProps` 镜像（真包的图标默认 16px）。 */
interface IconProps {
  readonly size?: number
  readonly className?: string
}

/** 统一入口的图标：工作区树（holder 的 footer 入口标识）。 */
export function IconWorkspaceTreeOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="workspace-tree" width={size} height={size} className={className} />
}

/** 弹窗自绘 header 的关闭按钮图标。 */
export function IconCloseOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="close" width={size} height={size} className={className} />
}

/** 按钮的 props 切片：真组件是原生属性透传，替身照此把原生属性铺在按钮上。 */
export type StubButtonProps = {
  variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
  size?: 'md' | 'sm'
  icon?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

/** 普通按钮：保留 variant / size 供用例断言视觉家族，其余原生属性原样透传。 */
export function Button({ variant = 'ghost', size = 'md', icon, children, ...rest }: StubButtonProps): ReactNode {
  return (
    <button type="button" data-variant={variant} data-size={size} {...rest}>
      {icon}
      {children}
    </button>
  )
}

/** 模态框的 props 切片：真包的 `Modal` 形状（`headless` 时 `closeLabel` 不参与渲染）。 */
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

/**
 * 模态框：`open` 时把卡片 portal 到 body；`headless` 跳过默认 header，由调用方自绘。
 *
 * 与真组件的可观测形状一致：卡片是 `role="dialog"` + `aria-label={title}`，`className` 在
 * 卡片上、`contentClassName` 在内容列上；`headless` 只影响默认 header/关闭按钮，遮罩与
 * 卡片本身仍存在（真组件的 mask / Escape / return focus 由 primitives 内部处理，替身不
 * 假装模拟外层壳）。
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

/* ------------------------------------------------------------------------------------------------
 * 组合矩阵补充面（三个贡献方导入期需要的具名导出；组合矩阵不渲染它们，见模块头）。
 * ---------------------------------------------------------------------------------------------- */

/** 输入框的 props 切片：真组件把原生属性铺在内部 `<input>` 上。 */
export type StubInputProps = {
  icon?: ReactNode
} & InputHTMLAttributes<HTMLInputElement>

/** 文本输入：外层 span 包原生 input（与 stt 替身同形）。 */
export function Input({ icon, className, ...rest }: StubInputProps): ReactNode {
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

/** 受控开关：`role="switch"` 的原生按钮，禁用交给浏览器。 */
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

/** 复选框的 props 切片：真组件是受控的，只回调请求后的布尔值。 */
export interface CheckboxProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  title?: string
  className?: string
}

/** 复选框：`<label>` 包住原生 input，label 文本即其可访问名。 */
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

/** 一个 tab 的 props 切片：每项带唯一 value 与两个 DOM id（tab / panel 互指）。 */
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

/** 分段 tab：`role="tablist"` 里一排 `role="tab"` 按钮，选中态落在 `aria-selected`。 */
export function SegmentedTabs<Value extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: SegmentedTabsProps<Value>): ReactNode {
  return (
    <div role="tablist" aria-label={label} className={className}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          id={item.id}
          aria-selected={value === item.value}
          aria-controls={item.panelId}
          tabIndex={value === item.value ? 0 : -1}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

/** 菜单数据行：真包 `MenuEntry` 里 `MenuItem` 的切片。 */
export interface MenuItem {
  id: string
  label: ReactNode
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
}

/** 锚定菜单的 props 切片：只声明贡献方实际用到的字段。 */
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

/** 锚定下拉菜单：`open` 时渲染 `role="menu"` 的列表，点击行回调并请求收起。 */
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

/** 菜单项按钮的 props 切片（web-ux 删除入口用到的字段）。 */
export interface MenuItemButtonProps {
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  onSelect?: () => void
  children?: ReactNode
}

/** 菜单项按钮：`role="menuitem"` 的原生按钮。 */
export function MenuItemButton({ icon, danger, disabled, onSelect, children }: MenuItemButtonProps): ReactNode {
  return (
    <button
      type="button"
      role="menuitem"
      data-danger={danger === true ? 'true' : undefined}
      disabled={disabled}
      onClick={onSelect}
    >
      {icon}
      {children}
    </button>
  )
}

/** 下拉箭头（web-ux 工作区选择菜单 / stt 分组折叠）。 */
export function IconChevronDownOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="chevron-down" width={size} height={size} className={className} />
}

/** 右向箭头（stt 分组折叠）。 */
export function IconChevronRightOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="chevron-right" width={size} height={size} className={className} />
}

/** 刷新图标（stt 面板 / web-ux 迁移列表）。 */
export function IconRefreshOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="refresh" width={size} height={size} className={className} />
}

/** 滑杆图标（stt 会话头部入口）。 */
export function IconSlidersTwoOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="sliders-two" width={size} height={size} className={className} />
}

/** 垃圾桶图标（web-ux 删除行菜单）。 */
export function IconTrashOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="trash" width={size} height={size} className={className} />
}

/* mrfw 的 `src/compat/client-icons.ts` 在模块加载期按导出名探针取图标（0.1.7+ 的
 * Regular 命名），缺一个就 fail loud——组合矩阵导入它的浏览器半时这些名字必须存在。 */

/** 上箭头（mrfw 行排序）。 */
export function IconChevronUpOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="chevron-up" width={size} height={size} className={className} />
}

/** 复制图标（mrfw 复制路径）。 */
export function IconCopyOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="copy" width={size} height={size} className={className} />
}

/** 编辑图标（mrfw 重命名）。 */
export function IconEditOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="edit" width={size} height={size} className={className} />
}

/** 省略号图标（mrfw 行菜单触发）。 */
export function IconEllipsisOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="ellipsis" width={size} height={size} className={className} />
}

/** 关闭文件夹图标（mrfw 根状态）。 */
export function IconFolderCloseRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="folder-close" width={size} height={size} className={className} />
}

/** 打开文件夹图标（mrfw 主根行）。 */
export function IconFolderOpenOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="folder-open" width={size} height={size} className={className} />
}

/** 加号图标（mrfw 添加根）。 */
export function IconPlusOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="plus" width={size} height={size} className={className} />
}
