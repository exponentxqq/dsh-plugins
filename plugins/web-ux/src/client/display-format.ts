/**
 * 会话管理分节的显示格式纯函数：短码、路径尾段与紧凑时间。
 *
 * 管理面行里的三类「展示形状」集中在这里（code-design ③.6）：
 *
 * - {@link shortCodeOf}：会话 id / 目录名的显示短码——只截断显示，不参与身份判定；
 * - {@link tailSegmentOf}：工作目录的尾段——行次行只显示目录名，全路径进悬停；
 * - {@link formatCompactTimestamp}：绝对时间的行内紧凑串与悬停全串——不用相对时间
 *   （「3 天前」会随时间漂移，管理面是批量处置场景，绝对时刻才是处置依据）。
 *
 * ## 纯度
 *
 * 零 React、零上游 import、零 node import：输入全是字符串与数字，输出全是字符串。
 * 会话管理模型（`session-manager-model.ts`）是唯一消费方，视图组件只读派生结果、
 * 不自行拼显示串。
 *
 * @module dsh-plugin-web-ux/client/display-format
 */

/** 短码长度：`session-`（8）+ 8 个十六进制字符。 */
export const SHORT_CODE_LENGTH = 16

/**
 * 显示用短码：超过 {@link SHORT_CODE_LENGTH} 才截断并补 `…`。只用于显示，不参与身份。
 * @param value - 会话 id / 目录名等原始串。
 * @returns 原串，或「前 {@link SHORT_CODE_LENGTH} 字符 + `…`」。
 */
export function shortCodeOf(value: string): string {
  return value.length > SHORT_CODE_LENGTH ? `${value.slice(0, SHORT_CODE_LENGTH)}…` : value
}

/**
 * 路径尾段（交互式目录展示）：去掉尾部分隔符后取最后一段。POSIX `/` 与 Win32 `\`
 * 都按分隔符处理——会话快照可能来自任一平台，展示层不做区分。
 * @param path - 会话工作目录全路径。
 * @returns 尾段；空串 / 只有分隔符 / undefined ⇒ null。
 */
export function tailSegmentOf(path: string | undefined): string | null {
  if (path === undefined) return null
  const trimmed = path.replace(/[\\/]+$/, '')
  if (trimmed === '') return null
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const segment = cut < 0 ? trimmed : trimmed.slice(cut + 1)
  return segment === '' ? null : segment
}

/** 一个时间的两副面孔：行内紧凑绝对串 + 悬停全串。 */
export interface CompactTimestamp {
  /** 当年 `MM-DD HH:mm`；跨年 `YYYY-MM-DD HH:mm`；不可解释的值 ⇒ `—`。 */
  readonly text: string
  /** `toLocaleString()` 全串（悬停用）；不可解释的值 ⇒ 空串。 */
  readonly full: string
}

/**
 * 紧凑绝对时间（不用相对时间）。`<= 0` / 非有限 / 构造不出的日期按「未知」处理。
 * @param epochMs - epoch 毫秒。
 * @param now - 「今年」的参照（测试注入；缺省 new Date()）。
 * @returns 紧凑串与悬停全串。
 */
export function formatCompactTimestamp(epochMs: number, now: Date = new Date()): CompactTimestamp {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return { text: '—', full: '' }
  const date = new Date(epochMs)
  if (Number.isNaN(date.getTime())) return { text: '—', full: '' }
  const pad = (value: number): string => String(value).padStart(2, '0')
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const text =
    date.getFullYear() === now.getFullYear()
      ? `${day} ${clock}`
      : `${date.getFullYear()}-${day} ${clock}`
  return { text, full: date.toLocaleString() }
}
