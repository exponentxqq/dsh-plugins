/**
 * 状态模型：会话级开关的整值状态、切换、自校验与日志重放折叠。
 *
 * 三条贯穿全文件的约定：
 *
 * - **只存规范形**：`disabled` / `snapshot` 里的每一条都是 {@link formatAddress} 的输出，
 *   因此状态可读、可比较、可重放。可解析但非规范形的条目（`mcp:a::*`、`skill` 这类文法
 *   别名）在自校验时归一为规范形——它们与规范形**语义完全相同**，所以归一不改变行为；
 *   真正不可解析的条目才丢弃。
 * - **纯函数、零 IO**：只静态 import 地址文法与类型，不 import 任何宿主模块；时间戳、
 *   诊断出口与存储都在调用方。因此每条规则都能在单测里直接断言，不需要拉起宿主。
 * - **无变化同引用**：{@link withToggled} 在关闭集没有实际变化时返回入参本身，下游
 *   （掩码重算、记录写入、投影 `apply`）可以靠 `===` 做零成本短路。
 *
 * 状态是**整值事件**（whole-value event rule）：一条记录永远写全量，所以读路径只需要
 * 最后一条有效记录，历史记录不参与折叠（D9/D10）。
 *
 * @module dsh-plugin-session-tool-toggle/host/state
 */

import { formatAddress, parseAddress, type SwitchAddress } from './address.ts'
import type { SessionEventLike, SessionToolState, SpecLog } from './types.ts'

/**
 * 状态类型的唯一出口。
 *
 * 定义处是 `types.ts`（宿主半全部 seam 类型的唯一来源），本模块只转出，避免出现第二份
 * 形状声明。
 */
export type { SessionToolState } from './types.ts'

/**
 * 本插件整值状态记录的 type：`appendPluginRecord(session, STATE_RECORD_TYPE, state)`。
 *
 * 文法由宿主校验：`@deepseek-ai/dsh-session` 的 `PLUGIN_RECORD_TYPE` 是
 * `/^plugin:[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/`（`dsh-session/lib/index.js`
 * 的 `PLUGIN_RECORD_TYPE` 常量）。本常量是合法值，单测把它钉住：改名会先在测试里红。
 */
export const STATE_RECORD_TYPE = 'plugin:session-tool-toggle/state'

/**
 * 冻结的空文本数组：空态与降级结果共用同一份，误改会在严格模式下抛错。
 *
 * `EMPTY_STATE` 是**唯一**的「什么都没有」取值，因此 `normalizeState` / `foldStatus` 的
 * 降级分支都能直接返回它（单测用 `toBe` 钉住这个身份）。
 */
const NO_TEXTS: readonly string[] = Object.freeze([])

/** 空保护名单：`normalizeState` 不校验保护名单（见该函数的说明）。 */
const NO_PROTECTED_NAMES: ReadonlySet<string> = new Set()

/**
 * 空态：空日志、新会话（播种前）、不可用载荷降级后的唯一取值。
 *
 * `seeded: false` 是「还没被一条日志记录建立」的唯一信号，装配层据此决定是否拍默认档
 * 快照（D9：新会话**一定**落一条快照记录，哪怕默认档为空）。
 */
export const EMPTY_STATE: SessionToolState = Object.freeze({
  version: 1,
  disabled: NO_TEXTS,
  snapshot: NO_TEXTS,
  seeded: false,
  updatedAt: 0,
} satisfies SessionToolState)

/**
 * 返回把 `address` 设为「开 / 关」后的新状态。
 *
 * 判定写死：
 *
 * - `on === false`（关闭）：规范形文本已在关闭集里 → **返回同一引用**；否则插入后重排
 *   （排序 + 去重），`snapshot` / `seeded` / `updatedAt` 原样带过去。
 * - `on === true`（开启）：不在关闭集里 → **返回同一引用**；否则只移除该项，其余顺序保持
 *   （移除本来就不会破坏排序）。
 *
 * `updatedAt` **不由本函数更新**：签名没有时钟参数，纯函数也不读 `Date.now()`——否则
 * 同样的输入两次调用会得到不同结果，「无变化返回同一引用」就失去意义，投影 `apply` 也
 * 无法靠 `===` 短路。时间戳由调用方在写入前打：`{ ...next, updatedAt: Date.now() }`，
 * `store.write` 是时间的唯一来源。
 *
 * 入参是内部类型 {@link SwitchAddress}，合法性由 `parseAddress` 在用户边界保证（文法、
 * 保留名、保护名单都在那里拒绝），本函数不再重复校验。
 *
 * @param state - 当前状态（上一次写入或投影里的整值）。
 * @param address - 要切换的地址。
 * @param on - `true` = 开启（从关闭集移除），`false` = 关闭（加入关闭集）。
 * @returns 变化后的新状态；关闭集没有实际变化时是入参本身（`===` 成立）。
 */
export function withToggled(
  state: SessionToolState,
  address: SwitchAddress,
  on: boolean,
): SessionToolState {
  const text = formatAddress(address)
  const alreadyDisabled = state.disabled.includes(text)

  if (on) {
    if (!alreadyDisabled) return state
    return { ...state, disabled: state.disabled.filter((item) => item !== text) }
  }

  if (alreadyDisabled) return state
  return { ...state, disabled: sortUnique([...state.disabled, text]) }
}

/**
 * 把一条记录载荷自校验成可用状态（owner 自校验：只信自己写过的形状）。
 *
 * 两档降级，语义互不重叠：
 *
 * - **字段级不可用**（载荷不是对象、`version` 不是 `1`、某字段类型不对）→ 整值不可用，
 *   返回 {@link EMPTY_STATE} 并 warn 一条。这里刻意不做「尽量修复」：整值记录本该是全量
 *   的，缺字段说明这条记录不是本插件写的（损坏 / 移植），猜出来的状态比空态更难排查。
 * - **条目级非法**（`disabled` / `snapshot` 的某一项不是字符串，或文法不合法）→ 只丢那
 *   一条，并按字段汇总成一条 warn；可解析但非规范形的条目归一为规范形（`mcp:a::*` →
 *   `mcp:a`、`skill` → `tool:skill`，语义不变），随后排序去重，把「已排序去重的规范形
 *   文本」这条不变量重新立起来。
 *
 * 保护名单**不在这里**生效：本函数没有名单参数（设计签名如此，`types.ts` 的
 * `SessionToolState` 也不携带名单）。用户边界由 `parseAddress` 拒绝，写入路径的双保险是
 * {@link parseDisabledTexts}；本函数只守文法与规范形。
 *
 * @param raw - 记录载荷（日志重放或投影快照里的 `unknown`）。
 * @param log - 诊断出口；丢弃 / 归一的诊断按字段汇总成一条，避免读路径重复刷屏。
 * @returns 自校验后的状态；字段级不可用时是 {@link EMPTY_STATE}。
 */
export function normalizeState(raw: unknown, log: SpecLog): SessionToolState {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return unusable(log, `载荷不是对象（收到 ${describeRaw(raw)}）`)
  }

  const record = raw as Record<string, unknown>
  if (record.version !== 1) {
    return unusable(log, `version 不是 1（收到 ${describeRaw(record.version)}）`)
  }
  if (!Array.isArray(record.disabled)) {
    return unusable(log, `disabled 不是数组（收到 ${describeRaw(record.disabled)}）`)
  }
  if (!Array.isArray(record.snapshot)) {
    return unusable(log, `snapshot 不是数组（收到 ${describeRaw(record.snapshot)}）`)
  }
  if (typeof record.seeded !== 'boolean') {
    return unusable(log, `seeded 不是布尔值（收到 ${describeRaw(record.seeded)}）`)
  }

  const updatedAt = record.updatedAt
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt < 0) {
    return unusable(log, `updatedAt 不是非负有限数（收到 ${describeRaw(updatedAt)}）`)
  }

  return {
    version: 1,
    disabled: adoptTexts(record.disabled, 'disabled', NO_PROTECTED_NAMES, log),
    snapshot: adoptTexts(record.snapshot, 'snapshot', NO_PROTECTED_NAMES, log),
    seeded: record.seeded,
    updatedAt,
  }
}

/**
 * 存储层双保险：把一份文本列表收成「可以写进状态的关闭集」。
 *
 * 与 {@link normalizeState} 同一条条目标尺（沿用 `parseAddress` 判定，**不新增文法**）：
 * 可解析的归一为规范形、不可解析的丢弃、命中 `protectedNames` 的丢弃，最后排序去重。
 *
 * 与 `normalizeState` 的差别只有两点，都是刻意的：
 *
 * - 保护名单在这里**才**生效——写入路径是唯一能拿到生效名单（基线 ∪ config 追加）的地方；
 * - 本函数没有 `log` 参数（设计签名如此），因此**静默**丢弃：调用方按长度差统计降级条数，
 *   需要告警时自己记一条。
 *
 * @param texts - 待校验的文本（状态里的 `disabled`，或即将写入的关闭集）。
 * @param protectedNames - 生效保护名单（`address.ts` 的 `PROTECTED_BASELINE` ∪ config 追加）。
 * @returns 规范化、排序、去重后的关闭集（新数组，不改入参）。
 */
export function parseDisabledTexts(
  texts: readonly string[],
  protectedNames: ReadonlySet<string>,
): readonly string[] {
  return inspectTexts(texts, protectedNames).kept
}

/**
 * 读路径的日志重放折叠：把一段已提交事件折成本会话状态。
 *
 * 判定与 `dsh-session` 的 `pluginRecordOf` 同构：只有 `type === STATE_RECORD_TYPE` **且**
 * `ignorable === true` 的事件算本插件的整值记录。记录是整值事件，所以**最后一条**就是
 * 当前状态，前面的记录只是历史——这也是 {@link normalizeState} 只对最后一条兜底的原因
 * （对历史记录逐条 normalize 会得出同一个结论，却多付一份开销）。
 *
 * 两条刻意的选择：
 *
 * - **不回退**：最后一条记录的载荷若损坏，`normalizeState` 会把它降级为空态，而**不会**
 *   回退到更早的记录。回退会让已经关掉的开关在 resume 后「复活」，比空态更难排查；整值
 *   语义下「最后一条就是全部」必须无条件成立。
 * - **空日志不告警**：新会话在播种前本来就没有记录，这里报 warn 只会制造噪声。
 *
 * 事件按**传入顺序**处理（`session.snapshotEvents()` 的契约就是 seq 顺序），不按 `seq`
 * 重排：折叠只需要「最后一个匹配项」，重排是多余的工作。
 *
 * @param events - 该会话的已提交事件（`session.snapshotEvents()` 的返回）。
 * @param log - 诊断出口；损坏载荷的 warn 由 {@link normalizeState} 发出。
 * @returns 最后一条有效记录规范化后的状态；没有本插件记录时是 {@link EMPTY_STATE}。
 */
export function foldStatus(events: readonly SessionEventLike[], log: SpecLog): SessionToolState {
  let latest: SessionEventLike | undefined
  for (const event of events) {
    if (event.type === STATE_RECORD_TYPE && event.ignorable === true) latest = event
  }
  return latest === undefined ? EMPTY_STATE : normalizeState(latest.data, log)
}

/** 文本列表的校验结果：只读报告，诊断由调用方决定怎么记。 */
interface TextInspection {
  /** 可写入状态的条目：已归一为规范形、排序、去重。 */
  readonly kept: readonly string[]
  /** 被丢弃的原文（非字符串 / 文法不合法 / 命中保护名单）。 */
  readonly dropped: readonly unknown[]
  /** 可解析但不是规范形的原文（已归一，仅供诊断）。 */
  readonly renormalized: readonly string[]
}

/**
 * 逐条校验文本（`normalizeState` 与 `parseDisabledTexts` 共用的唯一条目标尺）。
 *
 * @param texts - 待校验的文本。
 * @param protectedNames - 生效保护名单；空集合表示不校验名单。
 * @returns 归一后的保留项 + 丢弃项 + 归一前的原文。
 */
function inspectTexts(
  texts: readonly unknown[],
  protectedNames: ReadonlySet<string>,
): TextInspection {
  const kept: string[] = []
  const dropped: unknown[] = []
  const renormalized: string[] = []

  for (const text of texts) {
    // 类型收窄：存储层双保险面对的是任意 JSON，非字符串条目与文法错误同罪。
    if (typeof text !== 'string') {
      dropped.push(text)
      continue
    }
    const parsed = parseAddress(text, protectedNames)
    if (!parsed.ok) {
      dropped.push(text)
      continue
    }
    if (parsed.text !== text) renormalized.push(text)
    kept.push(parsed.text)
  }

  return { kept: sortUnique(kept), dropped, renormalized }
}

/**
 * 校验 + 记账：把条目级降级写成按字段汇总的一条 warn。
 *
 * 「逐条丢弃」在返回值里逐条生效，诊断上却按字段汇总——否则一份被写坏的整值记录会在每次
 * 读路径上刷出十几条同样的告警。
 *
 * @param texts - 待校验的文本。
 * @param field - 字段名（只用于诊断文案）。
 * @param protectedNames - 生效保护名单。
 * @param log - 诊断出口。
 * @returns 归一后的保留项。
 */
function adoptTexts(
  texts: readonly unknown[],
  field: string,
  protectedNames: ReadonlySet<string>,
  log: SpecLog,
): readonly string[] {
  const inspection = inspectTexts(texts, protectedNames)
  if (inspection.dropped.length > 0) {
    log.warn(
      `状态字段 ${field} 里有 ${inspection.dropped.length} 条条目不合法，已丢弃：${sampleOf(inspection.dropped)}`,
    )
  }
  if (inspection.renormalized.length > 0) {
    log.warn(
      `状态字段 ${field} 里有 ${inspection.renormalized.length} 条条目不是规范形，已归一：${sampleOf(inspection.renormalized)}`,
    )
  }
  return inspection.kept
}

/**
 * 字段级不可用的唯一出口：一条 warn + 空态。
 *
 * @param log - 诊断出口。
 * @param reason - 不可用的具体原因（哪个字段、收到了什么）。
 * @returns {@link EMPTY_STATE} 本身（身份可断言）。
 */
function unusable(log: SpecLog, reason: string): SessionToolState {
  log.warn(`状态记录不可用（${reason}），已按空态处理`)
  return EMPTY_STATE
}

/**
 * 排序 + 去重：状态里「已排序去重的规范形文本」这条不变量的唯一实现处。
 *
 * 用默认的 UTF-16 码元序（不是 `localeCompare`）：排序结果必须与运行环境的 locale 无关，
 * 否则同一份日志在两句机器上折出不同顺序，投影与日志重放就对不上了。
 *
 * @param texts - 文本列表。
 * @returns 新的排序去重数组。
 */
function sortUnique(texts: readonly string[]): readonly string[] {
  return Array.from(new Set(texts)).sort()
}

/**
 * 把一个 `unknown` 写成诊断里可读的短片段（不抛错，也不依赖序列化成功）。
 *
 * @param value - 任意值。
 * @returns `「mcp:a」` / `数字 42` / `null` / `对象` 这类片段。
 */
function describeRaw(value: unknown): string {
  if (typeof value === 'string') return `「${value}」`
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return '数组'
  if (typeof value === 'object') return '对象'
  if (typeof value === 'number') return `数字 ${String(value)}`
  return `${typeof value} ${String(value)}`
}

/**
 * 诊断清单：最多列 `limit` 条，超出部分折成计数（避免告警里贴整份损坏载荷）。
 *
 * @param values - 待展示的原文。
 * @param limit - 最多展示几条，默认 3。
 * @returns 逗号/顿号分隔的片段。
 */
function sampleOf(values: readonly unknown[], limit = 3): string {
  const shown = values.slice(0, limit).map(describeRaw).join('、')
  return values.length > limit ? `${shown} 等 ${values.length} 条` : shown
}
