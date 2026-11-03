/**
 * `/inventory` 命令实现测试（规范：dsh-user-commands —— 内置 inventory 命令、
 * inventory 的软依赖降级）。
 *
 * 用假端口覆盖全部可观察路径：成功、服务缺席、读取抛错、目录观测不完整、cwd 解析失败、
 * 带参拒绝、取消。命令元数据（文法、保留名、遮蔽关系）也在这里断言。
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_COMMANDS, globalCommands } from '../src/host/builtins.ts'
import { COMMAND_NAME_PATTERN, RESERVED_COMMAND_NAMES } from '../src/host/discovery.ts'
import {
  createInventoryCommand,
  type InventoryPorts,
  type SkillSnapshotLike,
} from '../src/host/inventory-command.ts'
import { INVENTORY_COMMAND_NAME, INVENTORY_USAGE, type SkillSummaryLike } from '../src/host/inventory.ts'
import type { HostCommandInvocation, HostCommandResult, RegisteredCommand } from '../src/host/types.ts'
import { fileCommand, recordingLog } from './helpers.ts'

/** 造一条 skill 摘要（默认两侧可调用）。 */
function summary(
  name: string,
  extra: { modelInvocable?: boolean; userInvocable?: boolean; source?: string } = {},
): SkillSummaryLike {
  return {
    name,
    description: `${name} 的描述`,
    invocation: {
      modelInvocable: extra.modelInvocable ?? true,
      userInvocable: extra.userInvocable ?? true,
    },
    source: extra.source ?? 'user-agents',
  }
}

/** 一次命令调用（agent 用空对象占位：端口是假的，不读真实宿主结构）。 */
function invocation(rawInput = '', signal: AbortSignal = new AbortController().signal): HostCommandInvocation {
  return { agent: {}, rawInput, signal }
}

/** 假端口装置：记录每类读取被调用几次。 */
function harness(overrides: Partial<InventoryPorts> = {}): {
  command: RegisteredCommand
  calls: { cwd: number; tools: number; skills: number }
  warnings: string[]
  errors: string[]
} {
  const { log, warnings, errors } = recordingLog()
  const calls = { cwd: 0, tools: 0, skills: 0 }
  const ports: InventoryPorts = {
    log,
    cwd: () => {
      calls.cwd += 1
      return '/home/xu/work'
    },
    toolNames: () => {
      calls.tools += 1
      return ['mcp__alpha__search', 'read_file']
    },
    skillSnapshot: async () => {
      calls.skills += 1
      return { skills: [summary('alpha')], complete: true }
    },
    ...overrides,
  }
  return { command: createInventoryCommand(ports), calls, warnings, errors }
}

/**
 * 执行一条宿主型命令。
 * @param command - 待执行命令。
 * @param request - 调用入参。
 * @returns 命令结果。
 */
async function run(command: RegisteredCommand, request: HostCommandInvocation): Promise<HostCommandResult> {
  const origin = command.origin
  if (origin.kind !== 'host') throw new Error('expected a host-origin command')
  return await origin.invoke(request)
}

/** 断言结果成功并取出文本。 */
function successText(result: HostCommandResult): string {
  expect(result.kind).toBe('success')
  return result.kind === 'success' ? (result.text ?? '') : ''
}

/** 断言结果错误并取出文本。 */
function errorText(result: HostCommandResult): string {
  expect(result.kind).toBe('error')
  return result.kind === 'error' ? result.text : ''
}

describe('/inventory 元数据', () => {
  it('命令名满足文法、不占保留名，来源是宿主型，带发现说明', () => {
    const { command } = harness()

    expect(command.name).toBe(INVENTORY_COMMAND_NAME)
    expect(COMMAND_NAME_PATTERN.test(command.name)).toBe(true)
    expect(RESERVED_COMMAND_NAMES).not.toContain(command.name)
    expect(command.origin.kind).toBe('host')
    expect(command.description.length).toBeGreaterThan(0)
    expect(command.description).toContain('MCP')
    expect(command.description).toContain('skill')
  })

  it('用户级同名文件遮蔽内置 /inventory（与 /init 同一遮蔽规则）', () => {
    const { command } = harness()

    const resolved = globalCommands(
      [fileCommand('inventory', '/home/u/.dsh/commands/inventory.md', { layer: 'user' })],
      [...BUILTIN_COMMANDS, command],
    )

    // 用户级 inventory 遮蔽内置 inventory；其余内置（/init）不受影响。
    expect(resolved.map((entry) => entry.name).sort()).toEqual(['init', 'inventory'])
    expect(resolved.find((entry) => entry.name === 'inventory')?.origin.kind).toBe('file')
  })
})

describe('/inventory 成功路径', () => {
  it('两段清单都输出，cwd 首行、MCP 只计 mcp__ 工具、skill 带调用方式', async () => {
    const { command, calls } = harness()

    const text = successText(await run(command, invocation()))

    expect(text).toContain('会话清单（cwd：/home/xu/work）')
    expect(text).toContain('MCP 服务器（1 台，共 1 个工具）')
    expect(text).toContain('- alpha：1 个工具')
    expect(text).toContain('Skill（1 个）')
    expect(text).toContain('- alpha — alpha 的描述（模型+/name，用户(agents)）')
    expect(calls).toEqual({ cwd: 1, tools: 1, skills: 1 })
  })

  it('skill 目录按模型/用户调用策略过滤', async () => {
    const { command } = harness({
      skillSnapshot: async () => ({
        skills: [summary('both'), summary('ghost', { modelInvocable: false, userInvocable: false })],
        complete: true,
      }),
    })

    const text = successText(await run(command, invocation()))

    expect(text).toContain('Skill（1 个）')
    expect(text).toContain('- both')
    expect(text).not.toContain('ghost')
  })
})

describe('/inventory 降级路径', () => {
  it('tools 服务缺席：MCP 段说明，Skill 段照常', async () => {
    const { command } = harness({ toolNames: () => undefined })

    const text = successText(await run(command, invocation()))

    expect(text).toContain('MCP 服务器：当前部署未提供 tools 服务，无法读取')
    expect(text).toContain('Skill（1 个）')
  })

  it('读取可见工具面抛错：MCP 段给出失败说明、写诊断日志，命令仍成功', async () => {
    const { command, errors } = harness({
      toolNames: () => {
        throw new Error('registry exploded')
      },
    })

    const text = successText(await run(command, invocation()))

    expect(text).toContain('读取可见工具面失败：registry exploded')
    expect(text).toContain('Skill（1 个）')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('/inventory')
  })

  it('skills 服务缺席：Skill 段说明，MCP 段照常', async () => {
    const { command } = harness({ skillSnapshot: async () => undefined })

    const text = successText(await run(command, invocation()))

    expect(text).toContain('MCP 服务器（1 台，共 1 个工具）')
    expect(text).toContain('Skill：当前部署未提供 skills 服务，无法读取')
  })

  it('读取 skill 目录抛错：Skill 段给出失败说明，命令仍成功', async () => {
    const { command, errors } = harness({
      skillSnapshot: async () => {
        throw new Error('provider failed')
      },
    })

    const text = successText(await run(command, invocation()))

    expect(text).toContain('Skill：读取 skill 目录失败：provider failed')
    expect(errors).toHaveLength(1)
  })

  it('目录观测不完整时标注可能缺项', async () => {
    const { command } = harness({
      skillSnapshot: async (): Promise<SkillSnapshotLike> => ({ skills: [summary('alpha')], complete: false }),
    })

    const text = successText(await run(command, invocation()))

    expect(text).toContain('技能目录观测不完整，列表可能缺项')
  })

  it('cwd 解析失败：告警并标注项目级 skill 可能缺失，命令仍成功', async () => {
    const { command, warnings } = harness({
      cwd: () => {
        throw new Error('no session')
      },
    })

    const text = successText(await run(command, invocation()))

    expect(text).toContain('会话清单（cwd：未知）')
    expect(text).toContain('未能解析会话工作目录，项目级 skill 可能缺失')
    expect(warnings).toHaveLength(1)
  })
})

describe('/inventory 输入边界', () => {
  it('带参调用返回错误与用法，且不读任何服务', async () => {
    const { command, calls } = harness()

    const text = errorText(await run(command, invocation(' foo')))

    expect(text).toContain('不接受参数')
    expect(text).toContain(INVENTORY_USAGE)
    expect(calls).toEqual({ cwd: 0, tools: 0, skills: 0 })
  })

  it('调用前已取消：返回取消结果，且不读任何服务', async () => {
    const { command, calls } = harness()
    const controller = new AbortController()
    controller.abort()

    const text = errorText(await run(command, invocation('', controller.signal)))

    expect(text).toContain('已取消')
    expect(calls).toEqual({ cwd: 0, tools: 0, skills: 0 })
  })

  it('读取 skill 期间被取消：不返回半份清单', async () => {
    const controller = new AbortController()
    const { command } = harness({
      skillSnapshot: async () => {
        controller.abort()
        return { skills: [summary('alpha')], complete: true }
      },
    })

    const text = errorText(await run(command, invocation('', controller.signal)))

    expect(text).toContain('已取消')
  })
})
