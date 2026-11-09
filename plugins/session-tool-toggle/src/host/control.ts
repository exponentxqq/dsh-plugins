/**
 * 控制内核：`/tools` 命令面与 Web RPC 的**唯一用例内核**（设计 D14）。
 *
 * 本模块只收五件事：读面板（{@link readPanel}）、本会话开关（{@link toggleSession}）、
 * 回到创建时快照（{@link resetSession}）、写用户级默认档（{@link updateDefaults}）、
 * 写工作区级默认档（{@link updateWorkspaceDefaults}）。
 * 命令面（`commands.ts`）与 Web RPC（`rpc.ts`，任务 9.5）都只通过这几张脸改状态，
 * 因此「同一会话只有一条写入路径」是**类型层面**的事实而不是约定：命令面拿到的依赖就是
 * {@link ControlDeps}，没有第二个 `StateStore` 入口（任务 9.1 的架构支点）。
 * 两份默认档（用户级 / 工作区级）各自也只有这一条写入路径。
 *
 * 三条写死的规则：
 *
 * 1. **全有或全无校验**（设计 ③.7）：保护名单、保留名、地址文法在 {@link parseAddresses}
 *    里**一次判完**；任何一条不合法就整单拒绝，`store.write` 一次都不发生——多地址命令
 *    绝不留下「一半生效」的不可解释状态（面板的批量开关也走同一条路径）。工作区档同样
 *    先过这一关，再进入读-改-写。
 * 2. **固定顺序**（任务 9.1 的裁定）：`withToggled`（纯函数，无变化返回**同一引用**）→
 *    `store.write` → `layer.setState` → 组装回执。先落状态再改掩码：写失败时掩码不动，
 *    不会出现「记录说关了、层还开着」的窗口。两步写失败都不让命令失败，回执里用
 *    `persistFailed` / `layerFailed` 说明代价（命令面据此补提示行）。
 * 3. **回执只报事实**：`matched` 命中数（0 也保留）、`changed`（关闭集变没变）、
 *    `schemaChanged`（**已生效的 deny 或影子 stub 集合**变没变——唯一决定前缀缓存重建的
 *    判据）、`hiddenSkills`（影子 stub 集合的变化量；真实层为收敛前同步初值，RPC 以
 *    `shadowedBefore` 为基准在 `await skillsSettled()` 之后重算为「已生效」口径）与写入后的整值状态。文案拼装与 markdown
 *    全部留在命令面，本模块不认识斜杠命令。
 *
 * 零 Cordis 依赖：本模块只认 {@link ControlDeps} 这组端口，因此每条规则都能用假端口在
 * 单测里直接驱动（`test/control.test.ts`），不需要拉起宿主。
 *
 * @module dsh-plugin-session-tool-toggle/host/control
 */

import { isAbsolute } from 'node:path'
import { DESCRIPTION_MAX_LENGTH } from '../contract.ts'
import type { SkillView, WorkspaceAction, WorkspaceView } from '../contract.ts'
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
  SkillLayerSnapshot,
  SpecLog,
  StoreKind,
  WorkspaceAttribution,
} from './types.ts'
import {
  EMPTY_WORKSPACES,
  disabledOf,
  readWorkspaces,
  withEntry,
  writeWorkspaces,
  type WorkspaceDefaultsFile,
} from './workspaces.ts'

/**
 * 命令文法一行（`/tools` 的 `input.hint` 与所有错误回执共用）。
 *
 * 与设计 ③.8（命令面）的表逐项对应：`status` 缺省、`off`/`on` 接地址、`reset` 回快照、
 * `default` 只看或写用户级默认档、`workspace` 只看或写本会话所属工作区的默认档。
 *
 * 常量放在内核里（而不是命令面）的理由：**地址校验的拒绝回执由内核生成**（见
 * {@link parseAddresses}），回执末尾必须带这一行命令文法；命令面从本模块 import 后既
 * 用作 `input.hint`，也 re-export 给既有消费者（任务 7.1 的测试从命令面取它）。
 */
export const TOOLS_GRAMMAR =
  'status | off <地址…> | on <地址…> | reset | default [off|on|set|reset] <地址…>'
  + ' | workspace [status|off|on|set|reset] <地址…>'

/** MCP public name 前缀：`mcp__<serverName>__<rawName>`（与 `address.ts` 同一命名契约）。 */
const MCP_PUBLIC_PREFIX = 'mcp__'

/** public name 里 serverName 与工具名的分隔符。 */
const MCP_PUBLIC_SEPARATOR = '__'

/**
 * 层缺席 / 技能分面读失败时的空读数（冻结，多处共享）。
 *
 * `available: false` 同时表达「宿主没有 skills 服务」与「本会话没有层」：两者对面板的含义
 * 相同——技能地址只记意图，影子 stub 不生效。
 */
const NO_SKILLS: SkillLayerSnapshot = Object.freeze({
  available: false,
  shadowed: Object.freeze([]) as readonly string[],
  visible: Object.freeze([]) as readonly { readonly name: string; readonly description: string }[],
})

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
   * 已生效的 deny 集合或影子 stub 集合任一变了——**唯一**决定「前缀缓存要不要重建」的事实。
   *
   * 与 `changed` 分开是刻意的：`/tools off mcp:zzz` 会改变关闭集（意图被记录），但活读数
   * 里没有任何工具进出模型请求，缓存不该重建；反过来重复关闭同一地址两者都不变。
   * 技能同理：`skill:<name>` 不进工具 deny，但它改变下一步的技能目录（影子 stub 集合），
   * 目录消息属于前缀的一部分，因此影子集合的长度差也算「schema 变了」。
   */
  readonly schemaChanged: boolean
  /**
   * 本次影子 stub 集合的变化量（`after.shadowed.length - before.shadowed.length`，可为负）。
   *
   * 0 = 技能可见性没变（无技能服务 / 未安装 / 重复操作）；负值 = 本次开启了被遮蔽的技能。
   * 与 `visibleBefore/After`（工具视角）是两个维度，不能互相推导。
   * **真实层时序注意**：`skillsAfter` 是 `setState` 后的同步读数，stub 注册异步（D-4），
   * 本值可能偏小；RPC 以 `shadowedBefore` 为基准、在 `await skillsSettled()` 之后重算
   * 「已生效」口径的最终数字（见 rpc.ts 的 `mutationOfToggle`）。
   */
  readonly hiddenSkills: number
  /** `setState` 之前该 agent 视角的影子 stub 数（RPC 收敛后重算 `hiddenSkills` 的基准）。 */
  readonly shadowedBefore: number
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
  /** 已生效的 deny 集合或技能关闭集是否变了（`/tools reset` 的缓存重建判据）。 */
  readonly schemaChanged: boolean
  /** 本次影子 stub 集合的变化量（可为负；真实层时序注意与重算口径同 {@link ToggleReport.hiddenSkills}）。 */
  readonly hiddenSkills: number
  /** `setState` 之前该 agent 视角的影子 stub 数（RPC 收敛后重算的基准）。 */
  readonly shadowedBefore: number
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

/** `/tools status` 与 `default` 共用的一份只读读数（本会话两读并集 + 默认档 + 保护名单）。 */
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
  /** 每条关闭地址命中的工具定义数（键是规范形文本；0 也保留键，两态区分据此）。 */
  readonly matched: ReadonlyMap<string, number>
  /** 每一条关闭地址的读数（按 `state.disabled` 顺序）。 */
  readonly closed: readonly ClosedAddressReading[]
  /** 会话创建时间（epoch ms），用来给「快照来源」配时间。 */
  readonly createdAt: number
  /**
   * 技能行（模型可调用技能 ∪ 当前已遮蔽名字，按名字升序）。
   *
   * 行里同时带 `disabled`（意图，关闭集里有 `skill:<name>`）与 `shadowed`（实际生效，
   * 本层已注册影子 stub）——两者不一致正是「记了但没装上」的两态区分（D-6）。
   */
  readonly skills: readonly SkillView[]
  /** `skills` 服务是否可用（false = 技能地址只记意图，面板给 `skills-unavailable`）。 */
  readonly skillsAvailable: boolean
  /**
   * 本会话所属工作区的默认档视图；`null` = cwd 无法归属（fail-closed）。
   *
   * 与 {@link PanelReading.defaults} 并列：一个讲「所有新会话」，一个讲「这个工作区的新会话」。
   */
  readonly workspace: WorkspaceView | null
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

/**
 * 工作区档写目标的两种寻址形态（设计 D-11 / DQ4-A）。
 *
 * - `session`：面板分区与命令面用。宿主从会话 cwd 推键，**允许未登记目录**（`registered:false`）；
 * - `path`：页面统一选择框与 `{workspacePath}` 请求用。只接受 `workspaceChoices()` 里的规范路径，
 *   拒绝任意路径探测（未登记目录不能借这个入口写进 `workspaces.json`）。
 */
export type WorkspaceTarget =
  | { readonly kind: 'session'; readonly session: SessionLike }
  | { readonly kind: 'path'; readonly path: string }

/** `workspace off|on|set|reset` 的回执事实（与 {@link DefaultsWriteReport} 同构）。 */
export interface WorkspaceDefaultsReport {
  /** 本次动作（`read` = 只读分支，不写文件）。 */
  readonly mode: WorkspaceAction
  /** 解析出的工作区键（规范绝对路径）。 */
  readonly key: string
  /** 工作区档文件绝对路径。 */
  readonly path: string
  readonly before: WorkspaceDefaultsFile
  readonly after: WorkspaceDefaultsFile
  /** 目标工作区条目本次新增的条目（规范形）。 */
  readonly added: readonly string[]
  /** 目标工作区条目本次移除的条目（规范形）。 */
  readonly removed: readonly string[]
}

// ---------------------------------------------------------------------------
// 五个用例（唯一写入路径；顺序即语义）
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
 * @param deps - 控制端口。
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
  const before = snapshotOf(layer, deps.log)
  const skillsBefore = skillsOf(layer, deps.log)
  const visibleBefore = before.visible.length

  // 匹配计数：planMask 的 matched 只含入参 disabled 的键，因此把本次涉及的地址整份传进去，
  // 不依赖它们此刻是否真的在关闭集里（`on` 的地址通常已经不在）。
  const plan = planMask({
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
  // 影子 stub 集合同样是「已生效」的读数：`setState` 之后本层已撤销 / 补挂的 stub 键集。
  // 技能补挂是异步的（D-4），调用方（命令面 / RPC）在展示回执前 await `skillsSettled()`。
  const skillsAfter = changed ? skillsOf(layer, deps.log) : skillsBefore

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
      // 缓存重建由「已生效的 deny 集合」或「影子 stub 集合」任一变化决定：宽容记录的
      // 0 匹配地址不算；技能不进工具 deny，但技能目录属于前缀的一部分（H7 / D-4）。
      schemaChanged:
        !sameTexts(before.deny, after.deny)
        || skillsBefore.shadowed.length !== skillsAfter.shadowed.length,
      hiddenSkills: skillsAfter.shadowed.length - skillsBefore.shadowed.length,
      // 收敛前基准（真实层同步读到的影子数）：RPC 在 `await skillsSettled()` 之后用
      // `layer.skills().shadowed.length` 与它重算，得到「已生效」口径的回执数字（D-4）。
      shadowedBefore: skillsBefore.shadowed.length,
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
  const skillsBefore = skillsOf(layer, deps.log)
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
  const skillsAfter = changed ? skillsOf(layer, deps.log) : skillsBefore

  return {
    changedCount: symmetricDifference(stateBefore.disabled, snapshot),
    changed,
    schemaChanged:
      !sameTexts(before.deny, after.deny)
      || skillsBefore.shadowed.length !== skillsAfter.shadowed.length,
    hiddenSkills: skillsAfter.shadowed.length - skillsBefore.shadowed.length,
    // 收敛前基准（同 ToggleReport.shadowedBefore，RPC 收敛后重算用）。
    shadowedBefore: skillsBefore.shadowed.length,
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
 * 两读并集照抄掩码引擎：`scoped`（本 agent 视角，本会话里真实存在的工具）+ `appliedDeny`
 * （已生效的掩码，同时是下一轮的 `carried`，防第二读缩小）→ `planMask`。分组、命中计数、
 * 两态区分与保护名单都由这一份会话读数推出，因此面板（9.3）与命令面看到的是同一组事实。
 *
 * 候选**只由会话读数决定**：全局层有、本会话看不到的名字（被别的作用域掩掉、或本来就不在
 * 本会话里）不进候选，因此它们既不出现在分组清单里，也打不开——开关不再拿本会话拿不到的
 * 名字虚报可关对象。关闭这类名字是**纯意图**（`matched` 为 0、`deny` 为空、意图保留在状态
 * 里，等它真的出现在本会话后由 `tools/change → refresh()` 幂等链补上掩码）。
 *
 * 只读、不抛错：层读失败降级为空读数、默认档损坏由 `readDefaults` 降级为空档。
 *
 * @param deps - 控制端口。
 * @param session - 目标会话。
 * @returns 只读读数。
 */
export async function readPanel(deps: ControlDeps, session: SessionLike): Promise<PanelReading> {
  const state = deps.store.read(session)
  const layer = layerOf(deps, session)
  const applied = snapshotOf(layer, deps.log)
  const skills = skillsOf(layer, deps.log)
  const scoped = applied.visible
  const defaults = await readDefaults(deps.defaultsPath, deps.defaultsIo, deps.log)
  const workspace = await workspaceViewOf(deps, session)

  const plan = planMask({
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

  const candidates = unionNames(scoped, applied.deny)
  const groups = groupByServer(candidates)
  const builtinNames = candidates
    .filter((name) => serverOfToolName(name) === undefined)
    .sort(compareText)

  return {
    state,
    storeKind: deps.store.kind,
    layerReady: layer !== undefined,
    visible: scoped.length,
    appliedDeny: applied.deny,
    appliedShadowServers: applied.shadowServers,
    scoped,
    defaults,
    defaultsPath: deps.defaultsPath,
    protectedNames: Array.from(deps.protectedNames).sort(compareText),
    serverGroups: groups,
    builtinNames,
    builtinProtectedNames: builtinNames.filter((name) => deps.protectedNames.has(name)),
    matched: plan.matched,
    closed,
    createdAt: session.header.createdAt,
    skills: skillRowsOf(skills, state.disabled, deps.protectedNames),
    skillsAvailable: skills.available,
    workspace,
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

/**
 * 写工作区级默认档（`/tools workspace off|on|set|reset` 与 `workspace` 端点的唯一写入路径）。
 *
 * 语义与 {@link updateDefaults} 逐条同构，只是维度换成「一个工作区一份清单」：
 *
 * - **不追溯**：只影响该工作区**之后新建**的会话；本会话的 `state.disabled` 一个字都不改
 *   （spec「不追溯」）。因此本函数从不触碰 `deps.store` / `deps.layerFor`。
 * - **全有或全无**：`off` / `on` / `set` 的地址先整批判完；任何一条不合法就整单拒绝，
 *   文件不动。`reset` 不接地址。
 * - **动作语义**：`off` = 并入当前条目；`on` = 从当前条目移除；`set` = 整份覆盖；
 *   `reset` = 该工作区条目清空（保留键、空 `disabled`，见 `withEntry` 的契约）。
 *   `read` 是只读分支（供 RPC 复用目标解析），不写文件。
 * - **写盘失败原样抛**：权限 / 磁盘 / 目录不可建都由上层看见（RPC 映射
 *   `workspace-unwritable`，命令面转成回执），与 `updateDefaults` 同一纪律。
 *
 * 目标解析失败（`{kind:'session'}` 无法归属 / `{kind:'path'}` 非绝对或未登记）是**业务拒绝**
 * 而不是抛错：回执文案带稳定的 `workspace-unresolved` 标记与 subject，RPC 据此映射失败码。
 *
 * @param deps - 控制端口（含工作区档路径 / IO 与归属端口）。
 * @param target - 两种寻址形态之一。
 * @param mode - 工作区动作（`read` = 只读，不写）。
 * @param texts - 地址原文（`reset` / `read` 时忽略）。
 * @returns 写入前后的事实，或目标解析 / 地址校验的拒绝文案。
 * @throws `writeWorkspaces` 的原始错误（端口写入失败时）。
 */
export async function updateWorkspaceDefaults(
  deps: ControlDeps,
  target: WorkspaceTarget,
  mode: WorkspaceAction,
  texts: readonly string[],
): Promise<ControlOutcome<WorkspaceDefaultsReport>> {
  const resolved = await resolveWorkspaceTarget(deps, target)
  if (!resolved.ok) return { ok: false, text: resolved.text }

  const before = await readWorkspaces(deps.workspacesPath, deps.workspacesIo, deps.log)

  // `read` 只解析目标并给出当前档（RPC 的只读形态复用同一套目标校验），绝不写文件。
  if (mode === 'read') {
    return {
      ok: true,
      report: {
        mode,
        key: resolved.key,
        path: deps.workspacesPath,
        before,
        after: before,
        added: [],
        removed: [],
      },
    }
  }

  const current = disabledOf(before, resolved.key)
  // `reset` = 清空该工作区条目（保留键、空 disabled）；其余动作从当前条目出发。
  let desired: readonly string[] = []
  if (mode !== 'reset') {
    const parsed = parseAddresses(texts, deps.protectedNames)
    if (!parsed.ok) return { ok: false, text: parsed.message }
    const additions = parsed.entries.map((entry) => entry.text)
    if (mode === 'set') {
      desired = additions
    } else if (mode === 'off') {
      desired = [...current, ...additions]
    } else {
      desired = current.filter((item) => !additions.includes(item))
    }
  }

  // 纯函数编辑（排序去重 + 稳定排序）→ 整份原子写。坏键 / 条目上限由 `withEntry` 拒绝：
  // 此时它返回入参本身，写路径仍按「无变化」如实回执（warn 已由 `withEntry` 发出）。
  const after = withEntry(before, resolved.key, desired, deps.log)
  try {
    await writeWorkspaces(deps.workspacesPath, after, deps.workspacesIo)
  } catch (error) {
    deps.log.error(`工作区档写入失败（${deps.workspacesPath}）：${messageOf(error)}`)
    // 原样向上抛：命令面 → 回执；RPC → workspace-unwritable（details = {path, reason}）。
    throw error
  }

  const beforeDisabled = disabledOf(before, resolved.key)
  const afterDisabled = disabledOf(after, resolved.key)
  return {
    ok: true,
    report: {
      mode,
      key: resolved.key,
      path: deps.workspacesPath,
      before,
      after,
      added: afterDisabled.filter((item) => !beforeDisabled.includes(item)),
      removed: beforeDisabled.filter((item) => !afterDisabled.includes(item)),
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

/**
 * 读层的一手技能分面；层缺席或读失败时返回 {@link NO_SKILLS}。
 *
 * 与 {@link snapshotOf} 同一纪律：技能分面是**附加**读数，读不到只降级成「不可用」，
 * 不让一次开关 / 只读请求失败。
 * @param layer - 层句柄（可能 undefined）。
 * @param log - 诊断出口。
 * @returns 影子 stub 集合与模型可调用技能清单。
 */
function skillsOf(layer: LayerHandle | undefined, log: SpecLog): SkillLayerSnapshot {
  if (layer === undefined) return NO_SKILLS
  try {
    return layer.skills()
  } catch (error) {
    log.warn(`无法读取本会话技能分面：${messageOf(error)}`)
    return NO_SKILLS
  }
}

// ---------------------------------------------------------------------------
// 工作区目标解析与工作区视图（H7；两种寻址形态共用一条读取路径）
// ---------------------------------------------------------------------------

/**
 * 工作区目标解析的结果：规范键，或一条可直接展示的拒绝文案。
 *
 * 拒绝文案带稳定的 `workspace-unresolved` 标记与失败主体（sessionId / 路径原文），
 * RPC 侧据此映射 `workspace-unresolved{subject}`，命令面直接展示。
 */
type ResolvedWorkspaceTarget =
  | { readonly ok: true; readonly key: string }
  | { readonly ok: false; readonly text: string }

/**
 * 把两种寻址形态解成工作区键（`resolveWorkspaceTarget`，control 内私有）。
 *
 * - `{kind:'session'}`：`deps.workspaceOf(session)` 的归属键；`undefined` = cwd 缺失或
 *   realpath 全程失败（fail-closed），**允许未登记目录**（`registered:false` 照样有键）。
 *   归属端口抛错同样按未解析处理并 warn：一次只读请求不该因为 cwd 的 IO 问题变成 500。
 * - `{kind:'path'}`：必须是绝对路径，且在 `deps.workspaceChoices()` 的键集合里。registry 的
 *   `path` 已由上游保证是 realpath（A3），因此「在 choices 里」同时覆盖了「存在且
 *   realpath 成功」——本模块不额外碰文件系统（没有 realpath 端口，也不该为此引入 IO）。
 *
 * @param deps - 控制端口。
 * @param target - 目标形态。
 * @returns 规范键或拒绝文案。
 */
async function resolveWorkspaceTarget(
  deps: ControlDeps,
  target: WorkspaceTarget,
): Promise<ResolvedWorkspaceTarget> {
  if (target.kind === 'session') {
    let attribution: WorkspaceAttribution | undefined
    try {
      attribution = await deps.workspaceOf(target.session)
    } catch (error) {
      deps.log.warn(`无法解析会话所属工作区（${target.session.id}）：${messageOf(error)}`)
      attribution = undefined
    }
    if (attribution === undefined) {
      return unresolvedWorkspace(
        target.session.id,
        `会话「${target.session.id}」的 cwd 无法归属工作区（缺失或目录已被删除）`,
      )
    }
    return { ok: true, key: attribution.key }
  }

  const path = target.path
  if (!isAbsolute(path)) {
    return unresolvedWorkspace(path, `路径「${path}」不是绝对路径`)
  }
  let choices: readonly { readonly key: string; readonly title?: string }[]
  try {
    choices = deps.workspaceChoices()
  } catch (error) {
    deps.log.warn(`无法读取已登记工作区列表：${messageOf(error)}`)
    choices = []
  }
  if (!choices.some((choice) => choice.key === path)) {
    return unresolvedWorkspace(
      path,
      `路径「${path}」不在已登记工作区列表里（要求绝对路径 + realpath 成功 + 已登记）`,
    )
  }
  return { ok: true, key: path }
}

/**
 * 构造一条目标解析失败的拒绝结果（稳定标记 + subject）。
 * @param subject - 失败主体（会话 id 或路径原文）。
 * @param reason - 一句可读的理由。
 * @returns `{ok:false}` 结果。
 */
function unresolvedWorkspace(subject: string, reason: string): ResolvedWorkspaceTarget {
  return {
    ok: false,
    text: `工作区未解析（workspace-unresolved，subject：${subject}）：${reason}，未做任何改动`,
  }
}

/**
 * 汇总面板需要的「本会话所属工作区」视图。
 *
 * `null` 有三种来源，语义相同（没有可展示的工作区档）：归属端口返回 undefined、归属端口
 * 抛错、会话 cwd 无法归属。归属成功时读整份工作区档并给出该键的条目、文件路径与两态
 * （`readable` / `corrupt`）——**不**写文件、不碰会话状态。
 *
 * 两态判定与 `rpc.ts` 的默认档判定同构：`readWorkspaces` 把「缺失 / 损坏 / schema 不符」
 * 都折成 {@link EMPTY_WORKSPACES}，只有落到降级常量时才补一次只读探测——读得到 = 文件存在
 * 但不可用（`corrupt`），读不到 = 不存在（按空档处理，不算损坏）。
 * @param deps - 控制端口。
 * @param session - 目标会话。
 * @returns 工作区视图，或 `null`。
 */
async function workspaceViewOf(
  deps: ControlDeps,
  session: SessionLike,
): Promise<WorkspaceView | null> {
  let attribution: WorkspaceAttribution | undefined
  try {
    attribution = await deps.workspaceOf(session)
  } catch (error) {
    deps.log.warn(`无法解析会话所属工作区（${session.id}）：${messageOf(error)}`)
    return null
  }
  if (attribution === undefined) return null

  const file = await readWorkspaces(deps.workspacesPath, deps.workspacesIo, deps.log)
  const state = await workspacesStateOf(deps, file)
  return {
    key: attribution.key,
    ...(attribution.title === undefined ? {} : { title: attribution.title }),
    registered: attribution.registered,
    disabled: disabledOf(file, attribution.key),
    path: deps.workspacesPath,
    readable: state.readable,
    corrupt: state.corrupt,
  }
}

/**
 * 工作区档文件的两态（`readable` / `corrupt`）。
 *
 * 与 `rpc.ts` 的快照探测同一手法：只有读到降级常量时才补一次只读探测，正常
 * 文件不多读一遍。探测只问「读得到吗」，不重复解析（内容好坏由 `readWorkspaces` 判定）。
 * @param deps - 控制端口。
 * @param file - `readWorkspaces` 的读数。
 * @returns 两态标记。
 */
async function workspacesStateOf(
  deps: ControlDeps,
  file: WorkspaceDefaultsFile,
): Promise<{ readonly readable: boolean; readonly corrupt: boolean }> {
  if (file !== EMPTY_WORKSPACES) return { readable: true, corrupt: false }
  try {
    await deps.workspacesIo.readFile(deps.workspacesPath)
    return { readable: true, corrupt: true }
  } catch {
    return { readable: false, corrupt: false }
  }
}

/**
 * 把技能分面读数合成面板的技能行。
 *
 * 行集合 = 模型可调用技能 ∪ 当前已遮蔽名字（契约 §3.6.4 的「只含…」）：
 * - `disabled` 来自关闭集里的 `skill:<name>`（意图）；
 * - `shadowed` 来自本层已注册 stub（实际生效）；
 * - 阴影行不在 `visible` 里（模型不可调用），描述天然为空串（「已关且无缓存时为空串」）。
 *
 * 关闭集里的未知技能（意图有、未安装）**不**单独成行：它已经在 `closed` 读数里（两态区分），
 * 再进技能行只会让面板出现一行永远无法生效的开关。
 * @param snapshot - 层读数。
 * @param disabled - 关闭集（规范形文本）。
 * @param protectedNames - 生效保护名单（只影响工具地址，技能地址不受影响，传进来是为了复用解析）。
 * @returns 按名字升序的技能行。
 */
function skillRowsOf(
  snapshot: SkillLayerSnapshot,
  disabled: readonly string[],
  protectedNames: ReadonlySet<string>,
): readonly SkillView[] {
  const disabledNames = new Set<string>()
  for (const text of disabled) {
    const parsed = parseAddress(text, protectedNames)
    if (parsed.ok && parsed.address.kind === 'skill') disabledNames.add(parsed.address.name)
  }

  const rows = new Map<string, SkillView>()
  for (const visible of snapshot.visible) {
    rows.set(visible.name, {
      name: visible.name,
      description: truncateDescription(visible.description),
      disabled: disabledNames.has(visible.name),
      shadowed: false,
    })
  }
  for (const name of snapshot.shadowed) {
    const existing = rows.get(name)
    rows.set(name, {
      name,
      description: existing?.description ?? '',
      disabled: disabledNames.has(name),
      shadowed: true,
    })
  }
  return Array.from(rows.values()).sort((left, right) => compareText(left.name, right.name))
}

// ---------------------------------------------------------------------------
// 名字集合与分组（与掩码引擎同一套读面语义）
// ---------------------------------------------------------------------------

/**
 * 本会话两读并集（scoped → carried 首次出现序），供「可关对象」分组用。
 *
 * 与掩码引擎 `mask.ts` 的候选口径逐字相同（`scoped ∪ carried`）：只有本会话里真实出现过的
 * 名字才是可关对象。刻意**不**从 `mask.ts` import——那是掩码计划的内部步骤，抽成共用会在两个
 * 模块之间造一条只为一个三行函数服务的耦合（设计 ⑥ U3 的裁定）。
 * @param scoped - 本 agent 视角名。
 * @param carried - 上一轮 deny 里仍然受管的名字。
 * @returns 去重后的名字。
 */
function unionNames(
  scoped: readonly string[],
  carried: readonly string[],
): readonly string[] {
  return Array.from(new Set([...scoped, ...carried]))
}

/**
 * 按 MCP 服务器分组计数。
 *
 * 服务器分组只能从 public name 前缀推导（DSH 没有公开的「MCP 服务器注册表」服务，见
 * 附录 §2.5）：`mcp__<server>__<suffix>` 取**第一个** `__` 之前的部分。这条规则与
 * `address.ts` 的 `mcpIdentityOf` 同一条；等 9.3 的 `panel.ts` 落地后收敛到一处。
 * @param names - 本会话两读并集。
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
 * 把技能描述截断到契约的 {@link DESCRIPTION_MAX_LENGTH}（按 UTF-16 码元，与
 * `contract.ts` 的 `max(160)` 计数方式一致）。
 *
 * 与 `panel.ts` 的截断规则同一条：切点落在代理对高位时少取一个码元，避免产出孤立代理项。
 * @param text - 原始描述。
 * @returns 截断后的描述（可能为空串）。
 */
function truncateDescription(text: string): string {
  if (text.length <= DESCRIPTION_MAX_LENGTH) return text
  const cut = text.slice(0, DESCRIPTION_MAX_LENGTH)
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

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
