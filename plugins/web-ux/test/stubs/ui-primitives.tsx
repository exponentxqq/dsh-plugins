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

import type { ReactNode } from 'react'
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
