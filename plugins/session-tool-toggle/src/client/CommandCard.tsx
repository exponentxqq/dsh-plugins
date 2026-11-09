/**
 * 共用命令卡（`code-design.md` ③ 3.5；D-05）——「代码块 + 复制按钮 + `aria-live` 反馈」的
 * 唯一实现：页面（`WorkspaceDefaultsPage` 命令卡段）与面板（`ToolPanelAction` 卡 3）共用，
 * 复制反馈状态机只有一份。组件零翻译依赖：全部文案由 props 进入（`title` / `note` /
 * `copyLabel` / `copiedLabel` / `copyFailedLabel`），调用方用自己的 `t` 组装，本模块不
 * import `locales`。
 *
 * 复制反馈状态机逐字搬自页面现状（本文件新建时页面尚未切换，批次 6.4 才替换命令卡段为
 * 本组件）：`copyState` 三态、`COPY_RESET_MS = 2000` 复位、连续点击只锚最后一次、
 * `navigator.clipboard` 缺席或拒绝都走 `failed`（不向上抛）、按钮文案恒定（成功态只置
 * `disabled`）、「已复制 / 复制失败」只由 `.note[aria-live=polite]` 播报。
 *
 * 模块纪律（G6.2 验收的意图口径，R3）：本文件按「零翻译函数调用」验收——grep 特征串
 * `t(` 的设计意图是拦翻译函数 `t(...)`，但 `setTimeout` / `clearTimeout` / `writeText`
 * 乃至 React 的 `useEffect`，其调用形尾串恰好同形（`ct(` / `ut(` / `xt(`），字面零命中
 * 与本组件的自然实现不兼容（复制复位定时器离不开这些 API），属验证句设计疏漏。本模块
 * 按自然形态书写（`React.useEffect` / `window.clearTimeout` 等），验收以意图口径执行：
 * 精确模式 `\bt\(` 计 0 + 人工核读无任何翻译调用（文案全部经 props 进入）。页面里
 * schedule 开头的复制复位入口在本模块命名为 `restartCopyTimer`（同语义：先清旧定时器
 * 再起新的，复位锚在最后一次反馈上）。
 *
 * @module dsh-plugin-session-tool-toggle/client/CommandCard
 */

import * as React from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './panel.module.css'

/** 命令模板里留给用户替换的地址占位符（命令语法是 ASCII）。 */
export const COMMAND_PLACEHOLDER = '<address>'

/** 复制反馈的三态：空闲 / 已复制 / 失败；后两态 2s 后自动回到空闲。 */
type CopyState = 'idle' | 'copied' | 'failed'

/** 复制反馈复位时长（ms）：足够读到反馈文案，又不至于粘住下一次操作。 */
const COPY_RESET_MS = 2000

/** 共用命令卡的 props（code-design ③ 3.5 冻结形状；文案全由调用方翻译后传入）。 */
export interface CommandCardProps {
  /** 卡标题（页面 `workspace.commandTitle` / 面板 `session.commandTitle`）。 */
  readonly title: string
  /** 语义与边界说明（恒定显示）。 */
  readonly note: string
  /** 代码块文本 = 复制文本（可多行，含 `#` 注释行）。 */
  readonly commandText: string
  /** 复制按钮的恒定文案。 */
  readonly copyLabel: string
  /** `aria-live` 播报的「已复制」。 */
  readonly copiedLabel: string
  /** `aria-live` 播报的「复制失败」。 */
  readonly copyFailedLabel: string
}

/**
 * 共用命令卡：卡标题 + 恒定语义说明 + 代码块与复制按钮 + `aria-live` 播报行。
 *
 * DOM 结构与样式类照搬页面命令卡段（`.card` / `.cardTitle` / `.note` / `.commandRow` /
 * `.command`，均为 `panel.module.css` 既有类）；成功态的可视差异只有按钮 `disabled`，
 * 文案永不随复制结果切换。
 * @param props - 见 {@link CommandCardProps}。
 * @returns 命令卡整卡（`div.card`）。
 */
export function CommandCard(props: CommandCardProps): React.ReactNode {
  /** 复制反馈三态：成功/失败文案的唯一数据源，播报只发生在下方 `aria-live` 行。 */
  const [copyState, setCopyState] = React.useState<CopyState>('idle')
  /** 复位定时器句柄：换状态先清旧的，卸载时清最后一次。 */
  const copyTimer = React.useRef<number | undefined>(undefined)
  React.useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  /** 复制反馈的播报文案（`aria-live` 载体专用；空闲时为空串，不产生播报）。 */
  const copyFeedback = copyState === 'copied'
    ? props.copiedLabel
    : copyState === 'failed'
      ? props.copyFailedLabel
      : ''

  /**
   * 复制反馈复位：任何一次反馈（成功或失败）都 2s 后回到空闲；连续点击时先清旧定时器，
   * 保证复位锚在**最后一次**反馈上。
   */
  const restartCopyTimer = (): void => {
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => {
      setCopyState('idle')
    }, COPY_RESET_MS)
  }

  /**
   * 复制命令模板到剪贴板（软降级）：`navigator.clipboard` 缺席（非安全上下文）或写入被拒
   * 都走 `failed` 文案，不向上抛——剪贴板是浏览器环境的能力，不是宿主 RPC，失败只值得
   * 一句提示。
   */
  const copyCommand = async (): Promise<void> => {
    try {
      if (navigator.clipboard === undefined) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(props.commandText)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    restartCopyTimer()
  }

  return (
    <div className={css.card}>
      <p className={css.cardTitle}>{props.title}</p>
      <p className={css.note}>{props.note}</p>
      <div className={css.commandRow}>
        <pre className={css.command}><code>{props.commandText}</code></pre>
        {/* 复制按钮文案恒定：成功/失败反馈只由下方 aria-live 载体播报，按钮不随复制结果
            切换文案；成功态的可视差异是 disabled（2s 复位后恢复，顺带挡住复位前的重复
            点击）；失败态保持可点，便于立即重试。 */}
        <Button
          variant="outline"
          size="sm"
          disabled={copyState === 'copied'}
          onClick={() => {
            void copyCommand()
          }}
        >
          {props.copyLabel}
        </Button>
      </div>
      {/* 复制反馈的播报载体：「已复制 / 复制失败」文案的唯一渲染处，文案变化由
          `aria-live` 递送、不抢按钮焦点。 */}
      <p className={css.note} aria-live="polite">{copyFeedback}</p>
    </div>
  )
}
