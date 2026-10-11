/**
 * `/commands-reload` 与降级测试（规范：dsh-user-commands —— 热刷新与手动重载、无命令服务降级）。
 *
 * 用假的宿主上下文驱动真实的 `apply()`：无 commands 服务时插件必须零注册、零报错；
 * 有 commands 服务时兜底命令必须注册、能返回计数文案，并且在命令文件有问题时把「跳过」数报出来。
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation } from '@deepseek-ai/dsh-commands'
import { apply } from '../src/host/index.ts'
import { EMPTY_COUNTS, reloadText } from '../src/host/registry.ts'

/** 假上下文：记录日志、注册与清理，可切换是否提供 commands 服务。 */
function fakeContext(withCommands: boolean) {
  const infos: string[] = []
  const warnings: string[] = []
  const errors: string[] = []
  const definitions = new Map<string, CommandDefinition>()
  const cleanups: (() => void)[] = []
  const service = {
    register: (definition: CommandDefinition) => {
      definitions.set(definition.name, definition)
      return () => {
        definitions.delete(definition.name)
      }
    },
  }
  const ctx = {
    logger: {
      info: (message: string) => infos.push(message),
      warn: (message: string) => warnings.push(message),
      error: (message: string) => errors.push(message),
    },
    get: (name: string) => (name === 'workspaceRegistry' ? { list: () => [] } : undefined),
    inject: (deps: readonly string[], callback: (scope: unknown) => unknown) => {
      if (withCommands) callback({ commands: service, effect: (factory: () => () => void) => factory() })
    },
    on: () => () => {},
    effect: (factory: () => () => void) => {
      cleanups.push(factory())
    },
  }
  return { ctx: ctx as unknown as Context, infos, warnings, errors, definitions, cleanups }
}

/** 让后台重扫跑完。 */
async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 30)
  })
}

/**
 * 等到某个条件成立。
 *
 * 启动重扫是后台任务（`background()` 不挂在 `apply()` 的返回值上），固定 sleep 在全仓并行跑
 * 五个 vitest 进程时会偶发不够——等在**结果**上，而不是等一个猜出来的毫秒数。
 * @param condition - 期望成立的条件。
 * @param timeoutMs - 放弃等待的上限。
 */
async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => {
      setTimeout(resolve, 10)
    })
  }
}

/** 调用一个已注册命令的 handler。 */
async function run(definition: CommandDefinition): Promise<string> {
  const invocation = {
    commandId: 'test',
    agent: {},
    rawInput: '',
    attachments: [],
    signal: new AbortController().signal,
  } as unknown as CommandInvocation
  const result = await definition.handler(invocation)
  return result.kind === 'success' ? (result.text ?? '') : result.text
}

describe('重载计数文案', () => {
  it('把加载/更新/移除/跳过拼成一行', () => {
    const counts = { loaded: ['a'], updated: ['b'], removed: [], failed: [] }

    expect(reloadText(counts, 2)).toBe('已重扫：加载 1、更新 1、移除 0、跳过 2')
  })

  it('同一命令名在多个会话层各注册一次时只算一条', () => {
    const counts = { loaded: ['deploy', 'deploy', 'deploy'], updated: [], removed: ['old'], failed: [] }

    expect(reloadText(counts, 0)).toBe('已重扫：加载 1、更新 0、移除 1、跳过 0')
  })

  it('注册失败计入跳过', () => {
    const counts = { loaded: [], updated: [], removed: [], failed: ['plan'] }

    expect(reloadText(counts, 0)).toBe('已重扫：加载 0、更新 0、移除 0、跳过 1')
    expect(reloadText(EMPTY_COUNTS, 0)).toBe('已重扫：加载 0、更新 0、移除 0、跳过 0')
  })
})

describe('插件主体', () => {
  let home: string

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-user-commands-'))
    process.env.DSH_HOME = home
  })

  afterEach(async () => {
    delete process.env.DSH_HOME
    await fs.rm(home, { recursive: true, force: true })
  })

  it('没有 commands 服务的部署零注册、零报错', async () => {
    const harness = fakeContext(false)

    apply(harness.ctx)
    await settle()

    expect(harness.definitions.size).toBe(0)
    expect([...harness.infos, ...harness.warnings, ...harness.errors]).toEqual([])
    for (const cleanup of harness.cleanups) cleanup()
  })

  it('有 commands 服务时注册兜底命令与内置 /init', async () => {
    const harness = fakeContext(true)

    apply(harness.ctx)
    await waitFor(() => harness.definitions.has('init'))

    expect([...harness.definitions.keys()].sort()).toEqual(['commands-reload', 'init'])
    expect(harness.definitions.get('commands-reload')?.description).toContain('重新扫描')
    expect(harness.errors).toEqual([])

    const text = await run(harness.definitions.get('commands-reload') as CommandDefinition)

    expect(text).toBe('已重扫：加载 0、更新 0、移除 0、跳过 0')
    for (const cleanup of harness.cleanups) cleanup()
  })

  it('用户级目录里的命令文件被注册，问题文件只体现在跳过计数与错误日志里', async () => {
    const commandsDir = path.join(home, 'commands')
    await fs.mkdir(commandsDir, { recursive: true })
    await fs.writeFile(path.join(commandsDir, 'weekly.md'), '---\ndescription: 生成周报\n---\n按上周提交生成周报', 'utf8')
    await fs.writeFile(path.join(commandsDir, 'broken.md'), '---\ndescription: "未闭合\n---\n正文', 'utf8')
    const harness = fakeContext(true)

    apply(harness.ctx)
    await waitFor(() => harness.definitions.has('weekly'))

    expect([...harness.definitions.keys()].sort()).toEqual(['commands-reload', 'init', 'weekly'])
    expect(harness.definitions.get('weekly')?.description).toBe('生成周报')
    expect(harness.errors).toHaveLength(1)
    expect(harness.errors[0]).toContain('broken.md')

    const text = await run(harness.definitions.get('commands-reload') as CommandDefinition)

    expect(text).toBe('已重扫：加载 0、更新 0、移除 0、跳过 1')
    for (const cleanup of harness.cleanups) cleanup()
  })
})
