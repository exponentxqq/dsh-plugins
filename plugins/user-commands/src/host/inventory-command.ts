/**
 * `/inventory` 的宿主实现：把「读哪些服务」收进窄端口 {@link InventoryPorts}，
 * handler 只做四件事——校验输入、两段独立读取、把失败降级成段内说明、渲染。
 *
 * 为什么这样分层（变更 design D2/D6/D7）：
 *
 * - **软依赖**：`tools` / `skills` / `workingDirectory` 由装配层经 `ctx.get` 读取后注入端口，
 *   插件不声明 `inject`，任何 profile 仍能安装；端口返回 `undefined` = 服务缺席。
 * - **诊断命令不整体失败**：单段读取抛错只降级该段并写诊断日志，命令仍成功结算；
 *   唯一返回错误结果的情形是「带参」与「已取消」。
 * - **可单测**：业务规则在 `inventory.ts` 纯函数里，本模块只做编排，用假端口即可覆盖
 *   成功/缺席/抛错/不完整/取消/带参六类路径，不需要拉起宿主。
 * @module dsh-plugin-user-commands/host/inventory-command
 */

import {
  INVENTORY_COMMAND_DESCRIPTION,
  INVENTORY_COMMAND_NAME,
  INVENTORY_USAGE,
  groupMcpTools,
  renderInventory,
  skillRows,
  type InventoryReading,
  type McpGrouping,
  type SkillSection,
  type SkillSummaryLike,
} from './inventory.ts'
import type {
  CommandLog,
  HostCommandInvoke,
  HostCommandResult,
  RegisteredCommand,
} from './types.ts'

/** Skill 目录快照的宿主投影（`dsh-skill` 的 `SkillCatalogSnapshot` 窄面）。 */
export interface SkillSnapshotLike {
  /** 该会话 cwd 与 agent 作用域下的胜出 skill 摘要。 */
  readonly skills: readonly SkillSummaryLike[]
  /** 目录观测是否完整（提供方发现失败时为 false）。 */
  readonly complete: boolean
}

/**
 * `/inventory` 需要的宿主能力（全部由装配层注入）。
 *
 * 端口约定：**服务缺席返回 `undefined`，读取失败向上抛**——降级文案与日志由本模块统一处理，
 * 装配层只做真实的宿主读取与类型 cast。
 */
export interface InventoryPorts {
  /** 诊断出口。 */
  readonly log: CommandLog
  /**
   * 会话当前工作目录。
   * @param agent - 收到命令的 agent（不透明对象）。
   * @returns 绝对路径；无法解析时返回 undefined。
   */
  cwd(agent: object): string | undefined
  /**
   * 该会话作用域可见的工具名。
   * @param agent - 收到命令的 agent（作用域键）。
   * @returns 工具名；`tools` 服务缺席时返回 undefined。
   */
  toolNames(agent: object): readonly string[] | undefined
  /**
   * skill 注册表在该会话 cwd 与作用域下的目录快照。
   * @param cwd - 会话当前工作目录（可能未知）。
   * @param agent - 收到命令的 agent（作用域键）。
   * @param signal - 派发方的取消信号。
   * @returns 目录快照；`skills` 服务缺席时返回 undefined。
   */
  skillSnapshot(
    cwd: string | undefined,
    agent: object,
    signal: AbortSignal,
  ): Promise<SkillSnapshotLike | undefined>
}

/** MCP 段的一次读取结果：成功读数或降级原因。 */
interface McpReadResult {
  readonly mcp?: McpGrouping
  readonly mcpNote?: string
}

/** Skill 段的一次读取结果：成功读数或降级原因。 */
interface SkillsReadResult {
  readonly skills?: SkillSection
  readonly skillsNote?: string
}

/**
 * 把异常转成可读原因。
 * @param error - 抛出的值。
 * @returns 异常消息或字符串化结果。
 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 解析会话工作目录：失败只告警并返回 undefined（由渲染层标注项目级 skill 可能缺失）。
 * @param ports - 宿主能力端口。
 * @param agent - 收到命令的 agent。
 * @returns 绝对路径或 undefined。
 */
function readCwd(ports: InventoryPorts, agent: object): string | undefined {
  try {
    return ports.cwd(agent)
  } catch (error) {
    ports.log.warn(`/inventory 解析会话工作目录失败：${describeError(error)}`)
    return undefined
  }
}

/**
 * 读取 MCP 可见面并归组。
 * @param ports - 宿主能力端口。
 * @param agent - 收到命令的 agent。
 * @returns 成功读数或降级原因。
 */
function readMcp(ports: InventoryPorts, agent: object): McpReadResult {
  let names: readonly string[] | undefined
  try {
    names = ports.toolNames(agent)
  } catch (error) {
    const note = `读取可见工具面失败：${describeError(error)}`
    ports.log.error(`/inventory ${note}`)
    return { mcpNote: note }
  }
  if (names === undefined) return { mcpNote: '当前部署未提供 tools 服务，无法读取' }
  return { mcp: groupMcpTools(names) }
}

/**
 * 读取 skill 目录并投影成清单行。
 * @param ports - 宿主能力端口。
 * @param cwd - 会话当前工作目录（可能未知）。
 * @param agent - 收到命令的 agent。
 * @param signal - 派发方的取消信号。
 * @returns 成功读数或降级原因。
 */
async function readSkills(
  ports: InventoryPorts,
  cwd: string | undefined,
  agent: object,
  signal: AbortSignal,
): Promise<SkillsReadResult> {
  let snapshot: SkillSnapshotLike | undefined
  try {
    snapshot = await ports.skillSnapshot(cwd, agent, signal)
  } catch (error) {
    const note = `读取 skill 目录失败：${describeError(error)}`
    ports.log.error(`/inventory ${note}`)
    return { skillsNote: note }
  }
  if (snapshot === undefined) return { skillsNote: '当前部署未提供 skills 服务，无法读取' }
  return { skills: { rows: skillRows(snapshot.skills), complete: snapshot.complete } }
}

/**
 * 创建 `/inventory` 内置命令。
 *
 * 结果只走命令 UI 通道（`HostCommandResult`）：不提交用户消息、不产生模型请求、零 token。
 * @param ports - 宿主能力端口。
 * @returns 可注册的命令（来源为 `origin.kind === 'host'`）。
 */
export function createInventoryCommand(ports: InventoryPorts): RegisteredCommand {
  const invoke: HostCommandInvoke = async ({ agent, rawInput, signal }) => {
    if (rawInput.trim() !== '') {
      return {
        kind: 'error',
        text: `/${INVENTORY_COMMAND_NAME} 不接受参数；用法：${INVENTORY_USAGE}`,
      }
    }
    if (signal.aborted) return cancelled()
    const cwd = readCwd(ports, agent)
    const mcp = readMcp(ports, agent)
    if (signal.aborted) return cancelled()
    const skills = await readSkills(ports, cwd, agent, signal)
    if (signal.aborted) return cancelled()
    const reading: InventoryReading = {
      ...(cwd === undefined ? {} : { cwd }),
      ...(mcp.mcp === undefined ? {} : { mcp: mcp.mcp }),
      ...(mcp.mcpNote === undefined ? {} : { mcpNote: mcp.mcpNote }),
      ...(skills.skills === undefined ? {} : { skills: skills.skills }),
      ...(skills.skillsNote === undefined ? {} : { skillsNote: skills.skillsNote }),
    }
    return { kind: 'success', text: renderInventory(reading) }
  }

  return {
    name: INVENTORY_COMMAND_NAME,
    description: INVENTORY_COMMAND_DESCRIPTION,
    origin: { kind: 'host', invoke },
  }
}

/**
 * 取消时统一的结果。
 * @returns 错误结果（派发方按取消/失败渲染，不提交任何内容）。
 */
function cancelled(): HostCommandResult {
  return { kind: 'error', text: `/${INVENTORY_COMMAND_NAME} 已取消` }
}
