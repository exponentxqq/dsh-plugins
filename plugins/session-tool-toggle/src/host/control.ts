/**
 * 控制内核：`/tools` 命令面与 Web RPC 的**唯一用例内核**（设计 D14）。
 *
 * 本模块只收四件事：读面板（{@link readPanel}）、本会话开关（{@link toggleSession}）、
 * 回到创建时快照（{@link resetSession}）、写用户级默认档（{@link updateDefaults}）。
 * 命令面（`commands.ts`）与 Web RPC（`rpc.ts`，任务 9.5）都只通过这四张脸改状态，
 * 因此「同一会话只有一条写入路径」是**类型层面**的事实而不是约定：命令面拿到的依赖就是
 * {@link ControlDeps}，没有第二个 `StateStore` 入口（任务 9.1 的架构支点）。
 *
 * 三条写死的规则：
 *
 * 1. **全有或全无校验**（设计 ③.7）：保护名单、保留名、地址文法在 {@link parseAddresses}
 *    里**一次判完**；任何一条不合法就整单拒绝，`store.write` 一次都不发生——多地址命令
 *    绝不留下「一半生效」的不可解释状态（面板的批量开关也走同一条路径）。
 * 2. **固定顺序**（任务 9.1 的裁定）：`withToggled`（纯函数，无变化返回**同一引用**）→
 *    `store.write` → `layer.setState` → 组装回执。先落状态再改掩码：写失败时掩码不动，
 *    不会出现「记录说关了、层还开着」的窗口。两步写失败都不让命令失败，回执里用
 *    `persistFailed` / `layerFailed` 说明代价（命令面据此补提示行）。
 * 3. **回执只报事实**：`matched` 命中数（0 也保留）、`changed`（关闭集变没变）、
 *    `schemaChanged`（**已生效的 deny** 变没变——唯一决定前缀缓存重建的判据）、可见计数
 *    与写入后的整值状态。文案拼装与 markdown 全部留在命令面，本模块不认识斜杠命令。
 *
 * 零 Cordis 依赖：本模块只认 {@link ControlDeps} 这组端口，因此每条规则都能用假端口在
 * 单测里直接驱动（`test/control.test.ts`），不需要拉起宿主。
 *
 * @module dsh-plugin-session-tool-toggle/host/control
 */

import { parseAddress, type SwitchAddress } from './address.ts'
import { readDefaults, writeDefaults } from './defaults.ts'
import { planMask } from './mask.ts'
import { parseDisabledTexts, withToggled } from './state.ts'
import type {
  ControlDeps,
  DefaultsFile,
  LayerHandle,
  LayerSnapshot,
  SessionLike,
  SessionToolState,
  SpecLog,
  StoreKind,
} from './types.ts'

/**
 * 命令文法一行（`/tools` 的 `input.hint` 与所有错误回执共用）。
 *
 * 与设计 ③.7 的表逐项对应：`status` 缺省、`off`/`on` 接地址、`reset` 回快照、
 * `default` 只看或写默认档。
 *
 * 常量放在内核里（而不是命令面）的理由：**地址校验的拒绝回执由内核生成**（见
 * {@link parseAddresses}），回执末尾必须带这一行命令文法；命令面从本模块 import 后既
 * 用作 `input.hint`，也 re-export 给既有消费者（任务 7.1 的测试从命令面取它）。
 */
export const TOOLS_GRAMMAR =
  'status | off <地址…> | on <地址…> | reset | default [off|on|set|reset] <地址…>'

/** MCP public name 前缀：`mcp__<serverName>__<rawName>`（与 `address.ts` 同一命名契约）。 */
const MCP_PUBLIC_PREFIX = 'mcp__'

/** public name 里 serverName 与工具名的分隔符。 */
const MCP_PUBLIC_SEPARATOR = '__'

/** 默认档子命令：只允许这四种写动作（另有不带子命令的只读形态，属命令面）。 */
export type DefaultsMode = 'off' | 'on' | 'set' | 'reset'

// ---------------------------------------------------------------------------
// 用例回执的形状（命令面拼文案 / RPC 映射失败码的唯一输入）
// ---------------------------------------------------------------------------

/**
 * 内核结果：**业务拒绝是值，不抛错**（命令面据此给 `{kind:'error'}`）。
 *
 * 唯一的例外是写盘失败：`updateDefaults` 把 `writeDefaults` 的抛错**原样向上抛**
 * （R14：RPC 侧据此映射 `defaults-unwritable`，`details` 带 `{path, reason}`）；
 * 命令面在自己那一层把它转成「默认档写入失败」回执，行为与 7.1 逐字相同。
 */
export type ControlOutcome<T> =
  | { readonly ok: true; readonly report: T }
  | { readonly ok: false; readonly text: string }

/** 一条地址的业务回执事实（命令面据此拼一行）。 */
export interface ToggleEntryReport {
  /** 规范形文本（`formatAddress` 的输出）。 */
  readonly text: string
  /** 地址类别（`mcp-group` 才带 `+ 1 段服务器指令`）。 */
  readonly kind: SwitchAddress['kind']
  /** 该地址在活读数里命中的工具定义数（0 = 当前无匹配，仍算「已记录」）。 */
  readonly matched: number
  /** 命令执行前该地址是否已在关闭集里。 */
  readonly wasDisabled: boolean
  /** 本次是否真的改变了该条。 */
  readonly changed: boolean
}

/** `off` / `on` 的完整回执事实。 */
export interface ToggleReport {
  readonly entries: readonly ToggleEntryReport[]
  /** 关闭集是否真的变了（无变化时不会写状态，也不重装掩码）。 */
  readonly changed: boolean
  /**
   * 已生效的 deny 集合是否变了——**唯一**决定「前缀缓存要不要重建」的事实。
   *
   * 与 `changed` 分开是刻意的：`/tools off mcp:zzz` 会改变关闭集（意图被记录），但活读数
   * 里没有任何工具进出模型请求，缓存不该重建；反过来重复关闭同一地址两者都不变。
   */
  readonly schemaChanged: boolean
  /** 命令执行前该 agent 视角的可见工具数。 */
  readonly visibleBefore: number
  /** 命令执行后该 agent 视角的可见工具数（层未就绪时等于 before）。 */
  readonly visibleAfter: number
  /** 可见计数是否可信（false = 会话层未就绪）。 */
  readonly visibleKnown: boolean
  /** 写入后的整值状态（无变化时是入参状态本身）。 */
  readonly state: SessionToolState
  /** 状态写会话日志失败（已降级内存态，命令仍算成功）。 */
  readonly persistFailed: boolean
  /** `layer.setState` 抛错（掩码未更新，守卫仍在拦）。 */
  readonly layerFailed: boolean
}

/** `/tools reset` 的完整回执事实。 */
export interface ResetReport {
  /** 变化项数（当前关闭集与快照的对称差，R15 ③）。 */
  readonly changedCount: number
  readonly changed: boolean
  /** 已生效的 deny 集合是否变了（`/tools reset` 的缓存重建判据）。 */
  readonly schemaChanged: boolean
  /** 创建时快照（`disabled` 的干净副本）。 */
  readonly snapshot: readonly string[]
  readonly visibleBefore: number
  readonly visibleAfter: number
  readonly visibleKnown: boolean
  readonly state: SessionToolState
  readonly persistFailed: boolean
  readonly layerFailed: boolean
}

/** 一个 MCP 服务器在「可关对象」里的分组计数。 */
export interface ServerGroupCount {
  /** serverName（`mcp__<server>__…` 的首段）。 */
  readonly server: string
  /** 分组地址（`mcp:<server>`），命令面直接展示它。 */
  readonly address: string
  /** 该服务器当前注册的工具定义数。 */
  readonly count: number
}

/** 一条已关闭地址的读数（`/tools status` 的两态区分就靠它）。 */
export interface ClosedAddressReading {
  readonly text: string
  readonly kind: SwitchAddress['kind']
  /** 命中数：> 0 = 已关闭；0 = 已记录但当前无注册工具匹配。 */
  readonly matched: number
  /** 整组关闭且该服务器的指令段确实被遮蔽。 */
  readonly shadowed: boolean
}

/** `/tools status` 与 `default` 共用的一份只读读数（三读并集 + 默认档 + 保护名单）。 */
export interface PanelReading {
  readonly state: SessionToolState
  readonly storeKind: StoreKind
  /** 该会话是否在宿主里活着（有层句柄）。 */
  readonly layerReady: boolean
  /** 该 agent 视角当前可见的工具数（层未就绪时不可信）。 */
  readonly visible: number
  /** 已**生效**的 deny 集合（不是计划值；restrict 失败时这里是真相）。 */
  readonly appliedDeny: readonly string[]
  /** 已装上的遮蔽段服务器。 */
  readonly appliedShadowServers: readonly string[]
  /** 全局层注册名（未掩码）。 */
  readonly catalog: readonly string[]
  /** 该 agent 视角名字（本插件上一轮掩码已生效 → 缺名字）。 */
  readonly scoped: readonly string[]
  /** 默认档当前内容。 */
  readonly defaults: DefaultsFile
  /** 默认档文件绝对路径（展示用，便于用户直接去改）。 */
  readonly defaultsPath: string
  /** 生效保护名单（排序后的文本）。 */
  readonly protectedNames: readonly string[]
  /** 可关对象按 MCP 服务器分组计数（按 server 名排序）。 */
  readonly serverGroups: readonly ServerGroupCount[]
  /** 可关对象里的内置工具名（排序）。 */
  readonly builtinNames: readonly string[]
  /** 内置工具里命中保护名单的名字（排序）。 */
  readonly builtinProtectedNames: readonly string[]
  /**
   * 全局层有、本会话不可见的名字（`catalog \ (scoped ∪ carried)`，按名排序；R18）。
   *
   * `carried` 是本插件已生效的掩码：它造成的「看不见」由用户自己的开关决定，不算「被其他
   * 作用域隐藏」——否则面板会把这一行的开关禁用，用户就打不开自己关掉的工具。
   */
  readonly hiddenByOthers: readonly string[]
  /** 每条关闭地址命中的工具定义数（键是规范形文本；0 也保留键，两态区分据此）。 */
  readonly matched: ReadonlyMap<string, number>
  /** 每一条关闭地址的读数（按 `state.disabled` 顺序）。 */
  readonly closed: readonly ClosedAddressReading[]
  /** 会话创建时间（epoch ms），用来给「快照来源」配时间。 */
  readonly createdAt: number
}

/** `default off|on|set|reset` 的回执事实。 */
export interface DefaultsWriteReport {
  readonly mode: DefaultsMode
  /** 默认档文件绝对路径。 */
  readonly path: string
  readonly before: DefaultsFile
  readonly after: DefaultsFile
  /** 本次新增的条目（规范形）。 */
  readonly added: readonly string[]
  /** 本次移除的条目（规范形）。 */
  readonly removed: readonly string[]
}

// ---------------------------------------------------------------------------
// 四个用例（唯一写入路径；顺序即语义）
// ---------------------------------------------------------------------------

/**
 * 本会话开关（`off` / `on` 的唯一写入路径）。
 *
 * 顺序写死（任务 9.1 的裁定）：**全有或全无校验 → `withToggled` → `store.write` →
 * `layer.setState` → 组装回执**。无变化时两步写入都跳过（`withToggled` 返回同引用，靠
 * `===` 短路），回执里的 `state` 就是入参状态本身（同一对象）。
 *
 * 两处失败都不让命令失败：
 * - `store.write` 抛错 → `persistFailed`（记录通道已自行降级内存态，命令面只补一句提示）；
 * - `layer.setState` 抛错 → `layerFailed`（守卫仍在拦，下一次 `tools/change` 会收敛）。
 *
 * @param deps - 控制端口（含全局层读数 `catalog`）。
 * @param session - 目标会话（命令面的 `agent.session`，RPC 侧按 sessionId 解析）。
 * @param texts - 用户地址原文（未解析）。
 * @param on - true = 开启，false = 关闭。
 * @returns 成功时的完整回执事实，或校验失败的回执文案。
 */
export function toggleSession(
  deps: ControlDeps,
  session: SessionLike,
  texts: readonly string[],
  on: boolean,
): ControlOutcome<ToggleReport> {
  // ① 全有或全无校验：保护 / 保留名 / 文法一次判完，任何一条失败都不落盘。
  const parsed = parseAddresses(texts, deps.protectedNames)
  if (!parsed.ok) return { ok: false, text: parsed.message }

  const stateBefore = deps.store.read(session)
  const layer = layerOf(deps, session)
  const catalog = catalogOf(deps)
  const before = snapshotOf(layer, deps.log)
  const visibleBefore = before.visible.length

  // 匹配计数：planMask 的 matched 只含入参 disabled 的键，因此把本次涉及的地址整份传进去，
  // 不依赖它们此刻是否真的在关闭集里（`on` 的地址通常已经不在）。
  const plan = planMask({
    catalog,
    scoped: before.visible,
    carried: before.deny,
    disabled: parsed.entries.map((entry) => entry.text),
  })

  // ② withToggled：纯函数，无变化时返回入参状态本身（下面的 `!==` 因此等价于「关闭集变了」）。
  let next = stateBefore
  for (const entry of parsed.entries) next = withToggled(next, entry.address, on)
  const changed = next !== stateBefore

  let persistFailed = false
  let layerFailed = false
  let written = stateBefore

  if (changed) {
    // ③ store.write：updatedAt 只由写入点打（withToggled 是纯函数，不读时钟）。
    written = { ...next, updatedAt: Date.now() }
    try {
      deps.store.write(session, written)
    } catch (error) {
      persistFailed = true
      deps.log.error(`无法写入会话状态（已降级内存态）：${messageOf(error)}`)
    }
    // ④ layer.setState：只在状态真的变了之后才改掩码。
    if (layer !== undefined) {
      try {
        layer.setState(written)
      } catch (error) {
        layerFailed = true
        deps.log.error(`无法更新本会话掩码（守卫仍在拦，下一次 tools/change 会收敛）：${messageOf(error)}`)
      }
    }
  }

  // ⑤ 组装回执：after 是「已生效的层事实」，不是计划值。
  const after = changed ? snapshotOf(layer, deps.log) : before

  const entries: ToggleEntryReport[] = parsed.entries.map((entry) => ({
    text: entry.text,
    kind: entry.address.kind,
    matched: plan.matched.get(entry.text) ?? 0,
    wasDisabled: stateBefore.disabled.includes(entry.text),
    changed: on ? stateBefore.disabled.includes(entry.text) : !stateBefore.disabled.includes(entry.text),
  }))

  return {
    ok: true,
    report: {
      entries,
      changed,
      // 缓存重建只由「已生效的 deny 集合是否变化」决定：宽容记录的 0 匹配地址不算。
      schemaChanged: !sameTexts(before.deny, after.deny),
      visibleBefore,
      visibleAfter: after.visible.length,
      visibleKnown: layer !== undefined,
      state: written,
      persistFailed,
      layerFailed,
    },
  }
}

/**
 * 回到创建时快照（`/tools reset` 的唯一写入路径）。
 *
 * `snapshot` 是会话创建时从默认档拍下的关闭集；reset 把它设为当前关闭集，因此
 * 「空快照」等价于「全部打开」——这正是「回到我建这个会话时的样子」的准确表达（D9）。
 *
 * 顺序与 {@link toggleSession} 相同：`store.write` → `layer.setState`；无变化（当前关闭集
 * 与快照逐项相同）时两步都跳过，`state` 是入参状态本身（同一对象）。
 *
 * @param deps - 控制端口。
 * @param session - 目标会话。
 * @returns 完整回执事实（reset 不需要校验，因此没有失败分支）。
 */
export function resetSession(deps: ControlDeps, session: SessionLike): ResetReport {
  const stateBefore = deps.store.read(session)
  const layer = layerOf(deps, session)
  const before = snapshotOf(layer, deps.log)
  const visibleBefore = before.visible.length

  // 快照是写入路径的产物，这里仍按同一套条目标尺清洗一次（损坏记录的最后一道容忍）。
  const snapshot = parseDisabledTexts(stateBefore.snapshot, deps.protectedNames)
  const changed = !sameTexts(stateBefore.disabled, snapshot)

  let persistFailed = false
  let layerFailed = false
  let written = stateBefore

  if (changed) {
    written = { ...stateBefore, disabled: snapshot, updatedAt: Date.now() }
    try {
      deps.store.write(session, written)
    } catch (error) {
      persistFailed = true
      deps.log.error(`无法写入会话状态（已降级内存态）：${messageOf(error)}`)
    }
    if (layer !== undefined) {
      try {
        layer.setState(written)
      } catch (error) {
        layerFailed = true
        deps.log.error(`无法更新本会话掩码（守卫仍在拦，下一次 tools/change 会收敛）：${messageOf(error)}`)
      }
    }
  }

  const after = changed ? snapshotOf(layer, deps.log) : before

  return {
    changedCount: symmetricDifference(stateBefore.disabled, snapshot),
    changed,
    schemaChanged: !sameTexts(before.deny, after.deny),
    snapshot,
    visibleBefore,
    visibleAfter: after.visible.length,
    visibleKnown: layer !== undefined,
    state: written,
    persistFailed,
    layerFailed,
  }
}

/**
 * 汇总 `/tools status`（以及 `default` 只读形态）需要的全部读数。
 *
 * 三读并集照抄掩码引擎：`catalog`（全局层）+ `scoped`（本 agent 视角）+
 * `appliedDeny`（已生效的掩码，防第二读缩小）→ `planMask`。分组、命中计数、两态区分、
 * 保护名单与「被其他作用域隐藏」都由这一份读数推出，因此面板（9.3）与命令面看到的是
 * 同一组事实。
 *
 * 「被其他作用域隐藏」= `catalog \ (scoped ∪ carried)`（diff-matrix R18）：本插件已生效的
 * 掩码（`applied.deny`，同时是下一轮的 `carried`）造成的「看不见」由用户自己的开关决定，
 * 必须从差集里排除，否则用户无法在面板里把自己关掉的工具打开。
 *
 * 只读、不抛错：层读失败降级为空读数、默认档损坏由 `readDefaults` 降级为空档、
 * 全局层读数抛错由 {@link catalogOf} 降级为空表。
 *
 * @param deps - 控制端口。
 * @param session - 目标会话。
 * @returns 只读读数。
 */
export async function readPanel(deps: ControlDeps, session: SessionLike): Promise<PanelReading> {
  const state = deps.store.read(session)
  const layer = layerOf(deps, session)
  const catalog = catalogOf(deps)
  const applied = snapshotOf(layer, deps.log)
  const scoped = applied.visible
  const defaults = await readDefaults(deps.defaultsPath, deps.defaultsIo, deps.log)

  const plan = planMask({
    catalog,
    scoped,
    carried: applied.deny,
    disabled: state.disabled,
  })

  const closed: ClosedAddressReading[] = []
  for (const text of state.disabled) {
    const parsed = parseAddress(text, deps.protectedNames)
    // 关闭集里理论上只会有规范形；不可解析的条目已被状态读路径丢弃，这里静默跳过。
    if (!parsed.ok) continue
    closed.push({
      text: parsed.text,
      kind: parsed.address.kind,
      matched: plan.matched.get(parsed.text) ?? 0,
      shadowed:
        parsed.address.kind === 'mcp-group'
        && applied.shadowServers.includes(parsed.address.server),
    })
  }

  const candidates = unionNames(catalog, scoped, applied.deny)
  const groups = groupByServer(candidates)
  const builtinNames = candidates
    .filter((name) => serverOfToolName(name) === undefined)
    .sort(compareText)
  // 「被其他作用域隐藏」= `catalog \ (scoped ∪ carried)`（diff-matrix R18，与面板 `panel.ts`
  // 同一口径）：`applied.deny` 是本插件已生效的掩码（carried），它同样让名字从 scoped 消失。
  // 若把它也算进来，用户自己关掉的工具会被当成「别人掩的」，面板据此禁用该行开关 → 用户
  // 在分组清单里打不开它。层未就绪时没有可信的 carried，维持空读数（不可信即不报）。
  const scopedSet = new Set(scoped)
  const carriedSet = new Set(applied.deny)
  const hiddenByOthers = layer === undefined
    ? []
    : catalog
        .filter((name) => !scopedSet.has(name) && !carriedSet.has(name))
        .sort(compareText)

  return {
    state,
    storeKind: deps.store.kind,
    layerReady: layer !== undefined,
    visible: scoped.length,
    appliedDeny: applied.deny,
    appliedShadowServers: applied.shadowServers,
    catalog,
    scoped,
    defaults,
    defaultsPath: deps.defaultsPath,
    protectedNames: Array.from(deps.protectedNames).sort(compareText),
    serverGroups: groups,
    builtinNames,
    builtinProtectedNames: builtinNames.filter((name) => deps.protectedNames.has(name)),
    hiddenByOthers,
    matched: plan.matched,
    closed,
    createdAt: session.header.createdAt,
  }
}

/**
 * 写用户级默认档（`/tools default off|on|set|reset` 的唯一写入路径）。
 *
 * 语义写死：**只影响之后新建的会话**（会话创建时拍快照，Q5-a）；本会话的状态一个字都不改。
 * 校验仍然全有或全无：地址里有一条不合法就整单拒绝，文件不动。
 *
 * 写盘失败**抛错**（不静默、也不变成 `ok:false`）：权限 / 磁盘 / 目录不可建都要让上层看见。
 * 命令面把抛错转成「默认档写入失败」回执，RPC（任务 9.5）把它映射成
 * `defaults-unwritable`（`details = {path, reason}`）——两条消费者路径因此共用同一个失败
 * 事实，不会出现「面板说失败、命令说成功」的分叉。
 *
 * @param deps - 控制端口。
 * @param mode - 四种写模式。
 * @param texts - 地址原文（`reset` 时忽略）。
 * @returns 写入前后的事实，或地址校验的拒绝文案。
 * @throws `writeDefaults` 的原始错误（端口写入失败时）。
 */
export async function updateDefaults(
  deps: ControlDeps,
  mode: DefaultsMode,
  texts: readonly string[],
): Promise<ControlOutcome<DefaultsWriteReport>> {
  const before = await readDefaults(deps.defaultsPath, deps.defaultsIo, deps.log)

  let desired: readonly string[] = []
  if (mode !== 'reset') {
    const parsed = parseAddresses(texts, deps.protectedNames)
    if (!parsed.ok) return { ok: false, text: parsed.message }
    const additions = parsed.entries.map((entry) => entry.text)
    if (mode === 'set') {
      desired = additions
    } else if (mode === 'off') {
      desired = [...before.disabled, ...additions]
    } else {
      desired = before.disabled.filter((item) => !additions.includes(item))
    }
  }

  const after: DefaultsFile = { version: 1, disabled: sortUnique(desired) }
  try {
    await writeDefaults(deps.defaultsPath, after, deps.defaultsIo)
  } catch (error) {
    deps.log.error(`默认档写入失败（${deps.defaultsPath}）：${messageOf(error)}`)
    // 原样向上抛：调用方按自己的语义转译（命令面 → 回执；RPC → defaults-unwritable）。
    throw error
  }

  return {
    ok: true,
    report: {
      mode,
      path: deps.defaultsPath,
      before,
      after,
      added: after.disabled.filter((item) => !before.disabled.includes(item)),
      removed: before.disabled.filter((item) => !after.disabled.includes(item)),
    },
  }
}

// ---------------------------------------------------------------------------
// 地址校验：全有或全无（内核里唯一会产出拒收回执的地方）
// ---------------------------------------------------------------------------

/** 校验通过的一条地址（规范形 + 地址对象）。 */
interface ParsedAddressEntry {
  readonly address: SwitchAddress
  readonly text: string
}

/** 地址校验结果：全有或全无。 */
type ParsedAddresses =
  | { readonly ok: true; readonly entries: readonly ParsedAddressEntry[] }
  | { readonly ok: false; readonly message: string }

/**
 * 逐条解析地址；**任何一条失败就整单拒绝**（全有或全无）。
 *
 * 拒绝文案把每条失败原文的 `parseAddress` 文案（保护名单、`run_code` 保留名、
 * `tool:mcp__…` 用错前缀、通配语法、地址为空）整份列出，末尾再补一行命令文法。
 *
 * 重复地址按规范形去重（`mcp:a` 与 `mcp:a::*` 是同一意图，只留一条）——语义与
 * `mask.ts` / `state.ts` 的规范形约定一致。
 *
 * @param texts - 用户地址原文。
 * @param protectedNames - 生效保护名单（基线 ∪ `config.protectedTools`）。
 * @returns 全部合法时的规范形条目；否则一条可直接展示的回执文案。
 */
function parseAddresses(
  texts: readonly string[],
  protectedNames: ReadonlySet<string>,
): ParsedAddresses {
  const entries: ParsedAddressEntry[] = []
  const failures: string[] = []

  for (const text of texts) {
    const parsed = parseAddress(text, protectedNames)
    if (!parsed.ok) {
      failures.push(parsed.message)
      continue
    }
    if (!entries.some((entry) => entry.text === parsed.text)) {
      entries.push({ address: parsed.address, text: parsed.text })
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      message: [
        `地址不合法，未做任何改动（${failures.length} 条不合法）：`,
        ...failures.map((failure) => `· ${failure}`),
        // 每条失败原文已自带地址文法，这里只补命令文法，避免同一行文法重复两遍。
        `文法：/tools ${TOOLS_GRAMMAR}`,
      ].join('\n'),
    }
  }
  return { ok: true, entries }
}

// ---------------------------------------------------------------------------
// 端口读取的容错包装（读失败降级，不让一次只读请求失败）
// ---------------------------------------------------------------------------

/**
 * 取该会话的层句柄（宿主里没活着的会话返回 undefined）。
 * @param deps - 控制端口。
 * @param session - 目标会话。
 * @returns 层句柄或 undefined。
 */
function layerOf(deps: ControlDeps, session: SessionLike): LayerHandle | undefined {
  try {
    return deps.layerFor(session.id)
  } catch (error) {
    deps.log.warn(`无法解析会话层（${session.id}）：${messageOf(error)}`)
    return undefined
  }
}

/**
 * 读全局层注册名；读数抛错时降级为空数组（只影响计数展示，不影响开关语义）。
 * @param deps - 控制端口。
 * @returns 注册名。
 */
function catalogOf(deps: ControlDeps): readonly string[] {
  try {
    return deps.catalog()
  } catch (error) {
    deps.log.warn(`无法读取全局层工具注册表：${messageOf(error)}`)
    return []
  }
}

/**
 * 读层的一手事实；层缺席或读失败时返回空读数。
 * @param layer - 层句柄（可能 undefined）。
 * @param log - 诊断出口。
 * @returns deny / 遮蔽段 / 可见名。
 */
function snapshotOf(layer: LayerHandle | undefined, log: SpecLog): LayerSnapshot {
  if (layer === undefined) return { deny: [], shadowServers: [], visible: [] }
  try {
    return layer.snapshot()
  } catch (error) {
    log.warn(`无法读取本会话掩码快照：${messageOf(error)}`)
    return { deny: [], shadowServers: [], visible: [] }
  }
}

// ---------------------------------------------------------------------------
// 名字集合与分组（与掩码引擎同一套读面语义）
// ---------------------------------------------------------------------------

/**
 * 三读并集（catalog → scoped → carried 首次出现序），供「可关对象」分组用。
 * @param catalog - 全局层注册名。
 * @param scoped - 本 agent 视角名。
 * @param carried - 上一轮仍受管的名字。
 * @returns 去重后的名字。
 */
function unionNames(
  catalog: readonly string[],
  scoped: readonly string[],
  carried: readonly string[],
): readonly string[] {
  return Array.from(new Set([...catalog, ...scoped, ...carried]))
}

/**
 * 按 MCP 服务器分组计数。
 *
 * 服务器分组只能从 public name 前缀推导（DSH 没有公开的「MCP 服务器注册表」服务，见
 * 附录 §2.5）：`mcp__<server>__<suffix>` 取**第一个** `__` 之前的部分。这条规则与
 * `address.ts` 的 `mcpIdentityOf` 同一条；等 9.3 的 `panel.ts` 落地后收敛到一处。
 * @param names - 三读并集。
 * @returns 按 server 名排序的分组计数。
 */
function groupByServer(names: readonly string[]): readonly ServerGroupCount[] {
  const counts = new Map<string, number>()
  for (const name of names) {
    const server = serverOfToolName(name)
    if (server === undefined) continue
    counts.set(server, (counts.get(server) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => compareText(left, right))
    .map(([server, count]) => ({ server, address: `mcp:${server}`, count }))
}

/**
 * 从一个注册名反推 serverName（`mcp__<server>__<suffix>` 的首段）。
 *
 * serverName 文法允许单个 `_`，所以只切第一个 `__`：后缀里再出现 `__` 归工具名。
 * @param toolName - 注册名。
 * @returns serverName；不是 MCP public name 时 undefined。
 */
function serverOfToolName(toolName: string): string | undefined {
  if (!toolName.startsWith(MCP_PUBLIC_PREFIX)) return undefined
  const rest = toolName.slice(MCP_PUBLIC_PREFIX.length)
  const separator = rest.indexOf(MCP_PUBLIC_SEPARATOR)
  if (separator <= 0) return undefined
  return rest.slice(0, separator)
}

// ---------------------------------------------------------------------------
// 小工具（纯函数；文案与顺序约定与 state.ts / mask.ts 一致）
// ---------------------------------------------------------------------------

/**
 * 文本比较（UTF-16 码元序，与 `state.ts` / `mask.ts` 同一约定）。
 * @param left - 一个文本。
 * @param right - 另一个文本。
 * @returns 负数 / 0 / 正数。
 */
function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/**
 * 两份文本列表是否逐项相同（两侧都应是已排序去重的规范形）。
 * @param left - 一份列表。
 * @param right - 另一份列表。
 * @returns 完全相同时为 true。
 */
function sameTexts(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

/**
 * 两份列表的对称差大小（`/tools reset` 的「已重置 N 项」）。
 * @param left - 当前关闭集。
 * @param right - 快照。
 * @returns 只在一侧出现的条目数。
 */
function symmetricDifference(left: readonly string[], right: readonly string[]): number {
  const onlyLeft = left.filter((item) => !right.includes(item)).length
  const onlyRight = right.filter((item) => !left.includes(item)).length
  return onlyLeft + onlyRight
}

/**
 * 排序 + 去重（与 `defaults.ts` / `state.ts` 同一不变量）。
 * @param texts - 文本列表。
 * @returns 新的排序去重数组。
 */
function sortUnique(texts: readonly string[]): readonly string[] {
  return Array.from(new Set(texts)).sort(compareText)
}

/**
 * 取错误文案（非 `Error` 也不会抛）。
 * @param error - 任意值。
 * @returns 文案。
 */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return String(error)
  } catch {
    return '不可渲染的错误'
  }
}
