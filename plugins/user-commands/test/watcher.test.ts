/**
 * 热刷新测试（规范：dsh-user-commands —— 热刷新与手动重载）。
 *
 * 覆盖阶梯监听目标、防抖合并、不可监听目录的降级，以及最核心的验收：
 * 新增命令文件即注册、删除即注销。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverCommands } from '../src/host/discovery.ts'
import { CommandLayer } from '../src/host/registry.ts'
import type { DirEntry } from '../src/host/types.ts'
import { DirectoryWatcher, projectLadder, userLadder, watchTargets } from '../src/host/watcher.ts'
import { fakeIo, fakeRegistrar, fakeWatchIo, primaryWorkspace, recordingLog } from './helpers.ts'

afterEach(() => {
  vi.useRealTimers()
})

describe('监听阶梯', () => {
  it('项目根盯最深的已存在层级', async () => {
    const watch = fakeWatchIo()

    watch.directories.add('/work/a/.dsh/commands')
    expect(await watchTargets(watch.io, '/nope', ['/work/a'])).toEqual(['/work/a/.dsh/commands'])

    watch.directories.clear()
    watch.directories.add('/work/a/.dsh')
    expect(await watchTargets(watch.io, '/nope', ['/work/a'])).toEqual(['/work/a/.dsh'])

    // 连根都不存在（登记了但路径已消失）：没有可监听的层级，不是错误。
    watch.directories.clear()
    expect(await watchTargets(watch.io, '/nope', ['/work/a'])).toEqual([])
  })

  it('用户级目录不存在时退到 $DSH_HOME', async () => {
    const watch = fakeWatchIo()
    watch.directories.add('/home/u/.dsh')

    expect(userLadder('/home/u/.dsh/commands')).toEqual(['/home/u/.dsh/commands', '/home/u/.dsh'])
    expect(await watchTargets(watch.io, '/home/u/.dsh/commands', [])).toEqual(['/home/u/.dsh'])
  })

  it('共享根只监听一次', async () => {
    const watch = fakeWatchIo()
    watch.directories.add('/shared/.dsh/commands')

    expect(projectLadder('/shared')).toEqual(['/shared/.dsh/commands', '/shared/.dsh', '/shared'])
    expect(await watchTargets(watch.io, '/nope', ['/shared', '/shared'])).toEqual(['/shared/.dsh/commands'])
  })
})

describe('防抖监听器', () => {
  it('窗口内的多次事件合并成一次重扫', async () => {
    vi.useFakeTimers()
    const watch = fakeWatchIo()
    watch.directories.add('/work/a/.dsh/commands')
    let calls = 0
    const watcher = new DirectoryWatcher(watch.io, () => {
      calls += 1
    }, recordingLog().log)
    watcher.arm(['/work/a/.dsh/commands'])

    watch.fire('/work/a/.dsh/commands')
    watch.fire('/work/a/.dsh/commands')
    watch.fire('/work/a/.dsh/commands')
    await vi.advanceTimersByTimeAsync(249)
    expect(calls).toBe(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toBe(1)

    watch.fire('/work/a/.dsh/commands')
    await vi.advanceTimersByTimeAsync(250)
    expect(calls).toBe(2)
  })

  it('arm 释放离场目录，监不起来的目录只记警告', () => {
    const watch = fakeWatchIo()
    watch.directories.add('/work/a')
    const { log, warnings } = recordingLog()
    const watcher = new DirectoryWatcher(watch.io, () => {}, log)

    watcher.arm(['/work/a', '/missing'])
    expect(watcher.watched()).toEqual(['/work/a'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('无法监听 /missing')

    watcher.arm([])
    expect(watcher.watched()).toEqual([])
    expect(watch.closed).toEqual(['/work/a'])
  })

  it('dispose 丢弃挂起的重扫', async () => {
    vi.useFakeTimers()
    const watch = fakeWatchIo()
    watch.directories.add('/work/a')
    let calls = 0
    const watcher = new DirectoryWatcher(watch.io, () => {
      calls += 1
    }, recordingLog().log)
    watcher.arm(['/work/a'])
    watch.fire('/work/a')

    watcher.dispose()
    await vi.advanceTimersByTimeAsync(1000)

    expect(calls).toBe(0)
  })
})

describe('文件变化驱动注册（新增即注册、删除即注销）', () => {
  it('新增命令文件后无需重启即可用，删除后即不可用', async () => {
    vi.useFakeTimers()
    const tree: Record<string, readonly (string | DirEntry)[]> = { '/work/a/.dsh/commands': [] }
    const files: Record<string, string> = {}
    const io = fakeIo(tree, files)
    const watch = fakeWatchIo()
    const { log } = recordingLog()
    const { registrar, registered } = fakeRegistrar()
    const layer = new CommandLayer(log, '全局命令层')
    layer.setRegistrar(registrar)
    const workspaces = [primaryWorkspace('/work/a')]

    const watcher = new DirectoryWatcher(watch.io, () => {
      void resync()
    }, log)
    async function resync(): Promise<void> {
      const scan = await discoverCommands({ userDir: '/nope', workspaces }, io, log)
      layer.sync(scan.projects[0]?.commands ?? [])
    }

    watch.directories.add('/work/a/.dsh/commands')
    watcher.arm(await watchTargets(watch.io, '/nope', ['/work/a']))
    expect(watcher.watched()).toEqual(['/work/a/.dsh/commands'])

    // 新增：编辑器保存 → 事件 → 防抖窗口后重扫。
    tree['/work/a/.dsh/commands'] = ['deploy.md']
    files['/work/a/.dsh/commands/deploy.md'] = '部署 $ARGUMENTS'
    watch.fire('/work/a/.dsh/commands')
    await vi.advanceTimersByTimeAsync(250)

    expect([...registered.keys()]).toEqual(['deploy'])

    // 删除：注销。
    tree['/work/a/.dsh/commands'] = []
    delete files['/work/a/.dsh/commands/deploy.md']
    watch.fire('/work/a/.dsh/commands')
    await vi.advanceTimersByTimeAsync(250)

    expect([...registered.keys()]).toEqual([])

    // 改内容：重注册（指纹变化），注册表里是新定义。
    tree['/work/a/.dsh/commands'] = ['deploy.md']
    files['/work/a/.dsh/commands/deploy.md'] = '第一版'
    watch.fire('/work/a/.dsh/commands')
    await vi.advanceTimersByTimeAsync(250)
    files['/work/a/.dsh/commands/deploy.md'] = '---\ndescription: 第二版\n---\n第二版正文'
    watch.fire('/work/a/.dsh/commands')
    await vi.advanceTimersByTimeAsync(250)

    expect(registered.get('deploy')?.description).toBe('第二版')
  })
})
