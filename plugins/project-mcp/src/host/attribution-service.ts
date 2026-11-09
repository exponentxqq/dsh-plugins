/**
 * 项目级 MCP 的跨插件归属查询服务（`ctx.get('projectMcp')`）。
 *
 * 会话级隔离只覆盖「会话视角」的读数（`isolation.ts` 按 agent 逐个装配 deny 集）；
 * **按工作区路径**的读数没有宿主面——工作区默认档页面按目标工作区（而非某个会话）列
 * 清单时，需要回答「该工作区配置了哪些项目级服务器」。本服务把 manager 的两条 claim
 * 读数与归属器缝合成一个薄查询面：
 *
 * - {@link ProjectMcpAttributionService.managedServerNames}：全部项目级声明（不分工作区）；
 * - {@link ProjectMcpAttributionService.serverNamesForWorkspace}：工作区规范路径 → 根集归属 →
 *   该根集下的声明。
 *
 * 两条读数都停在 **claim** 语义（与 `McpManager.serverNamesForRoots` 同一条纪律）：加载中
 * 或等待重试的服务器也算「本工作区配置的」——页面列的是配置意图，不是运行态。
 *
 * 发布形态照搬 `dsh-workspace` 的 `WorkspaceRegistry`：cordis `Service` 子类，构造即注册、
 * 随本插件 fiber 卸载自动移除。消费方（session-tool-toggle）软读 `ctx.get('projectMcp')`，
 * 服务缺席 = 没有任何项目级 MCP，由消费方自行降级。
 * @module dsh-plugin-project-mcp/host/attribution-service
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { RootAttributor } from './attribution.ts'
import type { McpManager } from './mcp-manager.ts'

/**
 * 服务名（`ctx.get('projectMcp')` 的键）。
 *
 * camelCase 与宿主核心服务（`workspaceRegistry` / `tools` / `skills`）同一命名形态；声明
 * `declare module '@deepseek-ai/cordis'` 扩充供消费方获得类型提示（本包内）。
 */
export const PROJECT_MCP_SERVICE_NAME = 'projectMcp' as const

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 项目级 MCP 归属查询服务（{@link ProjectMcpAttributionService} 的公开面）。 */
    projectMcp: ProjectMcpAttribution
  }
}

/**
 * 服务公开面（消费方按此窄面收窄 `ctx.get('projectMcp')` 的读数）。
 *
 * 有意只暴露两条读数：加载态、失败标记、隔离 deny 集等运行态细节都留在 manager——
 * 页面要的是「谁配置了什么」，不是「谁此刻活着」（运行态由会话级隔离负责）。
 */
export interface ProjectMcpAttribution {
  /**
   * 全部项目级服务器声明（不分工作区；含加载中 / 失败的 claim）。
   * @returns 按服务器名的集合，每次调用现算。
   */
  managedServerNames(): ReadonlySet<string>
  /**
   * 按工作区规范路径读该工作区配置的服务器声明。
   * @param path - 工作区规范路径（登记表 spelling）。
   * @returns 该工作区根集下的声明集合；路径不被任何工作区认领时为 `null`（**不是空集**：
   * null = 归属失败，消费方应视为读数不可用而非「无项目级配置」）。
   * @throws 归属器读数抛错时原样上抛（canonicalization IO 失败等）——降级决策归消费方。
   */
  serverNamesForWorkspace(path: string): Promise<ReadonlySet<string> | null>
}

/**
 * 把 manager 与归属器缝合成 {@link PROJECT_MCP_SERVICE_NAME} 服务。
 *
 * 构造即注册（cordis `Service` 语义）；本插件 fiber 卸载时服务随之消失，消费方的
 * `ctx.get('projectMcp')` 退回 `undefined`——「无项目级 MCP」的正确读数。
 */
export class ProjectMcpAttributionService extends Service implements ProjectMcpAttribution {
  /**
   * @param ctx - 宿主上下文（服务注册到它身上）。
   * @param manager - 项目级 MCP 管理器（claim 读数的真源）。
   * @param attributor - 会话/目录 → 工作区归属器（与隔离层共用同一实例，同一快照语义）。
   */
  constructor(
    ctx: Context,
    private readonly manager: McpManager,
    private readonly attributor: RootAttributor,
  ) {
    super(ctx, PROJECT_MCP_SERVICE_NAME)
  }

  /** @inheritdoc */
  managedServerNames(): ReadonlySet<string> {
    return this.manager.managedServerNames()
  }

  /** @inheritdoc */
  async serverNamesForWorkspace(path: string): Promise<ReadonlySet<string> | null> {
    const attribution = await this.attributor.attribute(path)
    if (attribution === null) return null
    return this.manager.serverNamesForRoots(new Set(attribution.roots))
  }
}
