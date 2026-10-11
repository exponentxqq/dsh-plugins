/**
 * 发现层测试（规范：dsh-user-commands —— 命令来源与发现范围）。
 *
 * 覆盖三层来源的目录枚举：目录缺席不报错、附加根并入、登记表缺席时只剩用户级、
 * 以及工作区根枚举自身的顺序与去重。
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { discoverCommands } from '../src/host/discovery.ts'
import { workspaceRoots } from '../src/host/roots.ts'
import { fakeIo, fileEntry, primaryWorkspace, recordingLog } from './helpers.ts'

describe('工作区根枚举', () => {
  it('按登记顺序合并主根与附加根，并去掉重复的主根', () => {
    const ctx = {
      get: (name: string) => {
        if (name === 'workspaceRegistry') return { list: () => [{ path: '/work/a' }, { path: '/work/b' }] }
        if (name === 'multiRootRegistry') {
          return {
            granted: (root: string) => (root === '/work/a' ? ['/extra/one', '/work/a', '/extra/two'] : []),
            onChange: () => () => {},
          }
        }
        return undefined
      },
    } as unknown as Context

    expect(workspaceRoots(ctx)).toEqual([
      { primaryRoot: '/work/a', roots: ['/work/a', '/extra/one', '/extra/two'] },
      { primaryRoot: '/work/b', roots: ['/work/b'] },
    ])
  })

  it('附加根枚举服务缺席时只剩主根', () => {
    const ctx = {
      get: (name: string) => (name === 'workspaceRegistry' ? { list: () => [{ path: '/work/a' }] } : undefined),
    } as unknown as Context

    expect(workspaceRoots(ctx)).toEqual([{ primaryRoot: '/work/a', roots: ['/work/a'] }])
  })

  it('工作区登记表缺席时为空', () => {
    const ctx = { get: () => undefined } as unknown as Context

    expect(workspaceRoots(ctx)).toEqual([])
  })
})

describe('命令发现', () => {
  it('用户级目录不存在时视为该层无命令，且不产生任何日志', async () => {
    const { log, infos, warnings, errors } = recordingLog()

    const scan = await discoverCommands({ userDir: '/home/u/.dsh/commands', workspaces: [] }, fakeIo({}, {}), log)

    expect(scan.user).toEqual([])
    expect(scan.projects).toEqual([])
    expect([...infos, ...warnings, ...errors]).toEqual([])
  })

  it('项目级命令目录不存在时该工作区无命令，且不报错', async () => {
    const { log, warnings, errors } = recordingLog()

    const scan = await discoverCommands(
      { userDir: '/nope', workspaces: [primaryWorkspace('/work/a')] },
      fakeIo({}, {}),
      log,
    )

    expect(scan.projects).toEqual([{ workspaceRoot: '/work/a', commands: [] }])
    expect([...warnings, ...errors]).toEqual([])
  })

  it('用户级与主根命令各自被发现，并带上说明与输入提示', async () => {
    const io = fakeIo(
      {
        '/home/u/.dsh/commands': ['weekly.md'],
        '/work/a/.dsh/commands': ['review.md'],
      },
      {
        '/home/u/.dsh/commands/weekly.md': '---\ndescription: 生成周报\n---\n按上周的提交生成周报',
        '/work/a/.dsh/commands/review.md': '审查这次改动',
      },
    )
    const { log } = recordingLog()

    const scan = await discoverCommands(
      { userDir: '/home/u/.dsh/commands', workspaces: [primaryWorkspace('/work/a')] },
      io,
      log,
    )

    expect(scan.user.map((command) => command.name)).toEqual(['weekly'])
    expect(scan.user[0]?.description).toBe('生成周报')
    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['review'])
    expect(scan.projects[0]?.commands[0]?.origin).toEqual({
      kind: 'file',
      layer: 'project',
      dir: '/work/a/.dsh/commands',
      file: '/work/a/.dsh/commands/review.md',
      workspaceRoot: '/work/a',
    })
  })

  it('附加根的命令并入同一个工作区，主根命令在前', async () => {
    const io = fakeIo(
      {
        '/work/a/.dsh/commands': ['review.md'],
        '/extra/one/.dsh/commands': ['ship.md'],
      },
      {
        '/work/a/.dsh/commands/review.md': '审查这次改动',
        '/extra/one/.dsh/commands/ship.md': '发布到生产',
      },
    )
    const { log, errors } = recordingLog()

    const scan = await discoverCommands(
      { userDir: '/nope', workspaces: [{ primaryRoot: '/work/a', roots: ['/work/a', '/extra/one'] }] },
      io,
      log,
    )

    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['review', 'ship'])
    expect(errors).toEqual([])
  })

  it('工作区登记表缺席（registry 不可用）时没有项目级命令，也不报错', async () => {
    const ctx = { get: () => undefined } as unknown as Context
    const io = fakeIo({ '/work/a/.dsh/commands': ['review.md'] }, { '/work/a/.dsh/commands/review.md': '审查' })
    const { log, warnings, errors } = recordingLog()

    const scan = await discoverCommands({ userDir: '/nope', workspaces: workspaceRoots(ctx) }, io, log)

    expect(scan.projects).toEqual([])
    expect([...warnings, ...errors]).toEqual([])
  })

  it('同一物理根被两个工作区共享时各自独立发现，不产生冲突', async () => {
    const io = fakeIo({ '/shared/.dsh/commands': ['deploy.md'] }, { '/shared/.dsh/commands/deploy.md': '部署' })
    const { log, errors } = recordingLog()

    const scan = await discoverCommands(
      {
        userDir: '/nope',
        workspaces: [
          { primaryRoot: '/work/a', roots: ['/work/a', '/shared'] },
          { primaryRoot: '/work/b', roots: ['/work/b', '/shared'] },
        ],
      },
      io,
      log,
    )

    // 工作区之间不共享命名空间：谁也不会因为别人先扫到就丢掉自己根集合里的命令。
    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['deploy'])
    expect(scan.projects[1]?.commands.map((command) => command.name)).toEqual(['deploy'])
    expect(errors).toEqual([])
  })

  it('同一个根在一个工作区的根集合里出现两次时只读一次，不产生自我冲突', async () => {
    const io = fakeIo({ '/work/a/.dsh/commands': ['deploy.md'] }, { '/work/a/.dsh/commands/deploy.md': '部署' })
    const { log, errors } = recordingLog()

    const scan = await discoverCommands(
      { userDir: '/nope', workspaces: [{ primaryRoot: '/work/a', roots: ['/work/a', '/work/a'] }] },
      io,
      log,
    )

    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['deploy'])
    expect(errors).toEqual([])
  })

  it('非 .md 文件被静默忽略', async () => {
    const io = fakeIo(
      { '/work/a/.dsh/commands': ['review.md', 'notes.txt', 'README'] },
      { '/work/a/.dsh/commands/review.md': '审查这次改动' },
    )
    const { log, warnings, errors } = recordingLog()

    const scan = await discoverCommands(
      { userDir: '/nope', workspaces: [primaryWorkspace('/work/a')] },
      io,
      log,
    )

    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['review'])
    expect([...warnings, ...errors]).toEqual([])
  })

  it('目录项顺序不影响结果：文件按名字排序读取', async () => {
    const io = fakeIo(
      { '/work/a/.dsh/commands': [fileEntry('zeta.md'), fileEntry('alpha.md')] },
      { '/work/a/.dsh/commands/zeta.md': 'Z', '/work/a/.dsh/commands/alpha.md': 'A' },
    )
    const { log } = recordingLog()

    const scan = await discoverCommands(
      { userDir: '/nope', workspaces: [primaryWorkspace('/work/a')] },
      io,
      log,
    )

    expect(scan.projects[0]?.commands.map((command) => command.name)).toEqual(['alpha', 'zeta'])
  })
})
