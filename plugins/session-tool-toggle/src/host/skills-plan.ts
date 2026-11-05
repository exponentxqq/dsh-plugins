/**
 * 技能遮蔽计划：把「本会话关了哪些技能」翻译成每 agent 技能分面需要的四样事实。
 *
 * 为什么与 `mask.ts` 的 `planMask` 分开：技能名不是工具注册名，`skill:<name>` 也永远不能
 * 进 `tools.restrict` 的 deny（`restrict` 对未知名字抛错）。两条流水线各自推导、互不
 * import，失败面也互不污染；技能名文法与工具名文法本来就是两套规则。
 *
 * 本模块是**纯函数、零 IO**：只静态 import 本目录的地址文法（与 `mask.ts` 同款），不
 * import 任何宿主模块、不读时钟、不抛错。关闭集里允许出现脏条目（损坏记录、旧版残留、
 * 手写错误）：只挑出 `parseAddress` 解析为 `kind === 'skill'` 的地址，其余静默跳过，与
 * `mask.ts` 的 `resolveAddresses` 是同一容忍纪律。
 *
 * 整档 `tool:skill` 的开关**不由本模块推导**：`toolSkillClosed` 是唯一依据，调用方按
 * `state.disabled.includes(SKILL_TOOL_ADDRESS)` 传入。关闭集里若还残留整档别名（裸
 * `skill`、`skill:*`、`tool:skill`），前两者在解析期就归一为 `tool:skill`，三者都不是
 * `kind:'skill'`，逐技能计划跳过即可——本模块不重复解析开关态。
 *
 * @module dsh-plugin-session-tool-toggle/host/skills-plan
 */

import { parseAddress } from './address.ts'

/** 整档地址的规范形：技能遮蔽在整档关闭时必须让位（diff-matrix A8）。 */
export const SKILL_TOOL_ADDRESS = 'tool:skill'

/** 技能地址不查保护名单（D15）：解析只需要文法，空集合即可。 */
const NO_PROTECTED_NAMES: ReadonlySet<string> = new Set()

/**
 * 技能遮蔽计划的入参。
 *
 * 三个字段都是调用方从状态与会话视图里取的只读快照，本模块不改动它们。
 */
export interface SkillsPlanInputs {
  /** 本会话关闭集（状态里的规范形文本，允许脏条目）。 */
  readonly disabled: readonly string[]
  /** 当前活技能名（模型可调用的技能清单；stub 生效后**不含**被遮蔽的名字）。 */
  readonly installed: readonly string[]
  /** 整档 `tool:skill` 是否在关闭集里。 */
  readonly toolSkillClosed: boolean
}

/**
 * 一轮技能遮蔽的完整计划。
 *
 * 四个输出都由关闭集与活清单推出，顺序稳定（排序去重）：分面的 diff 守卫靠集合相等做
 * 短路，顺序抖动会让「同一份状态」被误判成变化而自激。
 */
export interface SkillsPlan {
  /** 需要注册影子 stub 的技能名（排序去重；整档关闭时为空 —— 此时目录本就停发）。 */
  readonly shadowNames: readonly string[]
  /** 关闭集里的全部技能地址（规范形，排序）。 */
  readonly closedTexts: readonly string[]
  /** 每条技能地址是否命中活技能（0 或 1；0 也保留键，与 planMask 同纪律）。 */
  readonly matched: ReadonlyMap<string, number>
  /** 命中 0 的地址（意图已记录、当前无该技能）。 */
  readonly intentOnly: readonly string[]
}

/**
 * 算出一轮技能遮蔽计划。
 *
 * 推导写死（顺序即语义）：
 *
 * 1. 逐条解析 `disabled`（`parseAddress`，与 `mask.ts` 同一容忍纪律）：只保留
 *    `kind === 'skill'` 的地址，其余（空串、脏数据、`mcp:*` / `tool:*`、整档别名）
 *    **静默跳过**；同规范形文本重复只留一条，按文本排序；
 * 2. `shadowNames` = 整档关闭时为空，否则是全部关闭技能名（排序去重）——不在活清单里的
 *    名字也保留，由分面在取正文失败时留作意图；
 * 3. `matched[规范形文本]` = 该地址的技能名是否在 `installed` 里（**0 也保留键**）；
 * 4. `intentOnly` = `matched` 为 0 的规范形文本（排序）。
 *
 * 两条刻意的不变量：`toolSkillClosed` 是整档开关的唯一依据（本函数不扫描 `disabled` 里
 * 的 `tool:skill` 来推导开关态）；未知技能只是不命中，绝不抛错（C10 宽容）。
 *
 * @param inputs - 关闭集、活清单与整档开关。
 * @returns 排序后的 shadowNames / closedTexts / matched / intentOnly。
 */
export function planSkills(inputs: SkillsPlanInputs): SkillsPlan {
  const closed = closedSkillsOf(inputs.disabled)
  const installedNames = new Set(inputs.installed)

  const matched = new Map<string, number>()
  const intentOnly: string[] = []
  for (const entry of closed) {
    // 0 命中也写键：面板与命令面靠「键在、值 0」区分「已关但当前无该技能」与「没关」。
    const hits = installedNames.has(entry.name) ? 1 : 0
    matched.set(entry.text, hits)
    if (hits === 0) intentOnly.push(entry.text)
  }

  return {
    // 整档关闭时 `skill` 工具 schema 已被掩、目录本就停发，再注册 stub 只会白触发一轮
    // 缓存失效（A8），因此这里让位；重新打开后按关闭集恢复。
    shadowNames: inputs.toolSkillClosed ? [] : closed.map((entry) => entry.name),
    closedTexts: closed.map((entry) => entry.text),
    matched,
    intentOnly,
  }
}

/** 一条可用的技能关闭地址：规范形文本 + 解析出的技能名。 */
interface ClosedSkill {
  readonly text: string
  readonly name: string
}

/**
 * 把关闭集收成「规范形技能地址」，按文本去重、排序。
 *
 * 只认 `parseAddress` 解析出的 `kind === 'skill'`：裸 `skill` 与 `skill:*` 在解析期已
 * 归一为 `tool:skill`（与 `tool:skill` 同一形态），`mcp:*` / `tool:*` 属于工具面，脏
 * 条目解析失败——它们都不是逐技能地址，静默跳过。归一发生在解析出口，因此这里用
 * `parsed.text` 作键，同一意图的不同拼写不会各算一条。
 *
 * @param disabled - 关闭集原文（允许脏条目）。
 * @returns 排序去重后的技能地址；没有合规条目时为空数组。
 */
function closedSkillsOf(disabled: readonly string[]): readonly ClosedSkill[] {
  const byText = new Map<string, ClosedSkill>()
  for (const text of disabled) {
    const parsed = parseAddress(text, NO_PROTECTED_NAMES)
    if (!parsed.ok) continue
    if (parsed.address.kind !== 'skill') continue
    if (!byText.has(parsed.text)) {
      byText.set(parsed.text, { text: parsed.text, name: parsed.address.name })
    }
  }
  return Array.from(byText.values()).sort((left, right) => compareText(left.text, right.text))
}

/**
 * 文本比较（UTF-16 码元序，与 `mask.ts` / `state.ts` 同一约定）。
 *
 * 不用 `localeCompare`：排序结果必须与运行环境的 locale 无关，否则同一份关闭集在两个
 * 环境里排出不同顺序，分面的 diff 守卫就会把「同一个集合」误判成变化。
 * @param left - 一个文本。
 * @param right - 另一个文本。
 * @returns 负数 / 0 / 正数。
 */
function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
