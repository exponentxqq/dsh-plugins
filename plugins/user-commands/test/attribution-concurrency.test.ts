/**
 * 归属索引重建的并发原子性测试（规范：dsh-user-commands —— 三层优先级与会话遮蔽；G4）。
 *
 * 内核 `RootAttributor` 用「先完整构建、再一次引用赋值提交」重建索引：重扫窗口内 in-flight
 * 的 `attribute()` 在调用开始就快照旧索引，因此继续返回旧索引的**完整结果**，既不会退回
 * fail-closed，也不会读到半表。本包的薄导出（`Attributor` = `RootAttributor`）免费获得这个
 * 修复；本包迁移前的实现在 `update()` 一进来就 `owners.clear()`，下面的用例在旧实现上会
 * 拿到 `null`（G6 7.2 的红→绿证据）。
 */
import { describe, expect, it } from 'vitest'
import { Attributor } from '../src/host/attribution.ts'
import type { RealpathIo } from '../src/host/attribution.ts'

/**
 * 把 `blocked` 路径的 canonical 化闸住的 seam：重扫因此确定性地停在窗口里，用例不依赖
 * 调度顺序的运气。其余路径照常按「存在/不存在」应答。
 * @param existing - 真实存在的路径。
 * @param blocked - 要被闸住的路径（重扫的 canonical 化会等在这里）。
 * @returns canonical 化 seam 与放行开关。
 */
function gatedRealpath(existing: readonly string[], blocked: string): {
  readonly io: RealpathIo
  release(): void
} {
  const present = new Set(existing)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    release,
    io: {
      realpath: async (candidate) => {
        if (candidate === blocked) await gate
        if (!present.has(candidate)) throw new Error(`ENOENT: ${candidate}`)
        return candidate
      },
    },
  }
}

describe('归属索引重建的并发原子性', () => {
  it('update 尚未兑现时 attribute 仍返回旧索引的完整结果（不 await pending）', async () => {
    const { io, release } = gatedRealpath(['/work/a', '/work/b'], '/work/b')
    const attributor = new Attributor(io)
    await attributor.update([{ primaryRoot: '/work/a', roots: ['/work/a'] }])

    // 重扫到 B 已经开始并卡在闸上：故意不 await pending。
    const pending = attributor.update([{ primaryRoot: '/work/b', roots: ['/work/b'] }])
    // 窗口内读侧必须继续拿到 A 的完整索引（旧实现此处会是 null）。
    expect(await attributor.attribute('/work/a')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/work/a'],
    })

    release()
    await pending
    // 新索引提交后旧归属如实消失、新归属生效（声明式重扫，不残留）。
    expect(await attributor.attribute('/work/a')).toBeNull()
    expect(await attributor.attribute('/work/b')).toEqual({
      workspaceRoot: '/work/b',
      roots: ['/work/b'],
    })
  })

  it('重扫窗口内旧的附加根归属仍然完整（不退回 fail-closed）', async () => {
    const { io, release } = gatedRealpath(['/work/a', '/extra', '/work/b'], '/work/b')
    const attributor = new Attributor(io)
    await attributor.update([{ primaryRoot: '/work/a', roots: ['/work/a', '/extra'] }])

    const pending = attributor.update([{ primaryRoot: '/work/b', roots: ['/work/b'] }])
    // 旧索引的附加根在窗口内依然命中，并带回该工作区的完整根集合。
    expect(await attributor.attribute('/extra/pkg')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/work/a', '/extra'],
    })

    release()
    await pending
    expect(await attributor.attribute('/extra/pkg')).toBeNull()
  })
})
