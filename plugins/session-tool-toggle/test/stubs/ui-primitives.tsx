/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的测试替身（照 `plugins/web-ux/test/stubs/ui-primitives.tsx` 扩展）。
 *
 * 真包是宿主自己的 bundle：发布产物里带裸 `.module.css` 导入与只有 web 壳能解析的宿主侧依赖
 * （anser、shiki 等），jsdom 套件加载不了那个 barrel。替身只保留本面板用到的 DOM 形状，于是
 * 用例断言的是「本插件把哪个开关放在哪一行、点击后发出什么请求」，视觉由浏览器里的真组件负责：
 *
 * - `Switch` 与真组件同形：`role="switch"` + `aria-checked` + `aria-label` + `title` + 原生
 *   `disabled`；`onClick` **无条件**回调 `onChange(!checked)`（真组件就是这样，见
 *   `@deepseek-ai/dsh-client-ui-primitives/lib/index.js` 的 `Switch`），锁定行不触发请求靠的是
 *   真实浏览器的 `disabled` 语义与组件自己的守卫——替身不替被测组件兜底。
 * - `Modal` 在 `open` 时把标题/正文/底栏 portal 到 body，`className` / `contentClassName`
 *   照真组件挂在卡片与滚动区上。
 * - `Button` / `Input` 透传原生属性（`aria-*`、`title`、`disabled`、`onChange` 等）：测的就是
 *   这些属性有没有被正确地放到按钮上。
 * - 图标是带 `data-icon` 的 svg 占位，不画路径。
 *
 * 经 `vitest.config.ts` 的 resolve.alias 生效（与 web-ux 同一模式）；运行时类型检查仍然对着
 * 真包的 `.d.ts`，所以替身不会掩盖 props 形状的漂移。
 *
 * @module stubs/ui-primitives
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** 最小 `IconProps` 镜像（真包的图标都是 16px 默认尺寸）。 */
interface IconProps {
  readonly size?: number
  readonly className?: string
}

/** 入口按钮的图标：滑杆（设计 §3.1 的首选图形）。 */
export function IconSlidersTwoOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="sliders-two" width={size} height={size} className={className} />
}

/** 面板底栏「刷新」的图标。 */
export function IconRefreshOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="refresh" width={size} height={size} className={className} />
}

/** 分组展开（折叠箭头朝下）。 */
export function IconChevronDownOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="chevron-down" width={size} height={size} className={className} />
}

/** 分组折叠（折叠箭头朝右）。 */
export function IconChevronRightOutlineRegular({ size = 16, className }: IconProps): ReactNode {
  return <svg data-icon="chevron-right" width={size} height={size} className={className} />
}

/** 按钮的 props 切片：真组件是 `ButtonHTMLAttributes` 透传，替身照此把原生属性铺到按钮上。 */
export type StubButtonProps = {
  variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
  size?: 'md' | 'sm'
  icon?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

/** 普通按钮：保留 variant / size 供用例断言视觉家族，其余原生属性原样透传。 */
export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  children,
  ...rest
}: StubButtonProps): ReactNode {
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

/** 文本输入：真组件是「外层 span 包原生 input」，`className` 落在 span 上（照抄）。 */
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

/**
 * 受控开关：`role="switch"` 的原生按钮，禁用靠原生 `disabled`。
 *
 * `onClick` 不判 `disabled`：真组件同样只把 `disabled` 交给浏览器（`lib/index.js` 的
 * `Switch`），"锁定行点击不发请求"必须由被测组件自己守住——替身若替它兜底，用例就测不到
 * 组件里的守卫了。
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
export interface StubModalProps {
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

/** 居中模态框：open 时把标题/正文/底栏 portal 到 body。 */
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
}: StubModalProps): ReactNode {
  if (!open) return null
  return createPortal(
    <div role="dialog" aria-label={title} data-modal="true" className={className}>
      {headless !== true && (
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label={closeLabel ?? 'close'} onClick={onClose}>×</button>
        </header>
      )}
      {description !== undefined && <p data-modal-description="true">{description}</p>}
      <div data-modal-body="true" className={contentClassName}>{children}</div>
      {footer !== undefined && <footer data-modal-footer="true">{footer}</footer>}
    </div>,
    document.body,
  )
}
