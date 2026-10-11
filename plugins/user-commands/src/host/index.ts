/**
 * 插件主体：把用户自定义斜杠命令接到 dsh 宿主上。
 *
 * 各块是刻意分开且各自可单测的——`discovery` 负责发现与仲裁，`frontmatter` 负责解析，
 * `attribution` 决定会话属于哪个工作区，`registry` / `agent-layer` 负责分层注册，
 * `invocation` 负责执行，`watcher` 与 `triggers` 负责让结果失效。本模块只把它们接到宿主上下文上，
 * 并负责顺序：
 *
 * 1. 启动即重扫：已有的用户级/项目级命令不需要重启；
 * 2. `commands` 服务一到就注册全局层（用户级 + 内置），并装上 `/commands-reload` 兜底；
 * 3. `agent/created` 时把该会话归属工作区的项目级命令挂到它自己的作用域上；
 * 4. 登记变化、文件系统事件、兜底命令全部汇进**同一条串行重扫队列**，重叠触发只会收敛而不是交错；
 * 5. fiber 卸载时释放监听器、会话层、全局层与触发器。
 *
 * 重扫之所以串行，是因为它是声明式的：每次都重读登记表、重扫每个根、把完整的目标集合交给注册层，
 * 由注册层算差量。两次重扫抢跑只是白做工——反正后一次说了算。
 * @module dsh-plugin-user-commands/host
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-workspace'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { AgentLayers, type AgentScope } from './agent-layer.ts'
import { Attributor } from './attribution.ts'
import { BUILTIN_COMMANDS, globalCommands } from './builtins.ts'
import { discoverCommands } from './discovery.ts'
import { commandLog, nodeCommandIo, nodeRealpathIo, nodeWatchIo, userCommandsDir } from './host-io.ts'
import { invokeCommand } from './invocation.ts'
import { CommandLayer, EMPTY_COUNTS, mergeCounts, reloadText, type CommandRegistrar, type SyncCounts } from './registry.ts'
import { workspaceRoots } from './roots.ts'
import { installTriggers } from './triggers.ts'
import type { CommandLog, RegisteredCommand, WorkspaceCommands } from './types.ts'
import { DirectoryWatcher, watchTargets } from './watcher.ts'

/** loader 诊断用的插件名（也是 bundle 行的 id）。 */
export const name = 'user-commands'

/**
 * 本插件不硬依赖任何服务。
 *
 * 命令服务（`commands`）只经 `ctx.inject(['commands'])` 软接入——无命令适配器的部署里
 * 那个回调根本不会运行，插件保持零注册零报错；工作区登记表与 multi-root registry 都是
 * 调用时 `ctx.get` 的软依赖（缺席时只剩用户级与内置命令）。
 */
export const inject: string[] = []

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * 任意持久化域变更。这里就地声明，因为本包不依赖声明它的那个包；运行中的宿主无论如何都会发它。
     * 本插件只当触发器用，从不读载荷（见 `triggers.ts`）。
     */
    'domain/changed'(change: unknown): void
  }
}

/** 本插件用到的命令注册表服务面。 */
interface CommandsService {
  /**
   * 注册一条命令。
   * @param definition - 发现元数据与直连 UI 的 handler。
   * @returns 注销该定义的 disposer。
   */
  register(definition: CommandDefinition): () => void
}

/**
 * 把一层的命令服务包成注册器。
 *
 * handler 落在**被调用的那个会话**上：`/deploy` 在哪个会话里执行，展开后的 prompt 就提交给哪个会话；
 * 正文仍然现读（见 `invocation.ts`），所以注册时给出的只是发现菜单需要的那点信息。
 * @param commands - 该层的命令服务。
 * @param log - 诊断出口。
 * @returns 该层的注册器。
 */
function registrarFor(commands: CommandsService, log: CommandLog): CommandRegistrar {
  return {
    register: (command: RegisteredCommand) => commands.register({
      name: command.name,
      description: command.description,
      ...(command.hint === undefined ? {} : { input: { hint: command.hint } }),
      handler: ({ agent, rawInput }) => invokeCommand(command, rawInput, {
        readFile: nodeCommandIo.readFile,
        log,
        submit: (text) => {
          agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
        },
      }),
    }),
  }
}

/**
 * 取一个 agent 自己的命令作用域。
 *
 * 命令服务经 **`agent.ctx.inject(['commands'], …)`** 取得——这是 dsh-commands 文档规定的
 * agent 级注册形态：注入建立的是一个挂在会话上下文之下的子 fiber，服务代理因此把注册绑到
 * 该会话自己的作用域上，同名全局命令被遮蔽，而其他会话毫无影响。
 *
 * 不能改成 `agent.ctx.commands` 直接读属性：会话上下文是 agent scope 的载体 fiber，
 * 属性访问的服务解析会在那里中断（真机实测 `cannot get property "commands" without inject`），
 * 结果就是项目级命令整批消失。
 *
 * 服务缺席的部署（无命令适配器的 profile）里注入的回调永远不会运行：零注册、零报错。
 * @param agent - 新建的 agent。
 * @param log - 诊断出口。
 * @returns 该 agent 的作用域。
 */
function agentScopeOf(agent: Agent, log: CommandLog): AgentScope {
  return {
    whenReady: (deliver) => {
      agent.ctx.inject(['commands'], (scope) => {
        deliver(registrarFor(scope.commands, log))
      })
    },
    onDispose: (teardown) => {
      agent.ctx.effect(() => teardown, 'dsh-plugin-user-commands: 会话项目级命令')
    },
  }
}

/**
 * 把用户自定义命令挂到宿主上下文上。
 * @param ctx - 宿主上下文。
 */
export function apply(ctx: Context): void {
  const log = commandLog(ctx)
  const userDir = userCommandsDir()
  const attributor = new Attributor(nodeRealpathIo)
  const globalLayer = new CommandLayer(log, '全局命令层')
  /** 最近一次扫描出的项目级命令（会话层同步要用同一份事实）。 */
  let projects: readonly WorkspaceCommands[] = []

  const agents = new AgentLayers({
    scopeOf: (agent) => agentScopeOf(agent as Agent, log),
    attribute: async (cwd) => await attributor.attribute(cwd),
    projects: () => projects,
    log,
  })

  /** 串行化的重扫队列。 */
  let queue: Promise<SyncCounts> = Promise.resolve(EMPTY_COUNTS)

  const watcher = new DirectoryWatcher(nodeWatchIo, () => {
    background()
  }, log)

  /**
   * 报告一个没人等在后面的失败。
   * @param error - 失败原因。
   */
  function reportFailure(error: unknown): void {
    log.error(`重扫失败：${String(error)}`)
  }

  /** 在后台重扫，失败只报告不抛出。 */
  function background(): void {
    void rescan().catch(reportFailure)
  }

  /**
   * 一趟完整重扫：登记表 → 根集合 → 发现 → 全局层 → 会话层 → 监听目标。
   * @param runLog - 这一趟的日志（兜底命令用它数跳过数）。
   * @returns 本次同步的计数。
   */
  async function performRescan(runLog: CommandLog): Promise<SyncCounts> {
    const workspaces = workspaceRoots(ctx)
    // 根集合先更新：归属判定必须与扫描用的是同一份根集合。
    await attributor.update(workspaces)
    const scan = await discoverCommands({ userDir, workspaces }, nodeCommandIo, runLog)
    projects = scan.projects
    const globalCounts = globalLayer.sync(globalCommands(scan.user, BUILTIN_COMMANDS))
    const agentCounts = await agents.resync()
    watcher.arm(await watchTargets(nodeWatchIo, userDir, workspaces.flatMap((workspace) => workspace.roots)))
    return mergeCounts(globalCounts, agentCounts)
  }

  /**
   * 排进一趟完整重扫。
   * @param runLog - 这一趟的日志。
   * @returns 该趟结束后兑现的计数。
   */
  function rescan(runLog: CommandLog = log): Promise<SyncCounts> {
    const run = queue.then(
      () => performRescan(runLog),
      () => performRescan(runLog),
    )
    queue = run.then(
      () => EMPTY_COUNTS,
      () => EMPTY_COUNTS,
    )
    return run
  }

  // 1. 全局层（用户级 + 内置）与兜底命令：两者共用同一个 commands 注入，
  //    这样服务出现/消失时注册与兜底命令一起装上/摘下，不存在半开状态。
  ctx.inject(['commands'], (scope) => {
    scope.effect(() => {
      const reload = scope.commands.register({
        name: 'commands-reload',
        description: '重新扫描用户级与项目级命令目录，并更新全局层与各会话的项目级命令注册',
        handler: async () => {
          let skipped = 0
          const countingLog: CommandLog = {
            info: (message) => {
              log.info(message)
            },
            warn: (message) => {
              log.warn(message)
            },
            error: (message) => {
              skipped += 1
              log.error(message)
            },
          }
          try {
            const counts = await rescan(countingLog)
            return { kind: 'success', text: reloadText(counts, skipped) }
          } catch (error) {
            return { kind: 'error', text: `重扫失败：${String(error)}` }
          }
        },
      })
      globalLayer.setRegistrar(registrarFor(scope.commands, log))
      return () => {
        globalLayer.setRegistrar(undefined)
        reload()
      }
    }, 'dsh-plugin-user-commands: /commands-reload')
  })

  // 2. 会话层：项目级命令挂到会话自己的作用域上，随会话退场。
  //    attach 的 promise 是**特意返回**的：`agent/created` 是串行公告，注册表会等它兑现之后
  //    才允许会话走第一步，因此一个会话不会在项目级命令还没挂上时就开始用命令。
  //    失败只报告，不拒绝它所依附的创建流程。
  ctx.on('agent/created', ({ agent }) => {
    // 会话头里的 cwd 是可选的（历史会话可能没有）；缺失按「归属不上」处理，fail-closed。
    return agents.attach(agent, agent.session.header.cwd ?? '').then(
      () => undefined,
      (error: unknown) => {
        log.error(`无法为会话注册项目级命令：${String(error)}`)
        return undefined
      },
    )
  })

  // 3. 工作区登记或附加根授予变化会改变根集合本身，因此要全量重扫而不是重算一层。
  const triggers = installTriggers(ctx, () => {
    background()
  })

  // 4. 卸载：本插件装下的一切随 fiber 一起走。
  ctx.effect(() => () => {
    watcher.dispose()
    agents.dispose()
    globalLayer.dispose()
    for (const dispose of triggers) dispose()
  }, 'dsh-plugin-user-commands: teardown')

  // 5. 启动重扫：已经有命令文件的工作区不需要重启。
  background()
}
