/**
 * 内置命令测试（规范：dsh-user-commands —— 内置 init 命令）。
 *
 * 断言定义存在、prompt 覆盖全部产出约束（主根 / 合并更新 / 80 行 / 简体中文 / 只写查证事实 /
 * 不追加 TODO）、可被用户级同名文件遮蔽，并且不占用插件保留名。
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_COMMANDS, globalCommands, INIT_PROMPT } from '../src/host/builtins.ts'
import { COMMAND_NAME_PATTERN, RESERVED_COMMAND_NAMES } from '../src/host/discovery.ts'
import { fileCommand } from './helpers.ts'

describe('内置 /init', () => {
  it('定义存在，带说明与参数提示，prompt 来自常量', () => {
    const init = BUILTIN_COMMANDS.find((command) => command.name === 'init')

    expect(init).toBeDefined()
    expect(init?.description).toContain('AGENTS.md')
    expect(init?.hint).toBe('[补充关注点]')
    expect(init?.origin).toEqual({ kind: 'builtin', prompt: INIT_PROMPT })
  })

  it('prompt 覆盖全部产出约束', () => {
    expect(INIT_PROMPT).toContain('AGENTS.md')
    expect(INIT_PROMPT).toContain('主根')
    expect(INIT_PROMPT).toContain('合并更新')
    expect(INIT_PROMPT).toContain('80 行')
    expect(INIT_PROMPT).toContain('简体中文')
    expect(INIT_PROMPT).toContain('只写查证过的事实')
    expect(INIT_PROMPT).toContain('TODO')
    expect(INIT_PROMPT).toContain('$ARGUMENTS')
  })

  it('prompt 要求逐条可复制的常用命令与从代码归纳的约定', () => {
    expect(INIT_PROMPT).toContain('常用命令')
    expect(INIT_PROMPT).toContain('复制执行')
    expect(INIT_PROMPT).toContain('目录结构')
    expect(INIT_PROMPT).toContain('代码约定')
  })

  it('内置命令名满足命令文法，且不占用插件保留名', () => {
    for (const command of BUILTIN_COMMANDS) {
      expect(COMMAND_NAME_PATTERN.test(command.name)).toBe(true)
      expect(RESERVED_COMMAND_NAMES).not.toContain(command.name)
    }
  })

  it('用户级同名文件遮蔽内置 /init', () => {
    const user = [fileCommand('init', '/home/u/.dsh/commands/init.md', { layer: 'user', description: '我们的 init' })]

    const commands = globalCommands(user, BUILTIN_COMMANDS)

    expect(commands).toHaveLength(1)
    expect(commands[0]?.description).toBe('我们的 init')
  })

  it('没有任何用户级命令时内置 /init 就是全局的全部命令', () => {
    expect(globalCommands([], BUILTIN_COMMANDS).map((command) => command.name)).toEqual(['init'])
  })
})
