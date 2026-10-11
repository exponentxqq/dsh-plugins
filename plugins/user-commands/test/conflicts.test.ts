/**
 * 同层冲突仲裁测试（规范：dsh-user-commands —— 同层冲突仲裁）。
 *
 * 冲突只存在于**单个工作区内部**：主根压附加根，后来者连着自己的来源一起进错误日志并被跳过，
 * 且绝不改名；工作区之间不仲裁——同名各自生效、不记错误、不跳过任何一方；
 * 跨层同名是遮蔽而不是冲突，发现层不该报错。
 */
import { describe, expect, it } from 'vitest'
import { discoverCommands } from '../src/host/discovery.ts'
import { fakeIo, primaryWorkspace, recordingLog } from './helpers.ts'

describe('同层冲突仲裁', () => {
  it('跨工作区同名各自生效、互不串扰，且不记冲突', async () => {
    const io = fakeIo(
      {
        '/work/a/.dsh/commands': ['deploy.md'],
        '/work/b/.dsh/commands': ['deploy.md'],
      },
      {
        '/work/a/.dsh/commands/deploy.md': 'A 的部署流程',
        '/work/b/.dsh/commands/deploy.md': 'B 的部署流程',
      },
    )
    const { log, errors } = recordingLog()

    const scan = await discoverCommands(
      { userDir: '/nope', workspaces: [primaryWorkspace('/work/a'), primaryWorkspace('/work/b')] },
      io,
      log,
    )

    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['deploy'])
    expect(scan.projects[0]?.commands[0]?.origin).toMatchObject({ file: '/work/a/.dsh/commands/deploy.md' })
    expect(scan.projects[1]?.commands.map((command) => command.name)).toEqual(['deploy'])
    expect(scan.projects[1]?.commands[0]?.origin).toMatchObject({ file: '/work/b/.dsh/commands/deploy.md' })
    expect(errors).toEqual([])
  })

  it('工作区内主根压制附加根', async () => {
    const io = fakeIo(
      {
        '/work/a/.dsh/commands': ['deploy.md'],
        '/extra/.dsh/commands': ['deploy.md'],
      },
      {
        '/work/a/.dsh/commands/deploy.md': '主根的定义',
        '/extra/.dsh/commands/deploy.md': '附加根的定义',
      },
    )
    const { log, errors } = recordingLog()

    const scan = await discoverCommands(
      { userDir: '/nope', workspaces: [{ primaryRoot: '/work/a', roots: ['/work/a', '/extra'] }] },
      io,
      log,
    )

    expect(scan.projects[0]?.commands).toHaveLength(1)
    expect(scan.projects[0]?.commands[0]?.origin).toMatchObject({ file: '/work/a/.dsh/commands/deploy.md' })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('/extra/.dsh/commands/deploy.md')
    expect(errors[0]).toContain('/work/a/.dsh/commands/deploy.md')
  })

  it('不同工作区用不同命令名时互不影响、无冲突日志', async () => {
    const io = fakeIo(
      {
        '/work/a/.dsh/commands': ['alpha.md'],
        '/work/b/.dsh/commands': ['beta.md'],
      },
      {
        '/work/a/.dsh/commands/alpha.md': 'A 的命令',
        '/work/b/.dsh/commands/beta.md': 'B 的命令',
      },
    )
    const { log, errors } = recordingLog()

    const scan = await discoverCommands(
      { userDir: '/nope', workspaces: [primaryWorkspace('/work/a'), primaryWorkspace('/work/b')] },
      io,
      log,
    )

    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['alpha'])
    expect(scan.projects[1]?.commands.map((command) => command.name)).toEqual(['beta'])
    expect(errors).toEqual([])
  })

  it('跨层同名（用户级与项目级）属于遮蔽，不记错误', async () => {
    const io = fakeIo(
      {
        '/home/u/.dsh/commands': ['deploy.md'],
        '/work/a/.dsh/commands': ['deploy.md'],
      },
      {
        '/home/u/.dsh/commands/deploy.md': '用户级部署',
        '/work/a/.dsh/commands/deploy.md': '项目级部署',
      },
    )
    const { log, warnings, errors } = recordingLog()

    const scan = await discoverCommands(
      { userDir: '/home/u/.dsh/commands', workspaces: [primaryWorkspace('/work/a')] },
      io,
      log,
    )

    expect(scan.user.map((command) => command.name)).toEqual(['deploy'])
    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['deploy'])
    expect([...warnings, ...errors]).toEqual([])
  })

  it('一个工作区内的冲突不影响其他工作区的同名命令', async () => {
    const io = fakeIo(
      {
        '/work/a/.dsh/commands': ['deploy.md'],
        '/extra/.dsh/commands': ['deploy.md'],
        '/work/b/.dsh/commands': ['deploy.md'],
      },
      {
        '/work/a/.dsh/commands/deploy.md': 'A 主根',
        '/extra/.dsh/commands/deploy.md': 'A 的附加根',
        '/work/b/.dsh/commands/deploy.md': 'B',
      },
    )
    const { log, errors } = recordingLog()

    const scan = await discoverCommands(
      {
        userDir: '/nope',
        workspaces: [
          { primaryRoot: '/work/a', roots: ['/work/a', '/extra'] },
          primaryWorkspace('/work/b'),
        ],
      },
      io,
      log,
    )

    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['deploy'])
    expect(scan.projects[0]?.commands[0]?.origin).toMatchObject({ file: '/work/a/.dsh/commands/deploy.md' })
    expect(scan.projects[1]?.commands[0]?.origin).toMatchObject({ file: '/work/b/.dsh/commands/deploy.md' })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('/extra/.dsh/commands/deploy.md')
    expect(errors[0]).toContain('/work/a/.dsh/commands/deploy.md')
    expect(errors[0]).toContain('命令名冲突')
    expect(errors[0]).toContain('插件不改名')
    expect(errors[0]).not.toContain('/work/b/.dsh/commands/deploy.md')
  })
})
