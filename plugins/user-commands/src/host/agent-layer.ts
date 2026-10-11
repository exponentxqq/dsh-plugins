/**
 * 会话（agent）级命令层：项目级命令挂到每个会话自己的上下文里。
 *
 * 项目级命令不是全局注册的，而是在 `agent/created` 时按该会话的归属工作区，
 * 注册到 `agent.ctx` 上的命令服务——这正是 dsh-commands 的官方作用域机制：
 * 挂在该 agent 作用域下的注册对它遮蔽同名全局命令，对其他 agent 毫无影响。
 *
 * 归属判定失败（会话 cwd 不在任何登记根下）时 fail-closed：这一层同步成空清单，
 * 该会话只剩用户级与内置命令；但它仍被登记在册，因为工作区登记之后的重扫应该能把它补上。
 *
 * 每个 agent 的注册集合随该 agent 的 scope 一起退场（`onDispose`），`entries` 里不许留悬挂条目——
 * 会话开得越多、活得越久，这张表越要保证不涨。
 * @module dsh-plugin-user-commands/host/agent-layer
 */

import type { Attribution } from './attribution.ts'
import { CommandLayer, mergeCounts, type CommandRegistrar, type SyncCounts } from './registry.ts'
import type { CommandLog, RegisteredCommand, WorkspaceCommands } from './types.ts'

/** 一个 agent 自己的命令作用域。 */
export interface AgentScope {
  /**
   * 该会话自己的命令作用域就绪时交付注册器。
   *
   * 命令服务经**注入**取得（不是从 `agent.ctx` 上直接读属性）：注册表服务在真机上是按注入
   * 生命周期交付的，直接属性访问会在会话作用域上抛 `cannot get property "commands" without inject`。
   * 服务缺席的部署（无命令适配器的 profile）里这个回调**永远不会运行**，于是天然零注册零报错；
   * 交付也可能晚于 attach（注入是异步激活的），因此注册层必须容忍注册器迟到。
   * @param deliver - 注册器就绪时的交付入口。
   */
  whenReady(deliver: (registrar: CommandRegistrar) => void): void
  /**
   * 把一段清理逻辑交给该 agent 自己的作用域，随它一起销毁。
   * @param teardown - 会话退场时执行的清理。
   */
  onDispose(teardown: () => void): void
}

/** 会话层所需的外部能力。 */
export interface AgentLayerDeps {
  /**
   * 取一个 agent 自己的命令作用域。
   * @param agent - agent 身份（对象本身即作用域键）。
   * @returns 作用域；命令服务缺席由「注册器永不交付」表达，不在这里返回 undefined。
   */
  scopeOf(agent: object): AgentScope
  /**
   * 归属一个会话目录。
   * @param cwd - 会话创建目录。
   * @returns 归属结果，或 null（fail-closed）。
   */
  attribute(cwd: string): Promise<Attribution | null>
  /** 当前的项目级命令扫描结果（各工作区，按登记顺序）。 */
  projects(): readonly WorkspaceCommands[]
  /** 诊断出口。 */
  log: CommandLog
}

/** 一个会话的在册条目。 */
interface Entry {
  /** 该会话的项目级命令层。 */
  readonly layer: CommandLayer
  /** 该会话的创建目录（重同步时重新归属）。 */
  readonly cwd: string
}

/** 全部存活会话的项目级命令层。 */
export class AgentLayers {
  /** agent → 在册条目。 */
  private readonly entries = new Map<object, Entry>()

  /**
   * @param deps - 会话层所需的外部能力。
   */
  constructor(private readonly deps: AgentLayerDeps) {}

  /**
   * 为一个新建会话挂上它的项目级命令。
   * @param agent - 新建的 agent。
   * @param cwd - 会话创建目录。
   */
  async attach(agent: object, cwd: string): Promise<void> {
    if (this.entries.has(agent)) return
    const scope = this.deps.scopeOf(agent)
    const layer = new CommandLayer(this.deps.log, '会话项目级命令')
    this.entries.set(agent, { layer, cwd })
    scope.onDispose(() => {
      this.detach(agent)
    })
    // 注册器可能立刻就来，也可能稍后才来（甚至永远不来）：CommandLayer 会记住期望清单并在
    // 注册器到位时补上，因此这里的顺序不重要。
    scope.whenReady((registrar) => {
      layer.setRegistrar(registrar)
    })

    const plan = await this.plan(cwd)
    // 归属判定是异步的：会话可能在这期间就退场了，那就别再往死掉的作用域里注册。
    if (this.entries.get(agent)?.layer !== layer) return
    layer.sync(plan.commands)
    // 每个会话一行：项目级命令为什么没出现（归属为空？目录里没文件？）在这里一眼可辨。
    this.deps.log.info(
      `会话项目级命令：cwd=${cwd} 归属=${plan.workspaceRoot ?? '无'} 注册=${plan.commands.length}`,
    )
  }

  /**
   * 按当前扫描结果重算全部存活会话的项目级命令。
   * @returns 各会话同步计数的合计。
   */
  async resync(): Promise<SyncCounts> {
    const parts: SyncCounts[] = []
    for (const [agent, entry] of Array.from(this.entries)) {
      if (this.entries.get(agent)?.layer !== entry.layer) continue
      parts.push(entry.layer.sync((await this.plan(entry.cwd)).commands))
    }
    return mergeCounts(...parts)
  }

  /**
   * 摘掉一个会话的层。
   * @param agent - 会话身份。
   */
  detach(agent: object): void {
    const entry = this.entries.get(agent)
    if (entry === undefined) return
    this.entries.delete(agent)
    entry.layer.dispose()
  }

  /** 当前在册的会话数。 */
  size(): number {
    return this.entries.size
  }

  /** 摘掉所有会话的层。 */
  dispose(): void {
    for (const agent of Array.from(this.entries.keys())) this.detach(agent)
  }

  /**
   * 一个会话目录此刻的归属与应注册的项目级命令。
   * @param cwd - 会话创建目录。
   * @returns 归属到的工作区（fail-closed 时为 null）与该工作区的命令清单。
   */
  private async plan(cwd: string): Promise<{
    readonly workspaceRoot: string | null
    readonly commands: readonly RegisteredCommand[]
  }> {
    const attribution = await this.deps.attribute(cwd)
    if (attribution === null) return { workspaceRoot: null, commands: [] }
    const commands = this.deps.projects()
      .find((project) => project.workspaceRoot === attribution.workspaceRoot)?.commands ?? []
    return { workspaceRoot: attribution.workspaceRoot, commands }
  }
}
