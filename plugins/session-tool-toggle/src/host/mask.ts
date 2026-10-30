/**
 * 掩码计划：把「本会话关了什么」翻译成一次 `restrict` 需要的三样事实。
 *
 * 三读并集（照抄 `plugins/project-mcp/src/host/isolation.ts` 的原始实现，D10）是本模块的
 * 核心，三份读数各有不可替代的作用：
 *
 * - `catalog`：宿主全局层的注册名。插件自身 ctx 读，**不受**任何 agent 限制，因此被别的
 *   机制（如 project-mcp 的工作区隔离）掩掉的名字仍然算已知；
 * - `scoped`：该 agent 视角的名字。宿主部署里 MCP 行可能坐在 agent 平面上，全局层读不到，
 *   只看 catalog 会漏；
 * - `carried`：上一轮 deny 里仍然受管的名字。本插件上一轮的掩码会让名字从 `scoped` 消失，
 *   只看活读数会算出越来越小的集合，于是「掩上 → 抬掉 → 再掩上」地振荡。
 *
 * 由此得到两条硬约束：**deny 里只放读数里真实出现过的名字**（`restrict` 对未知名抛错），
 * 以及**服务器断线时只是不命中，绝不抛错**（C10 / 本变更 spec：保持意图、跳过执行）。
 *
 * 另一条与 D2 语义直接相关：`shadowServers` 只由 `mcp:<server>` 整组关闭产生。单工具与
 * 内置工具的关闭只摘 schema，**不**遮蔽 `mcp:<server>` 指令段——整组是「这台服务器整个
 * 从会话里消失」，单工具是「这台服务器只少一个工具」，两者的 section 处理必须不同。
 *
 * 本模块是纯函数、零 IO：只静态 import 地址文法，不 import 任何宿主模块，也不读时钟。因此
 * 每条规则都能在单测里直接断言，不需要拉起宿主或注册表。
 *
 * @module dsh-plugin-session-tool-toggle/host/mask
 */

import {
  PROTECTED_BASELINE,
  matchesToolName,
  parseAddress,
  type SwitchAddress,
} from './address.ts'

/**
 * 解析 `disabled` 用的保护名单：只用硬编码基线 {@link PROTECTED_BASELINE}。
 *
 * 为什么不是「生效名单（基线 ∪ `config.protectedTools`）」：本模块的签名按设计不带名单
 * 参数，而生效名单只有装配层拿得到。写路径的双保险（`state.ts` 的 `parseDisabledTexts`）
 * 已经用生效名单过滤过，本模块是**最后一道容忍**——它要保证损坏记录里的非法条目被静默
 * 跳过，而不是把一份被写坏的状态变成抛错。基线是硬边界（永不生效），所以必须在这里也
 * 拦住 `tool:bash`；配置追加项不是硬边界，漏到这里时退化为普通开关（可接受）。
 *
 * 常量只在 `address.ts` 定义一份（R7 裁定），本模块**不**再定义、也**不** re-export。
 */
const PROTECTED_NAMES: ReadonlySet<string> = new Set(PROTECTED_BASELINE)

/**
 * 推导 deny 用的三份读数 + 本会话关闭集。
 *
 * `disabled` 是状态里的原文（规范形），本模块对它只做**容忍解析**：不可解析的条目跳过，
 * 可解析但非规范形的先归一再用（`mcp:a::*` 等价于 `mcp:a`）。调用方不需要先清洗。
 */
export interface MaskInputs {
  /** 宿主全局层名字（插件自身 ctx 读，**不受**任何 agent 限制）。 */
  readonly catalog: readonly string[]
  /** 该 agent 视角名字（`tools.schemas(agent)`；本插件上一轮的掩码已生效 → 会缺名字）。 */
  readonly scoped: readonly string[]
  /** 上一轮 deny 里仍然受管的名字（否则第二读会缩小 → 掩码被抬掉，振荡）。 */
  readonly carried: readonly string[]
  /** 本会话关闭集（`state.disabled` 的规范形文本）。 */
  readonly disabled: readonly string[]
}

/**
 * 一次 `restrict` + section 遮蔽的完整计划。
 *
 * 两个集合都保证**排序**：稳定顺序是 diff 守卫的前提——`restrict` 自己会触发
 * `tools/change`，一次重算若产出顺序不同的「同一个集合」，diff 守卫就会误判成变化而自激。
 */
export interface MaskPlan {
  /** 要掩掉的注册名（已排序去重；只含读数里真实存在的名字）。 */
  readonly deny: readonly string[]
  /** 需要遮蔽 `mcp:<server>` 指令段的服务器（已排序去重；只由 mcp-group 产生）。 */
  readonly shadowServers: readonly string[]
  /** 每个关闭地址命中的注册名数（键是规范形文本；0 = 当前无匹配，回执用它做两态区分）。 */
  readonly matched: ReadonlyMap<string, number>
}

/**
 * 算出一轮掩码计划。
 *
 * 推导写死（顺序即语义）：
 *
 * 1. `candidates` = 三读并集（`catalog` ∪ `scoped` ∪ `carried`，去重）；
 * 2. 逐条解析 `disabled`：不可解析的**跳过**（状态层已过滤，这里是最后一道容忍，不抛错）；
 *    可解析的按规范形文本去重、按文本排序（`matched` 的键序因此与入参顺序无关）；
 * 3. `deny` = 被任一地址命中的候选名，排序；
 * 4. `shadowServers` = 关闭地址里 `kind === 'mcp-group'` 的 server，排序去重；
 * 5. `matched[规范形文本]` = 该地址命中的候选名数（**0 也保留键**）。
 *
 * 三条刻意的不变量：`deny` 绝不包含读数里没出现过的名字（`restrict` 会因此抛错）；未知
 * serverName / 工具名只是不命中（C10）；`disabled` 里出现保护基线或保留名时静默跳过，
 * 拒绝发生在解析期（用户边界），不在这里。
 *
 * @param inputs - 三份读数 + 本会话关闭集。
 * @returns 排序后的 deny / shadowServers 与每地址命中数。
 */
export function planMask(inputs: MaskInputs): MaskPlan {
  const candidates = unionNames(inputs)
  const addresses = resolveAddresses(inputs.disabled)

  const matched = new Map<string, number>()
  const hitNames = new Set<string>()

  for (const entry of addresses) {
    let hits = 0
    for (const name of candidates) {
      if (!matchesToolName(entry.address, name)) continue
      hits += 1
      hitNames.add(name)
    }
    // 0 命中也写键：命令面与面板靠「键在、值 0」区分「已关但当前无匹配」与「没关」。
    matched.set(entry.text, hits)
  }

  return {
    deny: Array.from(hitNames).sort(),
    shadowServers: shadowServersOf(addresses),
    matched,
  }
}

/**
 * 一次工具调用被拒的理由，或 undefined 表示放行。
 *
 * 供 session 层的 guard 在**每次调用**时读取实时关闭集（guard 只装一次，闭包读最新值）：
 * 这里重新解析一遍 `disabled`，因此 `restrict` 与 guard 之间不存在需要同步的缓存，也就
 * 不存在「掩码已抬掉、guard 还拦着」或反过来的窗口。
 *
 * 理由必须是简体中文可读文案，并且同时给出**工具名**与**命中的地址**：用户要判断是整组
 * 被关还是单工具被关，唯一的依据就是这两个字段；恢复入口固定是 `/tools on <地址>`。
 *
 * 容错与 {@link planMask} 一致：不可解析的条目跳过、未知名字只是不命中，绝不抛错——
 * 守卫的返回值只有「理由」与「放行」两态，抛错会让一次工具调用变成不可解释的失败。
 *
 * @param toolName - 被调用的注册名（MCP public name 或内置工具名）。
 * @param disabled - 本会话关闭集（状态里的规范形文本，允许脏条目）。
 * @returns 拒绝理由；未被任何关闭地址命中时为 undefined。
 */
export function guardReason(toolName: string, disabled: readonly string[]): string | undefined {
  for (const entry of resolveAddresses(disabled)) {
    if (!matchesToolName(entry.address, toolName)) continue
    return `工具「${toolName}」已在本会话被「${entry.text}」关闭，调用被拒绝；恢复请执行 /tools on ${entry.text}`
  }
  return undefined
}

/** 一条解析成功的关闭地址：规范形文本 + 地址（文本是 `matched` 的键）。 */
interface ResolvedAddress {
  readonly address: SwitchAddress
  readonly text: string
}

/**
 * 三读并集：同一名字无论在几份读数里出现都只算一次。
 *
 * 用 `Set` 而不是「先判 includes 再 push」：三份读数可能有几十上百个 MCP 名字，去重是
 * 本函数唯一要做的事，集合语义比手写循环更难写错。
 * @param inputs - 三份读数。
 * @returns 去重后的候选名（顺序为 catalog → scoped → carried 的首次出现序，仅供遍历）。
 */
function unionNames(inputs: MaskInputs): readonly string[] {
  return Array.from(new Set([...inputs.catalog, ...inputs.scoped, ...inputs.carried]))
}

/**
 * 把关闭集文本解析成地址，按规范形去重、按规范形排序。
 *
 * 归一发生在解析出口（`parseAddress` 返回的 `text` 一律是 `formatAddress` 的输出），所以
 * `mcp:a` / `mcp:a::*` 这类同一意图的两种拼写只会留下一条；重复条目也只命中一次计数。
 * 不可解析的条目（空串、错前缀、保护基线、保留名、损坏记录里的任意垃圾）**静默跳过**：
 * 这是最后一道容忍，不是用户边界，抛错只会让一个坏条目拖垮整轮掩码。
 * @param disabled - 关闭集原文。
 * @returns 排序去重后的地址；全部不可解析时为空数组。
 */
function resolveAddresses(disabled: readonly string[]): readonly ResolvedAddress[] {
  const byText = new Map<string, ResolvedAddress>()
  for (const text of disabled) {
    const parsed = parseAddress(text, PROTECTED_NAMES)
    if (!parsed.ok) continue
    if (!byText.has(parsed.text)) {
      byText.set(parsed.text, { address: parsed.address, text: parsed.text })
    }
  }
  return Array.from(byText.values()).sort((left, right) => compareText(left.text, right.text))
}

/**
 * 该遮蔽哪些 `mcp:<server>` 指令段。
 *
 * 只认整组（`kind === 'mcp-group'`）：单工具关闭（`mcp:a::x`）与内置工具关闭（`tool:x`）
 * 一律**不**产生遮蔽段。遮蔽段与服务是否在线无关——服务器断线时计划里仍然留着它（「保持
 * 意图」），空段在 system-prompt 渲染期本来就会被丢弃。
 * @param addresses - 已解析关闭地址。
 * @returns 排序去重的 server 名。
 */
function shadowServersOf(addresses: readonly ResolvedAddress[]): readonly string[] {
  const servers = new Set<string>()
  for (const entry of addresses) {
    if (entry.address.kind === 'mcp-group') servers.add(entry.address.server)
  }
  return Array.from(servers).sort()
}

/**
 * 文本比较（UTF-16 码元序，与 `state.ts` 的 `sortUnique` 同一约定）。
 *
 * 不用 `localeCompare`：排序结果必须与运行环境的 locale 无关，否则同一份关闭集在两个环境
 * 里排出不同顺序，diff 守卫就会把「同一个集合」误判成变化。
 * @param left - 一个文本。
 * @param right - 另一个文本。
 * @returns 负数 / 0 / 正数。
 */
function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
