/**
 * 失败文案形状与映射的唯一实现点（设计 §3.5，任务 6.1）。
 *
 * 五件从 `ToolPanelAction.tsx` 原样迁入：失败形状 {@link PanelFailure}（定义源在
 * `DefaultsEditor.tsx`，`DefaultsEditor.tsx` 删除后本模块是唯一落点）、「失败码 → 文案键」
 * {@link errorKeyOf}、占位符取值 {@link failureParams}、「失败 → 两行文案」{@link failureOf}
 * 与渲染组件 {@link FailureRow}。`WorkspaceEntry.tsx` 等消费方不再从面板容器反向 import。
 *
 * 迁移期间 `ToolPanelAction.tsx` / `DefaultsEditor.tsx` 内的同名定义暂保留（第二波重写容器
 * 时改 import 消除），本模块不 import 它们，两处定义互不冲突。
 *
 * @module dsh-plugin-session-tool-toggle/client/panel-failure
 */

import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PanelError } from './panel-client.ts'
import { NS, zh, type Key } from './locales.ts'
import css from './panel.module.css'

/** 本模块消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
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

/**
 * 失败码 → 文案键（未知码回退 `error.fallback`）。
 *
 * 与 web-ux 的同名助手同一条规则：**不**在这里把不认识的码改写成 `internal`——保留原始码，
 * 界面按兜底文案渲染，排障时仍能看到宿主真正回了什么。
 * @param code - 稳定失败码（宿主 7 个 + 传输 2 个；未来新增的码也原样进来）。
 * @returns 本命名空间里的文案键。
 */
export function errorKeyOf(code: string): Key {
  const candidate = `error.${code}`
  return (candidate in zh ? candidate : 'error.fallback') as Key
}

/**
 * 从失败细节里取文案占位符的值。
 *
 * 只认 §2.3 表里带占位符的五类细节：`bad-address`（`{address}`）、`protected` / `reserved`
 * （`{names}`）、`defaults-unwritable` / `workspace-unwritable`（`{path}`）、
 * `workspace-unresolved`（`{subject}`）；其余码没有占位符，多传参数不会出现在文案里。
 * @param error - 一次面板调用失败。
 * @returns 插值参数；无结构化细节时是 `undefined`。
 */
export function failureParams(error: PanelError): Record<string, string> | undefined {
  const details = error.details
  if (details === undefined) return undefined
  if ('names' in details) return { names: details.names.join(', ') }
  if ('address' in details) return { address: details.address }
  if ('path' in details) return { path: details.path }
  if ('subject' in details) return { subject: details.subject }
  return undefined
}

/**
 * 把一次失败翻成可渲染的两行文案。
 * @param error - 失败（无错时 `undefined`）。
 * @param t - 翻译函数。
 * @returns 主文案 + 宿主兜底说明；无错时是 `undefined`。
 */
export function failureOf(error: PanelError | undefined, t: Translate): PanelFailure | undefined {
  if (error === undefined) return undefined
  const text = t(errorKeyOf(error.code), failureParams(error))
  return error.message === '' ? { text } : { text, detail: error.message }
}

/** 错误行的 props。 */
interface FailureRowProps {
  readonly failure: PanelFailure
  /** 额外的定位 class（不可用降级时用一块独立占位）。 */
  readonly className?: string | undefined
}

/**
 * 一条错误行：主文案（本地化）+ 宿主的兜底说明（灰字，不本地化）。
 * @param props - 已本地化的失败。
 * @returns 错误块。
 */
export function FailureRow({ failure, className }: FailureRowProps): ReactNode {
  return (
    <div className={className} role="alert">
      <p className={css.error}>{failure.text}</p>
      {failure.detail !== undefined && <p className={css.detail}>{failure.detail}</p>}
    </div>
  )
}
