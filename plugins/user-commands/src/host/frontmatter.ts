/**
 * 命令文件的 frontmatter 解析与元数据提取。
 *
 * 一个 `.md` 文件的形状是：
 *
 * ```markdown
 * ---
 * description: 部署到预发
 * argument-hint: [环境]
 * ---
 * 请把 $ARGUMENTS 部署到预发环境，并在失败时给出日志片段。
 * ```
 *
 * `---` 块是 YAML，只有 `description`（说明）与 `argument-hint`（输入提示）两个字段被识别：
 * 未知字段记警告但**不跳过**（前向兼容）；已知字段类型不对按未识别处理（同样只警告）。
 * 真正让文件作废的是「YAML 不合法」——那种情况抛错，由发现层记为错误并跳过该文件，
 * 同目录其余命令不受影响。
 *
 * 解析是纯函数：警告以返回值交回调用方，调用方决定怎么打日志。
 * @module dsh-plugin-user-commands/host/frontmatter
 */

import { parse as parseYaml } from 'yaml'

/** 包围 frontmatter 的标记行。 */
const FENCE = '---'

/** 被识别的字段名。 */
const KNOWN_FIELDS = new Set(['description', 'argument-hint'])

/** 解析出来的元数据。 */
export interface CommandFrontmatter {
  /** 命令说明；缺省时由调用方回退（绝不读正文，避免 prompt 内容泄漏进发现菜单）。 */
  readonly description?: string
  /** 输入提示（`argument-hint` 的映射结果）。 */
  readonly hint?: string
}

/** 一个命令文件解析后的样子。 */
export interface CommandDocument {
  /** frontmatter 元数据（没有 frontmatter 时为空对象）。 */
  readonly frontmatter: CommandFrontmatter
  /** prompt 模板正文：frontmatter 之后的内容，已去除首尾空白。 */
  readonly body: string
}

/** 解析结果：文档本体 + 需要调用方转成警告的问题。 */
export interface ParsedCommandDocument {
  /** 解析出的文档。 */
  readonly document: CommandDocument
  /** 非致命问题（未知字段、类型不对的已知字段）。 */
  readonly warnings: readonly string[]
}

/** 切分 frontmatter 的结果。 */
interface FrontmatterSplit {
  /** `---` 块内部的 YAML 文本；没有 frontmatter 时为 undefined。 */
  readonly raw?: string
  /** 去掉 frontmatter 之后的正文（未 trim）。 */
  readonly body: string
}

/**
 * 切开文件开头的 `---` YAML 块。
 *
 * 只有「首行就是 `---` 且后面还有一条 `---` 收尾」才算 frontmatter：没有收尾的块按普通正文处理，
 * 这样一份恰好以水平分割线开头的 markdown 不会被误判成残缺 frontmatter。
 * @param text - 文件全文。
 * @returns 切分结果；`raw` 为 undefined 表示没有 frontmatter。
 */
export function splitFrontmatter(text: string): FrontmatterSplit {
  // 带 BOM 的文件（Windows 编辑器常见）首行会变成 `\ufeff---`，先剥掉。
  const normalized = text.startsWith('\ufeff') ? text.slice(1) : text
  const lines = normalized.split(/\r?\n/)
  if ((lines[0] ?? '').trim() !== FENCE) return { body: normalized }
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === FENCE) {
      return { raw: lines.slice(1, index).join('\n'), body: lines.slice(index + 1).join('\n') }
    }
  }
  return { body: normalized }
}

/**
 * 渲染 `argument-hint` 的值。
 *
 * 字符串直接用；列表也认——YAML 里 `argument-hint: [环境]` 本来就是一条列表（这是从
 * Claude Code 抄过来的常见写法），逐项转成文本后用 `[a, b]` 的形状还原成展示文案。
 * @param value - frontmatter 里的原值。
 * @returns 提示文本；类型不对时为 undefined。
 */
function renderArgumentHint(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return undefined
  const items: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') return undefined
    items.push(String(item).trim())
  }
  return items.length === 0 ? '' : `[${items.join(', ')}]`
}

/**
 * 解析一个命令文件。
 * @param text - 文件全文。
 * @returns 文档本体与非致命问题。
 * @throws frontmatter 不是合法 YAML，或不是一个字段映射时（调用方跳过该文件）。
 */
export function parseCommandDocument(text: string): ParsedCommandDocument {
  const split = splitFrontmatter(text)
  const body = split.body.trim()
  if (split.raw === undefined) return { document: { frontmatter: {}, body }, warnings: [] }

  let parsed: unknown
  try {
    parsed = parseYaml(split.raw)
  } catch (error) {
    throw new Error(`frontmatter 不是合法 YAML（${String(error)}）`)
  }
  // 空的 `---\n---` 块解析为 null：等同于没有元数据。
  if (parsed === null || parsed === undefined) return { document: { frontmatter: {}, body }, warnings: [] }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('frontmatter 必须是一个字段映射')
  }

  const warnings: string[] = []
  const frontmatter: { description?: string; hint?: string } = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!KNOWN_FIELDS.has(key)) {
      warnings.push(`frontmatter 字段 ${key} 未识别，已忽略`)
      continue
    }
    if (key === 'argument-hint') {
      const hint = renderArgumentHint(value)
      if (hint === undefined) {
        warnings.push('frontmatter 字段 argument-hint 不是字符串或字符串列表，已忽略')
        continue
      }
      if (hint !== '') frontmatter.hint = hint
      continue
    }
    if (typeof value !== 'string') {
      warnings.push(`frontmatter 字段 ${key} 不是字符串，已忽略`)
      continue
    }
    const trimmed = value.trim()
    if (trimmed !== '') frontmatter.description = trimmed
  }
  return { document: { frontmatter, body }, warnings }
}
