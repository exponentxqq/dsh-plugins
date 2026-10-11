/**
 * 全局层测试（规范：dsh-user-commands —— 三层优先级与会话遮蔽、内置 init 命令）。
 *
 * 全局层就是用户级 + 内置命令：用户级同名遮蔽内置（跨层遮蔽，不记错误），
 * 差量同步负责新增/更新/移除，注册失败（例如与别的插件同名）必须留下可读错误。
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_COMMANDS, globalCommands } from '../src/host/builtins.ts'
import { CommandLayer, type CommandRegistrar } from '../src/host/registry.ts'
import { builtinCommand, fakeRegistrar, fileCommand, recordingLog } from './helpers.ts'

describe('全局层的命令构成', () => {
  it('没有用户级命令时全部内置命令都在', () => {
    expect(globalCommands([], BUILTIN_COMMANDS).map((command) => command.name)).toEqual(['init'])
  })

  it('用户级同名命令遮蔽内置命令（不记错误）', () => {
    const user = [fileCommand('init', '/home/u/.dsh/commands/init.md', { layer: 'user' })]
    const { warnings, errors } = recordingLog()

    const commands = globalCommands(user, BUILTIN_COMMANDS)

    expect(commands.map((command) => command.name)).toEqual(['init'])
    expect(commands[0]?.origin.kind).toBe('file')
    expect([...warnings, ...errors]).toEqual([])
  })

  it('用户级与它无关的内置命令共存', () => {
    const user = [fileCommand('weekly', '/home/u/.dsh/commands/weekly.md', { layer: 'user' })]
    const commands = globalCommands([...user, builtinCommand('init'), builtinCommand('other')])

    expect(commands.map((command) => command.name)).toEqual(['weekly', 'init', 'other'])
  })
})

describe('一层命令的差量同步', () => {
  it('注册器到位时把期望清单注册上，并记住已注册的名字', () => {
    const { registrar, registered } = fakeRegistrar()
    const layer = new CommandLayer(recordingLog().log, '全局命令层')

    const counts = layer.sync([fileCommand('a', '/d/a.md'), fileCommand('b', '/d/b.md')])
    // 注册器还没到位：什么也不注册，但期望被记住。
    expect(counts).toEqual({ loaded: [], updated: [], removed: [], failed: [] })
    expect(registered.size).toBe(0)

    const applied = layer.setRegistrar(registrar)

    expect(applied.loaded).toEqual(['a', 'b'])
    expect([...registered.keys()]).toEqual(['a', 'b'])
    expect(layer.names()).toEqual(['a', 'b'])
  })

  it('同步是声明式的差量：新增、更新、移除、不变各归各位', () => {
    const { registrar, registered } = fakeRegistrar()
    const layer = new CommandLayer(recordingLog().log, '全局命令层')
    layer.setRegistrar(registrar)

    expect(layer.sync([fileCommand('a', '/d/a.md'), fileCommand('b', '/d/b.md')]).loaded).toEqual(['a', 'b'])
    expect(layer.sync([fileCommand('a', '/d/a.md'), fileCommand('b', '/d/b.md')])).toEqual({
      loaded: [],
      updated: [],
      removed: [],
      failed: [],
    })

    const changed = fileCommand('b', '/d/b.md', { description: '换了说明' })
    const counts = layer.sync([fileCommand('a', '/d/a.md'), changed, fileCommand('c', '/d/c.md')])

    expect(counts.updated).toEqual(['b'])
    expect(counts.loaded).toEqual(['c'])
    expect(counts.removed).toEqual([])

    const removed = layer.sync([changed])
    expect(removed.removed).toEqual(['a', 'c'])
    expect([...registered.keys()]).toEqual(['b'])
  })

  it('指纹只看说明、提示与来源：同名不同目录会被视为变化', () => {
    const { registrar } = fakeRegistrar()
    const layer = new CommandLayer(recordingLog().log, '全局命令层')
    layer.setRegistrar(registrar)
    layer.sync([fileCommand('a', '/d/a.md')])

    expect(layer.sync([fileCommand('a', '/other/a.md')]).updated).toEqual(['a'])
  })

  it('注册失败（例如别的插件已有同名命令）记错误、计入 failed，且不记账', () => {
    const { log, errors } = recordingLog()
    const registrar: CommandRegistrar = {
      register: () => {
        throw new Error('command "plan" is already registered')
      },
    }
    const layer = new CommandLayer(log, '全局命令层')
    layer.setRegistrar(registrar)

    const counts = layer.sync([fileCommand('plan', '/d/plan.md')])

    expect(counts.failed).toEqual(['plan'])
    expect(counts.loaded).toEqual([])
    expect(layer.names()).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('注册 /plan 失败，已跳过')
    expect(errors[0]).toContain('already registered')
  })

  it('注册器消失时注销已注册的一切并报告移除', () => {
    const { registrar, registered } = fakeRegistrar()
    const layer = new CommandLayer(recordingLog().log, '全局命令层')
    layer.setRegistrar(registrar)
    layer.sync([fileCommand('a', '/d/a.md'), fileCommand('b', '/d/b.md')])

    const counts = layer.setRegistrar(undefined)

    expect(counts.removed).toEqual(['a', 'b'])
    expect(registered.size).toBe(0)
    expect(layer.names()).toEqual([])
  })

  it('dispose 注销所有注册', () => {
    const { registrar, registered, disposed } = fakeRegistrar()
    const layer = new CommandLayer(recordingLog().log, '全局命令层')
    layer.setRegistrar(registrar)
    layer.sync([fileCommand('a', '/d/a.md')])

    layer.dispose()

    expect(registered.size).toBe(0)
    expect(disposed).toEqual(['a'])
  })
})
