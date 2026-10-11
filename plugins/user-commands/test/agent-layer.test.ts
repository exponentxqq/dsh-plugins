/**
 * 会话（agent）级命令层测试（规范：dsh-user-commands —— 三层优先级与会话遮蔽）。
 *
 * 用一个「全局层 + 按 agent 的作用域层」的假命令注册表（合并时作用域遮蔽全局，
 * 与 dsh-commands 的语义一致）来验证：项目级命令只进会话自己的层、归属失败 fail-closed、
 * 会话退场时清理、多工作区互不串扰。
 */
import { describe, expect, it } from 'vitest'
import { AgentLayers, type AgentScope } from '../src/host/agent-layer.ts'
import type { Attribution } from '../src/host/attribution.ts'
import { BUILTIN_COMMANDS, globalCommands, INIT_PROMPT } from '../src/host/builtins.ts'
import { CommandLayer, type CommandRegistrar } from '../src/host/registry.ts'
import type { RegisteredCommand, WorkspaceCommands } from '../src/host/types.ts'
import { fileCommand, recordingLog } from './helpers.ts'

/** 假的命令注册表：全局层 + 按 agent 的作用域层，作用域层遮蔽同名全局命令。 */
function layeredCommands(): {
  global: CommandRegistrar
  scopeOf: (agent: object) => AgentScope
  rawRegistrar: (agent: object) => CommandRegistrar
  find: (agent: object, name: string) => RegisteredCommand | undefined
  dispose: (agent: object) => void
  scopedNames: (agent: object) => readonly string[]
} {
  const globalLayer = new Map<string, RegisteredCommand>()
  const scopedLayers = new Map<object, Map<string, RegisteredCommand>>()
  const teardowns = new Map<object, () => void>()

  const registrarFor = (agent?: object): CommandRegistrar => ({
    register: (command) => {
      let layer = globalLayer
      if (agent !== undefined) {
        let existing = scopedLayers.get(agent)
        if (existing === undefined) {
          existing = new Map()
          scopedLayers.set(agent, existing)
        }
        layer = existing
      }
      if (layer.has(command.name)) throw new Error(`command "${command.name}" is already registered`)
      layer.set(command.name, command)
      return () => {
        layer.delete(command.name)
      }
    },
  })

  return {
    global: registrarFor(),
    rawRegistrar: (agent) => registrarFor(agent),
    scopeOf: (agent) => ({
      // 真机里注册器经 `agent.ctx.inject(['commands'], …)` 异步交付；假件同步交付同一语义。
      whenReady: (deliver) => {
        deliver(registrarFor(agent))
      },
      onDispose: (teardown) => {
        teardowns.set(agent, teardown)
      },
    }),
    find: (agent, name) => scopedLayers.get(agent)?.get(name) ?? globalLayer.get(name),
    // 会话退场：真实实现里由 agent.ctx.effect 触发，这里手动触发同一段清理。
    dispose: (agent) => {
      teardowns.get(agent)?.()
    },
    scopedNames: (agent) => [...(scopedLayers.get(agent)?.keys() ?? [])],
  }
}

/** 只含主根的工作区项目级命令。 */
function projectCommands(root: string, commands: readonly RegisteredCommand[]): WorkspaceCommands {
  return { workspaceRoot: root, commands }
}

/**
 * 造一套会话层装置（归属与扫描结果都可在测试中改）。
 * @param initial - 初始项目级命令扫描结果。
 * @returns 装置与可变入口。
 */
function harness(initial: readonly WorkspaceCommands[]) {
  const commands = layeredCommands()
  const { log, warnings, errors } = recordingLog()
  let scan = initial
  let attributed: Attribution | null = null

  const agents = new AgentLayers({
    scopeOf: (agent) => commands.scopeOf(agent),
    attribute: async () => attributed,
    projects: () => scan,
    log,
  })

  return {
    commands,
    agents,
    warnings,
    errors,
    setProjects: (next: readonly WorkspaceCommands[]) => {
      scan = next
    },
    setAttribution: (next: Attribution | null) => {
      attributed = next
    },
  }
}

describe('会话层注册', () => {
  it('项目级命令注册进会话自己的层，遮蔽同名用户级命令', async () => {
    const commands = layeredCommands()
    commands.global.register(fileCommand('deploy', '/home/u/.dsh/commands/deploy.md', { layer: 'user', description: '用户级部署' }))
    const { log } = recordingLog()
    const agents = new AgentLayers({
      scopeOf: (agent) => commands.scopeOf(agent),
      attribute: async () => ({ workspaceRoot: '/work/a', roots: ['/work/a'] }),
      projects: () => [projectCommands('/work/a', [
        fileCommand('deploy', '/work/a/.dsh/commands/deploy.md', { workspaceRoot: '/work/a', description: '项目级部署' }),
      ])],
      log,
    })
    const agent = {}

    await agents.attach(agent, '/work/a')

    expect(agents.size()).toBe(1)
    expect(commands.find(agent, 'deploy')?.description).toBe('项目级部署')
    // 全局层没被动过：别的会话仍然用用户级定义。
    expect(commands.find({}, 'deploy')?.description).toBe('用户级部署')
  })

  it('两个工作区各自只看到自己根集合的命令（不串扰）', async () => {
    const commands = layeredCommands()
    const { log } = recordingLog()
    let attributed: Attribution | null = null
    const projects = [
      projectCommands('/work/a', [
        fileCommand('deploy', '/work/a/.dsh/commands/deploy.md', { workspaceRoot: '/work/a', description: 'A 的部署' }),
        fileCommand('only-a', '/work/a/.dsh/commands/only-a.md', { workspaceRoot: '/work/a' }),
      ]),
      projectCommands('/work/b', [
        fileCommand('deploy', '/work/b/.dsh/commands/deploy.md', { workspaceRoot: '/work/b', description: 'B 的部署' }),
      ]),
    ]
    const agents = new AgentLayers({
      scopeOf: (agent) => commands.scopeOf(agent),
      attribute: async () => attributed,
      projects: () => projects,
      log,
    })
    const sessionA = {}
    const sessionB = {}

    attributed = { workspaceRoot: '/work/a', roots: ['/work/a'] }
    await agents.attach(sessionA, '/work/a')
    attributed = { workspaceRoot: '/work/b', roots: ['/work/b'] }
    await agents.attach(sessionB, '/work/b')

    expect(commands.find(sessionA, 'deploy')?.description).toBe('A 的部署')
    expect(commands.find(sessionB, 'deploy')?.description).toBe('B 的部署')
    expect(commands.scopedNames(sessionB)).toEqual(['deploy'])
    expect(commands.find(sessionB, 'only-a')).toBeUndefined()
  })

  it('归属失败时 fail-closed：只剩全局层，且会话仍在册以便登记后补挂', async () => {
    const { commands, agents, errors, setAttribution } = harness([
      projectCommands('/work/a', [fileCommand('deploy', '/work/a/.dsh/commands/deploy.md', { workspaceRoot: '/work/a' })]),
    ])
    const agent = {}

    setAttribution(null)
    await agents.attach(agent, '/tmp/elsewhere')

    expect(agents.size()).toBe(1)
    expect(commands.scopedNames(agent)).toEqual([])
    expect(errors).toEqual([])

    // 工作区随后被登记：重扫把命令补上。
    setAttribution({ workspaceRoot: '/work/a', roots: ['/work/a'] })
    await agents.resync()

    expect(commands.scopedNames(agent)).toEqual(['deploy'])
  })

  it('会话退场时注销自己的注册并从表里摘掉', async () => {
    const { commands, agents, setAttribution } = harness([
      projectCommands('/work/a', [fileCommand('deploy', '/work/a/.dsh/commands/deploy.md', { workspaceRoot: '/work/a' })]),
    ])
    const agent = {}
    setAttribution({ workspaceRoot: '/work/a', roots: ['/work/a'] })
    await agents.attach(agent, '/work/a')
    expect(commands.scopedNames(agent)).toEqual(['deploy'])

    commands.dispose(agent)

    expect(agents.size()).toBe(0)
    expect(commands.scopedNames(agent)).toEqual([])
  })

  it('没有命令服务（注册器永不交付）时零注册、零日志', async () => {
    const { log, warnings, errors } = recordingLog()
    const agents = new AgentLayers({
      scopeOf: () => ({
        // 无命令适配器的部署：注入的回调永远不会运行。
        whenReady: () => {},
        onDispose: () => {},
      }),
      attribute: async () => ({ workspaceRoot: '/work/a', roots: ['/work/a'] }),
      projects: () => [projectCommands('/work/a', [fileCommand('deploy', '/work/a/.dsh/commands/deploy.md')])],
      log,
    })

    await agents.attach({}, '/work/a')

    expect(agents.size()).toBe(1)
    expect([...warnings, ...errors]).toEqual([])
  })

  it('注册器迟到（注入异步激活）时补注册已记住的期望清单', async () => {
    const commands = layeredCommands()
    const { log } = recordingLog()
    let deliver: ((registrar: CommandRegistrar) => void) | undefined
    const agents = new AgentLayers({
      scopeOf: (agent) => ({
        whenReady: (callback) => {
          deliver = callback
          void agent
        },
        onDispose: () => {},
      }),
      attribute: async () => ({ workspaceRoot: '/work/a', roots: ['/work/a'] }),
      projects: () => [projectCommands('/work/a', [
        fileCommand('deploy', '/work/a/.dsh/commands/deploy.md', { workspaceRoot: '/work/a' }),
      ])],
      log,
    })
    const agent = {}

    await agents.attach(agent, '/work/a')
    expect(commands.scopedNames(agent)).toEqual([])

    deliver?.(commands.rawRegistrar(agent))

    expect(commands.scopedNames(agent)).toEqual(['deploy'])
  })

  it('重复 attach 同一个会话是幂等的', async () => {
    const { commands, agents, setAttribution } = harness([
      projectCommands('/work/a', [fileCommand('deploy', '/work/a/.dsh/commands/deploy.md', { workspaceRoot: '/work/a' })]),
    ])
    const agent = {}
    setAttribution({ workspaceRoot: '/work/a', roots: ['/work/a'] })

    await agents.attach(agent, '/work/a')
    await agents.attach(agent, '/work/a')

    expect(agents.size()).toBe(1)
    expect(commands.scopedNames(agent)).toEqual(['deploy'])
  })

  it('项目级命令被移除后重同步会注销它', async () => {
    const { commands, agents, setProjects, setAttribution } = harness([
      projectCommands('/work/a', [fileCommand('deploy', '/work/a/.dsh/commands/deploy.md', { workspaceRoot: '/work/a' })]),
    ])
    const agent = {}
    setAttribution({ workspaceRoot: '/work/a', roots: ['/work/a'] })
    await agents.attach(agent, '/work/a')

    setProjects([projectCommands('/work/a', [])])
    await agents.resync()

    expect(commands.scopedNames(agent)).toEqual([])
  })

  it('dispose 摘掉全部在册会话', async () => {
    const { commands, agents, setAttribution } = harness([
      projectCommands('/work/a', [fileCommand('deploy', '/work/a/.dsh/commands/deploy.md', { workspaceRoot: '/work/a' })]),
    ])
    const first = {}
    const second = {}
    setAttribution({ workspaceRoot: '/work/a', roots: ['/work/a'] })
    await agents.attach(first, '/work/a')
    await agents.attach(second, '/work/a')

    agents.dispose()

    expect(agents.size()).toBe(0)
    expect(commands.scopedNames(first)).toEqual([])
    expect(commands.scopedNames(second)).toEqual([])
  })
})

describe('全局层与会话层的组合（遮蔽链）', () => {
  it('项目级遮蔽用户级、用户级遮蔽内置', async () => {
    const commands = layeredCommands()
    const { log } = recordingLog()
    const globalLayer = new CommandLayer(log, '全局命令层')
    globalLayer.setRegistrar(commands.global)
    // 用户级同时写了 deploy 与 init，后者遮蔽内置 /init。
    globalLayer.sync(globalCommands([
      fileCommand('deploy', '/home/u/.dsh/commands/deploy.md', { layer: 'user', description: '用户级部署' }),
      fileCommand('init', '/home/u/.dsh/commands/init.md', { layer: 'user', description: '用户级 init' }),
    ], BUILTIN_COMMANDS))

    const agents = new AgentLayers({
      scopeOf: (agent) => commands.scopeOf(agent),
      // 只有 /work/a 下的会话归属得上：/tmp/elsewhere 走 fail-closed，只剩用户级定义。
      attribute: async (cwd) => (cwd.startsWith('/work/a') ? { workspaceRoot: '/work/a', roots: ['/work/a'] } : null),
      projects: () => [projectCommands('/work/a', [
        fileCommand('deploy', '/work/a/.dsh/commands/deploy.md', { workspaceRoot: '/work/a', description: '项目级部署' }),
      ])],
      log,
    })
    const inWorkspace = {}
    const outsideWorkspace = {}
    await agents.attach(inWorkspace, '/work/a')
    await agents.attach(outsideWorkspace, '/tmp/elsewhere')

    expect(commands.find(inWorkspace, 'deploy')?.description).toBe('项目级部署')
    expect(commands.find(outsideWorkspace, 'deploy')?.description).toBe('用户级部署')
    expect(commands.find(inWorkspace, 'init')?.description).toBe('用户级 init')
  })

  it('用户级没有同名文件时内置 /init 对所有会话可用', async () => {
    const commands = layeredCommands()
    const globalLayer = new CommandLayer(recordingLog().log, '全局命令层')
    globalLayer.setRegistrar(commands.global)
    globalLayer.sync(globalCommands([], BUILTIN_COMMANDS))

    expect(commands.find({}, 'init')?.origin).toEqual({ kind: 'builtin', prompt: INIT_PROMPT })
  })
})
