/**
 * 双语文案（zh / en locale 字典）一致性的**纯函数**检查。
 *
 * 各包的类型层已经用 `satisfies Record<Key, string>` 挡住编译期的缺键/多键；本函数是
 * 运行时的第二层兜底（例如有人把 `en` 的类型断言改宽），把原先在两个包的
 * `test/locale-parity.test.ts` 里逐字重复的四段逻辑收敛成一份：
 *
 * 1. **zh / en 键集合双向相等**——两个方向的差集都必须为空；
 * 2. **没有空文案**——两边的每个值都必须是非空字符串；
 * 3. **必读键都在**——调用方传入界面真正会读的键（保持字面量数组留在包内）；
 * 4. **占位符一致**——同一条文案的 zh / en `{param}` 集合必须相同（en 漏一个 `{path}`
 *    就是渲染出字面花括号的 bug）。
 *
 * **不 import vitest**：返回值是问题清单（空数组 = 一致），`expect(...).toEqual([])`
 * 这类断言留在各包测试里。这样「字面量直写」的纪律由调用点守住，本函数只做无分支的
 * 夹具计算。
 *
 * @module @dsh-plugins/test-kit/locale-parity
 */

/** 一致性检查的输入。 */
export interface LocaleParityInput<Key extends string = string> {
  /** 本包独占的 locale 命名空间（`src/client/locales.ts` 的 `NS`）。 */
  readonly ns: string
  /** 中文文案（canonical 形状）。 */
  readonly zh: Readonly<Record<Key, string>>
  /** 英文文案（形状必须与 zh 一致）。 */
  readonly en: Readonly<Record<Key, string>>
  /** 界面真正会读的键；缺一个就记一条 issue。 */
  readonly required?: readonly string[]
  /** 期望的命名空间字面量；缺省时不检查命名空间（该断言通常留在包内）。 */
  readonly expectedNs?: string
}

/**
 * 取一条文案里的 `{param}` 占位符名（排序去重，便于直接比较）。
 * @param text - 文案。
 * @returns 占位符名。
 */
function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string))].sort()
}

/**
 * 检查一份 zh / en 字典的一致性。
 *
 * 每条 issue 以稳定的类别前缀开头（`[namespace]` / `[keys]` / `[empty]` /
 * `[required]` / `[placeholders]`），调用方既能一次性断言「整份字典一致」
 * （`toEqual([])`），也能按类别聚焦断言（例如只关心占位符漂移的用例），
 * 失败信息不会互相污染。
 *
 * @param input - 命名空间、两份字典、必读键与期望命名空间。
 * @returns 问题清单（空数组表示一致）。
 */
export function localeParityIssues<Key extends string>({
  ns,
  zh,
  en,
  required = [],
  expectedNs,
}: LocaleParityInput<Key>): string[] {
  const issues: string[] = []

  if (expectedNs !== undefined && ns !== expectedNs) {
    issues.push(`[namespace] 命名空间是 ${JSON.stringify(ns)}，期望 ${JSON.stringify(expectedNs)}`)
  }

  const zhKeys = Object.keys(zh)
  const enKeys = Object.keys(en)
  const zhSet = new Set(zhKeys)
  const enSet = new Set(enKeys)

  for (const key of zhKeys) {
    if (!enSet.has(key)) issues.push(`[keys] en 缺少键 "${key}"`)
  }
  for (const key of enKeys) {
    if (!zhSet.has(key)) issues.push(`[keys] zh 缺少键 "${key}"`)
  }

  for (const [locale, texts] of [['zh', zh], ['en', en]] as const) {
    for (const [key, value] of Object.entries(texts) as Array<[string, string]>) {
      if (typeof value !== 'string' || value.trim() === '') {
        issues.push(`[empty] ${locale}.${key} 必须是非空字符串`)
      }
    }
  }

  for (const key of required) {
    if (!zhSet.has(key)) issues.push(`[required] zh 缺少必读键 "${key}"`)
    if (!enSet.has(key)) issues.push(`[required] en 缺少必读键 "${key}"`)
  }

  for (const key of zhKeys) {
    if (!enSet.has(key)) continue
    const zhSlots = placeholders(zh[key as Key])
    const enSlots = placeholders(en[key as Key])
    if (zhSlots.join('\u0000') !== enSlots.join('\u0000')) {
      issues.push(
        `[placeholders] en.${key} 的占位符 {${enSlots.join('}, {')}} 与 zh 不一致（{${zhSlots.join('}, {')}}）`,
      )
    }
  }

  return issues
}
