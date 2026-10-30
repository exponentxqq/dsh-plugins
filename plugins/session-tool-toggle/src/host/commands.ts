/**
 * `/tools` 命令面（**文本前端**）：解析输入 → 调控制内核 → 拼简体中文回执。
 *
 * 任务 9.1 之后本文件只剩两件事：
 *
 * 1. **子文法解析**（{@link parseToolsInput}）：按空白切分 → 动词 → 子命令。地址文法
 *    校验**不**在这里——全有或全无要求保护 / 保留名 / 文法一次判完再落盘，那属内核。
 * 2. **回执拼装**（{@link runToolsCommand} 与各 `*Receipt` / `*Text`）：把内核的
 *    `ToggleReport` / `ResetReport` / `PanelReading` 变成人读的多行文本。
 *
 * 业务规则一条都不在这里：读状态、改状态、读写默认档全部 import 自 `control.ts`
 * （唯一用例内核，D14）。`ControlDeps` 在本文件里只是**透传依赖**，自己不做任何
 * `store.write` / `layer.setState` 调用（任务 9.1 的结构性断言守的就是这条）；Web RPC
 * （任务 9.5）与命令面共用同一内核，面板与 `/tools` 因此不存在两份状态。
 *
 * 三条与设计逐条对齐的常量/规则：
 *
 * - **单一命令 + 子文法**（D2）：`/tools status|off|on|reset|default …`，不拆成四个命令；
 * - **回执只报计数与代价形状**（D6）：`隐藏 N 个工具定义`、`本会话可见工具 A → B`、
 *   `前缀缓存…重建一次`，从不回显 schema 内容；
 * - **状态变更即时应用**（D7）：不 await `agent.whenIdle()`，内核写完 `store` 立刻
 *   `layer.setState`，回执同步返回。
 *
 * 回执文案是简体中文，且**不进模型请求**（命令结果是 UI 文本，不是消息；不变量 4/8）。
 *
 * @module dsh-plugin-session-tool-toggle/host/commands
 */

import type {
  CommandDefinition,
  CommandInvocation,
  CommandResult,
} from '@deepseek-ai/dsh-commands'
import { ADDRESS_GRAMMAR } from './address.ts'
import { TOOLS_GRAMMAR, readPanel, resetSession, toggleSession, updateDefaults } from './control.ts'
import type {
  ClosedAddressReading,
  DefaultsMode,
  DefaultsWriteReport,
  PanelReading,
  ToggleEntryReport,
} from './control.ts'
import type { ControlDeps, SessionLike, SessionToolState, StoreKind } from './types.ts'

/**
 * 命令名（合法：`dsh-commands` 的 `COMMAND_NAME` 是 `^[a-z][a-z0-9_-]*$`）。
 *
 * 只此一个命令：`/tools`（D2 否掉了「四独立命令」方案）。
 */
export const COMMAND_NAME = 'tools'

/**
 * 发现界面里的一句话说明（`CommandDefinition.description`）。
 *
 * 写明「会话级」「整组 vs 单工具」「默认档只影响之后新建的会话」三件事，因为这三个预期
 * 最容易被误解（README 与面板会重复同一套口径）。
 */
export const COMMAND_DESCRIPTION =
  '会话级工具面开关：查看状态、按 mcp:<server> 整组或单工具关闭/开启、tool:<name> 关闭内置工具，并管理只影响之后新建会话的用户级默认档'

// `TOOLS_GRAMMAR` 的**归属**已随任务 9.1 移到内核：地址校验的拒绝回执由内核生成，末尾必须
// 带这一行。命令面仍从本模块 re-export：`input.hint`、文法错误文案与任务 7.1 的既有测试都
// 从这里取它，表面不变。
export { TOOLS_GRAMMAR }

/** `DefaultsMode` 同理：它描述的是内核用例的入参，命令面只借用并 re-export。 */
export type { DefaultsMode }

/**
 * KV 前缀缓存重建提示（开/关**逐字相同**，S5 的对称补充）。
 *
 * 为什么必须报：一次开关会让工具 schema 块从第一个变化处起全部失效，前缀缓存因此
 * 重建一次。这是本功能唯一的隐性代价，用户应在按下开关前就知道它。
 */
const KV_REBUILD_HINT =
  '下次请求生效；前缀缓存将从第一个变化的 schema token 起重建一次（一次性成本）'

/**
 * 没有 schema 变化时的对应说明（同样带「前缀缓存」，但明说不会重建）。
 *
 * 两种情况都落在这里：关闭集没变（重复开关），以及关闭集变了但活读数里没有工具定义进出
 * （`/tools off mcp:zzz` 这类宽容记录）。后者的状态变了、模型请求没变，所以提示必须说
 * 「没有工具定义进出请求」而不是「没有状态变化」。
 */
const KV_UNCHANGED_HINT = '本次没有工具定义进出模型请求：前缀缓存不重建'

/**
 * `skill` 翻转的目录替换提示（S13）。
 *
 * `skill` 被掩码后由官方工具自动退役目录、恢复后重发目录，两侧各产生一条模型可见的
 * 目录消息——这是本功能里唯一「关掉/打开本身就有 token 成本」的特例，必须在回执里点名。
 */
const SKILL_FLIP_HINT =
  'skill 是技能目录工具：一次开关会触发一次技能目录替换消息（模型侧可见的一次性成本）'

/**
 * 命令面与控制内核共用的端口集合（后向兼容别名）。
 *
 * 任务 9.1 已把 `catalog` 并入 {@link ControlDeps}，因此这里**不再**扩展任何字段：命令面
 * 拿到的依赖与 RPC 收到的完全是同一份（D14 的「不存在两份状态」）。保留别名只是让 8.1 的
 * 装配代码与既有测试不必改签名。
 */
export type ToolsCommandDeps = ControlDeps

/**
 * 解析后的子命令。
 *
 * `texts` 一律是**用户原样输入**的地址（未解析）：解析与校验在内核里做，因为
 * 「全有或全无」要求保护名单 / 保留名 / 文法一次判完再落盘（任务 9.1 的裁定）。
 */
export type ToolsCommand =
  | { readonly kind: 'status' }
  | { readonly kind: 'toggle'; readonly on: boolean; readonly texts: readonly string[] }
  | { readonly kind: 'reset' }
  | { readonly kind: 'defaults'; readonly mode: DefaultsMode | 'read'; readonly texts: readonly string[] }

/** 文法解析结果。失败值直接就是回执文案（含一行文法）。 */
export type ToolsParse =
  | { readonly ok: true; readonly command: ToolsCommand }
  | { readonly ok: false; readonly message: string }

// ---------------------------------------------------------------------------
// 文法（纯函数，零 IO）
// ---------------------------------------------------------------------------

/**
 * 把 `rawInput` 解析成子命令。
 *
 * 切分规则（设计 ③.1 与 ③.7 的分工：**多地址切分是命令面的职责**）：
 * `rawInput` 含命令名之后的全部字节（包括分隔空白），因此先 `trim()` 再按空白切分；
 * 每个词条再交给内核的地址校验，本函数**不**做地址文法校验。
 *
 * 动词大小写不敏感（`/tools OFF` 可用），地址大小写敏感（serverName 是 `[A-Za-z0-9_-]`，
 * 大小写在 `dsh-mcp-client` 里是有意义的）。
 *
 * @param rawInput - 命令名之后的原文（`CommandInvocation.rawInput`）。
 * @returns 解析成功（子命令）或失败（回执文案，含一行文法）。
 */
export function parseToolsInput(rawInput: string): ToolsParse {
  const tokens = rawInput.trim().split(/\s+/).filter((token) => token !== '')
  const verb = tokens[0]
  // 空输入 = `status`：`/tools` 是「看看现在什么样」的安全缺省。
  if (verb === undefined) return { ok: true, command: { kind: 'status' } }

  const rest = tokens.slice(1)
  switch (verb.toLowerCase()) {
    case 'status':
      return rest.length === 0
        ? { ok: true, command: { kind: 'status' } }
        : rejected(`status 不接参数；${grammarLine()}`)
    case 'off':
      return toggleParse(false, rest)
    case 'on':
      return toggleParse(true, rest)
    case 'reset':
      return rest.length === 0
        ? { ok: true, command: { kind: 'reset' } }
        : rejected(`reset 不接参数；${grammarLine()}`)
    case 'default':
      return defaultsParse(rest)
    default:
      return rejected(`无法识别的子命令「${verb}」；${grammarLine()}`)
  }
}

/**
 * `off` / `on` 后面必须至少有一个地址。
 * @param on - true = 开启，false = 关闭（只影响文案）。
 * @param rest - 地址词条。
 * @returns 解析结果。
 */
function toggleParse(on: boolean, rest: readonly string[]): ToolsParse {
  if (rest.length === 0) {
    const verb = on ? 'on' : 'off'
    return rejected(`${verb} 后面至少需要一个地址（如 /tools ${verb} mcp:yunxiao）；${grammarLine()}`)
  }
  return { ok: true, command: { kind: 'toggle', on, texts: rest } }
}

/**
 * `default` 的四种写子命令与只读形态。
 * @param rest - `default` 之后的词条。
 * @returns 解析结果。
 */
function defaultsParse(rest: readonly string[]): ToolsParse {
  const sub = rest[0]
  // 裸 `default` = 只看默认档（不写文件、不影响任何会话）。
  if (sub === undefined) return { ok: true, command: { kind: 'defaults', mode: 'read', texts: [] } }

  const mode = sub.toLowerCase()
  const texts = rest.slice(1)
  if (mode === 'reset') {
    return texts.length === 0
      ? { ok: true, command: { kind: 'defaults', mode: 'reset', texts: [] } }
      : rejected(`default reset 不接地址（清空默认档直接写 /tools default reset）；${grammarLine()}`)
  }
  if (mode === 'off' || mode === 'on' || mode === 'set') {
    if (texts.length === 0) {
      return rejected(`default ${mode} 后面至少需要一个地址；${grammarLine()}`)
    }
    return { ok: true, command: { kind: 'defaults', mode, texts } }
  }
  return rejected(
    `default 的子命令只支持 off / on / set / reset（不带子命令时只查看默认档）；${grammarLine()}`,
  )
}

/**
 * 构造失败结果。
 * @param message - 简体中文回执文案（必须已含一行文法）。
 * @returns 失败结果。
 */
function rejected(message: string): ToolsParse {
  return { ok: false, message }
}

/**
 * 文法一行：命令文法 + 地址文法（三条地址文法分支压成一行）。
 *
 * 每条命令面的错误文案都以它收尾，用户不必翻文档就能改对下一次输入。地址校验失败的
 * 文案由内核生成（每条失败原文已自带地址文法），那里只补命令文法一行。
 * @returns 一行文法。
 */
function grammarLine(): string {
  return `文法：/tools ${TOOLS_GRAMMAR}；地址文法：${ADDRESS_GRAMMAR}`
}

// ---------------------------------------------------------------------------
// 文本前端：解析 → 内核 → 回执
// ---------------------------------------------------------------------------

/**
 * 执行一条 `/tools` 输入并返回可直接展示的 `CommandResult`。
 *
 * 纯文本前端：不读状态、不写状态，所有副作用都在内核里。任何未预期异常都收敛成
 * `{kind:'error'}` 回执（命令 handler 抛错在宿主里会变成一条无解释的失败）。
 *
 * @param rawInput - 命令名之后的原文。
 * @param deps - 控制端口。
 * @param session - 收到命令的会话。
 * @returns 成功或错误回执。
 */
export async function runToolsCommand(
  rawInput: string,
  deps: ToolsCommandDeps,
  session: SessionLike,
): Promise<CommandResult> {
  const parsed = parseToolsInput(rawInput)
  if (!parsed.ok) return { kind: 'error', text: parsed.message }

  try {
    switch (parsed.command.kind) {
      case 'status':
        return { kind: 'success', text: statusText(await readPanel(deps, session)) }
      case 'toggle':
        return toggleReceipt(deps, session, parsed.command)
      case 'reset':
        return resetReceipt(deps, session)
      case 'defaults':
        return await defaultsReceipt(deps, session, parsed.command)
    }
  } catch (error) {
    deps.log.error(`/tools 命令执行失败：${messageOf(error)}`)
    return {
      kind: 'error',
      text: `命令执行失败：${messageOf(error)}；${grammarLine()}`,
    }
  }
}

/**
 * 构造 `/tools` 命令定义（装配层在 `ctx.inject(['commands'])` 里注册它）。
 *
 * handler 只做一件事：把 `invocation.rawInput` 与 `invocation.agent.session` 交给
 * {@link runToolsCommand}。**不**在 handler 里做状态读写——那是内核的职责，也是 RPC（9.5）
 * 能复用同一内核的前提。
 *
 * @param deps - 控制端口（装配层构造一份，命令面与 RPC 共用）。
 * @returns 可交给 `ctx.commands.register(...)` 的命令定义。
 */
export function toolsCommand(deps: ToolsCommandDeps): CommandDefinition {
  return {
    name: COMMAND_NAME,
    description: COMMAND_DESCRIPTION,
    input: { hint: TOOLS_GRAMMAR },
    handler: async (invocation: CommandInvocation): Promise<CommandResult> =>
      await runToolsCommand(invocation.rawInput, deps, sessionOf(invocation)),
  }
}

/**
 * 从命令调用里取会话。
 *
 * 类型上 `CommandInvocation.agent` 是宿主的 `Agent`，其 `session` 是宿主的 `Session`；
 * 内核只依赖收窄后的 {@link SessionLike}（`id` / `header` / 读事件三件事），因此这里做一次
 * 结构性收窄。运行时仍是同一个对象，没有包装、没有复制。
 * @param invocation - 命令调用。
 * @returns 该调用精确对应的会话。
 */
function sessionOf(invocation: CommandInvocation): SessionLike {
  return invocation.agent.session as unknown as SessionLike
}

/**
 * `off` / `on` 的回执：逐地址一行 + 可见计数 + 缓存代价 + 可能的降级提示。
 * @param deps - 控制端口。
 * @param session - 目标会话。
 * @param command - 已解析的开关子命令。
 * @returns 成功或错误回执。
 */
function toggleReceipt(
  deps: ToolsCommandDeps,
  session: SessionLike,
  command: { readonly on: boolean; readonly texts: readonly string[] },
): CommandResult {
  const outcome = toggleSession(deps, session, command.texts, command.on)
  if (!outcome.ok) return { kind: 'error', text: outcome.text }

  const report = outcome.report
  const lines = report.entries.map((entry) => toggleLine(entry, command.on))
  lines.push(visibleLine(report.visibleKnown, report.visibleBefore, report.visibleAfter))
  lines.push(report.schemaChanged ? KV_REBUILD_HINT : KV_UNCHANGED_HINT)
  if (report.schemaChanged && report.entries.some((entry) => entry.text === 'tool:skill')) {
    lines.push(SKILL_FLIP_HINT)
  }
  if (report.persistFailed) lines.push(PERSIST_DEGRADED_HINT)
  if (report.layerFailed) lines.push(LAYER_FAILED_HINT)
  return { kind: 'success', text: lines.join('\n') }
}

/**
 * 一条地址的回执行。
 *
 * 三态（与内核 `matched` 的「0 也保留键」一一对应）：
 * - 无变化 → 明说「此前已关闭 / 已是开启状态」；
 * - 变化且命中 > 0 → `已关闭：… （隐藏 N 个工具定义[ + 1 段服务器指令]）`（`on` 为「恢复」）；
 * - 变化且命中 0 → `已记录`（未知 server/工具不报错，C10 宽容）。
 * @param entry - 该地址的回执事实。
 * @param on - true = 开启。
 * @returns 一行文案。
 */
function toggleLine(entry: ToggleEntryReport, on: boolean): string {
  // 只有整组关闭才遮蔽服务器指令段（单工具与内置工具只摘 schema，见 mask.ts）。
  const section = entry.kind === 'mcp-group' ? ' + 1 段服务器指令' : ''

  if (!entry.changed) {
    return on
      ? `已开启：${entry.text}（此前已是开启状态，无变化）`
      : `已关闭：${entry.text}（此前已关闭，无变化）`
  }
  if (on) {
    return entry.matched === 0
      ? `已开启：${entry.text}（当前无注册工具匹配；恢复 0 个工具定义）`
      : `已开启：${entry.text}（恢复 ${entry.matched} 个工具定义${section}）`
  }
  return entry.matched === 0
    ? `已记录：${entry.text}（当前无注册工具匹配；服务器上线后自动生效）`
    : `已关闭：${entry.text}（隐藏 ${entry.matched} 个工具定义${section}）`
}

/**
 * `/tools reset` 的回执。
 * @param deps - 控制端口。
 * @param session - 目标会话。
 * @returns 成功回执（reset 没有业务拒绝路径）。
 */
function resetReceipt(deps: ToolsCommandDeps, session: SessionLike): CommandResult {
  const report = resetSession(deps, session)
  const lines = [
    `已重置 ${report.changedCount} 项 → 创建时快照（${report.snapshot.length} 项关闭）`,
    visibleLine(report.visibleKnown, report.visibleBefore, report.visibleAfter),
    report.schemaChanged ? KV_REBUILD_HINT : KV_UNCHANGED_HINT,
  ]
  if (report.persistFailed) lines.push(PERSIST_DEGRADED_HINT)
  if (report.layerFailed) lines.push(LAYER_FAILED_HINT)
  return { kind: 'success', text: lines.join('\n') }
}

/**
 * `default` 的回执：只读形态给路径 + 条目 + 快照来源；写形态必须明说「本会话不变」。
 *
 * 写盘失败由内核**原样抛错**（R14：RPC 据此映射 `defaults-unwritable`）；命令面的等价表达
 * 是「默认档写入失败 + 本会话不变」的 error 回执，文案与任务 7.1 逐字相同。
 *
 * @param deps - 控制端口。
 * @param session - 目标会话（用来讲「本会话的快照来源」）。
 * @param command - 已解析的默认档子命令。
 * @returns 成功或错误回执。
 */
async function defaultsReceipt(
  deps: ToolsCommandDeps,
  session: SessionLike,
  command: { readonly mode: DefaultsMode | 'read'; readonly texts: readonly string[] },
): Promise<CommandResult> {
  if (command.mode === 'read') {
    return { kind: 'success', text: defaultsReadText(await readPanel(deps, session)) }
  }
  try {
    const outcome = await updateDefaults(deps, command.mode, command.texts)
    if (!outcome.ok) return { kind: 'error', text: outcome.text }
    return { kind: 'success', text: defaultsWriteText(outcome.report) }
  } catch (error) {
    return {
      kind: 'error',
      text: [
        `默认档写入失败（${deps.defaultsPath}）：${messageOf(error)}`,
        `改动未生效；本会话不变（${grammarLine()}）`,
      ].join('\n'),
    }
  }
}

/** 持久化降级提示（写失败时补一行，不让命令失败）。 */
const PERSIST_DEGRADED_HINT =
  '状态未能写入会话日志（已降级内存态：重启或恢复后本次开关可能丢失）'

/** 掩码更新失败提示（守卫仍在拦，读数可解释）。 */
const LAYER_FAILED_HINT =
  '掩码更新失败（已记日志）：下一次请求可能仍看到被关工具，/tools status 会显示实际生效集合'

/**
 * 可见工具计数行。
 * @param known - 会话层是否就绪。
 * @param before - 命令前可见数。
 * @param after - 命令后可见数。
 * @returns 一行文案。
 */
function visibleLine(known: boolean, before: number, after: number): string {
  if (!known) return '本会话层未就绪：可见工具数不可用（状态已记录，层就绪后生效）'
  return before === after ? `本会话可见工具 ${after}（无变化）` : `本会话可见工具 ${before} → ${after}`
}

/**
 * `/tools status` 的四段回执。
 *
 * 段落顺序写死为「本会话开关 / 默认档 / 可关对象 / 保护名单」：先回答「现在关了什么」，
 * 再回答「这条会话从哪儿来」，最后才是「还能关什么」与「什么不能关」。
 * @param reading - 内核的只读读数。
 * @returns 多行文案。
 */
function statusText(reading: PanelReading): string {
  const lines: string[] = []

  // 段 1：本会话开关。每条关闭地址按 matched 分两态（已关闭 / 已记录），这是
  // 「全局层有、本会话关」与「从未注册」在输出上的唯一区别。
  const disabledCount = reading.state.disabled.length
  lines.push(
    `【本会话开关】已关 ${disabledCount} 项${disabledCount === 0 ? '（全部可见）' : ''}`,
  )
  for (const entry of reading.closed) {
    lines.push(`  · ${entry.text} ${entry.matched} 个工具定义（${closedStateText(entry)}）`)
  }
  lines.push(
    `  · 本会话可见工具 ${reading.layerReady ? `${reading.visible} 个` : '数不可用（会话层未就绪）'}`
      + `（持久化通道：${storeKindText(reading.storeKind)}）`,
  )

  // 段 2：默认档（路径 + 条目 + 快照来源）。
  lines.push(defaultsHeadline(reading))
  lines.push(
    `  · 本会话创建于 ${formatTime(reading.createdAt)}；快照来源=${snapshotSource(reading.state)}；`
      + '/tools reset 回到这里',
  )

  // 段 3：可关对象（按 server 分组计数 + 单工具命中数）。
  lines.push(switchableText(reading))

  // 段 4：保护名单 + 被其他作用域隐藏的计数。
  lines.push(`【保护名单】${reading.protectedNames.length} 项：${reading.protectedNames.join('、')}`)
  lines.push(`  · ${hiddenText(reading)}`)

  return lines.join('\n')
}

/**
 * 一条关闭地址的两态文案。
 * @param entry - 关闭地址读数。
 * @returns `已关闭`（命中 > 0）或带宽容提示的 `已记录`（命中 0）。
 */
function closedStateText(entry: ClosedAddressReading): string {
  return entry.matched > 0
    ? `已关闭${entry.shadowed ? '，服务器指令段已遮蔽' : ''}`
    : '已记录：当前无注册工具匹配；服务器上线后自动生效'
}

/**
 * `default` 只读形态的文案：路径 + 条目 + 快照来源 + 「本会话不变」的说明。
 * @param reading - 读数。
 * @returns 多行文案。
 */
function defaultsReadText(reading: PanelReading): string {
  return [
    defaultsHeadline(reading),
    `  · 本会话创建于 ${formatTime(reading.createdAt)}；快照来源=${snapshotSource(reading.state)}`,
    '  · 对之后新建的会话生效；本会话不变（要改本会话用 /tools off|on <地址…>）',
  ].join('\n')
}

/**
 * 默认档的标题行（`【默认档】<路径>（N 项关闭：…）`）。
 * @param reading - 读数。
 * @returns 一行文案。
 */
function defaultsHeadline(reading: PanelReading): string {
  const disabled = reading.defaults.disabled
  const listed = disabled.length === 0 ? '' : `：${disabled.join('、')}`
  return `【默认档】${reading.defaultsPath}（${disabled.length} 项关闭${listed}）`
}

/**
 * 默认档写入后的回执：必须先说「对之后新建的会话生效；本会话不变」。
 * @param report - 内核的写入事实。
 * @returns 多行文案。
 */
function defaultsWriteText(report: DefaultsWriteReport): string {
  const verb = report.mode === 'set' ? '已覆盖' : report.mode === 'reset' ? '已清空' : '已更新'
  const disabled = report.after.disabled
  return [
    `【默认档】${verb}（对之后新建的会话生效；本会话不变）：`
      + `新增 ${report.added.length} 项、移除 ${report.removed.length} 项；当前 ${disabled.length} 项关闭`,
    `  · ${report.path}${disabled.length === 0 ? '（空档）' : `（${disabled.join('、')}）`}`,
  ].join('\n')
}

/**
 * 可关对象段：MCP 服务器分组计数 + 内置工具计数 + 单工具关闭计数。
 *
 * 刻意**不**展开工具清单（D6：回执只报计数与代价形状）：一台服务器可能有 70 个工具，
 * 回执会被撑爆；清单由 Web 面板（9.3）按需展示。
 * @param reading - 读数。
 * @returns 一行文案。
 */
function switchableText(reading: PanelReading): string {
  const groups = reading.serverGroups
  const servers =
    groups.length === 0
      ? 'MCP 服务器 0 台'
      : `MCP 服务器 ${groups.length} 台（${groups
          .map((group) => `${group.address} ${group.count}`)
          .join('、')}）`
  const protectedCount = reading.builtinProtectedNames.length
  const builtin =
    `内置工具 ${reading.builtinNames.length} 个`
    + (protectedCount === 0 ? '' : `（其中 ${protectedCount} 个受保护）`)
  const singleTools = reading.closed.filter((entry) => entry.kind === 'mcp-tool').length
  return `【可关对象】${servers}；${builtin}；单工具关闭 ${singleTools} 项`
}

/**
 * 「被其他作用域隐藏」的计数行。
 *
 * 这一行与「本会话已关」是两件不同的事：名字在全局层注册过、但本 agent 视角看不到，
 * 说明它被别的机制（如 project-mcp 的工作区隔离）掩掉了；本插件不能把它「开回来」。
 * @param reading - 读数。
 * @returns 一行文案。
 */
function hiddenText(reading: PanelReading): string {
  if (!reading.layerReady) return '会话层未就绪：无法读取「被其他作用域隐藏」的计数'
  return `被其他作用域隐藏 ${reading.hiddenByOthers.length} 个工具定义（全局层有、本会话不可见）`
}

/**
 * 持久化通道的人话说明。
 * @param kind - 实际生效的通道。
 * @returns 文案片段。
 */
function storeKindText(kind: StoreKind): string {
  return kind === 'record'
    ? '会话日志'
    : '内存（降级：重启或恢复后会丢失本会话的开关）'
}

/**
 * 快照来源：本会话的关闭集从哪来。
 * @param state - 本会话状态。
 * @returns 文案片段。
 */
function snapshotSource(state: SessionToolState): string {
  if (!state.seeded) return '尚未播种（本会话还没有默认档快照）'
  return `创建时默认档快照（${state.snapshot.length} 项关闭）`
}

/**
 * epoch ms → ISO 时间（非有限数降级为「未知时间」，绝不抛错）。
 * @param epochMs - 时间戳。
 * @returns 可展示时间。
 */
function formatTime(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '未知时间'
  return new Date(epochMs).toISOString()
}

/**
 * 取错误文案（非 `Error` 也不会抛）。
 *
 * 与内核里的同名小工具刻意各留一份：这里只用于「默认档写入失败」回执与兜底 catch，
 * 是纯文案助手；为共享一个叶子函数把命令面绑到内核内部实现上不值得。
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
