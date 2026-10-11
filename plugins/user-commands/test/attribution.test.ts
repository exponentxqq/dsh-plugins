/**
 * 会话归属判定测试（规范：dsh-user-commands —— 三层优先级与会话遮蔽）。
 *
 * 覆盖命中、子目录归属、附加根归属、符号链接路径、共享根认领（主根拥有者优先、附加根之间按登记顺序）
 * 与 fail-closed 的无归属情形。
 */
import { describe, expect, it } from 'vitest'
import { Attributor, type RealpathIo } from '../src/host/attribution.ts'

/**
 * 用「存在的路径集合 + 符号链接映射」拼出的 canonical 化 seam。
 * @param existing - 真实存在的路径。
 * @param links - 会被解析成另一个路径的路径（模拟符号链接）。
 * @returns canonical 化 seam。
 */
function fakeRealpath(existing: readonly string[], links: Record<string, string> = {}): RealpathIo {
  const present = new Set(existing)
  return {
    realpath: async (candidate) => {
      const linked = links[candidate]
      if (linked !== undefined) return linked
      if (!present.has(candidate)) throw new Error(`ENOENT: ${candidate}`)
      return candidate
    },
  }
}

describe('会话归属', () => {
  it('cwd 正是登记根时命中该工作区', async () => {
    const attributor = new Attributor(fakeRealpath(['/work/a']))
    await attributor.update([{ primaryRoot: '/work/a', roots: ['/work/a'] }])

    expect(await attributor.attribute('/work/a')).toEqual({ workspaceRoot: '/work/a', roots: ['/work/a'] })
  })

  it('cwd 是工作区子目录时向上归属到最近的登记根', async () => {
    const attributor = new Attributor(fakeRealpath(['/work/a', '/work/a/src/deep']))
    await attributor.update([{ primaryRoot: '/work/a', roots: ['/work/a'] }])

    expect(await attributor.attribute('/work/a/src/deep')).toEqual({ workspaceRoot: '/work/a', roots: ['/work/a'] })
  })

  it('经过符号链接的路径按 canonical 结果归属', async () => {
    const attributor = new Attributor(fakeRealpath(['/work/a'], { '/home/u/proj': '/work/a' }))
    await attributor.update([{ primaryRoot: '/work/a', roots: ['/work/a'] }])

    expect(await attributor.attribute('/home/u/proj')).toEqual({ workspaceRoot: '/work/a', roots: ['/work/a'] })
  })

  it('命中附加根时返回该工作区完整的根集合', async () => {
    const attributor = new Attributor(fakeRealpath(['/work/a', '/extra']))
    await attributor.update([{ primaryRoot: '/work/a', roots: ['/work/a', '/extra'] }])

    expect(await attributor.attribute('/extra')).toEqual({ workspaceRoot: '/work/a', roots: ['/work/a', '/extra'] })
  })

  it('cwd 不在任何登记根下时返回 null（fail-closed）', async () => {
    const attributor = new Attributor(fakeRealpath(['/tmp/elsewhere']))
    await attributor.update([{ primaryRoot: '/work/a', roots: ['/work/a'] }])

    expect(await attributor.attribute('/tmp/elsewhere')).toBeNull()
  })

  it('空 cwd、空登记表与不可 canonical 化的根都不授予任何东西', async () => {
    const attributor = new Attributor(fakeRealpath(['/work/a']))

    expect(await attributor.attribute('/work/a')).toBeNull()

    await attributor.update([
      { primaryRoot: '/work/a', roots: ['/work/a'] },
      { primaryRoot: '/gone', roots: ['/gone'] },
    ])
    expect(await attributor.attribute('')).toBeNull()
    // /gone 不存在：它进不了表，于是这个目录不属于任何工作区。
    expect(await attributor.attribute('/gone')).toBeNull()
  })

  it('同一物理根被多个工作区当附加根认领时归登记靠前的那个', async () => {
    const attributor = new Attributor(fakeRealpath(['/shared']))
    await attributor.update([
      { primaryRoot: '/work/a', roots: ['/work/a', '/shared'] },
      { primaryRoot: '/work/b', roots: ['/work/b', '/shared'] },
    ])

    expect(await attributor.attribute('/shared')).toEqual({
      workspaceRoot: '/work/a',
      roots: ['/work/a', '/shared'],
    })
  })

  it('该根同时是另一个工作区的主根时归它自己的工作区，与登记顺序无关', async () => {
    // A 先把 /shared 授予成附加根；/shared 同时是 B 的主根（谁的「家」谁做主）。
    const attributor = new Attributor(fakeRealpath(['/work/a', '/shared', '/shared/src']))
    await attributor.update([
      { primaryRoot: '/work/a', roots: ['/work/a', '/shared'] },
      { primaryRoot: '/shared', roots: ['/shared'] },
    ])

    expect(await attributor.attribute('/shared')).toEqual({ workspaceRoot: '/shared', roots: ['/shared'] })
    expect(await attributor.attribute('/shared/src')).toEqual({ workspaceRoot: '/shared', roots: ['/shared'] })
  })

  it('update 会清掉上一轮的根，登记移除后不再归属', async () => {
    const attributor = new Attributor(fakeRealpath(['/work/a']))
    await attributor.update([{ primaryRoot: '/work/a', roots: ['/work/a'] }])
    expect(await attributor.attribute('/work/a')).not.toBeNull()

    await attributor.update([])
    expect(await attributor.attribute('/work/a')).toBeNull()
  })
})
